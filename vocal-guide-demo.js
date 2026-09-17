import { VocalGuideInstrument } from "./src/vocal-guide-instrument.js";

const NOTE_NAMES = Object.freeze({
  36: "C2", 43: "G2", 48: "C3", 55: "G3", 60: "C4", 62: "D4", 64: "E4", 67: "G4", 72: "C5",
});
const GUIDE_PHRASE = Object.freeze([60, 62, 64, 67, 64, 62, 60]);
const CHORD = Object.freeze([48, 55, 64, 67]);

const modeButtons = [...document.querySelectorAll("[data-mode]")];
const vowelButtons = [...document.querySelectorAll("[data-vowel]")];
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

function updateStatus(status) {
  sourceStatus.textContent = status.message;
  sourceStatus.classList.toggle("is-fallback", status.mode === "sampled" && status.effectiveMode !== "sampled");
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
      mode: document.querySelector("[data-mode].is-selected")?.dataset.mode || "vowel",
      vowel: document.querySelector("[data-vowel].is-selected")?.dataset.vowel || "ooh",
      volume: Number(volumeSlider.value),
      // Add a future teacher pack here. With no map installed, sampled mode
      // intentionally reports its state and uses the synthetic vowel engine.
      samples: {},
      onStatus: updateStatus,
    });
    updateStatus(guide.getStatus());
  }
  return guide;
}

async function play(action) {
  try {
    const instrument = await ensureGuide();
    const selectedMidi = Number(pitchSelect.value);
    const start = window.Tone.now() + 0.06;
    clearVisualTimers();

    if (action === "short") {
      instrument.triggerAttackRelease({ midi: selectedMidi, duration: 0.42, time: start, velocity: 0.72 });
      showNote(selectedMidi, "Short note", "A quick attack with a softened release");
    } else if (action === "sustain") {
      instrument.triggerAttackRelease({ midi: selectedMidi, duration: 3.2, time: start, velocity: 0.7 });
      showNote(selectedMidi, "Sustained vowel", "The formants hold steady for the full note");
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

for (const button of modeButtons) {
  button.addEventListener("click", async () => {
    setSelected(modeButtons, button.dataset.mode, "mode");
    const instrument = await ensureGuide();
    updateStatus(instrument.setMode(button.dataset.mode));
  });
}

for (const button of vowelButtons) {
  button.addEventListener("click", async () => {
    setSelected(vowelButtons, button.dataset.vowel, "vowel");
    const instrument = await ensureGuide();
    updateStatus(instrument.setVowel(button.dataset.vowel));
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
