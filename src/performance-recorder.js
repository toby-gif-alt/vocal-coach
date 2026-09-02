export class SessionPerformanceRecorder {
  constructor({
    MediaRecorderClass = typeof MediaRecorder === "undefined" ? null : MediaRecorder,
    createObjectURL = (blob) => URL.createObjectURL(blob),
    revokeObjectURL = (url) => URL.revokeObjectURL(url),
    now = () => performance.now(),
  } = {}) {
    this.MediaRecorderClass = MediaRecorderClass;
    this.createObjectURL = createObjectURL;
    this.revokeObjectURL = revokeObjectURL;
    this.now = now;
    this.recorder = null;
    this.chunks = [];
    this.startedAt = 0;
    this.pausedAt = 0;
    this.pausedDurationMs = 0;
    this.recording = null;
    this.stopPromise = null;
  }

  get supported() {
    return Boolean(this.MediaRecorderClass);
  }

  preferredMimeType() {
    const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
    return candidates.find((type) => this.MediaRecorderClass?.isTypeSupported?.(type)) || "";
  }

  start(stream) {
    if (!this.supported || !stream) return false;
    this.disposeRecording();
    this.stopPromise = null;
    this.chunks = [];
    this.pausedDurationMs = 0;
    this.pausedAt = 0;
    const mimeType = this.preferredMimeType();
    this.recorder = mimeType
      ? new this.MediaRecorderClass(stream, { mimeType })
      : new this.MediaRecorderClass(stream);
    this.recorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) this.chunks.push(event.data);
    });
    this.startedAt = this.now();
    this.recorder.start(250);
    return true;
  }

  pause() {
    if (this.recorder?.state !== "recording") return;
    this.pausedAt = this.now();
    this.recorder.pause();
  }

  resume() {
    if (this.recorder?.state !== "paused") return;
    this.pausedDurationMs += Math.max(0, this.now() - this.pausedAt);
    this.pausedAt = 0;
    this.recorder.resume();
  }

  stop() {
    if (this.stopPromise) return this.stopPromise;
    if (!this.recorder || this.recorder.state === "inactive") return Promise.resolve(this.recording);
    const recorder = this.recorder;
    const endAt = this.now();
    if (recorder.state === "paused") this.pausedDurationMs += Math.max(0, endAt - this.pausedAt);
    this.stopPromise = new Promise((resolve) => {
      recorder.addEventListener("stop", () => {
        const mimeType = recorder.mimeType || this.chunks[0]?.type || "audio/webm";
        const blob = new Blob(this.chunks, { type: mimeType });
        this.recording = blob.size ? {
          blob,
          url: this.createObjectURL(blob),
          mimeType,
          durationSeconds: Math.max(0, (endAt - this.startedAt - this.pausedDurationMs) / 1000),
        } : null;
        this.recorder = null;
        this.stopPromise = null;
        resolve(this.recording);
      }, { once: true });
      recorder.stop();
    });
    return this.stopPromise;
  }

  disposeRecording() {
    if (this.recording?.url) this.revokeObjectURL(this.recording.url);
    this.recording = null;
  }

  destroy() {
    if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop();
    this.recorder = null;
    this.disposeRecording();
  }
}
