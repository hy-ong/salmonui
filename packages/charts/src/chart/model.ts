// Chart model: props are
// compiled into an id-keyed spec and laid out by a pure function of
// (spec, size, view state). No React, no DOM: the server renders from the
// same model as the client's first render, and tests assert it directly.

import type { IndicatorLayout } from './indicators.js';
import {
  aggregateOhlc,
  areaPath,
  bandScale,
  binPoints,
  boxPlotStats,
  createScale,
  decimateLine,
  describeChart,
  errorBarExtents,
  fillEmpty,
  histogramBins,
  FRAME_PADDING,
  layoutFrame,
  lineHeight,
  linePath,
  n2,
  normalCurve,
  paretoOrder,
  seriesColor,
  planHorizontalLabels,
  planVerticalLabels,
  resolveLabelOverlaps,
  rectPath,
  resolveDomain,
  SEMANTIC,
  seriesStats,
  stack,
  symbolPath,
  tableModel,
  textWidth,
  trendlinePoints,
  truncateText,
  visibleRange,
  waterfall,
  type AxisBlockSpec,
  type DataLabelOverlap,
  type LabelBox,
  type AxisSide,
  type BandScale,
  type ContinuousScale,
  type FrameLayout,
  type LegendItemSpec,
  type Rect,
  type Scale,
  type SymbolShape,
  type TableModel,
  type TimeInterval,
  type ValueFormatter,
  TICK_SIZE,
  LABEL_GAP,
} from '#viz';
import { readField } from '../internal/viz/fields.js';
import { makeNumberFormat, makeTimeFormat } from '../internal/viz/format.js';

export { readField };
import type {
  ChartAxisOptions,
  ChartColorRange,
  ChartDatum,
  ChartLegendShape,
  ChartProps,
  ChartScale,
  ChartSeriesOptions,
  ChartSeriesType,
  ChartText,
  ChartZoomRange,
} from './types.js';

export const DEFAULT_TEXT: ChartText = {
  chart: 'Chart',
  noData: 'No data',
  legend: 'Legend',
  table: 'Chart data',
  moreRows: (n) => `${n} more rows not shown`,
  zoomToolbar: 'Zoom',
  zoomTool: 'Select to zoom',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  pan: 'Pan',
  resetZoom: 'Reset zoom',
  previousLegendPage: 'Previous legend page',
  nextLegendPage: 'Next legend page',
};

const KIND_NAMES: Readonly<Record<ChartSeriesType, string>> = {
  line: 'Line',
  area: 'Area',
  column: 'Column',
  bar: 'Bar',
  scatter: 'Scatter',
  bubble: 'Bubble',
  hilo: 'High-low',
  ohlc: 'Open-high-low-close',
  candle: 'Candlestick',
  waterfall: 'Waterfall',
  histogram: 'Histogram',
  boxPlot: 'Box plot',
  pareto: 'Pareto',
  bullet: 'Bullet',
};

// ---------------------------------------------------------------------------
// Field access
// ---------------------------------------------------------------------------

const toNumber = (v: unknown): number => {
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return Number.NaN;
};

const ISO = /^\d{4}-\d{2}-\d{2}([T ][\d:.]+)?(Z|[+-]\d{2}:?\d{2})?$/;
const isDateLike = (v: unknown): boolean => v instanceof Date || (typeof v === 'string' && ISO.test(v));
const toTime = (v: unknown): number => (v instanceof Date ? v.getTime() : typeof v === 'string' ? Date.parse(v.length === 10 ? `${v}T00:00:00Z` : v) : toNumber(v));

// ---------------------------------------------------------------------------
// Compiled spec
// ---------------------------------------------------------------------------

export interface CompiledSeries {
  readonly id: string;
  readonly slot: number;
  readonly type: ChartSeriesType;
  readonly name: string;
  readonly options: ChartSeriesOptions;
  readonly data: readonly ChartDatum[];
  readonly color: string;
  readonly xAxis: string;
  readonly yAxis: string;
  /** Numeric x per point (time: epoch ms, category: category index). */
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly low?: Float64Array | undefined;
  readonly high?: Float64Array | undefined;
  readonly open?: Float64Array | undefined;
  readonly close?: Float64Array | undefined;
  readonly size?: Float64Array | undefined;
  /** Box plot raw values per point. */
  readonly boxes?: readonly number[][] | undefined;
  /** Bullet targets per point. */
  readonly targets?: readonly Float64Array[] | undefined;
  readonly hidden: boolean;
  /** Generated series (Pareto line, trendlines) are not in the table. */
  readonly generated?: boolean | undefined;
}

export interface CompiledAxis {
  readonly id: string;
  readonly direction: 'x' | 'y';
  readonly options: ChartAxisOptions;
  readonly scale: ChartScale;
  readonly categories: readonly string[];
  readonly position: 'start' | 'end';
}

export interface ChartSpec {
  readonly series: readonly CompiledSeries[];
  readonly axes: ReadonlyMap<string, CompiledAxis>;
  readonly horizontal: boolean;
}

/** @internal The id of series `i`: its `id`, `name` or `yField`, else `series-<i>`. */
export const seriesId = (s: ChartSeriesOptions, i: number): string => s.id ?? s.name ?? s.yField ?? `series-${i}`;

/** Normalizes series options into columns. `hidden` is the effective hidden-series set. */
export function compileSpec(props: ChartProps, seriesList: readonly ChartSeriesOptions[], hidden: ReadonlySet<string>): ChartSpec {
  const xOpt = props.xAxis ?? {};
  const yOpt = props.yAxis ?? {};
  const allBars = seriesList.length > 0 && seriesList.every((s) => (s.type ?? 'line') === 'bar');
  const horizontal = props.orientation === 'horizontal' || allBars;
  const axisDefs = new Map<string, { direction: 'x' | 'y'; options: ChartAxisOptions }>();
  axisDefs.set('x', { direction: 'x', options: { ...xOpt, id: 'x' } });
  axisDefs.set('y', { direction: 'y', options: { ...yOpt, id: 'y' } });
  for (const a of props.axes ?? []) axisDefs.set(a.id, { direction: a.direction, options: a });

  // Categories and x scale kind per x axis.
  const categories = new Map<string, string[]>();
  const kinds = new Map<string, ChartScale>();
  const ids = new Set<string>();
  const ordered = seriesList.map((s, i) => ({ s, i })).sort((a, b) => (a.s.order ?? 0) - (b.s.order ?? 0) || a.i - b.i);
  for (const { s } of ordered) {
    const axisId = s.xAxis ?? 'x';
    const def = axisDefs.get(axisId) ?? axisDefs.get('x');
    let kind = kinds.get(axisId) ?? def?.options.scale;
    const data = s.data ?? props.data ?? [];
    const type = s.type ?? 'line';
    if (!kind) {
      const sample = data.find((d) => readField(d, s.xField) != null);
      const v = readField(sample, s.xField);
      kind = type === 'histogram' ? 'linear' : typeof v === 'number' ? 'linear' : isDateLike(v) ? 'time' : 'category';
      if (type === 'boxPlot' || type === 'pareto' || type === 'waterfall' || type === 'bullet') kind = kind === 'linear' ? 'category' : kind;
    }
    kinds.set(axisId, kind);
    if (kind === 'category' || kind === 'timeCategory') {
      let list = categories.get(axisId);
      if (!list) categories.set(axisId, (list = []));
      const seen = new Set(list);
      for (const [k, d] of data.entries()) {
        const raw = readField(d, s.xField);
        const label = raw instanceof Date ? raw.toISOString() : String(raw ?? '');
        // Indexed: one category per point index, duplicates kept.
        if (def?.options.indexed) list[k] ??= label;
        else if (!seen.has(label)) {
          seen.add(label);
          list.push(label);
        }
      }
    }
  }
  const axes = new Map<string, CompiledAxis>();
  for (const [id, def] of axisDefs) {
    const scale = def.direction === 'x' ? (kinds.get(id) ?? def.options.scale ?? 'linear') : (def.options.scale ?? 'linear');
    axes.set(id, { id, direction: def.direction, options: def.options, scale, categories: categories.get(id) ?? [], position: def.options.position ?? 'start' });
  }

  const out: CompiledSeries[] = [];
  let slot = 0;
  for (const { s, i } of ordered) {
    let id = seriesId(s, i);
    while (ids.has(id)) id = `${id}-${i}`;
    ids.add(id);
    const type = s.type ?? 'line';
    const data = s.data ?? props.data ?? [];
    const xAxis = s.xAxis ?? 'x';
    const yAxis = s.yAxis ?? 'y';
    const axis = axes.get(xAxis) as CompiledAxis;
    const catIndex = new Map(axis.categories.map((c, k) => [c, k]));
    const n = data.length;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const col = (field: string | undefined) => (field ? Float64Array.from(data, (d) => toNumber(readField(d, field))) : undefined);
    for (let k = 0; k < n; k++) {
      const d = data[k] as ChartDatum;
      const raw = readField(d, s.xField);
      x[k] =
        axis.options.indexed
          ? k
          : axis.scale === 'category' || axis.scale === 'timeCategory'
          ? (catIndex.get(raw instanceof Date ? raw.toISOString() : String(raw ?? '')) ?? k)
          : axis.scale === 'time'
            ? toTime(raw)
            : s.xField
              ? toNumber(raw)
              : k;
      y[k] = toNumber(readField(d, s.yField));
    }
    const yFilled = s.emptyPoints && s.emptyPoints !== 'gap' ? fillEmpty(y, s.emptyPoints) : y;
    const color = s.color ?? seriesColor(slot, props.palette);
    const boxes = type === 'boxPlot' ? data.map((d) => (Array.isArray(readField(d, s.yField)) ? (readField(d, s.yField) as unknown[]).map(toNumber) : [toNumber(readField(d, s.yField))])) : undefined;
    const targetFields = s.targetField === undefined ? [] : typeof s.targetField === 'string' ? [s.targetField] : s.targetField;
    out.push({
      id,
      slot,
      type,
      name: s.name ?? s.yField ?? id,
      options: s,
      data,
      color,
      xAxis,
      yAxis,
      x,
      y: yFilled,
      low: col(s.lowField),
      high: col(s.highField),
      open: col(s.openField),
      close: col(s.closeField),
      size: col(s.sizeField),
      boxes,
      targets: targetFields.map((f) => col(f) as Float64Array),
      hidden: s.hidden === true || hidden.has(id),
    });
    slot++;
  }
  return { series: out, axes, horizontal };
}

// ---------------------------------------------------------------------------
// Layout model
// ---------------------------------------------------------------------------

