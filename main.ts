import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, TFile } from 'obsidian';
import RecordModal from './src/ui/recordModal';
import { RecorderService } from './src/services/recorder';
import { FileService } from './src/services/file';
import SettingsTab from './src/settings/settingsTab';
import { PluginSettings, DEFAULT_SETTINGS } from './src/settings/types';
import { TranscriberService } from './src/services/transcriber';
import { EditorService } from './src/services/editor';

// Remember to rename these classes and interfaces!

export default class ObsidianAITranscriber extends Plugin {
	settings: PluginSettings;
	recorder: RecorderService;
	transcriber: TranscriberService;
	fileService: FileService;
	editorService: EditorService;

	async onload() {
		await this.loadSettings();
		// Initialize RecorderService so state persists across modals
		this.recorder = new RecorderService();
		// Initialize TranscriberService
		this.transcriber = new TranscriberService();
		// Initialize FileService and EditorService
		this.fileService = new FileService(this.app);
		this.editorService = new EditorService();

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

		// Context menu for audio files
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && file.extension === 'webm') {
					menu.addItem((item) => {
						item.setTitle('Transcribe with AI')
							.setIcon('microphone')
							.onClick(async () => {
								new Notice('Transcribing audio…');
								try {
									const arrayBuffer = await this.app.vault.readBinary(file);
									const blob = new Blob([arrayBuffer], { type: 'audio/webm' });
									const transcript = await this.transcriber.transcribe(blob, this.settings.transcriber);
									const dir = this.settings.transcriber.transcriptDir;
									if (this.settings.editor.enabled) {
										if (this.settings.editor.keepOriginal) {
											const rawPath = await this.fileService.saveText(transcript, dir);
											new Notice(`Transcript saved to ${rawPath}`);
										}
										new Notice('Editing transcript…');
										const edited = await this.editorService.edit(transcript, this.settings.editor);
										const editedPath = await this.fileService.saveText(edited, dir);
										new Notice(`Edited transcript saved to ${editedPath}`);
										await this.fileService.openFile(editedPath);
									} else {
										const transcriptPath = await this.fileService.saveText(transcript, dir);
										new Notice(`Transcript saved to ${transcriptPath}`);
										await this.fileService.openFile(transcriptPath);
									}
								} catch (error: any) {
									new Notice(`Error: ${error.message}`);
									console.error(error);
								}
							});
					});
				}
			})
		);

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
