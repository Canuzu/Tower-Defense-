/**
 * Balance probe: a scripted "reasonable player" plays real games. Run with
 *   BALANCE=1 npx vitest run tests/balance.test.ts
 * It prints how far the bot gets so difficulty changes can be compared.
 */
import { describe, it } from 'vitest';
import { Game } from '../src/game/Game';
import type { TowerId } from '../src/game/towerTypes';
import { TOWERS } from '../src/game/towers';

type Action = { place: TowerId } | { up: number; path: number };

// a build order a decent player might follow
const PLAN: Action[] = [
  { place: 'spike' },
  { place: 'spike' },
  { up: 0, path: 0 },
  { up: 1, path: 0 },
  { up: 0, path: 2 },
  { up: 1, path: 2 },
  { place: 'boomer' },
  { up: 0, path: 0 },
  { place: 'spike' },
  { up: 2, path: 2 },
  { up: 2, path: 2 },
  { up: 2, path: 0 },
  { up: 3, path: 0 },
  { place: 'hoot' },
  { up: 4, path: 1 },
  { up: 3, path: 1 },
  { up: 0, path: 2 },
  { up: 3, path: 0 },
  { place: 'acorn' },
  { place: 'frost' },
  { up: 3, path: 2 },
  { up: 1, path: 2 },
  { place: 'ember' },
  { up: 6, path: 1 },
  { up: 6, path: 1 },
  { up: 6, path: 1 },
  { up: 4, path: 0 },
  { up: 4, path: 0 },
  { place: 'zap' },
  { up: 7, path: 0 },
  { up: 7, path: 0 },
  { up: 3, path: 0 },
  { up: 3, path: 0 },
  { place: 'dojo' },
  { up: 8, path: 0 },
  { up: 8, path: 0 },
  { up: 0, path: 2 },
  { up: 0, path: 2 },
  { up: 4, path: 0 },
  { up: 4, path: 0 },
  { up: 6, path: 1 },
  { up: 7, path: 0 },
  { up: 5, path: 0 },
  { up: 5, path: 0 },
  { place: 'boomer' },
  { up: 11, path: 2 },
  { up: 11, path: 2 },
  { up: 11, path: 2 },
  { up: 11, path: 2 },
  { up: 11, path: 0 },
  { up: 1, path: 2 },
  { up: 1, path: 2 },
  { up: 2, path: 2 },
  { place: 'buzz' },
  { up: 12, path: 0 },
  { up: 12, path: 0 },
  { up: 12, path: 0 },
  { up: 12, path: 2 },
  { up: 12, path: 2 },
  { up: 7, path: 0 },
  { up: 6, path: 1 },
  { up: 11, path: 2 },
  { up: 3, path: 1 },
  { up: 4, path: 0 },
];

function bestSpot(g: Game, id: TowerId): [number, number] | null {
  const def = TOWERS[id];
  const range = Math.min(def.base().range, 300);
  let best: [number, number] | null = null;
  let bestScore = -1;
  for (let x = 30; x < 1580; x += 22) {
    for (let y = 30; y < 880; y += 22) {
      if (!g.canPlace(def.radius, x, y)) continue;
      let score = 0;
      for (const p of g.paths) score += p.distsWithin(x, y, range, 24).length;
      if (id === 'acorn' || id === 'dojo') score = 1000 - g.towers.reduce((m, t) => Math.min(m, Math.hypot(t.x - x, t.y - y)), 9999) * (id === 'dojo' ? 1 : -0.1);
      if (score > bestScore) {
        bestScore = score;
        best = [x, y];
      }
    }
  }
  return best;
}

function play(mapId: string, diff: 'easy' | 'medium' | 'hard') {
  const g = new Game({ mapId, difficulty: diff, heroId: 'nova' });
  let step = 0;
  let heroPlaced = false;
  const order: number[] = [];
  const tryActions = () => {
    while (step < PLAN.length) {
      const a = PLAN[step];
      if ('place' in a) {
        const cost = g.towerCost(a.place);
        if (g.cash < cost) return;
        const spot = bestSpot(g, a.place);
        if (!spot) {
          step++;
          continue;
        }
        const t = g.placeTower(a.place, spot[0], spot[1]);
        if (t) order.push(t.id);
        step++;
      } else {
        const t = g.towers.filter((x) => !x.isHero)[a.up];
        if (!t || !g.canUpgrade(t, a.path)) {
          step++;
          continue;
        }
        const c = g.upgradeCost(t, a.path)!;
        if (g.cash < c) return;
        g.upgrade(t, a.path);
        step++;
      }
    }
    // after the plan: keep upgrading whatever is affordable
    for (const t of g.towers) {
      for (let p = 0; p < 3; p++) {
        const c = g.upgradeCost(t, p);
        if (c !== null && g.canUpgrade(t, p) && g.cash > c * 1.2) g.upgrade(t, p);
      }
    }
  };
  while (!g.over && !(g.won && !g.freeplay)) {
    if (!heroPlaced && g.round >= 3 && g.cash >= g.heroCost('nova')) {
      const s = bestSpot(g, 'spike');
      if (s) heroPlaced = !!g.placeHero('nova', s[0], s[1]);
    }
    tryActions();
    g.startRound();
    let guard = 0;
    while (g.roundActive && guard++ < 60 * 600) {
      g.step(1 / 60);
      if (g.frenzyReady) g.activateFrenzy();
      for (const t of g.towers) for (const ab of t.stats.abilities) if (g.abilityReady(t, ab.id) && g.enemies.length > 20) g.useAbility(t, ab);
    }
  }
  return { round: g.round, won: g.won, lives: g.lives, towers: g.towers.length, step, pops: g.stats.pops };
}

describe.runIf(process.env.BALANCE)('balance', () => {
  for (const map of ['meadow', 'caverns', 'forge', 'rivers']) {
    for (const diff of ['easy', 'medium', 'hard'] as const) {
      it(`${map} ${diff}`, () => {
        const r = play(map, diff);
        console.log(`${map.padEnd(8)} ${diff.padEnd(6)} -> reached round ${r.round}${r.won ? ' (WON)' : ''}, lives ${r.lives}, towers ${r.towers}, plan step ${r.step}/${PLAN.length}`);
      }, 600000);
    }
  }
});
