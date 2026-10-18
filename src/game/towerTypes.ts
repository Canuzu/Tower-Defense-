import type { DamageType, StatusApply } from './types';

export type ProjVisual =
  | 'quill'
  | 'javelin'
  | 'bomb'
  | 'minibomb'
  | 'missile'
  | 'bigmissile'
  | 'shard'
  | 'iceball'
  | 'lance'
  | 'bolt'
  | 'firebolt'
  | 'fireball'
  | 'flame'
  | 'spirit'
  | 'stinger'
  | 'feather'
  | 'laser'
  | 'star';

export type BoomVisual = 'boom' | 'frost' | 'fire' | 'arcane' | 'nuke' | 'mini' | 'poison';

export interface ExplodeDef {
  radius: number;
  damage: number;
  pierce: number;
  dmgType: DamageType;
  statuses?: StatusApply[];
  bossBonus?: number;
  visual?: BoomVisual;
  cluster?: { count: number; proj: ProjDef };
}

export interface ProjDef {
  visual: ProjVisual;
  damage: number;
  pierce: number;
  dmgType: DamageType;
  speed: number;
  /** collision radius */
  radius: number;
  /** lifetime in seconds; default derived from range */
  life?: number;
  /** turn rate (rad/s) for homing projectiles */
  homing?: number;
  explode?: ExplodeDef;
  statuses?: StatusApply[];
  bossBonus?: number;
  bossMul?: number;
  /** extra damage to Crystal and Iron gloops */
  heavyBonus?: number;
  /** spawned when the projectile's pierce runs out or it expires */
  split?: { count: number; proj: ProjDef };
  /** visual scale */
  size?: number;
}

interface AttackBase {
  id: string;
  /** seconds between attacks */
  rate: number;
  /** multiplier on tower range for this attack */
  rangeMul?: number;
}

export interface ShootAttack extends AttackBase {
  kind: 'shoot';
  proj: ProjDef;
  count: number;
  /** total spread in degrees across `count` projectiles; 360 = full circle */
  spread: number;
  /** random aim jitter in degrees */
  jitter?: number;
}

export interface RadialAttack extends AttackBase {
  kind: 'radial';
  proj: ProjDef;
  count: number;
}

export interface PulseAttack extends AttackBase {
  kind: 'pulse';
  damage: number;
  dmgType: DamageType;
  pierce: number;
  statuses: StatusApply[];
  ignoreImmune?: boolean;
  visual: 'frost' | 'slam' | 'shock';
}

export interface HitscanAttack extends AttackBase {
  kind: 'hitscan';
  damage: number;
  dmgType: DamageType;
  bossBonus?: number;
  bossMul?: number;
  heavyBonus?: number;
  ricochet?: number;
  ricochetRange?: number;
  shrapnel?: { count: number; proj: ProjDef };
  statuses?: StatusApply[];
  critEvery?: number;
  critMul?: number;
  stripFortify?: boolean;
  global?: boolean;
}

export interface ChainAttack extends AttackBase {
  kind: 'chain';
  damage: number;
  dmgType: DamageType;
  chains: number;
  chainRange: number;
  statuses?: StatusApply[];
  bossBonus?: number;
}

export interface StrikeAttack extends AttackBase {
  kind: 'strike';
  count: number;
  damage: number;
  dmgType: DamageType;
  radius: number;
  pierce: number;
  statuses?: StatusApply[];
  bossBonus?: number;
  visual: 'lightning' | 'meteor';
}

export interface OrbitAttack extends AttackBase {
  kind: 'orbit';
  count: number;
  orbitRadius: number;
  angSpeed: number;
  damage: number;
  dmgType: DamageType;
  /** seconds before the same orbiter can hit the same gloop again */
  hitCooldown: number;
  size: number;
  visual: 'wisp' | 'blade';
}

export interface RunnerAttack extends AttackBase {
  kind: 'runner';
  damage: number;
  dmgType: DamageType;
  pierce: number;
  speed: number;
  size: number;
  knockback?: number;
  bossBonus?: number;
  visual: 'foxspirit';
}

export interface DroneAttack extends AttackBase {
  kind: 'drone';
  count: number;
  speed: number;
  proj: ProjDef;
  /** seconds between shots of each drone */
  droneRate: number;
  visual: 'bee' | 'wasp' | 'queen' | 'phoenix';
}

export interface TrapAttack extends AttackBase {
  kind: 'trap';
  max: number;
  life: number;
  radius: number;
  damage: number;
  dmgType: DamageType;
  /** max gloops affected per tick */
  pierce: number;
  tick: number;
  statuses?: StatusApply[];
  visual: 'honey' | 'coil';
}

