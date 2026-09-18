# Vocal Coach

Vocal Coach is a static, browser-based prototype for practising a vocal part directly from a MusicXML score. It separates the selected vocal line from accompaniment data, renders conventional staff notation, synthesizes score playback, follows the score with a cursor, and compares stabilised microphone pitch samples with the expected sounding note.

No account, backend, upload service, or build step is required. Scores, calibration, pitch data, and captured assessment audio remain on the user's device.

## Prototype flow

1. Upload `.musicxml`, `.xml`, or compressed `.mxl`.
2. Review every detected score part and select **I am singing this part**.
3. View the selected part by itself or switch to the full score.
4. Choose **Assisted** (guide + accompaniment + trace, without coaching judgement) or **Assessment** (accompaniment + trace + detailed coaching). The guide defaults to **Human voice**, with **Synthetic Ah** available from the same control panel.
5. Practise the whole piece or enter/select a bar range directly on the score. **Start from** can begin later inside that section without assessing the deliberately skipped bars.
6. Choose an Off/1-bar/2-bar musical count-in. Press **Hear starting note**, then sing it back during the explicit response window to confirm one of −24/−12/0/+12 semitones. The octave never changes automatically during count-in or performance, and manual controls remain under **Advanced**.
7. Before the first microphone session, complete a saved room-and-voice **Microphone Check**: stay quiet for about one second, then sing a comfortable “Ah”, beginning normally and getting a little louder. Low/Normal/High remain available as advanced overrides.
8. In a microphone mode, use the large vertical tuner to find the first vocal entrance at or after the selected starting bar and keep tuning through the count-in; during later rests it prepares the next entrance without adding those samples to assessment results.
9. Enable and balance each non-vocal MusicXML part independently. These controls remain live during the take, and the take stores its individual part mix for synchronized review.
10. Start another take to retain the immediately previous trace as a thin grey reference. Assisted ends with a trace/listen-back review only; Assessment additionally provides adaptive **Your Vocal Coach** observations and detailed metrics.

A small two-part MusicXML score is included so the complete flow can be tried immediately.

## Architecture

The app deliberately keeps musical concerns separate:

