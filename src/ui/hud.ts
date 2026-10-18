import type { Game } from '../game/Game';
import type { Tower } from '../game/Tower';
import type { Renderer } from '../render/Renderer';
import { TOWERS, TOWER_ORDER } from '../game/towers';
import { HEROES, heroXpFor, MAX_HERO_LEVEL, type HeroId } from '../game/heroes';
import { canTier, type TowerId, type AbilityDef } from '../game/towerTypes';
import { TARGET_PRIORITIES, type TargetPriority } from '../game/types';
import { SYNERGIES } from '../game/synergy';
import { GLOOP_ORDER, GLOOPS, type GloopId } from '../game/gloops';
import { towerIcon, type ArtId } from '../render/towerArt';
import { formatNum } from '../core/math';
import { audio } from '../audio/audio';
import { h, clear, setText, toggle } from './dom';
import { haptic } from './haptics';
import { gloopIcon } from './icons';
import { t as tr } from '../i18n';

export interface HudHost {
  playerLevel: number;
  devUnlock: boolean;
  onQuit(): void;
  onRestart(): void;
  onRetryRound(): void;
  onSettings(): void;
  onRoundEnd(round: number): void;
  onVictory(): void;
  onDefeat(): void;
  onTutorialDone(): void;
  tutorial: boolean;
  heroId: HeroId | null;
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
  private abilityBtns: { el: HTMLElement; cd: HTMLElement; n: HTMLElement; id: string; towers: Tower[]; ab: AbilityDef }[] = [];
  private toastEl: HTMLElement | null = null;
  private toastTimer = 0;
  private handEl: HTMLElement | null = null;
  private placing: Placing | null = null;
  private lastCash = -1;
  private lastLives = -1;
  private lastCombo = 0;
  private modalOpen = false;
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
    if (game.sandbox) this.buildSandbox();
    this.bindGame();
    this.bindInput();
    if (host.tutorial) this.tutorial(0);
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

