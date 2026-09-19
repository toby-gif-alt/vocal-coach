import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  DEFAULT_GUIDE_VOICE,
  chooseHumanVoiceBank,
  explicitVoiceBank,
  guideNoteRequest,
  normaliseGuideVoice,
  samplePackForVoiceBank,
  voiceBankShiftCost,
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

test("part labels choose the intended hidden human voice bank", () => {
  for (const name of ["Bass", "Baritone Solo", "Tenor 1", "TENOR II", "male voice"]) {
    assert.equal(explicitVoiceBank(name), "male", name);
  }
  for (const name of ["Alto", "Contralto II", "Mezzo", "Mezzo-Soprano", "Soprano Solo", "female voice"]) {
    assert.equal(explicitVoiceBank(name), "female", name);
  }
  assert.equal(explicitVoiceBank("Voice"), null);
});

test("generic vocal parts choose the bank needing the least sample transposition", () => {
  const manifest = [
    ...[40, 45, 50, 55, 60, 64].map((rootMidi) => ({ bank: "male", rootMidi, note: `M${rootMidi}`, file: `./male/${rootMidi}.mp3` })),
    ...[60, 65, 69, 72, 77, 81].map((rootMidi) => ({ bank: "female", rootMidi, note: `F${rootMidi}`, file: `./female/${rootMidi}.mp3` })),
  ];
  const lowVoice = { name: "Voice 1", vocalTimeline: [42, 47, 52, 57, 62].map((midi) => ({ midi })) };
  const highVoice = { name: "Solo voice", vocalTimeline: [67, 70, 74, 79].map((midi) => ({ midi })) };
  assert.equal(chooseHumanVoiceBank(lowVoice, manifest), "male");
  assert.equal(chooseHumanVoiceBank(highVoice, manifest), "female");
  assert.deepEqual(voiceBankShiftCost([60, 62, 64], [60, 64]), { median: 0, average: 2 / 3, maximum: 2 });
});

test("generated bank entries become adaptive Ah anchors without changing MIDI", () => {
  const manifest = [
    { bank: "male", rootMidi: 53, note: "F3", file: "./samples/vocal-guide/male/F3.mp3" },
    { bank: "female", rootMidi: 60, note: "C4", file: "./samples/vocal-guide/female/C4.mp3" },
  ];
  assert.deepEqual(samplePackForVoiceBank(manifest, "male"), {
    ah: { "F3-0": { url: "./samples/vocal-guide/male/F3.mp3", midi: 53, loop: "adaptive" } },
  });
  assert.deepEqual(samplePackForVoiceBank(manifest, "other"), {});
  assert.equal(guideNoteRequest({ midi: 55 }, { duration: 1, time: 0 }).midi, 55);
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
