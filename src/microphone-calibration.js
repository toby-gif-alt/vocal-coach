import {
  AUDIO_CONFIG,
  DEFAULT_MICROPHONE_SENSITIVITY,
  MICROPHONE_CALIBRATION,
  MICROPHONE_SENSITIVITY,
} from "./config.js?v=20";
import { estimateAmbientRms, microphoneSensitivityConfig } from "./noise-gate.js?v=20";

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction)));
  return sorted[index];
}

function median(values) {
  return percentile(values, 0.5);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function centsFrom(frequency, reference) {
  return 1200 * Math.log2(frequency / reference);
}

export function deriveMicrophoneCalibration({ ambientRmsValues = [], sungFrames = [] } = {}) {
  const ambientRms = estimateAmbientRms(ambientRmsValues.filter(Number.isFinite));
  const candidateFrames = sungFrames.filter((frame) => (
    Number.isFinite(frame.rms)
    && Number.isFinite(frame.clarity)
    && Number.isFinite(frame.frequency)
    && frame.frequency >= AUDIO_CONFIG.minimumFrequency
    && frame.frequency <= AUDIO_CONFIG.maximumFrequency
    && frame.clarity >= AUDIO_CONFIG.calibrationCandidateClarity
  ));
  const sungRmsValues = candidateFrames.map((frame) => frame.rms);
  const clarityValues = candidateFrames.map((frame) => frame.clarity);
  const sungRmsLow = percentile(sungRmsValues, AUDIO_CONFIG.sungRmsPercentile) || 0;
  const sungRmsMedian = median(sungRmsValues) || 0;
  const midpoint = Math.max(1, Math.floor(candidateFrames.length / 2));
  const normalRms = median(candidateFrames.slice(0, midpoint).map((frame) => frame.rms)) || sungRmsMedian;
  const louderRms = percentile(candidateFrames.slice(midpoint).map((frame) => frame.rms), 0.65) || sungRmsMedian;
  const clarityLow = percentile(clarityValues, AUDIO_CONFIG.sungClarityPercentile);
  const clarityMedian = median(clarityValues) || 0;
  const stableFrequency = median(candidateFrames.map((frame) => frame.frequency));
  const pitchSpreadCents = stableFrequency
    ? median(candidateFrames.map((frame) => Math.abs(centsFrom(frame.frequency, stableFrequency))))
    : null;

  const noiseDrivenGate = Math.max(AUDIO_CONFIG.absoluteRmsFloor, ambientRms * 2.05);
  const voiceSafeGate = Math.max(AUDIO_CONFIG.absoluteRmsFloor, sungRmsLow * 0.54);
  const openThreshold = Math.min(noiseDrivenGate, voiceSafeGate || noiseDrivenGate);
  const minimumClarity = clamp(
    (clarityLow ?? AUDIO_CONFIG.minimumClarity) - 0.07,
    AUDIO_CONFIG.minimumClarityFloor,
    AUDIO_CONFIG.maximumClarityCeiling,
  );
  const reliableFrames = sungFrames.filter((frame) => (
    Number.isFinite(frame.frequency)
    && frame.frequency >= AUDIO_CONFIG.minimumFrequency
    && frame.frequency <= AUDIO_CONFIG.maximumFrequency
    && frame.rms >= openThreshold
    && frame.clarity >= minimumClarity
  ));
  const reliablePitchRatio = sungFrames.length ? reliableFrames.length / sungFrames.length : 0;
  const signalToNoiseRatio = sungRmsMedian / Math.max(ambientRms, 0.0005);
  const clippedFrames = sungFrames.filter((frame) => frame.clipped).length;
  const clippedPercent = sungFrames.length ? clippedFrames / sungFrames.length * 100 : 0;
  const overloaded = clippedFrames >= 4 && clippedPercent >= 4;
  const signalGood = !overloaded
    && sungFrames.length >= AUDIO_CONFIG.minimumCalibrationFrames
    && candidateFrames.length >= Math.ceil(AUDIO_CONFIG.minimumCalibrationFrames * 0.5)
    && reliablePitchRatio >= AUDIO_CONFIG.minimumReliablePitchRatio
    && sungRmsMedian >= AUDIO_CONFIG.absoluteRmsFloor * 1.35
    && signalToNoiseRatio >= AUDIO_CONFIG.minimumSignalToNoiseRatio
    && clarityMedian >= AUDIO_CONFIG.calibrationCandidateClarity
    && pitchSpreadCents !== null
    && pitchSpreadCents <= 95;
  const reacquireAfterMs = reliablePitchRatio < 0.58 ? 540 : reliablePitchRatio < 0.78 ? 480 : 400;

  return {
    version: MICROPHONE_CALIBRATION.version,
    calibratedAt: Date.now(),
    signalGood,
    ambientRms,
    sungRmsLow,
    sungRmsMedian,
    expectedNormalRms: normalRms,
    expectedLouderRms: Math.max(normalRms, louderRms),
    clarityLow: clarityLow ?? 0,
    clarityMedian,
    reliablePitchRatio,
    stableFrequency: stableFrequency || null,
    pitchSpreadCents,
    openThreshold,
    closeThreshold: openThreshold * MICROPHONE_SENSITIVITY.normal.closeRatio,
    minimumClarity,
    reacquireAfterMs,
    clippedFrames,
    clippedPercent,
    overloaded,
  };
}

export function applyMicrophoneSensitivity(calibration, level = DEFAULT_MICROPHONE_SENSITIVITY) {
  const sensitivity = microphoneSensitivityConfig(level);
  const baseOpen = Math.max(AUDIO_CONFIG.absoluteRmsFloor, Number(calibration?.openThreshold) || sensitivity.minimumRms);
  const openThreshold = Math.max(sensitivity.calibratedFloor, baseOpen * sensitivity.gateScale);
  const minimumClarity = clamp(
    (Number(calibration?.minimumClarity) || AUDIO_CONFIG.minimumClarity) + sensitivity.clarityOffset,
    AUDIO_CONFIG.minimumClarityFloor,
    AUDIO_CONFIG.maximumClarityCeiling,
  );
  return {
    ...calibration,
    ambientRms: Math.max(0, Number(calibration?.ambientRms) || 0),
    openThreshold,
    closeThreshold: openThreshold * sensitivity.closeRatio,
    minimumClarity,
    reacquireAfterMs: Math.round((Number(calibration?.reacquireAfterMs) || 460) * sensitivity.reacquireScale),
    level,
  };
}

export function normaliseSavedMicrophoneCalibration(value) {
  if (!value || value.version !== MICROPHONE_CALIBRATION.version || value.signalGood !== true) return null;
  const required = ["openThreshold", "closeThreshold", "minimumClarity", "reacquireAfterMs"];
  if (required.some((key) => !Number.isFinite(Number(value[key])))) return null;
  return {
    ...value,
    openThreshold: Math.max(AUDIO_CONFIG.absoluteRmsFloor, Number(value.openThreshold)),
    closeThreshold: Math.max(0, Number(value.closeThreshold)),
    minimumClarity: clamp(Number(value.minimumClarity), AUDIO_CONFIG.minimumClarityFloor, AUDIO_CONFIG.maximumClarityCeiling),
    reacquireAfterMs: clamp(Number(value.reacquireAfterMs), 320, 700),
  };
}
