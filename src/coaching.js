import { PITCH_THRESHOLDS } from "./config.js?v=14";
import { summarisePerformance } from "./analysis.js?v=14";

const BALANCE = Object.freeze({
  excellent: { positive: 8, refinement: 2 },
  strong: { positive: 7, refinement: 3 },
  developing: { positive: 5, refinement: 5 },
  foundation: { positive: 4, refinement: 6 },
  "early-foundation": { positive: 3, refinement: 7 },
});

function mean(values) {
  const usable = values.filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : null;
}

function median(values) {
  const usable = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!usable.length) return null;
  const middle = Math.floor(usable.length / 2);
  return usable.length % 2 ? usable[middle] : (usable[middle - 1] + usable[middle]) / 2;
}

function noteLabel(result) {
  return `${result.note.displayPitch} in measure ${result.note.measureNumber}`;
}

function direction(value) {
  return value >= 0 ? "sharp" : "flat";
}

function signedMagnitude(value) {
  return `${Math.round(Math.abs(value))} cents ${direction(value)}`;
}

function stabilityScore(result) {
  if (!Number.isFinite(result.pitchStability)) return 45;
  return Math.max(0, 100 - result.pitchStability * 2.1);
}

function quality(result) {
  return (result.inZonePercent ?? 0) * 0.38
    + (result.voicedCoveragePercent ?? 0) * 0.24
    + stabilityScore(result) * 0.18
    + Math.max(0, 100 - Math.abs(result.initialError ?? 100) * 1.4) * 0.10
    + Math.max(0, 100 - Math.abs(result.sustainedError ?? 100) * 1.2) * 0.10;
}

function observation(tone, category, priority, title, body, result = null) {
  return {
    tone,
    category,
    priority,
    title,
    body,
    noteId: result?.note.id || null,
    measureNumber: result?.note.measureNumber ?? null,
  };
}

function positiveCandidates(assessed) {
  const candidates = [];
  const ranked = [...assessed].sort((a, b) => quality(b) - quality(a));
  for (const result of ranked) {
    const label = noteLabel(result);
    const initial = Math.abs(result.initialError ?? 999);
    const sustained = Math.abs(result.sustainedError ?? 999);
    if (initial <= PITCH_THRESHOLDS.green && sustained <= PITCH_THRESHOLDS.green && result.voicedCoveragePercent >= 65) {
      candidates.push(observation("positive", "centred-note", 110 + quality(result), `Secure ${label}`, `You found the centre immediately and sustained it around ±${Math.max(1, Math.round(sustained))} cents.`, result));
    }
    if (Number.isFinite(result.pitchStability) && result.pitchStability <= 12 && result.voicedCoveragePercent >= 55) {
      candidates.push(observation("positive", "steady-note", 105 + quality(result), `A steady ${result.note.displayPitch}`, `The ${label} was one of your steadiest notes, with about ${Math.round(result.pitchStability)} cents of sustained variation.`, result));
    }
    if (result.voicedCoveragePercent >= 82) {
      candidates.push(observation("positive", "complete-note", 95 + quality(result), `Sound carried through ${label}`, `Reliable pitch covered ${Math.round(result.voicedCoveragePercent)}% of the written note, so its full shape is easy to hear and see.`, result));
    }
    if (result.startedOutsideMovedToward) {
      candidates.push(observation("positive", "recovery", 92 + quality(result), `Good adjustment on ${label}`, `It began ${signedMagnitude(result.initialError)}, then moved toward the centre and sustained around ${signedMagnitude(result.sustainedError)}.`, result));
    }
  }

  for (let index = 0; index <= assessed.length - 3; index += 1) {
    const phrase = assessed.slice(index, index + 3);
    const phraseQuality = mean(phrase.map(quality));
    if (phraseQuality < 48) continue;
    const firstMeasure = phrase[0].note.measureNumber;
    const lastMeasure = phrase.at(-1).note.measureNumber;
    const measureText = firstMeasure === lastMeasure ? `measure ${firstMeasure}` : `measures ${firstMeasure}–${lastMeasure}`;
    candidates.push(observation("positive", "phrase", 82 + phraseQuality, `A connected phrase through ${measureText}`, `These notes averaged ${Math.round(mean(phrase.map((result) => result.inZonePercent)))}% in the green zone and kept a consistent pitch centre.`, phrase[0]));
  }

  const immediate = assessed.filter((result) => Math.abs(result.initialError) <= PITCH_THRESHOLDS.green);
  if (immediate.length >= Math.max(2, Math.ceil(assessed.length * 0.55))) {
    candidates.push(observation("positive", "recurring-onset", 104, "Entrances are becoming dependable", `${immediate.length} of ${assessed.length} assessed notes began inside the green zone.`, immediate[0]));
  }
  const sustained = assessed.filter((result) => Math.abs(result.sustainedError) <= PITCH_THRESHOLDS.green);
  if (sustained.length >= Math.max(2, Math.ceil(assessed.length * 0.55))) {
    candidates.push(observation("positive", "recurring-sustain", 102, "The centre held across the line", `${sustained.length} notes stayed centred through their sustained portion, not only at the onset.`, sustained[0]));
  }

  const byPitch = new Map();
  for (const result of assessed) {
    const pitch = result.note.displayPitch;
    if (!byPitch.has(pitch)) byPitch.set(pitch, []);
    byPitch.get(pitch).push(result);
  }
  for (const [pitch, repeated] of byPitch) {
    if (repeated.length < 2) continue;
    const centres = repeated.map((result) => result.averageError);
    const spread = Math.max(...centres) - Math.min(...centres);
    if (spread <= 24) {
      candidates.push(observation("positive", "repeated-pitch", 96 - spread, `Consistent repeated ${pitch}s`, `Across ${repeated.length} appearances, your average centres stayed within a ${Math.round(spread)}-cent range.`, repeated[0]));
    }
  }
  return candidates;
}

