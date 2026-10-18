import { makeRng } from '../core/math';
import type { ChallengeDef } from './Game';
import { MAPS } from './maps';
import { TOWER_ORDER } from './towers';
import type { Difficulty } from './types';
import type { TowerId } from './towerTypes';

export function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface DailyChallenge {
  key: string;
  mapId: string;
  difficulty: Difficulty;
  challenge: ChallengeDef;
}

const FLAVOURS = [
  { name: 'Budget Battle', cash: 450 },
  { name: 'Rich Start', cash: 2500 },
  { name: 'Classic Defense', cash: 650 },
  { name: 'Small Gang', cash: 800 },
];

/** Deterministic challenge for a calendar day: same for every player. */
export function dailyFor(key: string): DailyChallenge {
  let seed = 0;
  for (const ch of key) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rnd = makeRng(seed);
  const map = MAPS[Math.floor(rnd() * MAPS.length)];
  const difficulty: Difficulty = rnd() < 0.6 ? 'medium' : 'hard';
  const pool = TOWER_ORDER.filter((id) => id !== 'acorn' && id !== 'dojo');
  const allowed = new Set<TowerId>();
  // always one cheap primary so the first rounds are survivable
  allowed.add(rnd() < 0.5 ? 'spike' : 'boomer');
  const count = 3 + Math.floor(rnd() * 3);
  while (allowed.size < count) allowed.add(pool[Math.floor(rnd() * pool.length)]);
  if (rnd() < 0.4) allowed.add(rnd() < 0.5 ? 'acorn' : 'dojo');
  const flavour = FLAVOURS[Math.floor(rnd() * FLAVOURS.length)];
  const lastRound = 30 + Math.floor(rnd() * 3) * 10;
  const noHero = rnd() < 0.3;
  return {
    key,
    mapId: map.id,
    difficulty,
    challenge: {
      id: 'daily-' + key,
      name: flavour.name,
      desc: '',
      allowed: [...allowed],
      cash: flavour.cash,
      lastRound,
      noHero,
    },
  };
}