  private buildTop() {
    this.livesEl = h('span', { class: 'val' }, '0');
    this.livesPill = h('div', { class: 'pill lives' }, h('span', { class: 'ico' }, '❤️'), this.livesEl);
    this.cashEl = h('span', { class: 'val' }, '0');
    this.cashPill = h('div', { class: 'pill cash' }, h('span', { class: 'ico' }, '🪙'), this.cashEl);
    this.roundEl = h('span', { class: 'val' }, '1');
    this.roundSub = h('span', { class: 'sub' }, '');
    const roundPill = h('div', { class: 'pill round' }, h('span', { class: 'ico' }, '🌊'), this.roundEl, this.roundSub);
    this.frenzyFill = h('div', { class: 'fill' });
    this.frenzyLbl = h('span', null, tr('FRENZY'));
    this.frenzyEl = h('div', { class: 'frenzy', title: tr('Fill the meter by popping gloops, then tap for 10s of FRENZY (+50% attack speed)') }, this.frenzyFill, this.frenzyLbl);
    this.frenzyEl.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.tryFrenzy();
    });
    const top = h('div', { class: 'hud-top' }, this.livesPill, this.cashPill, roundPill, this.frenzyEl);
    const pause = h('button', { class: 'btn icon dark', title: tr('Pause (Esc)'), onclick: () => this.openPause() }, '⏸');
    const topRight = h('div', { class: 'top-right' }, pause);
    this.root.append(top, topRight);
  }

  private buildSidebar() {
    const shop = h('div', { class: 'shop' });
    if (this.host.heroId) {
      const hid = this.host.heroId;
      const card = this.makeCard('hero', hid, towerIcon(hid as ArtId, [1], 120), this.game.heroCost(hid), HEROES[hid].name, 'H');
      card.classList.add('hero');
      shop.append(card);
    }
    for (const id of TOWER_ORDER) {
      const def = TOWERS[id];
      const card = this.makeCard('tower', id, towerIcon(id as ArtId, [0, 0, 0], 120), this.game.towerCost(id), def.name, def.hotkey.toUpperCase());
      shop.append(card);
    }
    this.playBtn = h('button', { class: 'btn green play waiting', title: tr('Start round / speed (Space)') }, '▶') as HTMLButtonElement;
    this.playBtn.addEventListener('click', () => this.onPlay());
    this.autoToggle = h('div', { class: 'toggle' + (this.game.autoStart ? ' on' : '') });
    const auto = h('button', { class: 'auto', onclick: () => this.toggleAuto() }, this.autoToggle, tr('Auto-start'));
    const sb = h('div', { class: 'sidebar' }, h('div', { class: 'title' }, tr('Critters')), shop, auto, this.playBtn);
    this.root.append(sb);
  }

  private makeCard(kind: 'tower' | 'hero', id: string, icon: string, cost: number, name: string, key: string) {
    const price = h('div', { class: 'price' }, '$' + formatNum(cost));
    const card = h('div', { class: 'card', title: name }, h('img', { src: icon, alt: name, draggable: 'false' }), h('div', { class: 'key' }, key), price);
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
      const b = h('button', { title: tr('Spawn') + ' ' + tr(GLOOPS[id].name) }, h('img', { src: gloopIcon(id as GloopId), alt: '' }));
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
    });
    const clr = h('button', { title: tr('Clear gloops') }, '🧹');
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
        this.banner(tr(e.def.name).toUpperCase(), tr(e.def.desc), true);
        haptic('heavy');
      }),
      g.events.on('hint', (text) => {
        if (this.tutorialStep >= 0 && this.tutorialStep < 2 && g.round === 1) return;
        this.toast(tr(text), 3800);
      }),
      g.events.on('heroLevel', ({ level }) => {
        this.toast(tr('{name} reached level {n}!', { name: g.hero?.name ?? '', n: level }), 2200);
        this.panelKey = '';
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
      if (e.key === 'Escape') this.closeModal();
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
      if (syn) this.toast(tr('⚡ BOND: {name}! Paired critters power each other up.', { name: tr(syn.name) }), 3000);
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
    }
    if (t) audio.play('click');
  }

  private buildPanel(t: Tower) {
    const g = this.game;
    const side = this.renderer.worldToScreen(t.x, t.y).x < (window.innerWidth - this.sidebarWidth) / 2 ? 'right' : 'left';
    const panel = h('div', { class: 'upanel ' + side });
    panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    const art = t.hero ? (t.hero.id as ArtId) : (t.def!.id as ArtId);
    const tiers = t.hero ? [t.heroLevel >= 20 ? 20 : t.heroLevel >= 10 ? 10 : 1] : [...t.tiers];
    const portrait = h('div', { class: 'portrait' }, h('img', { src: towerIcon(art, tiers, 140), alt: '' }));
    const sub = t.hero ? tr(t.hero.title) : `${tr(t.def!.species)} · ${tr(t.def!.role)}`;
    const statsLine = h('div', { class: 'stats-line' });
    const head = h(
      'div',
      { class: 'uhead' },
      portrait,
      h('div', null, h('div', { class: 'name' }, t.name), h('div', { class: 'meta' }, sub), statsLine),
      h('button', { class: 'btn icon small dark close', title: tr('Close'), onclick: () => this.select(null) }, '✕'),
    );
    panel.append(head);

    if (t.def) {
      const paths = h('div', { class: 'paths' });
      for (let p = 0; p < 3; p++) {
        const tier = t.tiers[p];
        const row = h('div', { class: 'path' });
        const pips = h('div', { class: 'pips' });
        for (let i = 0; i < 5; i++) pips.append(h('div', { class: 'pip' + (i < tier ? ' on' : '') + (i === 4 ? ' five' : '') }));
        row.append(pips);
        const can = canTier(t.tiers, p);
        if (tier >= 5) {
          row.classList.add('maxed');
          const u = t.def.paths[p][4];
          row.append(h('div', { class: 'upg' }, h('div', { class: 'info' }, h('div', { class: 'pname' }, tr(t.def.pathNames[p]) + ' · MAX'), h('div', { class: 'uname' }, '★ ' + tr(u.name)), h('div', { class: 'udesc' }, tr(u.desc)))));
        } else {
          const u = t.def.paths[p][tier];
          const cost = g.upgradeCost(t, p)!;
          const icon = towerIcon(art, t.tiers.map((x, i) => (i === p ? x + 1 : x)), 90);
          const buy = h('button', { class: 'btn small gold buy' }, can ? '$' + formatNum(cost) : '🔒', h('small', null, can ? tr('Tier {n}', { n: tier + 1 }) : tr('Path closed'))) as HTMLButtonElement;
          buy.dataset.cost = String(cost);
          buy.dataset.can = can ? '1' : '0';
          buy.addEventListener('click', () => this.buyUpgrade(t, p));
          if (!can) row.classList.add('closed');
          row.append(
            h(
              'div',
              { class: 'upg' },
              h('img', { src: icon, alt: '', style: 'width:clamp(40px,8vh,56px);flex:none' }),
              h('div', { class: 'info' }, h('div', { class: 'pname' }, tr(t.def.pathNames[p])), h('div', { class: 'uname' }, tr(u.name)), h('div', { class: 'udesc' }, can ? tr(u.desc) : tr('Only 2 paths, and only one past tier 2.'))),
              buy,
            ),
          );
        }
        paths.append(row);
      }
      panel.append(paths);
    } else if (t.hero) {
      const lvl = t.heroLevel;
      const next = lvl < MAX_HERO_LEVEL ? t.hero.levels[lvl - 1] : null;
      const xpNeed = heroXpFor(lvl + 1) - heroXpFor(lvl);
      const xpInto = t.heroXp - heroXpFor(lvl);
      panel.append(
        h(
          'div',
          { class: 'path' },
          h(
            'div',
            { class: 'upg' },
            h(
              'div',
              { class: 'info' },
              h('div', { class: 'pname' }, tr('Level {n}', { n: lvl }) + (lvl >= MAX_HERO_LEVEL ? ' · MAX' : '')),
              h('div', { class: 'uname' }, next ? tr('Next: ') + tr(next.desc) : tr('Fully powered!')),
              next ? h('div', { class: 'xpbar', style: 'width:100%;margin-top:4px' }, h('div', { style: `width:${Math.round((xpInto / xpNeed) * 100)}%` })) : null,
              h('div', { class: 'udesc', style: 'margin-top:4px' }, tr('Heroes level up automatically every round.')),
            ),
          ),
        ),
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
        bonds.append(h('span', { class: 'bond', style: `background:${syn.color}`, title: tr(isA ? syn.descA : syn.descB) }, `⚡ ${tr(syn.name)}: ${tr(isA ? syn.descA : syn.descB)}`));
      }
      panel.append(bonds);
    }

    // footer
    const foot = h('div', { class: 'ufoot' });
    const hasTarget = t.stats.attacks.some((a) => ['shoot', 'hitscan', 'chain'].includes(a.kind));
    if (hasTarget) {
      const lbl = h('div', { class: 'lbl' }, prio(t.priority));
      foot.append(
        h(
          'div',
          { class: 'target' },
          h('button', { class: 'btn small dark', onclick: () => this.cyclePriority(t, -1) }, '‹'),
          lbl,
          h('button', { class: 'btn small dark', onclick: () => this.cyclePriority(t, 1) }, '›'),
        ),
      );
    }
    if (t.stats.bank) {
      const wd = h('button', { class: 'btn small green', onclick: () => this.game.withdraw(t) }, tr('Withdraw')) as HTMLButtonElement;
      wd.dataset.role = 'withdraw';
      foot.append(wd);
    }
    const sellV = t.sellValue(g.sandbox) + Math.floor(t.stash);
    const sellBtn = h('button', { class: 'btn small red', title: tr('Sell (Backspace)') }, tr('Sell ${n}', { n: formatNum(sellV) })) as HTMLButtonElement;
    let armed = false;
    sellBtn.addEventListener('click', () => {
      // expensive towers need a second tap so they are not sold by accident
      if (sellV >= 1000 && !armed && !this.game.sandbox) {
        armed = true;
        sellBtn.textContent = tr('Tap again to sell');
        audio.play('click');
        setTimeout(() => {
          armed = false;
          if (sellBtn.isConnected) sellBtn.textContent = tr('Sell ${n}', { n: formatNum(sellV) });
        }, 2200);
        return;
      }
      this.sell(t);
    });
    foot.append(sellBtn);
    panel.append(foot);

    this.root.append(panel);
    this.panel?.remove();
    this.panel = panel;
    this.panelFor = t;
    this.updateStatsLine(t, statsLine);
  }

  private updateStatsLine(t: Tower, el: HTMLElement) {
    const parts = [tr('Pops {n}', { n: formatNum(t.pops) })];
    if (t.stats.bank) parts.push(tr('Stash ${a} / {b}', { a: formatNum(t.stash), b: formatNum(t.stats.bank.capacity) }));
    if (t.stats.income && !t.stats.bank) {
      const inc = t.stats.income;
      const per = inc.perDrop * inc.drops * t.buffs.incomeMul + inc.bonusPerRound;
      parts.push(tr('${n}/round', { n: formatNum(per) }));
    }
    if (t.camo) parts.push(tr('👁 Camo'));
    const main = this.mainAttackSummary(t);
    if (main) parts.push(main);
    setText(el, parts.join(' · '));
  }

  /** Short "damage / pierce / speed" readout of the primary attack. */
  private mainAttackSummary(t: Tower): string {
    const a = t.stats.attacks[0];
    if (!a) return '';
    const rate = a.rate / t.rateFactor(this.game.time, this.game.frenzyT > 0);
    const perSec = rate > 0 ? (1 / rate).toFixed(rate < 1 ? 1 : 2) : '';
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
      pierce = a.proj.pierce;
      return `⚔ ${dmg + t.buffs.damageAdd} · 🐝 ${a.count}`;
    } else return '';
    return `⚔ ${dmg + (dmg > 0 ? t.buffs.damageAdd : 0)} · ➹ ${pierce + t.buffs.pierceAdd} · ⏱ ${perSec}/s`;
  }

  private refreshPanel() {
    const t = this.renderer.selected;
    if (!t) return;
    if (!this.game.towers.includes(t)) {
      this.select(null);
      return;
    }
    const key = `${t.id}|${t.tiers.join('')}|${t.heroLevel}|${t.priority}|${t.bonds.map((b) => b.synergyId).join(',')}`;
    if (key !== this.panelKey || this.panelFor !== t) {
      this.panelKey = key;
      this.buildPanel(t);
    }
    if (!this.panel) return;
    // affordability
    for (const b of this.panel.querySelectorAll<HTMLButtonElement>('.buy')) {
      const cost = +b.dataset.cost!;
      const ok = b.dataset.can === '1' && (this.game.sandbox || this.game.cash >= cost);
      toggle(b, 'disabled', !ok);
    }
    const sl = this.panel.querySelector('.stats-line') as HTMLElement | null;
    if (sl) this.updateStatsLine(t, sl);
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
    } else {
      g.speed = g.speed === 1 ? 2 : g.speed === 2 ? 3 : 1;
      audio.play('click');
    }
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
      setText(this.cashEl, g.sandbox ? '∞' : '$' + formatNum(cash));
      if (cash > this.lastCash && this.lastCash >= 0) {
        this.cashPill.classList.remove('gain');
        void this.cashPill.offsetWidth;
        this.cashPill.classList.add('gain');
      }
      this.lastCash = cash;
      this.updateCards();
    }
    if (g.lives !== this.lastLives) {
      setText(this.livesEl, g.sandbox ? '∞' : formatNum(Math.max(0, g.lives)));
      this.lastLives = g.lives;
    }
    setText(this.roundEl, String(g.round));
    setText(this.roundSub, g.sandbox ? '' : g.freeplay ? tr(' freeplay') : `/${g.lastRound}`);
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
    // play button
    const state = g.roundActive ? (g.speed === 1 ? '▶' : g.speed === 2 ? '⏩' : '⏭') : '▶';
    setText(this.playBtn, g.roundActive ? `${state}` : '▶');
    toggle(this.playBtn, 'waiting', !g.roundActive && !g.over);
    toggle(this.playBtn, 'fast', g.roundActive && g.speed === 2);
    toggle(this.playBtn, 'faster', g.roundActive && g.speed === 3);
    toggle(this.playBtn, 'green', !(g.roundActive && g.speed > 1));
    this.refreshPanel();
    this.updateAbilities();
    if (this.toastEl && (this.toastTimer -= dt) <= 0) {
      this.toastEl.remove();
      this.toastEl = null;
    }
    if (this.showFps) {
      this.fpsAcc += dt;
      this.fpsN++;
      if (this.fpsAcc > 0.5) {
        toggle(this.fpsEl, 'hidden', false);
        setText(this.fpsEl, `${Math.round(this.fpsN / this.fpsAcc)} fps · ${g.enemies.length} gloops · ${g.projectiles.length} proj`);
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
      toggle(card, 'locked', !unlocked || banned);
      toggle(card, 'banned', banned);
      const placedHero = kind === 'hero' && !!g.hero;
      toggle(card, 'poor', unlocked && !placedHero && !g.sandbox && g.cash < cost);
      const price = card.querySelector('.price') as HTMLElement;
      if (!unlocked) setText(price, tr('Lvl {n}', { n: kind === 'tower' ? TOWERS[id as TowerId].unlock : HEROES[id as HeroId].unlock }));
      else if (placedHero) setText(price, tr('Lv {n}', { n: g.hero!.heroLevel }));
      else setText(price, '$' + formatNum(cost));
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
        const cd = h('div', { class: 'cd' });
        const n = h('div', { class: 'n' }, gr.towers.length > 1 ? `x${gr.towers.length}` : '');
        const el = h('button', { class: 'ability', title: `${tr(gr.ab.name)}: ${tr(gr.ab.desc)}` }, gr.ab.icon, cd, n);
        el.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          this.useAbility(id);
        });
        this.abilitiesEl.append(el);
        this.abilityBtns.push({ el, cd, n, id, towers: gr.towers, ab: gr.ab });
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
      toggle(b.el, 'ready', ready > 0);
      toggle(b.el, 'cooling', ready === 0);
      b.cd.style.background = frac > 0 ? `conic-gradient(rgba(20,10,30,0.65) ${frac * 360}deg, transparent 0)` : 'none';
      setText(b.n, b.towers.length > 1 ? `${ready}/${b.towers.length}` : ready ? '' : `${Math.ceil(best)}s`);
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
    const el = h('div', { class: 'banner' + (boss ? ' boss' : ''), style: small ? 'font-size:clamp(26px,6vh,52px)' : '' }, text, sub ? h('small', null, sub) : null);
    this.root.append(el);
    setTimeout(() => el.remove(), 1900);
  }

  toast(text: string, ms = 2500) {
    this.toastEl?.remove();
    this.toastEl = h('div', { class: 'toast' }, text);
    this.root.append(this.toastEl);
    this.toastTimer = ms / 1000;
  }

  private tutorial(step: number) {
    this.tutorialStep = step;
    this.handEl?.remove();
    this.handEl = null;
    const card = this.cards.get('tower:spike');
    if (step === 0 && card) {
      this.toast(tr('👋 Drag the Hedgehog from the shop onto the grass near the track!'), 999999);
      const r = card.getBoundingClientRect();
      this.handEl = h('div', { class: 'hand', style: `left:${r.left + r.width * 0.3}px;top:${r.top + r.height * 0.4}px;--dx:-${Math.round(window.innerWidth * 0.35)}px;--dy:0px` }, '👆');
      this.root.append(this.handEl);
    } else if (step === 1) {
      this.toast(tr('Nice! Press ▶ to send in the gloops.'), 999999);
      const r = this.playBtn.getBoundingClientRect();
      this.handEl = h('div', { class: 'hand', style: `left:${r.left + r.width * 0.35}px;top:${r.top - 30}px;--dx:0px;--dy:14px` }, '👇');
      this.root.append(this.handEl);
    } else if (step === 2) {
      this.toast(tr('Pop them all! Each layer you pop earns cash. 🪙'), 3500);
    } else if (step === 3) {
      this.toast(tr('Tap a tower to upgrade it. Upgrades make critters WAY stronger!'), 6000);
    } else if (step === 4) {
      this.toast(tr('🎉 You got it! Tip: place different critters close together to form ⚡ BONDS.'), 5000);
      this.tutorialStep = -1;
      this.host.onTutorialDone();
    }
  }

  // -------------------------------------------------------------------------------------------
  // Modals
  // -------------------------------------------------------------------------------------------

  openModal(content: HTMLElement, pause = true) {
    this.closeModal();
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
    this.game.paused = false;
  }

  get isModalOpen() {
    return this.modalOpen;
  }

  openPause() {
    const m = h(
      'div',
      { class: 'modal' },
      h('h2', null, tr('Paused')),
      h('p', null, tr('{map} · {diff} · Round {n}', { map: tr(this.game.map.name), diff: tr(this.game.diff.name), n: this.game.round })),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn green', onclick: () => this.closeModal() }, tr('▶ Resume')),
        h('button', { class: 'btn blue', onclick: () => this.host.onSettings() }, tr('⚙️ Settings')),
      ),
      h(
        'div',
        { class: 'row' },
        h('button', { class: 'btn dark small', onclick: () => this.host.onRestart() }, tr('↻ Restart')),
        h('button', { class: 'btn dark small', onclick: () => this.host.onQuit() }, tr('🏠 Home')),
      ),
    );
    this.openModal(m);
  }
}

export { formatNum };
