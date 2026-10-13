import { OCTAVE_SELECTION_CONFIG, frequencyToMidi } from "./config.js?v=20";

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

// Suggestions use reliable, uncorrected detector evidence, not visual interpolation.
// An octave harmonic or one missed note must not change the singing target.
export class OctaveMismatchDetector {
  constructor() { this.clear(); }
  clear() { this.dismissed = new Set(); this.reset(); }
  reset() { this.candidate = null; }
  dismiss(shift) { this.dismissed.add(shift); this.reset(); }
  observe({ sample, writtenMidi, currentShift = 0, noteId, phase }) {
    const sungMidi = sample?.filteredMidi;
    const corroboratingMidi = sample?.corroboratingFrequency > 0 ? frequencyToMidi(sample.corroboratingFrequency) : null;
    if (!['preparation', 'performance'].includes(phase) || sample?.status !== 'accepted'
      || sample.visualOnly || sample.octaveCorrection || sample.overloadActive
      || !Number.isFinite(sample.clarity) || sample.clarity < 0.82
      || !Number.isFinite(sungMidi) || !Number.isFinite(writtenMidi)
      || !Number.isFinite(corroboratingMidi) || Math.abs(corroboratingMidi - sungMidi) * 100 > 80
      || !Number.isFinite(sample.capturedAt)) { this.reset(); return null; }
    const match = closestOctaveCandidate(sungMidi, writtenMidi, OCTAVE_SELECTION_CONFIG.shifts.filter(shift=>shift!==currentShift));
    const shift = match.shift;
    if (Math.abs(match.cents) > 60 || !OCTAVE_SELECTION_CONFIG.shifts.includes(shift) || this.dismissed.has(shift)) { this.reset(); return null; }
    const now = sample.capturedAt;
    if (!this.candidate || this.candidate.shift !== shift || this.candidate.phase !== phase
      || now <= this.candidate.lastAt || now - this.candidate.lastAt > 1200 || now - this.candidate.startedAt > 6000) {
      this.candidate = { shift, phase, startedAt: now, lastAt: now, supportMs: 0, frames: 0, notes: new Map() };
    }
    const c = this.candidate;
    c.supportMs += Math.min(100, Math.max(0, now - c.lastAt)); c.lastAt = now; c.frames++;
    c.notes.set(noteId, (c.notes.get(noteId) || 0) + 1);
    const distinctNotes = [...c.notes.values()].filter(count => count >= 6).length;
    const enough = phase === 'preparation' ? c.supportMs >= 1600 : c.supportMs >= 1200 && distinctNotes >= 2;
    if (!enough || c.frames < 20) return null;
    return { shift, relativeShift: shift-currentShift, noteCount: distinctNotes };
  }
}
