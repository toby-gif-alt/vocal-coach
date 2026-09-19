# Vocal guide instrument

`VocalGuideInstrument` is the isolated sound module behind the Vocal Coach melody guide. It has no dependencies on score rendering, microphone input, pitch tracking, or coaching. The normal studio uses it for Human voice and Synthetic Ah playback; the standalone [`vocal-guide-demo.html`](../vocal-guide-demo.html) page remains a developer audition surface.

## Synthetic vowel mode

```js
import { VocalGuideInstrument } from "./src/vocal-guide-instrument.js";

const guide = new VocalGuideInstrument({
  tone: window.Tone,
  mode: "vowel",
  vowel: "ooh",
});

guide.triggerAttackRelease({
  midi: 60,
  duration: 1.0,
  time: window.Tone.now(),
  velocity: 0.7,
});

guide.setVowel("ah");
guide.setVolume(70);
guide.releaseAll();
guide.dispose();
```

The instrument accepts `ooh`, `oh`, and `ah`. A harmonic source passes through several parallel, fixed-frequency band-pass filters plus a quiet breath component and gentle output filtering. Note pitch changes the fundamental and its harmonics; it does **not** move the formant centre frequencies. That fixed-formant structure is the important difference between a vowel-like guide and merely changing the oscillator used by a normal synth.

The amplitude envelope keeps its sustain level for the whole requested duration, then applies a short release. Consecutive scheduled notes overlap slightly through their releases, which makes guide phrases less clicky and more legato-like. The implementation is polyphonic and the output compressor provides headroom for chord playback.

For an easy later integration, object-style calls are preferred, but the module also accepts Tone-style positional calls where the first argument is a frequency:

```js
vocalGuide.triggerAttackRelease(frequency, duration, time, velocity);
```

This means the current scheduling call can be replaced first, then migrated to `{ midi, duration, time, velocity }` when convenient. Tone time expressions such as transport ticks are converted with `Tone.Time(...).toSeconds()`.

## Sampled teacher-voice mode

Sample packs can use any number of arbitrary anchor pitches. There is no fixed range requirement:

```js
const teacherVoice = {
  ooh: {
    C2: "ooh/C2.wav",
    G2: "ooh/G2.wav",
    C3: "ooh/C3.wav",
    G3: { url: "ooh/G3.wav", loopStart: 0.72, loopEnd: 2.64 },
    C4: "ooh/C4.wav",
    G4: "ooh/G4.wav",
  },
  oh: {
    C3: "oh/C3.wav",
    C4: "oh/C4.wav",
  },
  ah: {
    C3: "ah/C3.wav",
    C4: "ah/C4.wav",
  },
};

const guide = new VocalGuideInstrument({
  tone: window.Tone,
  mode: "sampled",
  vowel: "ooh",
  samples: teacherVoice,
  sampleBaseUrl: "./samples/vocal-guide/",
  onStatus: (status) => console.log(status.message),
});

await guide.ready;
```

For each requested note, the engine selects the loaded anchor with the smallest semitone distance and adjusts its playback rate. Playback starts at the recording's natural beginning and does not loop when the decoded source is long enough for the musical note and its release. A short gain-envelope release avoids clicks. Only longer notes extend the stable late sustain; overlapping source segments crossfade without repeating the attack. Optional `loopStart` and `loopEnd` values, measured in seconds, can identify that stable region.

If no pack is configured, a pack cannot load, or the chosen vowel has no usable anchors, playback falls back to the synthetic vowel engine. `getStatus()` and `onStatus` expose the active mode and the user-facing fallback message.

Large sample transpositions move the recorded formants along with the fundamental and can sound unnatural. Closely spaced anchors reduce that effect. A future formant-preserving pitch shifter could improve wide-range use without requiring as many recordings.

## Generated male and female production banks

Place sustained-Ah MP3s in `samples/vocal-guide/male/` and `samples/vocal-guide/female/`. Filenames are parsed as root pitches; `Fs3` and `F#3` both mean F sharp, and flat spellings such as `Gb3` are also supported. Run:

