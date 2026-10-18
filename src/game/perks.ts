import type { TowerStats } from './towerTypes';
import type { Tower } from './Tower';

/** Permanent meta-progression perks ("Bandit Wisdom"). One point per player level. */
export interface PerkDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  branch: 'economy' | 'critters' | 'heroes' | 'power';
  requires?: string;
  /** stat changes for towers (applied after upgrades) */
  tower?: (t: Tower, s: TowerStats) => void;
}

const forType = (id: string, fn: (s: TowerStats) => void) => (t: Tower, s: TowerStats) => {
  if (t.typeId === id) fn(s);
};

const firstAttack = (s: TowerStats) => s.attacks[0];

export const PERKS: PerkDef[] = [
  // economy
  { id: 'cash1', name: 'Pocket Money', desc: 'Start every game with +$100.', icon: '🪙', branch: 'economy' },
  { id: 'cash2', name: 'Piggy Bank', desc: 'Start every game with another +$200.', icon: '🐷', branch: 'economy', requires: 'cash1' },
  { id: 'bonus', name: 'Overtime', desc: '+20% end-of-round bonus cash.', icon: '⏰', branch: 'economy', requires: 'cash1' },
  { id: 'thrift', name: 'Haggling', desc: 'All towers and upgrades cost 3% less.', icon: '🏷️', branch: 'economy', requires: 'bonus' },
  { id: 'acorns', name: 'Treasure Sniffer', desc: 'Hoarders dig up +1 shiny per round.', icon: '💎', branch: 'economy', requires: 'cash2' },
  // critters
  {
    id: 'spike',
    name: 'Sharp Start',
    desc: 'Slinger shards get +1 pierce.',
    icon: '🎯',
    branch: 'critters',
    tower: forType('spike', (s) => {
      const a = firstAttack(s);
      if (a && a.kind === 'shoot') a.proj.pierce += 1;
    }),
  },
  {
    id: 'boomer',
    name: 'Extra Powder',
    desc: 'Boomer explosions are 12% bigger.',
    icon: '💣',
    branch: 'critters',
    tower: forType('boomer', (s) => {
      const a = firstAttack(s);
      if (a && a.kind === 'shoot' && a.proj.explode) a.proj.explode.radius *= 1.12;
    }),
  },
  {
    id: 'frost',
    name: 'Cold Feet',
    desc: 'Frosty freezes last 20% longer.',
    icon: '❄️',
    branch: 'critters',
    requires: 'spike',
    tower: forType('frost', (s) => {
      const a = firstAttack(s);
      if (a && a.kind === 'pulse') for (const st of a.statuses) if (st.kind === 'freeze' && st.duration) st.duration *= 1.2;
    }),
  },
  {
    id: 'hoot',
    name: 'Quick Scope',
    desc: 'Scopes shoot 10% faster.',
    icon: '🔭',
    branch: 'critters',
    requires: 'boomer',
    tower: forType('hoot', (s) => {
      const a = firstAttack(s);
      if (a) a.rate *= 0.9;
    }),
  },
  {
    id: 'range',
    name: 'Lookout',
    desc: 'Every bandit gets +5% range.',
    icon: '📡',
    branch: 'critters',
    requires: 'frost',
    tower: (t, s) => {
      if (s.range < 3000 && !t.isHero) s.range *= 1.05;
    },
  },
  {
    id: 'camo',
    name: 'Sharp Senses',
    desc: 'Slinger and Mystic see Camo stars from the start.',
    icon: '👁️',
    branch: 'critters',
    requires: 'hoot',
    tower: (t, s) => {
      if (t.typeId === 'spike' || t.typeId === 'ember') s.camo = true;
    },
  },
  // heroes
  { id: 'hero1', name: 'Hero Training', desc: 'Heroes start at level 2.', icon: '⭐', branch: 'heroes' },
  { id: 'hero2', name: 'Fast Learner', desc: 'Heroes earn 25% more XP.', icon: '📚', branch: 'heroes', requires: 'hero1' },
  { id: 'hero3', name: 'Veteran', desc: 'Heroes start at level 4.', icon: '🎖️', branch: 'heroes', requires: 'hero2' },
  { id: 'herocost', name: 'Fan Club', desc: 'Heroes cost 15% less.', icon: '💖', branch: 'heroes', requires: 'hero1' },
  // power
  { id: 'frenzy1', name: 'Hot Streak', desc: 'FRENZY lasts 3 seconds longer.', icon: '🔥', branch: 'power' },
  { id: 'frenzy2', name: 'Fired Up', desc: 'The FRENZY meter fills 20% faster.', icon: '⚡', branch: 'power', requires: 'frenzy1' },
  { id: 'lives', name: 'Thick Fur', desc: '+15 lives (not in Champion mode).', icon: '❤️', branch: 'power' },
  { id: 'abilities', name: 'Quick Recharge', desc: 'Abilities recharge 10% faster.', icon: '♻️', branch: 'power', requires: 'frenzy1' },
  { id: 'bonds', name: 'Strong Bonds', desc: 'Bond partners can be 20% further apart.', icon: '🔗', branch: 'power', requires: 'lives' },
];

export const PERK_BY_ID: Record<string, PerkDef> = Object.fromEntries(PERKS.map((p) => [p.id, p]));
