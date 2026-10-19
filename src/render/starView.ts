/**
 * Painted star (enemy) rendering: floating crystal stars with hover bob, wobble and squash, comets
 * rotated along their flight path, damage / fortified looks, hit flash, camo, regrow, frozen and
 * stunned overlays. Sprites come from art.ts and are drawn from pre-scaled caches.
 */
import type { Enemy } from '../game/entities';
import type { GloopId } from '../game/gloops';
import type { LoadedSprite } from '../assets/sprites';
import { enemyArtLook, enemyLook } from './art';
import { scaledSprite, SV } from './spriteCache';
import { makeCanvas } from './draw';
import { flareSprite, glowSprite, softGlow } from './particles';
import { angleDiff } from '../core/math';

export const STAR_TUNING = {
  /** body diameter = k * gameplay radius (normal stars) */
  bodyK: 2.95,
  /** body diameter = k * radius for bosses (comet head / moon / planet ball / emperor star) */
  bossK: { moab: 2.25, bfb: 2.2, zomg: 2.05, ddt: 2.25, bad: 2.05 } as Partial<Record<GloopId, number>>,
  /** hover height above the shadow (in radii) and bob amplitude */
  hover: 0.22,
  bob: 0.12,
  /** wobble rotation (radians) and squash amount */
  wobble: (6 * Math.PI) / 180,
  squash: 0.045,
  /** lean into the direction of travel (radians) */
  lean: (5 * Math.PI) / 180,
  /** ground shadow: centre below the star (radii), size (radii), opacity */
  shadowY: 0.92,
  shadowRx: 0.92,
  shadowRy: 0.32,
  shadowAlpha: 0.34,
};

/** Bosses whose sprite is a comet (head right, tail left): rotated along the path. */
const COMET: Partial<Record<GloopId, boolean>> = { moab: true, ddt: true };

interface BossVis {
  angle: number;
  flip: number;
  flipT: number;
  flipFrom: number;
}
const bossVis = new WeakMap<Enemy, BossVis>();

let shadowCanvas: HTMLCanvasElement | null = null;
/** Soft contact shadow (unit circle, scaled to an ellipse when drawn). */
export function shadowSprite(): HTMLCanvasElement {
  if (shadowCanvas) return shadowCanvas;
  const [c, ctx] = makeCanvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(18,10,30,0.9)');
  g.addColorStop(0.55, 'rgba(18,10,30,0.55)');
  g.addColorStop(1, 'rgba(18,10,30,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  shadowCanvas = c;
  return c;
}

let regrowCanvas: HTMLCanvasElement | null = null;
/** Green sparkle ring for regrowing stars (drawn rotated and pulsing). */
function regrowSprite(): HTMLCanvasElement {
  if (regrowCanvas) return regrowCanvas;
  const S = 128;
  const [c, ctx] = makeCanvas(S, S);
  ctx.translate(S / 2, S / 2);
  ctx.lineWidth = 7;
  ctx.strokeStyle = 'rgba(90,255,140,0.35)';
  ctx.beginPath();
  ctx.arc(0, 0, 52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(190,255,200,0.9)';
  ctx.setLineDash([10, 9]);
  ctx.beginPath();
  ctx.arc(0, 0, 52, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  const fl = flareSprite('#6dff9a');
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const s = i % 2 ? 18 : 26;
    ctx.drawImage(fl, Math.cos(a) * 52 - s / 2, Math.sin(a) * 52 - s / 2, s, s);
  }
  regrowCanvas = c;
  return c;
}

const iceCache = new Map<number, HTMLCanvasElement>();
/** Faceted ice block for frozen stars, built once per size bucket (world units at res 1 = 64px). */
function iceBlock(): HTMLCanvasElement {
  let c = iceCache.get(0);
  if (c) return c;
  const S = 128;
  const [cv, ctx] = makeCanvas(S, S);
  ctx.translate(S / 2, S / 2);
  const k = 54;
  const pts = [-1, -0.55, -0.45, -1, 0.55, -0.92, 1, -0.3, 0.92, 0.62, 0.35, 1, -0.75, 0.88];
  const poly = () => {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      if (i === 0) ctx.moveTo(pts[i] * k, pts[i + 1] * k);
      else ctx.lineTo(pts[i] * k, pts[i + 1] * k);
    }
    ctx.closePath();
  };
  poly();
  const g = ctx.createLinearGradient(-k, -k, k, k);
  g.addColorStop(0, 'rgba(235,252,255,0.72)');
  g.addColorStop(0.45, 'rgba(150,220,255,0.42)');
  g.addColorStop(1, 'rgba(80,160,240,0.6)');
  ctx.fillStyle = g;
  ctx.fill();
  // facets
  ctx.save();
  poly();
  ctx.clip();
  const facets = [
    [-1, -0.55, -0.45, -1, -0.1, -0.2],
    [0.55, -0.92, 1, -0.3, 0.2, -0.1],
    [-0.75, 0.88, -1, -0.55, -0.2, 0.2],
  ];
  for (let i = 0; i < facets.length; i++) {
    const f = facets[i];
    ctx.beginPath();
    ctx.moveTo(f[0] * k, f[1] * k);
    ctx.lineTo(f[2] * k, f[3] * k);
    ctx.lineTo(f[4] * k, f[5] * k);
    ctx.closePath();
    ctx.fillStyle = i === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(40,120,210,0.18)';
    ctx.fill();
  }
  ctx.restore();
  poly();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(40,110,190,0.55)';
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-0.62 * k, -0.48 * k);
  ctx.lineTo(-0.15 * k, -0.74 * k);
  ctx.moveTo(-0.7 * k, -0.18 * k);
  ctx.lineTo(-0.48 * k, -0.32 * k);
  ctx.stroke();
  iceCache.set(0, cv);
  return cv;
}

