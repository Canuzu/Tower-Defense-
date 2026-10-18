import { Game, type SaveState, type ChallengeDef } from '../game/Game';
import { MAPS, type MapDef } from '../game/maps';
import { DIFFICULTIES, type Difficulty } from '../game/types';
import { HEROES, HERO_ORDER, type HeroId } from '../game/heroes';
import { TOWERS, TOWER_ORDER } from '../game/towers';
import { GLOOP_ORDER, GLOOPS } from '../game/gloops';
import { Path } from '../game/path';
import { Renderer } from '../render/Renderer';
import { makePresentation } from '../render/presentation';
import { mapThumbnail } from '../render/mapArt';
import { towerIcon, type ArtId } from '../render/towerArt';
import { audio } from '../audio/audio';
import { Hud } from './hud';
import { h, clear } from './dom';
import { setHaptics } from './haptics';
import { gloopIcon } from './icons';
import { loadProfile, saveProfile, loadGame, saveGame, clearGame, latestSave, levelFromXp, wisdomPoints, type Profile } from '../save/storage';
import { perksModal, achievementsModal, dailyModal } from './meta';
import { newlyUnlocked, bondCount } from '../game/achievements';
import { dailyFor, todayKey } from '../game/daily';
import type { TowerId } from '../game/towerTypes';
import { SYNERGIES } from '../game/synergy';
import { t, setLang, type LangSetting } from '../i18n';

type Scene = 'menu' | 'maps' | 'setup' | 'game';

const MAP_LEVEL: Record<string, number> = { meadow: 1, caverns: 2, fjord: 3, forge: 4, candy: 5, rivers: 6 };
const TIER_COLOR: Record<string, string> = { Beginner: '#5ddc6a', Intermediate: '#ffd23c', Advanced: '#ff9f43', Expert: '#ff4d6d' };

export class App {
  private renderer: Renderer;
  private profile: Profile;
  private game: Game | null = null;
  private demo: Game | null = null;
  private hud: Hud | null = null;
  private scene: Scene = 'menu';
  private screen: HTMLElement;
  private last = performance.now();
  private devUnlock = new URLSearchParams(location.search).has('dev') || location.hash === '#dev';
  private thumbs = new Map<string, string>();
  private setupDiff: Difficulty = 'easy';
  private xpGainedThisGame = 0;

  constructor(private root: HTMLElement) {
    this.profile = loadProfile();
    setLang(this.profile.settings.lang ?? 'auto');
    const canvas = h('canvas', { id: 'game' });
    root.append(canvas);
    this.renderer = new Renderer(canvas);
    this.screen = h('div', { class: 'layer' });
    root.append(this.screen);
    root.append(h('div', { class: 'rotate' }, h('div', null, h('div', { class: 'phone' }, '📱'), h('p', null, t('Rotate your device to landscape to play')))));
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
    this.resize();
    this.showMenu();
    requestAnimationFrame(this.frame);
  }

  get level() {
    return levelFromXp(this.profile.xp).level;
  }

  /** Android back button / Escape-like navigation. */
  back() {
    const modal = this.root.querySelector('.modal-wrap');
    if (this.scene === 'game' && this.hud) {
      if (this.hud.isModalOpen) this.hud.closeModal();
      else this.hud.openPause();
      return;
    }
    if (modal) {
      modal.remove();
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
    } else if (this.demo) {
      this.runDemo(dt);
    }
    this.renderer.render(this.game?.paused ? 0 : dt);
    requestAnimationFrame(this.frame);
  };

  // -------------------------------------------------------------------------------------------
  // Attract-mode demo behind the menus
  // -------------------------------------------------------------------------------------------

