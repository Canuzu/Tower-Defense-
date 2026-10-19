import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { addTowerXp, canUnlock, limitsFor, nextUnlockCost, TIER_XP, unlockNext, unlocksOf, type ProgressState } from '../src/game/progression';

const fresh = (): ProgressState => ({ towerXp: {}, towerXpTotal: {}, towerUnlocks: {} });

describe('bandit progression', () => {
  it('starts with only tier 1 open and unlocks tiers in order with XP', () => {
    const p = fresh();
    expect(unlocksOf(p, 'spike')).toEqual([1, 1, 1]);
    expect(nextUnlockCost(p, 'spike', 0)).toBe(TIER_XP[2]);
    expect(canUnlock(p, 'spike', 0)).toBe(false);
    addTowerXp(p, 'spike', TIER_XP[2] + TIER_XP[3] - 1);
    expect(unlockNext(p, 'spike', 0)).toBe(2);
    expect(unlockNext(p, 'spike', 0)).toBeNull(); // 1 XP short of tier 3
    addTowerXp(p, 'spike', 1);
    expect(unlockNext(p, 'spike', 0)).toBe(3);
    expect(p.towerXp.spike).toBe(0);
    expect(p.towerXpTotal.spike).toBe(TIER_XP[2] + TIER_XP[3]);
    expect(unlocksOf(p, 'boomer')).toEqual([1, 1, 1]);
  });

  it('the game refuses upgrades above the unlocked tier, except in sandbox', () => {
    const p = fresh();
    const g = new Game({ mapId: 'meadow', difficulty: 'easy', heroId: null, upgradeLimits: limitsFor(p, false) });
    g.cash = 1e6;
    const t = g.placeTower('spike', 560, 230)!;
    expect(g.upgrade(t, 0)).toBe(true);
    expect(g.upgradeLocked(t, 0)).toBe(true);
    expect(g.upgrade(t, 0)).toBe(false);
    expect(t.tiers[0]).toBe(1);
    // unlocking during the game raises the live limit
    g.config.upgradeLimits!.spike![0] = 2;
    expect(g.upgrade(t, 0)).toBe(true);
    const open = new Game({ mapId: 'meadow', difficulty: 'easy', heroId: null, upgradeLimits: limitsFor(p, true) });
    open.cash = 1e6;
    const t2 = open.placeTower('spike', 560, 230)!;
    for (let i = 0; i < 5; i++) expect(open.upgrade(t2, 0)).toBe(true);
  });
});
