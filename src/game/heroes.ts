import { atk, ability, setAbility, type TowerStats } from './towerTypes';

export type HeroId = 'nova' | 'grizz';

export interface HeroDef {
  id: HeroId;
  name: string;
  title: string;
  desc: string;
  cost: number;
  radius: number;
  color: string;
  unlock: number;
  base: () => TowerStats;
  /** index i = upgrade applied when reaching level i + 2 */
  levels: { desc: string; apply: (s: TowerStats) => void }[];
}

export const MAX_HERO_LEVEL = 20;

/** Cumulative XP needed to reach a level. */
export function heroXpFor(level: number): number {
  if (level <= 1) return 0;
  return Math.round(120 * Math.pow(level - 1, 2.3));
}

const nova: HeroDef = {
  id: 'nova',
  name: 'Nova',
  title: 'the Star Cat',
  desc: 'A cosmic cat with a laser blaster. Calls down orbital strikes and goes Supernova.',
  cost: 600,
  radius: 21,
  color: '#7b5cff',
  unlock: 1,
  base: () => ({
    range: 150,
    camo: false,
    canHitAll: false,
    sellMul: 0.7,
    abilities: [],
    attacks: [{ id: 'laser', kind: 'shoot', rate: 0.55, count: 1, spread: 0, proj: { visual: 'laser', damage: 1, pierce: 2, dmgType: 'energy', speed: 1150, radius: 7 } }],
  }),
  levels: [
    { desc: 'Shoots 10% faster.', apply: (s) => { atk(s, 'laser', 'shoot').rate *= 0.9; } },
    { desc: 'Unlocks Orbital Strike.', apply: (s) => { setAbility(s, { id: 'orbital', name: 'Orbital Strike', icon: '☄️', desc: 'Blast the strongest gloop for 60 damage in an area.', cooldown: 35, params: { damage: 60, radius: 80 } }); } },
    { desc: '+1 pierce.', apply: (s) => { atk(s, 'laser', 'shoot').proj.pierce += 1; } },
    { desc: '+1 damage.', apply: (s) => { atk(s, 'laser', 'shoot').proj.damage += 1; } },
    { desc: 'Detects Camo gloops.', apply: (s) => { s.camo = true; } },
    { desc: '+20 range.', apply: (s) => { s.range += 20; } },
    { desc: 'Shoots 15% faster.', apply: (s) => { atk(s, 'laser', 'shoot').rate *= 0.85; } },
    { desc: 'Lasers hit Grape gloops.', apply: (s) => { atk(s, 'laser', 'shoot').proj.dmgType = 'normal'; } },
    { desc: 'Unlocks Supernova.', apply: (s) => { setAbility(s, { id: 'supernova', name: 'Supernova', icon: '🌟', desc: '1500 damage to everything near Nova and stuns.', cooldown: 60, params: { damage: 1500, radius: 320 } }); } },
    { desc: '+5 damage to bosses.', apply: (s) => { atk(s, 'laser', 'shoot').proj.bossBonus = 5; } },
    { desc: '+2 pierce.', apply: (s) => { atk(s, 'laser', 'shoot').proj.pierce += 2; } },
    { desc: '+1 damage.', apply: (s) => { atk(s, 'laser', 'shoot').proj.damage += 1; } },
    { desc: 'Orbital Strike deals 250 damage.', apply: (s) => { ability(s, 'orbital').params.damage = 250; } },
    { desc: 'Shoots 25% faster.', apply: (s) => { atk(s, 'laser', 'shoot').rate *= 0.75; } },
    { desc: 'Twin lasers.', apply: (s) => { const a = atk(s, 'laser', 'shoot'); a.count = 2; a.spread = 8; } },
    { desc: '+2 damage.', apply: (s) => { atk(s, 'laser', 'shoot').proj.damage += 2; } },
    { desc: 'Supernova deals 5000 damage.', apply: (s) => { ability(s, 'supernova').params.damage = 5000; } },
    { desc: '+25 boss damage.', apply: (s) => { atk(s, 'laser', 'shoot').proj.bossBonus = 30; } },
    { desc: 'Triple lasers, +4 damage, much faster.', apply: (s) => { const a = atk(s, 'laser', 'shoot'); a.count = 3; a.spread = 14; a.proj.damage += 4; a.rate *= 0.8; } },
  ],
};