export interface MarkPath {
  readonly key: string;
  readonly d: string;
  readonly fill?: string | undefined;
  readonly stroke?: string | undefined;
  readonly strokeWidth?: number | undefined;
  readonly dash?: string | undefined;
  readonly opacity?: number | undefined;
  /** Point index for per-point marks (selection, highlight). */
  readonly index?: number | undefined;
  readonly className?: string | undefined;
}

export interface MarkLabel {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly text: string;
  readonly anchor: 'start' | 'middle' | 'end';
  readonly angle?: number | undefined;
  /** Point index of a data label. */
  readonly index?: number | undefined;
}

export interface SeriesModel {
  readonly id: string;
  readonly name: string;
  readonly type: ChartSeriesType;
  readonly color: string;
  readonly hidden: boolean;
  readonly marks: readonly MarkPath[];
  readonly labels: readonly MarkLabel[];
  /** Pixel anchor per data point (tooltip, focus, hit-test); NaN when not drawn. */
  readonly px: Float64Array;
  readonly py: Float64Array;
  /** Original data length (decimation never shrinks it). */
  readonly count: number;
  readonly legendShape: ChartLegendShape | 'line' | 'area' | 'column';
  readonly tooltip: boolean;
  /** Point texts for tooltip and table. */
  readonly xText: (index: number) => string;
  readonly yText: (index: number) => string;
  readonly yValue: (index: number) => number;
  readonly inTable: boolean;
  /** x pixel order is ascending (binary search for shared tooltips). */
  readonly sortedX: boolean;
  /** Drawn color of a point (data colors, ranges, segments). */
  readonly colorAt: (index: number) => string;
}

export interface AxisTick {
  readonly key: string;
  readonly value: number;
  readonly pos: number;
  readonly text: readonly string[];
  readonly hidden: boolean;
  readonly row: number;
}

export interface AxisModel {
  readonly id: string;
  readonly direction: 'x' | 'y';
  readonly side: AxisSide;
  readonly scale: Scale;
  readonly ticks: readonly AxisTick[];
  readonly minor: readonly number[];
  readonly angle: number;
  readonly line: number;
  /** Where the tick labels hang (the line, or the plot edge for `crossAt` without `labelsAtCross`). */
  readonly labelLine: number;
  readonly title?: string | undefined;
  readonly hidden: boolean;
  /** Multi-level label cells: pixel span along the axis and the row. */
  readonly groups: readonly { key: string; a: number; b: number; off: number; size: number; label: string; border: string }[];
  /** Offset of the first group row from the axis line. */
  readonly groupOffset: number;
  readonly grid: 'none' | 'major' | 'both';
  readonly format: (value: number) => string;
  readonly bands: readonly MarkPath[];
  readonly lines: readonly { key: string; d: string; label?: string | undefined; lx: number; ly: number; color?: string | undefined; dash?: string | undefined }[];
  readonly block: Rect;
  readonly options: ChartAxisOptions;
}

export interface ChartModel {
  readonly width: number;
  readonly height: number;
  readonly frame: FrameLayout;
  readonly plot: Rect;
  readonly axes: readonly AxisModel[];
  readonly series: readonly SeriesModel[];
  readonly legend: readonly { id: string; label: string; color: string; shape: SeriesModel['legendShape'] | 'gradient'; hidden: boolean; lineStyle?: 'solid' | 'dashed' | 'dotted' | undefined; stops?: readonly string[] | undefined; seriesId?: string | undefined; index?: number | undefined }[];
  readonly horizontal: boolean;
  readonly empty: boolean;
  readonly summary: string;
  readonly table: TableModel | null;
  /** Total drawn points after decimation (renderer: 'auto'). */
  readonly drawnPoints: number;
  readonly stackLabels: readonly MarkLabel[];
  readonly xAxisId: string;
  readonly yAxisId: string;
  /** Polar and radar grid and labels instead of cartesian axes. */
  readonly decor?: { readonly grid: string; readonly labels: readonly MarkLabel[] } | undefined;
  readonly polar?: boolean | undefined;
}

export interface ViewState {
  readonly width: number;
  readonly height: number;
  readonly zoom: ChartZoomRange;
}

const DASH: Readonly<Record<string, string | undefined>> = { solid: undefined, dashed: '6 4', dotted: '2 3' };
const isPrice = (t: ChartSeriesType): boolean => t === 'candle' || t === 'ohlc' || t === 'hilo';
const isBandType = (t: ChartSeriesType): boolean => t === 'column' || t === 'bar' || t === 'waterfall' || t === 'histogram' || t === 'candle' || t === 'ohlc' || t === 'hilo' || t === 'boxPlot' || t === 'pareto' || t === 'bullet';

interface Extent {
  lo: number;
  hi: number;
}
const grow = (e: Extent, v: number) => {
  if (!Number.isFinite(v)) return;
  if (v < e.lo) e.lo = v;
  if (v > e.hi) e.hi = v;
};
/** Grows `e` by every value of the given columns (absent columns skipped). */
const growAll = (e: Extent, columns: readonly (ArrayLike<number> | undefined)[]) => {
  for (const c of columns) if (c) for (let i = 0; i < c.length; i++) grow(e, c[i] as number);
};

/** Values a series contributes to its value axis after stacking. */
interface Prepared {
  readonly s: CompiledSeries;
  y0?: Float64Array;
  y1: Float64Array;
  /** Waterfall kinds. */
  kinds?: readonly string[];
  /** Histogram bins replace the data. */
  hist?: { x0: number[]; x1: number[]; count: number[]; binWidth: number; curve?: Float64Array; curveX?: number[] };
  boxes?: ReturnType<typeof boxPlotStats>[];
  errLow?: Float64Array;
  errHigh?: Float64Array;
  errXLow?: Float64Array;
  errXHigh?: Float64Array;
  /** `getPointStyle` results per point index, one call per point. */
  styles?: (ReturnType<NonNullable<ChartSeriesOptions['getPointStyle']>> | null)[];
}

function interval(options: ChartAxisOptions): TimeInterval | undefined {
  return typeof options.interval === 'object' ? options.interval : undefined;
}

/** Builds the full layout model for a size and view state. */
/** The y values of a series as a column (a plain loop: `Float64Array.from` with a map function is slow on 1,000,000 points). */
function yColumn(m: SeriesModel): Float64Array {
  const out = new Float64Array(m.count);
  for (let i = 0; i < m.count; i++) out[i] = m.yValue(i);
  return out;
}

