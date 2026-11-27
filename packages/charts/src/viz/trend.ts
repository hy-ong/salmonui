// Trendlines: least-squares fits and moving averages.
// Only the chart's lazy analysis chunk and StockChart use it.

import { sma } from './indicators.js';

const at = (a: ArrayLike<number>, i: number): number => a[i] as number;

export type TrendlineKind = 'linear' | 'exponential' | 'logarithmic' | 'polynomial' | 'power' | 'movingAverage';

export interface TrendlineFit {
  readonly kind: TrendlineKind;
  /** Coefficients: linear [a, b] (a + b x), polynomial [c0..cn], exponential a e^(b x), power a x^b, logarithmic a + b ln x. */
  readonly coefficients: readonly number[];
  predict(x: number): number;
}

/** Solves A x = b by Gaussian elimination with partial pivoting. */
function solve(a: number[][], b: number[]): number[] {
  const n = b.length;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs((a[r] as number[])[c] as number) > Math.abs((a[p] as number[])[c] as number)) p = r;
    [a[c], a[p]] = [a[p] as number[], a[c] as number[]];
    [b[c], b[p]] = [b[p] as number, b[c] as number];
    const pivot = (a[c] as number[])[c] as number;
    if (Math.abs(pivot) < 1e-12) continue;
    for (let r = c + 1; r < n; r++) {
      const f = ((a[r] as number[])[c] as number) / pivot;
      for (let k = c; k < n; k++) (a[r] as number[])[k] = ((a[r] as number[])[k] as number) - f * ((a[c] as number[])[k] as number);
      b[r] = (b[r] as number) - f * (b[c] as number);
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r] as number;
    for (let k = r + 1; k < n; k++) s -= ((a[r] as number[])[k] as number) * (x[k] as number);
    const d = (a[r] as number[])[r] as number;
    x[r] = Math.abs(d) < 1e-12 ? 0 : s / d;
  }
  return x;
}

/** Least squares polynomial of `order` (1 = linear), optionally through (0, intercept). */
function polyfit(xs: number[], ys: number[], order: number, intercept?: number): number[] {
  const fixed = intercept !== undefined;
  const start = fixed ? 1 : 0;
  const m = order + 1 - start;
  const a = Array.from({ length: m }, () => new Array<number>(m).fill(0));
  const b = new Array<number>(m).fill(0);
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i] as number;
    const y = (ys[i] as number) - (fixed ? (intercept as number) : 0);
    for (let r = 0; r < m; r++) {
      b[r] = (b[r] as number) + y * x ** (r + start);
      for (let c = 0; c < m; c++) (a[r] as number[])[c] = ((a[r] as number[])[c] as number) + x ** (r + c + 2 * start);
    }
  }
  const sol = solve(a, b);
  return fixed ? [intercept as number, ...sol] : sol;
}

export function fitTrendline(xs: ArrayLike<number>, ys: ArrayLike<number>, options: { kind: TrendlineKind; order?: number | undefined; intercept?: number | undefined }): TrendlineFit {
  const px: number[] = [];
  const py: number[] = [];
  for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
    const x = at(xs, i);
    const y = at(ys, i);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if ((options.kind === 'exponential' || options.kind === 'power') && y <= 0) continue;
    if ((options.kind === 'logarithmic' || options.kind === 'power') && x <= 0) continue;
    px.push(x);
    py.push(y);
  }
  const kind = options.kind;
  if (kind === 'exponential') {
    const c = polyfit(px, py.map(Math.log), 1, options.intercept !== undefined ? Math.log(options.intercept) : undefined);
    const a = Math.exp(c[0] as number);
    const b = c[1] as number;
    return { kind, coefficients: [a, b], predict: (x) => a * Math.exp(b * x) };
  }
  if (kind === 'power') {
    const c = polyfit(px.map(Math.log), py.map(Math.log), 1);
    const a = Math.exp(c[0] as number);
    const b = c[1] as number;
    return { kind, coefficients: [a, b], predict: (x) => a * x ** b };
  }
  if (kind === 'logarithmic') {
    const c = polyfit(px.map(Math.log), py, 1);
    return { kind, coefficients: c, predict: (x) => (c[0] as number) + (c[1] as number) * Math.log(x) };
  }
  const order = kind === 'polynomial' ? Math.min(6, Math.max(2, options.order ?? 2)) : 1;
  const c = polyfit(px, py, order, options.intercept);
  return {
    kind,
    coefficients: c,
    predict: (x) => {
      let y = 0;
      for (let i = c.length - 1; i >= 0; i--) y = y * x + (c[i] as number);
      return y;
    },
  };
}

/**
 * Trendline points across the data x range extended by the forecast. A
 * moving average follows the data (no forecast).
 */
export function trendlinePoints(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  options: { kind: TrendlineKind; order?: number | undefined; period?: number | undefined; intercept?: number | undefined; forecast?: { forward?: number | undefined; backward?: number | undefined } | undefined; samples?: number | undefined },
): { xs: Float64Array; ys: Float64Array } {
  if (options.kind === 'movingAverage') return { xs: Float64Array.from(xs), ys: sma(ys, Math.max(2, options.period ?? 2)) };
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < xs.length; i++) {
    const x = at(xs, i);
    if (!Number.isFinite(x)) continue;
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  if (!Number.isFinite(lo)) return { xs: new Float64Array(0), ys: new Float64Array(0) };
  lo -= options.forecast?.backward ?? 0;
  hi += options.forecast?.forward ?? 0;
  const fit = fitTrendline(xs, ys, options);
  const n = options.kind === 'linear' && !options.samples ? 2 : Math.max(2, options.samples ?? 64);
  const ox = new Float64Array(n);
  const oy = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const x = lo + ((hi - lo) * i) / (n - 1);
    ox[i] = x;
    oy[i] = fit.predict(x);
  }
  return { xs: ox, ys: oy };
}
