import assert from "node:assert/strict";
import { test } from "node:test";

import { midiToFrequency } from "../src/config.js";
import {
  AutomaticOctaveSelector,
  closestOctaveCandidate,
  suggestOctaveFromComfortablePitch,
} from "../src/octave-selection.js";
import { createTakeMetadata, reviewDriftSeconds, reviewLayers, reviewQuarterAtSeconds } from "../src/review-playback.js";

test("live octave selection confirms a stable matching pitch class", () => {
  const selector = new AutomaticOctaveSelector({ stableDurationMs: 500 });
  let result = null;
  for (let time = 0; time <= 600; time += 100) {
    result = selector.observe({ sungMidi: 55.04, writtenMidi: 67, capturedAt: time }) || result;
  }
  assert.equal(result.confirmed, true);
  assert.equal(result.shift, -12);
  assert.equal(result.soundingMidi, 55);
  assert.equal(closestOctaveCandidate(79.1, 67).shift, 12);
});

test("octave selection does not confirm inconsistent or wrong pitch-class responses", () => {
  const selector = new AutomaticOctaveSelector({ stableDurationMs: 400 });
  const pitches = [55, 57, 55, 55, 55, 55];
  const results = pitches.map((sungMidi, index) => selector.observe({
    sungMidi,
    writtenMidi: 67,
    capturedAt: index * 100,
  }));
  assert.ok(results.every((result) => result === null));
});

test("current comfortable pitch gives a rough median-based octave suggestion", () => {
  const timeline = [{ midi: 67 }, { midi: 69 }, { midi: 71 }];
  assert.equal(suggestOctaveFromComfortablePitch(timeline, midiToFrequency(57)).shift, -12);
  assert.equal(suggestOctaveFromComfortablePitch(timeline, null), null);
});

test("take metadata is immutable and review time maps to the take tempo", () => {
  const take = createTakeMetadata({
    tempoPercent: 75,
    bpm: 90,
    octaveShift: -12,
    enabledPartIds: ["P2", "P3"],
    guideEnabled: false,
    durationSeconds: 12,
    vocalPartId: "P1",
  });
  assert.equal(reviewQuarterAtSeconds(8, take.bpm), 12);
  assert.deepEqual(take.enabledPartIds, ["P2", "P3"]);
  assert.equal(take.octaveShift, -12);
  assert.equal(take.vocalPartId, "P1");
  assert.equal(Object.isFrozen(take), true);
  assert.equal(Object.isFrozen(take.enabledPartIds), true);
});

test("recorded-audio time remains the review authority at slow, normal, and fast tempos", () => {
  for (const bpm of [60, 120, 180]) {
    const quarter = reviewQuarterAtSeconds(4.25, bpm);
    assert.equal(reviewDriftSeconds(quarter, 4.25, bpm), 0);
    assert.ok(Math.abs(reviewDriftSeconds(quarter + bpm / 600, 4.25, bpm) - 0.1) < 1e-10);
  }
});

test("review layer defaults and independent combinations are preserved", () => {
  assert.deepEqual(reviewLayers(), { voice: true, accompaniment: true, melody: false });
  assert.deepEqual(reviewLayers({ voice: false, accompaniment: true, melody: true }), {
    voice: false,
    accompaniment: true,
    melody: true,
  });
});
