import type { Game } from '../game/Game';
import type { Tower } from '../game/Tower';
import type { Renderer } from '../render/Renderer';
import { TOWERS } from '../game/towers';
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
import { t as tr, getLang } from '../i18n';
import { TOWERS_BY_ROLE, roleCls, roleIcon } from './roles';
import { modal, btn, chip, uiIcon, img, bar, closeBtn, restartIcon, bump, reducedMotion, watchScroll, towerPortraitUrl, heroPortraitUrl, starPortraitUrl, MEDAL, MEDAL_EMOJI } from './kit';

/** Accent per upgrade path (generic tier icons, pips). */
const PATH_COLOR = ['#ff8a3c', '#3fb2ff', '#5bdc5a'];
const HERO_LOOK_LEVELS = [1, 7, 14];
/** physical Q-O keys, one per shop slot (same order as 1-9) */
const SLOT_CODES = ['KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT', 'KeyY', 'KeyU', 'KeyI', 'KeyO'];
/** localStorage key: is the ability dock expanded */
const DOCK_KEY = 'sb.abilityDock';

/** HUD number: compact like formatNum, with German separators (1.500 / 9,7M) in German. */
function num(n: number): string {
  const s = formatNum(n);
  return getLang() === 'de' ? s.replace(/[.,]/g, (c) => (c === ',' ? '.' : ',')) : s;
}

/** Decimal with the locale's separator. */
function dec(n: number, digits: number): string {
  const s = n.toFixed(digits);
  return getLang() === 'de' ? s.replace('.', ',') : s;
}

function readDockOpen(): boolean {
  try {
    return localStorage.getItem(DOCK_KEY) !== '0';
  } catch {
    return true;
  }
}

