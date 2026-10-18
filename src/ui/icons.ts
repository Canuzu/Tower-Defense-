import { gloopSprite } from '../render/gloopArt';
import { GLOOPS, type GloopId } from '../game/gloops';
import { makeCanvas } from '../render/draw';

const cache = new Map<string, string>();

/** Star portrait as a data URL (used by the sandbox panel and the Star Atlas). */
export function gloopIcon(id: GloopId, px = 64): string {
  const key = id + px;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = GLOOPS[id];
  const span = def.radius * 2.6;
  const res = px / span;
  const s = gloopSprite(id, { camo: false, regrow: false, fortified: false, dmg: 0 }, res * 2);
  const [c, ctx] = makeCanvas(px, px);
  ctx.drawImage(s.canvas, (px - s.w * res) / 2, (px - s.h * res) / 2, s.w * res, s.h * res);
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