```sh
npm run assets
```

The generated `samples/vocal-guide/index.json` is the production source of truth. Explicit part names such as Tenor, Bass, Alto, Mezzo-Soprano, or Soprano select a bank. Generic part names use the actual sounding MIDI distribution and choose the bank requiring the least median/average pitch shift. Bank selection never changes the requested `note.midi`.

## Included Martin demo pack

The standalone demo uses five real sung-note anchors from the MIT-licensed [`vocobox/human-voice-dataset`](https://github.com/vocobox/human-voice-dataset/tree/77248fc69fd93c40a69d49c0cade4144c5d7a9f4/data/voices/martin/notes/exports/mono). The production studio does not load this pack.

| File | Root MIDI |
| --- | ---: |
| `C3.wav` | 48 |
| `E3.wav` | 52 |
| `F3.wav` | 53 |
| `B3.wav` | 59 |
| `A4.wav` | 69 |

The recordings are mapped to the instrument's `ah` bank because the upstream note series uses its base `a` vowel. For every requested pitch, the engine chooses the closest root MIDI before changing playback rate. This keeps transposition as small as the available anchors allow. The pack deliberately has no G3 recording: F3 supplies F♯3 / G♭3 and G3 at +1 and +2 semitones. Playback begins at the original onset, uses hand-picked loop points in each recording's stable middle for long notes, and ends through a short gain-envelope release.

The studio presents **Human voice** as its default and **Synthetic Ah** as its only alternative. The demo uses the labels **Real human voice** and **Synthetic Ah**. If its selected generated bank cannot load, the studio reports that Synthetic Ah is being used. Exact demo-pack provenance, checksums, and the preserved MIT license are in [`samples/vocal-guide/martin/`](../samples/vocal-guide/martin/).

## Creating a custom teacher voice pack

A future **Create my guide voice** flow can guide a teacher through these steps:

1. Choose a quiet room and a comfortable vowel such as **Ooh**.
2. Record several steady, unaccompanied notes across the teacher's usable range. C2 / G2 / C3 / G3 / C4 / G4 is one possible pattern, not a required set; the pack can contain any named or numeric MIDI anchors.
3. Hold each pitch for roughly three to five seconds with a clean onset, stable middle, and natural release.
4. Trim silence and background noise without removing the onset. Match loudness gently across files.
5. Mark loop points in the stable middle of each recording when possible.
6. Export browser-friendly WAV files and build the pitch-to-file map shown above.

A sensible repository layout is:

```text
samples/vocal-guide/
  ooh/
    C3.wav
    G3.wav
    C4.wav
    G4.wav
  oh/
    C3.wav
    C4.wav
  ah/
    C3.wav
    C4.wav
```

Recordings should remain local/browser-served unless the teacher explicitly chooses another storage workflow. The included Martin files are an audition reference only; they are not a production voice or a recording of the teacher.

## Sung lyrics are separate future work

MusicXML lyric parsing is comparatively straightforward: syllables and their note associations are structured score data. Producing intelligible sung words at exact pitches and durations is a much larger synthesis problem. It needs phoneme timing, consonant/vowel transitions, syllable alignment, and either a singing-synthesis model or a carefully designed concatenative sample system.

Ordinary browser `SpeechSynthesis` is not a substitute because it cannot accurately follow a score's melody and note durations. This instrument therefore produces sustained vowel guides only; it does not attempt text-to-singing.

## Integration boundary

`AudioEngine` owns one dedicated `VocalGuideInstrument`, forwards guide volume, releases it on pause/stop/restart/review stop, and disposes it during synth teardown. Each scheduled vocal note passes the sounding `note.midi` produced by the MusicXML parser directly to the instrument. Singer-octave selection remains confined to microphone, tuner, and assessment targets and never transposes guide playback. The instrument stays independent from microphone analysis, score parsing/rendering, assessment, and coach feedback.
