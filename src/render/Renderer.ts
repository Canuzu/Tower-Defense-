import type { Game } from '../game/Game';
import type { Tower } from '../game/Tower';
import type { Enemy, Projectile } from '../game/entities';
import { WORLD_H, WORLD_W } from '../game/maps';
import { TOWERS } from '../game/towers';
import { HEROES, type HeroId } from '../game/heroes';
import type { TowerId, OrbitAttack } from '../game/towerTypes';
import type { GloopId } from '../game/gloops';
import { SYNERGIES } from '../game/synergy';
import { TAU, rand, shade } from '../core/math';
import { renderMap, renderPaintedMap, BLEED, THEMES } from './mapArt';
import { gloopSprite, iceSprite, clearGloopCache } from './gloopArt';
import { towerSprite, beeShape, acornShape, ART_RADIUS, type ArtId } from './towerArt';
import { Particles, PK, glowSprite, SHARD_VARIANTS } from './particles';
import { star } from './draw';
import { t } from '../i18n';
import { mapArt } from './art';
import { clearSpriteCache, SV } from './spriteCache';
import { drawStar, drawStarShadow, pathStarShadow, starSprite, starSize, starCenterY } from './starView';
import { towerVis, towerSpriteOf, towerPose, drawTowerSprite, drawTowerShadow, drawTowerRing, towerTop, ghostSprite, restPose, TOWER_TUNING } from './towerView';
import { drawProjectileSprite, drawDroneSprite, drawOrbiterSprite, drawRunnerSprite, drawTrapSprite, drawDropSprite, drawCrateSprite, type Crate } from './projView';
import { Ambient } from './ambient';

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

interface Scheduled {
  at: number;
  fn: () => void;
}

/** Shatter shard palettes (default: the star's colour, accent and a lighter tint). */
const SHARD_PALETTE: Partial<Record<GloopId, string[]>> = {
  rainbow: ['#ff5a6e', '#ffb347', '#ffe94d', '#5dff8a', '#4dc3ff', '#b06bff'],
  zebra: ['#2a2440', '#bff3ff', '#7fe8ff', '#5b3d8f'],
  black: ['#3a2457', '#9b5cff', '#1c1230'],
  ceramic: ['#22c55e', '#7dffb0', '#16a34a', '#ffe066'],
  golden: ['#ffc61a', '#fff3a8', '#ffdf6b'],
  lead: ['#6e737d', '#9aa0aa', '#ff8a3c'],
  bad: ['#8a2be2', '#ffd23c', '#c18bff'],
  zomg: ['#59d630', '#ffcf3a', '#a6f27a'],
  bfb: ['#d8443a', '#8a7d7a', '#ff9a5a'],
  ddt: ['#1f2633', '#36f0ff', '#4b5568'],
  moab: ['#3fb8ff', '#c8f0ff', '#7ad8ff'],
};
const paletteCache = new Map<string, string[]>();
function shardPalette(type: string, color: string, accent: string): string[] {
  let p = paletteCache.get(type);
  if (!p) {
    p = SHARD_PALETTE[type as GloopId] ?? [color, shade(color, 0.3), color, accent];
    paletteCache.set(type, p);
  }
  return p;
}

const enemyZ = (e: Enemy) => e.y + e.radius * 0.9;
const towerZ = (tw: Tower) => tw.y + tw.radius * 0.35;
const byEnemyZ = (a: Enemy, b: Enemy) => enemyZ(a) - enemyZ(b);
const byTowerZ = (a: Tower, b: Tower) => towerZ(a) - towerZ(b);

/** Above this many stars the renderer switches to cheaper (unrotated, batched-shadow) drawing. */
const CROWD = 140;

