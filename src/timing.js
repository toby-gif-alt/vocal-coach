export const QUARTERS_PER_WHOLE_NOTE = 4;

/**
 * OSMD Fraction.RealValue timestamps are whole-note fractions: 0.25 is one
 * quarter note. Tone.Transport is tracked in quarter notes, so this conversion
 * is the only bridge between the two clocks.
 */
export function quartersToOsmdTimestamp(quarters) {
  return quarters / QUARTERS_PER_WHOLE_NOTE;
}

export function osmdTimestampToQuarters(timestamp) {
  return timestamp * QUARTERS_PER_WHOLE_NOTE;
}

export function transportTicksToQuarters(ticks, ppq) {
  return ppq > 0 ? ticks / ppq : 0;
}

export function quartersToTransportTicks(quarters, ppq) {
  return Math.round(quarters * ppq);
}

export function quartersToSeconds(quarters, bpm) {
  return bpm > 0 ? quarters * 60 / bpm : 0;
}

export function cursorIndexAtTimestamp(timeline, targetTimestamp, startIndex = 0, epsilon = 0.00025) {
  let index = Math.max(0, startIndex);
  while (index + 1 < timeline.length && timeline[index + 1] <= targetTimestamp + epsilon) index += 1;
  return index;
}

export function createMeasureCursor() {
  return { cursor: 0, furthest: 0, previousOnset: 0 };
}

/**
 * Applies MusicXML's sequential timing operations inside one measure.
 * Chords share the preceding note onset, backup rewinds for another voice or
 * staff, and forward advances through an explicitly notated gap.
 */
export function applyMeasureTimingEvent(state, event) {
  const duration = Math.max(0, Number(event.durationQuarters) || 0);
  if (event.type === "backup") {
    state.cursor = Math.max(0, state.cursor - duration);
    return state.cursor;
  }
  if (event.type === "forward") {
    state.cursor += duration;
    state.furthest = Math.max(state.furthest, state.cursor);
    return state.cursor;
  }

  const onset = event.isChord ? state.previousOnset : state.cursor;
  if (!event.isChord) {
    state.previousOnset = state.cursor;
    state.cursor += duration;
    state.furthest = Math.max(state.furthest, state.cursor);
  }
  return onset;
}

export function measureDurationQuarters(state) {
  return state.furthest;
}
