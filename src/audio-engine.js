import { PitchDetector } from "https://cdn.jsdelivr.net/npm/pitchy@4.1.0/+esm";
import {
  AUDIO_CONFIG,
  DEFAULT_MICROPHONE_SENSITIVITY,
  MICROPHONE_SENSITIVITY,
  PLAYBACK_CONFIG,
  frequencyToMidi,
  midiToFrequency,
} from "./config.js";
import { calculateRms, deriveNoiseGate, estimateAmbientRms, RmsNoiseGate } from "./noise-gate.js";
import { detectAutocorrelationPitch, StablePitchTracker } from "./pitch-tracker.js";
import { countInPattern, quartersToTransportTicks, transportTicksToQuarters } from "./timing.js";

export class AudioEngine {
  constructor({ onPitchSample, onRawPitchSample, onPitchDiagnostic, onMicrophoneState, onCountIn, onPlaybackEnd } = {}) {
    this.onPitchSample = onPitchSample || (() => {});
    this.onRawPitchSample = onRawPitchSample || (() => {});
    this.onPitchDiagnostic = onPitchDiagnostic || (() => {});
    this.onMicrophoneState = onMicrophoneState || (() => {});
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
    this.noiseGateSettings = deriveNoiseGate(0, this.microphoneSensitivity);
    this.noiseGate = new RmsNoiseGate(this.noiseGateSettings);
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
    this.noiseGateSettings = deriveNoiseGate(this.noiseGateSettings.ambientRms, level);
    this.noiseGate.configure(this.noiseGateSettings);
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
    if (microphone) this.stopMicrophone();
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
    if (this.stream) return;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Microphone assessment needs a modern browser and an HTTPS connection.");
    }
    this.onMicrophoneState("requesting");
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        // Browser echo cancellation is the first line of defence against the
        // guide/accompaniment being re-captured through speakers. Pitch-shaping
        // effects stay disabled so the monophonic tracker still receives an
        // otherwise unprocessed local signal. Headphones remain recommended.
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
      this.onMicrophoneState("calibrating", { durationMs: AUDIO_CONFIG.calibrationDurationMs });
      const calibrated = await this.calibrateMicrophone();
      if (!calibrated || !this.stream) {
        const error = new Error("Microphone calibration was cancelled.");
        error.name = "AbortError";
        throw error;
      }
      this.onMicrophoneState("active", this.noiseGateSettings);
    } catch (error) {
      if (error.name !== "AbortError") this.onMicrophoneState("error", error);
      this.stopMicrophone();
      throw error;
    }
  }

  calibrateMicrophone() {
    const frameRmsValues = [];
    const startedAt = performance.now();
    return new Promise((resolve) => {
      this.calibrationResolve = resolve;
      const finish = (completed) => {
        cancelAnimationFrame(this.calibrationFrame);
        this.calibrationFrame = null;
        this.calibrationResolve = null;
        if (completed) {
          const ambientRms = estimateAmbientRms(frameRmsValues);
          this.noiseGateSettings = deriveNoiseGate(ambientRms, this.microphoneSensitivity);
          this.noiseGate.configure(this.noiseGateSettings);
        }
        resolve(completed);
      };
      const collect = (now) => {
        if (!this.analyser || !this.inputFrame) {
          finish(false);
          return;
        }
        this.analyser.getFloatTimeDomainData(this.inputFrame);
        frameRmsValues.push(calculateRms(this.inputFrame));
        if (now - startedAt >= AUDIO_CONFIG.calibrationDurationMs) {
          finish(true);
          return;
        }
        this.calibrationFrame = requestAnimationFrame(collect);
      };
      this.calibrationFrame = requestAnimationFrame(collect);
    });
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

  stopMicrophone() {
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
    this.onMicrophoneState("idle");
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
    this.disposeSynths();
  }
}
