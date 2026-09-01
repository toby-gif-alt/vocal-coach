import { AudioEngine } from "./src/audio-engine.js";
import { analysePerformance, performanceSummary } from "./src/analysis.js";
import {
  colourForCents,
  DEBUG_CONFIG,
  DEFAULT_COUNT_IN_BARS,
  DEFAULT_MICROPHONE_SENSITIVITY,
  DEFAULT_OCTAVE_SHIFT,
  PLAYBACK_CONFIG,
  SESSION_MODES,
  formatTime,
  frequencyToMidi,
  midiToName,
  PITCH_THRESHOLDS,
} from "./src/config.js";
import { measureAtQuarter, noteAtQuarter, readScoreFile, readScoreUrl, suggestVocalPart } from "./src/musicxml.js";
import { detectAutocorrelationPitch, StablePitchTracker } from "./src/pitch-tracker.js";
import { cursorIndexAtTimestamp, osmdTimestampToQuarters, quartersToOsmdTimestamp } from "./src/timing.js";

const TIMING_DEBUG_ENABLED = new URLSearchParams(window.location.search).get("debugTiming") === "1";
const PITCH_DEBUG_ENABLED = new URLSearchParams(window.location.search).get("debugPitch") === "1";

const MODE_CONFIG = SESSION_MODES;

const $ = (selector) => document.querySelector(selector);
const els = {
  uploadView: $("#uploadView"), loadingView: $("#loadingView"), partView: $("#partView"), studioView: $("#studioView"),
  loadingTitle: $("#loadingTitle"), loadingMessage: $("#loadingMessage"), scoreInput: $("#scoreInput"), sampleButton: $("#sampleButton"),
  partBackButton: $("#partBackButton"), partCount: $("#partCount"), scoreTitle: $("#scoreTitle"), partOptions: $("#partOptions"), continueButton: $("#continueButton"),
  newScoreButton: $("#newScoreButton"), studioTitle: $("#studioTitle"), studioMeta: $("#studioMeta"), selectedPartName: $("#selectedPartName"), scoreBannerPart: $("#scoreBannerPart"),
  modeButtons: [...document.querySelectorAll("[data-mode]")], accompanimentList: $("#accompanimentList"), toggleAllParts: $("#toggleAllParts"),
  guideVolume: $("#guideVolume"), guideVolumeOutput: $("#guideVolumeOutput"), accompanimentVolume: $("#accompanimentVolume"), accompanimentVolumeOutput: $("#accompanimentVolumeOutput"),
  countInButtons: [...document.querySelectorAll("[data-count-in]")], countInOutput: $("#countInOutput"), countInDisplay: $("#countInDisplay"), countInBar: $("#countInBar"), countInBeats: $("#countInBeats"),
  octaveButtons: [...document.querySelectorAll("[data-octave]")], octaveOutput: $("#octaveOutput"), octaveHint: $("#octaveHint"), headphoneNote: $("#headphoneNote"),
  sensitivityButtons: [...document.querySelectorAll("[data-sensitivity]")], sensitivityOutput: $("#sensitivityOutput"),
  tempoSlider: $("#tempoSlider"), tempoOutput: $("#tempoOutput"), bpmLabel: $("#bpmLabel"),
  playButton: $("#playButton"), pauseButton: $("#pauseButton"), stopButton: $("#stopButton"), transportState: $("#transportState"), currentTime: $("#currentTime"), totalTime: $("#totalTime"), progressFill: $("#progressFill"),
  viewButtons: [...document.querySelectorAll("[data-view]")], scoreHeading: $("#scoreHeading"), measureNumber: $("#measureNumber"), sideMeasure: $("#sideMeasure"), scoreContainer: $("#scoreContainer"),
  traceCanvas: $("#traceCanvas"), traceEmpty: $("#traceEmpty"), resultsPanel: $("#resultsPanel"), resultsBody: $("#resultsBody"), resultsSummary: $("#resultsSummary"),
  expectedNote: $("#expectedNote"), expectedPosition: $("#expectedPosition"), detectedNote: $("#detectedNote"), detectedFrequency: $("#detectedFrequency"), gaugeNeedle: $("#gaugeNeedle"), centsOutput: $("#centsOutput"),
  statusCard: $("#statusCard"), statusTitle: $("#statusTitle"), statusCopy: $("#statusCopy"), sampleCount: $("#sampleCount"), finishButton: $("#finishButton"),
  pitchDiagnostics: $("#pitchDiagnostics"), diagRawHz: $("#diagRawHz"), diagRawMidi: $("#diagRawMidi"), diagFilteredHz: $("#diagFilteredHz"), diagFilteredMidi: $("#diagFilteredMidi"), diagClarity: $("#diagClarity"), diagRms: $("#diagRms"), diagTarget: $("#diagTarget"), diagCents: $("#diagCents"), diagState: $("#diagState"), pitchSelfTest: $("#pitchSelfTest"), pitchSelfTestResult: $("#pitchSelfTestResult"), traceHigh: $("#traceHigh"), traceLow: $("#traceLow"),
  helpButton: $("#helpButton"), helpDialog: $("#helpDialog"), toast: $("#toast"),
};

