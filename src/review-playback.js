import { REVIEW_CONFIG } from "./config.js?v=20";

function clampVolume(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : fallback;
}

export function reviewQuarterAtSeconds(seconds, bpm, startQuarter = 0, endQuarter = Infinity) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const offset = Math.max(0, Number(startQuarter) || 0);
  const quarter = Number(bpm) > 0 ? offset + safeSeconds * Number(bpm) / 60 : offset;
  return Number.isFinite(Number(endQuarter)) ? Math.min(quarter, Number(endQuarter)) : quarter;
}

export function reviewDriftSeconds(transportQuarter, mediaSeconds, bpm, startQuarter = 0, endQuarter = Infinity) {
  if (!(Number(bpm) > 0)) return Infinity;
  return Math.abs((Number(transportQuarter) || 0) - reviewQuarterAtSeconds(mediaSeconds, bpm, startQuarter, endQuarter)) * 60 / Number(bpm);
}

export function createTakeMetadata({
  tempoPercent,
  bpm,
  octaveShift,
  enabledPartIds,
  partVolumes,
  guideEnabled,
  mode,
  durationSeconds,
  vocalPartId,
  startMeasure,
  endMeasure,
  startQuarter,
  endQuarter,
} = {}) {
  return Object.freeze({
    tempoPercent: Number(tempoPercent) || 100,
    bpm: Number(bpm) || 120,
    octaveShift: Number(octaveShift) || 0,
    enabledPartIds: Object.freeze([...(enabledPartIds || [])]),
    partVolumes: Object.freeze(Object.fromEntries(Object.entries(partVolumes || {}).map(([id, value]) => [id, clampVolume(value, 70)]))),
    guideEnabled: Boolean(guideEnabled),
    mode: mode === "assisted" ? "assisted" : "assessment",
    durationSeconds: Math.max(0, Number(durationSeconds) || 0),
    vocalPartId: vocalPartId == null ? null : String(vocalPartId),
    startMeasure: Number.isFinite(Number(startMeasure)) ? Number(startMeasure) : null,
    endMeasure: Number.isFinite(Number(endMeasure)) ? Number(endMeasure) : null,
    startQuarter: Math.max(0, Number(startQuarter) || 0),
    endQuarter: Math.max(0, Number(endQuarter) || 0),
  });
}

export function reviewLayers(value = {}) {
  return {
    voice: value.voice !== false,
    accompaniment: value.accompaniment !== false,
    melody: value.melody === true,
  };
}

export function reviewVolumes(value = {}) {
  return {
    voice: clampVolume(value.voice, REVIEW_CONFIG.defaultVoiceVolume),
    accompaniment: clampVolume(value.accompaniment, REVIEW_CONFIG.defaultAccompanimentVolume),
    melody: clampVolume(value.melody, REVIEW_CONFIG.defaultMelodyVolume),
  };
}
