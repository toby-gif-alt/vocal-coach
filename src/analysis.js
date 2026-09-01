import { PITCH_THRESHOLDS } from "./config.js";

function mean(values) {
  const usable = values.filter(Number.isFinite);
  if (!usable.length) return null;
  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function median(values) {
  const usable = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
}

function standardDeviation(values) {
  const centre = mean(values);
  if (centre === null || values.length < 3) return null;
  return Math.sqrt(mean(values.map((value) => (value - centre) ** 2)));
}

function clamp(value, minimum = 0, maximum = 100) {
  return Math.max(minimum, Math.min(maximum, value));
}

function findSettleTime(samples, note) {
  if (!samples.length) return null;
  const windowSize = Math.min(5, samples.length);
  if (windowSize < 3) return null;
  for (let index = 0; index <= samples.length - windowSize; index += 1) {
    const window = samples.slice(index, index + windowSize);
    const required = Math.ceil(window.length * 0.8);
    const inZone = window.filter((sample) => Math.abs(sample.cents) <= PITCH_THRESHOLDS.green).length;
    if (inZone >= required) return Math.max(0, samples[index].scoreSeconds - note.onsetTimeAdjusted);
  }
  return null;
}

function sampleCadence(samples) {
  const gaps = samples.slice(1)
    .map((sample, index) => sample.scoreSeconds - samples[index].scoreSeconds)
    .filter((gap) => gap > 0.012 && gap < 0.18);
  return clamp(median(gaps) ?? 0.05, 0.025, 0.08);
}

function voicedCoverage(samples, onset, end) {
  if (!samples.length || end <= onset) return 0;
  const cadence = sampleCadence(samples);
  const intervals = samples.map((sample) => [
    Math.max(onset, sample.scoreSeconds - cadence / 2),
    Math.min(end, sample.scoreSeconds + cadence / 2),
  ]).filter(([start, finish]) => finish > start).sort((a, b) => a[0] - b[0]);
  let covered = 0;
  let [start, finish] = intervals[0] || [0, 0];
  for (const [nextStart, nextFinish] of intervals.slice(1)) {
    if (nextStart <= finish + 0.002) finish = Math.max(finish, nextFinish);
    else {
      covered += finish - start;
      [start, finish] = [nextStart, nextFinish];
    }
  }
  covered += Math.max(0, finish - start);
  return clamp(covered / (end - onset) * 100);
}

function fragmentationCount(samples) {
  if (samples.length < 2) return 0;
  const breakAfter = Math.max(0.16, sampleCadence(samples) * 3.2);
  return samples.slice(1).filter((sample, index) => sample.scoreSeconds - samples[index].scoreSeconds > breakAfter).length;
}

function regressionDrift(samples) {
  if (samples.length < 3) return null;
  const firstTime = samples[0].scoreSeconds;
  const times = samples.map((sample) => sample.scoreSeconds - firstTime);
  const span = times.at(-1) - times[0];
  if (span < 0.18) return null;
  const xMean = mean(times);
  const yMean = mean(samples.map((sample) => sample.cents));
  const denominator = times.reduce((sum, time) => sum + (time - xMean) ** 2, 0);
  if (!denominator) return null;
  const slope = samples.reduce((sum, sample, index) => sum + (times[index] - xMean) * (sample.cents - yMean), 0) / denominator;
  return denominator ? slope * span : null;
}

export function analysePerformance(timeline, samples, bpm) {
  const secondsPerQuarter = 60 / bpm;
  return timeline.map((note) => {
    const onset = note.onsetQuarters * secondsPerQuarter;
    const duration = note.durationQuarters * secondsPerQuarter;
    const end = onset + duration;
    const noteWithAdjustedTime = { ...note, onsetTimeAdjusted: onset };
    const usable = samples
      .filter((sample) => sample.targetId === note.id && sample.scoreSeconds >= onset && sample.scoreSeconds < end)
      .sort((a, b) => a.scoreSeconds - b.scoreSeconds);
    const empty = {
      note,
      sampleCount: 0,
      averageError: null,
      initialError: null,
      settleTime: null,
      sustainedError: null,
      inZonePercent: null,
      pitchStability: null,
      voicedCoveragePercent: 0,
      fragmentationCount: 0,
      directionalDriftCents: null,
      startedOutsideMovedToward: false,
      startedAccurateDriftedAway: false,
    };
    if (!usable.length) return empty;

    const initialWindowEnd = onset + Math.min(0.35, duration * 0.25);
    const sustainWindowStart = onset + Math.min(0.45, duration * 0.3);
    const initialSamples = usable.filter((sample) => sample.scoreSeconds <= initialWindowEnd);
    const sustainedSamples = usable.filter((sample) => sample.scoreSeconds >= sustainWindowStart);
    const sustain = sustainedSamples.length ? sustainedSamples : usable;
    const initialError = mean((initialSamples.length ? initialSamples : usable.slice(0, 3)).map((sample) => sample.cents));
    const sustainedError = mean(sustain.map((sample) => sample.cents));
    const directionalDriftCents = regressionDrift(sustain);
    const startedOutside = Math.abs(initialError) > PITCH_THRESHOLDS.green;
    const startedAccurate = Math.abs(initialError) <= PITCH_THRESHOLDS.green;
    return {
      note,
      sampleCount: usable.length,
      averageError: mean(usable.map((sample) => sample.cents)),
      initialError,
      settleTime: findSettleTime(usable, noteWithAdjustedTime),
      sustainedError,
      inZonePercent: usable.filter((sample) => Math.abs(sample.cents) <= PITCH_THRESHOLDS.green).length / usable.length * 100,
      pitchStability: standardDeviation(sustain.map((sample) => sample.cents)),
      voicedCoveragePercent: voicedCoverage(usable, onset, end),
      fragmentationCount: fragmentationCount(usable),
      directionalDriftCents,
      startedOutsideMovedToward: startedOutside && Math.abs(sustainedError) <= Math.max(PITCH_THRESHOLDS.green, Math.abs(initialError) - 8),
      startedAccurateDriftedAway: startedAccurate && Math.abs(sustainedError) > PITCH_THRESHOLDS.green + 7,
    };
  });
}

function accuracyFromError(error, forgiving = false) {
  if (!Number.isFinite(error)) return 0;
  const freeZone = forgiving ? 10 : 6;
  const range = forgiving ? 82 : 70;
  return clamp(100 - Math.max(0, Math.abs(error) - freeZone) / range * 100);
}

export function summarisePerformance(results) {
  const assessed = results.filter((result) => result.sampleCount > 0);
  if (!assessed.length) {
    return {
      level: "early-foundation",
      label: "Early foundation",
      score: 0,
      assessedCount: 0,
      totalCount: results.length,
      dimensions: { pitchAccuracy: 0, onsetAccuracy: 0, sustainAccuracy: 0, pitchStability: 0, voicedCoverage: 0 },
    };
  }
  const dimensions = {
    pitchAccuracy: mean(assessed.map((result) => result.inZonePercent)) ?? 0,
    onsetAccuracy: mean(assessed.map((result) => accuracyFromError(result.initialError))) ?? 0,
    sustainAccuracy: mean(assessed.map((result) => accuracyFromError(result.sustainedError, true))) ?? 0,
    pitchStability: mean(assessed.map((result) => Number.isFinite(result.pitchStability) ? clamp(100 - Math.max(0, result.pitchStability - 5) / 40 * 100) : 55)) ?? 0,
    voicedCoverage: mean(results.map((result) => result.voicedCoveragePercent ?? 0)) ?? 0,
  };
  const score = dimensions.pitchAccuracy * 0.30
    + dimensions.onsetAccuracy * 0.18
    + dimensions.sustainAccuracy * 0.20
    + dimensions.pitchStability * 0.13
    + dimensions.voicedCoverage * 0.19;
  const [level, label] = score >= 88 ? ["excellent", "Excellent"]
    : score >= 72 ? ["strong", "Strong"]
      : score >= 52 ? ["developing", "Developing"]
        : score >= 32 ? ["foundation", "Foundation"]
          : ["early-foundation", "Early foundation"];
  return { level, label, score, assessedCount: assessed.length, totalCount: results.length, dimensions };
}

export function performanceSummary(results) {
  const profile = summarisePerformance(results);
  if (!profile.assessedCount) return "No target notes received enough clear microphone samples to analyse.";
  const settled = results.filter((result) => result.sampleCount > 0 && result.settleTime !== null).length;
  return `${profile.assessedCount} of ${profile.totalCount} notes analysed · ${Math.round(profile.dimensions.pitchAccuracy)}% of usable samples within ±${PITCH_THRESHOLDS.green} cents · ${Math.round(profile.dimensions.voicedCoverage)}% voiced coverage · ${settled} notes settled into the centre.`;
}
