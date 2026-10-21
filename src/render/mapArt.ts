import type { MapDef, Obstacle, MapTheme } from '../game/maps';
import { WORLD_H, WORLD_W } from '../game/maps';
import type { Path } from '../game/path';
import { shade, rgba } from '../core/math';
import { makeCanvas, ellipse, circle, fillStroke, ballGrad, gloss, seeded, star, type Ctx } from './draw';
import { mapArt } from './art';
import type { LoadedSprite } from '../assets/sprites';

/** Extra terrain rendered around the playfield so letterboxing still shows the map. */
export const BLEED = 260;

/**
 * Vertical bleed of the painted maps (world units above and below the world). Larger than BLEED: tall
 * screens with the HUD sidebar (4:3 tablets) show ~275 units of terrain above and below the playfield.
 */
export const BLEED_Y = 300;

/** Depth pass strength per map (0..1): the darker paintings get less. */
export const MAP_DEPTH: Partial<Record<string, number>> = { caverns: 0.3, forge: 0.3 };
export const DEPTH_DEFAULT = 0.6;
export function mapDepth(mapId: string): number {
  return MAP_DEPTH[mapId] ?? DEPTH_DEFAULT;
}

export interface ThemePalette {
  ground: string;
  ground2: string;
  path: string;
  pathEdge: string;
  pathInner: string;
  pebble: string;
  tuft: string;
  backdrop: string;
}

export const THEMES: Record<MapTheme, ThemePalette> = {
  meadow: { ground: '#7cc95a', ground2: '#69b84b', path: '#e3c48f', pathEdge: '#9b7a4c', pathInner: '#efd6a6', pebble: '#c2a06c', tuft: '#4f9a37', backdrop: '#4f8f3a' },
  cave: { ground: '#4a4f7a', ground2: '#3d4169', path: '#8d86a8', pathEdge: '#2b2c4a', pathInner: '#a39cbf', pebble: '#6e688c', tuft: '#6f7cc4', backdrop: '#262842' },
  lava: { ground: '#5a4a48', ground2: '#4b3d3c', path: '#a58a73', pathEdge: '#3a2826', pathInner: '#b99c84', pebble: '#7d6655', tuft: '#ff7a3c', backdrop: '#2e2120' },
  river: { ground: '#86cf6a', ground2: '#74bf59', path: '#d9c39a', pathEdge: '#94784f', pathInner: '#e8d5b0', pebble: '#bba174', tuft: '#56a43e', backdrop: '#4a8a3b' },
  snow: { ground: '#eef6ff', ground2: '#d9e9fa', path: '#b9cbe3', pathEdge: '#6f86ab', pathInner: '#cddbef', pebble: '#93a8c8', tuft: '#a8c6e8', backdrop: '#9db8d9' },
  candy: { ground: '#ffd3ea', ground2: '#ffc0df', path: '#fff1c9', pathEdge: '#d98bb8', pathInner: '#fff8e3', pebble: '#ffb3d1', tuft: '#ff8fc7', backdrop: '#e07fb0' },
};

/**
 * Render the static map (ground, track, obstacles, decorations) to an offscreen canvas.
 * The canvas covers [-BLEED, W+BLEED] x [-BLEED, H+BLEED] in world units at `res` pixels/unit.
 */
