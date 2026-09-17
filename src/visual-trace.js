import { SCORE_TRACE_CONFIG } from "./config.js?v=20";

function compatible(previous, current, config) {
  return previous?.targetId === current?.targetId
    && Number.isFinite(previous?.cents)
    && Number.isFinite(current?.cents)
    && Math.abs(current.cents - previous.cents) <= config.maximumBridgeCents;
}

export function appendAcceptedVisualSample(samples, accepted, config = SCORE_TRACE_CONFIG) {
  const reliable = [...samples].reverse().find((sample) => !sample.visualOnly);
  const withoutHeldTail = reliable
    ? samples.slice(0, samples.lastIndexOf(reliable) + 1)
    : [];
  if (!reliable || !compatible(reliable, accepted, config)) return [...withoutHeldTail, { ...accepted, visualOnly: false }];
  const gapMs = accepted.capturedAt - reliable.capturedAt;
  if (!(gapMs > config.visualSampleIntervalMs && gapMs <= config.visualContinuityMs)) {
    return [...withoutHeldTail, { ...accepted, visualOnly: false }];
  }
  const interpolated = [];
  for (let elapsed = config.visualSampleIntervalMs; elapsed < gapMs; elapsed += config.visualSampleIntervalMs) {
    const progress = elapsed / gapMs;
    interpolated.push({
      ...reliable,
      capturedAt: reliable.capturedAt + elapsed,
      scoreQuarter: reliable.scoreQuarter + (accepted.scoreQuarter - reliable.scoreQuarter) * progress,
      scoreSeconds: reliable.scoreSeconds + (accepted.scoreSeconds - reliable.scoreSeconds) * progress,
      midi: reliable.midi + (accepted.midi - reliable.midi) * progress,
      cents: reliable.cents + (accepted.cents - reliable.cents) * progress,
      visualOnly: true,
      interpolated: true,
      opacity: 0.72,
    });
  }
  return [...withoutHeldTail, ...interpolated, { ...accepted, visualOnly: false }];
}

export function appendVisualHold(samples, diagnostic, target, config = SCORE_TRACE_CONFIG) {
  const reliable = [...samples].reverse().find((sample) => !sample.visualOnly);
  if (!reliable || !target || reliable.targetId !== target.id || diagnostic.clipped) return samples;
  const ageMs = diagnostic.capturedAt - reliable.capturedAt;
  if (!(ageMs > 0 && ageMs <= config.visualContinuityMs) || !diagnostic.voiceEstablished) return samples;
  if (!(diagnostic.rms >= diagnostic.continuationGateThreshold)) return samples;
  const last = samples.at(-1);
  if (last?.visualOnly && diagnostic.capturedAt - last.capturedAt < config.visualSampleIntervalMs * 0.7) return samples;
  return [...samples, {
    ...reliable,
    capturedAt: diagnostic.capturedAt,
    scoreQuarter: diagnostic.scoreQuarter,
    scoreSeconds: diagnostic.scoreSeconds,
    visualOnly: true,
    held: true,
    opacity: Math.max(0.16, 0.7 * (1 - ageMs / config.visualContinuityMs)),
  }];
}
