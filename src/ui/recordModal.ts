import { App, Modal, Notice } from 'obsidian';
import ObsidianAITranscriber from '../../main';
import { RecorderService, RecordingResult } from '../services/recorder';
import { FileService } from '../services/file';

export default class RecordModal extends Modal {
	private plugin: ObsidianAITranscriber;
	private recorder: RecorderService;
	private fileService: FileService;
	private recordPromise: Promise<RecordingResult>;
	private isPaused = false;

	constructor(app: App, plugin: ObsidianAITranscriber) {
		super(app);
		this.plugin = plugin;
		this.recorder = new RecorderService();
		this.fileService = new FileService(this.app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.createEl('h2', { text: 'Record Audio (Non-Streaming)' });

		const buttonContainer = contentEl.createDiv({ cls: 'button-container' });
		const recordBtn = buttonContainer.createEl('button', { text: 'Record' });
		const pauseBtn = buttonContainer.createEl('button', { text: 'Pause' });
		pauseBtn.setAttr('disabled', 'true');
		const stopBtn = buttonContainer.createEl('button', { text: 'Stop' });
		stopBtn.setAttr('disabled', 'true');

		recordBtn.onclick = async () => {
			recordBtn.setAttr('disabled', 'true');
			pauseBtn.removeAttribute('disabled');
			stopBtn.removeAttribute('disabled');
			this.recordPromise = this.recorder.start();
			new Notice('Recording started');
		};

		pauseBtn.onclick = () => {
			if (!this.isPaused) {
				this.recorder.pause();
				pauseBtn.setText('Resume');
				this.isPaused = true;
				new Notice('Recording paused');
			} else {
				this.recorder.resume();
				pauseBtn.setText('Pause');
				this.isPaused = false;
				new Notice('Recording resumed');
			}
		};

		stopBtn.onclick = async () => {
			stopBtn.setAttr('disabled', 'true');
			pauseBtn.setAttr('disabled', 'true');
			new Notice('Stopping recording…');
			const result = await this.recorder.stop();
			const dir = this.plugin.settings.transcriber.audioDir;
			const path = await this.fileService.saveRecording(result.blob, dir);
			new Notice(`Recording saved to ${path}`);
			this.close();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
} 