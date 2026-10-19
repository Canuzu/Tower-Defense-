/**
 * Painted tower / hero rendering: raccoons on cable-spool platforms. Handles sizing from the spool
 * width, contact shadow, smooth facing turns, fire squash-and-stretch with recoil lean, idle
 * breathing, placement pop-in, upgrade flash and the transform burst when the look changes.
 *
 * The sprite is drawn in two parts split just above the spool: the spool (and feet) stay planted
 * while the body above squashes, stretches and leans, so the platform never wobbles.
 */
import type { Tower } from '../game/Tower';
import type { LoadedSprite } from '../assets/sprites';
import { heroArt, towerArt } from './art';
import { scaledSprite, SV } from './spriteCache';
import { shadowSprite } from './starView';

export const TOWER_TUNING = {
  /** spool platform width = spoolK * tower radius */
  spoolK: 3.5,
  /** facing turn duration (s) */
  turnTime: 0.16,
  /** fire: vertical squash amplitude, decay (1/s) and wobble frequency (rad/s) */
  fireSquash: 0.085,
  fireDecay: 14,
  fireFreq: 30,
  /** fire: upper-body lean away from the target (shear) and its decay */
  lean: 0.13,
  leanDecay: 16,
  /** idle breathing amplitude and speed */
  breath: 0.014,
  breathFreq: 2.1,
  /** placement pop-in duration (game seconds) */
  popIn: 0.42,
  /** seam between planted spool and animated body, above the spool centre (in spool widths) */
  seam: 0.07,
  /** contact shadow: radii in spool widths, offset (key light from the top left), opacity */
  shadowRx: 0.62,
  shadowRy: 0.2,
  shadowDx: 0.06,
  shadowDy: 0.16,
  shadowAlpha: 0.42,
};

export interface TowerVis {
  spr: LoadedSprite | null;
  /** current facing (+1 right, -1 left) once the turn completes */
  face: number;
  turnFrom: number;
  turnT: number;
  /** transform burst timer (1 -> 0) */
  burst: number;
  /** fire animation strength (slow shooters animate more) */
  rateK: number;
  statsRef: unknown;
}
const vis = new WeakMap<Tower, TowerVis>();

export function towerVis(t: Tower): TowerVis {
  let v = vis.get(t);
  if (!v) {
    v = { spr: null, face: t.facing, turnFrom: t.facing, turnT: 0, burst: 0, rateK: 1, statsRef: null };
    vis.set(t, v);
  }
  return v;
}

/** Painted sprite for a tower or hero right now (null -> procedural art). */
export function towerSpriteOf(t: Tower): LoadedSprite | null {
  return t.hero ? heroArt(t.hero.id, t.heroLevel) : towerArt(t.def!.id, t.tiers);
}

/** Sprite for a tower type that is not placed yet (shop ghost). */
export function ghostSprite(kind: 'tower' | 'hero', id: string): LoadedSprite | null {
  return kind === 'hero' ? heroArt(id, 1) : towerArt(id, [0, 0, 0]);
}

/** World-space metrics of a tower sprite. */
export interface TowerGeom {
  /** spool width */
  S: number;
  W: number;
  H: number;
}
export function towerGeom(spr: LoadedSprite, radius: number, out: TowerGeom): TowerGeom {
  const S = TOWER_TUNING.spoolK * radius;
  const k = S / (spr.w * (spr.foot ?? 0.75));
  out.S = S;
  out.W = spr.w * k;
  out.H = spr.h * k;
  return out;
}
const geom: TowerGeom = { S: 0, W: 0, H: 0 };

/** Contact shadow under the spool. Context in world space. */
export function drawTowerShadow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, alpha = 1) {
  const T = TOWER_TUNING;
  const S = T.spoolK * radius;
  const rx = S * T.shadowRx;
  const ry = S * T.shadowRy;
  ctx.globalAlpha = T.shadowAlpha * alpha;
  ctx.drawImage(shadowSprite(), x + S * T.shadowDx - rx, y + S * T.shadowDy - ry, rx * 2, ry * 2);
  ctx.globalAlpha = 1;
}

