import type { Game } from '../game/Game';
import type { Tower } from '../game/Tower';
import type { Renderer } from '../render/Renderer';
import { TOWERS, TOWER_ORDER } from '../game/towers';
import { HEROES, heroXpFor, MAX_HERO_LEVEL, type HeroId } from '../game/heroes';
import { canTier, type TowerId, type AbilityDef } from '../game/towerTypes';
import { TARGET_PRIORITIES, type TargetPriority } from '../game/types';
import { SYNERGIES } from '../game/synergy';
import { GLOOP_ORDER, GLOOPS, type GloopId } from '../game/gloops';
import { towerIconUrl, abilityIconUrl, heroStage } from '../render/art';
import { formatNum } from '../core/math';
import { audio } from '../audio/audio';
import { h, clear, setText, toggle } from './dom';
import { haptic } from './haptics';
import { t as tr } from '../i18n';
import { modal, btn, chip, uiIcon, img, bar, closeBtn, restartIcon, bump, reducedMotion, watchScroll, towerPortraitUrl, heroPortraitUrl, starPortraitUrl, MEDAL, MEDAL_EMOJI } from './kit';

/** Accent per upgrade path (generic tier icons, pips). */
const PATH_COLOR = ['#ff8a3c', '#3fb2ff', '#5bdc5a'];
const HERO_LOOK_LEVELS = [1, 7, 14];

