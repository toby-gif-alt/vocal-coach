# Studio interaction fixes

Prepared from main after merged PR #12. This change does not modify pitch detection, assessment analysis, recorded-take metadata, audio routing or sound-bank selection algorithms.

## Fixes and root causes

- **Listen preview:** `hearStartingNote()` tested session confirmation before separating microphone modes. Listen now takes the immediate preview path even on its first press. It uses the selected line, current practice position and singing octave without activating a microphone. Assisted/Assessment retain required calibration, stacked octave cards, live indication and subsequent confirmed-pitch previews.
- **First-use tutorial:** completion is now version 3, and studio onboarding starts after the score is rendered. The redesigned tour is offered once to users who finished version 2. Visible controls are ordered by their actual screen rows, left to right. Hidden controls are skipped; the transport targets its visible button group rather than its zero-size `display: contents` wrapper. Cards are positioned beside a target, clamped inside the viewport, and scroll only to reveal it. No score scaling is used. Back/Next/Skip, keyboard focus and Escape are preserved; active takes and microphone setup suppress the guide.
- **Home and score views:** Home uses a house-outline SVG and readable text. A shared setter synchronises Vocal Focus/Full Score state, accessible pressed values and rendering. New scores and part entry reset to Vocal Focus; full-score renders all parts.
- **Fresh piece defaults:** legacy saved tempo and range fields were being reapplied after the controls reset. These fields no longer restore. Every opened score starts at 100%, whole piece, beginning, Repeat off, no recording/review or stale traces, with a new microphone-mode octave-confirmation session. Calibration and intended audio/part preferences remain intact. The engine and tempo controls reset together.
- **Mixer:** the 420px inherited grid squeezed independent controls together. A viewport-clamped panel up to 640px now has one clear section per accompaniment part, wrapping names, an independent enable checkbox, sound selector and labelled volume with percentage. Vocal Guide remains separate. Panels scroll internally; Settings/Mixer/Tempo are mutually exclusive and close outside or with Escape.
- **Settings:** three everyday rows: Microphone status/Recheck, Listening setup, Count-in. Explanations, sensitivity, manual octave information and privacy live in Advanced. Normal performance status is back in the studio. Following user feedback, Quick guide & app updates is removed, and Restore included scores is moved to the library’s Storage & backup settings. An available app update can also be applied there. Tutorial remains in top navigation.
- **Practice dragging:** every pointer move previously ran `updateDraftFields()`, committed the range, stopped/reset audio and rebuilt overlays. Releasing capture before clearing gesture state also allowed a synchronous `lostpointercapture` to roll back the drag. The gesture now owns stable capture on the score container, coalesces draft shading to animation frames, and commits once on release. Lost capture/cancellation keeps the last valid preview; Escape clears. Scroll frames stop on completion, coordinate conversion follows the current SVG transform, and scrolling chooses the actual scrollable score ancestor. Geometry/layout refresh waits for an active drag. Forward/reverse, quick touch-event sequences and multiple-page hit testing are covered.
- **Review workspace:** fixed overlays and large bottom padding covered notation. The companion is now a real grid column beside the score on desktop. Tablet/phone use separate vertically stacked, independently scrollable score/review areas. The score returns to normal width on close. Opening/closing the companion or resizing explicitly reflows OSMD and rebuilds geometry, traces and range shading, restoring the review cursor or highlighted coaching note. The recording remains the review clock. Chronological feedback, bounded bar previews, sound layers/levels, Back/Next and full-take playback are retained.

## Validation

The full Node checks include existing microphone, calibration, MusicXML, octave, recorder, coaching, review synchronisation, repertoire and service-worker regressions. New regressions exercise Listen without confirmation, saved-tempo/range isolation, view-state synchronisation, tutorial migration/visual ordering/placement, first/reverse/slow/touch-event drags, synchronous capture loss, multi-page hit testing and reflow deferred during dragging.

Browser checks use the real application in Chrome and the in-app browser. Recording tests use an external QA harness with synthetic WebAudio input, never a physical microphone; the harness is outside the repository and build. Captures crop only its QA toolbar. Device-specific touch input, physical singing/acoustic latency, native PWA installation/storage lifecycle and OS airplane mode remain hardware checks.

Screenshots in `screenshots/studio-fixes-*` show before/after Mixer and Settings, responsive panels, and the score alongside/before review. The written attachment referenced screenshots, but supplied only the text brief; before captures were taken from the PR #12 build.

This feature is prepared for review on a branch, with no automatic merge or deployment.

### Results

- `npm run generate`: passed.
- `npm run check`: **212 tests passed on Node 20**, matching Actions; syntax and generated-asset checks passed.
- `npm run build`: passed.
- `npm run offline:check`: **167 verified files, 14.6 MB**, including project-path URL validation.
- The browser service worker reported a complete verified offline cache.

| Browser interaction | Result |
| --- | --- |
| First and repeated Listen Hear starting note | No octave or calibration dialog; direct preview |
| First studio entry, Skip/Done, replay, new repertoire | Tour launched automatically; completion persisted; replay worked; new score did not repeat it |
| Desktop and wrapped mobile tutorial | Home → Settings → views → Mixer → Tutorial → section → modes → part/note/transport/tempo/review/score; keyboard Tab wrapped within guide |
| Full Score, Home, another piece | Vocal Focus active and rendered; whole piece; 100% / 72 BPM; no stale review |
| Mixer on desktop/tablet/phone | Every accompaniment enable, voice selector and volume operated; Vocal Guide operated; panel stayed open; Escape closed it |
| Settings on phone | Headphones/Speakers and count-in changed cleanly; opening Mixer closed Settings; both stayed below wrapped navigation |
| First forward and reverse mouse drag | 2–7, then 3–7, on first attempt |
| Drag after tablet reflow across a system break | 3–6 selected correctly; Cancel cleared it |
| Assisted completion | Dock opened automatically; rendered SVG width matched the 952px score viewport; score ended before companion began |
| Close/reopen recording | Same recording source retained, reopened paused |
| Assessment | Back/Next worked; target in bar 3 was visible inside the score; preview stopped at the bar endpoint |
| Desktop/tablet/phone review | Highlight stayed inside score; desktop areas did not overlap; tablet/phone score bottom stayed above review top |

Responsive captures and interactions used application viewports of 1440×900, 834×1112 and 390×844 (the external harness adds a separate 50px toolbar). Native mouse dragging ran in Chrome. Touch pointer lifecycle and slow/quick gesture cases were automated in the production-handler harness; physical touchscreen gestures remain a device check.
