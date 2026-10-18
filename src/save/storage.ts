import type { SaveState } from '../game/Game';
import type { Difficulty } from '../game/types';
import { mirrorToNative } from './durable';

export interface Settings {
  sfx: number;
  music: number;
  haptics: boolean;
  reducedEffects: boolean;
  autoStart: boolean;
  showFps: boolean;
  lang?: 'auto' | 'en' | 'de';
}

export interface Profile {
  v: 1;
  xp: number;
  /** best medals per map: difficulty -> true */
  medals: Record<string, Partial<Record<Difficulty, boolean>>>;
  settings: Settings;
  tutorialDone: boolean;
  stats: {
    games: number;
    wins: number;
    pops: number;
    bossesPopped: number;
    bestRound: number;
    golden?: number;
    tier5?: string[];
    maxBonds?: number;
    bestCombo?: number;
    frenzies?: number;
    heroMax?: number;
    flawless?: number;
    maxCash?: number;
    dailies?: number;
  };
  heroId: 'nova' | 'grizz';
  perks: string[];
  achievements: Record<string, number>;
  dailyDone: Record<string, boolean>;
}

const KEY = 'gloop-guardians/profile/v1';
const SAVE_PREFIX = 'gloop-guardians/save/v1/';

export const defaultProfile = (): Profile => ({
  v: 1,
  xp: 0,
  medals: {},
  settings: { sfx: 0.8, music: 0.45, haptics: true, reducedEffects: false, autoStart: false, showFps: false, lang: 'auto' },
  tutorialDone: false,
  stats: { games: 0, wins: 0, pops: 0, bossesPopped: 0, bestRound: 0 },
  heroId: 'nova',
  perks: [],
  achievements: {},
  dailyDone: {},
});

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    const raw = JSON.stringify(value);
    localStorage.setItem(key, raw);
    mirrorToNative(key, raw);
  } catch {
    /* storage unavailable (private mode) - the game still works, progress is just not kept */
  }
}

export function loadProfile(): Profile {
  const p = read<Profile>(KEY);
  const d = defaultProfile();
  if (!p || p.v !== 1) return d;
  return {
    ...d,
    ...p,
    settings: { ...d.settings, ...p.settings },
    stats: { ...d.stats, ...p.stats },
    medals: p.medals ?? {},
    perks: p.perks ?? [],
    achievements: p.achievements ?? {},
    dailyDone: p.dailyDone ?? {},
  };
}

export function saveProfile(p: Profile) {
  write(KEY, p);
}

export function loadGame(mapId: string, diff: Difficulty): SaveState | null {
  return read<SaveState>(SAVE_PREFIX + mapId + '/' + diff);
}

export function saveGame(s: SaveState) {
  write(SAVE_PREFIX + s.mapId + '/' + s.difficulty, s);
}

export function clearGame(mapId: string, diff: Difficulty) {
  try {
    localStorage.removeItem(SAVE_PREFIX + mapId + '/' + diff);
    mirrorToNative(SAVE_PREFIX + mapId + '/' + diff, null);
  } catch {
    /* ignore */
  }
}

export function latestSave(): SaveState | null {
  let best: SaveState | null = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(SAVE_PREFIX)) continue;
      const s = read<SaveState>(k);
      if (s && (!best || s.savedAt > best.savedAt)) best = s;
    }
  } catch {
    /* ignore */
  }
  return best;
}

/** Wisdom points: one per level gained. */
export function wisdomPoints(p: Profile): number {
  return levelFromXp(p.xp).level - 1 - p.perks.length;
}

/** Player level from XP: each level needs a bit more. */
export function levelFromXp(xp: number): { level: number; into: number; need: number } {
  let level = 1;
  let need = 400;
  let rest = xp;
  while (rest >= need && level < 99) {
    rest -= need;
    level++;
    need = Math.round(400 + (level - 1) * 250);
  }
  return { level, into: rest, need };
}
