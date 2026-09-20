import { SALAMANDER_PIANO_SAMPLES } from "./piano-sample-pack.js?v=24";

const MIN_GAIN = 0.0001;
const RELEASE_SECONDS = 0.34;

function rawAudioContext(tone) {
  const toneContext = tone?.getContext?.() || tone?.context;
  const context = toneContext?.rawContext || toneContext;
  if (!context?.createGain || !context?.createBufferSource || !context?.destination) {
    throw new Error("Sampled piano requires Tone.js with an active Web Audio context.");
  }
  return context;
}

function resolveUrl(path) {
  try {
    return new URL(path, document.baseURI).href;
  } catch {
    return path;
  }
}

function clampVolume(value) {
  const numeric = Number(value);
  return Math.max(0, Math.min(100, Number.isFinite(numeric) ? numeric : 0));
}

function volumeToGain(percent) {
  return percent <= 0 ? 0 : 0.48 * ((percent / 100) ** 1.35);
}

function setAudioParam(parameter, value, time = null) {
  if (!parameter) return;
  if (time !== null && parameter.setValueAtTime) parameter.setValueAtTime(value, time);
  else parameter.value = value;
}

function safeDisconnect(node) {
  try {
    node?.disconnect?.();
  } catch {
    // The source may already have disconnected after ending naturally.
  }
}

export function selectNearestPianoSample(targetMidi, samples = []) {
  const target = Number(targetMidi);
  if (!Number.isFinite(target)) return null;
  return samples.reduce((nearest, sample) => {
    if (!nearest) return sample;
    const distance = Math.abs(Number(sample.midi) - target);
    const nearestDistance = Math.abs(Number(nearest.midi) - target);
    return distance < nearestDistance || (distance === nearestDistance && sample.midi < nearest.midi)
      ? sample
      : nearest;
  }, null);
}

export class SampledPianoLibrary {
  constructor({
    tone = globalThis.Tone,
    samples = SALAMANDER_PIANO_SAMPLES,
    fetcher = globalThis.fetch?.bind(globalThis),
    bufferCache = new Map(),
  } = {}) {
    this.tone = tone;
    this.context = rawAudioContext(tone);
    this.samples = samples.map((sample) => ({ ...sample, url: resolveUrl(sample.url) }));
    this.fetcher = fetcher;
    this.bufferCache = bufferCache;
    this.loadedSamples = [];
    this.ready = this.load();
  }

  async loadBuffer(sample) {
    if (sample.buffer) return sample.buffer;
    if (!sample.url || !this.fetcher) throw new Error("No piano sample loader is available.");
    if (!this.bufferCache.has(sample.url)) {
      const load = (async () => {
        const response = await this.fetcher(sample.url);
        if (!response?.ok) throw new Error(`Could not load piano sample (${response?.status || "network error"}).`);
        const encoded = await response.arrayBuffer();
        return this.context.decodeAudioData(encoded.slice(0));
      })();
      this.bufferCache.set(sample.url, load);
      load.catch(() => this.bufferCache.delete(sample.url));
    }
    return this.bufferCache.get(sample.url);
  }

  async load() {
    const results = await Promise.allSettled(this.samples.map(async (sample) => ({
      ...sample,
      buffer: await this.loadBuffer(sample),
    })));
    this.loadedSamples = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value)
      .sort((left, right) => left.midi - right.midi);
    if (!this.loadedSamples.length) throw new Error("The sampled piano could not be loaded.");
    return this.loadedSamples;
  }

  nearest(targetMidi) {
    return selectNearestPianoSample(targetMidi, this.loadedSamples);
  }
}

export class SampledPianoInstrument {
  constructor({ tone = globalThis.Tone, library, volume = 70, destination = null } = {}) {
    if (!library) throw new Error("SampledPianoInstrument requires a shared sample library.");
    this.tone = tone;
    this.context = rawAudioContext(tone);
    this.library = library;
    this.ready = library.ready;
    this.activeVoices = new Set();
    this.disposed = false;
    this.masterGain = this.context.createGain();
    this.masterGain.connect(destination || this.context.destination);
    this.setVolume(volume);
  }

  setVolume(value) {
    if (this.disposed) return 0;
    this.volume = clampVolume(value);
    setAudioParam(this.masterGain.gain, volumeToGain(this.volume), this.context.currentTime);
    return this.volume;
  }

  toSeconds(value, fallback) {
    if (Number.isFinite(Number(value)) && value !== "") return Number(value);
    try {
      const seconds = this.tone?.Time?.(value)?.toSeconds?.();
      if (Number.isFinite(seconds)) return seconds;
    } catch {
      // Use the explicit fallback below.
    }
    return fallback;
  }

  triggerAttackRelease(noteOrOptions, duration, time, velocity = 0.7) {
    if (this.disposed) throw new Error("SampledPianoInstrument has been disposed.");
    const options = noteOrOptions && typeof noteOrOptions === "object"
      ? noteOrOptions
      : { midi: noteOrOptions, duration, time, velocity };
    const midi = Number(options.midi);
    const noteDuration = this.toSeconds(options.duration, NaN);
    const noteTime = Math.max(this.context.currentTime, this.toSeconds(options.time, this.context.currentTime));
    const noteVelocity = Math.max(0, Math.min(1, Number(options.velocity) || 0));
    const anchor = this.library.nearest(midi);
    if (!anchor?.buffer || !Number.isFinite(midi) || !(noteDuration > 0)) return this;

    const source = this.context.createBufferSource();
    source.buffer = anchor.buffer;
    source.loop = false;
    setAudioParam(source.playbackRate, 2 ** ((midi - anchor.midi) / 12), noteTime);
    const envelope = this.context.createGain();
    setAudioParam(envelope.gain, Math.max(MIN_GAIN, noteVelocity), noteTime);
    const releaseAt = noteTime + noteDuration;
    setAudioParam(envelope.gain, Math.max(MIN_GAIN, noteVelocity), releaseAt);
    envelope.gain.exponentialRampToValueAtTime?.(MIN_GAIN, releaseAt + RELEASE_SECONDS);
    source.connect(envelope);
    envelope.connect(this.masterGain);
    const voice = { source, envelope };
    this.activeVoices.add(voice);
    source.onended = () => {
      this.activeVoices.delete(voice);
      safeDisconnect(source);
      safeDisconnect(envelope);
    };
    source.start(noteTime);
    source.stop(releaseAt + RELEASE_SECONDS + 0.03);
    return this;
  }

  releaseAll(time = this.context.currentTime) {
    if (this.disposed) return this;
    const releaseAt = Math.max(this.context.currentTime, this.toSeconds(time, this.context.currentTime));
    for (const voice of this.activeVoices) {
      voice.envelope.gain.cancelScheduledValues?.(releaseAt);
      setAudioParam(voice.envelope.gain, Math.max(MIN_GAIN, Number(voice.envelope.gain.value) || MIN_GAIN), releaseAt);
      voice.envelope.gain.exponentialRampToValueAtTime?.(MIN_GAIN, releaseAt + 0.08);
      try {
        voice.source.stop(releaseAt + 0.1);
      } catch {
        // The recording may already have reached its natural end.
      }
    }
    return this;
  }

  dispose() {
    if (this.disposed) return;
    this.releaseAll(this.context.currentTime);
    for (const voice of this.activeVoices) {
      voice.source.onended = null;
      safeDisconnect(voice.source);
      safeDisconnect(voice.envelope);
    }
    this.activeVoices.clear();
    safeDisconnect(this.masterGain);
    this.disposed = true;
  }
}
