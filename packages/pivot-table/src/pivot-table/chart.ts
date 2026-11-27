// Pivot Chart adapters (Pivot Chart folds into `Chart`). `pivotToSeries()` turns a
// result into the `Chart` data model of `@salmonui/charts/chart` (one `data`
// array, `ChartSeriesOptions` per series); the app edits the series
// and renders `Chart` itself (table plus chart is a composition). `pivotChartProps()` returns
// ready `ChartProps` whose `onPointClick` drills the pivot.
// Only chart *types* are imported (pivot-table -> chart is type-only); no chart code or CSS is
// bundled with the pivot table.

import { useMemo } from 'react';
import { measureId, type PivotHeaderNode, type PivotMemberPath, type PivotResult } from '@salmonui/pivot-table/engine';
import type { ExportImage } from '@salmonui/data-grid/engine/export';
import type { ChartApi, ChartAxisOptions, ChartPointContext, ChartProps, ChartSeriesOptions, ChartSeriesType } from '@salmonui/charts/chart';
import type { PivotController } from './controller.js';
import { defined } from './grid-model.js';
import { usePivotState } from './usePivot.js';

/**
 * Pivot chart types. Each maps
 * to `Chart` series options (`pivotChartSeriesOptions()`): `spline` is a
 * `line` with `curve: 'natural'`, `stepLine` a `line` with `curve: 'step'`,
 * the stacked kinds set `stack` (`'percent'` for 100 %). `polar` and `radar`
 * are closed lines in `coordinate="polar"` / `"radar"` (`pivotChartProps()`
 * sets it; `Chart` needs `features={[polar]}`). `pie`, `doughnut`, `funnel`
 * and `pyramid` are not `Chart` series: `PivotChart` from
 * `@salmonui/pivot-table/chart` draws them with `PieChart` and
 * `FunnelChart`, and their shape here is only a `column` data fallback.
 * `pivotType` keeps the requested type.
 */
export type PivotChartSeriesType =
  | 'line'
  | 'column'
  | 'area'
  | 'bar'
  | 'spline'
  | 'stepLine'
  | 'stackingColumn'
  | 'stackingColumn100'
  | 'stackingBar'
  | 'stackingBar100'
  | 'stackingArea'
  | 'stackingArea100'
  | 'scatter'
  | 'bubble'
  | 'polar'
  | 'radar'
  | 'pareto'
  | 'pie'
  | 'doughnut'
  | 'funnel'
  | 'pyramid';

export interface PivotToSeriesOptions {
  /** Measure (value field name) to chart. Default: the first value field. */
  readonly measure?: string | undefined;
  /** Members on the series: `'columns'` (default: one series per column member, categories are row members) or `'rows'`. */
  readonly seriesBy?: 'columns' | 'rows' | undefined;
  /** Series type. Default `'column'`. */
  readonly type?: PivotChartSeriesType | undefined;
  /** Include subtotal and grand total members. Default false. */
  readonly includeTotals?: boolean | undefined;
  /** Category member labels joined with this text for nested members. Default `' / '`. */
  readonly labelSeparator?: string | undefined;
}

/** One `Chart` series (`ChartSeriesOptions`) of a pivot measure. */
export interface PivotChartSeries extends ChartSeriesOptions {
  readonly id: string;
  readonly name: string;
  readonly type: ChartSeriesType;
  /** The category field of `data` records. */
  readonly xField: 'category';
  /** The field of this series in `data` records (the series id). */
  readonly yField: string;
  /** The requested pivot chart type (`type` is the `Chart` series type it draws as). */
  readonly pivotType: PivotChartSeriesType;
}

/** The `Chart` series options of one pivot chart type. */
export type PivotChartSeriesShape = Pick<ChartSeriesOptions, 'curve' | 'stack' | 'closed'> & { readonly type: ChartSeriesType };

