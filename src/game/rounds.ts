import type { GloopId } from './gloops';

export interface SpawnGroup {
  type: GloopId;
  count: number;
  /** seconds between spawns in this group */
  gap: number;
  /** seconds after round start before the group begins */
  delay: number;
  camo?: boolean;
  regrow?: boolean;
  fortified?: boolean;
}

export interface RoundDef {
  groups: SpawnGroup[];
  /** shown as a banner when the round starts */
  hint?: string;
}

type Mod = 'c' | 'r' | 'f' | 'cr' | 'rf' | 'cf' | 'crf' | '';

/** g(type, count, gap, delay, mods) */
function g(type: GloopId, count: number, gap: number, delay = 0, mods: Mod = ''): SpawnGroup {
  return {
    type,
    count,
    gap,
    delay,
    camo: mods.includes('c') || undefined,
    regrow: mods.includes('r') || undefined,
    fortified: mods.includes('f') || undefined,
  };
}

const R: RoundDef[] = [];
const add = (groups: SpawnGroup[], hint?: string) => R.push({ groups, hint });

// --- 1-10: the basics ---------------------------------------------------------------------
add([g('red', 20, 0.85)], 'Drag a bandit onto the grass to guard the stash!');
add([g('red', 35, 0.6)]);
add([g('red', 25, 0.55), g('blue', 5, 0.9, 6)], 'Orange Stars crack into Red Dwarfs.');
add([g('red', 35, 0.45), g('blue', 18, 0.7, 4)]);
add([g('red', 5, 0.6), g('blue', 27, 0.55, 2)]);
add([g('red', 15, 0.5), g('blue', 15, 0.5, 3), g('green', 4, 0.9, 8)], 'Yellow Stars are faster still.');
add([g('red', 20, 0.4), g('blue', 20, 0.45, 2), g('green', 5, 0.7, 9)]);
add([g('red', 10, 0.4), g('blue', 20, 0.4, 2), g('green', 14, 0.55, 8)]);
add([g('green', 30, 0.5)]);
add([g('blue', 102, 0.17)], 'A flood of Orange Stars!');
// --- 11-20 ------------------------------------------------------------------------------------
add([g('red', 10, 0.4), g('blue', 10, 0.4, 2), g('green', 12, 0.5, 5), g('yellow', 2, 1, 10)], 'White Stars are FAST.');
add([g('blue', 15, 0.35), g('green', 10, 0.5, 4), g('yellow', 5, 0.8, 9)]);
add([g('blue', 50, 0.2), g('green', 23, 0.35, 6)]);
add([g('red', 49, 0.18), g('blue', 15, 0.3, 4), g('green', 10, 0.4, 8), g('yellow', 9, 0.6, 12)]);
add([g('red', 20, 0.25), g('green', 15, 0.35, 3), g('yellow', 12, 0.5, 8), g('pink', 5, 0.9, 14)], 'Blue Stars are the fastest yet.');
add([g('green', 20, 0.3), g('yellow', 8, 0.5, 6)]);
add([g('yellow', 8, 0.7, 0, 'r')], 'Regrow stars heal their layers if you do not finish them.');
add([g('green', 80, 0.18)]);
add([g('green', 10, 0.3), g('yellow', 4, 0.5, 3), g('yellow', 15, 0.5, 6, 'r'), g('pink', 5, 0.7, 12)]);
add([g('black', 6, 0.9)], 'Black Holes swallow explosions!');
// --- 21-30 ------------------------------------------------------------------------------------
add([g('yellow', 14, 0.4), g('pink', 40, 0.25, 5)]);
add([g('white', 16, 0.6)], 'Ice Stars cannot be frozen.');
add([g('black', 7, 0.6), g('white', 7, 0.6, 3)]);
add([g('green', 20, 0.3), g('green', 1, 1, 7, 'c')], 'CAMO star! You need towers that detect camo.');
add([g('yellow', 25, 0.35, 0, 'r'), g('purple', 10, 0.7, 6)], 'Nebulas shrug off magic and fire.');
add([g('pink', 23, 0.3), g('zebra', 4, 1, 6)]);
add([g('red', 100, 0.08), g('blue', 60, 0.1, 6), g('green', 45, 0.13, 12), g('yellow', 45, 0.15, 17)], 'RUSH!');
add([g('lead', 6, 1.1)], 'Meteors! Sharp attacks bounce off.');
add([g('yellow', 26, 0.3), g('pink', 25, 0.3, 4, 'r')]);
add([g('lead', 9, 0.8), g('pink', 20, 0.25, 4)]);
// --- 31-40 ------------------------------------------------------------------------------------
add([g('black', 8, 0.5), g('white', 8, 0.5, 2), g('zebra', 2, 0.8, 5), g('zebra', 4, 0.8, 8, 'r')]);
add([g('black', 25, 0.3), g('white', 28, 0.3, 4), g('purple', 10, 0.5, 9)]);
add([g('yellow', 20, 0.3, 0, 'c'), g('red', 20, 0.2, 2)], 'Camo swarm incoming.');
add([g('yellow', 160, 0.09), g('zebra', 6, 0.7, 10)]);
add([g('pink', 35, 0.2), g('black', 30, 0.25, 4), g('white', 25, 0.3, 9), g('rainbow', 5, 0.8, 14)], 'Auroras hide 2 Eclipses each.');
add([g('pink', 140, 0.09)]);
add([g('black', 25, 0.2), g('white', 25, 0.2, 3), g('white', 7, 0.5, 6, 'c'), g('lead', 10, 0.6, 8), g('zebra', 15, 0.4, 12)]);
add([g('pink', 42, 0.15), g('white', 17, 0.3, 3), g('lead', 14, 0.5, 6), g('zebra', 10, 0.5, 10), g('ceramic', 4, 1, 14)], 'Diamonds have a tough shell.');
add([g('black', 10, 0.3), g('white', 10, 0.3, 2), g('lead', 20, 0.4, 4), g('zebra', 20, 0.35, 8), g('rainbow', 18, 0.45, 13)]);
add([g('rainbow', 10, 0.6), g('moab', 1, 1, 8)], 'A COMET APPROACHES!');
// --- 41-50 ------------------------------------------------------------------------------------
add([g('black', 60, 0.15), g('zebra', 60, 0.15, 8)]);
add([g('rainbow', 6, 0.5), g('rainbow', 6, 0.5, 4, 'r'), g('moab', 1, 1, 9)]);
add([g('rainbow', 10, 0.4), g('ceramic', 7, 0.6, 5), g('moab', 2, 3, 10)]);
add([g('zebra', 50, 0.15), g('ceramic', 10, 0.5, 8)]);
add([g('pink', 200, 0.06), g('ceramic', 8, 0.5, 6, 'r'), g('rainbow', 15, 0.3, 12)]);
add([g('lead', 12, 0.4, 0, 'c'), g('moab', 1, 1, 6)]);
add([g('pink', 70, 0.1, 0, 'c'), g('rainbow', 12, 0.4, 7, 'r')]);
add([g('rainbow', 120, 0.08), g('ceramic', 10, 0.4, 11)]);
add([g('green', 343, 0.03), g('zebra', 20, 0.3, 6), g('rainbow', 20, 0.3, 10), g('ceramic', 18, 0.4, 14), g('moab', 3, 2, 18)], 'Huge wave!');
add([g('ceramic', 20, 0.35), g('lead', 8, 0.5, 4, 'f'), g('moab', 2, 2, 10)]);
// --- 51-60 ------------------------------------------------------------------------------------
add([g('rainbow', 28, 0.3), g('ceramic', 10, 0.4, 8, 'c')]);
add([g('ceramic', 25, 0.35), g('moab', 2, 2, 6)]);
add([g('pink', 80, 0.07), g('moab', 3, 1.5, 5)]);
add([g('ceramic', 35, 0.3), g('moab', 2, 2, 10)]);
add([g('ceramic', 45, 0.25)]);
add([g('rainbow', 40, 0.2, 0, 'r'), g('moab', 1, 1, 8, 'f')], 'Fortified stars have double health.');
add([g('rainbow', 40, 0.2), g('moab', 4, 1.6, 6)]);
add([g('ceramic', 29, 0.3, 0, 'r'), g('moab', 5, 1.5, 7)]);
add([g('lead', 50, 0.2, 0, 'f')]);
add([g('bfb', 1, 1)], 'MOON BRUTE! Bring serious firepower.');
// --- 61-70 ------------------------------------------------------------------------------------
add([g('zebra', 150, 0.07), g('moab', 5, 1.5, 6)]);
add([g('pink', 300, 0.04, 0, 'r'), g('rainbow', 20, 0.3, 8), g('ceramic', 10, 0.4, 13, 'f')]);
add([g('lead', 75, 0.12), g('ceramic', 82, 0.15, 6)], 'Diamond rush!');
add([g('moab', 9, 1)]);
add([g('zebra', 50, 0.1), g('bfb', 2, 3, 6)]);
add([g('ceramic', 20, 0.3, 0, 'c'), g('moab', 3, 1.4, 6, 'f')]);
add([g('ceramic', 15, 0.25), g('moab', 4, 1.4, 6), g('bfb', 1, 1, 10)]);
add([g('moab', 6, 1.2), g('bfb', 1, 1, 9)]);
add([g('lead', 70, 0.12, 0, 'cf'), g('rainbow', 50, 0.15, 8, 'cr')]);
add([g('rainbow', 200, 0.05), g('ceramic', 60, 0.15, 11)]);
// --- 71-80 ------------------------------------------------------------------------------------
add([g('moab', 10, 0.8, 0, 'f')]);
add([g('bfb', 3, 2.5), g('ceramic', 40, 0.2, 4)]);
add([g('ceramic', 70, 0.12, 0, 'cr'), g('moab', 4, 1, 8)]);
add([g('moab', 14, 0.7), g('bfb', 2, 2, 8)]);
add([g('bfb', 4, 2), g('ceramic', 60, 0.15, 6, 'f')]);
add([g('ceramic', 150, 0.07, 0, 'r')]);
add([g('moab', 20, 0.5), g('bfb', 2, 2, 8, 'f')]);
add([g('ceramic', 120, 0.08, 0, 'f'), g('bfb', 4, 1.6, 6)]);
add([g('rainbow', 300, 0.04), g('moab', 8, 0.8, 8), g('bfb', 3, 1.6, 12)]);
add([g('zomg', 1, 1), g('moab', 4, 1.2, 10)], 'A RINGED TITAN has awoken!');
// --- 81-90 ------------------------------------------------------------------------------------
add([g('ceramic', 120, 0.07, 0, 'cr'), g('bfb', 4, 1.6, 6)]);
add([g('bfb', 6, 1.6), g('moab', 12, 0.6, 4)]);
add([g('zomg', 1, 1, 0, 'f'), g('ceramic', 80, 0.1, 4)]);
add([g('moab', 20, 0.4, 0, 'f'), g('bfb', 6, 1.2, 6)]);
add([g('zomg', 2, 4), g('ceramic', 100, 0.08, 3, 'c')]);
add([g('bfb', 10, 1)]);
add([g('ceramic', 200, 0.05, 0, 'rf'), g('zomg', 1, 1, 8)]);
add([g('zomg', 2, 3, 0, 'f'), g('bfb', 6, 1.2, 4)]);
add([g('ddt', 3, 2)], 'SHADOW COMETS! Camo, armoured and lightning fast.');
add([g('zomg', 3, 3), g('ddt', 4, 1.5, 6)]);
// --- 91-100 -----------------------------------------------------------------------------------
add([g('bfb', 12, 0.8, 0, 'f'), g('ddt', 4, 1.4, 6)]);
add([g('zomg', 4, 2.5), g('ceramic', 200, 0.05, 4, 'crf')]);
add([g('ddt', 10, 1)]);
add([g('zomg', 5, 2, 0, 'f'), g('bfb', 10, 0.8, 5)]);
add([g('ddt', 12, 0.8, 0, 'f'), g('zomg', 3, 2, 6)]);
add([g('zomg', 8, 1.6), g('ddt', 6, 1, 6)]);
add([g('bfb', 20, 0.5, 0, 'f'), g('zomg', 4, 2, 6, 'f')]);
add([g('zomg', 10, 1.4, 0, 'f'), g('ddt', 10, 0.8, 6, 'f')]);
add([g('ddt', 20, 0.5, 0, 'f'), g('zomg', 6, 1.6, 6, 'f')]);
add([g('bad', 1, 1), g('ddt', 6, 1.2, 12)], 'THE STAR EMPEROR RISES.');

