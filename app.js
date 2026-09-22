import { AudioEngine } from "./src/audio-engine.js?v=24";
import { analysePerformance, performanceSummary } from "./src/analysis.js?v=14";
import { buildCoachingFeedback } from "./src/coaching.js?v=14";
import {
  colourForCents,
  DEBUG_CONFIG,
  DEFAULT_COUNT_IN_BARS,
  DEFAULT_LISTENING_SETUP,
  DEFAULT_MICROPHONE_SENSITIVITY,
  DEFAULT_OCTAVE_SHIFT,
  LIVE_TUNING_CONFIG,
  MICROPHONE_CALIBRATION,
  OCTAVE_SELECTION_CONFIG,
  PLAYBACK_CONFIG,
  SESSION_MODES,
  formatTime,
  frequencyToMidi,
  midiToName,
  PITCH_THRESHOLDS,
} from "./src/config.js?v=20";
import {
  assessmentSampleEligible,
  LiveTuningFeedback,
  tuningTargetAtQuarter,
  visualMidiForSample,
} from "./src/live-tuning.js?v=17";
import { normaliseSavedMicrophoneCalibration } from "./src/microphone-calibration.js?v=20";
import {
  DEFAULT_GUIDE_VOICE,
  GUIDE_VOICE_STORAGE_KEY,
  normaliseGuideVoice,
} from "./src/guide-playback.js?v=22";
import { measureAtQuarter, noteAtQuarter, readScoreFile, readScoreUrl, suggestVocalPart } from "./src/musicxml.js?v=22";
import { AutomaticOctaveSelector } from "./src/octave-selection.js?v=20";
import { detectAutocorrelationPitch, PitchDiagnosticSummary, StablePitchTracker } from "./src/pitch-tracker.js?v=20";
import {
  assessmentRangeLabel,
  clipTimelineToRange,
  firstNoteAtOrAfter,
  practiceLimits,
  resolvePracticeRange,
  sampleWithinRange,
  validateSection,
} from "./src/practice-range.js?v=18";
import { createTakeMetadata, reviewLayers, reviewQuarterAtSeconds, reviewVolumes } from "./src/review-playback.js?v=24";
import { classifyPlaybackPart } from "./src/playback-routing.js?v=24";
import {
  appendScoreTraceSample,
  buildMeasureGeometry,
  buildScoreGeometry,
  focusScoreTarget,
  renderMeasureSelection,
  renderScoreTrace,
} from "./src/score-overlay.js?v=25";
import { cursorIndexAtTimestamp, osmdTimestampToQuarters, quartersToOsmdTimestamp } from "./src/timing.js?v=14";
import { appendAcceptedVisualSample, appendVisualHold } from "./src/visual-trace.js?v=20";

const TIMING_DEBUG_ENABLED = new URLSearchParams(window.location.search).get("debugTiming") === "1";
const PITCH_DEBUG_ENABLED = new URLSearchParams(window.location.search).get("debugPitch") === "1";

const MODE_CONFIG = SESSION_MODES;

