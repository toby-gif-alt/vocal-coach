import { VocalGuideInstrument } from "./src/vocal-guide-instrument.js";
import {
  MARTIN_HUMAN_VOICE_BASE_URL,
  MARTIN_HUMAN_VOICE_PACK,
} from "./src/vocal-guide-sample-packs.js";

const NOTE_NAMES = Object.freeze({
  36: "C2", 43: "G2", 48: "C3", 55: "G3", 60: "C4", 62: "D4", 64: "E4", 67: "G4", 72: "C5",
});
const GUIDE_PHRASE = Object.freeze([60, 62, 64, 67, 64, 62, 60]);
const CHORD = Object.freeze([48, 55, 64, 67]);

const guideChoiceButtons = [...document.querySelectorAll("[data-guide-choice]")];
const actionButtons = [...document.querySelectorAll("[data-action]")];
const sequenceNotes = [...document.querySelectorAll("#sequenceNotes li")];
const pitchSelect = document.querySelector("#pitchSelect");
const volumeSlider = document.querySelector("#volumeSlider");
const volumeOutput = document.querySelector("#volumeOutput");
const sourceStatus = document.querySelector("#sourceStatus");
const nowPlayingLabel = document.querySelector("#nowPlayingLabel");
const nowPlayingNote = document.querySelector("#nowPlayingNote");
const nowPlayingDetail = document.querySelector("#nowPlayingDetail");
const noteDisplay = document.querySelector(".note-display");

let guide = null;
let visualTimers = [];

function setSelected(buttons, selected, attribute) {
  for (const button of buttons) {
    const active = button.dataset[attribute] === selected;
    button.classList.toggle("is-selected", active);
    button.setAttribute("aria-checked", String(active));
  }
}

function selectedGuideChoice() {
  return document.querySelector("[data-guide-choice].is-selected")?.dataset.guideChoice || "ooh";
}

function updateStatus(status) {
  const humanSelected = selectedGuideChoice() === "human";
  let message = status.message;
  let fallback = false;

  if (humanSelected && status.sampleState === "loading") {
    message = "Loading real human voice samples…";
  } else if (humanSelected && status.effectiveMode === "sampled") {
    message = "Real human voice ready — using the nearest Martin anchor for each note.";
  } else if (humanSelected) {
    message = "Real human voice unavailable — using Synthetic Ah.";
    fallback = true;
  }

  sourceStatus.textContent = message;
  sourceStatus.classList.toggle("is-fallback", fallback);
}

function clearVisualTimers() {
  for (const timer of visualTimers) window.clearTimeout(timer);
  visualTimers = [];
  for (const note of sequenceNotes) note.classList.remove("is-playing");
}

function showNote(midi, label, detail, sequenceIndex = null) {
  nowPlayingLabel.textContent = label;
  nowPlayingNote.textContent = NOTE_NAMES[midi] || `MIDI ${midi}`;
  nowPlayingDetail.textContent = detail;
  noteDisplay.classList.remove("is-playing");
  void noteDisplay.offsetWidth;
  noteDisplay.classList.add("is-playing");
  for (const note of sequenceNotes) note.classList.remove("is-playing");
  if (sequenceIndex !== null) sequenceNotes[sequenceIndex]?.classList.add("is-playing");
}

function scheduleVisual(midi, delaySeconds, label, detail, sequenceIndex = null) {
  const timer = window.setTimeout(() => showNote(midi, label, detail, sequenceIndex), delaySeconds * 1000);
  visualTimers.push(timer);
}

async function ensureGuide() {
  if (!window.Tone) throw new Error("Tone.js did not load. Check the network connection and refresh.");
  await window.Tone.start();
  if (!guide) {
    guide = new VocalGuideInstrument({
      tone: window.Tone,
      mode: "vowel",
      vowel: selectedGuideChoice() === "human" ? "ah" : selectedGuideChoice(),
      volume: Number(volumeSlider.value),
      samples: MARTIN_HUMAN_VOICE_PACK,
      sampleBaseUrl: MARTIN_HUMAN_VOICE_BASE_URL,
      onStatus: updateStatus,
    });
    updateStatus(guide.getStatus());
  }
  return guide;
}

async function selectGuideChoice(choice) {
  setSelected(guideChoiceButtons, choice, "guideChoice");
  const instrument = await ensureGuide();
  instrument.setVowel(choice === "human" ? "ah" : choice);
  const status = instrument.setMode(choice === "human" ? "sampled" : "vowel");
  updateStatus(status);
  if (choice === "human" && status.sampleState === "loading") {
    await instrument.ready;
    updateStatus(instrument.getStatus());
  }
  return instrument;
}

async function play(action) {
  try {
    const instrument = await ensureGuide();
    const choice = selectedGuideChoice();
    if (choice === "human" && instrument.getStatus().sampleState === "loading") {
      updateStatus(instrument.getStatus());
      await instrument.ready;
      updateStatus(instrument.getStatus());
    }
    const selectedMidi = Number(pitchSelect.value);
    const start = window.Tone.now() + 0.06;
    clearVisualTimers();

    if (action === "short") {
      instrument.triggerAttackRelease({ midi: selectedMidi, duration: 0.42, time: start, velocity: 0.72 });
      showNote(selectedMidi, "Short note", choice === "human" ? "Natural recorded attack with a softened release" : "A quick attack with a softened release");
    } else if (action === "sustain") {
      instrument.triggerAttackRelease({ midi: selectedMidi, duration: 3.2, time: start, velocity: 0.7 });
      showNote(selectedMidi, "Sustained vowel", choice === "human" ? "The recorded vowel loops through its stable centre" : "The formants hold steady for the full note");
    } else if (action === "chord") {
      for (const midi of CHORD) instrument.triggerAttackRelease({ midi, duration: 2.8, time: start, velocity: 0.48 });
      showNote(60, "Four-part chord", "C3 · G3 · E4 · G4");
    } else if (action === "scale") {
      GUIDE_PHRASE.forEach((midi, index) => {
        const offset = index * 0.64;
        instrument.triggerAttackRelease({ midi, duration: 0.76, time: start + offset, velocity: 0.62 });
        scheduleVisual(midi, offset, "Guide phrase", `${index + 1} of ${GUIDE_PHRASE.length} · sustained legato`, index);
      });
    }
  } catch (error) {
    sourceStatus.textContent = error.message;
    sourceStatus.classList.add("is-fallback");
  }
}

for (const button of guideChoiceButtons) {
  button.addEventListener("click", async () => {
    try {
      await selectGuideChoice(button.dataset.guideChoice);
    } catch (error) {
      sourceStatus.textContent = error.message;
      sourceStatus.classList.add("is-fallback");
    }
  });
}

for (const button of actionButtons) button.addEventListener("click", () => play(button.dataset.action));

pitchSelect.addEventListener("change", () => {
  const midi = Number(pitchSelect.value);
  nowPlayingNote.textContent = NOTE_NAMES[midi] || `MIDI ${midi}`;
  nowPlayingLabel.textContent = "Pitch selected";
  nowPlayingDetail.textContent = "Choose an audition below";
});

volumeSlider.addEventListener("input", () => {
  volumeOutput.textContent = volumeSlider.value;
  guide?.setVolume(volumeSlider.value);
});

window.addEventListener("pagehide", () => guide?.dispose());