const state = {
  score: null,
  selectedPartId: null,
  mode: "practice",
  scoreView: "vocal",
  enabledParts: new Set(),
  samples: [],
  rawSamples: [],
  acceptedSamples: [],
  osmd: null,
  cursor: null,
  cursorQuarter: -1,
  cursorTimeline: [],
  cursorIndex: 0,
  syncFrame: null,
  toastTimer: null,
  rendering: false,
  microphoneSensitivity: DEFAULT_MICROPHONE_SENSITIVITY,
  countInBars: DEFAULT_COUNT_IN_BARS,
  octaveShift: DEFAULT_OCTAVE_SHIFT,
  guideVolume: PLAYBACK_CONFIG.defaultGuideVolume,
  accompanimentVolume: PLAYBACK_CONFIG.defaultAccompanimentVolume,
  lastTimingDebugAt: 0,
};

const audio = new AudioEngine({
  onPitchSample: handlePitchSample,
  onRawPitchSample: handleRawPitchSample,
  onPitchDiagnostic: handlePitchDiagnostic,
  onMicrophoneState: handleMicrophoneState,
  onCountIn: handleCountIn,
  onPlaybackEnd: handlePlaybackEnd,
});

function showView(name) {
  els.uploadView.hidden = name !== "upload";
  els.loadingView.hidden = name !== "loading";
  els.partView.hidden = name !== "parts";
  els.studioView.hidden = name !== "studio";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function toast(message) {
  clearTimeout(state.toastTimer);
  els.toast.textContent = message;
  els.toast.classList.add("show");
  state.toastTimer = setTimeout(() => els.toast.classList.remove("show"), 3400);
}

async function loadScore(loader) {
  showView("loading");
  els.loadingTitle.textContent = "Finding parts and phrases…";
  els.loadingMessage.textContent = "MusicXML keeps the voice and accompaniment as separate musical data.";
  try {
    state.score = await loader();
    state.samples = [];
    state.rawSamples = [];
    state.acceptedSamples = [];
    state.selectedPartId = suggestVocalPart(state.score.parts);
    renderPartChoices();
    showView("parts");
  } catch (error) {
    console.error(error);
    toast(error.message || "This score could not be opened.");
    showView("upload");
  }
}

function renderPartChoices() {
  els.partOptions.innerHTML = "";
  els.partCount.textContent = `${state.score.parts.length} ${state.score.parts.length === 1 ? "part" : "parts"}`;
  els.scoreTitle.textContent = state.score.title;
  for (const part of state.score.parts) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `part-option${part.id === state.selectedPartId ? " selected" : ""}`;
    button.dataset.partId = part.id;
    button.role = "radio";
    button.setAttribute("aria-checked", String(part.id === state.selectedPartId));
    button.innerHTML = `<span aria-hidden="true">♪</span><span><strong>${escapeHtml(part.name)}</strong><small>${part.vocalTimeline.length} pitched events detected</small></span><i aria-hidden="true"></i>`;
    els.partOptions.append(button);
  }
  els.continueButton.disabled = !state.selectedPartId;
}

function selectPart(partId) {
  state.selectedPartId = partId;
  for (const button of els.partOptions.querySelectorAll(".part-option")) {
    const selected = button.dataset.partId === partId;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  }
  els.continueButton.disabled = false;
}

async function enterStudio() {
  const vocalPart = selectedPart();
  if (!vocalPart) return;
  state.enabledParts = new Set(state.score.parts.filter((part) => part.id !== vocalPart.id).map((part) => part.id));
  state.mode = "practice";
  state.scoreView = "vocal";
  state.samples = [];
  state.rawSamples = [];
  state.acceptedSamples = [];
  audio.setScore(state.score);
  audio.setTempo(100);
  audio.setGuideVolume(state.guideVolume);
  audio.setAccompanimentVolume(state.accompanimentVolume);
  els.studioTitle.textContent = state.score.title;
  els.studioMeta.textContent = `${state.score.creator ? `${state.score.creator} · ` : ""}${vocalPart.name} · ${vocalPart.vocalTimeline.length} target notes`;
  els.selectedPartName.textContent = vocalPart.name;
  els.scoreBannerPart.textContent = vocalPart.name;
  els.scoreHeading.textContent = `${vocalPart.name} — vocal focus`;
  renderAccompaniment();
  resetControls();
  showView("studio");
  await renderScore();
  drawTrace();
}

function selectedPart() {
  return state.score?.parts.find((part) => part.id === state.selectedPartId) || null;
}

function renderAccompaniment() {
  els.accompanimentList.innerHTML = "";
  const accompaniment = state.score.parts.filter((part) => part.id !== state.selectedPartId);
  if (!accompaniment.length) {
    els.accompanimentList.innerHTML = '<span class="empty-parts">No separate accompaniment parts</span>';
    els.toggleAllParts.disabled = true;
    return;
  }
  els.toggleAllParts.disabled = false;
  for (const part of accompaniment) {
    const label = document.createElement("label");
    label.className = "part-toggle";
    label.innerHTML = `<span>${escapeHtml(part.name)}</span><input type="checkbox" data-part-id="${escapeHtml(part.id)}" ${state.enabledParts.has(part.id) ? "checked" : ""} /><i aria-hidden="true"></i>`;
    els.accompanimentList.append(label);
  }
  updateMuteAllLabel();
}

function updateMuteAllLabel() {
  const accompaniment = state.score?.parts.filter((part) => part.id !== state.selectedPartId) || [];
  els.toggleAllParts.textContent = accompaniment.length && accompaniment.every((part) => state.enabledParts.has(part.id)) ? "Mute all" : "Play all";
}

