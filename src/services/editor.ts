import { EditorSettings } from '../settings/types';

export class EditorService {
	/**
	 * Edit and format transcription text using the configured API provider.
	 * @param text The transcript text to edit
	 * @param settings EditorSettings from plugin configuration
	 */
	async edit(text: string, settings: EditorSettings): Promise<string> {
		if (!settings.apiKey) {
			throw new Error('Editor API key is not configured');
		}
		// Build messages array for chat completion
		const messages: { role: string; content: string }[] = [];
		if (settings.systemPrompt) {
			messages.push({ role: 'system', content: settings.systemPrompt });
		}
		// Combine user prompt and transcript text
		const content = settings.userPrompt
			? `${settings.userPrompt}\n\n${text}`
			: text;
		messages.push({ role: 'user', content });

		// Handle OpenAI provider
		if (settings.provider === 'openai') {
			const response = await fetch('https://api.openai.com/v1/chat/completions', {
				method: 'POST',
				headers: {
					Authorization: `Bearer ${settings.apiKey}`,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					model: settings.model,
					messages,
					temperature: settings.temperature,
				}),
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`OpenAI editing error: ${response.status} ${errorText}`);
			}

			const data = await response.json();
			const result = data.choices?.[0]?.message?.content;
			if (typeof result !== 'string') {
				throw new Error('Invalid response from editing API');
			}
			return result;
		}

		// Gemini editing not implemented
		if (settings.provider === 'gemini') {
			throw new Error('Gemini editing provider is not implemented yet');
		}

		throw new Error(`Unsupported editing provider: ${settings.provider}`);
	}
} 