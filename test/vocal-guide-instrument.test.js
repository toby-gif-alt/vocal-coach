import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { test } from "node:test";

import {
  SAMPLE_FALLBACK_MESSAGE,
  VOWEL_PRESETS,
  VocalGuideInstrument,
  clampVolume,
  frequencyToMidi,
  getVowelPreset,
  midiToFrequency,
  normaliseSamplePack,
  noteNameToMidi,
  selectNearestSampleAnchor,
} from "../src/vocal-guide-instrument.js";
import {
  MARTIN_HUMAN_VOICE_BASE_URL,
  MARTIN_HUMAN_VOICE_PACK,
} from "../src/vocal-guide-sample-packs.js";

class FakeAudioParam {
  constructor(value = 0) {
    this.value = value;
    this.events = [];
  }

  setValueAtTime(value, time) {
    this.value = value;
    this.events.push({ type: "set", value, time });
  }

  linearRampToValueAtTime(value, time) {
    this.value = value;
    this.events.push({ type: "ramp", value, time });
  }

  cancelScheduledValues(time) {
    this.events.push({ type: "cancel", time });
  }
}

class FakeNode {
  constructor(kind) {
    this.kind = kind;
    this.connections = [];
    this.disconnected = false;
  }

  connect(node) {
    this.connections.push(node);
    return node;
  }

  disconnect() {
    this.disconnected = true;
    this.connections = [];
  }
}

class FakeSourceNode extends FakeNode {
  constructor(kind) {
    super(kind);
    this.started = [];
    this.stopped = [];
    this.onended = null;
  }

  start(...args) { this.started.push(args); }
  stop(time) { this.stopped.push(time); }
}

class FakeAudioContext {
  constructor() {
    this.currentTime = 2;
    this.sampleRate = 48000;
    this.destination = new FakeNode("destination");
    this.nodes = [this.destination];
  }

  add(node) {
    this.nodes.push(node);
    return node;
  }

  createGain() {
    const node = new FakeNode("gain");
    node.gain = new FakeAudioParam(1);
    return this.add(node);
  }

  createBiquadFilter() {
    const node = new FakeNode("filter");
    node.frequency = new FakeAudioParam();
    node.Q = new FakeAudioParam();
    return this.add(node);
  }

  createDynamicsCompressor() {
    const node = new FakeNode("compressor");
    for (const parameter of ["threshold", "knee", "ratio", "attack", "release"]) node[parameter] = new FakeAudioParam();
    return this.add(node);
  }

  createOscillator() {
    const node = new FakeSourceNode("oscillator");
    node.frequency = new FakeAudioParam();
    node.setPeriodicWave = (wave) => { node.periodicWave = wave; };
    return this.add(node);
  }

  createBufferSource() {
    const node = new FakeSourceNode("buffer-source");
    node.playbackRate = new FakeAudioParam(1);
    return this.add(node);
  }

  createPeriodicWave(real, imaginary) {
    return { real, imaginary };
  }

  createBuffer(channels, frameCount, sampleRate) {
    const data = new Float32Array(frameCount);
    return { duration: frameCount / sampleRate, getChannelData: () => data };
  }

  async decodeAudioData() {
    return { duration: 3.2 };
  }
}

function createTone() {
  const context = new FakeAudioContext();
  return {
    context,
    tone: {
      getContext: () => ({ rawContext: context }),
      now: () => context.currentTime + 0.05,
      Time: (value) => ({ toSeconds: () => value === "4n" ? 0.5 : Number(value) }),
    },
  };
}

test("MIDI, frequency, and note-name mapping cover SATB guide pitches", () => {
  for (const midi of [36, 48, 60, 69, 72, 84]) {
    assert.ok(Math.abs(frequencyToMidi(midiToFrequency(midi)) - midi) < 1e-10);
  }
  assert.equal(noteNameToMidi("C2"), 36);
  assert.equal(noteNameToMidi("G3"), 55);
  assert.equal(noteNameToMidi("C4"), 60);
  assert.equal(noteNameToMidi("Bb4"), 70);
});

test("vowel preset selection exposes Ooh, Oh, and Ah with fixed formants", () => {
  assert.deepEqual(Object.keys(VOWEL_PRESETS), ["ooh", "oh", "ah"]);
  assert.equal(getVowelPreset("OO").label, "Ooh");
  assert.equal(getVowelPreset("oh").label, "Oh");
  assert.equal(getVowelPreset("a").label, "Ah");
  assert.equal(getVowelPreset("not-a-vowel").label, "Ooh");
  assert.equal(getVowelPreset("ah").formants[0].frequency, 750);
});

test("sample packs accept arbitrary anchors and choose the nearest pitch", () => {
  const pack = normaliseSamplePack({ ooh: { D2: "D2.wav", A3: "A3.wav", "73": "C#5.wav" } }, "./voice/");
  const anchors = pack.get("ooh");
  assert.deepEqual(anchors.map(({ midi }) => midi), [38, 57, 73]);
  assert.equal(selectNearestSampleAnchor(55, anchors).midi, 57);
  assert.equal(selectNearestSampleAnchor(70, anchors).midi, 73);
  assert.equal(selectNearestSampleAnchor(65, anchors).midi, 57, "ties prefer the lower anchor");
});

