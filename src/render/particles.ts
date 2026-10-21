import { makeCanvas } from './draw';
import { parseHex, shade } from '../core/math';

/**
 * V5 scale pass: decorative particles (sparks, smoke, sparkles, shards, coins, ...) are drawn `scale` x
 * their spawn size. Rings, flashes and rays keep their sizes: they show gameplay areas (blast radii).
 */
export const FX_TUNING = { scale: 1.2 };

export const enum PK {
  Drop,
  Spark,
  Ring,
  Smoke,
  Text,
  Shard,
  Star,
  Flash,
  Flame,
  Coin,
  Snow,
  Stain,
  Bubble,
  Confetti,
  /** faceted crystal shard (star shatter), `color` + `variant` pick the cached sprite */
  Crystal,
  /** ring lying on the ground (ellipse), additive */
  GroundRing,
  /** rotating light rays (tower transform), additive */
  Rays,
  /** twinkling glitter left on the ground */
  Glitter,
}

export interface Particle {
  kind: PK;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  size2: number;
  color: string;
  rot: number;
  vr: number;
  gravity: number;
  drag: number;
  text: string;
  /** css px font size for text */
  font: number;
  ground: boolean;
  /** sprite variant (crystal shard shape) */
  variant: number;
}

const MAX = 2000;
const TAU_P = Math.PI * 2;

/** Soft round glow sprites, tinted per colour and cached. */
const glowCache = new Map<string, HTMLCanvasElement>();
export function glowSprite(color: string): HTMLCanvasElement {
  let c = glowCache.get(color);
  if (c) return c;
  const [cv, ctx] = makeCanvas(64, 64);
  const [r, g, b] = parseHex(color);
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(255,255,255,1)`);
  grad.addColorStop(0.25, `rgba(${r},${g},${b},0.9)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  glowCache.set(color, cv);
  c = cv;
  return c;
}

/** Pure coloured soft glow without the white core (ambient light pools). */
const softCache = new Map<string, HTMLCanvasElement>();
export function softGlow(color: string): HTMLCanvasElement {
  let c = softCache.get(color);
  if (c) return c;
  const [cv, ctx] = makeCanvas(64, 64);
  const [r, g, b] = parseHex(color);
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${r},${g},${b},1)`);
  grad.addColorStop(0.45, `rgba(${r},${g},${b},0.45)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  softCache.set(color, cv);
  return cv;
}

