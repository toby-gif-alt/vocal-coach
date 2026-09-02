export const PITCH_THRESHOLDS = Object.freeze({
  green: 15,
  yellow: 30,
  orange: 45,
});

export const AUDIO_CONFIG = Object.freeze({
  // 4096 samples gives Pitchy enough low-frequency context for A3 and lower
  // while the sampling cadence below keeps interactive latency modest.
  analyserSize: 4096,
  minimumClarity: 0.78,
  minimumFrequency: 65,
  maximumFrequency: 1400,
  sampleIntervalMs: 46,
  ambientCalibrationDurationMs: 1000,
  sungCalibrationDurationMs: 2800,
  calibrationPercentile: 0.75,
  sungRmsPercentile: 0.25,
  sungClarityPercentile: 0.2,
  calibrationCandidateClarity: 0.56,
  minimumCalibrationFrames: 24,
  minimumReliablePitchRatio: 0.38,
  minimumSignalToNoiseRatio: 1.65,
  absoluteRmsFloor: 0.0035,
  minimumClarityFloor: 0.68,
  maximumClarityCeiling: 0.88,
});

export const PITCH_TRACKER_CONFIG = Object.freeze({
  historySize: 9,
  medianWindow: 3,
  maximumContinuityCents: 700,
  octaveMatchCents: 110,
  jumpClusterCents: 90,
  jumpConfirmationFrames: 2,
  octavePersistenceFrames: 7,
  reacquireAfterMs: 460,
});

export const PLAYBACK_CONFIG = Object.freeze({
  defaultGuideVolume: 92,
  defaultAccompanimentVolume: 72,
  guideTrimDb: -3,
  accompanimentTrimDb: -7,
  countInLeadSeconds: 0.06,
});

export const DEFAULT_COUNT_IN_BARS = 1;
export const DEFAULT_OCTAVE_SHIFT = 0;

export const SESSION_MODES = Object.freeze({
  practice: Object.freeze({ guide: true, microphone: false, label: "Practice" }),
  assisted: Object.freeze({ guide: true, microphone: true, label: "Assisted Assessment" }),
  assessment: Object.freeze({ guide: false, microphone: true, label: "Assessment" }),
});

export const DEFAULT_MICROPHONE_SENSITIVITY = "normal";

export const MICROPHONE_SENSITIVITY = Object.freeze({
  low: Object.freeze({ minimumRms: 0.018, noiseMultiplier: 3.2, calibratedFloor: 0.0045, gateScale: 1.3, clarityOffset: 0.03, closeRatio: 0.72, reacquireScale: 0.88 }),
  normal: Object.freeze({ minimumRms: 0.009, noiseMultiplier: 2.4, calibratedFloor: 0.0035, gateScale: 1, clarityOffset: 0, closeRatio: 0.66, reacquireScale: 1 }),
  high: Object.freeze({ minimumRms: 0.0045, noiseMultiplier: 1.8, calibratedFloor: 0.0024, gateScale: 0.74, clarityOffset: -0.04, closeRatio: 0.6, reacquireScale: 1.16 }),
});

export const MICROPHONE_CALIBRATION = Object.freeze({
  storageKey: "vocal-coach:microphone-calibration",
  version: 1,
});

export const DEBUG_CONFIG = Object.freeze({
  timingLogIntervalMs: 400,
});

export const SCORE_TRACE_CONFIG = Object.freeze({
  // OSMD's graphical boxes use tenths of an SVG pixel.
  osmdPixelsPerUnit: 10,
  centsToPixels: 0.07,
  maximumConnectedGapSeconds: 0.16,
  maximumBridgeCents: 85,
  minimumRegionWidth: 9,
});

export const NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

export function midiToFrequency(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function frequencyToMidi(frequency) {
  return 69 + 12 * Math.log2(frequency / 440);
}

export function midiToName(midi) {
  if (!Number.isFinite(midi)) return "—";
  const rounded = Math.round(midi);
  const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
  return `${name}${Math.floor(rounded / 12) - 1}`;
}

export function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

export function colourForCents(cents) {
  const error = Math.abs(cents);
  if (error <= PITCH_THRESHOLDS.green) return "#4ab982";
  if (error <= PITCH_THRESHOLDS.yellow) return "#d8c743";
  if (error <= PITCH_THRESHOLDS.orange) return "#ee8b3b";
  return "#df5f55";
}
