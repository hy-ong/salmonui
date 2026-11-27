// Cell span planning, loaded with the `spans` render
// feature (`feature-spans.ts`). Column `colSpan` / `rowSpan` (a
// function returning an explicit span, or `true` to merge equal adjacent
// values) and the grid `mergeCells` prop run for rendered rows (and, for
// merged row spans, up to `ROW_SPAN_LOOKBACK` rows above the rendered window;
// explicit row spans above it come from the anchor index). A column
// span covers the following visible columns of the same pin zone (never
// across a pin edge); spans that start before the rendered center
// slice are found by looking back `SPAN_LOOKBACK` columns, so colSpan works
// with column virtualization. Row spans work with row virtualization: the body computes them per rendered window, and a span
// whose first row is above the window, at any distance, is drawn in the
// window's first row, pulled up by the rows it hides.

import type { ColumnId, CompiledColumn, DataGridEngine, RowId, RowMetrics } from '@salmonui/data-grid/engine';
import type { CSSProperties } from 'react';
import { columnInfo } from './column-info.js';
import { widthVar } from './layout.js';
import type { DataGridMergeCells, DataGridSpan, DataGridSpanColumn, DataGridSpanContext } from './chrome-types.js';
import { spanFlags, type CarriedSpan, type PlannedCell, type RowSpanInfo, type RowSpanSection, type SpanFlags } from './spans.js';

/** Columns before the rendered center slice checked for a span that reaches into it. */
export const SPAN_LOOKBACK = 16;

const sumVars = (columns: readonly CompiledColumn<unknown>[], from: number, to: number): string => {
  const parts: string[] = [];
  for (let i = from; i < to; i++) parts.push(`var(${widthVar((columns[i] as CompiledColumn<unknown>).leafIndex)})`);
  return parts.length === 1 ? (parts[0] as string) : `calc(${parts.join(' + ')})`;
};

/** Height of `rows` rows at the fixed row height. */
const rowsHeight = (rows: number): string => (rows === 1 ? 'var(--salmon-data-grid-row-height)' : `calc(var(--salmon-data-grid-row-height) * ${rows})`);

/** Effective column span setting: the column's own, else the grid `mergeCells`. */
function colSpanOf<Row>(column: CompiledColumn<Row>, merge: DataGridMergeCells | undefined): DataGridSpan<Row> | undefined {
  const own = (column.def as DataGridSpanColumn<Row>).colSpan;
  return own !== undefined ? own : merge === true || merge === 'columns' ? true : undefined;
}

export function rowSpanOf<Row>(column: CompiledColumn<Row>, merge: DataGridMergeCells | undefined): DataGridSpan<Row> | undefined {
  const own = (column.def as DataGridSpanColumn<Row>).rowSpan;
  return own !== undefined ? own : merge === true || merge === 'rows' ? true : undefined;
}

/** Equal non-empty values merge (`true` spans). */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || a === '') return false;
  if (Object.is(a, b)) return true;
  return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
}

type TreeDepths = { getTreeRow(rowId: RowId): { readonly depth: number } | null };

/** Tree mode: a row span ends at a parent boundary, the next row shallower than its first row. */
function treeSpan<Row>(engine: DataGridEngine<Row>, rowIndex: number, rs: number): number {
  const tree = (engine as unknown as { tree?: TreeDepths }).tree;
  const id = rs > 1 && tree ? engine.getRowIdAt(rowIndex) : undefined;
  const depth = id === undefined ? undefined : tree?.getTreeRow(id)?.depth;
  if (depth === undefined) return rs;
  for (let k = 1; k < rs; k++) {
    const below = engine.getRowIdAt(rowIndex + k);
    const d = below === undefined ? undefined : tree?.getTreeRow(below)?.depth;
    if (d === undefined || d < depth) return k;
  }
  return rs;
}

