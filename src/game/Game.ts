import { Emitter } from '../core/events';
import { SpatialGrid } from '../core/spatial';
import { TAU, clamp, dist2, rand } from '../core/math';
import { Path } from './path';
import { MAP_BY_ID, WORLD_H, WORLD_W, type MapDef } from './maps';
import { BASE_SPEED, GLOOPS, rbe, regrowParent, type GloopId } from './gloops';
import { DIFFICULTIES, type Difficulty, type DifficultyDef, type DamageType, type StatusApply, type TargetPriority } from './types';
import { getRound, bossHealthMul, popCashMul, roundDuration, speedMul } from './rounds';
import { TOWERS } from './towers';
import { HEROES, type HeroId } from './heroes';
import { canTier, type AttackDef, type ChainAttack, type DroneAttack, type ExplodeDef, type HitscanAttack, type OrbitAttack, type ProjDef, type PulseAttack, type RunnerAttack, type ShootAttack, type StrikeAttack, type TongueAttack, type TowerDef, type TowerId, type TrapAttack, type AuraAttack, type RadialAttack, type AbilityDef } from './towerTypes';
import { Tower, defaultBuffs, type Buffs } from './Tower';
import { Enemy, Projectile, type Drone, type Drop, type Runner, type Scheduled, type Trap } from './entities';
import { NULL_FX, type FxSink } from './fx';
import { SYNERGIES, SYNERGY_RANGE, synergyBetween } from './synergy';
import { PERK_BY_ID } from './perks';
import { heroXpFor } from './heroes';
import type { TowerStats } from './towerTypes';

export const SIM_DT = 1 / 60;
const DEG = Math.PI / 180;

export interface GameEvents extends Record<string, unknown> {
  roundStart: number;
  roundEnd: { round: number; bonus: number };
  gameOver: void;
  victory: void;
  boss: Enemy;
  hint: string;
  heroLevel: { tower: Tower; level: number };
  frenzyReady: void;
  frenzyStart: void;
  frenzyEnd: void;
  combo: number;
  towersChanged: void;
  lifeLost: number;
}

export interface ChallengeDef {
  id: string;
  name: string;
  desc: string;
  allowed?: TowerId[];
  cash?: number;
  lastRound?: number;
  noHero?: boolean;
}

export interface GameConfig {
  mapId: string;
  difficulty: Difficulty;
  heroId: HeroId | null;
  perks?: string[];
  challenge?: ChallengeDef;
}

export interface SavedTower {
  k: 't' | 'h';
  id: string;
  x: number;
  y: number;
  tiers: [number, number, number];
  priority: TargetPriority;
  pops: number;
  spent: number;
  stash: number;
  heroLevel: number;
  heroXp: number;
}

export interface SaveState {
  v: 1;
  mapId: string;
  difficulty: Difficulty;
  heroId: HeroId | null;
  round: number;
  cash: number;
  lives: number;
  freeplay: boolean;
  frenzyMeter: number;
  towers: SavedTower[];
  stats: GameStats;
  savedAt: number;
  perks?: string[];
  challenge?: ChallengeDef;
}

export interface GameStats {
  pops: number;
  leaked: number;
  cashEarned: number;
  towersPlaced: number;
  bestCombo: number;
  bossesPopped: number;
  abilitiesUsed: number;
  goldenPopped: number;
}

interface SpawnItem {
  t: number;
  type: GloopId;
  camo: boolean;
  regrow: boolean;
  fortified: boolean;
}

interface HitInfo {
  damage: number;
  dmgType: DamageType;
  bossBonus?: number;
  bossMul?: number;
  heavyBonus?: number;
  statuses?: StatusApply[];
}

interface HitCtx {
  tower: Tower | null;
  hitSet: Set<number> | null;
  canHitAll: boolean;
}

const popsCache = new Map<GloopId, number>();
/** Number of pop events needed to fully clear a gloop (used for cash when swallowed). */
function popCount(id: GloopId): number {
  let v = popsCache.get(id);
  if (v === undefined) {
    v = 1;
    for (const c of GLOOPS[id].children) v += popCount(c);
    popsCache.set(id, v);
  }
  return v;
}

const PLACE_CELL = 8;

export class Game {
  readonly events = new Emitter<GameEvents>();
  readonly map: MapDef;
  readonly paths: Path[];
  readonly diff: DifficultyDef;
  readonly config: GameConfig;
  readonly perks: Set<string>;
  fx: FxSink = NULL_FX;

  enemies: Enemy[] = [];
  private enemyById = new Map<number, Enemy>();
  towers: Tower[] = [];
  projectiles: Projectile[] = [];
  runners: Runner[] = [];
  drops: Drop[] = [];
  private scheduled: Scheduled[] = [];

  cash: number;
  lives: number;
  /** the round currently being played, or the next round to start when idle */
  round: number;
  roundActive = false;
  roundTime = 0;
  private spawnQueue: SpawnItem[] = [];
  private spawnCounter = 0;
  time = 0;
  speed = 1;
  paused = false;
  autoStart = false;
  over = false;
  won = false;
  freeplay = false;
  hintsShown = new Set<number>();

  frenzyMeter = 0;
  frenzyT = 0;
  frenzyReady = false;
  combo = 0;
  comboLast = -10;

  stats: GameStats = { pops: 0, leaked: 0, cashEarned: 0, towersPlaced: 0, bestCombo: 0, bossesPopped: 0, abilitiesUsed: 0, goldenPopped: 0 };

  private grid = new SpatialGrid<Enemy>(64);
  private tmp: Enemy[] = [];
  private tmp2: Enemy[] = [];
  private nextId = 1;
  private acc = 0;
  private buffsDirty = true;
  private buffTimer = 0;
  private placeMask: Uint8Array;
  private maskW: number;
  private maskH: number;
  private autoStartTimer = -1;
  private sample = { x: 0, y: 0 };
  /** snapshot of the state at the start of the current round (for "retry round") */
  roundSnapshot: SaveState | null = null;

  constructor(config: GameConfig) {
    this.config = config;
    this.perks = new Set(config.perks ?? []);
    this.map = MAP_BY_ID[config.mapId];
    if (!this.map) throw new Error('unknown map ' + config.mapId);
    this.diff = DIFFICULTIES[config.difficulty];
    this.paths = this.map.paths.map((p) => new Path(p));
    this.cash = this.diff.cash;
    this.lives = this.diff.lives;
    this.round = this.diff.startRound;
    this.maskW = Math.ceil(WORLD_W / PLACE_CELL);
    this.maskH = Math.ceil(WORLD_H / PLACE_CELL);
    this.placeMask = new Uint8Array(this.maskW * this.maskH);
    this.buildPlaceMask();
    if (this.diff.startRound > 1) this.cash += this.startingBonus(this.diff.startRound);
    if (this.perks.has('cash1')) this.cash += 100;
    if (this.perks.has('cash2')) this.cash += 200;
    if (this.perks.has('lives') && config.difficulty !== 'champion' && !this.sandbox) this.lives += 15;
    if (config.challenge?.cash !== undefined) this.cash = config.challenge.cash;
  }

  /** Whether a tower type may be used (daily challenges restrict the roster). */
  isAllowed(id: TowerId): boolean {
    const a = this.config.challenge?.allowed;
    return !a || a.includes(id);
  }

  get bondRange() {
    return SYNERGY_RANGE * (this.perks.has('bonds') ? 1.2 : 1);
  }

  /** Applies permanent perks to a tower's freshly computed stats. */
  private towerMod = (t: Tower, s: TowerStats) => {
    for (const id of this.perks) PERK_BY_ID[id]?.tower?.(t, s);
    if (this.perks.has('acorns') && t.typeId === 'acorn' && s.income && s.income.drops > 0) s.income.drops += 1;
  };

  get sandbox() {
    return this.config.difficulty === 'sandbox';
  }

  get lastRound() {
    return this.config.challenge?.lastRound ?? this.diff.endRound;
  }

  get hero(): Tower | null {
    return this.towers.find((t) => t.isHero) ?? null;
  }

  get frenzyMax() {
    return 150 + this.round * 25;
  }

  get frenzyDuration() {
    return this.perks.has('frenzy1') ? 13 : 10;
  }

  private startingBonus(startRound: number) {
    // champion mode skips rounds 1-5: give roughly the cash those rounds would have yielded
    let c = 0;
    for (let r = 1; r < startRound; r++) c += 100 + r;
    return Math.round(c * 0.5);
  }

  // ------------------------------------------------------------------------------------------
  // Placement
  // ------------------------------------------------------------------------------------------

