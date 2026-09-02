import { LIVE_TUNING_CONFIG } from "./config.js?v=15";

export function tuningTargetAtQuarter(timeline, quarter, phase = "preparation") {
  const safeTimeline = Array.isArray(timeline) ? timeline : [];
  const current = safeTimeline.find((note) => (
    quarter >= note.onsetQuarters
    && quarter < note.onsetQuarters + note.durationQuarters
  ));

  if (phase === "performance" && current) return { note: current, kind: "current" };

  const upcoming = current || safeTimeline.find((note) => note.onsetQuarters >= quarter);
  if (!upcoming) return { note: null, kind: "rest" };
  return {
    note: upcoming,
    kind: phase === "performance" ? "next" : "starting",
  };
}

export function assessmentSampleEligible({ phase, targetKind }) {
  return phase === "performance" && targetKind === "current";
}

export function visualMidiForSample(sample) {
  if (!sample) return null;
  if (sample.octaveCorrection && Number.isFinite(sample.filteredMidi)) return sample.filteredMidi;
  if (Number.isFinite(sample.rawMidi)) return sample.rawMidi;
  return Number.isFinite(sample.filteredMidi) ? sample.filteredMidi : null;
}

export class LiveTuningFeedback {
  constructor({ dropoutGraceMs = LIVE_TUNING_CONFIG.dropoutGraceMs } = {}) {
    this.dropoutGraceMs = dropoutGraceMs;
    this.reset();
  }

  reset() {
    this.lastReliableAt = null;
    this.lastValue = null;
  }

  accept(value, capturedAt) {
    this.lastReliableAt = Number(capturedAt) || 0;
    this.lastValue = { ...value };
    return { status: "active", held: false, value: this.lastValue };
  }

  reject(capturedAt) {
    const now = Number(capturedAt) || 0;
    const withinGrace = this.lastValue
      && this.lastReliableAt !== null
      && now - this.lastReliableAt <= this.dropoutGraceMs;
    return {
      status: withinGrace ? "active" : "listening",
      held: Boolean(withinGrace),
      value: this.lastValue,
    };
  }
}
