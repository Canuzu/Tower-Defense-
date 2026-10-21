/**
 * Scale lab (dev tool, only with ?dev=1): live knobs for how big things are DRAWN, independent of their
 * gameplay sizes. The shipped look ("V5") lives in the real tuning constants (TOWER_TUNING.spoolK,
 * STAR_TUNING.grow / growEven, PROJ_TUNING.scale, FX_TUNING.scale, MAP_DEPTH); the knobs overwrite
 * those constants at runtime, so every value is relative to the original art scale (1 = pre-V5 look):
 *
 *   ?dev=1&viz=towers:1.25,stars:1.45,even:1,proj:1.25,fx:1.2,depth:0.6
 *   window.__viz({ stars: 1.6 })   window.__viz('towers:1')   window.__viz()  (back to the shipped look)
 *
 * - towers: raccoon sprite + spool shadow + selection ring (range circles and footprints stay gameplay-true)
 * - stars:  drawn scale of the Red Dwarf (incl. hover, shadow, overlays, boss bar, shatter size)
 * - even:   0..1, how the stars boost is spread: 0 = every star x stars, 1 = every bigger star gets the
 *           Red Dwarf's absolute boost (bosses grow ~10%, big stars stay inside the track)
 * - proj:   projectile / drone / wisp / runner sprites, beam widths
 * - fx:     decorative particle sizes (sparks, smoke, sparkles, shards, coins); area rings stay gameplay-true
 * - depth:  0..1 depth pass strength (background grade, vignette, stronger contact shadows); unset = per map
 */
import { TOWER_TUNING } from './towerView';
import { STAR_TUNING } from './starView';
import { PROJ_TUNING } from './projView';
import { FX_TUNING } from './particles';

export interface Viz {
  towers: number;
  stars: number;
  even: number;
  proj: number;
  fx: number;
  /** null = the map's own strength (MAP_DEPTH) */
  depth: number | null;
}

/** Spool width / gameplay radius the tower art was calibrated at (towers knob 1). */
const ART_SPOOL_K = 3.5;

function current(): Viz {
  return {
    towers: TOWER_TUNING.spoolK / ART_SPOOL_K,
    stars: 1 + STAR_TUNING.grow,
    even: STAR_TUNING.growEven,
    proj: PROJ_TUNING.scale,
    fx: FX_TUNING.scale,
    depth,
  };
}

let depth: number | null = null;
/** The shipped values, captured before any knob is touched. */
const SHIPPED: Viz = current();

const LIMITS: Record<keyof Viz, [number, number]> = {
  towers: [0.5, 2.5],
  stars: [0.5, 2.5],
  even: [0, 1],
  proj: [0.5, 3],
  fx: [0.5, 3],
  depth: [0, 1],
};

/** "towers:1.2,stars:1.4" (also accepts '=' and ';' / '&'). Unknown keys are ignored. */
export function parseViz(s: string): Partial<Viz> {
  const out: Partial<Viz> = {};
  for (const part of s.split(/[,;&]/)) {
    const [k, v] = part.split(/[:=]/).map((x) => x.trim());
    if (!k || !(k in LIMITS)) continue;
    const n = Number(v);
    if (Number.isFinite(n)) out[k as keyof Viz] = n;
  }
  return out;
}

/** Apply knobs (missing ones keep their value); `null` restores the shipped look. Returns the knobs now in effect. */
export function setViz(p: Partial<Viz> | string | null): Viz {
  const o: Partial<Viz> = p === null ? SHIPPED : typeof p === 'string' ? parseViz(p) : p;
  for (const k of Object.keys(o) as (keyof Viz)[]) {
    if (!(k in LIMITS)) continue;
    const raw = o[k];
    if (k === 'depth' && raw === null) {
      depth = null;
      continue;
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const [lo, hi] = LIMITS[k];
    const v = Math.max(lo, Math.min(hi, n));
    if (k === 'towers') TOWER_TUNING.spoolK = ART_SPOOL_K * v;
    else if (k === 'stars') STAR_TUNING.grow = v - 1;
    else if (k === 'even') STAR_TUNING.growEven = v;
    else if (k === 'proj') PROJ_TUNING.scale = v;
    else if (k === 'fx') FX_TUNING.scale = v;
    else depth = v;
  }
  return current();
}

/** Reads ?viz=... once at boot (dev builds / ?dev=1 only). */
export function initVizFromUrl(): void {
  if (typeof location === 'undefined') return;
  const q = new URLSearchParams(location.search).get('viz');
  if (q) setViz(q);
}
