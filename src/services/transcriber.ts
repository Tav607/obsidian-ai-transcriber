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
			const formData = new FormData();
			formData.append('file', blob);
			formData.append('model', settings.model);
			if (settings.prompt) {
				formData.append('prompt', settings.prompt);
			}
			formData.append('temperature', settings.temperature.toString());

			const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${settings.apiKey}`
				},
				body: formData
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`OpenAI Transcription error: ${response.status} ${errorText}`);
			}

			const data = await response.json();
			return data.text as string;
		}

		// Handle Gemini transcription (not implemented)
		if (settings.provider === 'gemini') {
			throw new Error('Gemini transcription provider is not implemented yet');
		}

		throw new Error(`Unsupported transcription provider: ${settings.provider}`);
	}
} 