export function renderMap(map: MapDef, paths: Path[], res: number): HTMLCanvasElement {
  const W = WORLD_W + BLEED * 2;
  const H = WORLD_H + BLEED * 2;
  const [c, ctx] = makeCanvas(W * res, H * res);
  ctx.scale(res, res);
  ctx.translate(BLEED, BLEED);
  const pal = THEMES[map.theme];
  const rnd = seeded(map.seed * 7919);

  // --- ground ---
  ctx.fillStyle = pal.ground;
  ctx.fillRect(-BLEED, -BLEED, W, H);
  // big soft patches
  for (let i = 0; i < 70; i++) {
    const x = -BLEED + rnd() * W;
    const y = -BLEED + rnd() * H;
    const r = 60 + rnd() * 160;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const col = rnd() > 0.5 ? pal.ground2 : shade(pal.ground, 0.08);
    g.addColorStop(0, rgba(col, 0.55));
    g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  themeGround(ctx, map.theme, pal, rnd, W, H);

  // --- track ---
  const pw = map.pathWidth;
  for (const p of paths) strokePath(ctx, p, pw + 14, 'rgba(0,0,0,0.18)', 6);
  for (const p of paths) strokePath(ctx, p, pw + 8, pal.pathEdge);
  for (const p of paths) strokePath(ctx, p, pw, pal.path);
  for (const p of paths) strokePath(ctx, p, pw * 0.55, rgba(pal.pathInner, 0.6));
  if (map.theme === 'candy') {
    for (const p of paths) {
      ctx.save();
      ctx.setLineDash([14, 14]);
      strokePath(ctx, p, pw + 8, rgba('#ffffff', 0.85));
      ctx.restore();
      strokePath(ctx, p, pw - 4, pal.path);
      strokePath(ctx, p, pw * 0.55, rgba(pal.pathInner, 0.7));
    }
  }
  if (map.theme === 'snow') {
    // footprints
    for (const p of paths) {
      for (let d = 10; d < p.length; d += 26) {
        const pt = { x: 0, y: 0 };
        const ang = p.sample(d, pt);
        const side = (Math.floor(d / 26) % 2 ? 1 : -1) * 6;
        ellipse(ctx, pt.x - Math.sin(ang) * side, pt.y + Math.cos(ang) * side, 3.5, 2.2, ang);
        ctx.fillStyle = rgba('#8aa2c6', 0.35);
        ctx.fill();
      }
    }
  }
  // pebbles & tracks on the path
  for (const p of paths) {
    for (let d = 0; d < p.length; d += 9) {
      if (rnd() > 0.55) continue;
      const pt = { x: 0, y: 0 };
      const ang = p.sample(d, pt);
      const off = (rnd() - 0.5) * pw * 0.85;
      const x = pt.x - Math.sin(ang) * off;
      const y = pt.y + Math.cos(ang) * off;
      ellipse(ctx, x, y, 1.5 + rnd() * 2.5, 1 + rnd() * 1.8, rnd() * 3);
      ctx.fillStyle = rgba(rnd() > 0.5 ? pal.pebble : pal.pathEdge, 0.35 + rnd() * 0.3);
      ctx.fill();
    }
  }
  // edge tufts overhanging the path
  for (const p of paths) {
    for (let d = 0; d < p.length; d += 14) {
      const pt = { x: 0, y: 0 };
      const ang = p.sample(d, pt);
      for (const side of [-1, 1]) {
        if (rnd() > 0.5) continue;
        const off = side * (pw / 2 + 2 + rnd() * 3);
        const x = pt.x - Math.sin(ang) * off;
        const y = pt.y + Math.cos(ang) * off;
        tuft(ctx, x, y, 4 + rnd() * 4, pal.tuft, rnd);
      }
    }
  }

  // --- entrance & exit ---
  for (const p of paths) {
    const a = { x: 0, y: 0 };
    const angA = p.sample(30, a);
    const b = { x: 0, y: 0 };
    const angB = p.sample(p.length - 30, b);
    portal(ctx, a.x, a.y, angA, map.theme, false, pw);
    portal(ctx, b.x, b.y, angB, map.theme, true, pw);
  }

  // --- obstacles (sorted by y for depth) ---
  const obs = [...map.obstacles].sort((o1, o2) => o1.y - o2.y);
  for (const o of obs) drawObstacle(ctx, o, map.theme, rnd);

  // --- small decorations (non-blocking) ---
  decorations(ctx, map, paths, pal, rnd);

  // vignette in the bleed zone
  const vg = ctx.createLinearGradient(-BLEED, 0, 0, 0);
  vg.addColorStop(0, 'rgba(0,0,0,0.45)');
  vg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = vg;
  ctx.fillRect(-BLEED, -BLEED, BLEED, H);
  const vg2 = ctx.createLinearGradient(WORLD_W + BLEED, 0, WORLD_W, 0);
  vg2.addColorStop(0, 'rgba(0,0,0,0.45)');
  vg2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = vg2;
  ctx.fillRect(WORLD_W, -BLEED, BLEED, H);
  const vg3 = ctx.createLinearGradient(0, -BLEED, 0, 0);
  vg3.addColorStop(0, 'rgba(0,0,0,0.45)');
  vg3.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = vg3;
  ctx.fillRect(-BLEED, -BLEED, W, BLEED);
  const vg4 = ctx.createLinearGradient(0, WORLD_H + BLEED, 0, WORLD_H);
  vg4.addColorStop(0, 'rgba(0,0,0,0.45)');
  vg4.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = vg4;
  ctx.fillRect(-BLEED, WORLD_H, W, BLEED);
  return c;
}

function strokePath(ctx: Ctx, p: Path, w: number, color: string, offsetY = 0) {
  ctx.beginPath();
  ctx.moveTo(p.xs[0], p.ys[0] + offsetY);
  for (let i = 1; i < p.count; i++) ctx.lineTo(p.xs[i], p.ys[i] + offsetY);
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}

function tuft(ctx: Ctx, x: number, y: number, s: number, color: string, rnd: () => number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i - 1) * 0.5 + (rnd() - 0.5) * 0.3;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
  }
  ctx.stroke();
}

function themeGround(ctx: Ctx, theme: MapTheme, pal: ThemePalette, rnd: () => number, W: number, H: number) {
  const n = 1400;
  for (let i = 0; i < n; i++) {
    const x = -BLEED + rnd() * W;
    const y = -BLEED + rnd() * H;
    if (theme === 'meadow' || theme === 'river') {
      tuft(ctx, x, y, 3 + rnd() * 5, rgba(pal.tuft, 0.6 + rnd() * 0.3), rnd);
    } else if (theme === 'cave') {
      ellipse(ctx, x, y, 2 + rnd() * 6, 1.5 + rnd() * 4, rnd() * 3);
      ctx.fillStyle = rgba(rnd() > 0.5 ? '#2f3358' : '#5b6194', 0.4);
      ctx.fill();
    } else if (theme === 'snow') {
      if (i % 3 === 0) {
        ellipse(ctx, x, y, 6 + rnd() * 14, 2 + rnd() * 4, 0);
        ctx.fillStyle = rgba('#ffffff', 0.7);
        ctx.fill();
        ellipse(ctx, x, y + 2, 6 + rnd() * 12, 1.5, 0);
        ctx.fillStyle = rgba('#a8c6e8', 0.35);
        ctx.fill();
      } else {
        circle(ctx, x, y, 0.8 + rnd() * 1.2);
        ctx.fillStyle = rgba('#ffffff', 0.9);
        ctx.fill();
      }
    } else if (theme === 'candy') {
      // sprinkles
      const cols = ['#ff4d6d', '#ffd23c', '#5ddc6a', '#4cc9ff', '#c77dff', '#ffffff'];
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rnd() * Math.PI);
      ctx.fillStyle = rgba(cols[Math.floor(rnd() * cols.length)], 0.75);
      ctx.fillRect(-3, -1, 6, 2.2);
      ctx.restore();
    } else {
      ellipse(ctx, x, y, 2 + rnd() * 5, 1.5 + rnd() * 3, rnd() * 3);
      ctx.fillStyle = rgba(rnd() > 0.85 ? '#ff6a2a' : '#2e2322', 0.35);
      ctx.fill();
    }
  }
  if (theme === 'meadow' || theme === 'river') {
    // flowers
    const cols = ['#ffffff', '#ffe066', '#ff8fab', '#a0c4ff', '#ffadad'];
    for (let i = 0; i < 260; i++) {
      const x = -BLEED + rnd() * W;
      const y = -BLEED + rnd() * H;
      const c = cols[Math.floor(rnd() * cols.length)];
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        circle(ctx, x + Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, 1.8);
        ctx.fillStyle = c;
        ctx.fill();
      }
      circle(ctx, x, y, 1.4);
      ctx.fillStyle = '#ffb703';
      ctx.fill();
    }
  }
  if (theme === 'cave') {
    // glowing veins
    for (let i = 0; i < 40; i++) {
      let x = -BLEED + rnd() * W;
      let y = -BLEED + rnd() * H;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rnd() - 0.5) * 60;
        y += (rnd() - 0.5) * 60;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba('#8fd3ff', 0.18);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
  if (theme === 'lava') {
    // cracks with glow
    for (let i = 0; i < 60; i++) {
      let x = -BLEED + rnd() * W;
      let y = -BLEED + rnd() * H;
      ctx.beginPath();
      ctx.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (rnd() - 0.5) * 50;
        y += (rnd() - 0.5) * 50;
        ctx.lineTo(x, y);
      }
      ctx.strokeStyle = rgba('#ff7a2f', 0.35);
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.strokeStyle = rgba('#ffd166', 0.4);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }
}

