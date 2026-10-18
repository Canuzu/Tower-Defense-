import type { DamageType } from './types';

export type GloopId =
  | 'red'
  | 'blue'
  | 'green'
  | 'yellow'
  | 'pink'
  | 'black'
  | 'white'
  | 'purple'
  | 'zebra'
  | 'lead'
  | 'rainbow'
  | 'ceramic'
  | 'moab'
  | 'bfb'
  | 'zomg'
  | 'ddt'
  | 'bad'
  | 'golden';

export interface GloopDef {
  id: GloopId;
  name: string;
  /** primary body color */
  color: string;
  /** secondary/accent color */
  accent: string;
  hp: number;
  /** relative speed, 1 = Cherry gloop */
  speed: number;
  radius: number;
  children: GloopId[];
  immune: DamageType[];
  /** boss-class (big HP bar, resists crowd control) */
  boss?: boolean;
  /** heavy layers get double HP when fortified */
  fortifiable?: boolean;
  /** always camo (Phantom) */
  camo?: boolean;
  /** tier for "strong" targeting & boss tongue checks */
  tier: number;
  desc: string;
}

export const BASE_SPEED = 85; // px / s for speed 1.0

export const GLOOPS: Record<GloopId, GloopDef> = {
  red: { id: 'red', name: 'Cherry', color: '#ff3b4e', accent: '#ff9aa5', hp: 1, speed: 1, radius: 13, children: [], immune: [], tier: 1, desc: 'The humble gloop. One hit and it splats.' },
  blue: { id: 'blue', name: 'Berry', color: '#2f8bff', accent: '#9cc8ff', hp: 1, speed: 1.4, radius: 14, children: ['red'], immune: [], tier: 2, desc: 'A little faster. Splits into a Cherry.' },
  green: { id: 'green', name: 'Lime', color: '#36d05a', accent: '#a5f2b5', hp: 1, speed: 1.8, radius: 15, children: ['blue'], immune: [], tier: 3, desc: 'Zippy and zesty.' },
  yellow: { id: 'yellow', name: 'Lemon', color: '#ffd23c', accent: '#fff2a8', hp: 1, speed: 3.2, radius: 15.5, children: ['green'], immune: [], tier: 4, desc: 'Very fast. Do not blink.' },
  pink: { id: 'pink', name: 'Bubblegum', color: '#ff6fcf', accent: '#ffc4ec', hp: 1, speed: 3.5, radius: 16, children: ['yellow'], immune: [], tier: 5, desc: 'The fastest of the basic gloops.' },
  black: { id: 'black', name: 'Licorice', color: '#2a2433', accent: '#7c6a96', hp: 1, speed: 1.8, radius: 11, children: ['pink', 'pink'], immune: ['explosive'], tier: 6, desc: 'Small and chewy. Immune to explosions.' },
  white: { id: 'white', name: 'Frosting', color: '#f4f8ff', accent: '#b9d4ff', hp: 1, speed: 2, radius: 11, children: ['pink', 'pink'], immune: ['cold'], tier: 6, desc: 'Already ice-cold. Immune to freezing.' },
  purple: { id: 'purple', name: 'Grape', color: '#9b4dff', accent: '#d2b2ff', hp: 1, speed: 3, radius: 15.5, children: ['pink', 'pink'], immune: ['energy', 'fire'], tier: 6, desc: 'Absorbs magic, fire and lightning.' },
  zebra: { id: 'zebra', name: 'Swirl', color: '#f2f2f2', accent: '#26222e', hp: 1, speed: 1.8, radius: 16, children: ['black', 'white'], immune: ['explosive', 'cold'], tier: 7, desc: 'Licorice + Frosting. Ignores bombs and ice.' },
  lead: { id: 'lead', name: 'Iron', color: '#7d8796', accent: '#d6dde8', hp: 1, speed: 1, radius: 17, children: ['black', 'black'], immune: ['sharp', 'cold'], fortifiable: true, tier: 7, desc: 'Armoured shell. Sharp attacks just bounce off.' },
  rainbow: { id: 'rainbow', name: 'Prism', color: '#ff8a3c', accent: '#ffe066', hp: 1, speed: 2.2, radius: 18, children: ['zebra', 'zebra'], immune: [], tier: 8, desc: 'Shimmering and packed with layers.' },
  ceramic: { id: 'ceramic', name: 'Crystal', color: '#d9894a', accent: '#ffd0a1', hp: 10, speed: 2.5, radius: 19, children: ['rainbow', 'rainbow'], immune: [], fortifiable: true, tier: 9, desc: 'A tough crystal shell protects two Prisms.' },
  moab: { id: 'moab', name: 'Glob', color: '#3ec7e6', accent: '#b6f3ff', hp: 200, speed: 1, radius: 46, children: ['ceramic', 'ceramic', 'ceramic', 'ceramic'], immune: [], boss: true, fortifiable: true, tier: 10, desc: 'A massive wobbling Glob. Hides 4 Crystals.' },
  bfb: { id: 'bfb', name: 'Mega Glob', color: '#ff4d4d', accent: '#ffb3b3', hp: 700, speed: 0.25, radius: 60, children: ['moab', 'moab', 'moab', 'moab'], immune: [], boss: true, fortifiable: true, tier: 11, desc: 'Slow. Enormous. Carries 4 Globs.' },
  zomg: { id: 'zomg', name: 'Titan Glob', color: '#6fdc3a', accent: '#1f3d14', hp: 4000, speed: 0.18, radius: 76, children: ['bfb', 'bfb', 'bfb', 'bfb'], immune: [], boss: true, fortifiable: true, tier: 12, desc: 'An unstoppable titan. Carries 4 Mega Globs.' },
  ddt: { id: 'ddt', name: 'Phantom', color: '#3a3f4a', accent: '#5bffe1', hp: 400, speed: 2.75, radius: 44, children: ['ceramic', 'ceramic', 'ceramic', 'ceramic', 'ceramic', 'ceramic'], immune: ['sharp', 'explosive'], boss: true, fortifiable: true, camo: true, tier: 12, desc: 'Fast, camouflaged and armoured.' },
  golden: { id: 'golden', name: 'Golden Gloop', color: '#ffc61a', accent: '#fff3a8', hp: 8, speed: 2.4, radius: 15, children: [], immune: [], tier: 5, desc: 'A rare shiny gloop. Pop it before it escapes for a big cash bonus!' },
  bad: { id: 'bad', name: 'Gloop Overlord', color: '#8a2be2', accent: '#ffd23c', hp: 20000, speed: 0.18, radius: 96, children: ['zomg', 'zomg', 'ddt', 'ddt', 'ddt'], immune: [], boss: true, fortifiable: true, tier: 13, desc: 'The ruler of all gloops. Good luck.' },
};

