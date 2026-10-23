import type { Game } from '../game/Game';
import type { Tower } from '../game/Tower';
import type { Renderer } from '../render/Renderer';
import { TOWERS } from '../game/towers';
import { HEROES, heroXpFor, MAX_HERO_LEVEL, type HeroId } from '../game/heroes';
import { canTier, computeStats, type TowerId, type AbilityDef } from '../game/towerTypes';
import { TARGET_PRIORITIES, type TargetPriority } from '../game/types';
import { FOOTPRINT_K } from '../game/Game';
import { WORLD_H, WORLD_W } from '../game/maps';
import { spoolW } from '../render/towerView';
import { starCenterY, starScale } from '../render/starView';
import { SYNERGIES } from '../game/synergy';
import { GLOOP_ORDER, GLOOPS, type GloopId } from '../game/gloops';
import { towerIconUrl, abilityIconUrl, heroStage } from '../render/art';
import { formatNum } from '../core/math';
import { audio } from '../audio/audio';
import { h, clear, setText, toggle } from './dom';
import { haptic } from './haptics';
import { t as tr, getLang } from '../i18n';
import { TOWERS_BY_ROLE, roleCls, roleIcon } from './roles';
import { modal, btn, chip, uiIcon, img, bar, closeBtn, restartIcon, bump, reducedMotion, watchScroll, towerPortraitUrl, heroPortraitUrl, starPortraitUrl, MEDAL, MEDAL_EMOJI, type LevelReward } from './kit';
import { Stage, ProgressFeed, Tips, type StageMsg } from './hudFeed';
import { loadProfile, isNew as profileIsNew } from '../save/storage';

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
  /**
   * NEW pills on shop cards (profile.seen). Optional: without them the HUD reads the saved profile
   * once and only forgets the pills for the rest of this game.
   */
  isNew?(kind: 'tower' | 'hero', id: string): boolean;
  markSeen?(kind: 'tower' | 'hero', id: string): void;
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

/** Combo sizes that get a short call-out on the centre stage while the combo is running. */
const COMBO_MILESTONES = [100, 250, 500, 1000, 2500, 5000, 10000];
/** Obstacle kinds a ghost "is in" (reason chip) instead of being blocked by. */
const LIQUID: Record<string, string> = { pond: 'In the water', water: 'In the water', ice: 'In the water', lava: 'In the lava', choco: 'In the chocolate' };

