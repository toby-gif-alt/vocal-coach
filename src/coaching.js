import { COACHING_CONFIG as C } from "./config.js?v=27";
import { summarisePerformance } from "./analysis.js?v=27";

const location = (r) => `${r.note.displayPitch} in bar ${r.note.measureNumber}`;
const side = (v) => v < 0 ? "flat" : "sharp";
const centre = (r) => r.sustainCentre;
const reliable = (r) => r.evidenceReliable === true && Number.isFinite(centre(r));
function point(tone, category, title, finding, exercise, result, severity = 0) {
  return { tone, category, title, body: finding, exercise, noteId: result?.note.id ?? null,
    measureNumber: result?.note.measureNumber ?? null, priority: severity, provisional: false };
}
function select(pool, count) {
  const selected = [], categories = new Set(), usedNotes = new Set();
  for (const item of pool.sort((a, b) => b.priority - a.priority)) {
    if (categories.has(item.category) || usedNotes.has(item.noteId)) continue;
    selected.push(item); categories.add(item.category); usedNotes.add(item.noteId);
    if (selected.length === count) break;
  }
  return selected;
}
function provisional(tone, index) {
  const ideas = tone === "positive" ? [
    ["Strength not confirmed yet", "There is not enough clear evidence for another distinct strength.", "Record a short phrase in Assisted, then listen back for a note you matched well."],
    ["Another strength needs a clearer take", "This take does not establish a second musical achievement.", "Try a comfortable phrase with headphones so your voice is easier to measure."],
  ] : [
    ["Build a repeatable pitch match", "Provisional practice idea — no additional reliable pitch issue was found.", "Hear a comfortable target, hum it gently, then repeat it in the phrase."],
    ["Prepare a calm entrance", "Provisional practice idea — the trace does not establish entrance timing.", "Imagine the note, take a comfortable breath, and start with airflow and voice together, without a forced or extra-breathy beginning."],
    ["Connect the phrase comfortably", "Provisional practice idea — gaps do not prove an early release or a breathing problem.", "Try a gentle lip trill through two notes, then sing them on an easy vowel at the same volume."],
  ];
  const [title, body, exercise] = ideas[index % ideas.length];
  return { ...point(tone, `provisional-${index}`, title, body, exercise), provisional: true };
}

