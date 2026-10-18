import { GLOOPS, type GloopId } from '../game/gloops';
import { shade, rgba } from '../core/math';
import { makeCanvas, ellipse, circle, fillStroke, gloss, eye, star, seeded, type Ctx, OUTLINE } from './draw';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** size in world units */
  w: number;
  h: number;
  /** vertical anchor (0..1), defaults to 0.5 */
  ay?: number;
}

const cache = new Map<string, Sprite>();
let cacheRes = 0;

export function clearGloopCache() {
  cache.clear();
}

export interface GloopLook {
  camo: boolean;
  regrow: boolean;
  fortified: boolean;
  /** damage stage 0..3 (crystal & bosses) */
  dmg: number;
}

export function gloopSprite(type: GloopId, look: GloopLook, res: number): Sprite {
  if (res !== cacheRes) {
    cache.clear();
    cacheRes = res;
  }
  const key = `${type}|${look.camo ? 1 : 0}${look.regrow ? 1 : 0}${look.fortified ? 1 : 0}${look.dmg}`;
  let s = cache.get(key);
  if (s) return s;
  const def = GLOOPS[type];
  const r = def.radius;
  const pad = def.boss ? r * 0.7 : r * 0.75 + 6;
  const w = (r + pad) * 2;
  const h = (r + pad) * 2;
  const [c, ctx] = makeCanvas(w * res, h * res);
  ctx.scale(res, res);
  ctx.translate(w / 2, h / 2);
  if (def.boss) drawBoss(ctx, type, r, look);
  else drawGloop(ctx, type, r, look);
  s = { canvas: c, w, h };
  cache.set(key, s);
  return s;
}

export function blobPath(ctx: Ctx, r: number, squish = 0) {
  const k = 1 + squish;
  ctx.beginPath();
  ctx.moveTo(-r * k, r * 0.35);
  ctx.bezierCurveTo(-r * 1.05 * k, -r * 0.55, -r * 0.58, -r * 1.06, 0, -r * 1.04);
  ctx.bezierCurveTo(r * 0.58, -r * 1.06, r * 1.05 * k, -r * 0.55, r * k, r * 0.35);
  ctx.bezierCurveTo(r * 0.98 * k, r * 0.86, r * 0.5, r * 0.97, 0, r * 0.97);
  ctx.bezierCurveTo(-r * 0.5, r * 0.97, -r * 0.98 * k, r * 0.86, -r * k, r * 0.35);
  ctx.closePath();
}

function bodyGradient(ctx: Ctx, r: number, color: string, light = 0.55, dark = -0.38) {
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.05, 0, 0, r * 1.2);
  g.addColorStop(0, shade(color, light));
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, dark));
  return g;
}

function face(ctx: Ctx, r: number, mood: 'happy' | 'grumpy' | 'angry' | 'cool' | 'sleepy' = 'happy') {
  const er = Math.max(2.2, r * 0.25);
  const ex = r * 0.3;
  const ey = -r * 0.12;
  const lid = mood === 'grumpy' ? 0.35 : mood === 'sleepy' ? 0.5 : 0;
  eye(ctx, -ex + r * 0.08, ey, er, 0.6, 0.1, lid);
  eye(ctx, ex + r * 0.08, ey, er, 0.6, 0.1, lid);
  if (mood === 'angry' || mood === 'grumpy') {
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = Math.max(1.5, r * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-ex - er * 0.6 + r * 0.08, ey - er * 1.25);
    ctx.lineTo(-ex + er * 0.7 + r * 0.08, ey - er * 0.75);
    ctx.moveTo(ex + er * 0.6 + r * 0.08, ey - er * 1.25);
    ctx.lineTo(ex - er * 0.7 + r * 0.08, ey - er * 0.75);
    ctx.stroke();
  }
  if (mood === 'cool') {
    // shades
    ctx.fillStyle = '#15121d';
    ctx.beginPath();
    ctx.ellipse(-ex + r * 0.08, ey, er * 1.05, er * 0.7, 0, 0, Math.PI * 2);
    ctx.ellipse(ex + r * 0.08, ey, er * 1.05, er * 0.7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-ex + r * 0.08, ey - er * 0.25, ex * 2, er * 0.3);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-ex - er * 0.4 + r * 0.08, ey - er * 0.35, er * 0.5, er * 0.2);
  }
  // mouth
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = Math.max(1.3, r * 0.08);
  ctx.lineCap = 'round';
  ctx.beginPath();
  const my = r * 0.36;
  if (mood === 'happy' || mood === 'cool') ctx.arc(r * 0.1, my - r * 0.1, r * 0.16, 0.2 * Math.PI, 0.8 * Math.PI);
  else if (mood === 'sleepy') ctx.arc(r * 0.1, my, r * 0.08, 0, Math.PI * 2);
  else {
    ctx.moveTo(-r * 0.05, my + r * 0.02);
    ctx.quadraticCurveTo(r * 0.1, my - r * 0.08, r * 0.25, my + r * 0.02);
  }
  ctx.stroke();
}