function refinementCandidates(assessed, profile) {
  const candidates = [];
  const ranked = [...assessed].sort((a, b) => quality(a) - quality(b));
  for (const result of ranked) {
    const label = noteLabel(result);
    if (Math.abs(result.initialError) > PITCH_THRESHOLDS.green) {
      const settledCopy = result.settleTime === null
        ? "It did not remain in the green zone long enough to count as settled."
        : `It settled after about ${Math.round(result.settleTime * 1000)} ms.`;
      candidates.push(observation("refinement", "onset", 125 + Math.abs(result.initialError), `Place the start of ${label}`, `The onset was about ${signedMagnitude(result.initialError)}. ${settledCopy}`, result));
    }
    if (result.startedAccurateDriftedAway) {
      candidates.push(observation("refinement", "release-drift", 130 + Math.abs(result.sustainedError), `Keep ${label} centred to the release`, `It began accurately, then the sustained centre moved to about ${signedMagnitude(result.sustainedError)}.`, result));
    } else if (Number.isFinite(result.directionalDriftCents) && Math.abs(result.directionalDriftCents) >= 14) {
      candidates.push(observation("refinement", "drift", 110 + Math.abs(result.directionalDriftCents), `Watch the drift on ${label}`, `Across the sustained portion, the trace moved about ${signedMagnitude(result.directionalDriftCents)}. Aim for the same centre at the release as at the start.`, result));
    }
    if (result.voicedCoveragePercent < 72) {
      candidates.push(observation("refinement", "coverage", 120 + (72 - result.voicedCoveragePercent), `Carry ${label} through its full value`, `Reliable pitch covered ${Math.round(result.voicedCoveragePercent)}% of the written duration. Prepare comfortably, then keep the sound and airflow steady to the end.`, result));
    }
    if (result.fragmentationCount > 0) {
      candidates.push(observation("refinement", "fragmentation", 112 + result.fragmentationCount * 10, `Reconnect ${label}`, `The detected sound broke into ${result.fragmentationCount + 1} sections. Practise sustaining this note in one comfortable, continuous sound.`, result));
    }
    if (Number.isFinite(result.pitchStability) && result.pitchStability > 18) {
      candidates.push(observation("refinement", "stability", 106 + result.pitchStability, `Settle the middle of ${label}`, `The sustained pitch varied by about ${Math.round(result.pitchStability)} cents. Listen for one clear centre before adding finer expressive detail.`, result));
    }
  }

  const medianOnset = median(assessed.map((result) => result.initialError));
  if (Math.abs(medianOnset) > 12) {
    const matchingDirection = assessed.filter((result) => Math.sign(result.initialError) === Math.sign(medianOnset)).length;
    candidates.push(observation("refinement", "onset-pattern", 145, `A recurring ${direction(medianOnset)} entrance`, `${matchingDirection} of ${assessed.length} assessed notes began on the ${direction(medianOnset)} side. Hear the target internally before each entrance, then start directly on its centre.`, assessed.find((result) => Math.sign(result.initialError) === Math.sign(medianOnset))));
  }
  const fragmented = assessed.filter((result) => result.fragmentationCount > 0);
  if (fragmented.length >= 2) {
    candidates.push(observation("refinement", "fragmentation-pattern", 142, "Sustain longer notes as one sound", `${fragmented.length} notes contained a clear dropout. A comfortable breath before the phrase and steady airflow may help the sound continue.`, fragmented[0]));
  }
  const drifted = assessed.filter((result) => Math.abs(result.directionalDriftCents ?? 0) >= 14);
  if (drifted.length >= 2) {
    const averageDrift = mean(drifted.map((result) => result.directionalDriftCents));
    candidates.push(observation("refinement", "drift-pattern", 138, `Releases tend to move ${direction(averageDrift)}`, `${drifted.length} sustained notes moved noticeably toward the ${direction(averageDrift)} side near their release.`, drifted[0]));
  }

  const lowestDimension = Object.entries(profile.dimensions).sort((a, b) => a[1] - b[1])[0]?.[0];
  const nextSteps = {
    pitchAccuracy: ["Build the target one note at a time", `Pitch matching is the clearest next step: ${Math.round(profile.dimensions.pitchAccuracy)}% of usable samples were in the green zone. Use Assisted Assessment and practise slowly before joining the phrase.`],
    onsetAccuracy: ["Refine the first instant of each note", `Sustained singing is ahead of onset placement. Let the accompaniment establish the pitch, then make the first 150 ms as centred as the rest.`],
    sustainAccuracy: ["Keep the centre through the release", `The next gain is holding the same pitch centre from the middle of each note to its ending.`],
    pitchStability: ["Build one steady pitch", `For now, focus less on tiny cent differences and more on holding one comfortable, steady pitch from beginning to end.`],
    voicedCoverage: ["Keep the sound through the written value", `Reliable pitch covered ${Math.round(profile.dimensions.voicedCoverage)}% of the line. Practise at a slower tempo and sustain each note for its full written duration.`],
  };
  const [title, body] = nextSteps[lowestDimension] || nextSteps.pitchAccuracy;
  candidates.push(observation("refinement", "next-step", 170, title, body, ranked[0]));
  if (["foundation", "early-foundation"].includes(profile.level)) {
    candidates.push(observation("refinement", "assisted-practice", 155, "Use the guide as a stepping stone", "Choose Assisted Assessment, match one written note at a time, then remove the guide when the phrase feels familiar.", ranked[0]));
    candidates.push(observation("refinement", "slow-practice", 150, "Give each note more listening time", "Try 75% tempo first. Keep one steady pitch for the whole note, then return to full speed when the trace is more connected.", ranked[1] || ranked[0]));
  }
  return candidates;
}

