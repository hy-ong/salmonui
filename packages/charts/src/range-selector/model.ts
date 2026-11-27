// Range selector model: domain, scale, ticks and
// labels, grouped labels, mini series paths and snapping. Pure, so the
// server renders the same markup as the client's first render.

import {
  areaPath,
  createScale,
  floorTime,
  lineHeight,
  linePath,
  offsetTime,
  paletteColor,
  planHorizontalLabels,
  resolveDomain,
  textWidth,
  timeInterval,
  timeTicks,
  decimateLine,
  type ContinuousScale,
  type TimeInterval,
  type TimeUnit,
} from '#viz';
import { makeNumberFormat, makeTimeFormat } from '../internal/viz/format.js';
import { readField } from '../internal/viz/fields.js';
import type { ChartDatum, ChartFormat } from '../chart/types.js';

export interface RangeSeries {
  readonly type?: 'line' | 'area' | 'stepLine' | undefined;
  readonly data?: readonly ChartDatum[] | undefined;
  readonly xField?: string | undefined;
  readonly yField?: string | undefined;
  readonly color?: string | undefined;
}

export interface RangeModelInput {
  readonly data?: readonly ChartDatum[] | undefined;
  readonly xField?: string | undefined;
  readonly yField?: string | undefined;
  readonly series?: readonly RangeSeries[] | undefined;
  readonly scale?: 'linear' | 'time' | 'log' | undefined;
  readonly min?: number | Date | undefined;
  readonly max?: number | Date | undefined;
  readonly interval?: number | TimeInterval | undefined;
  readonly base?: number | undefined;
  readonly format?: ChartFormat | undefined;
  readonly formatLabel?: ((value: number) => string) | undefined;
  readonly labelPosition?: 'inside' | 'outside' | undefined;
  readonly labelOverlap?: 'none' | 'hide' | 'trim' | 'wrap' | 'stagger' | 'rotate45' | 'rotate90' | undefined;
  readonly groupLabels?: { readonly unit: TimeUnit; readonly align?: 'start' | 'center' | undefined; readonly format?: ChartFormat | undefined } | undefined;
  readonly locale?: string | undefined;
  readonly timeZone?: string | undefined;
}

export interface RangeModel {
  readonly width: number;
  readonly height: number;
  readonly track: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  readonly scale: ContinuousScale;
  readonly kind: 'linear' | 'time' | 'log';
  readonly domain: readonly [number, number];
  readonly ticks: readonly { readonly value: number; readonly pos: number; readonly text: string; readonly hidden: boolean }[];
  readonly groups: readonly { readonly pos: number; readonly text: string; readonly end: number }[];
  readonly paths: readonly { readonly key: string; readonly d: string; readonly fill?: string; readonly stroke?: string }[];
  /** Sorted data x values (snapping). */
  readonly xs: Float64Array;
  readonly format: (value: number) => string;
  readonly interval: TimeInterval | number | null;
}

const toNum = (v: unknown): number => (typeof v === 'number' ? v : v instanceof Date ? v.getTime() : typeof v === 'string' ? (/^\d{4}-\d{2}-\d{2}/.test(v) ? Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v) : Number(v)) : Number.NaN);