export function buildModel(props: ChartProps, spec: ChartSpec, view: ViewState, indicators?: IndicatorLayout | null): ChartModel {
  const extra = props.indicators?.length ? indicators?.(props, spec) : undefined;
  const width = Math.max(1, view.width);
  const height = Math.max(1, view.height);
  const text = { ...DEFAULT_TEXT, ...props.text };
  const fmtCtx = { locale: props.locale, timeZone: props.timeZone };
  // Data values (labels, tooltips, the table): up to two decimals.
  const valueFmt = (f?: Parameters<typeof makeNumberFormat>[0]) => makeNumberFormat(f, fmtCtx, 0);
  const yFmt = valueFmt();
  const visible = spec.series.filter((s) => !s.hidden);

  // Pareto: sort categories by value and add the cumulative line on a generated secondary axis.
  const prepared: Prepared[] = [];
  const extraAxes: CompiledAxis[] = [];
  const allSeries: CompiledSeries[] = [];
  for (const s of spec.series) {
    if (s.type === 'pareto') {
      const { order, cumulativePercent } = paretoOrder(s.y);
      const axisId = `${s.id}-pareto`;
      const x = Float64Array.from(order.map((_, k) => k));
      const sorted: CompiledSeries = { ...s, type: 'column', x, y: Float64Array.from(order, (i) => s.y[i] as number), data: order.map((i) => s.data[i] as ChartDatum) };
      const pareto = s.options.pareto ?? {};
      // The cumulative line takes the next palette color so it stays visible over the bars.
      const line: CompiledSeries = { ...s, id: `${s.id}-cumulative`, name: `${s.name} %`, type: 'line', yAxis: axisId, x, y: cumulativePercent, generated: true, color: pareto.color ?? seriesColor(s.slot + 1, props.palette), options: { ...s.options, markers: pareto.markers ?? true, labels: false } };
      allSeries.push(sorted);
      if (pareto.line !== false) allSeries.push(line);
      const xAxis = spec.axes.get(s.xAxis);
      if (xAxis && xAxis.categories.length) {
        const cats = order.map((i) => {
          const raw = readField(s.data[i], s.options.xField);
          return String(raw ?? '');
        });
        extraAxes.push({ ...xAxis, categories: cats });
      }
      extraAxes.push({ id: axisId, direction: 'y', options: { id: axisId, min: 0, max: 100, format: '{value}%', gridLines: false }, scale: 'linear', categories: [], position: 'end' });
    } else allSeries.push(s);
    // Trendlines as generated line series on the same axes.
    for (const [k, t] of (s.options.trendlines ?? []).entries()) {
      const pts = trendlinePoints(s.x, s.y, { kind: t.kind, order: t.order, period: t.period, intercept: t.intercept, forecast: t.forecast, samples: t.markers ? Math.min(s.x.length, 256) : undefined });
      allSeries.push({ ...s, id: `${s.id}-trend-${k}`, name: t.name ?? `${s.name} ${t.kind}`, type: 'line', x: pts.xs, y: pts.ys, color: t.color ?? s.color, generated: true, options: { ...s.options, type: 'line', curve: 'linear', lineStyle: 'dashed', markers: t.markers ?? false, tooltip: t.tooltip ?? s.options.tooltip, tooltipField: undefined, getPointStyle: undefined, labels: false, trendlines: undefined, data: undefined } });
    }
  }
  // Indicators (the opt-in `chart/indicators.ts` feature) come after every series.
  allSeries.push(...(extra?.series ?? []));
  const axes = new Map(spec.axes);
  for (const a of [...extraAxes, ...(extra?.axes ?? [])]) axes.set(a.id, a);

  // Stacks per (y axis, group, mode).
  const stackInputs = new Map<string, { id: string; values: Float64Array; group: string; mode: 'normal' | 'percent' }[]>();
  for (const s of allSeries) {
    if (s.hidden || !s.options.stack) continue;
    const key = `${s.xAxis}|${s.yAxis}`;
    let list = stackInputs.get(key);
    if (!list) stackInputs.set(key, (list = []));
    list.push({ id: s.id, values: s.y, group: `${s.type === 'column' || s.type === 'bar' ? 'b' : 'l'}:${s.options.stackGroup ?? ''}`, mode: s.options.stack === 'percent' ? 'percent' : 'normal' });
  }
  const stacked = new Map<string, { y0: Float64Array; y1: Float64Array }>();
  const stackTotals: { xAxis: string; yAxis: string; totals: Float64Array; top: ArrayLike<number>; x: Float64Array }[] = [];
  for (const [key, list] of stackInputs) {
    const length = Math.max(...list.map((l) => l.values.length));
    // Align by x index: series share category positions, so index k is the same x.
    const r = stack(list, length);
    for (const [id, v] of r.series) stacked.set(id, v);
    const [xAxis, yAxis] = key.split('|') as [string, string];
    const first = allSeries.find((s) => s.id === list[0]?.id);
    for (const t of r.totals.values()) stackTotals.push({ xAxis, yAxis, totals: Float64Array.from(t.positive, (p, i) => p + (t.negative[i] as number)), top: t.positive, x: first?.x ?? new Float64Array(length) });
  }

  const xExt = new Map<string, Extent>();
  const yExt = new Map<string, Extent>();
  const ext = (m: Map<string, Extent>, id: string) => {
    let e = m.get(id);
    if (!e) m.set(id, (e = { lo: Number.POSITIVE_INFINITY, hi: Number.NEGATIVE_INFINITY }));
    return e;
  };
  for (const s of allSeries) {
    const p: Prepared = { s, y1: s.y };
    // Point styles: one call per point; `hidden` points leave a gap.
    const gps = s.options.getPointStyle;
    if (gps) {
      p.styles = Array.from(s.y, (y, i) => gps({ seriesId: s.id, seriesName: s.name, index: i, datum: s.data[i] ?? {}, x: readField(s.data[i], s.options.xField), y, xText: '', yText: '', color: s.color }) ?? null);
      if (p.styles.some((st) => st?.hidden)) p.y1 = Float64Array.from(s.y, (y, i) => (p.styles?.[i]?.hidden ? Number.NaN : y));
    }
    const st = stacked.get(s.id);
    if (st) {
      p.y0 = st.y0;
      p.y1 = st.y1;
    }
    if (s.type === 'waterfall') {
      const w = waterfall(s.y, { totals: s.options.totals, subtotals: s.options.subtotals });
      p.y0 = w.y0;
      p.y1 = w.y1;
      p.kinds = w.kind;
    }
    if (s.type === 'histogram') {
      const h = histogramBins(s.y, { binWidth: s.options.binWidth });
      p.hist = h;
      if (s.options.normalCurve) {
        const xsCurve = Array.from({ length: 64 }, (_, k) => (h.x0[0] ?? 0) + (((h.x1[h.x1.length - 1] ?? 1) - (h.x0[0] ?? 0)) * k) / 63);
        p.hist = { ...h, curve: normalCurve(s.y, h.binWidth, xsCurve), curveX: xsCurve };
      }
    }
    if (s.type === 'boxPlot' && s.boxes) p.boxes = s.boxes.map((b) => boxPlotStats(b, s.options.quartileMethod ?? 'exclusive'));
    if (s.options.errorBars) {
      const e = s.options.errorBars;
      const ext = (values: Float64Array) => errorBarExtents(values, { kind: e.kind, amount: e.amount, direction: e.direction, plus: e.plusField ? Float64Array.from(s.data, (d) => toNumber(readField(d, e.plusField))) : undefined, minus: e.minusField ? Float64Array.from(s.data, (d) => toNumber(readField(d, e.minusField))) : undefined });
      if (e.axis !== 'x') {
        const eb = ext(s.y);
        p.errLow = eb.low;
        p.errHigh = eb.high;
      }
      if ((e.axis === 'x' || e.axis === 'both') && spec.axes.get(s.xAxis)?.categories.length === 0) {
        const eb = ext(s.x);
        p.errXLow = eb.low;
        p.errXHigh = eb.high;
      }
    }
    prepared.push(p);
    if (s.hidden) continue;
    const xe = ext(xExt, s.xAxis);
    const ye = ext(yExt, s.yAxis);
    if (p.hist) {
      growAll(xe, [[p.hist.x0[0] ?? 0, p.hist.x1[p.hist.x1.length - 1] ?? 1]]);
      growAll(ye, [p.hist.count, p.hist.curve, [0]]);
      continue;
    }
    growAll(xe, [s.x, p.errXLow, p.errXHigh]);
    growAll(ye, [p.y1, p.y0, s.low, s.high, p.errLow, p.errHigh, ...(s.targets ?? [])]);
    if (p.boxes) growAll(ye, p.boxes.map((b) => [b.min, b.max, ...b.outliers]));
    // Bars and areas grow from zero; price bars (candle, OHLC, high-low) span their own range.
    if ((isBandType(s.type) && !isPrice(s.type)) || s.type === 'area') grow(ye, 0);
  }
  const empty = visible.every((s) => s.data.length === 0);

  // Axis layout: which side, label texts (two passes: estimate, then real plot size).
  const usedAxes = [...axes.values()].filter((a) => a.id === 'x' || a.id === 'y' || allSeries.some((s) => s.xAxis === a.id || s.yAxis === a.id));
  const sideOf = (a: CompiledAxis): AxisSide => {
    const horizontalAxis = (a.direction === 'x') !== spec.horizontal;
    if (horizontalAxis) return a.position === 'end' ? 'top' : 'bottom';
    return a.position === 'end' ? 'right' : 'left';
  };

  const makeScale = (a: CompiledAxis, full: [number, number]): Scale => {
    const o = a.options;
    const off = (o.plotOffset ?? 0) * Math.sign(full[1] - full[0]);
    const range: [number, number] = [full[0] + off, full[1] - off];
    const reversed = o.reversed === true;
    if (a.scale === 'category' || a.scale === 'timeCategory') {
      return bandScale({ domain: a.categories, range, reversed, paddingInner: 0, placement: o.labelPlacement ?? 'between', kind: a.scale });
    }
    const e = (a.direction === 'x' ? xExt : yExt).get(a.id);
    const extent: [number, number] | null = e && Number.isFinite(e.lo) ? [e.lo, e.hi] : null;
    const kind = a.scale === 'log' ? 'log' : a.scale === 'time' ? 'time' : 'linear';
    const isX = a.direction === 'x';
    const tickCount = o.tickCount ?? Math.max(2, Math.round(Math.abs(range[1] - range[0]) / (isX !== spec.horizontal ? 90 : 45)));
    let domain = resolveDomain(extent, {
      min: o.min === undefined ? undefined : toTime(o.min),
      max: o.max === undefined ? undefined : toTime(o.max),
      includeZero: o.includeZero ?? (isX ? false : undefined),
      padding: o.padding ?? (isX ? 'none' : 'auto'),
      tickCount,
      kind,
    });
    if (o.domain) domain = [...o.domain(domain)] as [number, number];
    const z = view.zoom[a.id];
    if (z) domain = [z[0], z[1]];
    return createScale({ kind, domain, range, reversed, base: o.base, timeZone: props.timeZone, interval: interval(o) });
  };

  const tickValues = (a: CompiledAxis, scale: Scale): number[] => {
    const o = a.options;
    if (scale.kind === 'category' || scale.kind === 'timeCategory') return scale.ticks();
    const length = Math.abs(scale.range[1] - scale.range[0]);
    const count = o.tickCount ?? Math.max(2, Math.round(length / (sideIsHorizontal(a) ? 90 : 45)));
    if (typeof o.interval === 'number' && scale.kind !== 'time') {
      const [d0, d1] = scale.domain as readonly [number, number];
      const lo = Math.min(d0, d1);
      const hi = Math.max(d0, d1);
      const out: number[] = [];
      const first = Math.ceil(lo / o.interval - 1e-9) * o.interval;
      for (let v = first, k = 0; v <= hi + 1e-9 && k < 1000; v += o.interval, k++) out.push(Number(v.toPrecision(12)));
      return out;
    }
    return scale.ticks(count);
  };
  const sideIsHorizontal = (a: CompiledAxis) => {
    const s = sideOf(a);
    return s === 'top' || s === 'bottom';
  };
  // Panes: vertical-side axes take a row band of the plot, horizontal-side axes a column band.
  const paneOf = (a: CompiledAxis): number => (sideIsHorizontal(a) ? a.options.pane?.column : a.options.pane?.row) ?? 0;
  const paneRange = (a: CompiledAxis, p: { x: number; y: number; width: number; height: number }): [number, number] => {
    const h = sideIsHorizontal(a);
    const [lo, hi] = paneSpan(h ? props.panes?.columns : props.panes?.rows, paneOf(a), a.options.pane?.span ?? 1, h ? p.x : p.y, h ? p.width : p.height);
    return h ? [lo, hi] : [hi, lo];
  };
  // Same-side axes in different panes share a slot instead of stacking outward.
  const slotOf = new Map<string, string>();
  if (props.panes) {
    const seen = new Map<string, number>();
    for (const a of usedAxes) {
      const key = `${sideOf(a)}:${paneOf(a)}`;
      const k = seen.get(key) ?? 0;
      seen.set(key, k + 1);
      slotOf.set(a.id, `${sideOf(a)}:${k}`);
    }
  }

  const formatterFor = (a: CompiledAxis, scale: Scale, ticks: readonly number[]): ((v: number) => string) => {
    const o = a.options;
    if (o.formatLabel) {
      const f = o.formatLabel;
      return scale.kind === 'category' || scale.kind === 'timeCategory' ? (i) => f(a.categories[i]) : scale.kind === 'time' ? (v) => f(new Date(v)) : (v) => f(v);
    }
    if (scale.kind === 'category' || scale.kind === 'timeCategory') {
      if (scale.kind === 'timeCategory' || a.categories.every((c) => ISO.test(c))) {
        const tf = makeTimeFormat(o.format, fmtCtx, 'day');
        return (i) => {
          const c = a.categories[i] ?? '';
          const t = Date.parse(c);
          return Number.isFinite(t) && ISO.test(c) ? tf(t) : c;
        };
      }
      return (i) => a.categories[i] ?? '';
    }
    if (scale.kind === 'time') return makeTimeFormat(o.format, fmtCtx, scale.interval?.unit ?? 'day');
    const step = ticks.length > 1 ? Math.abs((ticks[1] as number) - (ticks[0] as number)) : 1;
    return makeNumberFormat(o.format, fmtCtx, step);
  };

  // Multi-level label rows: a text row per group on horizontal sides, a column on vertical ones.
  const groupSize = (a: CompiledAxis, horizontalSide: boolean): number => {
    const g = a.options.labelGroups ?? [];
    if (!g.length) return 0;
    return horizontalSide ? g.length * GROUP_ROW : g.reduce((t, x) => t + Math.ceil(Math.max(0, ...x.levels.map((l) => textWidth(l.label)))) + 10, 0);
  };

  const planOf = (a: CompiledAxis, scale: Scale, labels: string[], positions: number[]) =>
    planHorizontalLabels(labels, positions, a.options.labelOverlap ?? (scale.kind === 'category' ? 'auto' : 'hide'), { spacing: scale.kind === 'category' ? (scale as BandScale).step : undefined, maxWidth: a.options.maxLabelWidth, ...(a.options.labelAngle !== undefined ? { angle: a.options.labelAngle } : {}) });
  // Width of the vertical-side labels.
  const labelWidth = (a: CompiledAxis, labels: string[]) => Math.ceil(Math.min(a.options.maxLabelWidth ?? 120, Math.max(8, ...labels.map((l) => textWidth(l)))));

  // Pass 1: estimated ranges.
  const estimate = layoutFrame({ width, height, title: props.title, subtitle: props.subtitle, legend: legendSpec(props, allSeries), axes: mergeSlots(slotOf, usedAxes.map((a) => ({ id: a.id, side: sideOf(a), labelThickness: sideIsHorizontal(a) ? lineHeight('sm') : 40, title: a.options.title, hidden: a.options.hidden }))) });
  const blocks: AxisBlockSpec[] = [];
  let endPad = 0;
  // Scale, ticks, label texts and the horizontal label plan of an axis inside a plot rectangle.
  const axisPass = (a: CompiledAxis, p: Rect) => {
    const horizontalSide = sideIsHorizontal(a);
    const range = paneRange(a, p);
    const scale = makeScale(a, horizontalAxisRange(a, range, spec.horizontal, horizontalSide));
    const ticks = tickValues(a, scale);
    const fmt = formatterFor(a, scale, ticks);
    const labels = ticks.map((t) => fmt(t));
    const positions = ticks.map((t) => scale.map(t));
    return { horizontalSide, range, scale, ticks, fmt, labels, positions, plan: horizontalSide ? planOf(a, scale, labels, positions) : null };
  };
  for (const a of usedAxes) {
    const { horizontalSide, labels, positions, plan } = axisPass(a, estimate.plot);
    blocks.push({ id: a.id, side: sideOf(a), labelThickness: (plan ? plan.thickness : labelWidth(a, labels)) + groupSize(a, horizontalSide), title: a.options.title, hidden: a.options.hidden, inside: a.options.labelPosition === 'inside' });
    // With `edgeLabels: 'none'` an unrotated end label centered on the plot's end would be cut
    // by the drawing: the frame keeps room for it instead.
    if (plan && (a.options.edgeLabels ?? 'none') === 'none' && !a.options.hidden && !plan.angle)
      positions.forEach((pos, k) => {
        if (!plan.hidden[k]) endPad = Math.max(endPad, Math.ceil(pos + textWidth(labels[k] ?? '') / 2 - width + 1));
      });
  }
  // Pass 2: the real frame.
  const frame = alignLegend(layoutFrame({ width: width - endPad, height, title: props.title, subtitle: props.subtitle, legend: legendSpec(props, allSeries), axes: mergeSlots(slotOf, blocks), plotInset: 0 }), props);
  const plot = frame.plot;
  const axisModels: AxisModel[] = [];
  const scales = new Map<string, Scale>();
  for (const a of usedAxes) {
    const { horizontalSide, range, scale, ticks, fmt, labels, positions, plan } = axisPass(a, plot);
    scales.set(a.id, scale);
    const frameBlock = frame.axes.get(slotOf.get(a.id) ?? a.id) ?? { x: 0, y: 0, width: 0, height: 0, line: 0, id: a.id, side: sideOf(a) };
    // A pane axis's block spans its pane only (title and axis line).
    const block = props.panes ? (horizontalSide ? { ...frameBlock, id: a.id, x: Math.min(...range), width: Math.abs(range[1] - range[0]) } : { ...frameBlock, id: a.id, y: Math.min(...range), height: Math.abs(range[1] - range[0]) }) : frameBlock;
    const vHidden = horizontalSide ? null : planVerticalLabels(positions);
    const edge = a.options.edgeLabels ?? 'none';
    const tickModels: AxisTick[] = ticks.map((t, k) => {
      let pos = positions[k] as number;
      let hiddenLabel = plan ? (plan.hidden[k] ?? false) : (vHidden?.[k] ?? false);
      if (horizontalSide && edge !== 'none') {
        const w = textWidth(labels[k] ?? '') / 2;
        if (pos - w < 0 || pos + w > width) {
          if (edge === 'hide') hiddenLabel = true;
          else pos = Math.min(width - w, Math.max(w, pos));
        }
      }
      return { key: `${a.id}-${t}`, value: t, pos, text: plan ? ((plan.lines[k] as readonly string[]) ?? [labels[k] ?? '']) : [truncateText(labels[k] ?? '', a.options.maxLabelWidth ?? 120)], hidden: hiddenLabel, row: plan?.rows[k] ?? 0 };
    });
    const grid = a.options.gridLines === false ? 'none' : a.options.gridLines === 'both' ? 'both' : a.options.gridLines === true || a.options.gridLines === 'major' ? 'major' : a.direction === 'y' && a.id === 'y' ? 'major' : 'none';
    const minor: number[] = [];
    if ((a.options.minorTicks ?? 0) > 0 && scale.kind !== 'category' && scale.kind !== 'timeCategory') {
      const m = a.options.minorTicks as number;
      for (let k = 0; k < ticks.length - 1; k++) for (let j = 1; j <= m; j++) minor.push(scale.map((ticks[k] as number) + (((ticks[k + 1] as number) - (ticks[k] as number)) * j) / (m + 1)));
    }
    const lineMarks = (a.options.lines ?? []).map((l, k) => {
      const p = scale.map(l.value);
      return horizontalSide
        ? { key: `${a.id}-line-${k}`, d: `M${n2(p)},${n2(plot.y)}V${n2(plot.y + plot.height)}`, label: l.label, lx: p + 4, ly: plot.y + 12, color: l.color, dash: DASH[l.lineStyle ?? 'dashed'] }
        : { key: `${a.id}-line-${k}`, d: `M${n2(plot.x)},${n2(p)}H${n2(plot.x + plot.width)}`, label: l.label, lx: plot.x + plot.width - 4, ly: p - 4, color: l.color, dash: DASH[l.lineStyle ?? 'dashed'] };
    });
    axisModels.push({
      id: a.id,
      direction: a.direction,
      side: block.side,
      scale,
      ticks: tickModels,
      minor,
      angle: plan?.angle ?? 0,
      line: block.line,
      title: a.options.title,
      hidden: a.options.hidden === true,
      grid,
      format: fmt,
      bands: [],
      lines: lineMarks,
      block,
      options: a.options,
      labelLine: block.line,
      groups: labelGroupCells(a, scale, horizontalSide),
      groupOffset: TICK_SIZE + LABEL_GAP + (plan ? plan.thickness : labelWidth(a, labels)),
    });
  }
  // Post pass: crossing lines and bands, whose segments need the crossing scale.
  const crossOf = (m: AxisModel, id?: string): Scale | undefined => scales.get(id ?? (m.direction === 'x' ? 'y' : 'x'));
  for (const [k, m] of axisModels.entries()) {
    const horizontalSide = m.side === 'top' || m.side === 'bottom';
    const scale = m.scale;
    const bands: MarkPath[] = [];
    for (const [bi, b] of (m.options.bands ?? []).entries()) {
      const reps: [number, number][] = [];
      if (b.every && b.every > 0) {
        const until = b.until ?? Math.max(scale.domain[0] as number, scale.domain[1] as number);
        for (let from = b.from, j = 0; from <= until && j < 500; from += b.every, j++) reps.push([from, from + (b.to - b.from)]);
      } else reps.push([b.from, b.to]);
      const cross = crossOf(m);
      let c0 = horizontalSide ? plot.y : plot.x;
      let c1 = horizontalSide ? plot.y + plot.height : plot.x + plot.width;
      if (cross && (b.crossFrom !== undefined || b.crossTo !== undefined)) {
        const q0 = b.crossFrom === undefined ? c0 : cross.map(b.crossFrom);
        const q1 = b.crossTo === undefined ? c1 : cross.map(b.crossTo);
        [c0, c1] = [Math.min(q0, q1), Math.max(q0, q1)];
      }
      for (const [j, [f, t]] of reps.entries()) {
        const p0 = scale.map(f);
        const p1 = scale.map(t);
        const d = horizontalSide ? rectPath(Math.min(p0, p1), c0, Math.abs(p1 - p0), c1 - c0) : rectPath(c0, Math.min(p0, p1), c1 - c0, Math.abs(p1 - p0));
        bands.push({ key: `${m.id}-band-${bi}-${j}`, d, fill: b.color ?? 'var(--salmon-surface-sunken)', opacity: b.color ? 0.25 : 1, className: b.layer === 'over' ? 'over' : 'behind' });
      }
    }
    let line = m.line;
    const ca = m.options.crossAt;
    if (ca) {
      const cross = crossOf(m, ca.axis);
      const q = cross ? cross.map(toTime(ca.value)) : Number.NaN;
      if (Number.isFinite(q)) line = q;
    }
    axisModels[k] = { ...m, bands, line, labelLine: ca && m.options.labelsAtCross ? line : m.line };
  }

  // Marks.
  const toPx = (xs: Scale, ys: Scale, x: number, y: number): [number, number] => (spec.horizontal ? [ys.map(y), xs.map(x)] : [xs.map(x), ys.map(y)]);
  // Column slots per x axis: side-by-side groups.
  const bandSeries = prepared.filter((p) => !p.s.hidden && (p.s.type === 'column' || p.s.type === 'bar' || p.s.type === 'waterfall'));
  const slotKeys: string[] = [];
  for (const p of bandSeries) {
    const key = props.grouping === 'overlap' ? 'all' : p.s.options.stack ? `stack:${p.s.options.stackGroup ?? ''}` : (p.s.options.group ?? p.s.id);
    if (!slotKeys.includes(key)) slotKeys.push(key);
  }
  let drawn = 0;
  const seriesModels: SeriesModel[] = [];
  const allLabels: MarkLabel[] = [];
  const smart: { at: number; mode: DataLabelOverlap; dedupe: boolean }[] = [];
  for (const p of prepared) {
    const s = p.s;
    const xs = scales.get(s.xAxis) ?? scales.get('x');
    const ys = scales.get(s.yAxis) ?? scales.get('y');
    const xAxisModel = axisModels.find((a) => a.id === s.xAxis) ?? axisModels.find((a) => a.id === 'x');
    if (!xs || !ys) continue;
    const n = s.x.length;
    const px = new Float64Array(n).fill(Number.NaN);
    const py = new Float64Array(n).fill(Number.NaN);
    const marks: MarkPath[] = [];
    const labels: MarkLabel[] = [];
    const xCat = xs.kind === 'category' || xs.kind === 'timeCategory';
    const band = xCat ? (xs as BandScale).step : estimateBand(s.x, xs as ContinuousScale);
    const lineStyle = DASH[s.options.lineStyle ?? 'solid'];
    const opacity = s.options.opacity;
    const xFmt = (i: number): string => {
      const raw = readField(s.data[i], s.options.xField);
      if (xCat) return xAxisModel ? xAxisModel.format(s.x[i] as number) : String(raw ?? '');
      if (xs.kind === 'time') return makeTimeFormat(undefined, fmtCtx, 'day')(s.x[i] as number);
      return raw === undefined ? String(s.x[i]) : xAxisModel ? xAxisModel.format(s.x[i] as number) : String(raw);
    };
    const yAxisModel = axisModels.find((a) => a.id === s.yAxis);
    const yvFmt = valueFmt(yAxisModel?.options.format);
    // A waterfall total or subtotal shows the sum its bar spans, not its (empty) data value.
    const valueAt = (i: number): number => (p.kinds?.[i]?.endsWith('total') ? (p.y1[i] as number) - (p.y0?.[i] as number) : (s.y[i] as number));
    const yTextOf = (i: number): string => {
      if (s.options.tooltipField) {
        const t = readField(s.data[i], s.options.tooltipField);
        if (t != null && t !== '') return String(t);
      }
      if (isPrice(s.type)) {
        const vf = s.options.volumeField;
        const parts = [s.open ? `O ${yFmt(s.open[i] as number)}` : '', s.high ? `H ${yFmt(s.high[i] as number)}` : '', s.low ? `L ${yFmt(s.low[i] as number)}` : '', s.close ? `C ${yFmt(s.close[i] as number)}` : '', vf ? `V ${yFmt(toNumber(readField(s.data[i], vf)))}` : ''];
        return parts.filter(Boolean).join(' ');
      }
      if (p.boxes) {
        const b = p.boxes[i];
        return b ? `min ${yFmt(b.min)}, Q1 ${yFmt(b.q1)}, median ${yFmt(b.median)}, Q3 ${yFmt(b.q3)}, max ${yFmt(b.max)}` : '';
      }
      const v = valueAt(i);
      if (!Number.isFinite(v)) return '';
      if (s.low && s.high && !Number.isFinite(v)) return `${yFmt(s.low[i] as number)} – ${yFmt(s.high[i] as number)}`;
      return yvFmt(v);
    };
    const pointColor = (i: number): string => {
      const field = s.options.colorField ? readField(s.data[i], s.options.colorField) : undefined;
      if (typeof field === 'string') return field;
      const st = p.styles?.[i];
      if (st?.color) return st.color;
      // Range colors: the range the y value falls in; several colors spread across it.
      for (const r of props.colorRanges ?? []) {
        const v = s.y[i] as number;
        if (v >= r.from && v <= r.to && r.colors.length) return rangeColor(r, v);
      }
      if (s.options.segments?.length) {
        const axisV = s.options.segmentAxis === 'x' ? (s.x[i] as number) : (s.y[i] as number);
        for (const seg of s.options.segments) if (seg.until === undefined || axisV <= seg.until) return seg.color;
      }
      return s.color;
    };
    const legendShape: SeriesModel['legendShape'] = s.options.legendShape && s.options.legendShape !== 'seriesType' ? s.options.legendShape : s.type === 'line' ? 'line' : s.type === 'area' ? 'area' : s.type === 'scatter' || s.type === 'bubble' ? 'circle' : 'column';

    if (!s.hidden && !empty) {
      if (s.type === 'line' || s.type === 'area') {
        const yTop = p.y1;
        const yBase = p.y0;
        // Pixel anchors for every point (hit-test, focus, tooltips on the original data).
        for (let i = 0; i < n; i++) {
          const yv = s.low && s.high && !Number.isFinite(yTop[i] as number) ? (s.high[i] as number) : (yTop[i] as number);
          const [a, b] = toPx(xs, ys, s.x[i] as number, yv);
          px[i] = a;
          py[i] = b;
        }
        // Decimate in data order on the x pixel (sorted x only).
        const sorted = isSorted(s.x);
        let from = 0;
        let to = n;
        if (sorted && !xCat) [from, to] = visibleRange(s.x, xs.domain[0] as number, xs.domain[1] as number);
        const along = spec.horizontal ? py : px;
        const idx = sorted ? decimateLine(s.x, yTop, (x) => xs.map(x), spec.horizontal ? plot.height : plot.width, props.decimation ?? 'auto', from, to) : null;
        const pick = (arr: ArrayLike<number>): Float64Array => (idx ? Float64Array.from(idx, (i) => arr[i] as number) : Float64Array.from({ length: to - from }, (_, k) => arr[from + k] as number));
        const dx = pick(along);
        const dy = pick(spec.horizontal ? px : py);
        drawn += dx.length;
        const curve = { curve: s.options.curve, tension: s.options.tension, stepPosition: s.options.stepPosition, risers: s.options.risers };
        const xsP = spec.horizontal ? dy : dx;
        const ysP = spec.horizontal ? dx : dy;
        const hasRange = Boolean(s.low && s.high);
        if (s.type === 'area') {
          let base: number | Float64Array;
          if (hasRange) {
            const lo = pick(Float64Array.from({ length: n }, (_, i) => toPx(xs, ys, s.x[i] as number, s.low?.[i] as number)[spec.horizontal ? 0 : 1]));
            const hi = pick(Float64Array.from({ length: n }, (_, i) => toPx(xs, ys, s.x[i] as number, s.high?.[i] as number)[spec.horizontal ? 0 : 1]));
            marks.push({ key: 'area', d: spec.horizontal ? areaPathH(dx, hi, lo) : areaPath(dx, hi, lo, curve), fill: s.color, opacity: opacity ?? 0.35 });
            marks.push({ key: 'line-hi', d: spec.horizontal ? linePath(hi, dx, curve) : linePath(dx, hi, curve), stroke: s.color, strokeWidth: 2, dash: lineStyle });
            marks.push({ key: 'line-lo', d: spec.horizontal ? linePath(lo, dx, curve) : linePath(dx, lo, curve), stroke: s.color, strokeWidth: 2, dash: lineStyle });
          } else {
            if (yBase) base = pick(Float64Array.from({ length: n }, (_, i) => toPx(xs, ys, s.x[i] as number, yBase[i] as number)[spec.horizontal ? 0 : 1]));
            else base = toPx(xs, ys, 0, Math.max(Math.min(0, Math.max(ys.domain[0] as number, ys.domain[1] as number)), Math.min(ys.domain[0] as number, ys.domain[1] as number)))[spec.horizontal ? 0 : 1];
            marks.push({ key: 'area', d: spec.horizontal ? areaPathH(dx, dy, base) : areaPath(dx, dy, base, curve), fill: s.color, opacity: opacity ?? 0.35 });
            marks.push({ key: 'line', d: linePath(xsP, ysP, curve), stroke: s.color, strokeWidth: 2, dash: lineStyle });
          }
        } else if (s.options.segments?.length && !idx) {
          // Multi-colored line: one path per run of equal color.
          let start = from;
          for (let i = from + 1; i <= to; i++) {
            if (i < to && pointColor(i) === pointColor(start)) continue;
            const end = Math.min(to - 1, i);
            const sx = Float64Array.from({ length: end - start + 1 }, (_, k) => px[start + k] as number);
            const sy = Float64Array.from({ length: end - start + 1 }, (_, k) => py[start + k] as number);
            const seg = s.options.segments.find((g) => g.color === pointColor(start));
            marks.push({ key: `seg-${start}`, d: linePath(sx, sy, curve), stroke: pointColor(start), strokeWidth: 2, dash: DASH[seg?.lineStyle ?? s.options.lineStyle ?? 'solid'] });
            start = i;
          }
        } else {
          marks.push({ key: 'line', d: linePath(xsP, ysP, curve), stroke: s.color, strokeWidth: 2, dash: lineStyle, opacity });
        }
        if (s.options.markers && n <= 2000) addMarkers(marks, s, px, py, pointColor, from, to);
      } else if (s.type === 'scatter' || s.type === 'bubble') {
        let sMin = Number.POSITIVE_INFINITY;
        let sMax = Number.NEGATIVE_INFINITY;
        if (s.size)
          for (const v of s.size)
            if (Number.isFinite(v)) {
              sMin = Math.min(sMin, v);
              sMax = Math.max(sMax, v);
            }
        const [rMin, rMax] = s.options.radius ?? [4, Math.max(8, Math.min(plot.width, plot.height) / 10)];
        const markerOpt = typeof s.options.markers === 'object' ? s.options.markers : {};
        const shape: SymbolShape = (markerOpt.shape as SymbolShape | undefined) ?? 'circle';
        const groups = new Map<string, string>();
        for (let i = 0; i < n; i++) {
          const [a, b] = toPx(xs, ys, s.x[i] as number, s.y[i] as number);
          px[i] = a;
          py[i] = b;
        }
        // Pixel binning: above four points per plot pixel column, one point per pixel cell is drawn.
        const keep = props.decimation !== false && s.type === 'scatter' && n > plot.width * 4 ? new Set(binPoints(px, py, 1)) : null;
        for (let i = 0; i < n; i++) {
          const a = px[i] as number;
          const b = py[i] as number;
          if (!Number.isFinite(a) || !Number.isFinite(b) || (keep && !keep.has(i))) continue;
          const size = s.type === 'bubble' && s.size ? (rMin + ((rMax - rMin) * Math.sqrt(Math.max(0, ((s.size[i] as number) - sMin) / (sMax - sMin || 1))))) * 2 : (markerOpt.size ?? 8);
          const c = pointColor(i);
          if (n > 2000) groups.set(c, (groups.get(c) ?? '') + symbolPath(shape, a, b, size));
          else marks.push({ key: `p${i}`, d: symbolPath(shape, a, b, size), fill: c, opacity: opacity ?? (s.type === 'bubble' ? 0.6 : 0.85), index: i });
        }
        for (const [c, d] of groups) marks.push({ key: `g${c}`, d, fill: c, opacity: opacity ?? 0.85 });
        drawn += keep ? keep.size : n;
      } else if (p.hist) {
        const h = p.hist;
        for (let i = 0; i < h.count.length; i++) {
          const [x0, y0] = toPx(xs, ys, h.x0[i] as number, 0);
          const [x1, y1] = toPx(xs, ys, h.x1[i] as number, h.count[i] as number);
          marks.push({ key: `b${i}`, d: rectPath(x0 + 0.5, y1, x1 - x0 - 1, y0 - y1), fill: s.color, opacity, index: i });
        }
        if (h.curve && h.curveX) {
          const cx = Float64Array.from(h.curveX, (x) => xs.map(x));
          const cy = Float64Array.from(h.curve, (y) => ys.map(y));
          marks.push({ key: 'normal', d: linePath(cx, cy, { curve: 'natural' }), stroke: SEMANTIC.neutral, strokeWidth: 2 });
        }
        drawn += h.count.length;
      } else if (isBandType(s.type)) {
        const slotKey = props.grouping === 'overlap' ? 'all' : s.options.stack ? `stack:${s.options.stackGroup ?? ''}` : (s.options.group ?? s.id);
        const isColumnLike = s.type === 'column' || s.type === 'bar' || s.type === 'waterfall';
        const slots = isColumnLike ? Math.max(1, slotKeys.length) : 1;
        const slotIndex = isColumnLike ? Math.max(0, slotKeys.indexOf(slotKey)) : 0;
        const bw = s.options.bandWidth;
        // Time-bucket OHLC aggregation per pixel bucket for large financial series.
        const isOhlc = isPrice(s.type);
        const alongPx = spec.horizontal ? plot.height : plot.width;
        const agg = isOhlc && s.open && s.high && s.low && s.close && !xCat && props.decimation !== false && n > alongPx / 3 && isSorted(s.x) ? aggregateOhlc(s.x, s.open, s.high, s.low, s.close, (x) => xs.map(x), 3) : null;
        const count = agg ? agg.x.length : n;
        const groupWidth = bw !== undefined && bw > 1 ? bw * slots : (agg ? 3 : band) * (bw ?? (s.type === 'bullet' ? 0.6 : 0.7));
        const one = groupWidth / slots;
        const gap = s.options.gap ?? 0;
        // Volume of a financial series: columns along the bottom fifth of the plot, in the candle colors.
        const vf = isOhlc ? s.options.volumeField : undefined;
        const vol = vf ? Float64Array.from(s.data, (d) => toNumber(readField(d, vf))) : null;
        const vMax = vol ? Math.max(0, ...Array.from(vol).filter(Number.isFinite)) : 0;
        for (let k = 0; k < count; k++) {
          const i = agg ? (agg.source[k] as number) : k;
          const center = xs.map(agg ? (agg.x[k] as number) : (s.x[i] as number));
          const start = center - groupWidth / 2 + slotIndex * one + (one * gap) / 2;
          const w = one * (1 - gap);
          const mid = start + w / 2;
          const rectBetween = (v0: number, v1: number, key: string, fill: string, extra: Partial<MarkPath> = {}) => {
            const a = ys.map(v0);
            const b = ys.map(v1);
            if (!Number.isFinite(a) || !Number.isFinite(b)) return;
            const d = spec.horizontal ? rectPath(Math.min(a, b), start, Math.abs(b - a), w) : rectPath(start, Math.min(a, b), w, Math.abs(b - a));
            marks.push({ key, d, fill, index: i, opacity, ...extra });
          };
          const anchorAt = (v: number) => {
            const [a, b] = spec.horizontal ? [ys.map(v), mid] : [mid, ys.map(v)];
            px[i] = a;
            py[i] = b;
          };
          if (isOhlc) {
            const o = agg ? (agg.open[k] as number) : (s.open?.[i] as number);
            const c = agg ? (agg.close[k] as number) : (s.close?.[i] as number);
            const hi = agg ? (agg.high[k] as number) : (s.high?.[i] as number);
            const lo = agg ? (agg.low[k] as number) : (s.low?.[i] as number);
            const up = !(c < o);
            const col = s.type === 'hilo' ? s.color : up ? (s.options.upColor ?? SEMANTIC.up) : (s.options.downColor ?? SEMANTIC.down);
            const a = ys.map(hi);
            const b = ys.map(lo);
            if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
            const wick = spec.horizontal ? `M${n2(a)},${n2(mid)}H${n2(b)}` : `M${n2(mid)},${n2(a)}V${n2(b)}`;
            let d = wick;
            if (s.type === 'ohlc') {
              const yo = ys.map(o);
              const yc = ys.map(c);
              d += spec.horizontal ? `M${n2(yo)},${n2(start)}V${n2(mid)}M${n2(yc)},${n2(mid)}V${n2(start + w)}` : `M${n2(start)},${n2(yo)}H${n2(mid)}M${n2(mid)},${n2(yc)}H${n2(start + w)}`;
            }
            if (vol && vMax > 0) {
              const h = (Math.max(0, vol[i] as number) / vMax) * (spec.horizontal ? plot.width : plot.height) * 0.2;
              if (h > 0) marks.push({ key: `v${i}`, d: spec.horizontal ? rectPath(plot.x, start, h, w) : rectPath(start, plot.y + plot.height - h, w, h), fill: col, opacity: 0.3, className: 'volume' });
            }
            marks.push({ key: `w${i}`, d, stroke: col, strokeWidth: 1.5, index: i });
            if (s.type === 'candle') rectBetween(o, c === o ? c + 1e-9 : c, `c${i}`, s.options.hollow && up ? 'none' : col, { stroke: col, strokeWidth: 1 });
            anchorAt(c);
          } else if (s.type === 'boxPlot' && p.boxes) {
            const b = p.boxes[i];
            if (!b || !Number.isFinite(b.median)) continue;
            rectBetween(b.q1, b.q3, `box${i}`, s.color, { opacity: opacity ?? 0.5, stroke: s.color, strokeWidth: 1.5 });
            const line = (v: number, x0: number, x1: number) => {
              const q = ys.map(v);
              return spec.horizontal ? `M${n2(q)},${n2(x0)}V${n2(x1)}` : `M${n2(x0)},${n2(q)}H${n2(x1)}`;
            };
            const stem = spec.horizontal ? `M${n2(ys.map(b.min))},${n2(mid)}H${n2(ys.map(b.q1))}M${n2(ys.map(b.q3))},${n2(mid)}H${n2(ys.map(b.max))}` : `M${n2(mid)},${n2(ys.map(b.min))}V${n2(ys.map(b.q1))}M${n2(mid)},${n2(ys.map(b.q3))}V${n2(ys.map(b.max))}`;
            marks.push({ key: `wh${i}`, d: stem + line(b.min, start + w / 4, start + (3 * w) / 4) + line(b.max, start + w / 4, start + (3 * w) / 4) + line(b.median, start, start + w), stroke: s.color, strokeWidth: 1.5, index: i });
            if (s.options.mean !== false) {
              const [mx, my] = spec.horizontal ? [ys.map(b.mean), mid] : [mid, ys.map(b.mean)];
              marks.push({ key: `mean${i}`, d: symbolPath('multiply', mx, my, 6), stroke: s.color, strokeWidth: 1.5 });
            }
            if (s.options.outliers !== false)
              for (const [k, o] of b.outliers.entries()) {
                const [ox, oy] = spec.horizontal ? [ys.map(o), mid] : [mid, ys.map(o)];
                marks.push({ key: `out${i}-${k}`, d: symbolPath('circle', ox, oy, 6), stroke: s.color, strokeWidth: 1.5, fill: 'none' });
              }
            anchorAt(b.median);
          } else if (s.type === 'bullet') {
            const vq = ys.map(s.y[i] as number);
            if (s.options.valueShape !== 'dot') rectBetween(0, s.y[i] as number, `v${i}`, s.color);
            else if (Number.isFinite(vq)) marks.push({ key: `v${i}`, d: symbolPath('circle', spec.horizontal ? vq : mid, spec.horizontal ? mid : vq, Math.min(14, w)), fill: s.color, index: i, className: 'dot' });
            for (const [k, t] of (s.targets ?? []).entries()) {
              const q = ys.map(t[i] as number);
              if (!Number.isFinite(q)) continue;
              const shape = s.options.targetShapes?.[k] ?? 'line';
              const tc = s.options.targetColor ?? SEMANTIC.text;
              const [tx, ty] = spec.horizontal ? [q, mid] : [mid, q];
              const d =
                shape === 'circle'
                  ? symbolPath('circle', tx, ty, Math.min(14, w * 1.2))
                  : shape === 'cross'
                    ? symbolPath('multiply', tx, ty, Math.min(14, w * 1.2))
                    : spec.horizontal
                      ? `M${n2(q)},${n2(start - w * 0.25)}V${n2(start + w * 1.25)}`
                      : `M${n2(start - w * 0.25)},${n2(q)}H${n2(start + w * 1.25)}`;
              marks.push(shape === 'circle' ? { key: `t${i}-${k}`, d, fill: tc, index: i, className: 'target' } : { key: `t${i}-${k}`, d, stroke: tc, strokeWidth: 3, index: i, className: 'target' });
            }
            anchorAt(s.y[i] as number);
          } else {
            // column, bar, waterfall, range column
            const hasRange = s.low && s.high;
            const v0 = hasRange ? (s.low?.[i] as number) : p.y0 ? (p.y0[i] as number) : 0;
            const v1 = hasRange ? (s.high?.[i] as number) : (p.y1[i] as number);
            if (!Number.isFinite(v1)) continue;
            let fill = pointColor(i);
            if (p.kinds) {
              const k = p.kinds[i];
              fill = k === 'down' ? (s.options.downColor ?? SEMANTIC.down) : k === 'total' || k === 'subtotal' ? (s.options.color ?? SEMANTIC.accent) : (s.options.upColor ?? s.color);
            }
            rectBetween(v0, v1, `r${i}`, fill);
            anchorAt(v1);
            if (p.kinds && s.options.connectors !== false && i < n - 1) {
              const q = ys.map(p.y1[i] as number);
              const nextStart = xs.map(s.x[i + 1] as number) - groupWidth / 2 + slotIndex * one;
              marks.push({ key: `cn${i}`, d: spec.horizontal ? `M${n2(q)},${n2(start + w)}V${n2(nextStart)}` : `M${n2(start + w)},${n2(q)}H${n2(nextStart)}`, stroke: SEMANTIC.axis, strokeWidth: 1 });
            }
          }
        }
        drawn += count;
      }
      // Error bars.
      if ((p.errLow && p.errHigh) || (p.errXLow && p.errXHigh)) {
        const caps = s.options.errorBars?.caps !== false;
        let d = '';
        // One whisker from a to b across the value axis (`alongY`) or the x axis, at the point.
        const whisker = (a: number, b: number, alongY: boolean, i: number) => {
          const vertical = alongY !== spec.horizontal;
          const c = vertical ? (px[i] as number) : (py[i] as number);
          d += vertical ? `M${n2(c)},${n2(a)}V${n2(b)}` : `M${n2(a)},${n2(c)}H${n2(b)}`;
          if (caps) d += vertical ? `M${n2(c - 4)},${n2(a)}H${n2(c + 4)}M${n2(c - 4)},${n2(b)}H${n2(c + 4)}` : `M${n2(a)},${n2(c - 4)}V${n2(c + 4)}M${n2(b)},${n2(c - 4)}V${n2(c + 4)}`;
        };
        for (let i = 0; i < n; i++) {
          if (!Number.isFinite(px[i] as number)) continue;
          if (p.errLow && p.errHigh) whisker(ys.map(p.errLow[i] as number), ys.map(p.errHigh[i] as number), true, i);
          if (p.errXLow && p.errXHigh) whisker(xs.map(p.errXLow[i] as number), xs.map(p.errXHigh[i] as number), false, i);
        }
        marks.push({ key: 'err', d, stroke: SEMANTIC.text, strokeWidth: 1.25 });
      }
      // Data labels.
      if (s.options.labels && n <= 2000) {
        const opt = typeof s.options.labels === 'object' ? s.options.labels : {};
        // Without a label format, labels read like the value axis (`yAxis.format`).
        const f = typeof opt.format === 'function' ? null : (opt.format === undefined ? yvFmt : valueFmt(opt.format));
        for (let i = 0; i < n; i++) {
          const x = px[i] as number;
          const y = py[i] as number;
          const v = valueAt(i);
          if (!Number.isFinite(x) || !Number.isFinite(y) || (!Number.isFinite(v) && !p.boxes)) continue;
          if (v === 0 && opt.showZero === false) continue;
          const label = typeof opt.format === 'function' ? opt.format({ seriesId: s.id, seriesName: s.name, index: i, datum: s.data[i] ?? {}, x: readField(s.data[i], s.options.xField), y: v, xText: xFmt(i), yText: yTextOf(i), color: s.color }) : (f as ValueFormatter)(v);
          const pos = opt.position ?? 'auto';
          const neg = v < 0;
          const off = pos === 'middle' ? 0 : pos === 'bottom' ? -1 : 1;
          if (spec.horizontal) labels.push({ key: `l${i}`, x: x + (neg ? -1 : 1) * off * 6, y: y + 4, text: label, anchor: off === 0 ? 'middle' : neg ? 'end' : 'start', angle: opt.angle, index: i });
          else labels.push({ key: `l${i}`, x, y: y - (neg ? -1 : 1) * off * 8 + (neg && off ? 12 : 0), text: label, anchor: 'middle', angle: opt.angle, index: i });
        }
      }
      if (s.options.lastValue && n > 0) {
        let last = n - 1;
        while (last >= 0 && !Number.isFinite(s.y[last] as number)) last--;
        if (last >= 0) {
          const fmtL = typeof s.options.lastValue === 'object' ? valueFmt(s.options.lastValue.format) : (yAxisModel?.format ?? yFmt);
          labels.push({ key: 'last', x: spec.horizontal ? (px[last] as number) : plot.x + plot.width + 4, y: spec.horizontal ? plot.y - 4 : (py[last] as number) + 4, text: fmtL(s.y[last] as number), anchor: 'start' });
        }
      }
      if (s.options.inlineLabel && n > 0) {
        let last = n - 1;
        while (last >= 0 && !Number.isFinite(py[last] as number)) last--;
        if (last >= 0) labels.push({ key: 'inline', x: (px[last] as number) + 6, y: (py[last] as number) + 4, text: s.name, anchor: 'start' });
      }
    }
    allLabels.push(...labels);
    const lo = typeof s.options.labels === 'object' ? s.options.labels : null;
    if (lo && ((lo.overlap ?? 'none') !== 'none' || lo.dedupe)) smart.push({ at: seriesModels.length, mode: lo.overlap ?? 'none', dedupe: lo.dedupe === true });
    seriesModels.push({
      id: s.id,
      name: s.name,
      type: s.type,
      color: s.color,
      hidden: s.hidden,
      marks,
      labels,
      px,
      py,
      count: n,
      legendShape,
      tooltip: s.options.tooltip !== false,
      xText: xFmt,
      yText: yTextOf,
      yValue: (i) => s.y[i] as number,
      inTable: !s.generated,
      sortedX: isSorted(spec.horizontal ? py : px),
      colorAt: pointColor,
    });
  }

  // Smart labels: one collision pass over the data labels, earlier series first; a colliding label hides,
  // shifts along y or x, or turns 90 degrees.
  const placed: LabelBox[] = [];
  const lh = lineHeight('sm');
  for (const { at, mode, dedupe } of smart) {
    const sm = seriesModels[at] as SeriesModel;
    let prev = '';
    const list = sm.labels.filter((l) => {
      const same = dedupe && l.index !== undefined && l.text === prev;
      if (l.index !== undefined) prev = l.text;
      return !same;
    });
    const boxes = list.map((l) => {
      const w = textWidth(l.text) + 2;
      return { x: l.anchor === 'middle' ? l.x : l.anchor === 'start' ? l.x + w / 2 : l.x - w / 2, y: l.y - lh * 0.32, width: w, height: lh };
    });
    const before = boxes.map((b) => [b.x, b.y] as const);
    const vis = resolveLabelOverlaps([...placed, ...boxes], mode === 'rotate90' ? 'hide' : mode, plot).slice(placed.length);
    const labels: MarkLabel[] = [];
    list.forEach((l, k) => {
      const b = boxes[k] as LabelBox;
      const [bx, by] = before[k] as readonly [number, number];
      if (vis[k]) {
        placed.push(b);
        labels.push({ ...l, x: l.x + b.x - bx, y: l.y + b.y - by });
      } else if (mode === 'rotate90') labels.push({ ...l, angle: -90, anchor: 'start' });
    });
    seriesModels[at] = { ...sm, labels };
  }

  // Stack total labels.
  const stackLabels: MarkLabel[] = [];
  if (props.stackLabels) {
    const f = valueFmt(typeof props.stackLabels === 'object' ? props.stackLabels.format : undefined);
    for (const [k, t] of stackTotals.entries()) {
      const xs = scales.get(t.xAxis);
      const ys = scales.get(t.yAxis);
      if (!xs || !ys) continue;
      for (let i = 0; i < t.totals.length; i++) {
        // The label sits past the end of the positive stack (negative parts hang below zero).
        const [x, y] = toPx(xs, ys, t.x[i] as number, (t.top[i] as number) || (t.totals[i] as number));
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        stackLabels.push(spec.horizontal ? { key: `st${k}-${i}`, x: x + 6, y: y + 4, text: f(t.totals[i] as number), anchor: 'start' } : { key: `st${k}-${i}`, x, y: y - 6, text: f(t.totals[i] as number), anchor: 'middle' });
      }
    }
  }

  // Summary and table.
  const kindName = visible.length ? `${KIND_NAMES[visible[0]?.type ?? 'line']} chart` : text.chart;
  const xAxisModel = axisModels.find((a) => a.id === 'x');
  const tableSeries = seriesModels.filter((m) => m.inTable && !m.hidden);
  const firstX = xAxisModel?.ticks.find((t) => !t.hidden);
  const lastX = xAxisModel ? [...xAxisModel.ticks].reverse().find((t) => !t.hidden) : undefined;
  // Series descriptions follow the summary and the table caption.
  const seriesText = tableSeries.flatMap((m) => {
    const d = allSeries.find((s) => s.id === m.id)?.options.description;
    return d ? [`${m.name}: ${d}.`] : [];
  }).join(' ');
  const summaryText =
    props.description ??
    describeChart({
      kind: props.title ? `${kindName}: ${props.title}` : kindName,
      series: tableSeries.map((m) => ({ name: m.name, stats: seriesStats(yColumn(m)) })),
      x: firstX && lastX ? { label: xAxisModel?.title ?? 'x', from: firstX.text.join(' '), to: lastX.text.join(' ') } : undefined,
      format: yFmt,
      text: { series: (n) => `${n} series`, points: (n) => `${n} ${n === 1 ? 'point' : 'points'}`, range: (a, f, t) => `${a} from ${f} to ${t}`, minMax: (a, b) => `minimum ${a}, maximum ${b}`, trend: { up: 'trending up', down: 'trending down', flat: 'flat' }, noData: text.noData },
    });
  const summary = seriesText ? `${summaryText} ${seriesText}` : summaryText;
  let table: TableModel | null = null;
  if (props.accessibleTable !== false && tableSeries.length > 0) {
    const longest = tableSeries.reduce((a, b) => (b.count > a.count ? b : a));
    table = tableModel(seriesText ? `${props.title ?? text.table}. ${seriesText}` : (props.title ?? text.table), [xAxisModel?.title ?? 'x', ...tableSeries.map((m) => m.name)], longest.count, (r, c) => (c === 0 ? longest.xText(r) : (tableSeries[c - 1]?.yText(r) ?? '')));
  }
  const legend = props.legend === false ? [] : legendItems(props, allSeries, seriesModels);
  return {
    width,
    height,
    frame,
    plot,
    axes: axisModels,
    series: seriesModels,
    legend,
    horizontal: spec.horizontal,
    empty,
    summary,
    table,
    drawnPoints: drawn,
    stackLabels,
    xAxisId: 'x',
    yAxisId: 'y',
  };
}

