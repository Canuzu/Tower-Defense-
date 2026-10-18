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
  name: 'Meadow Mile',
  tier: 'Beginner',
  theme: 'meadow',
  desc: 'A long, lazy track through Critter Valley. The perfect place to learn.',
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
    { kind: 'pond', x: 300, y: 285, r: 78, ry: 52, blocks: true },
    { kind: 'tree', x: 600, y: 120, r: 46, blocks: true },
    { kind: 'tree', x: 680, y: 470, r: 40, blocks: true },
    { kind: 'tree', x: 910, y: 520, r: 52, blocks: true },
    { kind: 'tree', x: 1240, y: 470, r: 44, blocks: true },
    { kind: 'tree', x: 1540, y: 820, r: 50, blocks: true },
    { kind: 'tree', x: 60, y: 820, r: 48, blocks: true },
    { kind: 'tree', x: 1250, y: 80, r: 42, blocks: true },
    { kind: 'rock', x: 905, y: 140, r: 26, blocks: true },
    { kind: 'rock', x: 470, y: 570, r: 22, blocks: true },
    { kind: 'rock', x: 1545, y: 420, r: 24, blocks: true },
    { kind: 'bush', x: 1180, y: 330, r: 22, blocks: true },
    { kind: 'bush', x: 580, y: 300, r: 20, blocks: true },
    { kind: 'stump', x: 330, y: 580, r: 18, blocks: true },
    { kind: 'mushroom', x: 920, y: 640, r: 14, blocks: true },
    { kind: 'bush', x: 60, y: 300, r: 22, blocks: true },
  ],
};

const caverns: MapDef = {
  id: 'caverns',
  name: 'Crystal Caverns',
  tier: 'Intermediate',
  theme: 'cave',
  desc: 'Glittering tunnels where the track doubles back on itself. Mind the pits.',
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
    { kind: 'pit', x: 630, y: 470, r: 70, blocks: true },
    { kind: 'pit', x: 1430, y: 560, r: 64, blocks: true },
    { kind: 'crystal', x: 180, y: 360, r: 40, blocks: true },
    { kind: 'crystal', x: 1030, y: 400, r: 38, blocks: true },
    { kind: 'crystal', x: 980, y: 840, r: 34, blocks: true },
    { kind: 'crystal', x: 1520, y: 330, r: 30, blocks: true },
    { kind: 'crystal', x: 620, y: 80, r: 30, blocks: true },
    { kind: 'crystal', x: 230, y: 830, r: 30, blocks: true },
    { kind: 'boulder', x: 1430, y: 820, r: 34, blocks: true },
    { kind: 'boulder', x: 120, y: 120, r: 32, blocks: true },
    { kind: 'mushroom', x: 1050, y: 560, r: 16, blocks: true },
    { kind: 'mushroom', x: 630, y: 640, r: 14, blocks: true },
  ],
};

const forge: MapDef = {
  id: 'forge',
  name: 'Lava Forge',
  tier: 'Advanced',
  theme: 'lava',
  desc: 'A short, scorching track. Lava rivers leave little room to build.',
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
    { kind: 'lava', x: 260, y: 520, r: 150, ry: 95, blocks: true, rot: -0.2 },
    { kind: 'lava', x: 880, y: 330, r: 120, ry: 80, blocks: true, rot: 0.3 },
    { kind: 'lava', x: 1380, y: 650, r: 150, ry: 100, blocks: true, rot: 0.15 },
    { kind: 'lava', x: 1400, y: 80, r: 120, ry: 50, blocks: true },
    { kind: 'vent', x: 760, y: 120, r: 28, blocks: true },
    { kind: 'vent', x: 360, y: 830, r: 28, blocks: true },
    { kind: 'boulder', x: 1100, y: 840, r: 36, blocks: true },
    { kind: 'boulder', x: 70, y: 70, r: 30, blocks: true },
    { kind: 'rock', x: 760, y: 500, r: 26, blocks: true },
  ],
};

