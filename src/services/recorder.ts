export interface RecordingResult {
	blob: Blob;
	duration: number; // seconds
	size: number; // bytes
}

export class RecorderService {
	private mediaRecorder: MediaRecorder;
	private recordedChunks: Blob[] = [];
	private startTime = 0;
	private pauseTime = 0;
	private totalPausedTime = 0;
	private resolveStop: (result: RecordingResult) => void;
	private rejectStop: (reason?: any) => void;
	private stopPromise: Promise<RecordingResult>;

	constructor() {}

	private async init() {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		this.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
		this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
			if (e.data.size > 0) {
				this.recordedChunks.push(e.data);
			}
		};
	}

	async start(): Promise<RecordingResult> {
		if (!this.mediaRecorder) {
			await this.init();
		}
		this.recordedChunks = [];
		this.totalPausedTime = 0;
		this.startTime = Date.now();
		this.mediaRecorder.start();
		this.stopPromise = new Promise<RecordingResult>((resolve, reject) => {
			this.resolveStop = resolve;
			this.rejectStop = reject;
			this.mediaRecorder.onstop = () => {
				const blob = new Blob(this.recordedChunks, { type: 'audio/webm;codecs=opus' });
				const duration = (Date.now() - this.startTime - this.totalPausedTime) / 1000;
				const size = blob.size;
				resolve({ blob, duration, size });
			};
		});
		return this.stopPromise;
	}

	pause(): void {
		if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
			this.mediaRecorder.pause();
			this.pauseTime = Date.now();
		}
	}

	resume(): void {
		if (this.mediaRecorder && this.mediaRecorder.state === 'paused') {
			this.mediaRecorder.resume();
			this.totalPausedTime += Date.now() - this.pauseTime;
		}
	}

	async stop(): Promise<RecordingResult> {
		if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
			this.mediaRecorder.stop();
		}
		return this.stopPromise;
	}
} 