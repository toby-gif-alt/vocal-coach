import { AUDIO_CONFIG } from "./config.js?v=20";

export function measureFrameAmplitude(frame, nearFullScaleThreshold = AUDIO_CONFIG.nearFullScaleThreshold) {
  if (!frame?.length) return { rms: 0, absolutePeak: 0, nearFullScalePercent: 0 };
  let sumSquares = 0;
  let absolutePeak = 0;
  let nearFullScaleSamples = 0;
  for (const sample of frame) {
    const absolute = Math.abs(sample);
    sumSquares += sample * sample;
    absolutePeak = Math.max(absolutePeak, absolute);
    if (absolute >= nearFullScaleThreshold) nearFullScaleSamples += 1;
  }
  return {
    rms: Math.sqrt(sumSquares / frame.length),
    absolutePeak,
    nearFullScalePercent: nearFullScaleSamples / frame.length * 100,
  };
}

export function isFrameClipped(amplitude, config = AUDIO_CONFIG) {
  return Number(amplitude?.absolutePeak) >= config.clippingPeakThreshold
    || Number(amplitude?.nearFullScalePercent) >= config.clippingNearFullScalePercent;
}

export class InputOverloadMonitor {
  constructor(config = {}) {
    this.config = { ...AUDIO_CONFIG, ...config };
    this.reset();
  }

  reset() {
    this.clippedSince = null;
    this.lastClippedAt = null;
    this.warningActive = false;
  }

  update(clipped, capturedAt) {
    const now = Number(capturedAt) || 0;
    if (clipped) {
      if (this.lastClippedAt === null || now - this.lastClippedAt > this.config.overloadWindowMs) {
        this.clippedSince = now;
      }
      this.lastClippedAt = now;
      if (now - this.clippedSince >= this.config.overloadMinimumDurationMs) this.warningActive = true;
    } else if (this.lastClippedAt !== null && now - this.lastClippedAt >= this.config.overloadRecoveryMs) {
      this.reset();
    }
    return { clipped: Boolean(clipped), overloadActive: this.warningActive };
  }
}