- `src/musicxml.js` reads MusicXML/MXL, detects parts, and builds independent note timelines. Each note includes written pitch, MIDI pitch, frequency, onset, duration, measure, beat, voice/staff, and tie data.
- `src/timing.js` defines the exact bridge between Tone.Transport quarter notes and OSMD whole-note-fraction timestamps, applies MusicXML backup/forward/chord measure timing, and derives simple or compound-meter count-in pulses.
- `src/audio-engine.js` owns Tone.js transport scheduling, accompaniment synths, the dedicated vocal-guide instrument, headphone/speaker capture constraints, count-in clicks outside score time, the two-stage microphone check, raw Pitchy frames, score-time-aligned recording lifecycle, and XML review layers slaved to recorded-audio time.
- `src/guide-playback.js` keeps the persisted Human/Synthetic Ah choice and converts parsed score notes into direct-MIDI guide requests without inheriting the singer's assessment octave.
- `src/vocal-guide-instrument.js` provides sampled-human and synthetic-vowel playback, closest-anchor selection, smooth releases, sustained sample loops, and automatic Synthetic Ah fallback.
- `src/noise-gate.js` measures RMS amplitude, derives a room-aware threshold for Low/Normal/High sensitivity, and applies gate hysteresis before pitch detection.
- `src/signal-quality.js` measures RMS, absolute peak, and near-full-scale occupancy on every input frame, classifies clipping, and requires a sustained clipped burst before raising an overload warning.
- `src/microphone-calibration.js` combines ambient, normal voice, and slightly louder voice distributions into saved acquisition/continuation gates, a clarity threshold, and tracker reacquisition setting. Sustained calibration clipping is rejected; there is no upper RMS gate for valid singing.
- `src/performance-recorder.js` wraps MediaRecorder for session-only voice capture, pause/resume accounting, local object-URL playback, and future storage separation.
- `src/pitch-tracker.js` keeps raw detector history, requires a short cluster of reliable frames to acquire a voice, continues a recently established related pitch at softer thresholds, keeps a separate 1.4-second reliable-fundamental memory for octave ambiguity, rejects isolated jumps, and classifies every frame for developer diagnostics.
- `src/octave-selection.js` compares only an explicit hear-and-sing-back response with −24/−12/0/+12 candidates. It is not active during count-in, performance, rests, or review.
- `src/practice-range.js` validates real measure numbers, resolves whole-piece/section/start-from choices to one absolute quarter-note interval, and clips assessment notes and samples at its boundaries.
- `src/review-playback.js` stores immutable take settings (including mode, measure/quarter boundaries, enabled accompaniment IDs, and per-part volumes), review-mix defaults, and the offset mapping from recorded-audio seconds back to absolute musical quarter notes for synchronized review.
- `src/live-tuning.js` selects the starting/current/next target, keeps pre-performance and rest samples out of assessment, and provides a 170 ms visual-only dropout hold before the meter dims to **Listening…**.
- `src/analysis.js` groups usable samples by target note and derives onset, settling, sustained centre, green-zone percentage, stability, voiced coverage, fragmentation, and directional drift measurements. It also produces a five-dimension performance level used only to tune coaching.
- `src/coaching.js` ranks performance-specific strengths and next priorities, balances them for the singer's current level, and produces approximately ten observations tied to actual notes and measures.
- `src/visual-trace.js` builds a visual-only 240 ms hold/interpolation layer around compatible reliable neighbours. Those synthetic visual points never enter scoring and never fill a long silence.
- `src/score-overlay.js` maps parsed target-note timestamps to OSMD graphical staff entries and systems, then draws the visual trace and, optionally, the immediately previous take in thin grey behind it.
- `src/config.js` contains pitch thresholds and audio-analysis settings so today’s placeholder tolerances can be replaced without changing the assessment code.
- `app.js` coordinates the views, OpenSheetMusicDisplay renderer/cursor, controls, pitch monitor, score overlay, coaching cards, and detailed results.

`rawSamples`, `acceptedSamples`, and `visualTraceSamples` are deliberately separate. Only accepted samples become assessment data. Preparation, count-in, octave response, and during-rest tuning can drive the live meter but are never added to results. The tracker uses the target only as supporting evidence in an octave ambiguity and never snaps a performance to the expected note. This preserves genuine wrong notes, scoops, slides, and small movements.

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

The dependency-free Node test suite covers generated harmonic A3/C4/A4/C5 tones, strict acquisition and forgiving continuation, quiet/normal/loud/clipped calibration profiles, frame amplitude/overload classification, headphone/speaker constraints, visual-only continuity, octave response candidates, immutable per-part take mixes, MediaRecorder pause accounting, section boundaries, review offsets, coaching, Tone/OSMD time conversion, pickup and multi-staff MusicXML timing, and GitHub Pages asset paths. Run the full syntax and regression check with Node 20 or newer:

```sh
npm run check
```

For cursor diagnostics, add `?debugTiming=1` to the app URL. The console then logs:

```text
transport quarter | OSMD timestamp | measure | expected note
```

Tone.Transport remains the playback clock. OSMD timestamps are whole-note fractions, so the app converts one transport quarter to `0.25` OSMD time before advancing the notation cursor.

For developer-only detector diagnostics, add `?debugPitch=1`. Every sampled frame shows raw/filtered Hz and MIDI, Pitchy clarity, RMS, absolute peak, near-full-scale percentage, sounding target, cents error, and a classified state. The current take reports usable-frame percentage plus counts and percentages for accepted acquisition/continuation, both gates, clarity, range, jumps, harmonic/octave handling, clipping, and missing detector frequency.

## Manual microphone checks

