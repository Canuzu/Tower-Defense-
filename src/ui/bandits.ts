/**
 * Bandit menu: every raccoon with its bandit level, XP and the 3x5 upgrade tiers that XP unlocks
 * (src/game/progression.ts), plus the two heroes with their looks and level-by-level skills.
 * Styled in screens.css (`bd-*`); the result screens use banditXpStrip() from here as well.
 */
import { TOWERS, TOWER_ORDER } from '../game/towers';
import { HEROES, HERO_ORDER, MAX_HERO_LEVEL, type HeroId } from '../game/heroes';
import type { AbilityDef, TowerId, TowerStats } from '../game/towerTypes';
import { unlocksOf, xpOf, canUnlock, unlockNext, banditLevel, levelXp, TIER_XP, type ProgressState } from '../game/progression';
import { saveProfile, type Profile } from '../save/storage';
import { towerIconUrl, abilityIconUrl } from '../render/art';
import { audio } from '../audio/audio';
import { haptic } from './haptics';
import { h, clear } from './dom';
import { t } from '../i18n';
import { uiIcon, img, btn, modal, bar, chip, stagger, countUp, bump, fmt, towerPortraitUrl, heroPortraitUrl, watchScroll, confetti } from './kit';

export type BanditSel = { kind: 'tower'; id: TowerId } | { kind: 'hero'; id: HeroId };

export interface BanditsOpts {
  towerId?: TowerId;
  heroId?: HeroId;
}

export interface BanditsCtx {
  profile: Profile;
  playerLevel: number;
  devUnlock: boolean;
  /** called after a tier was unlocked and the profile saved (raises the live game's limits) */
  onUnlock?: (id: TowerId, path: number, tier: number) => void;
  close: () => void;
}

/** Path colours (same hues as the in-game upgrade panel), with light / dark shades for the emblems. */
const PATH_TONE = [
  { c: '#ff8a3c', l: '#ffc497', d: '#9b4716' },
  { c: '#3fb2ff', l: '#a6dcff', d: '#155c9c' },
  { c: '#5bdc5a', l: '#b2f0a8', d: '#24792a' },
];
const ROLE_CHIP: Record<string, string> = { Primary: 'green', Military: 'red', Magic: 'blue', Support: 'gold' };
const CHEVRONS = ['M6 15.5 12 9.5l6 6', 'M6 11.5 12 5.5l6 6M6 18.5l6-6 6 6'];
const MAX_BANDIT_LEVEL = 20;

