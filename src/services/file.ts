import { App, normalizePath, TFile } from 'obsidian';

export class FileService {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * Generate timestamped filename with given extension
	 */
	private getTimestampName(ext: string): string {
		const now = new Date();
		const yyyy = now.getFullYear();
		const MM = String(now.getMonth() + 1).padStart(2, '0');
		const dd = String(now.getDate()).padStart(2, '0');
		const hh = String(now.getHours()).padStart(2, '0');
		const mm = String(now.getMinutes()).padStart(2, '0');
		const ss = String(now.getSeconds()).padStart(2, '0');
		return `${yyyy}${MM}${dd}_${hh}${mm}${ss}.${ext}`;
	}

	async saveRecording(blob: Blob, dir: string): Promise<string> {
		const ext = 'webm';
		const fileName = this.getTimestampName(ext);
		const folder = dir ? dir.replace(/\\/g, '/').replace(/\/$/, '') : '';
		const path = normalizePath(folder ? `${folder}/${fileName}` : fileName);
		const arrayBuffer = await blob.arrayBuffer();
		const uint8Array = new Uint8Array(arrayBuffer);
		// Create binary file in vault
		await this.app.vault.createBinary(path, uint8Array);
		return path;
	}

	/**
	 * @deprecated use saveTextWithName(text, dir, getTimestampName('md'))
	 */
	async saveText(text: string, dir: string): Promise<string> {
		const ext = 'md';
		const fileName = this.getTimestampName(ext);
		const folder = dir ? dir.replace(/\\/g, '/').replace(/\/$/, '') : '';
		const path = normalizePath(folder ? `${folder}/${fileName}` : fileName);
		// Create text file in vault
		await this.app.vault.create(path, text);
		return path;
	}

	/**
	 * Save a text file using a custom filename (including extension).
	 */
	async saveTextWithName(text: string, dir: string, fileName: string): Promise<string> {
		const folder = dir ? dir.replace(/\\/g, '/').replace(/\/$/, '') : '';
		const path = normalizePath(folder ? `${folder}/${fileName}` : fileName);
		await this.app.vault.create(path, text);
		return path;
	}

	// Add a method to open a file in the workspace
	async openFile(path: string): Promise<void> {
		const file = this.app.vault.getAbstractFileByPath(path);
		if (file instanceof TFile) {
			await this.app.workspace.getLeaf(true).openFile(file);
		}
	}
} 