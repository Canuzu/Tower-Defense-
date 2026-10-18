// Renders the app icon / splash art. Used by scripts/icons.mjs (not part of the game bundle).
import { gloopSprite } from './render/gloopArt';
import { towerSprite } from './render/towerArt';

const params = new URLSearchParams(location.search);
const size = +(params.get('s') ?? 1024);
const mode = params.get('m') ?? 'icon';
const W = mode === 'splash' ? +(params.get('w') ?? 2732) : size;
const H = mode === 'splash' ? +(params.get('h') ?? 2732) : size;
const c = document.getElementById('c') as HTMLCanvasElement;
c.width = W;
c.height = H;
const ctx = c.getContext('2d')!;

const S = Math.min(W, H);
const cx = W / 2;
const cy = H / 2;
// background
const bg = ctx.createRadialGradient(cx, cy * 0.85, S * 0.05, cx, cy, Math.max(W, H) * 0.75);
bg.addColorStop(0, '#9d7bff');
bg.addColorStop(0.55, '#5a34c9');
bg.addColorStop(1, '#2b1a4b');
ctx.fillStyle = bg;
ctx.fillRect(0, 0, W, H);
// sunburst
ctx.save();
ctx.translate(cx, cy * 0.92);
for (let i = 0; i < 18; i++) {
  ctx.rotate((Math.PI * 2) / 18);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-S * 0.09, -Math.max(W, H));
  ctx.lineTo(S * 0.09, -Math.max(W, H));
  ctx.closePath();
  ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(255,220,120,0.06)';
  ctx.fill();
}
ctx.restore();

const k = mode === 'splash' ? 0.5 : 1;
// splats
const drops: [number, number, number, string][] = [
  [-0.33, -0.25, 0.05, '#ffd23c'],
  [0.34, -0.3, 0.04, '#5ddc6a'],
  [-0.38, 0.12, 0.035, '#4cc9ff'],
  [0.38, 0.05, 0.03, '#ff6fcf'],
];
for (const [dx, dy, r, col] of drops) {
  ctx.beginPath();
  ctx.arc(cx + dx * S * k, cy + dy * S * k, r * S * k, 0, Math.PI * 2);
  ctx.fillStyle = col;
  ctx.fill();
  ctx.lineWidth = S * 0.008 * k;
  ctx.strokeStyle = '#2a1b2e';
  ctx.stroke();
}
// hero gloop
const gs = (S * 0.6 * k) / 26;
const gsp = gloopSprite('red', { camo: false, regrow: false, fortified: false, dmg: 0 }, gs);
ctx.drawImage(gsp.canvas, cx - (gsp.w * gs) / 2 - S * 0.06 * k, cy - (gsp.h * gs) / 2 - S * 0.08 * k, gsp.w * gs, gsp.h * gs);
// hedgehog with a javelin, bottom right
const ts = (S * 0.5 * k) / (20 * 3.6);
const tsp = towerSprite('spike', [0, 3, 2], ts);
ctx.drawImage(tsp.canvas, cx + S * 0.2 * k - (tsp.w * ts) / 2, cy + S * 0.33 * k - tsp.h * ts * (tsp.ay ?? 0.5), tsp.w * ts, tsp.h * ts);

if (mode === 'splash') {
  ctx.font = `800 ${S * 0.09}px "Baloo 2", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = S * 0.018;
  ctx.strokeStyle = '#2a1b2e';
  ctx.fillStyle = '#ffffff';
  const ty = cy + S * 0.36;
  ctx.strokeText('GLOOP GUARDIANS', cx, ty);
  ctx.fillText('GLOOP GUARDIANS', cx, ty);
}
(window as any).__ready = true;
