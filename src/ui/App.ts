import './screens.css';
import { addTowerXp, limitsFor, nextUnlockCost, roundXp, unlockNext, xpOf } from '../game/progression';
import type { Tower } from '../game/Tower';
import type { TowerId } from '../game/towerTypes';
import { Game, type SaveState, type ChallengeDef } from '../game/Game';
import { MAPS, type MapDef } from '../game/maps';
import { DIFFICULTIES, type Difficulty } from '../game/types';
import { HEROES, HERO_ORDER, type HeroId } from '../game/heroes';
import { TOWERS, TOWER_ORDER } from '../game/towers';
import { GLOOP_ORDER, GLOOPS } from '../game/gloops';
import { Renderer } from '../render/Renderer';
import { makePresentation } from '../render/presentation';
import { uiIconUrl } from '../render/art';
import { audio } from '../audio/audio';
import { Hud } from './hud';
import { h, clear } from './dom';
import { setHaptics } from './haptics';
import { loadProfile, saveProfile, loadGame, saveGame, clearGame, latestSave, levelFromXp, wisdomPoints, type Profile } from '../save/storage';
import { perksPage, achievementsPage, dailyPage, achievementIcon } from './meta';
import { banditsPage, banditXpStrip, unlockableTypes, type BanditsOpts } from './bandits';
import { TOWERS_BY_ROLE, roleGroups, roleCls, roleIcon, roleChip, roleName, towerRoleCls } from './roles';
import { newlyUnlocked, bondCount, type AchievementDef } from '../game/achievements';
import { dailyFor, todayKey } from '../game/daily';
import { SYNERGIES } from '../game/synergy';
import { t, setLang, type LangSetting } from '../i18n';
import { softHyphens } from '../i18n/hyphen';
import {
  uiIcon,
  img,
  btn,
  roundBtn,
  backBtn,
  modal,
  bar,
  chip,
  socket,
  twinkles,
  stagger,
  countUp,
  confetti,
  restartIcon,
  fmt,
  mapImageSrc,
  prepareMapThumbs,
  towerPortraitUrl,
  heroPortraitUrl,
  starPortraitUrl,
  MEDAL,
  MEDAL_EMOJI,
  fitText,
  dec,
  leavePage,
  page,
  PAGE_STAGGER,
} from './kit';

type Scene = 'menu' | 'maps' | 'setup' | 'game';
type AtlasTab = 'bandits' | 'heroes' | 'stars' | 'bonds';

const MAP_LEVEL: Record<string, number> = { meadow: 1, caverns: 2, fjord: 3, forge: 4, candy: 5, rivers: 6 };
const TIER_COLOR: Record<string, string> = { Beginner: '#43c45a', Intermediate: '#f5b81f', Advanced: '#f27a2c', Expert: '#e8344e' };
const MEDAL_DIFFS: Difficulty[] = ['easy', 'medium', 'hard', 'champion'];

/**
 * Entrance animations (rise / pop) briefly push content past a scroller's edge; re-check its
 * "more below" fade once they end so a screen that fits is not left half faded.
 */
function settleMasks(el: HTMLElement) {
  el.addEventListener('animationend', (e) => {
    const sc = (e.target as HTMLElement).closest?.('.modal-body');
    if (sc) sc.dispatchEvent(new Event('scroll'));
  });
}

export class App {
  private renderer: Renderer;
  private profile: Profile;
  private game: Game | null = null;
  private hud: Hud | null = null;
  private scene: Scene = 'menu';
  private screen: HTMLElement;
  private backdrop: HTMLElement;
  private last = performance.now();
  private devUnlock = new URLSearchParams(location.search).has('dev') || location.hash === '#dev';
  private setupDiff: Difficulty = 'easy';
  private xpGainedThisGame = 0;
  private victoryShown = new WeakSet<Game>();
  /** pops of each tower at the previous round end (for per-round bandit XP) */
  private popsAtRound = new WeakMap<Tower, number>();
  /** bandit XP earned per raccoon type in the current game (shown on the result screens) */
  towerXpThisGame: Partial<Record<TowerId, number>> = {};
  /** achievements unlocked during the current game (listed on the result screens) */
  private achThisGame: AchievementDef[] = [];
  /** player level when the current game started (level-up chip on the result screens) */
  private levelAtStart = 1;
  /** the HUD tutorial is running (kept across a language switch) */
  private tutorialActive = false;
  private menuTop: HTMLElement | null = null;
  /** Escape / Android back for the page or modal open over the menu */
  private menuDismiss: (() => void) | null = null;
  private menuDock: HTMLElement | null = null;
  private rotateEl: HTMLElement;

