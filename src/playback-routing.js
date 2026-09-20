const VOCAL_PART_NAME = /\b(?:voice|vocal|vocals|singer|choir|choral|chorus|soprano|mezzo(?:[-\s]+soprano)?|alto|contralto|countertenor|tenor|baritone|bass)\b/i;
const PIANO_PART_NAME = /\b(?:piano|pianoforte|keyboards?|keys|grand piano|electric piano)\b/i;

export function classifyPlaybackPart(part = {}) {
  const label = `${part.name || ""} ${part.abbreviation || ""}`.trim();
  if (VOCAL_PART_NAME.test(label)) return "vocal";
  if (PIANO_PART_NAME.test(label)) return "piano";
  return "instrument";
}

export function playbackRoutes(parts = [], { vocalPartId, guideEnabled, enabledPartIds = [] } = {}) {
  const enabled = enabledPartIds instanceof Set ? enabledPartIds : new Set(enabledPartIds || []);
  return parts.flatMap((part) => {
    const classification = classifyPlaybackPart(part);
    if (part?.id === vocalPartId) return guideEnabled ? [{ part, role: "guide", classification }] : [];
    return enabled.has(part?.id) ? [{ part, role: "accompaniment", classification }] : [];
  });
}
