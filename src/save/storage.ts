import type { SaveState } from '../game/Game';
import type { ProgressState } from '../game/progression';
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
  /** bandit progression (see game/progression.ts) */
  towerXp: ProgressState['towerXp'];
  towerXpTotal: ProgressState['towerXpTotal'];
  towerUnlocks: ProgressState['towerUnlocks'];
  /** boss types whose intro banner was already shown */
  seenBosses: string[];
  /**
   * Content unlocked by player level that the player has looked at since (keys from seenKey: a
   * bandit, hero or map); anything unlocked and not in here wears a NEW pill. Content unlocking at
   * or below `seenBase` never counts as new (starter content, and everything a profile from before
   * NEW pills existed had already unlocked).
   */
  seen: string[];
  seenBase: number;
  /** highest player level whose rewards the level-up reveal has shown */
  revealed: number;
  /** best round reached per map and difficulty (map cards: "Record 27/40") */
  bestRounds: Record<string, Partial<Record<Difficulty, number>>>;
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
  towerXp: {},
  towerXpTotal: {},
  towerUnlocks: {},
  seenBosses: [],
  seen: [],
  seenBase: 1,
  revealed: 1,
  bestRounds: {},
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
    towerXp: p.towerXp ?? {},
    towerXpTotal: p.towerXpTotal ?? {},
    towerUnlocks: p.towerUnlocks ?? {},
    seenBosses: p.seenBosses ?? [],
    // profiles from before NEW pills / the level-up reveal: what they already have is not news
    seen: p.seen ?? [],
    seenBase: p.seenBase ?? levelFromXp(p.xp ?? 0).level,
    revealed: p.revealed ?? levelFromXp(p.xp ?? 0).level,
    bestRounds: p.bestRounds ?? {},
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

export type SeenKind = 'tower' | 'hero' | 'map';

/** Key of a level-unlocked thing in `profile.seen`. */
export const seenKey = (kind: SeenKind, id: string) => kind[0] + ':' + id;

/** Unlocked by player level and not looked at yet: shows a NEW pill. */
export function isNew(p: Profile, kind: SeenKind, id: string, unlockLevel: number): boolean {
  return unlockLevel > p.seenBase && levelFromXp(p.xp).level >= unlockLevel && !p.seen.includes(seenKey(kind, id));
}

/** Marks a bandit / hero / map as looked at (its NEW pill goes away). Returns true when it was new. */
export function markSeen(p: Profile, kind: SeenKind, id: string): boolean {
  const key = seenKey(kind, id);
  if (p.seen.includes(key)) return false;
  p.seen.push(key);
  saveProfile(p);
  return true;
}

/** Total XP needed to reach `level` (inverse of levelFromXp). */
export function xpForLevel(level: number): number {
  let xp = 0;
  for (let l = 1; l < level; l++) xp += 400 + (l - 1) * 250;
  return xp;
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
