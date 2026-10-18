import { shade } from '../core/math';
import { makeCanvas, ellipse, circle, fillStroke, gloss, eye, star, line, roundRect, ballGrad, vgrad, sparkle, type Ctx, OUTLINE } from './draw';
import type { Sprite } from './gloopArt';

export type ArtId = 'spike' | 'boomer' | 'frost' | 'hoot' | 'ember' | 'zap' | 'buzz' | 'acorn' | 'dojo' | 'nova' | 'grizz';

const cache = new Map<string, Sprite>();
let cacheRes = 0;
/** vertical anchor of the tower position inside the sprite (0..1) */
export const ANCHOR_Y = 0.63;

export const ART_RADIUS: Record<ArtId, number> = {
  spike: 20,
  boomer: 22,
  frost: 20,
  hoot: 20,
  ember: 20,
  zap: 21,
  buzz: 23,
  acorn: 24,
  dojo: 26,
  nova: 21,
  grizz: 24,
};

/**
 * Cached tower body sprite. `tiers` for towers, `[level]` for heroes.
 * Anchor: the sprite centre corresponds to the tower position; art extends upwards.
 */
export function towerSprite(id: ArtId, tiers: readonly number[], res: number): Sprite {
  if (res !== cacheRes) {
    cache.clear();
    cacheRes = res;
  }
  const key = id + tiers.join('');
  let s = cache.get(key);
  if (s) return s;
  const r = ART_RADIUS[id];
  const w = r * 5.6;
  const h = r * 6.6;
  const [c, ctx] = makeCanvas(w * res, h * res);
  ctx.scale(res, res);
  ctx.translate(w / 2, h * ANCHOR_Y);
  drawTowerArt(ctx, id, r, tiers);
  s = { canvas: c, w, h, ay: ANCHOR_Y };
  cache.set(key, s);
  return s;
}

export function drawTowerArt(ctx: Ctx, id: ArtId, r: number, tiers: readonly number[]) {
  switch (id) {
    case 'spike':
      return drawSpike(ctx, r, tiers);
    case 'boomer':
      return drawBoomer(ctx, r, tiers);
    case 'frost':
      return drawFrost(ctx, r, tiers);
    case 'hoot':
      return drawHoot(ctx, r, tiers);
    case 'ember':
      return drawEmber(ctx, r, tiers);
    case 'zap':
      return drawZap(ctx, r, tiers);
    case 'buzz':
      return drawBuzz(ctx, r, tiers);
    case 'acorn':
      return drawAcorn(ctx, r, tiers);
    case 'dojo':
      return drawDojo(ctx, r, tiers);
    case 'nova':
      return drawNova(ctx, r, tiers[0] ?? 1);
    case 'grizz':
      return drawGrizz(ctx, r, tiers[0] ?? 1);
  }
}

/** Shop / panel portrait as a data URL. */
const iconCache = new Map<string, string>();
export function towerIcon(id: ArtId, tiers: readonly number[] = [0, 0, 0], px = 96): string {
  const key = id + tiers.join('') + px;
  const hit = iconCache.get(key);
  if (hit) return hit;
  const r = ART_RADIUS[id];
  const [c, ctx] = makeCanvas(px, px);
  const span = r * 4.2;
  const sc = px / span;
  ctx.scale(sc, sc);
  ctx.translate(span / 2, span * 0.66);
  drawTowerArt(ctx, id, r, tiers);
  const url = c.toDataURL();
  iconCache.set(key, url);
  return url;
}

// ---------------------------------------------------------------------------------------------
// shared bits
// ---------------------------------------------------------------------------------------------

const lvl = (t: readonly number[]) => Math.max(t[0] ?? 0, t[1] ?? 0, t[2] ?? 0);

function pedestal(ctx: Ctx, r: number, rim: string, tierLevel: number) {
  // soft shadow
  ellipse(ctx, 0, r * 0.62, r * 1.35, r * 0.48);
  ctx.fillStyle = 'rgba(15,10,25,0.3)';
  ctx.fill();
  // side
  ellipse(ctx, 0, r * 0.44, r * 1.18, r * 0.5);
  fillStroke(ctx, '#7b6a5c', 2.5);
  // top
  ellipse(ctx, 0, r * 0.3, r * 1.15, r * 0.46);
  const g = ctx.createLinearGradient(0, r * -0.1, 0, r * 0.75);
  g.addColorStop(0, '#d9cbb8');
  g.addColorStop(1, '#a8957f');
  fillStroke(ctx, g, 2.5);
  // coloured rim
  ellipse(ctx, 0, r * 0.3, r * 0.98, r * 0.36);
  ctx.strokeStyle = tierLevel >= 5 ? '#ffd23c' : rim;
  ctx.lineWidth = tierLevel >= 5 ? 3.5 : 2.5;
  ctx.stroke();
  if (tierLevel >= 5) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ellipse(ctx, 0, r * 0.3, r * 1.25, r * 0.55);
    ctx.strokeStyle = '#fff3a8';
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();
  }
}

function aura5(ctx: Ctx, r: number, color: string, y = -r * 1.1) {
  ctx.save();
  const g = ctx.createRadialGradient(0, y, r * 0.3, 0, y, r * 2.3);
  g.addColorStop(0, shade(color, 0.3).replace('rgb', 'rgba').replace(')', ',0.55)'));
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, y, r * 2.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function feet(ctx: Ctx, r: number, color: string, spread = 0.42) {
  for (const s of [-1, 1]) {
    ellipse(ctx, s * r * spread, r * 0.2, r * 0.26, r * 0.15);
    fillStroke(ctx, color, 2);
  }
}

// ---------------------------------------------------------------------------------------------
// SPIKE — hedgehog
// ---------------------------------------------------------------------------------------------
function drawSpike(ctx: Ctx, r: number, t: readonly number[]) {
  const L = lvl(t);
  pedestal(ctx, r, '#c98a4b', L);
  if (t[0] >= 5) {
    // thornado swirl
    ctx.save();
    ctx.strokeStyle = 'rgba(160,220,255,0.75)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.ellipse(0, -r * (0.6 + i * 0.55), r * (1.5 - i * 0.2), r * 0.35, 0, Math.PI * 0.1, Math.PI * 1.7);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (L >= 5) aura5(ctx, r, '#ffb347');
  const cy = -r * 0.9;
  const br = r * 0.92;
  // quills
  const rings = t[0] >= 3 ? 2 : 1;
  for (let ring = rings - 1; ring >= 0; ring--) {
    const n = 11 + t[0] * 2 + ring * 3;
    const len = r * (0.62 + t[0] * 0.06 + ring * 0.22);
    for (let i = 0; i < n; i++) {
      const a = Math.PI * 0.92 + (i / (n - 1)) * Math.PI * 1.16;
      const bx = Math.cos(a) * br * 0.9;
      const by = cy + Math.sin(a) * br * 0.9;
      const tx = Math.cos(a) * (br + len);
      const ty = cy + Math.sin(a) * (br + len);
      const px = -Math.sin(a) * r * 0.16;
      const py = Math.cos(a) * r * 0.16;
      ctx.beginPath();
      ctx.moveTo(bx - px, by - py);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx + px, by + py);
      ctx.closePath();
      const tip = t[0] >= 4 ? '#ffcf5a' : t[2] >= 5 ? '#9ef0ff' : '#e9d3b4';
      const g = ctx.createLinearGradient(bx, by, tx, ty);
      g.addColorStop(0, ring ? '#4a2c18' : '#6b4226');
      g.addColorStop(0.7, ring ? '#6b4226' : '#8a5a34');
      g.addColorStop(1, tip);
      fillStroke(ctx, g, 1.6);
    }
  }
  // body
  circle(ctx, 0, cy, br);
  fillStroke(ctx, ballGrad(ctx, 0, cy, br, '#8a5a34', 0.35), 3);
  // face patch
  ellipse(ctx, r * 0.05, cy + r * 0.25, r * 0.66, r * 0.55);
  fillStroke(ctx, ballGrad(ctx, r * 0.05, cy + r * 0.25, r * 0.66, '#f1d7b0', 0.3, -0.15), 2);
  // snout + nose
  ellipse(ctx, r * 0.3, cy + r * 0.38, r * 0.3, r * 0.2);
  fillStroke(ctx, '#f6e2c4', 2);
  circle(ctx, r * 0.55, cy + r * 0.33, r * 0.12);
  ctx.fillStyle = '#2a1b2e';
  ctx.fill();
  circle(ctx, r * 0.58, cy + r * 0.29, r * 0.04);
  ctx.fillStyle = '#fff';
  ctx.fill();
  // eyes
  eye(ctx, -r * 0.12, cy + r * 0.05, r * 0.17, 0.7);
  eye(ctx, r * 0.28, cy + r * 0.02, r * 0.17, 0.7);
  // blush
  ellipse(ctx, -r * 0.3, cy + r * 0.38, r * 0.12, r * 0.07);
  ctx.fillStyle = 'rgba(255,120,140,0.45)';
  ctx.fill();
  feet(ctx, r, '#f1d7b0', 0.38);
  // hands
  for (const s of [-1, 1]) {
    ellipse(ctx, s * r * 0.62, cy + r * 0.75, r * 0.17, r * 0.14);
    fillStroke(ctx, '#f1d7b0', 2);
  }

  // path 2: precision gear
  if (t[2] >= 2 && t[2] < 5) {
    // goggles on forehead
    ctx.strokeStyle = '#3b2a1a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, cy, br * 0.98, Math.PI * 1.08, Math.PI * 1.92);
    ctx.stroke();
    for (const x of [-0.18, 0.28]) {
      circle(ctx, r * x, cy - r * 0.48, r * 0.19);
      fillStroke(ctx, '#5fd4ff', 2.5);
      gloss(ctx, r * x - 2, cy - r * 0.53, 3, 2, 0.8);
    }
  }
  if (t[2] >= 3) {
    // bandana
    ctx.beginPath();
    ctx.moveTo(-br * 0.95, cy - r * 0.2);
    ctx.quadraticCurveTo(0, cy - r * 0.42, br * 0.95, cy - r * 0.2);
    ctx.lineTo(br * 0.9, cy - r * 0.02);
    ctx.quadraticCurveTo(0, cy - r * 0.22, -br * 0.9, cy - r * 0.02);
    ctx.closePath();
    fillStroke(ctx, '#e63946', 2);
    ctx.beginPath();
    ctx.moveTo(-br * 0.9, cy - r * 0.1);
    ctx.lineTo(-br * 1.35, cy - r * 0.35);
    ctx.lineTo(-br * 1.25, cy + r * 0.05);
    ctx.closePath();
    fillStroke(ctx, '#e63946', 2);
  }
  if (t[2] >= 4) {
    // ammo belt
    ctx.save();
    ctx.translate(0, cy + r * 0.55);
    ctx.rotate(-0.5);
    roundRect(ctx, -r * 0.9, -r * 0.1, r * 1.8, r * 0.2, 3);
    fillStroke(ctx, '#5a3a22', 2);
    for (let i = -3; i <= 3; i++) line(ctx, i * r * 0.22, -r * 0.08, i * r * 0.22, -r * 0.3, 2.2, '#e9d3b4');
    ctx.restore();
  }
  if (t[2] >= 5) {
    // shades
    ctx.fillStyle = '#121019';
    ellipse(ctx, -r * 0.12, cy + r * 0.04, r * 0.24, r * 0.15);
    ctx.fill();
    ellipse(ctx, r * 0.3, cy + r * 0.02, r * 0.24, r * 0.15);
    ctx.fill();
    line(ctx, -r * 0.12, cy + r * 0.0, r * 0.3, cy, 2.5, '#121019');
    gloss(ctx, -r * 0.18, cy - r * 0.02, 3, 1.5, 0.7, 0);
  }
  // path 1: javelin
  if (t[1] >= 3) {
    const gold = t[1] >= 5;
    ctx.save();
    ctx.translate(r * 0.7, cy + r * 0.7);
    ctx.rotate(-1.05);
    roundRect(ctx, -r * 0.6, -2.5, r * 2.6, 5, 2.5);
    fillStroke(ctx, gold ? '#c99a2e' : '#8b5a2b', 2);
    ctx.beginPath();
    ctx.moveTo(r * 2.0, -r * 0.22);
    ctx.lineTo(r * 2.55, 0);
    ctx.lineTo(r * 2.0, r * 0.22);
    ctx.closePath();
    fillStroke(ctx, gold ? '#fff3a8' : '#dfe6ee', 2);
    if (t[1] >= 4) {
      // fletching
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, 0);
      ctx.lineTo(-r * 0.85, -r * 0.2);
      ctx.lineTo(-r * 0.4, 0);
      ctx.lineTo(-r * 0.85, r * 0.2);
      ctx.closePath();
      fillStroke(ctx, '#e63946', 1.5);
    }
    ctx.restore();
  }
  if (t[1] >= 4) {
    // helmet
    ctx.beginPath();
    ctx.arc(0, cy - r * 0.05, br * 1.02, Math.PI * 1.05, Math.PI * 1.95);
    ctx.closePath();
    fillStroke(ctx, t[1] >= 5 ? vgrad(ctx, cy - br, cy, '#e8b931') : vgrad(ctx, cy - br, cy, '#aeb8c6'), 2.5);
    // plume
    ctx.beginPath();
    ctx.moveTo(-r * 0.1, cy - br * 1.0);
    ctx.quadraticCurveTo(-r * 0.6, cy - br * 1.6, -r * 1.1, cy - br * 1.05);
    ctx.quadraticCurveTo(-r * 0.5, cy - br * 1.25, -r * 0.1, cy - br * 0.85);
    ctx.closePath();
    fillStroke(ctx, '#e63946', 2);
  }
  if (t[0] >= 4) {
    // glowing quill tips sparkle
    sparkle(ctx, -r * 1.4, cy - r * 0.9, 4, '#fff3a8');
    sparkle(ctx, r * 1.3, cy - r * 1.2, 3.5, '#fff3a8');
  }
}

