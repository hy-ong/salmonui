// HeatMap model: matrix from the data, axis
// key order and labels, cell colors on the scale, legend stops and the
// frame layout with axes, label groups and the legend. Pure.

import {
  bandScale,
  heatColor,
  heatExtent,
  layoutFrame,
  lineHeight,
  matrixFromRecords,
  matrixFromTable,
  normalizeCells,
  numberFormatter,
  planHorizontalLabels,
  readField,
  sequentialColor,
  stepIndex,
  textWidth,
  truncateText,
  type AxisLabelPlan,
  type BandScale,
  type FrameLayout,
  type HeatMatrix,
  type Rect,
} from '#viz';
import type { HeatMapAxis, HeatMapCell, HeatMapProps, HeatMapStop } from './types.js';

export const EMPTY_COLOR = 'var(--salmon-surface-sunken)';
const timeFormats = new Map<string, Intl.DateTimeFormat>();

/** Display text of an axis key. */
export function keyFormatter(axis: HeatMapAxis | undefined, locale: string | undefined, timeZone: string | undefined): (key: string) => string {
  const f = axis?.format;
  if (typeof f === 'function') return f;
  if (axis?.scale === 'linear') {
    const n = numberFormatter(locale, 1, (f as Intl.NumberFormatOptions | undefined) ?? { maximumFractionDigits: 2 });
    return (k) => n(Number(k));
  }
  if (axis?.scale === 'time') {
    const opts = { ...((f as Intl.DateTimeFormatOptions | undefined) ?? { dateStyle: 'medium' }), timeZone: timeZone ?? 'UTC' } as Intl.DateTimeFormatOptions;
    const id = `${locale ?? ''}|${JSON.stringify(opts)}`;
    let dtf = timeFormats.get(id);
    if (!dtf) {
      if (timeFormats.size > 32) timeFormats.clear();
      dtf = new Intl.DateTimeFormat(locale, opts);
      timeFormats.set(id, dtf);
    }
    const d = dtf;
    return (k) => {
      const t = Number(k);
      return Number.isFinite(t) ? d.format(t) : k;
    };
  }
  return (k) => k;
}

/** Index order of axis keys: numeric sort and min / max for linear and time axes. */
function order(keys: readonly string[], axis: HeatMapAxis | undefined): number[] {
  const idx = keys.map((_, i) => i);
  if (axis?.scale !== 'linear' && axis?.scale !== 'time') return idx;
  const v = keys.map((k) => Number(k));
  return idx.filter((i) => (axis.min === undefined || (v[i] as number) >= axis.min) && (axis.max === undefined || (v[i] as number) <= axis.max)).sort((a, b) => (v[a] as number) - (v[b] as number));
}

const keyOf = (v: unknown): string => (v instanceof Date ? String(v.getTime()) : String(v ?? ''));

export function buildMatrix(props: HeatMapProps): HeatMatrix {
  const first = props.data[0];
  let m: HeatMatrix;
  if (Array.isArray(first)) m = matrixFromTable(props.data as readonly (readonly (number | null)[])[], props.xAxis?.labels, props.yAxis?.labels);
  else {
    const xf = props.xField ?? 'x';
    const yf = props.yField ?? 'y';
    const vf = props.valueField ?? 'value';
    const sf = props.sizeField;
    m = matrixFromRecords(
      props.data,
      (r) => keyOf(readField(r, xf)),
      (r) => keyOf(readField(r, yf)),
      (r) => readField(r, vf),
      sf ? (r) => readField(r, sf) : undefined,
      props.xAxis?.labels,
      props.yAxis?.labels,
    );
  }
  const ox = order(m.xKeys, props.xAxis);
  const oy = order(m.yKeys, props.yAxis);
  const same = (o: number[], n: number) => o.length === n && o.every((v, i) => v === i);
  if (same(ox, m.columns) && same(oy, m.rows)) return m;
  const values = new Float64Array(ox.length * oy.length);
  const sizes = m.sizes ? new Float64Array(values.length) : null;
  oy.forEach((sy, y) =>
    ox.forEach((sx, x) => {
      values[y * ox.length + x] = m.values[sy * m.columns + sx] as number;
      if (sizes && m.sizes) sizes[y * ox.length + x] = m.sizes[sy * m.columns + sx] as number;
    }),
  );
  return { columns: ox.length, rows: oy.length, values, sizes, xKeys: ox.map((i) => m.xKeys[i] as string), yKeys: oy.map((i) => m.yKeys[i] as string) };
}

