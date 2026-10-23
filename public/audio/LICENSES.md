# Third-party audio

All sound effects and jingles in this folder are built from sound packs by **Kenney** (Kenney Vleugels,
[www.kenney.nl](https://www.kenney.nl)), released under **Creative Commons Zero (CC0 1.0)**:
<http://creativecommons.org/publicdomain/zero/1.0/>.

> You may use these assets in personal and commercial projects. Credit (Kenney or www.kenney.nl)
> would be nice but is not mandatory. (from each pack's License.txt)

Packs used:

| Pack | Version | Used for |
| --- | --- | --- |
| Impact Sounds | 1.0 | glass shatters, plates, wood, metal, punches, snow, soft impacts |
| Interface Sounds | 1.0 | UI taps, toggles, open / close, glass ring, glitches, confirmations |
| Casino Audio | 1.1 | card slides (shots), chips (cash, coins) |
| RPG Audio | - | knife slices (sniper), coin handling (sell), metal latch (locked), cloth (transition) |
| Sci-fi Sounds | 1.0 | explosion crunches, low booms, small laser hiss, slime |
| Music Jingles | - | pizzicato, sax, steel drum and hit jingles (round start / end, boss, level-up, victory, defeat, rewards) |

The files were edited (layered, trimmed, pitch-shifted, filtered, loudness-normalised, re-encoded);
the crystal "sparkle" layers are synthesized. Edited CC0 material stays free to use. The build script
is `scripts/build_sound_bank.py`; `src/audio/SOUNDS.md` lists which sound plays when.

Formats: `<name>_<variant>.m4a` (AAC-LC, for iOS / Safari / Chrome) and `<name>_<variant>.ogg`
(Ogg Vorbis, for browsers without AAC). The game picks one per device and falls back to the other.

The music is not a recording: it is generated live by `src/audio/music.ts`.