async function renderScore() {
  if (state.rendering || !state.score) return;
  state.rendering = true;
  els.scoreContainer.setAttribute("aria-busy", "true");
  try {
    const OSMD = window.opensheetmusicdisplay?.OpenSheetMusicDisplay;
    if (!OSMD) throw new Error("The notation renderer did not load. Check your connection and refresh.");
    if (!state.osmd) {
      state.osmd = new OSMD(els.scoreContainer, {
        autoResize: true,
        backend: "svg",
        drawTitle: true,
        drawPartNames: true,
        followCursor: true,
        drawingParameters: "compact",
        cursorsOptions: [{ color: "#d8ff78", alpha: 0.72, follow: true }],
      });
      await state.osmd.load(state.score.xmlText);
    }
    state.osmd.Sheet.Instruments.forEach((instrument, index) => {
      instrument.Visible = state.scoreView === "full" || state.score.parts[index]?.id === state.selectedPartId;
    });
    state.osmd.render();
    state.cursor = state.osmd.cursor || state.osmd.cursors?.[0] || null;
    indexCursorTimeline();
    resetCursor();
    els.scoreHeading.textContent = state.scoreView === "vocal" ? `${selectedPart().name} — vocal focus` : "Full score";
  } catch (error) {
    console.error(error);
    els.scoreContainer.innerHTML = `<p class="score-error">${escapeHtml(error.message || "The score could not be rendered.")}</p>`;
    toast(error.message || "The score could not be rendered.");
  } finally {
    state.rendering = false;
    els.scoreContainer.removeAttribute("aria-busy");
  }
}

function resetCursor() {
  state.cursorQuarter = -1;
  state.cursorIndex = 0;
  try {
    state.cursor?.reset();
    state.cursor?.show();
    state.cursorQuarter = osmdTimestampToQuarters(cursorTimestamp());
  } catch (error) {
    console.warn("Score cursor is unavailable", error);
  }
}

function cursorEndReached() {
  const iterator = state.cursor?.Iterator || state.cursor?.iterator;
  return Boolean(iterator?.EndReached ?? iterator?.endReached);
}

function indexCursorTimeline() {
  state.cursorTimeline = [];
  if (!state.cursor) return;
  try {
    state.cursor.reset();
    for (let steps = 0; steps < 10000; steps += 1) {
      const timestamp = cursorTimestamp();
      if (Number.isFinite(timestamp)) state.cursorTimeline.push(timestamp);
      if (cursorEndReached()) break;
      state.cursor.next();
    }
    state.cursor.reset();
  } catch (error) {
    state.cursorTimeline = [];
    console.warn("Could not index score cursor timestamps", error);
  }
}

function cursorTimestamp() {
  const iterator = state.cursor?.Iterator || state.cursor?.iterator;
  const value = iterator?.currentTimeStamp?.RealValue
    ?? iterator?.currentTimeStamp?.realValue
    ?? iterator?.CurrentSourceTimestamp?.RealValue
    ?? iterator?.CurrentSourceTimestamp?.realValue;
  return Number.isFinite(value) ? value : quartersToOsmdTimestamp(state.cursorQuarter);
}

function syncCursor(quarter) {
  if (!state.cursor) return;
  if (quarter + 0.01 < state.cursorQuarter) resetCursor();
  const targetOsmdTimestamp = quartersToOsmdTimestamp(quarter);
  const targetIndex = cursorIndexAtTimestamp(state.cursorTimeline, targetOsmdTimestamp, state.cursorIndex);
  let steps = 0;
  try {
    while (state.cursorIndex < targetIndex && steps < 120) {
      state.cursor.next();
      state.cursorIndex += 1;
      state.cursorQuarter = osmdTimestampToQuarters(cursorTimestamp());
      steps += 1;
    }
  } catch (error) {
    console.warn("Could not advance score cursor", error);
  }
}

function timingSnapshot(quarter = audio.currentQuarter) {
  const part = selectedPart();
  const expected = part ? noteAtQuarter(part.vocalTimeline, quarter) : null;
  return {
    transportQuarter: quarter,
    osmdTimestamp: cursorTimestamp(),
    cursorQuarter: osmdTimestampToQuarters(cursorTimestamp()),
    measure: part ? measureAtQuarter(part, quarter) : null,
    expectedNote: soundingTargetName(expected),
  };
}

function logTimingDebug(quarter) {
  if (!TIMING_DEBUG_ENABLED) return;
  const now = performance.now();
  if (now - state.lastTimingDebugAt < DEBUG_CONFIG.timingLogIntervalMs) return;
  state.lastTimingDebugAt = now;
  const snapshot = timingSnapshot(quarter);
  console.debug([
    snapshot.transportQuarter.toFixed(3),
    snapshot.osmdTimestamp.toFixed(5),
    snapshot.measure ?? "—",
    snapshot.expectedNote,
  ].join(" | "));
}