function portal(ctx: Ctx, x: number, y: number, ang: number, theme: MapTheme, exit: boolean, pw: number) {
  // only draw if on-screen
  if (x < -20 || x > WORLD_W + 20 || y < -20 || y > WORLD_H + 20) {
    // clamp to edge so a gate is visible at the screen border
    x = Math.max(8, Math.min(WORLD_W - 8, x));
    y = Math.max(8, Math.min(WORLD_H - 8, y));
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang + Math.PI / 2);
  const w = pw * 0.75;
  if (exit) {
    // Golden acorn vault the gloops are after
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    ellipse(ctx, 0, 0, w * 0.9, w * 0.55);
    ctx.fillStyle = 'rgba(20,10,30,0.55)';
    ctx.fill();
    ellipse(ctx, 0, -2, w * 0.75, w * 0.45);
    const g = ctx.createRadialGradient(0, -2, 1, 0, -2, w * 0.75);
    g.addColorStop(0, theme === 'lava' ? '#ffb347' : '#fff3a8');
    g.addColorStop(1, theme === 'lava' ? '#d7263d' : '#e0a100');
    fillStroke(ctx, g, 3);
    star(ctx, 0, -2, w * 0.3, 0.5);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fill();
  } else {
    // spawn burrow
    ellipse(ctx, 0, 0, w, w * 0.6);
    fillStroke(ctx, theme === 'cave' ? '#1a1a30' : theme === 'lava' ? '#2a1010' : '#3b2a1a', 3, '#1a1022');
    ellipse(ctx, 0, 2, w * 0.7, w * 0.38);
    ctx.fillStyle = theme === 'lava' ? 'rgba(255,90,30,0.5)' : 'rgba(120,60,200,0.35)';
    ctx.fill();
  }
  ctx.restore();
}