/** `locale` defaults to `input.locale` (RangeSelector passes the one resolved through the LocaleProvider). */
export function rangeModel(input: RangeModelInput, width: number, height: number, locale = input.locale): RangeModel {
  const series: RangeSeries[] = input.series?.length ? [...input.series] : input.data ? [{ type: 'area', data: input.data, xField: input.xField, yField: input.yField }] : [];
  const sample = (series[0]?.data ?? input.data ?? []).find((d) => readField(d, series[0]?.xField ?? input.xField) != null);
  const sv = readField(sample, series[0]?.xField ?? input.xField);
  const kind = input.scale ?? (sv instanceof Date || (typeof sv === 'string' && /^\d{4}-\d{2}-\d{2}/.test(sv)) ? 'time' : 'linear');
  const cols = series.map((s) => {
    const data = s.data ?? input.data ?? [];
    return {
      s,
      x: Float64Array.from(data, (d) => toNum(readField(d, s.xField ?? input.xField))),
      y: Float64Array.from(data, (d) => toNum(readField(d, s.yField ?? input.yField))),
    };
  });
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  let ylo = Number.POSITIVE_INFINITY;
  let yhi = Number.NEGATIVE_INFINITY;
  for (const c of cols) {
    for (const v of c.x) if (Number.isFinite(v)) (lo = Math.min(lo, v)), (hi = Math.max(hi, v));
    for (const v of c.y) if (Number.isFinite(v)) (ylo = Math.min(ylo, v)), (yhi = Math.max(yhi, v));
  }
  const domain = resolveDomain(Number.isFinite(lo) ? [lo, hi] : null, {
    kind: kind === 'log' ? 'log' : kind === 'time' ? 'time' : 'linear',
    includeZero: false,
    padding: 'none',
    min: input.min === undefined ? undefined : toNum(input.min),
    max: input.max === undefined ? undefined : toNum(input.max),
  });
  const lh = lineHeight('sm');
  const labelRows = input.labelPosition === 'inside' ? 0 : 1 + (input.groupLabels ? 1 : 0);
  const pad = 8;
  const fmtCtx = { locale, timeZone: input.timeZone };
  const interval = typeof input.interval === 'object' ? input.interval : null;
  const trackHeight = Math.max(8, height - 8 - labelRows * (lh + 4));
  const axisFor = (padStart: number, padEnd: number) => {
    const track = { x: padStart, y: 4, width: Math.max(1, width - padStart - padEnd), height: trackHeight };
    const scale = createScale({ kind, domain, range: [track.x, track.x + track.width], base: input.base, timeZone: input.timeZone }) as ContinuousScale;
    let values: number[];
    let unit: TimeUnit = 'day';
    if (kind === 'time') {
      const t = timeTicks(domain[0], domain[1], { count: Math.max(2, Math.round(track.width / 90)), ...(interval ? { interval } : {}), ...(input.timeZone ? { timeZone: input.timeZone } : {}) });
      values = t.values;
      unit = t.interval.unit;
    } else if (typeof input.interval === 'number') {
      values = [];
      for (let v = Math.ceil(domain[0] / input.interval) * input.interval, k = 0; v <= domain[1] + 1e-9 && k < 1000; v += input.interval, k++) values.push(Number(v.toPrecision(12)));
    } else values = scale.ticks(Math.max(2, Math.round(track.width / 90)));
    const step = values.length > 1 ? Math.abs((values[1] as number) - (values[0] as number)) : 1;
    const format = input.formatLabel ?? (kind === 'time' ? makeTimeFormat(input.format, fmtCtx, unit) : makeNumberFormat(input.format, fmtCtx, step));
    const labels = values.map((v) => format(v));
    const plan = planHorizontalLabels(labels, values.map((v) => scale.map(v)), input.labelOverlap ?? 'hide');
    return { track, scale, values, unit, format, labels, plan };
  };
  let axis = axisFor(pad, pad);
  if (input.labelPosition !== 'inside') {
    // A label centered on a track end would be cut by the drawing: widen that end's padding.
    let start = pad;
    let end = pad;
    const first = axis;
    first.values.forEach((v, k) => {
      if (first.plan.hidden[k]) return;
      const half = textWidth(first.labels[k] ?? '') / 2;
      const pos = first.scale.map(v);
      start = Math.max(start, Math.ceil(pad + half - pos + 1));
      end = Math.max(end, Math.ceil(pos + half - (width - pad) + 1));
    });
    if (start > pad || end > pad) axis = axisFor(Math.min(start, width / 4), Math.min(end, width / 4));
  }
  const { track, scale, values, unit, format, labels, plan } = axis;
  const ticks = values.map((v, i) => ({ value: v, pos: scale.map(v), text: labels[i] as string, hidden: plan.hidden[i] ?? false }));
  const groups: { pos: number; text: string; end: number }[] = [];
  if (input.groupLabels && kind === 'time') {
    const gi: TimeInterval = { unit: input.groupLabels.unit, step: 1 };
    const gf = makeTimeFormat(input.groupLabels.format, fmtCtx, input.groupLabels.unit);
    let t = floorTime(domain[0], gi, input.timeZone);
    for (let k = 0; t <= domain[1] && k < 500; k++) {
      const next = offsetTime(t, gi, 1, input.timeZone);
      groups.push({ pos: scale.map(Math.max(t, domain[0])), end: scale.map(Math.min(next, domain[1])), text: gf(t) });
      t = next;
    }
  }
  // Mini series (no axis of its own): y fills the track.
  const yScale = createScale({ kind: 'linear', domain: Number.isFinite(ylo) ? [Math.min(0, ylo), yhi === ylo ? yhi + 1 : yhi] : [0, 1], range: [track.y + track.height, track.y + 2] }) as ContinuousScale;
  const paths: { key: string; d: string; fill?: string; stroke?: string }[] = [];
  cols.forEach((c, i) => {
    const idx = decimateLine(c.x, c.y, (x) => scale.map(x), track.width, 'auto');
    const pick = (a: Float64Array, f: (v: number) => number) => (idx ? Float64Array.from(idx, (j) => f(a[j] as number)) : Float64Array.from(a, f));
    const px = pick(c.x, (v) => scale.map(v));
    const py = pick(c.y, (v) => yScale.map(v));
    const color = c.s.color ?? paletteColor(i);
    const curve = c.s.type === 'stepLine' ? { curve: 'step' as const } : {};
    if ((c.s.type ?? 'area') === 'area') paths.push({ key: `a${i}`, d: areaPath(px, py, track.y + track.height, curve), fill: color });
    paths.push({ key: `l${i}`, d: linePath(px, py, curve), stroke: color });
  });
  const xs = Float64Array.from(cols.flatMap((c) => Array.from(c.x)).filter(Number.isFinite)).sort();
  return { width, height, track, scale, kind, domain, ticks, groups, paths, xs, format: kind === 'time' ? makeTimeFormat(input.format ?? (unit === 'hour' || unit === 'minute' || unit === 'second' || unit === 'millisecond' ? { dateStyle: 'medium', timeStyle: 'short' } : { year: 'numeric', month: 'short', day: 'numeric' }), fmtCtx, unit) : format, interval: interval ?? (typeof input.interval === 'number' ? input.interval : null) };
}