const SHAPES: Readonly<Record<PivotChartSeriesType, PivotChartSeriesShape>> = {
  line: { type: 'line' },
  column: { type: 'column' },
  area: { type: 'area' },
  bar: { type: 'bar' },
  spline: { type: 'line', curve: 'natural' },
  stepLine: { type: 'line', curve: 'step' },
  stackingColumn: { type: 'column', stack: true },
  stackingColumn100: { type: 'column', stack: 'percent' },
  stackingBar: { type: 'bar', stack: true },
  stackingBar100: { type: 'bar', stack: 'percent' },
  stackingArea: { type: 'area', stack: true },
  stackingArea100: { type: 'area', stack: 'percent' },
  scatter: { type: 'scatter' },
  bubble: { type: 'bubble' },
  polar: { type: 'line', closed: true },
  radar: { type: 'line', closed: true },
  pareto: { type: 'pareto' },
  pie: { type: 'column' },
  doughnut: { type: 'column' },
  funnel: { type: 'column' },
  pyramid: { type: 'column' },
};

/** The `Chart` series options a pivot chart type draws with (`type`, plus `curve` / `stack` / `closed`). */
export function pivotChartSeriesOptions(type: PivotChartSeriesType): PivotChartSeriesShape {
  return SHAPES[type] ?? SHAPES.column;
}

/** Where a chart point comes from (drill down, drill through). */
export interface PivotChartPoint {
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly rowKey: string;
  readonly columnKey: string;
  /** Member path of the category (`['rows', ...]` or `['columns', ...]`), for `pivot.expand(path)`. */
  readonly categoryPath: PivotMemberPath;
  readonly categoryExpandable: boolean;
  /** Member path of the category's parent (drill up, `pivot.collapse(path)`), or null for a top-level member. */
  readonly parentPath: PivotMemberPath | null;
}

export interface PivotChartData {
  /** One record per category: `{ category, [seriesId]: value }`. */
  readonly data: readonly Readonly<Record<string, string | number | null>>[];
  readonly series: readonly PivotChartSeries[];
  readonly categories: readonly string[];
  readonly measure: string | null;
  /** The pivot cell behind point `index` of `seriesId`, or null. */
  pointAt(seriesId: string, index: number): PivotChartPoint | null;
}

const EMPTY: PivotChartData = { data: [], series: [], categories: [], measure: null, pointAt: () => null };

function labelPath(result: PivotResult, axis: 'rows' | 'columns', node: PivotHeaderNode, separator: string): string {
  // Ancestor labels from the tree (the leaf carries only its own label).
  const parts: string[] = [];
  let nodes = axis === 'rows' ? result.rowTree : result.columnTree;
  for (let level = 0; level < node.path.length; level++) {
    const want = JSON.stringify(node.path[level]);
    const match = nodes.find((n) => n.kind !== 'grandTotal' && n.path.length === level + 1 && JSON.stringify(n.path[level]) === want);
    if (!match) break;
    parts.push(match.label);
    nodes = match.children ?? [];
  }
  return parts.length ? parts.join(separator) : node.label;
}

