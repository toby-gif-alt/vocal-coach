import { colourForCents, frequencyToMidi, SCORE_TRACE_CONFIG } from "./config.js?v=2";

const SVG_NS = "http://www.w3.org/2000/svg";
const EPSILON = 0.015;

function fractionValue(value) {
  const candidate = value?.realValue ?? value?.RealValue;
  return Number.isFinite(candidate) ? candidate : 0;
}

function absolutePosition(item) {
  return item?.boundingBox?.absolutePosition || item?.PositionAndShape?.AbsolutePosition || { x: 0, y: 0 };
}

function sizeOf(item) {
  return item?.boundingBox?.size || item?.PositionAndShape?.Size || { width: 0, height: 0 };
}

function stavesOf(instrument) {
  return instrument?.Staves || instrument?.staves || [];
}

function sourcePitchMidi(graphicalNote) {
  const pitch = graphicalNote?.sourceNote?.pitch || graphicalNote?.SourceNote?.Pitch;
  if (Number.isFinite(pitch?.frequency) && pitch.frequency > 0) return frequencyToMidi(pitch.frequency);
  const halfTone = pitch?.halfTone ?? pitch?.HalfTone;
  return Number.isFinite(halfTone) ? halfTone + 12 : null;
}

function pageIndexBySystem(graphicSheet) {
  const result = new Map();
  const pages = graphicSheet?.musicPages || graphicSheet?.MusicPages || [];
  pages.forEach((page, pageIndex) => {
    const systems = page?.musicSystems || page?.MusicSystems || [];
    systems.forEach((system) => result.set(system, pageIndex));
  });
  return result;
}

function xForQuarter(system, quarter, edge = "start") {
  const exact = system.anchors.filter((anchor) => Math.abs(anchor.quarter - quarter) <= EPSILON);
  if (exact.length) {
    const values = exact.map((anchor) => anchor.x);
    return edge === "end" ? Math.min(...values) : Math.max(...values);
  }
  const before = [...system.anchors].reverse().find((anchor) => anchor.quarter < quarter);
  const after = system.anchors.find((anchor) => anchor.quarter > quarter);
  if (!before) return after?.x ?? system.xLeft;
  if (!after) return before.x ?? system.xRight;
  const progress = (quarter - before.quarter) / (after.quarter - before.quarter);
  return before.x + (after.x - before.x) * progress;
}

function endXForQuarter(system, quarter) {
  const endingMeasure = system.measures.find((measure) => Math.abs(measure.qEnd - quarter) <= EPSILON);
  if (endingMeasure) return endingMeasure.xRight - 4;
  return xForQuarter(system, quarter, "end") - 4;
}

function matchingGraphicalPoint(system, quarter, midi) {
  const candidates = system.entries
    .filter((entry) => Math.abs(entry.quarter - quarter) <= EPSILON)
    .flatMap((entry) => entry.notes.map((note) => ({ ...note, entry })))
    .filter((candidate) => Number.isFinite(candidate.midi));
  if (!candidates.length) return null;
  candidates.sort((a, b) => Math.abs(a.midi - midi) - Math.abs(b.midi - midi));
  const match = candidates[0];
  return { x: match.x || match.entry.x, y: match.y, midi: match.midi };
}

function selectedStaffOffset(osmd, instrumentIndex) {
  const instruments = osmd?.Sheet?.Instruments || osmd?.sheet?.instruments || [];
  return instruments.slice(0, instrumentIndex).reduce((sum, instrument) => sum + Math.max(1, stavesOf(instrument).length), 0);
}