function drawGloop(ctx: Ctx, type: GloopId, r: number, look: GloopLook) {
  const def = GLOOPS[type];
  const lw = Math.max(1.6, r * 0.15);
  const rnd = seeded(type.length * 977 + r * 13);

  // body
  blobPath(ctx, r);
  let fill: string | CanvasGradient = bodyGradient(ctx, r, def.color);
  if (type === 'lead') fill = metalGradient(ctx, r);
  if (type === 'rainbow') fill = rainbowGradient(ctx, r);
  if (type === 'ceramic') fill = bodyGradient(ctx, r, def.color, 0.45, -0.45);
  if (type === 'white') fill = bodyGradient(ctx, r, '#eef4ff', 0.2, -0.25);
  if (type === 'black') fill = bodyGradient(ctx, r, '#3a3047', 0.35, -0.5);
  fillStroke(ctx, fill, lw);

  ctx.save();
  blobPath(ctx, r * 0.999);
  ctx.clip();
  // bottom shade
  const bg = ctx.createLinearGradient(0, r * 0.2, 0, r);
  bg.addColorStop(0, 'rgba(0,0,0,0)');
  bg.addColorStop(1, 'rgba(30,0,40,0.25)');
  ctx.fillStyle = bg;
  ctx.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4);

  if (type === 'zebra') {
    ctx.strokeStyle = '#26222e';
    ctx.lineWidth = r * 0.28;
    ctx.lineCap = 'round';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-r * 1.2, i * r * 0.55 - r * 0.2);
      ctx.bezierCurveTo(-r * 0.4, i * r * 0.55 - r * 0.6, r * 0.4, i * r * 0.55 + r * 0.2, r * 1.2, i * r * 0.55 - r * 0.2);
      ctx.stroke();
    }
  }
  if (type === 'purple') {
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * 0.85 + i * 0.42;
      circle(ctx, Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72, r * 0.22);
      ctx.fillStyle = rgba('#d2b2ff', 0.45);
      ctx.fill();
    }
  }
  if (type === 'white') {
    ctx.strokeStyle = 'rgba(120,170,255,0.55)';
    ctx.lineWidth = r * 0.08;
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(r * 0.45 + Math.cos(a) * r * 0.22, r * 0.45 + Math.sin(a) * r * 0.22);
      ctx.lineTo(r * 0.45 - Math.cos(a) * r * 0.22, r * 0.45 - Math.sin(a) * r * 0.22);
      ctx.stroke();
    }
  }
  if (type === 'ceramic') crystalFacets(ctx, r, look.dmg);
  if (type === 'lead') {
    // rivets
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.1 + i * 0.13) + Math.PI;
      circle(ctx, Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78 + r * 0.1, r * 0.07);
      ctx.fillStyle = '#4b5361';
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-r * 1.2, r * 0.42, r * 2.4, r * 0.1);
  }
  if (look.camo) {
    const cols = ['#4f6b2f', '#7d8f3a', '#5a4630', '#3c5a2a'];
    for (let i = 0; i < 9; i++) {
      ellipse(ctx, (rnd() - 0.5) * r * 2, (rnd() - 0.5) * r * 2, r * (0.25 + rnd() * 0.25), r * (0.15 + rnd() * 0.2), rnd() * 3);
      ctx.fillStyle = rgba(cols[i % cols.length], 0.72);
      ctx.fill();
    }
  }
  ctx.restore();

  if (look.fortified && (type === 'lead' || type === 'ceramic')) {
    // steel band
    ctx.save();
    blobPath(ctx, r);
    ctx.clip();
    ctx.fillStyle = metalGradient(ctx, r);
    ctx.fillRect(-r * 1.2, r * 0.05, r * 2.4, r * 0.32);
    ctx.restore();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = lw * 0.6;
    ctx.beginPath();
    ctx.moveTo(-r * 0.98, r * 0.05);
    ctx.lineTo(r * 0.98, r * 0.05);
    ctx.moveTo(-r * 0.92, r * 0.37);
    ctx.lineTo(r * 0.92, r * 0.37);
    ctx.stroke();
    for (let i = -2; i <= 2; i++) {
      circle(ctx, i * r * 0.38, r * 0.21, r * 0.07);
      ctx.fillStyle = '#e9eef5';
      ctx.fill();
    }
  }

  // gloss
  gloss(ctx, -r * 0.38, -r * 0.55, r * 0.32, r * 0.18, type === 'black' ? 0.35 : 0.6);
  circle(ctx, -r * 0.62, -r * 0.2, r * 0.07);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fill();

  // face
  const mood: Parameters<typeof face>[2] =
    type === 'black' || type === 'lead' ? 'grumpy' : type === 'rainbow' || type === 'pink' ? 'cool' : type === 'ceramic' || type === 'zebra' ? 'angry' : type === 'white' ? 'sleepy' : 'happy';
  if (r >= 10) face(ctx, r, mood);

  if (look.regrow) {
    // sprout
    ctx.save();
    ctx.translate(r * 0.05, -r * 1.02);
    ctx.strokeStyle = '#2f7d32';
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(r * 0.05, -r * 0.25, 0, -r * 0.42);
    ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * r * 0.2, -r * 0.38, r * 0.22, r * 0.11, s * 0.5, 0, Math.PI * 2);
      fillStroke(ctx, '#5fd068', Math.max(1, r * 0.06));
    }
    ctx.restore();
  }
}

