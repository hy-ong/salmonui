// Statistics (trendlines are `trend.ts`, indicators `indicators.ts`): histogram
// binning and the normal curve, box plot quartiles, Pareto order, waterfall levels, error
// bars and empty-point modes. Inputs are value columns (NaN = missing);
// outputs are Float64Arrays with NaN where a value is undefined (the first
// `period - 1` values of a moving average).

import { tickStep } from './ticks.js';

const nan = (n: number): Float64Array => new Float64Array(n).fill(Number.NaN);
const at = (a: ArrayLike<number>, i: number): number => a[i] as number;

// --- empty points ------------------------------------------------------------

/** `gap` keeps NaN, `zero` and `average` fill it, `drop` marks it for removal (NaN; the caller skips). */
export function fillEmpty(values: ArrayLike<number>, mode: 'gap' | 'zero' | 'drop' | 'average'): Float64Array {
  const out = Float64Array.from(values as ArrayLike<number>);
  if (mode === 'gap' || mode === 'drop') return out;
  for (let i = 0; i < out.length; i++) {
    if (Number.isFinite(out[i] as number)) continue;
    if (mode === 'zero') {
      out[i] = 0;
      continue;
    }
    let p = i - 1;
    while (p >= 0 && !Number.isFinite(at(values, p))) p--;
    let q = i + 1;
    while (q < out.length && !Number.isFinite(at(values, q))) q++;
    const a = p >= 0 ? at(values, p) : Number.NaN;
    const b = q < out.length ? at(values, q) : Number.NaN;
    out[i] = Number.isFinite(a) && Number.isFinite(b) ? (a + b) / 2 : Number.isFinite(a) ? a : Number.isFinite(b) ? b : 0;
  }
  return out;
}

// --- distributions --------------------------------------------------------------------

export interface HistogramBins {
  readonly x0: number[];
  readonly x1: number[];
  readonly count: number[];
  readonly binWidth: number;
}

/** Bins values; the automatic width is Scott's rule rounded to a nice step. */
export function histogramBins(values: ArrayLike<number>, options: { binWidth?: number | undefined } = {}): HistogramBins {
  const v: number[] = [];
  for (let i = 0; i < values.length; i++) if (Number.isFinite(at(values, i))) v.push(at(values, i));
  if (v.length === 0) return { x0: [], x1: [], count: [], binWidth: 1 };
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (const x of v) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  let width = options.binWidth ?? 0;
  if (!(width > 0)) {
    const mean = v.reduce((s, x) => s + x, 0) / v.length;
    const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / v.length);
    const scott = (3.49 * sd) / Math.cbrt(v.length);
    width = scott > 0 ? tickStep(0, scott * 5, 5) : 1;
  }
  const start = Math.floor(lo / width) * width;
  const bins = Math.max(1, Math.floor((hi - start) / width) + 1);
  const count = new Array<number>(bins).fill(0);
  for (const x of v) {
    const b = Math.min(bins - 1, Math.floor((x - start) / width));
    count[b] = (count[b] as number) + 1;
  }
  const x0 = count.map((_, i) => start + i * width);
  return { x0, x1: x0.map((x) => x + width), count, binWidth: width };
}

/** Normal curve of `values` scaled to a histogram of `binWidth` (count density). */
export function normalCurve(values: ArrayLike<number>, binWidth: number, at: readonly number[]): Float64Array {
  const v = Array.from(values as ArrayLike<number>).filter(Number.isFinite);
  const n = v.length;
  const mean = v.reduce((s, x) => s + x, 0) / (n || 1);
  const sd = Math.sqrt(v.reduce((s, x) => s + (x - mean) ** 2, 0) / (n || 1)) || 1;
  return Float64Array.from(at, (x) => ((n * binWidth) / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * ((x - mean) / sd) ** 2));
}

export interface BoxStats {
  readonly min: number;
  readonly q1: number;
  readonly median: number;
  readonly q3: number;
  readonly max: number;
  readonly mean: number;
  readonly outliers: readonly number[];
}

function quantile(sorted: readonly number[], p: number, method: 'exclusive' | 'inclusive'): number {
  const n = sorted.length;
  if (n === 0) return Number.NaN;
  const h = method === 'inclusive' ? (n - 1) * p : (n + 1) * p - 1;
  if (h <= 0) return sorted[0] as number;
  if (h >= n - 1) return sorted[n - 1] as number;
  const lo = Math.floor(h);
  return (sorted[lo] as number) + (h - lo) * ((sorted[lo + 1] as number) - (sorted[lo] as number));
}

const median = (s: readonly number[]): number => (s.length === 0 ? Number.NaN : s.length % 2 ? (s[(s.length - 1) / 2] as number) : ((s[s.length / 2 - 1] as number) + (s[s.length / 2] as number)) / 2);

