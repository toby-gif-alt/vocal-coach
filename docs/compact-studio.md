# Compact studio and singing-octave setup

## Student experience

Studio controls share the masthead between Vocal Coach and the privacy/help controls. Home returns safely to repertoire; restart/play-pause/stop, time, follow score, Listen/Assisted/Assessment, the selected starting note, Mixer, Settings and a short status remain accessible without separate full-width cards. The masthead stays visible while reading down the score. The title/composer/part remain below it, with Tutorial immediately beside the part badge. Score view and practice-section controls live beside the score heading. On smaller screens the controls wrap with 44 px targets. Mixer/Settings open mutually exclusive panels; click outside or Escape closes them.

The old transport elements are hidden state/compatibility bindings and are neither visible nor keyboard-focusable. The single visible transport uses the existing playback functions. Completed takes and synchronized review retain their immutable take metadata when the next singing octave changes.

Tutorial now highlights the part badge, mode control, starting note, Mixer/Settings, score, practice bars and transport. Next/Back/Skip keep the page geometry in place: the tour does not scroll or zoom. Completion persists and the Tutorial button replays it.

The working calibration dialog is preserved. Its successful initial Continue opens **Find your starting note**. Entering a microphone mode with a saved good calibration skips the check and opens starting-note setup if no choice has been confirmed. Rechecking an established setup retains the selected octave.

Starting-note cards always derive from the first vocal entrance at the current practice start. Higher pitches appear above lower pitches: +12, written, −12 and −24 semitones. The big Hear button previews the current sounding starting note; each separate speaker button previews its exact card without selecting it. Card bodies explicitly select the assessment octave; Continue returns to the score without starting playback. Tab/Enter/Space and up/down card focus work. The chosen shift is saved under each repertoire item's selected part, with legacy single-shift settings still readable.

The orange line moves continuously according to measured pitch. A warm background shows its octave area even when flat or sharp (between midpoints of adjacent octave choices); a closer border and sustained suggestion indicate a precise match. The selected card remains distinct and never changes automatically. Short visual smoothing uses measured neighbouring samples only; after 320 ms without reliable input the line clears to Listening. Preview audio is briefly excluded from matching. Unsupported frequencies are explained, and manual selection remains available.

Selecting −24 assesses every following note two octaves below its written MIDI, preserving intervals. The tuner/reference/toolbar update immediately. Written MusicXML, notation and ordinary accompaniment/guide scheduling remain unchanged. An active/paused/count-in take locks its shift. A completed recording, trace and results retain that take's original shift even after choosing a different octave for the next take.

## Why a two-octave response could previously be missed

The old hear-and-sing-back interaction opened a ~1.5-second response deadline and could automatically apply a short stable match. The mismatch detector considered only a one-octave difference from the current target. Its corroborating detector ran mainly when pitch jumped relative to previous detector history: a steady wrong octave could lack the corroboration required to build a suggestion. These limitations are removed: setup listens until the student finishes, selection is explicit, and sustained mismatch evidence includes two octaves and steady target mismatches.

The old 65 Hz floor also rejected genuine low fundamentals. **B♭4 → B♭2 is about 116.54 Hz**, so that particular example is above the old cutoff; deadline/candidate/evidence handling are plausible causes, but the original incident has no raw recording for a definitive hardware diagnosis. **B♭3 → B♭1 is about 58.27 Hz** and was necessarily below the old limit.

Lowering the cutoff alone is insufficient. Normal-range tracking retains the 4096-sample window. Low fundamentals and target-independent starting-note exploration use a second 8192-sample analyser/Pitchy detector: about 186 ms at 44.1 kHz or 171 ms at 48 kHz. Tests exercise the actual vendored Pitchy at 44.1/48/96 kHz with E1/A1/B♭1-range fundamentals, normal notes and strong second harmonics. The supported floor is now 40 Hz; upper limit, clarity/noise/clipping gates and normal-range continuity tests remain. The chooser reads measured raw fundamentals with its own small stability/smoothing history, not target-led octave corrections. This improves supported low-note resolution, but real acoustic microphone/harmonic behaviour and mobile CPU/latency still need device testing.

## Automatic offline preparation

Install Vocal Coach remains the home action. There is no asset-download button, readiness counter or retry jargon in the student interface. The Install caption explains adding the app to this device; repertoire downloads say Download to this device. Preparation and integrity verification run automatically, incomplete active caches are repaired, and reconnect retries preparation/update checks. There are no technical status/retry controls in the student interface. Background checks repair incomplete downloads automatically; Help offers the plain-language Update Vocal Coach action when appropriate. Only genuine actionable setup problems appear at home; losing a connection while checking updates does not invalidate an already verified offline cache.

A new cache can reuse prior-version files only when their size and SHA-256 match its own inventory. Unchanged sound banks therefore avoid unnecessary transfers, while changed modules cannot be mixed into another build. Activation still requires the whole inventory, updates remain guarded during playback/calibration/octave setup/review, and IndexedDB repertoire is untouched. Installation UI and platform fallbacks remain intact.

## Verification

- Full `npm run check` on Node 20: 178 tests passed, zero failed, including the existing music, recording, calibration, library, safety and worker regressions.
- Build plus offline validation: 165 verified files, about 14.5 MB, valid `/vocal-coach/` project paths and no hidden placeholders.
- Real browser: The Blessing / Soprano; first-time Assisted → preserved calibration → Continue → octave selector; synthetic B♭2 measured/suggested at the lower card, F3 positioned between cards, silence cleared the line. F3 also shaded the octave region without selecting or claiming a precise match.
- Explicit B♭2 selection produced centred tuning, locked controls during a take, completed Assisted recording/review, and completed Assessment with all five coaching observations. Results identified centred B♭2s and a D3 target derived from written D5, demonstrating interval-preserving assessment transposition.
- Changing the next octave preserved the completed recording and review. Reopening after a verified app update restored part/octave settings. Tutorial Next/Back kept the studio at the same vertical position.
- Desktop/tablet/mobile layouts checked at 1440×900, 834×1112 and 390×844. DOM overflow and accessible controls were inspected.

Synthetic audio came from a labelled QA-only WebAudio harness outside the deployable app. No physical microphone, OS installation or native airplane-mode test is claimed. Before classroom rollout, test Android Chrome, iPhone/iPad Safari and desktop installation; real soft/loud/noisy/low singing with headphones/speakers; permission denial/busy/missing devices; mobile low-window latency; touch/keyboard/screen readers; background audio interruptions; and installed cold launch/import/practice after airplane mode. The normal import, share/file launch and backup workflows retain their existing platform limitations.
