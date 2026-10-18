/**
 * Uniform spatial hash used for fast "which enemies are near this point" queries.
 * Rebuilt every simulation tick (cheap: O(n)).
 */
export interface Positioned {
  x: number;
  y: number;
  radius: number;
  /** Query stamp used internally to de-duplicate results. */
  _q: number;
}

let queryStamp = 1;

export class SpatialGrid<T extends Positioned> {
  private cells = new Map<number, T[]>();
  private pool: T[][] = [];

  constructor(private cellSize = 64) {}

  private key(cx: number, cy: number) {
    return ((cx + 512) << 11) | (cy + 512);
  }

  clear() {
    for (const arr of this.cells.values()) {
      arr.length = 0;
      this.pool.push(arr);
    }
    this.cells.clear();
  }

  insert(item: T) {
    const cs = this.cellSize;
    const minX = Math.floor((item.x - item.radius) / cs);
    const maxX = Math.floor((item.x + item.radius) / cs);
    const minY = Math.floor((item.y - item.radius) / cs);
    const maxY = Math.floor((item.y + item.radius) / cs);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const k = this.key(cx, cy);
        let arr = this.cells.get(k);
        if (!arr) {
          arr = this.pool.pop() ?? [];
          this.cells.set(k, arr);
        }
        arr.push(item);
      }
    }
  }

  /**
   * Collect every item whose cell overlaps the AABB (de-duplicated).
   */
  queryRect(x0: number, y0: number, x1: number, y1: number, out: T[]): T[] {
    out.length = 0;
    const stamp = ++queryStamp;
    const cs = this.cellSize;
    const minX = Math.floor(x0 / cs);
    const maxX = Math.floor(x1 / cs);
    const minY = Math.floor(y0 / cs);
    const maxY = Math.floor(y1 / cs);
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cy = minY; cy <= maxY; cy++) {
        const arr = this.cells.get(this.key(cx, cy));
        if (!arr) continue;
        for (let i = 0; i < arr.length; i++) {
          const it = arr[i];
          if (it._q !== stamp) {
            it._q = stamp;
            out.push(it);
          }
        }
      }
    }
    return out;
  }

  queryCircle(x: number, y: number, r: number, out: T[]): T[] {
    this.queryRect(x - r, y - r, x + r, y + r, out);
    let w = 0;
    for (let i = 0; i < out.length; i++) {
      const it = out[i];
      const dx = it.x - x;
      const dy = it.y - y;
      const rr = r + it.radius;
      if (dx * dx + dy * dy <= rr * rr) out[w++] = it;
    }
    out.length = w;
    return out;
  }
}