function explicit<Row>(fn: (ctx: DataGridSpanContext<Row>) => number, row: Row, rowId: RowId, rowIndex: number, column: CompiledColumn<Row>, value: unknown, engine?: DataGridEngine<Row>): number {
  const n = Math.floor(fn({ row, rowId, rowIndex, column: columnInfo(column), field: column.columnId, value }));
  return n > 1 ? (engine ? treeSpan(engine, rowIndex, n) : n) : 1;
}

/** Column span of one cell (before clamping to the zone). */
export function cellColSpan<Row>(
  engine: DataGridEngine<Row>,
  merge: DataGridMergeCells | undefined,
  row: Row,
  rowId: RowId,
  rowIndex: number,
  zone: readonly CompiledColumn<Row>[],
  i: number,
  value: unknown,
): number {
  const column = zone[i] as CompiledColumn<Row>;
  const spec = colSpanOf(column, merge);
  if (!spec) return 1;
  if (spec !== true) return explicit(spec, row, rowId, rowIndex, column, value);
  let n = 1;
  while (i + n < zone.length) {
    const next = zone[i + n] as CompiledColumn<Row>;
    if (colSpanOf(next, merge) !== true || !sameValue(value, engine.getCellValue(rowId, next.columnId))) break;
    n++;
  }
  return n;
}

/** Row span of one cell; `rowEnd` bounds the merge of equal values below. */
function cellRowSpan<Row>(
  engine: DataGridEngine<Row>,
  merge: DataGridMergeCells | undefined,
  row: Row,
  rowId: RowId,
  rowIndex: number,
  column: CompiledColumn<Row>,
  value: unknown,
  rowEnd: number,
): number {
  const spec = rowSpanOf(column, merge);
  if (!spec) return 1;
  if (spec !== true) return explicit(spec, row, rowId, rowIndex, column, value, engine);
  let n = 1;
  while (rowIndex + n < rowEnd) {
    const below = engine.getRowIdAt(rowIndex + n);
    if (below === undefined || engine.getRow(below) === undefined || !sameValue(value, engine.getCellValue(below, column.columnId))) break;
    n++;
  }
  return treeSpan(engine, rowIndex, n);
}

interface ZoneSpan {
  readonly col: number;
  readonly row: number;
  /** Rows the span hides above this row (carried spans). */
  readonly above: number;
  readonly anchorRowId?: RowId;
  readonly anchorRowIndex?: number;
}

function zoneIndex<Row>(zone: readonly CompiledColumn<Row>[], columnId: ColumnId): number {
  for (let i = 0; i < zone.length; i++) if ((zone[i] as CompiledColumn<Row>).columnId === columnId) return i;
  return -1;
}

/**
 * Plans the cells of one zone for one row: `zone` is the full zone, `[start,
 * end)` the rendered slice, `info` the row span facts the body computed for
 * this row. Returns null when no cell spans (the default rendering path is
 * kept).
 */