function metalGradient(ctx: Ctx, r: number) {
  const g = ctx.createLinearGradient(-r, -r, r, r);
  g.addColorStop(0, '#e3e9f2');
  g.addColorStop(0.35, '#8b95a5');
  g.addColorStop(0.55, '#c7cfda');
  g.addColorStop(1, '#4e5664');
  return g;
}

function rainbowGradient(ctx: Ctx, r: number) {
  const g = ctx.createLinearGradient(-r, -r, r, r);
  const cols = ['#ff4d6d', '#ff9f1c', '#ffe066', '#5ddc6a', '#4cc9ff', '#9b5de5'];
  cols.forEach((c, i) => g.addColorStop(i / (cols.length - 1), c));
  return g;
}

function crystalFacets(ctx: Ctx, r: number, dmg: number) {
  ctx.strokeStyle = 'rgba(255,240,220,0.55)';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.moveTo(-r, -r * 0.1);
  ctx.lineTo(-r * 0.3, -r * 0.35);
  ctx.lineTo(r * 0.35, -r * 0.2);
  ctx.lineTo(r, r * 0.1);
  ctx.moveTo(-r * 0.3, -r * 0.35);
  ctx.lineTo(-r * 0.1, -r);
  ctx.moveTo(r * 0.35, -r * 0.2);
  ctx.lineTo(r * 0.45, -r * 0.95);
  ctx.moveTo(-r * 0.3, -r * 0.35);
  ctx.lineTo(-r * 0.45, r);
  ctx.moveTo(r * 0.35, -r * 0.2);
  ctx.lineTo(r * 0.3, r);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,230,200,0.18)';
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, -r * 0.35);
  ctx.lineTo(r * 0.35, -r * 0.2);
  ctx.lineTo(r * 0.3, r);
  ctx.lineTo(-r * 0.45, r);
  ctx.closePath();
  ctx.fill();
  if (dmg > 0) cracks(ctx, r, dmg, 7);
}

