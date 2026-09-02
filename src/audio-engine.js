import { PitchDetector } from "https://cdn.jsdelivr.net/npm/pitchy@4.1.0/+esm";
import {
  AUDIO_CONFIG,
  DEFAULT_MICROPHONE_SENSITIVITY,
  MICROPHONE_SENSITIVITY,
  PITCH_TRACKER_CONFIG,
  PLAYBACK_CONFIG,
  frequencyToMidi,
  midiToFrequency,
} from "./config.js?v=14";
import { calculateRms, deriveNoiseGate, RmsNoiseGate } from "./noise-gate.js?v=14";
import { applyMicrophoneSensitivity, deriveMicrophoneCalibration } from "./microphone-calibration.js?v=14";
import { SessionPerformanceRecorder } from "./performance-recorder.js?v=14";
import { detectAutocorrelationPitch, StablePitchTracker } from "./pitch-tracker.js?v=14";
import { countInPattern, quartersToTransportTicks, transportTicksToQuarters } from "./timing.js?v=14";

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
    this.countInTimers = new Set();
    this.countInResolve = null;
    this.clickSynth = null;
    this.lastPitchSampleAt = 0;
    this.microphoneSensitivity = DEFAULT_MICROPHONE_SENSITIVITY;
    this.baseMicrophoneCalibration = null;
    this.noiseGateSettings = deriveNoiseGate(0, this.microphoneSensitivity);
    this.noiseGate = new RmsNoiseGate(this.noiseGateSettings);
    this.performanceRecorder = new SessionPerformanceRecorder();
    this.isPlaying = false;
    this.isPaused = false;
    this.isCountingIn = false;
    this.tempoPercent = 100;
    this.guideVolume = PLAYBACK_CONFIG.defaultGuideVolume;
    this.accompanimentVolume = PLAYBACK_CONFIG.defaultAccompanimentVolume;
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

  setAccompanimentVolume(value) {
    this.accompanimentVolume = Math.max(0, Math.min(100, Number(value) || 0));
    const decibels = this.volumeToDb(this.accompanimentVolume, PLAYBACK_CONFIG.accompanimentTrimDb);
    this.synths.forEach((synth) => { synth.volume.value = decibels; });
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

  async play({
    vocalPartId,
    guideEnabled,
    enabledPartIds,
    assessmentMode,
    vocalOctaveSemitones = 0,
    countInBars = 1,
    targetMidiAtQuarter = () => null,
  }) {
    if (!this.score) throw new Error("Load a score before playing.");
    const resuming = this.isPaused;
    await this.tone.start();
    if (assessmentMode) await this.startMicrophone();
    this.ensureSynths();
    this.targetMidiAtQuarter = targetMidiAtQuarter;
    if (assessmentMode && !resuming) this.pitchTracker.reset();
    if (!resuming && countInBars > 0) {
      const completed = await this.performCountIn(countInBars, this.score.initialTimeSignature);
      if (!completed) {
        const error = new Error("Count-in was cancelled.");
        error.name = "AbortError";
        throw error;
      }
    }
    this.scheduleScore({ vocalPartId, guideEnabled, enabledPartIds, vocalOctaveSemitones });
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
    if (assessmentMode) this.startPitchSampling();
  }

  pause() {
    if (!this.isPlaying) return;
    this.transport.pause();
    this.isPlaying = false;
    this.isPaused = true;
    this.pausePitchSampling();
    this.performanceRecorder.pause();
    this.onRecordingState("paused");
  }

  stop({ reset = true, microphone = true } = {}) {
    this.cancelCountIn();
    if (window.Tone) {
      this.transport.stop();
      if (reset) this.transport.ticks = 0;
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
        volume: this.volumeToDb(this.accompanimentVolume, PLAYBACK_CONFIG.accompanimentTrimDb),
      }).toDestination();
      this.synths.set(part.id, synth);
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

  scheduleScore({ vocalPartId, guideEnabled, enabledPartIds, vocalOctaveSemitones = 0 }) {
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
        const when = `${quartersToTransportTicks(note.onsetQuarters, ticksPerQuarter)}i`;
        transport.schedule((time) => {
          const durationTicks = Math.max(1, quartersToTransportTicks(note.durationQuarters * 0.92, ticksPerQuarter));
          const duration = `${durationTicks}i`;
          const frequency = isVocal ? midiToFrequency(note.midi + vocalOctaveSemitones) : note.frequency;
          synth.triggerAttackRelease(frequency, duration, time, isVocal ? 0.52 : 0.28);
        }, when);
      }
    }
    const endWhen = `${quartersToTransportTicks(this.score.durationQuarters, ticksPerQuarter)}i`;
    transport.scheduleOnce(() => {
      this.isPlaying = false;
      this.isPaused = false;
      queueMicrotask(() => this.onPlaybackEnd());
    }, endWhen);
    transport.ticks = quartersToTransportTicks(resumeQuarter, ticksPerQuarter);
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
    if (this.stream) {
      this.onMicrophoneState("active", this.noiseGateSettings);
      return;
    }
    try {
      await this.ensureMicrophoneStream();
      if (!this.baseMicrophoneCalibration) {
        const calibration = await this.runMicrophoneCheck();
        if (!calibration) {
          const error = new Error("Microphone check was cancelled.");
          error.name = "AbortError";
          throw error;
        }
        if (!calibration?.signalGood) {
          const error = new Error("Move a little closer to your microphone and try again.");
          error.name = "MicrophoneCheckError";
          throw error;
        }
      }
      this.onMicrophoneState("active", this.noiseGateSettings);
    } catch (error) {
      const checkFailed = error.name === "MicrophoneCheckError";
      if (error.name !== "AbortError" && !checkFailed) this.onMicrophoneState("error", error);
      this.stopMicrophone({ notify: false });
      if (checkFailed) this.onMicrophoneState("needs-adjustment");
      throw error;
    }
  }

  async ensureMicrophoneStream() {
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone assessment needs a modern browser and an HTTPS connection.");
    }
    this.onMicrophoneState("requesting");
    this.stream = await navigator.mediaDevices.getUserMedia({
      // Echo cancellation helps keep accompaniment out of a monophonic voice
      // detector. Pitch shaping and automatic gain stay disabled so the check
      // can measure this device's real room-to-voice relationship.
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
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
        const rms = calculateRms(this.inputFrame);
        if (includePitch) {
          const sampleRate = (this.tone.getContext().rawContext || this.tone.getContext()).sampleRate;
          const [frequency, clarity] = this.pitchDetector.findPitch(this.inputFrame, sampleRate);
          frames.push({ rms, frequency, clarity });
        } else {
          frames.push(rms);
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

  async recheckMicrophone() {
    await this.tone.start();
    this.clearMicrophoneCalibration();
    await this.ensureMicrophoneStream();
    const calibration = await this.runMicrophoneCheck();
    this.stopMicrophone({ notify: false });
    this.onMicrophoneState(calibration?.signalGood ? "ready" : "needs-adjustment", calibration || {});
    return calibration;
  }

  samplePitch(now) {
    if (!this.analyser || !this.pitchDetector) return;
    if (now - this.lastPitchSampleAt >= AUDIO_CONFIG.sampleIntervalMs) {
      this.analyser.getFloatTimeDomainData(this.inputFrame);
      const rms = calculateRms(this.inputFrame);
      const gateOpen = this.noiseGate.accepts(rms);
      const sampleRate = (this.tone.getContext().rawContext || this.tone.getContext()).sampleRate;
      const [frequency, clarity] = gateOpen ? this.pitchDetector.findPitch(this.inputFrame, sampleRate) : [null, 0];
      const previousMidi = this.pitchTracker.acceptedHistory.at(-1)?.midi;
      const rawMidi = frequency > 0 ? frequencyToMidi(frequency) : null;
      const ambiguous = rawMidi !== null && previousMidi !== undefined && Math.abs(rawMidi - previousMidi) * 100 > 700;
      const corroborating = ambiguous ? detectAutocorrelationPitch(this.inputFrame, sampleRate) : { frequency: null };
      const scoreQuarter = this.currentQuarter;
      const rawFrame = {
        frequency,
        clarity,
        rms,
        gateOpen,
        noiseGate: this.noiseGateSettings.openThreshold,
        minimumClarity: this.noiseGateSettings.minimumClarity || AUDIO_CONFIG.minimumClarity,
        corroboratingFrequency: corroborating.frequency,
        capturedAt: performance.now(),
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
