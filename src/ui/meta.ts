import { PERKS, PERK_BY_ID, type PerkDef } from '../game/perks';
import { ACHIEVEMENTS, type AchievementDef } from '../game/achievements';
import type { GloopId } from '../game/gloops';
import { abilityIconUrl, towerIconUrl } from '../render/art';
import { dailyFor, todayKey } from '../game/daily';
import { MAP_BY_ID } from '../game/maps';
import { TOWERS } from '../game/towers';
import { DIFFICULTIES } from '../game/types';
import type { Game } from '../game/Game';
import { saveProfile, wisdomPoints, type Profile } from '../save/storage';
import { audio } from '../audio/audio';
import { h, clear } from './dom';
import { t, getLang } from '../i18n';
import { softHyphens } from '../i18n/hyphen';
import { uiIcon, img, btn, page, bar, chip, socket, stagger, PAGE_STAGGER, bump, fmt, mapImageSrc, towerPortraitUrl, heroPortraitUrl, starPortraitUrl, MEDAL, MEDAL_EMOJI, confirmBox, undoBar } from './kit';
import { byRole, towerRoleCls, roleCls, roleIcon } from './roles';
import type { TowerId } from '../game/towerTypes';

// Painted art for perk and achievement icons (their data still carries an emoji, used only as the
// fallback when a sprite is missing): ui icons, raccoon and hero portraits, star and ability art.
type ArtRef = { ui: string } | { tower: string; tiers?: number[] } | { hero: string; level: number } | { star: GloopId } | { ability: string };

const PERK_ART: Record<string, ArtRef> = {
  cash1: { ui: 'coin' },
  cash2: { ui: 'sack' },
  bonus: { ui: 'chart' },
  thrift: { tower: 'dojo', tiers: [0, 0, 3] },
  acorns: { tower: 'acorn' },
  spike: { tower: 'spike' },
  boomer: { tower: 'boomer' },
  frost: { tower: 'frost' },
  hoot: { tower: 'hoot' },
  range: { ui: 'target' },
  camo: { ui: 'camo' },
  hero1: { ui: 'star' },
  hero2: { ui: 'book' },
  hero3: { hero: 'nova', level: 7 },
  herocost: { ui: 'crown' },
  frenzy1: { ability: 'firestorm' },
  frenzy2: { ui: 'fast' },
  lives: { ui: 'heart' },
  abilities: { ui: 'restart' },
  bonds: { ui: 'bond' },
};

const ACH_ART: Record<string, ArtRef> = {
  firstwin: { ui: 'trophy' },
  pop1k: { star: 'red' },
  pop25k: { star: 'rainbow' },
  pop500k: { star: 'ceramic' },
  boss1: { star: 'moab' },
  boss100: { star: 'bfb' },
  gold1: { star: 'golden' },
  gold15: { ui: 'crown' },
  tier5: { ui: 'star' },
  tier5x5: { tower: 'spike', tiers: [5, 0, 0] },
  bond3: { ui: 'bond' },
  bond8: { ability: 'superstorm' },
  hard: { ui: 'medal3' },
  champ: { ui: 'medal4' },
  explorer: { ui: 'globe' },
  combo500: { ui: 'target' },
  frenzy10: { ability: 'firestorm' },
  hero20: { hero: 'nova', level: 14 },
  round120: { ui: 'chart' },
  flawless: { ui: 'heart' },
  tycoon: { ui: 'sack' },
  daily1: { ui: 'calendar' },
  daily7: { ui: 'calendar' },
};

