import { AudioEngine } from "../src/audio-engine.js?v=24";
import { readScoreUrl } from "../src/musicxml.js?v=22";

const result = document.querySelector("#result");
const log = document.querySelector("#log");
const events = [];
let activeSettings = null;

function write(message) {
  log.textContent += `${message}\n`;
}

const audio = new AudioEngine({
  onPlaybackRoute: (event) => {
    events.push(event);
    write(`${event.partName.padEnd(8)} ${event.role.padEnd(13)} ${event.classification.padEnd(10)} MIDI ${event.midi}`);
    const heard = new Set(events.map(({ partId }) => partId));
    if (["S", "A", "T", "B", "P"].every((partId) => heard.has(partId))) {
      result.textContent = `PASS — all five channels reached their engines with ${activeSettings?.vocalPartId === "S" ? "Soprano" : "Bass"} selected`;
      result.dataset.state = "pass";
    }
  },
  onPlaybackEnd: () => write("Transport reached the end of the score."),
  onGuideVoiceStatus: (status) => write(`Selected guide: ${status.effectiveMode || status.sampleState}`),
});

async function loadManifest() {
  const response = await fetch("../samples/vocal-guide/index.json?v=24");
  return response.ok ? response.json() : [];
}

async function run(vocalPartId) {
  result.textContent = "Loading score and sample banks…";
  result.dataset.state = "";
  log.textContent = "";
  events.length = 0;
  try {
    const [score, manifest] = await Promise.all([
      readScoreUrl("../test/fixtures/satb.musicxml?v=24"),
      loadManifest(),
    ]);
    audio.setScore(score);
    audio.setSelectedPart(vocalPartId);
    audio.setHumanVoiceManifest(manifest);
    audio.setGuideVoice("human");
    const enabledPartIds = score.parts.filter((part) => part.id !== vocalPartId).map((part) => part.id);
    for (const part of score.parts) {
      if (part.id === vocalPartId) continue;
      audio.setPartEnabled(part.id, true);
      audio.setPartVolume(part.id, part.id === "P" ? 72 : 58);
      audio.setPartVoice(part.id, "human");
    }
    activeSettings = {
      vocalPartId,
      guideEnabled: true,
      enabledPartIds,
      assessmentMode: false,
      countInBars: 0,
      startQuarter: 0,
      endQuarter: score.durationQuarters,
    };
    await audio.play(activeSettings);
    write(`Scheduled ${score.parts.length} independent parts at ${audio.bpm} BPM.`);
  } catch (error) {
    console.error(error);
    result.textContent = `FAIL — ${error.message}`;
    result.dataset.state = "fail";
  }
}

document.querySelectorAll("[data-run]").forEach((button) => button.addEventListener("click", () => run(button.dataset.run)));
document.querySelector('[data-action="pause"]').addEventListener("click", () => { audio.pause(); write("Paused; all active channel voices released."); });
document.querySelector('[data-action="resume"]').addEventListener("click", async () => {
  if (!activeSettings) return;
  await audio.play(activeSettings);
  write("Resumed from the saved transport position.");
});
document.querySelector('[data-action="stop"]').addEventListener("click", () => { audio.stop(); write("Stopped and reset."); });

window.__playbackQa = { audio, events, run };
