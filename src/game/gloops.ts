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
  red: { id: 'red', name: 'Red Dwarf', color: '#ff3b4e', accent: '#ff9aa5', hp: 1, speed: 1, radius: 13, children: [], immune: [], tier: 1, desc: 'A grumpy little star. One hit and it shatters.' },
  blue: { id: 'blue', name: 'Orange Star', color: '#2f8bff', accent: '#9cc8ff', hp: 1, speed: 1.4, radius: 14, children: ['red'], immune: [], tier: 2, desc: 'A little faster. Cracks into a Red Dwarf.' },
  green: { id: 'green', name: 'Yellow Star', color: '#36d05a', accent: '#a5f2b5', hp: 1, speed: 1.8, radius: 15, children: ['blue'], immune: [], tier: 3, desc: 'Zippy and very smug.' },
  yellow: { id: 'yellow', name: 'White Star', color: '#ffd23c', accent: '#fff2a8', hp: 1, speed: 3.2, radius: 15.5, children: ['green'], immune: [], tier: 4, desc: 'A grinning racer. Do not blink.' },
  pink: { id: 'pink', name: 'Blue Star', color: '#ff6fcf', accent: '#ffc4ec', hp: 1, speed: 3.5, radius: 16, children: ['yellow'], immune: [], tier: 5, desc: 'Furious, and the fastest of the basic stars.' },
  black: { id: 'black', name: 'Black Hole', color: '#2a2433', accent: '#7c6a96', hp: 1, speed: 1.8, radius: 11, children: ['pink', 'pink'], immune: ['explosive'], tier: 6, desc: 'A swirling vortex. Swallows explosions whole.' },
  white: { id: 'white', name: 'Ice Star', color: '#f4f8ff', accent: '#b9d4ff', hp: 1, speed: 2, radius: 11, children: ['pink', 'pink'], immune: ['cold'], tier: 6, desc: 'Frosted solid. Immune to freezing.' },
  purple: { id: 'purple', name: 'Nebula', color: '#9b4dff', accent: '#d2b2ff', hp: 1, speed: 3, radius: 15.5, children: ['pink', 'pink'], immune: ['energy', 'fire'], tier: 6, desc: 'A swirling cloud. Absorbs magic, fire and lightning.' },
  zebra: { id: 'zebra', name: 'Eclipse', color: '#f2f2f2', accent: '#26222e', hp: 1, speed: 1.8, radius: 16, children: ['black', 'white'], immune: ['explosive', 'cold'], tier: 7, desc: 'Half Black Hole, half Ice Star. Ignores bombs and ice.' },
  lead: { id: 'lead', name: 'Meteor', color: '#7d8796', accent: '#d6dde8', hp: 1, speed: 1, radius: 17, children: ['black', 'black'], immune: ['sharp', 'cold'], fortifiable: true, tier: 7, desc: 'Iron-rock armour. Sharp hits just bounce off.' },
  rainbow: { id: 'rainbow', name: 'Aurora', color: '#ff8a3c', accent: '#ffe066', hp: 1, speed: 2.2, radius: 18, children: ['zebra', 'zebra'], immune: [], tier: 8, desc: 'A shimmering rainbow star packed with layers.' },
  ceramic: { id: 'ceramic', name: 'Diamond', color: '#d9894a', accent: '#ffd0a1', hp: 10, speed: 2.5, radius: 19, children: ['rainbow', 'rainbow'], immune: [], fortifiable: true, tier: 9, desc: 'A tough diamond shell protects two Auroras.' },
  moab: { id: 'moab', name: 'Comet', color: '#3ec7e6', accent: '#b6f3ff', hp: 200, speed: 1, radius: 46, children: ['ceramic', 'ceramic', 'ceramic', 'ceramic'], immune: [], boss: true, fortifiable: true, tier: 10, desc: 'A huge icy comet with a flaming tail. Carries 4 Diamonds.' },
  bfb: { id: 'bfb', name: 'Moon Brute', color: '#ff4d4d', accent: '#ffb3b3', hp: 700, speed: 0.25, radius: 60, children: ['moab', 'moab', 'moab', 'moab'], immune: [], boss: true, fortifiable: true, tier: 11, desc: 'Slow. Cratered. Carries 4 Comets.' },
  zomg: { id: 'zomg', name: 'Ringed Titan', color: '#6fdc3a', accent: '#1f3d14', hp: 4000, speed: 0.18, radius: 76, children: ['bfb', 'bfb', 'bfb', 'bfb'], immune: [], boss: true, fortifiable: true, tier: 12, desc: 'An angry ringed planet. Carries 4 Moon Brutes.' },
  ddt: { id: 'ddt', name: 'Shadow Comet', color: '#3a3f4a', accent: '#5bffe1', hp: 400, speed: 2.75, radius: 44, children: ['ceramic', 'ceramic', 'ceramic', 'ceramic', 'ceramic', 'ceramic'], immune: ['sharp', 'explosive'], boss: true, fortifiable: true, camo: true, tier: 12, desc: 'A sleek dark comet: fast, camouflaged and armoured.' },
  golden: { id: 'golden', name: 'Lucky Star', color: '#ffc61a', accent: '#fff3a8', hp: 8, speed: 2.4, radius: 15, children: [], immune: [], tier: 5, desc: 'A rare shooting star. Shatter it before it escapes for a big cash bonus!' },
  bad: { id: 'bad', name: 'Star Emperor', color: '#8a2be2', accent: '#ffd23c', hp: 20000, speed: 0.18, radius: 96, children: ['zomg', 'zomg', 'ddt', 'ddt', 'ddt'], immune: [], boss: true, fortifiable: true, tier: 13, desc: 'The crowned ruler of all stars. Good luck.' },
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