const GROUP_ROW = lineHeight('sm') + 6;

/** Pixel spans of the multi-level label cells; `from` / `to` are categories or axis values. */
function labelGroupCells(a: CompiledAxis, scale: Scale, horizontalSide: boolean): AxisModel['groups'] {
  const band = scale.kind === 'category' || scale.kind === 'timeCategory';
  const at = (v: number | string, end: boolean): number => {
    if (!band) return scale.map(typeof v === 'string' ? toTime(v) : v);
    const i = typeof v === 'string' ? a.categories.indexOf(v) : v;
    const b = scale as BandScale;
    return b.map(i) + ((end ? 1 : -1) * b.step) / 2;
  };
  let off = 0;
  return (a.options.labelGroups ?? []).flatMap((g, row) => {
    const size = horizontalSide ? GROUP_ROW : Math.ceil(Math.max(0, ...g.levels.map((l) => textWidth(l.label)))) + 10;
    const cells = g.levels.map((l, k) => {
      const p0 = at(l.from, false);
      const p1 = at(l.to, true);
      return { key: `${row}-${k}`, a: Math.min(p0, p1), b: Math.max(p0, p1), off, size, label: l.label, border: g.border ?? 'rectangle' };
    });
    off += size;
    return cells;
  });
}

/** The spec with every axis hidden and without grid lines (the polar frame). */
export function hideAxes(spec: ChartSpec, series = spec.series): ChartSpec {
  return { ...spec, series, axes: new Map([...spec.axes].map(([id, a]) => [id, { ...a, options: { ...a.options, hidden: true, gridLines: false } }])) };
}