  constructor(private root: HTMLElement) {
    this.profile = loadProfile();
    setLang(this.profile.settings.lang ?? 'auto');
    const canvas = h('canvas', { id: 'game' });
    root.append(canvas);
    this.renderer = new Renderer(canvas);
    this.backdrop = this.buildBackdrop();
    root.append(this.backdrop);
    this.screen = h('div', { class: 'layer' });
    root.append(this.screen);
    this.rotateEl = this.buildRotate();
    root.append(this.rotateEl);
    this.applySettings();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game && this.hud && !this.game.over && !this.hud.isModalOpen) this.hud.openPause();
      if (document.hidden) audio.ctx?.suspend();
      else audio.ctx?.resume();
    });
    const unlock = () => {
      audio.unlock();
      audio.applyVolumes();
      if (audio.music && !audio.music.playing) audio.music.start(this.scene === 'game' ? 'game' : 'menu');
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // Escape walks back through menus (the HUD handles it in game)
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.scene !== 'game') this.back();
    });
    this.resize();
    this.showMenu();
    prepareMapThumbs(MAPS);
    requestAnimationFrame(this.frame);
  }

  get level() {
    return levelFromXp(this.profile.xp).level;
  }

  /** "Rotate your device" overlay for portrait phones (rebuilt when the language changes). */
  private buildRotate(): HTMLElement {
    const phone =
      '<svg viewBox="0 0 64 100" width="100%" height="100%" aria-hidden="true"><rect x="7" y="5" width="50" height="90" rx="11" fill="#2c2163" stroke="#120a2b" stroke-width="7"/><rect x="7" y="5" width="50" height="90" rx="11" fill="none" stroke="#fff6e0" stroke-width="3"/><rect x="14" y="15" width="36" height="64" rx="4" fill="#5fd3ff"/><path d="M18 70 30 50l7 9 5-6 6 17z" fill="#8f7bff"/><circle cx="40" cy="27" r="5" fill="#ffcf3f"/><circle cx="32" cy="87" r="3" fill="#fff6e0"/></svg>';
    return h('div', { class: 'rotate' }, h('div', null, h('div', { class: 'phone', html: phone }), h('p', null, t('Rotate your device to landscape to play'))));
  }

  /** Android back button / Escape-like navigation. */
  back() {
    const modalEl = this.root.querySelector('.modal-wrap');
    if (this.scene === 'game' && this.hud) {
      if (this.hud.isModalOpen) this.hud.dismissModal();
      else this.hud.openPause();
      return;
    }
    if (modalEl) {
      // pages and modals opened from the menu close through their own handler (a page may
      // return to the page it was opened from)
      const dismiss = this.menuDismiss;
      if (dismiss && !modalEl.classList.contains('leaving')) {
        audio.play('click');
        dismiss();
        return;
      }
      modalEl.remove();
      this.menuDismiss = null;
      this.coverMenu(false);
      if (this.scene === 'menu') this.refreshMenu();
      return;
    }
    if (this.scene === 'setup') this.showMaps();
    else if (this.scene === 'maps') this.showMenu();
  }

  /** App moved to the background: pause and persist progress. */
  onBackground() {
    if (this.game && this.hud && !this.game.over && !this.hud.isModalOpen) this.hud.openPause();
    if (this.game) this.trackStats(this.game);
    saveProfile(this.profile);
  }

  private applySettings() {
    const s = this.profile.settings;
    setLang(s.lang ?? 'auto');
    audio.sfxVolume = s.sfx;
    audio.musicVolume = s.music;
    audio.applyVolumes();
    setHaptics(s.haptics);
    this.renderer.reducedEffects = s.reducedEffects;
    this.renderer.particles.reduced = s.reducedEffects;
    document.documentElement.classList.toggle('reduce-fx', s.reducedEffects);
    if (this.hud) this.hud.showFps = s.showFps;
  }

  private resize() {
    const w = window.innerWidth;
    const hgt = window.innerHeight;
    this.renderer.insetRight = this.scene === 'game' && this.hud ? this.hud.sidebarWidth : 0;
    this.renderer.resize(w, hgt, window.devicePixelRatio || 1);
  }

  private slowFrames = 0;
  private statTimer = 0;
  private frame = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    // adaptive quality: fall back to reduced effects if the device struggles for a few seconds
    if (!this.renderer.reducedEffects && this.scene === 'game') {
      this.slowFrames = dt > 1 / 38 ? this.slowFrames + 1 : Math.max(0, this.slowFrames - 2);
      if (this.slowFrames > 180) {
        this.renderer.reducedEffects = true;
        this.renderer.particles.reduced = true;
        this.hud?.toast(t('Effects reduced to keep the game smooth'), 2200);
      }
    }
    if (this.scene === 'game' && this.game) {
      this.game.update(dt);
      this.hud?.update(dt);
      this.statTimer -= dt;
      if (this.statTimer <= 0) {
        this.statTimer = 1.5;
        this.trackStats(this.game);
        if (!this.game.sandbox) this.claimAchievements(this.game);
      }
      if (audio.music) {
        audio.music.intensity = this.game.roundActive ? (this.game.enemies.some((e) => e.def.boss) ? 2 : 1) : 0;
        audio.music.frenzy = this.game.frenzyT > 0;
      }
      this.renderer.render(this.game.paused ? 0 : dt);
    }
    // menus sit on the painted key art; the canvas is idle there (saves battery)
    requestAnimationFrame(this.frame);
  };

  // -------------------------------------------------------------------------------------------
  // Backdrop (painted key art behind every menu screen)
  // -------------------------------------------------------------------------------------------

  private buildBackdrop(): HTMLElement {
    const url = uiIconUrl('keyart');
    return h('div', { class: 'backdrop', 'aria-hidden': 'true' }, url ? img(url, 'bd-img') : null, h('div', { class: 'bd-dim' }), twinkles(24, 5, 18));
  }

  private setBackdrop(mode: 'menu' | 'dim' | 'off') {
    this.backdrop.classList.toggle('hidden', mode === 'off');
    this.backdrop.classList.toggle('dim', mode === 'dim');
  }

  // -------------------------------------------------------------------------------------------
  // Scenes
  // -------------------------------------------------------------------------------------------

  private setScreen(el: HTMLElement) {
    clear(this.screen);
    // a page or modal open over the old screen is gone with it
    this.menuDismiss = null;
    this.coverMenu(false);
    this.screen.append(el);
  }

  private endGame() {
    this.hud?.destroy();
    this.hud = null;
    this.game = null;
    this.renderer.setGame(null);
  }

  private tap(fn: () => void) {
    return () => {
      audio.play('click');
      fn();
    };
  }

  showMenu() {
    this.endGame();
    this.scene = 'menu';
    this.setBackdrop('menu');
    this.resize();
    audio.music?.start('menu');
    const save = latestSave();
    const logoUrl = uiIconUrl('logo');
    const logo = h(
      'div',
      { class: 'menu-logo' },
      h(
        'div',
        { class: 'logo-in' },
        logoUrl ? img(logoUrl, '', 'Star Bandits') : h('div', { class: 'wordmark t-title' }, 'STAR', h('br'), 'BANDITS'),
        logoUrl ? h('div', { class: 'sheen', style: `-webkit-mask-image:url("${logoUrl}");mask-image:url("${logoUrl}")` }) : null,
      ),
    );
    const cta = h('div', { class: 'menu-cta' });
    if (save) {
      const m = MAPS.find((x) => x.id === save.mapId);
      if (m) {
        const resume = btn(t('Continue'), 'blue', this.tap(() => this.resume(save)), { cls: 'resume', icon: img(mapImageSrc(m), 'thumb'), sub: `${t(m.name)} · ${t('Round {n}', { n: save.round })}` });
        cta.append(resume);
      }
    }
    const play = btn(t('PLAY'), 'green', () => this.showMaps(), { size: 'big', cls: 'cta-play glint', icon: uiIcon('play', '▶') });
    cta.append(h('div', { style: 'position:relative;display:flex' }, h('div', { class: 'cta-halo' }), play));
    stagger([...cta.children] as HTMLElement[], 'anim-rise', 3);
    this.menuTop = this.buildMenuTop(true);
    this.menuDock = this.buildMenuDock(true);
    this.setScreen(h('div', { class: 'screen menu' }, logo, this.menuTop, this.menuDock, cta));
  }

  /** Rebuilds the badges/level after a modal changed them, without replaying entrance animations. */
  private refreshMenu() {
    if (this.scene !== 'menu' || !this.menuTop || !this.menuDock) return;
    const top = this.buildMenuTop(false);
    const dock = this.buildMenuDock(false);
    this.menuTop.replaceWith(top);
    this.menuDock.replaceWith(dock);
    this.menuTop = top;
    this.menuDock = dock;
  }

  private buildMenuTop(animate: boolean): HTMLElement {
    const lv = levelFromXp(this.profile.xp);
    const card = h(
      'div',
      { class: 'lvl-card', title: t('Player level {n}', { n: lv.level }), role: 'img', 'aria-label': `${t('Player level {n}', { n: lv.level })}: ${fmt(lv.into)} / ${fmt(lv.need)} XP` },
      h('div', { class: 'lvl-star' }, uiIcon('xp', '⭐'), h('b', { class: 't-num' }, String(lv.level))),
      bar(lv.into / lv.need),
      h('div', { class: 'lvl-xp t-outline' }, `${fmt(lv.into)} / ${fmt(lv.need)} XP`),
    );
    const gear = roundBtn(uiIcon('gear', '⚙️'), t('Settings'), this.tap(() => this.openSettings()));
    const top = h('div', { class: 'menu-top' }, card, gear);
    if (animate) stagger([card, gear], 'anim-drop', 1);
    return top;
  }

  private buildMenuDock(animate: boolean): HTMLElement {
    const pts = wisdomPoints(this.profile);
    const unseen = newlyUnlocked(this.profile, null).length;
    const dailyDone = !!this.profile.dailyDone[todayKey()];
    const unlockable = unlockableTypes(this.profile).length;
    const items = [
      roundBtn(uiIcon('mask', '🦝'), t('Bandits'), this.tap(() => this.openBandits()), unlockable > 0 ? String(unlockable) : null, 'bandits-btn'),
      roundBtn(uiIcon('calendar', '📅'), t('Daily'), this.tap(() => this.openDaily()), dailyDone ? null : '!'),
      roundBtn(uiIcon('lantern', '🧠'), t('Wisdom'), this.tap(() => this.openPerks()), pts > 0 ? String(pts) : null),
      roundBtn(uiIcon('trophy', '🏅'), t('Achievements'), this.tap(() => this.openAchievements()), unseen > 0 ? String(unseen) : null),
      roundBtn(uiIcon('book', '📖'), t('Star Atlas'), this.tap(() => this.openCodex())),
    ];
    if (animate) stagger(items, 'anim-rise', 4);
    return h('div', { class: 'menu-dock' }, ...items);
  }

  private mapUnlocked(m: MapDef) {
    return this.devUnlock || this.level >= (MAP_LEVEL[m.id] ?? 1);
  }

  private topbar(title: string, onBack: () => void, ...right: (HTMLElement | null)[]) {
    return h('div', { class: 'topbar' }, backBtn(this.tap(onBack)), h('h1', { class: 't-title anim-fade' }, title), h('div', { class: 'spacer' }), ...right);
  }

  private medalIcon(d: Difficulty, cls = '') {
    return d === 'sandbox' ? uiIcon('sack', MEDAL_EMOJI.sandbox, cls) : uiIcon(MEDAL[d], MEDAL_EMOJI[d], cls);
  }

  showMaps() {
    this.scene = 'maps';
    audio.play('click');
    this.setBackdrop('dim');
    const grid = h('div', { class: 'map-grid' });
    let medalCount = 0;
    const maps = [...MAPS].sort((a, b) => (MAP_LEVEL[a.id] ?? 9) - (MAP_LEVEL[b.id] ?? 9));
    const cards: HTMLElement[] = [];
    for (const m of maps) {
      const unlocked = this.mapUnlocked(m);
      const medals = h('div', { class: 'mc-medals' });
      for (const d of MEDAL_DIFFS) {
        const got = !!this.profile.medals[m.id]?.[d];
        if (got) medalCount++;
        const ic = this.medalIcon(d, got ? '' : 'off');
        ic.setAttribute('title', t(DIFFICULTIES[d].name));
        medals.append(ic);
      }
      const card = h(
        'button',
        { class: 'mapcard' + (unlocked ? '' : ' locked'), type: 'button', 'aria-label': t(m.name) },
        img(mapImageSrc(m), 'mc-img', t(m.name)),
        h('div', { class: 'mc-shade' }),
        h('div', { class: 'mc-tier', style: `--tc:${TIER_COLOR[m.tier]}` }, t(m.tier)),
        medals,
        h('div', { class: 'mc-name t-outline' }, t(m.name)),
        unlocked ? null : h('div', { class: 'mc-lock' }, uiIcon('lock', '🔒'), chip(null, t('Unlocks at level {n}', { n: MAP_LEVEL[m.id] }), 'dark')),
      );
      card.addEventListener('click', () => {
        if (!unlocked) {
          audio.play('error');
          card.classList.remove('shake');
          void card.offsetWidth;
          card.classList.add('shake');
          return;
        }
        this.showSetup(m);
      });
      cards.push(card);
      grid.append(card);
    }
    stagger(cards, 'anim-rise', 1);
    const total = h('div', { class: 'pill medal-total anim-fade', title: t('Medals') }, uiIcon('medal3', '🥇'), h('span', null, `${medalCount}/${MAPS.length * MEDAL_DIFFS.length}`));
    this.setScreen(h('div', { class: 'screen' }, this.topbar(t('Choose a map'), () => this.showMenu(), total), grid));
  }

  private lastSetupMap: MapDef = MAPS[0];
  showSetup(m: MapDef) {
    this.scene = 'setup';
    this.lastSetupMap = m;
    audio.play('click');
    this.setBackdrop('dim');
    const level = this.level;

    // left: painted map, description, bandit roster
    const roster = h('div', { class: 'roster-icons' });
    let unlockedCount = 0;
    for (const id of TOWERS_BY_ROLE) {
      const def = TOWERS[id];
      const open = this.devUnlock || level >= def.unlock;
      if (open) unlockedCount++;
      // locked: lock + level number (a "Lvl 5" label is wider than the icon on small phones)
      const req = t('Unlocks at level {n}', { n: def.unlock });
      roster.append(h('div', { class: `roster-icon role-disc ${roleCls(def.role)}` + (open ? '' : ' locked'), title: open ? `${t(def.name)} · ${roleName(def.role)}` : req, role: 'img', 'aria-label': open ? `${t(def.name)} · ${roleName(def.role)}` : req }, img(towerPortraitUrl(id), '', ''), open ? null : h('span', { class: 'lv', 'aria-hidden': 'true' }, uiIcon('lock', '🔒'), String(def.unlock))));
    }
    const left = h(
      'div',
      { class: 'setup-col' },
      h('div', { class: 'setup-map anim-rise', style: '--i:1' }, img(mapImageSrc(m), '', t(m.name)), h('div', { class: 'mc-tier', style: `--tc:${TIER_COLOR[m.tier]}` }, t(m.tier))),
      h('p', { class: 'setup-desc anim-rise', style: '--i:2' }, t(m.desc)),
      h('div', { class: 'roster well anim-rise', style: '--i:3' }, h('div', { class: 'roster-head' }, h('span', { class: 't-up' }, t('Bandits')), chip(null, `${unlockedCount}/${TOWER_ORDER.length}`)), roster),
    );

    // right: difficulty, hero, start
    const diffs = h('div', { class: 'diff-row' });
    const diffDesc = h('div', { class: 'diff-desc well' });
    const heroes = h('div', { class: 'hero-row' });
    const actions = h('div', { class: 'setup-actions' });
    const render = (first: boolean) => {
      clear(diffs);
      const order: Difficulty[] = ['easy', 'medium', 'hard', 'champion', 'sandbox'];
      const tiles = order.map((d) => {
        const def = DIFFICULTIES[d];
        const got = d === 'sandbox' || !!this.profile.medals[m.id]?.[d];
        const tile = h(
          'button',
          { class: 'tile diff-tile ' + d + (this.setupDiff === d ? ' sel' : '') + (got ? ' got' : ''), type: 'button', style: `--dc:${def.color}`, 'aria-pressed': String(this.setupDiff === d) },
          this.medalIcon(d, 'medal'),
          fitText(h('span', { class: 'dname t-outline' }, t(def.name)), 0.8, false),
          got && d !== 'sandbox' ? uiIcon('check', '✔', 'got-mark') : null,
        );
        tile.addEventListener('click', () => {
          if (this.setupDiff === d) return;
          this.setupDiff = d;
          audio.play('click');
          render(false);
        });
        return tile;
      });
      diffs.append(...tiles);
      const sel = DIFFICULTIES[this.setupDiff];
      clear(diffDesc);
      diffDesc.style.setProperty('--dc', sel.color);
      diffDesc.append(h('span', { class: 'dot' }), h('span', null, t(sel.desc)));

      clear(heroes);
      const heroTiles = HERO_ORDER.map((id) => {
        const def = HEROES[id];
        const locked = !this.devUnlock && level < def.unlock;
        const sel = this.profile.heroId === id;
        const c = h(
          'button',
          { class: 'tile hero-tile role-tint role-hero' + (sel ? ' sel' : '') + (locked ? ' locked' : ''), type: 'button', 'aria-pressed': String(sel) },
          h('div', { class: 'portrait role-disc' }, img(heroPortraitUrl(id, 1), '', t(def.name))),
          h(
            'div',
            { class: 'hero-text' },
            h('b', { class: 't-outline' }, t(def.name)),
            h('small', null, t(def.title)),
            locked ? chip(uiIcon('lock', '🔒'), t('Unlocks at level {n}', { n: def.unlock }), 'dark') : h('span', { class: 'hdesc' }, t(def.desc)),
          ),
          sel ? uiIcon('check', '✔', 'sel-mark') : null,
        );
        c.addEventListener('click', () => {
          if (locked) {
            audio.play('error');
            return;
          }
          if (sel) return;
          this.profile.heroId = id;
          saveProfile(this.profile);
          audio.play('click');
          render(false);
        });
        return c;
      });
      heroes.append(...heroTiles);

      clear(actions);
      const existing = loadGame(m.id, this.setupDiff);
      if (existing && this.setupDiff !== 'sandbox') actions.append(btn(t('Continue round {n}', { n: existing.round }), 'blue', this.tap(() => this.resume(existing))));
      actions.append(btn(existing ? t('New game') : t('Start'), 'green', () => this.startGame(m.id, this.setupDiff, this.profile.heroId), { cls: 'start glint', icon: uiIcon('play', '▶') }));
      if (first) {
        stagger(tiles, 'anim-pop', 2);
        stagger(heroTiles, 'anim-rise', 6);
        stagger([...actions.children] as HTMLElement[], 'anim-rise', 8);
      }
    };
    render(true);
    const right = h(
      'div',
      { class: 'setup-col' },
      h('div', { class: 'sec-title' }, h('span', { class: 't-up' }, t('Difficulty'))),
      diffs,
      diffDesc,
      h('div', { class: 'sec-title' }, h('span', { class: 't-up' }, t('Hero'))),
      heroes,
      actions,
    );
    this.setScreen(h('div', { class: 'screen' }, this.topbar(t(m.name), () => this.showMaps()), h('div', { class: 'setup' }, left, right)));
  }

  // -------------------------------------------------------------------------------------------
  // Game
  // -------------------------------------------------------------------------------------------

  startGame(mapId: string, diff: Difficulty, heroId: HeroId | null, challenge?: ChallengeDef) {
    if (!challenge) clearGame(mapId, diff);
    // daily challenges are the same for everyone, so permanent perks are switched off there
    const perks = diff === 'sandbox' || challenge ? [] : [...this.profile.perks];
    // bandit progression: only unlocked upgrade tiers can be bought (everything is open in sandbox, dev mode and dailies)
    const upgradeLimits = limitsFor(this.profile, this.devUnlock || diff === 'sandbox' || !!challenge);
    const g = new Game({ mapId, difficulty: diff, heroId: challenge?.noHero ? null : heroId, perks, challenge, upgradeLimits });
    this.enterGame(g);
  }

  private startDaily() {
    const d = dailyFor(todayKey());
    this.startGame(d.mapId, d.difficulty, this.profile.heroId, d.challenge);
  }

  // -------------------------------------------------------------------------------------------
  // Full-screen pages (Bandits, Daily, Wisdom, Achievements, Star Atlas)
  // -------------------------------------------------------------------------------------------

  /**
   * Opens a full-screen page. Back (button, Escape, Android back) runs `back` when the page was
   * opened from somewhere else (Star Atlas, a result screen), otherwise the page slides away to
   * the menu.
   */
  private openPage(build: (close: () => void) => HTMLElement, back?: () => void) {
    const host = this.modalHost();
    let el: HTMLElement | null = null;
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      if (back) {
        back();
        // `back` normally replaces the page (another page, the result screen); if not, close it
        if (el?.isConnected) host.close();
      } else host.leave(() => this.refreshMenu());
    };
    el = build(this.tap(close));
    host.open(el, close);
    return el;
  }

  /** Player level (star + bar) for page headers. */
  private levelPill(): HTMLElement {
    const lv = levelFromXp(this.profile.xp);
    const label = `${t('Player level {n}', { n: lv.level })}: ${fmt(lv.into)} / ${fmt(lv.need)} XP`;
    return h(
      'div',
      { class: 'pill lvl-pill', title: label, role: 'img', 'aria-label': label },
      h('span', { class: 'lvl-pill-star' }, uiIcon('xp', '⭐'), h('b', null, String(lv.level))),
      h('span', { class: 'pill-meter' }, h('small', null, `${fmt(lv.into)} / ${fmt(lv.need)} XP`), bar(lv.into / lv.need)),
    );
  }

  private openPerks() {
    this.openPage((close) => perksPage(this.profile, close, () => {}));
  }

  private openAchievements() {
    this.claimAchievements(null);
    this.openPage((close) => achievementsPage(this.profile, this.game, close));
  }

  private openDaily() {
    const host = this.modalHost();
    this.openPage((close) =>
      dailyPage(
        this.profile,
        this.tap(() => {
          host.close();
          this.startDaily();
        }),
        close,
      ),
    );
  }

  /**
   * Bandit menu (raccoon XP, upgrade tier unlocks, heroes). `back` runs instead of returning to the
   * main menu when it closes (Star Atlas, result screens).
   */
  openBandits(opts: BanditsOpts & { back?: () => void } = {}) {
    this.openPage(
      (close) =>
        banditsPage(
          {
            profile: this.profile,
            playerLevel: this.level,
            devUnlock: this.devUnlock,
            onUnlock: (id, path, tier) => this.raiseLiveLimit(id, path, tier),
            close,
            headRight: [this.levelPill()],
          },
          opts,
        ),
      opts.back,
    );
  }

  /** A tier unlocked from a menu during a game (result screen, freeplay) can be bought right away. */
  private raiseLiveLimit(id: TowerId, path: number, tier: number) {
    const lim = this.game?.config.upgradeLimits?.[id];
    if (lim) lim[path] = Math.max(lim[path], tier);
  }

  /**
   * Records unlocked achievements and grants their XP. Several at once share one toast (a new toast
   * replaces the previous one); `announce` is off when the result screen lists them instead.
   */
  private claimAchievements(g: Game | null, announce = true) {
    const fresh = newlyUnlocked(this.profile, g);
    if (!fresh.length) return;
    let xp = 0;
    for (const a of fresh) {
      this.profile.achievements[a.id] = Date.now();
      this.addXp(a.xp, announce);
      xp += a.xp;
      if (g) this.achThisGame.push(a);
    }
    if (announce && this.hud) {
      const msg =
        fresh.length === 1
          ? t('Achievement unlocked: {name} (+{xp} XP)', { name: t(fresh[0].name), xp })
          : t('{n} achievements unlocked: {list} (+{xp} XP)', { n: fresh.length, list: fresh.map((a) => t(a.name)).join(', '), xp });
      this.hud.toast(msg, 3600);
    }
    audio.play('levelup', 0.8);
    saveProfile(this.profile);
  }

  /** Copies live game stats into the profile (deltas since the last call). */
  private recorded = { pops: 0, bosses: 0, golden: 0 };
  private trackStats(g: Game) {
    if (g.sandbox) return;
    const st = this.profile.stats;
    st.pops += g.stats.pops - this.recorded.pops;
    st.bossesPopped += g.stats.bossesPopped - this.recorded.bosses;
    st.golden = (st.golden ?? 0) + g.stats.goldenPopped - this.recorded.golden;
    this.recorded = { pops: g.stats.pops, bosses: g.stats.bossesPopped, golden: g.stats.goldenPopped };
    st.bestCombo = Math.max(st.bestCombo ?? 0, g.stats.bestCombo, g.combo);
    st.maxBonds = Math.max(st.maxBonds ?? 0, bondCount(g));
    st.maxCash = Math.max(st.maxCash ?? 0, Math.floor(g.cash));
    const hero = g.hero;
    if (hero) st.heroMax = Math.max(st.heroMax ?? 1, hero.heroLevel);
    const t5 = new Set(st.tier5 ?? []);
    for (const tw of g.towers) if (tw.def && tw.tiers.includes(5)) t5.add(tw.def.id);
    st.tier5 = [...t5];
  }

  /** `carry` (retrying a round of the game that just ended) keeps this game's XP tallies for the result screen. */
  resume(s: SaveState, carry = false) {
    let g: Game;
    try {
      g = Game.restore(s, limitsFor(this.profile, this.devUnlock || s.difficulty === 'sandbox' || !!s.challenge));
    } catch {
      clearGame(s.mapId, s.difficulty);
      this.showMenu();
      return;
    }
    this.enterGame(g, carry);
  }

  private enterGame(g: Game, carry = false) {
    audio.unlock();
    this.endGame();
    this.game = g;
    // restored towers carry their lifetime `pops`: only stars shattered from here on earn bandit XP
    for (const tw of g.towers) this.popsAtRound.set(tw, tw.pops);
    if (!carry) {
      this.xpGainedThisGame = 0;
      this.towerXpThisGame = {};
      this.achThisGame = [];
      this.levelAtStart = this.level;
    }
    this.recorded = { pops: g.stats.pops, bosses: g.stats.bossesPopped, golden: g.stats.goldenPopped };
    this.statTimer = 0;
    g.events.on('frenzyStart', () => {
      if (!g.sandbox) this.profile.stats.frenzies = (this.profile.stats.frenzies ?? 0) + 1;
    });
    g.events.on('roundStart', () => {
      if (!g.sandbox && g.roundSnapshot && !g.config.challenge) saveGame(g.roundSnapshot);
    });
    g.fx = makePresentation(this.renderer);
    g.autoStart = this.profile.settings.autoStart;
    this.scene = 'game';
    this.setBackdrop('off');
    clear(this.screen);
    this.renderer.setGame(g);
    this.profile.stats.games++;
    saveProfile(this.profile);
    const tutorial = !this.profile.tutorialDone && g.config.difficulty !== 'sandbox' && !g.config.challenge && g.round === g.diff.startRound && g.towers.length === 0;
    this.makeHud(g, tutorial);
    audio.music?.start('game');
  }

  /** Builds the in-game HUD (again after a language switch, so every label is re-translated). */
  private makeHud(g: Game, tutorial: boolean) {
    this.tutorialActive = tutorial;
    this.hud = new Hud(
      g,
      this.renderer,
      {
        playerLevel: this.level,
        devUnlock: this.devUnlock,
        tutorial,
        heroId: g.config.heroId,
        onQuit: () => this.showMenu(),
        onRestart: () => this.startGame(g.config.mapId, g.config.difficulty, g.config.heroId, g.config.challenge),
        onRetryRound: () => {
          if (g.roundSnapshot) this.resume(g.roundSnapshot, true);
        },
        onSettings: (fromPause) => this.openSettings(fromPause ? () => this.hud?.openPause() : undefined),
        onRoundEnd: (round) => this.onRoundEnd(g, round),
        onVictory: () => this.onVictory(g),
        onDefeat: () => this.onDefeat(g),
        onTutorialDone: () => {
          this.tutorialActive = false;
          this.profile.tutorialDone = true;
          saveProfile(this.profile);
        },
        progress: {
          xp: (id) => xpOf(this.profile, id),
          nextCost: (id, path) => nextUnlockCost(this.profile, id, path),
          unlock: (id, path) => {
            const tier = unlockNext(this.profile, id, path);
            if (tier === null) return false;
            const lim = g.config.upgradeLimits?.[id];
            if (lim) lim[path] = Math.max(lim[path], tier);
            saveProfile(this.profile);
            audio.play('upgrade');
            return true;
          },
        },
        firstBoss: (type) => {
          if (this.profile.seenBosses.includes(type)) return false;
          this.profile.seenBosses.push(type);
          saveProfile(this.profile);
          return true;
        },
      },
      this.root,
    );
    this.hud.showFps = this.profile.settings.showFps;
    this.resize();
    // after the sidebar has laid out
    requestAnimationFrame(() => this.resize());
  }

  private onRoundEnd(g: Game, round: number) {
    if (g.sandbox) return;
    // bandit progression: each raccoon on the field earns XP for its type (more for the stars it shattered)
    for (const tw of g.towers) {
      if (!tw.def) continue;
      const before = this.popsAtRound.get(tw) ?? 0;
      this.popsAtRound.set(tw, tw.pops);
      const gained = roundXp(round, Math.max(0, tw.pops - before), g.diff.xpMul);
      addTowerXp(this.profile, tw.def.id, gained);
      this.towerXpThisGame[tw.def.id] = (this.towerXpThisGame[tw.def.id] ?? 0) + gained;
    }
    const xp = Math.round((20 + round * 2) * g.diff.xpMul);
    this.addXp(xp);
    this.profile.stats.bestRound = Math.max(this.profile.stats.bestRound, round);
    if ((!g.won || g.freeplay) && !g.config.challenge) saveGame(g.serialize());
    this.trackStats(g);
    saveProfile(this.profile);
  }

  /** `banner` is off while the result screen opens (it shows the level-up itself). */
  private addXp(xp: number, banner = true) {
    const before = this.level;
    this.profile.xp += xp;
    this.xpGainedThisGame += xp;
    const after = this.level;
    if (after > before && this.hud) this.hud.setPlayerLevel(after);
    if (after > before && this.hud && banner) {
      const unlocked = [
        ...TOWER_ORDER.filter((id) => TOWERS[id].unlock > before && TOWERS[id].unlock <= after).map((id) => t(TOWERS[id].name)),
        ...HERO_ORDER.filter((id) => HEROES[id].unlock > before && HEROES[id].unlock <= after).map((id) => t(HEROES[id].name)),
      ];
      this.hud.banner(t('LEVEL {n}!', { n: after }), unlocked.length ? t('Unlocked: {list}', { list: unlocked.join(', ') }) : t('Player level up'), false);
      audio.play('levelup');
    }
  }

  private onVictory(g: Game) {
    // Play after a victory re-emits it; stats and rewards are only counted once per game
    if (this.victoryShown.has(g)) return;
    this.victoryShown.add(g);
    const p = this.profile;
    this.trackStats(g);
    let first = false;
    if (g.config.challenge) {
      const key = todayKey();
      if (!p.dailyDone[key] && g.config.challenge.id === 'daily-' + key) {
        p.dailyDone[key] = true;
        p.stats.dailies = (p.stats.dailies ?? 0) + 1;
        this.addXp(500, false);
        first = true;
      }
    } else {
      if (!p.medals[g.map.id]) p.medals[g.map.id] = {};
      first = !p.medals[g.map.id][g.config.difficulty];
      p.medals[g.map.id][g.config.difficulty] = true;
      if (first) this.addXp(Math.round(300 * g.diff.xpMul), false);
    }
    p.stats.wins++;
    if (g.stats.leaked === 0) p.stats.flawless = (p.stats.flawless ?? 0) + 1;
    this.claimAchievements(g, false);
    saveProfile(p);
    // daily runs are never saved; don't wipe the player's normal game on the same map/difficulty
    if (!g.config.challenge) clearGame(g.map.id, g.config.difficulty);
    const hud = this.hud!;
    const d = g.config.difficulty;
    const medal = !g.config.challenge && MEDAL[d] ? uiIcon(MEDAL[d], MEDAL_EMOJI[d], 'medal-pop') : null;
    const msg = h(
      'p',
      { class: 'result-msg' },
      g.config.challenge ? t('Daily challenge complete!') : t('{map} on {diff}', { map: t(g.map.name), diff: t(g.diff.name) }),
      first ? h('br') : null,
      first ? chip(g.config.challenge ? uiIcon('calendar', '📅') : this.medalIcon(d), g.config.challenge ? '+500 XP' : t('New medal!'), 'gold anim-pop') : null,
    );
    const hero = h('div', { class: 'result-hero' }, h('div', { class: 'result-art' }, h('div', { class: 'rays' }), uiIcon('trophy', '🏆'), medal), msg, this.resultAchievements());
    let m: HTMLElement;
    const strip = this.banditStrip(() => hud.openModal(m, true, { locked: true }));
    m = modal(
      { title: t('VICTORY!'), color: 'gold', size: 'wide', cls: 'win' },
      [h('div', { class: 'result' }, hero, h('div', { class: 'result-side' }, this.resultStats(g, true), this.xpReward(), strip))],
      [
        btn(
          t('Freeplay'),
          'gold',
          () => {
            g.continueFreeplay();
            hud.closeModal();
            hud.toast(t('Freeplay! Rounds keep getting harder…'), 3000);
          },
          { icon: uiIcon('fast', '∞') },
        ),
        btn(
          t('Maps'),
          'green',
          this.tap(() => {
            this.endGame();
            this.showMaps();
          }),
          { icon: uiIcon('play', '▶') },
        ),
        btn(t('Home'), 'dark', this.tap(() => this.showMenu()), { icon: uiIcon('home', '🏠') }),
      ],
    );
    settleMasks(m);
    const wrap = hud.openModal(m, true, { locked: true });
    confetti(wrap, 90);
    this.renderer.confetti(800, 300, 120);
  }

  private onDefeat(g: Game) {
    const p = this.profile;
    this.trackStats(g);
    saveProfile(p);
    if (!g.config.challenge) clearGame(g.map.id, g.config.difficulty);
    const hud = this.hud!;
    setTimeout(() => {
      if (this.hud !== hud) return;
      const crack =
        '<svg class="crack" viewBox="0 0 100 100" aria-hidden="true"><path d="M52 18 L44 38 L58 50 L42 66 L54 86" fill="none" stroke="#120a2b" stroke-width="9" stroke-linejoin="round" stroke-linecap="round"/><path d="M52 18 L44 38 L58 50 L42 66 L54 86" fill="none" stroke="#2a1840" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/></svg>';
      const art = h('div', { class: 'result-art' }, uiIcon('heart', '💔'), h('div', { class: 'crack-wrap', html: uiIconUrl('heart') ? crack : '' }));
      const hero = h('div', { class: 'result-hero' }, art, h('p', { class: 'result-msg' }, t('The stars broke through on round {n}.', { n: g.round })), this.resultAchievements());
      const snap = g.roundSnapshot;
      let m: HTMLElement;
      const strip = this.banditStrip(() => hud.openModal(m, true, { locked: true }));
      m = modal(
        { title: t('GAME OVER'), color: 'red', size: 'wide', cls: 'lose' },
        [h('div', { class: 'result lose' }, hero, h('div', { class: 'result-side' }, this.resultStats(g, false), this.xpReward(), strip))],
        [
          snap ? btn(t('Retry round {n}', { n: snap.round }), 'gold', this.tap(() => this.resume(snap, true)), { icon: restartIcon() }) : null,
          btn(t('Restart'), 'green', this.tap(() => this.startGame(g.config.mapId, g.config.difficulty, g.config.heroId, g.config.challenge)), { icon: uiIcon('play', '▶') }),
          btn(t('Home'), 'dark', this.tap(() => this.showMenu()), { icon: uiIcon('home', '🏠') }),
        ],
      );
      settleMasks(m);
      hud.openModal(m, true, { locked: true });
    }, 900);
  }

  private resultStats(g: Game, won: boolean) {
    const s = g.stats;
    const star = (id: Parameters<typeof starPortraitUrl>[0]) => img(starPortraitUrl(id), 'ico');
    // [icon, label, value, format, counts up]
    const items: [HTMLElement, string, number, (n: number) => string, boolean][] = [
      [star('red'), t('Stars shattered'), s.pops, fmt, true],
      [star('moab'), t('Bosses defeated'), s.bossesPopped, fmt, true],
      [uiIcon('coin', '🪙'), t('Cash earned'), Math.floor(s.cashEarned), (n) => '$' + fmt(n), true],
      // the combo still running when the game ends has not been folded into bestCombo yet
      [uiIcon('target', '🎯'), t('Best combo'), Math.max(s.bestCombo, g.combo), (n) => fmt(n) + 'x', true],
      [star('golden'), t('Lucky Stars'), s.goldenPopped ?? 0, fmt, true],
      won ? [uiIcon('heart', '❤️'), t('Lives left'), Math.max(0, g.lives), fmt, false] : [uiIcon('sack', '💰'), t('Round reached'), g.round, fmt, false],
    ];
    const tiles = items.map(([icon, label, value, format, counts], i) => {
      // small numbers and the round/lives are shown as they are; the rest counts up while its tile rises in
      const val = h('b', { class: 't-num' }, format(counts && value > 12 ? 0 : value));
      if (counts && value > 12) countUp(val, value, { delay: 160 + i * 50, format });
      return h('div', { class: 'stat well' }, icon, h('div', { class: 'stat-text' }, h('small', null, label), val));
    });
    stagger(tiles, 'anim-rise', 2);
    return h('div', { class: 'stat-grid' }, ...tiles);
  }

  private xpReward() {
    const val = h('b', { class: 't-num' }, '+0');
    countUp(val, this.xpGainedThisGame, { delay: 1000, format: (n) => '+' + fmt(n) });
    const lv = this.level;
    const up = lv > this.levelAtStart ? chip(uiIcon('xp', '⭐'), t('Level {n}!', { n: lv }), 'gold lvl-up anim-pop') : null;
    if (up) up.style.setProperty('--d', '1500ms');
    return h('div', { class: 'reward anim-pop', style: '--d:900ms' }, uiIcon('xp', '⭐'), val, h('small', null, t('XP earned')), up);
  }

  /** Achievements unlocked during this game (their toasts would hide behind the result modal). */
  private resultAchievements(): HTMLElement | null {
    if (!this.achThisGame.length) return null;
    const chips = this.achThisGame.map((a, i) => {
      const c = chip(achievementIcon(a), t(a.name), 'gold anim-pop');
      c.style.setProperty('--d', `${1200 + i * 120}ms`);
      c.title = `${t(a.desc)} (+${fmt(a.xp)} XP)`;
      return c;
    });
    return h('div', { class: 'result-ach' }, h('span', { class: 't-up' }, t('Achievements')), h('div', { class: 'result-ach-row' }, ...chips));
  }

  /**
   * Bandit XP earned per raccoon + a way into the Bandit menu when a tier can be unlocked. Coming
   * back from the menu rebuilds the row (after unlocking, the hint may be gone) and reopens the screen.
   */
  private banditStrip(reopen: () => void): HTMLElement | null {
    let el: HTMLElement | null = null;
    const build = (): HTMLElement | null =>
      banditXpStrip(this.profile, this.towerXpThisGame, () =>
        this.openBandits({
          back: () => {
            const next = build();
            if (el && next) el.replaceWith(next);
            else el?.remove();
            el = next;
            reopen();
          },
        }),
      );
    el = build();
    return el;
  }

  // -------------------------------------------------------------------------------------------
  // Settings & codex
  // -------------------------------------------------------------------------------------------

  /**
   * Where modals and pages open: the HUD's modal layer in a game, otherwise over the menu. Pages
   * (`.page`) get a full-screen `.page-wrap`; one page replacing another skips the fade (`.swap`).
   * `leave` plays a page's exit before removing it.
   */
  private modalHost(): { open: (el: HTMLElement, onDismiss?: () => void) => void; close: () => void; leave: (then?: () => void) => void } {
    if (this.hud) {
      const hud = this.hud;
      return {
        open: (el, onDismiss) => hud.openModal(el, true, { onDismiss }),
        close: () => hud.closeModal(),
        leave: (then) => {
          hud.closeModal();
          then?.();
        },
      };
    }
    const close = () => {
      this.screen.querySelectorAll('.modal-wrap').forEach((w) => w.remove());
      this.menuDismiss = null;
      this.coverMenu(false);
    };
    return {
      open: (el, onDismiss) => {
        const isPage = el.classList.contains('page');
        const prev = [...this.screen.querySelectorAll('.modal-wrap')];
        const swap = isPage && prev.some((w) => w.classList.contains('page-wrap') && !w.classList.contains('leaving'));
        prev.forEach((w) => w.remove());
        const wrap = h('div', { class: 'modal-wrap' + (isPage ? ' page-wrap' : '') + (swap ? ' swap' : '') }, el);
        if (!isPage)
          wrap.addEventListener('pointerdown', (e) => {
            if (e.target !== wrap) return;
            audio.play('click');
            if (onDismiss) onDismiss();
            else {
              close();
              this.refreshMenu();
            }
          });
        this.menuDismiss = onDismiss ?? null;
        this.screen.append(wrap);
        this.coverMenu(isPage);
      },
      close,
      leave: (then) => {
        const wrap = this.screen.querySelector('.modal-wrap');
        this.menuDismiss = null;
        this.coverMenu(false);
        if (!wrap) return then?.();
        leavePage(wrap, () => {
          wrap.remove();
          then?.();
        });
      },
    };
  }

  /** While a page covers the menu, the menu and its painted backdrop stop animating (battery). */
  private coverTimer = 0;
  private coverMenu(on: boolean) {
    clearTimeout(this.coverTimer);
    const apply = (v: boolean) => {
      this.backdrop.classList.toggle('covered', v);
      this.screen.querySelector(':scope > .screen')?.classList.toggle('covered', v);
    };
    if (on) this.coverTimer = window.setTimeout(() => apply(true), 450);
    else apply(false);
  }

  /** `back` runs after the modal closes (in game: return to the pause menu). */
  openSettings(back?: () => void) {
    const host = this.modalHost();
    const s = this.profile.settings;
    const save = () => {
      saveProfile(this.profile);
      this.applySettings();
    };
    const label = (icon: string | HTMLElement, text: string) => h('span', { class: 'lbl' }, socket(icon, 36), h('span', null, text));
    const slider = (icon: string | HTMLElement, text: string, v: number, on: (x: number) => void) => {
      const inp = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(v), 'aria-label': text }) as HTMLInputElement;
      const paint = () => inp.style.setProperty('--v', `${Math.round(+inp.value * 100)}%`);
      paint();
      inp.addEventListener('input', () => {
        paint();
        on(+inp.value);
        save();
      });
      inp.addEventListener('change', () => audio.play('pop', 0.8));
      return h('div', { class: 'setting' }, label(icon, text), inp);
    };
    const sw = (icon: string | HTMLElement, text: string, v: boolean, on: (x: boolean) => void) => {
      const tg = h('span', { class: 'toggle' + (v ? ' on' : '') });
      const b = h('button', { class: 'setting', type: 'button', role: 'switch', 'aria-checked': String(v) }, label(icon, text), tg);
      b.addEventListener('click', () => {
        const nv = !tg.classList.contains('on');
        tg.classList.toggle('on', nv);
        b.setAttribute('aria-checked', String(nv));
        on(nv);
        save();
        audio.play('click');
      });
      return b;
    };
    const seg = h('div', { class: 'seg' });
    for (const [code, name] of [
      ['auto', t('Auto')],
      ['en', 'English'],
      ['de', 'Deutsch'],
    ] as [LangSetting, string][]) {
      const b = h('button', { class: (s.lang ?? 'auto') === code ? 'on' : '', type: 'button' }, name);
      b.addEventListener('click', () => {
        if ((s.lang ?? 'auto') === code) return;
        s.lang = code;
        save();
        audio.play('click');
        host.close();
        const rot = this.buildRotate();
        this.rotateEl.replaceWith(rot);
        this.rotateEl = rot;
        if (this.scene === 'menu') this.showMenu();
        else if (this.scene === 'maps') this.showMaps();
        else if (this.scene === 'setup') this.showSetup(this.lastSetupMap);
        else if (this.scene === 'game' && this.game) {
          const g = this.game;
          this.hud?.destroy();
          this.renderer.selected = null;
          this.renderer.ghost = null;
          // the tutorial can only start over from its first step (nothing placed yet); later on it is
          // finished for good so it does not pop up again in the next game
          const restartTutorial = this.tutorialActive && g.towers.length === 0 && !g.roundActive;
          if (this.tutorialActive && !restartTutorial) {
            this.profile.tutorialDone = true;
            saveProfile(this.profile);
          }
          this.makeHud(g, restartTutorial);
        }
        this.openSettings(back);
      });
      seg.append(b);
    }
    const done = () => {
      host.close();
      back?.();
    };
    const m = modal(
      { title: t('Settings'), color: 'blue', icon: uiIcon('gear', '⚙️'), cls: 'settings', onClose: this.tap(done) },
      [
        h(
          'div',
          { class: 'settings-list' },
          slider(uiIcon('sound', '🔊'), t('Sound effects'), s.sfx, (x) => (s.sfx = x)),
          slider(uiIcon('music', '🎵'), t('Music'), s.music, (x) => (s.music = x)),
          sw(uiIcon('haptics', '📳'), t('Haptics'), s.haptics, (x) => (s.haptics = x)),
          sw(uiIcon('battery', '✨'), t('Reduced effects (better battery)'), s.reducedEffects, (x) => (s.reducedEffects = x)),
          sw(uiIcon('fast', '⏩'), t('Auto-start rounds by default'), s.autoStart, (x) => (s.autoStart = x)),
          sw(uiIcon('chart', '📈'), t('Show FPS'), s.showFps, (x) => (s.showFps = x)),
          h('div', { class: 'setting full' }, label(uiIcon('globe', '🌐'), t('Language')), seg),
        ),
        h('p', { class: 'settings-foot-note' }, t('Star Bandits v0.1 · Made with ❤️')),
      ],
      [btn(t('Done'), 'green', this.tap(done), { icon: uiIcon('check', '✔') })],
    );
    host.open(m, done);
  }

  /** `scroll` restores the list position when coming back from the Bandit menu. */
  openCodex(tab: AtlasTab = 'bandits', scroll = 0) {
    const level = this.level;
    const grid = h('div', { class: 'atlas-grid' });
    const tabs: [AtlasTab, string, number][] = [
      ['bandits', t('Bandits'), TOWER_ORDER.length],
      ['heroes', t('Heroes'), HERO_ORDER.length],
      ['stars', t('Stars'), GLOOP_ORDER.length],
      ['bonds', t('Bonds'), SYNERGIES.length],
    ];
    const tabEls = tabs.map(([id, name, n]) => {
      const b = h('button', { class: 'tab', type: 'button', role: 'tab' }, name, h('span', { class: 'tab-n' }, String(n)));
      b.addEventListener('click', () => {
        if (b.classList.contains('on')) return;
        audio.play('click');
        select(id);
      });
      return b;
    });
    const lockedChip = (lvl: number) => chip(uiIcon('lock', '🔒'), t('Unlocks at level {n}', { n: lvl }), 'dark');
    let pageEl: HTMLElement | null = null;
    const select = (id: AtlasTab, restore = 0) => {
      tabEls.forEach((b, i) => {
        b.classList.toggle('on', tabs[i][0] === id);
        b.setAttribute('aria-selected', String(tabs[i][0] === id));
      });
      clear(grid);
      grid.dataset.tab = id;
      const cards: HTMLElement[] = [];
      // bandit and hero cards open the Bandit menu (skills, XP unlocks); its back button comes back
      // here, to the same tab and scroll position
      const toBandits = (o: BanditsOpts) => () => {
        audio.play('click');
        const at = pageEl?.querySelector<HTMLElement>('.page-body')?.scrollTop ?? 0;
        this.openBandits({ ...o, back: () => this.openCodex(id, at) });
      };
      const cta = (text: string, o: BanditsOpts) => {
        const b = btn(t('Bandits'), 'green', toBandits(o), { size: 'small', icon: uiIcon('mask', '🦝'), cls: 'glint' });
        return h('div', { class: 'atlas-cta well' }, uiIcon('mask', '🦝', 'cta-ico'), h('p', null, text), b);
      };
      if (id === 'bandits') {
        grid.append(cta(t('Every raccoon earns its own XP. Open the Bandit menu to see all upgrade tiers and unlock new ones.'), {}));
        // grouped by role, each group under its coloured header (one column per role on wide screens)
        for (const grp of roleGroups()) {
          const group = h('div', { class: `atlas-group ${roleCls(grp.role)}` }, h('div', { class: `atlas-sec role-head ${roleCls(grp.role)}` }, roleIcon(grp.role), h('span', null, roleName(grp.role)), h('span', { class: 'n' }, String(grp.ids.length))));
          grid.append(group);
          for (const tid of grp.ids) {
            const d = TOWERS[tid];
            const locked = !this.devUnlock && level < d.unlock;
            const card = h(
              'button',
              { class: `tile atlas-card role-tint ${roleCls(d.role)}` + (locked ? ' locked' : ''), type: 'button', onclick: toBandits({ towerId: tid }), 'aria-label': `${t(d.name)} · ${roleName(d.role)}` },
              h('div', { class: 'portrait role-disc' }, img(towerPortraitUrl(tid), '', t(d.name))),
              h(
                'div',
                { class: 'atlas-text' },
                h('div', { class: 'atlas-name' }, h('b', { class: 't-outline' }, t(d.name)), roleChip(d.role)),
                h('small', null, t(d.species)),
                h('p', null, softHyphens(t(d.desc))),
                locked ? h('div', { class: 'atlas-lock' }, lockedChip(d.unlock)) : null,
              ),
            );
            cards.push(card);
            group.append(card);
          }
        }
      } else if (id === 'heroes') {
        grid.append(cta(t('Heroes level up during a game. See every skill they learn, level by level.'), { heroId: HERO_ORDER[0] }));
        for (const hid of HERO_ORDER) {
          const d = HEROES[hid];
          const locked = !this.devUnlock && level < d.unlock;
          const looks = h('div', { class: 'hero-looks' }, ...[1, 7, 14].map((lv) => h('div', { class: 'look', title: t('Level {n}', { n: lv }) }, img(heroPortraitUrl(hid, lv)), h('span', null, t('Lv {n}', { n: lv })))));
          cards.push(
            h(
              'button',
              { class: 'tile atlas-card hero-tile role-tint role-hero' + (locked ? ' locked' : ''), type: 'button', onclick: toBandits({ heroId: hid }), 'aria-label': t(d.name) },
              h('div', { class: 'portrait role-disc' }, img(heroPortraitUrl(hid, 1), '', t(d.name))),
              h(
                'div',
                { class: 'atlas-text' },
                h('div', { class: 'atlas-name' }, h('b', { class: 't-outline' }, t(d.name)), roleChip('Hero')),
                h('small', null, t(d.title)),
                h('p', null, softHyphens(t(d.desc))),
                locked ? h('div', null, lockedChip(d.unlock)) : looks,
              ),
            ),
          );
        }
      } else if (id === 'stars') {
        for (const gid of GLOOP_ORDER) {
          const d = GLOOPS[gid];
          const chips = h('div', { class: 'atlas-chips' }, chip(uiIcon('fast', '💨'), `×${dec(d.speed, 0, 2)}`, 'dark'));
          if (d.hp > 1) chips.append(chip(uiIcon('heart', '❤️'), fmt(d.hp), 'dark'));
          if (d.boss) chips.append(chip(uiIcon('crown', '👑'), t('Boss'), 'red'));
          if (d.camo) chips.append(chip(uiIcon('camo', '👁'), t('Camo'), 'blue'));
          cards.push(h('div', { class: 'tile atlas-card' }, h('div', { class: 'portrait' }, img(starPortraitUrl(gid), '', t(d.name))), h('div', { class: 'atlas-text' }, h('div', { class: 'atlas-name' }, h('b', { class: 't-outline' }, t(d.name)), chips), h('p', null, softHyphens(t(d.desc))))));
        }
      } else {
        grid.append(h('div', { class: 'atlas-cta well' }, uiIcon('bond', '⚡', 'cta-ico'), h('p', null, t('Bonds: place these pairs close together and both get stronger'))));
        for (const syn of SYNERGIES) {
          cards.push(
            h(
              'div',
              { class: 'tile atlas-card', style: `--bc:${syn.color}` },
              h('div', { class: 'bond-pair' }, h('span', { class: `role-disc ${towerRoleCls(syn.a)}` }, img(towerPortraitUrl(syn.a))), h('span', { class: `role-disc ${towerRoleCls(syn.b)}` }, img(towerPortraitUrl(syn.b))), h('span', { class: 'zap' }, uiIcon('bond', '⚡'))),
              h(
                'div',
                { class: 'atlas-text' },
                fitText(h('b', { class: 't-outline', style: `color:${syn.color}` }, softHyphens(t(syn.name)))),
                h('div', { class: 'bond-line' }, h('b', null, t(TOWERS[syn.a].name) + ': '), softHyphens(t(syn.descA))),
                h('div', { class: 'bond-line' }, h('b', null, t(TOWERS[syn.b].name) + ': '), softHyphens(t(syn.descB))),
              ),
            ),
          );
        }
      }
      if (!cards[0]?.parentElement) grid.append(...cards);
      // coming back to a list the player was already reading: no card entrance, same position
      if (!restore) stagger(cards.slice(0, 16), 'anim-rise', 0, PAGE_STAGGER);
      const body = pageEl?.querySelector<HTMLElement>('.page-body');
      if (body) body.scrollTop = restore;
    };
    pageEl = this.openPage((close) => page({ title: t('Star Atlas'), icon: uiIcon('book', '📖'), accent: '#3fb2ff', cls: 'atlas', onBack: close, tabs: h('div', { class: 'tabs atlas-tabs', role: 'tablist' }, ...tabEls) }, [grid]));
    select(tab, scroll);
  }

}