export interface TongueAttack extends AttackBase {
  kind: 'tongue';
  damage: number;
  rangeAdd: number;
  /** highest boss tier swallowed whole (0 = none) */
  swallowTier: number;
  /** damage vs bosses (0 = cannot target bosses) */
  bossDamage: number;
  bossKnockback: number;
}

export interface AuraAttack extends AttackBase {
  kind: 'aura';
  /** speed multiplier for normal gloops (1 = none) */
  slow: number;
  slowBoss: number;
  dps: number;
  dmgType: DamageType;
  statuses?: StatusApply[];
  ignoreImmune?: boolean;
}

export type AttackDef =
  | ShootAttack
  | RadialAttack
  | PulseAttack
  | HitscanAttack
  | ChainAttack
  | StrikeAttack
  | OrbitAttack
  | RunnerAttack
  | DroneAttack
  | TrapAttack
  | TongueAttack
  | AuraAttack;

export type AttackKind = AttackDef['kind'];
export type AttackOf<K extends AttackKind> = Extract<AttackDef, { kind: K }>;

export interface AbilityDef {
  id: string;
  name: string;
  icon: string;
  desc: string;
  cooldown: number;
  /** generic numeric parameters interpreted by the ability implementation */
  params: Record<string, number>;
}

export interface BuffAura {
  /** defaults to the tower's range */
  range?: number;
  global?: boolean;
  /** restrict to one tower type */
  only?: string;
  rateMul?: number;
  rangeMul?: number;
  damageAdd?: number;
  pierceAdd?: number;
  camo?: boolean;
  canHitAll?: boolean;
  discount?: number;
  cashMul?: number;
}

export interface IncomeDef {
  perDrop: number;
  drops: number;
  autoCollect: boolean;
  /** pay directly instead of dropping acorns */
  direct: boolean;
  /** flat cash at end of round */
  bonusPerRound: number;
}

export interface BankDef {
  capacity: number;
  interest: number;
}

export interface TowerStats {
  range: number;
  camo: boolean;
  canHitAll: boolean;
  attacks: AttackDef[];
  abilities: AbilityDef[];
  income?: IncomeDef;
  bank?: BankDef;
  buffAura?: BuffAura;
  sellMul: number;
}

export interface UpgradeDef {
  name: string;
  cost: number;
  desc: string;
  apply: (s: TowerStats) => void;
}

export type TowerId = 'spike' | 'boomer' | 'frost' | 'hoot' | 'ember' | 'zap' | 'buzz' | 'acorn' | 'dojo';

export interface TowerDef {
  id: TowerId;
  name: string;
  species: string;
  role: 'Primary' | 'Military' | 'Magic' | 'Support';
  desc: string;
  cost: number;
  radius: number;
  unlock: number;
  color: string;
  base: () => TowerStats;
  pathNames: [string, string, string];
  paths: [UpgradeDef[], UpgradeDef[], UpgradeDef[]];
  hotkey: string;
}

export function atk<K extends AttackKind>(s: TowerStats, id: string, kind: K): AttackOf<K> {
  const a = s.attacks.find((x) => x.id === id);
  if (!a || a.kind !== kind) throw new Error(`attack ${id} (${kind}) not found`);
  return a as AttackOf<K>;
}

export function ability(s: TowerStats, id: string): AbilityDef {
  const a = s.abilities.find((x) => x.id === id);
  if (!a) throw new Error(`ability ${id} not found`);
  return a;
}

export function setAbility(s: TowerStats, ab: AbilityDef) {
  const i = s.abilities.findIndex((x) => x.id === ab.id);
  if (i >= 0) s.abilities[i] = ab;
  else s.abilities.push(ab);
}

/** Upgrade rules: at most two paths in use, and only one of them past tier 2. */
export function canTier(tiers: readonly number[], path: number): boolean {
  if (tiers[path] >= 5) return false;
  const next = tiers.slice();
  next[path]++;
  const used = next.filter((t) => t > 0).length;
  const deep = next.filter((t) => t > 2).length;
  return used <= 2 && deep <= 1;
}

export function computeStats(def: TowerDef, tiers: readonly number[]): TowerStats {
  const s = def.base();
  for (let p = 0; p < 3; p++) {
    for (let t = 0; t < tiers[p]; t++) def.paths[p][t].apply(s);
  }
  return s;
}

export function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}
