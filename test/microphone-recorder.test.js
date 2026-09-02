import assert from "node:assert/strict";
import { test } from "node:test";

import { AUDIO_CONFIG } from "../src/config.js";
import {
  applyMicrophoneSensitivity,
  deriveMicrophoneCalibration,
  normaliseSavedMicrophoneCalibration,
} from "../src/microphone-calibration.js";
import { SessionPerformanceRecorder } from "../src/performance-recorder.js";
import { shouldBridgeTraceSamples } from "../src/score-overlay.js";

function sungFrames(rms, clarity, frequency = 220, count = 60) {
  return Array.from({ length: count }, (_, index) => ({
    rms: rms * (0.9 + (index % 5) * 0.05),
    clarity: clarity - (index % 4) * 0.01,
    frequency: frequency * 2 ** (((index % 7) - 3) / 12000),
  }));
}

test("room plus voice calibration accepts quiet, normal, and loud stable singing", () => {
  const profiles = [
    { ambient: 0.0015, sung: 0.008, clarity: 0.76 },
    { ambient: 0.003, sung: 0.03, clarity: 0.84 },
    { ambient: 0.006, sung: 0.12, clarity: 0.9 },
  ];
  for (const profile of profiles) {
    const calibration = deriveMicrophoneCalibration({
      ambientRmsValues: Array(40).fill(profile.ambient),
      sungFrames: sungFrames(profile.sung, profile.clarity),
    });
    assert.equal(calibration.signalGood, true);
    assert.ok(calibration.openThreshold > profile.ambient);
    assert.ok(calibration.openThreshold < profile.sung);
    assert.ok(calibration.minimumClarity >= AUDIO_CONFIG.minimumClarityFloor);
    assert.ok(calibration.minimumClarity <= AUDIO_CONFIG.maximumClarityCeiling);
    assert.ok(Math.abs(calibration.stableFrequency - 220) < 0.2);
  }
});

test("microphone check asks for a retry when voice is indistinguishable from the room", () => {
  const calibration = deriveMicrophoneCalibration({
    ambientRmsValues: Array(40).fill(0.008),
    sungFrames: sungFrames(0.009, 0.57),
  });
  assert.equal(calibration.signalGood, false);
});

test("advanced sensitivity overrides remain ordered around a saved calibration", () => {
  const calibration = deriveMicrophoneCalibration({
    ambientRmsValues: Array(40).fill(0.002),
    sungFrames: sungFrames(0.03, 0.84),
  });
  const low = applyMicrophoneSensitivity(calibration, "low");
  const normal = applyMicrophoneSensitivity(calibration, "normal");
  const high = applyMicrophoneSensitivity(calibration, "high");
  assert.ok(low.openThreshold > normal.openThreshold);
  assert.ok(normal.openThreshold > high.openThreshold);
  assert.ok(low.minimumClarity > normal.minimumClarity);
  assert.ok(high.minimumClarity < normal.minimumClarity);
  assert.ok(high.reacquireAfterMs > normal.reacquireAfterMs);
  assert.ok(normaliseSavedMicrophoneCalibration(calibration));
  assert.equal(normaliseSavedMicrophoneCalibration({ ...calibration, version: 99 }), null);
});

test("trace bridging is limited to short, pitch-compatible missing spans", () => {
  const previous = { targetId: "n1", scoreSeconds: 1, cents: 8 };
  assert.equal(shouldBridgeTraceSamples(previous, { targetId: "n1", scoreSeconds: 1.1, cents: 14 }), true);
  assert.equal(shouldBridgeTraceSamples(previous, { targetId: "n1", scoreSeconds: 1.4, cents: 14 }), false);
  assert.equal(shouldBridgeTraceSamples(previous, { targetId: "n1", scoreSeconds: 1.1, cents: 120 }), false);
  assert.equal(shouldBridgeTraceSamples(previous, { targetId: "n2", scoreSeconds: 1.1, cents: 14 }), false);
});

class MockMediaRecorder extends EventTarget {
  static isTypeSupported(type) { return type.startsWith("audio/webm"); }

  constructor(stream, options = {}) {
    super();
    this.stream = stream;
    this.mimeType = options.mimeType || "audio/webm";
    this.state = "inactive";
  }

  start() { this.state = "recording"; }
  pause() { this.state = "paused"; }
  resume() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    const dataEvent = new Event("dataavailable");
    Object.defineProperty(dataEvent, "data", { value: new Blob(["voice"], { type: this.mimeType }) });
    this.dispatchEvent(dataEvent);
    this.dispatchEvent(new Event("stop"));
  }
}

test("session recording excludes paused time and produces a local playable blob", async () => {
  let now = 1000;
  const revoked = [];
  const recorder = new SessionPerformanceRecorder({
    MediaRecorderClass: MockMediaRecorder,
    createObjectURL: () => "blob:local-performance",
    revokeObjectURL: (url) => revoked.push(url),
    now: () => now,
  });
  assert.equal(recorder.start({ id: "local-stream" }), true);
  now = 3000;
  recorder.pause();
  now = 4000;
  recorder.resume();
  now = 6500;
  const recording = await recorder.stop();
  assert.equal(recording.url, "blob:local-performance");
  assert.equal(recording.durationSeconds, 4.5);
  assert.ok(recording.blob.size > 0);
  recorder.disposeRecording();
  assert.deepEqual(revoked, ["blob:local-performance"]);
});