function drawObstacle(ctx: Ctx, o: Obstacle, theme: MapTheme, rnd: () => number) {
  switch (o.kind) {
    case 'tree': {
      ellipse(ctx, o.x + 6, o.y + o.r * 0.55, o.r * 0.95, o.r * 0.4);
      ctx.fillStyle = 'rgba(20,30,10,0.3)';
      ctx.fill();
      ctx.fillStyle = '#7a4a28';
      ctx.fillRect(o.x - o.r * 0.12, o.y - o.r * 0.1, o.r * 0.24, o.r * 0.6);
      const blobs: [number, number, number][] = [
        [-0.45, -0.1, 0.55],
        [0.45, -0.05, 0.55],
        [0, -0.45, 0.62],
        [0, 0.05, 0.6],
      ];
      for (const [bx, by, br] of blobs) {
        circle(ctx, o.x + bx * o.r, o.y + by * o.r - o.r * 0.35, br * o.r);
        fillStroke(ctx, ballGrad(ctx, o.x + bx * o.r, o.y + by * o.r - o.r * 0.35, br * o.r, '#3f9a3a', 0.35, -0.35), 3, '#1f4d1d');
      }
      for (const [bx, by, br] of blobs) {
        circle(ctx, o.x + bx * o.r, o.y + by * o.r - o.r * 0.35, br * o.r - 2);
        ctx.fillStyle = ballGrad(ctx, o.x + bx * o.r, o.y + by * o.r - o.r * 0.35, br * o.r, '#3f9a3a', 0.35, -0.35);
        ctx.fill();
      }
      // apples / blossoms
      for (let i = 0; i < 5; i++) {
        circle(ctx, o.x + (rnd() - 0.5) * o.r * 1.4, o.y - o.r * 0.4 + (rnd() - 0.5) * o.r, 2.5);
        ctx.fillStyle = rnd() > 0.5 ? '#ff6b6b' : '#ffe066';
        ctx.fill();
      }
      gloss(ctx, o.x - o.r * 0.3, o.y - o.r * 0.95, o.r * 0.25, o.r * 0.12, 0.25);
      break;
    }
    case 'rock':
    case 'boulder': {
      ellipse(ctx, o.x + 4, o.y + o.r * 0.45, o.r * 1.05, o.r * 0.45);
      ctx.fillStyle = 'rgba(10,10,20,0.3)';
      ctx.fill();
      ctx.beginPath();
      const n = 8;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        const rr = o.r * (0.85 + rnd() * 0.2);
        const px = o.x + Math.cos(a) * rr;
        const py = o.y + Math.sin(a) * rr * 0.8;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      const col = theme === 'cave' ? '#6b6f9a' : theme === 'lava' ? '#5d4b48' : '#9aa0a6';
      fillStroke(ctx, ballGrad(ctx, o.x, o.y, o.r, col, 0.35, -0.4), 3, '#2a2433');
      gloss(ctx, o.x - o.r * 0.3, o.y - o.r * 0.35, o.r * 0.3, o.r * 0.12, 0.35);
      break;
    }
    case 'bush': {
      for (const [bx, by, br] of [[-0.45, 0.1, 0.6], [0.45, 0.1, 0.6], [0, -0.25, 0.7]] as [number, number, number][]) {
        circle(ctx, o.x + bx * o.r, o.y + by * o.r, br * o.r);
        fillStroke(ctx, ballGrad(ctx, o.x + bx * o.r, o.y + by * o.r, br * o.r, '#4caf50', 0.3), 2.5, '#1f4d1d');
      }
      for (let i = 0; i < 3; i++) {
        circle(ctx, o.x + (rnd() - 0.5) * o.r, o.y + (rnd() - 0.5) * o.r * 0.6, 2.2);
        ctx.fillStyle = '#ff6b9a';
        ctx.fill();
      }
      break;
    }
    case 'stump': {
      ellipse(ctx, o.x, o.y + o.r * 0.3, o.r, o.r * 0.55);
      fillStroke(ctx, '#7a4a28', 2.5);
      ellipse(ctx, o.x, o.y, o.r, o.r * 0.55);
      fillStroke(ctx, '#d1a26b', 2.5);
      ellipse(ctx, o.x, o.y, o.r * 0.55, o.r * 0.3);
      ctx.strokeStyle = '#a77b4a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }
    case 'mushroom': {
      ctx.fillStyle = '#f1e3c8';
      ctx.fillRect(o.x - o.r * 0.25, o.y - o.r * 0.2, o.r * 0.5, o.r * 0.8);
      ctx.beginPath();
      ctx.ellipse(o.x, o.y - o.r * 0.2, o.r, o.r * 0.7, 0, Math.PI, 0);
      ctx.closePath();
      fillStroke(ctx, theme === 'cave' ? '#7bdff2' : '#e63946', 2.5);
      for (const dx of [-0.45, 0.1, 0.5]) {
        circle(ctx, o.x + dx * o.r, o.y - o.r * 0.5, o.r * 0.15);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      break;
    }
    case 'pond':
    case 'water': {
      ellipse(ctx, o.x, o.y, o.r + 6, (o.ry ?? o.r) + 6, o.rot ?? 0);
      ctx.fillStyle = theme === 'river' ? '#c9b48a' : '#a58a63';
      ctx.fill();
      ellipse(ctx, o.x, o.y, o.r, o.ry ?? o.r, o.rot ?? 0);
      const g = ctx.createLinearGradient(o.x, o.y - (o.ry ?? o.r), o.x, o.y + (o.ry ?? o.r));
      g.addColorStop(0, '#5ec8f2');
      g.addColorStop(1, '#2d7fd1');
      fillStroke(ctx, g, 3, '#1d4f8a');
      ellipse(ctx, o.x, o.y + 3, o.r * 0.85, (o.ry ?? o.r) * 0.75, o.rot ?? 0);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 3;
      ctx.stroke();
      // lily pads
      const pads = Math.max(2, Math.floor(o.r / 40));
      for (let i = 0; i < pads; i++) {
        const px = o.x + (rnd() - 0.5) * o.r * 1.2;
        const py = o.y + (rnd() - 0.5) * (o.ry ?? o.r) * 1.0;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.arc(px, py, 9, 0.4, Math.PI * 2 - 0.1);
        ctx.closePath();
        fillStroke(ctx, '#4caf50', 1.5, '#1f4d1d');
      }
      break;
    }
    case 'crystal': {
      ellipse(ctx, o.x, o.y + o.r * 0.4, o.r * 1.1, o.r * 0.45);
      ctx.fillStyle = 'rgba(10,10,30,0.35)';
      ctx.fill();
      const cols = ['#7bdff2', '#c77dff', '#ff8fab'];
      const col = cols[Math.floor(rnd() * cols.length)];
      const shards: [number, number, number, number][] = [
        [-0.45, 0.15, 0.25, 1.0],
        [0.4, 0.15, 0.22, 0.9],
        [0, 0.2, 0.3, 1.4],
        [-0.15, 0.3, 0.2, 0.7],
        [0.25, 0.3, 0.18, 0.6],
      ];
      for (const [sx, sy, sw, sh] of shards) {
        const bx = o.x + sx * o.r;
        const by = o.y + sy * o.r;
        ctx.beginPath();
        ctx.moveTo(bx - sw * o.r, by);
        ctx.lineTo(bx - sw * o.r * 0.6, by - sh * o.r * 0.8);
        ctx.lineTo(bx, by - sh * o.r);
        ctx.lineTo(bx + sw * o.r * 0.6, by - sh * o.r * 0.8);
        ctx.lineTo(bx + sw * o.r, by);
        ctx.closePath();
        const g = ctx.createLinearGradient(bx - sw * o.r, by - sh * o.r, bx + sw * o.r, by);
        g.addColorStop(0, shade(col, 0.6));
        g.addColorStop(0.5, col);
        g.addColorStop(1, shade(col, -0.4));
        fillStroke(ctx, g, 2.5, '#1d1d3a');
        ctx.beginPath();
        ctx.moveTo(bx, by - sh * o.r);
        ctx.lineTo(bx, by);
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      // glow
      const g = ctx.createRadialGradient(o.x, o.y - o.r * 0.4, 0, o.x, o.y - o.r * 0.4, o.r * 2);
      g.addColorStop(0, rgba(col, 0.25));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.fillRect(o.x - o.r * 2, o.y - o.r * 2.4, o.r * 4, o.r * 4);
      break;
    }
    case 'pit': {
      ellipse(ctx, o.x, o.y, o.r + 8, o.r * 0.75 + 8);
      ctx.fillStyle = '#2b2c4a';
      ctx.fill();
      ellipse(ctx, o.x, o.y, o.r, o.r * 0.75);
      const g = ctx.createRadialGradient(o.x, o.y + o.r * 0.2, 0, o.x, o.y, o.r);
      g.addColorStop(0, '#05040c');
      g.addColorStop(0.7, '#12112a');
      g.addColorStop(1, '#2f2f55');
      fillStroke(ctx, g, 3, '#1a1a30');
      for (let i = 0; i < 6; i++) {
        circle(ctx, o.x + (rnd() - 0.5) * o.r, o.y + (rnd() - 0.5) * o.r * 0.5, 1.5);
        ctx.fillStyle = 'rgba(200,220,255,0.6)';
        ctx.fill();
      }
      break;
    }
    case 'lava': {
      ellipse(ctx, o.x, o.y, o.r + 10, (o.ry ?? o.r) + 10, o.rot ?? 0);
      ctx.fillStyle = '#2a1b1a';
      ctx.fill();
      ellipse(ctx, o.x, o.y, o.r, o.ry ?? o.r, o.rot ?? 0);
      const g = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, o.r);
      g.addColorStop(0, '#ffe066');
      g.addColorStop(0.4, '#ff9f1c');
      g.addColorStop(1, '#d7263d');
      fillStroke(ctx, g, 4, '#5a1414');
      for (let i = 0; i < 10; i++) {
        const px = o.x + (rnd() - 0.5) * o.r * 1.3;
        const py = o.y + (rnd() - 0.5) * (o.ry ?? o.r) * 1.1;
        ellipse(ctx, px, py, 8 + rnd() * 14, 4 + rnd() * 6, rnd() * 3);
        ctx.fillStyle = 'rgba(120,20,20,0.45)';
        ctx.fill();
      }
      break;
    }
    case 'pine': {
      ellipse(ctx, o.x + 5, o.y + o.r * 0.6, o.r * 0.85, o.r * 0.32);
      ctx.fillStyle = 'rgba(40,60,90,0.25)';
      ctx.fill();
      ctx.fillStyle = '#6b4226';
      ctx.fillRect(o.x - o.r * 0.1, o.y + o.r * 0.1, o.r * 0.2, o.r * 0.45);
      for (let i = 0; i < 3; i++) {
        const w = o.r * (1 - i * 0.22);
        const y = o.y + o.r * 0.2 - i * o.r * 0.5;
        ctx.beginPath();
        ctx.moveTo(o.x - w, y);
        ctx.lineTo(o.x, y - o.r * 0.8);
        ctx.lineTo(o.x + w, y);
        ctx.closePath();
        fillStroke(ctx, ballGrad(ctx, o.x - w * 0.3, y - o.r * 0.4, w, '#2e7d4f', 0.25, -0.35), 2.5, '#123d27');
        // snow cap
        ctx.beginPath();
        ctx.moveTo(o.x - w * 0.45, y - o.r * 0.45);
        ctx.lineTo(o.x, y - o.r * 0.8);
        ctx.lineTo(o.x + w * 0.45, y - o.r * 0.45);
        ctx.quadraticCurveTo(o.x, y - o.r * 0.35, o.x - w * 0.45, y - o.r * 0.45);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      break;
    }
    case 'snowman': {
      ellipse(ctx, o.x + 4, o.y + o.r * 0.9, o.r * 0.9, o.r * 0.3);
      ctx.fillStyle = 'rgba(40,60,90,0.25)';
      ctx.fill();
      circle(ctx, o.x, o.y + o.r * 0.35, o.r * 0.7);
      fillStroke(ctx, ballGrad(ctx, o.x, o.y + o.r * 0.35, o.r * 0.7, '#ffffff', 0, -0.15), 2.5, '#6f86ab');
      circle(ctx, o.x, o.y - o.r * 0.5, o.r * 0.48);
      fillStroke(ctx, ballGrad(ctx, o.x, o.y - o.r * 0.5, o.r * 0.48, '#ffffff', 0, -0.15), 2.5, '#6f86ab');
      ctx.beginPath();
      ctx.moveTo(o.x + 2, o.y - o.r * 0.48);
      ctx.lineTo(o.x + o.r * 0.45, o.y - o.r * 0.42);
      ctx.lineTo(o.x + 2, o.y - o.r * 0.36);
      ctx.fillStyle = '#ff8c42';
      ctx.fill();
      for (const dx of [-0.16, 0.12]) {
        circle(ctx, o.x + dx * o.r, o.y - o.r * 0.6, 2);
        ctx.fillStyle = '#2a1b2e';
        ctx.fill();
      }
      ctx.fillStyle = '#e63946';
      ctx.fillRect(o.x - o.r * 0.45, o.y - o.r * 0.18, o.r * 0.9, o.r * 0.16);
      ctx.fillStyle = '#2a1b2e';
      ctx.fillRect(o.x - o.r * 0.32, o.y - o.r * 1.2, o.r * 0.64, o.r * 0.32);
      ctx.fillRect(o.x - o.r * 0.48, o.y - o.r * 0.92, o.r * 0.96, o.r * 0.08);
      break;
    }
    case 'ice': {
      ellipse(ctx, o.x, o.y, o.r + 8, (o.ry ?? o.r) + 8, o.rot ?? 0);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ellipse(ctx, o.x, o.y, o.r, o.ry ?? o.r, o.rot ?? 0);
      const g = ctx.createLinearGradient(o.x - o.r, o.y - (o.ry ?? o.r), o.x + o.r, o.y + (o.ry ?? o.r));
      g.addColorStop(0, '#d8f3ff');
      g.addColorStop(0.5, '#9fd8f5');
      g.addColorStop(1, '#6fb7e6');
      fillStroke(ctx, g, 3, '#5b8fc2');
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const sx = o.x + (rnd() - 0.5) * o.r;
        const sy = o.y + (rnd() - 0.5) * (o.ry ?? o.r) * 0.8;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 18 + rnd() * 20, sy - 6 - rnd() * 10);
        ctx.stroke();
      }
      break;
    }
    case 'choco': {
      ellipse(ctx, o.x, o.y, o.r + 10, (o.ry ?? o.r) + 10, o.rot ?? 0);
      ctx.fillStyle = '#f7b5d5';
      ctx.fill();
      ellipse(ctx, o.x, o.y, o.r, o.ry ?? o.r, o.rot ?? 0);
      const g = ctx.createLinearGradient(o.x, o.y - (o.ry ?? o.r), o.x, o.y + (o.ry ?? o.r));
      g.addColorStop(0, '#9c5b34');
      g.addColorStop(1, '#5a2f17');
      fillStroke(ctx, g, 4, '#3b1d0c');
      ellipse(ctx, o.x - o.r * 0.2, o.y - (o.ry ?? o.r) * 0.3, o.r * 0.5, (o.ry ?? o.r) * 0.18, o.rot ?? 0);
      ctx.fillStyle = 'rgba(255,220,190,0.25)';
      ctx.fill();
      // floating marshmallows
      for (let i = 0; i < 4; i++) {
        const mx = o.x + (rnd() - 0.5) * o.r * 1.2;
        const my = o.y + (rnd() - 0.5) * (o.ry ?? o.r) * 0.9;
        ctx.save();
        ctx.translate(mx, my);
        ctx.rotate(rnd() * 3);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#d6c7c7';
        ctx.lineWidth = 1.5;
        ctx.fillRect(-7, -5, 14, 10);
        ctx.strokeRect(-7, -5, 14, 10);
        ctx.restore();
      }
      break;
    }
    case 'lollipop': {
      ellipse(ctx, o.x + 4, o.y + o.r * 1.3, o.r * 0.7, o.r * 0.22);
      ctx.fillStyle = 'rgba(90,20,60,0.25)';
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(o.x - 3, o.y, 6, o.r * 1.3);
      ctx.strokeStyle = '#d6c7c7';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(o.x - 3, o.y, 6, o.r * 1.3);
      circle(ctx, o.x, o.y - o.r * 0.2, o.r);
      fillStroke(ctx, '#ff4d8d', 3, '#7a1440');
      ctx.save();
      circle(ctx, o.x, o.y - o.r * 0.2, o.r - 2);
      ctx.clip();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = o.r * 0.22;
      ctx.beginPath();
      for (let a = 0; a < 18; a += 0.15) {
        const rr = a * o.r * 0.06;
        const px = o.x + Math.cos(a) * rr;
        const py = o.y - o.r * 0.2 + Math.sin(a) * rr;
        if (a === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.restore();
      gloss(ctx, o.x - o.r * 0.35, o.y - o.r * 0.6, o.r * 0.25, o.r * 0.12, 0.6);
      break;
    }
    case 'gumdrop': {
      const cols = ['#ff4d6d', '#5ddc6a', '#ffd23c', '#4cc9ff', '#c77dff'];
      const col = cols[Math.floor(rnd() * cols.length)];
      ellipse(ctx, o.x + 3, o.y + o.r * 0.55, o.r * 1.0, o.r * 0.3);
      ctx.fillStyle = 'rgba(90,20,60,0.25)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(o.x - o.r, o.y + o.r * 0.5);
      ctx.quadraticCurveTo(o.x - o.r, o.y - o.r, o.x, o.y - o.r);
      ctx.quadraticCurveTo(o.x + o.r, o.y - o.r, o.x + o.r, o.y + o.r * 0.5);
      ctx.closePath();
      fillStroke(ctx, ballGrad(ctx, o.x, o.y - o.r * 0.2, o.r, col, 0.45), 3, '#3a1030');
      for (let i = 0; i < 6; i++) {
        circle(ctx, o.x + (rnd() - 0.5) * o.r * 1.4, o.y - rnd() * o.r * 0.8, 1.6);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.fill();
      }
      break;
    }
    case 'cupcake': {
      ellipse(ctx, o.x + 4, o.y + o.r * 0.75, o.r * 0.9, o.r * 0.28);
      ctx.fillStyle = 'rgba(90,20,60,0.25)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(o.x - o.r * 0.75, o.y);
      ctx.lineTo(o.x + o.r * 0.75, o.y);
      ctx.lineTo(o.x + o.r * 0.55, o.y + o.r * 0.75);
      ctx.lineTo(o.x - o.r * 0.55, o.y + o.r * 0.75);
      ctx.closePath();
      fillStroke(ctx, '#4cc9ff', 2.5, '#123d6b');
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(o.x + i * o.r * 0.28, o.y);
        ctx.lineTo(o.x + i * o.r * 0.22, o.y + o.r * 0.75);
        ctx.strokeStyle = 'rgba(255,255,255,0.5)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      for (const [dx, dy, rr] of [[-0.45, -0.05, 0.42], [0.45, -0.05, 0.42], [0, -0.35, 0.5], [0, 0.0, 0.45]] as [number, number, number][]) {
        circle(ctx, o.x + dx * o.r, o.y + dy * o.r, rr * o.r);
        fillStroke(ctx, ballGrad(ctx, o.x + dx * o.r, o.y + dy * o.r, rr * o.r, '#ffc2e2', 0.4), 2.5, '#a3245c');
      }
      circle(ctx, o.x, o.y - o.r * 0.85, o.r * 0.18);
      fillStroke(ctx, '#e63946', 2, '#7a1430');
      break;
    }
    case 'vent': {
      ellipse(ctx, o.x, o.y, o.r, o.r * 0.6);
      fillStroke(ctx, ballGrad(ctx, o.x, o.y, o.r, '#5d4b48', 0.3), 3, '#2a1b1a');
      ellipse(ctx, o.x, o.y - 2, o.r * 0.5, o.r * 0.28);
      ctx.fillStyle = '#ff7a2f';
      ctx.fill();
      break;
    }
  }
}

function decorations(ctx: Ctx, map: MapDef, paths: Path[], pal: ThemePalette, rnd: () => number) {
  const nearPath = (x: number, y: number) => paths.some((p) => p.distanceTo(x, y) < map.pathWidth / 2 + 14);
  const nearObs = (x: number, y: number) => map.obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + Math.max(o.ry ?? 0, 0) + 10);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * WORLD_W;
    const y = rnd() * WORLD_H;
    if (nearPath(x, y) || nearObs(x, y)) continue;
    const k = rnd();
    if (map.theme === 'meadow' || map.theme === 'river') {
      if (k < 0.5) {
        // tiny pebble
        ellipse(ctx, x, y, 3 + rnd() * 3, 2 + rnd() * 2);
        fillStroke(ctx, '#b9bfc4', 1.2, '#6d7378');
      } else {
        // clover cluster
        for (let j = 0; j < 3; j++) {
          circle(ctx, x + (j - 1) * 4, y + (j % 2) * 3, 3);
          ctx.fillStyle = rgba(pal.tuft, 0.9);
          ctx.fill();
        }
      }
    } else if (map.theme === 'snow') {
      ellipse(ctx, x, y, 5 + rnd() * 4, 3 + rnd() * 2);
      fillStroke(ctx, '#ffffff', 1.2, '#a8c6e8');
    } else if (map.theme === 'candy') {
      circle(ctx, x, y, 3 + rnd() * 2);
      fillStroke(ctx, ['#ff4d6d', '#ffd23c', '#5ddc6a', '#4cc9ff'][Math.floor(rnd() * 4)], 1.2, '#7a1440');
    } else if (map.theme === 'cave') {
      star(ctx, x, y, 2 + rnd() * 2.5, 0.35, 4);
      ctx.fillStyle = rgba('#bde0fe', 0.6);
      ctx.fill();
    } else {
      circle(ctx, x, y, 2 + rnd() * 2);
      ctx.fillStyle = rgba('#ffb347', 0.5);
      ctx.fill();
    }
  }
}

