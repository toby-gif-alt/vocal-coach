# Vocal Coach

Vocal Coach is a static, browser-based prototype for practising a vocal part directly from a MusicXML score. It separates the selected vocal line from accompaniment data, renders conventional staff notation, synthesizes score playback, follows the score with a cursor, and compares raw microphone pitch samples with the expected note.

No account, backend, upload service, or build step is required. Score files and microphone data remain in browser memory.

## Prototype flow

1. Upload `.musicxml`, `.xml`, or compressed `.mxl`.
2. Review every detected score part and select **I am singing this part**.
3. View the selected part by itself or switch to the full score.
4. Use **Practice** mode for accompaniment with an optional vocal guide.
5. Use **Assessment** mode for accompaniment without the guide and with local microphone pitch detection.
6. Review the raw colour-coded pitch trace and note-level measurements.

A small two-part MusicXML score is included so the complete flow can be tried immediately.

## Architecture

The app deliberately keeps musical concerns separate:

- `src/musicxml.js` reads MusicXML/MXL, detects parts, and builds independent note timelines. Each note includes written pitch, MIDI pitch, frequency, onset, duration, measure, beat, voice/staff, and tie data.
- `src/audio-engine.js` owns Tone.js transport scheduling, separate accompaniment/guide synthesizers, microphone lifecycle, and raw Pitchy samples.
- `src/analysis.js` groups usable samples by target note and derives initial, average, settling, sustained, and in-tolerance measurements.
- `src/config.js` contains pitch thresholds and audio-analysis settings so today’s placeholder tolerances can be replaced without changing the assessment code.
- `app.js` coordinates the views, OpenSheetMusicDisplay renderer/cursor, controls, pitch monitor, trace, and results table.

Raw timestamped pitch samples are never snapped to the expected note. This leaves room for future vibrato, scoop, onset, stability, rhythm, range, tessitura, and breath analysis.

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

## Deploy to GitHub Pages

The included `.github/workflows/pages.yml` deploys the repository root whenever `main` changes. In the repository settings, select **GitHub Actions** as the Pages source if it is not selected automatically.

All app and sample-score paths are relative, so the site works at a project URL such as `https://username.github.io/vocal-coach/`. GitHub Pages supplies the HTTPS context required for microphone access.

## Browser support and limitations

- Current Chrome, Edge, Firefox, and Safari releases with Web Audio and `getUserMedia` are the target. Microphone behaviour varies by device and browser.
- Headphones are strongly recommended. This prototype does not separate accompaniment leaking from device speakers into the microphone.
- Partwise MusicXML is supported. Timewise MusicXML is rejected with an explanation.
- The parser supports common divisions, time signatures, rests, chords, backups/forwards, chromatic transposition, multiple voices/staves, and ties. Complex repeats, jumps, tuplets, changing tempo maps, ornaments, and every notation-software extension are not yet interpreted for playback.
- For a polyphonic selected part, the most populated voice is used as the assessment timeline; simultaneous pitches collapse to the upper pitch. True divisi assessment is future work.
- Playback uses simple synthesized tones rather than a sampled piano or phoneme-aware vocal sound.
- Pitch detection estimates one fundamental frequency. It does not yet grade vibrato, rhythm, consonants, dynamics, breath, stability, scoops, vocal range, tessitura, or voice type.
- Note-level metrics are useful prototype signals, not clinical or pedagogical verdicts. The colour thresholds are intentionally configurable placeholders.
- Session data is not persisted after a new score or page reload; profiles and progression are future features.

## Privacy

MusicXML is parsed locally. Microphone input is analysed as short time-domain buffers and is not recorded. Only derived pitch samples live temporarily in browser memory, and imported files are never uploaded.
