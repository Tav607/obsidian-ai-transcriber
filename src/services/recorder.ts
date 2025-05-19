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
	private rejectStop: (reason?: unknown) => void;
	private stopPromise: Promise<RecordingResult>;
	private stream: MediaStream | null = null;
	private audioContext: AudioContext | null = null;
	private analyserNode: AnalyserNode | null = null;
	private sourceNode: MediaStreamAudioSourceNode | null = null;

	constructor() {}

	public async init() {
		this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		this.mediaRecorder = new MediaRecorder(this.stream, { mimeType: 'audio/webm;codecs=opus' });
		this.mediaRecorder.ondataavailable = (e: BlobEvent) => {
			if (e.data.size > 0) {
				this.recordedChunks.push(e.data);
			}
		};

		// Initialize AudioContext and AnalyserNode for visualization
		const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
		if (AudioContextConstructor) {
			this.audioContext = new AudioContextConstructor();
			this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
			this.analyserNode = this.audioContext.createAnalyser();
			this.analyserNode.fftSize = 64; // Smaller FFT size for basic waveform
			this.sourceNode.connect(this.analyserNode);
			// Note: We don't connect analyserNode to destination, as we only want to analyze, not playback through it.
		} else {
			console.warn('Web Audio API not supported, waveform visualization disabled.');
		}
	}

	async start(): Promise<void> {
		if (!this.mediaRecorder) {
			await this.init();
		}
		this.recordedChunks = [];
		this.totalPausedTime = 0;
		this.startTime = Date.now();
		if (this.mediaRecorder) {
			this.mediaRecorder.start();
		}
		// Prepare promise for stop() to return recording result
		this.stopPromise = new Promise<RecordingResult>((resolve, reject) => {
			this.resolveStop = resolve;
			this.rejectStop = reject;
			if (this.mediaRecorder) {
				this.mediaRecorder.onstop = () => {
					const blob = new Blob(this.recordedChunks, { type: 'audio/webm;codecs=opus' });
					const duration = (Date.now() - this.startTime - this.totalPausedTime) / 1000;
					const size = blob.size;
					resolve({ blob, duration, size });
				};
			}
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

		// Disconnect and clean up audio context nodes
		if (this.sourceNode) {
			this.sourceNode.disconnect();
			this.sourceNode = null;
		}
		if (this.analyserNode) {
			this.analyserNode = null; // No disconnect method for AnalyserNode itself, just dereference
		}
		if (this.audioContext && this.audioContext.state !== 'closed') {
			await this.audioContext.close();
			this.audioContext = null;
		}

		// Then stop the media recorder to finalize the blob
		if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
			this.mediaRecorder.stop();
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

	public getAnalyserNode(): AnalyserNode | null {
		return this.analyserNode;
	}
} 