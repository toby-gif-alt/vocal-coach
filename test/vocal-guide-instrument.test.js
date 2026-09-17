import assert from "node:assert/strict";
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

  start(time) { this.started.push(time); }
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

test("sampled mode falls back cleanly when no voice assets are installed", () => {
  const { tone, context } = createTone();
  const guide = new VocalGuideInstrument({ tone, mode: "sampled", samples: {} });

  assert.equal(guide.getStatus().effectiveMode, "vowel");
  assert.equal(guide.getStatus().message, SAMPLE_FALLBACK_MESSAGE);
  guide.triggerAttackRelease({ midi: 60, duration: 1, time: tone.now(), velocity: 0.7 });
  assert.ok(context.nodes.some((node) => node.kind === "oscillator"), "fallback starts the harmonic vowel source");
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

  guide.triggerAttackRelease({ midi: 67, duration: 2.5, time: tone.now(), velocity: 0.6 });
  const source = context.nodes.findLast((node) => node.kind === "buffer-source");
  assert.equal(guide.effectiveMode, "sampled");
  assert.ok(Math.abs(source.playbackRate.events[0].value - (2 ** (7 / 12))) < 1e-10);
  assert.equal(source.loop, true);
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
