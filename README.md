# Vocal Coach

Vocal Coach is a static, browser-based prototype for practising a vocal part directly from a MusicXML score. It separates the selected vocal line from accompaniment data, renders conventional staff notation, synthesizes score playback, follows the score with a cursor, and compares stabilised microphone pitch samples with the expected sounding note.

No account, backend, upload service, or build step is required. Scores, calibration, pitch data, and captured assessment audio remain on the user's device.

## Prototype flow

1. Upload `.musicxml`, `.xml`, or compressed `.mxl`.
2. Review every detected score part and select **I am singing this part**.
3. View the selected part by itself or switch to the full score.
4. Choose **Practice** (guide + accompaniment, no scoring), **Assisted Assessment** (guide + accompaniment + scoring), or **Assessment** (accompaniment + scoring).
5. Choose an Off/1-bar/2-bar musical count-in. Vocal Coach suggests an octave from the current microphone check, then confirms it when the starting pitch is sung back; manual octave controls remain under **Advanced**.
6. Before the first microphone session, complete a saved room-and-comfortable-voice **Microphone Check**; Low/Normal/High remain available only as advanced overrides.
7. In a microphone mode, use the large vertical tuner to find the first note before Play and keep tuning through the count-in; during later rests it prepares the next entrance without adding those samples to assessment results.
8. Balance separate Vocal Guide and Accompaniment volume controls, then use the persistent transport dock while the stabilised colour-coded pitch trace follows the written staff.
9. Use the ten adaptive **Your Vocal Coach** observations as the main review, then replay any combination of **My voice**, **Accompaniment**, and **Melody guide** against the same score clock.

A small two-part MusicXML score is included so the complete flow can be tried immediately.

## Architecture

The app deliberately keeps musical concerns separate:

- `src/musicxml.js` reads MusicXML/MXL, detects parts, and builds independent note timelines. Each note includes written pitch, MIDI pitch, frequency, onset, duration, measure, beat, voice/staff, and tie data.
- `src/timing.js` defines the exact bridge between Tone.Transport quarter notes and OSMD whole-note-fraction timestamps, applies MusicXML backup/forward/chord measure timing, and derives simple or compound-meter count-in pulses.
- `src/audio-engine.js` owns Tone.js transport scheduling, gain-controlled accompaniment/guide synthesizers, count-in clicks outside score time, the two-stage microphone check, the RMS noise gate, raw Pitchy samples, score-time-aligned recording lifecycle, and XML review layers slaved to recorded-audio time.
- `src/noise-gate.js` measures RMS amplitude, derives a room-aware threshold for Low/Normal/High sensitivity, and applies gate hysteresis before pitch detection.
- `src/microphone-calibration.js` combines ambient and comfortable sung-voice distributions into a saved gate, clarity threshold, and tracker reacquisition setting without exposing technical values in the student interface.
- `src/performance-recorder.js` wraps MediaRecorder for session-only voice capture, pause/resume accounting, local object-URL playback, and future storage separation.
- `src/pitch-tracker.js` keeps raw detector history, acquires new voices with strict thresholds, continues only recent pitch-related voices at moderately softer thresholds, corroborates octave ambiguities, rejects isolated jumps, and exposes a diagnostic rejection summary.
- `src/octave-selection.js` compares the sung starting pitch with the written, lower-octave, and higher-octave candidates, while keeping the current voice-check suggestion separate from future singer-profile data.
- `src/review-playback.js` stores immutable take settings and maps recorded-audio seconds back to musical quarter notes for synchronized review.
- `src/live-tuning.js` selects the starting/current/next target, keeps pre-performance and rest samples out of assessment, and provides a 170 ms visual-only dropout hold before the meter dims to **Listening…**.
- `src/analysis.js` groups usable samples by target note and derives onset, settling, sustained centre, green-zone percentage, stability, voiced coverage, fragmentation, and directional drift measurements. It also produces a five-dimension performance level used only to tune coaching.
- `src/coaching.js` ranks performance-specific strengths and next priorities, balances them for the singer's current level, and produces approximately ten observations tied to actual notes and measures.
- `src/score-overlay.js` maps parsed target-note timestamps to OSMD graphical staff entries and systems, then draws accepted samples as a live SVG trace over the written notes. It may bridge only a very short pitch-compatible visual dropout; the underlying raw frame remains missing.
- `src/config.js` contains pitch thresholds and audio-analysis settings so today’s placeholder tolerances can be replaced without changing the assessment code.
- `app.js` coordinates the views, OpenSheetMusicDisplay renderer/cursor, controls, pitch monitor, score overlay, coaching cards, and detailed results.

