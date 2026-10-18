import type { TowerId } from './towerTypes';

export interface SynergyDef {
  id: string;
  a: TowerId;
  b: TowerId;
  name: string;
  /** what each side gets */
  descA: string;
  descB: string;
  color: string;
}

/** Towers of these pairs placed within SYNERGY_RANGE of each other form a Bond. */
export const SYNERGY_RANGE = 175;

export const SYNERGIES: SynergyDef[] = [
  { id: 'spotter', a: 'spike', b: 'hoot', name: 'Spotter', descA: '+15% range, +1 pierce', descB: '+10% attack speed', color: '#ffd166' },
  { id: 'shatter', a: 'boomer', b: 'frost', name: 'Shatter Blast', descA: '+1 damage', descB: '+10% range', color: '#9be7ff' },
  { id: 'thermal', a: 'ember', b: 'frost', name: 'Thermal Shock', descA: '+15% attack speed', descB: '+15% attack speed', color: '#ff9f6b' },
  { id: 'plasma', a: 'ember', b: 'zap', name: 'Plasma Fusion', descA: 'Damages every gloop type', descB: 'Damages every gloop type', color: '#c77dff' },
  { id: 'pollination', a: 'buzz', b: 'acorn', name: 'Pollination', descA: '+15% attack speed', descB: '+25% income', color: '#ffe066' },
  { id: 'stingquill', a: 'spike', b: 'buzz', name: 'Sting Quills', descA: '+1 pierce', descB: '+1 pierce', color: '#f4a261' },
  { id: 'napalm', a: 'boomer', b: 'ember', name: 'Napalm', descA: '+10% attack speed', descB: '+2 pierce', color: '#ff6b35' },
  { id: 'lightningrod', a: 'hoot', b: 'zap', name: 'Lightning Rod', descA: '+1 damage', descB: '+10% range', color: '#7bdff2' },
  { id: 'superconductor', a: 'frost', b: 'zap', name: 'Superconductor', descA: '+10% range', descB: '+20% attack speed', color: '#a0c4ff' },
  { id: 'harvestguard', a: 'acorn', b: 'dojo', name: 'Harvest Guard', descA: '+15% income', descB: '+10% range', color: '#b5e48c' },
  { id: 'packhunt', a: 'boomer', b: 'hoot', name: 'Pack Hunt', descA: '+15% range', descB: 'Camo detection', color: '#e5989b' },
  { id: 'honeyfox', a: 'ember', b: 'buzz', name: 'Smoked Honey', descA: '+1 pierce', descB: '+20% attack speed', color: '#ffb703' },
];

export function synergyBetween(a: TowerId, b: TowerId): SynergyDef | null {
  for (const s of SYNERGIES) {
    if ((s.a === a && s.b === b) || (s.a === b && s.b === a)) return s;
  }
  return null;
}