/** Glowing selection / hover ring around the spool base. Context in world space. */
export function drawTowerRing(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, time: number, selected: boolean, color = '#ffe27a') {
  const S = TOWER_TUNING.spoolK * radius;
  const rx = S * 0.6;
  const ry = S * 0.24;
  const cy = y + S * 0.13;
  const pulse = 0.5 + 0.5 * Math.sin(time * 5);
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, cy, rx * (1.04 + pulse * 0.03), ry * (1.04 + pulse * 0.03), 0, 0, Math.PI * 2);
  ctx.lineWidth = S * 0.09;
  ctx.globalAlpha = (selected ? 0.34 : 0.2) + pulse * 0.12;
  ctx.stroke();
  ctx.lineWidth = Math.max(1.2, S * 0.03);
  ctx.globalAlpha = selected ? 0.95 : 0.6;
  ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

export interface TowerPose {
  /** overall scale (pop-in, upgrade bump) */
  scale: number;
  /** horizontal facing scale (turn tween, -1..1) */
  face: number;
  /** vertical offset of the whole sprite (hop) */
  hop: number;
  /** upper body scale / shear */
  bsx: number;
  bsy: number;
  shear: number;
  /** white flash strength 0..1 */
  flash: number;
  alpha: number;
  variant: SV;
}
const pose: TowerPose = { scale: 1, face: 1, hop: 0, bsx: 1, bsy: 1, shear: 0, flash: 0, alpha: 1, variant: SV.Normal };

/** Neutral pose (ghosts, icons). */
export function restPose(face = 1): TowerPose {
  pose.scale = 1;
  pose.face = face;
  pose.hop = 0;
  pose.bsx = 1;
  pose.bsy = 1;
  pose.shear = 0;
  pose.flash = 0;
  pose.alpha = 1;
  pose.variant = SV.Normal;
  return pose;
}

/**
 * Update the tower's animation state and return its pose for this frame.
 * `dt` is real time; `gameTime` drives game-synchronous effects (pop-in).
 */
export function towerPose(t: Tower, v: TowerVis, dt: number, time: number, gameTime: number): TowerPose {
  const T = TOWER_TUNING;
  const p = restPose(v.face);
  // facing: short scaleX tween through zero with a tiny hop
  if (v.turnT <= 0 && t.facing !== v.face) {
    v.turnFrom = v.face;
    v.face = t.facing;
    v.turnT = T.turnTime;
  }
  if (v.turnT > 0) {
    v.turnT = Math.max(0, v.turnT - dt);
    const k = 1 - v.turnT / T.turnTime;
    const e = k * k * (3 - 2 * k);
    p.face = v.turnFrom * Math.cos(e * Math.PI);
    if (Math.abs(p.face) < 0.08) p.face = p.face < 0 ? -0.08 : 0.08;
    p.hop = -Math.sin(k * Math.PI) * 3;
  } else p.face = v.face;

  // fire strength depends on how often the tower attacks (gatlings would just vibrate)
  if (v.statsRef !== t.stats) {
    v.statsRef = t.stats;
    let minRate = 9;
    for (const a of t.stats.attacks) if (a.kind !== 'orbit' && a.kind !== 'drone' && a.kind !== 'trap' && a.kind !== 'runner') minRate = Math.min(minRate, a.rate);
    v.rateK = minRate >= 9 ? 0.6 : Math.max(0.3, Math.min(1, minRate / 0.55));
  }

  // fire: squash then springy stretch, lean back away from the target
  const f = t.fireAnim;
  if (f < 0.45) {
    const sq = T.fireSquash * v.rateK * Math.exp(-T.fireDecay * f) * Math.cos(T.fireFreq * f);
    p.bsy = 1 - sq;
    p.bsx = 1 + sq * 0.55;
    const lean = T.lean * v.rateK * Math.exp(-T.leanDecay * f);
    // local shear so that after the facing flip the head moves away from the target
    p.shear = Math.cos(t.angle) * lean * (p.face < 0 ? -1 : 1);
  }
  // idle breathing
  const br = Math.sin(time * T.breathFreq + t.id * 1.7) * T.breath;
  p.bsy *= 1 + br;
  p.bsx *= 1 - br * 0.5;

  // placement pop-in
  const age = gameTime - t.placedAt;
  if (age >= 0 && age < T.popIn) {
    const k = age / T.popIn;
    const c1 = 1.70158 * 1.3;
    const c3 = c1 + 1;
    const e = 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
    p.scale = 0.35 + e * 0.65;
    p.hop -= (1 - k) * (1 - k) * 26;
  }
  // upgrade: bump + white flash
  if (t.upgradeFlash > 0) {
    const u = t.upgradeFlash;
    p.scale *= 1 + Math.sin(u * Math.PI) * 0.12;
    p.flash = Math.max(p.flash, u * u * 0.9);
  }
  if (v.burst > 0) {
    v.burst = Math.max(0, v.burst - dt * 1.6);
    const b = v.burst;
    p.scale *= 1 + Math.sin(b * Math.PI) * 0.22;
    p.flash = Math.max(p.flash, b * b);
  }
  return p;
}

