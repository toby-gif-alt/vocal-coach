import {
  AUDIO_CONFIG,
  DEFAULT_MICROPHONE_SENSITIVITY,
  MICROPHONE_SENSITIVITY,
} from "./config.js";

export function calculateRms(frame) {
  if (!frame?.length) return 0;
  let sumSquares = 0;
  for (const sample of frame) sumSquares += sample * sample;
  return Math.sqrt(sumSquares / frame.length);
}

export function estimateAmbientRms(frameRmsValues) {
  if (!frameRmsValues.length) return 0;
  const sorted = [...frameRmsValues].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.floor((sorted.length - 1) * AUDIO_CONFIG.calibrationPercentile),
  );
  return sorted[index];
}

export function microphoneSensitivityConfig(level) {
  return MICROPHONE_SENSITIVITY[level] || MICROPHONE_SENSITIVITY[DEFAULT_MICROPHONE_SENSITIVITY];
}

export function deriveNoiseGate(ambientRms, level = DEFAULT_MICROPHONE_SENSITIVITY) {
  const sensitivity = microphoneSensitivityConfig(level);
  const openThreshold = Math.max(
    sensitivity.minimumRms,
    Math.max(0, ambientRms) * sensitivity.noiseMultiplier,
  );
  return {
    ambientRms: Math.max(0, ambientRms),
    openThreshold,
    closeThreshold: openThreshold * sensitivity.closeRatio,
    level,
  };
}

export function isPitchFrameUsable({ gateOpen, clarity, frequency }) {
  return Boolean(gateOpen)
    && clarity >= AUDIO_CONFIG.minimumClarity
    && frequency >= AUDIO_CONFIG.minimumFrequency
    && frequency <= AUDIO_CONFIG.maximumFrequency;
}

export class RmsNoiseGate {
  constructor(settings = deriveNoiseGate(0)) {
    this.configure(settings);
  }

  configure(settings) {
    this.openThreshold = settings.openThreshold;
    this.closeThreshold = settings.closeThreshold;
    this.isOpen = false;
  }

  accepts(rms) {
    if (this.isOpen) {
      if (rms < this.closeThreshold) this.isOpen = false;
    } else if (rms >= this.openThreshold) {
      this.isOpen = true;
    }
    return this.isOpen;
  }
}
