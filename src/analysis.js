import { PITCH_THRESHOLDS } from "./config.js";

function mean(values) {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function findSettleTime(samples, note) {
  if (!samples.length) return null;
  const windowSize = 5;
  for (let index = 0; index <= samples.length - windowSize; index += 1) {
    const window = samples.slice(index, index + windowSize);
    const inZone = window.filter((sample) => Math.abs(sample.cents) <= PITCH_THRESHOLDS.green).length;
    if (inZone >= 4) return Math.max(0, samples[index].scoreSeconds - note.onsetTimeAdjusted);
  }
  return null;
}

export function analysePerformance(timeline, samples, bpm) {
  const secondsPerQuarter = 60 / bpm;
  return timeline.map((note) => {
    const onset = note.onsetQuarters * secondsPerQuarter;
    const duration = note.durationQuarters * secondsPerQuarter;
    const end = onset + duration;
    const noteWithAdjustedTime = { ...note, onsetTimeAdjusted: onset };
    const usable = samples.filter((sample) => sample.targetId === note.id && sample.scoreSeconds >= onset && sample.scoreSeconds < end);
    if (!usable.length) return { note, sampleCount: 0, averageError: null, initialError: null, settleTime: null, sustainedError: null, inZonePercent: null };
    const initialWindowEnd = onset + Math.min(0.35, duration * 0.25);
    const sustainWindowStart = onset + Math.min(0.45, duration * 0.3);
    const initialSamples = usable.filter((sample) => sample.scoreSeconds <= initialWindowEnd);
    const sustainedSamples = usable.filter((sample) => sample.scoreSeconds >= sustainWindowStart);
    return {
      note,
      sampleCount: usable.length,
      averageError: mean(usable.map((sample) => sample.cents)),
      initialError: mean((initialSamples.length ? initialSamples : usable.slice(0, 3)).map((sample) => sample.cents)),
      settleTime: findSettleTime(usable, noteWithAdjustedTime),
      sustainedError: mean((sustainedSamples.length ? sustainedSamples : usable).map((sample) => sample.cents)),
      inZonePercent: usable.filter((sample) => Math.abs(sample.cents) <= PITCH_THRESHOLDS.green).length / usable.length * 100,
    };
  });
}

export function performanceSummary(results) {
  const assessed = results.filter((result) => result.sampleCount > 0);
  if (!assessed.length) return "No target notes received enough clear microphone samples to analyse.";
  const inZone = mean(assessed.map((result) => result.inZonePercent));
  const settled = assessed.filter((result) => result.settleTime !== null).length;
  return `${assessed.length} notes analysed · ${Math.round(inZone)}% of usable samples were within ±${PITCH_THRESHOLDS.green} cents · ${settled} notes settled into the centre.`;
}
