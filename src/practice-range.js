const EPSILON = 1e-7;

export function measureBoundaries(part) {
  const starts = part?.measureStarts || [];
  return starts.map((measure, index) => ({
    measureNumber: Number(measure.measureNumber),
    startQuarter: Number(measure.onsetQuarters) || 0,
    endQuarter: Number(starts[index + 1]?.onsetQuarters ?? part?.durationQuarters) || 0,
    timeSignature: measure.timeSignature || null,
  })).filter((measure) => Number.isFinite(measure.measureNumber) && measure.endQuarter - measure.startQuarter > EPSILON);
}

export function measureBoundary(part, measureNumber) {
  return measureBoundaries(part).find((measure) => measure.measureNumber === Number(measureNumber)) || null;
}

export function practiceLimits(part) {
  const measures = measureBoundaries(part);
  return {
    measures,
    firstMeasure: measures[0]?.measureNumber ?? 1,
    lastMeasure: measures.at(-1)?.measureNumber ?? 1,
  };
}

export function validateSection(part, startMeasure, endMeasure) {
  const { measures, firstMeasure, lastMeasure } = practiceLimits(part);
  const start = Number(startMeasure);
  const end = Number(endMeasure);
  if (!Number.isInteger(start) || !Number.isInteger(end)) {
    return { valid: false, message: "Enter whole bar numbers for the section." };
  }
  if (start < firstMeasure || start > lastMeasure || !measures.some((measure) => measure.measureNumber === start)) {
    return { valid: false, message: `From bar must be an existing bar from ${firstMeasure} to ${lastMeasure}.` };
  }
  if (end < firstMeasure || end > lastMeasure || !measures.some((measure) => measure.measureNumber === end)) {
    return { valid: false, message: `To bar must be an existing bar from ${firstMeasure} to ${lastMeasure}.` };
  }
  if (end < start) return { valid: false, message: "To bar must be the same as or later than From bar." };
  return { valid: true, startMeasure: start, endMeasure: end, message: "" };
}

export function resolvePracticeRange(part, {
  sectionStartMeasure = null,
  sectionEndMeasure = null,
  startMeasure = null,
  fallbackTimeSignature = { beats: 4, beatType: 4 },
} = {}) {
  const { measures, firstMeasure, lastMeasure } = practiceLimits(part);
  if (!measures.length) {
    return {
      firstMeasure,
      lastMeasure,
      sectionStartMeasure: firstMeasure,
      sectionEndMeasure: lastMeasure,
      startMeasure: firstMeasure,
      endMeasure: lastMeasure,
      startQuarter: 0,
      endQuarter: Math.max(0, Number(part?.durationQuarters) || 0),
      timeSignature: fallbackTimeSignature,
      wholePiece: true,
    };
  }

  const sectionValidation = sectionStartMeasure === null || sectionEndMeasure === null
    ? null
    : validateSection(part, sectionStartMeasure, sectionEndMeasure);
  const wholePiece = !sectionValidation?.valid;
  const resolvedSectionStart = wholePiece ? firstMeasure : sectionValidation.startMeasure;
  const resolvedSectionEnd = wholePiece ? lastMeasure : sectionValidation.endMeasure;
  const startCandidate = Number(startMeasure);
  const startBoundary = measures.find((measure) => measure.measureNumber === startCandidate
    && measure.measureNumber >= resolvedSectionStart
    && measure.measureNumber <= resolvedSectionEnd)
    || measures.find((measure) => measure.measureNumber === resolvedSectionStart);
  const endBoundary = measures.find((measure) => measure.measureNumber === resolvedSectionEnd) || measures.at(-1);

  return {
    firstMeasure,
    lastMeasure,
    sectionStartMeasure: resolvedSectionStart,
    sectionEndMeasure: resolvedSectionEnd,
    startMeasure: startBoundary.measureNumber,
    endMeasure: endBoundary.measureNumber,
    startQuarter: startBoundary.startQuarter,
    endQuarter: endBoundary.endQuarter,
    timeSignature: startBoundary.timeSignature || fallbackTimeSignature,
    wholePiece,
  };
}

export function firstNoteAtOrAfter(timeline, startQuarter) {
  return (timeline || []).find((note) => note.onsetQuarters + EPSILON >= startQuarter) || null;
}

export function clipTimelineToRange(timeline, startQuarter, endQuarter, bpm = 120) {
  const secondsPerQuarter = 60 / (Number(bpm) > 0 ? Number(bpm) : 120);
  return (timeline || []).flatMap((note) => {
    const noteStart = Number(note.onsetQuarters) || 0;
    const noteEnd = noteStart + (Number(note.durationQuarters) || 0);
    const clippedStart = Math.max(noteStart, startQuarter);
    const clippedEnd = Math.min(noteEnd, endQuarter);
    if (clippedEnd - clippedStart <= EPSILON) return [];
    return [{
      ...note,
      onsetQuarters: clippedStart,
      durationQuarters: clippedEnd - clippedStart,
      onsetTime: clippedStart * secondsPerQuarter,
      durationSeconds: (clippedEnd - clippedStart) * secondsPerQuarter,
      clippedAtRangeStart: noteStart < startQuarter,
      clippedAtRangeEnd: noteEnd > endQuarter,
    }];
  });
}

export function sampleWithinRange(sample, startQuarter, endQuarter) {
  const quarter = Number(sample?.scoreQuarter);
  return Number.isFinite(quarter) && quarter >= startQuarter - EPSILON && quarter < endQuarter - EPSILON;
}

export function playbackWindow(note, resumeQuarter, endQuarter, ticksPerQuarter = 192) {
  const tick = 1 / Math.max(1, Number(ticksPerQuarter) || 192);
  const noteStart = Number(note?.onsetQuarters) || 0;
  const noteDuration = Math.max(0, Number(note?.durationQuarters) || 0);
  const noteEnd = noteStart + noteDuration;
  if (noteEnd <= resumeQuarter || noteStart >= endQuarter) return null;
  const resumesSustain = noteStart < resumeQuarter;
  const scheduledOnset = resumesSustain ? resumeQuarter + tick : noteStart;
  if (scheduledOnset >= endQuarter) return null;
  const audibleEnd = Math.min(noteEnd, endQuarter);
  const durationQuarters = resumesSustain
    ? Math.max(tick, audibleEnd - scheduledOnset)
    : Math.max(tick, Math.min(noteDuration * 0.92, audibleEnd - scheduledOnset));
  return { scheduledOnset, durationQuarters, resumesSustain };
}

export function assessmentRangeLabel(range) {
  return `bars ${range.startMeasure}–${range.endMeasure}`;
}
