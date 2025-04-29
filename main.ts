import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian';
import RecordModal from './src/ui/recordModal';
import SettingsTab from './src/settings/settingsTab';
import { PluginSettings, DEFAULT_SETTINGS } from './src/settings/types';

// Remember to rename these classes and interfaces!

export default class ObsidianAITranscriber extends Plugin {
	settings: PluginSettings;

	async onload() {
		await this.loadSettings();

		// Ribbon button for non-streaming recording
		const ribbonIconEl = this.addRibbonIcon('microphone', 'Record Audio', () => {
			new RecordModal(this.app, this).open();
		});
		ribbonIconEl.addClass('obsidian-ai-transcriber-ribbon');

		// Command for non-streaming recording
		this.addCommand({
			id: 'obsidian-ai-transcriber-record',
			name: 'Record Audio (Non-Streaming)',
			callback: () => {
				new RecordModal(this.app, this).open();
			}
		});

		// Settings tab
		this.addSettingTab(new SettingsTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
