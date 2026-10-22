/**
 * Placement aids (design plan A2): the hatched "nothing can stand here" overlay that is rastered once
 * when a drag starts, and the range ring (screen-px line with a dark halo and a role-coloured fill).
 * Everything here reuses its canvases and dash arrays, so drawing it costs no allocations per frame.
 */
import { TAU } from '../core/math';

/** world units per overlay cell (the bilinear upscale of the cell grid gives the soft edges) */
const CELL = 8;
/** overlay canvas: at most this many px on its longer side */
const MAX_PX = 1500;

const DASH = [0, 0];
const NO_DASH: number[] = [];

/** Range fill per role (the --role-* tokens at low alpha). */
export const ROLE_FILL: Record<string, string> = {
  Primary: 'rgba(54,180,255,0.17)',
  Military: 'rgba(141,177,60,0.22)',
  Magic: 'rgba(208,92,255,0.17)',
  Support: 'rgba(255,143,46,0.18)',
  Hero: 'rgba(255,207,63,0.17)',
};
const INVALID_FILL = 'rgba(255,60,80,0.17)';

/** Small red-hatch tile (faint tint + diagonal stripes); `px` is the stripe spacing. */
function hatchTile(px: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const x = c.getContext('2d')!;
  x.fillStyle = 'rgba(255,64,88,0.09)';
  x.fillRect(0, 0, px, px);
  x.strokeStyle = 'rgba(255,74,98,0.46)';
  x.lineWidth = Math.max(1.6, px * 0.2);
  x.lineCap = 'square';
  x.beginPath();
  // three segments so the stripes tile seamlessly
  x.moveTo(-px * 0.5, px * 0.5);
  x.lineTo(px * 0.5, -px * 0.5);
  x.moveTo(0, px);
  x.lineTo(px, 0);
  x.moveTo(px * 0.5, px * 1.5);
  x.lineTo(px * 1.5, px * 0.5);
  x.stroke();
  return c;
}

export class PlaceOverlay {
  /** drawn while true (fades in) */
  active = false;
  alpha = 0;
  /** world rect the overlay canvas covers */
  x0 = 0;
  y0 = 0;
  w = 0;
  h = 0;
  canvas: HTMLCanvasElement | null = null;
  private small: HTMLCanvasElement | null = null;
  private tile: HTMLCanvasElement | null = null;
  private screenPattern: CanvasPattern | null = null;
  /** screen-space rects (css px) under the HUD that block placement too: x0, y0, x1, y1 each */
  readonly uiRects = new Float64Array(16);
  uiCount = 0;

  /**
   * Rasters `blocked(x, y)` (true = a ghost centred there is invalid) over the visible world rect
   * into the hatched overlay. Runs once per drag start (a few ms on a big map).
   */
  build(blocked: (x: number, y: number) => boolean, view: { x0: number; y0: number; x1: number; y1: number }, scale: number) {
    const gx0 = Math.floor(view.x0 / CELL);
    const gy0 = Math.floor(view.y0 / CELL);
    const cw = Math.max(1, Math.ceil(view.x1 / CELL) - gx0 + 1);
    const ch = Math.max(1, Math.ceil(view.y1 / CELL) - gy0 + 1);
    const small = (this.small ??= document.createElement('canvas'));
    if (small.width !== cw || small.height !== ch) {
      small.width = cw;
      small.height = ch;
    }
    const sctx = small.getContext('2d')!;
    const img = sctx.createImageData(cw, ch);
    const d = img.data;
    for (let y = 0; y < ch; y++) {
      const wy = (gy0 + y + 0.5) * CELL;
      for (let x = 0; x < cw; x++) {
        if (!blocked((gx0 + x + 0.5) * CELL, wy)) continue;
        const i = (y * cw + x) * 4;
        d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 255;
      }
    }
    sctx.putImageData(img, 0, 0);
    // css-px resolution of the current camera (capped), so the stripes have the same width everywhere
    const k = Math.min(scale, MAX_PX / (Math.max(cw, ch) * CELL));
    const W = Math.max(1, Math.round(cw * CELL * k));
    const H = Math.max(1, Math.round(ch * CELL * k));
    const c = (this.canvas ??= document.createElement('canvas'));
    if (c.width !== W || c.height !== H) {
      c.width = W;
      c.height = H;
    }
    const o = c.getContext('2d')!;
    o.globalCompositeOperation = 'source-over';
    o.clearRect(0, 0, W, H);
    o.imageSmoothingEnabled = true;
    o.imageSmoothingQuality = 'high';
    // cell centres land on their own spot: the bilinear ramp between them is the soft edge
    o.drawImage(small, 0, 0, cw, ch, 0, 0, W, H);
    o.globalCompositeOperation = 'source-in';
    this.tile ??= hatchTile(10);
    o.fillStyle = o.createPattern(this.tile, 'repeat')!;
    o.fillRect(0, 0, W, H);
    o.globalCompositeOperation = 'source-over';
    this.x0 = gx0 * CELL;
    this.y0 = gy0 * CELL;
    this.w = cw * CELL;
    this.h = ch * CELL;
    this.active = true;
    this.alpha = 0;
  }

