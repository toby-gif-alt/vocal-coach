import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { analysePerformance, performanceSummary } from "../src/analysis.js";
import {
  colourForCents,
  frequencyToMidi,
  midiToFrequency,
  midiToName,
} from "../src/config.js";

test("MIDI and frequency conversions round-trip across a vocal range", () => {
  for (const midi of [36, 48, 60, 69, 72, 84]) {
    assert.ok(Math.abs(frequencyToMidi(midiToFrequency(midi)) - midi) < 1e-10);
  }
  assert.equal(midiToName(60), "C4");
  assert.equal(midiToName(69), "A4");
});

test("pitch colours include their documented tolerance boundaries", () => {
  assert.equal(colourForCents(15), "#4ab982");
  assert.equal(colourForCents(-30), "#d8c743");
  assert.equal(colourForCents(45), "#ee8b3b");
  assert.equal(colourForCents(45.01), "#df5f55");
});

test("note analysis preserves onset, settling, sustain, and in-zone metrics", () => {
  const note = { id: "n1", onsetQuarters: 0, durationQuarters: 4, onsetTime: 0 };
  const cents = [-32, -24, -12, -8, -4, 0, 3, 4, 6, 7];
  const samples = cents.map((value, index) => ({
    targetId: note.id,
    scoreSeconds: index * 0.1,
    cents: value,
  }));

  const [result] = analysePerformance([note], samples, 60);

  assert.equal(result.sampleCount, 10);
  assert.equal(result.initialError, -19);
  assert.equal(result.settleTime, 0.1);
  assert.equal(Math.round(result.inZonePercent), 80);
  assert.match(performanceSummary([result]), /1 notes analysed/);
});

test("notes without usable samples remain explicitly unassessed", () => {
  const note = { id: "n1", onsetQuarters: 0, durationQuarters: 1, onsetTime: 0 };
  const [result] = analysePerformance([note], [], 120);

  assert.deepEqual(
    {
      sampleCount: result.sampleCount,
      averageError: result.averageError,
      initialError: result.initialError,
      settleTime: result.settleTime,
      sustainedError: result.sustainedError,
      inZonePercent: result.inZonePercent,
    },
    {
      sampleCount: 0,
      averageError: null,
      initialError: null,
      settleTime: null,
      sustainedError: null,
      inZonePercent: null,
    },
  );
});

test("GitHub Pages entry point references only present local assets", async () => {
  const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
  const references = [...html.matchAll(/(?:src|href)="(\.[^"?#]+)(?:[?#][^"]*)?"/g)]
    .map((match) => match[1])
    .map((reference) => reference.endsWith("/") ? `${reference}index.html` : reference);

  assert.ok(references.length > 0);
  await Promise.all(references.map((reference) => readFile(new URL(reference, new URL("../index.html", import.meta.url)))));
  assert.match(html, /<script type="module" src="\.\/app\.js"><\/script>/);
  assert.match(html, /<link rel="stylesheet" href="\.\/styles\.css" \/>/);
  assert.match(html, /id="tempoSlider"[^>]+max="150"/);
  for (const level of ["low", "normal", "high"]) assert.match(html, new RegExp(`data-sensitivity="${level}"`));
});
