// Dumps every map's sampled track polylines and obstacles to art/maps.json (used by the art pipeline).
import { writeFileSync } from 'node:fs';
import { MAPS } from '../../src/game/maps';
import { Path } from '../../src/game/path';

const out = MAPS.map((m) => ({
  id: m.id,
  name: m.name,
  theme: m.theme,
  pathWidth: m.pathWidth,
  obstacles: m.obstacles,
  paths: m.paths.map((p) => {
    const path = new Path(p, 6);
    return Array.from({ length: path.count }, (_, i) => [Math.round(path.xs[i] * 10) / 10, Math.round(path.ys[i] * 10) / 10]);
  }),
}));
writeFileSync('art/maps.json', JSON.stringify(out));
console.log(out.map((m) => `${m.id}: ${m.paths.map((p) => p.length).join('+')} pts, ${m.obstacles.length} obstacles`).join('\n'));