  clear() {
    this.active = false;
    this.alpha = 0;
    this.uiCount = 0;
  }

  /** World layer (call with the world transform set). */
  draw(ctx: CanvasRenderingContext2D, dt: number, instant: boolean) {
    if (!this.active || !this.canvas) return;
    this.alpha = instant ? 1 : Math.min(1, this.alpha + dt * 7);
    ctx.globalAlpha = this.alpha;
    ctx.drawImage(this.canvas, this.x0, this.y0, this.w, this.h);
    ctx.globalAlpha = 1;
  }

  /** HUD zones (call with the css-px screen transform set). */
  drawUi(ctx: CanvasRenderingContext2D) {
    if (!this.active || !this.uiCount) return;
    this.tile ??= hatchTile(10);
    this.screenPattern ??= ctx.createPattern(this.tile, 'repeat');
    if (!this.screenPattern) return;
    ctx.globalAlpha = this.alpha;
    ctx.fillStyle = this.screenPattern;
    const r = this.uiRects;
    for (let i = 0; i < this.uiCount; i++) ctx.fillRect(r[i * 4], r[i * 4 + 1], r[i * 4 + 2] - r[i * 4], r[i * 4 + 3] - r[i * 4 + 1]);
    ctx.globalAlpha = 1;
  }

  /** css-px point inside one of the HUD zones */
  underUi(sx: number, sy: number): boolean {
    const r = this.uiRects;
    for (let i = 0; i < this.uiCount; i++) {
      if (sx >= r[i * 4] && sx <= r[i * 4 + 2] && sy >= r[i * 4 + 1] && sy <= r[i * 4 + 3]) return true;
    }
    return false;
  }
}

/**
 * Range ring in screen px whatever the zoom: a dark halo under a 2.5px dashed line, filled with
 * the raccoon's role colour (red when the spot is invalid). `scale` = css px per world unit.
 */
export function drawRangeRing(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, scale: number, time: number, valid: boolean, role: string, stroke = '#fff6e0') {
  if (r <= 0) return;
  const px = 1 / scale;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = valid ? ROLE_FILL[role] ?? ROLE_FILL.Primary : INVALID_FILL;
  ctx.fill();
  ctx.setLineDash(NO_DASH);
  ctx.lineWidth = 6.5 * px;
  ctx.strokeStyle = 'rgba(18,10,43,0.5)';
  ctx.stroke();
  DASH[0] = 12 * px;
  DASH[1] = 7 * px;
  ctx.setLineDash(DASH);
  ctx.lineDashOffset = -time * 22 * px;
  ctx.lineWidth = 2.5 * px;
  ctx.strokeStyle = valid ? stroke : '#ff5a6a';
  ctx.stroke();
  ctx.setLineDash(NO_DASH);
  ctx.lineDashOffset = 0;
}

/** Second ring while a range upgrade is hovered / held: gold, no fill, a soft gold band inside. */
export function drawRangePreview(ctx: CanvasRenderingContext2D, x: number, y: number, r0: number, r1: number, scale: number, time: number) {
  if (r1 <= r0 + 0.5) return;
  const px = 1 / scale;
  // the band the upgrade adds
  ctx.beginPath();
  ctx.arc(x, y, r1, 0, TAU);
  ctx.arc(x, y, r0, 0, TAU, true);
  ctx.fillStyle = 'rgba(255,210,60,0.16)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y, r1, 0, TAU);
  ctx.setLineDash(NO_DASH);
  ctx.lineWidth = 6.5 * px;
  ctx.strokeStyle = 'rgba(18,10,43,0.5)';
  ctx.stroke();
  DASH[0] = 9 * px;
  DASH[1] = 6 * px;
  ctx.setLineDash(DASH);
  ctx.lineDashOffset = time * 30 * px;
  ctx.lineWidth = 3 * px;
  ctx.strokeStyle = '#ffd23c';
  ctx.stroke();
  ctx.setLineDash(NO_DASH);
  ctx.lineDashOffset = 0;
}
