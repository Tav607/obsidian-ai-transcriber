export interface TranscriberSettings {
	provider: 'openai' | 'gemini';
	apiKey: string;
	model: string;
	prompt: string;
	temperature: number;
	audioDir: string;
	transcriptDir: string;
}

export interface EditorSettings {
	enabled: boolean;
	provider: 'openai' | 'gemini';
	apiKey: string;
	model: string;
	systemPrompt: string;
	userPrompt: string;
	temperature: number;
	keepOriginal: boolean;
}

export interface PluginSettings {
	transcriber: TranscriberSettings;
	editor: EditorSettings;
}

export const DEFAULT_SETTINGS: PluginSettings = {
	transcriber: {
		provider: 'openai',
		apiKey: '',
		model: 'gpt-4o-transcribe',
		prompt: '',
		temperature: 0.2,
		audioDir: '',
		transcriptDir: '',
	},
	editor: {
		enabled: false,
		provider: 'gemini',
		apiKey: '',
		model: 'gemini-2.5-pro-preview-03-25',
		systemPrompt: '',
		userPrompt: '',
		temperature: 0.4,
		keepOriginal: true,
	},
};