Raw and accepted timestamped pitch samples are kept separately in memory. Preparation, count-in, and during-rest tuning can drive the live meter but are never added to results or the score trace. The tracker uses the target only as supporting evidence in an octave ambiguity and never snaps a performance to the expected note. This preserves genuine wrong notes, scoops, slides, and small movements for future analysis.

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

The dependency-free Node test suite covers generated harmonic A3/C4/A4/C5 tones, quiet/normal/loud microphone profiles, calibration rejection, first/next tuning targets, preparation/count-in/rest sample isolation, visual dropout holding, deliberate pitch slides, reacquisition and melodic/octave transitions, bounded score-trace bridging, MediaRecorder pause accounting, count-in meters, extended note analysis, three coaching profiles, Tone/OSMD time conversion, pickup and multi-staff MusicXML timing, RMS gating, empty-sample handling, and GitHub Pages asset paths. Run the full syntax and regression check with Node 20 or newer:

```sh
npm run check
```

For cursor diagnostics, add `?debugTiming=1` to the app URL. The console then logs:

```text
transport quarter | OSMD timestamp | measure | expected note
```

Tone.Transport remains the playback clock. OSMD timestamps are whole-note fractions, so the app converts one transport quarter to `0.25` OSMD time before advancing the notation cursor.

For developer-only detector diagnostics, add `?debugPitch=1`. It shows raw/filtered Hz and MIDI, clarity, RMS, sounding target, cents error, reliability state, usable vocal-frame percentage, the current take’s rejection breakdown, and an isolated-tone browser self-test.

## Deploy to GitHub Pages

The included `.github/workflows/pages.yml` deploys the repository root whenever `main` changes. In the repository settings, select **GitHub Actions** as the Pages source if it is not selected automatically.

All app and sample-score paths are relative, so the site works at a project URL such as `https://username.github.io/vocal-coach/`. GitHub Pages supplies the HTTPS context required for microphone access.

## Browser support and limitations

- Current Chrome, Edge, Firefox, and Safari releases with Web Audio and `getUserMedia` are the target. Microphone behaviour varies by device and browser.
- Headphones are strongly recommended in both assessment modes and especially when the vocal guide is active. Browser echo cancellation helps reduce speaker recapture, but headphones are the reliable way to prevent the guide from influencing microphone scoring.
- The first assessment on a browser runs about one second of room listening followed by a 2–3 second comfortable sung “Ah”. A successful calibration is saved locally and can be replaced with **Recheck microphone**. Low/Normal/High are advanced overrides.
- Assisted Assessment and Assessment record the microphone with MediaRecorder where supported, beginning at score time zero after the count-in. Review uses that recording as its authoritative clock and continually checks Tone/XML playback against it while seeking, pausing, or changing review layers.
- Selecting Assisted Assessment or Assessment starts live tuning immediately after microphone access is ready. The same stream stays alive through preparation, count-in, rests, and performance, then closes when Practice or another score is selected or the page closes.
- Pitch analysis uses a 4096-sample window. Individual detector frames are not scored directly: RMS, clarity, continuity, harmonic/octave evidence, jump confirmation, and a three-frame median must produce a reliable pitch first. Softer continuation thresholds cannot acquire a new voice and expire after a short gap.
- Partwise MusicXML is supported. Timewise MusicXML is rejected with an explanation.
- The parser supports common divisions, time signatures, rests, chords, backups/forwards, chromatic transposition, multiple voices/staves, and ties. Complex repeats, jumps, tuplets, changing tempo maps, ornaments, and every notation-software extension are not yet interpreted for playback.
- For a polyphonic selected part, the most populated voice is used as the assessment timeline; simultaneous pitches collapse to the upper pitch. True divisi assessment is future work.
- Playback uses simple synthesized tones rather than a sampled piano or phoneme-aware vocal sound.
- Pitch detection estimates one fundamental frequency. It reports sustained-pitch stability and coverage, but it does not yet interpret vibrato or grade rhythm, consonants, dynamics, breathing technique, scoops, vocal range, tessitura, or voice type.
- Note-level metrics are useful prototype signals, not clinical or pedagogical verdicts. The colour thresholds are intentionally configurable placeholders.
- Assessment recordings remain session-only. Saved performances, profiles, progression, repertoire, and voice classification are future features.

## Privacy

MusicXML is parsed locally. Microphone input is analysed as short time-domain buffers; assessment audio is also captured locally for the **Hear my performance** control where MediaRecorder is supported. Imported files, pitch data, calibration values, and audio recordings are never uploaded. Calibration alone is saved in local browser storage; the recording is released with the session.
