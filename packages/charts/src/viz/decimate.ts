// Decimation: renderer
// independent data reduction that runs outside React render. Every function
// returns indices into the original arrays (or aggregated columns), so the
// tooltip, hit-test at full zoom and the accessible table keep reading the
// original data.

/** First index with xs[i] >= x (xs ascending). */
export function lowerBound(xs: ArrayLike<number>, x: number, lo = 0, hi = xs.length): number {
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((xs[mid] as number) < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Index range [from, to) of points inside [x0, x1], widened by one point on each side so lines reach the edge. */
export function visibleRange(xs: ArrayLike<number>, x0: number, x1: number): [number, number] {
  const n = xs.length;
  const from = Math.max(0, lowerBound(xs, Math.min(x0, x1)) - 1);
  const to = Math.min(n, lowerBound(xs, Math.max(x0, x1)) + 1);
  return [from, Math.max(from, to)];
}

/**
 * Min / max per pixel column (M4): at most the first, min, max and last
 * point of each column, in index order. `xs` ascending; `toPixel` maps x to
 * pixels. Points with a non-finite y are kept (they are gaps).
 */
export function minMaxDecimate(xs: ArrayLike<number>, ys: ArrayLike<number>, toPixel: (x: number) => number, from = 0, to = xs.length): Uint32Array {
  const out: number[] = [];
  let col = Number.NaN;
  let first = -1;
  let last = -1;
  let min = -1;
  let max = -1;
  const flush = () => {
    if (first < 0) return;
    const a = [first, min, max, last].sort((p, q) => p - q);
    let prev = -1;
    for (const i of a) {
      if (i !== prev) out.push(i);
      prev = i;
    }
    first = -1;
  };
  for (let i = from; i < to; i++) {
    const y = ys[i] as number;
    if (!Number.isFinite(y)) {
      // A gap is kept as its own point so the line breaks there.
      flush();
      out.push(i);
      col = Number.NaN;
      continue;
    }
    const c = Math.floor(toPixel(xs[i] as number));
    if (c !== col || first < 0) {
      flush();
      col = c;
      first = last = min = max = i;
      continue;
    }
    last = i;
    if (y < (ys[min] as number)) min = i;
    if (y > (ys[max] as number)) max = i;
  }
  flush();
  return Uint32Array.from(out);
}

/** Largest-Triangle-Three-Buckets down to `threshold` points (indices, ascending). */
export function lttb(xs: ArrayLike<number>, ys: ArrayLike<number>, threshold: number, from = 0, to = xs.length): Uint32Array {
  const n = to - from;
  if (threshold >= n || threshold < 3) {
    const all = new Uint32Array(Math.max(0, n));
    for (let i = 0; i < n; i++) all[i] = from + i;
    return all;
  }
  const out = new Uint32Array(threshold);
  const every = (n - 2) / (threshold - 2);
  let a = from;
  out[0] = a;
  let len = 1;
  for (let i = 0; i < threshold - 2; i++) {
    const avgStart = from + Math.floor((i + 1) * every) + 1;
    const avgEnd = Math.min(to, from + Math.floor((i + 2) * every) + 1);
    let ax = 0;
    let ay = 0;
    let count = 0;
    for (let j = avgStart; j < avgEnd; j++) {
      const y = ys[j] as number;
      if (!Number.isFinite(y)) continue;
      ax += xs[j] as number;
      ay += y;
      count++;
    }
    if (count) {
      ax /= count;
      ay /= count;
    } else {
      ax = xs[Math.min(to - 1, avgStart)] as number;
      ay = 0;
    }
    const rangeStart = from + Math.floor(i * every) + 1;
    const rangeEnd = from + Math.floor((i + 1) * every) + 1;
    const px = xs[a] as number;
    const py = ys[a] as number;
    let best = rangeStart;
    let area = -1;
    for (let j = rangeStart; j < rangeEnd; j++) {
      const y = ys[j] as number;
      if (!Number.isFinite(y)) {
        best = j; // keep gaps visible
        break;
      }
      const s = Math.abs((px - ax) * (y - py) - (px - (xs[j] as number)) * (ay - py));
      if (s > area) {
        area = s;
        best = j;
      }
    }
    out[len++] = best;
    a = best;
  }
  out[len++] = to - 1;
  return out.slice(0, len);
}

/**
 * Pixel binning for scatter and bubble series: keeps the first point of each
 * `cell` x `cell` pixel cell. Returns indices in input order.
 */
export function binPoints(px: ArrayLike<number>, py: ArrayLike<number>, cell = 1, from = 0, to = px.length): Uint32Array {
  const seen = new Set<number>();
  const out: number[] = [];
  for (let i = from; i < to; i++) {
    const x = px[i] as number;
    const y = py[i] as number;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const key = Math.floor(x / cell) * 1_000_003 + Math.floor(y / cell);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(i);
  }
  return Uint32Array.from(out);
}

export interface OhlcColumns {
  readonly x: Float64Array;
  readonly open: Float64Array;
  readonly high: Float64Array;
  readonly low: Float64Array;
  readonly close: Float64Array;
  readonly volume: Float64Array;
  /** Index of the first source point of each bucket. */
  readonly source: Uint32Array;
}

/**
 * Time-bucket OHLC aggregation: merges consecutive candles that fall
 * into the same pixel bucket of `bucket` px (open of the first, close of the
 * last, max high, min low, summed volume).
 */
export function aggregateOhlc(
  xs: ArrayLike<number>,
  open: ArrayLike<number>,
  high: ArrayLike<number>,
  low: ArrayLike<number>,
  close: ArrayLike<number>,
  toPixel: (x: number) => number,
  bucket = 2,
  volume?: ArrayLike<number>,
  from = 0,
  to = xs.length,
): OhlcColumns {
  const cap = Math.max(0, to - from);
  const x = new Float64Array(cap);
  const o = new Float64Array(cap);
  const h = new Float64Array(cap);
  const l = new Float64Array(cap);
  const c = new Float64Array(cap);
  const v = new Float64Array(cap);
  const src = new Uint32Array(cap);
  let len = 0;
  let key = Number.NaN;
  for (let i = from; i < to; i++) {
    const k = Math.floor(toPixel(xs[i] as number) / bucket);
    if (k !== key) {
      key = k;
      x[len] = xs[i] as number;
      o[len] = open[i] as number;
      h[len] = high[i] as number;
      l[len] = low[i] as number;
      c[len] = close[i] as number;
      v[len] = volume ? (volume[i] as number) || 0 : 0;
      src[len] = i;
      len++;
      continue;
    }
    const j = len - 1;
    h[j] = Math.max(h[j] as number, high[i] as number);
    l[j] = Math.min(l[j] as number, low[i] as number);
    c[j] = close[i] as number;
    if (volume) v[j] = (v[j] as number) + ((volume[i] as number) || 0);
  }
  return { x: x.slice(0, len), open: o.slice(0, len), high: h.slice(0, len), low: l.slice(0, len), close: c.slice(0, len), volume: v.slice(0, len), source: src.slice(0, len) };
}

export type DecimationMode = 'auto' | 'lttb' | 'minMax' | false;

/**
 * Picks the indices to draw for a line or area series: nothing to do below
 * four points per pixel column, min / max per column (`auto`, `minMax`) or
 * LTTB to two points per column (`lttb`).
 */
export function decimateLine(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  toPixel: (x: number) => number,
  plotWidth: number,
  mode: DecimationMode = 'auto',
  from = 0,
  to = xs.length,
): Uint32Array | null {
  const n = to - from;
  if (mode === false || n <= Math.max(4, plotWidth * 4)) return null;
  if (mode === 'lttb') return lttb(xs, ys, Math.max(3, Math.round(plotWidth * 2)), from, to);
  return minMaxDecimate(xs, ys, toPixel, from, to);
}