  private startDemo() {
    const g = new Game({ mapId: 'meadow', difficulty: 'sandbox', heroId: 'nova' });
    g.fx = makePresentation(this.renderer);
    // quiet presentation for the demo: no sounds
    const fx = g.fx;
    g.fx = { ...fx, sound: () => {}, shake: () => {}, pop: (e) => this.renderer.splat(e.x, e.y, e.def.color, e.radius, !!e.def.boss), fire: () => {}, beam: (k, p, c, w) => this.renderer.addBeam(k, p, c, w), explosion: (x, y, r, v) => this.renderer.explosion(x, y, r, v), leak: () => {}, bossDeath: (e) => this.renderer.confetti(e.x, e.y, 30), place: () => {}, upgrade: () => {}, ability: () => {} };
    const spots: [string, number, number, number[]][] = [
      ['spike', 560, 215, [2, 0, 3]],
      ['frost', 600, 600, [2, 0, 3]],
      ['boomer', 905, 600, [3, 0, 2]],
      ['ember', 310, 560, [0, 2, 3]],
      ['zap', 1250, 600, [3, 2, 0]],
      ['hoot', 1520, 560, [2, 0, 3]],
      ['buzz', 1180, 170, [3, 0, 2]],
      ['spike', 1540, 300, [0, 4, 0]],
    ];
    for (const [id, x, y, tiers] of spots) {
      const t = g.placeTower(id as TowerId, x, y);
      if (!t) continue;
      for (let p = 0; p < 3; p++) for (let k = 0; k < tiers[p]; k++) g.upgrade(t, p);
    }
    g.placeHero('nova', 900, 400);
    this.demo = g;
    this.renderer.setGame(g);
    this.demoT = 0;
  }

  private demoT = 0;
  private runDemo(dt: number) {
    const g = this.demo!;
    this.demoT -= dt;
    if (this.demoT <= 0) {
      this.demoT = 0.35 + Math.random() * 0.4;
      const pool = ['red', 'blue', 'green', 'yellow', 'pink', 'black', 'white', 'purple', 'zebra', 'rainbow', 'ceramic'] as const;
      const t = pool[Math.floor(Math.random() * pool.length)];
      if (g.enemies.length < 70) g.spawn(t, { dist: 0 });
      if (Math.random() < 0.015) g.spawn('moab', { dist: 1 });
    }
    g.update(dt);
  }

  // -------------------------------------------------------------------------------------------
  // Scenes
  // -------------------------------------------------------------------------------------------

  private setScreen(el: HTMLElement) {
    clear(this.screen);
    this.screen.append(el);
  }

  private endGame() {
    this.hud?.destroy();
    this.hud = null;
    this.game = null;
  }

  showMenu() {
    this.endGame();
    this.scene = 'menu';
    if (!this.demo) this.startDemo();
    else this.renderer.setGame(this.demo);
    this.resize();
    audio.music?.start('menu');
    const lv = levelFromXp(this.profile.xp);
    const save = latestSave();
    const word = (text: string, colors: string[], small = false) =>
      h('div', { class: 'word' + (small ? ' small' : '') }, ...text.split('').map((ch, i) => h('span', { class: 'l', style: `color:${colors[i % colors.length]};animation-delay:${i * 0.09}s` }, ch)));
    const logo = h('div', { class: 'logo' }, word('GLOOP', ['#ff4d6d', '#ffd23c', '#5ddc6a', '#4cc9ff', '#c77dff']), word('GUARDIANS', ['#ffffff'], true));
    const buttons = h('div', { class: 'menu-buttons' });
    if (save) {
      const m = MAPS.find((x) => x.id === save.mapId);
      buttons.append(h('button', { class: 'btn blue', onclick: () => this.resume(save) }, t('↺ Continue'), h('small', { style: 'font-size:0.6em;opacity:0.85' }, ` ${t(m?.name ?? '')} · R${save.round}`)));
    }
    buttons.append(h('button', { class: 'btn green big', onclick: () => this.showMaps() }, t('▶ PLAY')));
    buttons.append(h('button', { class: 'btn gold', onclick: () => this.openCodex() }, t('📖 Gloopedia')));
    const s = h(
      'div',
      { class: 'screen dim' },
      h(
        'div',
        { class: 'profile' },
        h('div', { class: 'lvl' }, String(lv.level)),
        h('div', null, h('div', { style: 'font-weight:800;font-size:15px;text-shadow:0 2px 0 #2a1b2e' }, t('Player level {n}', { n: lv.level })), h('div', { class: 'xpbar' }, h('div', { style: `width:${Math.round((lv.into / lv.need) * 100)}%` }))),
      ),
      h('div', { class: 'corner-right' }, h('button', { class: 'btn icon dark', title: t('Settings'), onclick: () => this.openSettings() }, '⚙️')),
      this.sideMenu(),
      logo,
      h('div', { class: 'tagline' }, t('Pop the gloop. Save the valley.')),
      buttons,
    );
    this.setScreen(s);
  }

