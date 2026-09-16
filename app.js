import { AudioEngine } from "./src/audio-engine.js?v=18";
import { analysePerformance, performanceSummary } from "./src/analysis.js?v=14";
import { buildCoachingFeedback } from "./src/coaching.js?v=14";
import {
  colourForCents,
  DEBUG_CONFIG,
  DEFAULT_COUNT_IN_BARS,
  DEFAULT_MICROPHONE_SENSITIVITY,
  DEFAULT_OCTAVE_SHIFT,
  LIVE_TUNING_CONFIG,
  MICROPHONE_CALIBRATION,
  PLAYBACK_CONFIG,
  SESSION_MODES,
  formatTime,
  frequencyToMidi,
  midiToName,
  PITCH_THRESHOLDS,
} from "./src/config.js?v=17";
import {
  assessmentSampleEligible,
  LiveTuningFeedback,
  tuningTargetAtQuarter,
  visualMidiForSample,
} from "./src/live-tuning.js?v=17";
import { normaliseSavedMicrophoneCalibration } from "./src/microphone-calibration.js?v=14";
import { measureAtQuarter, noteAtQuarter, readScoreFile, readScoreUrl, suggestVocalPart } from "./src/musicxml.js?v=18";
import { AutomaticOctaveSelector, suggestOctaveFromComfortablePitch } from "./src/octave-selection.js?v=16";
import { detectAutocorrelationPitch, PitchDiagnosticSummary, StablePitchTracker } from "./src/pitch-tracker.js?v=17";
import {
  assessmentRangeLabel,
  clipTimelineToRange,
  firstNoteAtOrAfter,
  practiceLimits,
  resolvePracticeRange,
  sampleWithinRange,
  validateSection,
} from "./src/practice-range.js?v=18";
import { createTakeMetadata, reviewLayers, reviewQuarterAtSeconds, reviewVolumes } from "./src/review-playback.js?v=18";
import {
  appendScoreTraceSample,
  buildMeasureGeometry,
  buildScoreGeometry,
  focusScoreTarget,
  renderMeasureSelection,
  renderScoreTrace,
} from "./src/score-overlay.js?v=18";
import { cursorIndexAtTimestamp, osmdTimestampToQuarters, quartersToOsmdTimestamp } from "./src/timing.js?v=14";

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
  sectionFrom: $("#sectionFrom"), sectionTo: $("#sectionTo"), practiceRangeStatus: $("#practiceRangeStatus"), sectionValidation: $("#sectionValidation"), selectBarsButton: $("#selectBarsButton"), clearSectionButton: $("#clearSectionButton"), startFromBar: $("#startFromBar"), chooseStartButton: $("#chooseStartButton"), scoreSelectionAction: $("#scoreSelectionAction"), scoreSelectionCopy: $("#scoreSelectionCopy"), startHereButton: $("#startHereButton"), cancelScoreSelectionButton: $("#cancelScoreSelectionButton"),
  octaveButtons: [...document.querySelectorAll("[data-octave]")], octaveOutput: $("#octaveOutput"), octaveHint: $("#octaveHint"), automaticOctave: $("#automaticOctave"), startingNoteName: $("#startingNoteName"), hearStartingNote: $("#hearStartingNote"), octaveConfirmation: $("#octaveConfirmation"), headphoneNote: $("#headphoneNote"),
  sensitivityButtons: [...document.querySelectorAll("[data-sensitivity]")], sensitivityOutput: $("#sensitivityOutput"),
  microphoneCheckStatus: $("#microphoneCheckStatus"), microphoneCheckCopy: $("#microphoneCheckCopy"), recheckMicrophoneButton: $("#recheckMicrophoneButton"),
  tempoSlider: $("#tempoSlider"), tempoOutput: $("#tempoOutput"), bpmLabel: $("#bpmLabel"),
  playButton: $("#playButton"), pauseButton: $("#pauseButton"), stopButton: $("#stopButton"), transportState: $("#transportState"), currentTime: $("#currentTime"), totalTime: $("#totalTime"), progressFill: $("#progressFill"),
  dockRestartButton: $("#dockRestartButton"), dockPlayPauseButton: $("#dockPlayPauseButton"), dockStopButton: $("#dockStopButton"), dockTransportState: $("#dockTransportState"), dockCurrentTime: $("#dockCurrentTime"), dockTotalTime: $("#dockTotalTime"), dockMeasure: $("#dockMeasure"), dockRange: $("#dockRange"), followScoreButton: $("#followScoreButton"),
  viewButtons: [...document.querySelectorAll("[data-view]")], scoreHeading: $("#scoreHeading"), measureNumber: $("#measureNumber"), sideMeasure: $("#sideMeasure"), scoreContainer: $("#scoreContainer"),
  resultsPanel: $("#resultsPanel"), resultsBody: $("#resultsBody"), resultsSummary: $("#resultsSummary"), assessmentScope: $("#assessmentScope"),
  coachLevel: $("#coachLevel"), coachIntro: $("#coachIntro"), coachObservations: $("#coachObservations"),
  performancePlayback: $("#performancePlayback"), performanceAudio: $("#performanceAudio"), performanceRestart: $("#performanceRestart"), performancePlay: $("#performancePlay"), performancePause: $("#performancePause"), performanceSeek: $("#performanceSeek"), performanceCurrentTime: $("#performanceCurrentTime"), performanceDuration: $("#performanceDuration"), reviewLayerInputs: [...document.querySelectorAll("[data-review-layer]")], reviewVolumeInputs: [...document.querySelectorAll("[data-review-volume]")], reviewVolumeOutputs: [...document.querySelectorAll("[data-review-volume-output]")],
  expectedLabel: $("#expectedLabel"), expectedNote: $("#expectedNote"), expectedPosition: $("#expectedPosition"), detectedNote: $("#detectedNote"), detectedFrequency: $("#detectedFrequency"), tuningMeter: $("#tuningMeter"), tuningPhase: $("#tuningPhase"), gaugeNeedle: $("#gaugeNeedle"), centsOutput: $("#centsOutput"),
  statusCard: $("#statusCard"), statusTitle: $("#statusTitle"), statusCopy: $("#statusCopy"), sampleCount: $("#sampleCount"), finishButton: $("#finishButton"),
  pitchDiagnostics: $("#pitchDiagnostics"), diagRawHz: $("#diagRawHz"), diagRawMidi: $("#diagRawMidi"), diagFilteredHz: $("#diagFilteredHz"), diagFilteredMidi: $("#diagFilteredMidi"), diagClarity: $("#diagClarity"), diagRms: $("#diagRms"), diagTarget: $("#diagTarget"), diagCents: $("#diagCents"), diagState: $("#diagState"), diagUsableFrames: $("#diagUsableFrames"), diagBelowGate: $("#diagBelowGate"), diagLowClarity: $("#diagLowClarity"), diagIsolatedJump: $("#diagIsolatedJump"), diagOctaveAmbiguity: $("#diagOctaveAmbiguity"), diagOutOfRange: $("#diagOutOfRange"), diagAccepted: $("#diagAccepted"), pitchSelfTest: $("#pitchSelfTest"), pitchSelfTestResult: $("#pitchSelfTestResult"),
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
  scoreGeometry: new Map(),
  measureGeometry: [],
  overlayResizeTimer: null,
  syncFrame: null,
  toastTimer: null,
  rendering: false,
  microphoneSensitivity: DEFAULT_MICROPHONE_SENSITIVITY,
  microphoneCalibration: loadMicrophoneCalibration(),
  countInBars: DEFAULT_COUNT_IN_BARS,
  octaveShift: DEFAULT_OCTAVE_SHIFT,
  sessionOctaveShift: null,
  automaticOctave: true,
  octaveSelector: new AutomaticOctaveSelector(),
  currentSessionComfortableFrequency: null,
  guideVolume: PLAYBACK_CONFIG.defaultGuideVolume,
  accompanimentVolume: PLAYBACK_CONFIG.defaultAccompanimentVolume,
  lastTimingDebugAt: 0,
  followScore: true,
  lastFollowSystem: null,
  finishingAssessment: false,
  recording: null,
  activeTake: null,
  reviewLayers: reviewLayers(),
  reviewVolumes: reviewVolumes(),
  reviewSyncFrame: null,
  reviewPlaying: false,
  reviewActivationToken: 0,
  recordingAvailable: true,
  liveTuningFeedback: new LiveTuningFeedback(),
  microphoneActivationToken: 0,
  microphonePreparing: false,
  pitchDiagnosticSummary: new PitchDiagnosticSummary(),
  sectionStartMeasure: null,
  sectionEndMeasure: null,
  startMeasure: null,
  rangeSelectionMode: false,
  rangeSelectionStart: null,
  startPickMode: false,
  pendingStartMeasure: null,
};

const audio = new AudioEngine({
  onPitchSample: handlePitchSample,
  onRawPitchSample: handleRawPitchSample,
  onPitchDiagnostic: handlePitchDiagnostic,
  onMicrophoneState: handleMicrophoneState,
  onMicrophoneCalibration: handleMicrophoneCalibration,
  onRecordingState: handleRecordingState,
  onCountIn: handleCountIn,
  onPlaybackEnd: handlePlaybackEnd,
});
audio.setMicrophoneCalibration(state.microphoneCalibration);

function loadMicrophoneCalibration() {
  try {
    return normaliseSavedMicrophoneCalibration(JSON.parse(localStorage.getItem(MICROPHONE_CALIBRATION.storageKey)));
  } catch {
    return null;
  }
}

function saveMicrophoneCalibration(calibration) {
  try {
    localStorage.setItem(MICROPHONE_CALIBRATION.storageKey, JSON.stringify(calibration));
  } catch (error) {
    console.warn("Could not save microphone calibration locally", error);
  }
}

function clearSavedMicrophoneCalibration() {
  try {
    localStorage.removeItem(MICROPHONE_CALIBRATION.storageKey);
  } catch (error) {
    console.warn("Could not clear microphone calibration", error);
  }
}