/** Current domains of the continuous axes (the zoom range that shows the present view). */
export function currentZoom(model: ChartModel): ChartZoomRange {
  const out: Record<string, readonly [number, number]> = {};
  for (const a of model.axes) if (a.scale.kind !== 'category' && a.scale.kind !== 'timeCategory') out[a.id] = [a.scale.domain[0] as number, a.scale.domain[1] as number];
  return out;
}

function horizontalAxisRange(a: CompiledAxis, range: [number, number], horizontal: boolean, horizontalSide: boolean): [number, number] {
  // In a horizontal (transposed) chart the category axis runs top to bottom.
  if (horizontal && a.direction === 'x' && !horizontalSide) return [range[1], range[0]];
  return range;
}

/** Same-side axes of different panes share one frame block per slot: the thickest sets its size. */
function mergeSlots(slotOf: ReadonlyMap<string, string>, list: readonly AxisBlockSpec[]): AxisBlockSpec[] {
  if (!slotOf.size) return [...list];
  const out = new Map<string, AxisBlockSpec>();
  for (const b of list) {
    const k = slotOf.get(b.id) ?? b.id;
    const p = out.get(k);
    out.set(k, p ? { ...p, labelThickness: Math.max(p.labelThickness, b.labelThickness), title: p.title ?? b.title, hidden: p.hidden && b.hidden } : { ...b, id: k });
  }
  return [...out.values()];
}

