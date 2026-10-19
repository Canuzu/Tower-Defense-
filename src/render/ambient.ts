/**
 * Subtle ambient life on top of the painted maps: drifting fireflies / pollen, snowfall, rising
 * embers, cave sparkles, candy glitter, water glints, and glow pulses on lava pools and crystals
 * at their obstacle positions. Fixed-size typed-array pools, no allocations per frame.
 */
import type { MapDef, Obstacle } from '../game/maps';
import { WORLD_H, WORLD_W } from '../game/maps';
import { flareSprite, glowSprite, softGlow, PK, type Particles } from './particles';

const enum Mote {
  Firefly,
  Snow,
  Ember,
  Sparkle,
}

interface Theme {
  mote: Mote;
  count: number;
  colors: string[];
}

const THEMES: Record<string, Theme> = {
  meadow: { mote: Mote.Firefly, count: 16, colors: ['#fff4a8', '#ffffff', '#e9ffb0'] },
  river: { mote: Mote.Firefly, count: 16, colors: ['#fff4a8', '#ffffff', '#d8ffd0'] },
  cave: { mote: Mote.Sparkle, count: 26, colors: ['#9be7ff', '#c9a8ff', '#ffffff'] },
  snow: { mote: Mote.Snow, count: 70, colors: ['#ffffff'] },
  lava: { mote: Mote.Ember, count: 34, colors: ['#ffb347', '#ff7a2f', '#ffd166'] },
  candy: { mote: Mote.Sparkle, count: 22, colors: ['#ffffff', '#ffd1ec', '#fff3a8'] },
};

const N = 80;

export class Ambient {
  private theme: Theme | null = null;
  private n = 0;
  private x = new Float32Array(N);
  private y = new Float32Array(N);
  private vx = new Float32Array(N);
  private vy = new Float32Array(N);
  private ph = new Float32Array(N);
  private sz = new Float32Array(N);
  private col = new Uint8Array(N);
  private obstacles: Obstacle[] = [];
  private lava: Obstacle[] = [];
  /** glints on water / ice: x, y, phase */
  private glints: number[] = [];
  private emberAcc = 0;

  setMap(map: MapDef | null) {
    this.obstacles = map ? map.obstacles : [];
    this.lava = this.obstacles.filter((o) => o.kind === 'lava');
    this.theme = map ? THEMES[map.theme] ?? null : null;
    this.n = this.theme ? Math.min(N, this.theme.count) : 0;
    for (let i = 0; i < this.n; i++) this.respawn(i, true);
    this.glints = [];
    for (const o of this.obstacles) {
      if (o.kind !== 'pond' && o.kind !== 'water' && o.kind !== 'ice' && o.kind !== 'choco') continue;
      const ry = o.ry ?? o.r;
      const cnt = Math.max(2, Math.round((o.r * ry) / 2200));
      for (let k = 0; k < cnt; k++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * 0.7;
        const lx = Math.cos(a) * o.r * d;
        const ly = Math.sin(a) * ry * d;
        const rot = o.rot ?? 0;
        this.glints.push(o.x + lx * Math.cos(rot) - ly * Math.sin(rot), o.y + lx * Math.sin(rot) + ly * Math.cos(rot), Math.random() * 10);
      }
    }
  }

  private respawn(i: number, anywhere: boolean) {
    const th = this.theme!;
    this.col[i] = Math.floor(Math.random() * th.colors.length);
    this.ph[i] = Math.random() * 100;
    switch (th.mote) {
      case Mote.Snow:
        this.x[i] = Math.random() * WORLD_W;
        this.y[i] = anywhere ? Math.random() * WORLD_H : -10;
        this.vx[i] = 6 + Math.random() * 10;
        this.vy[i] = 16 + Math.random() * 22;
        this.sz[i] = 1.4 + Math.random() * 2.2;
        break;
      case Mote.Ember: {
        // rise from lava pools when there are some
        const lava = this.lava;
        if (lava.length && Math.random() < 0.75) {
          const o = lava[Math.floor(Math.random() * lava.length)];
          this.x[i] = o.x + (Math.random() - 0.5) * o.r * 1.4;
          this.y[i] = o.y + (Math.random() - 0.5) * (o.ry ?? o.r);
        } else {
          this.x[i] = Math.random() * WORLD_W;
          this.y[i] = Math.random() * WORLD_H;
        }
        if (anywhere) this.y[i] -= Math.random() * 120;
        this.vx[i] = (Math.random() - 0.5) * 14;
        this.vy[i] = -(18 + Math.random() * 26);
        this.sz[i] = 2 + Math.random() * 2.5;
        this.ph[i] = anywhere ? Math.random() * 3 : 0;
        break;
      }
      case Mote.Sparkle:
        this.x[i] = Math.random() * WORLD_W;
        this.y[i] = Math.random() * WORLD_H;
        this.vx[i] = (Math.random() - 0.5) * 6;
        this.vy[i] = -2 - Math.random() * 5;
        this.sz[i] = 5 + Math.random() * 7;
        this.ph[i] = Math.random() * 6;
        break;
      default:
        this.x[i] = Math.random() * WORLD_W;
        this.y[i] = Math.random() * WORLD_H;
        this.vx[i] = (Math.random() - 0.5) * 16;
        this.vy[i] = (Math.random() - 0.5) * 10;
        this.sz[i] = 2.5 + Math.random() * 2.5;
    }
  }

