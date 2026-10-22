import { describe, expect, it } from 'vitest';
import { defaultProfile, isNew, levelFromXp, loadProfile, markSeen, xpForLevel } from '../src/save/storage';

describe('player level unlocks (NEW pills, level-up reveal)', () => {
  it('xpForLevel is the inverse of levelFromXp', () => {
    for (let lv = 1; lv <= 30; lv++) {
      const xp = xpForLevel(lv);
      expect(levelFromXp(xp).level).toBe(lv);
      expect(levelFromXp(xp).into).toBe(0);
      if (xp > 0) expect(levelFromXp(xp - 1).level).toBe(lv - 1);
    }
  });

  it('marks content unlocked by player level as new until it is seen', () => {
    const p = defaultProfile();
    p.xp = xpForLevel(3);
    // starter content (level 1) is never new; level 3 content is, until looked at
    expect(isNew(p, 'tower', 'spike', 1)).toBe(false);
    expect(isNew(p, 'map', 'fjord', 3)).toBe(true);
    // not reached yet
    expect(isNew(p, 'map', 'forge', 4)).toBe(false);
    expect(markSeen(p, 'map', 'fjord')).toBe(true);
    expect(markSeen(p, 'map', 'fjord')).toBe(false);
    expect(isNew(p, 'map', 'fjord', 3)).toBe(false);
  });

  it('profiles from before NEW pills treat what they have as seen', () => {
    const p = loadProfile();
    expect(p.seen).toEqual([]);
    expect(p.seenBase).toBe(1);
    expect(p.revealed).toBe(1);
    const old = { ...defaultProfile(), xp: xpForLevel(5) } as Partial<ReturnType<typeof defaultProfile>>;
    delete old.seen;
    delete old.seenBase;
    delete old.revealed;
    const store = new Map<string, string>([['gloop-guardians/profile/v1', JSON.stringify(old)]]);
    const ls = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k), key: () => null, length: 0, clear: () => store.clear() };
    (globalThis as { localStorage?: unknown }).localStorage = ls;
    try {
      const migrated = loadProfile();
      expect(migrated.seenBase).toBe(5);
      expect(migrated.revealed).toBe(5);
      expect(isNew(migrated, 'map', 'candy', 5)).toBe(false);
    } finally {
      delete (globalThis as { localStorage?: unknown }).localStorage;
    }
  });
});