let stunStar: HTMLCanvasElement | null = null;
function stunStarSprite(): HTMLCanvasElement {
  if (stunStar) return stunStar;
  const [c, ctx] = makeCanvas(48, 48);
  ctx.translate(24, 24);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 17 : 7.5;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, -17, 0, 17);
  g.addColorStop(0, '#fff7b0');
  g.addColorStop(1, '#ffb81f');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#8a4b00';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(-4, -6, 3.5, 2, -0.5, 0, Math.PI * 2);
  ctx.fill();
  stunStar = c;
  return c;
}

/** World-space size of a star sprite: full width/height and body diameter. */
export function starSize(e: Enemy, spr: LoadedSprite) {
  const k = e.def.boss ? STAR_TUNING.bossK[e.type] ?? 2.2 : STAR_TUNING.bodyK;
  const body = k * e.radius;
  const maxSide = body / (spr.body ?? 1);
  const m = Math.max(spr.w, spr.h);
  return { w: (maxSide * spr.w) / m, h: (maxSide * spr.h) / m, body };
}

/** Painted sprite for this star right now (null -> use procedural art). */
export function starSprite(e: Enemy): LoadedSprite | null {
  return enemyArtLook(e.type, enemyLook(e.type, e.fortified, e.maxHp > 0 ? e.hp / e.maxHp : 1));
}

/** Shadow ellipse geometry, shared by the soft and the batched (crowd) shadow. */
function shadowGeom(e: Enemy): number {
  const boss = !!e.def.boss;
  const bob = boss ? 0 : Math.sin(e.phase * 1.7 + e.age * (3 + e.def.speed)) * STAR_TUNING.bob;
  return (1 - bob * 0.6) * (boss ? 1.1 : 1);
}

/** Crowd shadow: adds a flat ellipse to the current path (filled once for all stars). */
export function pathStarShadow(ctx: CanvasRenderingContext2D, e: Enemy) {
  const r = e.radius;
  const k = shadowGeom(e) * 0.8;
  const rx = r * STAR_TUNING.shadowRx * k;
  const cy = e.y + r * STAR_TUNING.shadowY;
  ctx.moveTo(e.x + rx, cy);
  ctx.ellipse(e.x, cy, rx, r * STAR_TUNING.shadowRy * k, 0, 0, Math.PI * 2);
}