  private buildPlaceMask() {
    const m = this.placeMask;
    const W = this.maskW;
    const stamp = (cx: number, cy: number, r: number, v: number) => {
      const x0 = Math.max(0, Math.floor((cx - r) / PLACE_CELL));
      const x1 = Math.min(this.maskW - 1, Math.floor((cx + r) / PLACE_CELL));
      const y0 = Math.max(0, Math.floor((cy - r) / PLACE_CELL));
      const y1 = Math.min(this.maskH - 1, Math.floor((cy + r) / PLACE_CELL));
      const r2 = r * r;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const px = (x + 0.5) * PLACE_CELL - cx;
          const py = (y + 0.5) * PLACE_CELL - cy;
          if (px * px + py * py <= r2) m[y * W + x] = Math.max(m[y * W + x], v);
        }
      }
    };
    const hw = this.map.pathWidth / 2 + 2;
    for (const p of this.paths) {
      for (let i = 0; i < p.count; i += 2) stamp(p.xs[i], p.ys[i], hw, 1);
    }
    for (const o of this.map.obstacles) {
      if (!o.blocks) continue;
      if (o.ry !== undefined) {
        // ellipse
        const rot = o.rot ?? 0;
        const c = Math.cos(-rot);
        const s = Math.sin(-rot);
        const rr = Math.max(o.r, o.ry);
        const x0 = Math.max(0, Math.floor((o.x - rr) / PLACE_CELL));
        const x1 = Math.min(this.maskW - 1, Math.floor((o.x + rr) / PLACE_CELL));
        const y0 = Math.max(0, Math.floor((o.y - rr) / PLACE_CELL));
        const y1 = Math.min(this.maskH - 1, Math.floor((o.y + rr) / PLACE_CELL));
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const px = (x + 0.5) * PLACE_CELL - o.x;
            const py = (y + 0.5) * PLACE_CELL - o.y;
            const lx = px * c - py * s;
            const ly = px * s + py * c;
            if ((lx * lx) / (o.r * o.r) + (ly * ly) / (o.ry * o.ry) <= 1) m[y * W + x] = 2;
          }
        }
      } else {
        stamp(o.x, o.y, o.r, 2);
      }
    }
  }

  /** 0 = free, 1 = track, 2 = obstacle */
  maskAt(x: number, y: number): number {
    const cx = Math.floor(x / PLACE_CELL);
    const cy = Math.floor(y / PLACE_CELL);
    if (cx < 0 || cy < 0 || cx >= this.maskW || cy >= this.maskH) return 2;
    return this.placeMask[cy * this.maskW + cx];
  }

  canPlace(radius: number, x: number, y: number, ignore: Tower | null = null): boolean {
    if (x - radius < 2 || y - radius < 2 || x + radius > WORLD_W - 2 || y + radius > WORLD_H - 2) return false;
    // sample the footprint
    const r = radius - 3;
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * TAU;
      if (this.maskAt(x + Math.cos(ang) * r, y + Math.sin(ang) * r) !== 0) return false;
    }
    if (this.maskAt(x, y) !== 0) return false;
    if (this.maskAt(x + r * 0.5, y) !== 0 || this.maskAt(x - r * 0.5, y) !== 0) return false;
    if (this.maskAt(x, y + r * 0.5) !== 0 || this.maskAt(x, y - r * 0.5) !== 0) return false;
    for (const t of this.towers) {
      if (t === ignore) continue;
      const rr = t.radius + radius - 4;
      if (dist2(t.x, t.y, x, y) < rr * rr) return false;
    }
    return true;
  }

  private discountAt(x: number, y: number): number {
    let d = 0;
    for (const s of this.towers) {
      const aura = s.stats.buffAura;
      if (!aura?.discount) continue;
      const r = aura.range ?? s.range;
      if (aura.global || dist2(s.x, s.y, x, y) <= r * r) d = Math.max(d, aura.discount);
    }
    return d;
  }

  priceOf(base: number, discount = 0) {
    const thrift = this.perks.has('thrift') ? 0.97 : 1;
    return Math.max(5, Math.round((base * this.diff.costMul * thrift * (1 - discount)) / 5) * 5);
  }

  towerCost(id: TowerId, x?: number, y?: number): number {
    const d = x !== undefined && y !== undefined ? this.discountAt(x, y) : 0;
    return this.priceOf(TOWERS[id].cost, d);
  }

  heroCost(id: HeroId): number {
    return this.priceOf(HEROES[id].cost * (this.perks.has('herocost') ? 0.85 : 1));
  }

  upgradeCost(t: Tower, path: number): number | null {
    if (!t.def) return null;
    const tier = t.tiers[path];
    if (tier >= 5) return null;
    return this.priceOf(t.def.paths[path][tier].cost, t.buffs.discount);
  }

  canUpgrade(t: Tower, path: number): boolean {
    return !!t.def && canTier(t.tiers, path);
  }

  placeTower(id: TowerId, x: number, y: number): Tower | null {
    if (!this.isAllowed(id)) return null;
    const def = TOWERS[id];
    const cost = this.towerCost(id, x, y);
    if (!this.sandbox && this.cash < cost) return null;
    if (!this.canPlace(def.radius, x, y)) return null;
    this.spend(cost);
    const t = new Tower(this.nextId++, { tower: def }, x, y, cost);
    this.initTower(t);
    this.stats.towersPlaced++;
    this.fx.place(t);
    return t;
  }

  placeHero(id: HeroId, x: number, y: number): Tower | null {
    if (this.hero) return null;
    const def = HEROES[id];
    const cost = this.heroCost(id);
    if (!this.sandbox && this.cash < cost) return null;
    if (!this.canPlace(def.radius, x, y)) return null;
    this.spend(cost);
    const t = new Tower(this.nextId++, { hero: id }, x, y, cost);
    const startLevel = this.perks.has('hero3') ? 4 : this.perks.has('hero1') ? 2 : 1;
    if (startLevel > 1) {
      t.heroLevel = startLevel;
      t.heroXp = heroXpFor(startLevel);
    }
    this.initTower(t);
    this.fx.place(t);
    return t;
  }

  private initTower(t: Tower) {
    t.placedAt = this.time;
    t.mod = this.towerMod;
    t.refreshStats();
    this.towers.push(t);
    this.computeTrapSpots(t);
    this.buffsDirty = true;
    this.recomputeBuffs();
    this.events.emit('towersChanged', undefined);
  }

  private computeTrapSpots(t: Tower) {
    t.trapSpots = [];
    this.paths.forEach((p, pi) => {
      for (const d of p.distsWithin(t.x, t.y, Math.max(60, t.range), 14)) t.trapSpots.push({ pathIndex: pi, dist: d });
    });
  }

  upgrade(t: Tower, path: number): boolean {
    if (!this.canUpgrade(t, path)) return false;
    const cost = this.upgradeCost(t, path)!;
    if (!this.sandbox && this.cash < cost) return false;
    this.spend(cost);
    t.spent += cost;
    t.tiers[path]++;
    t.refreshStats();
    t.upgradeFlash = 1;
    this.computeTrapSpots(t);
    this.buffsDirty = true;
    this.recomputeBuffs();
    this.fx.upgrade(t);
    this.events.emit('towersChanged', undefined);
    return true;
  }

  sell(t: Tower) {
    const i = this.towers.indexOf(t);
    if (i < 0) return;
    const value = t.sellValue(this.sandbox) + Math.floor(t.stash);
    this.towers.splice(i, 1);
    this.earn(value, false);
    for (const tr of t.traps) tr.alive = false;
    this.runners = this.runners.filter((r) => r.owner !== t);
    for (const d of this.drops) if (d.owner === t && d.alive) this.collectDrop(d, false);
    this.buffsDirty = true;
    this.recomputeBuffs();
    this.fx.sell(t);
    this.fx.cash(t.x, t.y - 20, value);
    this.events.emit('towersChanged', undefined);
  }

  setPriority(t: Tower, p: TargetPriority) {
    t.priority = p;
  }

  withdraw(t: Tower) {
    if (t.stash <= 0) return;
    const v = Math.floor(t.stash);
    t.stash = 0;
    this.earn(v, false);
    this.fx.cash(t.x, t.y - 30, v);
    this.fx.sound('cash', 1, 0.8);
  }

  private spend(v: number) {
    if (this.sandbox) return;
    this.cash -= v;
  }

  earn(v: number, counts = true) {
    this.cash += v;
    if (counts) this.stats.cashEarned += v;
  }

  // ------------------------------------------------------------------------------------------
  // Buffs & synergies
  // ------------------------------------------------------------------------------------------

  /** Bond partners a tower of `id` at (x, y) would form (used for placement preview). */
  previewBonds(id: TowerId, x: number, y: number): { tower: Tower; color: string; name: string }[] {
    const out: { tower: Tower; color: string; name: string }[] = [];
    const seen = new Set<string>();
    for (const o of this.towers) {
      if (!o.def) continue;
      const syn = synergyBetween(id, o.def.id);
      if (!syn) continue;
      if (dist2(o.x, o.y, x, y) > this.bondRange * this.bondRange) continue;
      out.push({ tower: o, color: syn.color, name: seen.has(syn.id) ? '' : syn.name });
      seen.add(syn.id);
    }
    return out;
  }

  recomputeBuffs() {
    const towers = this.towers;
    for (const t of towers) {
      t.buffs = defaultBuffs();
      t.bonds = [];
    }
    // support auras: max within a source type, stacked across types
    const perType = new Map<Tower, Map<string, Buffs>>();
    for (const s of towers) {
      const aura = s.stats.buffAura;
      if (!aura) continue;
      const r = aura.range ?? s.stats.range;
      for (const t of towers) {
        if (aura.only && t.typeId !== aura.only) continue;
        if (!aura.global && dist2(s.x, s.y, t.x, t.y) > (r + t.radius) * (r + t.radius)) continue;
        let m = perType.get(t);
        if (!m) perType.set(t, (m = new Map()));
        const key = String(s.typeId);
        let b = m.get(key);
        if (!b) m.set(key, (b = defaultBuffs()));
        b.rateMul = Math.max(b.rateMul, aura.rateMul ?? 1);
        b.rangeMul = Math.max(b.rangeMul, aura.rangeMul ?? 1);
        b.damageAdd = Math.max(b.damageAdd, aura.damageAdd ?? 0);
        b.pierceAdd = Math.max(b.pierceAdd, aura.pierceAdd ?? 0);
        b.camo ||= !!aura.camo;
        b.canHitAll ||= !!aura.canHitAll;
        b.discount = Math.max(b.discount, aura.discount ?? 0);
        b.cashMul = Math.max(b.cashMul, aura.cashMul ?? 1);
      }
    }
    for (const [t, m] of perType) {
      for (const b of m.values()) {
        const tb = t.buffs;
        tb.rateMul *= b.rateMul;
        tb.rangeMul *= b.rangeMul;
        tb.damageAdd += b.damageAdd;
        tb.pierceAdd += b.pierceAdd;
        tb.camo ||= b.camo;
        tb.canHitAll ||= b.canHitAll;
        tb.discount = Math.max(tb.discount, b.discount);
        tb.cashMul *= b.cashMul;
      }
    }
    // synergy bonds
    const r2 = this.bondRange * this.bondRange;
    for (let i = 0; i < towers.length; i++) {
      const a = towers[i];
      if (!a.def) continue;
      for (let j = i + 1; j < towers.length; j++) {
        const b = towers[j];
        if (!b.def) continue;
        const syn = synergyBetween(a.def.id, b.def.id);
        if (!syn) continue;
        if (dist2(a.x, a.y, b.x, b.y) > r2) continue;
        a.bonds.push({ synergyId: syn.id, other: b });
        b.bonds.push({ synergyId: syn.id, other: a });
      }
    }
    for (const t of towers) {
      if (!t.def) continue;
      const applied = new Set<string>();
      for (const bond of t.bonds) {
        if (applied.has(bond.synergyId)) continue;
        applied.add(bond.synergyId);
        const syn = SYNERGIES.find((s) => s.id === bond.synergyId)!;
        this.applySynergy(t, syn.id, t.def.id === syn.a);
      }
    }
    this.buffsDirty = false;
  }

  private applySynergy(t: Tower, id: string, isA: boolean) {
    const b = t.buffs;
    switch (id) {
      case 'spotter':
        if (isA) {
          b.rangeMul *= 1.15;
          b.pierceAdd += 1;
        } else b.rateMul *= 1.1;
        break;
      case 'shatter':
        if (isA) b.damageAdd += 1;
        else b.rangeMul *= 1.1;
        break;
      case 'thermal':
        b.rateMul *= 1.15;
        break;
      case 'plasma':
        b.canHitAll = true;
        break;
      case 'pollination':
        if (isA) b.rateMul *= 1.15;
        else b.incomeMul *= 1.25;
        break;
      case 'stingquill':
        b.pierceAdd += 1;
        break;
      case 'napalm':
        if (isA) b.rateMul *= 1.1;
        else b.pierceAdd += 2;
        break;
      case 'lightningrod':
        if (isA) b.damageAdd += 1;
        else b.rangeMul *= 1.1;
        break;
      case 'superconductor':
        if (isA) b.rangeMul *= 1.1;
        else b.rateMul *= 1.2;
        break;
      case 'harvestguard':
        if (isA) b.incomeMul *= 1.15;
        else b.rangeMul *= 1.1;
        break;
      case 'packhunt':
        if (isA) b.rangeMul *= 1.15;
        else b.camo = true;
        break;
      case 'honeyfox':
        if (isA) b.pierceAdd += 1;
        else b.rateMul *= 1.2;
        break;
    }
  }

  // ------------------------------------------------------------------------------------------
  // Rounds
  // ------------------------------------------------------------------------------------------

  startRound(): boolean {
    if (this.roundActive || this.over) return false;
    if (this.won && !this.freeplay) return false;
    this.roundSnapshot = this.serialize();
    const def = getRound(this.round);
    this.spawnQueue = [];
    for (const gr of def.groups) {
      for (let i = 0; i < gr.count; i++) {
        this.spawnQueue.push({ t: gr.delay + i * gr.gap, type: gr.type, camo: !!gr.camo, regrow: !!gr.regrow, fortified: !!gr.fortified });
      }
    }
    if (this.round >= 6 && !this.sandbox && Math.random() < 0.28) {
      const dur = Math.max(4, roundDuration(def));
      this.spawnQueue.push({ t: dur * rand(0.25, 0.75), type: 'golden', camo: false, regrow: false, fortified: false });
    }
    this.spawnQueue.sort((a, b) => a.t - b.t);
    this.roundActive = true;
    this.roundTime = 0;
    this.autoStartTimer = -1;
    if (def.hint && !this.hintsShown.has(this.round)) {
      this.hintsShown.add(this.round);
      this.events.emit('hint', def.hint);
    }
    this.scheduleIncome(roundDuration(def) + 3);
    this.fx.sound('roundStart');
    this.events.emit('roundStart', this.round);
    return true;
  }

  private scheduleIncome(duration: number) {
    for (const t of this.towers) {
      const inc = t.stats.income;
      if (!inc || inc.drops <= 0) continue;
      t.dropTimes = [];
      for (let i = 0; i < inc.drops; i++) t.dropTimes.push(((i + 0.5) / inc.drops) * duration);
    }
  }

  private dropValue(t: Tower) {
    return t.stats.income!.perDrop * t.buffs.incomeMul;
  }

  private updateIncome() {
    for (const t of this.towers) {
      const inc = t.stats.income;
      if (!inc || t.dropTimes.length === 0) continue;
      while (t.dropTimes.length && t.dropTimes[0] <= this.roundTime) {
        t.dropTimes.shift();
        this.releaseDrop(t, inc.direct, inc.autoCollect);
      }
    }
  }

  private releaseDrop(t: Tower, direct: boolean, auto: boolean) {
    const v = this.dropValue(t);
    if (t.stats.bank) {
      t.stash = Math.min(t.stats.bank.capacity, t.stash + v);
      this.fx.text(t.x, t.y - 34, '+$' + Math.round(v), '#ffe066', 14);
      return;
    }
    if (direct) {
      this.earn(v);
      this.fx.cash(t.x, t.y - 30, v);
      return;
    }
    const ang = rand(0, TAU);
    const d = rand(30, 70);
    this.drops.push({
      alive: true,
      x: t.x,
      y: t.y,
      sx: t.x,
      sy: t.y - 10,
      tx: clamp(t.x + Math.cos(ang) * d, 20, WORLD_W - 20),
      ty: clamp(t.y + Math.sin(ang) * d, 20, WORLD_H - 20),
      t: 0,
      value: v,
      owner: t,
      collecting: false,
      collectT: 0,
      auto,
    });
    this.fx.sound('acorn', 0.5);
  }

  collectDrop(d: Drop, tapped: boolean) {
    if (!d.alive || d.collecting) return;
    d.collecting = true;
    d.collectT = 0;
    const v = d.value * (tapped ? 1.2 : 1);
    this.earn(v);
    this.fx.cash(d.x, d.y - 10, v);
    this.fx.sound('cash', 0.6, tapped ? 1.2 : 1);
  }

  /** Collect any acorn under the pointer. */
  collectAt(x: number, y: number, r = 34): boolean {
    let any = false;
    for (const d of this.drops) {
      if (!d.alive || d.collecting || d.t < 0.45) continue;
      if (dist2(d.x, d.y, x, y) <= r * r) {
        this.collectDrop(d, true);
        any = true;
      }
    }
    return any;
  }

  private endRound() {
    this.roundActive = false;
    const n = this.round;
    // flush income
    for (const t of this.towers) {
      const inc = t.stats.income;
      if (inc) {
        while (t.dropTimes.length) {
          t.dropTimes.shift();
          this.releaseDrop(t, true, true);
        }
        if (inc.bonusPerRound > 0) {
          const b = inc.bonusPerRound * t.buffs.incomeMul;
          this.earn(b);
          this.fx.cash(t.x, t.y - 40, b);
        }
      }
      if (t.stats.bank && t.stash > 0) {
        t.stash = Math.min(t.stats.bank.capacity, t.stash * (1 + t.stats.bank.interest));
      }
    }
    for (const d of this.drops) if (d.alive && !d.collecting) this.collectDrop(d, false);
    for (const t of this.towers) for (const tr of t.traps) tr.alive = false;
    const bonus = Math.round((100 + n) * (this.perks.has('bonus') ? 1.2 : 1));
    this.earn(bonus);
    // hero xp
    const hero = this.hero;
    if (hero) {
      const gained = hero.addHeroXp((60 + 30 * n) * (this.perks.has('hero2') ? 1.25 : 1));
      if (gained) {
        this.fx.sound('levelup');
        this.fx.text(hero.x, hero.y - 40, 'LEVEL ' + hero.heroLevel + '!', '#ffe066', 22);
        this.buffsDirty = true;
        this.events.emit('heroLevel', { tower: hero, level: hero.heroLevel });
      }
    }
    this.fx.sound('roundEnd');
    this.events.emit('roundEnd', { round: n, bonus });
    this.round++;
    if (n >= this.lastRound && !this.won && !this.sandbox) {
      this.won = true;
      this.fx.sound('victory');
      this.events.emit('victory', undefined);
      return;
    }
    if (this.autoStart) this.autoStartTimer = 0.6;
  }

  continueFreeplay() {
    this.freeplay = true;
  }

  // ------------------------------------------------------------------------------------------
  // Main loop
  // ------------------------------------------------------------------------------------------

  /** Advance by real seconds (applies game speed, fixed-step). */
  update(realDt: number) {
    if (this.paused || this.over) return;
    this.acc += Math.min(realDt, 0.1) * this.speed;
    let steps = 0;
    while (this.acc >= SIM_DT && steps < 12) {
      this.step(SIM_DT);
      this.acc -= SIM_DT;
      steps++;
    }
    if (steps >= 12) this.acc = 0;
  }

  step(dt: number) {
    if (this.over) return;
    this.time += dt;
    if (this.sandbox) {
      this.cash = 9_999_999;
      this.lives = 999_999;
    }
    if (this.roundActive) {
      this.roundTime += dt;
      while (this.spawnQueue.length && this.spawnQueue[0].t <= this.roundTime) {
        const s = this.spawnQueue.shift()!;
        this.spawn(s.type, { camo: s.camo, regrow: s.regrow, fortified: s.fortified });
      }
      this.updateIncome();
    } else if (this.autoStartTimer >= 0) {
      this.autoStartTimer -= dt;
      if (this.autoStartTimer < 0) this.startRound();
    }

    // scheduled ability effects
    if (this.scheduled.length) {
      const due = this.scheduled.filter((s) => s.at <= this.time);
      if (due.length) {
        this.scheduled = this.scheduled.filter((s) => s.at > this.time);
        for (const s of due) s.fn();
      }
    }

    this.buffTimer -= dt;
    if (this.buffsDirty || this.buffTimer <= 0) {
      this.recomputeBuffs();
      this.buffTimer = 0.5;
    }

    this.updateEnemies(dt);
    this.rebuildGrid();
    this.updateTowers(dt);
    this.updateProjectiles(dt);
    this.updateRunners(dt);
    this.updateDrops(dt);

    // compact
    if (this.enemies.some((e) => !e.alive)) {
      for (const e of this.enemies) if (!e.alive) this.enemyById.delete(e.id);
      this.enemies = this.enemies.filter((e) => e.alive);
    }
    if (this.projectiles.some((p) => !p.alive)) this.projectiles = this.projectiles.filter((p) => p.alive);

    // frenzy & combo
    if (this.frenzyT > 0) {
      this.frenzyT -= dt;
      if (this.frenzyT <= 0) this.events.emit('frenzyEnd', undefined);
    }
    if (this.combo > 0 && this.time - this.comboLast > 0.9) {
      if (this.combo >= 25) {
        const bonus = Math.floor(this.combo / 10) * popCashMul(this.round);
        if (bonus > 0) this.earn(bonus);
        this.events.emit('combo', this.combo);
      }
      this.stats.bestCombo = Math.max(this.stats.bestCombo, this.combo);
      this.combo = 0;
    }

    if (this.roundActive && this.spawnQueue.length === 0 && this.enemies.length === 0) this.endRound();
  }

  private rebuildGrid() {
    this.grid.clear();
    for (const e of this.enemies) if (e.alive) this.grid.insert(e);
  }

  // ------------------------------------------------------------------------------------------
  // Enemies
  // ------------------------------------------------------------------------------------------

  spawn(type: GloopId, opts: { camo?: boolean; regrow?: boolean; fortified?: boolean; pathIndex?: number; dist?: number } = {}): Enemy {
    const pi = opts.pathIndex ?? this.spawnCounter++ % this.paths.length;
    const def = GLOOPS[type];
    const laneMax = Math.max(0, this.map.pathWidth / 2 - def.radius - 4);
    const e = new Enemy(this.nextId++, type, pi, opts.dist ?? 0, {
      camo: opts.camo,
      regrowMax: opts.regrow ? type : null,
      fortified: opts.fortified,
      hpMul: bossHealthMul(this.round),
      lane: def.boss ? 0 : rand(-laneMax, laneMax) * 0.8,
    });
    e.speedMul = speedMul(this.round);
    if (type === 'golden') {
      e.maxHp = e.hp = 6 + this.round * 0.9;
      this.events.emit('hint', '✨ A Golden Gloop appeared! Pop it before it escapes for bonus cash!');
    }
    this.placeEnemy(e);
    this.enemies.push(e);
    this.enemyById.set(e.id, e);
    if (def.boss && !opts.dist) {
      this.fx.sound('boss');
      this.events.emit('boss', e);
    }
    return e;
  }

  private placeEnemy(e: Enemy) {
    const p = this.paths[e.pathIndex];
    const ang = p.sample(e.dist, this.sample);
    e.angle = ang;
    e.x = this.sample.x - Math.sin(ang) * e.lane;
    e.y = this.sample.y + Math.cos(ang) * e.lane;
  }

  private updateEnemies(dt: number) {
    const list = this.enemies;
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const e = list[i];
      if (!e.alive) continue;
      e.age += dt;
      if (e.hitFlash > 0) e.hitFlash -= dt;
      if (e.slowT > 0 && (e.slowT -= dt) <= 0) e.slowMul = 1;
      if (e.auraSlowT > 0 && (e.auraSlowT -= dt) <= 0) e.auraSlow = 1;
      if (e.freezeT > 0) e.freezeT -= dt;
      if (e.stunT > 0) e.stunT -= dt;
      if (e.markT > 0 && (e.markT -= dt) <= 0) e.markMul = 1;
      if (e.vulnT > 0 && (e.vulnT -= dt) <= 0) e.vulnAdd = 0;
      if (e.shockT > 0 && (e.shockT -= dt) <= 0) e.shockAdd = 0;

      if (e.burnT > 0) {
        e.burnT -= dt;
        e.burnAcc += dt;
        if (e.burnAcc >= 0.5) {
          e.burnAcc -= 0.5;
          this.damageEnemy(e, e.burnDps * 0.5, e.burnType, { tower: e.burnSrc, hitSet: null, canHitAll: e.burnSrc?.canHitAll ?? false }, true);
          if (!e.alive) continue;
        }
        if (e.burnT <= 0) e.burnDps = 0;
      }
      if (e.poisonT > 0) {
        e.poisonT -= dt;
        e.poisonAcc += dt;
        if (e.poisonAcc >= 0.5) {
          e.poisonAcc -= 0.5;
          this.damageEnemy(e, e.poisonDps * 0.5, 'normal', { tower: e.poisonSrc, hitSet: null, canHitAll: true }, true);
          if (!e.alive) continue;
        }
        if (e.poisonT <= 0) e.poisonDps = 0;
      }

      if (e.regrowMax && e.type !== e.regrowMax) {
        e.regrowT += dt;
        if (e.regrowT >= 2.5) {
          const parent = regrowParent(e.type, e.regrowMax);
          e.regrowT = 0;
          if (parent) e.morph(parent);
        }
      }

      if (e.freezeT <= 0 && e.stunT <= 0) {
        const slow = Math.min(e.slowMul, e.auraSlow);
        e.dist += BASE_SPEED * e.def.speed * e.speedMul * slow * dt;
      }
      const path = this.paths[e.pathIndex];
      if (e.dist >= path.length) {
        this.leak(e);
        continue;
      }
      this.placeEnemy(e);
    }
  }

  private leak(e: Enemy) {
    e.alive = false;
    if (e.type === 'golden') {
      this.fx.text(e.x - 60, e.y, 'It got away!', '#ffe066', 18);
      return;
    }
    let lives = Math.ceil(e.hp);
    for (const c of e.def.children) lives += rbe(c);
    if (this.sandbox) {
      this.fx.leak(e, 0);
      return;
    }
    this.lives -= lives;
    this.stats.leaked += lives;
    this.fx.leak(e, lives);
    this.events.emit('lifeLost', lives);
    if (this.lives <= 0) {
      this.lives = 0;
      this.over = true;
      this.roundActive = false;
      this.fx.sound('defeat');
      this.events.emit('gameOver', undefined);
    }
  }

  /** Apply damage; returns true if any damage was dealt. */
  damageEnemy(e: Enemy, amount: number, type: DamageType, ctx: HitCtx, raw = false): boolean {
    if (!e.alive || amount <= 0) return false;
    if (!ctx.canHitAll && e.def.immune.includes(type)) {
      this.fx.immune(e.x, e.y);
      return false;
    }
    let dmg = amount;
    if (!raw) {
      if (e.markT > 0) dmg *= e.markMul;
      if (e.vulnT > 0) dmg += e.vulnAdd;
      if (e.shockT > 0) {
        dmg += e.shockAdd;
        e.shockT = 0;
        e.shockAdd = 0;
      }
    }
    const dealt = Math.min(dmg, e.hp);
    e.hp -= dmg;
    e.hitFlash = 0.07;
    e.regrowT = 0;
    if (ctx.tower) ctx.tower.damageDealt += dealt;
    if (e.hp <= 1e-6) this.popEnemy(e, -e.hp, type, ctx);
    return true;
  }

  private popEnemy(e: Enemy, overflow: number, type: DamageType, ctx: HitCtx) {
    e.alive = false;
    this.awardPop(e, ctx.tower, 1);
    this.fx.pop(e);
    if (e.type === 'golden') {
      const bonus = 40 + this.round * 8;
      this.earn(bonus);
      this.stats.goldenPopped++;
      this.fx.cash(e.x, e.y - 20, bonus);
      this.fx.text(e.x, e.y - 48, 'GOLDEN POP!', '#fff3a8', 24);
      this.fx.sound('levelup', 0.7);
      this.fx.shake(4);
    }
    if (e.def.boss) {
      this.stats.bossesPopped++;
      this.fx.bossDeath(e);
      this.fx.shake(Math.min(14, e.radius / 6));
      this.fx.sound('bossDie');
    }
    const kids = e.def.children;
    if (!kids.length) return;
    const spacing = e.def.boss ? 16 : 7;
    const n = kids.length;
    const created: Enemy[] = [];
    for (let i = 0; i < n; i++) {
      const cdef = GLOOPS[kids[i]];
      const laneMax = Math.max(0, this.map.pathWidth / 2 - cdef.radius - 4);
      const c = new Enemy(this.nextId++, kids[i], e.pathIndex, Math.max(0, e.dist + (i - (n - 1) / 2) * spacing), {
        camo: e.camo,
        regrowMax: e.regrowMax,
        fortified: false,
        hpMul: bossHealthMul(this.round),
        lane: cdef.boss ? 0 : clamp(e.lane + rand(-6, 6), -laneMax, laneMax),
      });
      c.speedMul = e.speedMul;
      if (e.slowT > 0) {
        c.slowMul = e.slowMul;
        c.slowT = e.slowT;
      }
      if (e.auraSlowT > 0) {
        c.auraSlow = e.auraSlow;
        c.auraSlowT = e.auraSlowT;
      }
      if (e.burnT > 0) {
        c.burnDps = e.burnDps;
        c.burnT = e.burnT;
        c.burnType = e.burnType;
        c.burnSrc = e.burnSrc;
      }
      if (e.poisonT > 0) {
        c.poisonDps = e.poisonDps;
        c.poisonT = e.poisonT;
        c.poisonSrc = e.poisonSrc;
      }
      if (e.markT > 0) {
        c.markMul = e.markMul;
        c.markT = e.markT;
      }
      if (e.vulnT > 0) {
        c.vulnAdd = e.vulnAdd;
        c.vulnT = e.vulnT;
      }
      this.placeEnemy(c);
      this.enemies.push(c);
      this.enemyById.set(c.id, c);
      ctx.hitSet?.add(c.id);
      created.push(c);
    }
    if (overflow > 1e-6) {
      for (const c of created) this.damageEnemy(c, overflow, type, ctx, true);
    }
  }

  private awardPop(e: Enemy, tower: Tower | null, count: number) {
    const mul = popCashMul(this.round) * (tower?.buffs.cashMul ?? 1);
    this.earn(count * mul);
    this.stats.pops += count;
    if (tower) tower.pops += count;
    if (this.roundActive) {
      this.frenzyMeter += count * (this.perks.has('frenzy2') ? 1.2 : 1);
      if (!this.frenzyReady && this.frenzyT <= 0 && this.frenzyMeter >= this.frenzyMax) {
        this.frenzyReady = true;
        this.frenzyMeter = this.frenzyMax;
        this.events.emit('frenzyReady', undefined);
      }
    }
    if (this.time - this.comboLast <= 0.9) this.combo += count;
    else this.combo = count;
    this.comboLast = this.time;
    void e;
  }

  activateFrenzy(): boolean {
    if (!this.frenzyReady) return false;
    this.frenzyReady = false;
    this.frenzyMeter = 0;
    this.frenzyT = this.frenzyDuration;
    this.fx.sound('frenzy');
    this.fx.shake(6);
    this.events.emit('frenzyStart', undefined);
    return true;
  }

  private applyStatus(e: Enemy, st: StatusApply, ctx: HitCtx) {
    if (!e.alive) return;
    const boss = !!e.def.boss;
    const m = boss ? st.boss ?? 1 : 1;
    if (m <= 0) return;
    const dur = (st.duration ?? 1) * m;
    switch (st.kind) {
      case 'slow': {
        const v = 1 - (1 - (st.value ?? 0.5)) * (boss ? m : 1);
        if (e.slowT <= 0 || v <= e.slowMul) {
          e.slowMul = v;
          e.slowT = Math.max(e.slowT, st.duration ?? 1);
        }
        break;
      }
      case 'freeze':
        if (!st.ignoreImmune && !ctx.canHitAll && e.def.immune.includes('cold')) return;
        if (e.freezeT <= 0) this.fx.freezeHit(e);
        e.freezeT = Math.max(e.freezeT, dur);
        break;
      case 'stun':
        e.stunT = Math.max(e.stunT, dur);
        break;
      case 'burn':
        if (!ctx.canHitAll && e.def.immune.includes(st.dmgType ?? 'fire')) return;
        e.burnDps = Math.max(e.burnDps, st.dps ?? 1);
        e.burnT = Math.max(e.burnT, st.duration ?? 3);
        e.burnType = st.dmgType ?? 'fire';
        e.burnSrc = ctx.tower;
        break;
      case 'poison':
        e.poisonDps = Math.max(e.poisonDps, st.dps ?? 1);
        e.poisonT = Math.max(e.poisonT, st.duration ?? 3);
        e.poisonSrc = ctx.tower;
        break;
      case 'mark':
        e.markMul = Math.max(e.markT > 0 ? e.markMul : 1, st.value ?? 1.25);
        e.markT = Math.max(e.markT, dur);
        break;
      case 'vuln':
        e.vulnAdd = Math.max(e.vulnT > 0 ? e.vulnAdd : 0, st.value ?? 1);
        e.vulnT = Math.max(e.vulnT, st.duration ?? 1);
        break;
      case 'shock':
        e.shockAdd = Math.max(e.shockAdd, st.value ?? 1);
        e.shockT = Math.max(e.shockT, st.duration ?? 2);
        break;
      case 'decamo':
        if (!e.def.camo) e.camo = false;
        break;
      case 'knockback':
        e.dist = Math.max(0, e.dist - (st.value ?? 10) * m);
        break;
    }
  }

  private hitWith(e: Enemy, h: HitInfo, ctx: HitCtx): boolean {
    let dmg = h.damage;
    if (e.def.boss) dmg = dmg * (h.bossMul ?? 1) + (h.bossBonus ?? 0);
    if (h.heavyBonus && (e.type === 'ceramic' || e.type === 'lead')) dmg += h.heavyBonus;
    let ok = true;
    if (dmg > 0) ok = this.damageEnemy(e, dmg, h.dmgType, ctx);
    if (h.statuses && (ok || dmg <= 0)) {
      for (const st of h.statuses) this.applyStatus(e, st, ctx);
    }
    return ok;
  }

  // ------------------------------------------------------------------------------------------
  // Targeting
  // ------------------------------------------------------------------------------------------

  private score(e: Enemy, p: TargetPriority, x: number, y: number): number {
    const remaining = this.paths[e.pathIndex].length - e.dist;
    switch (p) {
      case 'first':
        return -remaining;
      case 'last':
        return remaining;
      case 'strong':
        return e.def.tier * 100000 - remaining;
      case 'close':
        return -dist2(e.x, e.y, x, y);
    }
  }

  private enemiesNear(x: number, y: number, r: number, out: Enemy[] = this.tmp): Enemy[] {
    if (r > 1400) {
      out.length = 0;
      for (const e of this.enemies) if (e.alive) out.push(e);
      return out;
    }
    return this.grid.queryCircle(x, y, r, out);
  }

  findTarget(t: Tower, range: number, priority: TargetPriority = t.priority, filter?: (e: Enemy) => boolean): Enemy | null {
    const list = this.enemiesNear(t.x, t.y, range);
    let best: Enemy | null = null;
    let bestScore = -Infinity;
    const camo = t.camo;
    for (const e of list) {
      if (!e.alive || (e.camo && !camo)) continue;
      if (filter && !filter(e)) continue;
      const s = this.score(e, priority, t.x, t.y);
      if (s > bestScore) {
        bestScore = s;
        best = e;
      }
    }
    return best;
  }

  /** Predict where a gloop will be after `t` seconds (for leading shots). */
  private predict(e: Enemy, t: number, out: { x: number; y: number }) {
    if (e.freezeT > 0 || e.stunT > 0) {
      out.x = e.x;
      out.y = e.y;
      return;
    }
    const sp = BASE_SPEED * e.def.speed * e.speedMul * Math.min(e.slowMul, e.auraSlow);
    const p = this.paths[e.pathIndex];
    const ang = p.sample(Math.min(p.length, e.dist + sp * t), out);
    out.x -= Math.sin(ang) * e.lane;
    out.y += Math.cos(ang) * e.lane;
  }

  // ------------------------------------------------------------------------------------------
  // Towers
  // ------------------------------------------------------------------------------------------

  private updateTowers(dt: number) {
    const frenzy = this.frenzyT > 0;
    for (const t of this.towers) {
      t.fireAnim += dt;
      if (t.upgradeFlash > 0) t.upgradeFlash -= dt * 1.5;
      if (t.timed.length) t.timed = t.timed.filter((b) => b.until > this.time);
      for (const [id, cd] of t.abilityCd) if (cd > 0) t.abilityCd.set(id, cd - dt);
      const rf = t.rateFactor(this.time, frenzy);
      for (const a of t.stats.attacks) this.runAttack(t, a, dt, rf);
      // traps lifetime
      if (t.traps.length) {
        for (const tr of t.traps) this.updateTrap(t, tr, dt);
        t.traps = t.traps.filter((tr) => tr.alive);
      }
    }
  }

  private runAttack(t: Tower, a: AttackDef, dt: number, rf: number) {
    switch (a.kind) {
      case 'orbit':
        this.updateOrbit(t, a, dt);
        return;
      case 'drone':
        this.updateDrones(t, a, dt, rf);
        return;
    }
    let cd = t.cooldowns.get(a.id) ?? 0;
    const factor = a.kind === 'aura' ? 1 : rf;
    cd -= dt * factor;
    let shots = 0;
    while (cd <= 0 && shots < 6) {
      const fired = this.fire(t, a);
      if (!fired) {
        cd = 0;
        break;
      }
      cd += a.rate;
      shots++;
    }
    if (cd < -a.rate) cd = 0;
    t.cooldowns.set(a.id, cd);
  }

  /** Returns false if there was nothing to shoot at. */
  private fire(t: Tower, a: AttackDef): boolean {
    switch (a.kind) {
      case 'shoot':
        return this.fireShoot(t, a);
      case 'radial':
        return this.fireRadial(t, a);
      case 'pulse':
        return this.firePulse(t, a);
      case 'hitscan':
        return this.fireHitscan(t, a);
      case 'chain':
        return this.fireChain(t, a);
      case 'strike':
        return this.fireStrike(t, a);
      case 'runner':
        return this.fireRunner(t, a);
      case 'trap':
        return this.fireTrap(t, a);
      case 'tongue':
        return this.fireTongue(t, a);
      case 'aura':
        return this.fireAura(t, a);
      default:
        return false;
    }
  }

  private ctxOf(t: Tower, hitSet: Set<number> | null = null): HitCtx {
    return { tower: t, hitSet, canHitAll: t.canHitAll };
  }

  private spawnProjectile(def: ProjDef, owner: Tower | null, x: number, y: number, angle: number, range: number, targetId = -1) {
    const p = new Projectile(def, owner, x, y, angle, range, owner?.buffs.damageAdd ?? 0, owner?.buffs.pierceAdd ?? 0, owner?.canHitAll ?? false);
    p.targetId = targetId;
    this.projectiles.push(p);
    return p;
  }

  private fireShoot(t: Tower, a: ShootAttack): boolean {
    const range = t.range * (a.rangeMul ?? 1);
    const target = this.findTarget(t, range);
    if (!target) return false;
    const aim = this.sample;
    const travel = Math.sqrt(dist2(t.x, t.y, target.x, target.y)) / a.proj.speed;
    this.predict(target, a.proj.homing ? 0 : travel, aim);
    const base = Math.atan2(aim.y - t.y, aim.x - t.x);
    const n = a.count;
    for (let i = 0; i < n; i++) {
      let ang = base;
      if (n > 1) {
        if (a.spread >= 360) ang = base + (i / n) * TAU;
        else ang = base + (-a.spread / 2 + (a.spread * i) / (n - 1)) * DEG;
      }
      if (a.jitter) ang += rand(-a.jitter, a.jitter) * DEG;
      const ox = t.x + Math.cos(ang) * 12;
      const oy = t.y - 6 + Math.sin(ang) * 12;
      this.spawnProjectile(a.proj, t, ox, oy, ang, range, a.proj.homing ? target.id : -1);
    }
    t.angle = base;
    t.facing = Math.cos(base) >= 0 ? 1 : -1;
    t.fireAnim = 0;
    this.fx.fire(t, base);
    return true;
  }

  private fireRadial(t: Tower, a: RadialAttack): boolean {
    if (!this.findTarget(t, t.range)) return false;
    const off = (this.time * 1.7) % TAU;
    for (let i = 0; i < a.count; i++) {
      const ang = off + (i / a.count) * TAU;
      this.spawnProjectile(a.proj, t, t.x, t.y - 4, ang, t.range);
    }
    t.fireAnim = 0;
    this.fx.fire(t, t.angle);
    return true;
  }

  private firePulse(t: Tower, a: PulseAttack): boolean {
    const r = t.range * (a.rangeMul ?? 1);
    const list = this.enemiesNear(t.x, t.y, r, this.tmp2);
    let any = false;
    for (const e of list) {
      if (e.alive && (!e.camo || t.camo)) {
        any = true;
        break;
      }
    }
    if (!any) return false;
    const ctx = this.ctxOf(t);
    if (a.ignoreImmune) ctx.canHitAll = true;
    let pierce = a.pierce + t.buffs.pierceAdd;
    const dmg = a.damage + (a.damage > 0 ? t.buffs.damageAdd : 0);
    const targets = list.slice();
    for (const e of targets) {
      if (pierce <= 0) break;
      if (!e.alive || (e.camo && !t.camo)) continue;
      this.hitWith(e, { damage: dmg, dmgType: a.dmgType, statuses: a.statuses }, ctx);
      pierce--;
    }
    t.fireAnim = 0;
    this.fx.pulse(t.x, t.y, r, a.visual);
    this.fx.fire(t, t.angle);
    if (a.visual === 'slam') this.fx.shake(1.5);
    return true;
  }

  private fireHitscan(t: Tower, a: HitscanAttack): boolean {
    const range = a.global ? 99999 : t.range;
    const target = this.findTarget(t, range);
    if (!target) return false;
    t.shots++;
    let dmg = a.damage + t.buffs.damageAdd;
    let crit = false;
    if (a.critEvery && t.shots % a.critEvery === 0) {
      dmg *= a.critMul ?? 2;
      crit = true;
    }
    const ctx = this.ctxOf(t);
    const info: HitInfo = { damage: dmg, dmgType: a.dmgType, bossBonus: a.bossBonus, bossMul: a.bossMul, heavyBonus: a.heavyBonus, statuses: a.statuses };
    const tx = target.x;
    const ty = target.y;
    if (a.stripFortify && target.fortified) {
      target.fortified = false;
      target.maxHp /= 2;
      target.hp = Math.min(target.hp, target.maxHp);
    }
    this.hitWith(target, info, ctx);
    this.fx.beam('tracer', [t.x, t.y - 8, tx, ty], crit ? '#ff5d5d' : '#fff6c2', crit ? 4 : 2);
    if (crit) this.fx.text(tx, ty - 20, 'CRIT!', '#ff5d5d', 16);
    if (a.ricochet) {
      const hit = new Set<number>([target.id]);
      let lx = tx;
      let ly = ty;
      const rr = a.ricochetRange ?? 140;
      const pts = [lx, ly];
      for (let k = 0; k < a.ricochet; k++) {
        const near = this.enemiesNear(lx, ly, rr, this.tmp2);
        let best: Enemy | null = null;
        let bd = Infinity;
        for (const e of near) {
          if (!e.alive || hit.has(e.id) || (e.camo && !t.camo)) continue;
          const d = dist2(e.x, e.y, lx, ly);
          if (d < bd) {
            bd = d;
            best = e;
          }
        }
        if (!best) break;
        hit.add(best.id);
        lx = best.x;
        ly = best.y;
        pts.push(lx, ly);
        this.hitWith(best, info, ctx);
      }
      if (pts.length > 2) this.fx.beam('ricochet', pts, '#ffe9a8', 2);
    }
    if (a.shrapnel) {
      for (let i = 0; i < a.shrapnel.count; i++) {
        const p = this.spawnProjectile(a.shrapnel.proj, t, tx, ty, rand(0, TAU), 80);
        p.hit.add(target.id);
      }
    }
    t.angle = Math.atan2(ty - t.y, tx - t.x);
    t.facing = Math.cos(t.angle) >= 0 ? 1 : -1;
    t.fireAnim = 0;
    this.fx.fire(t, t.angle);
    return true;
  }

  private fireChain(t: Tower, a: ChainAttack): boolean {
    const target = this.findTarget(t, t.range);
    if (!target) return false;
    const ctx = this.ctxOf(t);
    const info: HitInfo = { damage: a.damage + t.buffs.damageAdd, dmgType: a.dmgType, bossBonus: a.bossBonus, statuses: a.statuses };
    const hit = new Set<number>();
    const pts = [t.x, t.y - 14];
    let cur: Enemy | null = target;
    const chains = a.chains + t.buffs.pierceAdd;
    for (let k = 0; k < chains && cur; k++) {
      hit.add(cur.id);
      pts.push(cur.x, cur.y);
      const cx = cur.x;
      const cy = cur.y;
      this.hitWith(cur, info, ctx);
      const near = this.enemiesNear(cx, cy, a.chainRange, this.tmp2);
      let best: Enemy | null = null;
      let bd = Infinity;
      for (const e of near) {
        if (!e.alive || hit.has(e.id) || (e.camo && !t.camo)) continue;
        const d = dist2(e.x, e.y, cx, cy);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      cur = best;
    }
    this.fx.beam('lightning', pts, '#b9f3ff', 3);
    t.angle = Math.atan2(target.y - t.y, target.x - t.x);
    t.facing = Math.cos(t.angle) >= 0 ? 1 : -1;
    t.fireAnim = 0;
    this.fx.fire(t, t.angle);
    return true;
  }

  private areaHit(x: number, y: number, radius: number, pierce: number, info: HitInfo, ctx: HitCtx, exclude?: Set<number>) {
    const list = this.enemiesNear(x, y, radius, this.tmp2).slice();
    list.sort((a, b) => dist2(a.x, a.y, x, y) - dist2(b.x, b.y, x, y));
    let n = pierce;
    for (const e of list) {
      if (n <= 0) break;
      if (!e.alive || exclude?.has(e.id)) continue;
      this.hitWith(e, info, ctx);
      n--;
    }
  }

  private fireStrike(t: Tower, a: StrikeAttack): boolean {
    const list = this.enemiesNear(t.x, t.y, t.range, this.tmp).filter((e) => e.alive && (!e.camo || t.camo));
    if (!list.length) return false;
    const ctx = this.ctxOf(t);
    const info: HitInfo = { damage: a.damage + t.buffs.damageAdd, dmgType: a.dmgType, bossBonus: a.bossBonus, statuses: a.statuses };
    for (let i = 0; i < a.count; i++) {
      const e = list[Math.floor(Math.random() * list.length)];
      const x = e.x;
      const y = e.y;
      this.areaHit(x, y, a.radius, a.pierce, info, ctx);
      this.fx.beam('strike', [x + rand(-30, 30), y - 420, x, y], '#e0fbff', 4);
      this.fx.explosion(x, y, a.radius, 'arcane');
    }
    this.fx.sound('zap', 0.6, 0.8);
    t.fireAnim = 0;
    return true;
  }

  private updateOrbit(t: Tower, a: OrbitAttack, dt: number) {
    t.orbitPhase += a.angSpeed * dt;
    if (!this.enemies.length) return;
    const ctx = this.ctxOf(t);
    const info: HitInfo = { damage: a.damage + t.buffs.damageAdd, dmgType: a.dmgType };
    for (let i = 0; i < a.count; i++) {
      const ang = t.orbitPhase + (i / a.count) * TAU;
      const ox = t.x + Math.cos(ang) * a.orbitRadius;
      const oy = t.y + Math.sin(ang) * a.orbitRadius;
      const near = this.grid.queryCircle(ox, oy, a.size, this.tmp2);
      for (const e of near) {
        if (!e.alive) continue;
        const last = t.orbitHits.get(e.id) ?? -99;
        if (this.time - last < a.hitCooldown) continue;
        t.orbitHits.set(e.id, this.time);
        this.hitWith(e, info, ctx);
      }
    }
    if (t.orbitHits.size > 400) {
      for (const [id, tm] of t.orbitHits) if (this.time - tm > 2) t.orbitHits.delete(id);
    }
  }

  private nearestPathOf(t: Tower): { pathIndex: number; dist: number } {
    let best = { pathIndex: 0, dist: 0 };
    let bd = Infinity;
    this.paths.forEach((p, pi) => {
      const d = p.distanceTo(t.x, t.y);
      if (d < bd) {
        bd = d;
        best = { pathIndex: pi, dist: p.nearestDist(t.x, t.y) };
      }
    });
    return best;
  }

  private fireRunner(t: Tower, a: RunnerAttack): boolean {
    if (!this.roundActive || !this.enemies.length) return false;
    const np = this.nearestPathOf(t);
    const p = this.paths[np.pathIndex];
    // start a bit further along so the pack sweeps through the tower's section first
    const start = Math.min(p.length - 5, np.dist + 260);
    const r: Runner = {
      alive: true,
      pathIndex: np.pathIndex,
      dist: start,
      x: 0,
      y: 0,
      angle: 0,
      pierce: a.pierce + t.buffs.pierceAdd,
      hit: new Set(),
      owner: t,
      damage: a.damage + t.buffs.damageAdd,
      dmgType: a.dmgType,
      size: a.size,
      speed: a.speed,
      knockback: a.knockback ?? 0,
      bossBonus: a.bossBonus ?? 0,
      age: 0,
    };
    r.angle = p.sample(r.dist, r) + Math.PI;
    this.runners.push(r);
    t.fireAnim = 0;
    this.fx.sound('magic', 0.4, 0.7);
    return true;
  }

  private updateRunners(dt: number) {
    if (!this.runners.length) return;
    for (const r of this.runners) {
      if (!r.alive) continue;
      r.age += dt;
      r.dist -= r.speed * dt;
      if (r.dist <= 0) {
        r.alive = false;
        continue;
      }
      const p = this.paths[r.pathIndex];
      r.angle = p.sample(r.dist, r) + Math.PI;
      const near = this.grid.queryCircle(r.x, r.y, r.size, this.tmp2);
      const ctx: HitCtx = { tower: r.owner, hitSet: r.hit, canHitAll: r.owner.canHitAll };
      for (const e of near) {
        if (!e.alive || r.hit.has(e.id)) continue;
        r.hit.add(e.id);
        this.hitWith(e, { damage: r.damage, dmgType: r.dmgType, bossBonus: r.bossBonus }, ctx);
        if (r.knockback && e.alive) e.dist = Math.max(0, e.dist - r.knockback * (e.def.boss ? 0.3 : 1));
        r.pierce -= e.def.boss ? 10 : 1;
        if (r.pierce <= 0) {
          r.alive = false;
          this.fx.explosion(r.x, r.y, 26, 'arcane');
          break;
        }
      }
    }
    this.runners = this.runners.filter((r) => r.alive);
  }

  private updateDrones(t: Tower, a: DroneAttack, dt: number, rf: number) {
    // keep drone count in sync (temporary swarm drones expire)
    const permanent = t.drones.filter((d) => d.attack.id === a.id && d.expires === 0);
    for (let i = permanent.length; i < a.count; i++) {
      t.drones.push(this.makeDrone(t, a, 0));
    }
    if (permanent.length > a.count) {
      let excess = permanent.length - a.count;
      t.drones = t.drones.filter((d) => !(d.attack.id === a.id && d.expires === 0 && excess-- > 0));
    }
    const leash = t.range;
    for (const d of t.drones) {
      if (d.attack.id !== a.id) continue;
      d.attack = a;
      d.phase += dt;
      d.cd -= dt * rf;
      // re-target periodically
      let target: Enemy | null = null;
      if (d.targetId >= 0) {
        const e = this.enemyById.get(d.targetId);
        target = e && e.alive ? e : null;
      }
      if (target && dist2(target.x, target.y, t.x, t.y) > (leash + 40) * (leash + 40)) target = null;
      if (!target || Math.random() < dt * 2) {
        let best: Enemy | null = null;
        let bs = -Infinity;
        for (const e of this.enemiesNear(t.x, t.y, leash, this.tmp2)) {
          if (!e.alive || (e.camo && !t.camo)) continue;
          // prefer gloops near the drone, then progress
          const s = -Math.sqrt(dist2(e.x, e.y, d.x, d.y)) * 0.6 + e.dist * 0.05;
          if (s > bs) {
            bs = s;
            best = e;
          }
        }
        target = best;
        d.targetId = best ? best.id : -1;
      }
      let gx: number;
      let gy: number;
      const orbitR = a.visual === 'phoenix' ? 90 : 55;
      if (target) {
        gx = target.x + Math.cos(d.phase * 2.2) * orbitR;
        gy = target.y + Math.sin(d.phase * 2.2) * orbitR * 0.7;
      } else {
        gx = t.x + Math.cos(d.phase * 1.3) * (a.visual === 'phoenix' ? 110 : 45);
        gy = t.y + Math.sin(d.phase * 1.3) * (a.visual === 'phoenix' ? 80 : 30);
      }
      const dx = gx - d.x;
      const dy = gy - d.y;
      const len = Math.hypot(dx, dy) || 1;
      const accel = a.speed * 4;
      d.vx += (dx / len) * accel * dt;
      d.vy += (dy / len) * accel * dt;
      const sp = Math.hypot(d.vx, d.vy);
      const max = a.speed;
      if (sp > max) {
        d.vx = (d.vx / sp) * max;
        d.vy = (d.vy / sp) * max;
      }
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.angle = Math.atan2(d.vy, d.vx);
      if (target && d.cd <= 0) {
        const dd = Math.sqrt(dist2(target.x, target.y, d.x, d.y));
        if (dd < 190) {
          const aim = this.sample;
          this.predict(target, dd / a.proj.speed, aim);
          const ang = Math.atan2(aim.y - d.y, aim.x - d.x);
          this.spawnProjectile(a.proj, t, d.x, d.y, ang, 200, -1);
          d.cd = a.droneRate;
          if (Math.random() < 0.3) this.fx.sound('buzz', 0.25);
        }
      }
      if (d.cd < 0 && !target) d.cd = 0;
    }
    if (t.drones.some((d) => d.expires > 0 && d.expires < this.time)) {
      t.drones = t.drones.filter((d) => d.expires === 0 || d.expires >= this.time);
    }
  }

  private makeDrone(t: Tower, a: DroneAttack, expires: number): Drone {
    return {
      x: t.x + rand(-10, 10),
      y: t.y - 10,
      vx: rand(-50, 50),
      vy: -80,
      angle: 0,
      cd: rand(0, a.droneRate),
      attack: a,
      owner: t,
      expires,
      phase: rand(0, 10),
      targetId: -1,
    };
  }

  private fireTrap(t: Tower, a: TrapAttack): boolean {
    if (!this.roundActive || !t.trapSpots.length) return false;
    const mine = t.traps.filter((tr) => tr.attackId === a.id);
    if (mine.length >= a.max) return false;
    // prefer spots not already covered
    let spot = t.trapSpots[Math.floor(Math.random() * t.trapSpots.length)];
    for (let tries = 0; tries < 6; tries++) {
      const s = t.trapSpots[Math.floor(Math.random() * t.trapSpots.length)];
      const p = this.paths[s.pathIndex];
      p.sample(s.dist, this.sample);
      const free = mine.every((m) => dist2(m.x, m.y, this.sample.x, this.sample.y) > (a.radius * 1.5) ** 2);
      spot = s;
      if (free) break;
    }
    const p = this.paths[spot.pathIndex];
    p.sample(spot.dist, this.sample);
    t.traps.push({
      alive: true,
      x: this.sample.x,
      y: this.sample.y,
      radius: a.radius,
      life: a.life,
      maxLife: a.life,
      tickT: 0,
      owner: t,
      attackId: a.id,
      visual: a.visual,
    });
    t.fireAnim = 0;
    return true;
  }

  private updateTrap(t: Tower, tr: Trap, dt: number) {
    tr.life -= dt;
    if (tr.life <= 0) {
      tr.alive = false;
      return;
    }
    const a = t.stats.attacks.find((x) => x.id === tr.attackId) as TrapAttack | undefined;
    if (!a) {
      tr.alive = false;
      return;
    }
    tr.radius = a.radius;
    tr.tickT -= dt;
    if (tr.tickT > 0) return;
    tr.tickT = a.tick;
    const near = this.grid.queryCircle(tr.x, tr.y, a.radius, this.tmp2);
    if (!near.length) return;
    const ctx = this.ctxOf(t);
    let n = a.pierce;
    const zapped: number[] = [];
    for (const e of near) {
      if (n <= 0) break;
      if (!e.alive) continue;
      const ex = e.x;
      const ey = e.y;
      this.hitWith(e, { damage: a.damage > 0 ? a.damage + t.buffs.damageAdd : 0, dmgType: a.dmgType, statuses: a.statuses }, ctx);
      if (a.visual === 'coil') zapped.push(tr.x, tr.y, ex, ey);
      n--;
    }
    if (zapped.length) {
      for (let i = 0; i < zapped.length; i += 4) this.fx.beam('lightning', zapped.slice(i, i + 4), '#b9f3ff', 2);
    }
  }

  private fireTongue(t: Tower, a: TongueAttack): boolean {
    const range = t.range + a.rangeAdd;
    let target: Enemy | null = null;
    if (a.bossDamage > 0) target = this.findTarget(t, range, 'strong', (e) => !!e.def.boss);
    if (!target) target = this.findTarget(t, range, 'strong', (e) => !e.def.boss);
    if (!target) return false;
    const ctx = this.ctxOf(t);
    const tx = target.x;
    const ty = target.y;
    if (target.def.boss) {
      if (target.def.tier <= a.swallowTier) {
        this.swallow(target, t);
      } else {
        this.damageEnemy(target, a.bossDamage + t.buffs.damageAdd, 'normal', { ...ctx, canHitAll: true });
        if (target.alive) target.dist = Math.max(0, target.dist - a.bossKnockback);
        this.fx.text(tx, ty - target.radius, 'YANK!', '#ff9ad5', 18);
      }
    } else {
      this.damageEnemy(target, a.damage + t.buffs.damageAdd, 'normal', { ...ctx, canHitAll: true });
    }
    this.fx.beam('tongue', [t.x, t.y - 6, tx, ty], '#ff6fa8', 6);
    this.fx.sound('tongue', 0.6);
    t.angle = Math.atan2(ty - t.y, tx - t.x);
    t.facing = Math.cos(t.angle) >= 0 ? 1 : -1;
    t.fireAnim = 0;
    return true;
  }

  private swallow(e: Enemy, t: Tower) {
    e.alive = false;
    const pops = popCount(e.type);
    this.awardPop(e, t, pops);
    this.stats.bossesPopped++;
    this.fx.text(e.x, e.y - e.radius, 'GULP!', '#ff6fa8', 26);
    this.fx.pop(e);
    this.fx.shake(6);
  }

  private fireAura(t: Tower, a: AuraAttack): boolean {
    const list = this.enemiesNear(t.x, t.y, t.range, this.tmp2);
    if (!list.length) return true;
    const ctx = this.ctxOf(t);
    if (a.ignoreImmune) ctx.canHitAll = true;
    const targets = list.slice();
    for (const e of targets) {
      if (!e.alive) continue;
      const s = e.def.boss ? a.slowBoss : a.slow;
      const immune = !ctx.canHitAll && e.def.immune.includes(a.dmgType);
      if (immune) continue;
      if (s < 1) {
        e.auraSlow = Math.min(e.auraSlowT > 0 ? e.auraSlow : 1, s);
        e.auraSlowT = a.rate * 1.6;
      }
      if (a.dps > 0) this.damageEnemy(e, a.dps * a.rate + t.buffs.damageAdd * a.rate, a.dmgType, ctx);
      if (a.statuses && e.alive) for (const st of a.statuses) this.applyStatus(e, st, ctx);
    }
    return true;
  }

  // ------------------------------------------------------------------------------------------
  // Projectiles
  // ------------------------------------------------------------------------------------------

  private updateProjectiles(dt: number) {
    const list = this.projectiles;
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const p = list[i];
      if (!p.alive) continue;
      p.age += dt;
      p.px = p.x;
      p.py = p.y;
      if (p.def.homing) this.steer(p, dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot = Math.atan2(p.vy, p.vx);
      p.life -= dt;
      this.collide(p);
      if (!p.alive) continue;
      if (p.life <= 0 || p.x < -80 || p.y < -80 || p.x > WORLD_W + 80 || p.y > WORLD_H + 80) {
        this.killProjectile(p, p.explodeOnExpire);
      }
    }
  }

  private steer(p: Projectile, dt: number) {
    let target: Enemy | null = null;
    if (p.targetId >= 0) {
      const e = this.enemyById.get(p.targetId);
      target = e && e.alive ? e : null;
    }
    if (!target) {
      let bd = 260 * 260;
      for (const e of this.enemiesNear(p.x, p.y, 260, this.tmp2)) {
        if (!e.alive || p.hit.has(e.id)) continue;
        if (e.camo && p.owner && !p.owner.camo) continue;
        const d = dist2(e.x, e.y, p.x, p.y);
        if (d < bd) {
          bd = d;
          target = e;
        }
      }
      p.targetId = target ? target.id : -1;
    }
    if (!target) return;
    const want = Math.atan2(target.y - p.y, target.x - p.x);
    const cur = Math.atan2(p.vy, p.vx);
    let d = want - cur;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    const maxTurn = p.def.homing! * dt;
    const ang = cur + clamp(d, -maxTurn, maxTurn);
    p.vx = Math.cos(ang) * p.speed;
    p.vy = Math.sin(ang) * p.speed;
  }

  private collide(p: Projectile) {
    const r = p.def.radius;
    const x0 = Math.min(p.px, p.x) - r - 20;
    const y0 = Math.min(p.py, p.y) - r - 20;
    const x1 = Math.max(p.px, p.x) + r + 20;
    const y1 = Math.max(p.py, p.y) + r + 20;
    const cands = this.grid.queryRect(x0, y0, x1, y1, this.tmp);
    if (!cands.length) return;
    // sort by distance travelled along the segment so pierce is spent in order
    const hits: Enemy[] = [];
    for (const e of cands) {
      if (!e.alive || p.hit.has(e.id)) continue;
      const rr = r + e.radius;
      if (segDist2(e.x, e.y, p.px, p.py, p.x, p.y) <= rr * rr) hits.push(e);
    }
    if (!hits.length) return;
    if (hits.length > 1) hits.sort((a, b) => dist2(a.x, a.y, p.px, p.py) - dist2(b.x, b.y, p.px, p.py));
    const ctx: HitCtx = { tower: p.owner, hitSet: p.hit, canHitAll: p.canHitAll };
    const d = p.def;
    for (const e of hits) {
      if (!p.alive) break;
      if (!e.alive || p.hit.has(e.id)) continue;
      p.hit.add(e.id);
      const dmg = d.damage > 0 ? d.damage + p.damageAdd : 0;
      if (dmg > 0) {
        const immune = !ctx.canHitAll && e.def.immune.includes(d.dmgType);
        if (immune) {
          this.fx.immune(e.x, e.y);
          this.fx.sound('clank', 0.4);
          this.killProjectile(p, false);
          break;
        }
        this.hitWith(e, { damage: dmg, dmgType: d.dmgType, bossBonus: d.bossBonus, bossMul: d.bossMul, heavyBonus: d.heavyBonus, statuses: d.statuses }, ctx);
      } else if (d.statuses) {
        for (const st of d.statuses) this.applyStatus(e, st, ctx);
      }
      if (d.explode) {
        this.explode(d.explode, e.x, e.y, p.owner, p.damageAdd, p.canHitAll, null);
        this.killProjectile(p, false);
        break;
      }
      p.pierce -= 1;
      if (p.pierce <= 0) {
        this.killProjectile(p, false);
        break;
      }
    }
  }

  private killProjectile(p: Projectile, explode: boolean) {
    if (!p.alive) return;
    p.alive = false;
    if (explode && p.def.explode) this.explode(p.def.explode, p.x, p.y, p.owner, p.damageAdd, p.canHitAll, null);
    if (p.def.split) {
      const sp = p.def.split;
      const base = Math.atan2(p.vy, p.vx);
      for (let i = 0; i < sp.count; i++) {
        const ang = base + ((i - (sp.count - 1) / 2) * 0.9) + rand(-0.15, 0.15);
        const c = this.spawnProjectile(sp.proj, p.owner, p.x, p.y, ang, 150);
        for (const id of p.hit) c.hit.add(id);
      }
    }
  }

  private explode(ex: ExplodeDef, x: number, y: number, owner: Tower | null, damageAdd: number, canHitAll: boolean, exclude: Set<number> | null) {
    const ctx: HitCtx = { tower: owner, hitSet: null, canHitAll };
    const dmg = ex.damage > 0 ? ex.damage + damageAdd : 0;
    this.areaHit(x, y, ex.radius, ex.pierce + (owner?.buffs.pierceAdd ?? 0), { damage: dmg, dmgType: ex.dmgType, bossBonus: ex.bossBonus, statuses: ex.statuses }, ctx, exclude ?? undefined);
    this.fx.explosion(x, y, ex.radius, ex.visual ?? 'boom');
    if (ex.visual === 'nuke') this.fx.shake(5);
    else if (ex.radius > 60) this.fx.shake(2);
    if (ex.cluster) {
      const c = ex.cluster;
      const off = rand(0, TAU);
      for (let i = 0; i < c.count; i++) {
        this.spawnProjectile(c.proj, owner, x, y, off + (i / c.count) * TAU, 80);
      }
    }
  }

  private updateDrops(dt: number) {
    if (!this.drops.length) return;
    for (const d of this.drops) {
      if (!d.alive) continue;
      d.t += dt;
      if (d.collecting) {
        d.collectT += dt;
        if (d.collectT > 0.5) d.alive = false;
        continue;
      }
      const f = Math.min(1, d.t / 0.5);
      d.x = d.sx + (d.tx - d.sx) * f;
      d.y = d.sy + (d.ty - d.sy) * f - Math.sin(f * Math.PI) * 50;
      if (d.auto && d.t > 0.8) this.collectDrop(d, false);
    }
    this.drops = this.drops.filter((d) => d.alive);
  }

  // ------------------------------------------------------------------------------------------
  // Abilities
  // ------------------------------------------------------------------------------------------

  abilityReady(t: Tower, id: string): boolean {
    return (t.abilityCd.get(id) ?? 0) <= 0;
  }

  useAbility(t: Tower, ab: AbilityDef): boolean {
    if (!this.abilityReady(t, ab.id) || this.over) return false;
    const p = ab.params;
    const all = () => this.enemies.filter((e) => e.alive);
    const ctx: HitCtx = { tower: t, hitSet: null, canHitAll: true };
    switch (ab.id) {
      case 'thornado':
      case 'royalDecree':
        t.timed.push({ rateMul: p.mul, until: this.time + p.duration, source: ab.id });
        break;
      case 'focus':
      case 'roar': {
        const r = p.radius ?? t.range;
        for (const o of this.towers) {
          if (dist2(o.x, o.y, t.x, t.y) <= (r + o.radius) ** 2) o.timed.push({ rateMul: p.mul, until: this.time + p.duration, source: ab.id });
        }
        this.fx.pulse(t.x, t.y, r, 'nova');
        break;
      }
      case 'quake':
      case 'earthquake': {
        for (const e of all()) {
          this.applyStatus(e, { kind: 'stun', duration: e.def.boss ? p.bossStun : p.stun, boss: 1 }, ctx);
          this.damageEnemy(e, p.damage, 'normal', ctx);
        }
        this.fx.pulse(t.x, t.y, 1800, 'quake');
        this.fx.shake(16);
        break;
      }
      case 'missileStrike': {
        const target = this.strongestBoss() ?? this.strongest();
        if (!target) return false;
        const proj: ProjDef = { visual: 'bigmissile', damage: p.damage, pierce: 1, dmgType: 'normal', speed: 700, radius: 14, homing: 9, life: 6, size: 2, explode: { radius: 70, damage: 40, pierce: 40, dmgType: 'explosive', visual: 'nuke' } };
        const pr = this.spawnProjectile(proj, t, t.x, t.y - 10, Math.atan2(target.y - t.y, target.x - t.x), 3000, target.id);
        pr.canHitAll = true;
        break;
      }
      case 'absoluteZero': {
        for (const e of all()) {
          this.applyStatus(e, { kind: 'freeze', duration: p.duration, boss: p.bossMul, ignoreImmune: true }, ctx);
          this.applyStatus(e, { kind: 'vuln', value: 2, duration: p.duration + 2, boss: 1 }, ctx);
        }
        this.fx.pulse(t.x, t.y, 1800, 'frost');
        break;
      }
      case 'featherStorm': {
        const count = p.count;
        for (let i = 0; i < count; i++) {
          this.scheduled.push({
            at: this.time + (i / count) * 3,
            fn: () => {
              const list = all();
              if (!list.length) return;
              const e = list[Math.floor(Math.random() * list.length)];
              const x = e.x + rand(-12, 12);
              const y = e.y + rand(-12, 12);
              this.areaHit(x, y, 22, p.pierce, { damage: p.damage, dmgType: 'normal' }, ctx);
              this.fx.beam('strike', [x + 60, y - 300, x, y], '#fff1c1', 2);
            },
          });
        }
        break;
      }
      case 'supplyDrop':
      case 'jackpot':
        this.earn(p.cash);
        this.fx.cash(t.x, t.y - 40, p.cash);
        this.fx.sound('cash', 1, 0.7);
        break;
      case 'firestorm': {
        for (const e of all()) {
          this.damageEnemy(e, p.damage, 'fire', ctx);
          if (e.alive) this.applyStatus(e, { kind: 'burn', dps: p.burn, duration: p.duration, boss: 1, dmgType: 'normal' }, ctx);
        }
        this.fx.pulse(t.x, t.y, 1800, 'nova');
        this.fx.shake(10);
        break;
      }
      case 'superstorm': {
        const ticks = Math.floor(p.duration / 0.25);
        for (let i = 0; i < ticks; i++) {
          this.scheduled.push({
            at: this.time + i * 0.25,
            fn: () => {
              const list = all();
              for (let k = 0; k < 6 && list.length; k++) {
                const e = list[Math.floor(Math.random() * list.length)];
                this.areaHit(e.x, e.y, 50, 20, { damage: p.damage, dmgType: 'normal' }, ctx);
                this.fx.beam('strike', [e.x + rand(-40, 40), e.y - 500, e.x, e.y], '#e0fbff', 5);
                this.fx.explosion(e.x, e.y, 50, 'arcane');
              }
              this.fx.sound('zap', 0.5, 0.6);
            },
          });
        }
        break;
      }
      case 'killerSwarm': {
        const a = t.stats.attacks.find((x) => x.kind === 'drone') as DroneAttack | undefined;
        if (!a) return false;
        for (let i = 0; i < p.bees; i++) t.drones.push(this.makeDrone(t, a, this.time + p.duration));
        break;
      }
      case 'orbital': {
        const target = this.strongestBoss() ?? this.strongest();
        if (!target) return false;
        const x = target.x;
        const y = target.y;
        this.areaHit(x, y, p.radius, 60, { damage: p.damage, dmgType: 'normal', statuses: [{ kind: 'stun', duration: 0.6, boss: 0.5 }] }, ctx);
        this.fx.beam('orbital', [x, y - 900, x, y], '#c9b8ff', 26);
        this.fx.explosion(x, y, p.radius, 'arcane');
        this.fx.shake(6);
        break;
      }
      case 'supernova': {
        for (const e of this.enemiesNear(t.x, t.y, p.radius, this.tmp).slice()) {
          this.damageEnemy(e, p.damage, 'normal', ctx);
          if (e.alive) this.applyStatus(e, { kind: 'stun', duration: 2, boss: 0.25 }, ctx);
        }
        this.fx.pulse(t.x, t.y, p.radius, 'nova');
        this.fx.explosion(t.x, t.y, p.radius * 0.6, 'nuke');
        this.fx.shake(12);
        break;
      }
      default:
        return false;
    }
    t.abilityCd.set(ab.id, ab.cooldown * (this.perks.has('abilities') ? 0.9 : 1));
    t.fireAnim = 0;
    this.stats.abilitiesUsed++;
    this.fx.ability(t, ab.id);
    this.fx.sound('ability');
    return true;
  }

  private strongest(): Enemy | null {
    let best: Enemy | null = null;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (!best || e.def.tier > best.def.tier || (e.def.tier === best.def.tier && e.dist > best.dist)) best = e;
    }
    return best;
  }

  private strongestBoss(): Enemy | null {
    let best: Enemy | null = null;
    for (const e of this.enemies) {
      if (!e.alive || !e.def.boss) continue;
      if (!best || e.def.tier > best.def.tier || (e.def.tier === best.def.tier && e.hp > best.hp)) best = e;
    }
    return best;
  }

  // ------------------------------------------------------------------------------------------
  // Save / load
  // ------------------------------------------------------------------------------------------

  serialize(): SaveState {
    return {
      v: 1,
      mapId: this.config.mapId,
      difficulty: this.config.difficulty,
      heroId: this.config.heroId,
      round: this.round,
      cash: this.cash,
      lives: this.lives,
      freeplay: this.freeplay,
      frenzyMeter: this.frenzyMeter,
      stats: { ...this.stats },
      savedAt: Date.now(),
      perks: this.config.perks,
      challenge: this.config.challenge,
      towers: this.towers.map((t) => ({
        k: t.isHero ? 'h' : 't',
        id: String(t.typeId),
        x: t.x,
        y: t.y,
        tiers: [...t.tiers] as [number, number, number],
        priority: t.priority,
        pops: t.pops,
        spent: t.spent,
        stash: t.stash,
        heroLevel: t.heroLevel,
        heroXp: t.heroXp,
      })),
    };
  }

  static restore(s: SaveState): Game {
    const g = new Game({ mapId: s.mapId, difficulty: s.difficulty, heroId: s.heroId, perks: s.perks, challenge: s.challenge });
    g.round = s.round;
    g.cash = s.cash;
    g.lives = s.lives;
    g.freeplay = s.freeplay;
    g.won = s.round > g.lastRound;
    g.frenzyMeter = s.frenzyMeter;
    g.stats = { ...g.stats, ...s.stats };
    for (const st of s.towers) {
      const t =
        st.k === 'h'
          ? new Tower(g.nextId++, { hero: st.id as HeroId }, st.x, st.y, st.spent)
          : new Tower(g.nextId++, { tower: TOWERS[st.id as TowerId] as TowerDef }, st.x, st.y, st.spent);
      t.tiers = [...st.tiers] as [number, number, number];
      t.priority = st.priority;
      t.pops = st.pops;
      t.stash = st.stash;
      t.heroLevel = st.heroLevel;
      t.heroXp = st.heroXp;
      t.refreshStats();
      g.initTower(t);
    }
    for (let r = 1; r < s.round; r++) g.hintsShown.add(r);
    return g;
  }
}

function segDist2(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const abx = bx - ax;
  const aby = by - ay;
  const l2 = abx * abx + aby * aby;
  let t = l2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = ax + abx * t - px;
  const dy = ay + aby * t - py;
  return dx * dx + dy * dy;
}
