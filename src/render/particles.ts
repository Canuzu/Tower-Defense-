import { makeCanvas } from './draw';
import { parseHex } from '../core/math';

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
}

const MAX = 3200;

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
    this.list.push(p);
    return p;
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

  /** Draw ground-level particles (stains). Context is in world space. */
  drawGround(ctx: CanvasRenderingContext2D) {
    for (const p of this.list) {
      if (!p.ground) continue;
      const t = p.life / p.max;
      ctx.globalAlpha = Math.min(1, t * 2) * 0.55;
      const img = dropSprite(p.color);
      const s = p.size;
      ctx.drawImage(img, p.x - s, p.y - s * 0.6, s * 2, s * 1.2);
    }
    ctx.globalAlpha = 1;
  }

  draw(ctx: CanvasRenderingContext2D, worldToCss: number) {
    const smoke = getSmoke();
    // normal blended first
    for (const p of this.list) {
      if (p.ground) continue;
      const t = p.life / p.max; // 1 -> 0
      switch (p.kind) {
        case PK.Drop: {
          ctx.globalAlpha = Math.min(1, t * 3);
          const s = p.size * (0.5 + t * 0.5);
          ctx.drawImage(dropSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case PK.Smoke: {
          ctx.globalAlpha = t * 0.55;
          const s = p.size + (1 - t) * p.size2;
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
        case PK.Shard: {
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.moveTo(0, -p.size);
          ctx.lineTo(p.size * 0.45, 0);
          ctx.lineTo(0, p.size);
          ctx.lineTo(-p.size * 0.45, 0);
          ctx.closePath();
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.restore();
          break;
        }
        case PK.Confetti: {
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8 * Math.abs(Math.sin(p.rot * 2)) + 1);
          ctx.restore();
          break;
        }
        case PK.Coin: {
          ctx.globalAlpha = Math.min(1, t * 3);
          const sx = Math.abs(Math.cos(p.rot)) * p.size;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, Math.max(0.5, sx), p.size, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#ffd23c';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#b8860b';
          ctx.stroke();
          break;
        }
        case PK.Snow: {
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          break;
        }
        case PK.Bubble: {
          ctx.globalAlpha = Math.min(1, t * 2) * 0.8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.2 - t * 0.4), 0, Math.PI * 2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = 1.5;
          ctx.stroke();
          break;
        }
        default:
          break;
      }
    }
    // additive pass
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.list) {
      if (p.ground) continue;
      const t = p.life / p.max;
      switch (p.kind) {
        case PK.Spark: {
          ctx.globalAlpha = t;
          const s = p.size * (0.4 + t * 0.6);
          ctx.drawImage(glowSprite(p.color), p.x - s, p.y - s, s * 2, s * 2);
          break;
        }
        case PK.Flame: {
          ctx.globalAlpha = t * 0.9;
          const s = p.size * (0.3 + t * 0.9);
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
          ctx.globalAlpha = t;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          const s = p.size * (0.5 + t * 0.5);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          for (let i = 0; i < 8; i++) {
            const r = i % 2 === 0 ? s : s * 0.25;
            const a = (i * Math.PI) / 4;
            if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
            else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
          }
          ctx.closePath();
          ctx.fill();
          ctx.restore();
          break;
        }
        default:
          break;
      }
    }
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
