export const GUIDE_VOICES = Object.freeze(["human", "synthetic-ah"]);
export const DEFAULT_GUIDE_VOICE = "human";
export const GUIDE_VOICE_STORAGE_KEY = "vocal-coach:guide-voice";

const MALE_PART_NAME = /\b(?:bass|baritone|tenor)(?:\s+(?:i{1,4}|[1-9]\d*|solo|section))?\b|\bmale\s+voice\b/i;
const FEMALE_PART_NAME = /\b(?:alto|contralto|soprano)(?:\s+(?:i{1,4}|[1-9]\d*|solo|section))?\b|\bmezzo(?:[-\s]+soprano)?\b|\bfemale\s+voice\b/i;

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

export function explicitVoiceBank(partName) {
  const name = String(partName || "").trim();
  if (FEMALE_PART_NAME.test(name)) return "female";
  if (MALE_PART_NAME.test(name)) return "male";
  return null;
}

function finiteMidis(values = []) {
  return values.map(Number).filter(Number.isFinite);
}

function manifestMidi(entry) {
  return Number(entry?.rootMidi ?? entry?.midi);
}

function median(values) {
  if (!values.length) return Infinity;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

export function voiceBankShiftCost(noteMidis, anchorMidis) {
  const notes = finiteMidis(noteMidis);
  const anchors = finiteMidis(anchorMidis);
  if (!notes.length || !anchors.length) return null;
  const shifts = notes.map((note) => Math.min(...anchors.map((anchor) => Math.abs(note - anchor))));
  return Object.freeze({
    median: median(shifts),
    average: shifts.reduce((sum, shift) => sum + shift, 0) / shifts.length,
    maximum: Math.max(...shifts),
  });
}

function compareCosts(left, right) {
  for (const property of ["median", "average", "maximum"]) {
    if (left[property] !== right[property]) return left[property] - right[property];
  }
  return 0;
}

export function chooseHumanVoiceBank(part, manifestEntries = []) {
  const namedBank = explicitVoiceBank(`${part?.name || ""} ${part?.abbreviation || ""}`);
  if (namedBank) return namedBank;

  const notes = finiteMidis((part?.vocalTimeline || part?.notes || []).map((note) => note?.midi));
  const banks = ["male", "female"].map((bank) => ({
    bank,
    anchors: finiteMidis(manifestEntries.filter((entry) => entry?.bank === bank).map(manifestMidi)),
  }));
  const scored = banks
    .map(({ bank, anchors }) => ({ bank, cost: voiceBankShiftCost(notes, anchors) }))
    .filter(({ cost }) => cost);
  if (scored.length === 1) return scored[0].bank;
  if (scored.length === 2) return compareCosts(scored[0].cost, scored[1].cost) <= 0 ? scored[0].bank : scored[1].bank;

  // The range heuristic is only a last resort when no generated sample
  // metadata exists. It does not transpose the requested score pitch.
  return median(notes) >= 60 ? "female" : "male";
}

export function samplePackForVoiceBank(manifestEntries = [], bank) {
  const definitions = {};
  manifestEntries
    .filter((entry) => entry?.bank === bank && Number.isFinite(manifestMidi(entry)) && entry?.file)
    .sort((left, right) => manifestMidi(left) - manifestMidi(right) || String(left.file).localeCompare(String(right.file)))
    .forEach((entry, index) => {
      const midi = manifestMidi(entry);
      definitions[`${entry.note || midi}-${index}`] = {
        url: entry.file,
        midi,
        loop: "adaptive",
      };
    });
  return Object.keys(definitions).length ? { ah: definitions } : {};
}