/** Converts a pivot result into `Chart` data and series for one measure. */
export function pivotToSeries(result: PivotResult | null, options: PivotToSeriesOptions = {}): PivotChartData {
  if (!result) return EMPTY;
  const measure = options.measure ?? (result.model.values.length ? measureId(result.model.values, 0) : null);
  const seriesBy = options.seriesBy ?? 'columns';
  const categoryAxis = seriesBy === 'columns' ? 'rows' : 'columns';
  const sep = options.labelSeparator ?? ' / ';
  // Totals: subtotal and grand total nodes, value leaves of the grand total (key `''` plus `|measure`), and
  // expanded members (their row carries the subtotal of the children shown below it).
  const isTotal = (node: PivotHeaderNode): boolean => node.kind === 'grandTotal' || node.kind === 'subtotal' || node.key === '' || node.key.startsWith('|') || (node.expandable && node.expanded);
  const keep = (node: PivotHeaderNode): boolean => options.includeTotals === true || !isTotal(node);
  // Value leaves of the measure on the measure axis; every leaf when measures are not on that axis.
  const measureOk = (node: PivotHeaderNode): boolean => node.measure === null || measure === null || node.measure === measure || node.measure.startsWith(`${measure}#`);
  const seriesPositions: number[] = [];
  const seriesCount = seriesBy === 'columns' ? result.columnCount : result.rowCount;
  for (let i = 0; i < seriesCount; i++) {
    const node = result.memberAt(seriesBy, i);
    if (measureOk(node) && keep(node)) seriesPositions.push(i);
  }
  const categoryPositions: number[] = [];
  const categoryCount = categoryAxis === 'rows' ? result.rowCount : result.columnCount;
  for (let i = 0; i < categoryCount; i++) {
    const node = result.memberAt(categoryAxis, i);
    if (measureOk(node) && keep(node)) categoryPositions.push(i);
  }
  const pivotType = options.type ?? 'column';
  const shape = pivotChartSeriesOptions(pivotType);
  const series: PivotChartSeries[] = seriesPositions.map((p, k) => {
    const node = result.memberAt(seriesBy, p);
    // Bubbles size by the value itself (a pivot cell has one number).
    return { ...shape, id: `s${k}`, name: labelPath(result, seriesBy, node, sep), xField: 'category', yField: `s${k}`, ...(shape.type === 'bubble' ? { sizeField: `s${k}` } : {}), pivotType };
  });
  const categories = categoryPositions.map((p) => labelPath(result, categoryAxis, result.memberAt(categoryAxis, p), sep));
  const data = categoryPositions.map((cp, ci) => {
    const record: Record<string, string | number | null> = { category: categories[ci] as string };
    seriesPositions.forEach((sp, k) => {
      record[`s${k}`] = seriesBy === 'columns' ? result.valueAt(cp, sp) : result.valueAt(sp, cp);
    });
    return record;
  });
  const pointAt = (seriesId: string, index: number): PivotChartPoint | null => {
    const k = Number(seriesId.slice(1));
    const sp = seriesPositions[k];
    const cp = categoryPositions[index];
    if (sp === undefined || cp === undefined || seriesId[0] !== 's') return null;
    const rowIndex = seriesBy === 'columns' ? cp : sp;
    const columnIndex = seriesBy === 'columns' ? sp : cp;
    const category = result.memberAt(categoryAxis, cp);
    return {
      rowIndex,
      columnIndex,
      rowKey: result.memberAt('rows', rowIndex).key,
      columnKey: result.memberAt('columns', columnIndex).key,
      categoryPath: [categoryAxis, ...category.path] as unknown as PivotMemberPath,
      categoryExpandable: category.expandable && !category.expanded,
      parentPath: category.path.length > 1 ? ([categoryAxis, ...category.path.slice(0, -1)] as unknown as PivotMemberPath) : null,
    };
  };
  return { data, series, categories, measure, pointAt };
}

/** `pivotToSeries()` of the controller's current result, recomputed when the result changes. */
export function usePivotChartData<Row>(pivot: PivotController<Row>, options: PivotToSeriesOptions = {}): PivotChartData {
  const result = usePivotState(pivot as PivotController<unknown>, (s) => s.result);
  const { measure, seriesBy, type, includeTotals, labelSeparator } = options;
  return useMemo(() => pivotToSeries(result, defined({ measure, seriesBy, type, includeTotals, labelSeparator })), [result, measure, seriesBy, type, includeTotals, labelSeparator]);
}

/** What a chart point click does: drill down when possible, else drill through (`'auto'`); one of them only; or drill up (`'collapse'`). */
export type PivotChartDrillMode = 'auto' | 'expand' | 'drillThrough' | 'collapse';

/**
 * Chart point click → pivot: `'auto'` expands the category
 * member when it can expand, else opens drill through for the point's cell;
 * `'collapse'` collapses the category's parent (drill up).
 */
export function drillChartPoint<Row>(pivot: PivotController<Row>, chart: PivotChartData, seriesId: string, index: number, mode: PivotChartDrillMode = 'auto'): boolean {
  const point = chart.pointAt(seriesId, index);
  if (!point) return false;
  if (mode === 'collapse') return point.parentPath ? pivot.collapse(point.parentPath, { source: 'pointer' }) : false;
  if (mode !== 'drillThrough' && point.categoryExpandable) return pivot.expand(point.categoryPath, { source: 'pointer' });
  if (mode === 'expand') return false;
  return pivot.drillThrough(point.rowIndex, point.columnIndex, { source: 'pointer' });
}

type ChartClickEvent = Parameters<NonNullable<ChartProps['onPointClick']>>[1];

export interface PivotChartPropsOptions extends PivotToSeriesOptions {
  /** Point click action (`drillChartPoint` mode). Default `'auto'`; `false` leaves clicks to `onPointClick`. */
  readonly drill?: PivotChartDrillMode | false | undefined;
  /** Called after the drill with the clicked point and its pivot cell (null when the point has none). */
  readonly onPointClick?: ((ctx: ChartPointContext, point: PivotChartPoint | null, event: ChartClickEvent) => void) | undefined;
  /** Category axis options, merged over `{ scale: 'category' }`. */
  readonly xAxis?: ChartAxisOptions | undefined;
  /** Value axis options; the default title is the measure caption. */
  readonly yAxis?: ChartAxisOptions | undefined;
}

