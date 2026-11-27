// HeatMap model:
// a 2D table or records normalized into a row-major Float64Array (NaN =
// empty cell), the color domain per table / row / column, and the color of
// a value on a gradient or step scale of data colors, or on the derived
// sequential palette when no stops are given. Hover hit-testing is index
// arithmetic on the band scales, so 1,000,000 cells need no index.

import { colorScale, sequentialColor } from './color.js';

export interface HeatMatrix {
  readonly columns: number;
  readonly rows: number;
  /** Row-major values, `values[row * columns + column]`, NaN for an empty cell. */
  readonly values: Float64Array;
  /** Optional second value per cell (bubble size), same layout. */
  readonly sizes: Float64Array | null;
  readonly xKeys: readonly string[];
  readonly yKeys: readonly string[];
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN);

/** A 2D table: `table[row][column]` (rows are y, columns are x). */
export function matrixFromTable(table: readonly (readonly (number | null | undefined)[])[], xKeys?: readonly string[], yKeys?: readonly string[]): HeatMatrix {
  const rows = table.length;
  let columns = 0;
  for (const r of table) columns = Math.max(columns, r.length);
  const values = new Float64Array(rows * columns).fill(Number.NaN);
  for (let y = 0; y < rows; y++) {
    const r = table[y] as readonly (number | null | undefined)[];
    for (let x = 0; x < r.length; x++) values[y * columns + x] = num(r[x]);
  }
  return {
    columns,
    rows,
    values,
    sizes: null,
    xKeys: xKeys ?? Array.from({ length: columns }, (_, i) => String(i + 1)),
    yKeys: yKeys ?? Array.from({ length: rows }, (_, i) => String(i + 1)),
  };
}

/** Cell records with x, y and value accessors (categories in first-seen order unless keys are given). */
export function matrixFromRecords<T>(records: readonly T[], x: (r: T) => string, y: (r: T) => string, value: (r: T) => unknown, size?: (r: T) => unknown, xKeys?: readonly string[], yKeys?: readonly string[]): HeatMatrix {
  const xs = new Map<string, number>();
  const ys = new Map<string, number>();
  (xKeys ?? []).forEach((k, i) => xs.set(k, i));
  (yKeys ?? []).forEach((k, i) => ys.set(k, i));
  for (const r of records) {
    const a = x(r);
    const b = y(r);
    if (!xKeys && !xs.has(a)) xs.set(a, xs.size);
    if (!yKeys && !ys.has(b)) ys.set(b, ys.size);
  }
  const columns = xs.size;
  const rows = ys.size;
  const values = new Float64Array(rows * columns).fill(Number.NaN);
  const sizes = size ? new Float64Array(rows * columns).fill(Number.NaN) : null;
  for (const r of records) {
    const cx = xs.get(x(r));
    const cy = ys.get(y(r));
    if (cx === undefined || cy === undefined) continue;
    values[cy * columns + cx] = num(value(r));
    if (sizes && size) sizes[cy * columns + cx] = num(size(r));
  }
  return { columns, rows, values, sizes, xKeys: [...xs.keys()], yKeys: [...ys.keys()] };
}

export type HeatDomainMode = 'all' | 'row' | 'column';

/** Min and max of the finite values in `values[from..to)` with `stride`. */
function extent(values: Float64Array, from: number, count: number, stride: number): [number, number] {
  let lo = Number.POSITIVE_INFINITY;
  let hi = Number.NEGATIVE_INFINITY;
  for (let k = 0, i = from; k < count; k++, i += stride) {
    const v = values[i] as number;
    if (v === v) {
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  }
  return lo <= hi ? [lo, hi] : [0, 0];
}

/**
 * Normalized position 0..1 of every cell inside its domain (`colorScale.domain`); NaN stays NaN. `fixed` overrides the table extent.
 */
export function normalizeCells(m: HeatMatrix, mode: HeatDomainMode = 'all', fixed?: readonly [number, number]): Float64Array {
  const out = new Float64Array(m.values.length);
  const put = (from: number, count: number, stride: number) => {
    const [lo, hi] = fixed ?? extent(m.values, from, count, stride);
    const span = hi - lo;
    for (let k = 0, i = from; k < count; k++, i += stride) {
      const v = m.values[i] as number;
      out[i] = v === v ? (span > 0 ? Math.min(1, Math.max(0, (v - lo) / span)) : 0.5) : Number.NaN;
    }
  };
  if (mode === 'row') for (let y = 0; y < m.rows; y++) put(y * m.columns, m.columns, 1);
  else if (mode === 'column') for (let x = 0; x < m.columns; x++) put(x, m.rows, m.columns);
  else put(0, m.values.length, 1);
  return out;
}

export interface HeatStop {
  readonly value: number;
  readonly color: string;
  readonly label?: string | undefined;
}

/** Table extent of the finite values. */
export function heatExtent(m: HeatMatrix): [number, number] {
  return extent(m.values, 0, m.values.length, 1);
}

/**
 * Color of a cell: gradient between stops (stop values are data values, or
 * 0..1 positions when the domain is per row or column), the stop at or
 * below the value for `steps`, else the derived sequential palette.
 */
export function heatColor(value: number, t: number, stops: readonly HeatStop[] | undefined, kind: 'gradient' | 'steps', relative: boolean): string {
  if (!stops || stops.length === 0) return sequentialColor(t);
  const v = relative ? t : value;
  if (kind === 'steps') return stepColor(stops, v);
  return colorScale(stops, v);
}

/** The color of the highest stop whose value is ≤ v (the first stop below the range). */
export function stepColor(stops: readonly HeatStop[], v: number): string {
  let pick = stops[0] as HeatStop;
  for (const s of stops) if (s.value <= v && s.value >= pick.value) pick = s;
  return pick.color;
}

/** Step index of a value (list legend toggling). */
export function stepIndex(stops: readonly HeatStop[], v: number): number {
  let best = 0;
  stops.forEach((s, i) => {
    if (s.value <= v && s.value >= (stops[best] as HeatStop).value) best = i;
  });
  return best;
}