/** How long projectiles take to blend from the raccoon's hand onto their true flight path. */
const MUZZLE_BLEND = 0.13;

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
  /** the current map uses its painted background */
  private painted = false;
  game: Game | null = null;
  particles = new Particles();
  ambient = new Ambient();
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
  private dt = 0;
  private crates: (Crate & { landed: boolean })[] = [];
  private fxQueue: Scheduled[] = [];
  private zEnemies: Enemy[] = [];
  private zTowers: Tower[] = [];
  /** many stars on screen: cheaper drawing paths */
  private crowded = false;
  /** projectile -> how far above its sim position it starts (raccoon hand height) */
  private muzzle = new WeakMap<Projectile, number>();

  constructor(readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  /** device px per world unit */
  get res() {
    return this.scale * this.dpr;
  }

  resize(w: number, h: number, dpr: number) {
    const d = Math.min(dpr, 2);
    if (d !== this.dpr) clearSpriteCache();
    this.dpr = d;
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
    this.crates = [];
    this.fxQueue = [];
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
    const stale = !this.mapCanvas || this.mapId !== g.map.id || res > this.mapRes * 1.04 || res < this.mapRes * 0.8;
    if (!stale) return;
    const art = mapArt(g.map.id);
    const changed = this.mapId !== g.map.id || this.painted !== !!art;
    this.painted = !!art;
    this.mapCanvas = art ? renderPaintedMap(art.img, art.img.naturalWidth || art.w, art.img.naturalHeight || art.h, res) : renderMap(g.map, g.paths, res);
    this.mapRes = res;
    this.mapId = g.map.id;
    if (changed) this.ambient.setMap(art ? g.map : null);
  }

  shake(p: number) {
    if (this.reducedEffects) p *= 0.4;
    this.shakePower = Math.min(18, Math.max(this.shakePower, p));
    this.shakeT = 0.35;
  }

  /** Run `fn` after `delay` seconds of render time (multi-stage effects). */
  later(delay: number, fn: () => void) {
    this.fxQueue.push({ at: this.time + delay, fn });
  }

  addBeam(kind: string, pts: number[], color: string, width: number) {
    const life = kind === 'orbital' ? 0.45 : kind === 'tongue' ? 0.22 : kind === 'strike' ? 0.18 : kind === 'lightning' ? 0.14 : 0.09;
    if ((kind === 'tracer' || kind === 'lightning' || kind === 'tongue') && this.game) {
      // start beams at the raccoon's weapon instead of its feet
      const m = this.muzzleOf(pts[0], pts[1]);
      if (m) {
        pts = pts.slice();
        pts[0] = m.x;
        pts[1] = m.y;
      }
    }
    const b: Beam = { kind, pts, color, width, life, max: life };
    if (kind === 'lightning' || kind === 'strike') b.jag = this.jagged(pts, kind === 'strike' ? 24 : 12);
    if (this.beams.length > 220) this.beams.shift();
    this.beams.push(b);
  }

  /** Muzzle point of the tower standing at (x, y) (beam origins sit 6-14 units above the spool). */
  private muzzleOf(x: number, y: number): { x: number; y: number } | null {
    for (const tw of this.game!.towers) {
      if (Math.abs(tw.x - x) > 0.5 || y > tw.y || y < tw.y - 16) continue;
      const spr = towerSpriteOf(tw);
      if (!spr) return null;
      const v = towerVis(tw);
      const S = TOWER_TUNING.spoolK * tw.radius;
      return { x: tw.x + (v.face || 1) * S * 0.22, y: tw.y - towerTop(spr, tw.radius) * 0.5 };
    }
    return null;
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
    this.dt = dt;
    this.particles.update(dt);
    for (const b of this.beams) b.life -= dt;
    this.beams = this.beams.filter((b) => b.life > 0);
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.damageFlash > 0) this.damageFlash -= dt;
    if (this.fxQueue.length) {
      const q = this.fxQueue;
      for (let i = 0; i < q.length; i++) {
        if (q[i].at <= this.time) {
          const fn = q[i].fn;
          q.splice(i--, 1);
          fn();
        }
      }
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const bd = g ? THEMES[g.map.theme].backdrop : '#203040';
    ctx.fillStyle = this.painted ? '#140e1e' : bd;
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
    ctx.imageSmoothingQuality = 'low';

    // map
    ctx.drawImage(this.mapCanvas!, -BLEED, -BLEED, WORLD_W + BLEED * 2, WORLD_H + BLEED * 2);
    if (this.painted) {
      this.ambient.update(dt, this.time, this.particles, this.reducedEffects);
      this.ambient.drawGround(ctx, this.time);
    } else this.drawMapAnim(ctx, g);

    // traps
    for (const tw of g.towers) {
      for (const tr of tw.traps) {
        const age = tr.maxLife - tr.life;
        if (!drawTrapSprite(ctx, tr.x, tr.y, tr.radius, tr.visual, tr.life / tr.maxLife, this.time, res, age)) this.drawTrap(ctx, tr.x, tr.y, tr.radius, tr.visual, tr.life / tr.maxLife);
      }
    }

    // ground layer: contact shadows, selection rings, bonds, range
    this.drawShadows(ctx, g);
    this.drawBonds(ctx, g);
    const sel = this.selected;
    if (sel && g.towers.includes(sel)) this.drawRange(ctx, sel.x, sel.y, sel.stats.range > 3000 ? 0 : sel.range, true, sel.stats.buffAura ? '#ffe066' : '#ffffff');
    for (const tw of g.towers) {
      if (tw === this.selected || tw === this.hover) drawTowerRing(ctx, tw.x, tw.y, tw.radius, this.time, tw === this.selected, tw.stats.buffAura ? '#ffe066' : '#fff1b8');
    }
    this.particles.drawGround(ctx);

    // runners (ghost raccoons skimming the track)
    for (const r of g.runners) {
      if (!drawRunnerSprite(ctx, r.x, r.y, r.angle, r.size, r.age, res, tx, ty)) this.drawRunner(ctx, r.x, r.y, r.angle, r.size);
      else if (!this.reducedEffects && Math.random() < 0.3) this.particles.spawn(PK.Spark, r.x + rand(-6, 6), r.y + rand(-10, 2), { life: 0.4, size: 6, color: '#5cffd1' });
    }

    // towers and stars, depth sorted
    this.drawSorted(ctx, g, res, tx, ty);
    ctx.setTransform(res, 0, 0, res, tx, ty);

    // drones
    for (const tw of g.towers) {
      for (const d of tw.drones) {
        if (!drawDroneSprite(ctx, d, res, tx, ty, this.dt, this.time)) this.drawDrone(ctx, d.x, d.y, d.angle, d.attack.visual, d.phase);
        else if (d.attack.visual === 'phoenix' && !this.reducedEffects && Math.random() < 0.5)
          this.particles.spawn(PK.Flame, d.x, d.y, { life: 0.4, size: 9, color: '#ff7a2f', vx: -Math.cos(d.angle) * 40, vy: -Math.sin(d.angle) * 40 });
      }
    }

    // projectiles
    this.drawProjectiles(ctx, g, res, tx, ty);

    // beams
    this.drawBeams(ctx);

    // particles
    this.particles.draw(ctx, this.scale, res, tx, ty);

    // loot drops
    for (const d of g.drops) {
      if (!drawDropSprite(ctx, d.x, d.y, d.t, d.collecting ? d.collectT : -1, d.value, this.time, res)) this.drawDrop(ctx, d.x, d.y, d.t, d.collecting ? d.collectT : -1, d.value);
    }
    // supply crates
    if (this.crates.length) this.drawCrates(ctx, res);

    if (this.painted) this.ambient.drawAir(ctx, this.time, this.reducedEffects);

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

  /** Soft contact shadows of towers and floating stars, under everything else. */
  private drawShadows(ctx: CanvasRenderingContext2D, g: Game) {
    for (const tw of g.towers) {
      if (towerSpriteOf(tw)) drawTowerShadow(ctx, tw.x, tw.y, tw.radius);
    }
    // soft shadows for normal crowds, one batched flat path for huge ones
    const crowded = g.enemies.length > CROWD;
    if (crowded) {
      ctx.fillStyle = 'rgba(18,10,30,0.22)';
      ctx.beginPath();
    }
    for (const e of g.enemies) {
      if (!e.alive) continue;
      if (e.x < -e.radius * 2 || e.x > WORLD_W + e.radius * 2) continue;
      if (crowded && !e.def.boss) pathStarShadow(ctx, e);
      else drawStarShadow(ctx, e, this.time);
    }
    if (crowded) ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawSorted(ctx: CanvasRenderingContext2D, g: Game, res: number, tx: number, ty: number) {
    const es = this.zEnemies;
    es.length = 0;
    this.crowded = g.enemies.length > CROWD;
    for (const e of g.enemies) {
      if (!e.alive) continue;
      const m = e.def.boss ? e.radius * 3 : e.radius * 2;
      if (e.x < -m || e.x > WORLD_W + m || e.y < -m || e.y > WORLD_H + m) continue;
      es.push(e);
    }
    es.sort(byEnemyZ);
    const ts = this.zTowers;
    ts.length = 0;
    for (const tw of g.towers) ts.push(tw);
    ts.sort(byTowerZ);
    ctx.imageSmoothingQuality = 'low';
    let i = 0;
    let j = 0;
    while (i < ts.length || j < es.length) {
      if (j >= es.length || (i < ts.length && towerZ(ts[i]) <= enemyZ(es[j]))) this.drawTower(ctx, ts[i++], res, tx, ty);
      else this.drawEnemy(ctx, es[j++], res, tx, ty);
    }
  }

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
    for (const tw of g.towers) {
      for (const b of tw.bonds) {
        const key = tw.id < b.other.id ? `${tw.id}-${b.other.id}` : `${b.other.id}-${tw.id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const syn = SYNERGIES.find((s) => s.id === b.synergyId)!;
        const focus = this.selected === tw || this.selected === b.other;
        this.drawBondLine(ctx, tw.x, tw.y - 14, b.other.x, b.other.y - 14, syn.color, focus ? 1 : 0.45);
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

  // --- stars ---------------------------------------------------------------------------------

  private drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy, res: number, tx: number, ty: number) {
    const spr = starSprite(e);
    if (spr) drawStar(ctx, e, spr, res, tx, ty, this.time, this.dt, this.crowded);
    else this.drawEnemyProcedural(ctx, e, res, tx, ty, this.time);
    // status particles
    if (this.reducedEffects || this.dt <= 0) return;
    const cy = spr ? starCenterY(e) : e.y;
    if (e.type === 'golden' && Math.random() < 0.5) this.particles.spawn(PK.Star, e.x + rand(-e.radius, e.radius), cy + rand(-e.radius, e.radius), { life: 0.5, size: 5, color: '#fff3a8', vy: -20 });
    if (e.burnT > 0 && Math.random() < 0.25) {
      this.particles.spawn(PK.Flame, e.x + rand(-e.radius, e.radius) * 0.6, cy - rand(0, e.radius), { vy: -40, life: 0.4, size: 7 + e.radius * 0.15, color: Math.random() < 0.5 ? '#ff7a2f' : '#ffd166' });
    }
    if (e.poisonT > 0 && Math.random() < 0.12) {
      this.particles.spawn(PK.Bubble, e.x + rand(-e.radius, e.radius) * 0.6, cy - e.radius * 0.5, { vy: -25, life: 0.6, size: 3, color: '#a3e635' });
    }
    if ((e.slowT > 0 && e.slowMul < 0.9) || e.auraSlow < 0.9) {
      if (Math.random() < 0.05) this.particles.spawn(PK.Snow, e.x + rand(-e.radius, e.radius), cy - e.radius, { vy: 20, life: 0.5, size: 1.8, color: '#e0f7ff' });
    }
    if (e.regrowMax && spr && Math.random() < 0.04) {
      this.particles.spawn(PK.Star, e.x + rand(-e.radius, e.radius), cy + rand(-e.radius, e.radius) * 0.6, { life: 0.6, size: 4, color: '#6dff9a', vy: -18 });
    }
  }

  /** Procedural fallback when a star has no painted sprite. */
  private drawEnemyProcedural(ctx: CanvasRenderingContext2D, e: Enemy, res: number, tx: number, ty: number, t: number) {
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
    const px = e.x * res + tx;
    const py = (e.y - hop) * res + ty;
    ctx.setTransform(res * sx * facing, 0, 0, res * sy, px, py);
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
    }
  }

  private drawBossBar(ctx: CanvasRenderingContext2D, e: Enemy) {
    const spr = starSprite(e);
    const top = spr ? starSize(e, spr).body * 0.5 + e.radius * 0.1 : e.radius;
    const w = Math.max(64, e.radius * 1.7);
    const x = e.x - w / 2;
    const y = e.y - top - 20;
    const f = Math.max(0, e.hp / e.maxHp);
    ctx.fillStyle = 'rgba(22,12,34,0.82)';
    roundRectPath(ctx, x - 3, y - 3, w + 6, 13, 6.5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,236,170,0.85)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    const col = f > 0.5 ? '#5ddc6a' : f > 0.25 ? '#ffd23c' : '#ff4d4d';
    const grad = ctx.createLinearGradient(0, y, 0, y + 7);
    grad.addColorStop(0, shade(col, 0.35));
    grad.addColorStop(1, shade(col, -0.15));
    ctx.fillStyle = grad;
    roundRectPath(ctx, x, y, Math.max(0.1, w * f), 7, 3.5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(x + 2, y + 1, Math.max(0, w * f - 4), 2);
  }

  // --- towers --------------------------------------------------------------------------------

  private artOf(tw: Tower): { id: ArtId; tiers: number[] } {
    if (tw.hero) {
      const L = tw.heroLevel >= 20 ? 20 : tw.heroLevel >= 10 ? 10 : 1;
      return { id: tw.hero.id as ArtId, tiers: [L] };
    }
    return { id: tw.def!.id as ArtId, tiers: [...tw.tiers] };
  }

  private drawTower(ctx: CanvasRenderingContext2D, tw: Tower, res: number, tx: number, ty: number) {
    const spr = towerSpriteOf(tw);
    const v = towerVis(tw);
    if (!spr) {
      v.spr = null;
      this.drawTowerProcedural(ctx, tw, res, tx, ty);
      return;
    }
    if (v.spr && v.spr !== spr) this.transformBurst(tw);
    v.spr = spr;
    const p = towerPose(tw, v, this.dt, this.time, this.game?.time ?? 0);
    drawTowerSprite(ctx, spr, tw.x, tw.y, tw.radius, p, res, tx, ty);
    const top = towerTop(spr, tw.radius);
    // zap: crackle around the coil when it fires
    if (tw.typeId === 'zap' && tw.fireAnim < 0.22) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - tw.fireAnim / 0.22) * 0.7;
      const s = tw.radius * 1.6;
      ctx.drawImage(glowSprite('#7bdff2'), tw.x - s, tw.y - top * 0.62 - s, s * 2, s * 2);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }
    this.drawOrbiters(ctx, tw, res, tx, ty);
    if (tw.isHero) this.drawHeroBadge(ctx, tw.x + TOWER_TUNING.spoolK * tw.radius * 0.42, tw.y - top * 0.8, tw.heroLevel);
    this.abilitySparkle(tw, top);
  }

  private abilitySparkle(tw: Tower, top: number) {
    if (this.dt <= 0) return;
    for (const ab of tw.stats.abilities) {
      if ((tw.abilityCd.get(ab.id) ?? 0) <= 0) {
        if (Math.random() < 0.05) this.particles.spawn(PK.Star, tw.x + rand(-tw.radius, tw.radius), tw.y - rand(0, top), { life: 0.6, size: 5, color: '#fff3a8', vy: -15 });
        break;
      }
    }
  }

  /** Big celebratory burst when a tower's look changes (tier 3/4/5, hero stage). */
  private transformBurst(tw: Tower) {
    const v = towerVis(tw);
    v.burst = 1;
    const spr = towerSpriteOf(tw);
    const top = towerTop(spr, tw.radius);
    const cx = tw.x;
    const cy = tw.y - top * 0.45;
    const S = TOWER_TUNING.spoolK * tw.radius;
    const P = this.particles;
    P.spawn(PK.Rays, cx, cy, { life: 0.85, size: top * 0.55, size2: top * 0.5, vr: 1.4 });
    P.spawn(PK.Flash, cx, cy, { life: 0.4, size: top * 0.4, size2: top * 0.6, color: '#ffe27a' });
    P.spawn(PK.GroundRing, tw.x, tw.y + S * 0.12, { life: 0.6, size: S * 0.4, size2: S * 1.5, color: '#ffe27a' });
    P.spawn(PK.GroundRing, tw.x, tw.y + S * 0.12, { life: 0.9, size: S * 0.3, size2: S * 2.2, color: '#ffffff' });
    if (this.reducedEffects) return;
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * TAU;
      const sp = 60 + Math.random() * 160;
      P.spawn(PK.Star, cx + Math.cos(a) * 10, cy + Math.sin(a) * 10, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, drag: 2.5, life: 0.6 + Math.random() * 0.5, size: 5 + Math.random() * 6, color: i % 3 ? '#ffe27a' : '#ffffff', vr: rand(-3, 3) });
    }
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + rand(-1.3, 1.3);
      const sp = 140 + Math.random() * 160;
      P.shard(cx, cy, Math.cos(a) * sp, Math.sin(a) * sp, 0.7 + Math.random() * 0.3, 5 + Math.random() * 4, i % 2 ? '#ffd23c' : '#fff3a8', rand(-12, 12), i % SHARD_VARIANTS, 520);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      P.spawn(PK.Smoke, tw.x + Math.cos(a) * S * 0.4, tw.y + S * 0.1 + Math.sin(a) * S * 0.15, { vx: Math.cos(a) * 50, vy: Math.sin(a) * 18 - 10, drag: 2.5, life: 0.6, size: 7, size2: 16 });
    }
  }

  /** Gold coin badge with the hero level. */
  private drawHeroBadge(ctx: CanvasRenderingContext2D, x: number, y: number, level: number) {
    const r = Math.max(9, 8 / this.scale);
    const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    grad.addColorStop(0, '#fff6c4');
    grad.addColorStop(0.45, '#ffd23c');
    grad.addColorStop(1, '#c47f0e');
    ctx.beginPath();
    ctx.arc(x, y + r * 0.12, r * 1.04, 0, TAU);
    ctx.fillStyle = 'rgba(40,20,10,0.45)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = r * 0.16;
    ctx.strokeStyle = '#6b3c06';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, r * 0.74, 0, TAU);
    ctx.lineWidth = r * 0.08;
    ctx.strokeStyle = 'rgba(150,90,10,0.7)';
    ctx.stroke();
    ctx.font = `900 ${r * 1.15}px "Baloo 2", system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(String(level), x, y + r * 0.14);
    ctx.fillStyle = '#5a2e02';
    ctx.fillText(String(level), x, y + r * 0.06);
  }

  private drawOrbiters(ctx: CanvasRenderingContext2D, tw: Tower, res: number, tx: number, ty: number) {
    for (const a of tw.stats.attacks) {
      if (a.kind !== 'orbit') continue;
      const o = a as OrbitAttack;
      for (let i = 0; i < o.count; i++) {
        const ang = tw.orbitPhase + (i / o.count) * TAU;
        const x = tw.x + Math.cos(ang) * o.orbitRadius;
        const y = tw.y + Math.sin(ang) * o.orbitRadius * 0.85 - 8;
        if (!drawOrbiterSprite(ctx, o.visual, x, y, ang, o.size, res, tx, ty)) {
          ctx.save();
          ctx.globalCompositeOperation = 'lighter';
          ctx.drawImage(glowSprite('#7dffb0'), x - o.size * 1.4, y - o.size * 1.4, o.size * 2.8, o.size * 2.8);
          ctx.restore();
          ctx.beginPath();
          ctx.arc(x, y, o.size * 0.45, 0, TAU);
          ctx.fillStyle = '#eafff4';
          ctx.fill();
        }
        if (this.dt > 0 && Math.random() < 0.2 && !this.reducedEffects) this.particles.spawn(PK.Spark, x, y, { life: 0.35, size: 5, color: '#5cffd1' });
      }
    }
  }

  /** Procedural fallback when a tower has no painted sprite. */
  private drawTowerProcedural(ctx: CanvasRenderingContext2D, tw: Tower, res: number, tx: number, ty: number) {
    const art = this.artOf(tw);
    const spr = towerSprite(art.id, art.tiers, res);
    const age = (this.game?.time ?? 0) - tw.placedAt;
    let s = 1;
    if (age < 0.35) s = 0.4 + easeBack(age / 0.35) * 0.6;
    if (tw.upgradeFlash > 0) s *= 1 + Math.sin(tw.upgradeFlash * Math.PI) * 0.18;
    const breathe = 1 + Math.sin(this.time * 2.2 + tw.id) * 0.015;
    const fire = tw.fireAnim < 0.14 ? (1 - tw.fireAnim / 0.14) * 0.08 : 0;
    const sx = s * (1 + fire) * tw.facing;
    const sy = s * (breathe - fire);
    ctx.setTransform(res * sx, 0, 0, res * sy, tw.x * res + tx, (tw.y + tw.radius * 0.3) * res + ty);
    ctx.drawImage(spr.canvas, -spr.w / 2, -spr.h * (spr.ay ?? 0.5) - tw.radius * 0.3, spr.w, spr.h);
    ctx.setTransform(res, 0, 0, res, tx, ty);
    this.drawTowerDynamic(ctx, tw);
    this.drawOrbiters(ctx, tw, res, tx, ty);
    if (tw.upgradeFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = tw.upgradeFlash * 0.8;
      ctx.drawImage(glowSprite('#ffe066'), tw.x - tw.radius * 2.2, tw.y - tw.radius * 3, tw.radius * 4.4, tw.radius * 4.4);
      ctx.restore();
    }
    if (tw.isHero) this.drawHeroBadge(ctx, tw.x + tw.radius * 0.95, tw.y - tw.radius * 1.9, tw.heroLevel);
    this.abilitySparkle(tw, tw.radius * 2.5);
  }

  /** Moving parts of the procedural towers (barrels, staffs). Painted sprites already show them. */
  private drawTowerDynamic(ctx: CanvasRenderingContext2D, tw: Tower) {
    const r = tw.radius;
    const id = tw.typeId;
    const recoil = tw.fireAnim < 0.12 ? (1 - tw.fireAnim / 0.12) * 6 : 0;
    if (id === 'boomer') {
      const x = tw.x;
      const y = tw.y - r * 1.25;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tw.angle);
      const L = Math.max(...tw.tiers);
      const len = r * (0.95 + (tw.tiers[0] >= 3 ? 0.2 : 0)) - recoil;
      const wd = r * (0.32 + tw.tiers[0] * 0.03);
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
      ctx.translate(tw.x + tw.facing * r * 0.25, tw.y - r * 0.75);
      ctx.rotate(tw.angle);
      const len = r * 1.6 - recoil;
      ctx.fillStyle = '#2a2433';
      roundRectPath(ctx, -r * 0.3, -4.5, len + r * 0.3, 9, 3);
      ctx.fill();
      ctx.fillStyle = tw.tiers[0] >= 5 ? '#e0b43a' : '#6b4226';
      roundRectPath(ctx, -r * 0.3, -3, r * 0.7, 6, 2);
      ctx.fill();
      ctx.fillStyle = '#7d8796';
      ctx.fillRect(r * 0.4, -2, len - r * 0.4, 4);
      ctx.fillStyle = '#2a2433';
      ctx.fillRect(r * 0.3, -8, r * 0.5, 4);
      ctx.restore();
      if (tw.fireAnim < 0.06) {
        const mx = tw.x + tw.facing * r * 0.25 + Math.cos(tw.angle) * r * 1.7;
        const my = tw.y - r * 0.75 + Math.sin(tw.angle) * r * 1.7;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(glowSprite('#ffd166'), mx - 14, my - 14, 28, 28);
        ctx.restore();
      }
    } else if (id === 'nova') {
      ctx.save();
      ctx.translate(tw.x + tw.facing * r * 0.3, tw.y - r * 0.6);
      ctx.rotate(tw.angle);
      ctx.fillStyle = '#2a2433';
      roundRectPath(ctx, -2, -4, r * 0.9 - recoil * 0.5, 8, 3);
      ctx.fill();
      ctx.fillStyle = '#9b7bff';
      roundRectPath(ctx, 0, -2.5, r * 0.85 - recoil * 0.5, 5, 2);
      ctx.fill();
      ctx.restore();
    } else if (id === 'ember') {
      const ox = tw.x - r * 0.98 * tw.facing;
      const oy = tw.y - r * 1.67;
      const pulse = 0.6 + Math.sin(this.time * 5 + tw.id) * 0.25 + (tw.fireAnim < 0.2 ? 0.5 : 0);
      const col = tw.tiers[0] >= 1 ? '#ff7a2f' : tw.tiers[1] >= 1 ? '#7b9cff' : tw.tiers[2] >= 1 ? '#7dffb0' : '#5ce1ff';
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(1, pulse);
      ctx.drawImage(glowSprite(col), ox - 16, oy - 16, 32, 32);
      ctx.restore();
    } else if (id === 'zap' && tw.fireAnim < 0.25) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 1 - tw.fireAnim / 0.25;
      ctx.drawImage(glowSprite('#7bdff2'), tw.x - r * 1.6, tw.y - r * 2.2, r * 3.2, r * 3.2);
      ctx.restore();
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

  // --- projectiles ---------------------------------------------------------------------------

  /** Height above the sim position a projectile is drawn at (blends from the hand to the path). */
  private liftOf(p: Projectile): number {
    let m = this.muzzle.get(p);
    if (m === undefined) {
      m = 0;
      const o = p.owner;
      // only shots that leave the tower itself (not drone shots or splits)
      if (o && Math.abs(p.x - o.x) + Math.abs(p.y - o.y) < 20 + p.age * p.speed * 1.5) {
        const spr = towerSpriteOf(o);
        if (spr) m = towerTop(spr, o.radius) * 0.5;
      }
      this.muzzle.set(p, m);
    }
    return m > 0 && p.age < MUZZLE_BLEND ? m * (1 - p.age / MUZZLE_BLEND) ** 2 : 0;
  }

  private drawProjectiles(ctx: CanvasRenderingContext2D, g: Game, res: number, tx: number, ty: number) {
    for (const p of g.projectiles) {
      if (!p.alive) continue;
      const lift = this.liftOf(p);
      const ok = drawProjectileSprite(ctx, p, res, tx, ty, this.reducedEffects, lift);
      if (!ok) this.drawProjectileProcedural(ctx, p, lift);
      if (ok && !this.reducedEffects && this.dt > 0) {
        const v = p.def.visual;
        if ((v === 'missile' || v === 'bigmissile') && Math.random() < 0.5) {
          const k = v === 'bigmissile' ? 1.6 : 1;
          this.particles.spawn(PK.Smoke, p.x - Math.cos(p.rot) * 14 * k, p.y - lift - Math.sin(p.rot) * 14 * k, { life: 0.5, size: 3 * k, size2: 8 * k });
        } else if ((v === 'fireball' || v === 'firebolt') && Math.random() < 0.35) {
          this.particles.spawn(PK.Flame, p.x - Math.cos(p.rot) * 10, p.y - lift - Math.sin(p.rot) * 10, { life: 0.3, size: 7, color: Math.random() < 0.5 ? '#ff7a2f' : '#ffd166', vx: rand(-15, 15), vy: rand(-25, 5) });
        } else if ((v === 'bomb' || v === 'minibomb') && Math.random() < 0.4) {
          this.particles.spawn(PK.Spark, p.x + rand(-3, 3), p.y - lift - 8, { life: 0.25, size: 5, color: '#ffb347', vy: -20 });
        }
      }
    }
    ctx.setTransform(res, 0, 0, res, tx, ty);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  /** Procedural projectile (beams of light, flames, lasers and any visual without a sprite). */
  private drawProjectileProcedural(ctx: CanvasRenderingContext2D, p: Projectile, lift: number) {
    const v = p.def.visual;
    const size = p.def.size ?? 1;
    ctx.save();
    ctx.translate(p.x, p.y - lift);
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
        if (Math.random() < 0.6) this.particles.spawn(PK.Smoke, p.x - Math.cos(p.rot) * 12 * k, p.y - Math.sin(p.rot) * 12 * k, { life: 0.5, size: 3 * k, size2: 8 * k });
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
          v === 'bolt' ? '#c77dff' : v === 'star' ? '#c9b8ff' : v === 'spirit' ? '#5cffd1' : v === 'laser' ? '#ff9a3c' : v === 'flame' ? '#ff9f1c' : '#ff7a2f';
        ctx.globalCompositeOperation = 'lighter';
        if (v === 'laser') {
          // Cosmo's ray gun: hot orange bolt with a white core
          ctx.drawImage(glowSprite(col), -18, -9, 30, 18);
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
          if (!this.reducedEffects && Math.random() < 0.5) this.particles.spawn(PK.Spark, p.x, p.y, { life: 0.3, size: v === 'fireball' ? 12 : 7, color: col, vx: rand(-20, 20), vy: rand(-20, 20) });
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
        ctx.fillStyle = '#7dff5a';
        ctx.fillRect(-5 * size, -1, 3 * size, 2);
        break;
      case 'feather':
        // bottle cap
        ctx.rotate(p.age * 12);
        ctx.beginPath();
        ctx.arc(0, 0, 5, 0, TAU);
        ctx.fillStyle = '#e63946';
        ctx.fill();
        ctx.strokeStyle = '#7a1420';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
    }
    ctx.restore();
  }

  private drawBeams(ctx: CanvasRenderingContext2D) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const b of this.beams) {
      const t = b.life / b.max;
      const pts = b.jag ?? b.pts;
      if (b.kind === 'tongue') {
        // Grabby Claw: a telescoping steel arm with a three-finger claw
        const f = t > 0.5 ? (1 - t) * 2 : t * 2;
        const x0 = b.pts[0];
        const y0 = b.pts[1];
        const x1 = x0 + (b.pts[2] - x0) * f;
        const y1 = y0 + (b.pts[3] - y0) * f;
        const ang = Math.atan2(b.pts[3] - y0, b.pts[2] - x0);
        ctx.strokeStyle = '#2a2433';
        ctx.lineWidth = b.width + 3;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
        ctx.strokeStyle = '#b8c2d0';
        ctx.lineWidth = b.width * 0.8;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([5, 7]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.save();
        ctx.translate(x1, y1);
        ctx.rotate(ang);
        const open = 0.35 + (1 - f) * 0.5;
        for (const s of [-1, 0, 1]) {
          ctx.save();
          ctx.rotate(s * open);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(9, 0);
          ctx.lineTo(13, s === 0 ? 0 : -s * 3);
          ctx.strokeStyle = '#2a2433';
          ctx.lineWidth = 4.5;
          ctx.stroke();
          ctx.strokeStyle = '#ffd23c';
          ctx.lineWidth = 2.2;
          ctx.stroke();
          ctx.restore();
        }
        ctx.beginPath();
        ctx.arc(0, 0, 4.5, 0, TAU);
        ctx.fillStyle = '#e63946';
        ctx.fill();
        ctx.strokeStyle = '#2a2433';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();
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

  private drawCrates(ctx: CanvasRenderingContext2D, res: number) {
    for (let i = 0; i < this.crates.length; i++) {
      const c = this.crates[i];
      c.t += this.dt;
      if (!c.landed && c.t >= 1.1) {
        c.landed = true;
        this.smokePuff(c.x, c.y, 10);
        this.particles.spawn(PK.GroundRing, c.x, c.y, { life: 0.5, size: 10, size2: 60, color: '#fff1b8' });
      }
      if (c.landed && c.t >= 1.5 && c.t - this.dt < 1.5) {
        this.coins(c.x, c.y - 20, 10);
        this.sparkles(c.x, c.y - 20, 10, '#ffe066', 24);
      }
      if (c.t > 1.9) {
        this.crates.splice(i--, 1);
        continue;
      }
      if (!drawCrateSprite(ctx, c, res)) {
        this.crates.splice(i--, 1);
      }
    }
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
      ctx.arc(gh.x, gh.y, g.bondRange, 0, TAU);
      ctx.strokeStyle = 'rgba(255,230,120,0.25)';
      ctx.setLineDash([3, 9]);
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const spr = ghostSprite(gh.kind, gh.id);
    if (spr) {
      drawTowerShadow(ctx, gh.x, gh.y, def.radius, gh.valid ? 0.7 : 0.4);
      const p = restPose(1);
      p.alpha = gh.valid ? 0.78 : 0.62;
      p.variant = gh.valid ? SV.Normal : SV.Red;
      p.hop = -3 - Math.sin(this.time * 4) * 2;
      drawTowerSprite(ctx, spr, gh.x, gh.y, def.radius, p, res, tx, ty);
      if (!gh.valid) {
        const r = def.radius;
        const cy = gh.y + TOWER_TUNING.spoolK * r * 0.12;
        ctx.beginPath();
        ctx.ellipse(gh.x, cy, r * 1.4, r * 0.56, 0, 0, TAU);
        ctx.strokeStyle = '#ff4d4d';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      return;
    }
    const art = gh.id as ArtId;
    const pspr = towerSprite(art, isHero ? [1] : [0, 0, 0], res);
    const r = ART_RADIUS[art] ?? def.radius;
    ctx.setTransform(res, 0, 0, res, gh.x * res + tx, gh.y * res + ty);
    ctx.globalAlpha = gh.valid ? 0.85 : 0.5;
    ctx.drawImage(pspr.canvas, -pspr.w / 2, -pspr.h * (pspr.ay ?? 0.5), pspr.w, pspr.h);
    ctx.globalAlpha = 1;
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

  /** Crystal shatter of a star (bosses get the big multi-stage version). */
  shatter(e: Enemy) {
    const spr = starSprite(e);
    const cy = spr ? starCenterY(e) : e.y;
    const pal = shardPalette(e.type, e.def.color, e.def.accent);
    if (e.def.boss) this.bossShatter(e.x, cy, e.radius, pal);
    else this.shatterAt(e.x, cy, e.radius, pal);
  }

  /** Legacy name used by the menu demo: shatter at a point with a single colour. */
  splat(x: number, y: number, color: string, r: number, big = false) {
    const pal = shardPalette(color, color, shade(color, 0.45));
    if (big) this.bossShatter(x, y, r, pal);
    else this.shatterAt(x, y, r, pal);
  }

  private shatterAt(x: number, y: number, r: number, pal: string[]) {
    const P = this.particles;
    const load = P.list.length;
    const busy = load > 900;
    // fewer shards the more is already flying, so constant streams of pops stay readable
    const n = this.reducedEffects ? 3 : busy ? 2 : load > 450 ? 4 : 5 + ((Math.random() * 2) | 0);
    const a0 = Math.random() * TAU;
    for (let i = 0; i < n; i++) {
      // evenly spread directions with jitter so the star visibly bursts apart
      const a = a0 + (i / n) * TAU + rand(-0.35, 0.35);
      const sp = 110 + Math.random() * 130;
      P.shard(x + Math.cos(a) * r * 0.3, y + Math.sin(a) * r * 0.3, Math.cos(a) * sp, Math.sin(a) * sp - 70, 0.34 + Math.random() * 0.2, r * (0.36 + Math.random() * 0.22), pal[i % pal.length], rand(-12, 12), (Math.random() * SHARD_VARIANTS) | 0, 520);
    }
    if (busy) return;
    P.spawn(PK.Flash, x, y, { life: 0.14, size: r * 0.5, size2: r * 1.2, color: pal[1] ?? pal[0] });
    if (load > 450) return;
    P.spawn(PK.Ring, x, y, { life: 0.2, size: r * 0.5, size2: r * 1.8, color: '#ffffff' });
    if (this.reducedEffects) return;
    for (let i = 0; i < 2; i++) {
      P.spawn(PK.Star, x + rand(-r, r) * 0.6, y + rand(-r, r) * 0.6, { vy: rand(-50, -15), vx: rand(-25, 25), life: 0.3 + Math.random() * 0.2, size: 4 + Math.random() * 4, color: '#ffffff' });
    }
  }

  private bossShatter(x: number, y: number, r: number, pal: string[]) {
    const P = this.particles;
    const red = this.reducedEffects;
    this.shake(red ? 6 : 14);
    P.spawn(PK.Flash, x, y, { life: 0.5, size: r * 0.8, size2: r * 2.6, color: '#ffffff' });
    P.spawn(PK.Ring, x, y, { life: 0.45, size: r * 0.6, size2: r * 3.2, color: '#ffffff' });
    P.spawn(PK.GroundRing, x, y + r * 0.8, { life: 0.8, size: r * 0.6, size2: r * 3.5, color: pal[1] ?? '#ffffff' });
    const burst = (count: number, speed: number, size: number) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU;
        const sp = speed * (0.5 + Math.random());
        P.shard(x + Math.cos(a) * r * 0.5, y + Math.sin(a) * r * 0.5, Math.cos(a) * sp, Math.sin(a) * sp - 120, 0.8 + Math.random() * 0.6, size * (0.6 + Math.random() * 0.8), pal[i % pal.length], rand(-10, 10), (Math.random() * SHARD_VARIANTS) | 0, 520);
      }
    };
    burst(red ? 12 : 36, 300, r * 0.3);
    if (red) return;
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * TAU;
      const sp = 80 + Math.random() * 260;
      P.spawn(PK.Star, x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, drag: 2, life: 0.6 + Math.random() * 0.5, size: 6 + Math.random() * 8, color: i % 2 ? '#ffffff' : pal[1] ?? '#ffffff', vr: rand(-4, 4) });
    }
    this.later(0.14, () => {
      P.spawn(PK.Flash, x, y, { life: 0.35, size: r * 0.5, size2: r * 1.8, color: pal[0] });
      P.spawn(PK.Ring, x, y, { life: 0.4, size: r * 0.4, size2: r * 2.4, color: pal[1] ?? '#ffffff' });
      burst(22, 220, r * 0.24);
    });
    this.later(0.3, () => {
      for (let i = 0; i < 14; i++) {
        P.spawn(PK.Glitter, x + rand(-r, r) * 1.6, y + r * 0.6 + rand(-r, r) * 0.6, { ground: true, life: 1.2 + Math.random() * 0.8, size: 5 + Math.random() * 6, color: pal[i % pal.length], rot: Math.random() * 10 });
      }
      for (let i = 0; i < 6; i++) P.spawn(PK.Smoke, x + rand(-r, r) * 0.6, y + rand(-r, r) * 0.4, { vy: -25, life: 0.9, size: r * 0.3, size2: r * 0.6 });
    });
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
        this.particles.shard(x, y, Math.cos(a) * 150, Math.sin(a) * 150, 0.4, 5, '#d8f6ff', 8, i % SHARD_VARIANTS, 0);
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
    const words = big ? ['KA-BLAM!', 'MEGA POP!', 'SHATTER-TASTIC!'] : ['POP!', 'CRACK!', 'SMASH!', 'CLINK!', 'ZING!'];
    const cols = ['#ffe066', '#ff8fab', '#7bdff2', '#b5e48c', '#ffffff', '#ffb347'];
    const w = t(words[Math.floor(Math.random() * words.length)]);
    this.particles.spawn(PK.Text, x + rand(-8, 8), y, { vy: -55, drag: 2.5, life: big ? 1.4 : 0.75, text: w, color: cols[Math.floor(Math.random() * cols.length)], font: big ? 30 : 15 });
  }

  floatText(x: number, y: number, text: string, color: string, size = 16) {
    this.particles.spawn(PK.Text, x, y, { vy: -38, drag: 1.5, life: 1.1, text, color, font: size });
  }

  coins(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      this.particles.spawn(PK.Coin, x, y, { vx: rand(-60, 60), vy: rand(-180, -100), gravity: 500, life: 0.7, size: 5, vr: 12 });
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

  /** Placement: dust ring at the spool and a few sparkles. */
  placeFx(tw: Tower) {
    const S = TOWER_TUNING.spoolK * tw.radius;
    const by = tw.y + S * 0.12;
    this.particles.spawn(PK.GroundRing, tw.x, by, { life: 0.45, size: S * 0.45, size2: S * 1.25, color: '#fff1d0' });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + Math.random() * 0.3;
      this.particles.spawn(PK.Smoke, tw.x + Math.cos(a) * S * 0.45, by + Math.sin(a) * S * 0.16, { vx: Math.cos(a) * 70, vy: Math.sin(a) * 22 - 8, drag: 3, life: 0.55, size: 6, size2: 13 });
    }
    if (!this.reducedEffects) this.sparkles(tw.x, tw.y - S * 0.6, 6, '#ffffff', S * 0.4);
  }

  /** Upgrade: golden sparkle burst and a ring on the ground. */
  upgradeFx(tw: Tower) {
    const S = TOWER_TUNING.spoolK * tw.radius;
    const top = towerTop(towerSpriteOf(tw), tw.radius);
    this.particles.spawn(PK.GroundRing, tw.x, tw.y + S * 0.12, { life: 0.55, size: S * 0.35, size2: S * 1.4, color: '#ffd23c' });
    this.particles.spawn(PK.Flash, tw.x, tw.y - top * 0.45, { life: 0.3, size: top * 0.25, size2: top * 0.45, color: '#ffe27a' });
    if (this.reducedEffects) return;
    for (let i = 0; i < 14; i++) {
      const a = -Math.PI / 2 + rand(-1.4, 1.4);
      const sp = 50 + Math.random() * 120;
      this.particles.spawn(PK.Star, tw.x + rand(-S, S) * 0.35, tw.y - top * rand(0.2, 0.8), { vx: Math.cos(a) * sp * 0.5, vy: Math.sin(a) * sp, drag: 2, life: 0.6 + Math.random() * 0.4, size: 4 + Math.random() * 5, color: i % 3 ? '#ffe27a' : '#ffffff', vr: rand(-4, 4) });
    }
  }

  /** Supply Drop ability: a parachute crate lands next to the tower. */
  dropCrate(x: number, y: number) {
    this.crates.push({ x, y, t: 0, landed: false });
  }

  clearCaches() {
    clearGloopCache();
    clearSpriteCache();
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
