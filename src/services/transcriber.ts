import OpenAI from "openai";

interface GeminiContentPart {
	text?: string;
}

export class TranscriberService {
	private async blobToBase64(blob: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onloadend = () => {
				if (typeof reader.result === 'string') {
					// reader.result is "data:audio/wav;base64,xxxxxx..."
					// We need to strip the "data:[<mediatype>][;base64]," part.
					const base64Data = reader.result.split(',')[1];
					if (base64Data) {
						resolve(base64Data);
					} else {
						reject(new Error('Failed to extract base64 data from blob string'));
					}
				} else {
					reject(new Error('Failed to read blob as base64 string: reader.result is not a string.'));
				}
			};
			reader.onerror = (error) => reject(new Error(`FileReader error: ${error}`));
			reader.readAsDataURL(blob);
		});
	}

	/**
	 * Transcribe audio blob using OpenAI or Gemini API based on settings.
	 * @param blob Audio blob to transcribe
	 * @param settings TranscriberSettings from plugin configuration
	 */
	async transcribe(blob: Blob, settings: import('../settings/types').TranscriberSettings): Promise<string> {
		if (!settings.apiKey) {
			throw new Error('Transcriber API key is not configured');
		}
		// Handle OpenAI transcription
		if (settings.provider === 'openai') {
			// Use OpenAI SDK for transcription
			const openai = new OpenAI({ apiKey: settings.apiKey, dangerouslyAllowBrowser: true });
			const chunks = await this.preprocess(blob);
			let fullText = '';
			for (const chunk of chunks) {
				const transcription = await openai.audio.transcriptions.create({
					file: new File([chunk], 'audio.wav', { type: 'audio/wav' }),
					model: settings.model,
					response_format: 'text',
					...(settings.prompt ? { prompt: settings.prompt } : {}),
				});
				fullText += transcription;
			}
			return fullText;
		}

		// Handle Gemini transcription
		if (settings.provider === 'gemini') {
			const chunks = await this.preprocess(blob);
			let fullText = '';

			for (const chunk of chunks) {
				const base64Audio = await this.blobToBase64(chunk);
				// Use native generateContent endpoint for audio transcription
				const url = `https://generativelanguage.googleapis.com/v1beta/models/${settings.model}:generateContent?key=${settings.apiKey}`;
				const restRequestBody = {
					contents: [{
						parts: [
							{ text: settings.prompt || "Transcribe this audio. If the language is Chinese, please use Simplified Chinese characters. Provide only the direct transcription text without any introductory phrases." },
							{ inline_data: { mime_type: 'audio/wav', data: base64Audio } },
						],
					}],
					generationConfig: {
						temperature: settings.temperature,
					}
				};
				const response = await fetch(url, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(restRequestBody),
				});
				if (!response.ok) {
					const errorText = await response.text();
					throw new Error(`Gemini Transcription error: ${response.status} ${errorText}`);
				}

				const responseData = await response.json();
				// Parse native generateContent response structure
				if (responseData.candidates && responseData.candidates.length > 0 && responseData.candidates[0].content && responseData.candidates[0].content.parts) {
					fullText += responseData.candidates[0].content.parts.map((part: GeminiContentPart) => part.text || '').join('');
				} else {
					console.warn('Gemini generateContent response structure unexpected:', responseData);
					throw new Error('Gemini Transcription error: Unexpected response structure.');
				}
			}
			return fullText;
		}

		throw new Error(`Unsupported transcription provider: ${settings.provider}`);
	}

	// Preprocess audio: decode, resample to 16k mono and chunk into ≤10min WAV blobs
	private async preprocess(blob: Blob, maxSecsInput?: number): Promise<Blob[]> {
		const TARGET_SAMPLE_RATE = 16000;
		const MAX_CHUNK_SECONDS = maxSecsInput ?? 600; // Default to 10 minutes (600s) if not provided
		const SILENCE_THRESHOLD = 0.01;
		const MIN_SILENCE_DURATION_SECONDS = 2;
		const MIN_SILENCE_TRIM_SAMPLES = Math.floor(MIN_SILENCE_DURATION_SECONDS * TARGET_SAMPLE_RATE);
		const CHUNK_SPLIT_SILENCE_WINDOW_SECONDS = 0.3;
		const CHUNK_SPLIT_SILENCE_WINDOW_SAMPLES = Math.floor(CHUNK_SPLIT_SILENCE_WINDOW_SECONDS * TARGET_SAMPLE_RATE);
		const CHUNK_SPLIT_SEARCH_RANGE_SECONDS = 5;
		const CHUNK_SPLIT_SEARCH_RANGE_SAMPLES = Math.floor(CHUNK_SPLIT_SEARCH_RANGE_SECONDS * TARGET_SAMPLE_RATE);
		const MIN_CHUNK_DURATION_SECONDS = 1;
		const MIN_CHUNK_SAMPLES = Math.floor(MIN_CHUNK_DURATION_SECONDS * TARGET_SAMPLE_RATE);


		const arrayBuffer = await blob.arrayBuffer();
		const AudioContextConstructor = window.AudioContext || (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AudioContextConstructor) {
			throw new Error("Web Audio API is not supported in this browser.");
		}
		const decodeCtx = new AudioContextConstructor();
		const originalBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
		
		const targetLength = Math.ceil(originalBuffer.duration * TARGET_SAMPLE_RATE);
		const offlineCtx = new OfflineAudioContext(1, targetLength, TARGET_SAMPLE_RATE);
		const source = offlineCtx.createBufferSource();

		if (originalBuffer.numberOfChannels > 1) {
			const numChannels = originalBuffer.numberOfChannels;
			const monoBuf = offlineCtx.createBuffer(1, originalBuffer.length, originalBuffer.sampleRate);
			const monoData = monoBuf.getChannelData(0);
			const channels = [];
			for (let c = 0; c < numChannels; c++) {
				channels.push(originalBuffer.getChannelData(c));
			}
			for (let i = 0; i < originalBuffer.length; i++) {
				let sum = 0;
				for (let c = 0; c < numChannels; c++) {
					sum += channels[c][i];
				}
				monoData[i] = sum / numChannels;
			}
			source.buffer = monoBuf;
		} else {
			source.buffer = originalBuffer;
		}
		source.connect(offlineCtx.destination);
		source.start();
		const resampled = await offlineCtx.startRendering();
		// Silence trimming: remove continuous silent segments longer than MIN_SILENCE_DURATION_SECONDS
		const rawData = resampled.getChannelData(0);
		// const silenceThreshold = 0.01; // Replaced by SILENCE_THRESHOLD
		// const minSilenceTrimSamples = Math.floor(2 * TARGET_SAMPLE_RATE); // Replaced by MIN_SILENCE_TRIM_SAMPLES

		// Optimized silence trimming to avoid large intermediate arrays
		let samplesToKeep = 0;
		let currentSilentCountForCounting = 0;
		for (let i = 0; i < rawData.length; i++) {
			const sample = rawData[i];
			if (Math.abs(sample) <= SILENCE_THRESHOLD) {
				currentSilentCountForCounting++;
			} else {
				if (currentSilentCountForCounting > 0 && currentSilentCountForCounting < MIN_SILENCE_TRIM_SAMPLES) {
					samplesToKeep += currentSilentCountForCounting; // Keep the short silence
				}
				currentSilentCountForCounting = 0;
				samplesToKeep++; // Keep the current non-silent sample
			}
		}
		// Note: Trailing silence (short or long) is implicitly dropped by this logic,
		// matching the original behavior where the loop ended without adding trailing short silence.

		const data = new Float32Array(samplesToKeep);
		let currentIndex = 0;
		let currentSilentCountForFilling = 0;
		for (let i = 0; i < rawData.length; i++) {
			const sample = rawData[i];
			if (Math.abs(sample) <= SILENCE_THRESHOLD) {
				currentSilentCountForFilling++;
			} else {
				if (currentSilentCountForFilling > 0 && currentSilentCountForFilling < MIN_SILENCE_TRIM_SAMPLES) {
					for (let j = i - currentSilentCountForFilling; j < i; j++) {
						data[currentIndex++] = rawData[j];
					}
				}
				currentSilentCountForFilling = 0;
				data[currentIndex++] = sample;
			}
		}
		// `data` is now the trimmed Float32Array

		const maxSamples = MAX_CHUNK_SECONDS * TARGET_SAMPLE_RATE;
		const totalSamples = data.length;
		// const silenceWindowSamples = Math.floor(0.3 * TARGET_SAMPLE_RATE); // Replaced by CHUNK_SPLIT_SILENCE_WINDOW_SAMPLES
		// const searchRangeSamples = Math.floor(5 * TARGET_SAMPLE_RATE);      // Replaced by CHUNK_SPLIT_SEARCH_RANGE_SAMPLES
		const audioCtxForChunking = new AudioContextConstructor(); // Use the same constructor for consistency
		const chunks: Blob[] = [];
		let startSample = 0;
		// const minChunkSamples = TARGET_SAMPLE_RATE; // discard segments shorter than 1s - Replaced by MIN_CHUNK_SAMPLES
		while (startSample < totalSamples) {
			let endSample = Math.min(startSample + maxSamples, totalSamples);
			if (endSample < totalSamples) {
				let splitPoint: number | null = null;
				const desiredSplit = endSample;
				// search backward for a silent region
				const backwardStart = Math.max(CHUNK_SPLIT_SILENCE_WINDOW_SAMPLES, desiredSplit - CHUNK_SPLIT_SEARCH_RANGE_SAMPLES);
				for (let i = desiredSplit; i >= backwardStart; i--) {
					let silent = true;
					for (let j = i - CHUNK_SPLIT_SILENCE_WINDOW_SAMPLES; j < i; j++) {
						if (Math.abs(data[j]) > SILENCE_THRESHOLD) { silent = false; break; }
					}
					if (silent) { splitPoint = i - CHUNK_SPLIT_SILENCE_WINDOW_SAMPLES; break; }
				}
				// if no silent point before, search forward
				if (splitPoint === null) {
					const forwardEnd = Math.min(totalSamples, desiredSplit + CHUNK_SPLIT_SEARCH_RANGE_SAMPLES);
					for (let i = desiredSplit; i < forwardEnd; i++) {
						let silent = true;
						for (let j = i; j < i + CHUNK_SPLIT_SILENCE_WINDOW_SAMPLES && j < totalSamples; j++) {
							if (Math.abs(data[j]) > SILENCE_THRESHOLD) { silent = false; break; }
						}
						if (silent) { splitPoint = i; break; }
					}
				}
				if (splitPoint !== null && splitPoint > startSample) {
					endSample = splitPoint;
				}
			}
			const segmentBuf = audioCtxForChunking.createBuffer(1, endSample - startSample, TARGET_SAMPLE_RATE);
			segmentBuf.getChannelData(0).set(data.subarray(startSample, endSample));
			const segmentSamples = endSample - startSample;
			if (segmentSamples >= MIN_CHUNK_SAMPLES) {
				chunks.push(this.bufferToWav(segmentBuf));
			}
			startSample = endSample;
		}
		return chunks;
	}

	private bufferToWav(buffer: AudioBuffer): Blob {
		const numOfChannels = buffer.numberOfChannels;
		const sampleRate = buffer.sampleRate;
		const bitDepth = 16;
		const blockAlign = numOfChannels * (bitDepth / 8);
		const dataSize = buffer.length * blockAlign;
		const bufferArray = new ArrayBuffer(44 + dataSize);
		const view = new DataView(bufferArray);

		const writeString = (str: string, offset: number) => {
			for (let i = 0; i < str.length; i++) {
				view.setUint8(offset + i, str.charCodeAt(i));
			}
		};

		writeString('RIFF', 0);
		view.setUint32(4, 36 + dataSize, true);
		writeString('WAVE', 8);
		writeString('fmt ', 12);
		view.setUint32(16, 16, true);
		view.setUint16(20, 1, true);
		view.setUint16(22, numOfChannels, true);
		view.setUint32(24, sampleRate, true);
		view.setUint32(28, sampleRate * blockAlign, true);
		view.setUint16(32, blockAlign, true);
		view.setUint16(34, bitDepth, true);
		writeString('data', 36);
		view.setUint32(40, dataSize, true);

		let offset = 44;
		const channelData = buffer.getChannelData(0);
		for (let i = 0; i < channelData.length; i++) {
			const s = Math.max(-1, Math.min(1, channelData[i]));
			view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
			offset += 2;
		}

		return new Blob([view], { type: 'audio/wav' });
	}
} 