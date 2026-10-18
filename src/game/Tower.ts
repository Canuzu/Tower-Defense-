import type { TargetPriority } from './types';
import { computeStats, type TowerDef, type TowerStats, type TowerId } from './towerTypes';
import { HEROES, heroStats, heroXpFor, MAX_HERO_LEVEL, type HeroDef, type HeroId } from './heroes';
import type { Drone, Trap } from './entities';

export interface Buffs {
  rateMul: number;
  rangeMul: number;
  damageAdd: number;
  pierceAdd: number;
  camo: boolean;
  canHitAll: boolean;
  discount: number;
  cashMul: number;
  incomeMul: number;
}

export const defaultBuffs = (): Buffs => ({
  rateMul: 1,
  rangeMul: 1,
  damageAdd: 0,
  pierceAdd: 0,
  camo: false,
  canHitAll: false,
  discount: 0,
  cashMul: 1,
  incomeMul: 1,
});

export interface TimedBuff {
  rateMul: number;
  until: number;
  source: string;
}

export interface ActiveBond {
  synergyId: string;
  other: Tower;
}

export class Tower {
  stats!: TowerStats;
  buffs: Buffs = defaultBuffs();
  timed: TimedBuff[] = [];
  tiers: [number, number, number] = [0, 0, 0];
  priority: TargetPriority = 'first';
  cooldowns = new Map<string, number>();
  abilityCd = new Map<string, number>();
  pops = 0;
  damageDealt = 0;
  spent: number;
  angle = -Math.PI / 2;
  /** visual: time since last attack */
  fireAnim = 9;
  facing = 1;
  stash = 0;
  heroLevel = 1;
  heroXp = 0;
  orbitPhase = Math.random() * Math.PI * 2;
  orbitHits = new Map<number, number>();
  drones: Drone[] = [];
  traps: Trap[] = [];
  trapSpots: { pathIndex: number; dist: number }[] = [];
  shots = 0;
  bonds: ActiveBond[] = [];
  placedAt = 0;
  upgradeFlash = 0;
  /** queued acorn drops for the current round */
  dropTimes: number[] = [];

  readonly def: TowerDef | null;
  readonly hero: HeroDef | null;

  constructor(
    public id: number,
    kind: { tower: TowerDef } | { hero: HeroId },
    public x: number,
    public y: number,
    cost: number,
  ) {
    if ('tower' in kind) {
      this.def = kind.tower;
      this.hero = null;
    } else {
      this.def = null;
      this.hero = HEROES[kind.hero];
    }
    this.spent = cost;
    this.refreshStats();
    for (const ab of this.stats.abilities) this.abilityCd.set(ab.id, ab.cooldown * 0.5);
  }

  get typeId(): TowerId | HeroId {
    return this.def ? this.def.id : this.hero!.id;
  }

  get isHero() {
    return this.hero !== null;
  }

  get name() {
    return this.def ? this.def.name : this.hero!.name;
  }

  get radius() {
    return this.def ? this.def.radius : this.hero!.radius;
  }

  get range() {
    return this.stats.range * this.buffs.rangeMul;
  }

  get camo() {
    return this.stats.camo || this.buffs.camo;
  }

  get canHitAll() {
    return this.stats.canHitAll || this.buffs.canHitAll;
  }

  refreshStats() {
    const prevAbilities = this.stats?.abilities.map((a) => a.id) ?? [];
    this.stats = this.def ? computeStats(this.def, this.tiers) : heroStats(this.hero!, this.heroLevel);
    for (const ab of this.stats.abilities) {
      if (!prevAbilities.includes(ab.id) && !this.abilityCd.has(ab.id)) this.abilityCd.set(ab.id, 0);
    }
  }

  rateFactor(now: number, frenzy: boolean): number {
    let m = this.buffs.rateMul;
    for (const tb of this.timed) if (tb.until > now) m *= tb.rateMul;
    if (frenzy) m *= 1.5;
    return m;
  }

  /** Level up the hero if enough XP; returns number of levels gained. */
  addHeroXp(xp: number): number {
    if (!this.hero) return 0;
    this.heroXp += xp;
    let gained = 0;
    while (this.heroLevel < MAX_HERO_LEVEL && this.heroXp >= heroXpFor(this.heroLevel + 1)) {
      this.heroLevel++;
      gained++;
    }
    if (gained) this.refreshStats();
    return gained;
  }

  sellValue(sandbox: boolean): number {
    return Math.floor(this.spent * (sandbox ? 1 : this.stats.sellMul));
  }
}
