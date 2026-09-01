# Vocal Coach

Vocal Coach is a static, browser-based prototype for practising a vocal part directly from a MusicXML score. It separates the selected vocal line from accompaniment data, renders conventional staff notation, synthesizes score playback, follows the score with a cursor, and compares stabilised microphone pitch samples with the expected sounding note.

No account, backend, upload service, or build step is required. Score files and microphone data remain in browser memory.

## Prototype flow

1. Upload `.musicxml`, `.xml`, or compressed `.mxl`.
2. Review every detected score part and select **I am singing this part**.
3. View the selected part by itself or switch to the full score.
4. Choose **Practice** (guide + accompaniment, no scoring), **Assisted Assessment** (guide + accompaniment + scoring), or **Assessment** (accompaniment + scoring).
5. Choose an Off/1-bar/2-bar musical count-in and, when needed, sing an octave below or above the untouched printed notation.
6. Balance separate Vocal Guide and Accompaniment volume controls, then review the stabilised colour-coded pitch trace and note-level measurements.

A small two-part MusicXML score is included so the complete flow can be tried immediately.

## Architecture

The app deliberately keeps musical concerns separate:

- `src/musicxml.js` reads MusicXML/MXL, detects parts, and builds independent note timelines. Each note includes written pitch, MIDI pitch, frequency, onset, duration, measure, beat, voice/staff, and tie data.
- `src/timing.js` defines the exact bridge between Tone.Transport quarter notes and OSMD whole-note-fraction timestamps, applies MusicXML backup/forward/chord measure timing, and derives simple or compound-meter count-in pulses.
- `src/audio-engine.js` owns Tone.js transport scheduling, gain-controlled accompaniment/guide synthesizers, count-in clicks outside score time, microphone calibration, the RMS noise gate, and raw Pitchy samples.
- `src/noise-gate.js` measures RMS amplitude, derives a room-aware threshold for Low/Normal/High sensitivity, and applies gate hysteresis before pitch detection.
- `src/pitch-tracker.js` keeps raw detector history, corroborates octave ambiguities, rejects isolated jumps, applies a short robust median, and returns either a stabilised fundamental or an explicit no-reliable-pitch state.
- `src/analysis.js` groups usable samples by target note and derives initial, average, settling, sustained, and in-tolerance measurements.
- `src/config.js` contains pitch thresholds and audio-analysis settings so today’s placeholder tolerances can be replaced without changing the assessment code.
- `app.js` coordinates the views, OpenSheetMusicDisplay renderer/cursor, controls, pitch monitor, trace, and results table.

Raw and accepted timestamped pitch samples are kept separately in memory. The tracker uses the target only as supporting evidence in an octave ambiguity and never snaps a performance to the expected note. This preserves genuine wrong notes, scoops, slides, and small movements for future analysis.

## Libraries

Dependencies are pinned and loaded from jsDelivr so this repository can remain build-free:

- [OpenSheetMusicDisplay 2.1.2](https://github.com/opensheetmusicdisplay/opensheetmusicdisplay) — MusicXML parsing and staff notation rendering
- [Tone.js 15.1.22](https://github.com/Tonejs/Tone.js) — Web Audio synthesis, scheduling, and transport
- [Pitchy 4.1.0](https://github.com/ianprime0509/pitchy) — McLeod Pitch Method fundamental-frequency detection
- [JSZip 3.10.1](https://github.com/Stuk/jszip) — compressed MusicXML (`.mxl`) extraction

The app itself uses ordinary HTML, CSS, and ES modules.

## Run locally

Microphone access and ES modules require the files to be served over HTTP rather than opened directly from disk.

```sh
python3 -m http.server 8080
```

Open `http://localhost:8080` and choose **Try the sample score**.

An internet connection is currently required to load the four pinned browser libraries. No score or microphone data is sent to those services.

## Checks

The dependency-free Node test suite covers generated harmonic A3/C4/A4/C5 tones, octave-error correction, wrong-note preservation, short-window movement, pitch conversion and colour boundaries, count-in meters, note-level analysis, Tone/OSMD time conversion, pickup and multi-staff MusicXML timing, RMS gating, empty-sample handling, and GitHub Pages asset paths. Run the full syntax and regression check with Node 20 or newer:

```sh
npm run check
```

For cursor diagnostics, add `?debugTiming=1` to the app URL. The console then logs:

```text
transport quarter | OSMD timestamp | measure | expected note
```

Tone.Transport remains the playback clock. OSMD timestamps are whole-note fractions, so the app converts one transport quarter to `0.25` OSMD time before advancing the notation cursor.

For detector diagnostics, open the collapsed **Pitch-detector diagnostics** panel or add `?debugPitch=1` to open it automatically. It shows raw/filtered Hz and MIDI, clarity, RMS, sounding target, cents error, reliability state, and an isolated-tone browser self-test.

## Deploy to GitHub Pages

The included `.github/workflows/pages.yml` deploys the repository root whenever `main` changes. In the repository settings, select **GitHub Actions** as the Pages source if it is not selected automatically.

All app and sample-score paths are relative, so the site works at a project URL such as `https://username.github.io/vocal-coach/`. GitHub Pages supplies the HTTPS context required for microphone access.

## Browser support and limitations

- Current Chrome, Edge, Firefox, and Safari releases with Web Audio and `getUserMedia` are the target. Microphone behaviour varies by device and browser.
- Headphones are strongly recommended in both assessment modes and especially when the vocal guide is active. Browser echo cancellation helps reduce speaker recapture, but headphones are the reliable way to prevent the guide from influencing microphone scoring.
- Assessment calibrates ambient noise for about one second before playback. Low sensitivity rejects more room sound, Normal is the default, and High permits quieter singing; both the calibrated RMS gate and Pitchy clarity threshold must pass before a sample is stored.
- Pitch analysis uses a 4096-sample window. Individual detector frames are not scored directly: RMS, clarity, continuity, harmonic/octave evidence, jump confirmation, and a three-frame median must produce a reliable pitch first.
- Partwise MusicXML is supported. Timewise MusicXML is rejected with an explanation.
- The parser supports common divisions, time signatures, rests, chords, backups/forwards, chromatic transposition, multiple voices/staves, and ties. Complex repeats, jumps, tuplets, changing tempo maps, ornaments, and every notation-software extension are not yet interpreted for playback.
- For a polyphonic selected part, the most populated voice is used as the assessment timeline; simultaneous pitches collapse to the upper pitch. True divisi assessment is future work.
- Playback uses simple synthesized tones rather than a sampled piano or phoneme-aware vocal sound.
- Pitch detection estimates one fundamental frequency. It does not yet grade vibrato, rhythm, consonants, dynamics, breath, stability, scoops, vocal range, tessitura, or voice type.
- Note-level metrics are useful prototype signals, not clinical or pedagogical verdicts. The colour thresholds are intentionally configurable placeholders.
- Session data is not persisted after a new score or page reload; profiles and progression are future features.

## Privacy

MusicXML is parsed locally. Microphone input is analysed as short time-domain buffers and is not recorded. Only derived pitch samples live temporarily in browser memory, and imported files are never uploaded.
