/**
 * Single source of truth for which painted sprite (public/sprites, see art/ART_BIBLE.md) represents
 * a tower, hero, star, projectile, map or UI icon. Renderer and UI both go through here; every
 * lookup returns null when the sprite is missing so callers can fall back to procedural art.
 *
 * Lookups the renderer makes every frame are memoized (no allocations on the hot path); the memo is
 * dropped whenever more sprites finish loading.
 */
import { getSprite, pickSprite, spritesVersion, requestSprite, releaseSprite, type LoadedSprite } from '../assets/sprites';
import { GLOOPS, type GloopId } from '../game/gloops';
import type { ProjDef } from '../game/towerTypes';
import spriteIndex from '../assets/sprites.json';

/** Sprite file URL usable as <img src>. */
export function spriteUrl(s: LoadedSprite | null): string | null {
  return s ? (import.meta.env.BASE_URL || './') + s.file : null;
}

// --- memo ---------------------------------------------------------------------------------------
type Memo = Map<string, (LoadedSprite | null | undefined)[]>;
let memoVersion = -1;
const towerMemo: Memo = new Map();
const heroMemo: Memo = new Map();
const enemyMemo: Memo = new Map();
const single = new Map<string, LoadedSprite | null>();
const projMemo = new Map<string, LoadedSprite | null>();
function checkVersion() {
  const v = spritesVersion();
  if (v !== memoVersion) {
    towerMemo.clear();
    heroMemo.clear();
    enemyMemo.clear();
    single.clear();
    projMemo.clear();
    memoVersion = v;
  }
}
function table(memo: Memo, key: string, size: number): (LoadedSprite | null | undefined)[] {
  checkVersion();
  let t = memo.get(key);
  if (!t) {
    t = new Array(size);
    memo.set(key, t);
  }
  return t;
}

// --- towers & heroes ----------------------------------------------------------------------------

/** Highest path tier >= 3 decides the look; lower tiers of that path, then the base, are fallbacks. */
export function towerSpriteIds(typeId: string, tiers: readonly number[]): string[] {
  let path = -1;
  let best = 0;
  tiers.forEach((t, i) => {
    if (t > best) {
      best = t;
      path = i;
    }
  });
  const ids: string[] = [];
  if (best >= 3) for (let t = best; t >= 3; t--) ids.push(`t_${typeId}_p${path + 1}_${t}`);
  ids.push(`t_${typeId}`);
  return ids;
}

export function towerArt(typeId: string, tiers: readonly number[]): LoadedSprite | null {
  const a = clampTier(tiers[0]);
  const b = clampTier(tiers[1]);
  const c = clampTier(tiers[2]);
  const t = table(towerMemo, typeId, 216);
  const k = a * 36 + b * 6 + c;
  let s = t[k];
  if (s === undefined) s = t[k] = pickSprite(towerSpriteIds(typeId, [a, b, c]));
  return s;
}

const clampTier = (v: number | undefined) => (v === undefined || v < 0 ? 0 : v > 5 ? 5 : v | 0);

/** Hero looks: level 1-6, 7-13, 14-20. */
export function heroStage(level: number): 1 | 2 | 3 {
  return level >= 14 ? 3 : level >= 7 ? 2 : 1;
}

export function heroArt(heroId: string, level: number): LoadedSprite | null {
  const st = heroStage(level);
  const t = table(heroMemo, heroId, 4);
  let s = t[st];
  if (s === undefined) {
    const ids: string[] = [];
    for (let i = st; i >= 1; i--) ids.push(`h_${heroId}_${i}`);
    s = t[st] = pickSprite(ids);
  }
  return s;
}

// --- stars --------------------------------------------------------------------------------------

/** 0 = intact, 1 = cracked, 2 = badly cracked, 3 = fortified (armour look wins). */
export function enemyLook(type: GloopId, fortified: boolean, hpFrac: number): number {
  const def = GLOOPS[type];
  if (fortified && def.fortifiable) return 3;
  if (def.hp > 1) return hpFrac <= 0.34 ? 2 : hpFrac <= 0.67 ? 1 : 0;
  return 0;
}

/**
 * Star sprite. Fortified stars use the `_f` variant; the Emerald and bosses switch to damage states
 * `_d1` / `_d2` as their shell loses HP (fortified ones keep the armoured look).
 */
export function enemyArt(type: GloopId, opts: { fortified?: boolean; hpFrac?: number } = {}): LoadedSprite | null {
  return enemyArtLook(type, enemyLook(type, !!opts.fortified, opts.hpFrac ?? 1));
}