/** What App.addXp hands over for the in-game level-up banner. */
export interface HudLevelUp {
  from: number;
  to: number;
  rewards: LevelReward[];
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
  /** "x152" under the cash pill while a combo runs */
  private comboChip!: HTMLElement;
  /** next COMBO_MILESTONES index to call out in the running combo */
  private comboMile = 0;
  private playBtn!: HTMLButtonElement;
  private pips: HTMLElement[] = [];
  private pauseBtn!: HTMLButtonElement;
  /** pills that fade while a star or raccoon is under them */
  private fadeEls: HTMLElement[] = [];
  private fadeRects = new Float64Array(16);
  private fadeUnder = [false, false, false, false];
  private fadeDirty = true;
  private fadeFrame = 0;
  /** heartbeat edge at low lives, leak tags */
  private pulseEl!: HTMLElement;
  private leakTag: { el: HTMLElement; n: number; at: number; path: number; timer: number } | null = null;
  private lastHeartAt = 0;
  /** placing: the reason chip over an invalid ghost, and the validity it last had (haptics) */
  private whyEl!: HTMLElement;
  private lastValid: boolean | null = null;
  /** shop cards and buttons showing an error at their source, until (performance.now()) */
  private errUntil = new Map<HTMLElement, number>();
  /** shop cards wearing NEW (unlocked by player level, not used yet) */
  private fresh = new Set<string>();
  /** level-ups merged into one stage banner */
  private lvAcc: { from: number; to: number; rewards: LevelReward[]; at: number } | null = null;
  private frenzyTips = 0;
  readonly stage: Stage;
  readonly progressFeed: ProgressFeed;
  readonly tips: Tips;
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
  private destroyed = false;
  private playIco!: HTMLElement;
  private playLbl!: HTMLElement;
  private playState = '';
  private shownCash = -1;
  private lastBump = 0;
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
    this.stage = new Stage(this.root);
    this.progressFeed = new ProgressFeed(this.root);
    this.tips = new Tips(this.root, this.placeToast);
    this.renderer.onHeadline = (text) => this.stage.show({ kind: 'boss', text, color: 'gold' });
    this.buildTop();
    this.buildSidebar();
    this.buildDock();
    this.initFresh();
    this.whyEl = h('div', { class: 'place-why hidden', 'aria-live': 'polite' });
    this.pulseEl = h('div', { class: 'hud-pulse', 'aria-hidden': 'true' });
    this.root.append(this.whyEl, this.pulseEl);
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
    this.stage.destroy();
    this.progressFeed.destroy();
    this.tips.destroy();
    if (this.renderer.onHeadline) this.renderer.onHeadline = null;
    this.renderer.place.clear();
    this.renderer.rangePreview = null;
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
    const before = this.host.playerLevel;
    this.host.playerLevel = level;
    this.lastCash = -1;
    // what the new level unlocks gets a gold ring and NEW in the shop (also when no banner follows)
    for (const [key, card] of this.cards) {
      const [kind, id] = key.split(':') as ['tower' | 'hero', string];
      const lv = kind === 'tower' ? TOWERS[id as TowerId].unlock : HEROES[id as HeroId].unlock;
      if (lv > before && lv <= level && !this.host.devUnlock && !this.game.sandbox) this.setFresh(key, card, true);
    }
  }

  /**
   * Player level-up during a game (App.addXp): one gold banner on the stage queue. Several levels
   * in a row (achievements claimed together) merge into the banner that is still up or waiting.
   */
  levelUp(info: HudLevelUp) {
    const now = performance.now();
    const acc = this.lvAcc && now - this.lvAcc.at < 2600 ? this.lvAcc : null;
    const from = acc ? Math.min(acc.from, info.from) : info.from;
    const to = acc ? Math.max(acc.to, info.to) : info.to;
    const rewards = acc ? [...acc.rewards, ...info.rewards.filter((r) => !acc.rewards.some((o) => o.kind === r.kind && o.id === r.id))] : info.rewards;
    this.lvAcc = { from, to, rewards, at: now };
    const names = rewards.filter((r) => r.kind === 'bandit' || r.kind === 'hero').map((r) => tr(r.kind === 'bandit' ? TOWERS[r.id as TowerId].name : HEROES[r.id as HeroId].name));
    this.stage.show({
      kind: 'unlock',
      key: 'level',
      text: tr('LEVEL {n}!', { n: to }),
      sub: names.length ? tr('Unlocked: {list}', { list: names.join(', ') }) : tr('Level up!'),
      icon: uiIcon('xp', '⭐'),
      color: 'gold',
    });
    haptic('medium');
  }

  /**
   * Achievements claimed during the game: one gold progress card (several at once are bundled).
   * App.claimAchievements still hands them over as a toast text; toast() recognises that text.
   */
  achievements(list: { name: string; xp: number }[]) {
    for (const a of list) {
      this.progressFeed.push({
        key: 'ach',
        icon: uiIcon('trophy', '🏆'),
        kicker: tr('Achievement unlocked'),
        kickerMany: (n) => tr('{n} achievements unlocked', { n }),
        title: a.name,
        amount: a.xp,
        fmt: num,
      });
    }
  }

  /** Cards unlocked by player level and not used yet start with NEW (starter bandits never do). */
  private initFresh() {
    if (this.host.devUnlock || this.game.sandbox) return;
    let snap: ReturnType<typeof loadProfile> | null = null;
    for (const [key, card] of this.cards) {
      const [kind, id] = key.split(':') as ['tower' | 'hero', string];
      if (!this.isUnlocked(kind, id)) continue;
      let fresh: boolean;
      if (this.host.isNew) fresh = this.host.isNew(kind, id);
      else {
        // read-only snapshot of the saved profile (App owns and saves the live one)
        snap ??= loadProfile();
        fresh = Array.isArray(snap.seen) && profileIsNew(snap, kind, id, kind === 'tower' ? TOWERS[id as TowerId].unlock : HEROES[id as HeroId].unlock);
      }
      if (fresh) this.setFresh(key, card, true);
    }
  }

  private setFresh(key: string, card: HTMLElement, on: boolean) {
    if (on === this.fresh.has(key)) return;
    if (on) this.fresh.add(key);
    else {
      this.fresh.delete(key);
      const [kind, id] = key.split(':') as ['tower' | 'hero', string];
      this.host.markSeen?.(kind, id);
    }
    toggle(card, 'fresh', on);
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
    // the combo runs as a small chip under the cash
    this.comboChip = h('span', { class: 'combo-chip hidden', 'aria-hidden': 'true' });
    this.cashPill.append(this.comboChip);
    // top right: only pause (game speed is the play button, settings are in the pause menu)
    this.pauseBtn = this.hudBtn(uiIcon('pause', '⏸'), tr('Pause (Esc)'), () => this.openPause(), 'pause');
    this.topEl = h('div', { class: 'hud-top' }, this.livesPill, this.cashPill, roundPill, this.frenzyEl);
    this.fadeEls = [this.livesPill, this.cashPill, roundPill, this.frenzyEl];
    this.barEl = h('div', { class: 'hud-bar' }, this.topEl, h('div', { class: 'top-right' }, this.pauseBtn));
    // ink scrim so the counters read on bright map art
    this.root.append(h('div', { class: 'hud-scrim', 'aria-hidden': 'true' }), this.barEl);
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
    this.fadeDirty = true;
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
    // three pips: the speed the play button cycles through (1x / 2x / 3x)
    this.pips = [h('i', { class: 'on' }), h('i'), h('i')];
    const pips = h('span', { class: 'play-pips', 'aria-hidden': 'true' }, ...this.pips);
    this.playBtn = h('button', { class: 'btn green play waiting', type: 'button', title: tr('Start round / speed (Space)'), 'aria-label': tr('Start round / speed (Space)') }, this.playIco, this.playLbl, pips) as HTMLButtonElement;
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
      h('span', { class: 'card-new', 'aria-hidden': 'true' }, tr('NEW')),
      // tablets: the name under the portrait
      h('div', { class: 'cname' }, name),
      h('div', { class: 'price' }, uiIcon('coin', '$', 'coin'), h('span', { class: 'pv' }, '')),
    );
    card.dataset.kind = kind;
    card.dataset.id = id;
    card.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      // errors show on the card itself (it shakes and says why)
      if (card.classList.contains('banned')) {
        this.sourceError(card, tr('Not today'));
        return;
      }
      if (card.classList.contains('locked')) {
        const lvl = kind === 'tower' ? TOWERS[id as TowerId].unlock : HEROES[id as HeroId].unlock;
        this.sourceError(card, tr('From Lv {n}', { n: lvl }));
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
      audio.play('tab');
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
        this.stage.show({ kind: 'round', text: tr('Round {n}', { n }), color: 'purple' });
        if (this.tutorialStep === 1) this.tutorial(2);
      }),
      g.events.on('roundEnd', ({ round, bonus }) => {
        // never pushed aside by other tips: it goes to the front of the queue
        this.tips.show({ text: tr('Round {n} complete! +${bonus}', { n: round, bonus: num(bonus) }), ms: 2000, icon: 'coin', cls: 'gold', front: true });
        const before = this.unlockableTypes();
        this.host.onRoundEnd(round);
        if (this.tutorialStep === 2 && round >= 1) this.tutorial(3);
        this.announceUnlockable(before);
      }),
      g.events.on('boss', (e) => {
        // the intro banner only plays the very first time the player meets this boss type
        if (this.host.firstBoss(e.type)) this.stage.show({ kind: 'boss', text: tr(e.def.name).toUpperCase(), sub: tr(e.def.desc), color: 'red', icon: img(starPortraitUrl(e.type as GloopId), 'ico') });
        haptic('heavy');
      }),
      g.events.on('hint', (text) => {
        if (this.tutorialStep >= 0 && this.tutorialStep < 2 && g.round === 1) return;
        this.tips.show({ text: tr(text), ms: 3800 });
      }),
      g.events.on('heroLevel', ({ level }) => {
        const hero = g.hero;
        if (hero?.hero) {
          this.progressFeed.push({ key: 'hero', icon: img(heroPortraitUrl(hero.hero.id, level), 'ico'), kicker: tr(hero.hero.name), title: tr('Level {n}', { n: level }) });
        }
        this.panelKey = '';
        this.lastCash = -1;
      }),
      g.events.on('frenzyReady', () => {
        // the meter pulses every time; the tip only the first couple of times
        if (this.frenzyTips++ < 2) this.tips.show({ text: tr('FRENZY is ready! Tap the meter!'), ms: 2200 });
        audio.play('ready');
      }),
      g.events.on('frenzyStart', () => this.stage.show({ kind: 'action', text: tr('FRENZY!'), sub: tr('+50% attack speed'), color: 'red' })),
      g.events.on('victory', () => this.host.onVictory()),
      g.events.on('gameOver', () => this.host.onDefeat()),
      g.events.on('lifeLost', (lives) => this.onLifeLost(lives)),
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
    this.progressFeed.push({ key: 'tier', icon: uiIcon('xp', '⭐'), kicker: tr('New tier unlockable!'), title: names });
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
    this.fadeDirty = true;
    requestAnimationFrame(() => !this.destroyed && this.tips.relayout());
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
      this.tips.show({ text: tr(e.pointerType === 'mouse' ? 'Click on the map to place it' : 'Touch the map and drag to place it'), ms: 1800 });
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
      // tap target follows the drawn raccoon (spool width S): about the spool, plus its body above
      const S = spoolW(t.radius);
      const r = S * 0.37;
      // art extends upward, so test a capsule from the base to the head
      const top = S * 0.52;
      const dy = y > t.y ? y - t.y : y < t.y - top ? t.y - top - y : 0;
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
      const card = this.cards.get(kind + ':' + id);
      if (card) this.sourceError(card, tr('Missing {n}', { n: num(cost - this.game.cash) }));
      else audio.play('error');
      this.flashCash();
      return;
    }
    this.select(null);
    this.placing = { kind, id, dragging: false, fromCard, startX: e?.clientX ?? 0, startY: e?.clientY ?? 0, moved: false, pointerType: e?.pointerType ?? 'mouse' };
    this.renderer.ghost = { kind, id, x: 0, y: 0, valid: false, visible: false };
    this.lastValid = null;
    for (const c of this.cards.values()) c.classList.remove('selected');
    this.cards.get(kind + ':' + id)?.classList.add('selected');
    this.buildPlaceOverlay(kind === 'tower' ? TOWERS[id as TowerId].radius : HEROES[id as HeroId].radius);
    this.root.classList.add('placing');
    audio.play('click');
  }

  /**
   * Design plan A2: rasters where the ghost cannot stand (track, water, obstacles, other raccoons,
   * the world edge) once per drag into the renderer's hatched overlay, plus the HUD zones (top bar,
   * pause, ability dock) where a raccoon would vanish under the counters.
   */
  private buildPlaceOverlay(radius: number) {
    const r = this.renderer;
    const g = this.game;
    const mapW = window.innerWidth - this.sidebarWidth;
    const a = r.screenToWorld(-40, -40);
    const b = r.screenToWorld(mapW + 40, window.innerHeight + 40);
    r.place.build((x, y) => g.maskAt(x, y) !== 0 || !g.canPlace(radius, x, y), { x0: a.x, y0: a.y, x1: b.x, y1: b.y }, r.scale);
    // HUD zones in css px (drawn and tested in screen space, so the camera easing back does not move them)
    const rects = r.place.uiRects;
    let n = 0;
    const add = (x0: number, y0: number, x1: number, y1: number) => {
      if (n >= 4 || x1 <= x0 || y1 <= y0) return;
      rects[n * 4] = x0;
      rects[n * 4 + 1] = y0;
      rects[n * 4 + 2] = x1;
      rects[n * 4 + 3] = y1;
      n++;
    };
    let x0 = Infinity;
    let x1 = -Infinity;
    let y1 = 0;
    for (const el of this.fadeEls) {
      const q = el.getBoundingClientRect();
      if (!q.width) continue;
      x0 = Math.min(x0, q.left);
      x1 = Math.max(x1, q.right);
      y1 = Math.max(y1, q.bottom);
    }
    if (x1 > x0) add(Math.max(0, x0 - 12), 0, x1 + 6, y1 + 6);
    const pq = this.pauseBtn.getBoundingClientRect();
    if (pq.width) add(pq.left - 6, 0, Math.min(mapW, pq.right + 6), pq.bottom + 6);
    if (!this.dockEl.classList.contains('hidden')) {
      const dq = this.dockEl.getBoundingClientRect();
      add(0, dq.top - 6, dq.right + 6, window.innerHeight);
    }
    r.place.uiCount = n;
  }

  /** Why a ghost cannot stand at (x, y), or null when it can. */
  private placeReason(radius: number, x: number, y: number, cost: number): string | null {
    const g = this.game;
    const s = this.renderer.worldToScreen(x, y);
    if (this.renderer.place.underUi(s.x, s.y)) return tr('Under the HUD');
    if (!g.canPlace(radius, x, y)) {
      const fr = radius * FOOTPRINT_K;
      if (x - fr < 2 || y - fr < 2 || x + fr > WORLD_W - 2 || y + fr > WORLD_H - 2) return tr('Too close to the edge');
      for (const t of g.towers) {
        const rr = (t.radius + radius) * FOOTPRINT_K - 4;
        if ((t.x - x) ** 2 + (t.y - y) ** 2 < rr * rr) return tr('Occupied');
      }
      // the footprint samples canPlace uses (rim, centre, half radius): the track before obstacles
      const r = fr - 3;
      const h2 = r * 0.5;
      const m = (px: number, py: number) => g.maskAt(px, py) === 1;
      let track = m(x, y) || m(x + h2, y) || m(x - h2, y) || m(x, y + h2) || m(x, y - h2);
      for (let i = 0; i < 12 && !track; i++) {
        const ang = (i / 12) * Math.PI * 2;
        track = m(x + Math.cos(ang) * r, y + Math.sin(ang) * r);
      }
      if (track) return tr('Too close to the track');
      for (const o of g.map.obstacles) {
        if (!o.blocks) continue;
        const reach = Math.max(o.r, o.ry ?? o.r) + fr;
        if ((o.x - x) ** 2 + (o.y - y) ** 2 > reach * reach) continue;
        const liquid = LIQUID[o.kind];
        if (liquid) return tr(liquid);
      }
      return tr('Occupied');
    }
    if (!g.sandbox && g.cash < cost) return tr('You need {n} more', { n: num(cost - g.cash) });
    return null;
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
    const why = this.placeReason(radius, x, y, cost);
    gh.valid = why === null;
    // a light tap every time the spot turns valid / invalid under the finger
    if (visible && this.lastValid !== null && this.lastValid !== gh.valid) haptic('light');
    if (visible) this.lastValid = gh.valid;
    this.showWhy(visible ? why : null, x, y, radius);
  }

  /** Reason chip over an invalid ghost ("Too close to the track", "Occupied", ...). */
  private showWhy(why: string | null, x: number, y: number, radius: number) {
    const el = this.whyEl;
    if (!why) {
      if (!el.classList.contains('hidden')) el.classList.add('hidden');
      return;
    }
    setText(el, why);
    toggle(el, 'hidden', false);
    const r = this.renderer;
    const head = r.worldToScreen(x, y - spoolW(radius) * 1.02);
    const mapW = window.innerWidth - this.sidebarWidth;
    const w = el.offsetWidth;
    const hh = el.offsetHeight;
    const sx = Math.max(w / 2 + 6, Math.min(mapW - w / 2 - 6, head.x));
    // no room above the head (top edge): under the ghost's feet instead
    let sy = head.y - hh - 4;
    if (sy < 4) sy = r.worldToScreen(x, y).y + spoolW(radius) * 0.3 * r.scale + 6;
    el.style.transform = `translate(${Math.round(sx - w / 2)}px, ${Math.round(sy)}px)`;
  }

  private tryPlace() {
    const p = this.placing;
    const gh = this.renderer.ghost;
    if (!p || !gh) return;
    if (!gh.visible) return;
    if (!gh.valid) {
      audio.play('error');
      haptic('medium');
      this.shake(this.whyEl);
      p.dragging = false;
      return;
    }
    const t = p.kind === 'tower' ? this.game.placeTower(p.id as TowerId, gh.x, gh.y) : this.game.placeHero(p.id as HeroId, gh.x, gh.y);
    if (!t) {
      audio.play('error');
      return;
    }
    audio.play('place');
    const key = p.kind + ':' + p.id;
    const card = this.cards.get(key);
    if (card) this.setFresh(key, card, false);
    if (this.tutorialStep === 0) this.tutorial(1);
    if (this.game.towers.length === 2 && t.bonds.length && !this.game.sandbox) {
      const syn = SYNERGIES.find((s) => s.id === t.bonds[0].synergyId);
      if (syn) this.tips.show({ text: tr('BOND: {name}! Paired bandits power each other up.', { name: tr(syn.name) }), ms: 3000, icon: 'bond' });
    }
    this.cancelPlacing();
    this.select(t);
  }

  cancelPlacing() {
    this.placing = null;
    this.renderer.ghost = null;
    this.renderer.place.clear();
    this.root.classList.remove('placing');
    this.whyEl.classList.add('hidden');
    for (const c of this.cards.values()) c.classList.remove('selected');
  }

  /** Restart a short shake on `el` (errors at their source). */
  private shake(el: HTMLElement) {
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  /**
   * An error shown where it happened: the card / button shakes and its label says why for a moment
   * ("Missing 120", "From Lv 4") instead of a toast somewhere else.
   */
  private sourceError(el: HTMLElement, text: string, labelSel = '.pv') {
    audio.play('error');
    haptic('light');
    const label = el.querySelector<HTMLElement>(labelSel);
    if (label) {
      if (!el.classList.contains('err-msg')) el.dataset.label = label.textContent ?? '';
      setText(label, text);
    }
    el.classList.add('err-msg');
    this.shake(el);
    const until = performance.now() + 1300;
    this.errUntil.set(el, until);
    setTimeout(() => {
      if (this.destroyed || this.errUntil.get(el) !== until) return;
      this.errUntil.delete(el);
      el.classList.remove('err-msg', 'shake');
      if (label && el.dataset.label !== undefined) setText(label, el.dataset.label);
      this.lastCash = -1; // shop cards refresh their price
    }, 1300);
  }

  // -------------------------------------------------------------------------------------------
  // Selection & upgrade panel
  // -------------------------------------------------------------------------------------------

  select(t: Tower | null) {
    if (this.renderer.selected === t) return;
    if (t && this.placing) this.cancelPlacing();
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
      this.tips.relayout();
    }
    if (t) audio.play('click');
  }

  private buildPanel(t: Tower) {
    const g = this.game;
    const sameTower = this.panelFor === t;
    // the buttons a range preview belonged to are rebuilt
    this.renderer.rangePreview = null;
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
          audio.play('close');
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
          buy.dataset.path = String(p);
          buy.addEventListener('click', () => this.buyUpgrade(t, p));
          this.hookRangePreview(buy, t, p);
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
    action.dataset.path = String(p);
    action.addEventListener('click', () => this.unlockTier(t, p));
    this.hookRangePreview(action, t, p);
    return [ico, this.pathInfo(row, p, head, tr(u.name), tr(u.desc), xbar), action];
  }

  private unlockTier(t: Tower, p: number) {
    if (!t.def) return;
    audio.unlock();
    const id = t.def.id;
    if (!this.canUnlockPath(t, p)) {
      const cost = this.host.progress.nextCost(id, p) ?? 0;
      const b = this.pathButton(p);
      if (b) this.sourceError(b, tr('Missing {n} XP', { n: num(Math.max(0, cost - this.host.progress.xp(id))) }), 'small');
      else audio.play('error');
      return;
    }
    if (this.host.progress.unlock(id, p)) {
      haptic('light');
      this.justUnlocked = `${t.id}:${p}`;
      this.panelKey = '';
      this.progressFeed.push({ key: 'tier-' + id, icon: uiIcon('xp', '⭐'), kicker: tr('Bandit XP'), title: tr('Tier {n} unlocked for every {name}!', { n: t.tiers[p] + 1, name: tr(t.def.name) }) });
    }
  }

  /** The buy / unlock button of path `p` in the open panel. */
  private pathButton(p: number): HTMLElement | null {
    return this.panel?.querySelector<HTMLElement>(`.buy[data-path="${p}"]`) ?? null;
  }

  /**
   * Holding (touch) or hovering (mouse) an upgrade that adds range shows its new reach as a second,
   * gold ring around the selected raccoon.
   */
  private hookRangePreview(b: HTMLElement, t: Tower, p: number) {
    if (!t.def || t.stats.range > 3000) return;
    const def = t.def;
    const next = t.tiers.map((x, i) => (i === p ? x + 1 : x));
    const st = computeStats(def, next);
    t.mod?.(t, st);
    const range = st.range * t.buffs.rangeMul;
    if (st.range > 3000 || range <= t.range + 0.5) return;
    const on = () => {
      this.renderer.rangePreview = { tower: t, range };
    };
    const off = () => {
      if (this.renderer.rangePreview?.tower === t) this.renderer.rangePreview = null;
    };
    b.addEventListener('pointerenter', on);
    b.addEventListener('pointerdown', on);
    b.addEventListener('pointerleave', off);
    b.addEventListener('pointercancel', off);
    b.addEventListener('pointerup', (e) => {
      if (e.pointerType !== 'mouse') off();
    });
    b.classList.add('adds-range');
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
    const m = spoolW(t.radius) * 0.43 * r.scale + 10;
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
    // a tip on screen moves into the part of the map the panel leaves free
    if (!keepSide) this.tips.relayout();
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
      audio.play('locked');
      return;
    }
    if (this.game.upgradeLocked(t, p)) {
      // hotkeys never spend XP: the panel's unlock button does that (it shakes to say so)
      const b = this.pathButton(p);
      if (b) this.sourceError(b, tr('Unlock with XP'), 'small');
      else audio.play('error');
      return;
    }
    const cost = this.game.upgradeCost(t, p)!;
    if (!this.game.sandbox && this.game.cash < cost) {
      const b = this.pathButton(p);
      if (b) this.sourceError(b, tr('Missing {n}', { n: num(cost - this.game.cash) }), 'small');
      else audio.play('error');
      this.flashCash();
      return;
    }
    if (this.game.upgrade(t, p)) {
      audio.play('upgrade');
      if (this.tutorialStep === 3) this.tutorial(4);
      const tier = t.tiers[p];
      if (tier === 5) this.stage.show({ kind: 'unlock', text: tr(t.def.paths[p][4].name).toUpperCase(), sub: tr('Tier 5 unlocked!'), icon: uiIcon('crown', '👑'), color: 'gold' });
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
    audio.play('tab');
  }

  private toggleAuto() {
    this.game.autoStart = !this.game.autoStart;
    toggle(this.autoToggle, 'on', this.game.autoStart);
    audio.play('tab');
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
      const low = !g.sandbox && g.lives > 0 && g.lives <= Math.max(5, g.diff.lives * 0.2);
      toggle(this.livesPill, 'low', low);
      // A10: at 20% lives or less the edges of the map beat like a heart
      toggle(this.pulseEl, 'on', low && !g.over);
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
    // combo: a small chip under the cash; big combos get a call-out on the stage
    if (g.combo >= 10) {
      toggle(this.comboChip, 'hidden', false);
      setText(this.comboChip, `×${num(g.combo)}`);
      if (g.combo > this.lastCombo + 5) {
        bump(this.comboChip);
        this.lastCombo = g.combo;
      }
      if (this.comboMile < COMBO_MILESTONES.length && g.combo >= COMBO_MILESTONES[this.comboMile]) {
        // the biggest milestone this combo has passed (a burst can jump several)
        while (this.comboMile < COMBO_MILESTONES.length && g.combo >= COMBO_MILESTONES[this.comboMile]) this.comboMile++;
        this.stage.show({ kind: 'combo', text: tr('COMBO ×{n}!', { n: num(COMBO_MILESTONES[this.comboMile - 1]) }), color: 'gold' });
      }
    } else if (this.lastCombo !== 0 || this.comboMile !== 0) {
      toggle(this.comboChip, 'hidden', true);
      this.lastCombo = 0;
      this.comboMile = 0;
    }
    // play button: starts the round, then cycles 1x / 2x / 3x (three pips)
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
      for (let i = 0; i < 3; i++) toggle(this.pips[i], 'on', i < g.speed);
      this.playBtn.setAttribute('aria-label', `${tr('Start round / speed (Space)')} · ${g.speed}×`);
    }
    this.refreshPanel();
    this.updateAbilities();
    this.tips.tick(dt);
    if ((++this.fadeFrame & 3) === 0) this.updatePillFade();
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
      // a card saying why it cannot be used keeps that text for its moment
      if (this.errUntil.has(card)) continue;
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
    if (this.game.useAbility(t, ab)) this.stage.show({ kind: 'action', text: tr(ab.name).toUpperCase(), color: 'blue' });
  }

  /**
   * A4: a counter fades to 40% while a star or a raccoon is under it, so the entrance and the
   * raccoons near the top edge stay readable. Checked every 4th frame, against rects measured
   * only when the bar's layout changes.
   */
  private updatePillFade() {
    const els = this.fadeEls;
    const R = this.fadeRects;
    if (this.fadeDirty) {
      this.fadeDirty = false;
      for (let i = 0; i < els.length; i++) {
        const q = els[i].getBoundingClientRect();
        R[i * 4] = q.left;
        R[i * 4 + 1] = q.top;
        R[i * 4 + 2] = q.right;
        R[i * 4 + 3] = q.bottom;
      }
    }
    let low = 0;
    for (let i = 0; i < els.length; i++) low = Math.max(low, R[i * 4 + 3]);
    const r = this.renderer;
    const sc = r.scale;
    const under = this.fadeUnder;
    under.fill(false);
    const n = els.length;
    const hit = (x0: number, y0: number, x1: number, y1: number) => {
      for (let i = 0; i < n; i++) {
        if (x1 > R[i * 4] && x0 < R[i * 4 + 2] && y1 > R[i * 4 + 1] && y0 < R[i * 4 + 3]) under[i] = true;
      }
    };
    for (const e of this.game.enemies) {
      if (!e.alive) continue;
      const rad = e.radius * starScale(e.radius) * sc * (e.def.boss ? 1.6 : 1);
      const cy = starCenterY(e) * sc + r.oy;
      if (cy - rad > low) continue;
      const cx = e.x * sc + r.ox;
      hit(cx - rad, cy - rad, cx + rad, cy + rad);
    }
    for (const t of this.game.towers) {
      const S = spoolW(t.radius) * sc;
      const by = t.y * sc + r.oy;
      if (by - S * 1.05 > low) continue;
      const cx = t.x * sc + r.ox;
      hit(cx - S * 0.4, by - S * 1.05, cx + S * 0.4, by);
    }
    for (let i = 0; i < n; i++) toggle(els[i], 'under', under[i]);
  }

  /**
   * A10: a leak shows where it happens. "-N" with a heart at the track's exit (several leaks in a
   * row add up on one tag), a heart flying into the lives pill, which then shakes. The renderer
   * adds the ring flash and the exit-side vignette. Off with reduce-motion (the pill still updates).
   */
  private onLifeLost(lives: number) {
    const pill = this.livesPill;
    const hurt = () => {
      pill.classList.remove('hurt');
      void pill.offsetWidth;
      pill.classList.add('hurt');
    };
    if (reducedMotion() || this.game.sandbox) {
      hurt();
      return;
    }
    const L = this.renderer.lastLeak;
    const now = performance.now();
    const tag = this.leakTag;
    if (tag && tag.path === L.path && now - tag.at < 650 && tag.el.isConnected) {
      // more leaks right behind: the same tag counts up and starts its rise again
      tag.n += lives;
      tag.at = now;
      setText(tag.el.querySelector('b')!, `−${num(tag.n)}`);
      bump(tag.el);
      clearTimeout(tag.timer);
      const el = tag.el;
      tag.timer = window.setTimeout(() => el.remove(), 1500);
    } else {
      const el = h('div', { class: 'leak-tag', 'aria-hidden': 'true' }, h('b', null, `−${num(lives)}`), uiIcon('heart', '❤️'));
      el.style.left = `${Math.round(L.x)}px`;
      el.style.top = `${Math.round(L.y)}px`;
      // keep the tag inside the map: it leans away from the edge it sits on
      el.classList.add(['at-l', 'at-r', 'at-t', 'at-b'][L.side]);
      this.root.append(el);
      this.leakTag = { el, n: lives, at: now, path: L.path, timer: window.setTimeout(() => el.remove(), 1500) };
    }
    if (now - this.lastHeartAt < 260) return;
    this.lastHeartAt = now;
    const q = (pill.querySelector('.ico') ?? pill).getBoundingClientRect();
    // the heart leaves from the tag's own heart and lands on the lives pill's
    const from = this.leakTag?.el.querySelector('.ico')?.getBoundingClientRect();
    const fx = from && from.width ? from.left + from.width / 2 : L.x;
    const fy = from && from.width ? from.top + from.height / 2 : L.y;
    const tx = q.left + q.width / 2;
    const ty = q.top + q.height / 2;
    const heart = h('div', { class: 'leak-heart', 'aria-hidden': 'true' }, uiIcon('heart', '❤️'));
    heart.style.cssText = `left:${Math.round(fx)}px;top:${Math.round(fy)}px;--dx:${Math.round(tx - fx)}px;--dy:${Math.round(ty - fy)}px`;
    this.root.append(heart);
    setTimeout(() => {
      heart.remove();
      if (this.destroyed) return;
      hurt();
      bump(this.livesEl);
    }, 640);
  }

  // -------------------------------------------------------------------------------------------
  // Banners, toasts, tutorial
  // -------------------------------------------------------------------------------------------

  /**
   * Centre-stage headline (kept for callers outside the HUD). Goes through the stage queue: a boss
   * outranks an unlock, which outranks the rest. App's "LEVEL n!" banner becomes the level-up banner.
   */
  banner(text: string, sub: string | null, boss: boolean, small = false) {
    const lv = /\d+/.exec(text);
    if (!boss && lv && text === tr('LEVEL {n}!', { n: lv[0] })) {
      const to = +lv[0];
      this.levelUp({ from: Math.min(to - 1, this.host.playerLevel), to, rewards: [] });
      return;
    }
    const m: StageMsg = boss ? { kind: 'boss', text, sub, color: 'red' } : { kind: small ? 'action' : 'unlock', text, sub, color: small ? 'purple' : 'gold' };
    this.stage.show(m);
  }

  /** Templates of App's achievement toast ("Achievement unlocked: {name} (+{xp} XP)"). */
  private achRe: { lang: string; one: RegExp; many: RegExp } | null = null;
  private achievementText(text: string): { name: string; xp: number }[] | null {
    const lang = getLang();
    if (!this.achRe || this.achRe.lang !== lang) {
      const re = (tpl: string) =>
        new RegExp(
          '^' +
            tpl
              .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              .replace('\\{name\\}', '(.+)')
              .replace('\\{list\\}', '(.+)')
              .replace('\\{n\\}', '(\\d+)')
              .replace('\\{xp\\}', '([\\d.,]+)') +
            '$',
        );
      this.achRe = { lang, one: re(tr('Achievement unlocked: {name} (+{xp} XP)')), many: re(tr('{n} achievements unlocked: {list} (+{xp} XP)')) };
    }
    const one = this.achRe.one.exec(text);
    if (one) return [{ name: one[1], xp: +one[2].replace(/[.,]/g, '') }];
    const many = this.achRe.many.exec(text);
    if (!many) return null;
    const names = many[2].split(', ');
    const xp = +many[3].replace(/[.,]/g, '');
    // the total is shared out evenly; the card shows the sum again
    return names.map((name, i) => ({ name, xp: i === 0 ? xp : 0 }));
  }

  /**
   * Tip toast (queued, never replacing another; placed where it covers no track). Toasts of 60 s
   * or longer are sticky tutorial steps. App's achievement toast goes to the gold progress card.
   */
  toast(text: string, ms = 2500, o: { icon?: string; queue?: boolean; cls?: string; front?: boolean } = {}) {
    const ach = this.achievementText(text);
    if (ach) {
      this.achievements(ach);
      return;
    }
    this.tips.show({ text, ms, icon: o.icon, cls: o.cls, front: o.front });
  }

  /** Top-left corner for a toast of w x h: bottom centre of the free map, else the spot that covers the least track. */
  private placeToast = (w: number, hh: number): [number, number] => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    let l = 8;
    let r = W - this.sidebarWidth - 8;
    if (this.panel) {
      const q = this.panel.getBoundingClientRect();
      if (this.panelSide === 'left') l = Math.max(l, q.right + 8);
      else r = Math.min(r, q.left - 8);
    }
    const dockH = this.dockEl.classList.contains('hidden') ? 0 : this.dockEl.offsetHeight + 8;
    const barB = this.barEl.getBoundingClientRect().bottom + 8;
    const topY = Math.max(barB, this.progressFeed.bottom + 8);
    const cx = (l + r) / 2 - w / 2;
    const bottom = H - 14 - dockH - hh;
    const cands: [number, number][] = [
      [cx, bottom],
      [cx, topY],
      [r - w - 6, bottom],
      [l + 6, H - 14 - hh],
      [cx, (H - hh) / 2 + H * 0.12],
    ];
    const g = this.game;
    const rd = this.renderer;
    const half = (g.map.pathWidth / 2) * rd.scale + 4;
    let best = cands[0];
    let bestN = Infinity;
    for (const c of cands) {
      const x0 = Math.max(l, c[0]);
      const y0 = Math.max(4, c[1]);
      let hits = 0;
      for (const p of g.paths) {
        for (let i = 0; i < p.count; i += 5) {
          const sx = p.xs[i] * rd.scale + rd.ox;
          const sy = p.ys[i] * rd.scale + rd.oy;
          if (sx > x0 - half && sx < x0 + w + half && sy > y0 - half && sy < y0 + hh + half) hits++;
        }
      }
      if (hits < bestN) {
        bestN = hits;
        best = [x0, y0];
        if (hits === 0) break;
      }
    }
    return best;
  };

  private tutorial(step: number) {
    this.tutorialStep = step;
    this.handEl?.remove();
    this.handEl = null;
    this.tips.clearSticky();
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
    if (!opts.locked) audio.play('open');
    return wrap;
  }

  closeModal() {
    const w = this.root.querySelector('.modal-wrap');
    if (w) {
      w.remove();
      audio.play('close');
    }
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
