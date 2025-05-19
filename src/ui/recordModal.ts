import { App, Modal, Notice } from 'obsidian';
import ObsidianAITranscriber from '../../main';
import { RecorderService, RecordingResult } from '../services/recorder';
import { FileService } from '../services/file';
import { SystemPromptTemplateSelectionModal } from './SystemPromptTemplateSelectionModal';

export default class RecordModal extends Modal {
	private plugin: ObsidianAITranscriber;
	private recorder: RecorderService;
	private fileService: FileService;
	private isPaused = false;
	private timerEl: HTMLElement;
	private intervalId: number;
	private recordBtn: HTMLElement;
	private pauseBtn: HTMLElement;
	private stopBtn: HTMLElement;
	private stopAndSaveBtn: HTMLElement;

	constructor(app: App, plugin: ObsidianAITranscriber) {
		super(app);
		this.plugin = plugin;
		this.recorder = plugin.recorder;
		this.fileService = new FileService(this.app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('ai-transcriber-record-modal');
		contentEl.createEl('h2', { text: 'Record Audio' });

		// Elapsed time display
		this.timerEl = contentEl.createEl('div', { cls: 'recorder-timer', text: '00:00' });

		const buttonContainer = contentEl.createDiv({ cls: ['recorder-button-container', 'button-container'] });
		this.recordBtn = buttonContainer.createEl('button', { text: 'Record', cls: 'mod-cta' });
		this.pauseBtn = buttonContainer.createEl('button', { text: 'Pause' });
		this.pauseBtn.setAttr('disabled', 'true');
		this.stopAndSaveBtn = buttonContainer.createEl('button', { text: 'Stop & Save' });
		this.stopAndSaveBtn.setAttr('disabled', 'true');
		this.stopBtn = buttonContainer.createEl('button', { text: 'Stop & Transcribe' });
		this.stopBtn.setAttr('disabled', 'true');

		// Initialize UI and timer
		this.updateUI();
		this.intervalId = window.setInterval(() => {
			const elapsed = this.recorder.getElapsed();
			this.timerEl.setText(this.formatTime(elapsed));
		}, 500);

		this.recordBtn.onclick = async () => {
			try {
				// Start recording
				await this.recorder.start();
				this.plugin.updateStatus('Recording...');
				new Notice('Recording started');
				// Manually update button states immediately
				this.recordBtn.setAttr('disabled', 'true');
				this.pauseBtn.removeAttribute('disabled');
				this.stopBtn.removeAttribute('disabled');
				this.stopAndSaveBtn.removeAttribute('disabled');
				this.pauseBtn.setText('Pause');
				this.isPaused = false;
			} catch (error: unknown) {
				new Notice(`Error starting recording: ${(error as Error).message}`);
				console.error(error);
			}
		};

		this.pauseBtn.onclick = () => {
			if (!this.isPaused) {
				this.recorder.pause();
				this.plugin.updateStatus('Recording Paused');
				this.pauseBtn.setText('Resume');
				this.isPaused = true;
				new Notice('Recording paused');
			} else {
				this.recorder.resume();
				this.plugin.updateStatus('Recording...');
				this.pauseBtn.setText('Pause');
				this.isPaused = false;
				new Notice('Recording resumed');
			}
		};

		this.stopBtn.onclick = async () => {
			this.stopBtn.setAttr('disabled', 'true');
			this.stopAndSaveBtn.setAttr('disabled', 'true');
			this.pauseBtn.setAttr('disabled', 'true');
			new Notice('Stopping recording…');
			try {
				const result: RecordingResult = await this.recorder.stop();
				const audioDir = this.plugin.settings.transcriber.audioDir;
				const audioPath = await this.fileService.saveRecording(result.blob, audioDir);
				new Notice(`Recording saved to ${audioPath}`);

				const audioFileName = audioPath.substring(audioPath.lastIndexOf('/') + 1);
				const baseName = audioFileName.replace(/\.[^/.]+$/, '');
				const transcriptDir = this.plugin.settings.transcriber.transcriptDir;

				if (this.plugin.settings.editor.enabled) {
					new SystemPromptTemplateSelectionModal(this.app, this.plugin, async (selectedTemplateName) => {
						if (!selectedTemplateName) {
							new Notice('Template selection cancelled. Audio saved, transcription aborted.');
							this.plugin.updateStatus('Transcriber Idle');
							this.close();
							return;
						}

						const selectedTemplate = this.plugin.settings.editor.systemPromptTemplates.find(t => t.name === selectedTemplateName);
						if (!selectedTemplate) {
							new Notice('Selected template not found. Audio saved, transcription aborted.');
							this.plugin.updateStatus('Transcriber Idle');
							this.close();
							return;
						}

						// Proceed with transcription and editing
						try {
							this.plugin.updateStatus('AI Transcribing...');
							new Notice('Transcribing audio…');
							const transcript = await this.plugin.transcriber.transcribe(result.blob, this.plugin.settings.transcriber);

							this.plugin.updateStatus('AI Editing...');
							if (this.plugin.settings.editor.keepOriginal) {
								const rawFileName = `${baseName}_raw_transcript.md`;
								const rawPath = await this.fileService.saveTextWithName(transcript, transcriptDir, rawFileName);
								new Notice(`Raw transcript saved to ${rawPath}`);
							}
							new Notice('Editing transcript with AI using template: ' + selectedTemplateName);
							const edited = await this.plugin.editorService.edit(transcript, this.plugin.settings.editor, selectedTemplate.prompt);
							const editedFileName = `${baseName}_edited_transcript.md`;
							const editedPath = await this.fileService.saveTextWithName(edited, transcriptDir, editedFileName);
							new Notice(`Edited transcript saved to ${editedPath}`);
							await this.fileService.openFile(editedPath);
						} catch (e) {
							new Notice(`Error during transcription/editing: ${(e as Error).message}`);
							console.error('Error during transcription/editing:', e);
						} finally {
							this.plugin.updateStatus('Transcriber Idle');
							this.close();
						}
					}).open();
				} else {
					// Editor is not enabled, just transcribe and save raw
					try {
						this.plugin.updateStatus('AI Transcribing...');
						new Notice('Transcribing audio…');
						const transcript = await this.plugin.transcriber.transcribe(result.blob, this.plugin.settings.transcriber);
						const rawFileName = `${baseName}_raw_transcript.md`;
						const transcriptPath = await this.fileService.saveTextWithName(transcript, transcriptDir, rawFileName);
						new Notice(`Transcript saved to ${transcriptPath}`);
						await this.fileService.openFile(transcriptPath);
					} catch (e) {
						new Notice(`Error during transcription: ${(e as Error).message}`);
						console.error('Error during transcription:', e);
					} finally {
						this.plugin.updateStatus('Transcriber Idle');
						this.close(); // Ensure modal closes
					}
				}
			} catch (error: unknown) { // Outer catch for errors during recorder.stop() or fileService.saveRecording()
				new Notice(`Error: ${(error as Error).message}`);
				console.error(error);
				this.plugin.updateStatus('Transcriber Idle');
				this.close();
			}
		};

		// Handler for "Stop & Save" button
		this.stopAndSaveBtn.onclick = async () => {
			this.stopAndSaveBtn.setAttr('disabled', 'true');
			this.stopBtn.setAttr('disabled', 'true');
			this.pauseBtn.setAttr('disabled', 'true');
			this.recordBtn.setAttr('disabled', 'true');
			this.plugin.updateStatus('Saving recording...');
			new Notice('Saving recording...');
			try {
				const result: RecordingResult = await this.recorder.stop();
				const audioDir = this.plugin.settings.transcriber.audioDir;
				const audioPath = await this.fileService.saveRecording(result.blob, audioDir);
				new Notice(`Recording saved to ${audioPath}`);
				this.plugin.updateStatus('Transcriber Idle');
			} catch (error: unknown) {
				new Notice(`Error saving recording: ${(error as Error).message}`);
				console.error(error);
				this.plugin.updateStatus('Transcriber Idle');
			} finally {
				this.close();
			}
		};
	}

	onClose() {
		// Stop updating timer but keep recording running
		clearInterval(this.intervalId);
		this.contentEl.empty();
	}

	private updateUI() {
		if (this.recorder.isRecording()) {
			this.recordBtn.setAttr('disabled', 'true');
			this.pauseBtn.removeAttribute('disabled');
			this.stopBtn.removeAttribute('disabled');
			this.stopAndSaveBtn.removeAttribute('disabled');
			this.pauseBtn.setText(this.recorder.isPaused() ? 'Resume' : 'Pause');
		} else {
			this.recordBtn.removeAttribute('disabled');
			this.pauseBtn.setAttr('disabled', 'true');
			this.stopBtn.setAttr('disabled', 'true');
			this.stopAndSaveBtn.setAttr('disabled', 'true');
		}
	}

	private formatTime(seconds: number): string {
		const m = Math.floor(seconds / 60);
		const s = Math.floor(seconds % 60);
		return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
	}
} 