/**
 * Single source of truth for which painted sprite (public/sprites, see art/ART_BIBLE.md) represents
 * a tower, hero, star, projectile, map or UI icon. Renderer and UI both go through here; every
 * lookup returns null when the sprite is missing so callers can fall back to procedural art.
 */
import { getSprite, pickSprite, type LoadedSprite } from '../assets/sprites';
import { GLOOPS, type GloopId } from '../game/gloops';

/** Sprite file URL usable as <img src>. */
export function spriteUrl(s: LoadedSprite | null): string | null {
  return s ? (import.meta.env.BASE_URL || './') + s.file : null;
}

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
  return pickSprite(towerSpriteIds(typeId, tiers));
}

/** Hero looks: level 1-6, 7-13, 14-20. */
export function heroStage(level: number): 1 | 2 | 3 {
  return level >= 14 ? 3 : level >= 7 ? 2 : 1;
}

export function heroArt(heroId: string, level: number): LoadedSprite | null {
  const st = heroStage(level);
  const ids: string[] = [];
  for (let s = st; s >= 1; s--) ids.push(`h_${heroId}_${s}`);
  return pickSprite(ids);
}

/**
 * Star sprite. Fortified stars use the `_f` variant; the Emerald and bosses switch to damage states
 * `_d1` / `_d2` as their shell loses HP (fortified ones keep the armoured look).
 */
export function enemyArt(type: GloopId, opts: { fortified?: boolean; hpFrac?: number } = {}): LoadedSprite | null {
  const ids: string[] = [];
  const base = `e_${type}`;
  if (opts.fortified && GLOOPS[type].fortifiable) ids.push(base + '_f');
  else if (opts.hpFrac !== undefined && GLOOPS[type].hp > 1) {
    if (opts.hpFrac <= 0.34) ids.push(base + '_d2', base + '_d1');
    else if (opts.hpFrac <= 0.67) ids.push(base + '_d1');
  }
  ids.push(base);
  return pickSprite(ids);
}

export function projectileArt(visual: string): LoadedSprite | null {
  return getSprite('p_' + visual);
}

export function mapArt(mapId: string): LoadedSprite | null {
  return getSprite('m_' + mapId);
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