export interface HeatColors {
  /** Color per cell (row-major); EMPTY_COLOR for empty and hidden cells. */
  readonly colors: string[];
  /** Step of each cell for steps scales (-1 otherwise). */
  readonly steps: Int32Array | null;
  readonly stops: readonly HeatMapStop[];
  readonly kind: 'gradient' | 'steps';
  readonly extent: readonly [number, number];
}

/** Default stops: the derived sequential palette spread over the table extent. */
function defaultStops(extent: readonly [number, number], kind: 'gradient' | 'steps'): HeatMapStop[] {
  const [lo, hi] = extent;
  const n = kind === 'steps' ? 5 : 9;
  return Array.from({ length: n }, (_, i) => ({ value: lo + ((hi - lo) * i) / (n - 1), color: sequentialColor(kind === 'steps' ? i / (n - 1) : i / 8) }));
}

export function cellColors(m: HeatMatrix, props: HeatMapProps, hidden: ReadonlySet<number>): HeatColors {
  const cs = props.colorScale ?? {};
  const kind = cs.kind ?? 'gradient';
  const domain = cs.domain ?? 'all';
  const extent = heatExtent(m);
  const t = normalizeCells(m, domain);
  const relative = domain !== 'all';
  const given = cs.stops && cs.stops.length ? [...cs.stops].sort((a, b) => a.value - b.value) : null;
  const stops = given ?? (relative ? defaultStops([0, 1], kind) : defaultStops(extent, kind));
  const steps = kind === 'steps' ? new Int32Array(m.values.length).fill(-1) : null;
  const colors = new Array<string>(m.values.length);
  const lo = (stops[0] as HeatMapStop).value;
  const hi = (stops[stops.length - 1] as HeatMapStop).value;
  // Gradient of data colors: a 256-step lookup table instead of one interpolation per cell.
  const LUT = 256;
  const lut = given && kind === 'gradient' ? Array.from({ length: LUT }, (_, k) => heatColor(lo + ((hi - lo) * k) / (LUT - 1), 0, stops, 'gradient', false)) : null;
  const span = hi - lo || 1;
  for (let i = 0; i < m.values.length; i++) {
    const v = m.values[i] as number;
    if (v !== v) {
      colors[i] = EMPTY_COLOR;
      continue;
    }
    const tv = t[i] as number;
    const at = relative ? tv : v;
    if (steps) {
      const s = stepIndex(stops, at);
      steps[i] = s;
      colors[i] = hidden.has(s) ? EMPTY_COLOR : cs.outOfRange && (at < lo || at > hi) ? cs.outOfRange : (stops[s] as HeatMapStop).color;
    } else if (!given) colors[i] = sequentialColor(tv);
    else colors[i] = cs.outOfRange && (at < lo || at > hi) ? cs.outOfRange : (lut as string[])[Math.round(Math.min(1, Math.max(0, (at - lo) / span)) * (LUT - 1))] as string;
  }
  return { colors, steps, stops, kind, extent };
}

export interface HeatLayout {
  readonly frame: FrameLayout;
  readonly plot: Rect;
  readonly xs: BandScale;
  readonly ys: BandScale;
  /** Plan of the drawn x labels: index `i / interval` for column `i`. */
  readonly xPlan: AxisLabelPlan;
  readonly xLabels: readonly string[];
  readonly yLabels: readonly string[];
  readonly xSide: 'top' | 'bottom';
  readonly ySide: 'left' | 'right';
  /** Gradient legend bar, or null. */
  readonly gradient: Rect | null;
  readonly groupRow: number;
}

const GROUP_ROW = lineHeight('sm') + 6;

