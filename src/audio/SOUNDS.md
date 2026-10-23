# Listening guide

What plays when. Names are the `audio.play(name)` ids (mix table: `bank.ts`, samples: `public/audio/<name>_<n>.m4a|ogg`,
built by `scripts/build_sound_bank.py` from Kenney CC0 packs, see `public/audio/LICENSES.md`).
Everything is tuned to the music's key (D major). A sound whose sample has not loaded yet (the first tap)
or cannot load (the one-file build opened from disk) is played by the synthesizer in `audio.ts`.

## Loading

- Nothing audio-related is fetched at boot. The first tap / key press creates the AudioContext (inside the
  gesture, so iOS lets it play), starts the menu music and then fetches the bank in the background:
  71 files, 0.6-0.7 MB in one format, 4 at a time, in `LOAD_ORDER` (UI first, then shatters and
  building, then shots, then stings). On a desktop browser the whole bank is decoded within a second.
- Format per device: AAC `.m4a` where `canPlayType` says "probably" (iOS, Safari, Chrome, Edge), Ogg Vorbis
  otherwise; if a file does not decode, the other format is tried and used from then on.
- The first file is a probe: if it is missing (a build without `public/audio`) no further requests are made
  and the synthesizer plays everything.

## Mixing rules

- Every sound has a minimum gap between two starts and a voice cap (`bank.ts`). Variants rotate (never the same
  one twice in a row), with a small random pitch spread.
- Gameplay sounds share 22 voices (12 with battery saver), the small / medium / big shatters 7 of them (4).
- Crowd control: a gameplay sound that starts more than about 3 times within 0.4 s gets quieter (1/sqrt of its
  recent starts; the three shatter sizes count together), so a big wave sounds denser, not louder, and the
  master compressor does not pump the music.
- `place`, `upgrade`, `sell`, `ability` and `leak` answer the player (or a lost life): they are never dropped
  for the shared budget, and at their own cap the oldest voice makes room. UI sounds do the same.
- One UI sound per tap: requests from the same handler are merged and the most specific one wins
  (`click` < `tab`/`open`/`close`/`transition` < `start` < `error`/`locked`).
- One jingle at a time: a more important one replaces a lesser one, a lesser one is skipped while a more
  important one plays (e.g. a hero level-up at the end of a round replaces the round-cleared sting).
- Big moments duck the music (and some the other gameplay sounds) for the length of the sample.
- Master: a soft compressor (threshold -14 dB, ratio 5). Effects are normalised to about -12.5 LUFS, jingles
  to -14, and played well below that; in a 400-star stress test the output peaks around -2 dBFS.
- Volumes: effects slider = effects bus, music slider = music bus; music at 0 (or mute) schedules nothing.
  Battery saver (and the automatic "effects reduced"): fewer voices, a lighter music engine.

## Gameplay (group "world": shared voice budget, ducked under jingles)