function showView(name) {
  els.uploadView.hidden = name !== "upload";
  els.loadingView.hidden = name !== "loading";
  els.partView.hidden = name !== "parts";
  els.studioView.hidden = name !== "studio";
  document.body.classList.toggle("studio-active", name === "studio");
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
  const { firstMeasure } = practiceLimits(vocalPart);
  state.sectionStartMeasure = null;
  state.sectionEndMeasure = null;
  state.startMeasure = firstMeasure;
  state.rangeSelectionMode = false;
  state.rangeSelectionStart = null;
  state.startPickMode = false;
  state.pendingStartMeasure = null;
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
}

function selectedPart() {
  return state.score?.parts.find((part) => part.id === state.selectedPartId) || null;
}

function currentPracticeRange() {
  return resolvePracticeRange(selectedPart(), {
    sectionStartMeasure: state.sectionStartMeasure,
    sectionEndMeasure: state.sectionEndMeasure,
    startMeasure: state.startMeasure,
    fallbackTimeSignature: state.score?.initialTimeSignature,
  });
}

function startingNoteForRange(range = currentPracticeRange()) {
  const starting = firstNoteAtOrAfter(selectedPart()?.vocalTimeline || [], range.startQuarter);
  return starting && starting.onsetQuarters < range.endQuarter ? starting : null;
}

function timelineForRange(range = currentPracticeRange()) {
  return (selectedPart()?.vocalTimeline || []).filter((note) => (
    note.onsetQuarters < range.endQuarter
    && note.onsetQuarters + note.durationQuarters > range.startQuarter
  ));
}

function setSectionMessage(message, error = false) {
  els.sectionValidation.textContent = message;
  els.sectionValidation.classList.toggle("error", error);
}

function renderPracticeRangeOverlay() {
  if (!state.osmd) return;
  const range = currentPracticeRange();
  renderMeasureSelection(els.scoreContainer, state.measureGeometry, {
    sectionStartMeasure: range.sectionStartMeasure,
    sectionEndMeasure: range.sectionEndMeasure,
    startMeasure: range.startMeasure,
    interactionMode: state.rangeSelectionMode ? "range" : state.startPickMode ? "start" : null,
    pendingMeasure: state.pendingStartMeasure ?? state.rangeSelectionStart,
  });
}

function renderPracticeRangeControls() {
  const range = currentPracticeRange();
  const limits = practiceLimits(selectedPart());
  for (const input of [els.sectionFrom, els.sectionTo]) {
    input.min = String(limits.firstMeasure);
    input.max = String(limits.lastMeasure);
  }
  els.startFromBar.min = String(range.sectionStartMeasure);
  els.startFromBar.max = String(range.sectionEndMeasure);
  els.sectionFrom.value = String(range.sectionStartMeasure);
  els.sectionTo.value = String(range.sectionEndMeasure);
  els.startFromBar.value = String(range.startMeasure);
  els.practiceRangeStatus.textContent = range.wholePiece
    ? "Whole piece"
    : `Selected: bars ${range.sectionStartMeasure}–${range.sectionEndMeasure}`;
  els.selectBarsButton.classList.toggle("active", state.rangeSelectionMode);
  els.selectBarsButton.setAttribute("aria-pressed", String(state.rangeSelectionMode));
  els.chooseStartButton.classList.toggle("active", state.startPickMode);
  els.chooseStartButton.setAttribute("aria-pressed", String(state.startPickMode));
  els.dockRange.textContent = range.wholePiece
    ? `Bar ${range.startMeasure} · whole piece`
    : `Bar ${range.startMeasure} · section ${range.sectionStartMeasure}–${range.sectionEndMeasure}`;

  const choosing = state.rangeSelectionMode || state.startPickMode;
  els.scoreSelectionAction.hidden = !choosing;
  els.startHereButton.hidden = !state.startPickMode || state.pendingStartMeasure === null;
  if (state.rangeSelectionMode) {
    els.scoreSelectionCopy.textContent = state.rangeSelectionStart === null
      ? "Select the first bar of the practice section."
      : `Bar ${state.rangeSelectionStart} is the start. Now select the last bar.`;
  } else if (state.startPickMode) {
    els.scoreSelectionCopy.textContent = state.pendingStartMeasure === null
      ? "Select a bar in the score, then confirm Start here."
      : `Bar ${state.pendingStartMeasure} selected.`;
  }
  renderPracticeRangeOverlay();
}

function setCursorToQuarter(quarter) {
  resetCursor();
  syncCursor(quarter);
}

function clearTakeForRangeChange() {
  stopPerformanceReview({ resetCursorPosition: false });
  state.samples = [];
  state.rawSamples = [];
  state.acceptedSamples = [];
  state.activeTake = null;
  els.sampleCount.textContent = "0";
  els.resultsPanel.hidden = true;
  clearPerformancePlayback();
  audio.discardPerformanceRecording();
  resetPitchDiagnostics();
  renderScoreTrace(els.scoreContainer, state.scoreGeometry, []);
}

function moveToPracticeStart({ clearTake = true } = {}) {
  const range = currentPracticeRange();
  if (clearTake) clearTakeForRangeChange();
  audio.stop({ reset: true, resetQuarter: range.startQuarter, microphone: false });
  unlockSessionOctave();
  applyComfortableOctaveSuggestion();
  setPlaybackState("stopped");
  setCursorToQuarter(range.startQuarter);
  updatePosition(range.startQuarter);
  renderPracticeRangeControls();
}

function cancelScoreSelection() {
  state.rangeSelectionMode = false;
  state.rangeSelectionStart = null;
  state.startPickMode = false;
  state.pendingStartMeasure = null;
  renderPracticeRangeControls();
}

function applySectionInputs() {
  if (audio.isPlaying || audio.isPaused || audio.isCountingIn) return;
  const validation = validateSection(selectedPart(), els.sectionFrom.value, els.sectionTo.value);
  if (!validation.valid) {
    setSectionMessage(validation.message, true);
    return;
  }
  state.sectionStartMeasure = validation.startMeasure;
  state.sectionEndMeasure = validation.endMeasure;
  state.startMeasure = validation.startMeasure;
  cancelScoreSelection();
  setSectionMessage(`Selected bars ${validation.startMeasure}–${validation.endMeasure}.`);
  moveToPracticeStart();
}

function clearPracticeSection() {
  if (audio.isPlaying || audio.isPaused || audio.isCountingIn) return;
  const { firstMeasure, lastMeasure } = practiceLimits(selectedPart());
  state.sectionStartMeasure = null;
  state.sectionEndMeasure = null;
  state.startMeasure = firstMeasure;
  cancelScoreSelection();
  setSectionMessage(`Whole piece selected: bars ${firstMeasure}–${lastMeasure}.`);
  moveToPracticeStart();
}

function applyStartFromInput(value = els.startFromBar.value) {
  if (audio.isPlaying || audio.isPaused || audio.isCountingIn) return false;
  const requested = Number(value);
  const range = currentPracticeRange();
  const exists = practiceLimits(selectedPart()).measures.some((measure) => measure.measureNumber === requested);
  if (!Number.isInteger(requested) || !exists || requested < range.sectionStartMeasure || requested > range.sectionEndMeasure) {
    const bounds = range.wholePiece
      ? `${range.firstMeasure} to ${range.lastMeasure}`
      : `${range.sectionStartMeasure} to ${range.sectionEndMeasure}`;
    setSectionMessage(`Start from must be an existing bar from ${bounds}.`, true);
    els.startFromBar.value = String(range.startMeasure);
    return false;
  }
  state.startMeasure = requested;
  cancelScoreSelection();
  setSectionMessage(range.wholePiece
    ? `Playback will start at bar ${requested} and continue to the end.`
    : `Playback will assess bars ${requested}–${range.sectionEndMeasure}.`);
  moveToPracticeStart();
  return true;
}

function toggleRangeSelection() {
  if (audio.isPlaying || audio.isPaused || audio.isCountingIn) return;
  const enabling = !state.rangeSelectionMode;
  state.rangeSelectionMode = enabling;
  state.rangeSelectionStart = null;
  state.startPickMode = false;
  state.pendingStartMeasure = null;
  setSectionMessage(enabling ? "Select the first bar in the score." : "Score selection cancelled.");
  renderPracticeRangeControls();
}

function toggleStartPick() {
  if (audio.isPlaying || audio.isPaused || audio.isCountingIn) return;
  const enabling = !state.startPickMode;
  state.startPickMode = enabling;
  state.pendingStartMeasure = null;
  state.rangeSelectionMode = false;
  state.rangeSelectionStart = null;
  setSectionMessage(enabling ? "Select a bar in the score, then choose Start here." : "Start selection cancelled.");
  renderPracticeRangeControls();
}