function artIcon(ref: ArtRef | undefined, fallback: string): HTMLElement {
  if (ref && 'ui' in ref) return uiIcon(ref.ui, fallback);
  let url: string | null = null;
  if (ref && 'tower' in ref) url = ref.tiers ? towerIconUrl(ref.tower, ref.tiers) ?? towerPortraitUrl(ref.tower) : towerPortraitUrl(ref.tower);
  else if (ref && 'hero' in ref) url = heroPortraitUrl(ref.hero, ref.level);
  else if (ref && 'star' in ref) url = starPortraitUrl(ref.star);
  else if (ref && 'ability' in ref) url = abilityIconUrl(ref.ability);
  if (url) return img(url, 'ico art' + (ref && ('tower' in ref || 'hero' in ref) ? ' portrait-ico' : ''));
  return h('span', { class: 'ico emoji', 'aria-hidden': 'true' }, fallback);
}

/** Socket classes for an icon that shows a raccoon or a hero: its disc takes the role colour. */
function artSocketCls(ref: ArtRef | undefined): string {
  if (ref && 'tower' in ref) return 'role-socket ' + towerRoleCls(ref.tower as TowerId);
  if (ref && 'hero' in ref) return 'role-socket ' + roleCls('Hero');
  return '';
}

export const perkIcon = (perk: PerkDef) => artIcon(PERK_ART[perk.id], perk.icon);
export const achievementIcon = (a: AchievementDef) => artIcon(ACH_ART[a.id], a.icon);

// Branch headers carry an icon rather than a colour: the hues are taken by the raccoon roles
// (a gold, green or violet branch would read as Hero, Military or Magic).
const BRANCHES: { id: PerkDef['branch']; name: string; icon: [string, string] }[] = [
  { id: 'economy', name: 'Economy', icon: ['coin', '🪙'] },
  { id: 'critters', name: 'Bandits', icon: ['mask', '🦝'] },
  { id: 'heroes', name: 'Heroes', icon: ['crown', '👑'] },
  { id: 'power', name: 'Power', icon: ['fast', '⚡'] },
];

/** "Bandit Wisdom" perk tree (full-screen page: points + reset in the header, four branches). */
export function perksPage(p: Profile, close: () => void, onChange: () => void): HTMLElement {
  const body = h('div', { class: 'wisdom' });
  const ptsEl = h('span', { class: 't-num' }, '0');
  const pill = h('div', { class: 'pill wisdom-points', title: t('Wisdom') }, uiIcon('lantern', '🧠'), ptsEl);
  let pageEl: HTMLElement | null = null;
  let dropUndo: (() => void) | null = null;
  // one tap must never wipe a build: ask first, then offer 5 s to take it back
  const reset = btn(
    t('Reset perks'),
    'red',
    () => {
      if (!p.perks.length || !pageEl) return;
      audio.play('click');
      const n = p.perks.length;
      confirmBox(pageEl, {
        title: t('Reset all perks?'),
        text: n === 1 ? t('You get 1 point back.') : t('You get {n} points back.', { n }),
        ok: t('Reset'),
        okIcon: uiIcon('restart', '↺'),
        icon: uiIcon('lantern', '🧠'),
        onOk: () => {
          const before = [...p.perks];
          p.perks = [];
          saveProfile(p);
          audio.play('sell');
          onChange();
          render(false);
          dropUndo?.();
          dropUndo = undoBar(pageEl!, t('Perks reset · {n} points back', { n: before.length }), () => {
            // only if nothing was learned in the meantime
            if (p.perks.length) return;
            p.perks = before;
            saveProfile(p);
            audio.play('upgrade');
            onChange();
            render(false);
          });
        },
      });
    },
    { size: 'small', cls: 'wisdom-reset', icon: uiIcon('restart', '↺') },
  );
  let lastPts = -1;
  const render = (first: boolean) => {
    clear(body);
    const pts = wisdomPoints(p);
    ptsEl.textContent = String(pts);
    pill.classList.toggle('has', pts > 0);
    if (lastPts >= 0 && lastPts !== pts) bump(ptsEl);
    lastPts = pts;
    body.append(h('p', { class: 'page-note' }, uiIcon('info', 'ℹ️'), h('span', null, t('Earn 1 Wisdom point per player level. Perks apply to every new game.'))));
    const cols = h('div', { class: 'perk-cols' });
    const colEls: HTMLElement[] = [];
    for (const br of BRANCHES) {
      const col = h('div', { class: 'perk-col well' }, h('div', { class: 'perk-branch' }, uiIcon(br.icon[0], br.icon[1]), h('span', null, t(br.name))));
      for (const perk of PERKS.filter((x) => x.branch === br.id)) {
        const owned = p.perks.includes(perk.id);
        const reqOk = !perk.requires || p.perks.includes(perk.requires);
        const can = !owned && reqOk && pts > 0;
        const state = owned ? ' owned' : can ? ' can' : reqOk ? '' : ' locked';
        const b = h(
          'button',
          { class: 'tile perk' + state, type: 'button' },
          socket(perkIcon(perk), 42, artSocketCls(PERK_ART[perk.id])),
          h('span', { class: 'perk-text' }, h('b', null, t(perk.name)), h('small', null, softHyphens(t(perk.desc))), !reqOk ? h('small', { class: 'req' }, t('Needs {name}', { name: t(PERK_BY_ID[perk.requires!].name) })) : null),
          owned ? uiIcon('check', '✔', 'state') : can ? h('span', { class: 'plus' }, '+') : !reqOk ? uiIcon('lock', '🔒', 'state') : null,
        );
        b.addEventListener('click', () => {
          if (!can) {
            audio.play(owned ? 'click' : 'error');
            return;
          }
          p.perks.push(perk.id);
          // learning something ends the chance to undo the reset
          dropUndo?.();
          dropUndo = null;
          saveProfile(p);
          audio.play('upgrade');
          onChange();
          render(false);
        });
        col.append(b);
      }
      colEls.push(col);
      cols.append(col);
    }
    if (first) stagger(colEls, 'anim-rise', 1, PAGE_STAGGER);
    body.append(cols);
    reset.disabled = p.perks.length === 0;
  };
  render(true);
  pageEl = page({ title: t('Bandit Wisdom'), icon: uiIcon('lantern', '🧠'), accent: '#b07bff', cls: 'wisdom-page', onBack: close, right: [reset, pill] }, [body]);
  return pageEl;
}