const grizz: HeroDef = {
  id: 'grizz',
  name: 'Grizz',
  title: 'the Bear Chief',
  desc: 'A mighty bear who slams the ground and rallies nearby towers.',
  cost: 750,
  radius: 24,
  color: '#a0612e',
  unlock: 3,
  base: () => ({
    range: 130,
    camo: false,
    canHitAll: false,
    sellMul: 0.7,
    abilities: [],
    buffAura: { rateMul: 1.05 },
    attacks: [{ id: 'slam', kind: 'pulse', rate: 1.4, damage: 2, dmgType: 'normal', pierce: 10, statuses: [], visual: 'slam', rangeMul: 0.6 }],
  }),
  levels: [
    { desc: 'Slam deals +1 damage.', apply: (s) => { atk(s, 'slam', 'pulse').damage += 1; } },
    { desc: 'Unlocks Battle Roar.', apply: (s) => { setAbility(s, { id: 'roar', name: 'Battle Roar', icon: '🐻', desc: 'Towers near Grizz attack 60% faster for 8s.', cooldown: 45, params: { duration: 8, mul: 1.6, radius: 260 } }); } },
    { desc: 'Nearby towers attack 10% faster.', apply: (s) => { s.buffAura!.rateMul = 1.1; } },
    { desc: '+10 slam pierce.', apply: (s) => { atk(s, 'slam', 'pulse').pierce += 10; } },
    { desc: 'Detects Camo gloops.', apply: (s) => { s.camo = true; } },
    { desc: '+20 range.', apply: (s) => { s.range += 20; } },
    { desc: '+2 damage, slams faster.', apply: (s) => { const a = atk(s, 'slam', 'pulse'); a.damage += 2; a.rate *= 0.85; } },
    { desc: 'Nearby towers deal +1 damage.', apply: (s) => { s.buffAura!.damageAdd = 1; } },
    { desc: 'Unlocks Earthquake.', apply: (s) => { setAbility(s, { id: 'earthquake', name: 'Earthquake', icon: '🌋', desc: '200 damage to every gloop and a 2s stun.', cooldown: 60, params: { damage: 200, stun: 2, bossStun: 0.6 } }); } },
    { desc: 'Slams stun gloops.', apply: (s) => { atk(s, 'slam', 'pulse').statuses.push({ kind: 'stun', duration: 0.4, boss: 0.25 }); } },
    { desc: 'Nearby towers get +10% range.', apply: (s) => { s.buffAura!.rangeMul = 1.1; } },
    { desc: '+3 damage.', apply: (s) => { atk(s, 'slam', 'pulse').damage += 3; } },
    { desc: 'Battle Roar doubles attack speed.', apply: (s) => { ability(s, 'roar').params.mul = 2; } },
    { desc: 'Nearby towers attack 15% faster.', apply: (s) => { s.buffAura!.rateMul = 1.15; } },
    { desc: 'Bigger slams, +20 pierce.', apply: (s) => { const a = atk(s, 'slam', 'pulse'); a.rangeMul = 0.8; a.pierce += 20; } },
    { desc: '+5 damage.', apply: (s) => { atk(s, 'slam', 'pulse').damage += 5; } },
    { desc: 'Earthquake deals 1500 damage.', apply: (s) => { ability(s, 'earthquake').params.damage = 1500; } },
    { desc: 'Nearby towers deal +2 damage.', apply: (s) => { s.buffAura!.damageAdd = 2; } },
    { desc: 'Legendary slam: +10 damage and knocks gloops back.', apply: (s) => { const a = atk(s, 'slam', 'pulse'); a.damage += 10; a.statuses.push({ kind: 'knockback', value: 10, boss: 0.3 }); } },
  ],
};

export const HEROES: Record<HeroId, HeroDef> = { nova, grizz };
export const HERO_ORDER: HeroId[] = ['nova', 'grizz'];

export function heroStats(def: HeroDef, level: number): TowerStats {
  const s = def.base();
  for (let l = 2; l <= level; l++) def.levels[l - 2].apply(s);
  return s;
}