function selectScoreMeasure(measureNumber) {
  const measure = Number(measureNumber);
  if (state.rangeSelectionMode) {
    if (state.rangeSelectionStart === null) {
      state.rangeSelectionStart = measure;
      setSectionMessage(`Bar ${measure} selected as the section start. Choose the last bar.`);
      renderPracticeRangeControls();
      return;
    }
    if (measure < state.rangeSelectionStart) {
      setSectionMessage("The last bar must be the same as or later than the first bar.", true);
      return;
    }
    els.sectionFrom.value = String(state.rangeSelectionStart);
    els.sectionTo.value = String(measure);
    applySectionInputs();
    return;
  }
  if (state.startPickMode) {
    state.pendingStartMeasure = measure;
    setSectionMessage(`Bar ${measure} selected. Choose Start here to confirm.`);
    renderPracticeRangeControls();
  }
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
        // Transport owns score following so a manual scroll is not overridden
        // on every cursor step. We follow only at meaningful system changes.
        followCursor: false,
        drawingParameters: "compact",
        cursorsOptions: [{ color: "#d8ff78", alpha: 0.72, follow: false }],
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
    rebuildScoreTrace();
    setCursorToQuarter(currentPracticeRange().startQuarter);
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

function rebuildScoreTrace() {
  if (!state.osmd || !state.score || !selectedPart()) return;
  try {
    const instrumentIndex = state.score.parts.findIndex((part) => part.id === state.selectedPartId);
    state.scoreGeometry = buildScoreGeometry(state.osmd, selectedPart().vocalTimeline, instrumentIndex);
    const selectableMeasures = new Set(practiceLimits(selectedPart()).measures.map((measure) => measure.measureNumber));
    state.measureGeometry = buildMeasureGeometry(state.osmd, selectedPart().vocalTimeline, instrumentIndex)
      .filter((measure) => selectableMeasures.has(measure.measureNumber));
    renderScoreTrace(els.scoreContainer, state.scoreGeometry, state.samples);
    renderPracticeRangeOverlay();
    els.scoreContainer.dataset.mappedNotes = String(state.scoreGeometry.size);
  } catch (error) {
    state.scoreGeometry = new Map();
    state.measureGeometry = [];
    console.warn("Could not map the vocal trace to the rendered score", error);
  }
}

function scheduleScoreTraceRefresh() {
  clearTimeout(state.overlayResizeTimer);
  state.overlayResizeTimer = setTimeout(rebuildScoreTrace, 320);
}

function resetCursor() {
  state.cursorQuarter = -1;
  state.cursorIndex = 0;
  state.lastFollowSystem = null;
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

function updateMicrophoneCheckSetting() {
  const ready = Boolean(state.microphoneCalibration?.signalGood);
  els.microphoneCheckStatus.textContent = ready ? "Ready" : "Not checked";
  els.microphoneCheckCopy.textContent = ready
    ? "Signal: Good. This device is ready for microphone-based sessions."
    : "A quick room-and-voice check runs before your first assessment on this device.";
}

function handleMicrophoneCalibration(calibration) {
  state.microphoneCalibration = calibration;
  state.currentSessionComfortableFrequency = calibration?.signalGood ? calibration.stableFrequency : null;
  saveMicrophoneCalibration(calibration);
  updateMicrophoneCheckSetting();
  applyComfortableOctaveSuggestion();
}

async function recheckMicrophone() {
  if (audio.isPlaying || audio.isPaused || audio.isCountingIn) return;
  state.microphoneCalibration = null;
  clearSavedMicrophoneCalibration();
  updateMicrophoneCheckSetting();
  setTransportBusy(true);
  els.recheckMicrophoneButton.disabled = true;
  try {
    const calibration = await audio.recheckMicrophone({
      keepActive: MODE_CONFIG[state.mode].microphone,
      targetMidiAtQuarter,
    });
    if (calibration?.signalGood) toast("Microphone ready — signal good.");
    else toast("Move a little closer to your microphone and try again.");
  } catch (error) {
    console.error(error);
    if (error?.name === "NotAllowedError") toast("Microphone permission was blocked.");
    else toast(error.message || "The microphone check could not run.");
  } finally {
    els.recheckMicrophoneButton.disabled = false;
    setTransportBusy(false);
  }
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

function setOctaveShift(value, { manual = false, confirmed = false } = {}) {
  if (state.sessionOctaveShift !== null || audio.isPlaying || audio.isPaused || audio.isCountingIn) return;
  const nextShift = [-12, 0, 12].includes(Number(value)) ? Number(value) : 0;
  if (manual) setAutomaticOctave(false, { preserveShift: true });
  const changed = nextShift !== state.octaveShift;
  if (nextShift !== state.octaveShift && state.samples.length) {
    state.samples = [];
    state.rawSamples = [];
    state.acceptedSamples = [];
    els.sampleCount.textContent = "0";
    els.resultsPanel.hidden = true;
    els.finishButton.disabled = true;
    renderScoreTrace(els.scoreContainer, state.scoreGeometry, []);
  }
  state.octaveShift = nextShift;
  if (changed) setTuningMeterInactive("Listening…");
  els.octaveButtons.forEach((button) => {
    const active = Number(button.dataset.octave) === state.octaveShift;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  els.octaveOutput.textContent = state.automaticOctave
    ? "Automatic"
    : state.octaveShift < 0 ? "Octave lower" : state.octaveShift > 0 ? "Octave higher" : "Written";
  if (confirmed) {
    const starting = startingNoteForRange();
    const soundingName = starting ? midiToName(starting.midi + state.octaveShift) : "this pitch";
    els.octaveConfirmation.textContent = `✓ We’ll use the octave that suits your voice: ${soundingName}`;
    els.octaveConfirmation.classList.add("confirmed");
  }
  updateOctaveHint(noteAtQuarter(selectedPart()?.vocalTimeline || [], audio.currentQuarter) || selectedPart()?.vocalTimeline[0]);
  updatePosition(audio.currentQuarter);
}

function effectiveOctaveShift() {
  return state.sessionOctaveShift ?? state.octaveShift;
}

function lockSessionOctave() {
  if (state.sessionOctaveShift === null) state.sessionOctaveShift = state.octaveShift;
  return state.sessionOctaveShift;
}

function unlockSessionOctave() {
  state.sessionOctaveShift = null;
  if (state.automaticOctave) state.octaveSelector.reset();
}

function setAutomaticOctave(enabled, { preserveShift = false } = {}) {
  state.automaticOctave = Boolean(enabled);
  els.automaticOctave.checked = state.automaticOctave;
  els.octaveButtons.forEach((button) => { button.disabled = state.automaticOctave; });
  state.octaveSelector.reset();
  els.octaveConfirmation.classList.remove("confirmed");
  if (state.automaticOctave) {
    els.octaveConfirmation.textContent = "We’ll choose a comfortable octave automatically when you sing it back.";
    applyComfortableOctaveSuggestion();
  } else {
    els.octaveConfirmation.textContent = "Manual octave is active for this session.";
    if (!preserveShift) setOctaveShift(state.octaveShift);
  }
  els.octaveOutput.textContent = state.automaticOctave
    ? "Automatic"
    : state.octaveShift < 0 ? "Octave lower" : state.octaveShift > 0 ? "Octave higher" : "Written";
}

function applyComfortableOctaveSuggestion() {
  if (!state.automaticOctave || !state.currentSessionComfortableFrequency || !selectedPart()) return;
  const range = currentPracticeRange();
  const suggestion = suggestOctaveFromComfortablePitch(
    selectedPart().vocalTimeline.filter((note) => note.onsetQuarters >= range.startQuarter && note.onsetQuarters < range.endQuarter),
    state.currentSessionComfortableFrequency,
  );
  if (!suggestion) return;
  setOctaveShift(suggestion.shift);
  const starting = startingNoteForRange();
  els.octaveConfirmation.textContent = starting
    ? `Suggested from this microphone check: ${midiToName(starting.midi + suggestion.shift)}. Sing it back to confirm.`
    : "Sing the starting note to confirm the automatic octave.";
}

function maybeConfirmAutomaticOctave(sample, targetInfo, phase) {
  if (state.sessionOctaveShift !== null || !state.automaticOctave || phase !== "preparation" || targetInfo?.kind !== "starting") return;
  const sungMidi = visualMidiForSample(sample);
  const confirmation = state.octaveSelector.observe({
    sungMidi,
    writtenMidi: targetInfo.note?.midi,
    capturedAt: sample.capturedAt,
  });
  if (!confirmation) return;
  setOctaveShift(confirmation.shift, { confirmed: true });
  setStatus("good", `✓ Comfortable octave selected: ${midiToName(confirmation.soundingMidi)}`, "Your score stays written as printed; guide and assessment will sound here.");
}

async function hearStartingNote() {
  const starting = startingNoteForRange();
  if (!starting) return;
  els.hearStartingNote.disabled = true;
  try {
    await audio.previewPitch(starting.midi + effectiveOctaveShift());
  } catch (error) {
    console.error(error);
    toast("The starting note could not play.");
  } finally {
    setTimeout(() => { els.hearStartingNote.disabled = false; }, 720);
  }
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

function tuningPhase() {
  if (audio.isCountingIn) return "count-in";
  if (audio.isPlaying) return "performance";
  return "preparation";
}

function tuningTarget(quarter = audio.currentQuarter, phase = tuningPhase()) {
  if (phase === "preparation" || phase === "count-in") {
    const starting = startingNoteForRange();
    return { note: starting, kind: starting ? "starting" : "rest" };
  }
  return tuningTargetAtQuarter(timelineForRange(), quarter, phase);
}

function targetMidiAtQuarter(quarter) {
  const target = tuningTarget(quarter).note;
  return target ? target.midi + effectiveOctaveShift() : null;
}

function soundingTargetName(note) {
  return note ? midiToName(note.midi + effectiveOctaveShift()) : "Rest";
}

function updateOctaveHint(note) {
  const octaveShift = effectiveOctaveShift();
  const direction = state.automaticOctave
    ? "Automatic octave"
    : octaveShift < 0 ? "Sing octave lower" : octaveShift > 0 ? "Sing octave higher" : "Sing written pitch";
  els.octaveHint.textContent = note ? `${direction} — sounding target ${soundingTargetName(note)}` : `${direction} — sounding target rests`;
  const starting = startingNoteForRange();
  els.startingNoteName.textContent = starting
    ? midiToName(starting.midi + octaveShift)
    : "—";
}

function phaseLabel(phase = tuningPhase()) {
  if (phase === "count-in") return "Count-in tuning · not assessed";
  if (phase === "performance") return "Performance assessment";
  return MODE_CONFIG[state.mode].microphone ? "Pre-performance tuning · not assessed" : "Practice mode";
}

function setTuningMeterInactive(message = "Listening…") {
  state.liveTuningFeedback.reset();
  els.tuningMeter.classList.add("is-listening");
  els.tuningMeter.classList.remove("is-held");
  els.tuningMeter.classList.toggle("is-inactive", !MODE_CONFIG[state.mode].microphone);
  els.tuningMeter.style.setProperty("--tuner-position", "50%");
  els.tuningMeter.style.setProperty("--tuner-colour", "#82928c");
  els.tuningMeter.removeAttribute("aria-valuenow");
  els.tuningMeter.setAttribute("aria-label", `Live tuning: ${message}`);
  els.detectedNote.textContent = "—";
  els.detectedFrequency.textContent = MODE_CONFIG[state.mode].microphone ? message : "Choose a microphone mode to listen";
  els.centsOutput.textContent = message;
  els.centsOutput.style.color = "";
  els.tuningPhase.textContent = phaseLabel();
}

function renderLiveTuning(sample, targetInfo) {
  const midi = visualMidiForSample(sample);
  if (!Number.isFinite(midi) || !targetInfo?.note) return;
  const targetMidi = targetInfo.note.midi + effectiveOctaveShift();
  const cents = (midi - targetMidi) * 100;
  const feedback = state.liveTuningFeedback.accept({ midi, cents }, sample.capturedAt);
  const displayCents = Math.max(-LIVE_TUNING_CONFIG.displayRangeCents, Math.min(LIVE_TUNING_CONFIG.displayRangeCents, cents));
  const position = 50 - displayCents / (LIVE_TUNING_CONFIG.displayRangeCents * 2) * 100;
  const colour = colourForCents(cents);
  els.tuningMeter.classList.remove("is-listening", "is-inactive", "is-held");
  els.tuningMeter.style.setProperty("--tuner-position", `${position}%`);
  els.tuningMeter.style.setProperty("--tuner-colour", colour);
  els.tuningMeter.setAttribute("aria-valuenow", String(Math.round(displayCents)));
  els.tuningMeter.setAttribute("aria-label", `Live tuning: ${Math.round(cents)} cents ${cents > 0 ? "sharp" : cents < 0 ? "flat" : "centred"}`);
  els.detectedNote.textContent = midiToName(feedback.value.midi);
  els.detectedFrequency.textContent = `${sample.frequency.toFixed(1)} Hz · ${(sample.clarity * 100).toFixed(0)}% clarity`;
  els.centsOutput.textContent = Math.abs(cents) < 1 ? "Centred" : `${Math.abs(cents).toFixed(0)}c ${cents > 0 ? "sharp" : "flat"}`;
  els.centsOutput.style.color = colour;
  els.tuningPhase.textContent = phaseLabel();
  return { midi, cents };
}

function renderTuningDropout(sample) {
  const feedback = state.liveTuningFeedback.reject(sample.capturedAt);
  if (feedback.status === "active") {
    els.tuningMeter.classList.add("is-held");
    return;
  }
  els.tuningMeter.classList.remove("is-held");
  els.tuningMeter.classList.add("is-listening");
  els.tuningMeter.style.setProperty("--tuner-colour", "#82928c");
  els.tuningMeter.removeAttribute("aria-valuenow");
  els.tuningMeter.setAttribute("aria-label", "Live tuning: listening");
  els.detectedFrequency.textContent = "Listening…";
  els.detectedNote.textContent = "—";
  els.centsOutput.textContent = "Listening…";
  els.centsOutput.style.color = "#82928c";
}

async function activateMicrophonePreparation(token) {
  state.microphonePreparing = true;
  els.playButton.disabled = true;
  els.dockPlayPauseButton.disabled = true;
  els.recheckMicrophoneButton.disabled = true;
  try {
    await audio.startMicrophoneMonitoring(targetMidiAtQuarter);
    if (token !== state.microphoneActivationToken || !MODE_CONFIG[state.mode].microphone) return;
    updatePosition(audio.currentQuarter);
    setStatus("idle", "Find your starting note", "The live tuner is active. These preparation samples are not assessed.");
  } catch (error) {
    if (token !== state.microphoneActivationToken) return;
    if (error?.name === "AbortError" && MODE_CONFIG[state.mode].microphone) {
      queueMicrotask(() => {
        if (token === state.microphoneActivationToken) void activateMicrophonePreparation(token);
      });
      return;
    }
    console.error(error);
    if (error?.name === "MicrophoneCheckError") toast("Move a little closer to your microphone and try again.");
    else if (error?.name === "NotAllowedError") toast("Microphone permission was blocked. Allow access or switch to Practice mode.");
    else toast(error.message || "The microphone could not start.");
    setStatus("off", "Microphone unavailable", "Allow microphone access or switch to Practice mode.");
  } finally {
    if (token === state.microphoneActivationToken) {
      state.microphonePreparing = false;
      els.playButton.disabled = false;
      els.dockPlayPauseButton.disabled = false;
      els.recheckMicrophoneButton.disabled = false;
    }
  }
}

function setMode(mode) {
  if (!MODE_CONFIG[mode] || audio.isPlaying || audio.isPaused || audio.isCountingIn) return;
  state.microphoneActivationToken += 1;
  const activationToken = state.microphoneActivationToken;
  state.mode = mode;
  els.modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  const config = MODE_CONFIG[mode];
  els.headphoneNote.hidden = !config.microphone;
  document.body.classList.toggle("microphone-mode", config.microphone);
  els.transportState.textContent = `${config.label} ready`;
  els.dockTransportState.textContent = els.transportState.textContent;
  updatePosition(audio.currentQuarter);
  if (config.microphone) {
    setTuningMeterInactive("Listening…");
    setStatus(
      "idle",
      state.microphoneCalibration ? "Starting live tuner…" : "Microphone Check first",
      state.microphoneCalibration
        ? "Your saved calibration will be used for pre-performance tuning."
        : "Your first microphone session starts with a short room-and-voice check.",
    );
    void activateMicrophonePreparation(activationToken);
  } else {
    state.microphonePreparing = false;
    audio.stopMicrophone();
    setTuningMeterInactive("Practice mode");
    els.playButton.disabled = false;
    els.dockPlayPauseButton.disabled = false;
    els.recheckMicrophoneButton.disabled = false;
    setStatus("idle", "Ready when you are", "Practice plays the vocal guide and accompaniment without scoring.");
  }
}

async function play() {
  if (!state.score || state.rendering || state.microphonePreparing) return;
  stopPerformanceReview({ resetCursorPosition: false });
  const mode = MODE_CONFIG[state.mode];
  const range = currentPracticeRange();
  const freshStart = !audio.isPaused;
  const takeOctaveShift = freshStart ? lockSessionOctave() : effectiveOctaveShift();
  const freshAssessment = mode.microphone && freshStart;
  if (freshAssessment) {
    state.samples = [];
    state.rawSamples = [];
    state.acceptedSamples = [];
    resetPitchDiagnostics();
    state.activeTake = createTakeMetadata({
      tempoPercent: audio.tempoPercent,
      bpm: audio.bpm,
      octaveShift: takeOctaveShift,
      enabledPartIds: [...state.enabledParts],
      guideEnabled: mode.guide,
      durationSeconds: (range.endQuarter - range.startQuarter) * 60 / audio.bpm,
      vocalPartId: state.selectedPartId,
      startMeasure: range.startMeasure,
      endMeasure: range.endMeasure,
      startQuarter: range.startQuarter,
      endQuarter: range.endQuarter,
    });
    els.resultsPanel.hidden = true;
    els.sampleCount.textContent = "0";
    renderScoreTrace(els.scoreContainer, state.scoreGeometry, []);
    clearPerformancePlayback();
    audio.discardPerformanceRecording();
  }
  setTransportBusy(true);
  try {
    await audio.play({
      vocalPartId: state.selectedPartId,
      guideEnabled: mode.guide,
      enabledPartIds: [...state.enabledParts],
      assessmentMode: mode.microphone,
      vocalOctaveSemitones: takeOctaveShift,
      countInBars: state.countInBars,
      targetMidiAtQuarter: targetMidiAtQuarter,
      startQuarter: range.startQuarter,
      endQuarter: range.endQuarter,
      startTimeSignature: range.timeSignature,
    });
    setPlaybackState("playing");
    startSync();
  } catch (error) {
    if (!audio.isPlaying && !audio.isPaused) unlockSessionOctave();
    if (error?.name === "AbortError") {
      setPlaybackState("stopped");
      return;
    }
    console.error(error);
    if (error?.name === "MicrophoneCheckError") toast("Move a little closer to your microphone and try again.");
    else if (error?.name === "NotAllowedError") toast("Microphone permission was blocked. Allow access or switch to Practice mode.");
    else toast(error.message || "Playback could not start.");
    if (error?.name !== "MicrophoneCheckError") {
      setStatus("off", "Couldn’t start", error?.name === "NotAllowedError" ? "Microphone permission is required for Assessment." : "Check the browser console or try Practice mode.");
    }
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

async function stop({ keepSamples = true, completeAssessment = true } = {}) {
  if (completeAssessment && MODE_CONFIG[state.mode].microphone && (audio.hasActivePerformanceRecording || state.samples.length)) {
    await finishAssessment();
    return;
  }
  const range = currentPracticeRange();
  audio.stop({ reset: true, resetQuarter: range.startQuarter, microphone: !MODE_CONFIG[state.mode].microphone });
  unlockSessionOctave();
  cancelAnimationFrame(state.syncFrame);
  setPlaybackState("stopped");
  setCursorToQuarter(range.startQuarter);
  updatePosition(range.startQuarter);
  if (MODE_CONFIG[state.mode].microphone) setStatus("idle", "Find your starting note", "The live tuner is active. Preparation samples are not assessed.");
  if (!keepSamples) {
    state.samples = [];
    els.sampleCount.textContent = "0";
    els.resultsPanel.hidden = true;
    renderScoreTrace(els.scoreContainer, state.scoreGeometry, []);
  }
}

async function restartTransport() {
  const range = currentPracticeRange();
  if (audio.hasActivePerformanceRecording) await audio.finishPerformanceRecording();
  audio.stop({ reset: true, resetQuarter: range.startQuarter, microphone: !MODE_CONFIG[state.mode].microphone });
  unlockSessionOctave();
  audio.discardPerformanceRecording();
  cancelAnimationFrame(state.syncFrame);
  state.samples = [];
  state.rawSamples = [];
  state.acceptedSamples = [];
  resetPitchDiagnostics();
  els.sampleCount.textContent = "0";
  els.resultsPanel.hidden = true;
  clearPerformancePlayback();
  renderScoreTrace(els.scoreContainer, state.scoreGeometry, []);
  setPlaybackState("stopped");
  setCursorToQuarter(range.startQuarter);
  updatePosition(range.startQuarter);
  setStatus("idle", `Back at bar ${range.startMeasure}`, MODE_CONFIG[state.mode].microphone ? "Find the starting note, then press Play for a new take." : "Press play when you are ready for a new take.");
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
  els.recheckMicrophoneButton.disabled = locked;
  els.dockRestartButton.disabled = busy && !audio.isCountingIn;
  els.dockPlayPauseButton.disabled = busy;
  els.dockStopButton.disabled = !audio.isPlaying && !audio.isPaused && !audio.isCountingIn;
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
  els.dockTransportState.textContent = els.transportState.textContent;
  els.dockPlayPauseButton.disabled = false;
  els.dockPlayPauseButton.innerHTML = playing ? "⏸ <span>Pause</span>" : "▶ <span>Play</span>";
  els.dockPlayPauseButton.setAttribute("aria-label", playing ? "Pause" : paused ? "Resume" : "Play");
  els.dockStopButton.disabled = !(playing || paused);
  els.dockRestartButton.disabled = false;
  els.recheckMicrophoneButton.disabled = playing || paused;
  if (playing) setStatus("idle", MODE_CONFIG[state.mode].microphone ? "Listening" : "Playing your score", MODE_CONFIG[state.mode].microphone ? "Sing the selected line while the cursor moves." : "Follow the guide and accompaniment.");
}

function setSetupControlsDisabled(disabled) {
  els.tempoSlider.disabled = disabled;
  els.modeButtons.forEach((button) => { button.disabled = disabled; });
  els.sensitivityButtons.forEach((button) => { button.disabled = disabled; });
  els.recheckMicrophoneButton.disabled = disabled;
  els.countInButtons.forEach((button) => { button.disabled = disabled; });
  els.octaveButtons.forEach((button) => { button.disabled = disabled || state.automaticOctave; });
  els.automaticOctave.disabled = disabled;
  els.hearStartingNote.disabled = disabled;
  for (const control of [els.sectionFrom, els.sectionTo, els.selectBarsButton, els.clearSectionButton, els.startFromBar, els.chooseStartButton]) {
    control.disabled = disabled;
  }
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
  if (!part) return;
  const range = currentPracticeRange();
  const seconds = Math.max(0, quarter - range.startQuarter) * 60 / audio.bpm;
  const duration = Math.max(0, range.endQuarter - range.startQuarter) * 60 / audio.bpm;
  els.currentTime.textContent = formatTime(seconds);
  els.totalTime.textContent = formatTime(duration);
  els.dockCurrentTime.textContent = formatTime(seconds);
  els.dockTotalTime.textContent = formatTime(duration);
  els.progressFill.style.width = `${Math.min(100, duration ? seconds / duration * 100 : 0)}%`;
  const measure = measureAtQuarter(part, quarter);
  els.measureNumber.textContent = String(measure);
  els.sideMeasure.textContent = String(measure);
  els.dockMeasure.textContent = String(measure);
  els.dockRange.textContent = range.wholePiece
    ? `Bar ${range.startMeasure} · whole piece`
    : `Bar ${range.startMeasure} · section ${range.sectionStartMeasure}–${range.sectionEndMeasure}`;
  const writtenCurrent = noteAtQuarter(part.vocalTimeline, quarter);
  const targetInfo = tuningTarget(quarter);
  const expected = targetInfo.note;
  if (expected) {
    els.expectedLabel.textContent = targetInfo.kind === "starting" ? "Starting note" : targetInfo.kind === "next" ? "Next note" : "Expected note";
    els.expectedNote.textContent = soundingTargetName(expected);
    const octaveShift = effectiveOctaveShift();
    const octave = octaveShift < 0 ? "Octave lower" : octaveShift > 0 ? "Octave higher" : "";
    const written = octaveShift ? `written ${expected.displayPitch}` : "";
    els.expectedPosition.textContent = [octave, written, `Measure ${expected.measureNumber} · beat ${formatBeat(expected.beatPosition)}`].filter(Boolean).join(" · ");
  } else {
    els.expectedLabel.textContent = "Next note";
    els.expectedNote.textContent = "Rest";
    els.expectedPosition.textContent = `No later vocal entrance · measure ${measure}`;
  }
  els.tuningPhase.textContent = phaseLabel();
  updateOctaveHint(expected);
  syncCursor(quarter);
  followScoreAtQuarter(quarter, writtenCurrent);
  logTimingDebug(quarter);
}

function followScoreAtQuarter(quarter, expectedNote = null) {
  if (!state.followScore) return;
  const regions = expectedNote ? state.scoreGeometry.get(expectedNote.id) || [] : [];
  const region = regions.find((candidate) => quarter >= candidate.qStart - 0.015 && quarter <= candidate.qEnd + 0.015)
    || state.measureGeometry.find((candidate) => quarter >= candidate.qStart - 0.015 && quarter < candidate.qEnd + 0.015);
  if (!region || region.system === state.lastFollowSystem) return;
  state.lastFollowSystem = region.system;
  const marker = (expectedNote
    ? [...els.scoreContainer.querySelectorAll(".score-note-focus")]
      .find((candidate) => candidate.dataset.noteId === expectedNote.id)
    : null)
    || [...els.scoreContainer.querySelectorAll(".score-measure-region")]
      .find((candidate) => Number(candidate.dataset.measureNumber) === Number(region.measureNumber));
  if (!marker) return;
  const markerRect = marker.getBoundingClientRect();
  const containerRect = els.scoreContainer.getBoundingClientRect();
  const dockRect = document.getElementById("transportDock")?.getBoundingClientRect();
  const topSafe = containerRect.top + 42;
  const bottomSafe = Math.min(containerRect.bottom - 72, (dockRect?.top ?? window.innerHeight) - 24);
  if (markerRect.top >= topSafe && markerRect.bottom <= bottomSafe) return;
  const targetTop = els.scoreContainer.scrollTop + markerRect.top - containerRect.top - els.scoreContainer.clientHeight * 0.28;
  els.scoreContainer.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
}

function toggleScoreFollow() {
  state.followScore = !state.followScore;
  state.lastFollowSystem = null;
  els.followScoreButton.classList.toggle("active", state.followScore);
  els.followScoreButton.setAttribute("aria-pressed", String(state.followScore));
  if (state.followScore) {
    const quarter = state.reviewPlaying && state.recording
      ? reviewQuarterAtSeconds(els.performanceAudio.currentTime, state.recording.take.bpm, state.recording.take.startQuarter, state.recording.take.endQuarter)
      : audio.currentQuarter;
    followScoreAtQuarter(quarter, noteAtQuarter(selectedPart()?.vocalTimeline || [], quarter));
  }
}

function handlePitchSample(sample) {
  if (!MODE_CONFIG[state.mode].microphone || !audio.hasMicrophoneStream) return;
  const phase = tuningPhase();
  const targetInfo = tuningTarget(sample.scoreQuarter, phase);
  maybeConfirmAutomaticOctave(sample, targetInfo, phase);
  const currentTargetInfo = tuningTarget(sample.scoreQuarter, phase);
  const live = renderLiveTuning(sample, currentTargetInfo);
  if (!currentTargetInfo.note || !live) return;

  const liveError = Math.abs(live.cents);
  const targetLabel = currentTargetInfo.kind === "next" ? "Next note" : currentTargetInfo.kind === "starting" ? "Starting note" : "Current note";
  if (currentTargetInfo.kind !== "current") {
    if (liveError <= PITCH_THRESHOLDS.green) {
      setStatus("good", `✓ ${targetLabel} centred`, `${soundingTargetName(currentTargetInfo.note)} is ready. This tuning check is not assessed.`);
    } else if (liveError <= PITCH_THRESHOLDS.yellow) {
      setStatus("warn", `${targetLabel} nearly centred`, live.cents > 0 ? "Ease the pitch down a touch." : "Lift the pitch gently from the breath.");
    } else {
      setStatus("off", `${targetLabel} ${live.cents > 0 ? "sharp" : "flat"}`, `Adjust toward ${soundingTargetName(currentTargetInfo.note)}. This tuning check is not assessed.`);
    }
    return;
  }

  if (!assessmentSampleEligible({ phase, targetKind: currentTargetInfo.kind })) return;
  const assessedRange = state.activeTake || currentPracticeRange();
  if (!sampleWithinRange(sample, assessedRange.startQuarter, assessedRange.endQuarter)) return;
  state.acceptedSamples.push({ ...sample });
  const target = currentTargetInfo.note;
  const midi = Number.isFinite(sample.filteredMidi) ? sample.filteredMidi : frequencyToMidi(sample.frequency);
  const targetMidi = target.midi + effectiveOctaveShift();
  const cents = (midi - targetMidi) * 100;
  const enriched = { ...sample, midi, cents, targetId: target.id, targetMidi, measureNumber: target.measureNumber };
  const previousSample = state.samples.at(-1);
  state.samples.push(enriched);
  appendScoreTraceSample(els.scoreContainer, state.scoreGeometry, enriched, previousSample);
  els.sampleCount.textContent = state.samples.length.toLocaleString();
  const error = liveError;
  if (error <= PITCH_THRESHOLDS.green) setStatus("good", "In the centre", "Keep the airflow and shape just like this.");
  else if (error <= PITCH_THRESHOLDS.yellow) setStatus("warn", "Nearly there", live.cents > 0 ? "Ease the pitch down a touch." : "Lift the pitch gently from the breath.");
  else setStatus("off", live.cents > 0 ? "Running sharp" : "Running flat", "Keep listening — the trace preserves how this note settles.");
  els.finishButton.disabled = false;
}

function handleRawPitchSample(sample) {
  const phase = tuningPhase();
  const targetKind = tuningTarget(sample.scoreQuarter, phase).kind;
  if (!MODE_CONFIG[state.mode].microphone || !assessmentSampleEligible({ phase, targetKind })) return;
  const assessedRange = state.activeTake || currentPracticeRange();
  if (!sampleWithinRange(sample, assessedRange.startQuarter, assessedRange.endQuarter)) return;
  state.rawSamples.push({ ...sample });
}

function handlePitchDiagnostic(sample) {
  const phase = tuningPhase();
  const targetKind = tuningTarget(sample.scoreQuarter, phase).kind;
  const assessedRange = state.activeTake || currentPracticeRange();
  if (assessmentSampleEligible({ phase, targetKind })
    && sampleWithinRange(sample, assessedRange.startQuarter, assessedRange.endQuarter)) {
    state.pitchDiagnosticSummary.add(sample);
    renderPitchDiagnosticSummary();
  }
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
  if (sample.status !== "accepted" && MODE_CONFIG[state.mode].microphone && audio.hasMicrophoneStream) {
    renderTuningDropout(sample);
  }
}

function renderPitchDiagnosticSummary() {
  const summary = state.pitchDiagnosticSummary.snapshot();
  els.diagUsableFrames.textContent = `${Math.round(summary.usablePercent)}%`;
  els.diagBelowGate.textContent = String(summary.belowGate);
  els.diagLowClarity.textContent = String(summary.lowClarity);
  els.diagIsolatedJump.textContent = String(summary.isolatedJump);
  els.diagOctaveAmbiguity.textContent = String(summary.octaveAmbiguity);
  els.diagOutOfRange.textContent = String(summary.outOfRange);
  els.diagAccepted.textContent = String(summary.accepted);
}

function resetPitchDiagnostics() {
  state.pitchDiagnosticSummary.reset();
  renderPitchDiagnosticSummary();
}

function handleCountIn(event) {
  if (event.status === "start") {
    els.countInDisplay.hidden = false;
    els.transportState.textContent = "Count-in";
    els.dockTransportState.textContent = "Count-in";
    els.countInBar.textContent = event.bars > 1 ? "Count-in · bar 1" : "Count-in";
    els.countInBeats.innerHTML = Array.from({ length: event.pulsesPerBar }, (_, index) => `<span>${index + 1}</span>`).join("");
    updatePosition(audio.currentQuarter);
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
  if (status === "checking-room") {
    els.microphoneCheckStatus.textContent = "Checking room";
    setStatus("idle", "Checking your room — stay quiet", "Listening to the room for about one second.");
  }
  if (status === "checking-voice") {
    els.microphoneCheckStatus.textContent = "Checking voice";
    setStatus("idle", "Now sing a comfortable “Ah” and hold it", "Any comfortable sung pitch is fine. Hold it for a few seconds.");
  }
  if (status === "ready") {
    updateMicrophoneCheckSetting();
    setStatus("good", "Microphone ready", "Signal: Good. Your calibration is saved on this device.");
  }
  if (status === "needs-adjustment") {
    setTuningMeterInactive("Microphone check needed");
    els.microphoneCheckStatus.textContent = "Try again";
    els.microphoneCheckCopy.textContent = "Move a little closer to your microphone, then run the check again.";
    setStatus("off", "Move a little closer to your microphone and try again", "Use Recheck microphone when you are in position.");
  }
  if (status === "active") {
    setStatus("idle", "Microphone active", "Find the starting note before Play. Preparation is not assessed.");
  }
}

function handleRecordingState(status) {
  if (status === "unsupported") state.recordingAvailable = false;
  if (status === "recording") state.recordingAvailable = true;
}

function handlePlaybackEnd() {
  if (MODE_CONFIG[state.mode].microphone) void finishAssessment();
  else stop();
}

async function finishAssessment() {
  if (state.finishingAssessment) return;
  state.finishingAssessment = true;
  const hadSamples = state.samples.length > 0;
  const plannedRange = state.activeTake || currentPracticeRange();
  const actualEndQuarter = Math.max(
    plannedRange.startQuarter,
    Math.min(plannedRange.endQuarter, audio.currentQuarter),
  );
  const endMeasure = measureAtQuarter(
    selectedPart(),
    Math.max(plannedRange.startQuarter, actualEndQuarter - 1e-7),
  );
  state.activeTake = createTakeMetadata({
    ...plannedRange,
    bpm: plannedRange.bpm || audio.bpm,
    tempoPercent: plannedRange.tempoPercent || audio.tempoPercent,
    octaveShift: plannedRange.octaveShift ?? effectiveOctaveShift(),
    enabledPartIds: plannedRange.enabledPartIds || [...state.enabledParts],
    guideEnabled: plannedRange.guideEnabled ?? MODE_CONFIG[state.mode].guide,
    vocalPartId: plannedRange.vocalPartId || state.selectedPartId,
    endMeasure,
    endQuarter: actualEndQuarter,
    durationSeconds: (actualEndQuarter - plannedRange.startQuarter) * 60 / (plannedRange.bpm || audio.bpm),
  });
  const takeRange = state.activeTake;
  const takeOctaveShift = takeRange.octaveShift;
  try {
    const recording = await audio.finishPerformanceRecording();
    audio.stop({ reset: true, resetQuarter: takeRange.startQuarter, microphone: !MODE_CONFIG[state.mode].microphone });
    unlockSessionOctave();
    cancelAnimationFrame(state.syncFrame);
    setPlaybackState("stopped");
    setCursorToQuarter(takeRange.startQuarter);
    updatePosition(takeRange.startQuarter);
    if (recording) attachPerformanceRecording(recording);
    else clearPerformancePlayback();
    if (!hadSamples) {
      els.assessmentScope.textContent = `Assessment: ${assessmentRangeLabel(takeRange)}`;
      els.coachLevel.textContent = "No pitch result";
      els.coachIntro.textContent = "No clear pitch samples were captured, so there is no pitch coaching for this take.";
      els.coachObservations.innerHTML = "";
      els.resultsBody.innerHTML = '<tr><td colspan="11" class="result-empty">No target notes had enough usable samples.</td></tr>';
      els.resultsSummary.textContent = `Assessment: ${assessmentRangeLabel(takeRange)} · Try the microphone check again, move a little closer, or use headphones.`;
      els.resultsPanel.hidden = !recording;
      if (recording) els.resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      toast("No clear pitch samples were captured. Recheck the microphone and try again.");
      setStatus("off", "No reliable pitch captured", "Your local voice recording is still available below when supported.");
      return;
    }
    const soundingTimeline = clipTimelineToRange(
      selectedPart().vocalTimeline,
      takeRange.startQuarter,
      takeRange.endQuarter,
      takeRange.bpm || audio.bpm,
    ).map((note) => ({
      ...note,
      midi: note.midi + takeOctaveShift,
      displayPitch: midiToName(note.midi + takeOctaveShift),
    }));
    const assessedSamples = state.samples.filter((sample) => sampleWithinRange(
      sample,
      takeRange.startQuarter,
      takeRange.endQuarter,
    ));
    const results = analysePerformance(soundingTimeline, assessedSamples, takeRange.bpm || audio.bpm);
    renderResults(results, takeRange);
    els.resultsPanel.hidden = false;
    els.resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    setStatus("good", "Assessment complete", "Review your pitch shape and hear your captured voice below.");
    if (!recording && !state.recordingAvailable) toast("Pitch results are ready. Audio recording is not supported in this browser.");
  } finally {
    state.finishingAssessment = false;
  }
}

function clearPerformancePlayback() {
  stopPerformanceReview({ resetCursorPosition: false });
  state.recording = null;
  els.performanceAudio.pause();
  els.performanceAudio.removeAttribute("src");
  els.performanceAudio.load();
  els.performancePlayback.hidden = true;
  els.performanceSeek.value = "0";
  els.performanceSeek.max = "0";
  els.performanceCurrentTime.textContent = "00:00";
  els.performanceDuration.textContent = "00:00";
  els.performancePlay.disabled = false;
  els.performancePause.disabled = true;
  state.reviewLayers = reviewLayers();
  els.reviewLayerInputs.forEach((input) => {
    input.checked = state.reviewLayers[input.dataset.reviewLayer];
  });
  state.reviewVolumes = reviewVolumes();
  els.reviewVolumeInputs.forEach((input) => {
    input.value = String(state.reviewVolumes[input.dataset.reviewVolume]);
  });
  renderReviewVolumes();
  els.performanceAudio.volume = state.reviewVolumes.voice / 100;
  for (const kind of ["accompaniment", "melody"]) {
    audio.setReviewVolume(kind, state.reviewVolumes[kind]);
  }
}

function attachPerformanceRecording(recording) {
  const take = createTakeMetadata({
    ...(state.activeTake || {}),
    durationSeconds: Number(recording.durationSeconds) || state.activeTake?.durationSeconds,
  });
  state.recording = { ...recording, take };
  els.performanceAudio.src = recording.url;
  els.performanceAudio.volume = state.reviewVolumes.voice / 100;
  els.performanceAudio.muted = false;
  els.performancePlayback.hidden = false;
  const duration = Number(recording.durationSeconds) || 0;
  els.performanceSeek.max = String(duration);
  els.performanceDuration.textContent = formatTime(duration);
  updatePerformancePlaybackState();
}

function currentReviewLayers() {
  state.reviewLayers = reviewLayers(Object.fromEntries(
    els.reviewLayerInputs.map((input) => [input.dataset.reviewLayer, input.checked]),
  ));
  return state.reviewLayers;
}

function currentReviewVolumes() {
  state.reviewVolumes = reviewVolumes(Object.fromEntries(
    els.reviewVolumeInputs.map((input) => [input.dataset.reviewVolume, input.value]),
  ));
  return state.reviewVolumes;
}

function renderReviewVolumes() {
  els.reviewVolumeOutputs.forEach((output) => {
    output.textContent = `${state.reviewVolumes[output.dataset.reviewVolumeOutput]}%`;
  });
}

function updateReviewVolume(kind, value) {
  state.reviewVolumes = reviewVolumes({ ...state.reviewVolumes, [kind]: value });
  renderReviewVolumes();
  if (kind === "voice") {
    els.performanceAudio.volume = state.reviewVolumes.voice / 100;
  } else {
    audio.setReviewVolume(kind, state.reviewVolumes[kind]);
  }
}

async function startPerformanceReview() {
  if (!state.recording || els.performanceAudio.paused) return;
  const token = ++state.reviewActivationToken;
  state.reviewPlaying = true;
  const layers = currentReviewLayers();
  const volumes = currentReviewVolumes();
  els.performanceAudio.muted = !layers.voice;
  els.performanceAudio.volume = volumes.voice / 100;
  audio.pausePitchSampling();
  await audio.startReview({
    currentSeconds: els.performanceAudio.currentTime,
    take: state.recording.take,
    layers,
    volumes,
  });
  if (token !== state.reviewActivationToken || els.performanceAudio.paused) {
    audio.stopReview();
    return;
  }
  startPerformanceReviewSync();
  updatePerformancePlaybackState();
}

function pausePerformanceReview() {
  state.reviewActivationToken += 1;
  state.reviewPlaying = false;
  cancelAnimationFrame(state.reviewSyncFrame);
  state.reviewSyncFrame = null;
  audio.pauseReview();
  updatePerformancePosition();
  updatePerformancePlaybackState();
}

function stopPerformanceReview({ resetCursorPosition = true } = {}) {
  state.reviewActivationToken += 1;
  cancelAnimationFrame(state.reviewSyncFrame);
  state.reviewSyncFrame = null;
  state.reviewPlaying = false;
  if (!els.performanceAudio.paused) els.performanceAudio.pause();
  audio.stopReview();
  if (resetCursorPosition && state.cursor) {
    const startQuarter = state.recording?.take?.startQuarter ?? currentPracticeRange().startQuarter;
    setCursorToQuarter(startQuarter);
    updateReviewScorePosition(startQuarter);
  }
}

function startPerformanceReviewSync() {
  cancelAnimationFrame(state.reviewSyncFrame);
  const frame = () => {
    if (!state.reviewPlaying || els.performanceAudio.paused || !state.recording) return;
    updatePerformancePosition();
    const quarter = reviewQuarterAtSeconds(
      els.performanceAudio.currentTime,
      state.recording.take.bpm,
      state.recording.take.startQuarter,
      state.recording.take.endQuarter,
    );
    updateReviewScorePosition(quarter);
    // The media element is the one authoritative review clock. Tone is only
    // a score layer and is periodically checked/re-anchored to currentTime.
    audio.synchroniseReviewClock(els.performanceAudio.currentTime);
    state.reviewSyncFrame = requestAnimationFrame(frame);
  };
  state.reviewSyncFrame = requestAnimationFrame(frame);
}

function updateReviewScorePosition(quarter) {
  const part = selectedPart();
  const measure = measureAtQuarter(part, quarter);
  els.measureNumber.textContent = String(measure);
  els.sideMeasure.textContent = String(measure);
  els.dockMeasure.textContent = String(measure);
  if (state.recording?.take) {
    els.dockRange.textContent = `Bar ${state.recording.take.startMeasure} · assessment ${state.recording.take.startMeasure}–${state.recording.take.endMeasure}`;
  }
  syncCursor(quarter);
  followScoreAtQuarter(quarter, noteAtQuarter(part?.vocalTimeline || [], quarter));
}

function seekPerformanceReview() {
  if (!state.recording) return;
  const seconds = Number(els.performanceSeek.value) || 0;
  els.performanceAudio.currentTime = seconds;
  const quarter = reviewQuarterAtSeconds(seconds, state.recording.take.bpm, state.recording.take.startQuarter, state.recording.take.endQuarter);
  updateReviewScorePosition(quarter);
  if (state.reviewPlaying) {
    void audio.resynchroniseReview(seconds, state.recording.take, currentReviewLayers(), currentReviewVolumes());
  }
  updatePerformancePosition();
}

function restartPerformanceReview() {
  if (!state.recording) return;
  const wasPlaying = !els.performanceAudio.paused && !els.performanceAudio.ended;
  els.performanceAudio.currentTime = 0;
  updateReviewScorePosition(state.recording.take.startQuarter);
  updatePerformancePosition();
  if (wasPlaying) {
    void audio.resynchroniseReview(0, state.recording.take, currentReviewLayers(), currentReviewVolumes());
  } else {
    els.performanceAudio.play().catch(() => toast("The captured audio could not play."));
  }
}

function updateReviewLayers() {
  const layers = currentReviewLayers();
  els.performanceAudio.muted = !layers.voice;
  if (state.reviewPlaying && state.recording) {
    void audio.resynchroniseReview(els.performanceAudio.currentTime, state.recording.take, layers, currentReviewVolumes());
  }
}

function updatePerformancePlaybackState() {
  const playing = !els.performanceAudio.paused && !els.performanceAudio.ended;
  els.performancePlay.disabled = playing || !state.recording;
  els.performancePause.disabled = !playing;
}

function updatePerformancePosition() {
  const current = Number(els.performanceAudio.currentTime) || 0;
  const mediaDuration = Number.isFinite(els.performanceAudio.duration) ? els.performanceAudio.duration : 0;
  const duration = mediaDuration || state.recording?.durationSeconds || 0;
  els.performanceSeek.max = String(duration);
  els.performanceSeek.value = String(Math.min(current, duration));
  els.performanceCurrentTime.textContent = formatTime(current);
  els.performanceDuration.textContent = formatTime(duration);
}

function renderResults(results, takeRange = state.activeTake || currentPracticeRange()) {
  els.resultsBody.innerHTML = "";
  const assessed = results.filter((result) => result.sampleCount > 0);
  if (!assessed.length) {
    els.resultsBody.innerHTML = '<tr><td colspan="11" class="result-empty">No target notes had enough usable samples.</td></tr>';
  } else {
    for (const result of assessed) {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${escapeHtml(result.note.displayPitch)}</td><td>${result.note.measureNumber}</td><td>${formatCents(result.initialError)}</td><td>${formatCents(result.averageError)}</td><td>${result.settleTime === null ? "—" : `${result.settleTime.toFixed(2)}s`}</td><td>${formatCents(result.sustainedError)}</td><td><span class="result-value">${Math.round(result.inZonePercent)}%</span></td><td>${result.pitchStability === null ? "—" : `${Math.round(result.pitchStability)}¢`}</td><td>${Math.round(result.voicedCoveragePercent)}%</td><td>${result.fragmentationCount}</td><td>${formatCents(result.directionalDriftCents)}</td>`;
      els.resultsBody.append(row);
    }
  }
  const scope = assessmentRangeLabel(takeRange);
  els.assessmentScope.textContent = `Assessment: ${scope}`;
  els.resultsSummary.textContent = `Assessment: ${scope} · ${performanceSummary(results)}`;
  renderCoaching(results, scope);
}

function renderCoaching(results, scope = assessmentRangeLabel(state.activeTake || currentPracticeRange())) {
  const { profile, observations } = buildCoachingFeedback(results);
  els.resultsPanel.dataset.level = profile.level;
  els.coachLevel.textContent = `${profile.label} · ${Math.round(profile.score)}%`;
  els.coachIntro.textContent = profile.level === "excellent"
    ? `A highly secure performance across ${scope}. These strengths and fine refinements come only from the notes you just sang.`
    : profile.level === "strong"
      ? `A confident performance across ${scope}, with a few specific details that can make this section even more consistent.`
      : profile.level === "developing"
        ? `In ${scope}, you have clear strengths to keep and a focused set of next priorities.`
        : profile.level === "foundation"
          ? `There are useful notes in ${scope} to build from. Work through the priorities one at a time.`
          : `Start with the genuine successes from ${scope}, then use the achievable next steps to build a steadier line.`;
  els.coachObservations.innerHTML = "";
  observations.forEach((item, index) => {
    const card = document.createElement(item.noteId || item.measureNumber ? "button" : "article");
    if (card instanceof HTMLButtonElement) {
      card.type = "button";
      if (item.noteId) card.dataset.noteId = item.noteId;
      if (item.measureNumber !== null) card.dataset.measureNumber = String(item.measureNumber);
      card.setAttribute("aria-label", `${item.title}. Show this note in the score.`);
    }
    card.className = `coach-card ${item.tone}`;
    const number = document.createElement("span");
    number.className = "coach-card-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const copy = document.createElement("span");
    copy.className = "coach-card-copy";
    const kind = document.createElement("small");
    kind.textContent = item.tone === "positive" ? "Keep" : "Next focus";
    const title = document.createElement("strong");
    title.textContent = item.title;
    const body = document.createElement("span");
    body.textContent = item.body;
    copy.append(kind, title, body);
    card.append(number, copy);
    if (card instanceof HTMLButtonElement) {
      const cue = document.createElement("span");
      cue.className = "coach-card-cue";
      cue.textContent = "Show in score ↑";
      card.append(cue);
    }
    els.coachObservations.append(card);
  });
}

function setStatus(status, title, copy) {
  els.statusCard.dataset.status = status;
  els.statusTitle.textContent = title;
  els.statusCopy.textContent = copy;
  els.statusCard.querySelector(".status-icon").textContent = status === "good" ? "✓" : status === "warn" ? "~" : status === "off" ? "!" : "•";
}

function resetControls() {
  const range = currentPracticeRange();
  els.tempoSlider.value = "100";
  els.tempoOutput.textContent = "100%";
  els.bpmLabel.textContent = `${Math.round(state.score.originalTempo)} BPM`;
  const rangeDuration = (range.endQuarter - range.startQuarter) * 60 / audio.bpm;
  els.totalTime.textContent = formatTime(rangeDuration);
  els.dockTotalTime.textContent = formatTime(rangeDuration);
  els.currentTime.textContent = "00:00";
  els.dockCurrentTime.textContent = "00:00";
  els.progressFill.style.width = "0%";
  els.expectedLabel.textContent = "Expected note";
  els.expectedNote.textContent = "—";
  els.expectedPosition.textContent = "Choose a microphone mode to tune before Play";
  els.sampleCount.textContent = "0";
  els.resultsPanel.hidden = true;
  state.rawSamples = [];
  state.acceptedSamples = [];
  state.activeTake = null;
  state.sessionOctaveShift = null;
  resetPitchDiagnostics();
  state.mode = "practice";
  state.microphoneActivationToken += 1;
  state.microphonePreparing = false;
  document.body.classList.remove("microphone-mode");
  setTuningMeterInactive("Practice mode");
  els.modeButtons.forEach((button) => { const active = button.dataset.mode === "practice"; button.classList.toggle("active", active); button.setAttribute("aria-checked", String(active)); });
  els.headphoneNote.hidden = true;
  els.guideVolume.value = String(state.guideVolume);
  els.accompanimentVolume.value = String(state.accompanimentVolume);
  updateVolume("guide", state.guideVolume);
  updateVolume("accompaniment", state.accompanimentVolume);
  setCountInBars(state.countInBars);
  state.octaveShift = DEFAULT_OCTAVE_SHIFT;
  setAutomaticOctave(true, { preserveShift: true });
  setOctaveShift(state.octaveShift);
  setMicrophoneSensitivity(state.microphoneSensitivity);
  updateMicrophoneCheckSetting();
  clearPerformancePlayback();
  state.followScore = true;
  state.lastFollowSystem = null;
  els.followScoreButton.classList.add("active");
  els.followScoreButton.setAttribute("aria-pressed", "true");
  els.countInDisplay.hidden = true;
  els.diagRawHz.textContent = els.diagRawMidi.textContent = els.diagFilteredHz.textContent = els.diagFilteredMidi.textContent = "—";
  els.diagClarity.textContent = els.diagRms.textContent = els.diagTarget.textContent = els.diagCents.textContent = "—";
  els.diagState.textContent = "No reliable pitch";
  els.pitchDiagnostics.hidden = !PITCH_DEBUG_ENABLED;
  els.pitchDiagnostics.open = PITCH_DEBUG_ENABLED;
  setPlaybackState("stopped");
  setStatus("idle", "Ready when you are", "Choose a mode, then press play.");
  audio.stop({ reset: true, resetQuarter: range.startQuarter, microphone: false });
  renderPracticeRangeControls();
  setSectionMessage(`Whole piece selected: bars ${range.firstMeasure}–${range.lastMeasure}.`);
  updatePosition(range.startQuarter);
}

function resetToUpload() {
  state.microphoneActivationToken += 1;
  state.microphonePreparing = false;
  audio.destroy();
  cancelAnimationFrame(state.syncFrame);
  clearTimeout(state.overlayResizeTimer);
  state.score = null; state.selectedPartId = null; state.samples = []; state.rawSamples = []; state.acceptedSamples = []; state.osmd = null; state.cursor = null; state.cursorTimeline = []; state.cursorIndex = 0; state.scoreGeometry = new Map(); state.measureGeometry = [];
  state.sectionStartMeasure = null; state.sectionEndMeasure = null; state.startMeasure = null; state.rangeSelectionMode = false; state.rangeSelectionStart = null; state.startPickMode = false; state.pendingStartMeasure = null;
  state.currentSessionComfortableFrequency = null;
  state.activeTake = null;
  state.sessionOctaveShift = null;
  resetPitchDiagnostics();
  document.body.classList.remove("microphone-mode");
  els.scoreContainer.innerHTML = "";
  clearPerformancePlayback();
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
  els.recheckMicrophoneButton.addEventListener("click", recheckMicrophone);
  els.countInButtons.forEach((button) => button.addEventListener("click", () => setCountInBars(button.dataset.countIn)));
  els.sectionFrom.addEventListener("change", applySectionInputs);
  els.sectionTo.addEventListener("change", applySectionInputs);
  els.clearSectionButton.addEventListener("click", clearPracticeSection);
  els.selectBarsButton.addEventListener("click", toggleRangeSelection);
  els.startFromBar.addEventListener("change", () => applyStartFromInput());
  els.chooseStartButton.addEventListener("click", toggleStartPick);
  els.startHereButton.addEventListener("click", () => {
    if (state.pendingStartMeasure !== null) applyStartFromInput(state.pendingStartMeasure);
  });
  els.cancelScoreSelectionButton.addEventListener("click", cancelScoreSelection);
  els.scoreContainer.addEventListener("click", (event) => {
    const region = event.target.closest?.(".score-measure-region");
    if (region) selectScoreMeasure(region.dataset.measureNumber);
  });
  els.scoreContainer.addEventListener("keydown", (event) => {
    if (!['Enter', ' '].includes(event.key)) return;
    const region = event.target.closest?.(".score-measure-region");
    if (!region) return;
    event.preventDefault();
    selectScoreMeasure(region.dataset.measureNumber);
  });
  els.octaveButtons.forEach((button) => button.addEventListener("click", () => setOctaveShift(button.dataset.octave, { manual: true })));
  els.automaticOctave.addEventListener("change", () => setAutomaticOctave(els.automaticOctave.checked));
  els.hearStartingNote.addEventListener("click", hearStartingNote);
  els.guideVolume.addEventListener("input", () => updateVolume("guide", els.guideVolume.value));
  els.accompanimentVolume.addEventListener("input", () => updateVolume("accompaniment", els.accompanimentVolume.value));
  els.accompanimentList.addEventListener("change", (event) => { const input = event.target.closest("input[data-part-id]"); if (!input) return; if (input.checked) state.enabledParts.add(input.dataset.partId); else state.enabledParts.delete(input.dataset.partId); updateMuteAllLabel(); });
  els.toggleAllParts.addEventListener("click", () => { const parts = state.score.parts.filter((part) => part.id !== state.selectedPartId); const all = parts.every((part) => state.enabledParts.has(part.id)); state.enabledParts = new Set(all ? [] : parts.map((part) => part.id)); renderAccompaniment(); });
  els.tempoSlider.addEventListener("input", () => {
    audio.setTempo(els.tempoSlider.value);
    els.tempoOutput.textContent = `${els.tempoSlider.value}%`;
    els.bpmLabel.textContent = `${Math.round(audio.bpm)} BPM`;
    const range = currentPracticeRange();
    const duration = (range.endQuarter - range.startQuarter) * 60 / audio.bpm;
    els.totalTime.textContent = formatTime(duration);
    els.dockTotalTime.textContent = formatTime(duration);
    updatePosition(range.startQuarter);
  });
  els.playButton.addEventListener("click", play); els.pauseButton.addEventListener("click", pause); els.stopButton.addEventListener("click", () => { void stop(); }); els.finishButton.addEventListener("click", () => { void finishAssessment(); });
  els.dockRestartButton.addEventListener("click", () => { void restartTransport(); });
  els.dockPlayPauseButton.addEventListener("click", () => { if (audio.isPlaying) pause(); else void play(); });
  els.dockStopButton.addEventListener("click", () => { void stop(); });
  els.followScoreButton.addEventListener("click", toggleScoreFollow);
  els.performancePlay.addEventListener("click", () => { els.performanceAudio.play().catch(() => toast("The captured audio could not play.")); });
  els.performancePause.addEventListener("click", () => els.performanceAudio.pause());
  els.performanceRestart.addEventListener("click", restartPerformanceReview);
  els.performanceSeek.addEventListener("input", seekPerformanceReview);
  els.reviewVolumeInputs.forEach((input) => input.addEventListener("input", () => {
    updateReviewVolume(input.dataset.reviewVolume, input.value);
  }));
  els.reviewLayerInputs.forEach((input) => input.addEventListener("change", updateReviewLayers));
  els.performanceAudio.addEventListener("timeupdate", updatePerformancePosition);
  els.performanceAudio.addEventListener("durationchange", updatePerformancePosition);
  els.performanceAudio.addEventListener("play", () => { void startPerformanceReview(); });
  els.performanceAudio.addEventListener("pause", pausePerformanceReview);
  els.performanceAudio.addEventListener("ended", () => { pausePerformanceReview(); updatePerformancePlaybackState(); });
  els.viewButtons.forEach((button) => button.addEventListener("click", async () => { if (audio.isPlaying || audio.isPaused || audio.isCountingIn) return; state.scoreView = button.dataset.view; els.viewButtons.forEach((item) => item.classList.toggle("active", item === button)); await renderScore(); }));
  els.coachObservations.addEventListener("click", (event) => {
    const card = event.target.closest("[data-note-id], [data-measure-number]");
    if (!card) return;
    if (!focusScoreTarget(els.scoreContainer, card.dataset.noteId || null, card.dataset.measureNumber || null)) {
      toast("That note is not visible in the current score rendering.");
    }
  });
  els.helpButton.addEventListener("click", () => els.helpDialog.showModal());
  els.pitchSelfTest.addEventListener("click", runPitchSelfTest);
  window.addEventListener("resize", scheduleScoreTraceRefresh);
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
      diagnostics: () => state.pitchDiagnosticSummary.snapshot(),
    }),
    configurable: true,
  });
}
showView("upload");
