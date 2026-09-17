import { PitchDetector } from "https://cdn.jsdelivr.net/npm/pitchy@4.1.0/+esm";
import {
  AUDIO_CONFIG,
  DEFAULT_LISTENING_SETUP,
  DEFAULT_MICROPHONE_SENSITIVITY,
  MICROPHONE_SENSITIVITY,
  LISTENING_SETUPS,
  PITCH_TRACKER_CONFIG,
  PLAYBACK_CONFIG,
  REVIEW_CONFIG,
  frequencyToMidi,
  midiToFrequency,
} from "./config.js?v=20";
import { deriveNoiseGate, RmsNoiseGate } from "./noise-gate.js?v=20";
import { applyMicrophoneSensitivity, deriveMicrophoneCalibration } from "./microphone-calibration.js?v=20";
import { SessionPerformanceRecorder } from "./performance-recorder.js?v=15";
import { detectAutocorrelationPitch, StablePitchTracker } from "./pitch-tracker.js?v=20";
import { playbackWindow } from "./practice-range.js?v=18";
import { countInPattern, quartersToTransportTicks, transportTicksToQuarters } from "./timing.js?v=15";
import { reviewDriftSeconds, reviewQuarterAtSeconds, reviewVolumes } from "./review-playback.js?v=20";
import { InputOverloadMonitor, isFrameClipped, measureFrameAmplitude } from "./signal-quality.js?v=20";

export function microphoneConstraintsForSetup(setup = DEFAULT_LISTENING_SETUP) {
  return { ...(LISTENING_SETUPS[setup] || LISTENING_SETUPS[DEFAULT_LISTENING_SETUP]) };
}

