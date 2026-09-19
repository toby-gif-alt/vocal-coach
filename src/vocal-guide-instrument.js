const DEFAULT_VOWEL = "ooh";
const DEFAULT_VOLUME = 70;
const MASTER_HEADROOM = 0.36;
const MIN_GAIN = 0.0001;

export const SAMPLE_FALLBACK_MESSAGE = "No custom voice samples installed — using synthetic vowel.";

export const VOWEL_PRESETS = Object.freeze({
  ooh: Object.freeze({
    label: "Ooh",
    attack: 0.045,
    release: 0.18,
    formants: Object.freeze([
      Object.freeze({ frequency: 300, bandwidth: 80, gain: 1.0 }),
      Object.freeze({ frequency: 870, bandwidth: 110, gain: 0.68 }),
      Object.freeze({ frequency: 2240, bandwidth: 180, gain: 0.34 }),
      Object.freeze({ frequency: 2800, bandwidth: 220, gain: 0.16 }),
    ]),
  }),
  oh: Object.freeze({
    label: "Oh",
    attack: 0.04,
    release: 0.17,
    formants: Object.freeze([
      Object.freeze({ frequency: 450, bandwidth: 90, gain: 1.0 }),
      Object.freeze({ frequency: 800, bandwidth: 100, gain: 0.74 }),
      Object.freeze({ frequency: 2830, bandwidth: 190, gain: 0.32 }),
      Object.freeze({ frequency: 3500, bandwidth: 260, gain: 0.12 }),
    ]),
  }),
  ah: Object.freeze({
    label: "Ah",
    attack: 0.035,
    release: 0.16,
    formants: Object.freeze([
      Object.freeze({ frequency: 750, bandwidth: 110, gain: 0.95 }),
      Object.freeze({ frequency: 1150, bandwidth: 130, gain: 0.78 }),
      Object.freeze({ frequency: 2900, bandwidth: 200, gain: 0.34 }),
      Object.freeze({ frequency: 3900, bandwidth: 280, gain: 0.1 }),
    ]),
  }),
});

const VOWEL_ALIASES = Object.freeze({
  oo: "ooh",
  u: "ooh",
  o: "oh",
  a: "ah",
});

// A glottal-like spectral slope keeps enough upper harmonics for fixed formants
// to remain audible at bass pitches without the raw buzz of a full sawtooth.
const HARMONIC_PARTIALS = Object.freeze(Array.from({ length: 32 }, (_, index) => 1 / ((index + 1) ** 0.88)));

export function midiToFrequency(midi) {
  const numericMidi = Number(midi);
  return Number.isFinite(numericMidi) ? 440 * (2 ** ((numericMidi - 69) / 12)) : NaN;
}

export function frequencyToMidi(frequency) {
  const numericFrequency = Number(frequency);
  return numericFrequency > 0 ? 69 + 12 * Math.log2(numericFrequency / 440) : NaN;
}

