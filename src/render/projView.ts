/**
 * Painted projectiles and small entities: shots rotated along their velocity (bombs and bottle
 * caps spin), glowing magic with short additive trails, drones banking into turns, ghost raccoon
 * runners, glue / tesla traps, loot drops and the supply crate.
 */
import type { Projectile, Drone } from '../game/entities';
import type { LoadedSprite } from '../assets/sprites';
import { projectileArtFor, droneArt, runnerArt, trapArt, dropArt, crateArt, orbitArt } from './art';
import { scaledSprite, SV } from './spriteCache';
import { glowSprite, flareSprite, softGlow } from './particles';
import { shadowSprite } from './starView';

interface ProjLook {
  /** sprite length (longest side) in world units at size 1 */
  len: number;
  /** 'vel' = point along velocity, 'spin' = tumble, 'roll' = spin slowly */
  mode: 'vel' | 'spin' | 'roll';
  /** additive glow colour (coloured, no white core) */
  glow?: string;
  /** glow radius relative to len */
  glowK?: number;
  /** glow strength 0..1 */
  glowA?: number;
  /** 'head' = around the sprite anchor, 'tail' = exhaust behind it */
  glowAt?: 'head' | 'tail';
  /** draw short additive after-images */
  trail?: boolean;
}

/** Tuning per projectile visual. */
export const PROJ_LOOK: Record<string, ProjLook> = {
  quill: { len: 25, mode: 'vel' },
  javelin: { len: 50, mode: 'vel' },
  bomb: { len: 27, mode: 'spin' },
  minibomb: { len: 19, mode: 'spin' },
  nuke: { len: 36, mode: 'roll', glow: '#9dff6a', glowK: 0.45, glowA: 0.45 },
  missile: { len: 30, mode: 'vel', glow: '#ff9a3c', glowK: 0.22, glowA: 0.8, glowAt: 'tail' },
  bigmissile: { len: 50, mode: 'vel', glow: '#ff9a3c', glowK: 0.22, glowA: 0.85, glowAt: 'tail' },
  shard: { len: 24, mode: 'vel', glow: '#7fd6ff', glowK: 0.4, glowA: 0.35 },
  lance: { len: 54, mode: 'vel', glow: '#7fd6ff', glowK: 0.3, glowA: 0.45, trail: true },
  iceball: { len: 26, mode: 'roll', glow: '#8fe3ff', glowK: 0.6, glowA: 0.4 },
  bolt: { len: 36, mode: 'vel', glow: '#c77dff', glowK: 0.42, glowA: 0.55, trail: true },
  arcane: { len: 30, mode: 'roll', glow: '#a070ff', glowK: 0.6, glowA: 0.55, trail: true },
  firebolt: { len: 40, mode: 'vel', glow: '#ff8a2f', glowK: 0.38, glowA: 0.6, trail: true },
  fireball: { len: 44, mode: 'vel', glow: '#ff7a2f', glowK: 0.45, glowA: 0.6, trail: true },
  star: { len: 24, mode: 'spin', glow: '#b9a6ff', glowK: 0.6, glowA: 0.5, trail: true },
  spirit: { len: 34, mode: 'vel', glow: '#3dffc6', glowK: 0.45, glowA: 0.55, trail: true },
  stinger: { len: 18, mode: 'vel' },
  feather: { len: 15, mode: 'spin' },
};

/** Spin speed (rad/s) for tumbling shots. */
const SPIN = 11;