export interface PaintedMapOpts {
  /** extended painting (mx_<map>, see SpriteInfo.wy): real terrain above and below the world */
  ext?: LoadedSprite | null;
  /** depth pass strength 0..1 (0 = off) */
  depth?: number;
  /** visible world rect: the depth vignette is centred on it */
  view?: { x0: number; y0: number; x1: number; y1: number };
}

/**
 * Painted background (art/raw/m_<map>.webp) prerendered at `res` px per world unit, covering
 * [-BLEED, W+BLEED] x [-BLEED_Y, H+BLEED_Y]. The playfield shows the painting 1:1 over the 1600x900
 * world; the letterbox bleed around it is a mirrored, blurred and darkened copy so wide or tall screens
 * never show a hard edge. With the extended painting (opts.ext) the terrain above and below the world is
 * real painted ground instead, only lightly darkened, joining the world without a seam and fading softly
 * into the blurred mirror beyond its outer rows; the mirror (left / right and corners) is then built
 * from the extended painting so it continues the painted bands. A gentle
 * vignette keeps the eye on the track; the depth pass (opts.depth) is baked in last.
 */
export function renderPaintedMap(img: CanvasImageSource, iw: number, ih: number, res: number, opts: PaintedMapOpts = {}): HTMLCanvasElement {
  const W = WORLD_W + BLEED * 2;
  const H = WORLD_H + BLEED_Y * 2;
  const [c, ctx] = makeCanvas(W * res, H * res);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // world units from here on
  ctx.setTransform(res, 0, 0, res, BLEED * res, BLEED_Y * res);

  // source painting and the world rows it covers: the plain painting is exactly the world, the
  // extended one adds bands above and below (cy0 < 0, cy1 > WORLD_H)
  const ext = opts.ext && opts.ext.wy ? opts.ext : null;
  const src: CanvasImageSource = ext ? ext.img : img;
  const sw = ext ? ext.img.naturalWidth || ext.w : iw;
  const sh = ext ? ext.img.naturalHeight || ext.h : ih;
  let cy0 = 0;
  let cy1 = WORLD_H;
  if (ext) {
    const [f0, f1] = ext.wy!;
    const u = WORLD_H / ((f1 - f0) * sh); // world units per source row
    cy0 = -f0 * sh * u;
    cy1 = cy0 + sh * u;
  }
  const ch = cy1 - cy0;

  // --- bleed: 3x3 mirrored tiles at low resolution, upscaled = blurred ---
  const lo = 1 / 14;
  const [b, bctx] = makeCanvas(W * lo, H * lo);
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  for (let ty = -1; ty <= 1; ty++) {
    for (let tx = -1; tx <= 1; tx++) {
      // mirror the neighbours so the painting continues seamlessly across the border
      const mx = tx !== 0 ? -1 : 1;
      const my = ty !== 0 ? -1 : 1;
      const x = BLEED + tx * WORLD_W + (mx < 0 ? WORLD_W : 0);
      const y = BLEED_Y + cy0 + ty * ch + (my < 0 ? ch : 0);
      bctx.setTransform(mx * lo, 0, 0, my * lo, x * lo, y * lo);
      bctx.drawImage(src, 0, 0, sw, sh, 0, 0, WORLD_W, ch);
    }
  }
  // second blur pass
  const [b2, b2ctx] = makeCanvas(b.width / 2, b.height / 2);
  b2ctx.imageSmoothingEnabled = true;
  b2ctx.drawImage(b, 0, 0, b2.width, b2.height);
  ctx.drawImage(b2, -BLEED, -BLEED_Y, W, H);
  b.width = b.height = b2.width = b2.height = 0;
  // darken the bleed, more towards the outside
  ctx.fillStyle = 'rgba(12,8,24,0.42)';
  ctx.fillRect(-BLEED, -BLEED_Y, W, H);
  const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgba(8,5,18,0.55)');
    g.addColorStop(1, 'rgba(8,5,18,0)');
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, rw, rh);
  };
  edge(-BLEED, 0, 0, 0, -BLEED, -BLEED_Y, BLEED, H);
  edge(WORLD_W + BLEED, 0, WORLD_W, 0, WORLD_W, -BLEED_Y, BLEED, H);
  edge(0, -BLEED_Y, 0, 0, -BLEED, -BLEED_Y, W, BLEED_Y);
  edge(0, WORLD_H + BLEED_Y, 0, WORLD_H, -BLEED, WORLD_H, W, BLEED_Y);

  // --- the painting ---
  // the extended painting's outer rows fade into the blurred mirror beyond them
  const FADE = ext ? 28 : 0;
  // soft drop shadow so the playfield (with its painted bands) reads as a board on a dimmed table
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 24 * res;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, cy0 + FADE, WORLD_W, ch - FADE * 2);
  ctx.restore();
  if (!ext) ctx.drawImage(img, 0, 0, iw, ih, 0, 0, WORLD_W, WORLD_H);
  else {
    // one draw for world + bands (no seam at the world edge): the world part of the extended painting
    // is the m_ painting, same width and same pixels
    const k = sh / ch; // source rows per world unit
    ctx.drawImage(src, 0, FADE * k, sw, (ch - FADE * 2) * k, 0, cy0 + FADE, WORLD_W, ch - FADE * 2);
    // outer rows with a fade, overlapping the sharp part a little (same pixels) so no seam can show
    fadedRows(ctx, src, sw, k, cy0, cy0, FADE + 2, res, 'top');
    fadedRows(ctx, src, sw, k, cy0, cy1 - FADE - 2, FADE + 2, res, 'bottom');
    // darken the bands lightly, a little more towards their outer edges
    const band = (y0: number, y1: number) => {
      const g = ctx.createLinearGradient(0, y0, 0, y1);
      g.addColorStop(0, 'rgba(14,8,28,0)');
      g.addColorStop(0.45, 'rgba(14,8,28,0.06)');
      g.addColorStop(1, 'rgba(14,8,28,0.26)');
      ctx.fillStyle = g;
      ctx.fillRect(0, Math.min(y0, y1), WORLD_W, Math.abs(y1 - y0));
    };
    band(0, cy0);
    band(WORLD_H, cy1);
  }

  // --- vignette over the playfield (and over the painted bands, so it runs on across the world edge) ---
  const cx = WORLD_W / 2;
  const cy = WORLD_H / 2;
  const vr = Math.hypot(WORLD_W, WORLD_H) * 0.5;
  const vg = ctx.createRadialGradient(cx, cy, vr * 0.55, cx, cy, vr * 1.02);
  vg.addColorStop(0, 'rgba(20,10,30,0)');
  vg.addColorStop(1, 'rgba(20,10,30,0.22)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, cy0, WORLD_W, ch);

  if (opts.depth) depthPass(c, ctx, opts.depth, res, BLEED_Y, opts.view);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}

