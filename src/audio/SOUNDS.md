# Listening guide

What plays when. Names are the `audio.play(name)` ids (mix table: `bank.ts`, samples: `public/audio/<name>_<n>.m4a|ogg`,
built by `scripts/build_sound_bank.py` from Kenney CC0 packs, see `public/audio/LICENSES.md`).
Everything is tuned to the music's key (D major). A sound whose sample has not loaded yet (the first tap)
or cannot load (the one-file build) is played by the synthesizer in `audio.ts`.

## Gameplay (group "world": shared voice budget, ducked under jingles)

| Event | Sound | Character (source) | Variants / rules |
| --- | --- | --- | --- |
| small star shatters (tier 1-3) | `pop` | light glass break + D-pentatonic crystal pings (Impact glass light) | 3, pitch +-4 %, 30 ms gap |
| medium star (tier 4-6) | `popMid` | glass medium + plate grit + pings | 3, +-4 % |
| big star (tier 7-9) | `popBig` | heavy glass + plate + longer shard shower | 3, +-4 % |
| boss shatters | `bigpop` | heavy glass, low boom, stereo shard rain, glass ring | 3, +-4 %, ducks music to 70 % |
| | | all shatters together: max 7 voices (4 in battery saver) | |
| slingshot / bees fire | `shoot` | soft card-slide flick (Casino) | 3, quiet (0.32) |
| boomer launches | `lob` | soft thump + card shove | 2 |
| explosion | `bomb` | crunch + punch + low boom (Sci-fi, Impact) | 3 |
| frost pulse | `freeze` | glass ring + snow crunch + icy pings | 2 |
| tesla | `zap` | stacked glitch clicks + laser hiss | 3, +-5 % |
| sniper | `snipe` | knife slice + light hit (RPG) | 2 |
| magic / ember | `magic` | "maximize" sweep + sparkles | 2 |
| frog tongue | `tongue` | slime (Sci-fi) | 1 |
| ricochet / armour | `clank` | light metal (Impact) | 3, 120 ms gap |
| acorn | `acorn` | light wood knock | 3 |
| bee buzz | `buzz` | synthesizer (soft fluttering saw) | - |
| cash earned in game | `cash` | casino chips | 3 |
| tower placed | `place` | wood thump + soft impact | 2 |
| upgrade bought | `upgrade` | confirmation + sparkle | 1 |
| tower sold | `sell` | coin handling (RPG) | 1 |
| star leaks / life lost | `leak` | punch + "bong" | 2 |
| ability used | `ability` | sweep + hit-jingle accent | ducks music to 75 % |

## Stings (group "jingle": one at a time, a more important one replaces a lesser one)

| Event | Sound | Source | Priority, ducking |
| --- | --- | --- | --- |
| round starts | `roundStart` | pizzicato jingle 16 (1 semitone down, in D) | 2, music 60 % |
| round cleared | `roundEnd` | pizzicato jingle 10 | 2 |
| boss arrives | `boss` | pizzicato 03 + hit 03 + low rumble | 4, music 35 %, other sounds 70 % |
| boss shattered | `bossDie` | hit + sax + steel jingle 00 | 3 |
| FRENZY starts | `frenzy` | sax 16 + hit + open sweep | 3 |
| FRENZY ready | `ready` | pizzicato 04 | 1 |
| level up (player, hero, lucky star, bandit tier 5) | `levelup` | steel 02 + pizzicato 02 | 3, music 50 % |
| victory | `victory` | sax + pizzicato + steel + hit jingle 10 | 5, music 20 %, other sounds 50 % |
| game over | `defeat` | sax 07 + pizzicato 07 | 5, music 20 %, other sounds 50 % |
| achievement(s) unlocked | `reward` | steel 16 + sparkles | 2 |
| bandit tier / perk unlocked with XP | `unlock` | steel 04 + glass ring | 2 |

## Menus (group "ui": one sound per tap, the most specific wins; group "fx" for counters)

| Event | Sound | Source |
| --- | --- | --- |
| any button / card tap | `click` / `tap` | interface "drop" (2 variants) |
| tab, segmented choice, toggle, difficulty / hero / speed / auto | `tab` | interface toggle (2) |
| modal or page opens | `open` | interface open (low-passed) |
| modal, page, panel, confirm "cancel" closes | `close` | interface close |
| screen change (maps, setup, page swap) | `transition` | cloth swish (RPG) |
| tap on something locked (map, hero, perk, maxed path) | `locked` | metal latch + question blip |
| not possible (cash, placement) | `error` | interface question (low-passed) |
| a game starts (setup "Let's go", restart, continue) | `start` | confirmation + open |
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
- One shared reverb (ConvolverNode, generated 1.6 s stereo room). Each track has its own layer gains, so a
  menu / battle switch cross-fades without chords from the old track ringing on.
- Battery saver (and the automatic "effects reduced"): no reverb, one oscillator per note, fewer effect voices.
  Music volume 0 or mute: nothing is scheduled at all.
