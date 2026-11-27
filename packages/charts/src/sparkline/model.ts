// Sparkline model: values read from numbers or records,
// pixel positions, highlight kinds and the automatic summary. Pure; the
// component renders it as a static SVG (no store, no observer).

import { numberFormatter, r2, readField as read, seriesStats, toNumber, trendOf, type SeriesStats } from '#viz';
import type { SparklinePoint, SparklinePointKind, SparklineProps } from './types.js';

export interface SparkPoint extends SparklinePoint {
  readonly px: number;
  readonly py: number;
  /** Bar box (column, win-loss). */
  readonly bar: { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | null;
}

export interface SparkModel {
  readonly points: readonly SparkPoint[];
  readonly stats: SeriesStats;
  /** Pixel y of the baseline, or null. */
  readonly base: number | null;
  readonly yOf: (v: number) => number;
  readonly format: (v: number) => string;
  readonly width: number;
  readonly height: number;
}

export function formatterOf(format: SparklineProps['format'], locale: string | undefined): (v: number) => string {
  if (typeof format === 'function') return format;
  return numberFormatter(locale, 1, format ?? { maximumFractionDigits: 2 });
}

const PAD = { none: 0, normal: 3, additional: 6 } as const;

/** `locale`: the resolved locale (the prop, else the nearest LocaleProvider's). */
export function sparkModel(props: SparklineProps, locale: string | undefined): SparkModel {
  const type = props.type ?? 'line';
  const width = props.width ?? 100;
  const height = props.height ?? 24;
  const n = props.data.length;
  const ys = new Float64Array(n);
  const xs = new Float64Array(n);
  const useX = props.xField !== undefined && props.scale !== 'category';
  for (let i = 0; i < n; i++) {
    const d = props.data[i];
    ys[i] = typeof d === 'number' ? d : toNumber(read(d, props.yField ?? 'y'));
    xs[i] = useX ? toNumber(read(d, props.xField as string)) : i;
  }
  const stats = seriesStats(ys);
  const pad = PAD[props.padding ?? 'normal'];
  const bars = type === 'column' || type === 'winLoss';
  // x
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < n; i++) {
    const x = xs[i] as number;
    if (Number.isFinite(x)) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
  }
  if (props.domain?.x) [x0, x1] = props.domain.x;
  const step = bars ? width / Math.max(1, n) : 0;
  const xOf = (x: number, i: number): number => {
    if (bars) return step * (i + 0.5);
    if (!(x1 > x0)) return width / 2;
    return pad + ((x - x0) / (x1 - x0)) * (width - 2 * pad);
  };
  // y
  let lo = stats.count ? stats.min : 0;
  let hi = stats.count ? stats.max : 1;
  const crosses = lo < 0 && hi > 0;
  const baseline = props.baseline ?? (type === 'column' || type === 'area' || crosses ? 0 : undefined);
  if (baseline !== undefined && (type === 'column' || type === 'area')) {
    lo = Math.min(lo, baseline);
    hi = Math.max(hi, baseline);
  }
  if (props.domain?.y) [lo, hi] = props.domain.y;
  const span = hi - lo;
  const yOf =
    type === 'winLoss'
      ? (v: number) => (v > 0 ? pad : v < 0 ? height - pad : height / 2)
      : (v: number) => (span > 0 ? height - pad - ((v - lo) / span) * (height - 2 * pad) : height / 2);
  const base = type === 'winLoss' ? height / 2 : baseline !== undefined && baseline >= lo && baseline <= hi ? yOf(baseline) : null;
  const points: SparkPoint[] = [];
  const firstIndex = stats.count ? ys.findIndex((v) => Number.isFinite(v)) : -1;
  let lastIndex = -1;
  for (let i = n - 1; i >= 0; i--) if (Number.isFinite(ys[i] as number)) {
    lastIndex = i;
    break;
  }
  for (let i = 0; i < n; i++) {
    const y = ys[i] as number;
    if (!Number.isFinite(y)) continue;
    const kinds: SparklinePointKind[] = [];
    if (i === stats.maxIndex) kinds.push('high');
    if (i === stats.minIndex) kinds.push('low');
    if (i === firstIndex) kinds.push('first');
    if (i === lastIndex) kinds.push('last');
    if (y < 0) kinds.push('negative');
    const px = xOf(xs[i] as number, i);
    const py = yOf(y);
    let bar: SparkPoint['bar'] = null;
    if (bars) {
      const w = Math.max(1, step * 0.75);
      const b = type === 'winLoss' ? height / 2 : (base ?? height - pad);
      const top = type === 'winLoss' ? (y > 0 ? pad : y < 0 ? height / 2 : height / 2 - 1) : Math.min(py, b);
      const h = type === 'winLoss' ? (y === 0 ? 2 : height / 2 - pad) : Math.max(1, Math.abs(b - py));
      bar = { x: r2(px - w / 2), y: r2(top), w: r2(w), h: r2(h) };
    }
    points.push({ index: i, x: xs[i] as number, y, datum: props.data[i], kinds, px: r2(px), py: r2(py), bar });
  }
  return { points, stats, base: base === null ? null : r2(base), yOf, format: formatterOf(props.format, locale), width, height };
}

/** "12 points, minimum 3, maximum 9, first 4, last 8, trending up." */
export function sparkSummary(m: SparkModel): string {
  const s = m.stats;
  if (!s.count) return 'Sparkline, no data';
  const f = m.format;
  const trend = { up: 'trending up', down: 'trending down', flat: 'flat' }[trendOf(s)];
  return `Sparkline, ${s.count} ${s.count === 1 ? 'point' : 'points'}, minimum ${f(s.min)}, maximum ${f(s.max)}, first ${f(s.first)}, last ${f(s.last)}, ${trend}`;
}