const rivers: MapDef = {
  id: 'rivers',
  name: 'Twin Rivers',
  tier: 'Expert',
  theme: 'river',
  desc: 'Two short tracks and a river in between. Gloops alternate lanes.',
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
    { kind: 'water', x: 230, y: 450, r: 260, ry: 62, blocks: true },
    { kind: 'water', x: 800, y: 450, r: 190, ry: 46, blocks: true },
    { kind: 'water', x: 1370, y: 450, r: 260, ry: 62, blocks: true },
    { kind: 'tree', x: 800, y: 70, r: 40, blocks: true },
    { kind: 'tree', x: 800, y: 835, r: 40, blocks: true },
    { kind: 'rock', x: 520, y: 450, r: 22, blocks: true },
    { kind: 'rock', x: 1080, y: 450, r: 22, blocks: true },
    { kind: 'bush', x: 1560, y: 60, r: 22, blocks: true },
    { kind: 'bush', x: 40, y: 840, r: 22, blocks: true },
  ],
};

const fjord: MapDef = {
  id: 'fjord',
  name: 'Frosty Fjord',
  tier: 'Intermediate',
  theme: 'snow',
  desc: 'A snowy zig-zag down to the frozen sea. The ice lake leaves odd pockets to build in.',
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
    { kind: 'ice', x: 535, y: 400, r: 105, ry: 70, blocks: true, rot: 0.1 },
    { kind: 'ice', x: 1310, y: 560, r: 100, ry: 64, blocks: true, rot: -0.2 },
    { kind: 'pine', x: 150, y: 330, r: 40, blocks: true },
    { kind: 'pine', x: 90, y: 180, r: 34, blocks: true },
    { kind: 'pine', x: 900, y: 120, r: 38, blocks: true },
    { kind: 'pine', x: 960, y: 820, r: 40, blocks: true },
    { kind: 'pine', x: 600, y: 820, r: 36, blocks: true },
    { kind: 'pine', x: 1560, y: 120, r: 34, blocks: true },
    { kind: 'pine', x: 1230, y: 800, r: 38, blocks: true },
    { kind: 'snowman', x: 910, y: 380, r: 26, blocks: true },
    { kind: 'rock', x: 190, y: 800, r: 26, blocks: true },
    { kind: 'rock', x: 1300, y: 380, r: 22, blocks: true },
  ],
};

const candy: MapDef = {
  id: 'candy',
  name: 'Candy Lane',
  tier: 'Advanced',
  theme: 'candy',
  desc: 'A sugary track between chocolate rivers. Sweet, short and very dangerous.',
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
    { kind: 'choco', x: 290, y: 580, r: 210, ry: 92, blocks: true, rot: -0.12 },
    { kind: 'choco', x: 1320, y: 580, r: 220, ry: 98, blocks: true, rot: 0.12 },
    { kind: 'lollipop', x: 800, y: 300, r: 34, blocks: true },
    { kind: 'lollipop', x: 120, y: 330, r: 30, blocks: true },
    { kind: 'lollipop', x: 1500, y: 330, r: 30, blocks: true },
    { kind: 'cupcake', x: 800, y: 520, r: 32, blocks: true },
    { kind: 'cupcake', x: 300, y: 70, r: 26, blocks: true },
    { kind: 'cupcake', x: 1300, y: 70, r: 26, blocks: true },
    { kind: 'gumdrop', x: 700, y: 440, r: 22, blocks: true },
    { kind: 'gumdrop', x: 900, y: 440, r: 22, blocks: true },
    { kind: 'gumdrop', x: 800, y: 840, r: 24, blocks: true },
    { kind: 'gumdrop', x: 60, y: 840, r: 22, blocks: true },
    { kind: 'gumdrop', x: 1550, y: 850, r: 22, blocks: true },
  ],
};

export const MAPS: MapDef[] = [meadow, caverns, fjord, forge, candy, rivers];
export const MAP_BY_ID: Record<string, MapDef> = Object.fromEntries(MAPS.map((m) => [m.id, m]));
