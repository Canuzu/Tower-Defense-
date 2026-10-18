import { gloopSprite } from './render/gloopArt';
import { towerSprite, type ArtId } from './render/towerArt';
import { GLOOP_ORDER } from './game/gloops';

const c = document.getElementById('c') as HTMLCanvasElement;
const W = 1800;
const H = 2300;
c.width = W;
c.height = H;
const ctx = c.getContext('2d')!;
ctx.fillStyle = '#7ccf6a';
ctx.fillRect(0, 0, W, H);
const res = 2;
const mode = new URLSearchParams(location.search).get('m') ?? 'all';

function put(s: { canvas: HTMLCanvasElement; w: number; h: number; ay?: number }, x: number, y: number, scale = 1) {
  ctx.drawImage(s.canvas, x - (s.w * scale) / 2, y - s.h * scale * (s.ay ?? 0.5), s.w * scale, s.h * scale);
}

let x = 60;
let y = 110;
if (mode === 'all' || mode === 'gloops') {
  for (const id of GLOOP_ORDER) {
    const boss = ['moab', 'bfb', 'zomg', 'ddt', 'bad'].includes(id);
    const sc = boss ? 0.9 : 2;
    put(gloopSprite(id, { camo: false, regrow: false, fortified: false, dmg: 0 }, res * sc), x, y, sc);
    x += boss ? 210 : 90;
    if (x > W - 120) {
      x = 60;
      y += 130;
    }
  }
  x = 60;
  y += 200;
  for (const look of [
    { camo: true, regrow: false, fortified: false, dmg: 0 },
    { camo: false, regrow: true, fortified: false, dmg: 0 },
    { camo: false, regrow: false, fortified: true, dmg: 0 },
    { camo: false, regrow: false, fortified: false, dmg: 2 },
  ]) {
    for (const id of ['green', 'lead', 'ceramic', 'rainbow'] as const) {
      put(gloopSprite(id, look, res * 2), x, y, 2);
      x += 90;
    }
    x += 30;
  }
  y += 130;
}
if (mode === 'all' || mode === 'towers') {
  const ids: ArtId[] = ['spike', 'boomer', 'frost', 'hoot', 'ember', 'zap', 'buzz', 'acorn', 'dojo'];
  const tiers = [[0, 0, 0], [3, 0, 0], [5, 2, 0], [0, 3, 0], [2, 5, 0], [0, 0, 3], [0, 2, 5]];
  x = 80;
  y += 90;
  for (const id of ids) {
    x = 80;
    for (const t of tiers) {
      put(towerSprite(id, t, res * 1.5), x, y, 1.5);
      x += 170;
    }
    y += 165;
  }
  x = 80;
  for (const id of ['nova', 'grizz'] as ArtId[]) {
    for (const l of [1, 10, 20]) {
      put(towerSprite(id, [l], res * 1.5), x, y, 1.5);
      x += 170;
    }
  }
}
(window as any).__ready = true;