  private thumb(m: MapDef) {
    let t = this.thumbs.get(m.id);
    if (!t) {
      t = mapThumbnail(m, m.paths.map((p) => new Path(p)), 420);
      this.thumbs.set(m.id, t);
    }
    return t;
  }

  private mapUnlocked(m: MapDef) {
    return this.devUnlock || this.level >= (MAP_LEVEL[m.id] ?? 1);
  }

  showMaps() {
    this.scene = 'maps';
    audio.play('click');
    const grid = h('div', { class: 'maps' });
    for (const m of MAPS) {
      const unlocked = this.mapUnlocked(m);
      const medals = h('div', { class: 'medals' });
      for (const d of ['easy', 'medium', 'hard', 'champion'] as Difficulty[]) {
        const got = this.profile.medals[m.id]?.[d];
        medals.append(h('div', { class: 'medal', title: t(DIFFICULTIES[d].name), style: got ? `background:${DIFFICULTIES[d].color}` : '' }, got ? '★' : ''));
      }
      const card = h(
        'button',
        { class: 'mapcard' + (unlocked ? '' : ' locked') },
        h('img', { src: this.thumb(m), alt: m.name }),
        h('div', { class: 'mc-tier', style: `background:${TIER_COLOR[m.tier]}` }, t(m.tier)),
        h('div', { class: 'mc-body' }, h('div', { class: 'mc-name' }, t(m.name)), medals),
        unlocked ? null : h('div', { class: 'lock' }, t('🔒 Reach player level {n}', { n: MAP_LEVEL[m.id] })),
      );
      card.addEventListener('click', () => {
        if (!unlocked) {
          audio.play('error');
          return;
        }
        this.showSetup(m);
      });
      grid.append(card);
    }
    const s = h(
      'div',
      { class: 'screen dim' },
      h('div', { class: 'header' }, h('button', { class: 'btn icon dark', onclick: () => this.showMenu() }, '←'), h('h1', null, t('Choose a map'))),
      grid,
    );
    this.setScreen(s);
  }

  private lastSetupMap: MapDef = MAPS[0];
  showSetup(m: MapDef) {
    this.scene = 'setup';
    this.lastSetupMap = m;
    audio.play('click');
    const diffs = h('div', { class: 'diffs' });
    const heroEl = h('div', { class: 'heroes' });
    const startRow = h('div', { class: 'startrow' });
    const render = () => {
      clear(diffs);
      for (const d of ['easy', 'medium', 'hard', 'champion', 'sandbox'] as Difficulty[]) {
        const def = DIFFICULTIES[d];
        const got = this.profile.medals[m.id]?.[d];
        const b = h('button', { class: 'diff' + (this.setupDiff === d ? ' sel' : ''), style: `background:linear-gradient(180deg, ${def.color}, ${def.color}aa)` }, h('b', { style: 'color:#1c1230' }, t(def.name) + (got ? ' ★' : '')), h('span', { style: 'color:#1c1230' }, t(def.desc)));
        b.addEventListener('click', () => {
          this.setupDiff = d;
          audio.play('click');
          render();
        });
        diffs.append(b);
      }
      clear(heroEl);
      for (const id of HERO_ORDER) {
        const def = HEROES[id];
        const locked = !this.devUnlock && this.level < def.unlock;
        const c = h(
          'button',
          { class: 'herocard' + (this.profile.heroId === id ? ' sel' : '') + (locked ? ' locked' : '') },
          h('img', { src: towerIcon(id as ArtId, [1], 140), alt: def.name }),
          h('b', null, def.name),
          h('span', null, locked ? t('🔒 Player level {n}', { n: def.unlock }) : t(def.desc)),
        );
        c.addEventListener('click', () => {
          if (locked) {
            audio.play('error');
            return;
          }
          this.profile.heroId = id;
          saveProfile(this.profile);
          audio.play('click');
          render();
        });
        heroEl.append(c);
      }
      clear(startRow);
      const existing = loadGame(m.id, this.setupDiff);
      if (existing && this.setupDiff !== 'sandbox') startRow.append(h('button', { class: 'btn blue', onclick: () => this.resume(existing) }, t('↺ Continue round {n}', { n: existing.round })));
      startRow.append(h('button', { class: 'btn green', style: 'min-width:200px', onclick: () => this.startGame(m.id, this.setupDiff, this.profile.heroId) }, t(existing ? 'New game' : '▶ Start')));
    };
    render();
    const s = h(
      'div',
      { class: 'screen dim' },
      h('div', { class: 'header' }, h('button', { class: 'btn icon dark', onclick: () => this.showMaps() }, '←'), h('h1', null, t(m.name))),
      h(
        'div',
        { class: 'setup' },
        h(
          'div',
          { class: 'panel' },
          h('img', { src: this.thumb(m), alt: '', style: 'width:100%;border-radius:14px;border:3px solid #2a1b2e;display:block' }),
          h('p', { style: 'margin:8px 2px 0;font-weight:600;color:#e6defa' }, t(m.desc)),
        ),
        h('div', null, h('div', { class: 'panel' }, h('h3', null, t('Difficulty')), diffs), h('div', { class: 'panel', style: 'margin-top:12px' }, h('h3', null, t('Hero')), heroEl), startRow),
      ),
    );
    this.setScreen(s);
  }