export function achievementsPage(p: Profile, g: Game | null, close: () => void): HTMLElement {
  const list = h('div', { class: 'ach-list' });
  let done = 0;
  const tiles: HTMLElement[] = [];
  for (const a of ACHIEVEMENTS) {
    const got = !!p.achievements[a.id];
    if (got) done++;
    const prog = got ? 1 : Math.max(0, Math.min(1, a.progress(p, g)));
    tiles.push(
      h(
        'div',
        { class: 'tile ach' + (got ? ' done' : '') },
        socket(achievementIcon(a), 46, ((got ? 'gold ' : '') + artSocketCls(ACH_ART[a.id])).trim()),
        h('div', { class: 'ach-text' }, h('b', null, t(a.name)), h('small', null, t(a.desc)), got ? null : bar(prog, 'green', `${Math.floor(prog * 100)}%`, 16)),
        h('div', { class: 'ach-xp' }, got ? uiIcon('check', '✔') : uiIcon('xp', '⭐'), h('b', { class: 't-outline' }, `+${fmt(a.xp)}`)),
      ),
    );
  }
  stagger(tiles.slice(0, 12), 'anim-rise', 1, PAGE_STAGGER);
  list.append(...tiles);
  const summary = h(
    'div',
    { class: 'pill ach-summary', title: t('{a} of {b} unlocked', { a: done, b: ACHIEVEMENTS.length }) },
    uiIcon('trophy', '🏆'),
    h('span', { class: 'pill-meter' }, h('small', null, `${done} / ${ACHIEVEMENTS.length}`), bar(done / ACHIEVEMENTS.length, 'gold')),
  );
  return page({ title: t('Achievements'), icon: uiIcon('trophy', '🏅'), accent: '#ffcf3f', cls: 'ach-page', onBack: close, right: [summary] }, [list]);
}