| Event | Sound | Character (source) | Variants / rules |
| --- | --- | --- | --- |
| small star shatters (tier 1-3) | `pop` | light glass break + D-pentatonic crystal pings (Impact glass light) | 3, pitch +-4 %, 30 ms gap |
| medium star (tier 4-6) | `popMid` | glass medium + plate grit + pings | 3, +-4 % |
| big star (tier 7-9) | `popBig` | heavy glass + plate + longer shard shower | 3, +-4 % |
| boss shatters | `bigpop` | heavy glass, low boom, stereo shard rain, glass ring | 3, +-4 %, ducks music to 70 % |
| Slinger / Buzz fire | `shoot` | soft card-slide flick (Casino) | 3, quiet (0.32) |
| Boomer launches | `lob` | soft thump + card shove | 2 |
| explosion (Boomer shell, nuke, Rocco's slam) | `bomb` | crunch + punch + low boom (Sci-fi, Impact) | 3 |
| Frosty fires / frost burst | `freeze` | glass ring + snow crunch + icy pings | 2 |
| Sparky's chain lightning, storm strikes | `zap` | stacked glitch clicks + laser hiss | 3, +-5 % |
| Scope fires (and tracer beams) | `snipe` | knife slice + light hit (RPG) | 2 |
| Mystic and Cosmo fire, fox spirits | `magic` | "maximize" sweep + sparkles | 2 |
| Sparky's grabby claw | `tongue` | slime (Sci-fi) | 1 |
| a hit bounces off (immune star) | `clank` | light metal (Impact) | 3, 120 ms gap |
| a shiny drops (Hoarder) | `acorn` | light wood knock | 3 |
| bee drones | `buzz` | synthesizer (soft fluttering saw), 30 % of the shots | - |
| cash collected in game (shinies, bank, supply drop) | `cash` | casino chips | 3 |
| tower placed | `place` | wood thump + soft impact | 2, never dropped |
| upgrade bought | `upgrade` | confirmation + sparkle | 1, never dropped |
| tower sold, perks reset | `sell` | coin handling (RPG) | 1, never dropped |
| star leaks / life lost | `leak` | punch + "bong" | 2, 200 ms gap, never dropped |
| ability used | `ability` | sweep + hit-jingle accent | ducks music to 75 %, never dropped |

## Stings (group "jingle": one at a time, a more important one replaces a lesser one)

| Event | Sound | Source | Priority, ducking |
| --- | --- | --- | --- |
| round starts | `roundStart` | pizzicato jingle 16 (1 semitone down, in D) | 2, music 60 % |
| round cleared | `roundEnd` | pizzicato jingle 10 | 2, music 60 % |
| boss arrives | `boss` | pizzicato 03 + hit 03 + low rumble | 4, music 35 %, other sounds 70 %; at most every 8 s (a train of comets is announced once) |
| boss shattered | `bossDie` | hit + sax + steel jingle 00 | 3, music 50 %; at most every 3 s (one sting per cascade, each boss still gets its `bigpop`) |
| FRENZY starts | `frenzy` | sax 16 + hit + open sweep | 3, music 50 % |
| FRENZY ready | `ready` | pizzicato 04 | 1, music 70 % |
| level up (player, hero, Lucky Star, bandit tier 5, the level-up reveal) | `levelup` | steel 02 + pizzicato 02 | 3, music 50 % |
| victory | `victory` | sax + pizzicato + steel + hit jingle 10 | 5, music 20 %, other sounds 50 % |
| game over | `defeat` | sax 07 + pizzicato 07 | 5, music 20 %, other sounds 50 % |
| achievement(s) unlocked | `reward` | steel 16 + sparkles | 2, music 60 % |
| bandit tier / perk unlocked with XP | `unlock` | steel 04 + glass ring | 2, music 60 % |

## Menus (group "ui": one sound per tap, the most specific wins; group "fx" for counters)

| Event | Sound | Source |
| --- | --- | --- |
| any button / card tap, confirm "OK" | `click` / `tap` | interface "drop" (2 variants) |
| tab, segmented choice, toggle, difficulty / hero / speed / auto | `tab` | interface toggle (2) |
| modal or page opens | `open` | interface open (low-passed) |
| modal, page, panel, reveal, confirm "cancel" closes | `close` | interface close |
| screen change (maps, setup, page swap) | `transition` | cloth swish (RPG) |
| tap on something locked (map, hero, perk, maxed path) | `locked` | metal latch + question blip |
| not possible (cash, placement) | `error` | interface question (low-passed) |
| a game starts (setup "Let's go", restart, continue) | `start` | confirmation + open |
| volume slider let go (preview) | `pop` | the small shatter |
| cash counting on the result screen | `coin` | casino chip lay (80 ms ticks, pitch rises) |
| XP bar filling (result screen, Bandit menu) | `xpTick` | interface pluck (80-85 ms ticks, pitch rises) |
| medal pops in on the victory screen | `medal` | metal tap + glass ring + stereo sparkles |

## Music (`music.ts`, generated live)

- **Menu theme** (80 bpm): soft detuned pad, round bass, a marimba arpeggio that breathes (a few notes drop out),
  an FM bell melody on alternate passes, a soft shaker.
- **Battle** (100 bpm), three layers that cross-fade (0.6 s) with the game:
  build phase = pad + bass + shaker + a few marimba notes; round running = + groove (kick, brushed clap,
  marimba ostinato, bass pickups); boss on the field or FRENZY = + whistled lead, 16th shakers, woodblock, tom fills
  (FRENZY also adds a high marimba line).
- Warm by design: the spectral centroid sits around 250-450 Hz, above 5 kHz there are only the shakers, and there
  is no sub-bass below 60 Hz (the bass is heard through its harmonics on phone speakers).
- One shared reverb (ConvolverNode, generated 1.6 s stereo room). Each track has its own layer gains, so a
  menu / battle switch cross-fades without chords from the old track ringing on.
- Battery saver (and the automatic "effects reduced"): no reverb, one oscillator per note, fewer effect voices.
  Music volume 0 or mute: nothing is scheduled at all.

## Checking it

`tests/audio.test.ts` checks the bank (every sample set has a mix entry, both formats on disk, size budget,
sane caps). For a listening pass in the dev build, `window.__audio` is the engine: set `__audio.log = []`
and every started sound is recorded as `name:sample` or `name:synth`.
