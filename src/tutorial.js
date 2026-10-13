const KEY = "vocal-coach:tutorial:v1";
export const TOUR_STEPS = {
  upload: [
    [".score-chooser", "Welcome to Vocal Coach", "Choose a repertoire score, or use Upload MusicXML for your own XML or MXL file. No microphone is needed to explore or listen."],
    ["#helpButton", "Help whenever you need it", "This button opens the guide. Replay button tour lets you return to these tips at any time."],
  ],
  parts: [
    ["#partOptions", "Choose your vocal line", "Select the part you sing. The other parts become your accompaniment."],
    ["#continueButton", "Enter the studio", "Use this as my vocal part opens your score. Choose another file takes you back."],
  ],
  studio: [
    [".mode-switch", "Choose your session", "Listen plays the guide and accompaniment without a mic. Assisted adds live pitch feedback. Assessment removes the guide and adds coaching. If mic setup fails, we switch to Listen."],
    [".accompaniment-block", "Shape the accompaniment", "Mute all switches the backing parts together. Each part has its own on/off switch, voice choice and volume slider."],
    [".volume-block", "Vocal guide", "Vocal Guide adjusts the melody volume. Guide voice chooses Human voice or Synthetic Ah. The guide is silent during Assessment."],
    [".compact-setting", "Count yourself in", "Off starts immediately; 1 bar or 2 bars gives you a beat countdown before the music."],
    [".practice-section-setting", "Practise a few bars", "From bar and To bar set a section. Select bars lets you choose on the score; Clear returns to the whole piece."],
    [".start-from-setting", "Choose where to begin", "Set the starting bar or use Choose on score, then Start here. Cancel dismisses a score selection."],
    [".starting-note-setting", "Hear your starting note", "Hear starting note plays the first note in your section. With a working mic, sing it back to confirm your octave."],
    [".octave-setting", "Manual octave", "Choose Written, Octave lower, 2 octaves lower or Octave higher to place the guide in your singing range."],
    [".microphone-check-setting", "Check or retry your microphone", "Recheck microphone tests room noise and your voice. You can keep practising in Listen if the mic is blocked, missing or too quiet."],
    [".sensitivity-block", "Microphone sensitivity", "Low suits a stronger signal; Normal uses calibration; High suits quiet singing. These controls affect microphone sessions."],
    [".listening-setup-block", "Headphones or speakers", "Headphones gives the cleanest pitch feedback. Speakers enables echo control. Listen mode works with either."],
    [".tempo-field", "Set your pace", "Move Tempo toward Slower or Faster before starting a take."],
    [".transport-buttons", "Play, Pause and Stop", "Play starts the count-in and music. Pause holds your place. Stop returns to the selected start."],
    [".view-switch", "Choose a score view", "Vocal focus shows your line; Full score includes the other parts."],
    [".score-stage", "Follow the notes", "The cursor follows playback. With a mic, the tuner shows your pitch and a coloured trace appears over the notes. Listen mode shows playback without inventing pitch results."],
    ["#finishButton", "Finish and review", "In a microphone session, Finish & review opens coaching and captured performance playback. Review has Restart, Play, Pause, a seek slider, layer switches and volume sliders. Previous take can show your last trace. Listen has no recording or assessment."],
    ["#transportDock", "Controls stay with you", "The bottom bar has Restart, Play/Pause and Stop. Follow score toggles automatic scrolling as the music moves."],
    ["#newScoreButton", "Ready to practise", "New score returns to score selection. Help can replay this tour. Start with Listen, then choose a microphone mode when you want feedback."],
  ],
};

export function createTutorial() {
  let enabled = true;
  try { enabled = localStorage.getItem(KEY) !== "done"; } catch { /* Works without storage. */ }
  let view = "upload", index = 0, target = null, returnFocus = null;
  const card = document.createElement("section");
  card.className = "tutorial-card";
  card.hidden = true;
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-labelledby", "tutorialTitle");
  card.innerHTML = '<small id="tutorialProgress"></small><h2 id="tutorialTitle"></h2><p id="tutorialCopy"></p><div class="tutorial-actions"><button type="button" data-tour="skip">Skip tutorial</button><button type="button" data-tour="back">Back</button><button type="button" data-tour="next">Next →</button></div>';
  document.body.append(card);
  const find = (selector) => card.querySelector(selector);
  function clearTarget() { target?.classList.remove("tutorial-target"); target = null; }
  function close() {
    enabled = false;
    try { localStorage.setItem(KEY, "done"); } catch { /* Optional persistence. */ }
    clearTarget(); card.hidden = true;
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  }
  function render(focus = true) {
    clearTarget();
    const steps = TOUR_STEPS[view];
    if (!enabled || !steps) { card.hidden = true; return; }
    const [selector, title, copy] = steps[index];
    target = document.querySelector(selector);
    if (target) {
      const details = target.closest("details");
      if (details) details.open = true;
      target.classList.add("tutorial-target");
      target.scrollIntoView({ block: "center", behavior: "instant" });
    }
    card.hidden = false;
    find("#tutorialProgress").textContent = `${view === "studio" ? "Studio" : view === "parts" ? "Your part" : "Getting started"} · ${index + 1} of ${steps.length}`;
    find("#tutorialTitle").textContent = title;
    find("#tutorialCopy").textContent = copy;
    find('[data-tour="back"]').disabled = index === 0;
    find('[data-tour="next"]').textContent = index === steps.length - 1 ? (view === "studio" ? "Finish tour" : (view === "upload" ? "Choose my score →" : "Choose my part →")) : "Next →";
    const rect = target?.getBoundingClientRect();
    card.classList.toggle("tutorial-at-top", Boolean(rect && rect.top > innerHeight / 2));
    if (focus) find('[data-tour="next"]').focus({ preventScroll: true });
  }
  card.addEventListener("click", (event) => {
    const action = event.target.dataset.tour;
    if (action === "skip") close();
    if (action === "back") { index = Math.max(0, index - 1); render(); }
    if (action === "next") {
      if (index < TOUR_STEPS[view].length - 1) { index++; render(); }
      else if (view === "studio") close();
      else { clearTarget(); card.hidden = true; (document.querySelector(view === "upload" ? "#repertoireSelect" : "#continueButton"))?.focus(); }
    }
  });
  document.addEventListener("keydown", (event) => {
    if (!card.hidden && event.key === "Escape") { event.preventDefault(); close(); }
  });
  return {
    showView(name) { view = name; index = 0; if (enabled) { returnFocus = document.activeElement; render(); } },
    replay() { enabled = true; index = 0; returnFocus = document.activeElement; render(); },
  };
}