test("Martin human voice pack contains the five attributed anchors with correct roots", async () => {
  const expected = {
    "A4.wav": { midi: 69, sha256: "2564e8fa563ce0578c636304657a482c30de538c09bb851013a162ac59489bde" },
    "B3.wav": { midi: 59, sha256: "2a94fe05d1918f2f83dc3d70bec2a06f32241be4aafb047a9131d7bf03f09cc3" },
    "C3.wav": { midi: 48, sha256: "03b4a7cfbd00235b54e118fed5588ab264f7e3af48375dc0bf9d21b17be1e28b" },
    "E3.wav": { midi: 52, sha256: "1ffad60e509debb9ebe6037ce1a45f798afac1ffa88401b646d9a2de2d9f4d24" },
    "F3.wav": { midi: 53, sha256: "f74a8af91c43727c172a5728f04a779ad6f4335e3443b6742773d0498343f40d" },
  };
  const sampleDirectory = new URL("../samples/vocal-guide/martin/", import.meta.url);
  const files = (await readdir(sampleDirectory)).filter((file) => file.endsWith(".wav")).sort();
  assert.deepEqual(files, Object.keys(expected).sort());
  assert.equal(MARTIN_HUMAN_VOICE_BASE_URL, "./samples/vocal-guide/martin/");

  for (const file of files) {
    const descriptor = Object.values(MARTIN_HUMAN_VOICE_PACK.ah).find((anchor) => anchor.url === file);
    assert.ok(descriptor, `${file} is mapped by the sample pack`);
    assert.equal(descriptor.midi, expected[file].midi);
    assert.ok(descriptor.loopStart > 0);
    assert.ok(descriptor.loopEnd > descriptor.loopStart);
    const bytes = await readFile(new URL(file, sampleDirectory));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), expected[file].sha256);
    if (file === "F3.wav") {
      const dataOffset = bytes.indexOf(Buffer.from("data")) + 8;
      const sampleRate = bytes.readUInt32LE(24);
      const sampleAt = (seconds) => bytes.readInt16LE(dataOffset + Math.round(seconds * sampleRate) * 2);
      const startSample = Math.round(descriptor.loopStart * sampleRate);
      const endSample = Math.round(descriptor.loopEnd * sampleRate);
      assert.ok(sampleAt(descriptor.loopStart - (1 / sampleRate)) <= 0 && sampleAt(descriptor.loopStart) > 0);
      assert.ok(sampleAt(descriptor.loopEnd - (1 / sampleRate)) <= 0 && sampleAt(descriptor.loopEnd) > 0);
      assert.ok(Math.abs(sampleAt(descriptor.loopStart)) <= 32);
      assert.ok(Math.abs(sampleAt(descriptor.loopEnd)) <= 32);
      assert.ok(endSample - startSample > sampleRate * 0.35, "the stable loop is long enough to avoid a rapid repetition");
    }
  }

  const anchors = normaliseSamplePack(MARTIN_HUMAN_VOICE_PACK, MARTIN_HUMAN_VOICE_BASE_URL).get("ah");
  for (const [requested, expectedRoot] of [[52, 52], [53, 53], [54, 53], [55, 53], [56, 53], [57, 59], [59, 59]]) {
    assert.equal(selectNearestSampleAnchor(requested, anchors).midi, expectedRoot, `MIDI ${requested} uses root ${expectedRoot}`);
  }
  const g3Anchor = selectNearestSampleAnchor(55, anchors);
  assert.equal(g3Anchor.url.endsWith("/F3.wav"), true);
  assert.equal(2 ** ((55 - g3Anchor.midi) / 12), 2 ** (2 / 12), "G3 transposes F3 upward by exactly two semitones");
  assert.equal(MARTIN_HUMAN_VOICE_PACK.ah.F3.gain, 0.64);
  assert.equal(MARTIN_HUMAN_VOICE_PACK.ah.F3.loopStart, 0.332200);
  assert.equal(MARTIN_HUMAN_VOICE_PACK.ah.F3.loopEnd, 0.709683);
});

test("standalone demo defaults to real voice with Synthetic Ah as its only comparison", async () => {
  const html = await readFile(new URL("../vocal-guide-demo.html", import.meta.url), "utf8");
  for (const label of ["Synthetic Ah", "Real human voice"]) {
    assert.match(html, new RegExp(`>${label}<`));
  }
  assert.match(html, /human-voice is-selected[^>]+data-guide-choice="human"/);
  assert.doesNotMatch(html, />Synthetic Ooh</);
  assert.doesNotMatch(html, />Synthetic Oh</);
  assert.doesNotMatch(html, />Sampled voice</);
});