function cracks(ctx: Ctx, r: number, dmg: number, seed: number) {
  const rnd = seeded(seed * 31 + dmg);
  ctx.strokeStyle = 'rgba(40,10,10,0.75)';
  ctx.lineWidth = Math.max(1.2, r * 0.06);
  ctx.lineJoin = 'miter';
  for (let k = 0; k < dmg * 2; k++) {
    let x = (rnd() - 0.5) * r * 1.2;
    let y = (rnd() - 0.5) * r * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let i = 0; i < 4; i++) {
      x += (rnd() - 0.5) * r * 0.5;
      y += (rnd() - 0.5) * r * 0.5;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// ---------------------------------------------------------------------------------------------
// Bosses
// ---------------------------------------------------------------------------------------------

function drawBoss(ctx: Ctx, type: GloopId, r: number, look: GloopLook) {
  const def = GLOOPS[type];
  const lw = Math.max(3, r * 0.07);
  const color = def.color;

  // spikes / horns behind body
  if (type === 'bfb') {
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.95 + i * (Math.PI * 0.9 / 6);
      ctx.save();
      ctx.rotate(a + Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(-r * 0.14, -r * 0.85);
      ctx.lineTo(0, -r * 1.3);
      ctx.lineTo(r * 0.14, -r * 0.85);
      ctx.closePath();
      fillStroke(ctx, '#ffd1c1', lw * 0.7);
      ctx.restore();
    }
  }
  if (type === 'zomg') {
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.45, -r * 0.8);
      ctx.quadraticCurveTo(s * r * 1.05, -r * 1.25, s * r * 0.95, -r * 1.55);
      ctx.quadraticCurveTo(s * r * 0.8, -r * 1.1, s * r * 0.2, -r * 0.95);
      ctx.closePath();
      fillStroke(ctx, '#f2e6c9', lw * 0.7);
    }
  }

  blobPath(ctx, r, 0.08);
  let fill: CanvasGradient = bodyGradient(ctx, r, color, 0.45, -0.45);
  if (type === 'ddt') fill = bodyGradient(ctx, r, '#4a5161', 0.25, -0.5);
  if (type === 'zomg') fill = bodyGradient(ctx, r, '#2e3b26', 0.25, -0.5);
  if (type === 'bad') fill = bodyGradient(ctx, r, '#6a1fb8', 0.35, -0.5);
  fillStroke(ctx, fill, lw);

  ctx.save();
  blobPath(ctx, r, 0.08);
  ctx.clip();
  // belly / armour band
  const band = ctx.createLinearGradient(0, r * 0.05, 0, r * 0.5);
  band.addColorStop(0, 'rgba(255,255,255,0.0)');
  band.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = band;
  ctx.fillRect(-r * 1.3, -r * 1.3, r * 2.6, r * 2.6);
  if (type === 'moab' || look.fortified) {
    ctx.fillStyle = metalGradient(ctx, r);
    ctx.fillRect(-r * 1.3, r * 0.42, r * 2.6, r * 0.22);
    for (let i = -4; i <= 4; i++) {
      circle(ctx, i * r * 0.24, r * 0.53, r * 0.04);
      ctx.fillStyle = '#4b5361';
      ctx.fill();
    }
  }
  if (type === 'zomg') {
    // glowing toxic spots
    const rnd = seeded(5);
    for (let i = 0; i < 8; i++) {
      circle(ctx, (rnd() - 0.5) * r * 1.6, (rnd() - 0.6) * r * 1.2, r * (0.08 + rnd() * 0.1));
      ctx.fillStyle = 'rgba(160,255,90,0.75)';
      ctx.fill();
    }
  }
  if (type === 'ddt') {
    ctx.strokeStyle = 'rgba(91,255,225,0.55)';
    ctx.lineWidth = r * 0.06;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * r * 0.4 - r * 0.2, -r);
      ctx.lineTo(i * r * 0.4 + r * 0.2, r);
      ctx.stroke();
    }
  }
  if (type === 'bad') {
    const rnd = seeded(9);
    for (let i = 0; i < 14; i++) {
      star(ctx, (rnd() - 0.5) * r * 1.8, (rnd() - 0.5) * r * 1.6, r * 0.05, 0.4, 4);
      ctx.fillStyle = 'rgba(255,230,150,0.7)';
      ctx.fill();
    }
  }
  if (look.dmg > 0) cracks(ctx, r, look.dmg + 1, type.length);
  ctx.restore();

  gloss(ctx, -r * 0.42, -r * 0.6, r * 0.3, r * 0.14, 0.55);

  // face
  const er = r * 0.19;
  const ey = -r * 0.18;
  const glow = type === 'ddt' ? '#5bffe1' : type === 'zomg' ? '#b6ff6a' : null;
  if (type === 'bad') {
    bossEye(ctx, -r * 0.42, ey, er * 0.85, null);
    bossEye(ctx, r * 0.42, ey, er * 0.85, null);
    bossEye(ctx, 0, ey - r * 0.32, er * 0.75, '#ffd23c');
  } else {
    bossEye(ctx, -r * 0.33, ey, er, glow);
    bossEye(ctx, r * 0.33, ey, er, glow);
  }
  // brows
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = r * 0.07;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-r * 0.58, ey - er * 1.5);
  ctx.lineTo(-r * 0.14, ey - er * 0.8);
  ctx.moveTo(r * 0.58, ey - er * 1.5);
  ctx.lineTo(r * 0.14, ey - er * 0.8);
  ctx.stroke();
  // toothy mouth
  const my = r * 0.25;
  ctx.beginPath();
  ctx.moveTo(-r * 0.35, my);
  ctx.quadraticCurveTo(0, my + r * 0.32, r * 0.35, my);
  ctx.closePath();
  fillStroke(ctx, '#3b0f22', lw * 0.6);
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 4; i++) {
    const tx = -r * 0.27 + i * r * 0.18;
    ctx.beginPath();
    ctx.moveTo(tx, my + 1);
    ctx.lineTo(tx + r * 0.07, my + r * 0.1);
    ctx.lineTo(tx + r * 0.14, my + 1);
    ctx.fill();
  }

  if (type === 'bad') {
    // crown
    ctx.save();
    ctx.translate(0, -r * 0.98);
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, 0);
    ctx.lineTo(-r * 0.45, -r * 0.35);
    ctx.lineTo(-r * 0.2, -r * 0.15);
    ctx.lineTo(0, -r * 0.45);
    ctx.lineTo(r * 0.2, -r * 0.15);
    ctx.lineTo(r * 0.45, -r * 0.35);
    ctx.lineTo(r * 0.4, 0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -r * 0.45, 0, 0);
    g.addColorStop(0, '#fff3a8');
    g.addColorStop(1, '#e0a100');
    fillStroke(ctx, g, lw * 0.6);
    for (const x of [-0.25, 0, 0.25]) {
      circle(ctx, x * r, -r * 0.1, r * 0.05);
      ctx.fillStyle = x === 0 ? '#ff3b6b' : '#4cc9ff';
      ctx.fill();
    }
    ctx.restore();
  }
  if (look.camo || def.camo) {
    ctx.save();
    blobPath(ctx, r, 0.08);
    ctx.clip();
    const rnd = seeded(77);
    for (let i = 0; i < 12; i++) {
      ellipse(ctx, (rnd() - 0.5) * r * 2, (rnd() - 0.5) * r * 2, r * 0.25, r * 0.15, rnd() * 3);
      ctx.fillStyle = 'rgba(70,90,60,0.35)';
      ctx.fill();
    }
    ctx.restore();
  }
}