export function planZone<Row>(
  engine: DataGridEngine<Row>,
  merge: DataGridMergeCells | undefined,
  flags: SpanFlags,
  row: Row,
  rowId: RowId,
  rowIndex: number,
  zone: readonly CompiledColumn<Row>[],
  start: number,
  end: number,
  info: RowSpanInfo | null,
  onClamp: (columnId: ColumnId) => void,
  metrics?: RowMetrics | null,
): PlannedCell<Row>[] | null {
  const from = Math.max(0, start - SPAN_LOOKBACK);
  const spans = new Map<number, ZoneSpan>();
  const covered = info && info.covered.size > 0 ? info.covered : null;
  let any = covered !== null;
  // Spans whose first row is above the window render here, in the window's first row.
  if (info) {
    for (const c of info.carried) {
      const s = zoneIndex(zone, c.columnId);
      if (s < 0) continue;
      const anchorRowId = engine.getRowIdAt(c.anchor);
      if (anchorRowId === undefined) continue;
      const above = rowIndex - c.anchor;
      spans.set(s, { col: Math.min(c.colSpan, zone.length - s), row: c.rowSpan - above, above, anchorRowId, anchorRowIndex: c.anchor });
      any = true;
    }
  }
  for (let i = from; i < end; i++) {
    const carried = spans.get(i);
    if (carried) {
      i += carried.col - 1;
      continue;
    }
    const column = zone[i] as CompiledColumn<Row>;
    if (covered?.has(column.columnId)) continue;
    const rs = info?.spans.get(column.columnId) ?? 1;
    if (!flags.col && rs === 1) continue;
    let col = flags.col ? cellColSpan(engine, merge, row, rowId, rowIndex, zone, i, engine.getCellValue(rowId, column.columnId)) : 1;
    if (i + col > zone.length) {
      onClamp(column.columnId);
      col = zone.length - i;
    }
    if (col > 1 || rs > 1) {
      spans.set(i, { col, row: rs, above: 0 });
      any = true;
      i += col - 1;
    }
  }
  if (!any) return null;
  const cols = zone as readonly CompiledColumn<unknown>[];
  const sliceStart = start;
  const styleOf = (s: number, span: ZoneSpan): CSSProperties => {
    const style: CSSProperties = { width: sumVars(cols, s, s + span.col) };
    if (s < sliceStart) style.marginInlineStart = `calc(-1 * ${sumVars(cols, s, sliceStart)})`;
    // Per-row heights (`rowHeight` function): the span's rows from the row metrics; else the fixed row height.
    const from = rowIndex - span.above;
    const height = (rows: number): string => (metrics ? `${metrics.offsetOf(from + rows) - metrics.offsetOf(from)}px` : rowsHeight(rows));
    if (span.row + span.above > 1) style.height = height(span.row + span.above);
    if (span.above > 0) style.marginBlockStart = `calc(-1 * ${height(span.above)})`;
    return style;
  };
  const planned = (s: number, span: ZoneSpan): PlannedCell<Row> => {
    const cell = { column: zone[s] as CompiledColumn<Row>, index: s, colSpan: span.col, rowSpan: span.row, style: styleOf(s, span) };
    return span.anchorRowId === undefined ? cell : { ...cell, anchorRowId: span.anchorRowId, anchorRowIndex: span.anchorRowIndex as number };
  };
  const out: PlannedCell<Row>[] = [];
  // A span that starts before the slice and reaches into it renders at the slice front, pulled back by its hidden part.
  for (const [s, span] of spans) {
    if (s < start && s + span.col > start) {
      out.push(planned(s, span));
      start = s + span.col;
    }
  }
  for (let i = start; i < end; i++) {
    const column = zone[i] as CompiledColumn<Row>;
    const span = spans.get(i);
    if (span) {
      out.push(planned(i, span));
      i += span.col - 1;
    } else if (covered?.has(column.columnId)) {
      out.push({ column, index: i, colSpan: 0, rowSpan: 0, style: undefined }); // spacer under a row span
    } else {
      out.push({ column, index: i, colSpan: 1, rowSpan: 1, style: undefined });
    }
  }
  return out;
}

/** Anchor index of explicit (function) row spans of one row group: scanned once, lazily, per data and column version. */
interface AnchorIndex {
  readonly key: readonly unknown[];
  /** Rows `[top, frontier)` are scanned. */
  frontier: number;
  /** Per explicit span column: the row after the last row it is covered to. */
  readonly until: number[];
  /** Per explicit span column: flat `[anchor, rowSpan, colSpan]` of its spans (> 1 row), in row order. */
  readonly spans: number[][];
}

const anchorIndexes = new WeakMap<object, Map<string, AnchorIndex>>();

