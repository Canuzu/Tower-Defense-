/**
 * Bandit progression: every raccoon tower type earns its own XP when it is played, and that XP is
 * spent to unlock upgrade tiers path by path (BTD6-style). Tier 1 of every path is free; tiers 2-5
 * must be unlocked in order. Pure data/logic - the profile owns the state.
 */
import { TOWER_ORDER } from './towers';
import type { TowerId } from './towerTypes';

export type Limits = [number, number, number];
export type UpgradeLimits = Partial<Record<TowerId, Limits>>;

/** XP price of unlocking tier `t` (index = tier) of one path. */
export const TIER_XP: readonly number[] = [0, 0, 60, 250, 1000, 3500];

export const FREE_TIER = 1;

export interface ProgressState {
  /** unspent XP per tower type */
  towerXp: Partial<Record<TowerId, number>>;
  /** total XP ever earned per tower type (for the bandit level shown in menus) */
  towerXpTotal: Partial<Record<TowerId, number>>;
  /** highest unlocked tier per path */
  towerUnlocks: Partial<Record<TowerId, Limits>>;
}

export function unlocksOf(p: ProgressState, id: TowerId): Limits {
  const u = p.towerUnlocks[id];
  return u ? [u[0], u[1], u[2]] : [FREE_TIER, FREE_TIER, FREE_TIER];
}

export function xpOf(p: ProgressState, id: TowerId): number {
  return Math.floor(p.towerXp[id] ?? 0);
}

/** Cost of the next tier on `path`, or null when the path is fully unlocked. */
export function nextUnlockCost(p: ProgressState, id: TowerId, path: number): number | null {
  const tier = unlocksOf(p, id)[path] + 1;
  return tier <= 5 ? TIER_XP[tier] : null;
}

export function canUnlock(p: ProgressState, id: TowerId, path: number): boolean {
  const cost = nextUnlockCost(p, id, path);
  return cost !== null && xpOf(p, id) >= cost;
}

/** Spends XP to unlock the next tier of `path`. Returns the new limit or null. */
export function unlockNext(p: ProgressState, id: TowerId, path: number): number | null {
  if (!canUnlock(p, id, path)) return null;
  const cost = nextUnlockCost(p, id, path)!;
  const u = unlocksOf(p, id);
  u[path]++;
  p.towerUnlocks[id] = u;
  p.towerXp[id] = (p.towerXp[id] ?? 0) - cost;
  return u[path];
}

export function addTowerXp(p: ProgressState, id: TowerId, xp: number) {
  if (xp <= 0) return;
  p.towerXp[id] = (p.towerXp[id] ?? 0) + xp;
  p.towerXpTotal[id] = (p.towerXpTotal[id] ?? 0) + xp;
}

/** Upgrade limits for a new game: everything open in sandbox, dev mode and daily challenges. */
export function limitsFor(p: ProgressState, allOpen: boolean): UpgradeLimits | undefined {
  if (allOpen) return undefined;
  const out: UpgradeLimits = {};
  for (const id of TOWER_ORDER) out[id] = unlocksOf(p, id);
  return out;
}

/**
 * XP one tower earns for a finished round: a little for being on the field (grows with the round)
 * plus a share of the stars it shattered during that round.
 */
export function roundXp(round: number, popsThisRound: number, xpMul: number): number {
  return (6 + round * 0.6 + popsThisRound * 0.25) * xpMul;
}

/** Bandit level shown in menus: derived from total XP (1..20). */
export function banditLevel(totalXp: number): number {
  let lvl = 1;
  while (lvl < 20 && totalXp >= levelXp(lvl + 1)) lvl++;
  return lvl;
}

export function levelXp(level: number): number {
  return level <= 1 ? 0 : Math.round(80 * Math.pow(level - 1, 1.9));
}

/** Total XP needed to unlock every tier of every path of one tower. */
export const FULL_UNLOCK_XP = 3 * TIER_XP.slice(2).reduce((a, b) => a + b, 0);