Before release, try quiet, normal, loud, and deliberately overloaded “Ah” vowels; consonant interruptions; gentle vibrato; a noisy room; headphones; and speakers. Confirm that quiet singing can establish and continue, consonant gaps remain visual-only and shorter than 250 ms, vibrato is not flattened, a single peak does not warn, sustained clipping does warn within roughly 150–300 ms, and tracking reacquires quickly. For both listening setups, confirm the same stream supplies detector and local recording. At 50%, 100%, and 150% tempo, use a separate Voice/Piano score and verify accompaniment, cursor, range boundaries, and review remain aligned.

## Deploy to GitHub Pages

The included `.github/workflows/pages.yml` deploys the repository root whenever `main` changes. In the repository settings, select **GitHub Actions** as the Pages source if it is not selected automatically.

All app and sample-score paths are relative, so the site works at a project URL such as `https://username.github.io/vocal-coach/`. GitHub Pages supplies the HTTPS context required for microphone access.

## Browser support and limitations

- Current Chrome, Edge, Firefox, and Safari releases with Web Audio and `getUserMedia` are the target. Microphone behaviour varies by device and browser.
- Headphones are the default and recommended listening setup: echo cancellation, noise suppression, and automatic gain control are disabled. Speakers enable echo cancellation only; switching setup reacquires the stream before a take and is disabled during a take.
- The first microphone session on a browser runs about one second of room listening followed by about three seconds of comfortable sung “Ah” from normal to slightly louder. A successful calibration is saved locally and can be replaced with **Recheck microphone**. Low/Normal/High are advanced overrides.
- Assisted and Assessment record the microphone with MediaRecorder where supported, beginning at the selected absolute score quarter after the count-in. The deliberately confirmed/manual octave is locked before count-in and stays fixed for that take. Review maps recording time zero back to that stored score quarter and continually checks Tone/XML playback against it while seeking, pausing, or changing review layers; volume-only changes alter gain without touching playback time.
- Both modes start live tuning immediately after microphone access is ready. The same raw local stream stays alive through preparation, count-in, rests, and performance, then closes when another score is selected or the page closes.
- Pitch analysis uses a 4096-sample window. Individual detector frames are not scored directly: RMS, clarity, short continuity, longer-lived harmonic memory, score target, corroborating autocorrelation, jump persistence, and a three-frame median must produce a reliable pitch first. Softer continuation thresholds cannot acquire a new voice and expire after a short gap.
- Partwise MusicXML is supported. Timewise MusicXML is rejected with an explanation.
- The parser supports common divisions, time signatures, rests, chords, backups/forwards, chromatic transposition, multiple voices/staves, and ties. Complex repeats, jumps, tuplets, changing tempo maps, ornaments, and every notation-software extension are not yet interpreted for playback.
- For a polyphonic selected part, the most populated voice is used as the assessment timeline; simultaneous pitches collapse to the upper pitch. True divisi assessment is future work.
- Accompaniment uses simple synthesized tones rather than a sampled piano. The melody guide provides sampled or synthetic “Ah”, not lyric- or phoneme-aware singing.
- A note already sounding before a selected start is safely reconstructed at the boundary with a short re-attack. This keeps accompaniment and guide timing intact, although it cannot reproduce the original attackless continuation exactly.
- Pitch detection estimates one fundamental frequency. It reports sustained-pitch stability and coverage, but it does not yet interpret vibrato or grade rhythm, consonants, dynamics, breathing technique, scoops, vocal range, tessitura, or voice type.
- Note-level metrics are useful prototype signals, not clinical or pedagogical verdicts. The colour thresholds are intentionally configurable placeholders.
- Assessment recordings remain session-only. Saved performances, profiles, progression, repertoire, and voice classification are future features.

## Privacy

MusicXML is parsed locally. Microphone input is analysed as short time-domain buffers; assessment audio is also captured locally for the **Hear my performance** control where MediaRecorder is supported. Imported files, pitch data, calibration values, and audio recordings are never uploaded. Microphone calibration and the guide-voice preference are saved in local browser storage; the recording is released with the session.