/** Outlined glyphs drawn like the painted icons (ink stroke under a light stroke). */
function glyph(d: string, w = 7, fill = '#fff6d6', cls = 'ico svg-ico'): HTMLElement {
  return h('span', {
    class: cls,
    'aria-hidden': 'true',
    html: `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="${d}" fill="none" stroke="#120a2b" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${fill}" stroke-width="${(w * 0.46).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  });
}
const CHEVRONS = ['M6 15.5 12 9.5l6 6', 'M6 11.5 12 5.5l6 6M6 18.5l6-6 6 6'];
const ARROW_L = 'M14.5 5 8 12l6.5 7';
const ARROW_R = 'M9.5 5 16 12l-6.5 7';
const BOLT_SVG =
  '<svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true"><path d="M13.5 2 5 13.5h6L9.5 22 19 9.8h-6.2z" fill="#ffd23c" stroke="#120a2b" stroke-width="2.6" stroke-linejoin="round"/><path d="M12.6 4.6 7.6 11.6" stroke="#fff6c8" stroke-width="1.6" stroke-linecap="round"/></svg>';

export interface HudHost {
  playerLevel: number;
  devUnlock: boolean;
  onQuit(): void;
  onRestart(): void;
  onRetryRound(): void;
  /** fromPause: the settings modal returns to the pause menu when closed */
  onSettings(fromPause: boolean): void;
  onRoundEnd(round: number): void;
  onVictory(): void;
  onDefeat(): void;
  onTutorialDone(): void;
  tutorial: boolean;
  heroId: HeroId | null;
  /** bandit progression: per-tower XP and unlocking upgrade tiers with it */
  progress: {
    xp(id: TowerId): number;
    /** XP price of the next locked tier on that path, null when fully unlocked */
    nextCost(id: TowerId, path: number): number | null;
    /** spend XP to unlock the next tier; true on success */
    unlock(id: TowerId, path: number): boolean;
  };
  /** true the first time a boss type ever appears (its intro banner is shown only then) */
  firstBoss(type: string): boolean;
}

interface Placing {
  kind: 'tower' | 'hero';
  id: TowerId | HeroId;
  dragging: boolean;
  fromCard: boolean;
  startX: number;
  startY: number;
  moved: boolean;
  pointerType: string;
}

const PRIORITY_LABEL: Record<TargetPriority, string> = { first: 'First', last: 'Last', strong: 'Strong', close: 'Close' };
const prio = (p: TargetPriority) => tr(PRIORITY_LABEL[p]);

export class Hud {
  readonly root: HTMLElement;
  private cashEl!: HTMLElement;
  private livesEl!: HTMLElement;
  private livesPill!: HTMLElement;
  private cashPill!: HTMLElement;
  private roundEl!: HTMLElement;
  private roundSub!: HTMLElement;
  private frenzyEl!: HTMLElement;
  private frenzyFill!: HTMLElement;
  private frenzyLbl!: HTMLElement;
  private comboEl!: HTMLElement;
  private playBtn!: HTMLButtonElement;
  private autoToggle!: HTMLElement;
  private cards = new Map<string, HTMLElement>();
  private panel: HTMLElement | null = null;
  private panelFor: Tower | null = null;
  private panelKey = '';
  private abilitiesEl!: HTMLElement;
  private abilityKey = '';
  private abilityBtns: { el: HTMLElement; cd: HTMLElement; n: HTMLElement; time: HTMLElement; id: string; towers: Tower[]; ab: AbilityDef; state: string }[] = [];
  private speedBtn!: HTMLButtonElement;
  private speedLbl!: HTMLElement;
  private playIco!: HTMLElement;
  private playLbl!: HTMLElement;
  private playState = '';
  private shownCash = -1;
  private lastBump = 0;
  private toastEl: HTMLElement | null = null;
  private toastTimer = 0;
  private handEl: HTMLElement | null = null;
  private placing: Placing | null = null;
  private lastCash = -1;
  private lastLives = -1;
  private lastCombo = 0;
  private modalOpen = false;
  /** what Escape / Android back does with the open modal */
  private modalDismiss: (() => void) | 'locked' | null = null;
  private tutorialStep = 0;
  private unsub: (() => void)[] = [];
  private fpsEl: HTMLElement;
  private fpsAcc = 0;
  private fpsN = 0;
  showFps = false;

  constructor(
    private game: Game,
    private renderer: Renderer,
    private host: HudHost,
    parent: HTMLElement,
  ) {
    this.root = h('div', { class: 'layer hud' });
    parent.append(this.root);
    this.buildTop();
    this.buildSidebar();
    this.abilitiesEl = h('div', { class: 'abilities' });
    this.root.append(this.abilitiesEl);
    this.comboEl = h('div', { class: 'combo hidden' });
    this.root.append(this.comboEl);
    this.fpsEl = h('div', { class: 'fps hidden' });
    this.root.append(this.fpsEl);
    if (game.sandbox) {
      this.root.classList.add('sandbox');
      this.buildSandbox();
    }
    this.bindGame();
    this.bindInput();
    if (host.tutorial) this.tutorial(0);
    else this.tutorialStep = -1;
  }

  destroy() {
    for (const u of this.unsub) u();
    this.unsub = [];
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('pointermove', this.onWinMove);
    window.removeEventListener('pointerup', this.onWinUp);
    this.renderer.canvas.removeEventListener('pointerdown', this.onCanvasDown);
    this.renderer.canvas.removeEventListener('pointermove', this.onCanvasMove);
    this.renderer.canvas.removeEventListener('pointerup', this.onCanvasUp);
    this.renderer.canvas.removeEventListener('contextmenu', this.onContext);
    this.renderer.canvas.removeEventListener('pointerleave', this.onCanvasLeave);
    this.root.remove();
  }

  setPlayerLevel(level: number) {
    this.host.playerLevel = level;
    this.lastCash = -1;
  }

  get sidebarWidth() {
    const sb = this.root.querySelector('.sidebar') as HTMLElement | null;
    return sb ? sb.getBoundingClientRect().width : 0;
  }

  // -------------------------------------------------------------------------------------------
  // Build
  // -------------------------------------------------------------------------------------------

  private hudBtn(icon: HTMLElement, label: string, onClick: () => void, cls: string): HTMLButtonElement {
    const b = h('button', { class: 'hbtn ' + cls, type: 'button', title: label, 'aria-label': label }, icon) as HTMLButtonElement;
    b.addEventListener('click', () => {
      audio.unlock();
      onClick();
    });
    return b;
  }

  private buildTop() {
    this.livesEl = h('span', { class: 'val' }, '0');
    this.livesPill = h('div', { class: 'pill lives', title: tr('Lives') }, uiIcon('heart', '❤️'), this.livesEl);
    this.cashEl = h('span', { class: 'val' }, '0');
    this.cashPill = h('div', { class: 'pill cash', title: tr('Cash') }, uiIcon('coin', '🪙'), this.cashEl);
    this.roundEl = h('span', { class: 'val' }, '1');
    this.roundSub = h('span', { class: 'sub' }, '');
    const roundPill = h('div', { class: 'pill round', title: tr('Round') }, img(starPortraitUrl('red'), 'ico'), h('span', { class: 'rv' }, this.roundEl, this.roundSub));
    this.frenzyFill = h('div', { class: 'fill' });
    this.frenzyLbl = h('span', { class: 'lbl' }, tr('FRENZY'));
    this.frenzyEl = h(
      'button',
      { class: 'frenzy', type: 'button', title: tr('Fill the meter by shattering stars, then tap for 10s of FRENZY (+50% attack speed)') },
      h('div', { class: 'track' }, this.frenzyFill),
      h('span', { class: 'bolt', html: BOLT_SVG }),
      this.frenzyLbl,
    );
    this.frenzyEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.tryFrenzy();
    });
    this.speedLbl = h('span', { class: 'spd' }, '1×');
    this.speedBtn = this.hudBtn(uiIcon('fast', '⏩'), tr('Game speed'), () => this.cycleSpeed(), 'speed');
    this.speedBtn.append(this.speedLbl);
    const pause = this.hudBtn(uiIcon('pause', '⏸'), tr('Pause (Esc)'), () => this.openPause(), 'pause');
    const gear = this.hudBtn(uiIcon('gear', '⚙️'), tr('Settings'), () => this.host.onSettings(false), 'gear');
    const top = h('div', { class: 'hud-top' }, this.livesPill, this.cashPill, roundPill, this.frenzyEl);
    this.root.append(h('div', { class: 'hud-bar' }, top, h('div', { class: 'top-right' }, this.speedBtn, pause, gear)));
  }

  private buildSidebar() {
    const shop = h('div', { class: 'shop' });
    if (this.host.heroId) {
      const hid = this.host.heroId;
      shop.append(this.makeCard('hero', hid, heroPortraitUrl(hid, 1), tr(HEROES[hid].name), 'H'));
    }
    for (const id of TOWER_ORDER) shop.append(this.makeCard('tower', id, towerPortraitUrl(id), tr(TOWERS[id].name), TOWERS[id].hotkey.toUpperCase()));
    watchScroll(shop);
    this.playIco = h('span', { class: 'play-ico' }, uiIcon('play', '▶'));
    this.playLbl = h('span', { class: 'play-lbl' }, '');
    this.playBtn = h('button', { class: 'btn green play waiting', type: 'button', title: tr('Start round / speed (Space)'), 'aria-label': tr('Start round / speed (Space)') }, this.playIco, this.playLbl) as HTMLButtonElement;
    this.playBtn.addEventListener('click', () => this.onPlay());
    this.autoToggle = h('span', { class: 'toggle' + (this.game.autoStart ? ' on' : '') });
    const auto = h('button', { class: 'auto', type: 'button', title: tr('Auto-start'), 'aria-label': tr('Auto-start'), onclick: () => this.toggleAuto() }, this.autoToggle, h('span', { class: 'auto-lbl' }, tr('Auto')));
    const sb = h('div', { class: 'sidebar' }, h('div', { class: 'sb-title t-up' }, tr('Bandits')), h('div', { class: 'shop-wrap' }, shop), h('div', { class: 'sb-foot' }, auto, this.playBtn));
    this.root.append(sb);
  }

  private makeCard(kind: 'tower' | 'hero', id: string, icon: string, name: string, key: string) {
    const card = h(
      'div',
      { class: 'card ' + kind, title: name, role: 'button', 'aria-label': name },
      h('div', { class: 'card-art' }, h('img', { src: icon, alt: '', draggable: 'false', decoding: 'async' })),
      h('div', { class: 'key' }, key),
      h('div', { class: 'lockmark' }, uiIcon('lock', '🔒')),
      h('div', { class: 'price' }, uiIcon('coin', '$', 'coin'), h('span', { class: 'pv' }, '')),
    );
    card.dataset.kind = kind;
    card.dataset.id = id;
    card.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (card.classList.contains('banned')) {
        audio.play('error');
        this.toast(tr("Not allowed in today's challenge"), 1600);
        return;
      }
      if (card.classList.contains('locked')) {
        audio.play('error');
        const lvl = kind === 'tower' ? TOWERS[id as TowerId].unlock : HEROES[id as HeroId].unlock;
        this.toast(tr('Reach player level {n} to unlock {name}!', { n: lvl, name }));
        return;
      }
      if (kind === 'hero' && this.game.hero) {
        this.select(this.game.hero);
        return;
      }
      this.startPlacing(kind, id as TowerId | HeroId, e, true);
    });
    this.cards.set(kind + ':' + id, card);
    return card;
  }

  private buildSandbox() {
    const p = h('div', { class: 'sandbox-panel' });
    for (const id of GLOOP_ORDER) {
      const b = h('button', { title: tr('Spawn') + ' ' + tr(GLOOPS[id].name) }, img(starPortraitUrl(id as GloopId)));
      b.addEventListener('click', (e) => {
        const n = (e as MouseEvent).shiftKey ? 10 : 1;
        for (let i = 0; i < n; i++) this.game.spawn(id as GloopId, { dist: i * 14 });
      });
      p.append(b);
    }
    const lvl = h('button', { title: tr('Hero +1 level') }, '⭐');
    lvl.addEventListener('click', () => {
      const hero = this.game.hero;
      if (hero) hero.addHeroXp(Math.max(0, heroXpFor(hero.heroLevel + 1) - hero.heroXp));
      this.panelKey = '';
      this.lastCash = -1; // refresh the hero shop card (sandbox cash never changes)
    });
    const clr = h('button', { title: tr('Clear stars') }, '🧹');
    clr.addEventListener('click', () => {
      for (const e of this.game.enemies) e.alive = false;
    });
    p.append(lvl, clr);
    this.root.append(p);
  }

  // -------------------------------------------------------------------------------------------
  // Game events
  // -------------------------------------------------------------------------------------------

  private bindGame() {
    const g = this.game;
    this.unsub.push(
      g.events.on('roundStart', (n) => {
        this.banner(tr('Round {n}', { n }), null, false, true);
        if (this.tutorialStep === 1) this.tutorial(2);
      }),
      g.events.on('roundEnd', ({ round, bonus }) => {
        this.toast(tr('Round {n} complete! +${bonus}', { n: round, bonus }), 1800);
        this.host.onRoundEnd(round);
        if (this.tutorialStep === 2 && round >= 1) this.tutorial(3);
      }),
      g.events.on('boss', (e) => {
        // the intro banner only plays the very first time the player meets this boss type
        if (this.host.firstBoss(e.type)) this.banner(tr(e.def.name).toUpperCase(), tr(e.def.desc), true);
        haptic('heavy');
      }),
      g.events.on('hint', (text) => {
        if (this.tutorialStep >= 0 && this.tutorialStep < 2 && g.round === 1) return;
        this.toast(tr(text), 3800);
      }),
      g.events.on('heroLevel', ({ level }) => {
        this.toast(tr('{name} reached level {n}!', { name: tr(g.hero?.name ?? ''), n: level }), 2200);
        this.panelKey = '';
        this.lastCash = -1;
      }),
      g.events.on('frenzyReady', () => {
        this.toast(tr('FRENZY is ready! Tap the meter!'), 2000);
        audio.play('levelup', 0.5);
      }),
      g.events.on('frenzyStart', () => this.banner(tr('FRENZY!'), tr('+50% attack speed'), false)),
      g.events.on('combo', (n) => {
        if (n >= 100) this.renderer.floatText(800, 200, tr('{n}x COMBO!', { n }), '#ffe066', 30);
      }),
      g.events.on('victory', () => this.host.onVictory()),
      g.events.on('gameOver', () => this.host.onDefeat()),
      g.events.on('lifeLost', () => {
        this.livesPill.classList.remove('hurt');
        void this.livesPill.offsetWidth;
        this.livesPill.classList.add('hurt');
      }),
      g.events.on('towersChanged', () => {
        this.panelKey = '';
        this.lastCash = -1;
      }),
    );
  }

  // -------------------------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------------------------

  private bindInput() {
    const c = this.renderer.canvas;
    c.addEventListener('pointerdown', this.onCanvasDown);
    c.addEventListener('pointermove', this.onCanvasMove);
    c.addEventListener('pointerup', this.onCanvasUp);
    c.addEventListener('pointerleave', this.onCanvasLeave);
    c.addEventListener('contextmenu', this.onContext);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('pointermove', this.onWinMove);
    window.addEventListener('pointerup', this.onWinUp);
  }

  private onContext = (e: Event) => {
    e.preventDefault();
    if (this.placing) this.cancelPlacing();
    else this.select(null);
  };

  private world(e: PointerEvent) {
    const rect = this.renderer.canvas.getBoundingClientRect();
    return this.renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  }

  private overMap(e: PointerEvent) {
    // not over the sidebar
    return e.clientX < window.innerWidth - this.sidebarWidth;
  }

  private onCanvasDown = (e: PointerEvent) => {
    if (this.modalOpen) return;
    audio.unlock();
    const w = this.world(e);
    if (this.placing) {
      this.placing.dragging = true;
      this.placing.pointerType = e.pointerType;
      this.updateGhost(w.x, w.y, true);
      if (e.pointerType === 'mouse') this.tryPlace();
      return;
    }
    if (this.game.collectAt(w.x, w.y, e.pointerType === 'mouse' ? 30 : 42)) return;
    const t = this.towerAt(w.x, w.y);
    this.select(t);
  };

  private onCanvasMove = (e: PointerEvent) => {
    const w = this.world(e);
    if (this.placing) {
      if (e.pointerType === 'mouse' || this.placing.dragging) this.updateGhost(w.x, w.y, true);
      return;
    }
    if (e.pointerType === 'mouse') {
      this.renderer.hover = this.towerAt(w.x, w.y);
      this.game.collectAt(w.x, w.y, 26);
    }
  };

  private onCanvasUp = (e: PointerEvent) => {
    if (!this.placing) return;
    if (e.pointerType !== 'mouse' && this.placing.dragging) {
      this.tryPlace();
    }
  };

  private onCanvasLeave = () => {
    this.renderer.hover = null;
    if (this.placing && this.renderer.ghost && !this.placing.dragging) this.renderer.ghost.visible = false;
  };

  /** Tracks drags that start on a shop card. */
  private onWinMove = (e: PointerEvent) => {
    const p = this.placing;
    if (!p || !p.fromCard) return;
    if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 12) p.moved = true;
    if (p.moved && this.overMap(e)) {
      const w = this.world(e);
      // lift the ghost above the finger on touch so it stays visible
      const lift = e.pointerType === 'mouse' ? 0 : 36 / this.renderer.scale;
      this.updateGhost(w.x, w.y - lift, true);
    } else if (this.renderer.ghost) this.renderer.ghost.visible = false;
  };

  private onWinUp = (e: PointerEvent) => {
    const p = this.placing;
    if (!p || !p.fromCard) return;
    p.fromCard = false;
    if (p.moved) {
      if (this.overMap(e)) this.tryPlace();
      else this.cancelPlacing();
    } else {
      // simple tap on a card: now tap/drag on the map to place
      this.toast(tr(e.pointerType === 'mouse' ? 'Click on the map to place it' : 'Touch the map and drag to place it'), 1600);
    }
  };

  private onKey = (e: KeyboardEvent) => {
    if (this.modalOpen) {
      if (e.key === 'Escape') this.dismissModal();
      return;
    }
    const k = e.key.toLowerCase();
    if (k === ' ') {
      e.preventDefault();
      this.onPlay();
      return;
    }
    if (k === 'escape') {
      if (this.placing) this.cancelPlacing();
      else if (this.renderer.selected) this.select(null);
      else this.openPause();
      return;
    }
    if (k === 'f') {
      this.tryFrenzy();
      return;
    }
    const sel = this.renderer.selected;
    if (sel && (k === ',' || k === '.' || k === '/')) {
      this.buyUpgrade(sel, k === ',' ? 0 : k === '.' ? 1 : 2);
      return;
    }
    if (sel && k === 'tab') {
      e.preventDefault();
      this.cyclePriority(sel, 1);
      return;
    }
    if (sel && (k === 'backspace' || k === 'delete')) {
      this.sell(sel);
      return;
    }
    if (k === 'h' && this.host.heroId) {
      if (this.game.hero) this.select(this.game.hero);
      else this.startPlacing('hero', this.host.heroId, null, false);
      return;
    }
    for (const id of TOWER_ORDER) {
      if (TOWERS[id].hotkey === k) {
        if (!this.isUnlocked('tower', id) || !this.game.isAllowed(id)) return;
        this.startPlacing('tower', id, null, false);
        return;
      }
    }
  };

  private towerAt(x: number, y: number): Tower | null {
    let best: Tower | null = null;
    let bd = Infinity;
    for (const t of this.game.towers) {
      const r = t.radius * 1.3;
      // art extends upward, so test a capsule from the base to the head
      const dy = y > t.y ? y - t.y : y < t.y - t.radius * 1.8 ? t.y - t.radius * 1.8 - y : 0;
      const dx = x - t.x;
      const d = dx * dx + dy * dy;
      if (d < r * r && d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  }

  private isUnlocked(kind: 'tower' | 'hero', id: string) {
    if (this.host.devUnlock || this.game.sandbox) return true;
    const lvl = kind === 'tower' ? TOWERS[id as TowerId].unlock : HEROES[id as HeroId].unlock;
    return this.host.playerLevel >= lvl;
  }

  // -------------------------------------------------------------------------------------------
  // Placement
  // -------------------------------------------------------------------------------------------

  private startPlacing(kind: 'tower' | 'hero', id: TowerId | HeroId, e: PointerEvent | null, fromCard: boolean) {
    audio.unlock();
    const cost = kind === 'tower' ? this.game.towerCost(id as TowerId) : this.game.heroCost(id as HeroId);
    if (!this.game.sandbox && this.game.cash < cost) {
      audio.play('error');
      this.flashCash();
      this.toast(tr('Need ${n} more', { n: formatNum(cost - this.game.cash) }), 1200);
      return;
    }
    this.select(null);
    this.placing = { kind, id, dragging: false, fromCard, startX: e?.clientX ?? 0, startY: e?.clientY ?? 0, moved: false, pointerType: e?.pointerType ?? 'mouse' };
    this.renderer.ghost = { kind, id, x: 0, y: 0, valid: false, visible: false };
    for (const c of this.cards.values()) c.classList.remove('selected');
    this.cards.get(kind + ':' + id)?.classList.add('selected');
    audio.play('click');
  }

  private updateGhost(x: number, y: number, visible: boolean) {
    const gh = this.renderer.ghost;
    const p = this.placing;
    if (!gh || !p) return;
    gh.x = x;
    gh.y = y;
    gh.visible = visible;
    const radius = p.kind === 'tower' ? TOWERS[p.id as TowerId].radius : HEROES[p.id as HeroId].radius;
    const cost = p.kind === 'tower' ? this.game.towerCost(p.id as TowerId, x, y) : this.game.heroCost(p.id as HeroId);
    gh.valid = this.game.canPlace(radius, x, y) && (this.game.sandbox || this.game.cash >= cost);
  }

  private tryPlace() {
    const p = this.placing;
    const gh = this.renderer.ghost;
    if (!p || !gh) return;
    if (!gh.visible) return;
    if (!gh.valid) {
      audio.play('error');
      haptic('light');
      p.dragging = false;
      return;
    }
    const t = p.kind === 'tower' ? this.game.placeTower(p.id as TowerId, gh.x, gh.y) : this.game.placeHero(p.id as HeroId, gh.x, gh.y);
    if (!t) {
      audio.play('error');
      return;
    }
    audio.play('place');
    if (this.tutorialStep === 0) this.tutorial(1);
    if (this.game.towers.length === 2 && t.bonds.length && !this.game.sandbox) {
      const syn = SYNERGIES.find((s) => s.id === t.bonds[0].synergyId);
      if (syn) this.toast(tr('⚡ BOND: {name}! Paired bandits power each other up.', { name: tr(syn.name) }), 3000);
    }
    this.cancelPlacing();
    this.select(t);
  }

  cancelPlacing() {
    this.placing = null;
    this.renderer.ghost = null;
    for (const c of this.cards.values()) c.classList.remove('selected');
  }

  // -------------------------------------------------------------------------------------------
  // Selection & upgrade panel
  // -------------------------------------------------------------------------------------------

  select(t: Tower | null) {
    if (this.renderer.selected === t) return;
    this.renderer.selected = t;
    this.panelKey = '';
    if (!t && this.panel) {
      this.panel.remove();
      this.panel = null;
      this.panelFor = null;
      this.root.classList.remove('up-left', 'up-right');
    }
    if (t) audio.play('click');
  }

  private buildPanel(t: Tower) {
    const g = this.game;
    const side = this.renderer.worldToScreen(t.x, t.y).x < (window.innerWidth - this.sidebarWidth) / 2 ? 'right' : 'left';
    const panel = h('div', { class: 'upanel ' + side + (t.hero ? ' is-hero' : '') });
    toggle(this.root, 'up-left', side === 'left');
    toggle(this.root, 'up-right', side === 'right');
    panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    const look = t.hero ? heroPortraitUrl(t.hero.id, t.heroLevel) : towerPortraitUrl(t.def!.id, t.tiers);
    const sub = t.hero ? tr(t.hero.title) : `${tr(t.def!.species)} · ${tr(t.def!.role)}`;
    const statsLine = h('div', { class: 'stats-line' });
    panel.append(
      h(
        'div',
        { class: 'uhead' },
        h('div', { class: 'u-portrait' }, img(look)),
        h('div', { class: 'u-title' }, h('div', { class: 'name t-outline' }, tr(t.name)), h('div', { class: 'meta' }, sub), statsLine),
        closeBtn(() => {
          audio.play('click');
          this.select(null);
        }),
      ),
    );

    if (t.def) {
      const def = t.def;
      const paths = h('div', { class: 'paths' });
      for (let p = 0; p < 3; p++) {
        const tier = t.tiers[p];
        const can = canTier(t.tiers, p);
        const pips = h('div', { class: 'pips', title: tr('Tier {n}', { n: tier }) });
        for (let i = 0; i < 5; i++) pips.append(h('i', { class: (i < tier ? 'on' : '') + (i === 4 ? ' five' : '') }));
        const head = h('div', { class: 'p-head' }, h('span', { class: 'pname' }, tr(def.pathNames[p])), pips);
        const row = h('div', { class: 'path', style: `--pc:${PATH_COLOR[p]}` });
        if (tier >= 5) {
          const u = def.paths[p][4];
          row.classList.add('maxed');
          row.append(this.upgIcon(def.id, t.tiers, 5), h('div', { class: 'info' }, head, h('div', { class: 'uname' }, tr(u.name)), h('div', { class: 'udesc' }, tr(u.desc))), h('div', { class: 'maxmark' }, uiIcon('crown', '👑'), h('b', null, 'MAX')));
        } else {
          const u = def.paths[p][tier];
          const cost = g.upgradeCost(t, p)!;
          const next = t.tiers.map((x, i) => (i === p ? x + 1 : x));
          const buy = h(
            'button',
            { class: 'btn small buy ' + (can ? 'gold' : 'dark closed'), type: 'button', title: can ? tr(u.name) : tr('Path closed') },
            can ? h('span', { class: 'bp' }, uiIcon('coin', '$', 'coin'), h('span', null, formatNum(cost))) : uiIcon('lock', '🔒', 'lock'),
            h('small', null, can ? tr('Tier {n}', { n: tier + 1 }) : tr('Path closed')),
          ) as HTMLButtonElement;
          buy.dataset.cost = String(cost);
          buy.dataset.can = can ? '1' : '0';
          buy.addEventListener('click', () => this.buyUpgrade(t, p));
          if (!can) row.classList.add('closed');
          row.append(this.upgIcon(def.id, next, tier + 1), h('div', { class: 'info' }, head, h('div', { class: 'uname' }, tr(u.name)), h('div', { class: 'udesc' }, can ? tr(u.desc) : tr('Only 2 paths, and only one past tier 2.'))), buy);
        }
        paths.append(row);
      }
      panel.append(paths);
    } else if (t.hero) {
      const hero = t.hero;
      const lvl = t.heroLevel;
      const next = lvl < MAX_HERO_LEVEL ? hero.levels[lvl - 1] : null;
      const xp = bar(this.heroXpFrac(t), 'gold', undefined, 12);
      xp.classList.add('hxp');
      const stage = heroStage(lvl);
      const looks = h(
        'div',
        { class: 'h-stages' },
        ...HERO_LOOK_LEVELS.map((lv) => h('div', { class: 'h-stage' + (heroStage(lv) === stage ? ' on' : lv > lvl ? ' future' : ''), title: tr('Level {n}', { n: lv }) }, img(heroPortraitUrl(hero.id, lv)), h('span', null, tr('Lv {n}', { n: lv })))),
      );
      panel.append(
        h(
          'div',
          { class: 'path hero-lv' },
          h('div', { class: 'lv-badge' }, uiIcon('xp', '⭐'), h('b', { class: 't-num' }, String(lvl))),
          h(
            'div',
            { class: 'info' },
            h('div', { class: 'p-head' }, h('span', { class: 'pname' }, tr('Level {n}', { n: lvl }) + (lvl >= MAX_HERO_LEVEL ? ' · MAX' : ''))),
            h('div', { class: 'uname' }, next ? tr('Next: ') + tr(next.desc) : tr('Fully powered!')),
            next ? xp : null,
          ),
        ),
        looks,
        h('div', { class: 'u-note' }, tr('Heroes level up automatically every round.')),
      );
    }

    // bonds
    if (t.bonds.length) {
      const bonds = h('div', { class: 'bonds' });
      const seen = new Set<string>();
      for (const b of t.bonds) {
        if (seen.has(b.synergyId)) continue;
        seen.add(b.synergyId);
        const syn = SYNERGIES.find((s) => s.id === b.synergyId)!;
        const isA = t.def?.id === syn.a;
        bonds.append(h('span', { class: 'bond', style: `--bc:${syn.color}`, title: tr(isA ? syn.descA : syn.descB) }, h('b', null, `⚡ ${tr(syn.name)}`), ' ' + tr(isA ? syn.descA : syn.descB)));
      }
      panel.append(bonds);
    }

    // footer: targeting, bank, sell
    const foot = h('div', { class: 'ufoot' });
    if (t.stats.attacks.some((a) => ['shoot', 'hitscan', 'chain'].includes(a.kind))) {
      const arrow = (dir: number) => {
        const b = h('button', { class: 'tg-arrow', type: 'button', 'aria-label': tr('Targeting') }, glyph(dir < 0 ? ARROW_L : ARROW_R, 6.5));
        b.addEventListener('click', () => this.cyclePriority(t, dir));
        return b;
      };
      foot.append(h('div', { class: 'target', title: tr('Targeting') + ' (Tab)' }, arrow(-1), h('div', { class: 'lbl' }, uiIcon('target', '🎯'), h('span', null, prio(t.priority))), arrow(1)));
    }
    if (t.stats.bank) {
      const wd = btn(tr('Withdraw'), 'green', () => this.game.withdraw(t), { size: 'small', icon: uiIcon('sack', '💰'), cls: 'withdraw' });
      wd.dataset.role = 'withdraw';
      foot.append(wd);
    }
    const sellV = t.sellValue(g.sandbox) + Math.floor(t.stash);
    const sellLbl = h('span', null, tr('Sell'));
    const sellBtn = btn(h('span', { class: 'sell-in' }, sellLbl, h('span', { class: 'sv' }, uiIcon('coin', '$', 'coin'), formatNum(sellV))), 'red', () => {
      // expensive towers need a second tap so they are not sold by accident
      if (sellV >= 1000 && !sellBtn.classList.contains('armed') && !this.game.sandbox) {
        sellBtn.classList.add('armed');
        sellLbl.textContent = tr('Sure?');
        audio.play('click');
        setTimeout(() => {
          sellBtn.classList.remove('armed');
          sellLbl.textContent = tr('Sell');
        }, 2200);
        return;
      }
      this.sell(t);
    }, { size: 'small', cls: 'sell', title: tr('Sell (Backspace)') });
    foot.append(sellBtn);
    panel.append(foot);

    this.root.append(panel);
    this.panel?.remove();
    this.panel = panel;
    this.panelFor = t;
    this.buildStats(t, statsLine);
  }

  /** Next-upgrade picture: the painted look for tier 3+, a path-coloured chevron emblem below. */
  private upgIcon(id: string, tiers: readonly number[], tier: number): HTMLElement {
    const url = tier >= 3 ? towerIconUrl(id, tiers) : null;
    if (url) return h('div', { class: 'u-ico look' }, img(url));
    return h('div', { class: 'u-ico gen' }, glyph(CHEVRONS[tier >= 2 ? 1 : 0], 6.5, '#fff6d6', 'chev'), h('b', null, String(tier)));
  }

  private heroXpFrac(t: Tower) {
    const lvl = t.heroLevel;
    if (lvl >= MAX_HERO_LEVEL) return 1;
    const need = heroXpFor(lvl + 1) - heroXpFor(lvl);
    return need > 0 ? Math.max(0, Math.min(1, (t.heroXp - heroXpFor(lvl)) / need)) : 1;
  }

  private statEls: Record<string, HTMLElement> = {};

  /** Stat chips under the name; values are refreshed every frame by updateStats. */
  private buildStats(t: Tower, el: HTMLElement) {
    clear(el);
    this.statEls = {};
    const add = (key: string, icon: HTMLElement, title: string) => {
      const v = h('span', null, '');
      el.append(h('span', { class: 'st ' + key, title }, icon, v));
      this.statEls[key] = v;
    };
    add('pops', img(starPortraitUrl('red'), 'ico'), tr('Pops'));
    if (t.stats.bank) add('stash', uiIcon('sack', '💰'), tr('Stash'));
    else if (t.stats.income) add('income', uiIcon('coin', '🪙'), tr('Income'));
    const a = t.stats.attacks[0];
    if (a && ['shoot', 'radial', 'hitscan', 'chain', 'pulse', 'drone'].includes(a.kind)) {
      add('dmg', glyph('M5 19 17 7M14 4h6v6M7 15l2 2', 5.5, '#ffd0d0'), tr('Damage'));
      if (a.kind === 'drone') add('drones', h('span', { class: 'ico emoji' }, '🛸'), tr('Drones'));
      else add('pierce', glyph('M4 12h13M13 6l6 6-6 6', 5.5, '#cfe8ff'), tr('Pierce'));
      if (a.kind !== 'drone') add('rate', glyph('M12 7v5l3 2M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17', 4.5, '#e0ffd0'), tr('Attacks per second'));
    }
    if (t.camo) el.append(h('span', { class: 'st camo', title: tr('Camo detection') }, uiIcon('camo', '👁'), h('span', null, tr('Camo'))));
    this.updateStats(t);
  }

  private updateStats(t: Tower) {
    const s = this.statEls;
    if (s.pops) setText(s.pops, formatNum(t.pops));
    if (s.stash && t.stats.bank) setText(s.stash, `$${formatNum(t.stash)}/${formatNum(t.stats.bank.capacity)}`);
    if (s.income && t.stats.income) {
      const inc = t.stats.income;
      setText(s.income, tr('${n}/round', { n: formatNum(inc.perDrop * inc.drops * t.buffs.incomeMul + inc.bonusPerRound) }));
    }
    const a = t.stats.attacks[0];
    if (!a || !s.dmg) return;
    let dmg = 0;
    let pierce = 0;
    if (a.kind === 'shoot' || a.kind === 'radial') {
      dmg = a.proj.damage || a.proj.explode?.damage || 0;
      pierce = a.proj.explode ? a.proj.explode.pierce : a.proj.pierce;
      if (a.kind === 'shoot' && a.count > 1) pierce *= a.count;
    } else if (a.kind === 'hitscan') {
      dmg = a.damage;
      pierce = 1 + (a.ricochet ?? 0);
    } else if (a.kind === 'chain') {
      dmg = a.damage;
      pierce = a.chains;
    } else if (a.kind === 'pulse') {
      dmg = a.damage;
      pierce = a.pierce;
    } else if (a.kind === 'drone') {
      dmg = a.proj.damage;
      setText(s.dmg, String(dmg + t.buffs.damageAdd));
      if (s.drones) setText(s.drones, String(a.count));
      return;
    }
    setText(s.dmg, String(dmg + (dmg > 0 ? t.buffs.damageAdd : 0)));
    if (s.pierce) setText(s.pierce, String(pierce + t.buffs.pierceAdd));
    if (s.rate) {
      const rate = a.rate / t.rateFactor(this.game.time, this.game.frenzyT > 0);
      setText(s.rate, rate > 0 ? `${(1 / rate).toFixed(rate < 1 ? 1 : 2)}/s` : '–');
    }
  }

  private refreshPanel() {
    const t = this.renderer.selected;
    if (!t) return;
    if (!this.game.towers.includes(t)) {
      this.select(null);
      return;
    }
    const key = `${t.id}|${t.tiers.join('')}|${t.heroLevel}|${t.priority}|${t.camo}|${t.bonds.map((b) => b.synergyId).join(',')}`;
    if (key !== this.panelKey || this.panelFor !== t) {
      this.panelKey = key;
      this.buildPanel(t);
    }
    if (!this.panel) return;
    // affordability
    for (const b of this.panel.querySelectorAll<HTMLButtonElement>('.buy')) {
      if (b.dataset.can !== '1') continue;
      toggle(b, 'poor', !this.game.sandbox && this.game.cash < +b.dataset.cost!);
    }
    if (t.hero) {
      const fill = this.panel.querySelector<HTMLElement>('.hxp > i');
      if (fill) {
        const f = this.heroXpFrac(t);
        fill.style.setProperty('--p', `${(f * 100).toFixed(1)}%`);
        toggle(fill.parentElement!, 'zero', f <= 0);
      }
    }
    this.updateStats(t);
  }

  private buyUpgrade(t: Tower, p: number) {
    if (!t.def) return;
    if (!canTier(t.tiers, p)) {
      audio.play('error');
      return;
    }
    const cost = this.game.upgradeCost(t, p)!;
    if (!this.game.sandbox && this.game.cash < cost) {
      audio.play('error');
      this.flashCash();
      return;
    }
    if (this.game.upgrade(t, p)) {
      audio.play('upgrade');
      if (this.tutorialStep === 3) this.tutorial(4);
      const tier = t.tiers[p];
      if (tier === 5) this.banner(tr(t.def.paths[p][4].name).toUpperCase(), tr('Tier 5 unlocked!'), false);
    }
  }

  private cyclePriority(t: Tower, dir: number) {
    const i = TARGET_PRIORITIES.indexOf(t.priority);
    const next = TARGET_PRIORITIES[(i + dir + TARGET_PRIORITIES.length) % TARGET_PRIORITIES.length];
    this.game.setPriority(t, next);
    audio.play('click');
  }

  private sell(t: Tower) {
    this.game.sell(t);
    this.select(null);
  }

  // -------------------------------------------------------------------------------------------
  // Controls
  // -------------------------------------------------------------------------------------------

  private onPlay() {
    audio.unlock();
    const g = this.game;
    if (g.over) return;
    if (!g.roundActive) {
      if (g.won && !g.freeplay) {
        this.host.onVictory();
        return;
      }
      g.startRound();
      haptic('light');
    } else this.cycleSpeed();
  }

  private cycleSpeed() {
    const g = this.game;
    g.speed = g.speed === 1 ? 2 : g.speed === 2 ? 3 : 1;
    audio.play('click');
  }

  private toggleAuto() {
    this.game.autoStart = !this.game.autoStart;
    toggle(this.autoToggle, 'on', this.game.autoStart);
    audio.play('click');
  }

  private tryFrenzy() {
    if (this.game.activateFrenzy()) haptic('heavy');
  }

  private flashCash() {
    this.cashPill.classList.remove('hurt');
    void this.cashPill.offsetWidth;
    this.cashPill.classList.add('hurt');
  }

  // -------------------------------------------------------------------------------------------
  // Per-frame update
  // -------------------------------------------------------------------------------------------

  update(dt: number) {
    const g = this.game;
    const cash = Math.floor(g.cash);
    if (cash !== this.lastCash) {
      if (cash > this.lastCash && this.lastCash >= 0) {
        const now = performance.now();
        if (now - this.lastBump > 260) {
          this.lastBump = now;
          bump(this.cashEl);
        }
      }
      this.lastCash = cash;
      this.updateCards();
    }
    // the cash readout counts towards the real value
    if (this.shownCash !== cash) {
      const d = cash - this.shownCash;
      if (this.shownCash < 0 || g.sandbox || reducedMotion() || Math.abs(d) < 2) this.shownCash = cash;
      else {
        const step = d * Math.min(1, dt * (d > 0 ? 8 : 14));
        this.shownCash += Math.abs(step) < 1 ? Math.sign(d) : step;
      }
      setText(this.cashEl, g.sandbox ? '∞' : '$' + formatNum(Math.round(this.shownCash)));
    }
    if (g.lives !== this.lastLives) {
      setText(this.livesEl, g.sandbox ? '∞' : formatNum(Math.max(0, g.lives)));
      toggle(this.livesPill, 'low', !g.sandbox && g.lives > 0 && g.lives <= Math.max(5, g.diff.lives * 0.2));
      this.lastLives = g.lives;
    }
    // after the last round the counter is already one past it; don't show 41/40 behind the victory screen
    setText(this.roundEl, String(g.freeplay || g.sandbox ? g.round : Math.min(g.round, g.lastRound)));
    setText(this.roundSub, g.sandbox ? '' : g.freeplay ? '∞' : `/${g.lastRound}`);
    // frenzy
    const ready = g.frenzyReady;
    toggle(this.frenzyEl, 'ready', ready);
    toggle(this.frenzyEl, 'active', g.frenzyT > 0);
    if (g.frenzyT > 0) {
      this.frenzyFill.style.width = `${(g.frenzyT / g.frenzyDuration) * 100}%`;
      setText(this.frenzyLbl, tr('FRENZY {n}s', { n: Math.ceil(g.frenzyT) }));
    } else {
      this.frenzyFill.style.width = `${Math.min(100, (g.frenzyMeter / g.frenzyMax) * 100)}%`;
      setText(this.frenzyLbl, tr(ready ? 'TAP: FRENZY!' : 'FRENZY'));
    }
    // combo
    if (g.combo >= 10) {
      toggle(this.comboEl, 'hidden', false);
      setText(this.comboEl, tr('{n}x combo', { n: g.combo }));
      if (g.combo > this.lastCombo + 5) {
        this.comboEl.classList.remove('bump');
        void this.comboEl.offsetWidth;
        this.comboEl.classList.add('bump');
        this.lastCombo = g.combo;
      }
    } else {
      toggle(this.comboEl, 'hidden', true);
      this.lastCombo = 0;
    }
    // play / speed buttons
    const running = g.roundActive && !g.over;
    const state = (g.over ? 'over' : running ? 'run' : 'wait') + g.speed;
    if (state !== this.playState) {
      this.playState = state;
      toggle(this.playBtn, 'waiting', !running && !g.over);
      toggle(this.playBtn, 'running', running);
      toggle(this.playBtn, 'fast', running && g.speed === 2);
      toggle(this.playBtn, 'faster', running && g.speed === 3);
      toggle(this.playBtn, 'green', !(running && g.speed > 1));
      this.playIco.replaceChildren(running ? uiIcon('fast', '⏩') : uiIcon('play', '▶'));
      setText(this.playLbl, running ? `${g.speed}×` : '');
      setText(this.speedLbl, `${g.speed}×`);
      toggle(this.speedBtn, 'on', g.speed > 1);
      toggle(this.speedBtn, 'max', g.speed > 2);
    }
    this.refreshPanel();
    this.updateAbilities();
    if (this.toastEl && (this.toastTimer -= dt) <= 0) {
      const el = this.toastEl;
      this.toastEl = null;
      el.classList.add('out');
      setTimeout(() => el.remove(), 220);
    }
    if (this.showFps) {
      this.fpsAcc += dt;
      this.fpsN++;
      if (this.fpsAcc > 0.5) {
        toggle(this.fpsEl, 'hidden', false);
        setText(this.fpsEl, `${Math.round(this.fpsN / this.fpsAcc)} fps · ${g.enemies.length} stars · ${g.projectiles.length} proj`);
        this.fpsAcc = 0;
        this.fpsN = 0;
      }
    }
  }

  private updateCards() {
    const g = this.game;
    for (const [key, card] of this.cards) {
      const [kind, id] = key.split(':') as ['tower' | 'hero', string];
      const unlocked = this.isUnlocked(kind, id);
      const banned = kind === 'tower' && !g.isAllowed(id as TowerId);
      const cost = kind === 'tower' ? g.towerCost(id as TowerId) : g.heroCost(id as HeroId);
      const placedHero = kind === 'hero' && !!g.hero;
      toggle(card, 'locked', !unlocked || banned);
      toggle(card, 'banned', banned);
      toggle(card, 'placed', placedHero);
      toggle(card, 'poor', unlocked && !banned && !placedHero && !g.sandbox && g.cash < cost);
      const pv = card.querySelector('.pv') as HTMLElement;
      if (!unlocked) setText(pv, tr('Lvl {n}', { n: kind === 'tower' ? TOWERS[id as TowerId].unlock : HEROES[id as HeroId].unlock }));
      else if (placedHero) setText(pv, tr('Lv {n}', { n: g.hero!.heroLevel }));
      else setText(pv, formatNum(cost));
      if (kind === 'hero') {
        // the hero card shows the hero's current look
        const stage = String(heroStage(g.hero?.heroLevel ?? 1));
        if (card.dataset.stage !== stage) {
          card.dataset.stage = stage;
          const im = card.querySelector('.card-art img') as HTMLImageElement | null;
          if (im) im.src = heroPortraitUrl(id, g.hero?.heroLevel ?? 1);
        }
      }
    }
  }

  private updateAbilities() {
    const g = this.game;
    const groups = new Map<string, { ab: AbilityDef; towers: Tower[] }>();
    for (const t of g.towers) {
      for (const ab of t.stats.abilities) {
        let gr = groups.get(ab.id);
        if (!gr) groups.set(ab.id, (gr = { ab, towers: [] }));
        gr.towers.push(t);
      }
    }
    const key = [...groups.entries()].map(([id, gr]) => id + gr.towers.length).join('|');
    if (key !== this.abilityKey) {
      this.abilityKey = key;
      clear(this.abilitiesEl);
      this.abilityBtns = [];
      for (const [id, gr] of groups) {
        const url = abilityIconUrl(id);
        const cd = h('div', { class: 'cd' });
        const time = h('div', { class: 'time' });
        const n = h('div', { class: 'n hidden' });
        const el = h(
          'button',
          { class: 'ability anim-pop', type: 'button', title: `${tr(gr.ab.name)}: ${tr(gr.ab.desc)}`, 'aria-label': tr(gr.ab.name) },
          url ? img(url, 'ab-ico') : h('span', { class: 'ab-emoji' }, gr.ab.icon),
          cd,
          time,
          n,
        );
        el.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          this.useAbility(id);
        });
        this.abilitiesEl.append(el);
        this.abilityBtns.push({ el, cd, n, time, id, towers: gr.towers, ab: gr.ab, state: '' });
      }
    }
    for (const b of this.abilityBtns) {
      let best = Infinity;
      let ready = 0;
      for (const t of b.towers) {
        const c = t.abilityCd.get(b.id) ?? 0;
        if (c <= 0) ready++;
        best = Math.min(best, c);
      }
      const frac = ready > 0 ? 0 : Math.min(1, best / b.ab.cooldown);
      const state = ready > 0 ? 'ready' : 'cooling';
      if (state !== b.state) {
        if (state === 'ready' && b.state) {
          b.el.classList.remove('pop');
          void b.el.offsetWidth;
          b.el.classList.add('pop');
        }
        b.state = state;
        toggle(b.el, 'ready', ready > 0);
        toggle(b.el, 'cooling', ready === 0);
      }
      b.cd.style.setProperty('--cd', `${(frac * 360).toFixed(0)}deg`);
      setText(b.time, ready ? '' : `${Math.ceil(best)}`);
      toggle(b.n, 'hidden', b.towers.length < 2);
      if (b.towers.length > 1) setText(b.n, `${ready}/${b.towers.length}`);
    }
  }

  private useAbility(id: string) {
    const b = this.abilityBtns.find((x) => x.id === id);
    if (!b) return;
    const t = b.towers.find((x) => (x.abilityCd.get(id) ?? 0) <= 0);
    if (!t) {
      audio.play('error');
      return;
    }
    const ab = t.stats.abilities.find((a) => a.id === id)!;
    if (this.game.useAbility(t, ab)) this.banner(tr(ab.name).toUpperCase(), null, false, true);
  }

  // -------------------------------------------------------------------------------------------
  // Banners, toasts, tutorial
  // -------------------------------------------------------------------------------------------

  banner(text: string, sub: string | null, boss: boolean, small = false) {
    const el = h('div', { class: 'banner' + (boss ? ' boss' : '') + (small ? ' small' : '') }, h('span', { class: 'b-main' }, text), sub ? h('small', null, sub) : null);
    this.root.append(el);
    setTimeout(() => el.remove(), 1900);
  }

  toast(text: string, ms = 2500) {
    this.toastEl?.remove();
    this.toastEl = h('div', { class: 'toast', role: 'status' }, text);
    this.root.append(this.toastEl);
    this.toastTimer = ms / 1000;
  }

  private tutorial(step: number) {
    this.tutorialStep = step;
    this.handEl?.remove();
    this.handEl = null;
    const card = this.cards.get('tower:spike');
    if (step === 0 && card) {
      this.toast(tr('👋 Drag the Slinger from the shop onto the grass near the track!'), 999999);
      const r = card.getBoundingClientRect();
      this.handEl = h('div', { class: 'hand', style: `left:${r.left + r.width * 0.3}px;top:${r.top + r.height * 0.4}px;--dx:-${Math.round(window.innerWidth * 0.35)}px;--dy:0px` }, '👆');
      this.root.append(this.handEl);
    } else if (step === 1) {
      this.toast(tr('Nice! Press ▶ to bring on the stars.'), 999999);
      const r = this.playBtn.getBoundingClientRect();
      this.handEl = h('div', { class: 'hand', style: `left:${r.left + r.width * 0.35}px;top:${r.top - 30}px;--dx:0px;--dy:14px` }, '👇');
      this.root.append(this.handEl);
    } else if (step === 2) {
      this.toast(tr('Shatter them all! Every layer you crack earns cash. 🪙'), 3500);
    } else if (step === 3) {
      this.toast(tr('Tap a raccoon to upgrade it. Upgrades make your bandits WAY stronger!'), 6000);
    } else if (step === 4) {
      this.toast(tr('🎉 You got it! Tip: place different bandits close together to form ⚡ BONDS.'), 5000);
      this.tutorialStep = -1;
      this.host.onTutorialDone();
    }
  }

  // -------------------------------------------------------------------------------------------
  // Modals
  // -------------------------------------------------------------------------------------------

  /** `locked` modals (game over, victory) only close through their own buttons; `onDismiss`
   * replaces the plain close for Escape / Android back (e.g. settings returning to pause). */
  openModal(content: HTMLElement, pause = true, opts: { locked?: boolean; onDismiss?: () => void } = {}) {
    this.closeModal();
    this.modalDismiss = opts.locked ? 'locked' : opts.onDismiss ?? null;
    const wrap = h('div', { class: 'modal-wrap' }, content);
    wrap.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.root.append(wrap);
    this.modalOpen = true;
    if (pause) this.game.paused = true;
    return wrap;
  }

  closeModal() {
    const w = this.root.querySelector('.modal-wrap');
    if (w) w.remove();
    this.modalOpen = false;
    this.modalDismiss = null;
    this.game.paused = false;
  }

  /** Escape / Android back on an open modal. */
  dismissModal() {
    const d = this.modalDismiss;
    if (d === 'locked') return;
    if (d) d();
    else this.closeModal();
  }

  get isModalOpen() {
    return this.modalOpen;
  }

  openPause() {
    const g = this.game;
    const d = g.config.difficulty;
    const restart = btn(tr('Restart'), 'red', () => {
      // restarting throws the run away: ask for a second tap
      const label = restart.querySelector('span:last-child') as HTMLElement;
      if (!restart.classList.contains('armed')) {
        restart.classList.add('armed');
        label.textContent = tr('Sure?');
        audio.play('click');
        setTimeout(() => {
          restart.classList.remove('armed');
          label.textContent = tr('Restart');
        }, 2500);
        return;
      }
      this.host.onRestart();
    }, { icon: restartIcon() });
    const m = modal(
      { title: tr('Paused'), color: 'blue', size: 'narrow', icon: uiIcon('pause', '⏸'), onClose: () => this.closeModal() },
      [
        h(
          'div',
          { class: 'pause-info' },
          chip(null, tr(g.map.name), 'dark'),
          chip(d === 'sandbox' ? uiIcon('sack', MEDAL_EMOJI.sandbox) : uiIcon(MEDAL[d], MEDAL_EMOJI[d]), tr(g.diff.name), 'dark'),
          chip(null, tr('Round {n}', { n: g.round }), 'dark'),
        ),
        btn(tr('Resume'), 'green', () => this.closeModal(), { size: 'big', icon: uiIcon('play', '▶'), cls: 'pause-resume glint' }),
        h(
          'div',
          { class: 'pause-grid' },
          btn(tr('Settings'), 'blue', () => this.host.onSettings(true), { icon: uiIcon('gear', '⚙️') }),
          restart,
          btn(tr('Home'), 'dark', () => this.host.onQuit(), { icon: uiIcon('home', '🏠') }),
        ),
      ],
    );
    this.openModal(m);
  }
}

export { formatNum };
