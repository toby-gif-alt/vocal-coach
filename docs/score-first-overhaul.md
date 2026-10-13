# Score-first studio and coaching

The studio keeps mode choice prominent, with an expandable mixer and setup summary above the score. Play closes both panels without resetting settings. They can be reopened; timing-sensitive settings remain disabled during playback, count-in and pause. Microphone status remains above the score and the count-in remains in transport. Finish & review stays in the persistent transport for microphone sessions.

## Practice sections

Double-click a bar or use **Practice section** to open the temporary editor. Numbers, keyboard bar selection and explicit **Select by dragging** all edit one draft. Apply validates bars and Start From using the existing practice-range logic. Cancel/Escape discards the draft; Clear immediately restores the whole piece. Normal score scrolling does not select bars. Pointer capture supports backwards and cross-system drags; pointer cancellation restores the previous draft. Touch selection blocks scrolling only after the user explicitly enables dragging. At the viewport edge, pointer movement scrolls the page; the student can also select by typing or keyboard.

Saved and provisional ranges use one continuous green band per selected run on each score system, with subtle dimming outside. The whole piece has no practice shading or start marker. The moving playback cursor and existing coloured pitch traces remain separate. Geometry rebuilds retain the selection after a score-view change or resize. Narrow Full Score views scroll horizontally to preserve notation size; Vocal Focus omits redundant instrument names.

## Measurement and coaching

Main feedback has three priorities and two strengths. Each measured card points to its score note and includes a short exercise. Repeated patterns, interval context, severity, sample quantity, coverage, phrase entrances and successful matches elsewhere contribute to ranking. Categories and note targets are deduplicated. Missing findings are explicitly marked **Provisional guidance**, rather than manufacturing criticism or praise.

Pitch findings require at least 0.55 seconds, eight accepted samples and 65% detected coverage. Entrance windows need at least three samples near the written beginning. Ending drift needs at least a one-second note, three middle and ending samples, continuous sustained evidence and samples close to the written ending. Clipped range boundaries cannot establish beginnings/endings. Sustained pitch bias additionally requires at least 75% of sustained samples on the same side beyond 25 cents. Median centres reduce sensitivity to natural vibrato and brief slides. Visual-only interpolated samples, rejected frames and low-confidence frames are not assessment evidence.

Ascending/descending leaps compare **consecutive score notes**, with a reliably centred preceding note and a reliably biased destination. Missing notes and long rests are not bridged. Repeated accurate notes, secure entrances, centred sustained notes and successful adjustments are possible strengths.

### Timing limits

The current accepted pitch stream is not an independently validated phonation detector. Detector acquisition delay, consonants and quiet signal can resemble late entrances or early releases. Accordingly, `onsetTimingSeconds` and `releaseEarlySeconds` remain unavailable; this update does not present those as measured findings. Coverage and dropout statistics remain optional technical metrics. No card claims measured breathing pressure, diaphragm activity or vocal tension. Real microphone/recording verification requires a singer and microphone; automated fixtures and existing recording/review tests provide regression coverage, not clinical validation.

The coaching gates are conservative engineering choices, not thresholds validated by the organisations below.

## Pedagogical references

Exercise choices are informed by, rather than endorsed by, these primary sources:

- [Heidi Moss Erickson, *Mobile Apps and Biofeedback in Voice Pedagogy*, Journal of Singing 77(4), NATS, 2021](https://www.nats.org/_Library/JOS_On_Point/JOS_077_04_2021_485.pdf): targeted pitch biofeedback and the distinction between onset pitch, sustained pitch and release pitch. The app does not infer vocal physiology from a fundamental-pitch line.
- [NATS Journal of Singing 80(5), 2024](https://www.nats.org/_Library/JOS_On_Point/JOS-080-5-2024-543.pdf): gentle flowing “ng” exercises and caution against treating breath support or one exercise family as a universal solution.
- [The Voice Foundation, 2025 symposium abstract: straw phonation and lip trills in singers](https://voicefoundation.org/view/2025-abstracts/entry/3014/): semi-occluded exercises as an option for comfortable vocal practice. This is a symposium abstract, not proof that a particular pitch error has one physiological cause.

## Verification

`npm run generate` and `npm run check` (syntax, manifests and unit/regression tests). Added tests cover five-card output, priority/deduplication, signed sustained bias, corrected entrances, ascending/descending intervals, ending drift, sparse/clipped/low-confidence samples, vibrato/slides, onboarding inactivity/persistence/suppression, draft validation, forward/backward ranges and merged multi-system geometry.

Browser checks: first welcome, studio tutorial navigation/skip/replay, MusicXML repertoire and part selection, double-click range editor, typed Apply/Cancel/Clear, backwards and cross-system pointer dragging, selected range surviving Vocal Focus/Full Score changes and resize, clean whole-piece view, and microphone-free playback with setup collapse. Desktop (1440×1000), tablet (834×1112) and mobile (390×844) layouts were visually inspected.

## Tutorial and calibration follow-up

The studio tour now uses one zoomed-out overview and a fixed guide card. Next/Back only change the highlighted control and text; they do not move the page or card. Leaving the tour restores normal scale and refreshes score geometry. Hear starting note and its octave hint sit in the score header. After the first studio tour finishes or is skipped, a microphone-check prompt offers calibration or continued Listen practice. Returning users get the suggestion once per app opening when they enter the studio; it does not request mic access until Calibrate is chosen. A successful check in the current opening suppresses the reminder. Manual tour replays do not repeat the first-tour prompt.
