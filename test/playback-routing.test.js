import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { classifyPlaybackPart, playbackRoutes } from "../src/playback-routing.js";

const satbPiano = ["Soprano", "Alto", "Tenor", "Bass", "Piano"].map((name) => ({ id: name[0], name }));

test("part classification recognises vocal families and sampled-piano routes", () => {
  for (const name of ["Soprano", "Mezzo-Soprano", "Alto", "Contralto", "Tenor", "Baritone", "Bass", "Voice 1", "Vocal", "Mixed Choir", "Choral Ensemble"]) {
    assert.equal(classifyPlaybackPart({ name }), "vocal", name);
  }
  for (const name of ["Piano", "Pianoforte", "Grand Piano", "Keyboard 1", "Keyboards", "Keys"]) assert.equal(classifyPlaybackPart({ name }), "piano", name);
  for (const name of ["Violin", "Flute", "Accompaniment"]) assert.equal(classifyPlaybackPart({ name }), "instrument", name);
});

test("SATB and piano routes coexist when either Soprano or Bass is selected", () => {
  assert.deepEqual(
    playbackRoutes(satbPiano, { vocalPartId: "S", guideEnabled: true, enabledPartIds: ["A", "T", "B", "P"] })
      .map(({ part, role, classification }) => `${part.name}:${role}:${classification}`),
    ["Soprano:guide:vocal", "Alto:accompaniment:vocal", "Tenor:accompaniment:vocal", "Bass:accompaniment:vocal", "Piano:accompaniment:piano"],
  );
  assert.deepEqual(
    playbackRoutes(satbPiano, { vocalPartId: "B", guideEnabled: true, enabledPartIds: ["S", "A", "T", "P"] })
      .map(({ part, role, classification }) => `${part.name}:${role}:${classification}`),
    ["Soprano:accompaniment:vocal", "Alto:accompaniment:vocal", "Tenor:accompaniment:vocal", "Bass:guide:vocal", "Piano:accompaniment:piano"],
  );
});

test("mute/play-all and individual accompaniment selection are explicit scheduling inputs", () => {
  assert.deepEqual(playbackRoutes(satbPiano, { vocalPartId: "S", guideEnabled: true, enabledPartIds: [] }).map(({ role }) => role), ["guide"]);
  assert.deepEqual(
    playbackRoutes(satbPiano, { vocalPartId: "S", guideEnabled: false, enabledPartIds: ["A"] }).map(({ part, role }) => [part.id, role]),
    [["A", "accompaniment"]],
  );
  assert.equal(playbackRoutes(satbPiano, { vocalPartId: "S", guideEnabled: false, enabledPartIds: ["S"] }).length, 0);
});

test("the audio scheduler uses explicit routes and never inspects gain to decide scheduling", async () => {
  const source = await readFile(new URL("../src/audio-engine.js", import.meta.url), "utf8");
  assert.match(source, /const enabled = enabledPartIds instanceof Set \? enabledPartIds : new Set\(enabledPartIds \|\| \[\]\)/);
  assert.match(source, /playbackRoutes\(this\.score\.parts, \{ vocalPartId, guideEnabled, enabledPartIds: enabled \}\)/);
  assert.doesNotMatch(source, /this\.synths|volume\?\.value|=== -Infinity/);
  assert.match(source, /this\.partEngines\.get\(part\.id\)/);
  assert.match(source, /channel\.instrument\.triggerAttackRelease\(request\)/);
  assert.match(source, /channel\.instrument\.triggerAttackRelease\(\{ midi: note\.midi/);
});
