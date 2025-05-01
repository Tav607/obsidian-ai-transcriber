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
				const temp = settings.temperature ?? 0.2;
				formData.append('temperature', temp.toString());
				formData.append('condition_on_previous_text', 'false');
				formData.append('compression_ratio_threshold', '2.0');

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

	/**
	 * Create a realtime transcription session via WebSocket.
	 * @param settings TranscriberSettings from plugin configuration
	 * @param onTranscript Callback invoked with each transcription segment text
	 * @returns Controller with appendAudio and close methods
	 */
	public async createRealtimeSession(
		settings: import('../settings/types').TranscriberSettings,
		onTranscript: (text: string) => void
	): Promise<{ appendAudio: (blob: Blob) => Promise<void>; close: () => void }> {
		if (!settings.apiKey) {
			throw new Error('Transcriber API key is not configured');
		}
		// Create transcription session and obtain ephemeral token
		const resp = await fetch('https://api.openai.com/v1/realtime/transcription_sessions', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${settings.apiKey}`,
				'Content-Type': 'application/json',
				'OpenAI-Beta': 'assistants=v2'
			},
			body: JSON.stringify({
				input_audio_format: 'pcm16',
				input_audio_transcription: {
					model: settings.model,
					prompt: settings.prompt || '',
					language: ''
				},
				turn_detection: {
					type: 'server_vad',
					threshold: 0.5,
					prefix_padding_ms: 300,
					silence_duration_ms: 500
				},
				input_audio_noise_reduction: { type: 'near_field' },
				include: ['item.input_audio_transcription.logprobs']
			})
		});
		if (!resp.ok) {
			const errText = await resp.text();
			throw new Error(`Realtime session error: ${resp.status} ${errText}`);
		}
		const data = await resp.json();
		const token = data.client_secret?.value ?? data.client_secret;
		// Open WebSocket connection with proper subprotocols
		const ws = new WebSocket(
			'wss://api.openai.com/v1/realtime?intent=transcription',
			[
				'realtime',
				`openai-insecure-api-key.${token}`,
				'openai-beta.realtime-v1'
			]
		);
		// On connection open, initialize session
		ws.onopen = () => {
			const payload = {
				type: 'transcription_session.update',
				session: {
					input_audio_format: 'pcm16',
					input_audio_transcription: {
						model: settings.model,
						prompt: settings.prompt || '',
						primary_language: 'en'
					},
					turn_detection: {
						type: 'server_vad',
						threshold: 0.5,
						prefix_padding_ms: 300,
						silence_duration_ms: 500
					},
					input_audio_noise_reduction: { type: 'near_field' },
					include: ['item.input_audio_transcription.logprobs']
				}
			};
			ws.send(JSON.stringify(payload));
		};
		// Handle incoming transcription events
		ws.onmessage = (event: MessageEvent) => {
			try {
				const msg = JSON.parse(event.data);
				// Interim transcription
				if (msg.type === 'conversation.item.input_audio_transcription.delta' && msg.delta) {
					onTranscript(msg.delta);
				}
				// Final transcription
				else if (msg.type === 'conversation.item.input_audio_transcription.completed' && msg.transcript) {
					onTranscript(msg.transcript);
				}
			} catch (e) {
				console.error('WS message parse error', e);
			}
		};
		ws.onerror = (err) => {
			console.error('WebSocket error', err);
		};
		// Setup AudioContext for PCM conversion
		const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
		// Helper: Convert audio Blob to PCM16 Base64 string
		const blobToPCM16Base64 = async (blob: Blob): Promise<string> => {
			// Decode audio data
			const arrayBuffer = await blob.arrayBuffer();
			const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
			// Convert first channel Float32 samples to Int16
			const floatData = audioBuffer.getChannelData(0);
			const pcm16 = new Int16Array(floatData.length);
			for (let i = 0; i < floatData.length; i++) {
				const s = Math.max(-1, Math.min(1, floatData[i]));
				pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
			}
			// Convert to Base64
			const u8arr = new Uint8Array(pcm16.buffer);
			let binary = '';
			for (let i = 0; i < u8arr.length; i++) {
				binary += String.fromCharCode(u8arr[i]);
			}
			return btoa(binary);
		};
		// Return controller to append audio and close session
		return {
			appendAudio: async (blob: Blob) => {
				const b64 = await blobToPCM16Base64(blob);
				ws.send(JSON.stringify({ type: 'input_audio_buffer.append', audio: b64 }));
			},
			close: () => ws.close()
		};
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
		const chunks: Blob[] = [];
		const maxSamples = maxSecs * sampleRate;
		const totalSamples = resampled.length;
		const segments = Math.ceil(totalSamples / maxSamples);
		const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
		for (let i = 0; i < segments; i++) {
			const start = i * maxSamples;
			const end = Math.min(start + maxSamples, totalSamples);
			const len = end - start;
			const segmentBuf = audioCtx.createBuffer(1, len, sampleRate);
			segmentBuf.getChannelData(0).set(resampled.getChannelData(0).subarray(start, end));
			chunks.push(this.bufferToWav(segmentBuf));
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