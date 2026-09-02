import assert from "node:assert/strict";
import { test } from "node:test";

import { midiToFrequency } from "../src/config.js";
import { detectAutocorrelationPitch, PitchDiagnosticSummary, StablePitchTracker } from "../src/pitch-tracker.js";
import { countInPattern } from "../src/timing.js";

function syntheticTone(frequency, { sampleRate = 48000, size = 4096, harmonics = true } = {}) {
  const frame = new Float32Array(size);
  for (let index = 0; index < size; index += 1) {
    const phase = 2 * Math.PI * frequency * index / sampleRate;
    frame[index] = 0.68 * Math.sin(phase)
      + (harmonics ? 0.22 * Math.sin(phase * 2 + 0.31) + 0.1 * Math.sin(phase * 3 + 0.67) : 0);
  }
  return frame;
}

function detectorCents(actual, expected) {
  return 1200 * Math.log2(actual / expected);
}

function reliableFrame(frequency, overrides = {}) {
  return {
    frequency,
    clarity: 0.98,
    rms: 0.12,
    gateOpen: true,
    capturedAt: 100,
    scoreQuarter: 0,
    scoreSeconds: 0,
    targetMidi: null,
    corroboratingFrequency: null,
    ...overrides,
  };
}

for (const [name, frequency] of [["A3", 220], ["C4", 261.63], ["A4", 440], ["C5", 523.25]]) {
  test(`synthetic ${name} tone retains its fundamental and octave`, () => {
    const detected = detectAutocorrelationPitch(syntheticTone(frequency), 48000);
    assert.ok(detected.frequency, "detector should find a frequency");
    assert.ok(Math.abs(detectorCents(detected.frequency, frequency)) < 8, `${detected.frequency} Hz should be close to ${frequency} Hz`);
    assert.ok(detected.clarity > 0.8);

    const tracker = new StablePitchTracker();
    let result;
    for (let frame = 0; frame < 6; frame += 1) {
      result = tracker.process(reliableFrame(detected.frequency, { capturedAt: 100 + frame * 46 }));
    }
    assert.equal(result.status, "accepted");
    assert.ok(Math.abs(detectorCents(result.filteredFrequency, frequency)) < 8);
  });
}

test("continuity resolves alternating doubled-frequency detector errors", () => {
  const tracker = new StablePitchTracker();
  for (let frame = 0; frame < 3; frame += 1) tracker.process(reliableFrame(220, { capturedAt: frame * 46, targetMidi: 57 }));
  const doubled = tracker.process(reliableFrame(440, {
    capturedAt: 160,
    targetMidi: 57,
    corroboratingFrequency: 220,
  }));
  assert.equal(doubled.status, "accepted");
  assert.equal(doubled.octaveCorrection, -12);
  assert.ok(Math.abs(detectorCents(doubled.filteredFrequency, 220)) < 2);
});

test("the expected note never snaps a genuinely wrong first pitch into tune", () => {
  const tracker = new StablePitchTracker();
  const wrong = tracker.process(reliableFrame(440, { targetMidi: 57 }));
  assert.equal(wrong.status, "accepted");
  assert.ok(Math.abs(detectorCents(wrong.filteredFrequency, 440)) < 1);
  assert.ok(wrong.centsError > 1190);
});

test("isolated implausible jumps are rejected but confirmed movement is retained", () => {
  const tracker = new StablePitchTracker();
  tracker.process(reliableFrame(220, { capturedAt: 0 }));
  tracker.process(reliableFrame(220, { capturedAt: 46 }));
  const isolated = tracker.process(reliableFrame(330, { capturedAt: 92 }));
  const confirmed = tracker.process(reliableFrame(330, { capturedAt: 138 }));
  assert.equal(isolated.status, "unreliable");
  assert.equal(isolated.reason, "isolated pitch jump");
  assert.equal(confirmed.status, "accepted");
});

test("a clear sung transition near the new score target is accepted without a fabricated gap", () => {
  const tracker = new StablePitchTracker();
  tracker.process(reliableFrame(220, { capturedAt: 0, targetMidi: 57 }));
  tracker.process(reliableFrame(220, { capturedAt: 46, targetMidi: 57 }));
  const transition = tracker.process(reliableFrame(329.63, { capturedAt: 92, targetMidi: 64 }));
  assert.equal(transition.status, "accepted");
  assert.ok(Math.abs(transition.filteredMidi - 64) < 0.05);
});

test("a notated octave transition is not mistaken for a harmonic detector error", () => {
  const tracker = new StablePitchTracker();
  tracker.process(reliableFrame(220, { capturedAt: 0, targetMidi: 57 }));
  tracker.process(reliableFrame(220, { capturedAt: 46, targetMidi: 57 }));
  const transition = tracker.process(reliableFrame(440, { capturedAt: 92, targetMidi: 69 }));
  assert.equal(transition.status, "accepted");
  assert.equal(transition.octaveCorrection, 0);
  assert.ok(Math.abs(transition.filteredMidi - 69) < 0.05);
});

test("short median filtering preserves a gradual five-frame vocal movement", () => {
  const tracker = new StablePitchTracker();
  const centsPath = [-40, -28, -15, -5, 0];
  const filtered = centsPath.map((cents, index) => tracker.process(reliableFrame(
    440 * 2 ** (cents / 1200),
    { capturedAt: index * 46, targetMidi: 69 },
  ))).map((sample) => sample.centsError);
  assert.ok(filtered.every((value, index) => index === 0 || value >= filtered[index - 1]));
  assert.ok(filtered.at(-1) > -8 && filtered.at(-1) <= 0.5);
});