function bossEye(ctx: Ctx, x: number, y: number, r: number, glow: string | null) {
  ellipse(ctx, x, y, r, r * 1.05);
  fillStroke(ctx, glow ? '#10161a' : '#fffdf5', r * 0.22);
  ellipse(ctx, x + r * 0.15, y + r * 0.1, r * 0.5, r * 0.55);
  ctx.fillStyle = glow ?? '#1b1022';
  ctx.fill();
  if (glow) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    circle(ctx, x + r * 0.15, y + r * 0.1, r * 0.9);
    ctx.fillStyle = glow;
    ctx.fill();
    ctx.restore();
  } else {
    circle(ctx, x + r * 0.3, y - r * 0.15, r * 0.18);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }
}

/** Pre-made ice block overlay for frozen gloops. */
const iceCache = new Map<string, Sprite>();
export function iceSprite(r: number, res: number): Sprite {
  const key = `${Math.round(r)}|${res}`;
  let s = iceCache.get(key);
  if (s) return s;
  const w = r * 2.6;
  const [c, ctx] = makeCanvas(w * res, w * res);
  ctx.scale(res, res);
  ctx.translate(w / 2, w / 2);
  ctx.beginPath();
  const k = r * 1.15;
  ctx.moveTo(-k, -k * 0.6);
  ctx.lineTo(-k * 0.5, -k);
  ctx.lineTo(k * 0.6, -k * 0.9);
  ctx.lineTo(k, -k * 0.3);
  ctx.lineTo(k * 0.9, k * 0.7);
  ctx.lineTo(k * 0.3, k);
  ctx.lineTo(-k * 0.8, k * 0.85);
  ctx.closePath();
  const g = ctx.createLinearGradient(-k, -k, k, k);
  g.addColorStop(0, 'rgba(230,250,255,0.75)');
  g.addColorStop(0.5, 'rgba(140,215,255,0.45)');
  g.addColorStop(1, 'rgba(90,170,240,0.6)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.lineWidth = Math.max(1.2, r * 0.08);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = Math.max(1, r * 0.06);
  ctx.beginPath();
  ctx.moveTo(-k * 0.6, -k * 0.5);
  ctx.lineTo(-k * 0.1, -k * 0.75);
  ctx.moveTo(-k * 0.7, -k * 0.2);
  ctx.lineTo(-k * 0.45, -k * 0.35);
  ctx.stroke();
  s = { canvas: c, w, h: w };
  iceCache.set(key, s);
  return s;
}
