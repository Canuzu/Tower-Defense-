import { PERKS, PERK_BY_ID, type PerkDef } from '../game/perks';
import { ACHIEVEMENTS } from '../game/achievements';
import { dailyFor, todayKey } from '../game/daily';
import { MAP_BY_ID } from '../game/maps';
import { TOWERS } from '../game/towers';
import { DIFFICULTIES } from '../game/types';
import type { Game } from '../game/Game';
import { saveProfile, wisdomPoints, type Profile } from '../save/storage';
import { audio } from '../audio/audio';
import { h, clear } from './dom';
import { t, getLang } from '../i18n';
import { uiIcon, img, btn, modal, bar, chip, socket, stagger, bump, fmt, mapImageSrc, towerPortraitUrl, MEDAL, MEDAL_EMOJI } from './kit';

const BRANCHES: { id: PerkDef['branch']; name: string; color: string }[] = [
  { id: 'economy', name: 'Economy', color: '#ffd23c' },
  { id: 'critters', name: 'Bandits', color: '#6ee86a' },
  { id: 'heroes', name: 'Heroes', color: '#d29bff' },
  { id: 'power', name: 'Power', color: '#ff7b7b' },
];

/** "Bandit Wisdom" perk tree. */
export function perksModal(p: Profile, close: () => void, onChange: () => void): HTMLElement {
  const body = h('div');
  const reset = btn(
    t('Reset perks'),
    'red',
    () => {
      if (!p.perks.length) return;
      p.perks = [];
      saveProfile(p);
      audio.play('sell');
      onChange();
      render(false);
    },
    { size: 'small' },
  );
  let lastPts = -1;
  const render = (first: boolean) => {
    clear(body);
    const pts = wisdomPoints(p);
    const ptsEl = h('span', { class: 't-num' }, String(pts));
    const pill = h('div', { class: 'pill wisdom-points', title: t('Wisdom') }, uiIcon('lantern', '🧠'), ptsEl);
    if (lastPts >= 0 && lastPts !== pts) bump(ptsEl);
    lastPts = pts;
    body.append(h('div', { class: 'wisdom-head' }, pill, h('p', { class: 'wisdom-note' }, t('Earn 1 Wisdom point per player level. Perks apply to every new game.'))));
    const cols = h('div', { class: 'perk-cols' });
    const colEls: HTMLElement[] = [];
    for (const br of BRANCHES) {
      const col = h('div', { class: 'perk-col well', style: `--bc:${br.color}` }, h('div', { class: 'perk-branch' }, t(br.name)));
      for (const perk of PERKS.filter((x) => x.branch === br.id)) {
        const owned = p.perks.includes(perk.id);
        const reqOk = !perk.requires || p.perks.includes(perk.requires);
        const can = !owned && reqOk && pts > 0;
        const state = owned ? ' owned' : can ? ' can' : reqOk ? '' : ' locked';
        const b = h(
          'button',
          { class: 'tile perk' + state, type: 'button' },
          socket(perk.icon, 42),
          h('span', { class: 'perk-text' }, h('b', null, t(perk.name)), h('small', null, t(perk.desc)), !reqOk ? h('small', { class: 'req' }, t('Needs {name}', { name: t(PERK_BY_ID[perk.requires!].name) })) : null),
          owned ? uiIcon('check', '✔', 'state') : can ? h('span', { class: 'plus' }, '+') : !reqOk ? uiIcon('lock', '🔒', 'state') : null,
        );
        b.addEventListener('click', () => {
          if (!can) {
            audio.play(owned ? 'click' : 'error');
            return;
          }
          p.perks.push(perk.id);
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
    if (first) stagger(colEls, 'anim-rise', 1);
    body.append(cols);
    reset.disabled = p.perks.length === 0;
  };
  render(true);
  return modal({ title: t('Bandit Wisdom'), color: 'purple', icon: uiIcon('lantern', '🧠'), size: 'xwide', onClose: close }, [body], [reset, btn(t('Done'), 'green', close, { icon: uiIcon('check', '✔') })]);
}

export function achievementsModal(p: Profile, g: Game | null, close: () => void): HTMLElement {
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
        socket(a.icon, 46, got ? 'gold' : ''),
        h('div', { class: 'ach-text' }, h('b', null, t(a.name)), h('small', null, t(a.desc)), got ? null : bar(prog, 'green', `${Math.floor(prog * 100)}%`, 16)),
        h('div', { class: 'ach-xp' }, got ? uiIcon('check', '✔') : uiIcon('xp', '⭐'), h('b', { class: 't-outline' }, `+${fmt(a.xp)}`)),
      ),
    );
  }
  stagger(tiles.slice(0, 12), 'anim-rise', 1);
  list.append(...tiles);
  const summary = h(
    'div',
    { class: 'ach-summary well' },
    uiIcon('trophy', '🏆'),
    h('div', { class: 'grow' }, h('b', { class: 't-outline' }, t('{a} of {b} unlocked', { a: done, b: ACHIEVEMENTS.length })), bar(done / ACHIEVEMENTS.length, 'gold', undefined, 16)),
  );
  return modal({ title: t('Achievements'), color: 'gold', icon: uiIcon('trophy', '🏅'), size: 'wide', onClose: close }, [summary, list]);
}

export function dailyModal(p: Profile, start: () => void, close: () => void): HTMLElement {
  const key = todayKey();
  const d = dailyFor(key);
  const m = MAP_BY_ID[d.mapId];
  const done = !!p.dailyDone[key];
  const diff = DIFFICULTIES[d.difficulty];
  const rule = (icon: HTMLElement, label: string, value: string, cls = '') => h('div', { class: ('rule well ' + cls).trim() }, icon, h('div', { class: 'rule-text' }, h('small', null, label), h('b', { class: 't-outline' }, value)));
  const allowed = h('div', { class: 'allowed-row' });
  const allowedIds = d.challenge.allowed ?? [];
  for (const id of allowedIds) allowed.append(h('div', { class: 'portrait', title: t(TOWERS[id].name) }, img(towerPortraitUrl(id), '', t(TOWERS[id].name))));
  stagger([...allowed.children] as HTMLElement[], 'anim-pop', 4);
  const [y, mo, da] = key.split('-').map(Number);
  const dateLabel = new Date(y, mo - 1, da).toLocaleDateString(getLang() === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short' });
  const left = h(
    'div',
    null,
    h('div', { class: 'daily-map anim-rise' }, img(mapImageSrc(m), '', t(m.name)), h('div', { class: 'mc-shade' }), chip(uiIcon('calendar', '📅'), dateLabel, 'dark date'), h('div', { class: 'mc-name t-outline' }, t(m.name))),
    h('div', { class: 'daily-name t-outline' }, t(d.challenge.name)),
    h('p', { class: 'daily-note' }, t('Perks are off in daily challenges so everyone plays the same game.')),
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
  const right = h('div', null, rules, h('div', { class: 'allowed' }, h('span', { class: 't-up' }, t('Allowed bandits') + ` · ${allowedIds.length}`), allowed));
  return modal(
    { title: t('Daily Challenge'), color: 'blue', icon: uiIcon('calendar', '📅'), size: 'wide', onClose: close },
    [h('div', { class: 'daily' }, left, right)],
    [btn(done ? t('Play again') : t('Start'), 'green', start, { icon: uiIcon('play', '▶'), cls: 'glint' })],
  );
}
