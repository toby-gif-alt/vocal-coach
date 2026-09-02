import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assessmentSampleEligible,
  LiveTuningFeedback,
  tuningTargetAtQuarter,
  visualMidiForSample,
} from "../src/live-tuning.js";

const timeline = [
  { id: "E4", midi: 64, onsetQuarters: 2, durationQuarters: 1 },
  { id: "G4", midi: 67, onsetQuarters: 6, durationQuarters: 2 },
];

test("preparation and count-in tune against the first note after an opening rest", () => {
  assert.deepEqual(tuningTargetAtQuarter(timeline, 0, "preparation"), { note: timeline[0], kind: "starting" });
  assert.deepEqual(tuningTargetAtQuarter(timeline, 0, "count-in"), { note: timeline[0], kind: "starting" });
});

test("performance uses the written note and prepares the next entrance during rests", () => {
  assert.deepEqual(tuningTargetAtQuarter(timeline, 2.5, "performance"), { note: timeline[0], kind: "current" });
  assert.deepEqual(tuningTargetAtQuarter(timeline, 4, "performance"), { note: timeline[1], kind: "next" });
  assert.deepEqual(tuningTargetAtQuarter(timeline, 9, "performance"), { note: null, kind: "rest" });
});

test("only current written-note samples from performance are assessment eligible", () => {
  assert.equal(assessmentSampleEligible({ phase: "preparation", targetKind: "starting" }), false);
  assert.equal(assessmentSampleEligible({ phase: "count-in", targetKind: "starting" }), false);
  assert.equal(assessmentSampleEligible({ phase: "performance", targetKind: "next" }), false);
  assert.equal(assessmentSampleEligible({ phase: "performance", targetKind: "current" }), true);
});

test("the visual tuner holds a real sample briefly, then listens without inventing a centre", () => {
  const feedback = new LiveTuningFeedback({ dropoutGraceMs: 170 });
  assert.deepEqual(feedback.accept({ midi: 63.6, cents: -40 }, 1000), {
    status: "active",
    held: false,
    value: { midi: 63.6, cents: -40 },
  });
  assert.deepEqual(feedback.reject(1120), {
    status: "active",
    held: true,
    value: { midi: 63.6, cents: -40 },
  });
  assert.deepEqual(feedback.reject(1171), {
    status: "listening",
    held: false,
    value: { midi: 63.6, cents: -40 },
  });
});

test("reliable visual samples react directly to a deliberate pitch slide", () => {
  const feedback = new LiveTuningFeedback();
  const path = [-35, -20, -8, 0, 10];
  assert.deepEqual(path.map((cents, index) => feedback.accept({ cents }, index * 46).value.cents), path);
  assert.equal(visualMidiForSample({ rawMidi: 63.6, filteredMidi: 63.8, octaveCorrection: 0 }), 63.6);
  assert.equal(visualMidiForSample({ rawMidi: 76, filteredMidi: 64, octaveCorrection: -12 }), 64);
});