function collectSystems(osmd, timeline, instrumentIndex) {
  const graphicSheet = osmd?.GraphicSheet || osmd?.graphicSheet;
  const measureList = graphicSheet?.measureList || graphicSheet?.MeasureList || [];
  const pageLookup = pageIndexBySystem(graphicSheet);
  const staffOffset = selectedStaffOffset(osmd, instrumentIndex);
  const selectedStaffNumbers = [...new Set(timeline.map((note) => Math.max(1, Number.parseInt(note.staff, 10) || 1)))];
  const staffSystems = new Map();

  for (const staffNumber of selectedStaffNumbers) {
    const globalStaffIndex = staffOffset + staffNumber - 1;
    const systems = new Map();
    for (const measureRow of measureList) {
      const measure = measureRow?.[globalStaffIndex];
      if (!measure) continue;
      const sourceMeasure = measure.parentSourceMeasure || measure.ParentSourceMeasure;
      const qStart = fractionValue(sourceMeasure?.absoluteTimestamp || sourceMeasure?.AbsoluteTimestamp) * 4;
      const qEnd = qStart + fractionValue(sourceMeasure?.duration || sourceMeasure?.Duration) * 4;
      const systemObject = measure.parentMusicSystem || measure.ParentMusicSystem || measure.parentStaffLine?.parentMusicSystem;
      if (!systems.has(systemObject)) {
        systems.set(systemObject, {
          object: systemObject,
          pageIndex: pageLookup.get(systemObject) ?? 0,
          qStart,
          qEnd,
          xLeft: Infinity,
          xRight: -Infinity,
          staffY: absolutePosition(measure).y * SCORE_TRACE_CONFIG.osmdPixelsPerUnit,
          anchors: [],
          entries: [],
          measures: [],
        });
      }
      const system = systems.get(systemObject);
      const measurePosition = absolutePosition(measure);
      const measureSize = sizeOf(measure);
      const xLeft = measurePosition.x * SCORE_TRACE_CONFIG.osmdPixelsPerUnit;
      const xRight = (measurePosition.x + measureSize.width) * SCORE_TRACE_CONFIG.osmdPixelsPerUnit;
      system.qStart = Math.min(system.qStart, qStart);
      system.qEnd = Math.max(system.qEnd, qEnd);
      system.xLeft = Math.min(system.xLeft, xLeft);
      system.xRight = Math.max(system.xRight, xRight);
      system.measures.push({
        number: sourceMeasure?.measureNumber ?? measure.measureNumber,
        qStart,
        qEnd,
        xLeft,
        xRight,
        y: measurePosition.y * SCORE_TRACE_CONFIG.osmdPixelsPerUnit,
      });
      system.anchors.push({ quarter: qEnd, x: xRight, kind: "measure-end" });

      const staffEntries = measure.staffEntries || measure.StaffEntries || [];
      for (const staffEntry of staffEntries) {
        const rel = fractionValue(staffEntry.relInMeasureTimestamp || staffEntry.RelInMeasureTimestamp);
        const quarter = qStart + rel * 4;
        const entryPosition = absolutePosition(staffEntry);
        const x = entryPosition.x * SCORE_TRACE_CONFIG.osmdPixelsPerUnit;
        const notes = [];
        for (const voiceEntry of staffEntry.graphicalVoiceEntries || staffEntry.GraphicalVoiceEntries || []) {
          for (const graphicalNote of voiceEntry.notes || voiceEntry.Notes || []) {
            const sourceNote = graphicalNote.sourceNote || graphicalNote.SourceNote;
            if (sourceNote?.isRestFlag || sourceNote?.IsRest) continue;
            const notePosition = absolutePosition(graphicalNote);
            notes.push({
              midi: sourcePitchMidi(graphicalNote),
              x: notePosition.x * SCORE_TRACE_CONFIG.osmdPixelsPerUnit,
              y: notePosition.y * SCORE_TRACE_CONFIG.osmdPixelsPerUnit,
            });
          }
        }
        system.entries.push({ quarter, x, notes });
        system.anchors.push({ quarter, x, kind: "staff-entry" });
      }
    }
    const ordered = [...systems.values()].sort((a, b) => a.qStart - b.qStart || a.staffY - b.staffY);
    for (const system of ordered) {
      system.anchors.sort((a, b) => a.quarter - b.quarter || a.x - b.x);
      system.entries.sort((a, b) => a.quarter - b.quarter || a.x - b.x);
      system.measures.sort((a, b) => a.qStart - b.qStart);
      if (!Number.isFinite(system.xLeft)) system.xLeft = system.anchors[0]?.x || 0;
      if (!Number.isFinite(system.xRight)) system.xRight = system.anchors.at(-1)?.x || system.xLeft;
    }
    staffSystems.set(staffNumber, ordered);
  }
  return staffSystems;
}

