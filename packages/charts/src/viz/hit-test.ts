// Hit-testing without the DOM: sorted-x binary search for cartesian series, a uniform
// grid index for scatter and bubbles, arc lookup for pies and gauges,
// rectangles for bars and cells, point-in-polygon for lasso and shapes.
// Pointer handlers call these with plot coordinates; nothing touches React
// state on a pointer move.

import { lowerBound } from './decimate.js';

/** Index of the point whose x is nearest to `x` (xs ascending), or -1. */
export function nearestSorted(xs: ArrayLike<number>, x: number): number {
  const n = xs.length;
  if (n === 0) return -1;
  const i = lowerBound(xs, x);
  if (i <= 0) return 0;
  if (i >= n) return n - 1;
  return x - (xs[i - 1] as number) <= (xs[i] as number) - x ? i - 1 : i;
}

export interface PointIndex {
  /** Nearest indexed point within `maxDistance` px of (x, y), or -1. */
  nearest(x: number, y: number, maxDistance?: number): number;
  /** Every indexed point inside the rectangle. */
  inRect(x0: number, y0: number, x1: number, y1: number): number[];
}

/** Uniform grid over pixel positions (scatter, bubble, markers). Non-finite points are skipped. */
export function createPointIndex(px: ArrayLike<number>, py: ArrayLike<number>, cell = 24): PointIndex {
  const grid = new Map<number, number[]>();
  const key = (cx: number, cy: number) => cx * 73_856_093 + cy;
  for (let i = 0; i < px.length; i++) {
    const x = px[i] as number;
    const y = py[i] as number;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const k = key(Math.floor(x / cell), Math.floor(y / cell));
    let list = grid.get(k);
    if (!list) grid.set(k, (list = []));
    list.push(i);
  }
  return {
    nearest(x, y, maxDistance = cell) {
      const reach = Math.max(1, Math.ceil(maxDistance / cell));
      const cx = Math.floor(x / cell);
      const cy = Math.floor(y / cell);
      let best = -1;
      let bestD = maxDistance * maxDistance;
      for (let gx = cx - reach; gx <= cx + reach; gx++) {
        for (let gy = cy - reach; gy <= cy + reach; gy++) {
          const list = grid.get(key(gx, gy));
          if (!list) continue;
          for (const i of list) {
            const dx = (px[i] as number) - x;
            const dy = (py[i] as number) - y;
            const d = dx * dx + dy * dy;
            if (d <= bestD) {
              bestD = d;
              best = i;
            }
          }
        }
      }
      return best;
    },
    inRect(x0, y0, x1, y1) {
      const lx = Math.min(x0, x1);
      const hx = Math.max(x0, x1);
      const ly = Math.min(y0, y1);
      const hy = Math.max(y0, y1);
      const out: number[] = [];
      for (let gx = Math.floor(lx / cell); gx <= Math.floor(hx / cell); gx++) {
        for (let gy = Math.floor(ly / cell); gy <= Math.floor(hy / cell); gy++) {
          for (const i of grid.get(key(gx, gy)) ?? []) {
            const x = px[i] as number;
            const y = py[i] as number;
            if (x >= lx && x <= hx && y >= ly && y <= hy) out.push(i);
          }
        }
      }
      return out.sort((a, b) => a - b);
    },
  };
}

export interface ArcRegion {
  readonly cx: number;
  readonly cy: number;
  readonly inner: number;
  readonly outer: number;
  /** Radians clockwise from 12 o'clock, start < end. */
  readonly start: number;
  readonly end: number;
}

/** Index of the arc containing (x, y), or -1. */
export function arcAt(arcs: readonly ArcRegion[], x: number, y: number): number {
  const TAU = Math.PI * 2;
  for (let i = 0; i < arcs.length; i++) {
    const a = arcs[i] as ArcRegion;
    const dx = x - a.cx;
    const dy = y - a.cy;
    const r = Math.hypot(dx, dy);
    if (r < a.inner || r > a.outer) continue;
    let angle = Math.atan2(dx, -dy);
    if (angle < 0) angle += TAU;
    let s = a.start % TAU;
    if (s < 0) s += TAU;
    let rel = angle - s;
    if (rel < 0) rel += TAU;
    if (rel <= a.end - a.start) return i;
  }
  return -1;
}

export interface RectRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Index of the last (topmost) rectangle containing (x, y), or -1. */
export function rectAt(rects: readonly RectRegion[], x: number, y: number, slop = 0): number {
  for (let i = rects.length - 1; i >= 0; i--) {
    const r = rects[i] as RectRegion;
    const x0 = Math.min(r.x, r.x + r.width) - slop;
    const x1 = Math.max(r.x, r.x + r.width) + slop;
    const y0 = Math.min(r.y, r.y + r.height) - slop;
    const y1 = Math.max(r.y, r.y + r.height) + slop;
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return i;
  }
  return -1;
}