/** Four-point lens flare with a coloured halo (sparkles, glints). */
const flareCache = new Map<string, HTMLCanvasElement>();
export function flareSprite(color: string): HTMLCanvasElement {
  let c = flareCache.get(color);
  if (c) return c;
  const S = 64;
  const [cv, ctx] = makeCanvas(S, S);
  const [r, g, b] = parseHex(color);
  const halo = ctx.createRadialGradient(32, 32, 0, 32, 32, 22);
  halo.addColorStop(0, `rgba(${r},${g},${b},0.85)`);
  halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, S, S);
  ctx.translate(32, 32);
  // two long rays and two short diagonal ones, each a thin lens shape
  for (let i = 0; i < 4; i++) {
    const len = i < 2 ? 31 : 16;
    const w = i < 2 ? 4.2 : 2.6;
    ctx.save();
    ctx.rotate((i * Math.PI) / 2 + (i < 2 ? 0 : Math.PI / 4));
    ctx.beginPath();
    ctx.moveTo(0, -len);
    ctx.quadraticCurveTo(w, 0, 0, len);
    ctx.quadraticCurveTo(-w, 0, 0, -len);
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, len);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, `rgba(${Math.min(255, r + 60)},${Math.min(255, g + 60)},${Math.min(255, b + 60)},0.9)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, 6);
  core.addColorStop(0, 'rgba(255,255,255,1)');
  core.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = core;
  ctx.fillRect(-6, -6, 12, 12);
  flareCache.set(color, cv);
  return cv;
}

/**
 * Faceted crystal shards in three shapes, pre-rendered at SHARD_FRAMES rotations so spinning shards
 * draw without a rotated transform (much cheaper when the canvas is rasterized on the CPU).
 * Each frame is 40x40 with the shard centred; the shard spans about 32 px.
 */
const SHARD_SHAPES: number[][] = [
  // long splinter
  [0, -22, 7, -4, 4, 18, -6, 10, -7, -6],
  // kite
  [0, -16, 12, -2, 2, 16, -11, 3],
  // chunky triangle
  [-2, -15, 14, 9, -13, 12],
];
export const SHARD_VARIANTS = SHARD_SHAPES.length;
export const SHARD_FRAMES = 12;
const SHARD_PX = 40;
const crystalCache = new Map<string, HTMLCanvasElement[]>();
export function crystalSprite(color: string, variant: number, frame = 0): HTMLCanvasElement {
  let arr = crystalCache.get(color);
  if (!arr) {
    arr = [];
    for (const pts of SHARD_SHAPES) {
      const base = drawShard(color, pts);
      for (let f = 0; f < SHARD_FRAMES; f++) {
        const [c, ctx] = makeCanvas(SHARD_PX, SHARD_PX);
        ctx.translate(SHARD_PX / 2, SHARD_PX / 2);
        ctx.rotate((f / SHARD_FRAMES) * Math.PI * 2);
        ctx.scale(SHARD_PX / 52, SHARD_PX / 52);
        ctx.drawImage(base, -24, -24);
        arr.push(c);
      }
    }
    crystalCache.set(color, arr);
  }
  return arr[(variant % SHARD_VARIANTS) * SHARD_FRAMES + frame];
}

function drawShard(color: string, pts: number[]): HTMLCanvasElement {
  const [cv, ctx] = makeCanvas(48, 48);
  ctx.translate(24, 24);
  const n = pts.length / 2;
  const poly = () => {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (i === 0) ctx.moveTo(pts[0], pts[1]);
      else ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
    }
    ctx.closePath();
  };
  // soft glow halo
  const [r, g, b] = parseHex(color);
  const halo = ctx.createRadialGradient(0, 0, 4, 0, 0, 24);
  halo.addColorStop(0, `rgba(${r},${g},${b},0.35)`);
  halo.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = halo;
  ctx.fillRect(-24, -24, 48, 48);
  // body
  poly();
  ctx.fillStyle = shade(color, -0.12);
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = shade(color, -0.55);
  ctx.stroke();
  // facets: fan from an inner point, alternating light / dark
  const cx = pts[0] * 0.25;
  const cy = pts[1] * 0.25;
  ctx.save();
  poly();
  ctx.clip();
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
    ctx.lineTo(pts[j * 2], pts[j * 2 + 1]);
    ctx.closePath();
    const lit = (pts[i * 2] + pts[j * 2]) * -0.6 + (pts[i * 2 + 1] + pts[j * 2 + 1]) * -0.8; // light from top-left
    ctx.fillStyle = lit > 0 ? shade(color, 0.25 + Math.min(0.35, lit / 60)) : shade(color, -0.1 + Math.max(-0.3, lit / 80));
    ctx.fill();
  }
  // glossy edge highlight
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  ctx.lineTo(pts[2] * 0.9, pts[3] * 0.9);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(pts[0] * 0.55 + cx * 0.45, pts[1] * 0.55 + cy * 0.45, 1.8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return cv;
}

/** Light rays for transform bursts. */
let raysCanvas: HTMLCanvasElement | null = null;
function raysSprite(): HTMLCanvasElement {
  if (raysCanvas) return raysCanvas;
  const S = 128;
  const [cv, ctx] = makeCanvas(S, S);
  ctx.translate(S / 2, S / 2);
  const grad = ctx.createRadialGradient(0, 0, 4, 0, 0, S / 2);
  grad.addColorStop(0, 'rgba(255,250,220,1)');
  grad.addColorStop(0.5, 'rgba(255,220,120,0.45)');
  grad.addColorStop(1, 'rgba(255,200,80,0)');
  ctx.fillStyle = grad;
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = i % 2 ? 0.09 : 0.14;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a - w) * S, Math.sin(a - w) * S);
    ctx.lineTo(Math.cos(a + w) * S, Math.sin(a + w) * S);
    ctx.closePath();
    ctx.fill();
  }
  raysCanvas = cv;
  return cv;
}

const dropCache = new Map<string, HTMLCanvasElement>();
function dropSprite(color: string): HTMLCanvasElement {
  let c = dropCache.get(color);
  if (c) return c;
  const [cv, ctx] = makeCanvas(32, 32);
  const [r, g, b] = parseHex(color);
  ctx.beginPath();
  ctx.arc(16, 16, 13, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(11, 10, 1, 16, 16, 14);
  grad.addColorStop(0, `rgb(${Math.min(255, r + 90)},${Math.min(255, g + 90)},${Math.min(255, b + 90)})`);
  grad.addColorStop(0.6, `rgb(${r},${g},${b})`);
  grad.addColorStop(1, `rgb(${r * 0.6},${g * 0.6},${b * 0.6})`);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(11, 10, 3.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
  dropCache.set(color, cv);
  c = cv;
  return c;
}

let smokeSprite: HTMLCanvasElement | null = null;
function getSmoke() {
  if (smokeSprite) return smokeSprite;
  const [cv, ctx] = makeCanvas(64, 64);
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.8)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  smokeSprite = cv;
  return cv;
}

let coinSprite: HTMLCanvasElement | null = null;
function getCoin() {
  if (coinSprite) return coinSprite;
  const [cv, ctx] = makeCanvas(32, 32);
  const grad = ctx.createRadialGradient(12, 11, 1, 16, 16, 15);
  grad.addColorStop(0, '#fff6c4');
  grad.addColorStop(0.45, '#ffd23c');
  grad.addColorStop(1, '#c98a12');
  ctx.beginPath();
  ctx.arc(16, 16, 14, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#8a5a0b';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(16, 16, 9, 0, Math.PI * 2);
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = 'rgba(160,100,10,0.8)';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(11, 10, 4, 2.4, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
  coinSprite = cv;
  return cv;
}

export class Particles {
  list: Particle[] = [];
  private pool: Particle[] = [];
  reduced = false;

  spawn(kind: PK, x: number, y: number, o: Partial<Particle> = {}): Particle | null {
    if (this.list.length >= MAX) {
      if (kind !== PK.Text) return null;
      this.list.shift();
    }
    const p = this.pool.pop() ?? ({} as Particle);
    p.kind = kind;
    p.x = x;
    p.y = y;
    p.vx = o.vx ?? 0;
    p.vy = o.vy ?? 0;
    p.max = p.life = o.life ?? 0.6;
    p.size = o.size ?? 4;
    p.size2 = o.size2 ?? 0;
    p.color = o.color ?? '#ffffff';
    p.rot = o.rot ?? Math.random() * Math.PI * 2;
    p.vr = o.vr ?? 0;
    p.gravity = o.gravity ?? 0;
    p.drag = o.drag ?? 0;
    p.text = o.text ?? '';
    p.font = o.font ?? 16;
    p.ground = o.ground ?? false;
    p.variant = o.variant ?? 0;
    this.list.push(p);
    return p;
  }

  /** Allocation-free spawn for hot paths (shatter shards): positional arguments, no options object. */
  shard(x: number, y: number, vx: number, vy: number, life: number, size: number, color: string, vr: number, variant: number, gravity: number) {
    if (this.list.length >= MAX) return;
    const p = this.pool.pop() ?? ({} as Particle);
    p.kind = PK.Crystal;
    p.x = x;
    p.y = y;
    p.vx = vx;
    p.vy = vy;
    p.max = p.life = life;
    p.size = size;
    p.size2 = 0;
    p.color = color;
    p.rot = Math.random() * Math.PI * 2;
    p.vr = vr;
    p.gravity = gravity;
    p.drag = 1.2;
    p.text = '';
    p.font = 16;
    p.ground = false;
    p.variant = variant;
    this.list.push(p);
  }

  update(dt: number) {
    const l = this.list;
    let w = 0;
    for (let i = 0; i < l.length; i++) {
      const p = l[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.pool.push(p);
        continue;
      }
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      l[w++] = p;
    }
    l.length = w;
  }

  clear() {
    for (const p of this.list) this.pool.push(p);
    this.list.length = 0;
  }

  /** Draw ground-level particles (stains, glitter). Context is in world space. */
  drawGround(ctx: CanvasRenderingContext2D) {
    let any = false;
    for (const p of this.list) {
      if (!p.ground) continue;
      const t = p.life / p.max;
      if (p.kind === PK.Glitter) {
        any = true;
        continue;
      }
      ctx.globalAlpha = Math.min(1, t * 2) * 0.55;
      const img = dropSprite(p.color);
      const s = p.size * FX_TUNING.scale;
      ctx.drawImage(img, p.x - s, p.y - s * 0.6, s * 2, s * 1.2);
    }
    if (any) {
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.list) {
        if (p.kind !== PK.Glitter) continue;
        const t = p.life / p.max;
        const tw = 0.5 + 0.5 * Math.sin(p.rot * 3 + (1 - t) * 18);
        ctx.globalAlpha = Math.min(1, t * 3) * tw;
        const s = p.size * FX_TUNING.scale;
        ctx.drawImage(flareSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Draw airborne particles. `res`, `tx`, `ty` describe the world transform currently set on the
   * context (world -> device px); rotated particles use setTransform instead of save/restore.
   */
  draw(ctx: CanvasRenderingContext2D, worldToCss: number, res = 1, tx = 0, ty = 0) {
    const smoke = getSmoke();
    // decorative particle sizes (area rings / flashes keep their gameplay radius)
    const fx = FX_TUNING.scale;
    // normal blended first
    for (const p of this.list) {
      if (p.ground) continue;
      const t = p.life / p.max; // 1 -> 0
      switch (p.kind) {
        case PK.Drop: {
          ctx.globalAlpha = Math.min(1, t * 3);
          const s = p.size * fx * (0.5 + t * 0.5);
          ctx.drawImage(dropSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case PK.Smoke: {
          ctx.globalAlpha = t * 0.55;
          const s = (p.size + (1 - t) * p.size2) * fx;
          ctx.drawImage(smoke, p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case PK.Ring: {
          ctx.globalAlpha = t * 0.9;
          const r = p.size + (1 - t) * (p.size2 - p.size);
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.1, r), 0, Math.PI * 2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, 5 * t);
          ctx.stroke();
          break;
        }
        case PK.Crystal: {
          ctx.globalAlpha = t < 0.3 ? t / 0.3 : 1;
          // the 40 px frame holds a ~32 px shard: size is the shard half-length in world units
          const s = p.size * fx * 1.25 * (t < 0.2 ? 0.6 + t * 2 : 1);
          let a = p.rot % TAU_P;
          if (a < 0) a += TAU_P;
          const f = ((a / TAU_P) * SHARD_FRAMES + 0.5) | 0;
          ctx.drawImage(crystalSprite(p.color, p.variant, f % SHARD_FRAMES), p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case PK.Shard: {
          ctx.globalAlpha = Math.min(1, t * 2);
          const c = Math.cos(p.rot) * res * fx;
          const s = Math.sin(p.rot) * res * fx;
          ctx.setTransform(c, s, -s, c, p.x * res + tx, p.y * res + ty);
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size * 0.45, 0);
          ctx.lineTo(0, p.size);
          ctx.lineTo(-p.size * 0.45, 0);
          ctx.closePath();
          ctx.fillStyle = p.color;
          ctx.fill();
          break;
        }
        case PK.Confetti: {
          ctx.globalAlpha = Math.min(1, t * 2);
          const c = Math.cos(p.rot) * res * fx;
          const s = Math.sin(p.rot) * res * fx;
          ctx.setTransform(c, s, -s, c, p.x * res + tx, p.y * res + ty);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8 * Math.abs(Math.sin(p.rot * 2)) + 1);
          break;
        }
        case PK.Coin: {
          ctx.globalAlpha = Math.min(1, t * 3);
          const cs = p.size * fx;
          const sx = Math.max(0.15, Math.abs(Math.cos(p.rot))) * cs;
          ctx.drawImage(getCoin(), p.x - sx, p.y - cs, sx * 2, cs * 2);
          break;
        }
        case PK.Snow: {
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * fx, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case PK.Bubble: {
          ctx.globalAlpha = Math.min(1, t * 2) * 0.8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * fx * (1.2 - t * 0.4), 0, Math.PI * 2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          break;
        }
        default:
          break;
      }
    }
    ctx.setTransform(res, 0, 0, res, tx, ty);
    // additive pass
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      if (p.ground) continue;
      const t = p.life / p.max;
      switch (p.kind) {
        case PK.Spark: {
          ctx.globalAlpha = t;
          const s = p.size * fx * (0.4 + t * 0.6);
          ctx.drawImage(glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case PK.Flame: {
          ctx.globalAlpha = t * 0.9;
          const s = p.size * fx * (0.3 + t * 0.9);
          ctx.drawImage(glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case PK.Flash: {
          ctx.globalAlpha = t * t;
          const s = p.size + (1 - t) * p.size2;
          ctx.drawImage(glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case PK.Star: {
          // pop in, then twinkle, shrink and fade
          const age = 1 - t;
          ctx.globalAlpha = age < 0.15 ? age / 0.15 : t * 1.15 > 1 ? 1 : t * 1.15;
          const s = p.size * fx * 1.6 * (age < 0.15 ? 0.4 + (age / 0.15) * 0.6 : 0.45 + t * 0.55) * (0.85 + 0.15 * Math.sin(p.rot * 4));
          ctx.drawImage(flareSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case PK.GroundRing: {
          const e = 1 - t;
          const r = p.size + (1 - (1 - e) * (1 - e)) * (p.size2 - p.size);
          ctx.globalAlpha = t * 0.9;
          ctx.strokeStyle = p.color;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, Math.max(0.1, r), Math.max(0.1, r * 0.4), 0, 0, Math.PI * 2);
          ctx.lineWidth = Math.max(1, 7 * t);
          ctx.globalAlpha = t * 0.35;
          ctx.stroke();
          ctx.lineWidth = Math.max(0.8, 2.5 * t);
          ctx.globalAlpha = t;
          ctx.stroke();
          break;
        }
        case PK.Rays: {
          const e = 1 - t;
          ctx.globalAlpha = (e < 0.2 ? e / 0.2 : t) * 0.8;
          const s = (p.size + e * p.size2) * res;
          const c = Math.cos(p.rot) * s;
          const sn = Math.sin(p.rot) * s;
          ctx.setTransform(c, sn, -sn, c, p.x * res + tx, p.y * res + ty);
          ctx.drawImage(raysSprite(), -1, -1, 2, 2);
          break;
        }
        default:
          break;
      }
    }
    ctx.setTransform(res, 0, 0, res, tx, ty);
    ctx.globalCompositeOperation = 'source-over';
    // text last (crisp, above everything)
    for (const p of this.list) {
      if (p.kind !== PK.Text) continue;
      const t = p.life / p.max;
      const age = 1 - t;
      const pop = age < 0.15 ? 0.6 + (age / 0.15) * 0.55 : age < 0.25 ? 1.15 - ((age - 0.15) / 0.1) * 0.15 : 1;
      ctx.globalAlpha = Math.min(1, t * 2.5);
      const fs = (p.font / worldToCss) * pop;
      ctx.font = `900 ${fs}px "Baloo 2", "Lilita One", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = fs * 0.22;
      ctx.strokeStyle = 'rgba(30,15,40,0.9)';
      ctx.lineJoin = 'round';
      ctx.strokeText(p.text, p.x, p.y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }
}
