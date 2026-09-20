import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { test } from "node:test";

import { SALAMANDER_PIANO_SAMPLES } from "../src/piano-sample-pack.js";
import {
  SampledPianoInstrument,
  SampledPianoLibrary,
  selectNearestPianoSample,
} from "../src/sampled-piano-instrument.js";

class FakeParam {
  constructor(value = 0) { this.value = value; this.events = []; }
  setValueAtTime(value, time) { this.value = value; this.events.push({ type: "set", value, time }); }
  exponentialRampToValueAtTime(value, time) { this.value = value; this.events.push({ type: "ramp", value, time }); }
  cancelScheduledValues(time) { this.events.push({ type: "cancel", time }); }
}

class FakeNode {
  constructor(kind) { this.kind = kind; this.connections = []; this.disconnected = false; }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.connections = []; this.disconnected = true; }
}

class FakeContext {
  constructor() { this.currentTime = 1; this.destination = new FakeNode("destination"); this.sources = []; }
  createGain() { const node = new FakeNode("gain"); node.gain = new FakeParam(1); return node; }
  createBufferSource() {
    const source = new FakeNode("source");
    source.playbackRate = new FakeParam(1);
    source.started = [];
    source.stopped = [];
    source.start = (...args) => source.started.push(args);
    source.stop = (time) => source.stopped.push(time);
    source.loop = false;
    this.sources.push(source);
    return source;
  }
  async decodeAudioData() { return { duration: 12 }; }
}

function fakeTone() {
  const context = new FakeContext();
  return {
    context,
    tone: {
      getContext: () => ({ rawContext: context }),
      Time: (value) => ({ toSeconds: () => value === "192i" ? 1 : Number(value) }),
    },
  };
}

test("the Salamander subset maps all 30 requested roots and chooses nearby anchors", () => {
  assert.equal(SALAMANDER_PIANO_SAMPLES.length, 30);
  assert.deepEqual(SALAMANDER_PIANO_SAMPLES.slice(0, 4).map(({ midi }) => midi), [21, 24, 27, 30]);
  assert.equal(selectNearestPianoSample(61, SALAMANDER_PIANO_SAMPLES).midi, 60);
  assert.equal(selectNearestPianoSample(62, SALAMANDER_PIANO_SAMPLES).midi, 63);
  assert.equal(selectNearestPianoSample(106, SALAMANDER_PIANO_SAMPLES).midi, 105);
});

test("multiple piano channels share one decoded bank, keep independent gain, and never loop", async () => {
  const { tone, context } = fakeTone();
  let fetchCount = 0;
  const library = new SampledPianoLibrary({
    tone,
    samples: [{ note: "C4", midi: 60, url: "C4.mp3" }],
    fetcher: async () => {
      fetchCount += 1;
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    },
  });
  const left = new SampledPianoInstrument({ tone, library, volume: 30 });
  const right = new SampledPianoInstrument({ tone, library, volume: 80 });
  await Promise.all([left.ready, right.ready]);
  assert.equal(fetchCount, 1);
  assert.notEqual(left.masterGain.gain.value, right.masterGain.gain.value);

  left.triggerAttackRelease({ midi: 62, duration: 4, time: 2, velocity: 0.5 });
  const source = context.sources.at(-1);
  assert.equal(source.loop, false);
  assert.equal(source.playbackRate.events[0].value, 2 ** (2 / 12));
  assert.equal(source.started[0][0], 2);
  assert.ok(source.stopped[0] > 6, "release follows the requested note duration");
  left.dispose();
  right.dispose();
});

test("the committed piano recordings match their checksum inventory and include attribution", async () => {
  const directory = new URL("../samples/piano/salamander/", import.meta.url);
  const checksums = (await readFile(new URL("CHECKSUMS.sha256", directory), "utf8"))
    .trim().split("\n").map((line) => line.trim().split(/\s+/));
  const files = (await readdir(directory)).filter((name) => name.endsWith(".mp3")).sort();
  assert.equal(files.length, 30);
  assert.deepEqual(files, checksums.map(([, name]) => name).sort());
  for (const [expected, name] of checksums) {
    const actual = createHash("sha256").update(await readFile(new URL(name, directory))).digest("hex");
    assert.equal(actual, expected, name);
  }
  const readme = await readFile(new URL("README.md", directory), "utf8");
  assert.match(readme, /Alexander Holm/);
  assert.match(readme, /CC BY 3\.0/);
});
