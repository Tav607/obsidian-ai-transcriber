import { App, PluginSettingTab, Setting } from 'obsidian';
import ObsidianAITranscriber from '../../main';
import { PluginSettings } from './types';

export default class SettingsTab extends PluginSettingTab {
	plugin: ObsidianAITranscriber;

	constructor(app: App, plugin: ObsidianAITranscriber) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// Transcriber Settings
		containerEl.createEl('h2', { text: '🎙️ Transcriber Settings' });
		new Setting(containerEl)
			.setName('API Provider')
			.setDesc('Choose OpenAI or Gemini')
			.addDropdown(drop => drop
				.addOption('openai', 'OpenAI')
				.addOption('gemini', 'Gemini')
				.setValue(this.plugin.settings.transcriber.provider)
				.onChange(async (value) => {
					this.plugin.settings.transcriber.provider = value as 'openai' | 'gemini';
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Transcriber API Key')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.plugin.settings.transcriber.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.transcriber.apiKey = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName('Model Name')
			.setDesc('')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.plugin.settings.transcriber.model)
				.onChange(async (value) => {
					this.plugin.settings.transcriber.model = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName('Prompt')
			.setDesc('')
			.addTextArea(textArea => textArea
				.setPlaceholder('')
				.setValue(this.plugin.settings.transcriber.prompt)
				.onChange(async (value) => {
					this.plugin.settings.transcriber.prompt = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName('Temperature')
			.setDesc('Enter a value between 0.0 and 1.0')
			.addText(text => text
				.setPlaceholder('0.0-1.0')
				.setValue(this.plugin.settings.transcriber.temperature.toString())
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num >= 0 && num <= 1) {
						this.plugin.settings.transcriber.temperature = num;
						await this.plugin.saveSettings();
					}
				})
			);
		new Setting(containerEl)
			.setName('Audio Directory')
			.setDesc('Where to save recordings (relative to vault root)')
			.addText(text => text
				.setPlaceholder('Recordings/')
				.setValue(this.plugin.settings.transcriber.audioDir)
				.onChange(async (value) => {
					this.plugin.settings.transcriber.audioDir = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName('Transcript Directory')
			.setDesc('Where to save transcripts (relative to vault root)')
			.addText(text => text
				.setPlaceholder('Transcripts/')
				.setValue(this.plugin.settings.transcriber.transcriptDir)
				.onChange(async (value) => {
					this.plugin.settings.transcriber.transcriptDir = value;
					await this.plugin.saveSettings();
				})
			);

		// Editor Settings
		containerEl.createEl('h2', { text: '✏️ Editor Settings' });
		new Setting(containerEl)
			.setName('Enable Editor')
			.setDesc('Toggle to enable Editor API enhancements')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.editor.enabled)
				.onChange(async (value) => {
					this.plugin.settings.editor.enabled = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName('API Provider')
			.setDesc('Choose OpenAI or Gemini')
			.addDropdown(drop => drop
				.addOption('openai', 'OpenAI')
				.addOption('gemini', 'Gemini')
				.setValue(this.plugin.settings.editor.provider)
				.onChange(async (value) => {
					this.plugin.settings.editor.provider = value as 'openai' | 'gemini';
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName('API Key')
			.setDesc('Editor API Key')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.plugin.settings.editor.apiKey)
				.onChange(async (value) => {
					this.plugin.settings.editor.apiKey = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName('Model Name')
			.setDesc('')
			.addText(text => text
				.setPlaceholder('')
				.setValue(this.plugin.settings.editor.model)
				.onChange(async (value) => {
					this.plugin.settings.editor.model = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName('System Prompt')
			.setDesc('')
			.addTextArea(textArea => textArea
				.setPlaceholder('')
				.setValue(this.plugin.settings.editor.systemPrompt)
				.onChange(async (value) => {
					this.plugin.settings.editor.systemPrompt = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName('User Prompt')
			.setDesc('')
			.addTextArea(textArea => textArea
				.setPlaceholder('')
				.setValue(this.plugin.settings.editor.userPrompt)
				.onChange(async (value) => {
					this.plugin.settings.editor.userPrompt = value;
					await this.plugin.saveSettings();
				})
			);
		new Setting(containerEl)
			.setName('Temperature')
			.setDesc('Enter a value between 0.0 and 1.0')
			.addText(text => text
				.setPlaceholder('0.0-1.0')
				.setValue(this.plugin.settings.editor.temperature.toString())
				.onChange(async (value) => {
					const num = parseFloat(value);
					if (!isNaN(num) && num >= 0 && num <= 1) {
						this.plugin.settings.editor.temperature = num;
						await this.plugin.saveSettings();
					}
				})
			);
		new Setting(containerEl)
			.setName('Keep Original Transcript')
			.setDesc('Whether to keep original transcript when editing')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.editor.keepOriginal)
				.onChange(async (value) => {
					this.plugin.settings.editor.keepOriginal = value;
					await this.plugin.saveSettings();
				})
			);
	}
} 