const $ = (selector) => document.querySelector(selector);
const els = {
  uploadView: $("#uploadView"), loadingView: $("#loadingView"), partView: $("#partView"), studioView: $("#studioView"),
  loadingTitle: $("#loadingTitle"), loadingMessage: $("#loadingMessage"), scoreInput: $("#scoreInput"), repertoireSelect: $("#repertoireSelect"), repertoireStatus: $("#repertoireStatus"),
  partBackButton: $("#partBackButton"), partCount: $("#partCount"), scoreTitle: $("#scoreTitle"), partOptions: $("#partOptions"), continueButton: $("#continueButton"),
  newScoreButton: $("#newScoreButton"), studioTitle: $("#studioTitle"), studioMeta: $("#studioMeta"), selectedPartName: $("#selectedPartName"), scoreBannerPart: $("#scoreBannerPart"),
  modeButtons: [...document.querySelectorAll("[data-mode]")], accompanimentList: $("#accompanimentList"), toggleAllParts: $("#toggleAllParts"),
  guideVolume: $("#guideVolume"), guideVolumeOutput: $("#guideVolumeOutput"), guideVoice: $("#guideVoice"), guideVoiceStatus: $("#guideVoiceStatus"),
  countInButtons: [...document.querySelectorAll("[data-count-in]")], countInOutput: $("#countInOutput"), countInDisplay: $("#countInDisplay"), countInBar: $("#countInBar"), countInBeats: $("#countInBeats"),
  sectionFrom: $("#sectionFrom"), sectionTo: $("#sectionTo"), practiceRangeStatus: $("#practiceRangeStatus"), sectionValidation: $("#sectionValidation"), selectBarsButton: $("#selectBarsButton"), clearSectionButton: $("#clearSectionButton"), startFromBar: $("#startFromBar"), chooseStartButton: $("#chooseStartButton"), scoreSelectionAction: $("#scoreSelectionAction"), scoreSelectionCopy: $("#scoreSelectionCopy"), startHereButton: $("#startHereButton"), cancelScoreSelectionButton: $("#cancelScoreSelectionButton"),
  octaveButtons: [...document.querySelectorAll("[data-octave]")], octaveOutput: $("#octaveOutput"), octaveHint: $("#octaveHint"), startingNoteName: $("#startingNoteName"), hearStartingNote: $("#hearStartingNote"), octaveConfirmation: $("#octaveConfirmation"), headphoneNote: $("#headphoneNote"),
  listeningSetupButtons: [...document.querySelectorAll("[data-listening-setup]")], listeningSetupOutput: $("#listeningSetupOutput"),
  sensitivityButtons: [...document.querySelectorAll("[data-sensitivity]")], sensitivityOutput: $("#sensitivityOutput"),
  microphoneCheckStatus: $("#microphoneCheckStatus"), microphoneCheckCopy: $("#microphoneCheckCopy"), recheckMicrophoneButton: $("#recheckMicrophoneButton"),
  tempoSlider: $("#tempoSlider"), tempoOutput: $("#tempoOutput"), bpmLabel: $("#bpmLabel"),
  playButton: $("#playButton"), pauseButton: $("#pauseButton"), stopButton: $("#stopButton"), transportState: $("#transportState"), currentTime: $("#currentTime"), totalTime: $("#totalTime"), progressFill: $("#progressFill"),
  dockRestartButton: $("#dockRestartButton"), dockPlayPauseButton: $("#dockPlayPauseButton"), dockStopButton: $("#dockStopButton"), dockTransportState: $("#dockTransportState"), dockCurrentTime: $("#dockCurrentTime"), dockTotalTime: $("#dockTotalTime"), dockMeasure: $("#dockMeasure"), dockRange: $("#dockRange"), followScoreButton: $("#followScoreButton"),
  viewButtons: [...document.querySelectorAll("[data-view]")], scoreHeading: $("#scoreHeading"), measureNumber: $("#measureNumber"), sideMeasure: $("#sideMeasure"), scoreContainer: $("#scoreContainer"),
  resultsPanel: $("#resultsPanel"), resultsHead: $("#resultsHead"), resultsKicker: $("#resultsKicker"), detailedAnalysis: $("#detailedAnalysis"), resultsBody: $("#resultsBody"), resultsSummary: $("#resultsSummary"), assessmentScope: $("#assessmentScope"),
  coachLevel: $("#coachLevel"), coachIntro: $("#coachIntro"), coachObservations: $("#coachObservations"),
  performancePlayback: $("#performancePlayback"), performanceAudio: $("#performanceAudio"), performanceRestart: $("#performanceRestart"), performancePlay: $("#performancePlay"), performancePause: $("#performancePause"), performanceSeek: $("#performanceSeek"), performanceCurrentTime: $("#performanceCurrentTime"), performanceDuration: $("#performanceDuration"), reviewLayerInputs: [...document.querySelectorAll("[data-review-layer]")], reviewVolumeInputs: [...document.querySelectorAll("[data-review-volume]")], reviewVolumeOutputs: [...document.querySelectorAll("[data-review-volume-output]")],
  expectedLabel: $("#expectedLabel"), expectedNote: $("#expectedNote"), expectedPosition: $("#expectedPosition"), detectedNote: $("#detectedNote"), detectedFrequency: $("#detectedFrequency"), tuningMeter: $("#tuningMeter"), tuningPhase: $("#tuningPhase"), gaugeNeedle: $("#gaugeNeedle"), centsOutput: $("#centsOutput"),
  statusCard: $("#statusCard"), statusTitle: $("#statusTitle"), statusCopy: $("#statusCopy"), sampleCount: $("#sampleCount"), finishButton: $("#finishButton"), previousTakeControl: $("#previousTakeControl"), showPreviousTake: $("#showPreviousTake"),
  pitchDiagnostics: $("#pitchDiagnostics"), diagRawHz: $("#diagRawHz"), diagRawMidi: $("#diagRawMidi"), diagFilteredHz: $("#diagFilteredHz"), diagFilteredMidi: $("#diagFilteredMidi"), diagClarity: $("#diagClarity"), diagRms: $("#diagRms"), diagPeak: $("#diagPeak"), diagNearFullScale: $("#diagNearFullScale"), diagTarget: $("#diagTarget"), diagCents: $("#diagCents"), diagState: $("#diagState"), diagUsableFrames: $("#diagUsableFrames"), diagAcceptedAcquisition: $("#diagAcceptedAcquisition"), diagAcceptedContinuation: $("#diagAcceptedContinuation"), diagBelowOpenGate: $("#diagBelowOpenGate"), diagBelowContinuationGate: $("#diagBelowContinuationGate"), diagLowClarity: $("#diagLowClarity"), diagIsolatedJump: $("#diagIsolatedJump"), diagOctaveHarmonic: $("#diagOctaveHarmonic"), diagOutOfRange: $("#diagOutOfRange"), diagClipping: $("#diagClipping"), diagNoFrequency: $("#diagNoFrequency"), pitchSelfTest: $("#pitchSelfTest"), pitchSelfTestResult: $("#pitchSelfTestResult"),
  helpButton: $("#helpButton"), helpDialog: $("#helpDialog"), toast: $("#toast"),
};

const state = {
  score: null,
  selectedPartId: null,
  mode: "assisted",
  scoreView: "vocal",
  enabledParts: new Set(),
  samples: [],
  rawSamples: [],
  acceptedSamples: [],
  visualTraceSamples: [],
  previousTakeTrace: [],
  showPreviousTake: true,
  takeCompleted: false,
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
  octaveSelector: new AutomaticOctaveSelector(),
  awaitingOctaveResponse: false,
  octaveResponseTimer: null,
  guideVolume: PLAYBACK_CONFIG.defaultGuideVolume,
  guideVoice: loadGuideVoice(),
  partVolumes: {},
  partVoices: {},
  listeningSetup: DEFAULT_LISTENING_SETUP,
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
  repertoire: [],
};

