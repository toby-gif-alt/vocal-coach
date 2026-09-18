// Real sung-note anchors from vocobox/human-voice-dataset (MIT).
// See samples/vocal-guide/martin/README.md for provenance and checksums.
// The source note series is sung on its base "a" vowel, so it is mapped to
// the instrument's Ah bank. Loop points are matched positive-going zero
// crossings in stable regions; starting each buffer at zero preserves the
// original recorded attack before playback enters the loop.
export const MARTIN_HUMAN_VOICE_PACK = Object.freeze({
  ah: Object.freeze({
    C3: Object.freeze({ url: "C3.wav", midi: 48, gain: 2.0, loopStart: 0.326485, loopEnd: 0.740431 }),
    E3: Object.freeze({ url: "E3.wav", midi: 52, gain: 0.83, loopStart: 0.511361, loopEnd: 0.721587 }),
    G3: Object.freeze({ url: "G3.wav", midi: 55, gain: 1.08, loopStart: 0.334467, loopEnd: 0.890930 }),
    B3: Object.freeze({ url: "B3.wav", midi: 59, gain: 1.05, loopStart: 0.335578, loopEnd: 0.617120 }),
    A4: Object.freeze({ url: "A4.wav", midi: 69, gain: 0.76, loopStart: 0.345079, loopEnd: 0.759252 }),
  }),
});

export const MARTIN_HUMAN_VOICE_BASE_URL = "./samples/vocal-guide/martin/";