/** Ground shadow under a floating star. Context in world space. */
export function drawStarShadow(ctx: CanvasRenderingContext2D, e: Enemy, time: number) {
  const r = e.radius;
  const boss = !!e.def.boss;
  const bob = boss ? 0 : Math.sin(e.phase * 1.7 + e.age * (3 + e.def.speed)) * STAR_TUNING.bob;
  const k = 1 - bob * 0.6;
  const rx = r * STAR_TUNING.shadowRx * k * (boss ? 1.1 : 1);
  const ry = r * STAR_TUNING.shadowRy * k * (boss ? 1.1 : 1);
  ctx.globalAlpha = STAR_TUNING.shadowAlpha * (e.camo ? 0.6 : 1);
  ctx.drawImage(shadowSprite(), e.x - rx, e.y + r * STAR_TUNING.shadowY - ry, rx * 2, ry * 2);
  void time;
}

/**
 * Draw one star with its painted sprite. The context transform is in world units (res, tx, ty);
 * it is restored to that on return.
 */
export function drawStar(ctx: CanvasRenderingContext2D, e: Enemy, spr: LoadedSprite, res: number, tx: number, ty: number, time: number, dt: number, crowded = false) {
  const def = e.def;
  const r = e.radius;
  const T = STAR_TUNING;
  const frozen = e.freezeT > 0;
  const stunned = e.stunT > 0;
  const moving = !frozen && !stunned;
  const size = starSize(e, spr);
  let x = e.x;
  let y = e.y;
  let rot = 0;
  let sx = 1;
  let sy = 1;
  if (COMET[e.type]) {
    // fly along the path, smoothly; mirror vertically when heading left so the face stays upright
    let v = bossVis.get(e);
    if (!v) {
      v = { angle: e.angle, flip: Math.cos(e.angle) < 0 ? -1 : 1, flipT: 0, flipFrom: 1 };
      bossVis.set(e, v);
    }
    const d = angleDiff(v.angle, e.angle);
    v.angle += d * Math.min(1, dt * 6);
    const c = Math.cos(v.angle);
    const want = c < -0.15 ? -1 : c > 0.15 ? 1 : v.flip;
    if (want !== v.flip && v.flipT <= 0) {
      v.flipFrom = v.flip;
      v.flip = want;
      v.flipT = 0.3;
    }
    let fy = v.flip;
    if (v.flipT > 0) {
      v.flipT -= dt;
      const p = 1 - Math.max(0, v.flipT) / 0.3;
      fy = v.flipFrom * Math.cos(p * Math.PI);
      if (Math.abs(fy) < 0.12) fy = fy < 0 ? -0.12 : 0.12;
    }
    rot = v.angle;
    sy = fy;
    const bob = Math.sin(e.phase + e.age * 2.2) * r * 0.05;
    y -= r * 0.12 + bob;
    rot += moving ? Math.sin(e.phase + e.age * 1.7) * 0.03 : 0;
  } else if (def.boss) {
    const w = moving ? Math.sin(e.phase + e.age * 1.3) : 0;
    rot = w * 0.035;
    const s = moving ? Math.sin(e.phase * 2 + e.age * 2.6) * 0.02 : 0;
    sx = 1 + s;
    sy = 1 - s;
    y -= r * 0.1 + (moving ? Math.sin(e.phase + e.age * 1.9) * r * 0.04 : 0);
  } else {
    const spd = def.speed;
    const wf = 2.4 + spd * 1.7;
    const ph = e.phase + e.age * wf;
    if (moving) {
      // rotated draws are several times slower without GPU raster: big crowds only squash
      if (!crowded) rot = Math.sin(ph) * T.wobble + Math.cos(e.angle) * T.lean;
      const sq = Math.sin(ph * 2) * T.squash;
      sx = 1 + sq;
      sy = 1 - sq;
    } else if (stunned && !crowded) {
      rot = Math.sin(time * 9 + e.phase) * 0.08;
    }
    const bob = Math.sin(e.phase * 1.7 + e.age * (3 + spd)) * T.bob;
    y -= r * (T.hover + (moving ? bob : 0));
  }

  const W = size.w;
  const H = size.h;
  const pxW = W * res * Math.max(Math.abs(sx), 1);
  const camo = e.camo;
  const img = scaledSprite(spr, pxW, camo ? SV.Camo : SV.Normal);
  if (rot === 0) ctx.setTransform(res * sx, 0, 0, res * sy, x * res + tx, y * res + ty);
  else {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    ctx.setTransform(res * sx * c, res * sx * s, -res * sy * s, res * sy * c, x * res + tx, y * res + ty);
  }
  const dx = -spr.ax * W;
  const dy = -spr.ay * H;
  if (camo) ctx.globalAlpha = 0.66 + Math.sin(time * 3.2 + e.phase) * 0.12;
  ctx.drawImage(img, dx, dy, W, H);
  if (e.hitFlash > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, e.hitFlash / 0.07) * 0.65;
    ctx.drawImage(scaledSprite(spr, pxW, SV.White), dx, dy, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1;
  ctx.setTransform(res, 0, 0, res, tx, ty);

  const bodyR = size.body * 0.5;
  if (camo) {
    // shimmering dashed outline + a glint sweeping around it
    const a = time * 1.6 + e.phase;
    ctx.globalAlpha = 0.45 + Math.sin(time * 3.2 + e.phase) * 0.15;
    ctx.strokeStyle = '#d6fbff';
    ctx.lineWidth = Math.max(1, r * 0.08);
    ctx.setLineDash([r * 0.42, r * 0.3]);
    ctx.lineDashOffset = -time * r * 1.2;
    ctx.beginPath();
    ctx.arc(x, y, bodyR * 1.04, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.8;
    const gs = r * 0.9;
    ctx.drawImage(flareSprite('#bff6ff'), x + Math.cos(a) * bodyR - gs / 2, y + Math.sin(a) * bodyR - gs / 2, gs, gs);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  if (e.regrowMax) {
    const pulse = 0.5 + 0.5 * Math.sin(time * 4 + e.phase);
    const rr = bodyR * (1.12 + pulse * 0.08);
    const a = time * 1.4 + e.phase;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 + pulse * 0.35;
    const cs = Math.cos(a) * res;
    const sn = Math.sin(a) * res;
    ctx.setTransform(cs, sn, -sn, cs, x * res + tx, y * res + ty);
    ctx.drawImage(regrowSprite(), -rr * 1.23, -rr * 1.23, rr * 2.46, rr * 2.46);
    ctx.setTransform(res, 0, 0, res, tx, ty);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  if (frozen) {
    const a = Math.min(1, e.freezeT * 4);
    const s2 = bodyR * 2.35;
    ctx.globalAlpha = a;
    ctx.drawImage(iceBlock(), x - s2 / 2, y - s2 / 2, s2, s2);
    ctx.globalAlpha = 1;
  }
  if (stunned && !frozen) {
    const st = stunStarSprite();
    const ss = Math.max(7, r * 0.55);
    for (let i = 0; i < 3; i++) {
      const a = time * 5 + (i * Math.PI * 2) / 3;
      const ox = Math.cos(a) * bodyR * 0.75;
      const oy = -bodyR * 0.95 + Math.sin(a) * bodyR * 0.22;
      const depth = 0.75 + Math.sin(a) * 0.25;
      ctx.drawImage(st, x + ox - (ss * depth) / 2, y + oy - (ss * depth) / 2, ss * depth, ss * depth);
    }
  }
  if (e.markT > 0) {
    ctx.strokeStyle = 'rgba(255,70,70,0.85)';
    ctx.lineWidth = Math.max(1.5, r * 0.08);
    ctx.setLineDash([r * 0.25, r * 0.2]);
    ctx.lineDashOffset = time * 20;
    ctx.beginPath();
    ctx.arc(x, y, bodyR * 1.15, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (e.type === 'golden') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.4 + Math.sin(time * 9) * 0.15;
    ctx.drawImage(softGlow('#ffd23c'), x - r * 2.4, y - r * 2.4, r * 4.8, r * 4.8);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
  void glowSprite;
}

/** Where the visual centre of the star is drawn (for effects that attach to it). */
export function starCenterY(e: Enemy): number {
  if (e.def.boss) return e.y - e.radius * 0.1;
  return e.y - e.radius * STAR_TUNING.hover;
}