  // -------------------------------------------------------------------------------------------
  // Game
  // -------------------------------------------------------------------------------------------

  startGame(mapId: string, diff: Difficulty, heroId: HeroId | null, challenge?: ChallengeDef) {
    if (!challenge) clearGame(mapId, diff);
    // daily challenges are the same for everyone, so permanent perks are switched off there
    const perks = diff === 'sandbox' || challenge ? [] : [...this.profile.perks];
    const g = new Game({ mapId, difficulty: diff, heroId: challenge?.noHero ? null : heroId, perks, challenge });
    this.enterGame(g);
  }

  private startDaily() {
    const d = dailyFor(todayKey());
    this.startGame(d.mapId, d.difficulty, this.profile.heroId, d.challenge);
  }

  private sideMenu(): HTMLElement {
    const pts = wisdomPoints(this.profile);
    const unseen = newlyUnlocked(this.profile, null).length;
    const dailyDone = !!this.profile.dailyDone[todayKey()];
    const btn = (label: string, cls: string, badge: string | null, fn: () => void) => {
      const b = h('button', { class: 'btn small ' + cls }, label, badge ? h('span', { class: 'badge' }, badge) : null);
      b.addEventListener('click', () => {
        audio.play('click');
        fn();
      });
      return b;
    };
    return h(
      'div',
      { class: 'side-menu' },
      btn(t('📅 Daily'), 'blue', dailyDone ? null : '!', () => this.openDaily()),
      btn(t('🧠 Wisdom'), 'gold', pts > 0 ? String(pts) : null, () => this.openPerks()),
      btn(t('🏅 Achievements'), 'dark', unseen > 0 ? String(unseen) : null, () => this.openAchievements()),
    );
  }

  private openPerks() {
    const host = this.modalHost();
    host.open(perksModal(this.profile, () => {
      host.close();
      if (this.scene === 'menu') this.showMenu();
    }, () => {}));
  }

  private openAchievements() {
    this.claimAchievements(null);
    const host = this.modalHost();
    host.open(achievementsModal(this.profile, this.game, () => {
      host.close();
      if (this.scene === 'menu') this.showMenu();
    }));
  }

  private openDaily() {
    const host = this.modalHost();
    host.open(dailyModal(this.profile, (id) => this.thumb(MAPS.find((m) => m.id === id)!), () => {
      host.close();
      this.startDaily();
    }, () => host.close()));
  }

