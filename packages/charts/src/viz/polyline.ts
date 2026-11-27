// Straight-segment paths: the
// serialization helpers every path builder shares, and the polyline and
// constant-base area that `/sparkline` needs without the curve code of
// `geometry.ts` (`/sparkline` stays within 4 KB).

import { r2 } from './ticks.js';

/** Serializes a number for path data. */
export const n2 = (v: number): string => String(r2(v));

/** `v` as a percentage of `total` (0.01 %), for CSS offsets over a drawing. */
export const pct = (v: number, total: number): string => `${Math.round((v / total) * 10000) / 100}%`;

/** `x,y` of a path point. */
export const pt = (x: number, y: number): string => `${n2(x)},${n2(y)}`;

export type Seg = { xs: number[]; ys: number[] };

/** Splits at non-finite x or y (gaps). */
export function segments(xs: ArrayLike<number>, ys: ArrayLike<number>): Seg[] {
  const out: Seg[] = [];
  let cur: Seg | null = null;
  const n = Math.min(xs.length, ys.length);
  for (let i = 0; i < n; i++) {
    const x = xs[i] as number;
    const y = ys[i] as number;
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      cur = null;
      continue;
    }
    if (!cur) {
      cur = { xs: [], ys: [] };
      out.push(cur);
    }
    cur.xs.push(x);
    cur.ys.push(y);
  }
  return out;
}

/**
 * Straight area down to a constant pixel `base`; gaps break it. Same output
 * as `areaPath` with the linear curve. Without `base`, the open polyline
 * (`polylinePath`): one builder for both keeps `/sparkline` small.
 */
export function polylineAreaPath(xs: ArrayLike<number>, ys: ArrayLike<number>, base?: number): string {
  let d = '';
  for (const s of segments(xs, ys)) {
    const n = s.xs.length;
    d += `M${pt(s.xs[0] as number, s.ys[0] as number)}`;
    for (let i = 1; i < n; i++) d += `L${pt(s.xs[i] as number, s.ys[i] as number)}`;
    if (base !== undefined) d += `L${pt(s.xs[n - 1] as number, base)}${n > 1 ? `L${pt(s.xs[0] as number, base)}` : ''}Z`;
  }
  return d;
}

/** Straight line through the points; gaps break it. Same output as `linePath` with the linear curve. */
export const polylinePath: (xs: ArrayLike<number>, ys: ArrayLike<number>) => string = polylineAreaPath;