export const GLOOP_ORDER: GloopId[] = [
  'red', 'blue', 'green', 'yellow', 'pink', 'black', 'white', 'purple', 'zebra', 'lead', 'rainbow', 'ceramic', 'moab', 'bfb', 'zomg', 'ddt', 'bad', 'golden',
];

const rbeCache = new Map<string, number>();

/** Red-gloop-equivalent: total damage needed to fully clear a gloop including all children. */
export function rbe(id: GloopId, fortified = false): number {
  const key = id + (fortified ? 'F' : '');
  const hit = rbeCache.get(key);
  if (hit !== undefined) return hit;
  const def = GLOOPS[id];
  let total = def.hp * (fortified && def.fortifiable ? 2 : 1);
  for (const c of def.children) total += rbe(c, false);
  rbeCache.set(key, total);
  return total;
}

/**
 * For regrow gloops: map child type -> the type it regrows into, for a given maximum type.
 */
const regrowCache = new Map<GloopId, Map<GloopId, GloopId>>();
export function regrowParent(type: GloopId, max: GloopId): GloopId | null {
  if (type === max) return null;
  let map = regrowCache.get(max);
  if (!map) {
    map = new Map();
    const visit = (id: GloopId) => {
      for (const c of GLOOPS[id].children) {
        if (!map!.has(c)) {
          map!.set(c, id);
          visit(c);
        }
      }
    };
    visit(max);
    regrowCache.set(max, map);
  }
  return map.get(type) ?? null;
}
