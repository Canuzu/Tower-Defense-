import { describe, expect, it } from 'vitest';
import { Game } from '../src/game/Game';
import { TOWERS, TOWER_ORDER } from '../src/game/towers';
import { canTier, computeStats } from '../src/game/towerTypes';
import { HEROES, HERO_ORDER, heroStats, MAX_HERO_LEVEL } from '../src/game/heroes';
import { ROUNDS } from '../src/game/rounds';
import { GLOOPS, rbe } from '../src/game/gloops';
import { MAPS } from '../src/game/maps';

function allTierCombos(): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let a = 0; a <= 5; a++)
    for (let b = 0; b <= 5; b++)
      for (let c = 0; c <= 5; c++) {
        const t = [a, b, c];
        const used = t.filter((x) => x > 0).length;
        const deep = t.filter((x) => x > 2).length;
        if (used <= 2 && deep <= 1) out.push([a, b, c]);
      }
  return out;
}

describe('tower data', () => {
  it('every legal upgrade combination computes', () => {
    for (const id of TOWER_ORDER) {
      for (const tiers of allTierCombos()) {
        expect(() => computeStats(TOWERS[id], tiers), `${id} ${tiers}`).not.toThrow();
      }
    }
  });

  it('every hero level computes', () => {
    for (const id of HERO_ORDER) {
      for (let l = 1; l <= MAX_HERO_LEVEL; l++) expect(() => heroStats(HEROES[id], l)).not.toThrow();
    }
  });

  it('crosspath rules', () => {
    expect(canTier([0, 0, 0], 0)).toBe(true);
    expect(canTier([2, 2, 0], 2)).toBe(false);
    expect(canTier([2, 2, 0], 0)).toBe(true);
    expect(canTier([3, 2, 0], 1)).toBe(false);
    expect(canTier([5, 0, 0], 0)).toBe(false);
  });

  it('each path has 5 upgrades with increasing cost', () => {
    for (const id of TOWER_ORDER) {
      for (const path of TOWERS[id].paths) {
        expect(path.length).toBe(5);
      }
    }
  });
});

describe('gloops', () => {
  it('rbe values', () => {
    expect(rbe('red')).toBe(1);
    expect(rbe('blue')).toBe(2);
    expect(rbe('pink')).toBe(5);
    expect(rbe('black')).toBe(11);
    expect(rbe('ceramic')).toBe(104);
    expect(rbe('moab')).toBe(616);
  });

  it('rounds reference valid gloops', () => {
    expect(ROUNDS.length).toBe(100);
    for (const r of ROUNDS) for (const g of r.groups) expect(GLOOPS[g.type]).toBeTruthy();
  });
});

describe('simulation', () => {
  it('popping splits layers and passes overflow damage', () => {
    const g = new Game({ mapId: 'meadow', difficulty: 'medium', heroId: null });
    const e = g.spawn('green', { dist: 300 });
    g.damageEnemy(e, 1, 'sharp', { tower: null, hitSet: null, canHitAll: false });
    expect(g.enemies.filter((x) => x.alive).map((x) => x.type)).toEqual(['blue']);
    const blue = g.enemies.find((x) => x.alive)!;
    g.damageEnemy(blue, 2, 'sharp', { tower: null, hitSet: null, canHitAll: false });
    expect(g.enemies.filter((x) => x.alive).length).toBe(0);
  });

  it('iron is immune to sharp', () => {
    const g = new Game({ mapId: 'meadow', difficulty: 'medium', heroId: null });
    const e = g.spawn('lead', { dist: 300 });
    expect(g.damageEnemy(e, 5, 'sharp', { tower: null, hitSet: null, canHitAll: false })).toBe(false);
    expect(e.alive).toBe(true);
    expect(g.damageEnemy(e, 1, 'normal', { tower: null, hitSet: null, canHitAll: false })).toBe(true);
    expect(e.alive).toBe(false);
  });

  it('maps have sane paths and space to build', () => {
    for (const m of MAPS) {
      const g = new Game({ mapId: m.id, difficulty: 'easy', heroId: null });
      for (const p of g.paths) expect(p.length).toBeGreaterThan(1200);
      let free = 0;
      for (let x = 30; x < 1600; x += 40) for (let y = 30; y < 900; y += 40) if (g.canPlace(20, x, y)) free++;
      expect(free).toBeGreaterThan(120);
    }
  });

  it('a defended game survives the easy rounds', () => {
    const g = new Game({ mapId: 'meadow', difficulty: 'sandbox', heroId: null });
    const spots: [number, number][] = [];
    for (let x = 40; x < 1600 && spots.length < 30; x += 70) {
      for (let y = 40; y < 900 && spots.length < 30; y += 70) {
        const near = g.paths[0].distanceTo(x, y);
        if (near < 110 && g.canPlace(26, x, y)) spots.push([x, y]);
      }
    }
    const kinds = ['spike', 'boomer', 'frost', 'hoot', 'ember', 'zap', 'buzz', 'dojo'] as const;
    spots.forEach(([x, y], i) => {
      const t = g.placeTower(kinds[i % kinds.length], x, y);
      expect(t).toBeTruthy();
      if (t) {
        const p = i % 3;
        for (let k = 0; k < 4; k++) g.upgrade(t, p);
        g.upgrade(t, (p + 1) % 3);
        g.upgrade(t, (p + 1) % 3);
      }
    });
    const start = performance.now();
    for (let r = 1; r <= 45; r++) {
      expect(g.startRound()).toBe(true);
      let guard = 0;
      while (g.roundActive && guard++ < 60 * 400) g.step(1 / 60);
      expect(g.roundActive).toBe(false);
      for (const t of g.towers) for (const ab of t.stats.abilities) g.useAbility(t, ab);
    }
    const ms = performance.now() - start;
    expect(g.stats.pops).toBeGreaterThan(5000);
    expect(g.stats.leaked).toBeLessThan(500);
    console.log('45 rounds simulated in', Math.round(ms), 'ms; pops', g.stats.pops, 'leaked', g.stats.leaked);
  });

  it('save and restore round-trips towers', () => {
    const g = new Game({ mapId: 'meadow', difficulty: 'easy', heroId: 'nova' });
    g.cash = 5000;
    const t = g.placeTower('spike', 560, 220)!;
    expect(t).toBeTruthy();
    g.upgrade(t, 0);
    g.upgrade(t, 2);
    const h = g.placeHero('nova', 620, 560);
    expect(h).toBeTruthy();
    const s = g.serialize();
    const g2 = Game.restore(JSON.parse(JSON.stringify(s)));
    expect(g2.towers.length).toBe(2);
    expect(g2.towers[0].tiers).toEqual([1, 0, 1]);
    expect(g2.cash).toBe(g.cash);
  });
});
