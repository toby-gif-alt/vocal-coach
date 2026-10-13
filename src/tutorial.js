const WELCOME_KEY = "vocal-coach:welcome:v2", STUDIO_KEY = "vocal-coach:studio-tour:v2";
export const TOUR_STEPS = [
  [".mode-switch", "Choose your mode", "Listen needs no mic. Assisted adds a guide and pitch trace. Assessment gives coaching without the guide."],
  [".score-stage", "Sing from the score", "The cursor follows the music. With a mic, the tuner and coloured trace show how your pitch matches."],
  ["#setupPanel", "Prepare your entrance", "Hear starting note sits beside the score. Open Session settings for count-in, octave, tempo and microphone checks."],
  ["#mixerPanel", "Hear the parts you need", "Open Mixer to balance the accompaniment and vocal guide."],
  ["#editPracticeButton", "Practise selected bars", "Double-click a bar, or use Practice section. Type a range or choose Select by dragging, then Apply."],
  ["#transportDock", "Play, pause and review", "Use the bottom controls while singing. Finish & review ends a mic take; Assessment shows three priorities and two strengths."],
];

// State and timing are independent of the DOM, so first-use behaviour is testable.
export function createOnboarding({ storage, schedule = setTimeout, unschedule = clearTimeout, show, hide, onStudioReady = () => {} }) {
  const read = key => { try { return storage?.getItem(key) === "done"; } catch { return false; } };
  const save = key => { try { storage?.setItem(key, "done"); } catch { /* Storage is optional. */ } };
  let welcomeDone = read(WELCOME_KEY), studioDone = read(STUDIO_KEY), view = "upload", timer = null, active = false;
  const cancelTimer = () => { if (timer !== null) unschedule(timer); timer = null; };
  return {
    view(name) {
      cancelTimer(); hide(); view = name;
      if (active) return;
      if (name === "upload" && !welcomeDone) timer = schedule(() => { timer = null; if (view === "upload" && !active && !welcomeDone) show("welcome"); }, 2000);
      if (name === "studio") { if (!studioDone) show("studio"); else onStudioReady("returning"); }
    },
    interact() { if (view === "upload") { cancelTimer(); welcomeDone = true; save(WELCOME_KEY); hide(); } },
    skip(kind) { cancelTimer(); hide(); if (kind === "welcome") { welcomeDone = true; save(WELCOME_KEY); } else { const firstTour = !studioDone; studioDone = true; save(STUDIO_KEY); if (firstTour && view === "studio" && !active) onStudioReady("first-tour"); } },
    active(value) { active = value; if (value) { cancelTimer(); hide(); } },
    replay() { if (active) return false; cancelTimer(); show(view === "studio" ? "studio" : "welcome"); return true; },
    destroy() { cancelTimer(); hide(); },
  };
}

export function tutorialOverviewScale(height, viewportHeight, top, compact) {
  const available = Math.max(80, viewportHeight - top - (compact ? 350 : 95));
  return Math.max(0.2, Math.min(1, available / Math.max(1, height)));
}

export function createTutorial({ onStudioReady = () => {}, onLayoutChange = () => {} } = {}) {
  let kind = "welcome", index = 0, target = null;
  const card = document.createElement("section"); card.className = "tutorial-card"; card.hidden = true;
  card.setAttribute("role", "dialog"); card.setAttribute("aria-labelledby", "tutorialTitle");
  card.innerHTML = '<small id="tutorialProgress"></small><h2 id="tutorialTitle"></h2><p id="tutorialCopy" aria-live="polite"></p><div class="tutorial-actions"><button type="button" data-tour="skip">Skip</button><button type="button" data-tour="back">Back</button><button type="button" data-tour="next">Next →</button></div>';
  document.body.append(card);
  const find = selector => card.querySelector(selector);
  function fitOverview() {
    const studio = document.querySelector("#studioView");
    if (!studio?.classList.contains("tutorial-overview")) return;
    const top = Math.max(0, studio.getBoundingClientRect().top);
    studio.style.setProperty("--tutorial-scale", tutorialOverviewScale(studio.offsetHeight, innerHeight, top, innerWidth < 900));
  }
  function beginOverview() {
    const studio = document.querySelector("#studioView");
    if (kind !== "studio" || !studio || studio.classList.contains("tutorial-overview")) return;
    document.body.classList.add("tutorial-studio"); studio.classList.add("tutorial-overview");
    // One overview at the start, then a fixed viewport for every Next/Back step.
    window.scrollTo({ top: Math.max(0, studio.offsetTop - 12), behavior: "instant" });
    fitOverview(); onLayoutChange();
  }
  function hide() {
    target?.classList.remove("tutorial-target"); target = null; card.hidden = true;
    const studio = document.querySelector("#studioView");
    if (studio?.classList.contains("tutorial-overview")) {
      studio.classList.remove("tutorial-overview"); studio.style.removeProperty("--tutorial-scale");
      document.body.classList.remove("tutorial-studio"); onLayoutChange();
    }
  }
  function render() {
    target?.classList.remove("tutorial-target");
    const [selector, title, copy] = kind === "welcome" ? [".score-chooser", "Welcome to Vocal Coach!", "Select repertoire from here or upload your own to get started."] : TOUR_STEPS[index];
    target = document.querySelector(selector); target?.classList.add("tutorial-target");
    beginOverview();
    card.hidden = false;
    find("#tutorialTitle").textContent = title; find("#tutorialCopy").textContent = copy;
    find("#tutorialProgress").textContent = kind === "welcome" ? "Start with a score" : `${index + 1} of ${TOUR_STEPS.length}`;
    find('[data-tour="back"]').hidden = kind === "welcome"; find('[data-tour="back"]').disabled = index === 0;
    find('[data-tour="next"]').hidden = kind === "welcome";
    find('[data-tour="next"]').textContent = index === TOUR_STEPS.length - 1 ? "Done" : "Next →";
    card.classList.toggle("welcome-cue", kind === "welcome");
  }
  let storage; try { storage = localStorage; } catch { /* Restricted browsing. */ }
  const controller = createOnboarding({ storage, show(value) { kind = value; index = 0; render(); if (kind === "studio") find('[data-tour="next"]').focus({ preventScroll: true }); }, hide, onStudioReady });
  card.addEventListener("click", event => {
    const action = event.target.dataset.tour;
    if (action === "skip") controller.skip(kind);
    if (action === "back") { index = Math.max(0, index - 1); render(); }
    if (action === "next") { if (index === TOUR_STEPS.length - 1) controller.skip(kind); else { index++; render(); } }
  });
  const interact = () => controller.interact();
  document.addEventListener("pointerdown", interact, { passive: true });
  document.addEventListener("keydown", interact);
  document.addEventListener("change", interact);
  document.addEventListener("wheel", interact, { passive: true });
  document.addEventListener("touchmove", interact, { passive: true });
  const keys = event => { if (!card.hidden && event.key === "Escape") controller.skip(kind); };
  document.addEventListener("keydown", keys);
  window.addEventListener("resize", fitOverview);
  return { showView: name => controller.view(name), setActive: value => controller.active(value), replay: () => controller.replay(), refreshOverview: fitOverview,
    destroy() { controller.destroy(); document.removeEventListener("pointerdown", interact); document.removeEventListener("keydown", interact); document.removeEventListener("change", interact); document.removeEventListener("wheel", interact); document.removeEventListener("touchmove", interact); document.removeEventListener("keydown", keys); window.removeEventListener("resize", fitOverview); card.remove(); } };
}
