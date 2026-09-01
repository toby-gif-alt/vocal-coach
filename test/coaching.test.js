import assert from "node:assert/strict";
import { test } from "node:test";

import { analysePerformance, summarisePerformance } from "../src/analysis.js";
import { buildCoachingFeedback } from "../src/coaching.js";
import { pointForSample, traceSegments } from "../src/score-overlay.js";

function timeline(count = 12) {
  return Array.from({ length: count }, (_, index) => ({
    id: `n${index + 1}`,
    displayPitch: ["C4", "D4", "E4", "F4", "G4", "A4"][index % 6],
    midi: 60 + index % 6,
    onsetQuarters: index,
    durationQuarters: 1,
    measureNumber: Math.floor(index / 4) + 1,
    staff: "1",
  }));
}

function samplesFor(notes, profile) {
  return notes.flatMap((note, noteIndex) => {
    if (profile === "accurate") {
      return Array.from({ length: 20 }, (_, index) => ({
        targetId: note.id,
        scoreQuarter: note.onsetQuarters + index * 0.05,
        scoreSeconds: note.onsetQuarters + index * 0.05,
        cents: Math.sin(index / 3 + noteIndex) * 4,
      }));
    }
    if (profile === "inconsistent") {
      const count = noteIndex % 3 === 0 ? 9 : 15;
      return Array.from({ length: count }, (_, index) => ({
        targetId: note.id,
        scoreQuarter: note.onsetQuarters + index * 0.06,
        scoreSeconds: note.onsetQuarters + index * 0.06,
        cents: (noteIndex % 2 ? 24 : -30) + Math.sin(index * 0.9) * 16,
      }));
    }
    return [0.05, 0.1, 0.62, 0.68].map((offset, index) => ({
      targetId: note.id,
      scoreQuarter: note.onsetQuarters + offset,
      scoreSeconds: note.onsetQuarters + offset,
      cents: (noteIndex % 2 ? 82 : -96) + index * (noteIndex % 2 ? 7 : -5),
    }));
  });
}

test("extended note analysis captures coverage, fragmentation, drift, and movement", () => {
  const [note] = timeline(1);
  note.durationQuarters = 2;
  const cents = [-45, -30, -18, -8, 0, 5, 12, 20];
  const offsets = [0.05, 0.10, 0.15, 0.20, 0.90, 1.05, 1.20, 1.35];
  const samples = cents.map((value, index) => ({
    targetId: note.id,
    scoreQuarter: offsets[index],
    scoreSeconds: offsets[index],
    cents: value,
  }));
  const [result] = analysePerformance([note], samples, 60);
  assert.ok(result.voicedCoveragePercent > 15 && result.voicedCoveragePercent < 30);
  assert.equal(result.fragmentationCount, 1);
  assert.ok(Number.isFinite(result.pitchStability));
  assert.ok(Number.isFinite(result.directionalDriftCents));
  assert.equal(result.startedOutsideMovedToward, true);
  assert.equal(result.startedAccurateDriftedAway, false);
});

test("adaptive coaching changes level, balance, and language for three singer profiles", () => {
  const notes = timeline();
  const accurateResults = analysePerformance(notes, samplesFor(notes, "accurate"), 60);
  const inconsistentResults = analysePerformance(notes, samplesFor(notes, "inconsistent"), 60);
  const beginnerResults = analysePerformance(notes, samplesFor(notes, "beginner"), 60);
  const accurate = buildCoachingFeedback(accurateResults);
  const inconsistent = buildCoachingFeedback(inconsistentResults);
  const beginner = buildCoachingFeedback(beginnerResults);

  assert.equal(summarisePerformance(accurateResults).level, "excellent");
  assert.ok(["developing", "foundation"].includes(summarisePerformance(inconsistentResults).level));
  assert.equal(summarisePerformance(beginnerResults).level, "early-foundation");
  for (const feedback of [accurate, inconsistent, beginner]) assert.equal(feedback.observations.length, 10);
  assert.equal(accurate.observations.filter((item) => item.tone === "positive").length, 8);
  assert.equal(beginner.observations.filter((item) => item.tone === "positive").length, 3);
  assert.notDeepEqual(accurate.observations.map((item) => item.title), inconsistent.observations.map((item) => item.title));
  assert.notDeepEqual(inconsistent.observations.map((item) => item.title), beginner.observations.map((item) => item.title));
  assert.ok(accurate.observations.some((item) => /steady|secure|centre/i.test(item.title + item.body)));
  assert.ok(beginner.observations.some((item) => /Assisted|slow|one steady pitch|full value/i.test(item.title + item.body)));
  assert.ok(beginner.observations.filter((item) => item.noteId && item.measureNumber).length >= 3);
  assert.ok([...accurate.observations, ...inconsistent.observations, ...beginner.observations].every((item) => !/bad vibrato/i.test(item.title + item.body)));
});

test("score trace positions cents vertically and leaves unreliable gaps", () => {
  const system = {};
  const geometry = new Map([["n1", [{
    noteId: "n1",
    measureNumber: 1,
    qStart: 0,
    qEnd: 2,
    xStart: 20,
    xEnd: 220,
    y: 100,
    pageIndex: 0,
    system,
  }]]]);
  const centred = pointForSample(geometry.get("n1"), { scoreQuarter: 1, cents: 0 });
  const sharp = pointForSample(geometry.get("n1"), { scoreQuarter: 1, cents: 40 });
  const flat = pointForSample(geometry.get("n1"), { scoreQuarter: 1, cents: -40 });
  assert.deepEqual({ x: centred.x, y: centred.y }, { x: 120, y: 100 });
  assert.ok(sharp.y < centred.y);
  assert.ok(flat.y > centred.y);

  const samples = [
    { targetId: "n1", scoreQuarter: 0.1, scoreSeconds: 0.1, cents: -50 },
    { targetId: "n1", scoreQuarter: 0.15, scoreSeconds: 0.15, cents: -35 },
    { targetId: "n1", scoreQuarter: 0.9, scoreSeconds: 0.9, cents: -10 },
    { targetId: "n1", scoreQuarter: 0.95, scoreSeconds: 0.95, cents: 0 },
  ];
  const segments = traceSegments(samples, geometry);
  assert.equal(segments.length, 2, "the long unreliable interval must remain a gap");
  assert.equal(segments[0].colour, "#ee8b3b");
  assert.equal(segments[1].colour, "#4ab982");
});
