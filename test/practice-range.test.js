import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assessmentRangeLabel,
  clipTimelineToRange,
  firstNoteAtOrAfter,
  measureBoundaries,
  playbackWindow,
  resolvePracticeRange,
  sampleWithinRange,
  validateSection,
} from "../src/practice-range.js";

const part = {
  durationQuarters: 13,
  measureStarts: [
    { measureNumber: 1, onsetQuarters: 0, timeSignature: { beats: 4, beatType: 4 } },
    { measureNumber: 2, onsetQuarters: 1, timeSignature: { beats: 4, beatType: 4 } },
    { measureNumber: 3, onsetQuarters: 5, timeSignature: { beats: 3, beatType: 4 } },
    { measureNumber: 4, onsetQuarters: 8, timeSignature: { beats: 3, beatType: 4 } },
    { measureNumber: 5, onsetQuarters: 11, timeSignature: { beats: 3, beatType: 4 } },
  ],
};

test("measure boundaries preserve pickup and incomplete measure lengths", () => {
  assert.deepEqual(measureBoundaries(part).map(({ measureNumber, startQuarter, endQuarter }) => ({ measureNumber, startQuarter, endQuarter })), [
    { measureNumber: 1, startQuarter: 0, endQuarter: 1 },
    { measureNumber: 2, startQuarter: 1, endQuarter: 5 },
    { measureNumber: 3, startQuarter: 5, endQuarter: 8 },
    { measureNumber: 4, startQuarter: 8, endQuarter: 11 },
    { measureNumber: 5, startQuarter: 11, endQuarter: 13 },
  ]);
});

test("whole-piece, selected-section, and later-start ranges remain absolute", () => {
  assert.deepEqual(resolvePracticeRange(part), {
    firstMeasure: 1, lastMeasure: 5, sectionStartMeasure: 1, sectionEndMeasure: 5,
    startMeasure: 1, endMeasure: 5, startQuarter: 0, endQuarter: 13,
    timeSignature: { beats: 4, beatType: 4 }, wholePiece: true,
  });
  const section = resolvePracticeRange(part, { sectionStartMeasure: 2, sectionEndMeasure: 5, startMeasure: 4 });
  assert.equal(section.startQuarter, 8);
  assert.equal(section.endQuarter, 13);
  assert.equal(section.timeSignature.beats, 3);
  assert.equal(assessmentRangeLabel(section), "bars 4–5");
});

test("a 72-bar score resolves bars 10–25 and a deliberate bar-17 start exactly", () => {
  const longPart = {
    durationQuarters: 72 * 4,
    measureStarts: Array.from({ length: 72 }, (_, index) => ({
      measureNumber: index + 1,
      onsetQuarters: index * 4,
      timeSignature: { beats: 4, beatType: 4 },
    })),
  };
  const whole = resolvePracticeRange(longPart);
  const section = resolvePracticeRange(longPart, { sectionStartMeasure: 10, sectionEndMeasure: 25, startMeasure: 10 });
  const later = resolvePracticeRange(longPart, { sectionStartMeasure: 10, sectionEndMeasure: 25, startMeasure: 17 });
  assert.deepEqual([whole.startQuarter, whole.endQuarter], [0, 288]);
  assert.deepEqual([section.startQuarter, section.endQuarter], [36, 100]);
  assert.deepEqual([later.startQuarter, later.endQuarter], [64, 100]);
});

test("section validation rejects reversed, missing, and out-of-range bars", () => {
  assert.equal(validateSection(part, 2, 4).valid, true);
  assert.equal(validateSection(part, 4, 2).valid, false);
  assert.equal(validateSection(part, 0, 3).valid, false);
  assert.equal(validateSection({ ...part, measureStarts: part.measureStarts.filter((item) => item.measureNumber !== 3) }, 2, 3).valid, false);
});

test("assessment clips carry-over and ending sustains without including surrounding notes", () => {
  const timeline = [
    { id: "before", onsetQuarters: 0, durationQuarters: 2 },
    { id: "carry", onsetQuarters: 4, durationQuarters: 3 },
    { id: "inside", onsetQuarters: 7, durationQuarters: 1 },
    { id: "ending", onsetQuarters: 10, durationQuarters: 4 },
    { id: "after", onsetQuarters: 14, durationQuarters: 1 },
  ];
  const clipped = clipTimelineToRange(timeline, 5, 12, 60);
  assert.deepEqual(clipped.map(({ id, onsetQuarters, durationQuarters }) => ({ id, onsetQuarters, durationQuarters })), [
    { id: "carry", onsetQuarters: 5, durationQuarters: 2 },
    { id: "inside", onsetQuarters: 7, durationQuarters: 1 },
    { id: "ending", onsetQuarters: 10, durationQuarters: 2 },
  ]);
  assert.equal(sampleWithinRange({ scoreQuarter: 5 }, 5, 12), true);
  assert.equal(sampleWithinRange({ scoreQuarter: 12 }, 5, 12), false);
  assert.equal(firstNoteAtOrAfter(timeline, 5).id, "inside");
});

test("playback schedules only interval events and safely reconstructs carry-over sustains", () => {
  assert.equal(playbackWindow({ onsetQuarters: 2, durationQuarters: 2 }, 5, 12), null);
  const carry = playbackWindow({ onsetQuarters: 4, durationQuarters: 4 }, 5, 12, 100);
  assert.equal(carry.resumesSustain, true);
  assert.equal(carry.scheduledOnset, 5.01);
  assert.ok(Math.abs(carry.durationQuarters - 2.99) < 1e-10);
  const ending = playbackWindow({ onsetQuarters: 10, durationQuarters: 4 }, 5, 12, 100);
  assert.equal(ending.scheduledOnset, 10);
  assert.equal(ending.durationQuarters, 2);
  assert.equal(playbackWindow({ onsetQuarters: 12, durationQuarters: 1 }, 5, 12), null);
});