function saveDockOpen(open: boolean) {
  try {
    localStorage.setItem(DOCK_KEY, open ? '1' : '0');
  } catch {
    /* private mode / blocked storage: the dock just forgets */
  }
}

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
/** little quad drone (stat chip) */
const DRONE = 'M12 10v4M8.5 8.5 10.5 10.5M15.5 8.5 13.5 10.5M8.5 15.5 10.5 13.5M15.5 15.5 13.5 13.5M4.5 7.5h5M14.5 7.5h5M4.5 16.5h5M14.5 16.5h5';
/** Tutorial pointer: a glossy gold arrow with an ink outline (points down; rotated by CSS). */
const POINTER_SVG =
  '<svg viewBox="0 0 48 56" width="100%" height="100%" aria-hidden="true"><path d="M15 4h18v22h11L24 52 4 26h11z" fill="#ffd23c" stroke="#120a2b" stroke-width="4.5" stroke-linejoin="round"/><path d="M19.5 8.5h6v19" fill="none" stroke="#fff6c8" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/><path d="M33 26h4.5L24 44" fill="none" stroke="#e08a00" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.7"/></svg>';
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
  private barEl!: HTMLElement;
  private topEl!: HTMLElement;
  /** text lengths of the counters the top bar was last fitted for */
  private barKey = -1;
  private comboEl!: HTMLElement;
  private playBtn!: HTMLButtonElement;
  private autoToggle!: HTMLElement;
  private cards = new Map<string, HTMLElement>();
  private panel: HTMLElement | null = null;
  private panelFor: Tower | null = null;
  private panelKey = '';
  private panelSide: 'left' | 'right' = 'right';
  /** path rows whose description the player tapped open */
  private openDesc = new Set<number>();
  /** "t.id:path" of a tier that was just unlocked with XP (its row flashes once) */
  private justUnlocked = '';
  private abilitiesEl!: HTMLElement;
  private dockEl!: HTMLElement;
  private dockCount!: HTMLElement;
  private dockOpen = readDockOpen();
  private dockReady = false;
  private dockRO: ResizeObserver | null = null;
  private abilityKey = '';
  private abilityBtns: { el: HTMLElement; cd: HTMLElement; n: HTMLElement; time: HTMLElement; id: string; towers: Tower[]; ab: AbilityDef; state: string }[] = [];
  /** raccoon types already announced as "new tier unlockable" this game */
  private unlockAnnounced = new Set<TowerId>();
  private toastQ: { text: string; ms: number; icon?: string; cls?: string }[] = [];
  private bannerEl: HTMLElement | null = null;
  private bannerBig = false;
  private bannerQ: (() => void)[] = [];
  private destroyed = false;
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
    this.buildDock();
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
    this.destroyed = true;
    for (const u of this.unsub) u();
    this.unsub = [];
    this.dockRO?.disconnect();
    this.renderer.panTarget = 0;
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('pointermove', this.onWinMove);
    window.removeEventListener('pointerup', this.onWinUp);
    window.removeEventListener('resize', this.onResize);
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
    this.topEl = h('div', { class: 'hud-top' }, this.livesPill, this.cashPill, roundPill, this.frenzyEl);
    this.barEl = h('div', { class: 'hud-bar' }, this.topEl, h('div', { class: 'top-right' }, this.speedBtn, pause, gear));
    this.root.append(this.barEl);
    document.fonts?.ready.then(() => !this.destroyed && this.fitBar()).catch(() => {});
  }

  /**
   * Narrow maps (small phones, notches): when the counters would run under the speed / pause
   * buttons the frenzy meter drops its label (.tight), then the pills tighten up (.tighter).
   */
  private fitBar() {
    const bar = this.barEl;
    const top = this.topEl;
    if (!bar.isConnected) return;
    bar.classList.remove('tight', 'tighter');
    if (top.scrollWidth <= top.clientWidth + 1) return;
    bar.classList.add('tight');
    if (top.scrollWidth > top.clientWidth + 1) bar.classList.add('tighter');
  }

  private buildSidebar() {
    const shop = h('div', { class: 'shop' });
    if (this.host.heroId) {
      const hid = this.host.heroId;
      shop.append(this.makeCard('hero', hid, heroPortraitUrl(hid, 1), tr(HEROES[hid].name), 'H'));
    }
    // grouped by role (Basis -> Military -> Magic -> Support) and coloured by it; the hotkeys
    // 1-9 (and Q-O on the same keys) follow the order on screen
    TOWERS_BY_ROLE.forEach((id, i) => shop.append(this.makeCard('tower', id, towerPortraitUrl(id), tr(TOWERS[id].name), String(i + 1))));
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
    const role = kind === 'hero' ? 'Hero' : TOWERS[id as TowerId].role;
    const label = `${name} · ${tr(role)}`;
    const card = h(
      'div',
      { class: `card ${kind} ${roleCls(role)}`, title: label, role: 'button', 'aria-label': label },
      h('div', { class: 'card-art' }, h('img', { src: icon, alt: '', draggable: 'false', decoding: 'async' })),
      h('div', { class: 'key' }, key),
      roleIcon(role, 'card-role'),
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

  /** Ability dock (bottom-left of the map): a chevron tab that expands/collapses the ability row. */
  private buildDock() {
    this.abilitiesEl = h('div', { class: 'abilities' });
    this.dockCount = h('span', { class: 'dock-n' }, '0');
    const tab = h(
      'button',
      { class: 'dock-tab', type: 'button', title: tr('Abilities'), 'aria-label': tr('Abilities'), 'aria-expanded': String(this.dockOpen) },
      h('span', { class: 'dock-bolt', html: BOLT_SVG }),
      glyph(CHEVRONS[0], 6.5, '#fff6d6', 'chev'),
      this.dockCount,
    );
    tab.addEventListener('pointerdown', (e) => e.stopPropagation());
    tab.addEventListener('click', () => {
      audio.unlock();
      audio.play('click');
      this.dockOpen = !this.dockOpen;
      saveDockOpen(this.dockOpen);
      tab.setAttribute('aria-expanded', String(this.dockOpen));
      toggle(this.dockEl, 'open', this.dockOpen);
    });
    this.dockEl = h('div', { class: 'ab-dock hidden' + (this.dockOpen ? ' open' : '') }, tab, this.abilitiesEl);
    this.root.append(this.dockEl);
    // toasts sit above the dock, however many rows it wraps into
    const setH = () => this.root.style.setProperty('--dock-h', this.dockEl.classList.contains('hidden') ? '0px' : `${Math.ceil(this.dockEl.offsetHeight)}px`);
    if (typeof ResizeObserver !== 'undefined') {
      this.dockRO = new ResizeObserver(setH);
      this.dockRO.observe(this.dockEl);
    }
    this.syncDockH = setH;
  }

  private syncDockH = () => {};

  private buildSandbox() {
    const p = h('div', { class: 'sandbox-panel' });
    for (const id of GLOOP_ORDER) {
      const b = h('button', { type: 'button', title: tr('Spawn') + ' ' + tr(GLOOPS[id].name) }, img(starPortraitUrl(id as GloopId)));
      b.addEventListener('click', (e) => {
        const n = (e as MouseEvent).shiftKey ? 10 : 1;
        for (let i = 0; i < n; i++) this.game.spawn(id as GloopId, { dist: i * 14 });
      });
      p.append(b);
    }
    p.addEventListener('pointerdown', (e) => e.stopPropagation());
    const lvl = h('button', { type: 'button', class: 'sb-tool', title: tr('Hero +1 level') }, uiIcon('xp', '⭐'));
    lvl.addEventListener('click', () => {
      const hero = this.game.hero;
      if (hero) hero.addHeroXp(Math.max(0, heroXpFor(hero.heroLevel + 1) - hero.heroXp));
      this.panelKey = '';
      this.lastCash = -1; // refresh the hero shop card (sandbox cash never changes)
    });
    const clr = h('button', { type: 'button', class: 'sb-tool', title: tr('Clear stars') }, uiIcon('close', '✕'));
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
        this.toast(tr('Round {n} complete! +${bonus}', { n: round, bonus: num(bonus) }), 1800);
        const before = this.unlockableTypes();
        this.host.onRoundEnd(round);
        if (this.tutorialStep === 2 && round >= 1) this.tutorial(3);
        this.announceUnlockable(before);
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

  /** Bandit progression is active in this game (sandbox, dev mode and dailies have every tier open). */
  private get progression() {
    return !this.game.sandbox && !!this.game.config.upgradeLimits;
  }

  /** XP-locked tier of `p` that the player can afford to unlock right now. */
  private canUnlockPath(t: Tower, p: number) {
    if (!t.def || !this.game.upgradeLocked(t, p)) return false;
    const cost = this.host.progress.nextCost(t.def.id, p);
    return cost !== null && this.host.progress.xp(t.def.id) >= cost;
  }

  /** Raccoon types on the field with at least one locked tier they could unlock with their XP. */
  private unlockableTypes(): Set<TowerId> {
    const out = new Set<TowerId>();
    if (!this.progression) return out;
    for (const t of this.game.towers) {
      if (!t.def || out.has(t.def.id)) continue;
      const id = t.def.id;
      for (let p = 0; p < 3; p++) {
        const cost = this.host.progress.nextCost(id, p);
        if (cost !== null && this.host.progress.xp(id) >= cost) {
          out.add(id);
          break;
        }
      }
    }
    return out;
  }

  /** After a round: one short toast per raccoon type (once per game) that just became able to unlock a tier. */
  private announceUnlockable(before: Set<TowerId>) {
    const fresh = [...this.unlockableTypes()].filter((id) => !before.has(id) && !this.unlockAnnounced.has(id));
    if (!fresh.length) return;
    for (const id of fresh) this.unlockAnnounced.add(id);
    const names = fresh.map((id) => tr(TOWERS[id].name)).join(', ');
    this.toast(tr('New tier unlockable: {name}!', { name: names }), 2600, { icon: 'xp', queue: true, cls: 'xp' });
    this.panelKey = '';
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
    window.addEventListener('resize', this.onResize);
  }

  /** Re-lay the upgrade panel (side + camera nudge) and the tutorial pointer for the new size. */
  private onResize = () => {
    this.panelKey = '';
    this.barKey = -1;
    if (this.tutorialStep === 0 || this.tutorialStep === 1) requestAnimationFrame(() => this.placePointer());
  };

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
    // shop slots by position: 1-9 or the Q-O row (physical keys, so QWERTZ works the same)
    const slot = /^(Digit|Numpad)[1-9]$/.test(e.code) ? +e.code.slice(-1) - 1 : SLOT_CODES.indexOf(e.code);
    const id = slot >= 0 ? TOWERS_BY_ROLE[slot] : undefined;
    if (id) {
      if (!this.isUnlocked('tower', id) || !this.game.isAllowed(id)) return;
      this.startPlacing('tower', id, null, false);
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
      this.toast(tr('Need ${n} more', { n: num(cost - this.game.cash) }), 1200);
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
      if (syn) this.toast(tr('BOND: {name}! Paired bandits power each other up.', { name: tr(syn.name) }), 3000, { icon: 'bond' });
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
    this.openDesc.clear();
    if (!t) {
      this.renderer.panTarget = 0;
      if (this.panel) {
        this.panel.remove();
        this.panel = null;
        this.panelFor = null;
      }
      this.root.classList.remove('up-left', 'up-right', 'up-tight');
    }
    if (t) audio.play('click');
  }

  private buildPanel(t: Tower) {
    const g = this.game;
    const sameTower = this.panelFor === t;
    // laid out on the left first; placePanel measures it and picks the side
    const role = t.hero ? 'Hero' : t.def!.role;
    const panel = h('div', { class: `upanel left ${roleCls(role)}` + (t.hero ? ' is-hero' : '') });
    panel.addEventListener('pointerdown', (e) => e.stopPropagation());
    const look = t.hero ? heroPortraitUrl(t.hero.id, t.heroLevel) : towerPortraitUrl(t.def!.id, t.tiers);
    const sub = t.hero ? tr(t.hero.title) : `${tr(t.def!.species)} · ${tr(t.def!.role)}`;
    const statsLine = h('div', { class: 'stats-line' });
    const meta = h('div', { class: 'meta' }, roleIcon(role, 'u-role'), h('span', { class: 'meta-t' }, sub));
    if (t.def && this.progression) {
      // this raccoon type's unspent bandit XP (spent below to unlock tiers)
      const can = [0, 1, 2].some((p) => this.canUnlockPath(t, p));
      meta.append(
        h(
          'span',
          { class: 'u-xp' + (can ? ' can' : ''), title: tr('{name} XP: unlocks new upgrade tiers', { name: tr(t.def.name) }) },
          uiIcon('xp', '⭐'),
          h('b', null, num(this.host.progress.xp(t.def.id))),
          h('small', null, tr('XP')),
        ),
      );
    }
    panel.append(
      h(
        'div',
        { class: 'uhead' },
        h('div', { class: 'u-portrait' }, img(look)),
        h('div', { class: 'u-title' }, h('div', { class: 'name t-outline' }, tr(t.name)), meta, statsLine),
        closeBtn(() => {
          audio.play('click');
          this.select(null);
        }),
      ),
    );
    // paths, hero card and bonds scroll; the targeting / sell footer stays pinned
    const body = h('div', { class: 'ubody' });

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
        if (this.justUnlocked === `${t.id}:${p}`) row.classList.add('unlocked-now');
        if (tier >= 5) {
          const u = def.paths[p][4];
          row.classList.add('maxed');
          row.append(this.upgIcon(def.id, t.tiers, 5), this.pathInfo(row, p, head, tr(u.name), tr(u.desc)), h('div', { class: 'maxmark' }, uiIcon('crown', '👑'), h('b', null, tr('MAX'))));
        } else if (!can) {
          // crosspath rule: this path can never go further on this raccoon
          const u = def.paths[p][tier];
          const next = t.tiers.map((x, i) => (i === p ? x + 1 : x));
          row.classList.add('closed');
          const buy = h('button', { class: 'btn small buy dark closed', type: 'button', title: tr('Path closed') }, uiIcon('lock', '🔒', 'lock'), h('small', null, tr('Path closed')));
          row.append(this.upgIcon(def.id, next, tier + 1), this.pathInfo(row, p, head, tr(u.name), tr('Only 2 paths, and only one past tier 2.')), buy);
        } else if (g.upgradeLocked(t, p)) {
          row.append(...this.xpLockedRow(t, p, row, head));
        } else {
          const u = def.paths[p][tier];
          const cost = g.upgradeCost(t, p)!;
          const next = t.tiers.map((x, i) => (i === p ? x + 1 : x));
          const buy = h(
            'button',
            { class: 'btn small buy gold', type: 'button', title: tr(u.name) },
            h('span', { class: 'bp' }, uiIcon('coin', '$', 'coin'), h('span', null, num(cost))),
            h('small', null, tr('Tier {n}', { n: tier + 1 })),
          ) as HTMLButtonElement;
          buy.dataset.cost = String(cost);
          buy.dataset.can = '1';
          buy.addEventListener('click', () => this.buyUpgrade(t, p));
          row.append(this.upgIcon(def.id, next, tier + 1), this.pathInfo(row, p, head, tr(u.name), tr(u.desc)), buy);
        }
        paths.append(row);
      }
      this.justUnlocked = '';
      body.append(paths);
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
      body.append(
        h(
          'div',
          { class: 'path hero-lv' },
          h('div', { class: 'lv-badge' }, uiIcon('xp', '⭐'), h('b', { class: 't-num' }, String(lvl))),
          h(
            'div',
            { class: 'info' },
            h('div', { class: 'p-head' }, h('span', { class: 'pname' }, tr('Level {n}', { n: lvl }) + (lvl >= MAX_HERO_LEVEL ? ' · ' + tr('MAX') : ''))),
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
        bonds.append(h('span', { class: 'bond', style: `--bc:${syn.color}`, title: tr(isA ? syn.descA : syn.descB) }, uiIcon('bond', '⚡', 'bond-ico'), h('span', null, h('b', null, tr(syn.name)), ' ' + tr(isA ? syn.descA : syn.descB))));
      }
      body.append(bonds);
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
    const sellBtn = btn(h('span', { class: 'sell-in' }, sellLbl, h('span', { class: 'sv' }, uiIcon('coin', '$', 'coin'), num(sellV))), 'red', () => {
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
    panel.append(body, foot);

    this.root.append(panel);
    this.panel?.remove();
    this.panel = panel;
    this.panelFor = t;
    this.placePanel(t, panel, sameTower);
    for (const d of panel.querySelectorAll<HTMLElement>('.path .udesc')) {
      const row = d.closest('.path')!;
      // Baloo's tall glyphs overflow a line box by ~2px: only a hidden line (> half a line) counts
      if (row.classList.contains('open') || d.scrollHeight - d.clientHeight > 5) row.classList.add('more');
    }
    watchScroll(body);
    this.buildStats(t, statsLine);
  }

  /** Name + description of a path row; tapping it shows the full description (phones clamp it). */
  private pathInfo(row: HTMLElement, p: number, head: HTMLElement, name: string, desc: string, extra: HTMLElement | null = null): HTMLElement {
    // a small chevron beside the path name says "tap for more" when the description is clamped
    head.insertBefore(glyph(CHEVRONS[0], 6.5, '#c6baee', 'more-chev'), head.lastChild);
    const info = h('div', { class: 'info', title: desc }, head, h('div', { class: 'uname' }, name), h('div', { class: 'udesc' }, desc), extra);
    if (this.openDesc.has(p)) row.classList.add('open');
    info.addEventListener('click', () => {
      const open = !row.classList.contains('open');
      toggle(row, 'open', open);
      if (open) this.openDesc.add(p);
      else this.openDesc.delete(p);
    });
    return info;
  }

  /** Next tier exists but the player has not unlocked it with this raccoon type's XP yet. */
  private xpLockedRow(t: Tower, p: number, row: HTMLElement, head: HTMLElement): HTMLElement[] {
    const def = t.def!;
    const tier = t.tiers[p];
    const u = def.paths[p][tier];
    const next = t.tiers.map((x, i) => (i === p ? x + 1 : x));
    const cost = this.host.progress.nextCost(def.id, p) ?? 0;
    const xp = this.host.progress.xp(def.id);
    const afford = xp >= cost;
    row.classList.add('xlock');
    toggle(row, 'afford', afford);
    const label = afford ? tr('Ready to unlock!') : `${num(xp)} / ${num(cost)} ${tr('XP')}`;
    const xbar = h('div', { class: 'xbar' }, uiIcon('xp', '⭐'), bar(cost > 0 ? xp / cost : 1, afford ? 'gold' : '', label, 15));
    const ico = this.upgIcon(def.id, next, tier + 1);
    ico.append(h('span', { class: 'u-lock' }, uiIcon('lock', '🔒')));
    const title = tr('Unlock tier {n} for {xp} XP', { n: tier + 1, xp: num(cost) });
    const action = afford
      ? h('button', { class: 'btn small buy unlock gold glint', type: 'button', title }, h('span', { class: 'bp' }, uiIcon('xp', '⭐', 'xpi'), h('span', null, num(cost))), h('small', null, tr('Unlock')))
      : h('button', { class: 'btn small buy dark xlocked', type: 'button', title }, uiIcon('lock', '🔒', 'lock'), h('small', null, tr('Unlock with XP')));
    action.addEventListener('click', () => this.unlockTier(t, p));
    return [ico, this.pathInfo(row, p, head, tr(u.name), tr(u.desc), xbar), action];
  }

  private unlockTier(t: Tower, p: number) {
    if (!t.def) return;
    audio.unlock();
    const id = t.def.id;
    if (!this.canUnlockPath(t, p)) {
      audio.play('error');
      const cost = this.host.progress.nextCost(id, p) ?? 0;
      this.toast(tr('{name} needs {n} more XP. Raccoons earn XP for every round they fight.', { name: tr(t.def.name), n: num(Math.max(0, cost - this.host.progress.xp(id))) }), 2800, { icon: 'xp' });
      return;
    }
    if (this.host.progress.unlock(id, p)) {
      haptic('light');
      this.justUnlocked = `${t.id}:${p}`;
      this.panelKey = '';
      this.toast(tr('Tier {n} unlocked for every {name}!', { n: t.tiers[p] + 1, name: tr(t.def.name) }), 2200, { icon: 'xp', cls: 'xp' });
    }
  }

  /**
   * Puts the panel on the side that hides less of its tower and nudges the camera when the tower
   * would still sit under it (short phones: the panel is wider than half the map).
   */
  private placePanel(t: Tower, panel: HTMLElement, keepSide: boolean) {
    const r = this.renderer;
    const mapW = window.innerWidth - this.sidebarWidth;
    const w = panel.offsetWidth;
    const leftEnd = panel.offsetLeft + w; // right edge of a left panel
    const rightStart = mapW - 8 - w; // left edge of a right panel
    const sx = r.worldToScreen(t.x, t.y).x - r.panX;
    const m = t.radius * r.scale * 1.5 + 10;
    const panL = Math.max(0, leftEnd + m - sx);
    const panR = Math.min(0, rightStart - m - sx);
    let side: 'left' | 'right';
    if (keepSide) side = this.panelSide;
    else if (panL === 0 && panR === 0) side = sx < mapW / 2 ? 'right' : 'left';
    else side = panL <= -panR ? 'left' : 'right';
    const max = r.maxPan;
    r.panTarget = Math.max(-max, Math.min(max, side === 'left' ? panL : panR));
    this.panelSide = side;
    if (side === 'right') {
      panel.classList.remove('left');
      panel.classList.add('right');
    }
    toggle(this.root, 'up-left', side === 'left');
    toggle(this.root, 'up-right', side === 'right');
    // tiny phones: the strip of map beside the panel is too narrow for the sandbox spawn panel as well
    toggle(this.root, 'up-tight', mapW - w - 24 < 160);
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
      if (a.kind === 'drone') add('drones', glyph(DRONE, 4.6, '#ffe7a8'), tr('Drones'));
      else add('pierce', glyph('M4 12h13M13 6l6 6-6 6', 5.5, '#cfe8ff'), tr('Pierce'));
      if (a.kind !== 'drone') add('rate', glyph('M12 7v5l3 2M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17', 4.5, '#e0ffd0'), tr('Attacks per second'));
    }
    if (t.camo) el.append(h('span', { class: 'st camo', title: tr('Camo detection') }, uiIcon('camo', '👁'), h('span', null, tr('Camo'))));
    this.updateStats(t);
  }

  private updateStats(t: Tower) {
    const s = this.statEls;
    if (s.pops) setText(s.pops, num(t.pops));
    if (s.stash && t.stats.bank) setText(s.stash, `$${num(t.stash)}/${num(t.stats.bank.capacity)}`);
    if (s.income && t.stats.income) {
      const inc = t.stats.income;
      setText(s.income, tr('${n}/round', { n: num(inc.perDrop * inc.drops * t.buffs.incomeMul + inc.bonusPerRound) }));
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
      setText(s.rate, rate > 0 ? `${dec(1 / rate, rate < 1 ? 1 : 2)}/s` : '–');
    }
  }

  private refreshPanel() {
    const t = this.renderer.selected;
    if (!t) return;
    if (!this.game.towers.includes(t)) {
      this.select(null);
      return;
    }
    // bandit XP and unlocked tiers change the lock rows (round ends, unlocking)
    const prog = t.def && this.progression ? `${this.host.progress.xp(t.def.id)}|${[0, 1, 2].map((p) => this.game.upgradeLimit(t, p)).join('')}` : '';
    const key = `${t.id}|${t.tiers.join('')}|${t.heroLevel}|${t.priority}|${t.camo}|${t.bonds.map((b) => b.synergyId).join(',')}|${prog}`;
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
    if (!canTier(t.tiers, p) || t.tiers[p] >= 5) {
      audio.play('error');
      return;
    }
    if (this.game.upgradeLocked(t, p)) {
      // hotkeys never spend XP: the panel's unlock button does that
      audio.play('error');
      this.toast(tr('Unlock this tier with XP first'), 1600, { icon: 'lock' });
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
      setText(this.cashEl, g.sandbox ? '∞' : '$' + num(Math.round(this.shownCash)));
    }
    if (g.lives !== this.lastLives) {
      setText(this.livesEl, g.sandbox ? '∞' : num(Math.max(0, g.lives)));
      toggle(this.livesPill, 'low', !g.sandbox && g.lives > 0 && g.lives <= Math.max(5, g.diff.lives * 0.2));
      this.lastLives = g.lives;
    }
    // after the last round the counter is already one past it; don't show 41/40 behind the victory screen
    setText(this.roundEl, String(g.freeplay || g.sandbox ? g.round : Math.min(g.round, g.lastRound)));
    setText(this.roundSub, g.sandbox ? '' : g.freeplay ? '∞' : `/${g.lastRound}`);
    // longer numbers (or a resize) may no longer fit beside the buttons
    const barKey = (this.cashEl.textContent!.length * 64 + this.livesEl.textContent!.length) * 64 + this.roundEl.textContent!.length + this.roundSub.textContent!.length;
    if (barKey !== this.barKey) {
      this.barKey = barKey;
      this.fitBar();
    }
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
      const next = this.toastQ.shift();
      if (next) this.showToast(next.text, next.ms, next.icon, next.cls);
    }
    // a raccoon placed some other way (restored save, script) still ends the "place a bandit" step
    if (this.tutorialStep === 0 && g.towers.length > 0) this.tutorial(1);
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
      if (!unlocked) setText(pv, tr('Lv {n}', { n: kind === 'tower' ? TOWERS[id as TowerId].unlock : HEROES[id as HeroId].unlock }));
      else if (placedHero) setText(pv, tr('Lv {n}', { n: g.hero!.heroLevel }));
      else setText(pv, num(cost));
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
      toggle(this.dockEl, 'hidden', groups.size === 0);
      setText(this.dockCount, String(groups.size));
      this.syncDockH();
    }
    let anyReady = false;
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
      if (ready > 0) anyReady = true;
    }
    // the collapsed tab glows while something is ready to fire
    if (anyReady !== this.dockReady) {
      this.dockReady = anyReady;
      toggle(this.dockEl, 'ready', anyReady);
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

  /**
   * Centre-screen headline. Banners never stack: a small one (round start, ability name) is
   * replaced by the next banner and skipped while a big one plays; big ones queue up.
   */
  banner(text: string, sub: string | null, boss: boolean, small = false) {
    // a boss just shattered: its headline is still rising from the boss, so the banner waits for it
    const wait = this.renderer.headlineUntil - performance.now();
    if (wait > 0) {
      setTimeout(() => !this.destroyed && this.banner(text, sub, boss, small), wait);
      return;
    }
    const show = () => {
      if (this.destroyed) return;
      const el = h('div', { class: 'banner' + (boss ? ' boss' : '') + (small ? ' small' : '') }, h('span', { class: 'b-main' }, text), sub ? h('small', null, sub) : null);
      this.root.append(el);
      this.bannerEl = el;
      this.bannerBig = !small;
      setTimeout(() => {
        el.remove();
        if (this.bannerEl !== el) return;
        this.bannerEl = null;
        this.bannerQ.shift()?.();
      }, 1900);
    };
    if (!this.bannerEl) show();
    else if (!this.bannerBig) {
      this.bannerEl.remove();
      this.bannerEl = null;
      show();
    } else if (!small && this.bannerQ.length < 3) this.bannerQ.push(show);
  }

  /**
   * Bottom-centre message. A new toast replaces the current one; `queue` waits for it instead
   * (used for follow-ups such as the "new tier unlockable" note after "Round complete").
   */
  toast(text: string, ms = 2500, o: { icon?: string; queue?: boolean; cls?: string } = {}) {
    if (o.queue && this.toastEl) {
      if (this.toastQ.length < 4) this.toastQ.push({ text, ms, icon: o.icon, cls: o.cls });
      return;
    }
    this.showToast(text, ms, o.icon, o.cls);
  }

  private showToast(text: string, ms: number, icon?: string, cls?: string) {
    this.toastEl?.remove();
    this.toastEl = h('div', { class: 'toast' + (icon ? ' has-ico' : '') + (cls ? ' ' + cls : ''), role: 'status' }, icon ? uiIcon(icon, '', 't-ico') : null, h('span', null, text));
    this.root.append(this.toastEl);
    this.toastTimer = ms / 1000;
  }

  private tutorial(step: number) {
    this.tutorialStep = step;
    this.handEl?.remove();
    this.handEl = null;
    if (step === 0 && this.cards.get('tower:spike')) {
      this.toast(tr('Drag the Slinger from the shop onto the grass near the track!'), 999999);
      this.handEl = h('div', { class: 'hand drag', html: POINTER_SVG });
      this.root.append(this.handEl);
      this.placePointer();
    } else if (step === 1) {
      this.toast(tr('Nice! Press Play to bring on the stars.'), 999999, { icon: 'play' });
      this.handEl = h('div', { class: 'hand tap', html: POINTER_SVG });
      this.root.append(this.handEl);
      this.placePointer();
    } else if (step === 2) {
      this.toast(tr('Shatter them all! Every layer you crack earns cash.'), 3500, { icon: 'coin' });
    } else if (step === 3) {
      this.toast(tr('Tap a raccoon to upgrade it. Upgrades make your bandits WAY stronger!'), 6000);
    } else if (step === 4) {
      this.toast(tr('You got it! Tip: place different bandits close together to form BONDS.'), 5000, { icon: 'bond' });
      this.tutorialStep = -1;
      this.host.onTutorialDone();
    }
  }

  /** Points the tutorial arrow at the Slinger card (step 0) or the play button (step 1). */
  private placePointer() {
    const el = this.handEl;
    if (!el) return;
    if (this.tutorialStep === 0) {
      const r = this.cards.get('tower:spike')!.getBoundingClientRect();
      // sweeps from the card towards the grass in the middle of the map, pointing where it goes
      const x0 = r.left - 8;
      const y0 = r.top + r.height * 0.5;
      let dx = (window.innerWidth - this.sidebarWidth) * 0.55 - x0;
      let dy = window.innerHeight * 0.52 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, Math.min(260, window.innerWidth * 0.32) / len);
      dx *= k;
      dy *= k;
      const rot = (Math.atan2(dy, dx) * 180) / Math.PI - 90;
      el.style.cssText = `left:${x0}px;top:${y0}px;--dx:${Math.round(dx)}px;--dy:${Math.round(dy)}px;--rot:${Math.round(rot)}deg`;
    } else {
      const r = this.playBtn.getBoundingClientRect();
      el.style.cssText = `left:${r.left + r.width * 0.5}px;top:${r.top - 6}px;--dx:0px;--dy:-12px`;
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
    // full-screen pages (Bandit menu from a result screen) cover the whole game, HUD included
    const wrap = h('div', { class: 'modal-wrap' + (content.classList.contains('page') ? ' page-wrap' : '') }, content);
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