/**
 * Rows y .. y+h of the extended painting, fading out towards its outer edge (top / bottom), drawn
 * through a small scratch canvas. `cy0`: world y of the source image's first row, `k`: source rows per
 * world unit.
 */
function fadedRows(ctx: CanvasRenderingContext2D, src: CanvasImageSource, sw: number, k: number, cy0: number, y: number, h: number, res: number, side: 'top' | 'bottom') {
  const [t, tctx] = makeCanvas(WORLD_W * res, h * res);
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(src, 0, (y - cy0) * k, sw, h * k, 0, 0, t.width, t.height);
  tctx.globalCompositeOperation = 'destination-in';
  const g = tctx.createLinearGradient(0, side === 'top' ? 0 : t.height, 0, side === 'top' ? t.height : 0);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1 - 2 / h, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  tctx.fillStyle = g;
  tctx.fillRect(0, 0, t.width, t.height);
  ctx.drawImage(t, 0, y, WORLD_W, h);
  t.width = t.height = 0;
}

/**
 * Depth pass, baked into a prerendered map (canvas covering [-BLEED, W+BLEED] x [-bleedY, H+bleedY]):
 * the background a little less saturated and a touch darker / cooler, plus a vignette around the
 * visible area, so the saturated raccoons and stars read in front of the painting. (Contact shadows
 * get stronger as well, see Renderer.shadowK.)
 */