/**
 * Snaps a value: `true` to the nearest data x, `'interval'` to the interval
 * boundary (`'start'` floors, `'end'` ceils).
 */
export function snapValue(model: RangeModel, value: number, snap: boolean | 'interval' | undefined, edge: 'start' | 'end', timeZone?: string): number {
  if (!snap) return value;
  if (snap === 'interval') {
    if (model.kind === 'time') {
      const iv = typeof model.interval === 'object' && model.interval ? model.interval : timeInterval(model.domain[0], model.domain[1], 6);
      const f = floorTime(value, iv, timeZone);
      if (edge === 'start' || f === value) return f;
      return offsetTime(f, iv, 1, timeZone);
    }
    const step = typeof model.interval === 'number' ? model.interval : model.ticks.length > 1 ? Math.abs((model.ticks[1]?.value as number) - (model.ticks[0]?.value as number)) : 1;
    return edge === 'start' ? Math.floor(value / step) * step : Math.ceil(value / step) * step;
  }
  const xs = model.xs;
  if (xs.length === 0) return value;
  let best = xs[0] as number;
  for (const x of xs) if (Math.abs(x - value) < Math.abs(best - value)) best = x;
  return best;
}

/** Keyboard step: the interval, else 1 % of the span; `large` is 10 %. */
export function keyStep(model: RangeModel, large: boolean): number {
  const span = model.domain[1] - model.domain[0];
  if (large) return span / 10;
  if (typeof model.interval === 'number') return model.interval;
  if (model.kind === 'time' && model.interval && typeof model.interval === 'object') return Math.max(1, (model.ticks[1]?.value ?? 0) - (model.ticks[0]?.value ?? 0));
  return span / 100;
}

/** Clamps a range into the domain keeping start <= end. */
export function clampRange(model: RangeModel, range: readonly [number, number]): [number, number] {
  const [d0, d1] = model.domain;
  const a = Math.min(d1, Math.max(d0, Math.min(range[0], range[1])));
  const b = Math.min(d1, Math.max(d0, Math.max(range[0], range[1])));
  return [a, b];
}
