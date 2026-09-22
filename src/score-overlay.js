import { colourForCents, frequencyToMidi, SCORE_TRACE_CONFIG } from "./config.js?v=20";

const SVG_NS = "http://www.w3.org/2000/svg";
const EPSILON = 0.015;
const NOTEHEAD_HALF_WIDTH_PIXELS = Object.freeze({ minimum: 4, fallback: 6, maximum: 8 });

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

function boundingBoxOf(item) {
  return item?.boundingBox || item?.PositionAndShape || null;
}

function noteheadExtent(value, fallback) {
  const candidate = Number.isFinite(value) && value > 0 ? value : fallback;
  return Math.max(NOTEHEAD_HALF_WIDTH_PIXELS.minimum, Math.min(NOTEHEAD_HALF_WIDTH_PIXELS.maximum, candidate));
}

function graphicalNotePoint(graphicalNote) {
  const position = absolutePosition(graphicalNote);
  const size = sizeOf(graphicalNote);
  const boundingBox = boundingBoxOf(graphicalNote);
  const scale = SCORE_TRACE_CONFIG.osmdPixelsPerUnit;
  const xCenter = position.x * scale;
  const width = Number(size?.width) * scale;
  const sizeFallback = Number.isFinite(width) && width > 0
    ? width / 2
    : NOTEHEAD_HALF_WIDTH_PIXELS.fallback;
  const borderLeft = Number(boundingBox?.borderLeft ?? boundingBox?.BorderLeft);
  const borderRight = Number(boundingBox?.borderRight ?? boundingBox?.BorderRight);

  // OSMD's absolute X is the rendered note anchor (visually the notehead centre).
  // Its borders are offsets from that anchor. Clamp unusually broad boxes to a
  // notehead-sized envelope because some renderers include stems or accidentals.
  const leftExtent = noteheadExtent(borderLeft < 0 ? -borderLeft * scale : NaN, sizeFallback);
  const rightExtent = noteheadExtent(borderRight > 0 ? borderRight * scale : NaN, sizeFallback);

  return {
    xCenter,
    xLeft: xCenter - leftExtent,
    xRight: xCenter + rightExtent,
    y: position.y * scale,
    midi: sourcePitchMidi(graphicalNote),
  };
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

function verticalBoundsBySystem(osmd) {
  const graphicSheet = osmd?.GraphicSheet || osmd?.graphicSheet;
  const measureList = graphicSheet?.measureList || graphicSheet?.MeasureList || [];
  const bounds = new Map();
  for (const measureRow of measureList) {
    for (const measure of measureRow || []) {
      if (!measure) continue;
      const system = measure.parentMusicSystem || measure.ParentMusicSystem || measure.parentStaffLine?.parentMusicSystem;
      const position = absolutePosition(measure);
      const size = sizeOf(measure);
      const top = position.y * SCORE_TRACE_CONFIG.osmdPixelsPerUnit - 34;
      const bottom = (position.y + size.height) * SCORE_TRACE_CONFIG.osmdPixelsPerUnit + 34;
      const current = bounds.get(system) || { top: Infinity, bottom: -Infinity };
      current.top = Math.min(current.top, top);
      current.bottom = Math.max(current.bottom, bottom);
      bounds.set(system, current);
    }
  }
  return bounds;
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
  return {
    xCenter: match.xCenter ?? match.entry.x,
    xLeft: match.xLeft ?? match.entry.x,
    xRight: match.xRight ?? match.entry.x,
    y: match.y,
    midi: match.midi,
  };
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
  if (!selectedStaffNumbers.length) selectedStaffNumbers.push(1);
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
        height: measureSize.height * SCORE_TRACE_CONFIG.osmdPixelsPerUnit,
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
            notes.push(graphicalNotePoint(graphicalNote));
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
        ? onsetPoint.xLeft
        : continuationPoint?.xCenter ?? xForQuarter(system, qStart, "start");
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

export function buildMeasureGeometry(osmd, timeline, instrumentIndex) {
  const staffSystems = collectSystems(osmd, timeline, instrumentIndex);
  const systems = staffSystems.values().next().value || [];
  const verticalBounds = verticalBoundsBySystem(osmd);
  return systems.flatMap((system) => system.measures.map((measure) => ({
    measureNumber: Number(measure.number),
    qStart: measure.qStart,
    qEnd: measure.qEnd,
    xStart: measure.xLeft,
    xEnd: measure.xRight,
    yStart: verticalBounds.get(system.object)?.top ?? measure.y - 34,
    height: Math.max(
      70,
      (verticalBounds.get(system.object)?.bottom ?? measure.y + (measure.height || 0) + 34)
        - (verticalBounds.get(system.object)?.top ?? measure.y - 34),
    ),
    system: system.object,
    pageIndex: system.pageIndex,
  }))).filter((measure) => Number.isFinite(measure.measureNumber));
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
    if (!shouldBridgeTraceSamples(previous, current)) continue;
    const from = pointForSample(geometry.get(previous.targetId), previous);
    const to = pointForSample(geometry.get(current.targetId), current);
    if (!from || !to || from.pageIndex !== to.pageIndex || from.system !== to.system) continue;
    segments.push({
      from,
      to,
      colour: colourForCents((previous.cents + current.cents) / 2),
      opacity: Math.min(previous.opacity ?? 1, current.opacity ?? 1),
      visualOnly: Boolean(previous.visualOnly || current.visualOnly),
    });
  }
  return segments;
}

export function shouldBridgeTraceSamples(previous, current) {
  if (!previous || !current || previous.targetId !== current.targetId) return false;
  const gap = current.scoreSeconds - previous.scoreSeconds;
  if (!Number.isFinite(gap) || gap < 0 || gap > SCORE_TRACE_CONFIG.maximumConnectedGapSeconds) return false;
  return Number.isFinite(previous.cents)
    && Number.isFinite(current.cents)
    && Math.abs(current.cents - previous.cents) <= SCORE_TRACE_CONFIG.maximumBridgeCents;
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
    const previous = svgElement("g", { class: "score-trace-previous" });
    const trace = svgElement("g", { class: "score-trace-lines score-trace-current" });
    layer.append(focus, previous, trace);
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

function appendSampleMark(page, point, sample = {}, previousTake = false) {
  const layer = page?.querySelector(previousTake ? ".score-trace-previous" : ".score-trace-current");
  if (!layer) return;
  layer.append(svgElement("circle", {
    class: `score-trace-sample${sample.visualOnly ? " visual-only" : ""}${previousTake ? " previous-take" : ""}`,
    "data-note-id": point.noteId,
    cx: point.x,
    cy: point.y,
    r: 1.55,
    fill: previousTake ? "#73817c" : colourForCents(point.cents),
    opacity: previousTake ? 0.24 : sample.opacity ?? 0.84,
  }));
}

function appendSegment(page, segment, previousTake = false) {
  const layer = page?.querySelector(previousTake ? ".score-trace-previous" : ".score-trace-current");
  if (!layer) return;
  layer.append(svgElement("line", {
    class: `score-trace-segment${segment.visualOnly ? " visual-only" : ""}${previousTake ? " previous-take" : ""}`,
    "data-note-id": segment.to.noteId,
    x1: segment.from.x,
    y1: segment.from.y,
    x2: segment.to.x,
    y2: segment.to.y,
    stroke: previousTake ? "#73817c" : segment.colour,
    opacity: previousTake ? 0.26 : segment.opacity ?? 0.92,
  }));
}

export function renderScoreTrace(scoreContainer, geometry, samples, { previousSamples = [], showPrevious = true } = {}) {
  if (!scoreContainer || !geometry) return;
  const pages = ensureLayers(scoreContainer, geometry);
  if (showPrevious) {
    for (const sample of previousSamples) {
      const point = pointForSample(geometry.get(sample.targetId), sample);
      if (point) appendSampleMark(pages[point.pageIndex], point, sample, true);
    }
    for (const segment of traceSegments(previousSamples, geometry)) appendSegment(pages[segment.to.pageIndex], segment, true);
  }
  for (const sample of samples) {
    const point = pointForSample(geometry.get(sample.targetId), sample);
    if (point) appendSampleMark(pages[point.pageIndex], point, sample);
  }
  for (const segment of traceSegments(samples, geometry)) appendSegment(pages[segment.to.pageIndex], segment);
}

export function renderMeasureSelection(scoreContainer, geometry, {
  sectionStartMeasure,
  sectionEndMeasure,
  startMeasure,
  interactionMode = null,
  pendingMeasure = null,
} = {}) {
  const pages = [...scoreContainer.querySelectorAll('svg[id^="osmdSvgPage"]')];
  pages.forEach((page) => page.querySelector(".score-range-layer")?.remove());
  pages.forEach((page, pageIndex) => {
    const layer = svgElement("g", {
      class: `score-range-layer${interactionMode ? " is-interactive" : ""}`,
      "data-page-index": pageIndex,
    });
    const traceLayer = page.querySelector(".score-trace-layer");
    if (traceLayer) page.insertBefore(layer, traceLayer);
    else page.append(layer);
  });

  for (const region of geometry || []) {
    const layer = pages[region.pageIndex]?.querySelector(".score-range-layer");
    if (!layer) continue;
    const selected = region.measureNumber >= Number(sectionStartMeasure)
      && region.measureNumber <= Number(sectionEndMeasure);
    const classes = ["score-measure-region"];
    if (selected) classes.push("selected");
    if (region.measureNumber === Number(startMeasure)) classes.push("start-measure");
    if (region.measureNumber === Number(pendingMeasure)) classes.push("pending");
    const rect = svgElement("rect", {
      class: classes.join(" "),
      "data-measure-number": region.measureNumber,
      x: region.xStart,
      y: region.yStart,
      width: Math.max(12, region.xEnd - region.xStart),
      height: region.height,
      rx: 4,
      tabindex: interactionMode ? 0 : -1,
      role: interactionMode ? "button" : "presentation",
      "aria-label": interactionMode ? `Bar ${region.measureNumber}` : "",
    });
    layer.append(rect);
    if (region.measureNumber === Number(startMeasure)) {
      layer.append(svgElement("line", {
        class: "score-start-marker",
        x1: region.xStart + 3,
        y1: region.yStart + 2,
        x2: region.xStart + 3,
        y2: region.yStart + region.height - 2,
      }));
    }
  }
}

export function appendScoreTraceSample(scoreContainer, geometry, sample, previousSample) {
  if (!scoreContainer.querySelector(".score-trace-layer")) renderScoreTrace(scoreContainer, geometry, []);
  const pages = [...scoreContainer.querySelectorAll('svg[id^="osmdSvgPage"]')];
  const point = pointForSample(geometry.get(sample.targetId), sample);
  if (!point) return;
  appendSampleMark(pages[point.pageIndex], point, sample);
  if (!shouldBridgeTraceSamples(previousSample, sample)) return;
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