/** Moves a centered legend to the start or end of its edge (`legend.align`); the plot does not change. */
function alignLegend(frame: FrameLayout, props: ChartProps): FrameLayout {
  const l = frame.legend;
  const align = typeof props.legend === 'object' ? props.legend.align : undefined;
  if (!l || !align || align === 'center') return frame;
  const side = l.position === 'start' || l.position === 'end';
  const end = align === 'end' ? 1 : -1;
  // A centered legend has equal room on both sides: (x - padding) horizontally; vertically the room ends at the bottom padding.
  const room = side ? frame.height - FRAME_PADDING - l.y - l.height : l.x - FRAME_PADDING;
  const dx = side ? 0 : end * room;
  const dy = side ? end * room : 0;
  const move = <T extends { x: number; y: number }>(r: T): T => ({ ...r, x: r.x + dx, y: r.y + dy });
  return { ...frame, legend: { ...move(l), items: l.items.map(move), title: l.title ? move(l.title) : undefined } };
}

/** Color of `v` inside a color range: one color, or several splitting the range into equal steps. */
function rangeColor(r: ChartColorRange, v: number): string {
  const k = r.to > r.from ? Math.floor(((v - r.from) / (r.to - r.from)) * r.colors.length) : 0;
  return r.colors[Math.min(r.colors.length - 1, Math.max(0, k))] as string;
}

