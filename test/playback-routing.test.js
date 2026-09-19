import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { playbackRoutes } from "../src/playback-routing.js";

const satb = ["Soprano", "Alto", "Tenor", "Bass"].map((name) => ({ id: name[0], name }));

test("SATB routing sends only the selected line to the guide and every enabled other line to accompaniment", () => {
  assert.deepEqual(
    playbackRoutes(satb, { vocalPartId: "S", guideEnabled: true, enabledPartIds: ["A", "T", "B"] })
      .map(({ part, role }) => `${part.name}:${role}`),
    ["Soprano:guide", "Alto:accompaniment", "Tenor:accompaniment", "Bass:accompaniment"],
  );
  assert.deepEqual(
    playbackRoutes(satb, { vocalPartId: "B", guideEnabled: true, enabledPartIds: ["S", "A", "T"] })
      .map(({ part, role }) => `${part.name}:${role}`),
    ["Soprano:accompaniment", "Alto:accompaniment", "Tenor:accompaniment", "Bass:guide"],
  );
});

test("mute/play-all and individual accompaniment selection are explicit scheduling inputs", () => {
  assert.deepEqual(playbackRoutes(satb, { vocalPartId: "S", guideEnabled: true, enabledPartIds: [] }).map(({ role }) => role), ["guide"]);
  assert.deepEqual(
    playbackRoutes(satb, { vocalPartId: "S", guideEnabled: false, enabledPartIds: ["A"] }).map(({ part, role }) => [part.id, role]),
    [["A", "accompaniment"]],
  );
  assert.equal(playbackRoutes(satb, { vocalPartId: "S", guideEnabled: false, enabledPartIds: ["S"] }).length, 0);
});

test("the audio scheduler verifies accompaniment synth and audible mixer gain before scheduling", async () => {
  const source = await readFile(new URL("../src/audio-engine.js", import.meta.url), "utf8");
  assert.match(source, /const enabled = enabledPartIds instanceof Set \? enabledPartIds : new Set\(enabledPartIds \|\| \[\]\)/);
  assert.match(source, /playbackRoutes\(this\.score\.parts, \{ vocalPartId, guideEnabled, enabledPartIds: enabled \}\)/);
  assert.match(source, /!synth \|\| synth\.volume\?\.value === -Infinity/);
  assert.match(source, /synth\.triggerAttackRelease\(note\.frequency, duration, time, 0\.28\)/);
});
