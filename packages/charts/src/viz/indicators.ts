// Technical indicators: moving averages, oscillators and bands
// over value columns (NaN = missing); outputs are Float64Arrays with NaN
// where a value is undefined (the first `period - 1` values of an average).
// A module of its own, with trendlines in `trend.ts`, so the chart's lazy
// analysis chunk shares no module with the entry chunk.

const nan = (n: number): Float64Array => new Float64Array(n).fill(Number.NaN);
const at = (a: ArrayLike<number>, i: number): number => a[i] as number;

export function sma(values: ArrayLike<number>, period: number): Float64Array {
  const n = values.length;
  const out = nan(n);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    sum += at(values, i);
    count++;
    if (count > period) sum -= at(values, i - period);
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values: ArrayLike<number>, period: number): Float64Array {
  const n = values.length;
  const out = nan(n);
  if (n < period) return out;
  const k = 2 / (period + 1);
  let prev = 0;
  for (let i = 0; i < period; i++) prev += at(values, i);
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < n; i++) {
    prev = at(values, i) * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Triangular moving average: the SMA of the SMA. */
export function tma(values: ArrayLike<number>, period: number): Float64Array {
  const first = sma(values, period);
  const out = nan(values.length);
  const inner = sma(Array.from(first, (v) => (Number.isFinite(v) ? v : 0)), period);
  for (let i = 2 * period - 2; i < values.length; i++) out[i] = inner[i] as number;
  return out;
}

/** close / close[i - period] * 100. */
export function momentum(close: ArrayLike<number>, period: number): Float64Array {
  const out = nan(close.length);
  for (let i = period; i < close.length; i++) out[i] = (at(close, i) / at(close, i - period)) * 100;
  return out;
}

/** Relative strength index with Wilder smoothing. */
export function rsi(close: ArrayLike<number>, period: number): Float64Array {
  const n = close.length;
  const out = nan(n);
  if (n <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = at(close, i) - at(close, i - 1);
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < n; i++) {
    const d = at(close, i) - at(close, i - 1);
    gain = (gain * (period - 1) + Math.max(0, d)) / period;
    loss = (loss * (period - 1) + Math.max(0, -d)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

/** Average true range (Wilder). */
export function atr(high: ArrayLike<number>, low: ArrayLike<number>, close: ArrayLike<number>, period: number): Float64Array {
  const n = close.length;
  const tr = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const h = at(high, i);
    const l = at(low, i);
    tr[i] = i === 0 ? h - l : Math.max(h - l, Math.abs(h - at(close, i - 1)), Math.abs(l - at(close, i - 1)));
  }
  const out = nan(n);
  if (n < period) return out;
  let prev = 0;
  for (let i = 0; i < period; i++) prev += tr[i] as number;
  prev /= period;
  out[period - 1] = prev;
  for (let i = period; i < n; i++) {
    prev = (prev * (period - 1) + (tr[i] as number)) / period;
    out[i] = prev;
  }
  return out;
}

export function accumulationDistribution(high: ArrayLike<number>, low: ArrayLike<number>, close: ArrayLike<number>, volume: ArrayLike<number>): Float64Array {
  const out = new Float64Array(close.length);
  let sum = 0;
  for (let i = 0; i < close.length; i++) {
    const h = at(high, i);
    const l = at(low, i);
    const mfm = h === l ? 0 : (at(close, i) - l - (h - at(close, i))) / (h - l);
    sum += mfm * (at(volume, i) || 0);
    out[i] = sum;
  }
  return out;
}

export function bollinger(close: ArrayLike<number>, period: number, deviations = 2): { middle: Float64Array; upper: Float64Array; lower: Float64Array } {
  const middle = sma(close, period);
  const upper = nan(close.length);
  const lower = nan(close.length);
  for (let i = period - 1; i < close.length; i++) {
    const m = middle[i] as number;
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += (at(close, j) - m) ** 2;
    const sd = Math.sqrt(s / period);
    upper[i] = m + deviations * sd;
    lower[i] = m - deviations * sd;
  }
  return { middle, upper, lower };
}

export function macd(close: ArrayLike<number>, fast = 12, slow = 26, signalPeriod = 9): { macd: Float64Array; signal: Float64Array; histogram: Float64Array } {
  const f = ema(close, fast);
  const s = ema(close, slow);
  const line = nan(close.length);
  for (let i = 0; i < close.length; i++) if (Number.isFinite(f[i] as number) && Number.isFinite(s[i] as number)) line[i] = (f[i] as number) - (s[i] as number);
  const start = slow - 1;
  const sig = nan(close.length);
  const tail = ema(line.subarray(start), signalPeriod);
  sig.set(tail, start);
  const histogram = nan(close.length);
  for (let i = 0; i < close.length; i++) if (Number.isFinite(sig[i] as number)) histogram[i] = (line[i] as number) - (sig[i] as number);
  return { macd: line, signal: sig, histogram };
}

export function stochastic(high: ArrayLike<number>, low: ArrayLike<number>, close: ArrayLike<number>, kPeriod = 14, dPeriod = 3): { k: Float64Array; d: Float64Array } {
  const n = close.length;
  const k = nan(n);
  for (let i = kPeriod - 1; i < n; i++) {
    let hi = Number.NEGATIVE_INFINITY;
    let lo = Number.POSITIVE_INFINITY;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      hi = Math.max(hi, at(high, j));
      lo = Math.min(lo, at(low, j));
    }
    k[i] = hi === lo ? 50 : ((at(close, i) - lo) / (hi - lo)) * 100;
  }
  const d = nan(n);
  const inner = sma(k.subarray(kPeriod - 1), dPeriod);
  d.set(inner, kPeriod - 1);
  return { k, d };
}