async function fetchManifest(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error(`Manifest request failed (${response.status}).`);
  const entries = await response.json();
  if (!Array.isArray(entries)) throw new TypeError("Manifest must contain an array.");
  return entries;
}

const vocalSampleManifestPromise = fetchManifest("./samples/vocal-guide/index.json?v=25").catch((error) => {
  console.warn("Human voice manifest is unavailable; Synthetic Ah will be used.", error);
  return [];
});

async function loadRepertoireIndex() {
  try {
    const entries = await fetchManifest("./repertoire/index.json?v=25");
    state.repertoire = entries.filter((entry) => entry?.title && entry?.file);
    els.repertoireSelect.replaceChildren(new Option("Select from repertoire", ""));
    for (const entry of state.repertoire) els.repertoireSelect.add(new Option(entry.title, entry.file));
    els.repertoireSelect.disabled = state.repertoire.length === 0;
    els.repertoireStatus.textContent = state.repertoire.length
      ? `${state.repertoire.length} ${state.repertoire.length === 1 ? "score" : "scores"} available`
      : "No built-in scores are available yet.";
  } catch (error) {
    console.warn("The repertoire index could not be loaded.", error);
    state.repertoire = [];
    els.repertoireSelect.disabled = true;
    els.repertoireStatus.textContent = "Repertoire unavailable — upload a MusicXML file instead.";
  }
}

const audio = new AudioEngine({
  onPitchSample: handlePitchSample,
  onRawPitchSample: handleRawPitchSample,
  onPitchDiagnostic: handlePitchDiagnostic,
  onMicrophoneState: handleMicrophoneState,
  onMicrophoneCalibration: handleMicrophoneCalibration,
  onRecordingState: handleRecordingState,
  onCountIn: handleCountIn,
  onPlaybackEnd: handlePlaybackEnd,
  onGuideVoiceStatus: handleGuideVoiceStatus,
});
audio.setMicrophoneCalibration(state.microphoneCalibration);
audio.setGuideVoice(state.guideVoice);

function loadGuideVoice() {
  try {
    return normaliseGuideVoice(localStorage.getItem(GUIDE_VOICE_STORAGE_KEY) || DEFAULT_GUIDE_VOICE);
  } catch {
    return DEFAULT_GUIDE_VOICE;
  }
}