export class AudioEngine {
  constructor({ onPitchSample, onRawPitchSample, onPitchDiagnostic, onMicrophoneState, onMicrophoneCalibration, onRecordingState, onCountIn, onPlaybackEnd } = {}) {
    this.onPitchSample = onPitchSample || (() => {});
    this.onRawPitchSample = onRawPitchSample || (() => {});
    this.onPitchDiagnostic = onPitchDiagnostic || (() => {});
    this.onMicrophoneState = onMicrophoneState || (() => {});
    this.onMicrophoneCalibration = onMicrophoneCalibration || (() => {});
    this.onRecordingState = onRecordingState || (() => {});
    this.onCountIn = onCountIn || (() => {});
    this.onPlaybackEnd = onPlaybackEnd || (() => {});
    this.score = null;
    this.synths = new Map();
    this.guideSynth = null;
    this.stream = null;
    this.analyser = null;
    this.mediaSource = null;
    this.pitchDetector = null;
    this.pitchTracker = new StablePitchTracker();
    this.targetMidiAtQuarter = () => null;
    this.inputFrame = null;
    this.pitchFrame = null;
    this.calibrationFrame = null;
    this.calibrationResolve = null;
    this.microphoneStartPromise = null;
    this.microphoneGeneration = 0;
    this.countInTimers = new Set();
    this.countInResolve = null;
    this.clickSynth = null;
    this.lastPitchSampleAt = 0;
    this.microphoneSensitivity = DEFAULT_MICROPHONE_SENSITIVITY;
    this.baseMicrophoneCalibration = null;
    this.noiseGateSettings = deriveNoiseGate(0, this.microphoneSensitivity);
    this.noiseGate = new RmsNoiseGate(this.noiseGateSettings);
    this.overloadMonitor = new InputOverloadMonitor();
    this.performanceRecorder = new SessionPerformanceRecorder();
    this.isPlaying = false;
    this.isPaused = false;
    this.isCountingIn = false;
    this.tempoPercent = 100;
    this.guideVolume = PLAYBACK_CONFIG.defaultGuideVolume;
    this.partVolumes = new Map();
    this.enabledPartIds = new Set();
    this.listeningSetup = DEFAULT_LISTENING_SETUP;
    this.reviewVolumes = reviewVolumes();
    this.review = null;
    this.lastReviewDriftCheckAt = 0;
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
    this.partVolumes = new Map((score?.parts || []).map((part) => [part.id, PLAYBACK_CONFIG.defaultPartVolume]));
    this.enabledPartIds = new Set((score?.parts || []).map((part) => part.id));
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

  setMicrophoneSensitivity(level) {
    if (!MICROPHONE_SENSITIVITY[level]) return;
    this.microphoneSensitivity = level;
    this.noiseGateSettings = this.baseMicrophoneCalibration
      ? applyMicrophoneSensitivity(this.baseMicrophoneCalibration, level)
      : deriveNoiseGate(this.noiseGateSettings.ambientRms, level);
    this.noiseGate.configure(this.noiseGateSettings);
    const trackerConfig = {
      minimumClarity: this.noiseGateSettings.minimumClarity || AUDIO_CONFIG.minimumClarity,
    };
    if (Number.isFinite(this.noiseGateSettings.reacquireAfterMs)) {
      trackerConfig.reacquireAfterMs = this.noiseGateSettings.reacquireAfterMs;
    }
    this.pitchTracker.configure(trackerConfig);
  }

  setMicrophoneCalibration(calibration) {
    this.baseMicrophoneCalibration = calibration || null;
    if (this.baseMicrophoneCalibration) this.setMicrophoneSensitivity(this.microphoneSensitivity);
  }

  clearMicrophoneCalibration() {
    this.baseMicrophoneCalibration = null;
    this.noiseGateSettings = deriveNoiseGate(0, this.microphoneSensitivity);
    this.noiseGate.configure(this.noiseGateSettings);
    this.pitchTracker.configure({ minimumClarity: AUDIO_CONFIG.minimumClarity, reacquireAfterMs: PITCH_TRACKER_CONFIG.reacquireAfterMs });
  }

  setGuideVolume(value) {
    this.guideVolume = Math.max(0, Math.min(100, Number(value) || 0));
    if (this.guideSynth) this.guideSynth.volume.value = this.volumeToDb(this.guideVolume, PLAYBACK_CONFIG.guideTrimDb);
  }

  setPartVolume(partId, value) {
    const percent = Math.max(0, Math.min(100, Number(value) || 0));
    const id = String(partId);
    this.partVolumes.set(id, percent);
    if (this.review) this.review.partVolumes[id] = percent;
    this.applyPartVolume(id);
  }

  setPartEnabled(partId, enabled) {
    const id = String(partId);
    if (enabled) this.enabledPartIds.add(id);
    else this.enabledPartIds.delete(id);
    if (this.review) {
      if (enabled) this.review.enabledPartIds.add(id);
      else this.review.enabledPartIds.delete(id);
    }
    if (!enabled) this.synths.get(id)?.releaseAll?.();
    this.applyPartVolume(id);
  }

  applyPartVolume(partId) {
    const synth = this.synths.get(partId);
    if (!synth) return;
    const enabled = this.review
      ? Boolean(this.review.layers.accompaniment) && this.review.enabledPartIds.has(partId)
      : this.enabledPartIds.has(partId);
    const base = this.review
      ? Number(this.review.partVolumes?.[partId] ?? PLAYBACK_CONFIG.defaultPartVolume)
      : Number(this.partVolumes.get(partId) ?? PLAYBACK_CONFIG.defaultPartVolume);
    const master = this.review ? this.reviewVolumes.accompaniment / 100 : 1;
    synth.volume.value = enabled
      ? this.volumeToDb(base * master, PLAYBACK_CONFIG.accompanimentTrimDb)
      : -Infinity;
  }

  setListeningSetup(setup) {
    if (!LISTENING_SETUPS[setup] || setup === this.listeningSetup) return false;
    this.listeningSetup = setup;
    if (this.stream) this.stopMicrophone({ notify: false });
    return true;
  }

  setReviewVolume(kind, value) {
    if (!(kind in this.reviewVolumes)) return;
    this.reviewVolumes = reviewVolumes({ ...this.reviewVolumes, [kind]: value });
    if (this.review) {
      this.review.volumes = { ...this.reviewVolumes };
      this.applyReviewVolumes();
    }
  }

  applyReviewVolumes() {
    const melodyDb = this.volumeToDb(this.reviewVolumes.melody, PLAYBACK_CONFIG.guideTrimDb);
    this.synths.forEach((_, partId) => this.applyPartVolume(partId));
    if (this.guideSynth) this.guideSynth.volume.value = melodyDb;
  }

  restorePerformanceVolumes() {
    const guideDb = this.volumeToDb(this.guideVolume, PLAYBACK_CONFIG.guideTrimDb);
    this.synths.forEach((_, partId) => this.applyPartVolume(partId));
    if (this.guideSynth) this.guideSynth.volume.value = guideDb;
  }

  volumeToDb(percent, trimDb) {
    if (percent <= 0) return -Infinity;
    return 20 * Math.log10(percent / 100) + trimDb;
  }

  get currentQuarter() {
    if (!window.Tone) return 0;
    return transportTicksToQuarters(this.transport.ticks, this.transport.PPQ);
  }

  get currentSeconds() {
    return this.currentQuarter * 60 / this.bpm;
  }

  get durationSeconds() {
    return (this.score?.durationQuarters || 0) * 60 / this.bpm;
  }

  get hasActivePerformanceRecording() {
    return Boolean(this.performanceRecorder.recorder && this.performanceRecorder.recorder.state !== "inactive");
  }

  get performanceRecordingSupported() {
    return this.performanceRecorder.supported;
  }

  get hasMicrophoneStream() {
    return Boolean(this.stream && this.analyser && this.pitchDetector);
  }

  async play({
    vocalPartId,
    guideEnabled,
    enabledPartIds,
    assessmentMode,
    vocalOctaveSemitones = 0,
    countInBars = 1,
    targetMidiAtQuarter = () => null,
    startQuarter = 0,
    endQuarter = this.score?.durationQuarters || 0,
    startTimeSignature = this.score?.initialTimeSignature,
  }) {
    if (!this.score) throw new Error("Load a score before playing.");
    this.stopReview({ reset: false });
    const resuming = this.isPaused;
    await this.tone.start();
    this.targetMidiAtQuarter = targetMidiAtQuarter;
    const enabled = new Set(enabledPartIds || []);
    for (const part of this.score.parts) {
      if (part.id !== vocalPartId) this.setPartEnabled(part.id, enabled.has(part.id));
    }
    if (assessmentMode) await this.startMicrophone();
    this.ensureSynths();
    if (assessmentMode && !resuming) this.pitchTracker.reset();
    if (!resuming) this.transport.ticks = quartersToTransportTicks(startQuarter, this.transport.PPQ);
    // Monitoring is already active in preparation mode where possible. Start
    // it here as a fallback so the count-in is always tuned but never scored.
    if (assessmentMode) this.startPitchSampling();
    if (!resuming && countInBars > 0) {
      const completed = await this.performCountIn(countInBars, startTimeSignature || this.score.initialTimeSignature);
      if (!completed) {
        const error = new Error("Count-in was cancelled.");
        error.name = "AbortError";
        throw error;
      }
    }
    this.scheduleScore({
      vocalPartId,
      guideEnabled,
      enabledPartIds,
      vocalOctaveSemitones,
      resumeQuarter: resuming ? this.currentQuarter : startQuarter,
      endQuarter,
    });
    this.transport.bpm.value = this.bpm;
    if (assessmentMode) {
      if (resuming) this.performanceRecorder.resume();
      else {
        const recording = this.performanceRecorder.start(this.stream);
        this.onRecordingState(recording ? "recording" : "unsupported");
      }
    }
    this.transport.start();
    this.isPlaying = true;
    this.isPaused = false;
  }

  pause() {
    if (!this.isPlaying) return;
    this.transport.pause();
    this.synths.forEach((synth) => synth.releaseAll?.());
    this.guideSynth?.releaseAll?.();
    this.isPlaying = false;
    this.isPaused = true;
    this.performanceRecorder.pause();
    this.onRecordingState("paused");
  }

  stop({ reset = true, resetQuarter = 0, microphone = true } = {}) {
    this.cancelCountIn();
    if (window.Tone) {
      this.transport.stop();
      if (reset) this.transport.ticks = quartersToTransportTicks(resetQuarter, this.transport.PPQ);
      this.transport.cancel(0);
    }
    this.isPlaying = false;
    this.isPaused = false;
    if (this.performanceRecorder.recorder) void this.performanceRecorder.stop();
    if (microphone) this.stopMicrophone();
  }

  finishPerformanceRecording() {
    return this.performanceRecorder.stop();
  }

  discardPerformanceRecording() {
    this.performanceRecorder.disposeRecording();
  }

  ensureSynths() {
    if (this.synths.size) return;
    for (const part of this.score.parts) {
      const synth = new this.tone.PolySynth(this.tone.Synth, {
        oscillator: { type: "triangle" },
        envelope: { attack: 0.015, decay: 0.12, sustain: 0.42, release: 0.28 },
        volume: -Infinity,
      }).toDestination();
      this.synths.set(part.id, synth);
      this.applyPartVolume(part.id);
    }
    this.guideSynth = new this.tone.PolySynth(this.tone.Synth, {
      oscillator: { type: "sine" },
      envelope: { attack: 0.02, decay: 0.08, sustain: 0.32, release: 0.18 },
      volume: this.volumeToDb(this.guideVolume, PLAYBACK_CONFIG.guideTrimDb),
    }).toDestination();
    this.clickSynth = new this.tone.Synth({
      oscillator: { type: "sine" },
      envelope: { attack: 0.001, decay: 0.05, sustain: 0, release: 0.03 },
      volume: -10,
    }).toDestination();
  }

  scheduleScore({
    vocalPartId,
    guideEnabled,
    enabledPartIds,
    vocalOctaveSemitones = 0,
    resumeQuarter = this.currentQuarter,
    endQuarter = this.score?.durationQuarters || 0,
    notifyEnd = true,
  }) {
    const transport = this.transport;
    transport.cancel(0);
    const ticksPerQuarter = transport.PPQ;
    for (const part of this.score.parts) {
      const isVocal = part.id === vocalPartId;
      if (isVocal && !guideEnabled) continue;
      const synth = isVocal ? this.guideSynth : this.synths.get(part.id);
      for (const note of part.notes) {
        const window = playbackWindow(note, resumeQuarter, endQuarter, ticksPerQuarter);
        if (!window) continue;
        const when = `${quartersToTransportTicks(window.scheduledOnset, ticksPerQuarter)}i`;
        transport.schedule((time) => {
          const durationTicks = Math.max(1, quartersToTransportTicks(window.durationQuarters, ticksPerQuarter));
          const duration = `${durationTicks}i`;
          const frequency = isVocal ? midiToFrequency(note.midi + vocalOctaveSemitones) : note.frequency;
          synth.triggerAttackRelease(frequency, duration, time, isVocal ? 0.52 : 0.28);
        }, when);
      }
    }
    if (notifyEnd) {
      const endWhen = `${quartersToTransportTicks(endQuarter, ticksPerQuarter)}i`;
      transport.scheduleOnce(() => {
        this.isPlaying = false;
        this.isPaused = false;
        queueMicrotask(() => this.onPlaybackEnd());
      }, endWhen);
    }
    transport.ticks = quartersToTransportTicks(resumeQuarter, ticksPerQuarter);
  }

  async previewPitch(midi, durationSeconds = 0.7) {
    if (!Number.isFinite(midi)) return;
    await this.tone.start();
    this.ensureSynths();
    this.guideSynth.triggerAttackRelease(midiToFrequency(midi), durationSeconds, this.tone.now(), 0.5);
  }

  reviewSettingsAt(seconds, take, layers) {
    const bpm = Number(take?.bpm) || this.baseTempo;
    return {
      vocalPartId: take?.vocalPartId,
      guideEnabled: Boolean(layers?.melody),
      enabledPartIds: layers?.accompaniment ? [...(take?.enabledPartIds || [])] : [],
      vocalOctaveSemitones: Number(take?.octaveShift) || 0,
      resumeQuarter: reviewQuarterAtSeconds(seconds, bpm, take?.startQuarter, take?.endQuarter),
      endQuarter: Number(take?.endQuarter) || this.score.durationQuarters,
      notifyEnd: false,
      bpm,
    };
  }

  async startReview({ currentSeconds = 0, take, layers, volumes: volumeLevels = this.reviewVolumes } = {}) {
    if (!this.score || !take) return;
    await this.tone.start();
    this.ensureSynths();
    this.reviewVolumes = reviewVolumes(volumeLevels);
    const settings = this.reviewSettingsAt(currentSeconds, take, layers);
    this.synths.forEach((synth) => synth.releaseAll?.());
    this.guideSynth?.releaseAll?.();
    this.transport.stop();
    const previousReview = this.review?.take === take ? this.review : null;
    this.review = {
      take,
      layers: { ...layers },
      volumes: { ...this.reviewVolumes },
      partVolumes: { ...(previousReview?.partVolumes || take.partVolumes || {}) },
      enabledPartIds: new Set(previousReview?.enabledPartIds || take.enabledPartIds || []),
    };
    this.applyReviewVolumes();
    this.transport.bpm.value = settings.bpm;
    this.scheduleScore(settings);
    this.lastReviewDriftCheckAt = performance.now();
    this.transport.start();
  }

  pauseReview() {
    if (!this.review) return;
    this.transport.pause();
    this.synths.forEach((synth) => synth.releaseAll?.());
    this.guideSynth?.releaseAll?.();
  }

  stopReview({ reset = true } = {}) {
    if (!this.review) return;
    if (window.Tone) {
      this.transport.stop();
      this.transport.cancel(0);
      if (reset) this.transport.ticks = 0;
    }
    this.synths.forEach((synth) => synth.releaseAll?.());
    this.guideSynth?.releaseAll?.();
    this.review = null;
    this.restorePerformanceVolumes();
  }

  async resynchroniseReview(
    currentSeconds,
    take = this.review?.take,
    layers = this.review?.layers,
    volumes = this.review?.volumes ?? this.reviewVolumes,
  ) {
    if (!take) return;
    await this.startReview({ currentSeconds, take, layers, volumes });
  }

  synchroniseReviewClock(currentSeconds) {
    if (!this.review) return false;
    const now = performance.now();
    if (now - this.lastReviewDriftCheckAt < REVIEW_CONFIG.driftCheckIntervalMs) return false;
    this.lastReviewDriftCheckAt = now;
    const driftSeconds = reviewDriftSeconds(
      this.currentQuarter,
      currentSeconds,
      this.review.take.bpm,
      this.review.take.startQuarter,
      this.review.take.endQuarter,
    );
    if (driftSeconds <= REVIEW_CONFIG.maximumDriftSeconds) return false;
    void this.resynchroniseReview(currentSeconds);
    return true;
  }

  performCountIn(bars, timeSignature) {
    const pattern = countInPattern(timeSignature, bars);
    if (!pattern.pulses.length) return Promise.resolve(true);
    this.cancelCountIn();
    this.isCountingIn = true;
    const secondsPerPulse = pattern.pulseQuarters * 60 / this.bpm;
    const leadSeconds = PLAYBACK_CONFIG.countInLeadSeconds;
    const startAt = this.tone.now() + leadSeconds;
    this.onCountIn({ status: "start", ...pattern });

    return new Promise((resolve) => {
      const finish = (completed) => {
        for (const timer of this.countInTimers) clearTimeout(timer);
        this.countInTimers.clear();
        this.countInResolve = null;
        this.isCountingIn = false;
        this.onCountIn({ status: completed ? "complete" : "cancelled", ...pattern });
        resolve(completed);
      };
      this.countInResolve = finish;
      pattern.pulses.forEach((pulse, index) => {
        const scheduledAt = startAt + index * secondsPerPulse;
        this.clickSynth.triggerAttackRelease(pulse.accent ? 1320 : 880, 0.045, scheduledAt, pulse.accent ? 0.9 : 0.58);
        const timer = setTimeout(() => {
          this.onCountIn({ status: "beat", ...pattern, ...pulse, index });
        }, Math.max(0, (scheduledAt - this.tone.now()) * 1000));
        this.countInTimers.add(timer);
      });
      const endTimer = setTimeout(
        () => finish(true),
        Math.max(0, (startAt - this.tone.now() + pattern.pulses.length * secondsPerPulse) * 1000),
      );
      this.countInTimers.add(endTimer);
    });
  }

  cancelCountIn() {
    if (!this.countInResolve) return;
    const resolve = this.countInResolve;
    this.countInResolve = null;
    resolve(false);
    this.clickSynth?.releaseAll?.();
  }

  async startMicrophone() {
    if (this.microphoneStartPromise) return this.microphoneStartPromise;
    if (this.stream) {
      this.onMicrophoneState("active", this.noiseGateSettings);
      return;
    }
    const generation = this.microphoneGeneration;
    const startPromise = this.openMicrophone(generation);
    this.microphoneStartPromise = startPromise;
    try {
      return await startPromise;
    } finally {
      if (this.microphoneStartPromise === startPromise) this.microphoneStartPromise = null;
    }
  }

  async openMicrophone(generation) {
    try {
      await this.ensureMicrophoneStream();
      if (generation !== this.microphoneGeneration) {
        const error = new Error("Microphone monitoring was cancelled.");
        error.name = "AbortError";
        throw error;
      }
      if (!this.baseMicrophoneCalibration) {
        const calibration = await this.runMicrophoneCheck();
        if (!calibration) {
          const error = new Error("Microphone check was cancelled.");
          error.name = "AbortError";
          throw error;
        }
        if (!calibration?.signalGood) {
          const error = new Error(calibration?.overloaded
            ? "Your microphone is overloading — move a little farther away and try again."
            : "Move a little closer to your microphone and try again.");
          error.name = "MicrophoneCheckError";
          error.calibration = calibration;
          throw error;
        }
      }
      this.onMicrophoneState("active", this.noiseGateSettings);
    } catch (error) {
      const checkFailed = error.name === "MicrophoneCheckError";
      if (error.name !== "AbortError" && !checkFailed) this.onMicrophoneState("error", error);
      this.stopMicrophone({ notify: false });
      if (checkFailed) this.onMicrophoneState("needs-adjustment", error.calibration || {});
      throw error;
    }
  }

  async startMicrophoneMonitoring(targetMidiAtQuarter = () => null) {
    await this.tone.start();
    this.targetMidiAtQuarter = targetMidiAtQuarter;
    const wasMonitoring = Boolean(this.pitchFrame);
    await this.startMicrophone();
    if (!wasMonitoring) this.pitchTracker.reset();
    this.startPitchSampling();
  }

  async ensureMicrophoneStream() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone assessment needs a modern browser and an HTTPS connection.");
    }
    this.onMicrophoneState("requesting");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: microphoneConstraintsForSetup(this.listeningSetup),
    });
    const context = this.tone.getContext().rawContext || this.tone.getContext();
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = AUDIO_CONFIG.analyserSize;
    this.analyser.smoothingTimeConstant = 0;
    this.mediaSource = context.createMediaStreamSource(this.stream);
    this.mediaSource.connect(this.analyser);
    this.pitchDetector = PitchDetector.forFloat32Array(this.analyser.fftSize);
    this.inputFrame = new Float32Array(this.analyser.fftSize);
    this.lastPitchSampleAt = 0;
  }

  collectMicrophoneCheckFrames(durationMs, includePitch) {
    const frames = [];
    const startedAt = performance.now();
    return new Promise((resolve) => {
      let active = true;
      const finish = (completed) => {
        if (!active) return;
        active = false;
        cancelAnimationFrame(this.calibrationFrame);
        this.calibrationFrame = null;
        this.calibrationResolve = null;
        resolve(completed ? frames : null);
      };
      this.calibrationResolve = finish;
      const collect = (now) => {
        if (!this.analyser || !this.inputFrame) {
          finish(false);
          return;
        }
        this.analyser.getFloatTimeDomainData(this.inputFrame);
        const amplitude = measureFrameAmplitude(this.inputFrame);
        if (includePitch) {
          const sampleRate = (this.tone.getContext().rawContext || this.tone.getContext()).sampleRate;
          const [frequency, clarity] = this.pitchDetector.findPitch(this.inputFrame, sampleRate);
          frames.push({ ...amplitude, frequency, clarity, clipped: isFrameClipped(amplitude) });
        } else {
          frames.push(amplitude.rms);
        }
        if (now - startedAt >= durationMs) {
          finish(true);
          return;
        }
        this.calibrationFrame = requestAnimationFrame(collect);
      };
      this.calibrationFrame = requestAnimationFrame(collect);
    });
  }

  async runMicrophoneCheck() {
    this.onMicrophoneState("checking-room", { durationMs: AUDIO_CONFIG.ambientCalibrationDurationMs });
    const ambientRmsValues = await this.collectMicrophoneCheckFrames(AUDIO_CONFIG.ambientCalibrationDurationMs, false);
    if (!ambientRmsValues) return null;
    this.onMicrophoneState("checking-voice", { durationMs: AUDIO_CONFIG.sungCalibrationDurationMs });
    const sungFrames = await this.collectMicrophoneCheckFrames(AUDIO_CONFIG.sungCalibrationDurationMs, true);
    if (!sungFrames) return null;
    const calibration = deriveMicrophoneCalibration({ ambientRmsValues, sungFrames });
    if (!calibration.signalGood) {
      this.onMicrophoneState("needs-adjustment", calibration);
      return calibration;
    }
    this.setMicrophoneCalibration(calibration);
    this.onMicrophoneCalibration(calibration);
    this.onMicrophoneState("ready", calibration);
    return calibration;
  }

  async recheckMicrophone({ keepActive = false, targetMidiAtQuarter = this.targetMidiAtQuarter } = {}) {
    await this.tone.start();
    this.pausePitchSampling();
    this.clearMicrophoneCalibration();
    await this.ensureMicrophoneStream();
    const calibration = await this.runMicrophoneCheck();
    if (keepActive && calibration?.signalGood) {
      this.targetMidiAtQuarter = targetMidiAtQuarter;
      this.pitchTracker.reset();
      this.startPitchSampling();
    } else {
      this.stopMicrophone({ notify: false });
    }
    this.onMicrophoneState(calibration?.signalGood ? "ready" : "needs-adjustment", calibration || {});
    return calibration;
  }

  samplePitch(now) {
    if (!this.analyser || !this.pitchDetector) return;
    if (now - this.lastPitchSampleAt >= AUDIO_CONFIG.sampleIntervalMs) {
      this.analyser.getFloatTimeDomainData(this.inputFrame);
      const amplitude = measureFrameAmplitude(this.inputFrame);
      const { rms } = amplitude;
      const capturedAt = performance.now();
      const clipping = this.overloadMonitor.update(isFrameClipped(amplitude), capturedAt);
      const gateOpen = this.noiseGate.accepts(rms);
      const establishedVoice = this.pitchTracker.hasEstablishedVoice(capturedAt);
      const continuationGateOpen = !gateOpen
        && establishedVoice
        && rms >= this.noiseGateSettings.closeThreshold * PITCH_TRACKER_CONFIG.continuationRmsScale;
      const sampleRate = (this.tone.getContext().rawContext || this.tone.getContext()).sampleRate;
      // Pitchy still runs below the gate so debug mode can explain every input
      // frame. The gate remains authoritative for acceptance.
      const [frequency, clarity] = this.pitchDetector.findPitch(this.inputFrame, sampleRate);
      const previousMidi = this.pitchTracker.recentHarmonicReference(capturedAt)?.midi;
      const rawMidi = frequency > 0 ? frequencyToMidi(frequency) : null;
      const ambiguous = rawMidi !== null && previousMidi !== undefined && Math.abs(rawMidi - previousMidi) * 100 > 700;
      const corroborating = ambiguous ? detectAutocorrelationPitch(this.inputFrame, sampleRate) : { frequency: null };
      const scoreQuarter = this.currentQuarter;
      const rawFrame = {
        frequency,
        clarity,
        rms,
        absolutePeak: amplitude.absolutePeak,
        nearFullScalePercent: amplitude.nearFullScalePercent,
        clipped: clipping.clipped,
        overloadActive: clipping.overloadActive,
        gateOpen,
        continuationGateOpen,
        continuationGateThreshold: this.noiseGateSettings.closeThreshold * PITCH_TRACKER_CONFIG.continuationRmsScale,
        noiseGate: this.noiseGateSettings.openThreshold,
        minimumClarity: this.noiseGateSettings.minimumClarity || AUDIO_CONFIG.minimumClarity,
        continuationMinimumClarity: this.pitchTracker.continuationMinimumClarity(
          this.noiseGateSettings.minimumClarity || AUDIO_CONFIG.minimumClarity,
        ),
        corroboratingFrequency: corroborating.frequency,
        capturedAt,
        scoreQuarter,
        scoreSeconds: this.currentSeconds,
        targetMidi: this.targetMidiAtQuarter(scoreQuarter),
      };
      const diagnostic = this.pitchTracker.process(rawFrame);
      this.onRawPitchSample(diagnostic);
      this.onPitchDiagnostic(diagnostic);
      if (diagnostic.status === "accepted") {
        this.onPitchSample({
          ...diagnostic,
          frequency: diagnostic.filteredFrequency,
        });
      }
      this.lastPitchSampleAt = now;
    }
    this.pitchFrame = requestAnimationFrame((time) => this.samplePitch(time));
  }

  startPitchSampling() {
    cancelAnimationFrame(this.pitchFrame);
    this.lastPitchSampleAt = 0;
    this.pitchFrame = requestAnimationFrame((time) => this.samplePitch(time));
  }

  pausePitchSampling() {
    cancelAnimationFrame(this.pitchFrame);
    this.pitchFrame = null;
  }

  stopMicrophone({ notify = true } = {}) {
    this.microphoneGeneration += 1;
    cancelAnimationFrame(this.pitchFrame);
    this.pitchFrame = null;
    cancelAnimationFrame(this.calibrationFrame);
    this.calibrationFrame = null;
    this.calibrationResolve?.(false);
    this.calibrationResolve = null;
    this.mediaSource?.disconnect();
    this.mediaSource = null;
    if (this.stream) this.stream.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.analyser = null;
    this.pitchDetector = null;
    this.inputFrame = null;
    this.pitchTracker.reset();
    this.overloadMonitor.reset();
    this.noiseGate.configure(this.noiseGateSettings);
    if (notify) this.onMicrophoneState("idle");
  }

  disposeSynths() {
    this.synths.forEach((synth) => synth.dispose());
    this.synths.clear();
    this.guideSynth?.dispose();
    this.guideSynth = null;
    this.clickSynth?.dispose();
    this.clickSynth = null;
  }

  destroy() {
    this.stop({ reset: true, microphone: true });
    this.performanceRecorder.destroy();
    this.disposeSynths();
  }
}
