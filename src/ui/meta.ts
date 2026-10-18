import { PERKS, PERK_BY_ID, type PerkDef } from '../game/perks';
import { ACHIEVEMENTS } from '../game/achievements';
import { dailyFor, todayKey } from '../game/daily';
import { MAP_BY_ID } from '../game/maps';
import { TOWERS } from '../game/towers';
import { DIFFICULTIES } from '../game/types';
import type { Game } from '../game/Game';
import { towerIcon, type ArtId } from '../render/towerArt';
import { saveProfile, wisdomPoints, type Profile } from '../save/storage';
import { audio } from '../audio/audio';
import { h, clear } from './dom';
import { t } from '../i18n';

const BRANCHES: { id: PerkDef['branch']; name: string; color: string }[] = [
  { id: 'economy', name: 'Economy', color: '#ffd23c' },
  { id: 'critters', name: 'Critters', color: '#5ddc6a' },
  { id: 'heroes', name: 'Heroes', color: '#c77dff' },
  { id: 'power', name: 'Power', color: '#ff6b6b' },
];

/** "Critter Wisdom" perk tree. */
export function perksModal(p: Profile, close: () => void, onChange: () => void): HTMLElement {
  const body = h('div');
  const render = () => {
    clear(body);
    const pts = wisdomPoints(p);
    body.append(h('p', null, t('Earn 1 Wisdom point per player level. Perks apply to every new game.')), h('div', { class: 'wisdom-points' }, `🧠 ${pts}`));
    const cols = h('div', { class: 'perk-cols' });
    for (const br of BRANCHES) {
      const col = h('div', { class: 'perk-col' }, h('div', { class: 'perk-branch', style: `color:${br.color}` }, t(br.name)));
      for (const perk of PERKS.filter((x) => x.branch === br.id)) {
        const owned = p.perks.includes(perk.id);
        const reqOk = !perk.requires || p.perks.includes(perk.requires);
        const can = !owned && reqOk && pts > 0;
        const b = h(
          'button',
          { class: 'perk' + (owned ? ' owned' : can ? ' can' : reqOk ? '' : ' locked'), style: owned ? `border-color:${br.color}` : '' },
          h('span', { class: 'perk-icon' }, perk.icon),
          h('span', { class: 'perk-text' }, h('b', null, t(perk.name)), h('small', null, t(perk.desc)), !reqOk ? h('small', { class: 'req' }, '🔒 ' + t(PERK_BY_ID[perk.requires!].name)) : null),
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
          render();
        });
        col.append(b);
      }
      cols.append(col);
    }
    body.append(cols);
    const reset = h('button', { class: 'btn small dark' }, t('↺ Reset perks'));
    reset.addEventListener('click', () => {
      p.perks = [];
      saveProfile(p);
      audio.play('sell');
      onChange();
      render();
    });
    body.append(h('div', { class: 'row' }, reset, h('button', { class: 'btn green', onclick: close }, t('Done'))));
  };
  render();
  return h('div', { class: 'modal', style: 'width:min(980px,96vw)' }, h('h2', null, t('🧠 Critter Wisdom')), body);
}

export function achievementsModal(p: Profile, g: Game | null, close: () => void): HTMLElement {
  const list = h('div', { class: 'ach-list' });
  let done = 0;
  for (const a of ACHIEVEMENTS) {
    const got = !!p.achievements[a.id];
    if (got) done++;
    const prog = got ? 1 : a.progress(p, g);
    list.append(
      h(
        'div',
        { class: 'ach' + (got ? ' got' : '') },
        h('span', { class: 'ach-icon' }, a.icon),
        h(
          'div',
          { class: 'ach-text' },
          h('b', null, t(a.name)),
          h('small', null, t(a.desc)),
          h('div', { class: 'xpbar', style: 'width:100%;height:10px;border-width:2px;margin-top:3px' }, h('div', { style: `width:${Math.round(prog * 100)}%;${got ? 'background:linear-gradient(90deg,#ffd23c,#ff9f1c)' : ''}` })),
        ),
        h('span', { class: 'ach-xp' }, got ? '✔' : `+${a.xp} XP`),
      ),
    );
  }
  return h(
    'div',
    { class: 'modal', style: 'width:min(820px,96vw)' },
    h('h2', null, t('🏅 Achievements')),
    h('p', null, t('{a} of {b} unlocked', { a: done, b: ACHIEVEMENTS.length })),
    list,
    h('div', { class: 'row' }, h('button', { class: 'btn green', onclick: close }, t('Close'))),
  );
}

export function dailyModal(p: Profile, thumb: (mapId: string) => string, start: () => void, close: () => void): HTMLElement {
  const key = todayKey();
  const d = dailyFor(key);
  const m = MAP_BY_ID[d.mapId];
  const done = !!p.dailyDone[key];
  const allowed = h('div', { class: 'daily-towers' });
  for (const id of d.challenge.allowed ?? []) allowed.append(h('img', { src: towerIcon(id as ArtId, [0, 0, 0], 80), alt: TOWERS[id].name, title: TOWERS[id].name }));
  const diff = DIFFICULTIES[d.difficulty];
  return h(
    'div',
    { class: 'modal', style: 'width:min(640px,94vw)' },
    h('h2', null, t('📅 Daily Challenge')),
    h('p', null, `${t(d.challenge.name)} · ${key}`),
    h('img', { src: thumb(m.id), alt: '', style: 'width:100%;max-width:420px;border-radius:14px;border:3px solid #2a1b2e' }),
    h(
      'div',
      { class: 'stats', style: 'max-width:420px' },
      h('span', null, t('Map')),
      h('span', null, t(m.name)),
      h('span', null, t('Difficulty')),
      h('span', null, t(diff.name)),
      h('span', null, t('Survive to round')),
      h('span', null, String(d.challenge.lastRound)),
      h('span', null, t('Starting cash')),
      h('span', null, '$' + (d.challenge.cash ?? 650)),
      h('span', null, t('Hero')),
      h('span', null, d.challenge.noHero ? t('Not allowed') : t('Allowed')),
      h('span', null, t('Reward')),
      h('span', null, done ? '✔ ' + t('Completed') : '+500 XP'),
    ),
    h('p', { style: 'margin:6px 0 0;font-size:13px' }, t('Perks are off in daily challenges so everyone plays the same game.')),
    h('p', { style: 'margin-bottom:4px' }, t('Allowed critters')),
    allowed,
    h(
      'div',
      { class: 'row' },
      h('button', { class: 'btn green', onclick: start }, done ? t('▶ Play again') : t('▶ Start')),
      h('button', { class: 'btn dark', onclick: close }, t('Close')),
    ),
  );
}