  update(dt: number, time: number, particles: Particles | null, reduced: boolean) {
    const th = this.theme;
    if (!th || dt <= 0) return;
    for (let i = 0; i < this.n; i++) {
      this.ph[i] += dt;
      if (th.mote === Mote.Firefly) {
        // lazy wandering
        this.vx[i] += Math.sin(time * 0.7 + i * 1.3) * 6 * dt;
        this.vy[i] += Math.cos(time * 0.9 + i * 2.1) * 6 * dt;
        this.vx[i] *= 1 - 0.3 * dt;
        this.vy[i] *= 1 - 0.3 * dt;
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
        if (this.x[i] < -20 || this.x[i] > WORLD_W + 20 || this.y[i] < -20 || this.y[i] > WORLD_H + 20) this.respawn(i, true);
      } else if (th.mote === Mote.Snow) {
        this.x[i] += (this.vx[i] + Math.sin(time * 1.3 + i) * 10) * dt;
        this.y[i] += this.vy[i] * dt;
        if (this.y[i] > WORLD_H + 10 || this.x[i] > WORLD_W + 10) this.respawn(i, false);
      } else if (th.mote === Mote.Ember) {
        this.x[i] += (this.vx[i] + Math.sin(time * 2 + i) * 8) * dt;
        this.y[i] += this.vy[i] * dt;
        if (this.ph[i] > 3.2) this.respawn(i, false);
      } else {
        this.x[i] += this.vx[i] * dt;
        this.y[i] += this.vy[i] * dt;
        if (this.ph[i] > 6) this.respawn(i, false);
      }
    }
    // vent smoke puffs
    if (particles && !reduced) {
      this.emberAcc += dt;
      if (this.emberAcc > 0.18) {
        this.emberAcc = 0;
        for (const o of this.obstacles) {
          if (o.kind === 'vent' && Math.random() < 0.6) {
            particles.spawn(PK.Smoke, o.x + (Math.random() - 0.5) * 10, o.y - 8, { vy: -32, vx: (Math.random() - 0.5) * 16, life: 1.8, size: 7, size2: 22 });
          }
        }
      }
    }
  }

  /** Glow pulses on lava / crystals and water glints. Drawn right above the map. */
  drawGround(ctx: CanvasRenderingContext2D, time: number) {
    if (!this.obstacles.length) return;
    ctx.globalCompositeOperation = 'lighter';
    for (const o of this.obstacles) {
      if (o.kind === 'lava') {
        const ry = o.ry ?? o.r;
        ctx.globalAlpha = 0.16 + Math.sin(time * 1.6 + o.x) * 0.07;
        const s = softGlow('#ff7a2f');
        ctx.drawImage(s, o.x - o.r * 1.15, o.y - ry * 1.15, o.r * 2.3, ry * 2.3);
      } else if (o.kind === 'crystal') {
        ctx.globalAlpha = 0.14 + Math.sin(time * 2 + o.x * 0.1) * 0.08;
        ctx.drawImage(softGlow('#8fd8ff'), o.x - o.r * 1.6, o.y - o.r * 1.9, o.r * 3.2, o.r * 3.2);
      }
    }
    const g = this.glints;
    if (g.length) {
      const fl = flareSprite('#ffffff');
      for (let i = 0; i < g.length; i += 3) {
        const k = (time * 0.55 + g[i + 2]) % 2.4;
        if (k > 0.8) continue;
        const a = Math.sin((k / 0.8) * Math.PI);
        ctx.globalAlpha = a * 0.75;
        const s = 7 + a * 6;
        ctx.drawImage(fl, g[i] - s / 2, g[i + 1] - s / 2, s, s);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /** Floating motes above everything else. */
  drawAir(ctx: CanvasRenderingContext2D, time: number, reduced: boolean) {
    const th = this.theme;
    if (!th) return;
    const n = reduced ? Math.floor(this.n / 3) : this.n;
    if (th.mote === Mote.Snow) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < n; i++) {
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.arc(this.x[i], this.y[i], this.sz[i], 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      return;
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) {
      const c = th.colors[this.col[i]];
      const x = this.x[i];
      const y = this.y[i];
      if (th.mote === Mote.Firefly) {
        const tw = 0.35 + 0.65 * Math.max(0, Math.sin(time * 1.7 + i * 2.3));
        ctx.globalAlpha = tw * 0.8;
        const s = this.sz[i] * 2.2;
        ctx.drawImage(glowSprite(c), x - s, y - s, s * 2, s * 2);
      } else if (th.mote === Mote.Ember) {
        const life = this.ph[i] / 3.2;
        ctx.globalAlpha = Math.max(0, Math.sin(Math.min(1, life) * Math.PI)) * 0.9;
        const s = this.sz[i] * (1.4 - life * 0.6);
        ctx.drawImage(glowSprite(c), x - s, y - s, s * 2, s * 2);
      } else {
        const k = this.ph[i] / 6;
        const a = Math.max(0, Math.sin(k * Math.PI * 3)) * Math.sin(k * Math.PI);
        if (a <= 0.02) continue;
        ctx.globalAlpha = a * 0.8;
        const s = this.sz[i] * (0.6 + a * 0.4);
        ctx.drawImage(flareSprite(c), x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }
}
