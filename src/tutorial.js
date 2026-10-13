const WELCOME_KEY = "vocal-coach:welcome:v2", STUDIO_KEY = "vocal-coach:studio-tour:v2";
export const TOUR_STEPS = [
  [".mode-switch", "Choose your mode", "Listen needs no mic. Assisted adds a guide and pitch trace. Assessment gives coaching without the guide."],
  [".score-stage", "Sing from the score", "The cursor follows the music. With a mic, the tuner and coloured trace show how your pitch matches."],
  ["#setupPanel", "Prepare your entrance", "Open Session settings for count-in, starting note, octave, tempo and microphone checks."],
  ["#mixerPanel", "Hear the parts you need", "Open Mixer to balance the accompaniment and vocal guide."],
  ["#editPracticeButton", "Practise selected bars", "Double-click a bar, or use Practice section. Type a range or choose Select by dragging, then Apply."],
  ["#transportDock", "Play, pause and review", "Use the bottom controls while singing. Finish & review ends a mic take; Assessment shows three priorities and two strengths."],
];

// State and timing are independent of the DOM, so first-use behaviour is testable.
export function createOnboarding({ storage, schedule = setTimeout, unschedule = clearTimeout, show, hide }) {
  const read = key => { try { return storage?.getItem(key) === "done"; } catch { return false; } };
  const save = key => { try { storage?.setItem(key, "done"); } catch { /* Storage is optional. */ } };
  let welcomeDone = read(WELCOME_KEY), studioDone = read(STUDIO_KEY), view = "upload", timer = null, active = false;
  const cancelTimer = () => { if (timer !== null) unschedule(timer); timer = null; };
  return {
    view(name) {
      cancelTimer(); hide(); view = name;
      if (active) return;
      if (name === "upload" && !welcomeDone) timer = schedule(() => { timer = null; if (view === "upload" && !active && !welcomeDone) show("welcome"); }, 2000);
      if (name === "studio" && !studioDone) show("studio");
    },
    interact() { if (view === "upload") { cancelTimer(); welcomeDone = true; save(WELCOME_KEY); hide(); } },
    skip(kind) { cancelTimer(); hide(); if (kind === "welcome") { welcomeDone = true; save(WELCOME_KEY); } else { studioDone = true; save(STUDIO_KEY); } },
    active(value) { active = value; if (value) { cancelTimer(); hide(); } },
    replay() { if (active) return false; cancelTimer(); show(view === "studio" ? "studio" : "welcome"); return true; },
    destroy() { cancelTimer(); hide(); },
  };
}

export function createTutorial() {
  let kind = "welcome", index = 0, target = null;
  const card = document.createElement("section"); card.className = "tutorial-card"; card.hidden = true;
  card.setAttribute("role", "dialog"); card.setAttribute("aria-labelledby", "tutorialTitle");
  card.innerHTML = '<small id="tutorialProgress"></small><h2 id="tutorialTitle"></h2><p id="tutorialCopy" aria-live="polite"></p><div class="tutorial-actions"><button type="button" data-tour="skip">Skip</button><button type="button" data-tour="back">Back</button><button type="button" data-tour="next">Next →</button></div>';
  document.body.append(card);
  const find = selector => card.querySelector(selector);
  function hide() { target?.classList.remove("tutorial-target"); target = null; card.hidden = true; }
  function render() {
    target?.classList.remove("tutorial-target");
    const [selector, title, copy] = kind === "welcome" ? [".score-chooser", "Welcome to Vocal Coach!", "Select repertoire from here or upload your own to get started."] : TOUR_STEPS[index];
    target = document.querySelector(selector); target?.classList.add("tutorial-target");
    if (kind === "studio" && target) {
      const rect = target.getBoundingClientRect();
      if (rect.top < 0 || rect.bottom > innerHeight - 90) target.scrollIntoView({block:"center", behavior:"instant"});
    }
    card.hidden = false;
    find("#tutorialTitle").textContent = title; find("#tutorialCopy").textContent = copy;
    find("#tutorialProgress").textContent = kind === "welcome" ? "Start with a score" : `${index + 1} of ${TOUR_STEPS.length}`;
    find('[data-tour="back"]').hidden = kind === "welcome"; find('[data-tour="back"]').disabled = index === 0;
    find('[data-tour="next"]').hidden = kind === "welcome";
    find('[data-tour="next"]').textContent = index === TOUR_STEPS.length - 1 ? "Done" : "Next →";
    // Keep the cue near its target, choosing the side with room. Never auto-scroll a singer.
    const rect = target?.getBoundingClientRect();
    const width = Math.min(340, innerWidth - 32);
    const left = rect ? Math.max(16, Math.min(innerWidth - width - 16, rect.right - width)) : 16;
    const height = card.offsetHeight;
    const below = rect && rect.bottom + height + 100 < innerHeight;
    const top = rect ? (below ? rect.bottom + 12 : Math.max(12, rect.top - height - 12)) : 16;
    card.style.left = `${left}px`; card.style.right = "auto"; card.style.bottom = "auto";
    card.style.top = `${Math.min(Math.max(12, top), innerHeight - height - 85)}px`;
    card.classList.toggle("welcome-cue", kind === "welcome");
  }
  let storage; try { storage = localStorage; } catch { /* Restricted browsing. */ }
  const controller = createOnboarding({ storage, show(value) { kind = value; index = 0; render(); }, hide });
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
  const reposition = () => { if (!card.hidden) render(); };
  window.addEventListener("resize", reposition); window.addEventListener("scroll", reposition, { passive: true });
  return { showView: name => controller.view(name), setActive: value => controller.active(value), replay: () => controller.replay(),
    destroy() { controller.destroy(); document.removeEventListener("pointerdown", interact); document.removeEventListener("keydown", interact); document.removeEventListener("change", interact); document.removeEventListener("wheel", interact); document.removeEventListener("touchmove", interact); document.removeEventListener("keydown", keys); window.removeEventListener("resize", reposition); window.removeEventListener("scroll", reposition); card.remove(); } };
}