export const ROUNDS: readonly RoundDef[] = R;

/** Freeplay rounds beyond 100: procedurally escalating boss waves. */
export function getRound(n: number): RoundDef {
  if (n <= ROUNDS.length) return ROUNDS[n - 1];
  const k = n - ROUNDS.length;
  const groups: SpawnGroup[] = [];
  groups.push(g('ceramic', 80 + k * 6, 0.05, 0, k % 3 === 0 ? 'crf' : 'f'));
  groups.push(g('zomg', 2 + Math.floor(k / 3), 1.4, 3, 'f'));
  groups.push(g('ddt', 3 + Math.floor(k / 2), 0.8, 6, 'f'));
  if (k % 5 === 0) groups.push(g('bad', 1 + Math.floor(k / 10), 4, 10, k > 15 ? 'f' : ''));
  return { groups, hint: k % 5 === 0 ? 'Freeplay: a Star Emperor appears!' : undefined };
}

/** Health multiplier for boss-class gloops in late freeplay (BTD-style ramping). */
export function bossHealthMul(round: number): number {
  if (round <= 80) return 1;
  if (round <= 100) return 1 + (round - 80) * 0.02;
  if (round <= 150) return 1.4 + (round - 100) * 0.05;
  return 3.9 + (round - 150) * 0.15;
}

export function speedMul(round: number): number {
  if (round <= 80) return 1;
  if (round <= 100) return 1 + (round - 80) * 0.02;
  return 1.4 + (round - 100) * 0.02;
}

/** Cash per pop decreases in later rounds to keep the economy in check. */
export function popCashMul(round: number): number {
  if (round <= 50) return 1;
  if (round <= 60) return 0.5;
  if (round <= 85) return 0.2;
  if (round <= 100) return 0.1;
  return 0.05;
}

export function roundDuration(def: RoundDef): number {
  let t = 0;
  for (const gr of def.groups) t = Math.max(t, gr.delay + gr.gap * (gr.count - 1));
  return t;
}