/** Draw a projectile with its painted sprite. Returns false when there is no sprite (use procedural). */
export function drawProjectileSprite(ctx: CanvasRenderingContext2D, p: Projectile, res: number, tx: number, ty: number, reduced: boolean, lift = 0): boolean {
  const spr = projectileArtFor(p.def);
  if (!spr) return false;
  const px = p.x;
  const py = p.y - lift;
  const v = p.def.visual;
  const key = spr.file.endsWith('p_nuke.webp') ? 'nuke' : spr.file.endsWith('p_arcane.webp') ? 'arcane' : v;
  const look = PROJ_LOOK[key] ?? PROJ_LOOK.quill;
  const size = p.def.size ?? 1;
  const len = look.len * (size > 1 ? 1 + (size - 1) * 0.7 : size);
  const m = Math.max(spr.w, spr.h);
  const W = (len * spr.w) / m;
  const H = (len * spr.h) / m;
  let rot = p.rot;
  if (look.mode === 'spin') rot = p.age * SPIN + p.rot;
  else if (look.mode === 'roll') rot = p.age * 4;
  // glow + trail first (behind)
  if (look.glow && !reduced) {
    ctx.globalCompositeOperation = 'lighter';
    const gr = len * (look.glowK ?? 0.5);
    const gl = softGlow(look.glow);
    const a = look.glowA ?? 0.5;
    const sp = Math.hypot(p.vx, p.vy) || 1;
    const ux = p.vx / sp;
    const uy = p.vy / sp;
    if (look.trail) {
      for (let i = 1; i <= 3; i++) {
        const back = len * 0.3 * i;
        ctx.globalAlpha = a * (0.6 - i * 0.15);
        const s = gr * (1 - i * 0.18);
        ctx.drawImage(gl, px - ux * back - s, py - uy * back - s, s * 2, s * 2);
      }
    }
    const back = look.glowAt === 'tail' ? len * 0.5 : 0;
    ctx.globalAlpha = a;
    ctx.drawImage(gl, px - ux * back - gr, py - uy * back - gr, gr * 2, gr * 2);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  const img = scaledSprite(spr, W * res, SV.Normal);
  const c = Math.cos(rot) * res;
  const s = Math.sin(rot) * res;
  ctx.setTransform(c, s, -s, c, px * res + tx, py * res + ty);
  ctx.drawImage(img, -spr.ax * W, -spr.ay * H, W, H);
  ctx.setTransform(res, 0, 0, res, tx, ty);
  return true;
}

// --- drones -------------------------------------------------------------------------------------

const DRONE_LEN: Record<string, number> = { bee: 32, wasp: 38, queen: 42, phoenix: 54 };
interface DroneVis {
  angle: number;
  bank: number;
}
const droneVis = new WeakMap<Drone, DroneVis>();

export function drawDroneSprite(ctx: CanvasRenderingContext2D, d: Drone, res: number, tx: number, ty: number, dt: number, time: number): boolean {
  const visual = d.attack.visual;
  const spr = droneArt(visual);
  if (!spr) return false;
  let v = droneVis.get(d);
  if (!v) {
    v = { angle: d.angle, bank: 0 };
    droneVis.set(d, v);
  }
  // smooth heading and derive a bank from the turn rate
  let diff = d.angle - v.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const turn = dt > 0 ? diff / dt : 0;
  v.angle += diff * Math.min(1, dt * 12);
  v.bank += (Math.max(-1, Math.min(1, turn * 0.25)) - v.bank) * Math.min(1, dt * 8);
  const len = DRONE_LEN[visual] ?? 26;
  const m = Math.max(spr.w, spr.h);
  const W = (len * spr.w) / m;
  const H = (len * spr.h) / m;
  const hover = Math.sin(d.phase * 12 + time * 2) * 1.5;
  // shadow on the ground
  ctx.globalAlpha = 0.22;
  ctx.drawImage(shadowSprite(), d.x - len * 0.35, d.y + len * 0.55 - len * 0.12, len * 0.7, len * 0.24);
  ctx.globalAlpha = 1;
  // slight hover sway on top of the heading
  const rot = v.angle + Math.sin(d.phase * 3) * 0.06;
  const flap = visual === 'phoenix' ? 0.82 + Math.sin(d.phase * 26) * 0.18 : 1;
  const sy = (1 - Math.abs(v.bank) * 0.28) * flap;
  if (visual === 'phoenix') {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.7;
    const gl = glowSprite('#ff7a2f');
    ctx.drawImage(gl, d.x - len * 0.75, d.y - len * 0.75 + hover, len * 1.5, len * 1.5);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  const img = scaledSprite(spr, W * res, SV.Normal);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  ctx.setTransform(res * c, res * s, -res * sy * s, res * sy * c, d.x * res + tx, (d.y + hover) * res + ty);
  ctx.drawImage(img, -spr.ax * W, -spr.ay * H, W, H);
  ctx.setTransform(res, 0, 0, res, tx, ty);
  return true;
}

// --- orbiting wisps -----------------------------------------------------------------------------

export function drawOrbiterSprite(ctx: CanvasRenderingContext2D, visual: string, x: number, y: number, ang: number, size: number, res: number, tx: number, ty: number): boolean {
  const spr = orbitArt(visual);
  if (!spr) return false;
  const len = size * 3.2;
  const m = Math.max(spr.w, spr.h);
  const W = (len * spr.w) / m;
  const H = (len * spr.h) / m;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.7;
  ctx.drawImage(glowSprite('#5cffd1'), x - size * 1.5, y - size * 1.5, size * 3, size * 3);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  // tangent of the orbit (counter-clockwise motion)
  const rot = ang + Math.PI / 2;
  const img = scaledSprite(spr, W * res, SV.Normal);
  const c = Math.cos(rot) * res;
  const s = Math.sin(rot) * res;
  ctx.setTransform(c, s, -s, c, x * res + tx, y * res + ty);
  ctx.drawImage(img, -spr.ax * W, -spr.ay * H, W, H);
  ctx.setTransform(res, 0, 0, res, tx, ty);
  return true;
}

// --- ghost raccoon runners ----------------------------------------------------------------------

export function drawRunnerSprite(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, age: number, res: number, tx: number, ty: number): boolean {
  const spr = runnerArt();
  if (!spr) return false;
  const len = size * 2.8;
  const m = Math.max(spr.w, spr.h);
  const W = (len * spr.w) / m;
  const H = (len * spr.h) / m;
  const f = Math.cos(angle) >= 0 ? 1 : -1;
  const bob = Math.abs(Math.sin(age * 14)) * size * 0.18;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.45;
  ctx.drawImage(glowSprite('#5cffd1'), x - len * 0.6, y - len * 0.6 - bob, len * 1.2, len * 1.2);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 0.92;
  const img = scaledSprite(spr, W * res, SV.Normal);
  // slight tilt along vertical travel
  const tilt = Math.sin(angle) * 0.35 * f;
  const c = Math.cos(tilt) * res;
  const s = Math.sin(tilt) * res;
  ctx.setTransform(c * f, s * f, -s, c, x * res + tx, (y - bob - size * 0.2) * res + ty);
  ctx.drawImage(img, -spr.ax * W, -spr.ay * H, W, H);
  ctx.setTransform(res, 0, 0, res, tx, ty);
  ctx.globalAlpha = 1;
  return true;
}

// --- traps --------------------------------------------------------------------------------------

export function drawTrapSprite(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, visual: string, lifeFrac: number, time: number, res: number, age: number): boolean {
  const spr = trapArt(visual);
  if (!spr) return false;
  const a = Math.min(1, lifeFrac * 4);
  const pop = age < 0.25 ? 0.4 + (age / 0.25) * 0.6 : 1;
  const len = r * 2.2 * pop;
  const m = Math.max(spr.w, spr.h);
  const W = (len * spr.w) / m;
  // lay the puddle / coil flat on the ground
  const H = ((len * spr.h) / m) * (visual === 'honey' ? 0.62 : 0.7);
  ctx.globalAlpha = a;
  ctx.drawImage(scaledSprite(spr, W * res, SV.Normal), x - W / 2, y - H / 2, W, H);
  if (visual === 'coil') {
    const pulse = 0.5 + Math.sin(time * 10 + x) * 0.5;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * (0.25 + pulse * 0.35);
    ctx.drawImage(glowSprite('#7bdff2'), x - r, y - r * 0.7, r * 2, r * 1.4);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = 1;
  return true;
}

// --- loot drops ---------------------------------------------------------------------------------

/**
 * Loot dug up by the Hoarder: arcs out, bounces, then glints until collected.
 * `t` = time since release, `collectT` >= 0 while flying to the bank.
 */
export function drawDropSprite(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, collectT: number, value: number, time: number, res: number): boolean {
  const spr: LoadedSprite | null = dropArt(value);
  if (!spr) return false;
  let len = value >= 30 ? 26 : 21;
  let yy = y;
  let alpha = 1;
  if (collectT >= 0) {
    const f = Math.min(1, collectT / 0.5);
    len *= 1 + f * 0.5;
    yy -= f * 40;
    alpha = 1 - f;
  } else if (t > 0.45) {
    // landed: small settle bounce then idle bob
    const k = t - 0.45;
    yy -= k < 0.35 ? Math.abs(Math.sin(k * 9)) * 6 * (1 - k / 0.35) : Math.sin(time * 4 + x) * 1.5;
  }
  const m = Math.max(spr.w, spr.h);
  const W = (len * spr.w) / m;
  const H = (len * spr.h) / m;
  if (collectT < 0 && t > 0.45) {
    ctx.globalAlpha = 0.3;
    ctx.drawImage(shadowSprite(), x - W * 0.45, y + H * 0.32, W * 0.9, H * 0.3);
    // inviting halo
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.28 + Math.sin(time * 6 + x) * 0.12;
    ctx.drawImage(glowSprite('#ffe066'), x - len, yy - len, len * 2, len * 2);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.globalAlpha = alpha;
  ctx.drawImage(scaledSprite(spr, W * res, SV.Normal), x - W / 2, yy - H / 2, W, H);
  // travelling glint
  if (collectT < 0) {
    const g = (time * 0.9 + x * 0.013) % 1.6;
    if (g < 0.5) {
      const k = g / 0.5;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.sin(k * Math.PI);
      const s = len * 0.7;
      ctx.drawImage(flareSprite('#fff3b0'), x - W * 0.25 + k * W * 0.4 - s / 2, yy - H * 0.2 - s / 2, s, s);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.globalAlpha = 1;
  return true;
}

// --- supply crate -------------------------------------------------------------------------------

export interface Crate {
  x: number;
  y: number;
  t: number;
}

/** Parachute crate: drifts down (0..1.1 s), lands with a bounce, then pops open (1.6 s). */
export function drawCrateSprite(ctx: CanvasRenderingContext2D, c: Crate, res: number): boolean {
  const spr = crateArt();
  if (!spr) return false;
  const len = 58;
  const m = Math.max(spr.w, spr.h);
  const W = (len * spr.w) / m;
  const H = (len * spr.h) / m;
  const fall = 1.1;
  let y = c.y;
  let sway = 0;
  let alpha = 1;
  let sx = 1;
  let sy = 1;
  if (c.t < fall) {
    const k = c.t / fall;
    y = c.y - (1 - k) * 340;
    sway = Math.sin(c.t * 5) * 0.12 * (1 - k);
  } else {
    const k = c.t - fall;
    const sq = Math.exp(-k * 9) * Math.cos(k * 30) * 0.18;
    sx = 1 + sq;
    sy = 1 - sq;
    if (k > 0.35) alpha = Math.max(0, 1 - (k - 0.35) / 0.3);
  }
  const shadowK = c.t < fall ? 0.4 + (c.t / fall) * 0.6 : 1;
  ctx.globalAlpha = 0.3 * shadowK * alpha;
  ctx.drawImage(shadowSprite(), c.x - W * 0.4 * shadowK, c.y - 4, W * 0.8 * shadowK, 14);
  ctx.globalAlpha = alpha;
  const img = scaledSprite(spr, W * res, SV.Normal);
  const cs = Math.cos(sway);
  const sn = Math.sin(sway);
  ctx.save();
  ctx.translate(c.x, y);
  ctx.transform(cs * sx, sn * sx, -sn * sy, cs * sy, 0, 0);
  // anchor at the crate bottom
  ctx.drawImage(img, -W / 2, -H, W, H);
  ctx.restore();
  ctx.globalAlpha = 1;
  return true;
}