function depthPass(c: HTMLCanvasElement, ctx: CanvasRenderingContext2D, d: number, res: number, bleedY: number, view?: PaintedMapOpts['view']) {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'saturation';
  ctx.globalAlpha = 0.2 * d;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = d;
  ctx.fillStyle = '#e6e2ee';
  ctx.fillRect(0, 0, c.width, c.height);
  // vignette around the visible area (the world when unknown)
  const v = view ?? { x0: 0, y0: 0, x1: WORLD_W, y1: WORLD_H };
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.setTransform(res, 0, 0, res, BLEED * res, bleedY * res);
  const cx = (v.x0 + v.x1) / 2;
  const cy = (v.y0 + v.y1) / 2;
  const diag = Math.hypot(v.x1 - v.x0, v.y1 - v.y0) / 2;
  const g = ctx.createRadialGradient(cx, cy, diag * 0.42, cx, cy, diag * 1.02);
  g.addColorStop(0, 'rgba(14,8,28,0)');
  g.addColorStop(1, `rgba(14,8,28,${0.5 * d})`);
  ctx.fillStyle = g;
  ctx.fillRect(-BLEED, -bleedY, WORLD_W + BLEED * 2, WORLD_H + bleedY * 2);
  ctx.restore();
}

/** Depth pass on a prerendered procedural map (renderMap output: BLEED on every side). */
export function depthPassProcedural(c: HTMLCanvasElement, d: number, res: number, view?: PaintedMapOpts['view']) {
  const ctx = c.getContext('2d');
  if (ctx && d > 0) depthPass(c, ctx, d, res, BLEED, view);
}

/** Small preview used on the map select cards. */
export function mapThumbnail(map: MapDef, paths: Path[], px = 320): string {
  const art = mapArt(map.id);
  const h = Math.round((px * WORLD_H) / WORLD_W);
  if (art) {
    const [t, tctx] = makeCanvas(px, h);
    tctx.imageSmoothingEnabled = true;
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(art.img, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.85);
  }
  const res = px / WORLD_W;
  const c = renderMap(map, paths, res);
  const [t, tctx] = makeCanvas(px, h);
  tctx.drawImage(c, BLEED * res, BLEED * res, WORLD_W * res, WORLD_H * res, 0, 0, t.width, t.height);
  return t.toDataURL('image/jpeg', 0.85);
}