function saveGuideVoice(value) {
  try {
    localStorage.setItem(GUIDE_VOICE_STORAGE_KEY, value);
  } catch (error) {
    console.warn("Could not save the guide voice locally", error);
  }
}

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
    state.visualTraceSamples = [];
    state.previousTakeTrace = [];
    state.selectedPartId = suggestVocalPart(state.score.parts);
    renderPartChoices();
    showView("parts");
  } catch (error) {
    console.error(error);
    toast(error.message || "This score could not be opened.");
    els.repertoireSelect.value = "";
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
  const vocalSampleManifest = await vocalSampleManifestPromise;
  state.enabledParts = new Set(state.score.parts.filter((part) => part.id !== vocalPart.id).map((part) => part.id));
  state.partVolumes = Object.fromEntries(state.score.parts
    .filter((part) => part.id !== vocalPart.id)
    .map((part) => [part.id, PLAYBACK_CONFIG.defaultPartVolume]));
  state.partVoices = Object.fromEntries(state.score.parts
    .filter((part) => part.id !== vocalPart.id && classifyPlaybackPart(part) === "vocal")
    .map((part) => [part.id, DEFAULT_GUIDE_VOICE]));
  state.mode = "assisted";
  state.scoreView = "vocal";
  state.samples = [];
  state.rawSamples = [];
  state.acceptedSamples = [];
  state.visualTraceSamples = [];
  state.previousTakeTrace = [];
  state.takeCompleted = false;
  const { firstMeasure } = practiceLimits(vocalPart);
  state.sectionStartMeasure = null;
  state.sectionEndMeasure = null;
  state.startMeasure = firstMeasure;
  state.rangeSelectionMode = false;
  state.rangeSelectionStart = null;
  state.startPickMode = false;
  state.pendingStartMeasure = null;
  audio.setScore(state.score);
  audio.setSelectedPart(vocalPart.id);
  audio.setHumanVoiceManifest(vocalSampleManifest);
  audio.setTempo(100);
  audio.setGuideVolume(state.guideVolume);
  audio.setGuideVoice(state.guideVoice);
  for (const [partId, volume] of Object.entries(state.partVolumes)) {
    audio.setPartVolume(partId, volume);
    audio.setPartEnabled(partId, state.enabledParts.has(partId));
  }
  for (const [partId, voice] of Object.entries(state.partVoices)) audio.setPartVoice(partId, voice);
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

function renderTakeTraces() {
  renderScoreTrace(els.scoreContainer, state.scoreGeometry, state.visualTraceSamples, {
    previousSamples: state.previousTakeTrace,
    showPrevious: state.showPreviousTake,
  });
  els.previousTakeControl.hidden = state.previousTakeTrace.length === 0;
  els.showPreviousTake.checked = state.showPreviousTake;
}

function archiveCompletedTrace() {
  if (state.takeCompleted && state.visualTraceSamples.length) {
    state.previousTakeTrace = state.visualTraceSamples.map((sample) => ({ ...sample }));
    state.showPreviousTake = true;
  }
  state.takeCompleted = false;
}

function commitVisualTrace(nextSamples) {
  const previousSamples = state.visualTraceSamples;
  let sharedPrefix = 0;
  while (sharedPrefix < previousSamples.length
    && sharedPrefix < nextSamples.length
    && previousSamples[sharedPrefix] === nextSamples[sharedPrefix]) sharedPrefix += 1;
  state.visualTraceSamples = nextSamples;
  if (sharedPrefix < previousSamples.length) {
    renderTakeTraces();
    return;
  }
  for (let index = sharedPrefix; index < nextSamples.length; index += 1) {
    appendScoreTraceSample(
      els.scoreContainer,
      state.scoreGeometry,
      nextSamples[index],
      nextSamples[index - 1],
    );
  }
}

function clearTakeForRangeChange() {
  stopPerformanceReview({ resetCursorPosition: false });
  state.samples = [];
  state.rawSamples = [];
  state.acceptedSamples = [];
  state.visualTraceSamples = [];
  state.previousTakeTrace = [];
  state.takeCompleted = false;
  state.activeTake = null;
  els.sampleCount.textContent = "0";
  els.resultsPanel.hidden = true;
  clearPerformancePlayback();
  audio.discardPerformanceRecording();
  resetPitchDiagnostics();
  renderTakeTraces();
}

function moveToPracticeStart({ clearTake = true } = {}) {
  const range = currentPracticeRange();
  if (clearTake) clearTakeForRangeChange();
  audio.stop({ reset: true, resetQuarter: range.startQuarter, microphone: false });
  unlockSessionOctave();
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
    const row = document.createElement("div");
    row.className = "part-mixer-row";
    const volume = state.partVolumes[part.id] ?? PLAYBACK_CONFIG.defaultPartVolume;
    const classification = classifyPlaybackPart(part);
    const soundControl = classification === "vocal"
      ? `<label class="part-sound"><span>Sound</span><select data-part-voice="${escapeHtml(part.id)}" aria-label="${escapeHtml(part.name)} sound"><option value="human" ${state.partVoices[part.id] !== "synthetic-ah" ? "selected" : ""}>Human voice</option><option value="synthetic-ah" ${state.partVoices[part.id] === "synthetic-ah" ? "selected" : ""}>Synthetic Ah</option></select></label>`
      : `<span class="part-sound part-sound-static"><span>Sound</span><strong>${classification === "piano" ? "Sampled piano" : "Sampled piano (fallback)"}</strong></span>`;
    row.innerHTML = `<label class="part-toggle"><input type="checkbox" data-part-enabled="${escapeHtml(part.id)}" ${state.enabledParts.has(part.id) ? "checked" : ""} /><span>${escapeHtml(part.name)}</span></label>${soundControl}<input class="part-volume" type="range" min="0" max="100" step="1" value="${volume}" data-part-volume="${escapeHtml(part.id)}" aria-label="${escapeHtml(part.name)} volume" /><output class="part-volume-output" data-part-volume-output="${escapeHtml(part.id)}">${volume}%</output>`;
    els.accompanimentList.append(row);
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
    renderTakeTraces();
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

function setListeningSetup(setup) {
  if (audio.isPlaying || audio.isPaused || audio.isCountingIn || state.microphonePreparing) return;
  if (!audio.setListeningSetup(setup)) return;
  state.listeningSetup = setup;
  els.listeningSetupButtons.forEach((button) => {
    const active = button.dataset.listeningSetup === setup;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  els.listeningSetupOutput.textContent = setup === "speakers" ? "Speakers" : "Headphones";
  const token = ++state.microphoneActivationToken;
  setTuningMeterInactive("Reconnecting…");
  void activateMicrophonePreparation(token);
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
  saveMicrophoneCalibration(calibration);
  updateMicrophoneCheckSetting();
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
    else toast(calibration?.overloaded
      ? "Your microphone is overloading — move a little farther away and try again."
      : "Move a little closer to your microphone and try again.");
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

function setOctaveShift(value, { confirmed = false } = {}) {
  if (state.sessionOctaveShift !== null || audio.isPlaying || audio.isPaused || audio.isCountingIn) return;
  const nextShift = [-24, -12, 0, 12].includes(Number(value)) ? Number(value) : 0;
  const changed = nextShift !== state.octaveShift;
  if (nextShift !== state.octaveShift && state.samples.length) {
    state.samples = [];
    state.rawSamples = [];
    state.acceptedSamples = [];
    state.visualTraceSamples = [];
    state.takeCompleted = false;
    els.sampleCount.textContent = "0";
    els.resultsPanel.hidden = true;
    els.finishButton.disabled = true;
    renderTakeTraces();
  }
  state.octaveShift = nextShift;
  if (changed) setTuningMeterInactive("Listening…");
  els.octaveButtons.forEach((button) => {
    const active = Number(button.dataset.octave) === state.octaveShift;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  els.octaveOutput.textContent = state.octaveShift === -24
    ? "2 octaves lower"
    : state.octaveShift < 0 ? "Octave lower" : state.octaveShift > 0 ? "Octave higher" : "Written";
  if (confirmed) {
    const starting = startingNoteForRange();
    const soundingName = starting ? midiToName(starting.midi + state.octaveShift) : "this pitch";
    els.octaveConfirmation.textContent = `✓ Great — we’ll use ${soundingName}`;
    els.octaveConfirmation.classList.add("confirmed");
  }
  updateOctaveHint(noteAtQuarter(selectedPart()?.vocalTimeline || [], audio.currentQuarter) || selectedPart()?.vocalTimeline[0]);
  updatePosition(audio.currentQuarter);
}

function effectiveOctaveShift() {
  return state.sessionOctaveShift ?? state.octaveShift;
}

function lockSessionOctave() {
  state.awaitingOctaveResponse = false;
  clearTimeout(state.octaveResponseTimer);
  if (state.sessionOctaveShift === null) state.sessionOctaveShift = state.octaveShift;
  return state.sessionOctaveShift;
}

function unlockSessionOctave() {
  state.sessionOctaveShift = null;
  state.awaitingOctaveResponse = false;
  clearTimeout(state.octaveResponseTimer);
  state.octaveSelector.reset();
}

function maybeConfirmStartingOctave(sample, targetInfo, phase) {
  if (!state.awaitingOctaveResponse || state.sessionOctaveShift !== null || phase !== "preparation" || targetInfo?.kind !== "starting") return;
  const sungMidi = visualMidiForSample(sample);
  const confirmation = state.octaveSelector.observe({
    sungMidi,
    writtenMidi: targetInfo.note?.midi,
    capturedAt: sample.capturedAt,
  });
  if (!confirmation) return;
  state.awaitingOctaveResponse = false;
  clearTimeout(state.octaveResponseTimer);
  setOctaveShift(confirmation.shift, { confirmed: true });
  setStatus("good", `✓ Great — we’ll use ${midiToName(confirmation.soundingMidi)}`, "Assessment will use this sounding octave; the melody guide stays at the score pitch.");
}

async function hearStartingNote() {
  const starting = startingNoteForRange();
  if (!starting) return;
  els.hearStartingNote.disabled = true;
  state.awaitingOctaveResponse = false;
  clearTimeout(state.octaveResponseTimer);
  state.octaveSelector.reset();
  els.octaveConfirmation.classList.remove("confirmed");
  try {
    await audio.previewPitch(starting.midi);
    setTimeout(() => {
      if (audio.isPlaying || audio.isCountingIn || state.sessionOctaveShift !== null) return;
      state.awaitingOctaveResponse = true;
      state.octaveSelector.reset();
      els.octaveConfirmation.textContent = "Now sing that note back";
      setStatus("idle", "Now sing that note back", "Hold the pitch steadily so Vocal Coach can confirm the octave.");
      state.octaveResponseTimer = setTimeout(() => {
        if (!state.awaitingOctaveResponse) return;
        state.awaitingOctaveResponse = false;
        els.octaveConfirmation.textContent = "I couldn’t quite confirm that note — try it once more.";
      }, OCTAVE_SELECTION_CONFIG.responseWindowMs);
    }, OCTAVE_SELECTION_CONFIG.responseDelayMs);
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
  }
}

function setGuideVoice(value, { persist = true } = {}) {
  state.guideVoice = normaliseGuideVoice(value);
  els.guideVoice.value = state.guideVoice;
  audio.setGuideVoice(state.guideVoice);
  if (persist) saveGuideVoice(state.guideVoice);
}

function handleGuideVoiceStatus(status = {}) {
  const humanSelected = (status.selectedVoice || state.guideVoice) === "human";
  const loading = humanSelected && status.sampleState === "loading";
  const fallback = humanSelected
    && status.sampleState === "unavailable"
    && status.effectiveMode !== "sampled";
  els.guideVoiceStatus.hidden = !(loading || fallback);
  els.guideVoiceStatus.classList.toggle("error", fallback);
  els.guideVoiceStatus.textContent = fallback
    ? "Human voice unavailable — using Synthetic Ah."
    : loading ? "Loading human voice…" : "";
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
  const direction = octaveShift === -24
    ? "Sing two octaves lower"
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
  return "Pre-performance tuning · not assessed";
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
  els.detectedNote.style.color = "";
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
  els.detectedNote.style.color = colour;
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
  els.detectedNote.style.color = "";
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
    if (error?.name === "MicrophoneCheckError") toast(error.message);
    else if (error?.name === "NotAllowedError") toast("Microphone permission was blocked. Allow microphone access to continue.");
    else toast(error.message || "The microphone could not start.");
    setStatus("off", "Microphone unavailable", "Allow microphone access to use Assisted or Assessment mode.");
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
  setTuningMeterInactive("Listening…");
  setStatus(
    "idle",
    state.microphoneCalibration ? "Starting live tuner…" : "Microphone Check first",
    state.microphoneCalibration
      ? "Your saved calibration will be used for pre-performance tuning."
      : "Your first microphone session starts with a short room-and-voice check.",
  );
  void activateMicrophonePreparation(activationToken);
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
    archiveCompletedTrace();
    state.samples = [];
    state.rawSamples = [];
    state.acceptedSamples = [];
    state.visualTraceSamples = [];
    resetPitchDiagnostics();
    state.activeTake = createTakeMetadata({
      tempoPercent: audio.tempoPercent,
      bpm: audio.bpm,
      octaveShift: takeOctaveShift,
      enabledPartIds: [...state.enabledParts],
      partVolumes: state.partVolumes,
      partVoices: state.partVoices,
      guideVoice: state.guideVoice,
      guideEnabled: mode.guide,
      mode: state.mode,
      durationSeconds: (range.endQuarter - range.startQuarter) * 60 / audio.bpm,
      vocalPartId: state.selectedPartId,
      startMeasure: range.startMeasure,
      endMeasure: range.endMeasure,
      startQuarter: range.startQuarter,
      endQuarter: range.endQuarter,
    });
    els.resultsPanel.hidden = true;
    els.sampleCount.textContent = "0";
    renderTakeTraces();
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
    if (error?.name === "MicrophoneCheckError") toast(error.message);
    else if (error?.name === "NotAllowedError") toast("Microphone permission was blocked. Allow access to continue.");
    else toast(error.message || "Playback could not start.");
    if (error?.name !== "MicrophoneCheckError") {
      setStatus("off", "Couldn’t start", error?.name === "NotAllowedError" ? "Microphone permission is required." : "Check the browser console and try again.");
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
    state.visualTraceSamples = [];
    renderTakeTraces();
  }
}

async function restartTransport() {
  const range = currentPracticeRange();
  if (audio.hasActivePerformanceRecording) await audio.finishPerformanceRecording();
  audio.stop({ reset: true, resetQuarter: range.startQuarter, microphone: !MODE_CONFIG[state.mode].microphone });
  unlockSessionOctave();
  audio.discardPerformanceRecording();
  cancelAnimationFrame(state.syncFrame);
  archiveCompletedTrace();
  state.samples = [];
  state.rawSamples = [];
  state.acceptedSamples = [];
  state.visualTraceSamples = [];
  resetPitchDiagnostics();
  els.sampleCount.textContent = "0";
  els.resultsPanel.hidden = true;
  clearPerformancePlayback();
  renderTakeTraces();
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
  els.toggleAllParts.disabled = !state.score.parts.some((part) => part.id !== state.selectedPartId);
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
  els.toggleAllParts.disabled = !state.score.parts.some((part) => part.id !== state.selectedPartId);
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
  els.listeningSetupButtons.forEach((button) => { button.disabled = disabled; });
  els.recheckMicrophoneButton.disabled = disabled;
  els.countInButtons.forEach((button) => { button.disabled = disabled; });
  els.octaveButtons.forEach((button) => { button.disabled = disabled; });
  els.hearStartingNote.disabled = disabled;
  els.guideVolume.disabled = disabled;
  els.guideVoice.disabled = disabled;
  els.accompanimentList.querySelectorAll("input, select").forEach((control) => { control.disabled = disabled; });
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
  maybeConfirmStartingOctave(sample, targetInfo, phase);
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
  state.samples.push(enriched);
  commitVisualTrace(appendAcceptedVisualSample(state.visualTraceSamples, enriched));
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
  const targetInfo = tuningTarget(sample.scoreQuarter, phase);
  const targetKind = targetInfo.kind;
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
  els.diagPeak.textContent = Number.isFinite(sample.absolutePeak) ? sample.absolutePeak.toFixed(4) : "—";
  els.diagNearFullScale.textContent = Number.isFinite(sample.nearFullScalePercent) ? `${sample.nearFullScalePercent.toFixed(2)}%` : "—";
  els.diagTarget.textContent = Number.isFinite(sample.targetMidi) ? `${targetName} · ${sample.targetMidi.toFixed(2)}` : "Rest";
  els.diagCents.textContent = Number.isFinite(sample.centsError) ? formatCents(sample.centsError) : "—";
  els.diagState.textContent = sample.status === "accepted"
    ? `${sample.reason}${sample.octaveCorrection ? ` (${sample.octaveCorrection > 0 ? "+" : ""}${sample.octaveCorrection} semitones)` : ""}`
    : `No reliable pitch — ${sample.reason}`;
  if (sample.status !== "accepted" && MODE_CONFIG[state.mode].microphone && audio.hasMicrophoneStream) {
    renderTuningDropout(sample);
    if (phase === "performance" && targetKind === "current" && sampleWithinRange(sample, assessedRange.startQuarter, assessedRange.endQuarter)) {
      const before = state.visualTraceSamples.length;
      const nextVisualTrace = appendVisualHold(state.visualTraceSamples, sample, targetInfo.note);
      if (nextVisualTrace.length !== before) commitVisualTrace(nextVisualTrace);
    }
  }
  if (sample.overloadActive) {
    setStatus("off", "Input is very loud — move slightly farther from the microphone", "Pitch tracking will resume automatically when the level settles.");
  }
}

function renderPitchDiagnosticSummary() {
  const summary = state.pitchDiagnosticSummary.snapshot();
  const count = (key) => `${summary[key]} (${summary.total ? Math.round(summary[key] / summary.total * 100) : 0}%)`;
  els.diagUsableFrames.textContent = `${Math.round(summary.usablePercent)}%`;
  els.diagAcceptedAcquisition.textContent = count("acceptedAcquisition");
  els.diagAcceptedContinuation.textContent = count("acceptedContinuation");
  els.diagBelowOpenGate.textContent = count("belowOpenGate");
  els.diagBelowContinuationGate.textContent = count("belowContinuationGate");
  els.diagLowClarity.textContent = count("lowClarity");
  els.diagIsolatedJump.textContent = count("isolatedJump");
  els.diagOctaveHarmonic.textContent = count("octaveHarmonic");
  els.diagOutOfRange.textContent = count("outOfRange");
  els.diagClipping.textContent = count("clipping");
  els.diagNoFrequency.textContent = count("noUsableFrequency");
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
    setStatus("idle", "Sing a comfortable “Ah” — start normally, then get a little louder", "Any comfortable sung pitch is fine. Keep it steady for about three seconds.");
  }
  if (status === "ready") {
    updateMicrophoneCheckSetting();
    setStatus("good", "Microphone ready", "Signal: Good. Your calibration is saved on this device.");
  }
  if (status === "needs-adjustment") {
    setTuningMeterInactive("Microphone check needed");
    els.microphoneCheckStatus.textContent = "Try again";
    const message = details?.overloaded
      ? "Your microphone is overloading — move a little farther away and try again."
      : "Move a little closer to your microphone and try again.";
    els.microphoneCheckCopy.textContent = message;
    setStatus("off", message, "Use Recheck microphone when you are in position.");
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
    partVolumes: plannedRange.partVolumes || state.partVolumes,
    partVoices: plannedRange.partVoices || state.partVoices,
    guideVoice: plannedRange.guideVoice || state.guideVoice,
    guideEnabled: plannedRange.guideEnabled ?? MODE_CONFIG[state.mode].guide,
    mode: plannedRange.mode || state.mode,
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
    state.takeCompleted = true;
    if (takeRange.mode === "assisted") {
      els.resultsKicker.textContent = "Assisted take";
      $("#resultsHeading").textContent = "Take complete";
      els.coachLevel.hidden = true;
      els.coachObservations.hidden = true;
      els.detailedAnalysis.hidden = true;
      els.assessmentScope.textContent = `Assisted: ${assessmentRangeLabel(takeRange)}`;
      els.coachIntro.textContent = "Take complete — review your vocal line above or listen back below.";
      els.resultsPanel.hidden = false;
      els.resultsPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      setStatus("good", "Take complete", "Review your vocal line above or listen back below.");
      return;
    }
    els.resultsKicker.textContent = "Personalised assessment";
    $("#resultsHeading").textContent = "Your Vocal Coach";
    els.coachLevel.hidden = false;
    els.coachObservations.hidden = false;
    els.detailedAnalysis.hidden = false;
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
  els.expectedPosition.textContent = "The live tuner starts before Play";
  els.sampleCount.textContent = "0";
  els.resultsPanel.hidden = true;
  state.samples = [];
  state.rawSamples = [];
  state.acceptedSamples = [];
  state.visualTraceSamples = [];
  state.previousTakeTrace = [];
  state.takeCompleted = false;
  state.activeTake = null;
  state.sessionOctaveShift = null;
  resetPitchDiagnostics();
  state.mode = "assisted";
  state.microphoneActivationToken += 1;
  state.microphonePreparing = false;
  document.body.classList.add("microphone-mode");
  setTuningMeterInactive("Listening…");
  els.modeButtons.forEach((button) => { const active = button.dataset.mode === "assisted"; button.classList.toggle("active", active); button.setAttribute("aria-checked", String(active)); });
  els.headphoneNote.hidden = false;
  els.resultsKicker.textContent = "Personalised assessment";
  $("#resultsHeading").textContent = "Your Vocal Coach";
  els.coachLevel.hidden = false;
  els.coachObservations.hidden = false;
  els.detailedAnalysis.hidden = false;
  els.guideVolume.value = String(state.guideVolume);
  updateVolume("guide", state.guideVolume);
  setGuideVoice(state.guideVoice, { persist: false });
  setCountInBars(state.countInBars);
  state.octaveShift = DEFAULT_OCTAVE_SHIFT;
  setOctaveShift(state.octaveShift);
  setMicrophoneSensitivity(state.microphoneSensitivity);
  els.listeningSetupButtons.forEach((button) => {
    const active = button.dataset.listeningSetup === state.listeningSetup;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  els.listeningSetupOutput.textContent = state.listeningSetup === "speakers" ? "Speakers" : "Headphones";
  updateMicrophoneCheckSetting();
  clearPerformancePlayback();
  state.followScore = true;
  state.lastFollowSystem = null;
  els.followScoreButton.classList.add("active");
  els.followScoreButton.setAttribute("aria-pressed", "true");
  els.countInDisplay.hidden = true;
  els.diagRawHz.textContent = els.diagRawMidi.textContent = els.diagFilteredHz.textContent = els.diagFilteredMidi.textContent = "—";
  els.diagClarity.textContent = els.diagRms.textContent = els.diagPeak.textContent = els.diagNearFullScale.textContent = els.diagTarget.textContent = els.diagCents.textContent = "—";
  els.diagState.textContent = "No reliable pitch";
  els.pitchDiagnostics.hidden = !PITCH_DEBUG_ENABLED;
  els.pitchDiagnostics.open = PITCH_DEBUG_ENABLED;
  setPlaybackState("stopped");
  setStatus("idle", "Starting live tuner…", "Assisted mode keeps the guide and visual trace without coaching judgement.");
  audio.stop({ reset: true, resetQuarter: range.startQuarter, microphone: false });
  renderPracticeRangeControls();
  setSectionMessage(`Whole piece selected: bars ${range.firstMeasure}–${range.lastMeasure}.`);
  updatePosition(range.startQuarter);
  void activateMicrophonePreparation(state.microphoneActivationToken);
}

function resetToUpload() {
  state.microphoneActivationToken += 1;
  state.microphonePreparing = false;
  audio.destroy();
  cancelAnimationFrame(state.syncFrame);
  clearTimeout(state.overlayResizeTimer);
  state.score = null; state.selectedPartId = null; state.samples = []; state.rawSamples = []; state.acceptedSamples = []; state.visualTraceSamples = []; state.previousTakeTrace = []; state.takeCompleted = false; state.osmd = null; state.cursor = null; state.cursorTimeline = []; state.cursorIndex = 0; state.scoreGeometry = new Map(); state.measureGeometry = [];
  state.sectionStartMeasure = null; state.sectionEndMeasure = null; state.startMeasure = null; state.rangeSelectionMode = false; state.rangeSelectionStart = null; state.startPickMode = false; state.pendingStartMeasure = null;
  state.activeTake = null;
  state.sessionOctaveShift = null;
  resetPitchDiagnostics();
  document.body.classList.remove("microphone-mode");
  els.scoreContainer.innerHTML = "";
  clearPerformancePlayback();
  els.scoreInput.value = "";
  els.repertoireSelect.value = "";
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
  els.repertoireSelect.addEventListener("change", () => {
    const entry = state.repertoire.find((candidate) => candidate.file === els.repertoireSelect.value);
    if (entry) loadScore(() => readScoreUrl(entry.file, entry.title));
  });
  els.partBackButton.addEventListener("click", resetToUpload);
  els.newScoreButton.addEventListener("click", resetToUpload);
  els.partOptions.addEventListener("click", (event) => { const button = event.target.closest("[data-part-id]"); if (button) selectPart(button.dataset.partId); });
  els.continueButton.addEventListener("click", enterStudio);
  els.modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  els.sensitivityButtons.forEach((button) => button.addEventListener("click", () => setMicrophoneSensitivity(button.dataset.sensitivity)));
  els.listeningSetupButtons.forEach((button) => button.addEventListener("click", () => setListeningSetup(button.dataset.listeningSetup)));
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
  els.octaveButtons.forEach((button) => button.addEventListener("click", () => setOctaveShift(button.dataset.octave)));
  els.hearStartingNote.addEventListener("click", hearStartingNote);
  els.guideVolume.addEventListener("input", () => updateVolume("guide", els.guideVolume.value));
  els.guideVoice.addEventListener("change", () => setGuideVoice(els.guideVoice.value));
  els.accompanimentList.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-part-enabled]");
    if (input) {
      const partId = input.dataset.partEnabled;
      if (input.checked) state.enabledParts.add(partId); else state.enabledParts.delete(partId);
      audio.setPartEnabled(partId, input.checked);
      updateMuteAllLabel();
      return;
    }
    const select = event.target.closest("select[data-part-voice]");
    if (!select) return;
    const partId = select.dataset.partVoice;
    state.partVoices[partId] = normaliseGuideVoice(select.value);
    audio.setPartVoice(partId, state.partVoices[partId]);
  });
  els.accompanimentList.addEventListener("input", (event) => {
    const input = event.target.closest("input[data-part-volume]");
    if (!input) return;
    const partId = input.dataset.partVolume;
    const volume = Math.max(0, Math.min(100, Number(input.value) || 0));
    state.partVolumes[partId] = volume;
    audio.setPartVolume(partId, volume);
    const output = els.accompanimentList.querySelector(`[data-part-volume-output="${CSS.escape(partId)}"]`);
    if (output) output.textContent = `${volume}%`;
  });
  els.toggleAllParts.addEventListener("click", () => {
    const parts = state.score.parts.filter((part) => part.id !== state.selectedPartId);
    const all = parts.every((part) => state.enabledParts.has(part.id));
    state.enabledParts = new Set(all ? [] : parts.map((part) => part.id));
    parts.forEach((part) => audio.setPartEnabled(part.id, !all));
    renderAccompaniment();
  });
  els.showPreviousTake.addEventListener("change", () => {
    state.showPreviousTake = els.showPreviousTake.checked;
    renderTakeTraces();
  });
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
void loadRepertoireIndex();
if (TIMING_DEBUG_ENABLED) {
  console.info("Vocal Coach timing debug: transport quarter | OSMD timestamp | measure | expected note");
  Object.defineProperty(window, "__vocalCoachTiming", {
    value: Object.freeze({ snapshot: timingSnapshot }),
    configurable: true,
  });
}
if (PITCH_DEBUG_ENABLED) {
  console.info("Vocal Coach pitch debug enabled: rawSamples, acceptedSamples, and visualTraceSamples remain separate.");
  Object.defineProperty(window, "__vocalCoachPitch", {
    value: Object.freeze({
      snapshot: () => ({
        rawSamples: [...state.rawSamples],
        acceptedSamples: [...state.acceptedSamples],
        visualTraceSamples: [...state.visualTraceSamples],
      }),
      diagnostics: () => state.pitchDiagnosticSummary.snapshot(),
    }),
    configurable: true,
  });
}
showView("upload");
