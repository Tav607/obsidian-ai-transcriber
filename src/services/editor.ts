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

		// Gemini editing using Google GenAI SDK
		if (settings.provider === 'gemini') {
			// Use Google GenAI SDK for Gemini editing
			const { GoogleGenAI } = await import('@google/genai');
			const genAI = new GoogleGenAI({ apiKey: settings.apiKey });
			// Combine system prompt, user prompt, and transcript text
			const geminiContent = settings.systemPrompt
				? `${settings.systemPrompt}\n\n${settings.userPrompt ? `${settings.userPrompt}\n\n${text}` : text}`
				: settings.userPrompt
					? `${settings.userPrompt}\n\n${text}`
					: text;
			
			try {
				const geminiResponse = await genAI.models.generateContent({
					model: settings.model,
					contents: [{ role: "user", parts: [{ text: geminiContent }] }],
					config: { temperature: settings.temperature },
				});

				const geminiResult = geminiResponse.text;

				if (typeof geminiResult === 'string') {
					return geminiResult;
				} else {
					let detailedError = 'Invalid response from Gemini editing API: No text content found.';
					if (geminiResponse.promptFeedback) {
						detailedError += ` Prompt feedback: ${JSON.stringify(geminiResponse.promptFeedback)}`;
						if (geminiResponse.promptFeedback.blockReason) {
							detailedError += ` Block Reason: ${geminiResponse.promptFeedback.blockReason}`;
							if (geminiResponse.promptFeedback.blockReasonMessage) {
								detailedError += ` (${geminiResponse.promptFeedback.blockReasonMessage})`;
							}
						}
					}
					console.error('Full Gemini API response (when text is undefined):', JSON.stringify(geminiResponse, null, 2));
					throw new Error(detailedError);
				}
			} catch (error: unknown) {
				console.error('Error during Gemini API call or processing:', error);
				throw new Error(`Gemini API request failed: ${(error as Error).message || 'Unknown error'}`);
			}
		}

		throw new Error(`Unsupported editing provider: ${settings.provider}`);
	}
} 