export function enemyArtLook(type: GloopId, look: number): LoadedSprite | null {
  const t = table(enemyMemo, type, 4);
  let s = t[look];
  if (s === undefined) {
    const base = `e_${type}`;
    const ids = look === 3 ? [base + '_f'] : look === 2 ? [base + '_d2', base + '_d1'] : look === 1 ? [base + '_d1'] : [];
    ids.push(base);
    s = t[look] = pickSprite(ids);
  }
  return s;
}

// --- projectiles, drones, traps, drops ----------------------------------------------------------

function one(id: string): LoadedSprite | null {
  checkVersion();
  let s = single.get(id);
  if (s === undefined) {
    s = getSprite(id);
    single.set(id, s);
  }
  return s;
}

/** p_<visual>: quill, javelin, bomb, missile, shard, lance, iceball, bolt, fireball, star, spirit, ... */
export function projectileArt(visual: string): LoadedSprite | null {
  checkVersion();
  let s = projMemo.get(visual);
  if (s === undefined) {
    s = getSprite('p_' + visual);
    projMemo.set(visual, s);
  }
  return s;
}

/** Projectile look including upgrades that change it (atomic cans, arcane orbs). */
export function projectileArtFor(def: ProjDef): LoadedSprite | null {
  const ex = def.explode?.visual;
  if (def.visual === 'bomb' && ex === 'nuke') return one('p_nuke') ?? one('p_bomb');
  if (def.visual === 'bolt' && ex === 'arcane') return one('p_arcane') ?? one('p_bolt');
  return projectileArt(def.visual);
}

/** Drones: bee -> scout drone, wasp -> jet, queen -> mother drone, phoenix. */
export function droneArt(visual: string): LoadedSprite | null {
  return projectileArt(visual);
}

/** Orbiting helpers of a tower (spirit wisps). Blades stay procedural. */
export function orbitArt(visual: string): LoadedSprite | null {
  return visual === 'wisp' ? one('p_wisp') : null;
}

/** Ghost raccoon runners. */
export function runnerArt(): LoadedSprite | null {
  return one('p_foxspirit');
}

/** Glue puddles (honey) and tesla traps (coil). */
export function trapArt(visual: string): LoadedSprite | null {
  return visual === 'honey' ? one('p_honey') : visual === 'coil' ? one('p_coil') : null;
}

/** Loot the Hoarder digs up; big piles get the gold-and-gems look. */
export function dropArt(value: number): LoadedSprite | null {
  return value >= 30 ? one('p_lootgold') ?? one('p_loot') : one('p_loot');
}

/** Parachute crate of the Supply Drop ability. */
export function crateArt(): LoadedSprite | null {
  return one('p_crate');
}

// --- maps & UI ----------------------------------------------------------------------------------

export function mapArt(mapId: string): LoadedSprite | null {
  return getSprite('m_' + mapId);
}

/**
 * Extended painting of a map (mx_<map>): the m_ painting with real terrain painted above and below the
 * world (for screens taller than 16:9). Loaded on demand: null until it has arrived (the first call
 * starts the download). Only one is kept: asking for a map releases every other map's extension.
 */
let extMap = '';
export function mapExtArt(mapId: string): LoadedSprite | null {
  if (extMap !== mapId) {
    if (extMap) releaseSprite('mx_' + extMap);
    extMap = mapId;
  }
  const s = requestSprite('mx_' + mapId);
  return s && s.wy ? s : null;
}

/** Let go of the extended painting (the screen shows no terrain above / below the world). */
export function releaseMapExt(): void {
  if (extMap) releaseSprite('mx_' + extMap);
  extMap = '';
}

export function abilityArt(abilityId: string): LoadedSprite | null {
  return getSprite('ab_' + abilityId) ?? getSprite('ab_generic');
}

export function uiArt(name: string): LoadedSprite | null {
  return getSprite('ui_' + name);
}

export const towerIconUrl = (typeId: string, tiers: readonly number[] = [0, 0, 0]) => spriteUrl(towerArt(typeId, tiers));
export const heroIconUrl = (heroId: string, level = 1) => spriteUrl(heroArt(heroId, level));
export const enemyIconUrl = (type: GloopId) => spriteUrl(enemyArt(type));
export const mapImageUrl = (mapId: string) => spriteUrl(mapArt(mapId));
export const abilityIconUrl = (abilityId: string) => spriteUrl(abilityArt(abilityId));
export const uiIconUrl = (name: string) => spriteUrl(uiArt(name));

/** URL of a UI sprite straight from the index, usable before loadSprites() finished (loading screen). */
export function uiIconUrlEager(name: string): string | null {
  const info = (spriteIndex as Record<string, { file: string }>)['ui_' + name];
  return info ? (import.meta.env.BASE_URL || './') + info.file : null;
}