/**
 * Draw a painted tower sprite at (x, y) = spool centre with the given pose.
 * Context transform is world space (res, tx, ty) and is restored on return.
 */
export function drawTowerSprite(ctx: CanvasRenderingContext2D, spr: LoadedSprite, x: number, y: number, radius: number, p: TowerPose, res: number, tx: number, ty: number) {
  const g = towerGeom(spr, radius, geom);
  const { S, W, H } = g;
  const pxW = W * res * p.scale * Math.max(1, p.bsx);
  const img = scaledSprite(spr, pxW, p.variant);
  const cw = img.width;
  const ch = img.height;
  const ax = spr.ax;
  const ay = spr.ay;
  // seam row (sprite fraction / canvas px / local world y)
  const seamF = Math.max(0.05, ay - (TOWER_TUNING.seam * S) / H);
  const seamPx = Math.round(seamF * ch);
  const seamF2 = seamPx / ch;
  const seamLocal = (seamF2 - ay) * H;
  const dx = -ax * W;
  const dy = -ay * H;
  const a = res * p.scale * p.face;
  const d = res * p.scale;
  const e = x * res + tx;
  const f = (y + p.hop) * res + ty;
  const overlap = Math.min(2, ch - seamPx);
  if (p.alpha !== 1) ctx.globalAlpha = p.alpha;
  for (let pass = 0; pass < 2; pass++) {
    const src = pass === 0 ? img : scaledSprite(spr, pxW, SV.White);
    if (pass === 1) {
      if (p.flash <= 0.01) break;
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = p.flash * p.alpha;
    }
    // planted spool
    ctx.setTransform(a, 0, 0, d, e, f);
    ctx.drawImage(src, 0, seamPx, cw, ch - seamPx, dx, seamLocal, W, H - seamF2 * H);
    // animated body: scale around the seam + shear (lean)
    const A = a * p.bsx;
    const C = a * p.shear;
    const D = d * p.bsy;
    ctx.setTransform(A, 0, C, D, e - C * seamLocal, f + d * seamLocal * (1 - p.bsy));
    ctx.drawImage(src, 0, 0, cw, seamPx + overlap, dx, dy, W, (seamPx + overlap) * (H / ch));
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.setTransform(res, 0, 0, res, tx, ty);
}

/** Top of the sprite above the spool centre (world units), for badges and floating effects. */
export function towerTop(spr: LoadedSprite | null, radius: number): number {
  if (!spr) return radius * 2.2;
  const g = towerGeom(spr, radius, geom);
  return spr.ay * g.H;
}