function choose(candidates, count, tone) {
  const pool = candidates.filter((candidate) => candidate.tone === tone).sort((a, b) => b.priority - a.priority);
  const selected = [];
  const categoryUses = new Map();
  const noteUses = new Map();
  for (const candidate of pool) {
    if (selected.length >= count) break;
    const categoryLimit = selected.length < Math.ceil(count * 0.7) ? 1 : 2;
    if ((categoryUses.get(candidate.category) || 0) >= categoryLimit) continue;
    if (candidate.noteId && (noteUses.get(candidate.noteId) || 0) >= 2) continue;
    selected.push(candidate);
    categoryUses.set(candidate.category, (categoryUses.get(candidate.category) || 0) + 1);
    if (candidate.noteId) noteUses.set(candidate.noteId, (noteUses.get(candidate.noteId) || 0) + 1);
  }
  for (const candidate of pool) {
    if (selected.length >= count) break;
    if (selected.includes(candidate)) continue;
    selected.push(candidate);
  }
  return selected.slice(0, count);
}

function addGroundedFallbacks(positives, refinements, assessed, profile) {
  const ranked = [...assessed].sort((a, b) => quality(b) - quality(a));
  for (const [index, result] of ranked.entries()) {
    positives.push(observation(
      "positive",
      `grounded-positive-${index}`,
      45 - index,
      `A useful note to build from: ${noteLabel(result)}`,
      `This was among your clearest matches, with ${Math.round(result.inZonePercent)}% in the green zone and ${Math.round(result.voicedCoveragePercent)}% voiced coverage.`,
      result,
    ));
  }
  const weakest = [...assessed].sort((a, b) => quality(a) - quality(b));
  const fallbackBodies = [
    (result) => [`Revisit ${noteLabel(result)} slowly`, `Its average centre was ${signedMagnitude(result.averageError)}. Match the target first, then sustain that same pitch.`],
    (result) => [`Connect the full value in measure ${result.note.measureNumber}`, `The trace covered ${Math.round(result.voicedCoveragePercent)}% of this note; aim to keep one continuous sound to the release.`],
    (result) => [`Listen before ${noteLabel(result)}`, `The onset landed ${signedMagnitude(result.initialError)}. Pause, hear the target, then begin directly on it.`],
  ];
  for (let index = 0; index < 10; index += 1) {
    const result = weakest[index % weakest.length];
    const [title, body] = fallbackBodies[index % fallbackBodies.length](result);
    refinements.push(observation("refinement", `grounded-refinement-${index}`, 35 - index, title, body, result));
  }
  if (profile.level === "excellent") {
    refinements.push(observation("refinement", "fine-consistency", 80, "Turn accuracy into repeatable polish", `Your five-dimension score was ${Math.round(profile.score)}%. The next refinement is making the smallest onset and release adjustments consistent on every repetition.`, ranked[0]));
  }
}

export function buildCoachingFeedback(results) {
  const profile = summarisePerformance(results);
  const assessed = results.filter((result) => result.sampleCount > 0);
  if (!assessed.length) return { profile, observations: [] };
  const positives = positiveCandidates(assessed);
  const refinements = refinementCandidates(assessed, profile);
  addGroundedFallbacks(positives, refinements, assessed, profile);
  const balance = BALANCE[profile.level];
  const chosenPositive = choose(positives, balance.positive, "positive");
  const chosenRefinement = choose(refinements, balance.refinement, "refinement");
  const observations = [];
  const longest = Math.max(chosenPositive.length, chosenRefinement.length);
  for (let index = 0; index < longest; index += 1) {
    if (chosenPositive[index]) observations.push(chosenPositive[index]);
    if (chosenRefinement[index]) observations.push(chosenRefinement[index]);
  }
  return { profile, observations: observations.slice(0, 10) };
}