  /** Records unlocked achievements, grants their XP and announces them. */
  private claimAchievements(g: Game | null) {
    const fresh = newlyUnlocked(this.profile, g);
    if (!fresh.length) return;
    for (const a of fresh) {
      this.profile.achievements[a.id] = Date.now();
      this.addXp(a.xp);
      this.hud?.toast(t('🏅 Achievement unlocked: {name} (+{xp} XP)', { name: t(a.name), xp: a.xp }), 3200);
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

  resume(s: SaveState) {
    let g: Game;
    try {
      g = Game.restore(s);
    } catch {
      clearGame(s.mapId, s.difficulty);
      this.showMenu();
      return;
    }
    this.enterGame(g);
  }

  private enterGame(g: Game) {
    audio.unlock();
    this.endGame();
    this.game = g;
    this.xpGainedThisGame = 0;
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
    clear(this.screen);
    this.renderer.setGame(g);
    this.profile.stats.games++;
    saveProfile(this.profile);
    const tutorial = !this.profile.tutorialDone && g.config.difficulty !== 'sandbox' && !g.config.challenge && g.round === g.diff.startRound && g.towers.length === 0;
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
          if (g.roundSnapshot) this.resume(g.roundSnapshot);
        },
        onSettings: () => this.openSettings(),
        onRoundEnd: (round) => this.onRoundEnd(g, round),
        onVictory: () => this.onVictory(g),
        onDefeat: () => this.onDefeat(g),
        onTutorialDone: () => {
          this.profile.tutorialDone = true;
          saveProfile(this.profile);
        },
      },
      this.root,
    );
    this.hud.showFps = this.profile.settings.showFps;
    this.resize();
    // after the sidebar has laid out
    requestAnimationFrame(() => this.resize());
    audio.music?.start('game');
  }

  private onRoundEnd(g: Game, round: number) {
    if (g.sandbox) return;
    const xp = Math.round((20 + round * 2) * g.diff.xpMul);
    this.addXp(xp);
    this.profile.stats.bestRound = Math.max(this.profile.stats.bestRound, round);
    if ((!g.won || g.freeplay) && !g.config.challenge) saveGame(g.serialize());
    this.trackStats(g);
    saveProfile(this.profile);
  }

  private addXp(xp: number) {
    const before = this.level;
    this.profile.xp += xp;
    this.xpGainedThisGame += xp;
    const after = this.level;
    if (after > before && this.hud) {
      const unlocked = [
        ...TOWER_ORDER.filter((id) => TOWERS[id].unlock > before && TOWERS[id].unlock <= after).map((id) => TOWERS[id].name),
        ...HERO_ORDER.filter((id) => HEROES[id].unlock > before && HEROES[id].unlock <= after).map((id) => HEROES[id].name),
      ];
      this.hud.banner(t('LEVEL {n}!', { n: after }), unlocked.length ? t('Unlocked: {list}', { list: unlocked.join(', ') }) : t('Player level up'), false);
      audio.play('levelup');
      this.hud.setPlayerLevel(after);
    }
  }

  private onVictory(g: Game) {
    const p = this.profile;
    this.trackStats(g);
    let first = false;
    if (g.config.challenge) {
      const key = todayKey();
      if (!p.dailyDone[key] && g.config.challenge.id === 'daily-' + key) {
        p.dailyDone[key] = true;
        p.stats.dailies = (p.stats.dailies ?? 0) + 1;
        this.addXp(500);
        first = true;
      }
    } else {
      if (!p.medals[g.map.id]) p.medals[g.map.id] = {};
      first = !p.medals[g.map.id][g.config.difficulty];
      p.medals[g.map.id][g.config.difficulty] = true;
      if (first) this.addXp(Math.round(300 * g.diff.xpMul));
    }
    p.stats.wins++;
    if (g.stats.leaked === 0) p.stats.flawless = (p.stats.flawless ?? 0) + 1;
    this.claimAchievements(g);
    saveProfile(p);
    clearGame(g.map.id, g.config.difficulty);
    const hud = this.hud!;
    hud.openModal(
      h(
        'div',
        { class: 'modal' },
        h('div', { style: 'font-size:64px;line-height:1' }, '🏆'),
        h('h2', null, t('VICTORY!')),
        h('p', null, g.config.challenge ? t('Daily challenge complete!') + (first ? ' +500 XP' : '') : t('{map} on {diff}', { map: t(g.map.name), diff: t(g.diff.name) }) + (first ? t(' · New medal!') : '')),
        this.statsGrid(g),
        h(
          'div',
          { class: 'row' },
          h(
            'button',
            {
              class: 'btn gold',
              onclick: () => {
                g.continueFreeplay();
                hud.closeModal();
                hud.toast(t('Freeplay! Rounds keep getting harder…'), 3000);
              },
            },
            t('∞ Freeplay'),
          ),
          h('button', { class: 'btn green', onclick: () => this.showMaps() }, t('🗺 Maps')),
          h('button', { class: 'btn dark', onclick: () => this.showMenu() }, t('🏠 Home')),
        ),
      ),
    );
    this.renderer.confetti(800, 300, 120);
  }

  private onDefeat(g: Game) {
    const p = this.profile;
    this.trackStats(g);
    saveProfile(p);
    clearGame(g.map.id, g.config.difficulty);
    const hud = this.hud!;
    setTimeout(() => {
      hud.openModal(
        h(
          'div',
          { class: 'modal' },
          h('div', { style: 'font-size:64px;line-height:1' }, '💔'),
          h('h2', null, t('GAME OVER')),
          h('p', null, t('The gloops broke through on round {n}.', { n: g.round })),
          this.statsGrid(g),
          h(
            'div',
            { class: 'row' },
            g.roundSnapshot ? h('button', { class: 'btn gold', onclick: () => this.resume(g.roundSnapshot!) }, t('↺ Retry round {n}', { n: g.roundSnapshot.round })) : null,
            h('button', { class: 'btn green', onclick: () => this.startGame(g.config.mapId, g.config.difficulty, g.config.heroId, g.config.challenge) }, t('↻ Restart')),
            h('button', { class: 'btn dark', onclick: () => this.showMenu() }, t('🏠 Home')),
          ),
        ),
      );
    }, 900);
  }

  private statsGrid(g: Game) {
    const s = g.stats;
    return h(
      'div',
      { class: 'stats' },
      h('span', null, t('Gloops popped')),
      h('span', null, s.pops.toLocaleString('en-US')),
      h('span', null, t('Bosses popped')),
      h('span', null, String(s.bossesPopped)),
      h('span', null, t('Best combo')),
      h('span', null, `${s.bestCombo}x`),
      h('span', null, t('Cash earned')),
      h('span', null, '$' + Math.floor(s.cashEarned).toLocaleString('en-US')),
      h('span', null, t('Golden gloops')),
      h('span', null, String(s.goldenPopped ?? 0)),
      h('span', null, t('XP earned')),
      h('span', null, '+' + this.xpGainedThisGame),
    );
  }

  // -------------------------------------------------------------------------------------------
  // Settings & codex
  // -------------------------------------------------------------------------------------------

  private modalHost(): { open: (el: HTMLElement) => void; close: () => void } {
    if (this.hud) {
      const hud = this.hud;
      return { open: (el) => hud.openModal(el), close: () => hud.closeModal() };
    }
    return {
      open: (el) => {
        const wrap = h('div', { class: 'modal-wrap' }, el);
        this.screen.append(wrap);
      },
      close: () => this.screen.querySelector('.modal-wrap')?.remove(),
    };
  }

  openSettings() {
    const host = this.modalHost();
    const s = this.profile.settings;
    const save = () => {
      saveProfile(this.profile);
      this.applySettings();
    };
    const slider = (label: string, v: number, on: (x: number) => void) => {
      const inp = h('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(v) }) as HTMLInputElement;
      inp.addEventListener('input', () => {
        on(+inp.value);
        save();
      });
      inp.addEventListener('change', () => audio.play('pop', 0.8));
      return h('div', { class: 'setting' }, label, inp);
    };
    const sw = (label: string, v: boolean, on: (x: boolean) => void) => {
      const t = h('div', { class: 'toggle' + (v ? ' on' : '') });
      const b = h('button', { class: 'setting', style: 'width:100%' }, label, t);
      b.addEventListener('click', () => {
        const nv = !t.classList.contains('on');
        t.classList.toggle('on', nv);
        on(nv);
        save();
        audio.play('click');
      });
      return b;
    };
    const langRow = h('div', { class: 'setting' }, t('🌐 Language'));
    const langBtns = h('div', { style: 'display:flex;gap:6px' });
    for (const [code, label] of [['auto', t('Auto')], ['en', 'English'], ['de', 'Deutsch']] as [LangSetting, string][]) {
      const b = h('button', { class: 'btn small ' + ((s.lang ?? 'auto') === code ? 'gold' : 'dark') }, label);
      b.addEventListener('click', () => {
        s.lang = code;
        save();
        host.close();
        if (this.scene === 'game') this.hud?.openPause();
        else if (this.scene === 'menu') this.showMenu();
        else if (this.scene === 'maps') this.showMaps();
        else if (this.scene === 'setup') this.showSetup(this.lastSetupMap);
        this.openSettings();
      });
      langBtns.append(b);
    }
    langRow.append(langBtns);
    const m = h(
      'div',
      { class: 'modal' },
      h('h2', null, t('Settings')),
      slider(t('🔊 Sound effects'), s.sfx, (x) => (s.sfx = x)),
      slider(t('🎵 Music'), s.music, (x) => (s.music = x)),
      sw(t('📳 Haptics'), s.haptics, (x) => (s.haptics = x)),
      sw(t('✨ Reduced effects (better battery)'), s.reducedEffects, (x) => (s.reducedEffects = x)),
      sw(t('⏩ Auto-start rounds by default'), s.autoStart, (x) => (s.autoStart = x)),
      sw(t('📈 Show FPS'), s.showFps, (x) => (s.showFps = x)),
      langRow,
      h(
        'div',
        { class: 'row' },
        h(
          'button',
          {
            class: 'btn green',
            onclick: () => {
              host.close();
              if (this.hud) this.hud.openPause();
            },
          },
          t('Done'),
        ),
      ),
      h('p', { style: 'font-size:12px;margin-top:14px' }, t('Gloop Guardians v0.1 · Made with ❤️')),
    );
    host.open(m);
  }

  openCodex() {
    const host = this.modalHost();
    const towers = h('div', { class: 'codex' });
    for (const id of TOWER_ORDER) {
      const d = TOWERS[id];
      towers.append(h('div', { class: 'entry' }, h('img', { src: towerIcon(id as ArtId, [0, 0, 0], 96), alt: '' }), h('div', null, h('b', null, `${d.name} · ${t(d.species)}`), h('span', null, t(d.desc)))));
    }
    for (const id of HERO_ORDER) {
      const d = HEROES[id];
      towers.append(h('div', { class: 'entry' }, h('img', { src: towerIcon(id as ArtId, [1], 96), alt: '' }), h('div', null, h('b', null, `${d.name} ${t(d.title)}`), h('span', null, t(d.desc)))));
    }
    const gloops = h('div', { class: 'codex' });
    for (const id of GLOOP_ORDER) {
      const d = GLOOPS[id];
      gloops.append(h('div', { class: 'entry' }, h('img', { src: gloopIcon(id, 96), alt: '' }), h('div', null, h('b', null, t(d.name)), h('span', null, t(d.desc)))));
    }
    const bonds = h('div', { class: 'codex' });
    for (const syn of SYNERGIES) {
      bonds.append(
        h(
          'div',
          { class: 'entry', style: `border:2px solid ${syn.color}` },
          h('img', { src: towerIcon(syn.a as ArtId, [0, 0, 0], 64), alt: '', style: 'width:36px;height:36px' }),
          h('img', { src: towerIcon(syn.b as ArtId, [0, 0, 0], 64), alt: '', style: 'width:36px;height:36px;margin-left:-14px' }),
          h('div', null, h('b', { style: `color:${syn.color}` }, '⚡ ' + t(syn.name)), h('span', null, `${TOWERS[syn.a].name}: ${t(syn.descA)} · ${TOWERS[syn.b].name}: ${t(syn.descB)}`)),
        ),
      );
    }
    const m = h(
      'div',
      { class: 'modal', style: 'width:min(900px,94vw)' },
      h('h2', null, 'Gloopedia'),
      h('p', null, t('Critters')),
      towers,
      h('p', { style: 'margin-top:14px' }, t('⚡ Bonds: place these pairs close together and both get stronger')),
      bonds,
      h('p', { style: 'margin-top:14px' }, t('Gloops')),
      gloops,
      h('div', { class: 'row' }, h('button', { class: 'btn green', onclick: () => host.close() }, t('Close'))),
    );
    host.open(m);
  }
}