/**
 * Explicit row spans that start in `[top, row)` and cover `row`:
 * the exact anchors of the sequential span scan at any distance, without a
 * lookback limit. Each row group keeps an anchor index, invalidated when
 * the rows, columns, data or span settings change. A lookup scans the rows
 * between the deepest scanned row and `row` once (skipping covered rows),
 * then binary-searches each span column: scrolling pays only the rows it
 * newly reveals, a jump pays one pass to the target, never a full pass per
 * frame. Merges of equal values are not indexed (`computeRowSpans` draws
 * them from its lookback, with the same value).
 */
export function carriedSpans<Row>(engine: DataGridEngine<Row>, merge: DataGridMergeCells | undefined, top: number, bottom: number, row: number): CarriedSpan[] {
  const snapshot = engine.getSnapshot();
  const columns = snapshot.columns;
  const key: unknown[] = [snapshot.rows, columns, snapshot.data, merge];
  const cols: [readonly CompiledColumn<Row>[], number, (ctx: DataGridSpanContext<Row>) => number][] = [];
  const pos = new Map<ColumnId, number>();
  for (const zone of [columns.left, columns.center, columns.right]) {
    for (let c = 0; c < zone.length; c++) {
      const column = zone[c] as CompiledColumn<Row>;
      const spec = rowSpanOf(column, merge);
      key.push(spec, colSpanOf(column, merge));
      if (typeof spec === 'function') pos.set(column.columnId, cols.push([zone, c, spec]) - 1);
    }
  }
  const out: CarriedSpan[] = [];
  if (cols.length === 0 || row <= top) return out;
  let byGroup = anchorIndexes.get(engine);
  if (!byGroup) anchorIndexes.set(engine, (byGroup = new Map()));
  const groupKey = `${top}:${bottom}`;
  let index = byGroup.get(groupKey);
  if (!index || index.key.length !== key.length || index.key.some((k, i) => k !== key[i])) {
    if (index) byGroup.clear(); // a new version: drop every group of the old one
    byGroup.set(groupKey, (index = { key, frontier: top, until: cols.map(() => 0), spans: cols.map(() => []) }));
  }
  const { until, spans } = index;
  const col = spanFlags(columns.visible, merge).col;
  let r = index.frontier;
  while (r < row) {
    let next = bottom;
    const rowId = engine.getRowIdAt(r) as RowId;
    const data = rowId === undefined ? undefined : engine.getRow(rowId);
    for (let k = 0; k < cols.length; k++) {
      let u = until[k] as number;
      if (u <= r && data !== undefined) {
        const [zone, c, fn] = cols[k] as (typeof cols)[number];
        const column = zone[c] as CompiledColumn<Row>;
        const value = engine.getCellValue(rowId, column.columnId);
        const rs = explicit(fn, data, rowId, r, column, value, engine);
        if (rs > 1) {
          const cs = Math.min(col ? cellColSpan(engine, merge, data, rowId, r, zone, c, value) : 1, zone.length - c);
          (spans[k] as number[]).push(r, rs, cs);
          u = r + rs;
          for (let j = 0; j < cs; j++) {
            const at = pos.get((zone[c + j] as CompiledColumn<Row>).columnId);
            if (at !== undefined) until[at] = Math.max(until[at] as number, u);
          }
        }
      }
      next = Math.min(next, Math.max(u, r + 1));
    }
    r = next;
  }
  index.frontier = Math.max(index.frontier, r);
  for (let k = 0; k < cols.length; k++) {
    const list = spans[k] as number[];
    // Last span that starts before `row`.
    let lo = 0;
    let hi = list.length / 3;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((list[mid * 3] as number) < row) lo = mid + 1;
      else hi = mid;
    }
    const at = (lo - 1) * 3;
    const anchor = list[at] as number;
    const rowSpan = list[at + 1] as number;
    if (lo > 0 && anchor + rowSpan > row) {
      const [zone, c] = cols[k] as (typeof cols)[number];
      out.push({ columnId: (zone[c] as CompiledColumn<Row>).columnId, anchor, rowSpan, colSpan: list[at + 2] as number });
    }
  }
  return out;
}

