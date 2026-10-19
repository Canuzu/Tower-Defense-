export const WORLD_W = 1600;
export const WORLD_H = 900;

export type MapTheme = 'meadow' | 'cave' | 'lava' | 'river' | 'snow' | 'candy';

export interface Obstacle {
  kind:
    | 'tree'
    | 'rock'
    | 'pond'
    | 'bush'
    | 'crystal'
    | 'pit'
    | 'lava'
    | 'mushroom'
    | 'stump'
    | 'water'
    | 'boulder'
    | 'vent'
    | 'pine'
    | 'snowman'
    | 'ice'
    | 'lollipop'
    | 'gumdrop'
    | 'cupcake'
    | 'choco';
  x: number;
  y: number;
  r: number;
  /** blocks tower placement */
  blocks: boolean;
  /** extra radii for ellipse ponds / lakes */
  ry?: number;
  rot?: number;
}

export interface MapDef {
  id: string;
  name: string;
  tier: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  theme: MapTheme;
  desc: string;
  paths: [number, number][][];
  pathWidth: number;
  obstacles: Obstacle[];
  seed: number;
  /** number of medals on the previous map required to unlock */
  unlockMedals: number;
}

const meadow: MapDef = {
  id: 'meadow',
  name: 'Raccoon Meadow',
  tier: 'Beginner',
  theme: 'meadow',
  desc: 'A long, lazy dirt path past a sunny pond. The perfect place to learn.',
  pathWidth: 58,
  seed: 11,
  unlockMedals: 0,
  paths: [
    [
      [-60, 150], [380, 150], [470, 205], [485, 330], [405, 410], [235, 418], [158, 490], [165, 650], [250, 735],
      [650, 735], [740, 655], [748, 335], [820, 252], [985, 252], [1062, 335], [1070, 640], [1150, 735],
      [1330, 735], [1412, 650], [1415, 265], [1480, 165], [1660, 158],
    ],
  ],
  obstacles: [
    { kind: 'rock', x: 1200, y: 584, r: 18, blocks: true }, // tin can
    { kind: 'pond', x: 302, y: 284, r: 86, ry: 55, blocks: true },
    { kind: 'tree', x: 607, y: 112, r: 54, blocks: true },
    { kind: 'tree', x: 683, y: 458, r: 49, blocks: true },
    { kind: 'tree', x: 903, y: 492, r: 62, blocks: true },
    { kind: 'tree', x: 1243, y: 462, r: 54, blocks: true },
    { kind: 'tree', x: 1533, y: 810, r: 56, blocks: true },
    { kind: 'tree', x: 60, y: 803, r: 58, blocks: true },
    { kind: 'tree', x: 1245, y: 70, r: 52, blocks: true },
    { kind: 'rock', x: 907, y: 137, r: 30, blocks: true },
    { kind: 'rock', x: 475, y: 567, r: 28, blocks: true },
    { kind: 'rock', x: 1537, y: 410, r: 31, blocks: true },
    { kind: 'bush', x: 1183, y: 327, r: 32, blocks: true },
    { kind: 'bush', x: 588, y: 290, r: 29, blocks: true },
    { kind: 'stump', x: 328, y: 570, r: 23, blocks: true },
    { kind: 'mushroom', x: 915, y: 637, r: 18, blocks: true },
    { kind: 'bush', x: 60, y: 296, r: 30, blocks: true },
  ],
};

const caverns: MapDef = {
  id: 'caverns',
  name: 'Crystal Mine',
  tier: 'Intermediate',
  theme: 'cave',
  desc: 'Lantern-lit mine tunnels where the track doubles back on itself. Mind the pits.',
  pathWidth: 56,
  seed: 23,
  unlockMedals: 1,
  paths: [
    [
      [-60, 700], [340, 700], [430, 615], [432, 255], [515, 168], [745, 168], [830, 255], [832, 615], [915, 702],
      [1145, 702], [1230, 615], [1232, 255], [1315, 168], [1660, 168],
    ],
  ],
  obstacles: [
    { kind: 'rock', x: 1466, y: 46, r: 34, blocks: true }, // mine cart
    { kind: 'rock', x: 798, y: 830, r: 30, blocks: true }, // crates
    { kind: 'rock', x: 45, y: 332, r: 17, blocks: true }, // lantern
    { kind: 'rock', x: 1355, y: 752, r: 17, blocks: true }, // lantern
    { kind: 'pit', x: 630, y: 468, r: 74, blocks: true },
    { kind: 'pit', x: 1430, y: 555, r: 68, blocks: true },
    { kind: 'crystal', x: 185, y: 350, r: 50, blocks: true },
    { kind: 'crystal', x: 1030, y: 390, r: 47, blocks: true },
    { kind: 'crystal', x: 978, y: 828, r: 42, blocks: true },
    { kind: 'crystal', x: 1518, y: 318, r: 40, blocks: true },
    { kind: 'crystal', x: 620, y: 72, r: 37, blocks: true },
    { kind: 'crystal', x: 228, y: 816, r: 42, blocks: true },
    { kind: 'boulder', x: 1438, y: 812, r: 42, blocks: true },
    { kind: 'boulder', x: 115, y: 116, r: 38, blocks: true },
    { kind: 'mushroom', x: 1050, y: 553, r: 20, blocks: true },
    { kind: 'mushroom', x: 630, y: 635, r: 20, blocks: true },
  ],
};