/** Start and end pixel of panes `index` .. `index + span - 1`: sizes in px or `'n%'`, the rest shared evenly. */
export function paneSpan(sizes: readonly (number | string | { readonly size?: number | string | undefined })[] | undefined, index: number, span: number, start: number, length: number): [number, number] {
  if (!sizes?.length) return [start, start + length];
  // Panes are PANE_GAP apart, so the edge labels of neighboring panes never meet.
  const gap = sizes.length > 1 ? PANE_GAP : 0;
  const room = length - gap * (sizes.length - 1);
  const px = sizes.map((x) => {
    const v = typeof x === 'object' ? x.size : x;
    return typeof v === 'number' ? v : typeof v === 'string' ? (Number.parseFloat(v) / 100) * room : Number.NaN;
  });
  const free = px.filter((v) => !Number.isFinite(v)).length;
  const each = free ? Math.max(0, room - px.reduce((t, v) => t + (Number.isFinite(v) ? v : 0), 0)) / free : 0;
  const edges = [start];
  for (const v of px) edges.push((edges[edges.length - 1] as number) + (Number.isFinite(v) ? v : each) + gap);
  const i = Math.min(Math.max(0, index), sizes.length - 1);
  return [edges[i] as number, (edges[Math.min(sizes.length, i + Math.max(1, span))] as number) - gap];
}

