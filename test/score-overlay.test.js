import assert from "node:assert/strict";
import { test } from "node:test";

import { buildScoreGeometry, pointForSample, traceSegments } from "../src/score-overlay.js";

function fraction(realValue) {
  return { realValue };
}

function graphicalNote({ x, y, midi, width = 1.2, borderLeft = -0.6, borderRight = 0.6 }) {
  return {
    PositionAndShape: {
      AbsolutePosition: { x, y },
      Size: { width, height: 1 },
      BorderLeft: borderLeft,
      BorderRight: borderRight,
    },
    SourceNote: { Pitch: { HalfTone: midi - 12 } },
  };
}

function staffEntry({ quarter, x, notes, measureStart = 0 }) {
  return {
    RelInMeasureTimestamp: fraction((quarter - measureStart) / 4),
    PositionAndShape: { AbsolutePosition: { x, y: 0 } },
    GraphicalVoiceEntries: [{ Notes: notes }],
  };
}

function graphicalMeasure({ system, qStart, qEnd, x, y, width, entries, number }) {
  return {
    ParentSourceMeasure: {
      AbsoluteTimestamp: fraction(qStart / 4),
      Duration: fraction((qEnd - qStart) / 4),
      measureNumber: number,
    },
    ParentMusicSystem: system,
    PositionAndShape: {
      AbsolutePosition: { x, y },
      Size: { width, height: 8 },
    },
    StaffEntries: entries,
  };
}

function osmdFor(measures, pages) {
  return {
    Sheet: { Instruments: [{ Staves: [{}] }] },
    GraphicSheet: {
      MeasureList: measures.map((measure) => [measure]),
      MusicPages: pages,
    },
  };
}

test("score note onsets map to the visible left edge without changing note timing or height", () => {
  const system = {};
  const measure = graphicalMeasure({
    system,
    qStart: 0,
    qEnd: 8,
    x: 0,
    y: 4,
    width: 80,
    number: 1,
    entries: [
      staffEntry({ quarter: 0, x: 10, notes: [graphicalNote({ x: 10, y: 10, midi: 60 })] }),
      staffEntry({ quarter: 1, x: 22, notes: [graphicalNote({ x: 22, y: 11, midi: 62 })] }),
      staffEntry({ quarter: 3, x: 42, notes: [graphicalNote({ x: 42, y: 12, midi: 64 })] }),
      staffEntry({
        quarter: 7,
        x: 70,
        notes: [graphicalNote({ x: 70, y: 13, midi: 64, width: 4, borderLeft: -3, borderRight: 1.5 })],
      }),
    ],
  });
  const notes = [
    { id: "crotchet", midi: 60, onsetQuarters: 0, durationQuarters: 1, measureNumber: 1, staff: "1" },
    { id: "minim", midi: 62, onsetQuarters: 1, durationQuarters: 2, measureNumber: 1, staff: "1" },
    { id: "semibreve", midi: 64, onsetQuarters: 3, durationQuarters: 4, measureNumber: 1, staff: "1" },
    { id: "repeated", midi: 64, onsetQuarters: 7, durationQuarters: 1, measureNumber: 1, staff: "1" },
  ];

  const geometry = buildScoreGeometry(osmdFor([measure], [{ MusicSystems: [system] }]), notes, 0);
  assert.deepEqual(
    notes.map((note) => {
      const [region] = geometry.get(note.id);
      return { id: note.id, qStart: region.qStart, qEnd: region.qEnd, xStart: region.xStart, y: region.y };
    }),
    [
      { id: "crotchet", qStart: 0, qEnd: 1, xStart: 94, y: 100 },
      { id: "minim", qStart: 1, qEnd: 3, xStart: 214, y: 110 },
      { id: "semibreve", qStart: 3, qEnd: 7, xStart: 414, y: 120 },
      { id: "repeated", qStart: 7, qEnd: 8, xStart: 692, y: 130 },
    ],
  );
  assert.equal(
    pointForSample(geometry.get("crotchet"), { scoreQuarter: 0, cents: 0 }).x,
    94,
    "the onset maps to the notehead edge without adding a pitch sample",
  );
});

test("a note crossing a page break keeps its existing centre-anchor continuation", () => {
  const firstSystem = {};
  const secondSystem = {};
  const firstMeasure = graphicalMeasure({
    system: firstSystem,
    qStart: 0,
    qEnd: 8,
    x: 0,
    y: 4,
    width: 80,
    number: 1,
    entries: [staffEntry({ quarter: 6, x: 60, notes: [graphicalNote({ x: 60, y: 10, midi: 67 })] })],
  });
  const secondMeasure = graphicalMeasure({
    system: secondSystem,
    qStart: 8,
    qEnd: 12,
    x: 0,
    y: 28,
    width: 80,
    number: 2,
    entries: [staffEntry({ quarter: 8, x: 12, notes: [graphicalNote({ x: 12, y: 34, midi: 67 })], measureStart: 8 })],
  });
  const note = { id: "across-break", midi: 67, onsetQuarters: 6, durationQuarters: 4, measureNumber: 1, staff: "1" };

  const geometry = buildScoreGeometry(osmdFor(
    [firstMeasure, secondMeasure],
    [{ MusicSystems: [firstSystem] }, { MusicSystems: [secondSystem] }],
  ), [note], 0).get(note.id);

  assert.equal(geometry.length, 2);
  assert.deepEqual(
    geometry.map(({ qStart, qEnd, xStart, y, pageIndex }) => ({ qStart, qEnd, xStart, y, pageIndex })),
    [
      { qStart: 6, qEnd: 8, xStart: 594, y: 100, pageIndex: 0 },
      { qStart: 8, qEnd: 10, xStart: 120, y: 340, pageIndex: 1 },
    ],
  );
});

test("separate notes around a rest remain separate with left-edge geometry", () => {
  const system = {};
  const measure = graphicalMeasure({
    system,
    qStart: 0,
    qEnd: 4,
    x: 0,
    y: 4,
    width: 50,
    number: 1,
    entries: [
      staffEntry({ quarter: 0, x: 10, notes: [graphicalNote({ x: 10, y: 10, midi: 60 })] }),
      staffEntry({ quarter: 2, x: 30, notes: [graphicalNote({ x: 30, y: 10, midi: 62 })] }),
    ],
  });
  const notes = [
    { id: "before-rest", midi: 60, onsetQuarters: 0, durationQuarters: 1, measureNumber: 1, staff: "1" },
    { id: "after-rest", midi: 62, onsetQuarters: 2, durationQuarters: 1, measureNumber: 1, staff: "1" },
  ];
  const geometry = buildScoreGeometry(osmdFor([measure], [{ MusicSystems: [system] }]), notes, 0);
  const samples = [
    { targetId: "before-rest", scoreQuarter: 0.9, scoreSeconds: 0.9, cents: 0 },
    { targetId: "after-rest", scoreQuarter: 2, scoreSeconds: 1, cents: 0 },
  ];

  assert.equal(traceSegments(samples, geometry).length, 0);
  assert.equal(pointForSample(geometry.get("after-rest"), samples[1]).x, 294);
});
