export class TranscriberService {
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
			// Preprocess: resample to 16k mono WAV and split into ≤10min chunks
			const chunks = await this.preprocess(blob);
			let fullText = '';
			for (const chunk of chunks) {
			const formData = new FormData();
				formData.append('file', chunk, 'audio.wav');
			formData.append('model', settings.model);
				if (settings.prompt) formData.append('prompt', settings.prompt);
				const temp = settings.temperature ?? 0.1;
				formData.append('temperature', temp.toString());
				formData.append('condition_on_previous_text', 'true');
				formData.append('compression_ratio_threshold', '1.2');

			const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
				method: 'POST',
					headers: { Authorization: `Bearer ${settings.apiKey}` },
				body: formData
			});
			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`OpenAI Transcription error: ${response.status} ${errorText}`);
			}
			const data = await response.json();
				fullText += data.text as string;
			}
			return fullText;
		}

		// Handle Gemini transcription (not implemented)
		if (settings.provider === 'gemini') {
			throw new Error('Gemini transcription provider is not implemented yet');
		}

		throw new Error(`Unsupported transcription provider: ${settings.provider}`);
	}

	// Preprocess audio: decode, resample to 16k mono and chunk into ≤10min WAV blobs
	private async preprocess(blob: Blob, maxSecs = 600): Promise<Blob[]> {
		const arrayBuffer = await blob.arrayBuffer();
		const decodeCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
		const originalBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
		const sampleRate = 16000;
		const targetLength = Math.ceil(originalBuffer.duration * sampleRate);
		const offlineCtx = new OfflineAudioContext(1, targetLength, sampleRate);
		const source = offlineCtx.createBufferSource();
		if (originalBuffer.numberOfChannels > 1) {
			const ch0 = originalBuffer.getChannelData(0);
			const ch1 = originalBuffer.getChannelData(1);
			const monoBuf = offlineCtx.createBuffer(1, originalBuffer.length, originalBuffer.sampleRate);
			const monoData = monoBuf.getChannelData(0);
			for (let i = 0; i < monoData.length; i++) {
				monoData[i] = (ch0[i] + ch1[i]) / 2;
			}
			source.buffer = monoBuf;
		} else {
			source.buffer = originalBuffer;
		}
		source.connect(offlineCtx.destination);
		source.start();
		const resampled = await offlineCtx.startRendering();
		// Silence trimming: remove continuous silent segments longer than 2 seconds
		const rawData = resampled.getChannelData(0);
		const silenceThreshold = 0.01;
		const minSilenceTrimSamples = Math.floor(2 * sampleRate);
		const data = (() => {
			const trimmedArr: number[] = [];
			let silentCount = 0;
			for (let i = 0; i < rawData.length; i++) {
				const sample = rawData[i];
				if (Math.abs(sample) <= silenceThreshold) {
					silentCount++;
				} else {
					if (silentCount > 0 && silentCount < minSilenceTrimSamples) {
						for (let j = i - silentCount; j < i; j++) {
							trimmedArr.push(rawData[j]);
						}
					}
					silentCount = 0;
					trimmedArr.push(sample);
				}
			}
			return new Float32Array(trimmedArr);
		})();
		const maxSamples = maxSecs * sampleRate;
		const totalSamples = data.length;
		const silenceWindowSamples = Math.floor(0.3 * sampleRate); // 300ms window for splitting
		const searchRangeSamples = Math.floor(5 * sampleRate);      // 5 seconds search range
		const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
		const chunks: Blob[] = [];
		let startSample = 0;
		const minChunkSamples = sampleRate; // discard segments shorter than 1s
		while (startSample < totalSamples) {
			let endSample = Math.min(startSample + maxSamples, totalSamples);
			if (endSample < totalSamples) {
				let splitPoint: number | null = null;
				const desiredSplit = endSample;
				// search backward for a silent region
				const backwardStart = Math.max(silenceWindowSamples, desiredSplit - searchRangeSamples);
				for (let i = desiredSplit; i >= backwardStart; i--) {
					let silent = true;
					for (let j = i - silenceWindowSamples; j < i; j++) {
						if (Math.abs(data[j]) > silenceThreshold) { silent = false; break; }
					}
					if (silent) { splitPoint = i - silenceWindowSamples; break; }
				}
				// if no silent point before, search forward
				if (splitPoint === null) {
					const forwardEnd = Math.min(totalSamples, desiredSplit + searchRangeSamples);
					for (let i = desiredSplit; i < forwardEnd; i++) {
						let silent = true;
						for (let j = i; j < i + silenceWindowSamples && j < totalSamples; j++) {
							if (Math.abs(data[j]) > silenceThreshold) { silent = false; break; }
						}
						if (silent) { splitPoint = i; break; }
					}
				}
				if (splitPoint !== null && splitPoint > startSample) {
					endSample = splitPoint;
				}
			}
			const segmentBuf = audioCtx.createBuffer(1, endSample - startSample, sampleRate);
			segmentBuf.getChannelData(0).set(data.subarray(startSample, endSample));
			const segmentSamples = endSample - startSample;
			if (segmentSamples >= minChunkSamples) {
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