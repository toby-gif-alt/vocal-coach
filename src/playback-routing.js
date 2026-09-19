export function playbackRoutes(parts = [], { vocalPartId, guideEnabled, enabledPartIds = [] } = {}) {
  const enabled = enabledPartIds instanceof Set ? enabledPartIds : new Set(enabledPartIds || []);
  return parts.flatMap((part) => {
    if (part?.id === vocalPartId) return guideEnabled ? [{ part, role: "guide" }] : [];
    return enabled.has(part?.id) ? [{ part, role: "accompaniment" }] : [];
  });
}