// ---------------------------------------------------------------------------------------------
// BOOMER — bombardier beetle
// ---------------------------------------------------------------------------------------------
function drawBoomer(ctx: Ctx, r: number, t: readonly number[]) {
  const L = lvl(t);
  pedestal(ctx, r, '#4b7bff', L);
  if (t[0] >= 5) aura5(ctx, r, '#9dff6a');
  else if (L >= 5) aura5(ctx, r, '#ffd23c');
  const cy = -r * 0.75;
  // legs
  ctx.strokeStyle = '#1a1622';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.6, cy + r * 0.1 + i * r * 0.25);
      ctx.quadraticCurveTo(s * r * 1.15, cy + r * 0.05 + i * r * 0.3, s * r * (1.0 + i * 0.05), cy + r * 0.55 + i * r * 0.25);
      ctx.stroke();
    }
  }
  // missile pods (path 1)
  if (t[1] >= 2) {
    const pods = t[1] >= 4 ? 2 : 1;
    for (const s of [-1, 1]) {
      for (let p = 0; p < pods; p++) {
        ctx.save();
        ctx.translate(s * r * (1.02 + p * 0.28), cy - r * 0.15 - p * r * 0.25);
        roundRect(ctx, -r * 0.18, -r * 0.45, r * 0.36, r * 0.8, 4);
        fillStroke(ctx, vgrad(ctx, -r * 0.45, r * 0.35, '#7d8796'), 2);
        ctx.beginPath();
        ctx.moveTo(-r * 0.16, -r * 0.45);
        ctx.lineTo(0, -r * 0.72);
        ctx.lineTo(r * 0.16, -r * 0.45);
        ctx.closePath();
        fillStroke(ctx, '#ff4d4d', 2);
        ctx.restore();
      }
    }
  }
  // shell
  let shell = '#3d6bff';
  if (t[0] >= 4) shell = '#d7263d';
  if (t[0] >= 5) shell = '#2a7a1e';
  if (t[2] >= 5) shell = '#e0a100';
  if (t[1] >= 5) shell = '#5b2bd1';
  ellipse(ctx, 0, cy, r * 0.98, r * 0.88);
  fillStroke(ctx, ballGrad(ctx, 0, cy, r * 0.98, shell, 0.55, -0.4), 3);
  ctx.save();
  ellipse(ctx, 0, cy, r * 0.96, r * 0.86);
  ctx.clip();
  if (t[0] >= 3) {
    // hazard stripes
    ctx.fillStyle = 'rgba(255,210,60,0.85)';
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(i * r * 0.4 - r * 0.15, cy + r * 0.45);
      ctx.lineTo(i * r * 0.4 + r * 0.05, cy + r * 0.45);
      ctx.lineTo(i * r * 0.4 + r * 0.25, cy + r * 0.85);
      ctx.lineTo(i * r * 0.4 + r * 0.05, cy + r * 0.85);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
  line(ctx, 0, cy - r * 0.86, 0, cy + r * 0.7, 2.5, shade(shell, -0.5));
  gloss(ctx, -r * 0.4, cy - r * 0.45, r * 0.32, r * 0.16, 0.7);
  gloss(ctx, r * 0.42, cy - r * 0.5, r * 0.16, r * 0.08, 0.5);
  if (t[0] >= 5) {
    // radiation emblem
    circle(ctx, 0, cy + r * 0.05, r * 0.32);
    fillStroke(ctx, '#ffe066', 2);
    ctx.fillStyle = '#1a1622';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, cy + r * 0.05);
      ctx.arc(0, cy + r * 0.05, r * 0.28, -Math.PI / 2 + i * ((Math.PI * 2) / 3) - 0.45, -Math.PI / 2 + i * ((Math.PI * 2) / 3) + 0.45);
      ctx.closePath();
      ctx.fill();
    }
    circle(ctx, 0, cy + r * 0.05, r * 0.07);
    ctx.fill();
  }
  if (t[2] >= 3 && t[2] < 5) {
    // target emblem
    circle(ctx, 0, cy + r * 0.05, r * 0.26);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    line(ctx, -r * 0.36, cy + r * 0.05, r * 0.36, cy + r * 0.05, 2, '#ffffff');
    line(ctx, 0, cy - r * 0.31, 0, cy + r * 0.41, 2, '#ffffff');
  }
  // head
  ellipse(ctx, 0, cy + r * 0.72, r * 0.5, r * 0.36);
  fillStroke(ctx, ballGrad(ctx, 0, cy + r * 0.72, r * 0.5, '#2c2638', 0.4), 2.5);
  eye(ctx, -r * 0.2, cy + r * 0.68, r * 0.15, 0.4, 0.3);
  eye(ctx, r * 0.2, cy + r * 0.68, r * 0.15, 0.4, 0.3);
  // antennae
  ctx.strokeStyle = '#1a1622';
  ctx.lineWidth = 2;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.2, cy + r * 0.45);
    ctx.quadraticCurveTo(s * r * 0.75, cy + r * 0.1, s * r * 0.85, cy - r * 0.35);
    ctx.stroke();
    circle(ctx, s * r * 0.85, cy - r * 0.38, r * 0.08);
    ctx.fillStyle = t[2] >= 2 ? '#ff4d4d' : '#ffd23c';
    ctx.fill();
  }
  // cannon mount (barrel is drawn live)
  ellipse(ctx, 0, cy - r * 0.55, r * 0.36, r * 0.24);
  fillStroke(ctx, vgrad(ctx, cy - r * 0.8, cy - r * 0.3, '#5b6270'), 2.5);
  if (t[2] >= 2) {
    // radar dish
    ctx.save();
    ctx.translate(-r * 0.62, cy - r * 0.62);
    ctx.rotate(-0.5);
    ellipse(ctx, 0, 0, r * 0.22, r * 0.1);
    fillStroke(ctx, '#dfe6ee', 1.8);
    line(ctx, 0, 0, 0, r * 0.22, 2, '#5b6270');
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------
// FROST — penguin
// ---------------------------------------------------------------------------------------------
function drawFrost(ctx: Ctx, r: number, t: readonly number[]) {
  const L = lvl(t);
  pedestal(ctx, r, '#57c8ff', L);
  if (L >= 5) aura5(ctx, r, '#9be7ff');
  const cy = -r * 0.95;
  if (t[1] >= 3) {
    // storm cloud
    const big = t[1] >= 5 ? 1.35 : 1;
    ctx.save();
    ctx.translate(0, cy - r * 1.55 * big);
    for (const [x, y, rr] of [[-0.55, 0.05, 0.42], [0, -0.15, 0.55], [0.55, 0.05, 0.42], [0.2, 0.18, 0.4], [-0.25, 0.2, 0.38]]) {
      circle(ctx, x * r * big, y * r * big, rr * r * big);
      fillStroke(ctx, t[1] >= 5 ? '#c7d6ea' : '#eef4ff', 2);
    }
    for (const [x, y, rr] of [[-0.55, 0.05, 0.42], [0, -0.15, 0.55], [0.55, 0.05, 0.42], [0.2, 0.18, 0.4], [-0.25, 0.2, 0.38]]) {
      circle(ctx, x * r * big, y * r * big, rr * r * big - 1.5);
      ctx.fillStyle = t[1] >= 5 ? '#c7d6ea' : '#eef4ff';
      ctx.fill();
    }
    if (t[1] >= 4) {
      for (let i = 0; i < 5; i++) {
        sparkle(ctx, (-0.6 + i * 0.3) * r * big, r * 0.7 * big + (i % 2) * 5, 3, '#ffffff');
      }
    }
    ctx.restore();
  }
  // flippers
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * r * 0.78, cy + r * 0.25, r * 0.22, r * 0.55, s * -0.35, 0, Math.PI * 2);
    fillStroke(ctx, '#1d2433', 2.5);
  }
  // body
  ellipse(ctx, 0, cy, r * 0.82, r * 1.05);
  fillStroke(ctx, ballGrad(ctx, 0, cy, r * 1.05, '#2a3346', 0.45, -0.5), 3);
  // belly
  ellipse(ctx, 0, cy + r * 0.3, r * 0.58, r * 0.7);
  fillStroke(ctx, ballGrad(ctx, 0, cy + r * 0.3, r * 0.7, '#ffffff', 0, -0.12), 0);
  // face
  ellipse(ctx, 0, cy - r * 0.35, r * 0.55, r * 0.38);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  const glow = t[0] >= 5;
  eye(ctx, -r * 0.22, cy - r * 0.42, r * 0.15, 0.4);
  eye(ctx, r * 0.22, cy - r * 0.42, r * 0.15, 0.4);
  if (glow) {
    for (const x of [-0.22, 0.22]) {
      circle(ctx, x * r, cy - r * 0.4, r * 0.1);
      ctx.fillStyle = '#5ce1ff';
      ctx.fill();
    }
  }
  // beak
  ctx.beginPath();
  ctx.moveTo(-r * 0.15, cy - r * 0.22);
  ctx.lineTo(r * 0.15, cy - r * 0.22);
  ctx.lineTo(0, cy - r * 0.02);
  ctx.closePath();
  fillStroke(ctx, '#ff9f1c', 2);
  // cheeks
  for (const s of [-1, 1]) {
    ellipse(ctx, s * r * 0.38, cy - r * 0.2, r * 0.1, r * 0.06);
    ctx.fillStyle = 'rgba(255,130,160,0.5)';
    ctx.fill();
  }
  // scarf
  ctx.beginPath();
  ctx.ellipse(0, cy + r * 0.05, r * 0.7, r * 0.18, 0, 0, Math.PI * 2);
  fillStroke(ctx, t[2] >= 3 ? '#7b5cff' : '#2f8bff', 2.5);
  ctx.beginPath();
  ctx.moveTo(r * 0.35, cy + r * 0.1);
  ctx.lineTo(r * 0.55, cy + r * 0.7);
  ctx.lineTo(r * 0.25, cy + r * 0.65);
  ctx.closePath();
  fillStroke(ctx, t[2] >= 3 ? '#7b5cff' : '#2f8bff', 2);
  // feet
  feet(ctx, r, '#ff9f1c', 0.32);
  // path 0: ice crown
  if (t[0] >= 3) {
    ctx.save();
    ctx.translate(0, cy - r * 0.95);
    const spikes = t[0] >= 5 ? 5 : 3;
    for (let i = 0; i < spikes; i++) {
      const x = (i - (spikes - 1) / 2) * r * 0.28;
      const h = i === (spikes - 1) / 2 ? r * 0.75 : r * 0.5;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.13, 0);
      ctx.lineTo(x, -h);
      ctx.lineTo(x + r * 0.13, 0);
      ctx.closePath();
      fillStroke(ctx, vgrad(ctx, -h, 0, '#9be7ff', 0.6), 2);
    }
    ctx.restore();
  }
  // path 2: shards / cannon / lance
  if (t[2] >= 1 && t[2] < 3) {
    ctx.save();
    ctx.translate(r * 0.95, cy + r * 0.05);
    ctx.rotate(-0.6);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.55);
    ctx.lineTo(r * 0.15, 0);
    ctx.lineTo(0, r * 0.25);
    ctx.lineTo(-r * 0.15, 0);
    ctx.closePath();
    fillStroke(ctx, '#bff1ff', 2);
    ctx.restore();
  }
  if (t[2] === 3) {
    ctx.save();
    ctx.translate(r * 0.6, cy - r * 0.3);
    ctx.rotate(-0.5);
    roundRect(ctx, -r * 0.15, -r * 0.25, r * 1.0, r * 0.5, 6);
    fillStroke(ctx, vgrad(ctx, -r * 0.25, r * 0.25, '#7fd6ff'), 2.5);
    circle(ctx, r * 0.85, 0, r * 0.2);
    fillStroke(ctx, '#ffffff', 2);
    ctx.restore();
  }
  if (t[2] >= 4) {
    ctx.save();
    ctx.translate(r * 0.9, cy + r * 0.2);
    ctx.rotate(-1.2);
    ctx.beginPath();
    const len = t[2] >= 5 ? r * 2.6 : r * 2.1;
    ctx.moveTo(-r * 0.5, 0);
    ctx.lineTo(0, -r * 0.14);
    ctx.lineTo(len, 0);
    ctx.lineTo(0, r * 0.14);
    ctx.closePath();
    fillStroke(ctx, vgrad(ctx, -r * 0.14, r * 0.14, '#bff1ff', 0.6), 2);
    ctx.restore();
  }
  if (t[2] >= 5) {
    // ice helmet
    ctx.beginPath();
    ctx.arc(0, cy - r * 0.4, r * 0.7, Math.PI, 0);
    ctx.closePath();
    fillStroke(ctx, 'rgba(160,230,255,0.75)', 2.5);
    gloss(ctx, -r * 0.3, cy - r * 0.85, r * 0.2, r * 0.08, 0.8);
  }
  if (t[1] >= 1 && t[1] < 3) {
    // snowflake badge
    ctx.save();
    ctx.translate(-r * 0.3, cy + r * 0.45);
    ctx.strokeStyle = '#57c8ff';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.rotate(Math.PI / 3);
      line(ctx, -r * 0.16, 0, r * 0.16, 0, 2, '#57c8ff');
    }
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------
// HOOT — owl sniper
// ---------------------------------------------------------------------------------------------
function drawHoot(ctx: Ctx, r: number, t: readonly number[]) {
  const L = lvl(t);
  pedestal(ctx, r, '#8e6bd8', L);
  const cy = -r * 0.95;
  if (t[0] >= 5) {
    // eclipse ring
    circle(ctx, 0, cy - r * 0.3, r * 1.35);
    ctx.strokeStyle = 'rgba(255,214,102,0.9)';
    ctx.lineWidth = 4;
    ctx.stroke();
    circle(ctx, 0, cy - r * 0.3, r * 1.2);
    ctx.fillStyle = 'rgba(40,20,60,0.35)';
    ctx.fill();
  } else if (L >= 5) aura5(ctx, r, '#c9b8ff');
  if (t[1] >= 3) {
    // cape
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, cy - r * 0.2);
    ctx.quadraticCurveTo(-r * 1.25, cy + r * 0.8, -r * 0.9, cy + r * 1.2);
    ctx.lineTo(r * 0.9, cy + r * 1.2);
    ctx.quadraticCurveTo(r * 1.25, cy + r * 0.8, r * 0.7, cy - r * 0.2);
    ctx.closePath();
    fillStroke(ctx, vgrad(ctx, cy, cy + r * 1.2, t[1] >= 5 ? '#2b2d42' : '#3a1f5c'), 2.5);
  }
  // wings
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(s * r * 0.82, cy + r * 0.2, r * 0.3, r * 0.6, s * -0.2, 0, Math.PI * 2);
    fillStroke(ctx, ballGrad(ctx, s * r * 0.82, cy + r * 0.2, r * 0.6, '#6c4b9b', 0.3), 2.5);
  }
  // tufts
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.35, cy - r * 0.8);
    ctx.lineTo(s * r * 0.75, cy - r * 1.35);
    ctx.lineTo(s * r * 0.75, cy - r * 0.6);
    ctx.closePath();
    fillStroke(ctx, '#5d3f88', 2);
  }
  // body
  ellipse(ctx, 0, cy, r * 0.88, r * 1.0);
  fillStroke(ctx, ballGrad(ctx, 0, cy, r, '#7d5bb5', 0.4), 3);
  // belly
  ellipse(ctx, 0, cy + r * 0.38, r * 0.55, r * 0.52);
  ctx.fillStyle = '#e8dcc7';
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,90,60,0.6)';
  ctx.lineWidth = 1.6;
  for (let row = 0; row < 3; row++) {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      const x = i * r * 0.25 + (row % 2) * r * 0.12;
      const y = cy + r * (0.15 + row * 0.22);
      ctx.moveTo(x - r * 0.07, y);
      ctx.lineTo(x, y + r * 0.08);
      ctx.lineTo(x + r * 0.07, y);
      ctx.stroke();
    }
  }
  if (t[0] >= 3) {
    // armour plate
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, cy + r * 0.05);
    ctx.lineTo(r * 0.5, cy + r * 0.05);
    ctx.lineTo(r * 0.38, cy + r * 0.75);
    ctx.lineTo(0, cy + r * 0.9);
    ctx.lineTo(-r * 0.38, cy + r * 0.75);
    ctx.closePath();
    fillStroke(ctx, vgrad(ctx, cy, cy + r * 0.9, t[0] >= 5 ? '#e0b43a' : '#9aa5b5', 0.5), 2.5);
  }
  // face disc
  for (const s of [-1, 1]) {
    circle(ctx, s * r * 0.33, cy - r * 0.32, r * 0.38);
    fillStroke(ctx, '#f3e9d8', 2);
  }
  // eyes
  const eyeR = r * 0.26;
  for (const s of [-1, 1]) {
    circle(ctx, s * r * 0.33, cy - r * 0.32, eyeR);
    fillStroke(ctx, t[1] >= 1 && t[1] < 4 ? '#7cff6b' : '#ffb703', 2);
    circle(ctx, s * r * 0.33 + r * 0.05, cy - r * 0.3, eyeR * 0.55);
    ctx.fillStyle = '#1b1022';
    ctx.fill();
    circle(ctx, s * r * 0.33 + r * 0.12, cy - r * 0.38, eyeR * 0.2);
    ctx.fillStyle = '#fff';
    ctx.fill();
  }
  if (t[1] >= 1) {
    // night-vision goggle rims
    for (const s of [-1, 1]) {
      circle(ctx, s * r * 0.33, cy - r * 0.32, eyeR + 2);
      ctx.strokeStyle = '#2b2d42';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    line(ctx, -r * 0.08, cy - r * 0.34, r * 0.08, cy - r * 0.34, 3, '#2b2d42');
  }
  // brow (determined)
  line(ctx, -r * 0.6, cy - r * 0.68, -r * 0.12, cy - r * 0.55, 3, OUTLINE);
  line(ctx, r * 0.6, cy - r * 0.68, r * 0.12, cy - r * 0.55, 3, OUTLINE);
  // beak
  ctx.beginPath();
  ctx.moveTo(-r * 0.1, cy - r * 0.15);
  ctx.lineTo(r * 0.1, cy - r * 0.15);
  ctx.lineTo(0, cy + r * 0.08);
  ctx.closePath();
  fillStroke(ctx, '#ffb703', 2);
  feet(ctx, r, '#ffb703', 0.3);
  if (t[2] >= 1 && t[2] < 5) {
    // headband
    ctx.beginPath();
    ctx.ellipse(0, cy - r * 0.72, r * 0.62, r * 0.12, 0, Math.PI, 0);
    ctx.strokeStyle = '#e63946';
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  if (t[2] >= 4) {
    // crate
    ctx.save();
    ctx.translate(-r * 1.15, r * 0.05);
    roundRect(ctx, -r * 0.35, -r * 0.6, r * 0.7, r * 0.6, 3);
    fillStroke(ctx, vgrad(ctx, -r * 0.6, 0, '#c58f4e'), 2);
    line(ctx, -r * 0.35, -r * 0.6, r * 0.35, 0, 2, '#7a5530');
    line(ctx, r * 0.35, -r * 0.6, -r * 0.35, 0, 2, '#7a5530');
    ctx.restore();
  }
  if (t[2] >= 5) {
    // commander cap
    ctx.beginPath();
    ctx.ellipse(0, cy - r * 0.78, r * 0.75, r * 0.2, 0, 0, Math.PI * 2);
    fillStroke(ctx, '#2b2d42', 2.5);
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, cy - r * 0.8);
    ctx.quadraticCurveTo(0, cy - r * 1.55, r * 0.55, cy - r * 0.8);
    ctx.closePath();
    fillStroke(ctx, '#3d405b', 2.5);
    star(ctx, 0, cy - r * 1.05, r * 0.18);
    fillStroke(ctx, '#ffd23c', 1.5);
  }
  if (t[1] >= 5) {
    // feather crown
    for (let i = -2; i <= 2; i++) {
      ctx.save();
      ctx.translate(i * r * 0.2, cy - r * 0.85);
      ctx.rotate(i * 0.3);
      ellipse(ctx, 0, -r * 0.35, r * 0.09, r * 0.35);
      fillStroke(ctx, i === 0 ? '#ffd23c' : '#f1faee', 1.5);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// EMBER — fox mage
// ---------------------------------------------------------------------------------------------
function drawEmber(ctx: Ctx, r: number, t: readonly number[]) {
  const L = lvl(t);
  pedestal(ctx, r, '#ff7a2f', L);
  if (L >= 5) aura5(ctx, r, t[0] >= 5 ? '#ff7a2f' : t[1] >= 5 ? '#7b9cff' : '#7dffb0');
  const cy = -r * 0.85;
  // tails
  const tails = t[0] >= 5 ? 9 : t[0] >= 4 ? 3 : 1;
  for (let i = 0; i < tails; i++) {
    const spread = tails === 1 ? 0 : (i / (tails - 1) - 0.5) * 2.2;
    ctx.save();
    ctx.translate(r * 0.3, cy + r * 0.6);
    ctx.rotate(-0.9 + spread * 0.55 + 0.7);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(r * 0.9, -r * 0.2, r * 1.3, -r * 0.9, r * 0.9, -r * 1.5);
    ctx.bezierCurveTo(r * 0.6, -r * 1.1, r * 0.2, -r * 0.6, -r * 0.1, -r * 0.3);
    ctx.closePath();
    const tc = t[0] >= 5 ? '#ff5a1f' : t[2] >= 5 ? '#7dffb0' : '#f07a2b';
    fillStroke(ctx, ballGrad(ctx, r * 0.6, -r * 0.7, r, tc, 0.4), 2.5);
    ctx.beginPath();
    ctx.ellipse(r * 0.88, -r * 1.35, r * 0.18, r * 0.28, 0.5, 0, Math.PI * 2);
    ctx.fillStyle = t[0] >= 5 ? '#ffe066' : '#fff5ea';
    ctx.fill();
    ctx.restore();
  }
  // robe
  const robe = t[0] >= 3 ? '#b8322a' : t[1] >= 3 ? '#2f4fd8' : t[2] >= 3 ? '#1f8a6a' : '#6a3fb5';
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, cy + r * 0.1);
  ctx.lineTo(r * 0.45, cy + r * 0.1);
  ctx.lineTo(r * 0.75, cy + r * 1.1);
  ctx.quadraticCurveTo(0, cy + r * 1.25, -r * 0.75, cy + r * 1.1);
  ctx.closePath();
  fillStroke(ctx, vgrad(ctx, cy, cy + r * 1.2, robe), 2.5);
  // robe trim
  line(ctx, 0, cy + r * 0.15, 0, cy + r * 1.15, 2, '#ffd23c');
  if (t[1] >= 3) {
    for (let i = 0; i < 3; i++) sparkle(ctx, -r * 0.35 + i * r * 0.35, cy + r * 0.85, 3, '#9fdcff');
  }
  // head
  ctx.beginPath();
  ctx.moveTo(-r * 0.62, cy - r * 0.35);
  ctx.quadraticCurveTo(-r * 0.7, cy + r * 0.25, 0, cy + r * 0.32);
  ctx.quadraticCurveTo(r * 0.7, cy + r * 0.25, r * 0.62, cy - r * 0.35);
  ctx.quadraticCurveTo(0, cy - r * 0.85, -r * 0.62, cy - r * 0.35);
  ctx.closePath();
  fillStroke(ctx, ballGrad(ctx, 0, cy - r * 0.2, r * 0.7, '#f07a2b', 0.45), 3);
  // ears
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.25, cy - r * 0.6);
    ctx.lineTo(s * r * 0.7, cy - r * 1.15);
    ctx.lineTo(s * r * 0.65, cy - r * 0.35);
    ctx.closePath();
    fillStroke(ctx, '#f07a2b', 2.5);
    ctx.beginPath();
    ctx.moveTo(s * r * 0.35, cy - r * 0.58);
    ctx.lineTo(s * r * 0.63, cy - r * 0.95);
    ctx.lineTo(s * r * 0.6, cy - r * 0.48);
    ctx.closePath();
    ctx.fillStyle = '#3b1f12';
    ctx.fill();
  }
  // cheeks
  ctx.beginPath();
  ctx.moveTo(-r * 0.6, cy - r * 0.05);
  ctx.quadraticCurveTo(-r * 0.3, cy + r * 0.38, 0, cy + r * 0.3);
  ctx.quadraticCurveTo(r * 0.3, cy + r * 0.38, r * 0.6, cy - r * 0.05);
  ctx.quadraticCurveTo(0, cy + r * 0.08, -r * 0.6, cy - r * 0.05);
  ctx.fillStyle = '#fff5ea';
  ctx.fill();
  eye(ctx, -r * 0.24, cy - r * 0.18, r * 0.14, 0.5);
  eye(ctx, r * 0.24, cy - r * 0.18, r * 0.14, 0.5);
  circle(ctx, 0, cy + r * 0.08, r * 0.08);
  ctx.fillStyle = '#2a1b2e';
  ctx.fill();
  // hat
  if (t[1] >= 5) {
    // star crown
    for (let i = -2; i <= 2; i++) {
      star(ctx, i * r * 0.22, cy - r * 0.78 - (2 - Math.abs(i)) * r * 0.12, r * 0.14);
      fillStroke(ctx, '#ffe066', 1.5);
    }
  } else if (t[2] >= 5) {
    ctx.beginPath();
    ctx.moveTo(-r * 0.4, cy - r * 0.6);
    ctx.lineTo(-r * 0.25, cy - r * 0.95);
    ctx.lineTo(0, cy - r * 0.72);
    ctx.lineTo(r * 0.25, cy - r * 0.95);
    ctx.lineTo(r * 0.4, cy - r * 0.6);
    ctx.closePath();
    fillStroke(ctx, '#bfffe0', 2);
  } else {
    ctx.beginPath();
    ctx.ellipse(0, cy - r * 0.6, r * 0.75, r * 0.17, 0, 0, Math.PI * 2);
    fillStroke(ctx, shade(robe, -0.15), 2.5);
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, cy - r * 0.62);
    ctx.quadraticCurveTo(-r * 0.1, cy - r * 1.3, r * 0.35, cy - r * 1.75);
    ctx.quadraticCurveTo(r * 0.2, cy - r * 1.2, r * 0.45, cy - r * 0.62);
    ctx.closePath();
    fillStroke(ctx, vgrad(ctx, cy - r * 1.7, cy - r * 0.6, robe), 2.5);
    star(ctx, r * 0.05, cy - r * 1.0, r * 0.12);
    ctx.fillStyle = '#ffe066';
    ctx.fill();
  }
  // staff
  const orb = t[0] >= 1 ? '#ff7a2f' : t[1] >= 1 ? '#7b9cff' : t[2] >= 1 ? '#7dffb0' : '#5ce1ff';
  line(ctx, -r * 0.75, cy + r * 1.05, -r * 0.95, cy - r * 0.6, 4, '#7a4a28');
  line(ctx, -r * 0.75, cy + r * 1.05, -r * 0.95, cy - r * 0.6, 1.5, '#b07a4a');
  ctx.save();
  const og = ctx.createRadialGradient(-r * 0.98, cy - r * 0.82, 1, -r * 0.98, cy - r * 0.82, r * 0.55);
  og.addColorStop(0, 'rgba(255,255,255,0.9)');
  og.addColorStop(0.4, orb);
  og.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = og;
  circle(ctx, -r * 0.98, cy - r * 0.82, r * 0.55);
  ctx.fill();
  ctx.restore();
  circle(ctx, -r * 0.98, cy - r * 0.82, r * 0.2);
  fillStroke(ctx, ballGrad(ctx, -r * 0.98, cy - r * 0.82, r * 0.2, orb, 0.6), 2);
  // hand
  circle(ctx, -r * 0.82, cy + r * 0.45, r * 0.13);
  fillStroke(ctx, '#f07a2b', 2);
  if (t[2] >= 4) {
    // ghost fox companion
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.translate(r * 1.05, r * 0.05);
    ellipse(ctx, 0, -r * 0.35, r * 0.35, r * 0.28);
    fillStroke(ctx, '#bfffe0', 2, '#2e8b6a');
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(s * r * 0.1, -r * 0.55);
      ctx.lineTo(s * r * 0.28, -r * 0.85);
      ctx.lineTo(s * r * 0.32, -r * 0.45);
      ctx.closePath();
      fillStroke(ctx, '#bfffe0', 1.5, '#2e8b6a');
    }
    circle(ctx, -r * 0.1, -r * 0.38, 2);
    circle(ctx, r * 0.12, -r * 0.38, 2);
    ctx.fillStyle = '#2e8b6a';
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------
// ZAP — thunder frog
// ---------------------------------------------------------------------------------------------
function drawZap(ctx: Ctx, r: number, t: readonly number[]) {
  const L = lvl(t);
  pedestal(ctx, r, '#46d36b', L);
  if (t[2] >= 4) {
    // lily pad base
    ellipse(ctx, 0, r * 0.25, r * 1.3, r * 0.5);
    fillStroke(ctx, '#2f9e44', 2.5);
    ctx.beginPath();
    ctx.moveTo(0, r * 0.25);
    ctx.lineTo(r * 1.0, r * 0.05);
    ctx.lineTo(r * 1.1, r * 0.35);
    ctx.closePath();
    ctx.fillStyle = '#c8e6c9';
    ctx.fill();
  }
  if (L >= 5) aura5(ctx, r, t[0] >= 5 ? '#7bdff2' : t[1] >= 5 ? '#4fd1c5' : '#ffe066');
  const levi = t[1] >= 5;
  const body = levi ? '#1f9e8f' : t[1] >= 3 ? '#2fae56' : '#46d36b';
  const s = t[1] >= 3 ? 1.12 : 1;
  const cy = -r * 0.62 * s;
  if (t[0] >= 3) {
    // little storm cloud
    ctx.save();
    ctx.translate(0, cy - r * 1.75);
    for (const [x, y, rr] of [[-0.45, 0, 0.35], [0, -0.12, 0.45], [0.45, 0, 0.35]]) {
      circle(ctx, x * r, y * r, rr * r);
      fillStroke(ctx, '#7d8ca3', 2);
    }
    for (const [x, y, rr] of [[-0.45, 0, 0.35], [0, -0.12, 0.45], [0.45, 0, 0.35]]) {
      circle(ctx, x * r, y * r, rr * r - 1.5);
      ctx.fillStyle = '#7d8ca3';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(r * 0.05, r * 0.25);
    ctx.lineTo(-r * 0.12, r * 0.55);
    ctx.lineTo(r * 0.06, r * 0.55);
    ctx.lineTo(-r * 0.08, r * 0.9);
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
  }
  if (levi) {
    // fins
    for (const sx of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(sx * r * 0.9, cy);
      ctx.lineTo(sx * r * 1.55, cy - r * 0.55);
      ctx.lineTo(sx * r * 1.25, cy + r * 0.35);
      ctx.closePath();
      fillStroke(ctx, '#4fd1c5', 2.5);
    }
  }
  // back legs
  for (const sx of [-1, 1]) {
    ellipse(ctx, sx * r * 0.8 * s, cy + r * 0.55, r * 0.38 * s, r * 0.3 * s);
    fillStroke(ctx, shade(body, -0.15), 2.5);
  }
  // body
  ellipse(ctx, 0, cy, r * 1.02 * s, r * 0.78 * s);
  fillStroke(ctx, ballGrad(ctx, 0, cy, r * s, body, 0.45), 3);
  // belly
  ellipse(ctx, 0, cy + r * 0.3 * s, r * 0.62 * s, r * 0.42 * s);
  ctx.fillStyle = levi ? '#bdf5ee' : '#fff3a8';
  ctx.fill();
  if (t[2] >= 5) {
    circle(ctx, 0, cy + r * 0.32 * s, r * 0.22);
    const g = ctx.createRadialGradient(0, cy + r * 0.32 * s, 1, 0, cy + r * 0.32 * s, r * 0.3);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.5, '#7bdff2');
    g.addColorStop(1, '#2f8bff');
    fillStroke(ctx, g, 2);
  }
  // spots
  for (const [x, y] of [[-0.55, -0.25], [0.6, -0.15], [-0.25, -0.45]]) {
    circle(ctx, x * r * s, cy + y * r * s, r * 0.1 * s);
    ctx.fillStyle = shade(body, -0.25);
    ctx.fill();
  }
  // eyes on top
  for (const sx of [-1, 1]) {
    circle(ctx, sx * r * 0.45 * s, cy - r * 0.62 * s, r * 0.32 * s);
    fillStroke(ctx, ballGrad(ctx, sx * r * 0.45 * s, cy - r * 0.62 * s, r * 0.32 * s, body, 0.4), 2.5);
    eye(ctx, sx * r * 0.45 * s, cy - r * 0.62 * s, r * 0.2 * s, 0.3, 0.1);
  }
  // mouth
  ctx.beginPath();
  ctx.moveTo(-r * 0.55 * s, cy + r * 0.0);
  ctx.quadraticCurveTo(0, cy + r * 0.32 * s, r * 0.55 * s, cy + r * 0.0);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.5;
  ctx.stroke();
  if (t[1] >= 1) {
    // tongue tip
    ctx.beginPath();
    ctx.ellipse(r * 0.12, cy + r * 0.18 * s, r * 0.14, r * 0.09, 0.2, 0, Math.PI * 2);
    fillStroke(ctx, '#ff6fa8', 1.8);
  }
  // lightning mark
  ctx.beginPath();
  ctx.moveTo(r * 0.05, cy - r * 0.55 * s);
  ctx.lineTo(-r * 0.12, cy - r * 0.25 * s);
  ctx.lineTo(r * 0.02, cy - r * 0.25 * s);
  ctx.lineTo(-r * 0.1, cy + r * 0.0);
  ctx.lineTo(r * 0.18, cy - r * 0.32 * s);
  ctx.lineTo(r * 0.04, cy - r * 0.32 * s);
  ctx.closePath();
  fillStroke(ctx, '#ffe066', 1.5);
  // front feet
  feet(ctx, r, shade(body, 0.15), 0.4);
  if (t[2] >= 1) {
    // antenna coil
    line(ctx, r * 0.45 * s, cy - r * 0.9 * s, r * 0.6, cy - r * 1.5, 2.5, '#7d8796');
    for (let i = 0; i < 3; i++) {
      ellipse(ctx, r * 0.55 + i * r * 0.02, cy - r * (1.05 + i * 0.15), r * 0.12, r * 0.05);
      ctx.strokeStyle = '#d08c2d';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    circle(ctx, r * 0.6, cy - r * 1.55, r * 0.1);
    fillStroke(ctx, '#7bdff2', 1.5);
  }
  if (t[0] >= 5) {
    // lightning crown
    for (let i = -1; i <= 1; i++) {
      ctx.save();
      ctx.translate(i * r * 0.35, cy - r * 1.05 * s);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-r * 0.12, -r * 0.3);
      ctx.lineTo(0, -r * 0.28);
      ctx.lineTo(-r * 0.06, -r * 0.55);
      ctx.lineTo(r * 0.14, -r * 0.2);
      ctx.lineTo(r * 0.02, -r * 0.22);
      ctx.closePath();
      fillStroke(ctx, '#ffe066', 1.5);
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------------------------------------
// BUZZ — bee hive
// ---------------------------------------------------------------------------------------------
function drawBuzz(ctx: Ctx, r: number, t: readonly number[]) {
  const L = lvl(t);
  pedestal(ctx, r, '#ffbf1f', L);
  if (L >= 5) aura5(ctx, r, t[1] >= 5 ? '#b5179e' : '#ffd23c');
  // post
  roundRect(ctx, -r * 0.12, -r * 0.6, r * 0.24, r * 0.9, 3);
  fillStroke(ctx, '#7a4a28', 2);
  const bands = 4 + (t[0] >= 3 ? 1 : 0) + (t[0] >= 5 ? 1 : 0);
  const hw = r * (0.95 + t[0] * 0.04);
  const bh = r * 0.36;
  const top = -r * 0.45 - bands * bh;
  const hiveCol = t[1] >= 3 ? '#e0a100' : '#ffc93c';
  for (let i = bands - 1; i >= 0; i--) {
    const y = top + i * bh;
    const f = 0.55 + 0.45 * Math.sin(((i + 0.5) / bands) * Math.PI);
    ellipse(ctx, 0, y + bh * 0.5, hw * f, bh * 0.62);
    fillStroke(ctx, ballGrad(ctx, -hw * 0.3, y, hw, i % 2 && t[1] >= 3 ? '#2a2433' : hiveCol, 0.35), 2.5);
  }
  // entrance
  ellipse(ctx, 0, top + bh * (bands - 1.4), r * 0.22, r * 0.16);
  ctx.fillStyle = '#3b2412';
  ctx.fill();
  // drips
  if (t[1] >= 1) {
    for (const x of [-0.5, 0.35]) {
      ctx.beginPath();
      ctx.ellipse(x * r, top + bh * bands * 0.6, r * 0.08, r * 0.18, 0, 0, Math.PI * 2);
      ctx.fillStyle = t[1] >= 2 ? '#a3e635' : '#ffb703';
      ctx.fill();
    }
  }
  if (t[2] >= 1) {
    ctx.beginPath();
    ctx.ellipse(-r * 0.2, top + bh * 1.4, r * 0.1, r * 0.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#fff1c1';
    ctx.fill();
  }
  if (t[2] >= 3) {
    // crown
    ctx.save();
    ctx.translate(0, top - bh * 0.1);
    const s = t[2] >= 5 ? 1.4 : 1;
    ctx.beginPath();
    ctx.moveTo(-r * 0.4 * s, 0);
    ctx.lineTo(-r * 0.45 * s, -r * 0.4 * s);
    ctx.lineTo(-r * 0.2 * s, -r * 0.2 * s);
    ctx.lineTo(0, -r * 0.5 * s);
    ctx.lineTo(r * 0.2 * s, -r * 0.2 * s);
    ctx.lineTo(r * 0.45 * s, -r * 0.4 * s);
    ctx.lineTo(r * 0.4 * s, 0);
    ctx.closePath();
    fillStroke(ctx, vgrad(ctx, -r * 0.5, 0, '#ffd23c', 0.5), 2);
    if (t[2] >= 5) {
      circle(ctx, 0, -r * 0.15, r * 0.08);
      ctx.fillStyle = '#ff3b6b';
      ctx.fill();
    }
    ctx.restore();
  }
  if (t[1] >= 5) {
    // skull emblem
    circle(ctx, 0, top + bh * 2.2, r * 0.22);
    fillStroke(ctx, '#f1faee', 2);
    circle(ctx, -r * 0.08, top + bh * 2.15, r * 0.06);
    circle(ctx, r * 0.08, top + bh * 2.15, r * 0.06);
    ctx.fillStyle = '#1a1622';
    ctx.fill();
  }
  // a few resident bees
  const bees = Math.min(4, 1 + t[0]);
  for (let i = 0; i < bees; i++) {
    const a = i * 2.1 + 0.5;
    beeShape(ctx, Math.cos(a) * hw * 1.15, top + bh * 2 + Math.sin(a) * bh * 2, r * 0.22, t[1] >= 3);
  }
}

export function beeShape(ctx: Ctx, x: number, y: number, s: number, wasp = false, queen = false) {
  ctx.save();
  ctx.translate(x, y);
  // wings
  ctx.globalAlpha = 0.85;
  for (const sx of [-1, 1]) {
    ellipse(ctx, sx * s * 0.45, -s * 0.55, s * 0.45, s * 0.3, sx * 0.5);
    fillStroke(ctx, 'rgba(230,245,255,0.9)', 1.2, '#7aa6c2');
  }
  ctx.globalAlpha = 1;
  ellipse(ctx, 0, 0, s * 0.85, s * 0.6);
  fillStroke(ctx, queen ? '#ffd23c' : wasp ? '#f4d03f' : '#ffc93c', 1.6);
  ctx.save();
  ellipse(ctx, 0, 0, s * 0.84, s * 0.59);
  ctx.clip();
  ctx.fillStyle = '#231c2b';
  ctx.fillRect(-s * 0.25, -s, s * 0.22, s * 2);
  ctx.fillRect(s * 0.25, -s, s * 0.22, s * 2);
  ctx.restore();
  circle(ctx, s * 0.75, -s * 0.1, s * 0.12);
  ctx.fillStyle = '#231c2b';
  ctx.fill();
  if (queen) {
    star(ctx, 0, -s * 0.75, s * 0.3, 0.5, 5);
    fillStroke(ctx, '#ffd23c', 1);
  }
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// ACORN — squirrel farmer
// ---------------------------------------------------------------------------------------------
function drawAcorn(ctx: Ctx, r: number, t: readonly number[]) {
  const L = lvl(t);
  pedestal(ctx, r, '#e0a23a', L);
  // tree behind
  const tree = 1 + t[0] * 0.13;
  ctx.save();
  ctx.translate(r * 0.35, -r * 0.2);
  roundRect(ctx, -r * 0.14 * tree, -r * 1.2 * tree, r * 0.28 * tree, r * 1.2 * tree, 3);
  fillStroke(ctx, vgrad(ctx, -r * 1.2 * tree, 0, '#8a5a34'), 2);
  const canopy = t[0] >= 5 ? '#ffd23c' : '#4caf50';
  for (const [x, y, rr] of [[-0.5, -1.35, 0.55], [0.45, -1.45, 0.55], [0, -1.85, 0.62], [0, -1.3, 0.5]]) {
    circle(ctx, x * r * tree, y * r * tree, rr * r * tree);
    fillStroke(ctx, ballGrad(ctx, x * r * tree, y * r * tree, rr * r * tree, canopy, 0.35), 2.5);
  }
  for (const [x, y] of [[-0.45, -1.3], [0.4, -1.5], [0.05, -1.9], [0.25, -1.15]]) acornShape(ctx, x * r * tree, y * r * tree, r * 0.16, t[0] >= 2);
  ctx.restore();
  if (L >= 5) aura5(ctx, r, '#ffe066');
  // bank (path 1)
  if (t[1] >= 1) {
    ctx.save();
    ctx.translate(-r * 0.95, r * 0.05);
    if (t[1] >= 3) {
      roundRect(ctx, -r * 0.4, -r * 0.8, r * 0.8, r * 0.8, 4);
      fillStroke(ctx, vgrad(ctx, -r * 0.8, 0, t[1] >= 5 ? '#e0a100' : '#7d8796', 0.5), 2.5);
      circle(ctx, 0, -r * 0.4, r * 0.18);
      fillStroke(ctx, '#dfe6ee', 2);
      line(ctx, 0, -r * 0.4, r * 0.12, -r * 0.48, 2, '#2a1b2e');
    } else {
      ellipse(ctx, 0, -r * 0.3, r * 0.35, r * 0.32);
      fillStroke(ctx, '#c9a26b', 2);
      ctx.fillStyle = '#2a1b2e';
      ctx.font = `bold ${r * 0.35}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('$', 0, -r * 0.28);
    }
    ctx.restore();
  }
  // market (path 2)
  if (t[2] >= 3) {
    ctx.save();
    ctx.translate(r * 0.1, -r * 1.75);
    ctx.beginPath();
    ctx.moveTo(-r * 1.1, 0);
    ctx.lineTo(r * 1.1, 0);
    ctx.lineTo(r * 0.95, -r * 0.4);
    ctx.lineTo(-r * 0.95, -r * 0.4);
    ctx.closePath();
    fillStroke(ctx, '#e63946', 2.5);
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      ctx.moveTo(-r * 1.1 + i * r * 0.44, 0);
      ctx.lineTo(-r * 0.88 + i * r * 0.44, 0);
      ctx.lineTo(-r * 0.75 + i * r * 0.38, -r * 0.4);
      ctx.lineTo(-r * 0.95 + i * r * 0.38, -r * 0.4);
      ctx.closePath();
      ctx.fillStyle = '#ffffff';
      ctx.fill();
    }
    ctx.restore();
  }
  if (t[2] >= 4) {
    for (let i = 0; i < 4; i++) {
      ellipse(ctx, r * (0.8 + (i % 2) * 0.2), r * 0.05 - i * r * 0.1, r * 0.25, r * 0.09);
      fillStroke(ctx, '#ffd23c', 1.5, '#b8860b');
    }
  }
  // squirrel
  const cy = -r * 0.55;
  // tail
  ctx.beginPath();
  ctx.moveTo(-r * 0.2, cy + r * 0.5);
  ctx.bezierCurveTo(-r * 1.3, cy + r * 0.3, -r * 1.2, cy - r * 1.3, -r * 0.4, cy - r * 1.1);
  ctx.bezierCurveTo(-r * 0.8, cy - r * 0.5, -r * 0.5, cy + r * 0.0, -r * 0.05, cy + r * 0.2);
  ctx.closePath();
  fillStroke(ctx, ballGrad(ctx, -r * 0.7, cy - r * 0.3, r, '#c8743a', 0.35), 2.5);
  // body
  ellipse(ctx, 0, cy + r * 0.2, r * 0.48, r * 0.55);
  fillStroke(ctx, ballGrad(ctx, 0, cy + r * 0.2, r * 0.55, '#c8743a', 0.4), 2.5);
  ellipse(ctx, 0, cy + r * 0.32, r * 0.3, r * 0.36);
  ctx.fillStyle = '#f6e2c4';
  ctx.fill();
  // head
  circle(ctx, r * 0.05, cy - r * 0.42, r * 0.42);
  fillStroke(ctx, ballGrad(ctx, r * 0.05, cy - r * 0.42, r * 0.42, '#c8743a', 0.4), 2.5);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(r * 0.05 + s * r * 0.15, cy - r * 0.75);
    ctx.lineTo(r * 0.05 + s * r * 0.32, cy - r * 1.05);
    ctx.lineTo(r * 0.05 + s * r * 0.38, cy - r * 0.62);
    ctx.closePath();
    fillStroke(ctx, '#c8743a', 2);
  }
  eye(ctx, -r * 0.1, cy - r * 0.45, r * 0.11, 0.5);
  eye(ctx, r * 0.2, cy - r * 0.45, r * 0.11, 0.5);
  circle(ctx, r * 0.1, cy - r * 0.28, r * 0.06);
  ctx.fillStyle = '#2a1b2e';
  ctx.fill();
  ellipse(ctx, r * 0.1, cy - r * 0.18, r * 0.12, r * 0.06);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  // held acorn
  acornShape(ctx, r * 0.05, cy + r * 0.05, r * 0.2, t[0] >= 2);
  for (const s of [-1, 1]) {
    circle(ctx, s * r * 0.2, cy + r * 0.1, r * 0.1);
    fillStroke(ctx, '#c8743a', 1.5);
  }
  if (t[2] >= 5) {
    // top hat
    ctx.save();
    ctx.translate(r * 0.05, cy - r * 0.78);
    ellipse(ctx, 0, 0, r * 0.4, r * 0.1);
    fillStroke(ctx, '#1a1622', 2);
    roundRect(ctx, -r * 0.25, -r * 0.5, r * 0.5, r * 0.5, 2);
    fillStroke(ctx, '#1a1622', 2);
    ctx.fillStyle = '#e63946';
    ctx.fillRect(-r * 0.25, -r * 0.15, r * 0.5, r * 0.1);
    ctx.restore();
  }
}

export function acornShape(ctx: Ctx, x: number, y: number, s: number, gold = false) {
  ctx.save();
  ctx.translate(x, y);
  ellipse(ctx, 0, s * 0.25, s * 0.7, s * 0.85);
  fillStroke(ctx, ballGrad(ctx, 0, s * 0.25, s * 0.8, gold ? '#ffcf3c' : '#c8833a', 0.45), Math.max(1, s * 0.18));
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.3, s * 0.85, s * 0.42, 0, Math.PI, 0);
  ctx.closePath();
  fillStroke(ctx, gold ? '#b8860b' : '#6b4226', Math.max(1, s * 0.18));
  line(ctx, 0, -s * 0.65, s * 0.15, -s * 0.95, Math.max(1, s * 0.2), '#4a2c18');
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// DOJO — panda master
// ---------------------------------------------------------------------------------------------
function drawDojo(ctx: Ctx, r: number, t: readonly number[]) {
  const L = lvl(t);
  pedestal(ctx, r, '#e63946', L);
  if (L >= 5) aura5(ctx, r, t[2] >= 5 ? '#ffd23c' : '#ffffff');
  // pagoda roof behind
  const roof = t[2] >= 5 ? '#e0a100' : '#c1121f';
  ctx.save();
  ctx.translate(0, -r * 2.05);
  roundRect(ctx, -r * 0.9, r * 0.05, r * 0.16, r * 1.4, 2);
  fillStroke(ctx, '#7a1c1c', 2);
  roundRect(ctx, r * 0.74, r * 0.05, r * 0.16, r * 1.4, 2);
  fillStroke(ctx, '#7a1c1c', 2);
  ctx.beginPath();
  ctx.moveTo(-r * 1.45, r * 0.15);
  ctx.quadraticCurveTo(-r * 0.7, -r * 0.05, -r * 0.45, -r * 0.45);
  ctx.lineTo(r * 0.45, -r * 0.45);
  ctx.quadraticCurveTo(r * 0.7, -r * 0.05, r * 1.45, r * 0.15);
  ctx.quadraticCurveTo(0, -r * 0.05, -r * 1.45, r * 0.15);
  ctx.closePath();
  fillStroke(ctx, vgrad(ctx, -r * 0.45, r * 0.15, roof, 0.3), 2.5);
  circle(ctx, 0, -r * 0.55, r * 0.1);
  fillStroke(ctx, '#ffd23c', 1.5);
  ctx.restore();
  if (t[1] >= 1) {
    // lantern
    ctx.save();
    ctx.translate(-r * 1.05, -r * 1.35);
    line(ctx, 0, -r * 0.5, 0, -r * 0.25, 1.5, '#2a1b2e');
    ellipse(ctx, 0, 0, r * 0.2, r * 0.27);
    fillStroke(ctx, '#ff6b35', 2);
    ctx.save();
    ctx.globalAlpha = 0.4;
    circle(ctx, 0, 0, r * 0.45);
    ctx.fillStyle = '#ffd166';
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }
  const cy = -r * 0.75;
  // body
  ellipse(ctx, 0, cy + r * 0.3, r * 0.75, r * 0.65);
  fillStroke(ctx, ballGrad(ctx, 0, cy + r * 0.3, r * 0.75, '#f7f7f2', 0.2, -0.15), 3);
  // arms
  for (const s of [-1, 1]) {
    ellipse(ctx, s * r * 0.55, cy + r * 0.38, r * 0.25, r * 0.35, s * 0.6);
    fillStroke(ctx, '#2a2433', 2.5);
  }
  // belt
  ctx.beginPath();
  ctx.ellipse(0, cy + r * 0.5, r * 0.68, r * 0.13, 0, 0, Math.PI * 2);
  const beltCol = t[0] >= 3 ? '#1a1622' : t[0] >= 1 ? '#e63946' : '#ffffff';
  fillStroke(ctx, beltCol, 2);
  // head
  circle(ctx, 0, cy - r * 0.42, r * 0.58);
  fillStroke(ctx, ballGrad(ctx, 0, cy - r * 0.42, r * 0.58, '#ffffff', 0, -0.12), 3);
  for (const s of [-1, 1]) {
    circle(ctx, s * r * 0.45, cy - r * 0.88, r * 0.2);
    fillStroke(ctx, '#2a2433', 2.5);
    ellipse(ctx, s * r * 0.22, cy - r * 0.45, r * 0.17, r * 0.22, s * -0.5);
    ctx.fillStyle = '#2a2433';
    ctx.fill();
  }
  // calm eyes (closed arcs) or open at tier 5
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * r * 0.22, cy - r * 0.45, r * 0.08, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ellipse(ctx, 0, cy - r * 0.25, r * 0.1, r * 0.07);
  ctx.fillStyle = '#2a2433';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, cy - r * 0.2, r * 0.1, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.strokeStyle = '#2a2433';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  // headband
  if (t[0] >= 1) {
    ctx.beginPath();
    ctx.ellipse(0, cy - r * 0.68, r * 0.55, r * 0.11, 0, Math.PI * 0.95, Math.PI * 2.05);
    ctx.strokeStyle = t[0] >= 5 ? '#ffd23c' : '#e63946';
    ctx.lineWidth = 4;
    ctx.stroke();
    line(ctx, r * 0.5, cy - r * 0.65, r * 0.85, cy - r * 0.45, 3, t[0] >= 5 ? '#ffd23c' : '#e63946');
  }
  if (t[1] >= 5) {
    // lotus halo
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.translate(0, cy - r * 1.25);
      ctx.rotate((i / 6) * Math.PI - Math.PI / 2 - Math.PI / 2 + Math.PI / 12);
      ellipse(ctx, r * 0.35, 0, r * 0.25, r * 0.1);
      fillStroke(ctx, '#ffc8dd', 1.5);
      ctx.restore();
    }
  }
  if (t[2] >= 4) {
    // lucky cat statue
    ctx.save();
    ctx.translate(r * 1.05, r * 0.05);
    ellipse(ctx, 0, -r * 0.3, r * 0.28, r * 0.32);
    fillStroke(ctx, '#ffffff', 2);
    circle(ctx, 0, -r * 0.7, r * 0.24);
    fillStroke(ctx, '#ffffff', 2);
    ellipse(ctx, r * 0.25, -r * 0.85, r * 0.08, r * 0.16, 0.3);
    fillStroke(ctx, '#ffffff', 1.5);
    circle(ctx, 0, -r * 0.3, r * 0.1);
    ctx.fillStyle = '#ffd23c';
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------------------------
// HEROES
// ---------------------------------------------------------------------------------------------
function heroBase(ctx: Ctx, r: number, color: string, level: number) {
  // star-studded hero pedestal
  pedestal(ctx, r, color, level >= 20 ? 5 : 0);
  for (let i = 0; i < 3; i++) {
    star(ctx, -r * 0.5 + i * r * 0.5, r * 0.32, r * 0.12);
    ctx.fillStyle = level >= 10 ? '#ffd23c' : '#ffffff';
    ctx.fill();
  }
}

function drawNova(ctx: Ctx, r: number, level: number) {
  heroBase(ctx, r, '#7b5cff', level);
  if (level >= 20) aura5(ctx, r, '#c9b8ff');
  const cy = -r * 0.9;
  const suit = level >= 20 ? '#ffd23c' : '#e8ecff';
  if (level >= 10) {
    // cape
    ctx.beginPath();
    ctx.moveTo(-r * 0.5, cy);
    ctx.quadraticCurveTo(-r * 1.2, cy + r * 0.9, -r * 0.8, cy + r * 1.15);
    ctx.lineTo(r * 0.8, cy + r * 1.15);
    ctx.quadraticCurveTo(r * 1.2, cy + r * 0.9, r * 0.5, cy);
    ctx.closePath();
    fillStroke(ctx, vgrad(ctx, cy, cy + r * 1.15, '#3f2b96'), 2.5);
    for (let i = 0; i < 4; i++) sparkle(ctx, -r * 0.6 + i * r * 0.4, cy + r * 0.8, 2.5);
  }
  // tail
  ctx.beginPath();
  ctx.moveTo(r * 0.4, cy + r * 0.9);
  ctx.quadraticCurveTo(r * 1.3, cy + r * 0.8, r * 1.1, cy - r * 0.2);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.strokeStyle = '#9b7bff';
  ctx.lineWidth = 4.5;
  ctx.stroke();
  // suit body
  roundRect(ctx, -r * 0.5, cy + r * 0.1, r, r * 0.95, r * 0.35);
  fillStroke(ctx, vgrad(ctx, cy, cy + r, suit, 0.3), 2.5);
  star(ctx, 0, cy + r * 0.5, r * 0.2);
  fillStroke(ctx, '#7b5cff', 1.5);
  // head
  circle(ctx, 0, cy - r * 0.35, r * 0.55);
  fillStroke(ctx, ballGrad(ctx, 0, cy - r * 0.35, r * 0.55, '#9b7bff', 0.45), 2.5);
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * r * 0.18, cy - r * 0.8);
    ctx.lineTo(s * r * 0.48, cy - r * 1.12);
    ctx.lineTo(s * r * 0.55, cy - r * 0.62);
    ctx.closePath();
    fillStroke(ctx, '#9b7bff', 2);
    ctx.beginPath();
    ctx.moveTo(s * r * 0.27, cy - r * 0.78);
    ctx.lineTo(s * r * 0.45, cy - r * 0.98);
    ctx.lineTo(s * r * 0.48, cy - r * 0.68);
    ctx.closePath();
    ctx.fillStyle = '#ffb3d9';
    ctx.fill();
  }
  eye(ctx, -r * 0.2, cy - r * 0.38, r * 0.15, 0.4);
  eye(ctx, r * 0.2, cy - r * 0.38, r * 0.15, 0.4);
  ctx.beginPath();
  ctx.moveTo(-r * 0.05, cy - r * 0.2);
  ctx.lineTo(r * 0.05, cy - r * 0.2);
  ctx.lineTo(0, cy - r * 0.13);
  ctx.closePath();
  ctx.fillStyle = '#ff6fa8';
  ctx.fill();
  // whiskers
  for (const s of [-1, 1]) {
    line(ctx, s * r * 0.25, cy - r * 0.15, s * r * 0.7, cy - r * 0.2, 1.2, '#2a1b2e');
    line(ctx, s * r * 0.25, cy - r * 0.1, s * r * 0.68, cy - r * 0.02, 1.2, '#2a1b2e');
  }
  // helmet bubble
  ctx.save();
  circle(ctx, 0, cy - r * 0.4, r * 0.82);
  ctx.fillStyle = 'rgba(180,220,255,0.18)';
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(220,240,255,0.95)';
  ctx.stroke();
  gloss(ctx, -r * 0.35, cy - r * 0.85, r * 0.25, r * 0.1, 0.8);
  ctx.restore();
  // antenna
  line(ctx, r * 0.45, cy - r * 1.05, r * 0.6, cy - r * 1.45, 2, '#c9d1e0');
  star(ctx, r * 0.62, cy - r * 1.5, r * 0.14);
  fillStroke(ctx, '#ffd23c', 1.2);
  feet(ctx, r, suit, 0.3);
}

function drawGrizz(ctx: Ctx, r: number, level: number) {
  heroBase(ctx, r, '#a0612e', level);
  if (level >= 20) aura5(ctx, r, '#ffd23c');
  const cy = -r * 0.85;
  // body
  ellipse(ctx, 0, cy + r * 0.3, r * 0.85, r * 0.78);
  fillStroke(ctx, ballGrad(ctx, 0, cy + r * 0.3, r * 0.85, '#8b5a2b', 0.35), 3);
  ellipse(ctx, 0, cy + r * 0.45, r * 0.5, r * 0.5);
  ctx.fillStyle = '#d2a36c';
  ctx.fill();
  if (level >= 10) {
    // armour
    ctx.beginPath();
    ctx.moveTo(-r * 0.7, cy + r * 0.0);
    ctx.lineTo(r * 0.7, cy + r * 0.0);
    ctx.lineTo(r * 0.55, cy + r * 0.6);
    ctx.lineTo(-r * 0.55, cy + r * 0.6);
    ctx.closePath();
    fillStroke(ctx, vgrad(ctx, cy, cy + r * 0.6, level >= 20 ? '#e0b43a' : '#9aa5b5', 0.4), 2.5);
  }
  // hammer
  ctx.save();
  ctx.translate(r * 0.85, cy + r * 0.3);
  ctx.rotate(0.35);
  roundRect(ctx, -r * 0.08, -r * 1.3, r * 0.16, r * 1.5, 2);
  fillStroke(ctx, '#6b4226', 2);
  roundRect(ctx, -r * 0.42, -r * 1.65, r * 0.84, r * 0.48, 5);
  fillStroke(ctx, vgrad(ctx, -r * 1.65, -r * 1.17, level >= 20 ? '#ffd23c' : '#aeb8c6', 0.5), 2.5);
  ctx.restore();
  // head
  circle(ctx, 0, cy - r * 0.45, r * 0.62);
  fillStroke(ctx, ballGrad(ctx, 0, cy - r * 0.45, r * 0.62, '#8b5a2b', 0.4), 3);
  for (const s of [-1, 1]) {
    circle(ctx, s * r * 0.5, cy - r * 0.95, r * 0.22);
    fillStroke(ctx, '#8b5a2b', 2.5);
    circle(ctx, s * r * 0.5, cy - r * 0.95, r * 0.11);
    ctx.fillStyle = '#d2a36c';
    ctx.fill();
  }
  ellipse(ctx, 0, cy - r * 0.25, r * 0.3, r * 0.22);
  fillStroke(ctx, '#d2a36c', 2);
  ellipse(ctx, 0, cy - r * 0.33, r * 0.12, r * 0.08);
  ctx.fillStyle = '#2a1b2e';
  ctx.fill();
  eye(ctx, -r * 0.24, cy - r * 0.55, r * 0.12, 0.3, 0, 0.25);
  eye(ctx, r * 0.24, cy - r * 0.55, r * 0.12, 0.3, 0, 0.25);
  // war paint
  for (const s of [-1, 1]) {
    line(ctx, s * r * 0.35, cy - r * 0.38, s * r * 0.5, cy - r * 0.32, 2.5, '#e63946');
    line(ctx, s * r * 0.35, cy - r * 0.3, s * r * 0.48, cy - r * 0.24, 2.5, '#e63946');
  }
  // headdress
  const feathers = level >= 20 ? 7 : level >= 10 ? 5 : 3;
  for (let i = 0; i < feathers; i++) {
    const a = -Math.PI / 2 + (i - (feathers - 1) / 2) * 0.32;
    ctx.save();
    ctx.translate(Math.cos(a) * r * 0.55, cy - r * 0.45 + Math.sin(a) * r * 0.55);
    ctx.rotate(a + Math.PI / 2);
    ellipse(ctx, 0, -r * 0.32, r * 0.1, r * 0.34);
    fillStroke(ctx, i % 2 ? '#ffd23c' : '#e63946', 1.5);
    ctx.restore();
  }
  feet(ctx, r, '#6b4226', 0.4);
}