function setMicrophoneSensitivity(level) {
  if (audio.isPlaying || audio.isPaused || audio.isCountingIn) return;
  state.microphoneSensitivity = level;
  audio.setMicrophoneSensitivity(level);
  els.sensitivityButtons.forEach((button) => {
    const active = button.dataset.sensitivity === level;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  els.sensitivityOutput.textContent = level[0].toUpperCase() + level.slice(1);
}

function setCountInBars(value) {
  if (audio.isPlaying || audio.isPaused || audio.isCountingIn) return;
  state.countInBars = Math.max(0, Math.min(2, Number(value) || 0));
  els.countInButtons.forEach((button) => {
    const active = Number(button.dataset.countIn) === state.countInBars;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  els.countInOutput.textContent = state.countInBars === 0 ? "Off" : `${state.countInBars} ${state.countInBars === 1 ? "bar" : "bars"}`;
}

function setOctaveShift(value) {
  if (audio.isPlaying || audio.isPaused || audio.isCountingIn) return;
  const nextShift = [-12, 0, 12].includes(Number(value)) ? Number(value) : 0;
  if (nextShift !== state.octaveShift && state.samples.length) {
    state.samples = [];
    state.rawSamples = [];
    state.acceptedSamples = [];
    els.sampleCount.textContent = "0";
    els.resultsPanel.hidden = true;
    els.finishButton.disabled = true;
    els.detectedNote.textContent = "—";
    els.detectedFrequency.textContent = "Waiting for your voice";
    els.centsOutput.textContent = "—";
    drawTrace();
  }
  state.octaveShift = nextShift;
  els.octaveButtons.forEach((button) => {
    const active = Number(button.dataset.octave) === state.octaveShift;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  els.octaveOutput.textContent = state.octaveShift < 0 ? "Octave lower" : state.octaveShift > 0 ? "Octave higher" : "Written";
  updateOctaveHint(noteAtQuarter(selectedPart()?.vocalTimeline || [], audio.currentQuarter) || selectedPart()?.vocalTimeline[0]);
  updatePosition(audio.currentQuarter);
}

function updateVolume(kind, value) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));
  if (kind === "guide") {
    state.guideVolume = percent;
    audio.setGuideVolume(percent);
    els.guideVolumeOutput.textContent = `${percent}%`;
  } else {
    state.accompanimentVolume = percent;
    audio.setAccompanimentVolume(percent);
    els.accompanimentVolumeOutput.textContent = `${percent}%`;
  }
}

function targetMidiAtQuarter(quarter) {
  const target = noteAtQuarter(selectedPart()?.vocalTimeline || [], quarter);
  return target ? target.midi + state.octaveShift : null;
}

function soundingTargetName(note) {
  return note ? midiToName(note.midi + state.octaveShift) : "Rest";
}

function updateOctaveHint(note) {
  const direction = state.octaveShift < 0 ? "Sing octave lower" : state.octaveShift > 0 ? "Sing octave higher" : "Sing written pitch";
  els.octaveHint.textContent = note ? `${direction} — sounding target ${soundingTargetName(note)}` : `${direction} — sounding target rests`;
}

function setMode(mode) {
  if (!MODE_CONFIG[mode] || audio.isPlaying || audio.isPaused || audio.isCountingIn) return;
  state.mode = mode;
  els.modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  const config = MODE_CONFIG[mode];
  els.headphoneNote.hidden = !config.microphone;
  els.transportState.textContent = `${config.label} ready`;
  if (config.microphone) {
    setStatus("idle", "Microphone ready", `Press play to begin ${config.label.toLowerCase()}.`);
  } else {
    setStatus("idle", "Ready when you are", "Practice plays the vocal guide and accompaniment without scoring.");
  }
}

async function play() {
  if (!state.score || state.rendering) return;
  const mode = MODE_CONFIG[state.mode];
  const freshAssessment = mode.microphone && !audio.isPaused && audio.currentQuarter < 0.01;
  if (freshAssessment) {
    state.samples = [];
    state.rawSamples = [];
    state.acceptedSamples = [];
    els.resultsPanel.hidden = true;
    els.sampleCount.textContent = "0";
    drawTrace();
  }
  setTransportBusy(true);
  try {
    await audio.play({
      vocalPartId: state.selectedPartId,
      guideEnabled: mode.guide,
      enabledPartIds: [...state.enabledParts],
      assessmentMode: mode.microphone,
      vocalOctaveSemitones: state.octaveShift,
      countInBars: state.countInBars,
      targetMidiAtQuarter: targetMidiAtQuarter,
    });
    setPlaybackState("playing");
    startSync();
  } catch (error) {
    if (error?.name === "AbortError") {
      setPlaybackState("stopped");
      return;
    }
    console.error(error);
    if (error?.name === "NotAllowedError") toast("Microphone permission was blocked. Allow access or switch to Practice mode.");
    else toast(error.message || "Playback could not start.");
    setStatus("off", "Couldn’t start", error?.name === "NotAllowedError" ? "Microphone permission is required for Assessment." : "Check the browser console or try Practice mode.");
  } finally {
    setTransportBusy(false);
  }
}

function pause() {
  audio.pause();
  cancelAnimationFrame(state.syncFrame);
  setPlaybackState("paused");
  setStatus("idle", "Paused", "Your place in the score is saved.");
}

function stop({ keepSamples = true } = {}) {
  audio.stop({ reset: true, microphone: true });
  cancelAnimationFrame(state.syncFrame);
  setPlaybackState("stopped");
  resetCursor();
  updatePosition(0);
  if (!keepSamples) {
    state.samples = [];
    els.sampleCount.textContent = "0";
    els.resultsPanel.hidden = true;
    drawTrace();
  }
}

function setTransportBusy(busy) {
  els.playButton.disabled = busy || audio.isPlaying;
  els.pauseButton.disabled = busy || !audio.isPlaying;
  els.stopButton.disabled = (!audio.isPlaying && !audio.isPaused && !audio.isCountingIn);
  const locked = busy || audio.isPlaying || audio.isPaused || audio.isCountingIn;
  setSetupControlsDisabled(locked);
  for (const input of els.accompanimentList.querySelectorAll("input")) input.disabled = locked;
  els.toggleAllParts.disabled = locked || !state.score.parts.some((part) => part.id !== state.selectedPartId);
  els.viewButtons.forEach((button) => { button.disabled = locked; });
}

function setPlaybackState(status) {
  const playing = status === "playing";
  const paused = status === "paused";
  els.playButton.disabled = playing;
  els.pauseButton.disabled = !playing;
  els.stopButton.disabled = !(playing || paused);
  els.finishButton.disabled = !MODE_CONFIG[state.mode].microphone || (!state.samples.length && !playing && !paused);
  els.tempoSlider.disabled = playing || paused;
  setSetupControlsDisabled(playing || paused);
  for (const input of els.accompanimentList.querySelectorAll("input")) input.disabled = playing || paused;
  els.toggleAllParts.disabled = playing || paused || !state.score.parts.some((part) => part.id !== state.selectedPartId);
  els.viewButtons.forEach((button) => { button.disabled = playing || paused; });
  els.transportState.textContent = playing ? (MODE_CONFIG[state.mode].microphone ? "Assessing" : "Playing") : paused ? "Paused" : "Ready";
  if (playing) setStatus("idle", MODE_CONFIG[state.mode].microphone ? "Listening" : "Playing your score", MODE_CONFIG[state.mode].microphone ? "Sing the selected line while the cursor moves." : "Follow the guide and accompaniment.");
}

function setSetupControlsDisabled(disabled) {
  els.tempoSlider.disabled = disabled;
  els.modeButtons.forEach((button) => { button.disabled = disabled; });
  els.sensitivityButtons.forEach((button) => { button.disabled = disabled; });
  els.countInButtons.forEach((button) => { button.disabled = disabled; });
  els.octaveButtons.forEach((button) => { button.disabled = disabled; });
}

function startSync() {
  cancelAnimationFrame(state.syncFrame);
  const frame = () => {
    if (!audio.isPlaying) return;
    updatePosition(audio.currentQuarter);
    state.syncFrame = requestAnimationFrame(frame);
  };
  state.syncFrame = requestAnimationFrame(frame);
}

function updatePosition(quarter) {
  const part = selectedPart();
  const seconds = quarter * 60 / audio.bpm;
  const duration = audio.durationSeconds;
  els.currentTime.textContent = formatTime(seconds);
  els.totalTime.textContent = formatTime(duration);
  els.progressFill.style.width = `${Math.min(100, duration ? seconds / duration * 100 : 0)}%`;
  const measure = measureAtQuarter(part, quarter);
  els.measureNumber.textContent = String(measure);
  els.sideMeasure.textContent = String(measure);
  const expected = noteAtQuarter(part.vocalTimeline, quarter);
  if (expected) {
    els.expectedNote.textContent = soundingTargetName(expected);
    const written = state.octaveShift ? ` · written ${expected.displayPitch}` : "";
    els.expectedPosition.textContent = `Measure ${expected.measureNumber} · beat ${formatBeat(expected.beatPosition)}${written}`;
  } else {
    els.expectedNote.textContent = "Rest";
    els.expectedPosition.textContent = `Measure ${measure}`;
  }
  updateOctaveHint(expected);
  syncCursor(quarter);
  logTimingDebug(quarter);
  drawTrace();
}

function handlePitchSample(sample) {
  if (!MODE_CONFIG[state.mode].microphone || !audio.isPlaying) return;
  state.acceptedSamples.push({ ...sample });
  const target = noteAtQuarter(selectedPart().vocalTimeline, sample.scoreQuarter);
  if (!target) {
    setStatus("idle", "Rest", "Breathe and prepare for the next entrance.");
    return;
  }
  const midi = Number.isFinite(sample.filteredMidi) ? sample.filteredMidi : frequencyToMidi(sample.frequency);
  const targetMidi = target.midi + state.octaveShift;
  const cents = (midi - targetMidi) * 100;
  const enriched = { ...sample, midi, cents, targetId: target.id, targetMidi, measureNumber: target.measureNumber };
  state.samples.push(enriched);
  els.sampleCount.textContent = state.samples.length.toLocaleString();
  els.detectedNote.textContent = midiToName(midi);
  els.detectedFrequency.textContent = `${sample.frequency.toFixed(1)} Hz · ${(sample.clarity * 100).toFixed(0)}% clarity`;
  els.centsOutput.textContent = Math.abs(cents) < 1 ? "Centred" : `${Math.abs(cents).toFixed(0)} cents ${cents > 0 ? "sharp" : "flat"}`;
  els.centsOutput.style.color = colourForCents(cents);
  els.gaugeNeedle.style.left = `${Math.max(0, Math.min(100, 50 + cents))}%`;
  const error = Math.abs(cents);
  if (error <= PITCH_THRESHOLDS.green) setStatus("good", "In the centre", "Keep the airflow and shape just like this.");
  else if (error <= PITCH_THRESHOLDS.yellow) setStatus("warn", "Nearly there", cents > 0 ? "Ease the pitch down a touch." : "Lift the pitch gently from the breath.");
  else setStatus("off", cents > 0 ? "Running sharp" : "Running flat", "Keep listening — the trace preserves how this note settles.");
  els.finishButton.disabled = false;
}

function handleRawPitchSample(sample) {
  if (!MODE_CONFIG[state.mode].microphone || !audio.isPlaying) return;
  state.rawSamples.push({ ...sample });
}

function handlePitchDiagnostic(sample) {
  const targetName = Number.isFinite(sample.targetMidi) ? midiToName(sample.targetMidi) : "Rest";
  els.diagRawHz.textContent = Number.isFinite(sample.rawFrequency) ? sample.rawFrequency.toFixed(2) : "—";
  els.diagRawMidi.textContent = Number.isFinite(sample.rawMidi) ? sample.rawMidi.toFixed(2) : "—";
  els.diagFilteredHz.textContent = Number.isFinite(sample.filteredFrequency) ? sample.filteredFrequency.toFixed(2) : "—";
  els.diagFilteredMidi.textContent = Number.isFinite(sample.filteredMidi) ? sample.filteredMidi.toFixed(2) : "—";
  els.diagClarity.textContent = Number.isFinite(sample.clarity) ? `${(sample.clarity * 100).toFixed(1)}%` : "—";
  els.diagRms.textContent = Number.isFinite(sample.rms) ? sample.rms.toFixed(4) : "—";
  els.diagTarget.textContent = Number.isFinite(sample.targetMidi) ? `${targetName} · ${sample.targetMidi.toFixed(2)}` : "Rest";
  els.diagCents.textContent = Number.isFinite(sample.centsError) ? formatCents(sample.centsError) : "—";
  els.diagState.textContent = sample.status === "accepted"
    ? `${sample.reason}${sample.octaveCorrection ? ` (${sample.octaveCorrection > 0 ? "+" : ""}${sample.octaveCorrection} semitones)` : ""}`
    : `No reliable pitch — ${sample.reason}`;
  if (sample.status !== "accepted" && MODE_CONFIG[state.mode].microphone && audio.isPlaying) {
    els.detectedNote.textContent = "—";
    els.detectedFrequency.textContent = `No reliable pitch · ${sample.reason}`;
    els.centsOutput.textContent = "—";
    els.centsOutput.style.color = "";
    els.gaugeNeedle.style.left = "50%";
  }
}

function handleCountIn(event) {
  if (event.status === "start") {
    els.countInDisplay.hidden = false;
    els.transportState.textContent = "Count-in";
    els.countInBar.textContent = event.bars > 1 ? "Count-in · bar 1" : "Count-in";
    els.countInBeats.innerHTML = Array.from({ length: event.pulsesPerBar }, (_, index) => `<span>${index + 1}</span>`).join("");
    setTransportBusy(true);
    return;
  }
  if (event.status === "beat") {
    els.countInBar.textContent = event.bars > 1 ? `Count-in · bar ${event.bar} of ${event.bars}` : "Count-in";
    [...els.countInBeats.children].forEach((beat, index) => beat.classList.toggle("active", index + 1 === event.beat));
    return;
  }
  els.countInDisplay.hidden = true;
}

function handleMicrophoneState(status, details = {}) {
  if (status === "requesting") setStatus("idle", "Microphone permission", "Allow access so assessment can listen locally.");
  if (status === "calibrating") setStatus("idle", "Calibrating microphone — stay quiet", "Measuring the room for about one second before playback starts.");
  if (status === "active") {
    const sensitivity = state.microphoneSensitivity[0].toUpperCase() + state.microphoneSensitivity.slice(1);
    const gatePercent = Number.isFinite(details.openThreshold) ? ` · gate ${(details.openThreshold * 100).toFixed(1)}%` : "";
    setStatus("idle", "Microphone active", `${sensitivity} sensitivity${gatePercent}. Audio stays on this device.`);
  }
}

function handlePlaybackEnd() {
  if (MODE_CONFIG[state.mode].microphone && state.samples.length) finishAssessment();
  else stop();
}

function finishAssessment() {
  const hadSamples = state.samples.length > 0;
  audio.stop({ reset: true, microphone: true });
  cancelAnimationFrame(state.syncFrame);
  setPlaybackState("stopped");
  resetCursor();
  updatePosition(0);
  if (!hadSamples) {
    toast("No clear pitch samples were captured. Try again in a quieter room.");
    return;
  }
  const soundingTimeline = selectedPart().vocalTimeline.map((note) => ({
    ...note,
    midi: note.midi + state.octaveShift,
    displayPitch: midiToName(note.midi + state.octaveShift),
  }));
  const results = analysePerformance(soundingTimeline, state.samples, audio.bpm);
  renderResults(results);
  els.resultsPanel.hidden = false;
  els.resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  setStatus("good", "Assessment complete", "Review how each note started, settled, and sustained.");
}

function renderResults(results) {
  els.resultsBody.innerHTML = "";
  const assessed = results.filter((result) => result.sampleCount > 0);
  if (!assessed.length) {
    els.resultsBody.innerHTML = '<tr><td colspan="7" class="result-empty">No target notes had enough usable samples.</td></tr>';
  } else {
    for (const result of assessed) {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${escapeHtml(result.note.displayPitch)}</td><td>${result.note.measureNumber}</td><td>${formatCents(result.initialError)}</td><td>${formatCents(result.averageError)}</td><td>${result.settleTime === null ? "—" : `${result.settleTime.toFixed(2)}s`}</td><td>${formatCents(result.sustainedError)}</td><td><span class="result-value">${Math.round(result.inZonePercent)}%</span></td>`;
      els.resultsBody.append(row);
    }
  }
  els.resultsSummary.textContent = performanceSummary(results);
}

function setStatus(status, title, copy) {
  els.statusCard.dataset.status = status;
  els.statusTitle.textContent = title;
  els.statusCopy.textContent = copy;
  els.statusCard.querySelector(".status-icon").textContent = status === "good" ? "✓" : status === "warn" ? "~" : status === "off" ? "!" : "•";
}

function drawTrace() {
  const canvas = els.traceCanvas;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  const pad = { top: 17, right: 13, bottom: 17, left: 13 };
  const height = rect.height - pad.top - pad.bottom;
  const width = rect.width - pad.left - pad.right;
  els.traceEmpty.hidden = state.samples.length > 0;
  const latest = state.samples.length ? (audio.isPlaying ? audio.currentSeconds : state.samples[state.samples.length - 1].scoreSeconds) : 0;
  const start = Math.max(0, latest - 12);
  const visible = state.samples.filter((sample) => sample.scoreSeconds >= start && sample.scoreSeconds <= latest + .1);
  const largestError = Math.max(0, ...visible.map((sample) => Math.abs(sample.cents)));
  const traceRange = Math.max(80, Math.ceil(largestError / 100) * 100);
  els.traceHigh.textContent = `Sharp +${traceRange}¢`;
  els.traceLow.textContent = `Flat −${traceRange}¢`;
  const yFor = (cents) => pad.top + (traceRange - cents) / (traceRange * 2) * height;
  for (const cents of [-45, -30, -15, 0, 15, 30, 45]) {
    ctx.beginPath(); ctx.moveTo(pad.left, yFor(cents)); ctx.lineTo(rect.width - pad.right, yFor(cents));
    ctx.strokeStyle = cents === 0 ? "rgba(216,255,120,.42)" : "rgba(255,255,255,.075)"; ctx.lineWidth = cents === 0 ? 1.5 : 1; ctx.stroke();
  }
  if (!state.samples.length) return;
  const xFor = (seconds) => pad.left + (seconds - start) / 12 * width;
  ctx.save(); ctx.beginPath(); ctx.rect(pad.left, pad.top, width, height); ctx.clip(); ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (let index = 1; index < visible.length; index += 1) {
    const previous = visible[index - 1], current = visible[index];
    if (current.targetId !== previous.targetId || current.scoreSeconds - previous.scoreSeconds > .2) continue;
    ctx.beginPath(); ctx.moveTo(xFor(previous.scoreSeconds), yFor(previous.cents)); ctx.lineTo(xFor(current.scoreSeconds), yFor(current.cents)); ctx.strokeStyle = colourForCents(current.cents); ctx.shadowColor = ctx.strokeStyle; ctx.shadowBlur = 6; ctx.stroke();
  }
  ctx.restore();
}

function resetControls() {
  els.tempoSlider.value = "100";
  els.tempoOutput.textContent = "100%";
  els.bpmLabel.textContent = `${Math.round(state.score.originalTempo)} BPM`;
  els.totalTime.textContent = formatTime(audio.durationSeconds);
  els.currentTime.textContent = "00:00";
  els.progressFill.style.width = "0%";
  els.expectedNote.textContent = "—";
  els.expectedPosition.textContent = "Press play to begin";
  els.detectedNote.textContent = "—";
  els.detectedFrequency.textContent = "Waiting for your voice";
  els.centsOutput.textContent = "—";
  els.centsOutput.style.color = "";
  els.gaugeNeedle.style.left = "50%";
  els.sampleCount.textContent = "0";
  els.resultsPanel.hidden = true;
  state.rawSamples = [];
  state.acceptedSamples = [];
  state.mode = "practice";
  els.modeButtons.forEach((button) => { const active = button.dataset.mode === "practice"; button.classList.toggle("active", active); button.setAttribute("aria-checked", String(active)); });
  els.headphoneNote.hidden = true;
  els.guideVolume.value = String(state.guideVolume);
  els.accompanimentVolume.value = String(state.accompanimentVolume);
  updateVolume("guide", state.guideVolume);
  updateVolume("accompaniment", state.accompanimentVolume);
  setCountInBars(state.countInBars);
  setOctaveShift(state.octaveShift);
  setMicrophoneSensitivity(state.microphoneSensitivity);
  els.countInDisplay.hidden = true;
  els.diagRawHz.textContent = els.diagRawMidi.textContent = els.diagFilteredHz.textContent = els.diagFilteredMidi.textContent = "—";
  els.diagClarity.textContent = els.diagRms.textContent = els.diagTarget.textContent = els.diagCents.textContent = "—";
  els.diagState.textContent = "No reliable pitch";
  els.pitchDiagnostics.open = PITCH_DEBUG_ENABLED;
  setPlaybackState("stopped");
  setStatus("idle", "Ready when you are", "Choose a mode, then press play.");
  updatePosition(0);
}

function resetToUpload() {
  audio.destroy();
  cancelAnimationFrame(state.syncFrame);
  state.score = null; state.selectedPartId = null; state.samples = []; state.rawSamples = []; state.acceptedSamples = []; state.osmd = null; state.cursor = null; state.cursorTimeline = []; state.cursorIndex = 0;
  els.scoreContainer.innerHTML = "";
  els.scoreInput.value = "";
  showView("upload");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function formatCents(value) {
  if (value === null || !Number.isFinite(value)) return "—";
  if (Math.abs(value) < .5) return "0¢";
  return `${value > 0 ? "+" : ""}${Math.round(value)}¢`;
}

function formatBeat(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function runPitchSelfTest() {
  const sampleRate = 48000;
  const size = 4096;
  const tones = [["A3", 220], ["C4", 261.63], ["A4", 440], ["C5", 523.25]];
  const results = tones.map(([name, expected]) => {
    const frame = new Float32Array(size);
    for (let index = 0; index < size; index += 1) {
      const phase = 2 * Math.PI * expected * index / sampleRate;
      frame[index] = 0.68 * Math.sin(phase)
        + 0.22 * Math.sin(phase * 2 + 0.31)
        + 0.1 * Math.sin(phase * 3 + 0.67);
    }
    const raw = detectAutocorrelationPitch(frame, sampleRate);
    const tracker = new StablePitchTracker();
    let stable = null;
    for (let index = 0; index < 6; index += 1) {
      stable = tracker.process({
        frequency: raw.frequency,
        clarity: raw.clarity,
        rms: 0.12,
        gateOpen: true,
        capturedAt: index * 46,
        scoreQuarter: 0,
        scoreSeconds: 0,
        targetMidi: null,
        corroboratingFrequency: null,
      });
    }
    const cents = 1200 * Math.log2(stable.filteredFrequency / expected);
    return { name, expected, rawHz: raw.frequency, filteredHz: stable.filteredFrequency, cents, passed: stable.status === "accepted" && Math.abs(cents) < 8 };
  });
  els.pitchSelfTestResult.textContent = results.map((result) => `${result.name} ${result.filteredHz.toFixed(1)} Hz ${result.passed ? "✓" : "✕"}`).join(" · ");
  console.table(results);
}

function wireEvents() {
  els.scoreInput.addEventListener("change", () => { const file = els.scoreInput.files?.[0]; if (file) loadScore(() => readScoreFile(file)); });
  els.sampleButton.addEventListener("click", () => loadScore(() => readScoreUrl("./samples/first-flight.musicxml", "First Flight")));
  els.partBackButton.addEventListener("click", resetToUpload);
  els.newScoreButton.addEventListener("click", resetToUpload);
  els.partOptions.addEventListener("click", (event) => { const button = event.target.closest("[data-part-id]"); if (button) selectPart(button.dataset.partId); });
  els.continueButton.addEventListener("click", enterStudio);
  els.modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  els.sensitivityButtons.forEach((button) => button.addEventListener("click", () => setMicrophoneSensitivity(button.dataset.sensitivity)));
  els.countInButtons.forEach((button) => button.addEventListener("click", () => setCountInBars(button.dataset.countIn)));
  els.octaveButtons.forEach((button) => button.addEventListener("click", () => setOctaveShift(button.dataset.octave)));
  els.guideVolume.addEventListener("input", () => updateVolume("guide", els.guideVolume.value));
  els.accompanimentVolume.addEventListener("input", () => updateVolume("accompaniment", els.accompanimentVolume.value));
  els.accompanimentList.addEventListener("change", (event) => { const input = event.target.closest("input[data-part-id]"); if (!input) return; if (input.checked) state.enabledParts.add(input.dataset.partId); else state.enabledParts.delete(input.dataset.partId); updateMuteAllLabel(); });
  els.toggleAllParts.addEventListener("click", () => { const parts = state.score.parts.filter((part) => part.id !== state.selectedPartId); const all = parts.every((part) => state.enabledParts.has(part.id)); state.enabledParts = new Set(all ? [] : parts.map((part) => part.id)); renderAccompaniment(); });
  els.tempoSlider.addEventListener("input", () => { audio.setTempo(els.tempoSlider.value); els.tempoOutput.textContent = `${els.tempoSlider.value}%`; els.bpmLabel.textContent = `${Math.round(audio.bpm)} BPM`; els.totalTime.textContent = formatTime(audio.durationSeconds); });
  els.playButton.addEventListener("click", play); els.pauseButton.addEventListener("click", pause); els.stopButton.addEventListener("click", () => stop()); els.finishButton.addEventListener("click", finishAssessment);
  els.viewButtons.forEach((button) => button.addEventListener("click", async () => { if (audio.isPlaying || audio.isPaused || audio.isCountingIn) return; state.scoreView = button.dataset.view; els.viewButtons.forEach((item) => item.classList.toggle("active", item === button)); await renderScore(); }));
  els.helpButton.addEventListener("click", () => els.helpDialog.showModal());
  els.pitchSelfTest.addEventListener("click", runPitchSelfTest);
  window.addEventListener("resize", drawTrace);
  window.addEventListener("beforeunload", () => audio.destroy());
}

wireEvents();
if (TIMING_DEBUG_ENABLED) {
  console.info("Vocal Coach timing debug: transport quarter | OSMD timestamp | measure | expected note");
  Object.defineProperty(window, "__vocalCoachTiming", {
    value: Object.freeze({ snapshot: timingSnapshot }),
    configurable: true,
  });
}
if (PITCH_DEBUG_ENABLED) {
  console.info("Vocal Coach pitch debug enabled: raw and accepted samples remain separate.");
  Object.defineProperty(window, "__vocalCoachPitch", {
    value: Object.freeze({
      snapshot: () => ({ raw: [...state.rawSamples], accepted: [...state.acceptedSamples] }),
    }),
    configurable: true,
  });
}
showView("upload");