const forge: MapDef = {
  id: 'forge',
  name: 'Scrap Foundry',
  tier: 'Advanced',
  theme: 'lava',
  desc: 'A short, scorching junkyard track. Molten metal leaves little room to build.',
  pathWidth: 56,
  seed: 37,
  unlockMedals: 2,
  paths: [
    [
      [-60, 210], [470, 210], [585, 300], [600, 560], [700, 690], [1000, 700], [1100, 600], [1110, 420], [1200, 330],
      [1660, 330],
    ],
  ],
  obstacles: [
    { kind: 'rock', x: 1205, y: 200, r: 28, blocks: true }, // barrels
    { kind: 'rock', x: 663, y: 822, r: 34, blocks: true }, // crates
    { kind: 'rock', x: 1506, y: 226, r: 28, blocks: true }, // pallet
    { kind: 'rock', x: 1566, y: 495, r: 26, blocks: true }, // pallet
    { kind: 'rock', x: 467, y: 45, r: 22, blocks: true }, // tyres
    { kind: 'rock', x: 655, y: 126, r: 20, blocks: true }, // tyre
    { kind: 'rock', x: 1393, y: 473, r: 20, blocks: true }, // tyre
    { kind: 'rock', x: 90, y: 352, r: 22, blocks: true }, // crate
    { kind: 'lava', x: 254, y: 518, r: 155, ry: 100, blocks: true, rot: -0.1 },
    { kind: 'lava', x: 878, y: 323, r: 140, ry: 94, blocks: true, rot: 0.12 },
    { kind: 'lava', x: 1378, y: 648, r: 168, ry: 106, blocks: true, rot: 0.08 },
    { kind: 'lava', x: 1400, y: 78, r: 143, ry: 62, blocks: true },
    { kind: 'vent', x: 762, y: 120, r: 30, blocks: true },
    { kind: 'vent', x: 360, y: 828, r: 30, blocks: true },
    { kind: 'boulder', x: 1097, y: 830, r: 46, blocks: true },
    { kind: 'boulder', x: 62, y: 75, r: 50, blocks: true },
    { kind: 'rock', x: 765, y: 505, r: 44, blocks: true },
  ],
};

const rivers: MapDef = {
  id: 'rivers',
  name: 'Twin Rivers',
  tier: 'Expert',
  theme: 'river',
  desc: 'Two short forest tracks with creeks in between. Stars alternate lanes.',
  pathWidth: 54,
  seed: 51,
  unlockMedals: 3,
  paths: [
    [
      [-60, 170], [470, 170], [590, 285], [1010, 285], [1130, 170], [1660, 170],
    ],
    [
      [-60, 730], [470, 730], [590, 615], [1010, 615], [1130, 730], [1660, 730],
    ],
  ],
  obstacles: [
    { kind: 'stump', x: 452, y: 83, r: 54, ry: 22, rot: 0.38, blocks: true }, // log
    { kind: 'stump', x: 1152, y: 821, r: 52, ry: 22, rot: 0.3, blocks: true }, // log
    { kind: 'water', x: 238, y: 446, r: 252, ry: 68, blocks: true },
    { kind: 'water', x: 798, y: 444, r: 197, ry: 56, blocks: true },
    { kind: 'water', x: 1366, y: 443, r: 255, ry: 70, blocks: true },
    { kind: 'tree', x: 796, y: 58, r: 58, blocks: true },
    { kind: 'tree', x: 800, y: 830, r: 58, blocks: true },
    { kind: 'rock', x: 520, y: 442, r: 28, blocks: true },
    { kind: 'rock', x: 1075, y: 442, r: 28, blocks: true },
    { kind: 'bush', x: 1556, y: 48, r: 38, blocks: true },
    { kind: 'bush', x: 28, y: 610, r: 36, blocks: true },
  ],
};

