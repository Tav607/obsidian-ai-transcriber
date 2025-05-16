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
	statusBarItem: HTMLElement;

	async onload() {
		await this.loadSettings();
		// Initialize RecorderService so state persists across modals
		this.recorder = new RecorderService();
		// Initialize TranscriberService
		this.transcriber = new TranscriberService();
		// Initialize FileService and EditorService
		this.fileService = new FileService(this.app);
		this.editorService = new EditorService();

		// Add status bar item for plugin status
		this.statusBarItem = this.addStatusBarItem();
		this.updateStatus('Transcriber Idle');

		// Ribbon button for recording
		const ribbonIconEl = this.addRibbonIcon('microphone', 'Record Audio', () => {
			new RecordModal(this.app, this).open();
		});
		ribbonIconEl.addClass('obsidian-ai-transcriber-ribbon');

		// Command for recording
		this.addCommand({
			id: 'obsidian-ai-transcriber-record',
			name: 'Record Audio',
			callback: () => {
				new RecordModal(this.app, this).open();
			}
		});

		// Command for editing the current raw transcript
		this.addCommand({
			id: 'obsidian-ai-transcriber-edit-transcript',
			name: 'Edit Current Transcript with AI',
			editorCallback: async (editor: Editor, view: MarkdownView) => {
				const file = view.file;
				if (!file || file.extension !== 'md') {
					new Notice('Please open a Markdown file to edit.');
					return;
				}

				const originalText = editor.getValue();
				if (!originalText.trim()) {
					new Notice('The file is empty.');
					return;
				}

				if (!this.settings.editor.enabled) {
					new Notice('AI Editor is not enabled in settings.');
					return;
				}

				this.updateStatus('AI Editing...');
				new Notice('Editing transcript with AI…');

				try {
					const editedText = await this.editorService.edit(originalText, this.settings.editor);
					const dir = file.parent ? file.parent.path : this.settings.transcriber.transcriptDir; // Use file's directory or default
					const baseName = file.basename.replace(/_raw_transcript$/, '').replace(/_edited_transcript$/, ''); // Remove existing suffixes
					
					const editedFileName = `${baseName}_edited_transcript.md`;
					const editedPath = await this.fileService.saveTextWithName(editedText, dir, editedFileName);
					
					new Notice(`Edited transcript saved to ${editedPath}`);
					await this.fileService.openFile(editedPath);
					this.updateStatus('Transcriber Idle');

				} catch (error: any) {
					new Notice(`Error editing transcript: ${error.message}`);
					console.error('Error editing transcript:', error);
					this.updateStatus('Transcriber Idle');
				}
			}
		});

		// Settings tab
		this.addSettingTab(new SettingsTab(this.app, this));

		// Context menu for audio files
		this.registerEvent(
			this.app.workspace.on('file-menu', (menu, file) => {
				if (file instanceof TFile && (file.extension === 'webm' || file.extension === 'm4a' || file.extension === 'mp3')) {
					menu.addItem((item) => {
						item.setTitle('Transcribe with AI')
							.setIcon('microphone')
							.onClick(async () => {
								this.updateStatus('AI Transcribing...');
								new Notice('Transcribing audio…');
								try {
									const arrayBuffer = await this.app.vault.readBinary(file);
									// Determine MIME type based on file extension
									let mime = '';
									if (file.extension === 'm4a') {
										mime = 'audio/mp4';
									} else if (file.extension === 'webm') {
										mime = 'audio/webm';
									} else if (file.extension === 'mp3') {
										mime = 'audio/mpeg';
									}
									const blob = new Blob([arrayBuffer], { type: mime });
									const transcript = await this.transcriber.transcribe(blob, this.settings.transcriber);
									const dir = this.settings.transcriber.transcriptDir;
									// Extract base name from audio file name
									const audioFileName = file.name;
									const baseName = audioFileName.replace(/\.[^/.]+$/, '');
									if (this.settings.editor.enabled) {
										this.updateStatus('AI Editing...');
										if (this.settings.editor.keepOriginal) {
											// Save raw transcript with custom name
											const rawFileName = `${baseName}_raw_transcript.md`;
											const rawPath = await this.fileService.saveTextWithName(transcript, dir, rawFileName);
											new Notice(`Transcript saved to ${rawPath}`);
										}
										new Notice('Editing transcript…');
										const edited = await this.editorService.edit(transcript, this.settings.editor);
										// Save edited transcript with custom name
										const editedFileName = `${baseName}_edited_transcript.md`;
										const editedPath = await this.fileService.saveTextWithName(edited, dir, editedFileName);
										new Notice(`Edited transcript saved to ${editedPath}`);
										await this.fileService.openFile(editedPath);
										this.updateStatus('Transcriber Idle');
									} else {
										// Save raw transcript with custom name (no editing)
										const rawFileName = `${baseName}_raw_transcript.md`;
										const transcriptPath = await this.fileService.saveTextWithName(transcript, dir, rawFileName);
										new Notice(`Transcript saved to ${transcriptPath}`);
										await this.fileService.openFile(transcriptPath);
										this.updateStatus('Transcriber Idle');
									}
								} catch (error: any) {
									new Notice(`Error: ${error.message}`);
									console.error(error);
									this.updateStatus('Transcriber Idle');
								}
							});
					});
				}
			})
		);
	}

	/**
	 * Cleanup when the plugin is unloaded.
	 */
	public onunload(): void {
		// Optional cleanup code
	}

	/**
	 * Load plugin settings from disk.
	 */
	public async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	/**
	 * Save plugin settings to disk.
	 */
	public async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Update the status bar text to reflect current plugin state.
	 * @param status The status text to display.
	 */
	public updateStatus(status: string): void {
		this.statusBarItem.setText(status);
	}
}