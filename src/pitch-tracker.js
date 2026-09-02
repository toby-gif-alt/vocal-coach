import { AUDIO_CONFIG, PITCH_TRACKER_CONFIG, frequencyToMidi, midiToFrequency } from "./config.js?v=14";

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function centsBetween(a, b) {
  return Math.abs(a - b) * 100;
}

/**
 * A small, dependency-free autocorrelation detector used to corroborate a raw
 * Pitchy result when an octave/harmonic ambiguity appears. It is also useful
 * for repeatable synthetic-tone tests without browser audio hardware.
 */
export function detectAutocorrelationPitch(
  frame,
  sampleRate,
  { minimumFrequency = AUDIO_CONFIG.minimumFrequency, maximumFrequency = AUDIO_CONFIG.maximumFrequency } = {},
) {
  if (!frame?.length || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return { frequency: null, clarity: 0 };
  }

  let mean = 0;
  for (const sample of frame) mean += sample;
  mean /= frame.length;

  const minimumLag = Math.max(2, Math.floor(sampleRate / maximumFrequency));
  const maximumLag = Math.min(Math.floor(frame.length / 2), Math.ceil(sampleRate / minimumFrequency));
  const correlations = new Float64Array(maximumLag + 1);
  const peaks = [];

  for (let lag = minimumLag; lag <= maximumLag; lag += 1) {
    let product = 0;
    let energyA = 0;
    let energyB = 0;
    const limit = frame.length - lag;
    for (let index = 0; index < limit; index += 1) {
      const a = frame[index] - mean;
      const b = frame[index + lag] - mean;
      product += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    correlations[lag] = energyA > 0 && energyB > 0 ? product / Math.sqrt(energyA * energyB) : 0;
  }

  for (let lag = minimumLag + 1; lag < maximumLag; lag += 1) {
    if (correlations[lag] >= correlations[lag - 1] && correlations[lag] > correlations[lag + 1]) {
      peaks.push(lag);
    }
  }
  if (!peaks.length) return { frequency: null, clarity: 0 };

  const strongest = Math.max(...peaks.map((lag) => correlations[lag]));
  const selectedLag = peaks.find((lag) => correlations[lag] >= Math.max(0.55, strongest * 0.94));
  if (!selectedLag) return { frequency: null, clarity: Math.max(0, strongest) };

  const left = correlations[selectedLag - 1];
  const centre = correlations[selectedLag];
  const right = correlations[selectedLag + 1];
  const denominator = left - 2 * centre + right;
  const offset = denominator ? 0.5 * (left - right) / denominator : 0;
  const refinedLag = selectedLag + Math.max(-0.5, Math.min(0.5, offset));
  const frequency = sampleRate / refinedLag;
  return {
    frequency: frequency >= minimumFrequency && frequency <= maximumFrequency ? frequency : null,
    clarity: Math.max(0, Math.min(1, centre)),
  };
}

export class StablePitchTracker {
  constructor(config = {}) {
    this.config = { ...PITCH_TRACKER_CONFIG, minimumClarity: AUDIO_CONFIG.minimumClarity, ...config };
    this.reset();
  }

  configure(config = {}) {
    this.config = { ...this.config, ...config };
  }

  reset() {
    this.rawHistory = [];
    this.acceptedHistory = [];
    this.filterHistory = [];
    this.pendingJump = null;
    this.lastAcceptedAt = null;
  }

  unreliable(frame, reason, rawFrequency = null, rawMidi = null) {
    return {
      ...frame,
      status: "unreliable",
      reason,
      rawFrequency,
      rawMidi,
      filteredFrequency: null,
      filteredMidi: null,
      centsError: null,
      octaveCorrection: 0,
    };
  }

  updatePending(rawMidi) {
    if (this.pendingJump && centsBetween(this.pendingJump.midi, rawMidi) <= this.config.jumpClusterCents) {
      this.pendingJump.count += 1;
      this.pendingJump.midi = (this.pendingJump.midi * (this.pendingJump.count - 1) + rawMidi) / this.pendingJump.count;
    } else {
      this.pendingJump = { midi: rawMidi, count: 1 };
    }
    return this.pendingJump.count;
  }

  process(frame) {
    const rawFrequency = Number(frame.frequency);
    const rawMidi = rawFrequency > 0 ? frequencyToMidi(rawFrequency) : null;
    const targetMidi = Number.isFinite(frame.targetMidi) ? frame.targetMidi : null;

    if (!frame.gateOpen) return this.unreliable(frame, "below noise gate", rawFrequency || null, rawMidi);
    if (!Number.isFinite(rawFrequency) || rawFrequency < AUDIO_CONFIG.minimumFrequency || rawFrequency > AUDIO_CONFIG.maximumFrequency) {
      return this.unreliable(frame, "frequency out of range", rawFrequency || null, rawMidi);
    }
    const minimumClarity = Number.isFinite(frame.minimumClarity)
      ? frame.minimumClarity
      : this.config.minimumClarity;
    if (!Number.isFinite(frame.clarity) || frame.clarity < minimumClarity) {
      return this.unreliable(frame, "low clarity", rawFrequency, rawMidi);
    }

    this.rawHistory.push({ frequency: rawFrequency, midi: rawMidi, capturedAt: frame.capturedAt });
    if (this.rawHistory.length > this.config.historySize) this.rawHistory.shift();

    const capturedAt = Number(frame.capturedAt) || 0;
    const stale = this.lastAcceptedAt !== null && capturedAt - this.lastAcceptedAt > this.config.reacquireAfterMs;
    const recentAccepted = this.acceptedHistory.slice(-this.config.medianWindow).map((sample) => sample.midi);
    const referenceMidi = stale ? null : median(recentAccepted);
    let candidateMidi = rawMidi;
    let octaveCorrection = 0;

    if (referenceMidi !== null) {
      const rawDistance = centsBetween(rawMidi, referenceMidi);
      const octaveCandidates = [-12, 12]
        .map((shift) => ({ shift, midi: rawMidi + shift, distance: centsBetween(rawMidi + shift, referenceMidi) }))
        .sort((a, b) => a.distance - b.distance);
      const octaveCandidate = octaveCandidates[0];
      const octaveAmbiguity = rawDistance >= 900 && octaveCandidate.distance <= this.config.octaveMatchCents;

      if (octaveAmbiguity) {
        const pendingCount = this.updatePending(rawMidi);
        const corroboratingMidi = Number.isFinite(frame.corroboratingFrequency)
          ? frequencyToMidi(frame.corroboratingFrequency)
          : null;
        const corroboratesRaw = corroboratingMidi !== null
          && centsBetween(corroboratingMidi, rawMidi) + 160 < centsBetween(corroboratingMidi, octaveCandidate.midi);
        const corroboratesCorrection = corroboratingMidi !== null
          && centsBetween(corroboratingMidi, octaveCandidate.midi) + 160 < centsBetween(corroboratingMidi, rawMidi);
        const targetSupportsRaw = targetMidi !== null
          && centsBetween(targetMidi, rawMidi) + 500 < centsBetween(targetMidi, octaveCandidate.midi);
        const previousTargetMidi = this.acceptedHistory.at(-1)?.targetMidi;
        const scoreTargetChanged = targetMidi !== null
          && Number.isFinite(previousTargetMidi)
          && centsBetween(targetMidi, previousTargetMidi) >= 500;
        const persistentWrongPitch = pendingCount >= this.config.octavePersistenceFrames;

        if (corroboratesRaw || (targetSupportsRaw && (scoreTargetChanged || pendingCount >= this.config.jumpConfirmationFrames)) || (!corroboratesCorrection && persistentWrongPitch)) {
          candidateMidi = rawMidi;
          octaveCorrection = 0;
        } else {
          candidateMidi = octaveCandidate.midi;
          octaveCorrection = octaveCandidate.shift;
        }
      } else if (rawDistance > this.config.maximumContinuityCents) {
        const targetSupportsTransition = targetMidi !== null
          && centsBetween(targetMidi, rawMidi) <= 180
          && centsBetween(targetMidi, referenceMidi) >= 500;
        if (targetSupportsTransition) {
          this.pendingJump = null;
        } else {
          const pendingCount = this.updatePending(rawMidi);
          if (pendingCount < this.config.jumpConfirmationFrames) {
            return this.unreliable(frame, "isolated pitch jump", rawFrequency, rawMidi);
          }
        }
        this.filterHistory = [];
      } else {
        this.pendingJump = null;
      }
    } else {
      this.pendingJump = null;
      this.filterHistory = [];
    }

    const previousFiltered = this.filterHistory.at(-1);
    if (previousFiltered !== undefined && centsBetween(previousFiltered, candidateMidi) > this.config.maximumContinuityCents) {
      this.filterHistory = [];
    }
    this.filterHistory.push(candidateMidi);
    if (this.filterHistory.length > this.config.medianWindow) this.filterHistory.shift();
    const filteredMidi = median(this.filterHistory);
    const filteredFrequency = midiToFrequency(filteredMidi);
    const accepted = {
      ...frame,
      status: "accepted",
      reason: octaveCorrection ? "octave ambiguity resolved by continuity" : "stable pitch",
      rawFrequency,
      rawMidi,
      filteredFrequency,
      filteredMidi,
      centsError: targetMidi === null ? null : (filteredMidi - targetMidi) * 100,
      octaveCorrection,
    };
    this.acceptedHistory.push({ midi: filteredMidi, frequency: filteredFrequency, capturedAt, targetMidi });
    if (this.acceptedHistory.length > this.config.historySize) this.acceptedHistory.shift();
    this.lastAcceptedAt = capturedAt;
    return accepted;
  }
}
