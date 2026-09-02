import { REVIEW_CONFIG } from "./config.js?v=17";

function clampVolume(value, fallback) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(100, numeric)) : fallback;
}

export function reviewQuarterAtSeconds(seconds, bpm) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  return Number(bpm) > 0 ? safeSeconds * Number(bpm) / 60 : 0;
}

export function reviewDriftSeconds(transportQuarter, mediaSeconds, bpm) {
  if (!(Number(bpm) > 0)) return Infinity;
  return Math.abs((Number(transportQuarter) || 0) - reviewQuarterAtSeconds(mediaSeconds, bpm)) * 60 / Number(bpm);
}

export function createTakeMetadata({
  tempoPercent,
  bpm,
  octaveShift,
  enabledPartIds,
  guideEnabled,
  durationSeconds,
  vocalPartId,
} = {}) {
  return Object.freeze({
    tempoPercent: Number(tempoPercent) || 100,
    bpm: Number(bpm) || 120,
    octaveShift: Number(octaveShift) || 0,
    enabledPartIds: Object.freeze([...(enabledPartIds || [])]),
    guideEnabled: Boolean(guideEnabled),
    durationSeconds: Math.max(0, Number(durationSeconds) || 0),
    vocalPartId: vocalPartId == null ? null : String(vocalPartId),
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
