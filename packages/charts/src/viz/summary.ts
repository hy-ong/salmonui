// Automatic descriptions and the accessible table model: every visualization is described in one or two
// sentences and carries a data table with a row cap and a summary row.
// Strings are built from caller-supplied, localized text pieces; English is
// the default.

export interface SeriesStats {
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly first: number;
  readonly last: number;
  readonly minIndex: number;
  readonly maxIndex: number;
  readonly sum: number;
}

/** Min, max, first, last and sum of the finite values. */
export function seriesStats(values: ArrayLike<number>): SeriesStats {
  let count = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let first = Number.NaN;
  let last = Number.NaN;
  let minIndex = -1;
  let maxIndex = -1;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i] as number;
    if (!Number.isFinite(v)) continue;
    if (count === 0) first = v;
    last = v;
    count++;
    sum += v;
    if (v < min) {
      min = v;
      minIndex = i;
    }
    if (v > max) {
      max = v;
      maxIndex = i;
    }
  }
  return { count, min: count ? min : Number.NaN, max: count ? max : Number.NaN, first, last, minIndex, maxIndex, sum };
}

export type Trend = 'up' | 'down' | 'flat';

/** Direction from first to last value (flat within 1 % of the range). */
export function trendOf(stats: SeriesStats): Trend {
  if (stats.count < 2) return 'flat';
  const range = stats.max - stats.min;
  const d = stats.last - stats.first;
  if (range === 0 || Math.abs(d) <= range * 0.01) return 'flat';
  return d > 0 ? 'up' : 'down';
}

export interface SummaryText {
  /** "{kind}, {count} series" pieces. */
  readonly series: (count: number) => string;
  readonly points: (count: number) => string;
  readonly range: (axis: string, from: string, to: string) => string;
  readonly minMax: (min: string, max: string) => string;
  readonly trend: Record<Trend, string>;
  readonly noData: string;
}

export const SUMMARY_EN: SummaryText = {
  series: (n) => `${n} ${n === 1 ? 'series' : 'series'}`,
  points: (n) => `${n} ${n === 1 ? 'point' : 'points'}`,
  range: (axis, from, to) => `${axis} from ${from} to ${to}`,
  minMax: (min, max) => `minimum ${min}, maximum ${max}`,
  trend: { up: 'trending up', down: 'trending down', flat: 'flat' },
  noData: 'No data',
};

export interface DescribeInput {
  /** Localized kind, "Line chart". */
  readonly kind: string;
  readonly series: readonly { readonly name: string; readonly stats: SeriesStats }[];
  /** Category / x axis extent as display text. */
  readonly x?: { readonly label: string; readonly from: string; readonly to: string } | undefined;
  readonly format?: ((value: number) => string) | undefined;
  readonly text?: SummaryText | undefined;
  /** Per-series detail up to this many series. Default 5. */
  readonly detailLimit?: number | undefined;
}

/** "Line chart, 2 series, x from Jan to Dec. Sales: 12 points, minimum 3, maximum 9, trending up." */
export function describeChart(input: DescribeInput): string {
  const t = input.text ?? SUMMARY_EN;
  const fmt = input.format ?? ((v: number) => String(v));
  const total = input.series.reduce((s, x) => s + x.stats.count, 0);
  if (total === 0) return `${input.kind}. ${t.noData}.`;
  let out = `${input.kind}, ${t.series(input.series.length)}`;
  if (input.x) out += `, ${t.range(input.x.label, input.x.from, input.x.to)}`;
  out += '.';
  const limit = input.detailLimit ?? 5;
  for (const s of input.series.slice(0, limit)) {
    if (!s.stats.count) continue;
    out += ` ${s.name}: ${t.points(s.stats.count)}, ${t.minMax(fmt(s.stats.min), fmt(s.stats.max))}, ${t.trend[trendOf(s.stats)]}.`;
  }
  return out;
}

export interface TableModel {
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
  /** Rows left out beyond the cap (the summary row says so). */
  readonly omitted: number;
}

/** Default row cap of the accessible table. */
export const TABLE_ROW_CAP = 500;

/**
 * Builds a capped table: the first `cap` rows, with the count of omitted
 * rows for the summary row. `cell(row, column)` formats lazily.
 */
export function tableModel(caption: string, columns: readonly string[], rowCount: number, cell: (row: number, column: number) => string, cap = TABLE_ROW_CAP): TableModel {
  const n = Math.min(rowCount, Math.max(0, cap));
  const rows: string[][] = [];
  for (let r = 0; r < n; r++) {
    const row: string[] = [];
    for (let c = 0; c < columns.length; c++) row.push(cell(r, c));
    rows.push(row);
  }
  return { caption, columns, rows, omitted: Math.max(0, rowCount - n) };
}