const fjord: MapDef = {
  id: 'fjord',
  name: 'Frozen Lake',
  tier: 'Intermediate',
  theme: 'snow',
  desc: 'A snowy zig-zag between the pines. The frozen lake leaves odd pockets to build in.',
  pathWidth: 56,
  seed: 61,
  unlockMedals: 0,
  paths: [
    [
      [-60, 625], [255, 625], [340, 540], [342, 232], [425, 150], [640, 150], [722, 232], [724, 520], [805, 602],
      [1020, 602], [1102, 520], [1104, 300], [1186, 218], [1418, 218], [1500, 300], [1505, 980],
    ],
  ],
  obstacles: [
    { kind: 'rock', x: 1069, y: 111, r: 30, ry: 18, rot: -0.35, blocks: true }, // sled
    { kind: 'rock', x: 1084, y: 736, r: 50, ry: 16, rot: -0.12, blocks: true }, // fence
    { kind: 'ice', x: 533, y: 398, r: 106, ry: 70, blocks: true, rot: 0.05 },
    { kind: 'ice', x: 1310, y: 557, r: 107, ry: 64, blocks: true, rot: -0.06 },
    { kind: 'pine', x: 155, y: 323, r: 44, blocks: true },
    { kind: 'pine', x: 87, y: 172, r: 44, blocks: true },
    { kind: 'pine', x: 898, y: 112, r: 47, blocks: true },
    { kind: 'pine', x: 955, y: 800, r: 47, blocks: true },
    { kind: 'pine', x: 602, y: 805, r: 46, blocks: true },
    { kind: 'pine', x: 1550, y: 112, r: 44, blocks: true },
    { kind: 'pine', x: 1234, y: 795, r: 46, blocks: true },
    { kind: 'snowman', x: 904, y: 372, r: 30, blocks: true },
    { kind: 'rock', x: 182, y: 782, r: 32, blocks: true },
    { kind: 'rock', x: 1302, y: 378, r: 27, blocks: true },
  ],
};

const candy: MapDef = {
  id: 'candy',
  name: 'Candy Lane',
  tier: 'Advanced',
  theme: 'candy',
  desc: "A sugary track through a sweet shop's backyard. Sweet, short and very dangerous.",
  pathWidth: 56,
  seed: 73,
  unlockMedals: 0,
  paths: [
    [
      [-60, 180], [515, 180], [600, 262], [602, 638], [684, 720], [916, 720], [998, 638], [1000, 262], [1082, 180],
      [1660, 180],
    ],
  ],
  obstacles: [
    { kind: 'cupcake', x: 738, y: 126, r: 26, blocks: true }, // painted cupcake
    { kind: 'choco', x: 290, y: 572, r: 207, ry: 205, blocks: true },
    { kind: 'choco', x: 1321, y: 570, r: 209, ry: 209, blocks: true },
    { kind: 'lollipop', x: 795, y: 295, r: 48, blocks: true },
    { kind: 'lollipop', x: 116, y: 333, r: 47, blocks: true },
    { kind: 'lollipop', x: 1502, y: 333, r: 47, blocks: true },
    { kind: 'cupcake', x: 800, y: 510, r: 36, blocks: true },
    { kind: 'cupcake', x: 311, y: 68, r: 48, blocks: true },
    { kind: 'cupcake', x: 1281, y: 68, r: 48, blocks: true },
    { kind: 'gumdrop', x: 702, y: 438, r: 27, blocks: true },
    { kind: 'gumdrop', x: 902, y: 438, r: 27, blocks: true },
    { kind: 'gumdrop', x: 800, y: 836, r: 28, blocks: true },
    { kind: 'gumdrop', x: 57, y: 836, r: 28, blocks: true },
    { kind: 'gumdrop', x: 1548, y: 840, r: 28, blocks: true },
  ],
};

export const MAPS: MapDef[] = [meadow, caverns, fjord, forge, candy, rivers];
export const MAP_BY_ID: Record<string, MapDef> = Object.fromEntries(MAPS.map((m) => [m.id, m]));
