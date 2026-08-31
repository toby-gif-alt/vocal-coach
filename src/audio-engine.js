import { PitchDetector } from "https://cdn.jsdelivr.net/npm/pitchy@4.1.0/+esm";
import { AUDIO_CONFIG } from "./config.js";

export class AudioEngine {
  constructor({ onPitchSample, onMicrophoneState, onPlaybackEnd } = {}) {
    this.onPitchSample = onPitchSample || (() => {});
    this.onMicrophoneState = onMicrophoneState || (() => {});
    this.onPlaybackEnd = onPlaybackEnd || (() => {});
    this.score = null;
    this.synths = new Map();
    this.guideSynth = null;
    this.stream = null;
    this.analyser = null;
    this.pitchDetector = null;
    this.pitchFrame = null;
    this.lastPitchSampleAt = 0;
    this.isPlaying = false;
    this.isPaused = false;
    this.tempoPercent = 100;
  }

  get tone() {
    if (!window.Tone) throw new Error("The playback library did not load. Check your internet connection and refresh.");
    return window.Tone;
  }

  get transport() {
    return this.tone.getTransport ? this.tone.getTransport() : this.tone.Transport;
  }

  setScore(score) {
    this.stop({ reset: true, microphone: true });
    this.disposeSynths();
    this.score = score;
  }

  get baseTempo() {
    return this.score?.originalTempo || 120;
  }

  get bpm() {
    return this.baseTempo * this.tempoPercent / 100;
  }

  setTempo(percent) {
    this.tempoPercent = Number(percent) || 100;
    if (window.Tone) this.transport.bpm.value = this.bpm;
  }

  get currentQuarter() {
    if (!window.Tone) return 0;
    return this.transport.ticks / this.transport.PPQ;
  }

  get currentSeconds() {
    return this.currentQuarter * 60 / this.bpm;
  }

  get durationSeconds() {
    return (this.score?.durationQuarters || 0) * 60 / this.bpm;
  }

  async play({ vocalPartId, guideEnabled, enabledPartIds, assessmentMode }) {
    if (!this.score) throw new Error("Load a score before playing.");
    await this.tone.start();
    if (assessmentMode) await this.startMicrophone();
    this.ensureSynths();
    this.scheduleScore({ vocalPartId, guideEnabled: guideEnabled && !assessmentMode, enabledPartIds });
    this.transport.bpm.value = this.bpm;
    this.transport.start();
    this.isPlaying = true;
    this.isPaused = false;
  }

  pause() {
    if (!this.isPlaying) return;
    this.transport.pause();
    this.isPlaying = false;
    this.isPaused = true;
  }

  stop({ reset = true, microphone = true } = {}) {
    if (window.Tone) {
      this.transport.stop();
      if (reset) this.transport.ticks = 0;
      this.transport.cancel(0);
    }
    this.isPlaying = false;
    this.isPaused = false;
    if (microphone) this.stopMicrophone();
  }

  ensureSynths() {
    if (this.synths.size) return;
    for (const part of this.score.parts) {
      const synth = new this.tone.PolySynth(this.tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.015, decay: 0.12, sustain: 0.42, release: 0.28 },
        volume: -14,
      }).toDestination();
      this.synths.set(part.id, synth);
    }
    this.guideSynth = new this.tone.PolySynth(this.tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.02, decay: 0.08, sustain: 0.32, release: 0.18 },
      volume: -18,
    }).toDestination();
  }

  scheduleScore({ vocalPartId, guideEnabled, enabledPartIds }) {
    const transport = this.transport;
    const resumeQuarter = this.currentQuarter;
    transport.cancel(0);
    const ticksPerQuarter = transport.PPQ;
    const enabled = new Set(enabledPartIds || []);
    for (const part of this.score.parts) {
      const isVocal = part.id === vocalPartId;
      if ((!isVocal && !enabled.has(part.id)) || (isVocal && !guideEnabled)) continue;
      const synth = isVocal ? this.guideSynth : this.synths.get(part.id);
      for (const note of part.notes) {
        const when = `${Math.round(note.onsetQuarters * ticksPerQuarter)}i`;
        transport.schedule((time) => {
          const duration = Math.max(0.045, note.durationQuarters * 60 / this.bpm * 0.92);
          synth.triggerAttackRelease(note.frequency, duration, time, isVocal ? 0.38 : 0.25);
        }, when);
      }
    }
    const endWhen = `${Math.round(this.score.durationQuarters * ticksPerQuarter)}i`;
    transport.scheduleOnce(() => {
      this.isPlaying = false;
      this.isPaused = false;
      queueMicrotask(() => this.onPlaybackEnd());
    }, endWhen);
    transport.ticks = resumeQuarter * ticksPerQuarter;
  }

  async startMicrophone() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone assessment needs a modern browser and an HTTPS connection.");
    }
    this.onMicrophoneState("requesting");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
      });
      const context = this.tone.getContext().rawContext || this.tone.getContext();
      this.analyser = context.createAnalyser();
      this.analyser.fftSize = AUDIO_CONFIG.analyserSize;
      this.analyser.smoothingTimeConstant = 0;
      context.createMediaStreamSource(this.stream).connect(this.analyser);
      this.pitchDetector = PitchDetector.forFloat32Array(this.analyser.fftSize);
      this.lastPitchSampleAt = 0;
      this.onMicrophoneState("active");
      this.pitchFrame = requestAnimationFrame((time) => this.samplePitch(time));
    } catch (error) {
      this.onMicrophoneState("error", error);
      this.stopMicrophone();
      throw error;
    }
  }

  samplePitch(now) {
    if (!this.analyser || !this.pitchDetector) return;
    if (now - this.lastPitchSampleAt >= AUDIO_CONFIG.sampleIntervalMs) {
      const input = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(input);
      const sampleRate = (this.tone.getContext().rawContext || this.tone.getContext()).sampleRate;
      const [frequency, clarity] = this.pitchDetector.findPitch(input, sampleRate);
      if (clarity >= AUDIO_CONFIG.minimumClarity && frequency >= AUDIO_CONFIG.minimumFrequency && frequency <= AUDIO_CONFIG.maximumFrequency) {
        this.onPitchSample({
          frequency,
          clarity,
          capturedAt: performance.now(),
          scoreQuarter: this.currentQuarter,
          scoreSeconds: this.currentSeconds,
        });
      }
      this.lastPitchSampleAt = now;
    }
    this.pitchFrame = requestAnimationFrame((time) => this.samplePitch(time));
  }

  stopMicrophone() {
    cancelAnimationFrame(this.pitchFrame);
    this.pitchFrame = null;
    if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.analyser = null;
    this.pitchDetector = null;
    this.onMicrophoneState("idle");
  }

  disposeSynths() {
    this.synths.forEach((synth) => synth.dispose());
    this.synths.clear();
    this.guideSynth?.dispose();
    this.guideSynth = null;
  }

  destroy() {
    this.stop({ reset: true, microphone: true });
    this.disposeSynths();
  }
}
