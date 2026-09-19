# Vocal guide sample packs

Production sustained-`Ah` recordings belong in `male/` and `female/` as MP3 files. Name each file for its sounding root pitch, for example `E2.mp3`, `Fs3.mp3`, `C4.mp3`, or `Db4.mp3`. Run `npm run assets` after adding or removing files; this regenerates `index.json` with the URL, normalised note name, root MIDI, and bank. Do not edit the manifest by hand.

The app chooses the bank from an explicit vocal part name when possible, otherwise from the bank whose anchors require the least median/average transposition across the part's sounding MIDI notes. Missing or failed samples fall back to Synthetic Ah.

The `martin/` folder remains only for the standalone developer demo. It is not the production voice source. Its local README records the upstream MIT attribution and checksums.

See [`docs/vocal-guide.md`](../../docs/vocal-guide.md) for playback and recording details.
