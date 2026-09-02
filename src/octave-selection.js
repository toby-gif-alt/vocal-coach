import { OCTAVE_SELECTION_CONFIG, frequencyToMidi } from "./config.js?v=16";

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function closestOctaveCandidate(sungMidi, writtenMidi, shifts = OCTAVE_SELECTION_CONFIG.shifts) {
  if (!Number.isFinite(sungMidi) || !Number.isFinite(writtenMidi)) return null;
  return shifts
    .map((shift) => ({ shift, midi: writtenMidi + shift, cents: (sungMidi - writtenMidi - shift) * 100 }))
    .sort((a, b) => Math.abs(a.cents) - Math.abs(b.cents))[0];
}

export function suggestOctaveFromComfortablePitch(timeline, comfortableFrequency) {
  const comfortableMidi = Number(comfortableFrequency) > 0
    ? frequencyToMidi(comfortableFrequency)
    : null;
  const writtenMedian = median((timeline || []).map((note) => note.midi).filter(Number.isFinite));
  if (!Number.isFinite(comfortableMidi) || !Number.isFinite(writtenMedian)) return null;
  return OCTAVE_SELECTION_CONFIG.shifts
    .map((shift) => ({
      shift,
      medianMidi: writtenMedian + shift,
      distanceSemitones: Math.abs(writtenMedian + shift - comfortableMidi),
    }))
    .sort((a, b) => a.distanceSemitones - b.distanceSemitones)[0];
}

export class AutomaticOctaveSelector {
  constructor(config = {}) {
    this.config = { ...OCTAVE_SELECTION_CONFIG, ...config };
    this.reset();
  }

  reset() {
    this.candidate = null;
    this.confirmedShift = null;
  }

  observe({ sungMidi, writtenMidi, capturedAt }) {
    const match = closestOctaveCandidate(sungMidi, writtenMidi, this.config.shifts);
    const now = Number(capturedAt) || 0;
    if (!match || Math.abs(match.cents) > this.config.candidateToleranceCents) {
      this.candidate = null;
      return null;
    }
    const continues = this.candidate
      && this.candidate.shift === match.shift
      && now - this.candidate.lastAt <= this.config.maximumFrameGapMs;
    if (continues) {
      this.candidate.lastAt = now;
      this.candidate.frames += 1;
    } else {
      this.candidate = { shift: match.shift, startedAt: now, lastAt: now, frames: 1 };
    }
    const stableDurationMs = this.candidate.lastAt - this.candidate.startedAt;
    if (stableDurationMs < this.config.stableDurationMs || this.candidate.frames < 3) return null;
    if (this.confirmedShift === match.shift) return null;
    this.confirmedShift = match.shift;
    return {
      confirmed: true,
      shift: match.shift,
      soundingMidi: writtenMidi + match.shift,
      stableDurationMs,
    };
  }
}
