# Offline Vocal Coach

## Student instructions

Open https://toby-gif-alt.github.io/vocal-coach/ while connected. The initial download includes the app, five built-in scores, the existing Salamander piano bank and both sampled human voice banks. Allow about 14.5 MB, plus storage overhead and your own scores. Wait for **Offline ready · piano + human voices + built-in scores**. **Download for offline** verifies and repairs a partial download; an error or incomplete status means reconnect and retry before leaving internet access.

- **Android and supported desktop browsers:** use the prominent **Install Vocal Coach** button. It opens a native prompt when available, otherwise browser-specific instructions. It stays visible after dismissal and is separate from **Download for offline**. The app hides it in standalone mode or after installation is confirmed in the current page. Browsers cannot always tell a normal tab that the app is already installed; instructions also explain opening the installed app.
- **iPhone/iPad:** open in Safari, use Share → Add to Home Screen, choose to open as a web app if offered, then Add. Open the new home-screen icon while connected and wait for Offline ready there as well. Safari and the installed app may have separate local data; import your scores into the app you intend to use. The Install Vocal Coach control opens home-screen instructions and is hidden in standalone mode. [Apple's instructions](https://support.apple.com/en-lamr/guide/iphone/iphea86e5236/ios).

Installation itself does not guarantee the full asset download. Listen works without microphone permission. Assisted and Assessment require a working microphone and an explicit user action before acquisition. Keep the app in the foreground while singing.

### Teacher scores and My Repertoire

Save a teacher's `.musicxml`, `.xml` or `.mxl` attachment to the device. Open Vocal Coach → **Import Score** → select the file → choose **I am singing this part**. Valid scores appear in **My Repertoire**, searchable by title, composer or filename. Reopening a saved score restores its selected part and practice settings. A preferred microphone mode resumes only after an explicit microphone action/check; reopening a file does not silently acquire a microphone.

Identical original bytes offer **Open existing**, **Keep a separate copy**, or Cancel. Copies have independent settings. **Rename** changes only the display title. **Export original** downloads exactly the bytes imported, including compressed MXL. **Remove** asks for confirmation; Cancel preserves it. Confirming removes only that score and its settings. Other scores, tutorial completion and successful microphone calibration remain. Built-ins use **Hide/Restore** in **Manage built-in repertoire**, and **Restore hidden built-ins** restores the full list.

**Storage & backup settings** shows the count, stored score-file bytes, and approximate origin storage when supported. **Export all scores** creates a ZIP containing original files and metadata. Originals can be reimported; automatic metadata-backup restoration is not implemented. Storage is local to this browser/app and device, with no account or cloud sync. Clearing site/app data, uninstalling, private browsing, operating-system eviction or device loss can erase it. Make backups. Persistent storage is requested after import where supported; denial does not block practice. If storage fails, a valid score can still open for the current session, with a message that it was not saved.

Installed platforms supporting [Web Share Target](https://developer.chrome.com/docs/capabilities/web-apis/web-share-target) can receive score attachments through a local service-worker POST. Supported desktop [File Handling API](https://developer.chrome.com/docs/capabilities/web-apis/file-handling) installations can open declared file types via `launchQueue`. These integrations depend on browser, operating system, installation and permission support. Do not promise an iOS share-sheet destination. Normal **Import Score** is the baseline everywhere.

### Guided microphone check

The reminder after onboarding, the reminder on reopening, **Recheck microphone** in Session settings, and the first required microphone-mode check use one centred dialog. It explains headphones, distance and local processing before **Start microphone check** requests access. It remains visible during room silence (~1 second), a comfortable sung Ah (~3 seconds), measured progress and live voice level. Success requires the existing engine's valid signal/pitch measurements and remains on screen until **Continue to Vocal Coach**.

Measured quiet, clipping, background noise or insufficient pitch produce Retry/Use Listen instructions; denied/missing/busy microphones have specific messages. Cancel stops capture, ignores late results and returns to Listen. Failed/cancelled rechecks preserve the previous successful calibration. No audio is uploaded. Calibration and detection use only local code. Recordings remain session-only and are released when the score/session is discarded; the service worker never caches them.

### Updates

Reconnect to download a verified new version. **Apply update** is available after download; finish playback, review and calibration first and close other Vocal Coach windows. Every new cached file must match its build's byte count and SHA-256. An incomplete install cannot activate or delete the previous complete cache. Application cache cleanup never clears IndexedDB repertoire. A previously loaded app retains its version until activation/reload; deployment files are never silently mixed into it.

## Build and storage architecture

```sh
npm ci
npm run generate
npm run check
npm run build
npm run offline:check
python3 -m http.server 8080 --directory dist
```

Deploy **dist/**, not the repository root. GitHub Pages workflow runs these checks/builds. Relative URLs and worker scope `./` support `/vocal-coach/` and other application prefixes. `npm run vendor` copies the pinned OSMD/Tone/JSZip builds, bundles Pitchy and fft.js locally with esbuild, and retains notices under `vendor/licenses/`; the app fetches no runtime CDN/font. Existing sample attributions/checksums remain in their sample directories. `offline-assets.json` describes all deployable assets, bytes and hashes. The worker's content version changes whenever the inventory changes. It supports audio Range requests and scoped navigation fallback, excludes unrelated resources and requires whole-inventory verification before readiness.

`repertoire-store.js` isolates IndexedDB binary score storage (`vocal-coach-library`, schema v1: scores/settings/incoming). Settings reside with each imported record or under a built-in key. Hidden built-ins are independent settings. Existing global microphone/tutorial/voice settings remain in their existing local storage keys. A future migration must add stores/indexes in `onupgradeneeded`, preserve originals/IDs/preferences, and test upgrading a populated older database; do not recreate or clear the database during deployments. `versionchange` closes connections so upgrades can proceed.

`library-ui.js` owns import validation, duplicates, export and deletion. `file-safety.js` restricts original files to 20 MB, decompressed XML to 25 MB, archives to 256 entries/40 MB expanded, and container metadata to 64 KB; stream inflation has a byte bound. Unsafe archive paths, encrypted/spanned archives, internal entity declarations, script/HTML event content and external source references are rejected. Standard MusicXML external DTD declarations are accepted without downloading the DTD. XML is parsed as XML, never inserted as HTML.

`pwa.js` contains browser installation/update UI. Share receipt stores filename/MIME metadata separately from original Blob bytes, then reconstructs a File through `incomingScoreFile` so Blob-only structured clones retain attachment identity. Older File records remain supported. Share receipt is in `service-worker.js`, and desktop launch adapters feed the same `importAndOpen` path. `calibration-dialog.js` adapts the existing audio-engine states without replacing the musical analysis. Core music code does not depend on install/share APIs.

For future Capacitor packaging: copy the built local assets; gate web service-worker/install functionality to appropriate web platforms; add native file/share adapters feeding File/Blob into the existing importer; implement native microphone usage descriptions and Android runtime permissions; test WebView getUserMedia/MediaRecorder codecs, audio interruption/resume, hardware sample rates and URI access. Android/iOS filesystem and incoming-intent/share-extension access require native adapters. Native and browser origins have different local databases; plan explicit export/import migration. No native build is included here.

## Verification and remaining device checks

Automated coverage includes original XML/MusicXML/MXL byte storage and reopen, duplicates and independent preferences, rename/removal isolation, hidden built-ins, unavailable storage, unsafe/oversized archives, bounded inflation, manifest/icons/project paths, checksums, Range responses, actual bundled service-worker installation/activation/partial-update rollback/data preservation, microphone diagnostics/cancel/stale results/late stream cleanup, and existing music/playback/coaching regressions.

Real in-app browser QA used `/vocal-coach/` locally. It imported all three formats, detected identical files, renamed a display title, cancelled removal, reopened stored scores, and verified full offline readiness. With the local origin server stopped and the app document recreated, the cached shell/dependencies/repertoire opened. A clearly labelled QA-only harness outside the deployable app supplied a 220 Hz WebAudio stream; offline room/voice calibration succeeded, Listen/Assisted/Assessment completed, live pitch and local recording worked, and five coaching observations appeared. This verifies app behaviour with synthetic input, not microphone hardware or singing accuracy. The browser also restored a saved practice range, hid/restored a built-in, applied a new verified app version while retaining all three scores, and confirmed an active recheck cancellation leaves Listen selected and the previous calibration ready. Calibration layout was checked at 390 × 844. Native OS installation and airplane mode were not available in that automation environment. Browser export click produced no visible error, but the automation download event timed out; device download completion remains manual. Confirmed deletion isolation is automated; browser confirmation/cancellation was checked, and permanent removal remains in the device checklist.

Before classroom rollout, manually test:

1. Install from deployed HTTPS on Android Chrome, iPhone/iPad Safari and supported desktop Chrome/Edge. Confirm icons, standalone launch and install prompt suppression.
2. Wait for Offline ready in the installed app, import each file format, fully close it, enable airplane mode and relaunch from its icon. Confirm sampled piano/human voices, score/range controls, real calibration, Assisted and Assessment, five cards and synchronized recording review.
3. Exercise normal/soft/clipped/noisy real microphones, blocked permission, absent/busy device, headphones/speakers and cancellation during permission/each stage. Confirm saved good calibration survives failure and no extra capture remains after cancellation.
4. Check Android attachment sharing and supported desktop file association. Check iOS Files → Import Score fallback. Test multiple shared files and duplicates.
5. Export an original/backup, cancel and confirm removal of one score, retain others/settings, hide/restore built-ins, test full storage and disabled/private IndexedDB, then reconnect/apply an update with repertoire intact.
6. Check narrow/touch layouts, keyboard focus/Escape in dialogs, screen-reader progress announcements, audio interruption/backgrounding and browser data eviction behaviour on each supported device.
