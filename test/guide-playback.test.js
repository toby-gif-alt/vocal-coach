import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  DEFAULT_GUIDE_VOICE,
  guideNoteRequest,
  normaliseGuideVoice,
} from "../src/guide-playback.js";

test("human guide is the default and only the two studio choices are accepted", () => {
  assert.equal(DEFAULT_GUIDE_VOICE, "human");
  assert.equal(normaliseGuideVoice("human"), "human");
  assert.equal(normaliseGuideVoice("synthetic-ah"), "synthetic-ah");
  assert.equal(normaliseGuideVoice("synthetic-ooh"), "human");
});

test("SATB guide requests use each selected score part's sounding MIDI directly", () => {
  const parts = [
    { name: "Soprano", note: { midi: 72, frequency: 523.25 }, singerOctaveShift: -12 },
    { name: "Alto", note: { midi: 67, frequency: 392 }, singerOctaveShift: 12 },
    { name: "Tenor", note: { midi: 55, frequency: 196 }, singerOctaveShift: -12 },
    { name: "Bass", note: { midi: 43, frequency: 98 }, singerOctaveShift: 12 },
  ];

  for (const part of parts) {
    const request = guideNoteRequest(part.note, {
      duration: "192i",
      time: 4,
      velocity: 0.52,
      singerOctaveShift: part.singerOctaveShift,
    });
    assert.equal(request.midi, part.note.midi, `${part.name} guide pitch must not inherit the singer octave`);
  }

  const octaveTransposingTenor = guideNoteRequest({ writtenPitch: "C4", midi: 48 }, { duration: 1, time: 0 });
  assert.equal(octaveTransposingTenor.midi, 48, "the parser's sounding MIDI wins over a written pitch name");
});

test("the audio scheduler has no singer-octave input and routes guide notes through the vocal instrument", async () => {
  const source = await readFile(new URL("../src/audio-engine.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /vocalOctaveSemitones/);
  assert.doesNotMatch(source, /guideSynth/);
  assert.doesNotMatch(source, /take\?\.octaveShift/);
  assert.match(source, /guideNoteRequest\(note, \{ duration, time \}\)/);
  assert.match(source, /new VocalGuideInstrument\(/);
  assert.match(source, /vocalGuideInstrument\.triggerAttackRelease\(request\)/);
});

test("the starting-note preview also stays at the selected part's score pitch", async () => {
  const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
  assert.match(source, /audio\.previewPitch\(starting\.midi\)/);
  assert.doesNotMatch(source, /audio\.previewPitch\(starting\.midi\s*\+\s*effectiveOctaveShift\(\)\)/);
  assert.match(source, /Human voice unavailable — using Synthetic Ah\./);
});
