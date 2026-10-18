import type { Positioned } from '../core/spatial';
import { GLOOPS, type GloopDef, type GloopId } from './gloops';
import type { DamageType } from './types';
import type { ProjDef, ExplodeDef, DroneAttack } from './towerTypes';
import type { Tower } from './Tower';

export class Enemy implements Positioned {
  _q = 0;
  alive = true;
  def: GloopDef;
  hp: number;
  maxHp: number;
  x = 0;
  y = 0;
  angle = 0;
  radius: number;
  /** lateral offset from the track centre */
  lane: number;
  // modifiers
  camo: boolean;
  regrowMax: GloopId | null;
  fortified: boolean;
  // statuses
  slowMul = 1;
  slowT = 0;
  auraSlow = 1;
  auraSlowT = 0;
  freezeT = 0;
  stunT = 0;
  burnDps = 0;
  burnT = 0;
  burnAcc = 0;
  burnType: DamageType = 'fire';
  burnSrc: Tower | null = null;
  poisonDps = 0;
  poisonT = 0;
  poisonAcc = 0;
  poisonSrc: Tower | null = null;
  markMul = 1;
  markT = 0;
  vulnAdd = 0;
  vulnT = 0;
  shockAdd = 0;
  shockT = 0;
  regrowT = 0;
  hitFlash = 0;
  /** visual wobble phase */
  phase = Math.random() * Math.PI * 2;
  age = 0;
  speedMul = 1;

  constructor(
    public id: number,
    public type: GloopId,
    public pathIndex: number,
    public dist: number,
    opts: { camo?: boolean; regrowMax?: GloopId | null; fortified?: boolean; hpMul?: number; lane?: number },
  ) {
    this.def = GLOOPS[type];
    const fort = !!opts.fortified && !!this.def.fortifiable;
    this.fortified = fort;
    this.maxHp = this.def.hp * (fort ? 2 : 1) * (this.def.boss ? opts.hpMul ?? 1 : 1);
    this.hp = this.maxHp;
    this.radius = this.def.radius;
    this.camo = !!opts.camo || !!this.def.camo;
    this.regrowMax = this.def.boss ? null : opts.regrowMax ?? null;
    this.lane = opts.lane ?? 0;
  }

  get frozen() {
    return this.freezeT > 0;
  }

  /** Change in place to another type (used by regrow). */
  morph(type: GloopId) {
    this.type = type;
    this.def = GLOOPS[type];
    this.maxHp = this.def.hp;
    this.hp = this.maxHp;
    this.radius = this.def.radius;
  }
}

export class Projectile {
  alive = true;
  x: number;
  y: number;
  px: number;
  py: number;
  vx: number;
  vy: number;
  speed: number;
  life: number;
  maxLife: number;
  pierce: number;
  hit = new Set<number>();
  targetId = -1;
  rot = 0;
  explodeOnExpire: boolean;
  age = 0;

  constructor(
    public def: ProjDef,
    public owner: Tower | null,
    x: number,
    y: number,
    angle: number,
    range: number,
    public damageAdd = 0,
    pierceAdd = 0,
    public canHitAll = false,
  ) {
    this.x = this.px = x;
    this.y = this.py = y;
    this.speed = def.speed;
    this.vx = Math.cos(angle) * def.speed;
    this.vy = Math.sin(angle) * def.speed;
    this.rot = angle;
    this.explodeOnExpire = def.life !== undefined;
    this.maxLife = this.life = def.life ?? Math.max(0.25, (range * 1.3) / def.speed);
    this.pierce = def.pierce + pierceAdd;
  }
}

export interface Drone {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  cd: number;
  attack: DroneAttack;
  owner: Tower;
  /** temporary drones expire */
  expires: number;
  phase: number;
  targetId: number;
}

export interface Runner {
  alive: boolean;
  pathIndex: number;
  dist: number;
  x: number;
  y: number;
  angle: number;
  pierce: number;
  hit: Set<number>;
  owner: Tower;
  damage: number;
  dmgType: DamageType;
  size: number;
  speed: number;
  knockback: number;
  bossBonus: number;
  age: number;
}

export interface Trap {
  alive: boolean;
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
  tickT: number;
  owner: Tower;
  attackId: string;
  visual: 'honey' | 'coil';
}

export interface Drop {
  alive: boolean;
  x: number;
  y: number;
  tx: number;
  ty: number;
  sx: number;
  sy: number;
  t: number;
  value: number;
  owner: Tower;
  collecting: boolean;
  collectT: number;
  auto: boolean;
}

export interface Scheduled {
  at: number;
  fn: () => void;
}

export type { ExplodeDef };