export function buildScoreGeometry(osmd, timeline, instrumentIndex) {
  const staffSystems = collectSystems(osmd, timeline, instrumentIndex);
  const geometry = new Map();
  for (const note of timeline) {
    const staffNumber = Math.max(1, Number.parseInt(note.staff, 10) || 1);
    const systems = staffSystems.get(staffNumber) || [];
    const noteEnd = note.onsetQuarters + note.durationQuarters;
    const onsetSystem = systems.find((system) => note.onsetQuarters >= system.qStart - EPSILON && note.onsetQuarters < system.qEnd + EPSILON);
    const onsetPoint = onsetSystem ? matchingGraphicalPoint(onsetSystem, note.onsetQuarters, note.midi) : null;
    const onsetOffset = onsetPoint && onsetSystem ? onsetPoint.y - onsetSystem.staffY : 50;
    const regions = [];
    for (const system of systems) {
      const qStart = Math.max(note.onsetQuarters, system.qStart);
      const qEnd = Math.min(noteEnd, system.qEnd);
      if (qEnd - qStart <= EPSILON) continue;
      const continuationPoint = matchingGraphicalPoint(system, qStart, note.midi);
      const xStart = qStart <= note.onsetQuarters + EPSILON && onsetPoint && system === onsetSystem
        ? onsetPoint.x
        : continuationPoint?.x ?? xForQuarter(system, qStart, "start");
      let xEnd = endXForQuarter(system, qEnd);
      if (xEnd <= xStart + SCORE_TRACE_CONFIG.minimumRegionWidth) {
        xEnd = xStart + SCORE_TRACE_CONFIG.minimumRegionWidth;
      }
      regions.push({
        noteId: note.id,
        measureNumber: note.measureNumber,
        qStart,
        qEnd,
        xStart,
        xEnd,
        y: continuationPoint?.y ?? system.staffY + onsetOffset,
        system: system.object,
        pageIndex: system.pageIndex,
      });
    }
    if (regions.length) geometry.set(note.id, regions);
  }
  return geometry;
}

export function pointForSample(regions, sample) {
  if (!regions?.length || !Number.isFinite(sample.scoreQuarter) || !Number.isFinite(sample.cents)) return null;
  const region = regions.find((candidate) => sample.scoreQuarter >= candidate.qStart - EPSILON && sample.scoreQuarter <= candidate.qEnd + EPSILON);
  if (!region) return null;
  const progress = Math.max(0, Math.min(1, (sample.scoreQuarter - region.qStart) / Math.max(EPSILON, region.qEnd - region.qStart)));
  return {
    noteId: region.noteId,
    pageIndex: region.pageIndex,
    system: region.system,
    x: region.xStart + (region.xEnd - region.xStart) * progress,
    y: region.y - sample.cents * SCORE_TRACE_CONFIG.centsToPixels,
    cents: sample.cents,
  };
}