/** The `Chart` props of a pivot (spread them on `<Chart>` from `@salmonui/charts/chart`). */
export interface PivotChartProps {
  readonly data: NonNullable<ChartProps['data']>;
  readonly series: readonly PivotChartSeries[];
  readonly xAxis: ChartAxisOptions;
  readonly yAxis: ChartAxisOptions;
  /** `'polar'` or `'radar'` for those pivot chart types (`Chart` needs `features={[polar]}`). */
  readonly coordinate?: 'polar' | 'radar';
  readonly onPointClick: NonNullable<ChartProps['onPointClick']>;
}

function measureCaption(result: PivotResult | null, measure: string | null): string | undefined {
  if (!result || measure === null) return undefined;
  const values = result.model.values;
  for (let i = 0; i < values.length; i++) {
    if (measureId(values, i) !== measure) continue;
    const v = values[i] as { readonly caption?: string | undefined; readonly field: string };
    return v.caption ?? v.field;
  }
  return undefined;
}

/** `ChartProps` of pivot chart data: `data`, `series`, axes and an `onPointClick` that drills the pivot. */
export function pivotChartPropsOf<Row>(pivot: PivotController<Row>, chart: PivotChartData, options: PivotChartPropsOptions = {}): PivotChartProps {
  const drill = options.drill ?? 'auto';
  const title = measureCaption(pivot.result, chart.measure);
  const pivotType = chart.series[0]?.pivotType;
  return {
    data: chart.data,
    series: chart.series,
    xAxis: { scale: 'category', ...options.xAxis },
    yAxis: { ...(title !== undefined ? { title } : {}), ...options.yAxis },
    ...(pivotType === 'polar' || pivotType === 'radar' ? { coordinate: pivotType } : {}),
    onPointClick: (ctx, event) => {
      if (drill !== false) drillChartPoint(pivot, chart, ctx.seriesId, ctx.index, drill);
      options.onPointClick?.(ctx, chart.pointAt(ctx.seriesId, ctx.index), event);
    },
  };
}

/**
 * `Chart` props of the controller's current result:
 * `<Chart {...pivotChartProps(pivot, { type: 'column' })} />`. Not memoized;
 * in components use `usePivotChartProps()`.
 */
export function pivotChartProps<Row>(pivot: PivotController<Row>, options: PivotChartPropsOptions = {}): PivotChartProps {
  return pivotChartPropsOf(pivot, pivotToSeries(pivot.result, options), options);
}

/** `pivotChartProps()` of the store's current result, recomputed only when the result or an option changes. */
export function usePivotChartProps<Row>(pivot: PivotController<Row>, options: PivotChartPropsOptions = {}): PivotChartProps {
  const chart = usePivotChartData(pivot, options);
  const { drill, onPointClick, xAxis, yAxis } = options;
  return useMemo(() => pivotChartPropsOf(pivot, chart, defined({ drill, onPointClick, xAxis, yAxis })), [pivot, chart, drill, onPointClick, xAxis, yAxis]);
}

/**
 * A chart image for `exportPivot({ format: 'pdf', chart })` or
 * `api.exportToPdf({ chart })` (table and chart in one PDF): the
 * chart's PNG (or JPEG) with its drawing size in CSS px.
 */
export async function pivotChartImage(chart: Pick<ChartApi, 'toBlob' | 'element'>, format: 'png' | 'jpeg' = 'png'): Promise<ExportImage> {
  const blob = await chart.toBlob(format);
  const data = new Uint8Array(await blob.arrayBuffer());
  const rect = chart.element?.querySelector('svg')?.getBoundingClientRect();
  let width = rect?.width ?? 0;
  let height = rect?.height ?? 0;
  if (!(width > 0 && height > 0) && format === 'png' && data.length > 24) {
    // PNG IHDR: width and height (big endian) at bytes 16 and 20.
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    width = view.getUint32(16);
    height = view.getUint32(20);
  }
  return { data, type: format, width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
}