export function noteNameToMidi(noteName) {
  if (Number.isFinite(Number(noteName)) && String(noteName).trim() !== "") return Number(noteName);
  const match = /^([a-g])([#b]?)(-?\d+)$/i.exec(String(noteName || "").trim());
  if (!match) return NaN;
  const pitchClasses = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
  const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
  return (Number(match[3]) + 1) * 12 + pitchClasses[match[1].toLowerCase()] + accidental;
}

export function normaliseVowel(vowel) {
  const requested = String(vowel || DEFAULT_VOWEL).trim().toLowerCase();
  const resolved = VOWEL_ALIASES[requested] || requested;
  return VOWEL_PRESETS[resolved] ? resolved : DEFAULT_VOWEL;
}

export function getVowelPreset(vowel) {
  return VOWEL_PRESETS[normaliseVowel(vowel)];
}

export function clampVolume(value) {
  const numericValue = Number(value);
  return Math.max(0, Math.min(100, Number.isFinite(numericValue) ? numericValue : 0));
}

export function selectNearestSampleAnchor(targetMidi, anchors = []) {
  const target = Number(targetMidi);
  if (!Number.isFinite(target)) return null;
  return anchors
    .filter((anchor) => Number.isFinite(Number(anchor?.midi)))
    .reduce((nearest, anchor) => {
      if (!nearest) return anchor;
      const distance = Math.abs(Number(anchor.midi) - target);
      const nearestDistance = Math.abs(Number(nearest.midi) - target);
      return distance < nearestDistance || (distance === nearestDistance && Number(anchor.midi) < Number(nearest.midi))
        ? anchor
        : nearest;
    }, null);
}

function rawAudioContext(tone) {
  const toneContext = tone?.getContext?.() || tone?.context;
  const context = toneContext?.rawContext || toneContext;
  if (!context?.createGain || !context?.destination) {
    throw new Error("VocalGuideInstrument requires Tone.js with an active Web Audio context.");
  }
  return context;
}

function volumePercentToGain(percent) {
  if (percent <= 0) return 0;
  return MASTER_HEADROOM * ((percent / 100) ** 1.45);
}

function resolveUrl(baseUrl, path) {
  if (!baseUrl) return path;
  try {
    const documentBase = typeof document === "undefined" ? undefined : document.baseURI;
    const absoluteBase = documentBase ? new URL(baseUrl, documentBase) : new URL(baseUrl);
    return new URL(path, absoluteBase).href;
  } catch {
    return `${String(baseUrl).replace(/\/$/, "")}/${String(path).replace(/^\//, "")}`;
  }
}

function normaliseDescriptor(anchorName, value, baseUrl) {
  const descriptor = typeof value === "string" ? { url: value } : { ...(value || {}) };
  const midi = Number.isFinite(Number(descriptor.midi))
    ? Number(descriptor.midi)
    : Number.isFinite(Number(descriptor.rootMidi))
      ? Number(descriptor.rootMidi)
      : noteNameToMidi(anchorName);
  const url = descriptor.url ? resolveUrl(baseUrl, descriptor.url) : null;
  if (!Number.isFinite(midi) || (!url && !descriptor.buffer)) return null;
  return {
    midi,
    url,
    buffer: descriptor.buffer || null,
    gain: Number.isFinite(Number(descriptor.gain)) ? Math.max(0.25, Math.min(4, Number(descriptor.gain))) : 1,
    loop: descriptor.loop === false ? false : descriptor.loop === true ? true : "adaptive",
    loopStart: Number.isFinite(Number(descriptor.loopStart)) ? Number(descriptor.loopStart) : null,
    loopEnd: Number.isFinite(Number(descriptor.loopEnd)) ? Number(descriptor.loopEnd) : null,
  };
}

export function normaliseSamplePack(samples = {}, baseUrl = "") {
  if (!samples || typeof samples !== "object") return new Map();
  const keys = Object.keys(samples);
  const containsVowels = keys.some((key) => {
    const candidate = String(key).toLowerCase();
    return Object.hasOwn(VOWEL_PRESETS, candidate) || Object.hasOwn(VOWEL_ALIASES, candidate);
  });
  const vowelEntries = containsVowels ? samples : { ooh: samples };
  const result = new Map();

  for (const [vowelName, definitions] of Object.entries(vowelEntries)) {
    const vowel = normaliseVowel(vowelName);
    if (!definitions || typeof definitions !== "object") continue;
    const anchors = Object.entries(definitions)
      .map(([anchorName, value]) => normaliseDescriptor(anchorName, value, baseUrl))
      .filter(Boolean)
      .sort((left, right) => left.midi - right.midi);
    if (anchors.length) result.set(vowel, anchors);
  }
  return result;
}

function safeDisconnect(node) {
  try {
    node?.disconnect?.();
  } catch {
    // A node may already have been disconnected by its source's onended handler.
  }
}

function setAudioParam(param, value, time = null) {
  if (!param) return;
  if (time !== null && param.setValueAtTime) param.setValueAtTime(value, time);
  else param.value = value;
}

export class VocalGuideInstrument {
  constructor({
    tone = globalThis.Tone,
    mode = "vowel",
    vowel = DEFAULT_VOWEL,
    volume = DEFAULT_VOLUME,
    samples = {},
    sampleBaseUrl = "",
    fetcher = globalThis.fetch?.bind(globalThis),
    destination = null,
    onStatus = null,
  } = {}) {
    this.tone = tone;
    this.context = rawAudioContext(tone);
    this.mode = mode === "sampled" ? "sampled" : "vowel";
    this.vowel = normaliseVowel(vowel);
    this.volume = DEFAULT_VOLUME;
    this.sampleState = "unavailable";
    this.sampleError = null;
    this.sampleBaseUrl = sampleBaseUrl;
    this.fetcher = fetcher;
    this.onStatus = typeof onStatus === "function" ? onStatus : null;
    this.disposed = false;
    this.activeVoices = new Set();
    this.sampleDefinitions = new Map();
    this.sampleBuffers = new Map();
    this.sampleLoadGeneration = 0;
    this.sampleAbortController = null;

    this.masterGain = this.context.createGain();
    this.softener = this.context.createBiquadFilter();
    this.softener.type = "lowpass";
    setAudioParam(this.softener.frequency, 6200);
    setAudioParam(this.softener.Q, 0.45);

    this.compressor = this.context.createDynamicsCompressor?.() || null;
    if (this.compressor) {
      setAudioParam(this.compressor.threshold, -18);
      setAudioParam(this.compressor.knee, 12);
      setAudioParam(this.compressor.ratio, 3);
      setAudioParam(this.compressor.attack, 0.004);
      setAudioParam(this.compressor.release, 0.16);
      this.softener.connect(this.compressor);
      this.compressor.connect(this.masterGain);
    } else {
      this.softener.connect(this.masterGain);
    }
    this.masterGain.connect(destination || this.context.destination);

    this.periodicWave = this.createHarmonicWave();
    this.noiseBuffer = this.createNoiseBuffer();
    this.setVolume(volume);
    this.ready = this.loadSamples(samples, { baseUrl: sampleBaseUrl });
  }

  get effectiveMode() {
    return this.mode === "sampled" && (this.sampleBuffers.get(this.vowel)?.length || 0) > 0
      ? "sampled"
      : "vowel";
  }

  get activeVoiceCount() {
    return this.activeVoices.size;
  }

  getStatus() {
    let message = `Using synthetic ${getVowelPreset(this.vowel).label} vowel.`;
    if (this.mode === "sampled") {
      if (this.effectiveMode === "sampled") message = `Using sampled ${getVowelPreset(this.vowel).label} voice.`;
      else if (this.sampleState === "loading") message = "Loading custom voice samples — using synthetic vowel.";
      else message = SAMPLE_FALLBACK_MESSAGE;
    }
    return Object.freeze({
      mode: this.mode,
      effectiveMode: this.effectiveMode,
      vowel: this.vowel,
      volume: this.volume,
      sampleState: this.sampleState,
      message,
    });
  }

  emitStatus() {
    const status = this.getStatus();
    try {
      this.onStatus?.(status);
    } catch {
      // Status callbacks are informational and must never interrupt audio.
    }
    return status;
  }

  setMode(mode) {
    this.assertUsable();
    this.mode = mode === "sampled" ? "sampled" : "vowel";
    return this.emitStatus();
  }

  setVowel(vowel) {
    this.assertUsable();
    this.vowel = normaliseVowel(vowel);
    return this.emitStatus();
  }

  setVolume(value) {
    this.assertUsable();
    this.volume = clampVolume(value);
    setAudioParam(this.masterGain.gain, volumePercentToGain(this.volume), this.context.currentTime);
    return this.volume;
  }

  triggerAttackRelease(noteOrOptions, duration, time, velocity = 0.7) {
    this.assertUsable();
    const note = this.normaliseTrigger(noteOrOptions, duration, time, velocity);
    if (this.effectiveMode === "sampled") this.startSampledVoice(note);
    else this.startSyntheticVoice(note);
    return this;
  }

  releaseAll(time = this.now()) {
    if (this.disposed) return this;
    const releaseAt = Math.max(this.context.currentTime, this.toSeconds(time, this.now()));
    for (const voice of this.activeVoices) {
      const end = releaseAt + 0.065;
      const parameter = voice.envelope?.gain;
      parameter?.cancelScheduledValues?.(releaseAt);
      setAudioParam(parameter, Math.max(MIN_GAIN, Number(parameter?.value) || MIN_GAIN), releaseAt);
      parameter?.linearRampToValueAtTime?.(MIN_GAIN, end);
      for (const source of voice.sources) {
        try {
          source.stop(end + 0.015);
        } catch {
          // The source may already have ended naturally.
        }
      }
    }
    return this;
  }

  loadSamples(samples = {}, { baseUrl = this.sampleBaseUrl } = {}) {
    const promise = this.loadSamplesInternal(samples, baseUrl);
    this.ready = promise;
    return promise;
  }

  async loadSamplesInternal(samples, baseUrl) {
    this.assertUsable();
    const generation = ++this.sampleLoadGeneration;
    this.sampleAbortController?.abort?.();
    this.sampleAbortController = typeof AbortController === "undefined" ? null : new AbortController();
    this.sampleDefinitions = normaliseSamplePack(samples, baseUrl);
    this.sampleBuffers = new Map();
    this.sampleError = null;
    const definitions = [...this.sampleDefinitions.entries()].flatMap(([vowel, anchors]) => anchors.map((anchor) => ({ vowel, anchor })));

    if (!definitions.length || (!this.fetcher && !definitions.some(({ anchor }) => anchor.buffer))) {
      this.sampleState = "unavailable";
      return this.emitStatus();
    }

    this.sampleState = "loading";
    this.emitStatus();
    const results = await Promise.all(definitions.map(async ({ vowel, anchor }) => {
      try {
        const buffer = anchor.buffer || await this.fetchAndDecode(anchor.url, this.sampleAbortController?.signal);
        return { vowel, anchor: { ...anchor, buffer } };
      } catch (error) {
        return { error };
      }
    }));

    if (generation !== this.sampleLoadGeneration || this.disposed) return this.getStatus();
    let lastError = null;
    for (const result of results) {
      if (result.error) {
        lastError = result.error;
        continue;
      }
      if (!this.sampleBuffers.has(result.vowel)) this.sampleBuffers.set(result.vowel, []);
      this.sampleBuffers.get(result.vowel).push(result.anchor);
    }
    for (const anchors of this.sampleBuffers.values()) anchors.sort((left, right) => left.midi - right.midi);
    this.sampleState = this.sampleBuffers.size ? "ready" : "unavailable";
    this.sampleError = this.sampleBuffers.size ? null : lastError;
    return this.emitStatus();
  }

  async fetchAndDecode(url, signal) {
    if (!url || !this.fetcher) throw new Error("No sample loader is available.");
    const response = await this.fetcher(url, signal ? { signal } : undefined);
    if (!response?.ok) throw new Error(`Could not load vocal sample (${response?.status || "network error"}).`);
    const encoded = await response.arrayBuffer();
    return this.context.decodeAudioData(encoded.slice(0));
  }

  normaliseTrigger(noteOrOptions, duration, time, velocity) {
    const options = noteOrOptions && typeof noteOrOptions === "object"
      ? noteOrOptions
      : { frequency: noteOrOptions, duration, time, velocity };
    let midi = Number(options.midi);
    let frequency = Number(options.frequency);
    if (!Number.isFinite(midi) && typeof options.note === "string") midi = noteNameToMidi(options.note);
    if (!Number.isFinite(frequency) && Number.isFinite(midi)) frequency = midiToFrequency(midi);
    if (!Number.isFinite(midi) && frequency > 0) midi = frequencyToMidi(frequency);
    const noteDuration = this.toSeconds(options.duration, NaN);
    const noteTime = this.toSeconds(options.time, this.now());
    const noteVelocity = Math.max(0, Math.min(1, Number.isFinite(Number(options.velocity)) ? Number(options.velocity) : 0.7));
    if (!(frequency > 0) || !(noteDuration > 0) || !Number.isFinite(noteTime)) {
      throw new RangeError("A vocal guide note requires a valid MIDI pitch (or frequency), duration, and time.");
    }
    return {
      midi,
      frequency,
      duration: noteDuration,
      time: Math.max(this.context.currentTime, noteTime),
      velocity: noteVelocity,
    };
  }

  toSeconds(value, fallback) {
    if (Number.isFinite(Number(value)) && value !== "") return Number(value);
    try {
      const seconds = this.tone?.Time?.(value)?.toSeconds?.();
      if (Number.isFinite(seconds)) return seconds;
    } catch {
      // Fall through to the caller's explicit fallback.
    }
    return fallback;
  }

  now() {
    const toneNow = Number(this.tone?.now?.());
    return Number.isFinite(toneNow) ? toneNow : this.context.currentTime;
  }

  createHarmonicWave() {
    if (!this.context.createPeriodicWave) return null;
    const real = new Float32Array(HARMONIC_PARTIALS.length + 1);
    const imaginary = new Float32Array(HARMONIC_PARTIALS.length + 1);
    HARMONIC_PARTIALS.forEach((partial, index) => { imaginary[index + 1] = partial; });
    return this.context.createPeriodicWave(real, imaginary, { disableNormalization: false });
  }

  createNoiseBuffer() {
    if (!this.context.createBuffer) return null;
    const frameCount = Math.max(128, Math.round(this.context.sampleRate * 0.35));
    const buffer = this.context.createBuffer(1, frameCount, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;
    return buffer;
  }

  scheduleEnvelope(parameter, note, attack, release) {
    const attackDuration = Math.min(attack, Math.max(0.008, note.duration * 0.32));
    const releaseStart = note.time + note.duration;
    const releaseEnd = releaseStart + release;
    parameter.cancelScheduledValues?.(note.time);
    setAudioParam(parameter, MIN_GAIN, note.time);
    parameter.linearRampToValueAtTime?.(Math.max(MIN_GAIN, note.velocity), note.time + attackDuration);
    setAudioParam(parameter, Math.max(MIN_GAIN, note.velocity), releaseStart);
    parameter.linearRampToValueAtTime?.(MIN_GAIN, releaseEnd);
    return releaseEnd;
  }

  startSyntheticVoice(note) {
    const preset = getVowelPreset(this.vowel);
    const oscillator = this.context.createOscillator();
    if (this.periodicWave && oscillator.setPeriodicWave) oscillator.setPeriodicWave(this.periodicWave);
    else oscillator.type = "sawtooth";
    setAudioParam(oscillator.frequency, note.frequency, note.time);

    const envelope = this.context.createGain();
    setAudioParam(envelope.gain, MIN_GAIN);
    const nodes = [oscillator, envelope];

    for (const formant of preset.formants) {
      const filter = this.context.createBiquadFilter();
      filter.type = "bandpass";
      setAudioParam(filter.frequency, formant.frequency);
      setAudioParam(filter.Q, formant.frequency / formant.bandwidth);
      const formantGain = this.context.createGain();
      setAudioParam(formantGain.gain, formant.gain);
      oscillator.connect(filter);
      filter.connect(formantGain);
      formantGain.connect(envelope);
      nodes.push(filter, formantGain);
    }

    const bodyFilter = this.context.createBiquadFilter();
    bodyFilter.type = "lowpass";
    setAudioParam(bodyFilter.frequency, 980);
    setAudioParam(bodyFilter.Q, 0.7);
    const bodyGain = this.context.createGain();
    setAudioParam(bodyGain.gain, 0.09);
    oscillator.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(envelope);
    nodes.push(bodyFilter, bodyGain);

    const sources = [oscillator];
    if (this.noiseBuffer && this.context.createBufferSource) {
      const breath = this.context.createBufferSource();
      breath.buffer = this.noiseBuffer;
      breath.loop = true;
      const breathFilter = this.context.createBiquadFilter();
      breathFilter.type = "bandpass";
      setAudioParam(breathFilter.frequency, 3100);
      setAudioParam(breathFilter.Q, 0.8);
      const breathGain = this.context.createGain();
      setAudioParam(breathGain.gain, 0.018);
      breath.connect(breathFilter);
      breathFilter.connect(breathGain);
      breathGain.connect(envelope);
      sources.push(breath);
      nodes.push(breath, breathFilter, breathGain);
    }

    envelope.connect(this.softener);
    const releaseEnd = this.scheduleEnvelope(envelope.gain, note, preset.attack, preset.release);
    const voice = this.registerVoice({ sources, envelope, nodes });
    for (const source of sources) {
      source.start(note.time);
      source.stop(releaseEnd + 0.025);
    }
    oscillator.onended = () => this.cleanupVoice(voice);
  }

  startSampledVoice(note) {
    const anchor = selectNearestSampleAnchor(note.midi, this.sampleBuffers.get(this.vowel));
    if (!anchor?.buffer) {
      this.startSyntheticVoice(note);
      return;
    }
    const playbackRate = 2 ** ((note.midi - anchor.midi) / 12);
    const envelope = this.context.createGain();
    setAudioParam(envelope.gain, MIN_GAIN);
    const sampleGain = this.context.createGain();
    setAudioParam(sampleGain.gain, anchor.gain);
    sampleGain.connect(envelope);
    envelope.connect(this.softener);
    const releaseEnd = this.scheduleEnvelope(envelope.gain, note, 0.025, 0.16);
    const naturalDuration = anchor.buffer.duration / playbackRate;
    const needsSustain = note.duration > naturalDuration - 0.02;
    const canExtend = anchor.loop !== false && anchor.buffer.duration > 0.25;
    const sources = [];
    const nodes = [sampleGain, envelope];

    const addSource = ({ start, offset = 0, stop, fadeIn = 0, fadeOut = 0 }) => {
      const source = this.context.createBufferSource();
      source.buffer = anchor.buffer;
      setAudioParam(source.playbackRate, playbackRate, start);
      const segmentGain = this.context.createGain();
      setAudioParam(segmentGain.gain, fadeIn > 0 ? MIN_GAIN : 1, start);
      if (fadeIn > 0) segmentGain.gain.linearRampToValueAtTime?.(1, start + fadeIn);
      if (fadeOut > 0) {
        setAudioParam(segmentGain.gain, 1, Math.max(start + fadeIn, stop - fadeOut));
        segmentGain.gain.linearRampToValueAtTime?.(MIN_GAIN, stop);
      }
      source.connect(segmentGain);
      segmentGain.connect(sampleGain);
      source.start(start, offset);
      source.stop(stop + 0.02);
      sources.push(source);
      nodes.push(source, segmentGain);
      return source;
    };

    if (!needsSustain || !canExtend) {
      addSource({ start: note.time, stop: releaseEnd + 0.005 });
    } else {
      const sourceLoopStart = Math.max(0.08, Math.min(anchor.buffer.duration - 0.18, anchor.loopStart ?? anchor.buffer.duration * 0.58));
      const sourceLoopEnd = Math.max(sourceLoopStart + 0.12, Math.min(anchor.buffer.duration - 0.03, anchor.loopEnd ?? anchor.buffer.duration * 0.9));
      const loopDuration = (sourceLoopEnd - sourceLoopStart) / playbackRate;
      const crossfade = Math.min(0.055, Math.max(0.018, loopDuration * 0.14));
      let handoff = note.time + sourceLoopEnd / playbackRate;
      addSource({ start: note.time, stop: handoff, fadeOut: crossfade });

      while (handoff < releaseEnd) {
        const start = handoff - crossfade;
        const naturalStop = start + loopDuration;
        const stop = Math.min(naturalStop, releaseEnd + crossfade);
        addSource({ start, offset: sourceLoopStart, stop, fadeIn: crossfade, fadeOut: naturalStop < releaseEnd ? crossfade : 0 });
        if (naturalStop <= handoff) break;
        handoff = naturalStop;
      }
    }

    const voice = this.registerVoice({ sources, envelope, nodes });
    const finalSource = sources.at(-1);
    if (finalSource) finalSource.onended = () => this.cleanupVoice(voice);
  }

  registerVoice(voice) {
    this.activeVoices.add(voice);
    return voice;
  }

  cleanupVoice(voice) {
    if (!this.activeVoices.delete(voice)) return;
    for (const node of voice.nodes) safeDisconnect(node);
  }

  assertUsable() {
    if (this.disposed) throw new Error("VocalGuideInstrument has been disposed.");
  }

  dispose() {
    if (this.disposed) return;
    this.sampleLoadGeneration += 1;
    this.sampleAbortController?.abort?.();
    for (const voice of this.activeVoices) {
      for (const source of voice.sources) {
        source.onended = null;
        try {
          source.stop(this.context.currentTime);
        } catch {
          // The source may already have ended.
        }
      }
      for (const node of voice.nodes) safeDisconnect(node);
    }
    this.activeVoices.clear();
    safeDisconnect(this.softener);
    safeDisconnect(this.compressor);
    safeDisconnect(this.masterGain);
    this.sampleBuffers.clear();
    this.sampleDefinitions.clear();
    this.onStatus = null;
    this.disposed = true;
  }
}
