import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

// Replace only the CDN detector dependency: exercise the real playback method
// with a transport double, without requiring a browser audio device.
const url = new URL("../src/audio-engine.js", import.meta.url);
const source = (await readFile(url, "utf8"))
  .replace('"../vendor/pitchy.mjs"', '"data:text/javascript,export const PitchDetector = {}"')
  .replace(/from "(\.\/[^\"]+)"/g, (_, relative) => `from "${new URL(relative.split("?")[0], url).href}"`);
const { AudioEngine } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);

function playbackDouble() {
  return {
    score: { parts: [{ id: "voice", name: "Voice" }], initialTimeSignature: { beats: 4, beatType: 4 } },
    stopReview() {}, tone: { async start() {} }, ensurePlaybackEngines() {},
    async ensureRoutesReady() {}, async ensureGuideReady() {}, scheduleScore() {},
    bpm: 120, transport: { bpm: { value: 0 }, PPQ: 192, start() { this.started = true; } },
    async startMicrophone() { throw Object.assign(new Error("No device"), { name: "NotFoundError" }); },
  };
}

test("Listen playback starts even when microphone acquisition would fail", async () => {
  const engine = playbackDouble();
  await AudioEngine.prototype.play.call(engine, { vocalPartId: "voice", guideEnabled: true, assessmentMode: false, countInBars: 0, startQuarter: 0 });
  assert.equal(engine.transport.started, true);
  assert.equal(engine.isPlaying, true);
});

test("microphone acquisition errors are marked for the Listen fallback", async () => {
  await assert.rejects(AudioEngine.prototype.play.call(playbackDouble(), { vocalPartId: "voice", assessmentMode: true }), (error) => error.name === "NotFoundError" && error.microphoneUnavailable === true);
});