/** Space between chart panes. */
const PANE_GAP = 16;

function isSorted(xs: ArrayLike<number>): boolean {
  let prev = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < xs.length; i++) {
    const v = xs[i] as number;
    if (!Number.isFinite(v)) continue;
    if (v < prev) return false;
    prev = v;
  }
  return true;
}

/** Smallest x distance in px (band width for columns on numeric axes). */
function estimateBand(xs: ArrayLike<number>, scale: ContinuousScale): number {
  let min = Number.POSITIVE_INFINITY;
  for (let i = 1; i < Math.min(xs.length, 5000); i++) {
    const d = Math.abs(scale.map(xs[i] as number) - scale.map(xs[i - 1] as number));
    if (d > 0 && d < min) min = d;
  }
  const length = Math.abs(scale.range[1] - scale.range[0]);
  return Number.isFinite(min) ? min : length / Math.max(1, xs.length);
}

function areaPathH(along: Float64Array, top: ArrayLike<number> | number, base: ArrayLike<number> | number): string {
  // Horizontal areas: swap coordinates of a vertical area path.
  const n = along.length;
  let d = '';
  const topAt = (i: number) => (typeof top === 'number' ? top : (top[i] as number));
  const baseAt = (i: number) => (typeof base === 'number' ? base : (base[i] as number));
  for (let i = 0; i < n; i++) d += `${i ? 'L' : 'M'}${n2(topAt(i))},${n2(along[i] as number)}`;
  for (let i = n - 1; i >= 0; i--) d += `L${n2(baseAt(i))},${n2(along[i] as number)}`;
  return n ? `${d}Z` : '';
}

function addMarkers(marks: MarkPath[], s: CompiledSeries, px: Float64Array, py: Float64Array, color: (i: number) => string, from: number, to: number): void {
  const o = typeof s.options.markers === 'object' ? s.options.markers : {};
  const shape = (o.shape ?? 'circle') as SymbolShape;
  const size = o.size ?? 7;
  const stroke = shape === 'cross' || shape === 'plus' || shape === 'multiply' || shape === 'horizontalLine' || shape === 'verticalLine';
  for (let i = from; i < to; i++) {
    const x = px[i] as number;
    const y = py[i] as number;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    const c = color(i);
    marks.push(stroke || o.filled === false ? { key: `m${i}`, d: symbolPath(shape, x, y, size), stroke: c, strokeWidth: 2, fill: o.filled === false && !stroke ? 'var(--salmon-surface-base)' : 'none', index: i, className: 'marker' } : { key: `m${i}`, d: symbolPath(shape, x, y, size), fill: c, stroke: 'var(--salmon-surface-base)', strokeWidth: 1, index: i, className: 'marker' });
  }
}

interface LegendEntry {
  readonly id: string;
  readonly label: string;
  readonly series?: CompiledSeries | undefined;
  readonly index?: number | undefined;
  readonly range?: ChartColorRange | undefined;
}

/** Legend entries per `legend.mode`: series, the first series' points, color ranges or one gradient key. */
function legendEntries(props: ChartProps, series: readonly CompiledSeries[]): LegendEntry[] {
  const o = typeof props.legend === 'object' ? props.legend : {};
  const ranges = props.colorRanges ?? [];
  let list: LegendEntry[];
  if (o.mode === 'point') {
    const s = series.find((x) => !x.hidden && !x.generated);
    list = s ? s.data.map((d, index) => ({ id: `${s.id}:${index}`, label: String(readField(d, s.options.tooltipField ?? s.options.xField) ?? index + 1), series: s, index })) : [];
  } else if (o.mode === 'range') list = ranges.map((r, k) => ({ id: `range-${k}`, label: r.label ?? `${n2(r.from)} – ${n2(r.to)}`, range: r }));
  else if (o.mode === 'gradient') list = ranges.length ? [{ id: 'gradient', label: `${n2(Math.min(...ranges.map((r) => r.from)))} – ${n2(Math.max(...ranges.map((r) => r.to)))}` }] : [];
  else list = series.map((s) => ({ id: s.id, label: s.name, series: s }));
  return o.reverse ? list.reverse() : list;
}

function legendSpec(props: ChartProps, series: readonly CompiledSeries[]) {
  const o = typeof props.legend === 'object' ? props.legend : {};
  if (props.legend === false || (props.legend === undefined && series.filter((s) => !s.generated || s.options.trendlines).length < 2)) return null;
  const items: LegendItemSpec[] = legendEntries(props, series).map((e) => ({ label: e.label }));
  return { position: o.position ?? 'auto', items, title: o.title, maxLabelWidth: o.maxLabelWidth, overflow: o.overflow, columns: o.orientation === 'vertical' ? 1 : o.columns } as const;
}

function legendItems(props: ChartProps, series: readonly CompiledSeries[], models: readonly SeriesModel[]): ChartModel['legend'] {
  if (!legendSpec(props, series)) return [];
  const ranges = props.colorRanges ?? [];
  return legendEntries(props, series).map((e) => {
    const s = e.series;
    const m = s ? models.find((x) => x.id === s.id) : undefined;
    if (e.range) return { id: e.id, label: e.label, color: e.range.colors[0] ?? '', shape: 'rectangle', hidden: false };
    if (!s) return { id: e.id, label: e.label, color: ranges[0]?.colors[0] ?? '', shape: 'gradient', hidden: false, stops: ranges.flatMap((r) => r.colors) };
    if (e.index !== undefined) return { id: e.id, label: e.label, color: m?.colorAt(e.index) ?? s.color, shape: m?.legendShape ?? 'column', hidden: false, seriesId: s.id, index: e.index };
    return { id: s.id, label: s.name, color: s.color, shape: m?.legendShape ?? 'column', hidden: s.hidden, lineStyle: s.options.lineStyle, seriesId: s.id };
  });
}
