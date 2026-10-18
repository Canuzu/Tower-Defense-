import { distToSegment } from '../core/math';

/**
 * A smooth track that gloops follow. Built from control points with a Catmull-Rom spline and
 * resampled into a dense polyline with cumulative arc length so position lookups are cheap.
 */
export class Path {
  readonly xs: Float32Array;
  readonly ys: Float32Array;
  readonly cum: Float32Array;
  readonly length: number;
  readonly count: number;

  constructor(
    readonly control: ReadonlyArray<readonly [number, number]>,
    step = 4,
  ) {
    const pts = catmullRom(control, 18);
    // resample to (roughly) uniform spacing
    const xs: number[] = [pts[0][0]];
    const ys: number[] = [pts[0][1]];
    let carry = 0;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const segLen = Math.hypot(bx - ax, by - ay);
      let t = step - carry;
      while (t <= segLen) {
        const f = t / segLen;
        xs.push(ax + (bx - ax) * f);
        ys.push(ay + (by - ay) * f);
        t += step;
      }
      carry = segLen - (t - step);
    }
    const last = pts[pts.length - 1];
    xs.push(last[0]);
    ys.push(last[1]);

    this.count = xs.length;
    this.xs = Float32Array.from(xs);
    this.ys = Float32Array.from(ys);
    this.cum = new Float32Array(this.count);
    let acc = 0;
    for (let i = 1; i < this.count; i++) {
      acc += Math.hypot(this.xs[i] - this.xs[i - 1], this.ys[i] - this.ys[i - 1]);
      this.cum[i] = acc;
    }
    this.length = acc;
  }

  private indexAt(d: number): number {
    if (d <= 0) return 0;
    if (d >= this.length) return this.count - 2;
    let lo = 0;
    let hi = this.count - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** Writes the position at arc length d into out and returns the heading angle. */
  sample(d: number, out: { x: number; y: number }): number {
    const i = this.indexAt(d);
    const segLen = this.cum[i + 1] - this.cum[i] || 1;
    const f = Math.max(0, Math.min(1, (d - this.cum[i]) / segLen));
    const ax = this.xs[i];
    const ay = this.ys[i];
    const bx = this.xs[i + 1];
    const by = this.ys[i + 1];
    out.x = ax + (bx - ax) * f;
    out.y = ay + (by - ay) * f;
    return Math.atan2(by - ay, bx - ax);
  }

  /** Minimum distance from a point to the track centre line. */
  distanceTo(x: number, y: number): number {
    let best = Infinity;
    // coarse stride first, then refine around the best region
    const stride = 6;
    let bestI = 0;
    for (let i = 0; i < this.count - 1; i += stride) {
      const j = Math.min(i + stride, this.count - 1);
      const d = distToSegment(x, y, this.xs[i], this.ys[i], this.xs[j], this.ys[j]);
      if (d < best) {
        best = d;
        bestI = i;
      }
    }
    const lo = Math.max(0, bestI - stride * 2);
    const hi = Math.min(this.count - 1, bestI + stride * 3);
    for (let i = lo; i < hi; i++) {
      const d = distToSegment(x, y, this.xs[i], this.ys[i], this.xs[i + 1], this.ys[i + 1]);
      if (d < best) best = d;
    }
    return best;
  }

  /** Arc length of the point on the track closest to (x, y). */
  nearestDist(x: number, y: number): number {
    let best = Infinity;
    let bestI = 0;
    for (let i = 0; i < this.count; i += 2) {
      const dx = this.xs[i] - x;
      const dy = this.ys[i] - y;
      const d = dx * dx + dy * dy;
      if (d < best) {
        best = d;
        bestI = i;
      }
    }
    return this.cum[bestI];
  }

  /** Arc lengths (sampled every `spacing`) whose track point lies within `r` of (x, y). */
  distsWithin(x: number, y: number, r: number, spacing = 12): number[] {
    const out: number[] = [];
    const r2 = r * r;
    const tmp = { x: 0, y: 0 };
    for (let d = 0; d <= this.length; d += spacing) {
      this.sample(d, tmp);
      const dx = tmp.x - x;
      const dy = tmp.y - y;
      if (dx * dx + dy * dy <= r2) out.push(d);
    }
    return out;
  }
}

function catmullRom(points: ReadonlyArray<readonly [number, number]>, segs: number): [number, number][] {
  const out: [number, number][] = [];
  const n = points.length;
  const get = (i: number) => points[Math.max(0, Math.min(n - 1, i))];
  for (let i = 0; i < n - 1; i++) {
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    for (let s = 0; s < segs; s++) {
      const t = s / segs;
      const t2 = t * t;
      const t3 = t2 * t;
      const x =
        0.5 *
        (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const y =
        0.5 *
        (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push([x, y]);
    }
  }
  out.push([points[n - 1][0], points[n - 1][1]]);
  return out;
}
