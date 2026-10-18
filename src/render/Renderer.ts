import type { Game } from '../game/Game';
import type { Tower } from '../game/Tower';
import type { Enemy } from '../game/entities';
import { WORLD_H, WORLD_W } from '../game/maps';
import { TOWERS } from '../game/towers';
import { HEROES, type HeroId } from '../game/heroes';
import type { TowerId, OrbitAttack } from '../game/towerTypes';
import { SYNERGIES, SYNERGY_RANGE } from '../game/synergy';
import { TAU, rand } from '../core/math';
import { renderMap, BLEED, THEMES } from './mapArt';
import { gloopSprite, iceSprite, clearGloopCache } from './gloopArt';
import { towerSprite, beeShape, acornShape, ART_RADIUS, type ArtId } from './towerArt';
import { Particles, PK, glowSprite } from './particles';
import { star } from './draw';
import { t } from '../i18n';

export interface Ghost {
  kind: 'tower' | 'hero';
  id: TowerId | HeroId;
  x: number;
  y: number;
  valid: boolean;
  visible: boolean;
}

interface Beam {
  kind: string;
  pts: number[];
  color: string;
  width: number;
  life: number;
  max: number;
  jag?: number[];
}

export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  dpr = 1;
  viewW = 1;
  viewH = 1;
  /** css px per world unit */
  scale = 1;
  ox = 0;
  oy = 0;
  private mapCanvas: HTMLCanvasElement | null = null;
  private mapRes = 0;
  private mapId = '';
  game: Game | null = null;
  particles = new Particles();
  beams: Beam[] = [];
  shakeT = 0;
  shakePower = 0;
  time = 0;
  ghost: Ghost | null = null;
  selected: Tower | null = null;
  hover: Tower | null = null;
  damageFlash = 0;
  reducedEffects = false;
  /** visible area reserved by the UI (css px) */
  insetRight = 0;
  insetTop = 0;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  /** device px per world unit */
  get res() {
    return this.scale * this.dpr;
  }

  resize(w: number, h: number, dpr: number) {
    this.dpr = Math.min(dpr, 2);
    this.viewW = w;
    this.viewH = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.layout();
  }

  layout() {
    const availW = Math.max(100, this.viewW - this.insetRight);
    const availH = Math.max(100, this.viewH - this.insetTop);
    this.scale = Math.min(availW / WORLD_W, availH / WORLD_H);
    this.ox = (availW - WORLD_W * this.scale) / 2;
    this.oy = this.insetTop + (availH - WORLD_H * this.scale) / 2;
  }

  setGame(g: Game | null) {
    this.game = g;
    this.particles.clear();
    this.beams = [];
    this.selected = null;
    this.ghost = null;
    if (g && g.map.id !== this.mapId) this.mapCanvas = null;
  }

  screenToWorld(x: number, y: number) {
    return { x: (x - this.ox) / this.scale, y: (y - this.oy) / this.scale };
  }

  worldToScreen(x: number, y: number) {
    return { x: x * this.scale + this.ox, y: y * this.scale + this.oy };
  }

  private ensureMap() {
    const g = this.game!;
    // keep the prerender under ~9 megapixels
    const maxRes = Math.sqrt(9_000_000 / ((WORLD_W + BLEED * 2) * (WORLD_H + BLEED * 2)));
    const res = Math.min(this.res, maxRes);
    if (!this.mapCanvas || this.mapId !== g.map.id || Math.abs(res - this.mapRes) / res > 0.15) {
      this.mapCanvas = renderMap(g.map, g.paths, res);
      this.mapRes = res;
      this.mapId = g.map.id;
    }
  }

  shake(p: number) {
    if (this.reducedEffects) p *= 0.4;
    this.shakePower = Math.min(18, Math.max(this.shakePower, p));
    this.shakeT = 0.35;
  }

  addBeam(kind: string, pts: number[], color: string, width: number) {
    const life = kind === 'orbital' ? 0.45 : kind === 'tongue' ? 0.22 : kind === 'strike' ? 0.18 : kind === 'lightning' ? 0.14 : 0.09;
    const b: Beam = { kind, pts, color, width, life, max: life };
    if (kind === 'lightning' || kind === 'strike') b.jag = this.jagged(pts, kind === 'strike' ? 24 : 12);
    if (this.beams.length > 220) this.beams.shift();
    this.beams.push(b);
  }

  private jagged(pts: number[], amp: number): number[] {
    const out: number[] = [pts[0], pts[1]];
    for (let i = 2; i < pts.length; i += 2) {
      const x0 = pts[i - 2];
      const y0 = pts[i - 1];
      const x1 = pts[i];
      const y1 = pts[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(2, Math.floor(len / 18));
      const nx = -(y1 - y0) / (len || 1);
      const ny = (x1 - x0) / (len || 1);
      for (let k = 1; k < n; k++) {
        const f = k / n;
        const off = (Math.random() - 0.5) * amp * Math.min(1, len / 80);
        out.push(x0 + (x1 - x0) * f + nx * off, y0 + (y1 - y0) * f + ny * off);
      }
      out.push(x1, y1);
    }
    return out;
  }

  // -------------------------------------------------------------------------------------------

  render(dt: number) {
    const ctx = this.ctx;
    const g = this.game;
    this.time += dt;
    this.particles.update(dt);
    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter((b) => b.life > 0);
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.damageFlash > 0) this.damageFlash -= dt;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bd = g ? THEMES[g.map.theme].backdrop : '#203040';
    ctx.fillStyle = bd;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    if (!g) return;
    this.ensureMap();

    let sx = 0;
    let sy = 0;
    if (this.shakeT > 0) {
      const k = (this.shakeT / 0.35) * this.shakePower;
      sx = (Math.random() - 0.5) * k;
      sy = (Math.random() - 0.5) * k;
    } else this.shakePower = 0;
    const res = this.res;
    const tx = (this.ox + sx) * this.dpr;
    const ty = (this.oy + sy) * this.dpr;
    ctx.setTransform(res, 0, 0, res, tx, ty);
    ctx.imageSmoothingEnabled = true;

    // map
    ctx.drawImage(this.mapCanvas!, -BLEED, -BLEED, WORLD_W + BLEED * 2, WORLD_H + BLEED * 2);
    this.drawMapAnim(ctx, g);

    // traps
    for (const t of g.towers) for (const tr of t.traps) this.drawTrap(ctx, tr.x, tr.y, tr.radius, tr.visual, tr.life / tr.maxLife);

    // bonds
    this.drawBonds(ctx, g);

    // selection range
    const sel = this.selected;
    if (sel && g.towers.includes(sel)) this.drawRange(ctx, sel.x, sel.y, sel.stats.range > 3000 ? 0 : sel.range, true, sel.stats.buffAura ? '#ffe066' : '#ffffff');

    this.particles.drawGround(ctx);

    // enemies
    this.drawEnemies(ctx, g, res, tx, ty);
    ctx.setTransform(res, 0, 0, res, tx, ty);

    // runners
    for (const r of g.runners) this.drawRunner(ctx, r.x, r.y, r.angle, r.size);

    // towers sorted by y
    const towers = [...g.towers].sort((a, b) => a.y - b.y);
    for (const t of towers) this.drawTower(ctx, t, res, tx, ty);
    ctx.setTransform(res, 0, 0, res, tx, ty);

    // drones
    for (const t of g.towers) {
      for (const d of t.drones) this.drawDrone(ctx, d.x, d.y, d.angle, d.attack.visual, d.phase);
    }

    // projectiles
    this.drawProjectiles(ctx, g);

    // beams
    this.drawBeams(ctx);

    // particles
    this.particles.draw(ctx, this.scale);

    // acorn drops
    for (const d of g.drops) this.drawDrop(ctx, d.x, d.y, d.t, d.collecting ? d.collectT : -1, d.value);

    // placement ghost
    if (this.ghost && this.ghost.visible) this.drawGhost(ctx, g, this.ghost, res, tx, ty);
    ctx.setTransform(res, 0, 0, res, tx, ty);

    // boss bars
    for (const e of g.enemies) if (e.def.boss && e.alive) this.drawBossBar(ctx, e);

    // screen-space overlays
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    if (g.frenzyT > 0) {
      const a = 0.18 + Math.sin(this.time * 8) * 0.06;
      const grad = ctx.createRadialGradient(this.viewW / 2, this.viewH / 2, Math.min(this.viewW, this.viewH) * 0.35, this.viewW / 2, this.viewH / 2, Math.max(this.viewW, this.viewH) * 0.7);
      grad.addColorStop(0, 'rgba(255,120,40,0)');
      grad.addColorStop(1, `rgba(255,90,40,${a})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
    if (this.damageFlash > 0) {
      const a = Math.min(0.45, this.damageFlash);
      const grad = ctx.createRadialGradient(this.viewW / 2, this.viewH / 2, Math.min(this.viewW, this.viewH) * 0.3, this.viewW / 2, this.viewH / 2, Math.max(this.viewW, this.viewH) * 0.65);
      grad.addColorStop(0, 'rgba(255,0,40,0)');
      grad.addColorStop(1, `rgba(255,0,40,${a})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, this.viewW, this.viewH);
    }
  }

  // -------------------------------------------------------------------------------------------

  private drawMapAnim(ctx: CanvasRenderingContext2D, g: Game) {
    const t = this.time;
    for (const o of g.map.obstacles) {
      if (o.kind === 'pond' || o.kind === 'water' || o.kind === 'choco') {
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(o.x, o.y, o.r, o.ry ?? o.r, o.rot ?? 0, 0, TAU);
        ctx.clip();
        ctx.strokeStyle = o.kind === 'choco' ? 'rgba(255,220,190,0.3)' : 'rgba(255,255,255,0.35)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
          const ph = (t * 0.25 + i / 6) % 1;
          const x = o.x + Math.sin(i * 7.3) * o.r * 0.6;
          const y = o.y + Math.cos(i * 3.1) * (o.ry ?? o.r) * 0.5;
          ctx.globalAlpha = 1 - ph;
          ctx.beginPath();
          ctx.ellipse(x, y, 6 + ph * 22, 3 + ph * 9, 0, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 1;
      } else if (o.kind === 'lava') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const a = 0.18 + Math.sin(t * 1.7 + o.x) * 0.08;
        ctx.globalAlpha = a;
        const s = glowSprite('#ff7a2f');
        ctx.drawImage(s, o.x - o.r * 1.3, o.y - (o.ry ?? o.r) * 1.3, o.r * 2.6, (o.ry ?? o.r) * 2.6);
        ctx.restore();
        if (Math.random() < 0.04 && !this.reducedEffects) {
          this.particles.spawn(PK.Flame, o.x + rand(-o.r, o.r) * 0.6, o.y + rand(-1, 1) * (o.ry ?? o.r) * 0.5, { vy: -30, life: 0.8, size: 10, color: '#ff9f1c' });
        }
      } else if (o.kind === 'ice') {
        const a = 0.15 + Math.sin(t * 1.3 + o.x) * 0.1;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        const sx = o.x + Math.sin(t * 0.7 + o.y) * o.r * 0.5;
        ctx.drawImage(glowSprite('#ffffff'), sx - 30, o.y - 18, 60, 36);
        ctx.restore();
      } else if (o.kind === 'crystal') {
        const a = 0.12 + Math.sin(t * 2 + o.x * 0.1) * 0.08;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        ctx.drawImage(glowSprite('#9be7ff'), o.x - o.r * 1.6, o.y - o.r * 2.2, o.r * 3.2, o.r * 3.2);
        ctx.restore();
      } else if (o.kind === 'vent' && Math.random() < 0.06) {
        this.particles.spawn(PK.Smoke, o.x + rand(-5, 5), o.y - 6, { vy: -35, vx: rand(-8, 8), life: 1.6, size: 8, size2: 20 });
      }
    }
  }

  private drawRange(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, valid: boolean, color = '#ffffff') {
    if (r <= 0) return;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = valid ? 'rgba(255,255,255,0.13)' : 'rgba(255,60,60,0.18)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.setLineDash([10, 8]);
    ctx.lineDashOffset = -this.time * 20;
    ctx.strokeStyle = valid ? color : '#ff4d4d';
    ctx.globalAlpha = 0.85;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  private drawBonds(ctx: CanvasRenderingContext2D, g: Game) {
    const seen = new Set<string>();
    for (const t of g.towers) {
      for (const b of t.bonds) {
        const key = t.id < b.other.id ? `${t.id}-${b.other.id}` : `${b.other.id}-${t.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const syn = SYNERGIES.find((s) => s.id === b.synergyId)!;
        const focus = this.selected === t || this.selected === b.other;
        this.drawBondLine(ctx, t.x, t.y - 14, b.other.x, b.other.y - 14, syn.color, focus ? 1 : 0.45);
      }
    }
  }

  private drawBondLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, color: string, strength: number) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 * strength;
    ctx.strokeStyle = color;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.globalAlpha = 0.9 * strength;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 10]);
    ctx.lineDashOffset = -this.time * 40;
    ctx.stroke();
    ctx.setLineDash([]);
    // travelling sparks
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(1, Math.floor(len / 60));
    const glow = glowSprite(color);
    for (let i = 0; i < n; i++) {
      const f = (this.time * 0.6 + i / n) % 1;
      const x = x0 + (x1 - x0) * f;
      const y = y0 + (y1 - y0) * f;
      ctx.globalAlpha = strength * Math.sin(f * Math.PI);
      ctx.drawImage(glow, x - 7, y - 7, 14, 14);
    }
    ctx.restore();
  }

  private drawTrap(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, visual: string, lifeFrac: number) {
    const a = Math.min(1, lifeFrac * 4);
    ctx.globalAlpha = a;
    if (visual === 'honey') {
      // glossy amber puddle with a darker rim and drips
      const k = this.time * 1.5 + x * 0.01;
      ctx.beginPath();
      const n = 9;
      for (let i = 0; i <= n; i++) {
        const ang = (i / n) * TAU;
        const rr = r * (0.86 + Math.sin(i * 2.3 + x) * 0.1 + Math.sin(k + i) * 0.02);
        const px = x + Math.cos(ang) * rr;
        const py = y + Math.sin(ang) * rr * 0.62;
        if (i === 0) ctx.moveTo(px, py);
        else {
          const pa = ((i - 0.5) / n) * TAU;
          const pr = rr * 1.08;
          ctx.quadraticCurveTo(x + Math.cos(pa) * pr, y + Math.sin(pa) * pr * 0.62, px, py);
        }
      }
      ctx.closePath();
      const grad = ctx.createRadialGradient(x - r * 0.25, y - r * 0.2, r * 0.1, x, y, r);
      grad.addColorStop(0, 'rgba(255,226,120,0.92)');
      grad.addColorStop(0.6, 'rgba(250,170,20,0.85)');
      grad.addColorStop(1, 'rgba(200,110,0,0.85)');
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(140,70,0,0.75)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(x - r * 0.3, y - r * 0.18, r * 0.28, r * 0.09, -0.25, 0, TAU);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + r * 0.35, y + r * 0.05, r * 0.06, 0, TAU);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.ellipse(x, y, r * 0.75, r * 0.45, 0, 0, TAU);
      ctx.fillStyle = '#2f9e44';
      ctx.fill();
      ctx.strokeStyle = '#1f4d1d';
      ctx.lineWidth = 2;
      ctx.stroke();
      const pulse = 0.5 + Math.sin(this.time * 10 + x) * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a * (0.3 + pulse * 0.4);
      ctx.drawImage(glowSprite('#7bdff2'), x - r, y - r, r * 2, r * 2);
      ctx.restore();
      ctx.beginPath();
      ctx.arc(x, y - 4, 5, 0, TAU);
      ctx.fillStyle = '#d08c2d';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  private drawEnemies(ctx: CanvasRenderingContext2D, g: Game, res: number, tx: number, ty: number) {
    const list = g.enemies;
    const crowded = list.length > 350;
    // shadows (skipped for small gloops in huge crowds)
    ctx.fillStyle = 'rgba(20,10,30,0.25)';
    ctx.beginPath();
    for (const e of list) {
      if (!e.alive || (crowded && !e.def.boss) || e.x < -40) continue;
      const r = e.radius;
      ctx.moveTo(e.x + r * 0.9, e.y + r * 0.8);
      ctx.ellipse(e.x, e.y + r * 0.8, r * 0.9, r * 0.32, 0, 0, TAU);
    }
    ctx.fill();
    ctx.imageSmoothingQuality = crowded ? 'low' : 'medium';
    const t = this.time;
    // bosses last so they're on top
    for (let pass = 0; pass < 2; pass++) {
      for (const e of list) {
        if (!e.alive || !!e.def.boss !== (pass === 1)) continue;
        if (e.x < -e.radius * 2 || e.x > WORLD_W + e.radius * 2) continue;
        this.drawEnemy(ctx, e, res, tx, ty, t);
      }
    }
  }

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, res: number, tx: number, ty: number, t: number) {
    const def = e.def;
    let dmg = 0;
    if (def.hp > 1) {
      const f = e.hp / e.maxHp;
      dmg = f > 0.75 ? 0 : f > 0.5 ? 1 : f > 0.25 ? 2 : 3;
    }
    // cache the sprite on the gloop; only rebuild the lookup when its look changes
    const lookKey = (dmg << 3) | (e.camo ? 4 : 0) | (e.regrowMax ? 2 : 0) | (e.fortified ? 1 : 0);
    const cache = e as Enemy & { _spr?: ReturnType<typeof gloopSprite>; _sprKey?: string; _sprRes?: number; _sprLook?: number };
    if (cache._sprKey !== e.type || cache._sprLook !== lookKey || cache._sprRes !== res) {
      cache._spr = gloopSprite(e.type, { camo: e.camo, regrow: !!e.regrowMax, fortified: e.fortified, dmg }, res);
      cache._sprKey = e.type;
      cache._sprLook = lookKey;
      cache._sprRes = res;
    }
    const spr = cache._spr!;
    const frozen = e.freezeT > 0;
    const stunned = e.stunT > 0;
    const moving = !frozen && !stunned;
    const speed = def.boss ? 2.5 : 6 + def.speed * 2;
    const w = moving ? Math.sin(e.phase + e.age * speed) : 0;
    const sq = def.boss ? 0.035 : 0.08;
    const sx = 1 + w * sq;
    const sy = 1 - w * sq;
    const hop = def.boss ? 0 : Math.abs(w) * e.radius * 0.18;
    const facing = Math.cos(e.angle) >= -0.05 ? 1 : -1;
    const tilt = def.boss ? 0 : 0;
    const px = e.x * res + tx;
    const py = (e.y - hop) * res + ty;
    ctx.setTransform(res * sx * facing, tilt, 0, res * sy, px, py);
    if (e.camo) ctx.globalAlpha = 0.72;
    ctx.drawImage(spr.canvas, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    if (e.hitFlash > 0) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.45;
      ctx.drawImage(spr.canvas, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(res, 0, 0, res, tx, ty);
    if (frozen) {
      const ice = iceSprite(e.radius, res);
      ctx.globalAlpha = Math.min(1, e.freezeT * 4);
      ctx.drawImage(ice.canvas, e.x - ice.w / 2, e.y - ice.h / 2, ice.w, ice.h);
      ctx.globalAlpha = 1;
    }
    if (stunned && !frozen) {
      for (let i = 0; i < 3; i++) {
        const a = t * 6 + (i * TAU) / 3;
        const x = e.x + Math.cos(a) * e.radius * 0.8;
        const y = e.y - e.radius * 1.1 + Math.sin(a) * e.radius * 0.25;
        star(ctx, x, y, Math.max(3, e.radius * 0.18));
        ctx.fillStyle = '#ffe066';
        ctx.fill();
      }
    }
    if (e.markT > 0) {
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.radius * 1.25, 0, TAU);
      ctx.strokeStyle = 'rgba(255,60,60,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (e.type === 'golden') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.55 + Math.sin(t * 9) * 0.2;
      ctx.drawImage(glowSprite('#ffd23c'), e.x - e.radius * 2.4, e.y - e.radius * 2.4, e.radius * 4.8, e.radius * 4.8);
      ctx.restore();
      if (Math.random() < 0.5) this.particles.spawn(PK.Star, e.x + rand(-e.radius, e.radius), e.y + rand(-e.radius, e.radius), { life: 0.5, size: 5, color: '#fff3a8', vy: -20 });
    }
    if (!this.reducedEffects) {
      if (e.burnT > 0 && Math.random() < 0.25) {
        this.particles.spawn(PK.Flame, e.x + rand(-e.radius, e.radius) * 0.6, e.y - rand(0, e.radius), { vy: -40, life: 0.4, size: 7 + e.radius * 0.15, color: Math.random() < 0.5 ? '#ff7a2f' : '#ffd166' });
      }
      if (e.poisonT > 0 && Math.random() < 0.12) {
        this.particles.spawn(PK.Bubble, e.x + rand(-e.radius, e.radius) * 0.6, e.y - e.radius * 0.5, { vy: -25, life: 0.6, size: 3, color: '#a3e635' });
      }
      if ((e.slowT > 0 && e.slowMul < 0.9) || e.auraSlow < 0.9) {
        if (Math.random() < 0.05) this.particles.spawn(PK.Snow, e.x + rand(-e.radius, e.radius), e.y - e.radius, { vy: 20, life: 0.5, size: 1.8, color: '#e0f7ff' });
      }
    }
  }

  private drawBossBar(ctx: CanvasRenderingContext2D, e: Enemy) {
    const w = Math.max(60, e.radius * 1.8);
    const x = e.x - w / 2;
    const y = e.y - e.radius - 22;
    const f = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = 'rgba(20,10,30,0.75)';
    roundRectPath(ctx, x - 2, y - 2, w + 4, 11, 5);
    ctx.fill();
    const col = f > 0.5 ? '#5ddc6a' : f > 0.25 ? '#ffd23c' : '#ff4d4d';
    ctx.fillStyle = col;
    roundRectPath(ctx, x, y, Math.max(0.1, w * f), 7, 3.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + 2, y + 1, Math.max(0, w * f - 4), 2);
  }

  private artOf(t: Tower): { id: ArtId; tiers: number[] } {
    if (t.hero) {
      const L = t.heroLevel >= 20 ? 20 : t.heroLevel >= 10 ? 10 : 1;
      return { id: t.hero.id as ArtId, tiers: [L] };
    }
    return { id: t.def!.id as ArtId, tiers: [...t.tiers] };
  }

  private drawTower(ctx: CanvasRenderingContext2D, t: Tower, res: number, tx: number, ty: number) {
    const art = this.artOf(t);
    const spr = towerSprite(art.id, art.tiers, res);
    const age = (this.game?.time ?? 0) - t.placedAt;
    let s = 1;
    if (age < 0.35) s = 0.4 + easeBack(age / 0.35) * 0.6;
    if (t.upgradeFlash > 0) s *= 1 + Math.sin(t.upgradeFlash * Math.PI) * 0.18;
    const breathe = 1 + Math.sin(this.time * 2.2 + t.id) * 0.015;
    const fire = t.fireAnim < 0.14 ? (1 - t.fireAnim / 0.14) * 0.08 : 0;
    const sx = s * (1 + fire) * t.facing;
    const sy = s * (breathe - fire);
    const highlight = this.selected === t || this.hover === t;
    if (highlight) {
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(t.x, t.y + t.radius * 0.35, t.radius * 1.35, t.radius * 0.6, 0, 0, TAU);
      ctx.strokeStyle = this.selected === t ? '#ffffff' : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 3;
      ctx.globalAlpha = 0.6 + Math.sin(this.time * 6) * 0.3;
      ctx.stroke();
      ctx.restore();
    }
    ctx.setTransform(res * sx, 0, 0, res * sy, t.x * res + tx, (t.y + t.radius * 0.3) * res + ty);
    ctx.drawImage(spr.canvas, -spr.w / 2, -spr.h * (spr.ay ?? 0.5) - t.radius * 0.3, spr.w, spr.h);
    ctx.setTransform(res, 0, 0, res, tx, ty);
    this.drawTowerDynamic(ctx, t);
    if (t.upgradeFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = t.upgradeFlash * 0.8;
      ctx.drawImage(glowSprite('#ffe066'), t.x - t.radius * 2.2, t.y - t.radius * 3, t.radius * 4.4, t.radius * 4.4);
      ctx.restore();
    }
    if (t.isHero) {
      // level badge
      const bx = t.x + t.radius * 0.95;
      const by = t.y - t.radius * 1.9;
      ctx.beginPath();
      ctx.arc(bx, by, 10, 0, TAU);
      ctx.fillStyle = '#2a1b2e';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(bx, by, 8.5, 0, TAU);
      ctx.fillStyle = '#ffd23c';
      ctx.fill();
      ctx.fillStyle = '#2a1b2e';
      ctx.font = '900 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(t.heroLevel), bx, by + 0.5);
    }
    // ability-ready sparkle
    for (const ab of t.stats.abilities) {
      if ((t.abilityCd.get(ab.id) ?? 0) <= 0) {
        if (Math.random() < 0.05) this.particles.spawn(PK.Star, t.x + rand(-t.radius, t.radius), t.y - rand(0, t.radius * 2.5), { life: 0.6, size: 5, color: '#fff3a8', vy: -15 });
        break;
      }
    }
  }

  private drawTowerDynamic(ctx: CanvasRenderingContext2D, t: Tower) {
    const r = t.radius;
    const id = t.typeId;
    const recoil = t.fireAnim < 0.12 ? (1 - t.fireAnim / 0.12) * 6 : 0;
    if (id === 'boomer') {
      const x = t.x;
      const y = t.y - r * 1.25;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(t.angle);
      const L = Math.max(...t.tiers);
      const len = r * (0.95 + (t.tiers[0] >= 3 ? 0.2 : 0)) - recoil;
      const wd = r * (0.32 + t.tiers[0] * 0.03);
      ctx.fillStyle = '#2a2433';
      roundRectPath(ctx, -4, -wd / 2 - 2, len + 6, wd + 4, 5);
      ctx.fill();
      const grad = ctx.createLinearGradient(0, -wd / 2, 0, wd / 2);
      grad.addColorStop(0, '#a9b2c0');
      grad.addColorStop(0.5, '#5b6270');
      grad.addColorStop(1, '#3a404c');
      ctx.fillStyle = grad;
      roundRectPath(ctx, -2, -wd / 2, len + 2, wd, 4);
      ctx.fill();
      ctx.fillStyle = L >= 5 ? '#ffd23c' : '#e63946';
      ctx.fillRect(len - 6, -wd / 2, 5, wd);
      ctx.restore();
    } else if (id === 'hoot') {
      ctx.save();
      ctx.translate(t.x + t.facing * r * 0.25, t.y - r * 0.75);
      ctx.rotate(t.angle);
      const len = r * 1.6 - recoil;
      ctx.fillStyle = '#2a2433';
      roundRectPath(ctx, -r * 0.3, -4.5, len + r * 0.3, 9, 3);
      ctx.fill();
      ctx.fillStyle = t.tiers[0] >= 5 ? '#e0b43a' : '#6b4226';
      roundRectPath(ctx, -r * 0.3, -3, r * 0.7, 6, 2);
      ctx.fill();
      ctx.fillStyle = '#7d8796';
      ctx.fillRect(r * 0.4, -2, len - r * 0.4, 4);
      ctx.fillStyle = '#2a2433';
      ctx.fillRect(r * 0.3, -8, r * 0.5, 4);
      ctx.restore();
      if (t.fireAnim < 0.06) {
        const mx = t.x + t.facing * r * 0.25 + Math.cos(t.angle) * r * 1.7;
        const my = t.y - r * 0.75 + Math.sin(t.angle) * r * 1.7;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glowSprite('#ffd166'), mx - 14, my - 14, 28, 28);
        ctx.restore();
      }
    } else if (id === 'nova') {
      ctx.save();
      ctx.translate(t.x + t.facing * r * 0.3, t.y - r * 0.6);
      ctx.rotate(t.angle);
      ctx.fillStyle = '#2a2433';
      roundRectPath(ctx, -2, -4, r * 0.9 - recoil * 0.5, 8, 3);
      ctx.fill();
      ctx.fillStyle = '#9b7bff';
      roundRectPath(ctx, 0, -2.5, r * 0.85 - recoil * 0.5, 5, 2);
      ctx.fill();
      ctx.restore();
    } else if (id === 'ember') {
      const ox = t.x - r * 0.98 * t.facing;
      const oy = t.y - r * 1.67;
      const pulse = 0.6 + Math.sin(this.time * 5 + t.id) * 0.25 + (t.fireAnim < 0.2 ? 0.5 : 0);
      const col = t.tiers[0] >= 1 ? '#ff7a2f' : t.tiers[1] >= 1 ? '#7b9cff' : t.tiers[2] >= 1 ? '#7dffb0' : '#5ce1ff';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, pulse);
      ctx.drawImage(glowSprite(col), ox - 16, oy - 16, 32, 32);
      ctx.restore();
    } else if (id === 'zap' && t.fireAnim < 0.25) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - t.fireAnim / 0.25;
      ctx.drawImage(glowSprite('#7bdff2'), t.x - r * 1.6, t.y - r * 2.2, r * 3.2, r * 3.2);
      ctx.restore();
    }
    // orbiting wisps
    for (const a of t.stats.attacks) {
      if (a.kind !== 'orbit') continue;
      const o = a as OrbitAttack;
      for (let i = 0; i < o.count; i++) {
        const ang = t.orbitPhase + (i / o.count) * TAU;
        const x = t.x + Math.cos(ang) * o.orbitRadius;
        const y = t.y + Math.sin(ang) * o.orbitRadius * 0.85 - 8;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glowSprite('#7dffb0'), x - o.size * 1.4, y - o.size * 1.4, o.size * 2.8, o.size * 2.8);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(x, y, o.size * 0.45, 0, TAU);
        ctx.fillStyle = '#eafff4';
        ctx.fill();
        if (Math.random() < 0.2 && !this.reducedEffects) this.particles.spawn(PK.Spark, x, y, { life: 0.35, size: 5, color: '#7dffb0' });
      }
    }
  }

  private drawDrone(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, visual: string, phase: number) {
    const flap = Math.sin(phase * 40) * 0.5 + 0.5;
    if (visual === 'phoenix') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(glowSprite('#ff7a2f'), -34, -34, 68, 68);
      ctx.globalCompositeOperation = 'source-over';
      // wings
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(-4, 0);
        ctx.quadraticCurveTo(-10, s * (18 + flap * 10), -26, s * (22 + flap * 8));
        ctx.quadraticCurveTo(-14, s * 6, 4, 0);
        ctx.fillStyle = s > 0 ? '#ff9f1c' : '#ffd166';
        ctx.fill();
      }
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 6, 0, 0, TAU);
      ctx.fillStyle = '#ff5a1f';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(10, 0, 5, 0, TAU);
      ctx.fillStyle = '#ffd166';
      ctx.fill();
      ctx.restore();
      if (Math.random() < 0.5) this.particles.spawn(PK.Flame, x, y, { life: 0.4, size: 9, color: '#ff7a2f', vx: -Math.cos(angle) * 40, vy: -Math.sin(angle) * 40 });
      return;
    }
    const s = visual === 'queen' ? 11 : 7;
    ctx.save();
    ctx.translate(x, y + Math.sin(phase * 12) * 1.5);
    ctx.scale(Math.cos(angle) >= 0 ? 1 : -1, 1);
    beeShape(ctx, 0, 0, s, visual === 'wasp', visual === 'queen');
    ctx.restore();
  }

  private drawRunner(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6;
    ctx.drawImage(glowSprite('#7dffb0'), x - size * 1.6, y - size * 1.6, size * 3.2, size * 3.2);
    ctx.restore();
    ctx.save();
    ctx.translate(x, y - 4);
    const f = Math.cos(angle) >= 0 ? 1 : -1;
    ctx.scale(f, 1);
    ctx.globalAlpha = 0.85;
    const s = size / 18;
    ctx.beginPath();
    ctx.ellipse(0, 0, 14 * s, 8 * s, 0, 0, TAU);
    ctx.fillStyle = '#c9ffe4';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(12 * s, -6 * s, 7 * s, 0, TAU);
    ctx.fill();
    for (const d of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(10 * s + d * 3 * s, -11 * s);
      ctx.lineTo(13 * s + d * 4 * s, -19 * s);
      ctx.lineTo(15 * s + d * 2 * s, -10 * s);
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(-12 * s, -2 * s);
    ctx.quadraticCurveTo(-26 * s, -14 * s, -22 * s, -2 * s);
    ctx.quadraticCurveTo(-20 * s, 4 * s, -12 * s, 2 * s);
    ctx.fill();
    ctx.fillStyle = '#1f8a6a';
    ctx.beginPath();
    ctx.arc(14 * s, -7 * s, 1.6 * s, 0, TAU);
    ctx.fill();
    ctx.restore();
    if (Math.random() < 0.4) this.particles.spawn(PK.Spark, x + rand(-6, 6), y + rand(-6, 6), { life: 0.4, size: 6, color: '#7dffb0' });
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D, g: Game) {
    for (const p of g.projectiles) {
      if (!p.alive) continue;
      const v = p.def.visual;
      const size = p.def.size ?? 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      switch (v) {
        case 'quill':
          ctx.strokeStyle = '#4a2c18';
          ctx.lineWidth = 3 * size;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-9 * size, 0);
          ctx.lineTo(6 * size, 0);
          ctx.stroke();
          ctx.strokeStyle = '#f1e3c8';
          ctx.lineWidth = 2 * size;
          ctx.beginPath();
          ctx.moveTo(3 * size, 0);
          ctx.lineTo(9 * size, 0);
          ctx.stroke();
          break;
        case 'javelin':
          ctx.fillStyle = '#2a1b2e';
          ctx.fillRect(-22 * size, -2.6 * size, 34 * size, 5.2 * size);
          ctx.fillStyle = size > 1.4 ? '#e0b43a' : '#a0703c';
          ctx.fillRect(-21 * size, -1.6 * size, 32 * size, 3.2 * size);
          ctx.beginPath();
          ctx.moveTo(10 * size, -5 * size);
          ctx.lineTo(20 * size, 0);
          ctx.lineTo(10 * size, 5 * size);
          ctx.closePath();
          ctx.fillStyle = size > 1.4 ? '#fff3a8' : '#dfe6ee';
          ctx.fill();
          ctx.strokeStyle = '#2a1b2e';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          break;
        case 'bomb':
        case 'minibomb': {
          const r = (v === 'bomb' ? 8 : 5) * size;
          ctx.rotate(-p.rot + p.age * 8);
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, TAU);
          ctx.fillStyle = '#2a2433';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(-r * 0.35, -r * 0.35, r * 0.35, 0, TAU);
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(glowSprite('#ffb347'), r * 0.3, -r * 1.6, r * 1.4, r * 1.4);
          break;
        }
        case 'missile':
        case 'bigmissile': {
          const k = (v === 'bigmissile' ? 1.6 : 1) * Math.max(1, size * 0.8);
          ctx.fillStyle = '#dfe6ee';
          roundRectPath(ctx, -10 * k, -3.5 * k, 18 * k, 7 * k, 3 * k);
          ctx.fill();
          ctx.fillStyle = '#e63946';
          ctx.beginPath();
          ctx.moveTo(8 * k, -3.5 * k);
          ctx.lineTo(14 * k, 0);
          ctx.lineTo(8 * k, 3.5 * k);
          ctx.closePath();
          ctx.fill();
          ctx.fillStyle = '#5b6270';
          ctx.fillRect(-10 * k, -5.5 * k, 4 * k, 11 * k);
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(glowSprite('#ff9f1c'), -22 * k, -7 * k, 14 * k, 14 * k);
          if (Math.random() < 0.6) {
            ctx.restore();
            this.particles.spawn(PK.Smoke, p.x - Math.cos(p.rot) * 12 * k, p.y - Math.sin(p.rot) * 12 * k, { life: 0.5, size: 3 * k, size2: 8 * k });
            continue;
          }
          break;
        }
        case 'shard':
          ctx.beginPath();
          ctx.moveTo(9, 0);
          ctx.lineTo(0, -3.5);
          ctx.lineTo(-7, 0);
          ctx.lineTo(0, 3.5);
          ctx.closePath();
          ctx.fillStyle = '#bff1ff';
          ctx.fill();
          ctx.strokeStyle = '#3aa0d8';
          ctx.lineWidth = 1.2;
          ctx.stroke();
          break;
        case 'lance': {
          const k = size;
          ctx.beginPath();
          ctx.moveTo(22 * k, 0);
          ctx.lineTo(0, -4.5 * k);
          ctx.lineTo(-20 * k, 0);
          ctx.lineTo(0, 4.5 * k);
          ctx.closePath();
          const grad = ctx.createLinearGradient(-20 * k, 0, 22 * k, 0);
          grad.addColorStop(0, 'rgba(190,240,255,0.2)');
          grad.addColorStop(1, '#e8fbff');
          ctx.fillStyle = grad;
          ctx.fill();
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(glowSprite('#7fd6ff'), -12 * k, -12 * k, 24 * k, 24 * k);
          break;
        }
        case 'iceball':
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(glowSprite('#7fd6ff'), -16, -16, 32, 32);
          ctx.globalCompositeOperation = 'source-over';
          ctx.beginPath();
          ctx.arc(0, 0, 7, 0, TAU);
          ctx.fillStyle = '#e8fbff';
          ctx.fill();
          break;
        case 'bolt':
        case 'star':
        case 'spirit':
        case 'laser':
        case 'firebolt':
        case 'fireball':
        case 'flame': {
          const col =
            v === 'bolt' ? '#5ce1ff' : v === 'star' ? '#c9b8ff' : v === 'spirit' ? '#7dffb0' : v === 'laser' ? '#c77dff' : v === 'flame' ? '#ff9f1c' : '#ff7a2f';
          ctx.globalCompositeOperation = 'lighter';
          if (v === 'laser') {
            ctx.strokeStyle = col;
            ctx.lineWidth = 5;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-14, 0);
            ctx.lineTo(8, 0);
            ctx.stroke();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
          } else if (v === 'flame') {
            const f = 1 - p.life / p.maxLife;
            const s = 10 + f * 18;
            ctx.globalAlpha = 1 - f * 0.7;
            ctx.drawImage(glowSprite(f > 0.5 ? '#ff5a1f' : '#ffd166'), -s, -s, s * 2, s * 2);
          } else if (v === 'star') {
            ctx.rotate(p.age * 10);
            ctx.drawImage(glowSprite(col), -12, -12, 24, 24);
            ctx.globalCompositeOperation = 'source-over';
            star(ctx, 0, 0, 6, 0.45);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
          } else {
            const s = v === 'fireball' ? 20 : v === 'spirit' ? 14 : 13;
            ctx.drawImage(glowSprite(col), -s, -s, s * 2, s * 2);
            ctx.globalCompositeOperation = 'source-over';
            ctx.beginPath();
            ctx.arc(0, 0, v === 'fireball' ? 7 : 4, 0, TAU);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            if (!this.reducedEffects && Math.random() < 0.5) {
              ctx.restore();
              this.particles.spawn(PK.Spark, p.x, p.y, { life: 0.3, size: v === 'fireball' ? 12 : 7, color: col, vx: rand(-20, 20), vy: rand(-20, 20) });
              continue;
            }
          }
          break;
        }
        case 'stinger':
          ctx.strokeStyle = '#231c2b';
          ctx.lineWidth = 2 * size;
          ctx.beginPath();
          ctx.moveTo(-5 * size, 0);
          ctx.lineTo(5 * size, 0);
          ctx.stroke();
          ctx.fillStyle = '#ffd23c';
          ctx.fillRect(-5 * size, -1, 3 * size, 2);
          break;
        case 'feather':
          ctx.beginPath();
          ctx.ellipse(0, 0, 8, 2.5, 0, 0, TAU);
          ctx.fillStyle = '#f1faee';
          ctx.fill();
          ctx.strokeStyle = '#8e6bd8';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(-8, 0);
          ctx.lineTo(8, 0);
          ctx.stroke();
          break;
      }
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  private drawBeams(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const b of this.beams) {
      const t = b.life / b.max;
      const pts = b.jag ?? b.pts;
      if (b.kind === 'tongue') {
        // extend then retract
        const f = t > 0.5 ? (1 - t) * 2 : t * 2;
        const x0 = b.pts[0];
        const y0 = b.pts[1];
        const x1 = x0 + (b.pts[2] - x0) * f;
        const y1 = y0 + (b.pts[3] - y0) * f;
        ctx.strokeStyle = '#a3245c';
        ctx.lineWidth = b.width + 3;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.strokeStyle = b.color;
        ctx.lineWidth = b.width;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(x1, y1, b.width * 0.9, 0, TAU);
        ctx.fillStyle = b.color;
        ctx.fill();
        continue;
      }
      if (b.kind === 'orbital') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = t;
        const x = b.pts[2];
        const y = b.pts[3];
        const w = b.width * (0.5 + t * 0.5);
        const grad = ctx.createLinearGradient(x - w, 0, x + w, 0);
        grad.addColorStop(0, 'rgba(160,120,255,0)');
        grad.addColorStop(0.5, 'rgba(230,220,255,0.95)');
        grad.addColorStop(1, 'rgba(160,120,255,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(x - w, b.pts[1], w * 2, y - b.pts[1]);
        ctx.globalCompositeOperation = 'source-over';
        continue;
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = t * 0.55;
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.width * 3;
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
      ctx.stroke();
      ctx.globalAlpha = t;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, b.width * 0.6);
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawDrop(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, collectT: number, value: number) {
    let s = 9;
    let yy = y;
    ctx.save();
    if (collectT >= 0) {
      const f = collectT / 0.5;
      s *= 1 + f * 0.6;
      yy -= f * 40;
      ctx.globalAlpha = 1 - f;
    } else if (t > 0.5) {
      yy += Math.sin(this.time * 5 + x) * 2;
      // pulsing halo to invite a tap
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + Math.sin(this.time * 6 + x) * 0.15;
      ctx.drawImage(glowSprite('#ffe066'), x - 22, yy - 22, 44, 44);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    acornShape(ctx, x, yy, s, value >= 30);
    ctx.restore();
  }

  private drawGhost(ctx: CanvasRenderingContext2D, g: Game, gh: Ghost, res: number, tx: number, ty: number) {
    const isHero = gh.kind === 'hero';
    const def = isHero ? HEROES[gh.id as HeroId] : TOWERS[gh.id as TowerId];
    const stats = isHero ? HEROES[gh.id as HeroId].base() : TOWERS[gh.id as TowerId].base();
    const range = stats.range > 3000 ? 0 : stats.range;
    this.drawRange(ctx, gh.x, gh.y, range, gh.valid);
    if (!isHero) {
      for (const b of g.previewBonds(gh.id as TowerId, gh.x, gh.y)) {
        this.drawBondLine(ctx, gh.x, gh.y - 14, b.tower.x, b.tower.y - 14, b.color, 1);
        if (b.name) {
          const mx = (gh.x + b.tower.x) / 2;
          const my = (gh.y + b.tower.y) / 2 - 22;
          ctx.font = `900 ${13 / this.scale}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 3 / this.scale;
          ctx.strokeStyle = '#2a1b2e';
          ctx.strokeText('⚡ ' + t(b.name), mx, my);
          ctx.fillStyle = b.color;
          ctx.fillText('⚡ ' + t(b.name), mx, my);
        }
      }
      // faint synergy radius
      ctx.beginPath();
      ctx.arc(gh.x, gh.y, SYNERGY_RANGE, 0, TAU);
      ctx.strokeStyle = 'rgba(255,230,120,0.25)';
      ctx.setLineDash([3, 9]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const art = gh.id as ArtId;
    const spr = towerSprite(art, isHero ? [1] : [0, 0, 0], res);
    const r = ART_RADIUS[art] ?? def.radius;
    ctx.setTransform(res, 0, 0, res, gh.x * res + tx, gh.y * res + ty);
    ctx.globalAlpha = gh.valid ? 0.85 : 0.5;
    ctx.drawImage(spr.canvas, -spr.w / 2, -spr.h * (spr.ay ?? 0.5), spr.w, spr.h);
    if (!gh.valid) {
      ctx.globalCompositeOperation = 'source-atop';
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (!gh.valid) {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.strokeStyle = '#ff4d4d';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-r * 0.6, -r * 0.6);
      ctx.lineTo(r * 0.6, r * 0.6);
      ctx.stroke();
    }
  }

  // -------------------------------------------------------------------------------------------
  // FX helpers used by the presentation layer
  // -------------------------------------------------------------------------------------------

  splat(x: number, y: number, color: string, r: number, big = false) {
    const busy = this.particles.list.length > 1200;
    const n = this.reducedEffects ? 3 : big ? 26 : busy ? 3 : 6;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = (big ? 160 : 70) + Math.random() * (big ? 260 : 120);
      this.particles.spawn(PK.Drop, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, gravity: 420, drag: 2, life: 0.35 + Math.random() * 0.3, size: (big ? 7 : 3.2) + Math.random() * (big ? 6 : 2.5), color });
    }
    if (!busy || big) this.particles.spawn(PK.Ring, x, y, { life: 0.25, size: r * 0.5, size2: r * (big ? 3 : 1.7), color: '#ffffff' });
    if (!this.reducedEffects && (!busy || big)) this.particles.spawn(PK.Stain, x, y + r * 0.6, { ground: true, life: big ? 6 : 2.5, size: r * (big ? 1.6 : 0.9), color });
  }

  explosion(x: number, y: number, radius: number, visual: string) {
    const colors: Record<string, [string, string]> = {
      boom: ['#ffb347', '#ff6b35'],
      mini: ['#ffcf73', '#ff8c42'],
      frost: ['#bff1ff', '#57c8ff'],
      fire: ['#ffd166', '#ff5a1f'],
      arcane: ['#d0bfff', '#7b5cff'],
      nuke: ['#fff3a8', '#9dff6a'],
      poison: ['#d9f99d', '#65a30d'],
    };
    const [c1, c2] = colors[visual] ?? colors.boom;
    const big = visual === 'nuke';
    this.particles.spawn(PK.Flash, x, y, { life: big ? 0.5 : 0.22, size: radius * 0.6, size2: radius * (big ? 1.8 : 0.9), color: c1 });
    this.particles.spawn(PK.Ring, x, y, { life: big ? 0.6 : 0.3, size: radius * 0.3, size2: radius * 1.1, color: c1 });
    if (this.reducedEffects) return;
    const n = Math.min(big ? 30 : 14, 4 + Math.floor(radius / 5));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = 60 + Math.random() * radius * 4;
      this.particles.spawn(PK.Spark, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 4, life: 0.25 + Math.random() * 0.25, size: 6 + Math.random() * 8, color: Math.random() < 0.5 ? c1 : c2 });
    }
    if (visual === 'frost') {
      for (let i = 0; i < 6; i++) {
        const a = Math.random() * TAU;
        this.particles.spawn(PK.Shard, x, y, { vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, drag: 3, life: 0.4, size: 5, color: '#e8fbff', vr: 8 });
      }
    } else if (visual !== 'arcane') {
      for (let i = 0; i < (big ? 12 : 3); i++) {
        this.particles.spawn(PK.Smoke, x + rand(-radius, radius) * 0.4, y + rand(-radius, radius) * 0.4, { vy: -30, life: 0.7 + Math.random() * 0.5, size: radius * 0.25, size2: radius * 0.6 });
      }
    }
  }

  pulse(x: number, y: number, radius: number, visual: string) {
    const col = visual === 'frost' ? '#bff1ff' : visual === 'slam' ? '#e9d3b4' : visual === 'nova' ? '#ffe066' : visual === 'quake' ? '#ffb347' : '#b9f3ff';
    const big = radius > 600;
    this.particles.spawn(PK.Ring, x, y, { life: big ? 0.8 : 0.35, size: 10, size2: Math.min(radius, big ? 1400 : radius), color: col });
    if (big) this.particles.spawn(PK.Ring, x, y, { life: 1.1, size: 10, size2: 1000, color: '#ffffff' });
    if (this.reducedEffects) return;
    if (visual === 'frost') {
      const n = big ? 60 : 12;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU;
        const d = Math.random() * Math.min(radius, big ? 900 : radius);
        this.particles.spawn(PK.Snow, x + Math.cos(a) * d, y + Math.sin(a) * d, { vy: 15, life: 0.6 + Math.random() * 0.4, size: 2 + Math.random() * 2, color: '#ffffff' });
      }
    }
    if (visual === 'slam') {
      for (let i = 0; i < 10; i++) {
        const a = Math.random() * TAU;
        this.particles.spawn(PK.Smoke, x + Math.cos(a) * radius * 0.6, y + Math.sin(a) * radius * 0.4, { vx: Math.cos(a) * 40, vy: Math.sin(a) * 20, life: 0.5, size: 6, size2: 14 });
      }
    }
  }

  /** Comic-book onomatopoeia burst. */
  comic(x: number, y: number, big = false) {
    const words = big ? ['KA-SPLOOSH!', 'MEGA POP!', 'SPLAT-TASTIC!'] : ['POP!', 'SPLAT!', 'BLORP!', 'PLOP!', 'SPLOOSH!'];
    const cols = ['#ffe066', '#ff8fab', '#7bdff2', '#b5e48c', '#ffffff', '#ffb347'];
    const w = t(words[Math.floor(Math.random() * words.length)]);
    this.particles.spawn(PK.Text, x + rand(-8, 8), y, { vy: -55, drag: 2.5, life: big ? 1.4 : 0.75, text: w, color: cols[Math.floor(Math.random() * cols.length)], font: big ? 30 : 15 });
  }

  floatText(x: number, y: number, text: string, color: string, size = 16) {
    this.particles.spawn(PK.Text, x, y, { vy: -38, drag: 1.5, life: 1.1, text, color, font: size });
  }

  coins(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      this.particles.spawn(PK.Coin, x, y, { vx: rand(-60, 60), vy: rand(-180, -100), gravity: 500, life: 0.7, size: 4.5, vr: 12 });
    }
  }

  confetti(x: number, y: number, n: number) {
    const cols = ['#ff4d6d', '#ffd23c', '#5ddc6a', '#4cc9ff', '#c77dff', '#ffffff'];
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = 100 + Math.random() * 300;
      this.particles.spawn(PK.Confetti, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, gravity: 300, drag: 1.5, life: 1.2 + Math.random() * 0.6, size: 4, color: cols[i % cols.length], vr: rand(-10, 10) });
    }
  }

  sparkles(x: number, y: number, n: number, color = '#fff3a8', spread = 30) {
    for (let i = 0; i < n; i++) {
      this.particles.spawn(PK.Star, x + rand(-spread, spread), y + rand(-spread * 1.5, spread * 0.5), { vy: rand(-60, -20), life: 0.6 + Math.random() * 0.4, size: 5 + Math.random() * 5, color, vr: rand(-4, 4) });
    }
  }

  smokePuff(x: number, y: number, n = 8) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      this.particles.spawn(PK.Smoke, x, y, { vx: Math.cos(a) * 60, vy: Math.sin(a) * 40 - 20, drag: 3, life: 0.6, size: 8, size2: 18 });
    }
  }

  clearCaches() {
    clearGloopCache();
    this.mapCanvas = null;
  }
}

function easeBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
