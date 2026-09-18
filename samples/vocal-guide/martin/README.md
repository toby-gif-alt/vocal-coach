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
| `G3-3.wav` | 55 | `f0954d0056b016a05aa156bb8632aa0d8e341f7e5999782f0a12ede7b12ad398` |
| `B3.wav` | 59 | `2a94fe05d1918f2f83dc3d70bec2a06f32241be4aafb047a9131d7bf03f09cc3` |
| `A4.wav` | 69 | `2564e8fa563ce0578c636304657a482c30de538c09bb851013a162ac59489bde` |

The upstream dataset describes the note series as a single singer recorded in 2014 with a Roland R05 about 20 cm from the mouth. The note set is sung on its base vowel (`a`). Each file is mono, 16-bit PCM at 44.1 kHz.

The upstream `G3-3.wav` take is used for the G3 / MIDI 55 anchor. It replaces `G3.wav`, whose hummed/nasal character did not match the four open-vowel anchors. `G3-2.wav` was also evaluated but had a darker harmonic profile; `G3-3.wav` retained the stronger open-vowel band and the more consistent stable sustain.

The demo starts each file at its natural onset. Loop points in `src/vocal-guide-sample-packs.js` use matched positive-going zero crossings in the stable body of each note to reduce discontinuities during long sustains. The G3 replacement loops from 0.388685 to 0.862018 seconds, clear of both the attack and ending. Its gain is normalized against the perceived level of the surrounding anchors. Playback still applies a short release envelope.

Copyright © 2014 vocobox. Distributed under the MIT License; see [`LICENSE`](./LICENSE).