export function buildCoachingFeedback(results) {
  const profile = summarisePerformance(results);
  const measured = results.filter(reliable), improvements = [], strengths = [];
  const leapTargets = new Set();
  // Iterate the complete score order: never bridge missing or unmeasured notes.
  for (let i = 1; i < results.length; i++) {
    const before = results[i - 1], after = results[i];
    const interval = after.note.midi - before.note.midi;
    const gap = after.note.onsetQuarters - (before.note.onsetQuarters + before.note.durationQuarters);
    if (!reliable(before) || !reliable(after) || !after.entranceReliable || gap > 0.5 || gap < -0.05) continue;
    if (Math.abs(interval) >= C.minimumLeapSemitones && Math.abs(centre(before)) <= 15) {
      const upward = interval > 0;
      const missed = after.sustainBiasFraction >= C.minimumBiasFraction && (upward
        ? after.entranceCentre <= -C.pitchBias && centre(after) <= -C.pitchBias
        : after.entranceCentre >= C.pitchBias && centre(after) >= C.pitchBias);
      if (missed) {
        leapTargets.add(after.note.id);
        improvements.push(point("refinement", upward ? "ascending-leap" : "descending-leap", `${upward ? "Upward" : "Downward"} leap to ${after.note.displayPitch}`,
          `After a centred ${before.note.displayPitch}, the leap to ${location(after)} stayed ${side(centre(after))}.`,
          `Listen to the ${upward ? "higher" : "lower"} note first. Sing both notes separately, then connect them slowly with a gentle “oo” slide. Repeat the leap directly without sliding or pushing volume.`, after, 150 + Math.min(80, Math.abs(centre(after)))));
      } else if (Math.abs(centre(after)) <= 15 && Math.abs(after.entranceCentre) <= 15) {
        strengths.push(point("positive", "interval", `You found the leap to ${after.note.displayPitch}`, `Both the first measured pitch and the sustained centre of ${location(after)} matched after a ${upward ? "rising" : "falling"} leap.`, "Keep hearing the destination note before repeating this interval.", after, 130));
      }
    }
  }
  for (const sign of [-1, 1]) {
    const biased = measured.filter(r => !leapTargets.has(r.note.id) && Math.sign(centre(r)) === sign && Math.abs(centre(r)) >= C.pitchBias && r.sustainBiasFraction >= C.minimumBiasFraction);
    if (biased.length) {
      const r = [...biased].sort((a,b) => Math.abs(centre(b)) - Math.abs(centre(a)))[0];
      improvements.push(point("refinement", "pitch-centre", `${biased.length > 1 ? "Recurring " : ""}${side(sign)} pitch`,
        `${location(r)} stayed ${side(sign)} through its middle${biased.length > 1 ? `; the same pattern appeared on ${biased.length} notes` : ""}.`,
        "Hear the target first, match it at a comfortable volume without scooping or pressing toward it, then repeat it in context.", r, 90 + Math.min(60, Math.abs(centre(r))) + biased.length * 8));
    }
    const entrances = measured.filter(r => !leapTargets.has(r.note.id) && r.entranceReliable && Math.sign(r.entranceCentre) === sign && Math.abs(r.entranceCentre) >= C.pitchBias && Math.abs(centre(r)) <= 15);
    if (entrances.length) {
      const r = entrances[0];
      improvements.push(point("refinement", "entrance", `Start closer to ${r.note.displayPitch}`, `${location(r)} began ${side(sign)} then corrected; ${entrances.length} entrance${entrances.length === 1 ? "" : "s"} showed this pattern. This describes pitch, not early or late timing.`,
        "If this was not an intended slide, silently imagine the target, take a comfortable breath, and begin with airflow and voicing together, without an extra-breathy or forced start.", r, 100 + entrances.length * 10));
    }
  }
  const drift = measured.filter(r => r.offsetReliable && Math.abs(r.offsetDriftCents) >= C.offsetChange && Math.abs(r.endingCentre) > C.pitchBias);
  if (drift.length) {
    const r = [...drift].sort((a,b) => Math.abs(b.offsetDriftCents) - Math.abs(a.offsetDriftCents))[0];
    improvements.push(point("refinement", "sustain", `Keep the ending of ${r.note.displayPitch} centred`, `${location(r)} moved ${r.offsetDriftCents < 0 ? "down" : "up"} near its end${drift.length > 1 ? `; ${drift.length} notes had ending drift` : ""}. Pitch alone does not show why.`,
      "Take a comfortable breath and hum the target evenly through the written length. Try a gentle lip trill, then an easy vowel without forcing the sound.", r, 115 + drift.length * 8));
  }
  for (const r of measured) {
    if (r.entranceReliable && Math.abs(r.entranceCentre) <= 15 && Math.abs(centre(r)) <= 15) {
      strengths.push(point("positive", "entrance", `A centred start on ${r.note.displayPitch}`, `The first measured pitch of ${location(r)} was close to the target and stayed there.`, "Keep that target in mind before your next entrance.", r, 90 + r.voicedCoveragePercent / 10));
    }
    if (r.durationSeconds >= 1 && Math.abs(centre(r)) <= 15 && r.voicedCoveragePercent >= 80) {
      strengths.push(point("positive", "sustain", `You held the centre on ${r.note.displayPitch}`, `Clear samples followed ${location(r)} through most of its value, with its middle centred on the target.`, "Keep the same comfortable approach when you join the phrase.", r, 100 + r.voicedCoveragePercent / 10));
    }
    if (r.entranceReliable && Math.abs(r.entranceCentre) >= 25 && Math.abs(centre(r)) <= 15) {
      strengths.push(point("positive", "recovery", `You adjusted ${r.note.displayPitch}`, `${location(r)} moved from ${side(r.entranceCentre)} toward a centred sustained pitch.`, "Keep listening for that centre, then try finding it earlier.", r, 95));
    }
  }
  // Repeated-note matching is supported only when the repeated centres are accurate.
  const byPitch = new Map();
  for (const r of measured) { const group = byPitch.get(r.note.midi) || []; group.push(r); byPitch.set(r.note.midi, group); }
  for (const group of byPitch.values()) {
    if (group.length >= 2 && group.every(r => Math.abs(centre(r)) <= 15)) {
      strengths.push(point("positive", "repeated-note", `Reliable repeated ${group[0].note.displayPitch}s`, `${group.length} measured appearances stayed centred, including ${location(group[0])}.`, "Use the same inner pitch reference for each repeat.", group[0], 105));
    }
  }
  for (const category of ["ascending-leap", "descending-leap"]) {
    const repeated = improvements.filter(item => item.category === category);
    if (repeated.length > 1) for (const item of repeated) { item.priority += repeated.length * 12; item.body += ` This pattern appeared on ${repeated.length} leaps.`; }
  }
  // Repetition, confidence, musical context and successful related examples break ties.
  for (const item of improvements) {
    const r = measured.find(r => r.note.id === item.noteId);
    const similarSuccess = measured.some(other => other.note.id !== r?.note.id && other.note.midi === r?.note.midi && Math.abs(centre(other)) <= 15);
    item.priority += (r?.voicedCoveragePercent || 0) / 20 + Math.min(r?.sampleCount || 0, 40) / 10 + (similarSuccess ? 8 : 0);
    const previous = results[results.indexOf(r) - 1];
    if (r && (!previous || r.note.onsetQuarters - previous.note.onsetQuarters - previous.note.durationQuarters >= 0.5)) item.priority += 10;
  }
  const workOn = select(improvements, 3), didWell = select(strengths, 2);
  while (workOn.length < 3) workOn.push(provisional("refinement", workOn.filter(x => x.provisional).length));
  while (didWell.length < 2) didWell.push(provisional("positive", didWell.filter(x => x.provisional).length));
  return { profile, improvements: workOn, strengths: didWell, observations: [...workOn, ...didWell], measuredCount: measured.length };
}
