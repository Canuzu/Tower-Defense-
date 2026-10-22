import type { SoundName } from '../game/fx';

/** Named sounds beyond the simulation's SoundName: UI feedback, rewards and the star size classes. */
export type UiSound =
  | 'tap'
  | 'open'
  | 'close'
  | 'tab'
  | 'locked'
  | 'start'
  | 'transition'
  | 'coin'
  | 'xpTick'
  | 'medal'
  | 'reward'
  | 'unlock'
  | 'ready';
export type Sfx = SoundName | UiSound | 'popMid' | 'popBig' | 'lob';

/**
 * world: gameplay (ducked under big moments), fx: menu feedback that is never ducked (coins, XP ticks,
 * medals), ui: one per tap (the most specific wins), jingle: one at a time (a more important one
 * replaces a lesser one; a lesser one is skipped while a more important one plays).
 */
export type SfxGroup = 'world' | 'fx' | 'ui' | 'jingle';

export interface SfxDef {
  /** level at play(name, 1); the samples are loudness-normalised, so this is the mix */
  gain: number;
  group: SfxGroup;
  /** min seconds between two starts of this sound */
  gap: number;
  /** max voices of this sound at once */
  cap: number;
  /** random pitch spread (+-), 0 for tuned jingles */
  jitter: number;
  /** ui: which request wins when one tap asks for several sounds; jingle: which one may interrupt */
  prio?: number;
  /** music level while this plays (1 = untouched), held for the sample's length */
  duck?: number;
  /** level of the other gameplay sounds meanwhile */
  duckWorld?: number;
}

const w = (gain: number, gap: number, cap: number, jitter = 0.03, duck?: number): SfxDef => ({ gain, group: 'world', gap, cap, jitter, duck });
const ui = (gain: number, prio: number, gap = 0.04, jitter = 0.02): SfxDef => ({ gain, group: 'ui', gap, cap: 2, jitter, prio });
const jingle = (gain: number, prio: number, duck: number, duckWorld = 1): SfxDef => ({ gain, group: 'jingle', gap: 0.3, cap: 1, jitter: 0, prio, duck, duckWorld });

/** Mix table. Call sites pass their own volume on top (pops 0.5, tower shots 0.32, ...). */
export const SFX: Record<Sfx, SfxDef> = {
  // crystal stars shattering, by size class (pitch jitter +-4 %)
  pop: w(0.62, 0.03, 6, 0.04),
  popMid: w(0.74, 0.035, 5, 0.04),
  popBig: w(0.92, 0.045, 4, 0.04),
  bigpop: w(0.85, 0.12, 2, 0.04, 0.7),
  // tower shots and hits
  shoot: w(0.5, 0.05, 3),
  lob: w(0.6, 0.06, 3),
  bomb: w(0.9, 0.06, 4),
  freeze: w(0.8, 0.07, 3),
  zap: w(0.8, 0.06, 3, 0.05),
  snipe: w(0.7, 0.06, 3),
  magic: w(0.7, 0.06, 3),
  buzz: w(0.6, 0.05, 2),
  tongue: w(0.6, 0.08, 2),
  clank: w(0.6, 0.12, 2, 0.05),
  acorn: w(0.6, 0.05, 3),
  // economy and building
  cash: w(0.42, 0.05, 3),
  place: w(0.62, 0.05, 2),
  upgrade: w(0.55, 0.05, 2, 0),
  sell: w(0.62, 0.05, 2),
  leak: w(0.85, 0.08, 2, 0.02),
  ability: w(0.55, 0.1, 2, 0, 0.75),
  // stings
  roundStart: jingle(0.55, 2, 0.6),
  roundEnd: jingle(0.55, 2, 0.6),
  boss: jingle(0.8, 4, 0.35, 0.7),
  bossDie: jingle(0.72, 3, 0.5),
  frenzy: jingle(0.7, 3, 0.5),
  levelup: jingle(0.62, 3, 0.5),
  victory: jingle(0.8, 5, 0.2, 0.5),
  defeat: jingle(0.75, 5, 0.2, 0.5),
  reward: jingle(0.65, 2, 0.6),
  unlock: jingle(0.62, 2, 0.6),
  ready: jingle(0.5, 1, 0.7),
  medal: { gain: 0.62, group: 'fx', gap: 0.08, cap: 3, jitter: 0, duck: 0.7 },
  // UI
  click: ui(0.5, 1),
  tap: ui(0.5, 1),
  tab: ui(0.42, 2),
  open: ui(0.36, 2, 0.08, 0),
  close: ui(0.34, 2, 0.08, 0),
  transition: ui(0.4, 2, 0.12, 0),
  start: ui(0.6, 3, 0.1, 0),
  error: ui(0.48, 4, 0.08, 0),
  locked: ui(0.55, 4, 0.08, 0),
  coin: { gain: 0.42, group: 'fx', gap: 0.05, cap: 3, jitter: 0.03 },
  xpTick: { gain: 0.3, group: 'fx', gap: 0.05, cap: 3, jitter: 0 },
};

/** Loading order after the first tap: what a player hears first comes first. */
export const LOAD_ORDER: Sfx[] = [
  'tap', 'tab', 'open', 'close', 'error', 'locked', 'start', 'transition', 'coin', 'xpTick',
  'pop', 'popMid', 'popBig', 'bigpop', 'place', 'upgrade', 'sell', 'cash', 'roundStart', 'roundEnd', 'leak',
  'shoot', 'lob', 'bomb', 'freeze', 'zap', 'snipe', 'magic', 'tongue', 'clank', 'acorn',
  'boss', 'bossDie', 'ability', 'frenzy', 'levelup', 'victory', 'defeat', 'medal', 'reward', 'unlock', 'ready',
];

/** Stand-ins from the synthesizer while a sample loads (or if it cannot): [synth sound, pitch, volume]. */
export const SYNTH_STANDIN: Partial<Record<Sfx, [SoundName, number, number]>> = {
  tap: ['click', 1, 1],
  tab: ['click', 1.15, 0.8],
  open: ['click', 1.3, 0.7],
  close: ['click', 0.8, 0.7],
  transition: ['click', 0.7, 0.4],
  start: ['roundStart', 1, 0.8],
  locked: ['error', 1.1, 0.8],
  coin: ['cash', 1.1, 0.6],
  xpTick: ['click', 1.4, 0.5],
  medal: ['levelup', 1.2, 0.5],
  reward: ['levelup', 1, 0.7],
  unlock: ['levelup', 1.1, 0.6],
  ready: ['levelup', 1.2, 0.4],
  popMid: ['pop', 0.85, 1],
  popBig: ['bigpop', 1.4, 0.6],
  lob: ['shoot', 0.6, 1],
};

/** Size class of a shattering star (tier 1-3 small, 4-6 medium, 7+ big, bosses their own). */
export function shatterSound(tier: number, boss = false): Sfx {
  if (boss) return 'bigpop';
  return tier <= 3 ? 'pop' : tier <= 6 ? 'popMid' : 'popBig';
}
