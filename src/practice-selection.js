import { validateSection, practiceLimits } from "./practice-range.js?v=27";

export function draftFromRange(range, measure = null) {
  const from = measure ?? range.sectionStartMeasure;
  return { from, to: measure ?? range.sectionEndMeasure, start: measure ?? range.startMeasure };
}
export function dragRange(draft, anchor, measure) {
  const from = Math.min(anchor, measure), to = Math.max(anchor, measure);
  return { ...draft, from, to, start: from };
}
export function validateDraft(part, draft) {
  const section = validateSection(part, draft.from, draft.to);
  if (!section.valid) return section;
  const start = Number(draft.start);
  if (!Number.isInteger(start) || start < section.startMeasure || start > section.endMeasure
    || !practiceLimits(part).measures.some(m => m.measureNumber === start)) {
    return { valid: false, message: "Start from must be an existing bar inside this section." };
  }
  return { ...section, startMeasurePosition: start };
}
export function measureAtPoint(geometry, pageIndex, x, y) {
  return geometry.find(r => r.pageIndex === pageIndex && x >= r.xStart && x <= r.xEnd
    && y >= r.yStart && y <= r.yStart + r.height)?.measureNumber ?? null;
}

// Snap clicks to the closest rendered musical onset in the clicked bar.
// Use the bar start when it contains only rests or has no mapped vocal notes.
export function scorePositionAtPoint(measures, notes, pageIndex, x, y) {
  const bar = measures.find(r => r.pageIndex === pageIndex && x >= r.xStart && x <= r.xEnd
    && y >= r.yStart && y <= r.yStart + r.height);
  if (!bar) return null;
  const candidates = [...notes.values()].flat().filter(r => r.pageIndex === pageIndex
    && r.qStart >= bar.qStart && r.qStart < bar.qEnd);
  const nearest = candidates.sort((a,b) => Math.abs(a.xStart-x)-Math.abs(b.xStart-x))[0];
  return { measure: bar.measureNumber, quarter: nearest?.qStart ?? bar.qStart };
}