test("sampled mode falls back cleanly when no voice assets are installed", () => {
  const { tone, context } = createTone();
  const guide = new VocalGuideInstrument({ tone, mode: "sampled", samples: {} });

  assert.equal(guide.getStatus().effectiveMode, "vowel");
  assert.equal(guide.getStatus().message, SAMPLE_FALLBACK_MESSAGE);
  guide.triggerAttackRelease({ midi: 60, duration: 1, time: tone.now(), velocity: 0.7 });
  assert.ok(context.nodes.some((node) => node.kind === "oscillator"), "fallback starts the harmonic vowel source");
  guide.dispose();
});

test("generated MP3 anchors use the existing fetch and Web Audio decode path", async () => {
  const { tone } = createTone();
  const requested = [];
  const guide = new VocalGuideInstrument({
    tone,
    mode: "sampled",
    vowel: "ah",
    samples: { ah: { C4: { url: "./samples/vocal-guide/female/C4.mp3", midi: 60 } } },
    fetcher: async (url) => {
      requested.push(url);
      return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
    },
  });
  await guide.ready;

  assert.deepEqual(requested, ["./samples/vocal-guide/female/C4.mp3"]);
  assert.equal(guide.getStatus().sampleState, "ready");
  assert.equal(guide.effectiveMode, "sampled");
  guide.dispose();
});

test("predecoded sample anchors select and transpose without a network request", async () => {
  const { tone, context } = createTone();
  const sample = { duration: 3.4 };
  const guide = new VocalGuideInstrument({
    tone,
    mode: "sampled",
    vowel: "ooh",
    samples: { ooh: { C4: { buffer: sample } } },
    fetcher: null,
  });
  await guide.ready;

  guide.triggerAttackRelease({ midi: 60, duration: 2.5, time: tone.now(), velocity: 0.6 });
  const source = context.nodes.findLast((node) => node.kind === "buffer-source");
  assert.equal(guide.effectiveMode, "sampled");
  assert.equal(source.playbackRate.events[0].value, 1);
  assert.equal(source.loop, undefined, "a recording long enough for the note is not looped");
  assert.deepEqual(source.started[0], [tone.now(), 0]);
  guide.dispose();
});

test("a note longer than its recording crossfades late sustain segments without repeating the attack", async () => {
  const { tone, context } = createTone();
  const guide = new VocalGuideInstrument({
    tone,
    mode: "sampled",
    vowel: "ah",
    samples: { ah: { C4: { buffer: { duration: 1.2 }, loop: "adaptive" } } },
    fetcher: null,
  });
  await guide.ready;

  guide.triggerAttackRelease({ midi: 60, duration: 3.5, time: tone.now(), velocity: 0.6 });
  const sources = context.nodes.filter((node) => node.kind === "buffer-source");
  const segmentGains = context.nodes.filter((node) => node.kind === "gain" && node !== guide.masterGain)
    .filter((node) => node.gain.events.some((event) => event.type === "ramp" && event.value === 1));
  assert.ok(sources.length > 1, "long notes use more than one source segment");
  assert.deepEqual(sources[0].started[0], [tone.now(), 0], "the first source preserves the natural attack");
  assert.ok(sources.slice(1).every((source) => source.started[0][1] > 0), "extension segments begin inside the stable sustain");
  assert.ok(sources.every((source) => source.loop !== true), "native BufferSource looping is not used");
  assert.ok(segmentGains.length > 0, "overlapping sustain segments receive crossfade ramps");
  guide.dispose();
});

test("volume clamps to the public 0–100 range", () => {
  assert.equal(clampVolume(-8), 0);
  assert.equal(clampVolume(46), 46);
  assert.equal(clampVolume(180), 100);
  const { tone } = createTone();
  const guide = new VocalGuideInstrument({ tone });
  assert.equal(guide.setVolume(140), 100);
  assert.equal(guide.volume, 100);
  assert.equal(guide.setVolume(-2), 0);
  assert.equal(guide.masterGain.gain.value, 0);
  guide.dispose();
});

test("long notes sustain until their requested duration and dispose releases resources", () => {
  const { tone, context } = createTone();
  const guide = new VocalGuideInstrument({ tone, vowel: "ooh" });
  guide.triggerAttackRelease({ midi: 48, duration: 4, time: tone.now(), velocity: 0.65 });

  const [voice] = guide.activeVoices;
  const finalRamp = voice.envelope.gain.events.filter((event) => event.type === "ramp").at(-1);
  assert.ok(finalRamp.time >= tone.now() + 4, "the release begins only after the full sustain duration");
  assert.equal(guide.activeVoiceCount, 1);

  guide.dispose();
  assert.equal(guide.disposed, true);
  assert.equal(guide.activeVoiceCount, 0);
  assert.equal(guide.masterGain.disconnected, true);
  assert.ok(context.nodes.filter((node) => node.kind === "oscillator").every((node) => node.stopped.length > 0));
  assert.throws(() => guide.triggerAttackRelease({ midi: 60, duration: 1 }), /disposed/);
});