export function heatLayout(m: HeatMatrix, props: HeatMapProps, size: { width: number; height: number }, legendItems: readonly { label: string }[] | null, gradientLegend: boolean, locale: string | undefined): HeatLayout {
  const fx = keyFormatter(props.xAxis, locale, props.timeZone);
  const fy = keyFormatter(props.yAxis, locale, props.timeZone);
  const xLabels = m.xKeys.map(fx);
  const yMax = props.yAxis?.maxLabelWidth ?? 120;
  const yLabels = m.yKeys.map((k) => truncateText(fy(k), yMax));
  const yw = Math.ceil(Math.max(0, ...yLabels.map((l) => textWidth(l)))) + (props.yAxis?.labelGroups?.length ? GROUP_ROW + 4 : 0);
  const xSide = props.xAxis?.position === 'top' ? 'top' : 'bottom';
  const ySide = props.yAxis?.position === 'end' ? 'right' : 'left';
  const legendOpts = typeof props.legend === 'object' ? props.legend : {};
  const legendPos = legendOpts.position ?? 'bottom';
  const lp = legendPos === 'start' ? 'start' : legendPos === 'end' ? 'end' : legendPos;
  const xGroups = props.xAxis?.labelGroups?.length ? GROUP_ROW : 0;
  const build = (xThick: number) =>
    layoutFrame({
      width: size.width,
      height: size.height,
      title: props.title,
      subtitle: props.subtitle,
      legend: legendItems && legendItems.length ? { position: lp, items: legendItems, title: legendOpts.title } : null,
      axes: [
        { id: 'x', side: xSide, labelThickness: xThick + xGroups, title: props.xAxis?.title },
        { id: 'y', side: ySide, labelThickness: yw, title: props.yAxis?.title },
      ],
    });
  const lh = lineHeight('sm');
  let frame = build(lh);
  // Only every `interval`-th label is drawn, so only those take part in the overlap plan.
  const every = Math.max(1, props.xAxis?.interval ?? 1);
  const shown = xLabels.filter((_, i) => i % every === 0);
  const plan = (plot: Rect) => {
    const step = (plot.width / Math.max(1, m.columns)) * every;
    const positions = shown.map((_, k) => plot.x + step * (k + 0.5 / every));
    const mode = props.xAxis?.labelOverlap ?? 'auto';
    return planHorizontalLabels(shown, positions, mode, props.xAxis?.maxLabelWidth === undefined ? { spacing: step } : { spacing: step, maxWidth: props.xAxis.maxLabelWidth });
  };
  let xPlan = plan(frame.plot);
  if (xPlan.thickness !== lh) {
    frame = build(xPlan.thickness);
    xPlan = plan(frame.plot);
  }
  let plot = frame.plot;
  let gradient: Rect | null = null;
  if (gradientLegend) {
    const bar = 10;
    if (lp === 'start' || lp === 'end') {
      // Bar plus value labels beside it.
      const w = bar + 56;
      if (lp === 'end') {
        gradient = { x: size.width - 8 - 48 - bar, y: plot.y, width: bar, height: plot.height };
        plot = { ...plot, width: Math.max(1, plot.width - w) };
      } else {
        gradient = { x: 8, y: plot.y, width: bar, height: plot.height };
        plot = { ...plot, x: plot.x + w, width: Math.max(1, plot.width - w) };
      }
    } else {
      const h = bar + lh + 10;
      gradient = { x: plot.x, y: lp === 'top' ? plot.y : size.height - 8 - h, width: plot.width, height: bar };
      plot = { ...plot, height: Math.max(1, plot.height - h), y: lp === 'top' ? plot.y + h : plot.y };
    }
  }
  const xs = bandScale({ domain: m.xKeys, range: [plot.x, plot.x + plot.width], paddingInner: 0, paddingOuter: 0, reversed: props.xAxis?.reversed });
  const ys = bandScale({ domain: m.yKeys, range: [plot.y, plot.y + plot.height], paddingInner: 0, paddingOuter: 0, reversed: props.yAxis?.reversed });
  return { frame, plot, xs, ys, xPlan, xLabels, yLabels, xSide, ySide, gradient, groupRow: GROUP_ROW };
}

/** Cell at a drawing point by index arithmetic, or -1. */
export function cellAt(l: HeatLayout, m: HeatMatrix, x: number, y: number): number {
  const p = l.plot;
  if (x < p.x || x > p.x + p.width || y < p.y || y > p.y + p.height) return -1;
  const cx = l.xs.invert(x);
  const cy = l.ys.invert(y);
  return cy * m.columns + cx;
}

export function cellOf(m: HeatMatrix, colors: HeatColors, i: number): HeatMapCell {
  const x = i % m.columns;
  const y = Math.floor(i / m.columns);
  const s = m.sizes?.[i];
  return { x, y, xKey: m.xKeys[x] as string, yKey: m.yKeys[y] as string, value: m.values[i] as number, size: s === undefined || s !== s ? null : s, color: colors.colors[i] as string };
}