/** Outlined stroke glyph drawn like the painted icons (24x24 path). */
function glyph(d: string, w = 6, fill = '#fff6d6', cls = 'ico svg-ico'): HTMLElement {
  return h('span', {
    class: cls,
    'aria-hidden': 'true',
    html: `<svg viewBox="0 0 24 24" width="100%" height="100%"><path d="${d}" fill="none" stroke="#120a2b" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${fill}" stroke-width="${(w * 0.46).toFixed(1)}" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  });
}

const G_DMG = 'M5 19 17 7M14 4h6v6M7 15l2 2';
const G_PIERCE = 'M4 12h13M13 6l6 6-6 6';
const G_RATE = 'M12 7v5l3 2M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17';
const G_RANGE = 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17M12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5';
const G_DRONE = 'M4 7h6M14 7h6M7 7v4h10V7M10 11v3h4v-3M9 17.5h6';
const G_UP = 'M6 14.5 12 8.5l6 6';

// ------------------------------------------------------------------------------------------- data

export function isTowerLevelLocked(id: TowerId, playerLevel: number, dev: boolean) {
  return !dev && playerLevel < TOWERS[id].unlock;
}

export function canUnlockAny(p: ProgressState, id: TowerId): boolean {
  return canUnlock(p, id, 0) || canUnlock(p, id, 1) || canUnlock(p, id, 2);
}

/** Raccoon types that can unlock a tier right now (main menu badge, result screen hint). */
export function unlockableTypes(p: ProgressState): TowerId[] {
  return TOWER_ORDER.filter((id) => canUnlockAny(p, id));
}

/** Bandit level + progress towards the next one, from lifetime XP. */
export function banditProgress(totalXp: number) {
  const level = banditLevel(totalXp);
  if (level >= MAX_BANDIT_LEVEL) return { level, into: 0, need: 0, frac: 1 };
  const a = levelXp(level);
  const b = levelXp(level + 1);
  return { level, into: Math.max(0, totalXp - a), need: b - a, frac: Math.max(0, Math.min(1, (totalXp - a) / (b - a))) };
}

/** Look of the highest unlocked tier (tier 3+ changes the painting). */
function lookTiers(u: readonly number[]): number[] {
  let best = 0;
  let path = -1;
  u.forEach((v, i) => {
    if (v > best) {
      best = v;
      path = i;
    }
  });
  const out = [0, 0, 0];
  if (best >= 3) out[path] = best;
  return out;
}

const tiersAt = (path: number, tier: number) => [0, 1, 2].map((i) => (i === path ? tier : 0));

interface TierInfo {
  name: string;
  desc: string;
  cost: number;
  ability: AbilityDef | null;
}

const tierCache = new Map<TowerId, TierInfo[][]>();

/** Name/desc/price of every tier, and the ability a tier grants (found by applying the path in order). */
function tierInfo(id: TowerId): TierInfo[][] {
  let out = tierCache.get(id);
  if (out) return out;
  const def = TOWERS[id];
  out = def.paths.map((ups) => {
    const s = def.base();
    return ups.map((u) => {
      const before = new Set(s.abilities.map((a) => a.id));
      try {
        u.apply(s);
      } catch {
        /* an upgrade that needs another path: no ability info */
      }
      return { name: u.name, desc: u.desc, cost: u.cost, ability: s.abilities.find((a) => !before.has(a.id)) ?? null };
    });
  });
  tierCache.set(id, out);
  return out;
}

/** Hero ability unlocked when reaching each level (index = level). */
function heroAbilities(id: HeroId): (AbilityDef | null)[] {
  const def = HEROES[id];
  const s = def.base();
  const out: (AbilityDef | null)[] = [null, null];
  for (let lv = 2; lv <= MAX_HERO_LEVEL; lv++) {
    const before = new Set(s.abilities.map((a) => a.id));
    try {
      def.levels[lv - 2].apply(s);
    } catch {
      /* ignore */
    }
    out[lv] = s.abilities.find((a) => !before.has(a.id)) ?? null;
  }
  return out;
}

/** Key base stats as small chips. */
function statChips(s: TowerStats, cost: number): HTMLElement[] {
  const out: HTMLElement[] = [];
  const add = (icon: HTMLElement, value: string, title: string, cls = '') => out.push(h('span', { class: ('bd-stat ' + cls).trim(), title }, icon, h('span', null, value)));
  add(uiIcon('coin', '🪙'), '$' + fmt(cost), t('Price'), 'cost');
  add(glyph(G_RANGE, 5, '#ffe6a6'), fmt(s.range), t('Range'));
  const a = s.attacks[0];
  if (a) {
    let dmg = 0;
    let pierce = 0;
    let rate = a.rate;
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
      rate = 0;
      add(glyph(G_DRONE, 5, '#d8f0ff'), String(a.count), t('Drones'));
    } else rate = 0;
    if (dmg > 0) add(glyph(G_DMG, 5.5, '#ffd0d0'), String(dmg), t('Damage'));
    if (pierce > 0) add(glyph(G_PIERCE, 5.5, '#cfe8ff'), String(pierce), t('Pierce'));
    if (rate > 0) add(glyph(G_RATE, 4.5, '#e0ffd0'), `${(1 / rate).toFixed(rate < 1 ? 1 : 2)}/s`, t('Attacks per second'));
  }
  if (s.income) add(uiIcon('sack', '💰'), t('${n}/round', { n: fmt(s.income.perDrop * s.income.drops + s.income.bonusPerRound) }), t('Income'));
  if (s.buffAura && !a) add(uiIcon('bond', '⚡'), t('Aura'), t('Buffs nearby towers'));
  if (s.camo) add(uiIcon('camo', '👁'), t('Camo'), t('Camo detection'));
  return out;
}

/** Painted ability icon (generic ability art as fallback, the ability's emoji when sprites are missing). */
function abilityIcon(ab: AbilityDef, cls = ''): HTMLElement {
  const url = abilityIconUrl(ab.id);
  return url ? img(url, cls, t(ab.name)) : h('span', { class: ('emoji ' + cls).trim(), 'aria-hidden': 'true' }, ab.icon);
}

function upBadge(cls = 'bd-up'): HTMLElement {
  return h('span', { class: cls, title: t('New tier unlockable!') }, glyph(G_UP, 6.5, '#ffffff', 'svg-ico'));
}

// ------------------------------------------------------------------------------------------- modal

export function banditsModal(ctx: BanditsCtx, opts: BanditsOpts = {}): HTMLElement {
  const p = ctx.profile;
  const towerLocked = (id: TowerId) => isTowerLevelLocked(id, ctx.playerLevel, ctx.devUnlock);
  const heroLocked = (id: HeroId) => !ctx.devUnlock && ctx.playerLevel < HEROES[id].unlock;
  let sel: BanditSel = opts.heroId ? { kind: 'hero', id: opts.heroId } : { kind: 'tower', id: opts.towerId ?? TOWER_ORDER.find((id) => canUnlockAny(p, id)) ?? TOWER_ORDER[0] };
  /** path shown on phones (tabs instead of three columns), per raccoon */
  const pathSel = new Map<TowerId, number>();
  /** hero look shown in the big portrait */
  let heroLook = 1;

  const roster = h('div', { class: 'bd-roster', role: 'listbox', 'aria-label': t('Bandits') });
  const detail = h('div', { class: 'bd-detail' });
  const root = h('div', { class: 'bd' }, roster, detail);
  // layout follows the space the modal really has (notches and safe areas eat into phone widths):
  // narrow = portrait-only roster, cols = the three paths side by side instead of path tabs
  const fit = () => {
    const w = root.clientWidth;
    if (!w) return;
    root.classList.toggle('narrow', w < 720);
    root.classList.toggle('cols', w >= 900 && root.clientHeight >= 470);
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(root);
  else requestAnimationFrame(fit);
  watchScroll(roster);
  watchScroll(detail);
  const rescroll = (el: HTMLElement) => el.dispatchEvent(new Event('scroll'));

  // ---------------------------------------------------------------- roster
  const rosterItems = new Map<string, HTMLElement>();
  const renderRoster = (first: boolean) => {
    const keep = roster.scrollTop;
    clear(roster);
    rosterItems.clear();
    const items: HTMLElement[] = [];
    roster.append(h('div', { class: 'bd-sec' }, h('span', { class: 't-up' }, t('Raccoons'))));
    for (const id of TOWER_ORDER) {
      const def = TOWERS[id];
      const locked = towerLocked(id);
      const prog = banditProgress(p.towerXpTotal[id] ?? 0);
      const xp = xpOf(p, id);
      const can = canUnlockAny(p, id);
      const on = sel.kind === 'tower' && sel.id === id;
      const b = h(
        'button',
        { class: 'tile bd-ros' + (on ? ' sel' : '') + (locked ? ' locked' : '') + (can ? ' can' : ''), type: 'button', role: 'option', 'aria-selected': String(on), title: t(def.name), 'aria-label': `${t(def.name)} · ${t('Bandit level {n}', { n: prog.level })}` },
        h('span', { class: 'bd-ros-art' }, img(towerPortraitUrl(id), '', ''), h('b', { class: 'bd-lv' }, String(prog.level)), locked ? uiIcon('lock', '🔒', 'bd-ros-lock') : null),
        h(
          'span',
          { class: 'bd-ros-text' },
          h('b', { class: 'bd-ros-name' }, t(def.name)),
          locked ? h('small', { class: 'bd-ros-req' }, t('Unlocks at player level {n}', { n: def.unlock })) : null,
          h('span', { class: 'bd-ros-meta' }, bar(prog.frac, '', undefined, 9), locked ? null : h('span', { class: 'bd-ros-xp', title: t('XP to spend') }, uiIcon('xp', '⭐'), fmt(xp))),
        ),
        can ? upBadge() : null,
      );
      b.addEventListener('click', () => select({ kind: 'tower', id }));
      rosterItems.set('t:' + id, b);
      items.push(b);
      roster.append(b);
    }
    roster.append(h('div', { class: 'bd-sec' }, h('span', { class: 't-up' }, t('Heroes'))));
    for (const id of HERO_ORDER) {
      const def = HEROES[id];
      const locked = heroLocked(id);
      const on = sel.kind === 'hero' && sel.id === id;
      const b = h(
        'button',
        { class: 'tile bd-ros hero' + (on ? ' sel' : '') + (locked ? ' locked' : ''), type: 'button', role: 'option', 'aria-selected': String(on), title: t(def.name), 'aria-label': t(def.name) },
        h('span', { class: 'bd-ros-art' }, img(heroPortraitUrl(id, 1), '', ''), uiIcon('crown', '👑', 'bd-crown'), locked ? uiIcon('lock', '🔒', 'bd-ros-lock') : null),
        h('span', { class: 'bd-ros-text' }, h('b', { class: 'bd-ros-name' }, t(def.name)), h('small', { class: 'bd-ros-req' }, locked ? t('Unlocks at player level {n}', { n: def.unlock }) : t(def.title))),
      );
      b.addEventListener('click', () => select({ kind: 'hero', id }));
      rosterItems.set('h:' + id, b);
      items.push(b);
      roster.append(b);
    }
    if (first) stagger(items, 'anim-rise', 1);
    roster.scrollTop = keep;
    rescroll(roster);
  };

  const select = (s: BanditSel) => {
    if (s.kind === sel.kind && s.id === sel.id) return;
    audio.play('click');
    sel = s;
    heroLook = 1;
    for (const [key, el] of rosterItems) {
      const on = key === (s.kind === 'tower' ? 't:' : 'h:') + s.id;
      el.classList.toggle('sel', on);
      el.setAttribute('aria-selected', String(on));
    }
    renderDetail(null, true);
    detail.scrollTop = 0;
  };

  // ---------------------------------------------------------------- tower detail
  interface Fresh {
    path: number;
    tier: number;
    xpFrom: number;
  }

  const renderTower = (id: TowerId, fresh: Fresh | null, enter: boolean) => {
    const def = TOWERS[id];
    const u = unlocksOf(p, id);
    const xp = xpOf(p, id);
    const total = p.towerXpTotal[id] ?? 0;
    const prog = banditProgress(total);
    const locked = towerLocked(id);
    const infos = tierInfo(id);
    if (!pathSel.has(id)) {
      const can = [0, 1, 2].find((i) => canUnlock(p, id, i));
      const best = u.indexOf(Math.max(...u));
      pathSel.set(id, can ?? (Math.max(...u) > 1 ? best : 0));
    }
    const look = lookTiers(u);
    const newLook = !!fresh && fresh.tier >= 3 && look[fresh.path] === fresh.tier;

    // header: portrait, name, stats, XP box
    const portrait = h(
      'div',
      { class: 'bd-big' + (newLook ? ' bd-newlook' : '') },
      h('div', { class: 'rays' }),
      img(towerPortraitUrl(id, look), 'bd-big-img', t(def.name)),
      h('b', { class: 'bd-lv' }, String(prog.level)),
    );
    // unspent XP: a pill in the name row on phones, the box with the level bar when there is room
    const xpPillNum = h('b', null, fmt(fresh ? fresh.xpFrom : xp));
    const xpPill = h('span', { class: 'bd-xp-pill', title: t('XP to spend') }, uiIcon('xp', '⭐'), xpPillNum, h('small', null, t('XP to spend')));
    const info = h(
      'div',
      { class: 'bd-info' },
      h('div', { class: 'bd-name' }, h('b', { class: 't-outline' }, t(def.name)), chip(null, t(def.role), ROLE_CHIP[def.role] ?? 'dark'), h('small', { class: 'bd-species' }, t(def.species)), xpPill),
      h('p', { class: 'bd-desc' }, t(def.desc)),
      h('div', { class: 'bd-stats' }, ...statChips(def.base(), def.cost)),
    );
    const xpNum = h('b', { class: 't-num' }, fmt(fresh ? fresh.xpFrom : xp));
    const xpBox = h(
      'div',
      { class: 'bd-xpbox well' },
      h('div', { class: 'bd-xp-top' }, h('span', null, t('Bandit level {n}', { n: prog.level })), h('small', null, prog.level >= MAX_BANDIT_LEVEL ? t('Max level') : `${fmt(prog.into)} / ${fmt(prog.need)}`)),
      bar(prog.frac, '', undefined, 11),
      h('div', { class: 'bd-xp-main', title: t('XP to spend') }, uiIcon('xp', '⭐'), xpNum, h('small', null, t('XP to spend'))),
    );
    if (fresh) {
      countUp(xpNum, xp, { from: fresh.xpFrom, dur: 650, delay: 120 });
      countUp(xpPillNum, xp, { from: fresh.xpFrom, dur: 650, delay: 120 });
    }
    const head = h('div', { class: 'bd-head' }, portrait, info, xpBox);
    const lockNote = locked ? h('div', { class: 'bd-lock-note' }, uiIcon('lock', '🔒'), h('span', null, t('Unlocks at player level {n}', { n: def.unlock }))) : null;

    const rules = h(
      'div',
      { class: 'bd-rules' },
      h('span', null, uiIcon('info', 'ℹ️'), t('Max. 2 paths per raccoon, and only one of them above tier 2.')),
      h('span', null, uiIcon('xp', '⭐'), t('XP is earned by playing this raccoon: at the end of every round it is on the field.')),
    );

    // paths: tabs (phones) + columns of 5 tier cards
    const cur = pathSel.get(id)!;
    const pathEls: HTMLElement[] = [];
    const tabEls: HTMLElement[] = [];
    const cards: HTMLElement[] = [];
    for (let pi = 0; pi < 3; pi++) {
      const tone = PATH_TONE[pi];
      const style = `--pc:${tone.c};--pc-l:${tone.l};--pc-d:${tone.d}`;
      const pathCan = canUnlock(p, id, pi);
      const tab = h(
        'button',
        { class: 'tab bd-ptab' + (pi === cur ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': String(pi === cur), style },
        h('i', { class: 'bd-dot' }),
        h('span', null, t(def.pathNames[pi])),
        h('span', { class: 'tab-n' }, `${u[pi]}/5`),
        pathCan ? upBadge('bd-up small') : null,
      );
      tab.addEventListener('click', () => {
        if (pathSel.get(id) === pi) return;
        audio.play('click');
        pathSel.set(id, pi);
        tabEls.forEach((el, i) => {
          el.classList.toggle('on', i === pi);
          el.setAttribute('aria-selected', String(i === pi));
        });
        pathEls.forEach((el, i) => el.classList.toggle('on', i === pi));
        stagger([...pathEls[pi].querySelectorAll<HTMLElement>('.bd-tier')], 'anim-rise');
      });
      tabEls.push(tab);

      const pips = h('span', { class: 'bd-pips', 'aria-label': `${u[pi]}/5` }, ...[1, 2, 3, 4, 5].map((tier) => h('i', { class: tier <= u[pi] ? 'on' : '' })));
      const tiersEl = h('div', { class: 'bd-tiers' });
      for (let tier = 1; tier <= 5; tier++) {
        const inf = infos[pi][tier - 1];
        const state = tier <= u[pi] ? 'open' : tier === u[pi] + 1 ? 'next' : 'locked';
        const cost = TIER_XP[tier];
        const can = state === 'next' && xp >= cost;
        const url = tier >= 3 ? towerIconUrl(id, tiersAt(pi, tier)) : null;
        const art = h(
          'div',
          { class: 'bd-tart' },
          h('div', { class: 'bd-tbox ' + (url ? 'look' : 'gen') }, url ? img(url, 'bd-tbox-img', '') : glyph(CHEVRONS[tier >= 2 ? 1 : 0], 6.5, '#fff6d6', 'chev')),
          h('b', { class: 'bd-tn' }, String(tier)),
          state === 'open' ? uiIcon('check', '✔', 'bd-st') : state === 'locked' ? uiIcon('lock', '🔒', 'bd-st') : null,
          h('span', { class: 'bd-price', title: t('Price') }, '$' + fmt(inf.cost)),
        );
        let foot: HTMLElement;
        if (state === 'open') foot = h('span', { class: 'bd-ok' }, uiIcon('check', '✔'), t('Unlocked'));
        else if (state === 'locked') foot = h('span', { class: 'bd-cost', title: t('Unlock the tier before first') }, uiIcon('lock', '🔒'), `${fmt(cost)} XP`);
        else {
          const b = h(
            'button',
            {
              class: 'btn small bd-unlock ' + (can ? 'gold glint' : 'dark need'),
              type: 'button',
              style: can ? undefined : `--p:${((Math.min(xp, cost) / cost) * 100).toFixed(1)}%`,
              'aria-label': `${t('Unlock · {n} XP', { n: fmt(cost) })}: ${t(inf.name)}`,
              title: can ? t('Unlock · {n} XP', { n: fmt(cost) }) : t('{a} of {b} XP', { a: fmt(xp), b: fmt(cost) }),
            },
            h('span', { class: 'stack' }, h('span', null, t('Unlock')), h('span', { class: 'sub' }, uiIcon('xp', '⭐'), can ? `${fmt(cost)} XP` : `${fmt(xp)} / ${fmt(cost)}`)),
          ) as HTMLButtonElement;
          if (!can) b.setAttribute('aria-disabled', 'true');
          b.addEventListener('click', () => {
            if (!can) {
              audio.play('error');
              b.classList.remove('shake');
              void b.offsetWidth;
              b.classList.add('shake');
              return;
            }
            doUnlock(id, pi);
          });
          foot = b;
        }
        const card = h(
          'div',
          { class: `tile bd-tier ${state}` + (can ? ' can' : '') },
          art,
          h('b', { class: 'bd-tname' }, inf.ability ? h('span', { class: 'bd-ab', title: `${t('Ability')}: ${t(inf.ability.name)}` }, abilityIcon(inf.ability)) : null, t(inf.name)),
          h('p', { class: 'bd-tdesc' }, t(inf.desc)),
          h('div', { class: 'bd-tfoot' }, foot),
        );
        if (fresh && fresh.path === pi && fresh.tier === tier) {
          card.classList.add('bd-fresh');
          card.append(h('div', { class: 'bd-burst', 'aria-hidden': 'true' }, ...Array.from({ length: 10 }, (_, i) => h('i', { style: `--a:${i * 36}deg;--dd:${(i % 3) * 40}ms` }))));
        } else if (fresh && fresh.path === pi && fresh.tier + 1 === tier) card.classList.add('bd-arrive');
        cards.push(card);
        tiersEl.append(card);
      }
      const path = h(
        'div',
        { class: 'bd-path' + (pi === cur ? ' on' : ''), style },
        h('div', { class: 'bd-path-head' }, h('i', { class: 'bd-dot' }), h('b', null, t(def.pathNames[pi])), pips),
        tiersEl,
      );
      pathEls.push(path);
    }
    const ptabs = h('div', { class: 'tabs bd-ptabs', role: 'tablist' }, ...tabEls);
    const paths = h('div', { class: 'bd-paths' }, ...pathEls);

    clear(detail);
    detail.append(...([head, lockNote, ptabs, paths, rules].filter(Boolean) as HTMLElement[]));
    if (enter) {
      stagger([head, ptabs], 'anim-fade');
      stagger(cards, 'anim-rise', 2);
    }
    rescroll(detail);
  };

  const doUnlock = (id: TowerId, path: number) => {
    const before = xpOf(p, id);
    const tier = unlockNext(p, id, path);
    if (tier === null) {
      audio.play('error');
      return;
    }
    saveProfile(p);
    ctx.onUnlock?.(id, path, tier);
    audio.play('upgrade');
    if (tier >= 5) audio.play('levelup', 0.9);
    haptic(tier >= 5 ? 'heavy' : 'medium');
    renderRoster(false);
    const item = rosterItems.get('t:' + id);
    if (item) bump(item);
    renderTower(id, { path, tier, xpFrom: before }, false);
    if (tier >= 5 && m.isConnected) confetti(m, 60);
  };

  // ---------------------------------------------------------------- hero detail
  const renderHero = (id: HeroId, enter: boolean) => {
    const def = HEROES[id];
    const locked = heroLocked(id);
    const abs = heroAbilities(id);
    const bigImg = img(heroPortraitUrl(id, heroLook), 'bd-big-img', t(def.name));
    const portrait = h('div', { class: 'bd-big hero' }, h('div', { class: 'rays' }), bigImg);
    const stats = def.base();
    const info = h(
      'div',
      { class: 'bd-info' },
      h('div', { class: 'bd-name' }, h('b', { class: 't-outline' }, t(def.name)), chip(uiIcon('crown', '👑'), t('Hero'), 'gold'), h('small', { class: 'bd-species' }, t(def.title))),
      h('p', { class: 'bd-desc' }, t(def.desc)),
      h('div', { class: 'bd-stats' }, ...statChips(stats, def.cost)),
    );
    const lookEls = [1, 7, 14].map((lv) => {
      const b = h(
        'button',
        { class: 'bd-look' + (lv === heroLook ? ' on' : ''), type: 'button', title: t('Level {n}', { n: lv }), 'aria-pressed': String(lv === heroLook) },
        img(heroPortraitUrl(id, lv), '', t('Level {n}', { n: lv })),
        h('span', null, t('Lv {n}', { n: lv })),
      );
      b.addEventListener('click', () => {
        if (heroLook === lv) return;
        audio.play('click');
        heroLook = lv;
        bigImg.src = heroPortraitUrl(id, lv);
        portrait.classList.remove('bd-newlook');
        void portrait.offsetWidth;
        portrait.classList.add('bd-newlook');
        lookEls.forEach((el) => {
          const on = el === b;
          el.classList.toggle('on', on);
          el.setAttribute('aria-pressed', String(on));
        });
      });
      return b;
    });
    const looks = h('div', { class: 'bd-looks well' }, h('span', { class: 't-up' }, t('Looks')), h('div', { class: 'bd-look-row' }, ...lookEls));
    const head = h('div', { class: 'bd-head' }, portrait, info, looks);
    const lockNote = locked ? h('div', { class: 'bd-lock-note' }, uiIcon('lock', '🔒'), h('span', null, t('Unlocks at player level {n}', { n: def.unlock }))) : null;
    const note = h('div', { class: 'bd-rules' }, h('span', null, uiIcon('info', 'ℹ️'), t('Heroes level up during a game. Their skills unlock by themselves, no XP needed.')));
    const rows = def.levels.map((lvDef, i) => {
      const lv = i + 2;
      const ab = abs[lv];
      const look = lv === 7 || lv === 14;
      return h(
        'div',
        { class: 'bd-skill' + (ab ? ' ab' : '') + (look ? ' look' : '') },
        h('b', { class: 'bd-skill-lv' }, String(lv)),
        ab ? abilityIcon(ab, 'bd-skill-ab') : look ? img(heroPortraitUrl(id, lv), 'bd-skill-look', '') : null,
        h('span', { class: 'bd-skill-text' }, ab ? h('b', null, t(ab.name) + ': ') : null, t(lvDef.desc), look ? h('em', null, ' ' + t('New look!')) : null),
      );
    });
    const skills = h('div', { class: 'bd-skills' }, h('div', { class: 'bd-skill base' }, h('b', { class: 'bd-skill-lv' }, '1'), h('span', { class: 'bd-skill-text' }, t('Starts at level 1 when placed.'))), ...rows);
    const skillBox = h('div', { class: 'bd-skillbox' }, h('div', { class: 'bd-path-head' }, h('b', null, t('Skills by level'))), skills);
    clear(detail);
    detail.append(...([head, lockNote, skillBox, note].filter(Boolean) as HTMLElement[]));
    if (enter) {
      stagger([head], 'anim-fade');
      stagger([...skills.children].slice(0, 12) as HTMLElement[], 'anim-rise', 2);
    }
    rescroll(detail);
  };

  const renderDetail = (fresh: Fresh | null, enter: boolean) => {
    if (sel.kind === 'tower') renderTower(sel.id, fresh, enter);
    else renderHero(sel.id, enter);
  };

  renderRoster(true);
  renderDetail(null, true);
  const m = modal({ title: t('Bandits'), color: 'green', icon: uiIcon('mask', '🦝'), size: 'xwide', cls: 'bandits', onClose: ctx.close }, [root]);
  // keep the selected roster entry in view (only the roster scrolls, never the page)
  requestAnimationFrame(() => {
    const el = rosterItems.get(sel.kind === 'tower' ? 't:' + sel.id : 'h:' + sel.id);
    if (el && el.offsetTop + el.offsetHeight > roster.clientHeight) roster.scrollTop = el.offsetTop - (roster.clientHeight - el.offsetHeight) / 2;
  });
  return m;
}

// ------------------------------------------------------------------------------------------- result screens

/**
 * "Bandit XP" row on the victory / game over screens: the raccoons that earned XP this game and,
 * when any raccoon can unlock a tier, a button into the Bandit menu.
 */
export function banditXpStrip(p: Profile, gained: Partial<Record<TowerId, number>>, open: () => void): HTMLElement | null {
  const list = (Object.entries(gained) as [TowerId, number][]).filter(([, v]) => v >= 0.5).sort((a, b) => b[1] - a[1]);
  const unlockable = unlockableTypes(p);
  if (!list.length && !unlockable.length) return null;
  const items = list.map(([id, v], i) =>
    h(
      'div',
      { class: 'bx-item anim-pop', style: `--i:${i};--d:1100ms`, title: t(TOWERS[id].name) },
      h('div', { class: 'bx-art' }, img(towerPortraitUrl(id), '', t(TOWERS[id].name)), unlockable.includes(id) ? upBadge('bd-up small') : null),
      h('span', { class: 'bx-chip' }, `+${fmt(Math.round(v))}`),
    ),
  );
  const cta = unlockable.length
    ? h(
        'div',
        { class: 'bx-cta anim-pop', style: `--d:${1200 + items.length * 55}ms` },
        h('span', { class: 'bx-new' }, t('New tier unlockable!')),
        btn(t('Bandits'), 'gold', () => {
          audio.play('click');
          open();
        }, { size: 'small', icon: uiIcon('mask', '🦝'), cls: 'glint' }),
      )
    : null;
  return h(
    'div',
    { class: 'bx well anim-rise', style: '--d:1000ms' },
    h('div', { class: 'bx-label' }, uiIcon('xp', '⭐'), h('span', null, t('Bandit XP'))),
    items.length ? h('div', { class: 'bx-list' }, ...items) : h('div', { class: 'bx-none' }, t('No bandit XP this game')),
    cta,
  );
}