test("the tracker exposes an explicit no-reliable-pitch state", () => {
  const tracker = new StablePitchTracker();
  assert.equal(tracker.process(reliableFrame(220, { gateOpen: false })).status, "unreliable");
  assert.equal(tracker.process(reliableFrame(220, { clarity: 0.5 })).reason, "low clarity");
});

test("a calibrated clarity threshold preserves a quiet stable voice through a brief dropout", () => {
  const tracker = new StablePitchTracker({ minimumClarity: 0.69, reacquireAfterMs: 520 });
  const first = tracker.process(reliableFrame(220, { clarity: 0.72, capturedAt: 0 }));
  const missing = tracker.process(reliableFrame(220, { clarity: 0.5, capturedAt: 46 }));
  const recovered = tracker.process(reliableFrame(220.4, { clarity: 0.71, capturedAt: 92 }));
  assert.equal(first.status, "accepted");
  assert.equal(missing.status, "unreliable");
  assert.equal(recovered.status, "accepted");
  assert.ok(Math.abs(recovered.filteredMidi - first.filteredMidi) < 0.1);
});

test("an established voice can continue near the close gate with modestly lower clarity", () => {
  const tracker = new StablePitchTracker({ minimumClarity: 0.78 });
  for (let index = 0; index < 3; index += 1) {
    tracker.process(reliableFrame(220, { capturedAt: index * 46 }));
  }
  const continued = tracker.process(reliableFrame(220.5, {
    capturedAt: 138,
    rms: 0.006,
    gateOpen: false,
    continuationGateOpen: true,
    clarity: 0.7,
  }));
  assert.equal(continued.status, "accepted");
  assert.equal(continued.acceptanceMode, "continuation");
  assert.equal(continued.reason, "continued established voice");
});

test("weak unrelated sound cannot continue an established voice", () => {
  const tracker = new StablePitchTracker({ minimumClarity: 0.78 });
  for (let index = 0; index < 3; index += 1) {
    tracker.process(reliableFrame(220, { capturedAt: index * 46 }));
  }
  const noise = tracker.process(reliableFrame(300, {
    capturedAt: 138,
    gateOpen: false,
    continuationGateOpen: true,
    clarity: 0.7,
  }));
  assert.equal(noise.status, "unreliable");
  assert.equal(noise.reason, "isolated pitch jump");
});

test("continuation expires and cannot acquire arbitrary quiet room pitch", () => {
  const tracker = new StablePitchTracker({ minimumClarity: 0.78 });
  for (let index = 0; index < 3; index += 1) {
    tracker.process(reliableFrame(220, { capturedAt: index * 46 }));
  }
  const stale = tracker.process(reliableFrame(220, {
    capturedAt: 600,
    gateOpen: false,
    continuationGateOpen: true,
    clarity: 0.72,
  }));
  assert.equal(stale.status, "unreliable");
  assert.equal(stale.reason, "below noise gate");
});

test("soft continuation cannot perpetuate itself without a fresh strict frame", () => {
  const tracker = new StablePitchTracker({ minimumClarity: 0.78, continuationWindowMs: 360 });
  for (let index = 0; index < 3; index += 1) {
    tracker.process(reliableFrame(220, { capturedAt: index * 46 }));
  }
  for (const capturedAt of [138, 230, 320]) {
    const continued = tracker.process(reliableFrame(220, {
      capturedAt,
      gateOpen: false,
      continuationGateOpen: true,
      clarity: 0.7,
    }));
    assert.equal(continued.status, "accepted");
  }
  const expired = tracker.process(reliableFrame(220, {
    capturedAt: 470,
    gateOpen: false,
    continuationGateOpen: true,
    clarity: 0.7,
  }));
  assert.equal(expired.status, "unreliable");
  assert.equal(expired.reason, "below noise gate");
});

test("pitch diagnostic summary reports rejection causes and usable percentage", () => {
  const summary = new PitchDiagnosticSummary();
  summary.add({ status: "unreliable", reason: "below noise gate" });
  summary.add({ status: "unreliable", reason: "low clarity" });
  summary.add({ status: "accepted", reason: "stable pitch" });
  summary.add({ status: "accepted", reason: "octave ambiguity resolved by continuity", octaveCorrection: -12 });
  assert.deepEqual(summary.snapshot(), {
    belowGate: 1,
    lowClarity: 1,
    isolatedJump: 0,
    octaveAmbiguity: 1,
    outOfRange: 0,
    accepted: 1,
    total: 4,
    usable: 2,
    usablePercent: 50,
  });
});

test("count-in follows simple and compound time signatures", () => {
  assert.equal(countInPattern({ beats: 4, beatType: 4 }, 1).pulses.length, 4);
  assert.equal(countInPattern({ beats: 3, beatType: 4 }, 2).pulses.length, 6);
  const sixEight = countInPattern({ beats: 6, beatType: 8 }, 1);
  assert.equal(sixEight.pulses.length, 2);
  assert.equal(sixEight.pulseQuarters, 1.5);
  assert.equal(sixEight.compound, true);
  assert.equal(countInPattern({ beats: 4, beatType: 4 }, 0).pulses.length, 0);
});
