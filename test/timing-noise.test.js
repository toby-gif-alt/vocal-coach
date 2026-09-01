import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { AUDIO_CONFIG } from "../src/config.js";
import {
  calculateRms,
  deriveNoiseGate,
  estimateAmbientRms,
  isPitchFrameUsable,
  RmsNoiseGate,
} from "../src/noise-gate.js";
import {
  applyMeasureTimingEvent,
  createMeasureCursor,
  cursorIndexAtTimestamp,
  measureDurationQuarters,
  osmdTimestampToQuarters,
  quartersToOsmdTimestamp,
  quartersToSeconds,
  quartersToTransportTicks,
  transportTicksToQuarters,
} from "../src/timing.js";

function runMeasure(events) {
  const cursor = createMeasureCursor();
  const onsets = events.map((event) => applyMeasureTimingEvent(cursor, event));
  return { cursor, onsets, duration: measureDurationQuarters(cursor) };
}

test("timing fixture contains separate Voice/Piano parts and complex measure events", async () => {
  const xml = await readFile(new URL("./fixtures/voice-piano-pickup.musicxml", import.meta.url), "utf8");
  assert.match(xml, /<part-name>Voice<\/part-name>/);
  assert.match(xml, /<part-name>Piano<\/part-name>/);
  assert.match(xml, /implicit="yes"/);
  assert.match(xml, /<backup>/);
  assert.match(xml, /<forward>/);
  assert.match(xml, /<chord\/>/);
  assert.match(xml, /<staff>2<\/staff>/);
});

test("Tone quarter notes and OSMD whole-note fractions convert exactly", () => {
  for (const quarter of [0, 0.5, 1, 3.5, 4, 9.25]) {
    assert.equal(osmdTimestampToQuarters(quartersToOsmdTimestamp(quarter)), quarter);
    assert.equal(transportTicksToQuarters(quartersToTransportTicks(quarter, 192), 192), quarter);
  }
});

test("OSMD cursor does not advance until the next indexed timestamp is reached", () => {
  const timeline = [0, 0.25, 0.5, 1, 1.5];
  assert.equal(cursorIndexAtTimestamp(timeline, quartersToOsmdTimestamp(0.8)), 0);
  assert.equal(cursorIndexAtTimestamp(timeline, quartersToOsmdTimestamp(1)), 1);
  assert.equal(cursorIndexAtTimestamp(timeline, quartersToOsmdTimestamp(3.9), 1), 2);
  assert.equal(cursorIndexAtTimestamp(timeline, quartersToOsmdTimestamp(4), 2), 3);
});

test("cursor timing remains tempo-independent at 50%, 100%, and 150%", () => {
  const baseBpm = 96;
  for (const tempoPercent of [50, 100, 150]) {
    const bpm = baseBpm * tempoPercent / 100;
    for (const quarter of [0, 1, 2, 4, 8, 12]) {
      const seconds = quartersToSeconds(quarter, bpm);
      const recoveredTransportQuarter = seconds * bpm / 60;
      assert.ok(Math.abs(recoveredTransportQuarter - quarter) < 1e-10);
      assert.equal(osmdTimestampToQuarters(quartersToOsmdTimestamp(recoveredTransportQuarter)), quarter);
    }
  }
});

test("a Voice and two-staff Piano pickup share the same one-quarter measure", () => {
  const voice = runMeasure([
    { type: "note", durationQuarters: 1, isChord: false },
  ]);
  const piano = runMeasure([
    { type: "note", durationQuarters: 0.5, isChord: false },
    { type: "note", durationQuarters: 0.5, isChord: true },
    { type: "forward", durationQuarters: 0.5 },
    { type: "backup", durationQuarters: 1 },
    { type: "note", durationQuarters: 1, isChord: false },
  ]);

  assert.equal(voice.duration, 1);
  assert.equal(piano.duration, 1);
  assert.deepEqual(piano.onsets, [0, 0, 1, 0, 0]);
});

test("backup, forward, chords, and multiple staves retain full-measure timing", () => {
  const piano = runMeasure([
    { type: "note", durationQuarters: 4, isChord: false },
    { type: "note", durationQuarters: 4, isChord: true },
    { type: "note", durationQuarters: 4, isChord: true },
    { type: "backup", durationQuarters: 4 },
    { type: "note", durationQuarters: 2, isChord: false },
    { type: "forward", durationQuarters: 2 },
  ]);

  assert.equal(piano.duration, 4);
  assert.deepEqual(piano.onsets.slice(0, 3), [0, 0, 0]);
  assert.equal(piano.onsets[4], 0);
});

test("RMS amplitude is measured before pitch analysis", () => {
  assert.equal(calculateRms(new Float32Array(8)), 0);
  assert.ok(Math.abs(calculateRms(new Float32Array([0.5, -0.5, 0.5, -0.5])) - 0.5) < 1e-7);
});

test("ambient calibration resists a brief transient and applies safe floors", () => {
  const ambient = estimateAmbientRms([0.002, 0.0021, 0.002, 0.0022, 0.18]);
  assert.ok(ambient < 0.003);
  const low = deriveNoiseGate(ambient, "low");
  const normal = deriveNoiseGate(ambient, "normal");
  const high = deriveNoiseGate(ambient, "high");
  assert.ok(low.openThreshold > normal.openThreshold);
  assert.ok(normal.openThreshold > high.openThreshold);
  assert.ok(high.openThreshold >= 0.006);
  assert.equal(AUDIO_CONFIG.calibrationDurationMs, 1000);
});

test("noise gate hysteresis avoids rapid switching around the open threshold", () => {
  const gate = new RmsNoiseGate({ openThreshold: 0.02, closeThreshold: 0.014 });
  assert.equal(gate.accepts(0.019), false);
  assert.equal(gate.accepts(0.021), true);
  assert.equal(gate.accepts(0.016), true);
  assert.equal(gate.accepts(0.013), false);
});

test("a pitch sample requires both an open RMS gate and sufficient clarity", () => {
  assert.equal(isPitchFrameUsable({ gateOpen: false, clarity: 0.99, frequency: 220 }), false);
  assert.equal(isPitchFrameUsable({ gateOpen: true, clarity: 0.7, frequency: 220 }), false);
  assert.equal(isPitchFrameUsable({ gateOpen: true, clarity: 0.95, frequency: 220 }), true);
});
