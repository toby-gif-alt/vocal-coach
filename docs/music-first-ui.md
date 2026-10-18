# Music-first Vocal Coach studio

This feature follows the supplied brief and the follow-up layout changes: Home, Settings, Vocal focus, Full score, Mixer and Tutorial share equal space at the top, with Select bars to practice and Listen / Assisted / Assessment there too. The smaller clickable part heading sits alongside the musical controls. Selected bars keep their normal colour; only bars outside the selection darken.

## Interface changes

- Studio navigation has no brand link, privacy badge, question-mark button, transport clock, follow arrow or Finish & review action. Vocal focus and Full score sit between Settings and Mixer, and Select bars to practice is also in the navigation. Home retains the Vocal Coach page branding. Settings and Mixer are compact popovers, with privacy information, app help/updates and Restore included scores available from Settings.
- **I am singing [part]** is a button, with **Click to change part** beneath it. Active playback/count-in asks for confirmation before stopping and entering the existing part chooser. Pending audio initialisation is guarded. Choosing a new part resets incompatible take visuals and recording state, updates accompaniment routing and the score, and restores its saved octave preference. Cancelling part selection returns to the original part. The original XML is unchanged.
- Hear starting note, Change octave, Restart, Play/Pause, Stop, compact Tempo and Listen back sit beside the smaller heading on wide screens, wrapping on narrow screens. Tempo stays locked during takes. Score clicks position the green playhead and wait for Play.
- The first Hear starting note action after opening a score/part in the current app session opens the stacked octave cards, even with a saved octave. Later presses preview the chosen pitch directly. A required microphone calibration precedes the selector. Change octave remains available independently, and calibration/manual operation without a microphone is preserved.
- Select bars to practice still applies typed/dragged ranges immediately. Clicking the section button again closes its editor without clearing the range; Cancel clears it and Repeat. Keyboard selection uses Enter/Space on bar targets. Repeat appears only inside the bar-selection options. Whole piece has no shading.
- The visible sample/measure cards and pitch-colour legend are removed. Internal sample and measure bindings remain hidden. **Show previous take**, beside Listen back on the score, still controls the thin comparison trace.
- Assisted completion opens a compact, non-modal player at the lower corner, becoming a bottom sheet on phones. It includes recording Start, Stop, Restart, progress, three listening layers, expandable volume controls and a close button. Closing retains the take; Listen back reopens it silently. Escape and the close button return keyboard focus to Listen back.
- Assessment completion opens a non-modal click-through review. Findings and strengths are mixed in score order, one card at a time, with Back/Next, a marked target note and playback bounded to that bar. The shared player provides Start, Stop, Restart, voice/accompaniment/melody switches and volume controls. The last Next opens full-take playback, paused at the beginning, retaining the sound settings. Evidence thresholds and exercises remain unchanged; general provisional guidance is explicitly labelled and follows measured findings, using the final recorded bar as listening context. With no pitch samples, the dialog explains that no measured coaching is available, without inventing findings; an available voice recording can still be heard.
- Stop and natural completion share the existing recorder-finalisation path. A completed take cannot be finalised a second time merely because a part is changed. Feedback does not open over a pending part-change confirmation. Repeat suppresses completion popups while looping.
- Broad label focus rings are removed. Keyboard focus is drawn on the actual input/select/button, and mouse/touch focus uses a simple control border.
- The interactive tutorial now points to the current heading, modes, note preview, mixer, score, practice selection and transport, and describes immediate selection and Stop/review behaviour.

## Why practice shading was missing

The playback range was being saved, but `renderMeasureSelection()` no longer iterated the output of `practiceBands()`. It only recreated transparent measure hit targets. CSS for shading existed but no corresponding shaded SVG rectangles were drawn.

The renderer now draws the **unselected** bands returned by `practiceBands()`. Adjacent bars are merged within each system, and full-score bounds cover all staves. Selected bands are left untouched so the green cursor, notes and pitch trace keep their contrast. No per-bar green outlines or green background is drawn. Whole-piece selection produces no dimming bands. Overlay regeneration uses the current range after render, view changes and resize, including OSMD SVG replacements after layout changes; closing the editor does not discard that range. The overlay stays below trace layers and does not receive pointer events.

## Recording alignment

The existing recording media element remains the authoritative review clock. The UI still calls the existing `startReview`, `synchroniseReviewClock`, seek and layer/volume APIs with the immutable take metadata. Changing the panel's position does not change recording offsets, locked octave, BPM, note targets or MusicXML routing.