/**
 * Row span facts of the rendered rows, keyed by row index and serialized
 * (`parseRowSpanKey`) so unchanged rows keep equal props. Each section is
 * the rendered part of one row group (sticky top rows, the scrolling window,
 * sticky bottom rows); spans never cross a section, and merges of equal
 * values are bounded by the section end (rows past it are not rendered).
 * Rows from `scanFrom` up to `start` are read, not rendered: a span from
 * there that reaches into the section is carried into its first row, so
 * row spans work with row virtualization. A span with both `rowSpan` and
 * `colSpan` covers its whole block in the rows below (clamped to its pin
 * zone, like the column span itself). Null when no visible column has a row
 * span (the default path: one cached flag check).
 */
export function computeRowSpans<Row>(
  engine: DataGridEngine<Row>,
  sections: readonly RowSpanSection[],
  zones: readonly (readonly CompiledColumn<Row>[])[],
  merge: DataGridMergeCells | undefined,
): Map<number, string> | null {
  const flags = spanFlags(engine.getSnapshot().columns.visible, merge);
  if (!flags.row) return null;
  const out = new Map<number, string>();
  for (const { start, end, scanFrom, group } of sections) {
    if (end <= start) continue;
    const covered = new Map<number, Set<ColumnId>>();
    const own = new Map<number, [ColumnId, number][]>();
    const carried: CarriedSpan[] = [];
    const from = Math.min(scanFrom, start);
    const cover = (r: number, rs: number, zone: readonly CompiledColumn<Row>[], c: number, cs: number, k: number): void => {
      for (; k < rs && r + k < end; k++) {
        let set = covered.get(r + k);
        if (!set) covered.set(r + k, (set = new Set()));
        for (let j = 0; j < cs; j++) set.add((zone[c + j] as CompiledColumn<Row>).columnId);
      }
    };
    // Explicit spans that start above the scanned rows, at any distance.
    if (group && from > group[0]) {
      for (const span of carriedSpans(engine, merge, group[0], group[1], from)) {
        for (const zone of zones) {
          const c = zoneIndex(zone, span.columnId);
          if (c >= 0) cover(span.anchor, span.rowSpan, zone, c, Math.min(span.colSpan, zone.length - c), from - span.anchor);
        }
        if (span.anchor + span.rowSpan > start) carried.push(span);
      }
    }
    for (let r = from; r < end; r++) {
      const rowId = engine.getRowIdAt(r);
      if (rowId === undefined) continue;
      const row = engine.getRow(rowId) as Row;
      if (row === undefined) continue;
      for (const zone of zones) {
        for (let c = 0; c < zone.length; c++) {
          const column = zone[c] as CompiledColumn<Row>;
          if (!rowSpanOf(column, merge) || covered.get(r)?.has(column.columnId)) continue;
          const value = engine.getCellValue(rowId, column.columnId);
          const rs = cellRowSpan(engine, merge, row, rowId, r, column, value, end);
          if (rs === 1) continue;
          const cs = Math.min(flags.col ? cellColSpan(engine, merge, row, rowId, r, zone, c, value) : 1, zone.length - c);
          if (r < start) {
            if (r + rs > start) carried.push({ columnId: column.columnId, anchor: r, rowSpan: rs, colSpan: cs });
          } else {
            let list = own.get(r);
            if (!list) own.set(r, (list = []));
            list.push([column.columnId, rs]);
          }
          cover(r, rs, zone, c, cs, 1);
        }
      }
    }
    for (let r = start; r < end; r++) {
      const cov = covered.get(r);
      const spans = own.get(r);
      const carry = r === start && carried.length > 0;
      if (!cov && !spans && !carry) continue;
      out.set(r, JSON.stringify([cov ? [...cov] : [], spans ?? [], carry ? carried.map((c) => [c.columnId, c.anchor, c.rowSpan, c.colSpan]) : []]));
    }
  }
  return out;
}