export function dailyPage(p: Profile, start: () => void, close: () => void): HTMLElement {
  const key = todayKey();
  const d = dailyFor(key);
  const m = MAP_BY_ID[d.mapId];
  const done = !!p.dailyDone[key];
  const diff = DIFFICULTIES[d.difficulty];
  const rule = (icon: HTMLElement, label: string, value: string, cls = '') => h('div', { class: ('rule well ' + cls).trim() }, icon, h('div', { class: 'rule-text' }, h('small', null, label), h('b', { class: 't-outline' }, value)));
  const allowed = h('div', { class: 'allowed-row' });
  const allowedIds = byRole((d.challenge.allowed ?? []) as TowerId[]);
  for (const id of allowedIds)
    allowed.append(h('div', { class: `portrait role-disc ${towerRoleCls(id)}`, title: `${t(TOWERS[id].name)} · ${t(TOWERS[id].role)}` }, img(towerPortraitUrl(id), '', t(TOWERS[id].name)), roleIcon(TOWERS[id].role, 'disc-role')));
  stagger([...allowed.children] as HTMLElement[], 'anim-pop', 4);
  const [y, mo, da] = key.split('-').map(Number);
  const dateLabel = new Date(y, mo - 1, da).toLocaleDateString(getLang() === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short' });
  const play = btn(done ? t('Play again') : t('Start'), 'green', start, { size: 'big', icon: uiIcon('play', '▶'), cls: 'glint daily-play' });
  const left = h(
    'div',
    { class: 'daily-left' },
    h('div', { class: 'daily-map anim-rise' }, img(mapImageSrc(m), '', t(m.name)), h('div', { class: 'mc-shade' }), chip(uiIcon('calendar', '📅'), dateLabel, 'dark date'), h('div', { class: 'mc-name t-outline' }, t(m.name))),
    h('div', { class: 'daily-cta anim-pop', style: '--d:250ms' }, play),
  );
  const rules = h(
    'div',
    { class: 'rules' },
    rule(uiIcon(MEDAL[d.difficulty] ?? 'medal2', MEDAL_EMOJI[d.difficulty] ?? '🥈'), t('Difficulty'), t(diff.name)),
    rule(uiIcon('target', '🎯'), t('Survive to round'), String(d.challenge.lastRound)),
    rule(uiIcon('coin', '🪙'), t('Starting cash'), '$' + fmt(d.challenge.cash ?? 650)),
    rule(uiIcon('mask', '🦝'), t('Hero'), d.challenge.noHero ? t('Not allowed') : t('Allowed')),
    rule(done ? uiIcon('check', '✔') : uiIcon('xp', '⭐'), t('Reward'), done ? t('Completed') : '+500 XP', 'reward-rule'),
  );
  stagger([...rules.children] as HTMLElement[], 'anim-rise', 1);
  const right = h(
    'div',
    { class: 'daily-right' },
    h('div', { class: 'daily-name t-outline anim-fade' }, t(d.challenge.name)),
    rules,
    h('div', { class: 'allowed' }, h('span', { class: 't-up' }, t('Allowed bandits') + ` · ${allowedIds.length}`), allowed),
    h('p', { class: 'page-note' }, uiIcon('info', 'ℹ️'), h('span', null, t('Perks are off in daily challenges so everyone plays the same game.'))),
  );
  const reward = h('div', { class: 'pill daily-reward' + (done ? ' done' : ''), title: t('Reward') }, done ? uiIcon('check', '✔') : uiIcon('xp', '⭐'), h('span', null, done ? t('Completed') : '+500 XP'));
  return page({ title: t('Daily Challenge'), icon: uiIcon('calendar', '📅'), accent: '#3fb2ff', cls: 'daily-page', onBack: close, right: [reward] }, [h('div', { class: 'daily' }, left, right)]);
}