In browser QA, synthetic recorded audio advanced from approximately 0.25 to 7.60 seconds while the score cursor moved from about x=139 to x=592. Closing/reopening the player retained its recording and reopened paused. Assisted Stop opened the player; Assessment natural completion opened feedback first. Guided steps mark each target and reuse the recording clock with bar-limited playback. The immutable recording origin and tempo remain unchanged; only the review endpoint is clipped for each step. These are synthetic-input checks, not measurements of real microphone/device latency.

## Unified repertoire and persistence

`RepertoireCatalogue` supplies the common library and dropdown rows. Stable included IDs are based on the bundled asset path; imported IDs remain their existing IndexedDB UUIDs. Display names do not determine the loading route. Included rows fetch bundled assets; imported rows load their saved bytes. Identical imported titles/files are distinguished as copies in the dropdown.

| Content | Ordinary browser tab/session | Actual standalone app |
| --- | --- | --- |
| Included titles / hiding | Session storage; defaults return in a fresh tab session | IndexedDB settings; customisations survive reopening |
| Included asset bytes | Never deleted or rewritten | Never deleted or rewritten |
| Imported scores / names / part settings | Existing persistent IndexedDB records | Same persistent IndexedDB records |
| Restore included scores | Clears only session catalogue customisations | Clears only persistent catalogue customisations |

Detection uses standalone display mode or Safari's standalone signal. A regular browser tab does not infer installation elsewhere. The previous installed-app hidden-included setting is migrated. Restore never touches imported score records, original bytes or settings. Original score downloads and imported-score backups continue to use the original stored files.

Browser QA imported a MusicXML fixture into the same list as the five included scores; renamed it; renamed/hid an included score; checked dropdown updates and duplicate imports; closed/reopened the browser tab; and verified the five default included entries returned while the renamed import remained. Opening that imported entry from the common dropdown also worked with the origin server unavailable.

## Validation

- `npm run generate`: passed.
- `npm run check`: 203 tests passed, including existing parsing, detection, calibration, octave, immutable take, recorder, review-clock, coaching and service-worker checks.
- The full check also passed on Node 20, matching GitHub Actions. Guided-review tests cover mixed score ordering, clipped bars, recording offsets, immutable metadata, seek limits and stopping at the chunk endpoint.
- `npm run build`: passed; 167 verified offline files, about 14.5 MB.
- `npm run offline:check`: passed, including GitHub Pages project-path URLs.
- Browser checks at 1440 × 900, 834 × 1112 and 390 × 844: navigation/controls, score rendering, selected-bar dimming, resize and vocal/full-score changes. SVG shading also has a production-renderer test, including rerender replacement and whole-piece clearing.
- Mouse reverse drag selected bars 2–4 immediately. Keyboard Enter selections changed the range to 2–3. Closing retained two outside dim bands; Cancel removed them.
- After service-worker verification reported a complete cache, the local origin server was stopped. A fresh app iframe reopened, loaded an included score and played it with an advancing cursor; Assisted and Assessment recording/review also ran with synthetic input. The origin server remained unavailable during that test. This was not an operating-system airplane-mode test.

## Screenshots and remaining device checks

The before screenshot was captured from the existing live interface. The attachment supplied the written brief only; the seven referenced image files were not attached. After screenshots use the real implemented application. Review/feedback captures are from a clearly labelled, external QA harness with synthetic WebAudio input, excluded from the deployment build.

See `screenshots/music-first-before.jpg`, `music-first-desktop.jpg`, `music-first-tablet.jpg`, `music-first-mobile.jpg`, `music-first-library.jpg`, `music-first-feedback.jpg`, `music-first-review.jpg` `music-first-review-mobile.jpg` and `music-first-practice-options.jpg`.

Remaining real-device checks: physical microphone singing/acoustic latency, touchscreen dragging and scroll behaviour, native iOS/Android/desktop PWA install/relaunch and storage eviction, OS airplane mode, and final original-file/backup download completion. Standalone persistence rules are automated with IndexedDB; native installed-app UI lifecycle was not emulated or claimed. Chrome's automation extension denied file upload because file-URL access was disabled; permissions were left unchanged and the import checks passed in the in-app browser.

This feature is prepared as a pull request; it is not merged or deployed by this task.
