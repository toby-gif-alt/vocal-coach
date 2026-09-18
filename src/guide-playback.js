export const GUIDE_VOICES = Object.freeze(["human", "synthetic-ah"]);
export const DEFAULT_GUIDE_VOICE = "human";
export const GUIDE_VOICE_STORAGE_KEY = "vocal-coach:guide-voice";

export function normaliseGuideVoice(value) {
  return GUIDE_VOICES.includes(value) ? value : DEFAULT_GUIDE_VOICE;
}

// MusicXML parsing already resolves written and transposing-instrument pitches
// into sounding MIDI. Guide playback must use that value directly: the singer's
// separately selected octave only changes microphone targets and assessment.
export function guideNoteRequest(note, { duration, time, velocity = 0.52 } = {}) {
  const midi = Number(note?.midi);
  if (!Number.isFinite(midi)) return null;
  return { midi, duration, time, velocity };
}