/** Quartiles (Excel QUARTILE.EXC / QUARTILE.INC, or median of halves), whiskers at 1.5 IQR, outliers beyond. */
export function boxPlotStats(values: ArrayLike<number>, method: 'exclusive' | 'inclusive' | 'normal' = 'exclusive'): BoxStats {
  const s = Array.from(values as ArrayLike<number>)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  let q1: number;
  let q3: number;
  if (method === 'normal') {
    const half = Math.floor(s.length / 2);
    q1 = median(s.slice(0, half));
    q3 = median(s.slice(s.length - half));
  } else {
    q1 = quantile(s, 0.25, method);
    q3 = quantile(s, 0.75, method);
  }
  const iqr = q3 - q1;
  const loFence = q1 - 1.5 * iqr;
  const hiFence = q3 + 1.5 * iqr;
  const inside = s.filter((v) => v >= loFence && v <= hiFence);
  return {
    min: inside[0] ?? Number.NaN,
    q1,
    median: median(s),
    q3,
    max: inside[inside.length - 1] ?? Number.NaN,
    mean: s.reduce((a, b) => a + b, 0) / (s.length || 1),
    outliers: s.filter((v) => v < loFence || v > hiFence),
  };
}

/** Indices sorted by value descending and the cumulative percent in that order. */
export function paretoOrder(values: ArrayLike<number>): { order: number[]; cumulativePercent: Float64Array } {
  const order = Array.from({ length: values.length }, (_, i) => i).sort((a, b) => (at(values, b) || 0) - (at(values, a) || 0));
  const total = order.reduce((s, i) => s + (at(values, i) || 0), 0);
  const cumulativePercent = new Float64Array(order.length);
  let run = 0;
  order.forEach((i, k) => {
    run += at(values, i) || 0;
    cumulativePercent[k] = total ? (run / total) * 100 : 0;
  });
  return { order, cumulativePercent };
}

export type WaterfallKind = 'up' | 'down' | 'total' | 'subtotal';

/** Waterfall bar extents: deltas float on the running sum; totals span from 0, subtotals from the last (sub)total level. */
export function waterfall(values: ArrayLike<number>, options: { totals?: readonly number[] | ((i: number) => boolean) | undefined; subtotals?: readonly number[] | ((i: number) => boolean) | undefined } = {}): { y0: Float64Array; y1: Float64Array; kind: WaterfallKind[] } {
  const test = (spec: readonly number[] | ((i: number) => boolean) | undefined, i: number) => (typeof spec === 'function' ? spec(i) : spec ? spec.includes(i) : false);
  const n = values.length;
  const y0 = new Float64Array(n);
  const y1 = new Float64Array(n);
  const kind: WaterfallKind[] = [];
  let run = 0;
  let level = 0;
  for (let i = 0; i < n; i++) {
    if (test(options.totals, i)) {
      y0[i] = 0;
      y1[i] = run;
      level = run;
      kind.push('total');
    } else if (test(options.subtotals, i)) {
      y0[i] = level;
      y1[i] = run;
      level = run;
      kind.push('subtotal');
    } else {
      const v = at(values, i) || 0;
      y0[i] = run;
      run += v;
      y1[i] = run;
      kind.push(v >= 0 ? 'up' : 'down');
    }
  }
  return { y0, y1, kind };
}

/** Error bar low / high per point. */
export function errorBarExtents(
  values: ArrayLike<number>,
  options: { kind: 'fixed' | 'percent' | 'standardDeviation' | 'standardError' | 'custom'; amount?: number | undefined; plus?: ArrayLike<number> | undefined; minus?: ArrayLike<number> | undefined; direction?: 'both' | 'plus' | 'minus' | undefined },
): { low: Float64Array; high: Float64Array } {
  const n = values.length;
  const low = new Float64Array(n);
  const high = new Float64Array(n);
  const finite = Array.from(values as ArrayLike<number>).filter(Number.isFinite);
  const mean = finite.reduce((s, v) => s + v, 0) / (finite.length || 1);
  const sd = Math.sqrt(finite.reduce((s, v) => s + (v - mean) ** 2, 0) / Math.max(1, finite.length - 1));
  const amount = options.amount ?? 1;
  const dir = options.direction ?? 'both';
  for (let i = 0; i < n; i++) {
    const v = at(values, i);
    let plus: number;
    let minus: number;
    switch (options.kind) {
      case 'percent':
        plus = minus = Math.abs(v) * (amount / 100);
        break;
      case 'standardDeviation':
        plus = minus = sd * amount;
        break;
      case 'standardError':
        plus = minus = (sd / Math.sqrt(finite.length || 1)) * amount;
        break;
      case 'custom':
        plus = options.plus ? at(options.plus, i) || 0 : amount;
        minus = options.minus ? at(options.minus, i) || 0 : amount;
        break;
      default:
        plus = minus = amount;
    }
    low[i] = dir === 'plus' ? v : v - minus;
    high[i] = dir === 'minus' ? v : v + plus;
  }
  return { low, high };
}
