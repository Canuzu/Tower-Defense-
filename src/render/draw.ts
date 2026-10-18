/** Small canvas drawing helpers shared by all procedural art. */
import { shade } from '../core/math';

export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

export const OUTLINE = '#2a1b2e';

export function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
}

export function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  const rr = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

/** Fill + thick cartoon outline. */
export function fillStroke(ctx: Ctx, fill: string | CanvasGradient, lw = 3, stroke = OUTLINE) {
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

/** Vertical gradient from a lighter top to a darker bottom. */
export function vgrad(ctx: Ctx, y0: number, y1: number, color: string, light = 0.35, dark = -0.3) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, shade(color, light));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, dark));
  return g;
}

/** Radial "ball" gradient lit from the top-left. */
export function ballGrad(ctx: Ctx, x: number, y: number, r: number, color: string, light = 0.5, dark = -0.35) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.05);
  g.addColorStop(0, shade(color, light));
  g.addColorStop(0.45, color);
  g.addColorStop(1, shade(color, dark));
  return g;
}

/** Glossy highlight blob. */
export function gloss(ctx: Ctx, x: number, y: number, rx: number, ry: number, alpha = 0.65, rot = -0.5) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ellipse(ctx, x, y, rx, ry, rot);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

export function star(ctx: Ctx, x: number, y: number, r: number, inner = 0.45, points = 5, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 === 0 ? r : r * inner;
    const a = rot + (i * Math.PI) / points;
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

/** Cute eye: white sclera, dark pupil, sparkle. lookX/lookY in -1..1 */
export function eye(ctx: Ctx, x: number, y: number, r: number, lookX = 0.3, lookY = 0, lid = 0) {
  ellipse(ctx, x, y, r * 0.82, r);
  fillStroke(ctx, '#ffffff', Math.max(1, r * 0.22));
  const px = x + lookX * r * 0.3;
  const py = y + lookY * r * 0.3 + r * 0.1;
  ellipse(ctx, px, py, r * 0.5, r * 0.62);
  ctx.fillStyle = '#1b1022';
  ctx.fill();
  circle(ctx, px + r * 0.18, py - r * 0.25, r * 0.2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  if (lid > 0) {
    // angry/sleepy lid
    ctx.save();
    ellipse(ctx, x, y, r * 0.82, r);
    ctx.clip();
    ctx.fillStyle = 'rgba(40,20,40,0.9)';
    ctx.fillRect(x - r, y - r - 1, r * 2, r * 2 * lid);
    ctx.restore();
  }
}

export function sparkle(ctx: Ctx, x: number, y: number, r: number, color = '#ffffff') {
  ctx.save();
  ctx.fillStyle = color;
  star(ctx, x, y, r, 0.25, 4, 0);
  ctx.fill();
  ctx.restore();
}

export function shadow(ctx: Ctx, x: number, y: number, rx: number, ry: number, alpha = 0.28) {
  ctx.save();
  ellipse(ctx, x, y, rx, ry);
  ctx.fillStyle = `rgba(20,10,30,${alpha})`;
  ctx.fill();
  ctx.restore();
}

export function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, w: number, color: string, cap: CanvasLineCap = 'round') {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.lineCap = cap;
  ctx.stroke();
}

/** Seeded random for deterministic art. */
export function seeded(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 100000) / 100000;
  };
}
