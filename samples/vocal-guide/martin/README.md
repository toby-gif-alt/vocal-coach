# Martin human voice anchors

These are real sung-note recordings from [`vocobox/human-voice-dataset`](https://github.com/vocobox/human-voice-dataset), copied from:

```text
data/voices/martin/notes/exports/mono/
```

Upstream revision: [`77248fc69fd93c40a69d49c0cade4144c5d7a9f4`](https://github.com/vocobox/human-voice-dataset/tree/77248fc69fd93c40a69d49c0cade4144c5d7a9f4)

| File | Root MIDI | SHA-256 |
| --- | ---: | --- |
| `C3.wav` | 48 | `03b4a7cfbd00235b54e118fed5588ab264f7e3af48375dc0bf9d21b17be1e28b` |
| `E3.wav` | 52 | `1ffad60e509debb9ebe6037ce1a45f798afac1ffa88401b646d9a2de2d9f4d24` |
| `G3.wav` | 55 | `1ef52b32672620eab95b18ee21a2cddd8adbf6e38ebba1200ce03b0948dbc39a` |
| `B3.wav` | 59 | `2a94fe05d1918f2f83dc3d70bec2a06f32241be4aafb047a9131d7bf03f09cc3` |
| `A4.wav` | 69 | `2564e8fa563ce0578c636304657a482c30de538c09bb851013a162ac59489bde` |

The upstream dataset describes the note series as a single singer recorded in 2014 with a Roland R05 about 20 cm from the mouth. The note set is sung on its base vowel (`a`). Each file is mono, 16-bit PCM at 44.1 kHz.

The demo starts each file at its natural onset. Loop points in `src/vocal-guide-sample-packs.js` use matched positive-going zero crossings in the stable body of each note to reduce discontinuities during long sustains. Playback still applies a short release envelope.

Copyright © 2014 vocobox. Distributed under the MIT License; see [`LICENSE`](./LICENSE).
