/**
 * Pre-scaled copies of painted sprites. Drawing a 320 px sprite at 40 device px every frame makes
 * the browser resample the big image each time (slow, and aliased with low-quality smoothing), so
 * every sprite is rendered once per size bucket (steps of 2^(1/6), ~12%) with a high-quality
 * multi-step downscale and reused. Tinted variants (white flash, camo, invalid red) are cached the
 * same way. All lookups are allocation-free after the first use.
 */
import type { LoadedSprite } from '../assets/sprites';

export const enum SV {
  Normal = 0,
  /** white silhouette (hit / upgrade flash, drawn additively) */
  White = 1,
  /** camouflaged: darkened, desaturated, with a faint light rim */
  Camo = 2,
  /** invalid placement ghost */
  Red = 3,
}
const VARIANTS = 4;
const STEPS = 6; // buckets per octave
const MAX_BUCKET = 12 * STEPS; // 4096 px

type Buckets = (HTMLCanvasElement | undefined)[];
interface Slot {
  v: Buckets[];
  /** cache generation the buckets belong to */
  g: number;
}
const slots = new WeakMap<LoadedSprite, Slot>();
let pixels = 0;
const PIXEL_BUDGET = 60_000_000;
let generation = 0;

function newCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

/** Device-pixel width -> bucket index (rounded up so we only ever downscale a little). */
export function bucketOf(px: number): number {
  if (px <= 4) return 2 * STEPS;
  const b = Math.ceil(Math.log2(px) * STEPS - 1e-6);
  return b > MAX_BUCKET ? MAX_BUCKET : b;
}

function render(s: LoadedSprite, b: number): HTMLCanvasElement {
  const w = Math.max(1, Math.round(Math.pow(2, b / STEPS)));
  const h = Math.max(1, Math.round((w * s.h) / s.w));
  // halve in steps for quality (bilinear only looks at 2x2 texels)
  let src: CanvasImageSource = s.img;
  let sw = s.img.naturalWidth || s.w;
  let sh = s.img.naturalHeight || s.h;
  while (sw / 2 >= w * 1.15) {
    const nw = Math.max(w, Math.round(sw / 2));
    const nh = Math.max(h, Math.round(sh / 2));
    const tmp = newCanvas(nw, nh);
    const tc = tmp.getContext('2d')!;
    tc.imageSmoothingEnabled = true;
    tc.imageSmoothingQuality = 'high';
    tc.drawImage(src, 0, 0, sw, sh, 0, 0, nw, nh);
    src = tmp;
    sw = nw;
    sh = nh;
  }
  const c = newCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, sw, sh, 0, 0, w, h);
  return c;
}

function variant(base: HTMLCanvasElement, v: SV): HTMLCanvasElement {
  const w = base.width;
  const h = base.height;
  const c = newCanvas(w, h);
  const ctx = c.getContext('2d')!;
  if (v === SV.White) {
    ctx.drawImage(base, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
  } else if (v === SV.Red) {
    ctx.drawImage(base, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255,40,50,0.6)';
    ctx.fillRect(0, 0, w, h);
  } else if (v === SV.Camo) {
    // light rim: silhouette offset in 8 directions, then the darkened body on top
    const rim = newCanvas(w, h);
    const rc = rim.getContext('2d')!;
    rc.drawImage(base, 0, 0);
    rc.globalCompositeOperation = 'source-in';
    rc.fillStyle = '#c8fbff';
    rc.fillRect(0, 0, w, h);
    const o = Math.max(1, Math.round(w / 70));
    ctx.globalAlpha = 0.55;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.drawImage(rim, Math.round(Math.cos(a) * o), Math.round(Math.sin(a) * o));
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'destination-out';
    ctx.drawImage(base, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    // body: darkened, cool tint
    const body = newCanvas(w, h);
    const bc = body.getContext('2d')!;
    bc.drawImage(base, 0, 0);
    bc.globalCompositeOperation = 'source-atop';
    bc.fillStyle = 'rgba(24,20,44,0.62)';
    bc.fillRect(0, 0, w, h);
    bc.fillStyle = 'rgba(70,90,130,0.22)';
    bc.fillRect(0, 0, w, h);
    ctx.drawImage(body, 0, 0);
  }
  return c;
}

/**
 * Canvas holding sprite `s` about `pxW` device pixels wide (never smaller), optionally tinted.
 * Draw it with the destination size you want; the remaining resample is at most ~12%.
 */
export function scaledSprite(s: LoadedSprite, pxW: number, v: SV = SV.Normal): HTMLCanvasElement {
  const b = bucketOf(pxW);
  let slot = slots.get(s);
  if (!slot || slot.g !== generation) {
    slot = { v: [], g: generation };
    for (let i = 0; i < VARIANTS; i++) slot.v.push([]);
    slots.set(s, slot);
  }
  const arr = slot.v[v];
  let c = arr[b];
  if (c) return c;
  if (pixels > PIXEL_BUDGET) {
    // a resize storm left lots of unused buckets around: start over
    generation++;
    pixels = 0;
    return scaledSprite(s, pxW, v);
  }
  if (v === SV.Normal) {
    c = render(s, b);
  } else {
    c = variant(scaledSprite(s, pxW, SV.Normal), v);
  }
  arr[b] = c;
  pixels += c.width * c.height;
  return c;
}

/** Drops every cached copy (e.g. after the device pixel ratio changed). */
export function clearSpriteCache() {
  generation++;
  pixels = 0;
}
