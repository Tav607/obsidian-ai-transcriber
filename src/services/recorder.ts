export interface RecordingResult {
	blob: Blob;
	duration: number; // seconds
	size: number; // bytes
}

export class RecorderService {
	private mediaRecorder: MediaRecorder | null = null;
	private recordedChunks: Blob[] = [];
	private startTime = 0;
	private pauseTime = 0;
	private totalPausedTime = 0;
	private resolveStop: (result: RecordingResult) => void;
	private rejectStop: (reason?: any) => void;
	private stopPromise: Promise<RecordingResult>;
	private stream: MediaStream | null = null;

	constructor() {}

	public async init() {
		this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm;codecs=opus' });
		this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
			if (e.data.size > 0) {
				this.recordedChunks.push(e.data);
			}
		};
	}

	async start(): Promise<void> {
		if (!this.mediaRecorder) {
			await this.init();
		}
		this.recordedChunks = [];
		this.totalPausedTime = 0;
		this.startTime = Date.now();
		this.mediaRecorder!.start();
		// Prepare promise for stop() to return recording result
		this.stopPromise = new Promise<RecordingResult>((resolve, reject) => {
			this.resolveStop = resolve;
			this.rejectStop = reject;
			this.mediaRecorder!.onstop = () => {
				const blob = new Blob(this.recordedChunks, { type: 'audio/webm;codecs=opus' });
				const duration = (Date.now() - this.startTime - this.totalPausedTime) / 1000;
				const size = blob.size;
				resolve({ blob, duration, size });
			};
		});
		// Return immediately once recording has started
		return;
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
		// Stop all tracks first to release microphone immediately
		if (this.stream) {
			this.stream.getTracks().forEach(track => track.stop());
		}
		// Then stop the media recorder to finalize the blob
		if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
			this.mediaRecorder!.stop();
		}
		// Wait for recording result
		const result = await this.stopPromise;
		// Reset recorder and stream for next recording
		this.mediaRecorder = null;
		this.stream = null;
		// Reset timing state
		this.startTime = 0;
		this.pauseTime = 0;
		this.totalPausedTime = 0;
		return result;
	}

	public isRecording(): boolean {
		return this.mediaRecorder?.state === 'recording';
	}

	public isPaused(): boolean {
		return this.mediaRecorder?.state === 'paused';
	}

	public getElapsed(): number {
		if (!this.startTime) return 0;
		if (this.mediaRecorder?.state === 'paused') {
			return (this.pauseTime - this.startTime - this.totalPausedTime) / 1000;
		}
		return (Date.now() - this.startTime - this.totalPausedTime) / 1000;
	}
} 