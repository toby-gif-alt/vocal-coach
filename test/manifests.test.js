import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  buildRepertoireManifest,
  buildVoiceManifest,
  generateManifests,
  parsePitchFilename,
  titleFromMusicXml,
} from "../scripts/generate-manifests.mjs";

test("vocal sample filenames support naturals, sharps, s-sharps, and flats", () => {
  assert.deepEqual(parsePitchFilename("C4.mp3"), { note: "C4", midi: 60 });
  assert.deepEqual(parsePitchFilename("Cs4.mp3"), { note: "C#4", midi: 61 });
  assert.deepEqual(parsePitchFilename("F#3.MP3"), { note: "F#3", midi: 54 });
  assert.deepEqual(parsePitchFilename("Db4.mp3"), { note: "Db4", midi: 61 });
  assert.equal(parsePitchFilename("voice.mp3"), null);
});

test("score titles prefer work-title, then movement-title, then a cleaned filename", () => {
  assert.equal(titleFromMusicXml("<work><work-title>A &amp; B</work-title></work><movement-title>Ignored</movement-title>", "fallback.musicxml"), "A & B");
  assert.equal(titleFromMusicXml("<movement-title>Second Movement</movement-title>", "fallback.musicxml"), "Second Movement");
  assert.equal(titleFromMusicXml("<score-partwise/>", "holy_forever.musicxml"), "holy forever");
});

test("manifest generation scans both sample banks and sorts repertoire deterministically", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "vocal-coach-manifests-"));
  try {
    await mkdir(path.join(root, "samples", "vocal-guide", "male"), { recursive: true });
    await mkdir(path.join(root, "samples", "vocal-guide", "female"), { recursive: true });
    await mkdir(path.join(root, "repertoire"), { recursive: true });
    await writeFile(path.join(root, "samples", "vocal-guide", "male", "E2.mp3"), "");
    await writeFile(path.join(root, "samples", "vocal-guide", "female", "Cs4.mp3"), "");
    await writeFile(path.join(root, "repertoire", "zulu.mxl"), "");
    await writeFile(path.join(root, "repertoire", "alpha.musicxml"), "<score-partwise><movement-title>Alpha Song</movement-title></score-partwise>");

    assert.deepEqual(await buildVoiceManifest(root), [
      { file: "./samples/vocal-guide/female/Cs4.mp3", note: "C#4", rootMidi: 61, bank: "female" },
      { file: "./samples/vocal-guide/male/E2.mp3", note: "E2", rootMidi: 40, bank: "male" },
    ]);
    assert.deepEqual(await buildRepertoireManifest(root), [
      { title: "Alpha Song", file: "./repertoire/alpha.musicxml" },
      { title: "zulu", file: "./repertoire/zulu.mxl" },
    ]);

    await generateManifests({ root });
    await generateManifests({ root, check: true });
    assert.match(await readFile(path.join(root, "samples", "vocal-guide", "index.json"), "utf8"), /"rootMidi": 61/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("checked-in manifests match the repository contents", async () => {
  await generateManifests({ root: fileURLToPath(new URL("../", import.meta.url)), check: true });
});