export function traceSegments(samples, geometry) {
  const ordered = [...samples].sort((a, b) => a.scoreSeconds - b.scoreSeconds);
  const segments = [];
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (previous.targetId !== current.targetId || current.scoreSeconds - previous.scoreSeconds > SCORE_TRACE_CONFIG.maximumConnectedGapSeconds) continue;
    const from = pointForSample(geometry.get(previous.targetId), previous);
    const to = pointForSample(geometry.get(current.targetId), current);
    if (!from || !to || from.pageIndex !== to.pageIndex || from.system !== to.system) continue;
    segments.push({ from, to, colour: colourForCents((previous.cents + current.cents) / 2) });
  }
  return segments;
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function ensureLayers(scoreContainer, geometry) {
  const pages = [...scoreContainer.querySelectorAll('svg[id^="osmdSvgPage"]')];
  pages.forEach((page, pageIndex) => {
    page.querySelector(".score-trace-layer")?.remove();
    const layer = svgElement("g", { class: "score-trace-layer", "aria-hidden": "true", "data-page-index": pageIndex });
    const focus = svgElement("g", { class: "score-trace-focus-layer" });
    const trace = svgElement("g", { class: "score-trace-lines" });
    layer.append(focus, trace);
    page.append(layer);
  });
  for (const regions of geometry.values()) {
    for (const region of regions) {
      const layer = pages[region.pageIndex]?.querySelector(".score-trace-focus-layer");
      if (!layer) continue;
      layer.append(svgElement("rect", {
        class: "score-note-focus",
        "data-note-id": region.noteId,
        "data-measure-number": region.measureNumber,
        x: region.xStart - 5,
        y: region.y - 13,
        width: Math.max(12, region.xEnd - region.xStart + 10),
        height: 26,
        rx: 5,
      }));
    }
  }
  return pages;
}

function appendSampleMark(page, point) {
  const layer = page?.querySelector(".score-trace-lines");
  if (!layer) return;
  layer.append(svgElement("circle", {
    class: "score-trace-sample",
    "data-note-id": point.noteId,
    cx: point.x,
    cy: point.y,
    r: 1.55,
    fill: colourForCents(point.cents),
  }));
}

function appendSegment(page, segment) {
  const layer = page?.querySelector(".score-trace-lines");
  if (!layer) return;
  layer.append(svgElement("line", {
    class: "score-trace-segment",
    "data-note-id": segment.to.noteId,
    x1: segment.from.x,
    y1: segment.from.y,
    x2: segment.to.x,
    y2: segment.to.y,
    stroke: segment.colour,
  }));
}

export function renderScoreTrace(scoreContainer, geometry, samples) {
  if (!scoreContainer || !geometry) return;
  const pages = ensureLayers(scoreContainer, geometry);
  for (const sample of samples) {
    const point = pointForSample(geometry.get(sample.targetId), sample);
    if (point) appendSampleMark(pages[point.pageIndex], point);
  }
  for (const segment of traceSegments(samples, geometry)) appendSegment(pages[segment.to.pageIndex], segment);
}

export function appendScoreTraceSample(scoreContainer, geometry, sample, previousSample) {
  if (!scoreContainer.querySelector(".score-trace-layer")) renderScoreTrace(scoreContainer, geometry, []);
  const pages = [...scoreContainer.querySelectorAll('svg[id^="osmdSvgPage"]')];
  const point = pointForSample(geometry.get(sample.targetId), sample);
  if (!point) return;
  appendSampleMark(pages[point.pageIndex], point);
  if (!previousSample || previousSample.targetId !== sample.targetId || sample.scoreSeconds - previousSample.scoreSeconds > SCORE_TRACE_CONFIG.maximumConnectedGapSeconds) return;
  const from = pointForSample(geometry.get(previousSample.targetId), previousSample);
  if (!from || from.pageIndex !== point.pageIndex || from.system !== point.system) return;
  appendSegment(pages[point.pageIndex], { from, to: point, colour: colourForCents((previousSample.cents + sample.cents) / 2) });
}

export function focusScoreTarget(scoreContainer, noteId, measureNumber = null) {
  const markers = [...scoreContainer.querySelectorAll(".score-note-focus")];
  const target = markers.find((marker) => marker.dataset.noteId === noteId)
    || markers.find((marker) => Number(marker.dataset.measureNumber) === Number(measureNumber));
  if (!target) return false;
  markers.forEach((marker) => marker.classList.remove("highlighted"));
  target.classList.add("highlighted");
  target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  window.setTimeout(() => target.classList.remove("highlighted"), 1800);
  return true;
}
