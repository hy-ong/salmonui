// Span resolver of the React grid. The core
// focus, selection, and edit modules call it with a visible cell and get the
// span block covering it, so a span behaves as one cell at its anchor. It
// computes the one cell it is asked about from the column span settings,
// on demand (key presses, clicks, selection, editing; never per frame), so it
// also answers for rows outside the rendered window. The default path (no
// visible column spans) is one cached flag check. Loaded with the `spans`
// render feature; the instance's static `cellSpans` option delegates here.

import type { CellSpanBlock, CellSpanResolver, ColumnId, CompiledColumn, DataGridEngine } from '@salmonui/data-grid/engine';
import type { DataGridMergeCells } from './chrome-types.js';
import { cellColSpan, computeRowSpans, rowSpanOf, sameValue, SPAN_LOOKBACK } from './span-plans.js';
import { parseRowSpanKey, spanFlags } from './spans.js';

/** Rows an equal-value merge (`rowSpan: true`) is followed up or down from the asked row. */
export const MERGE_SCAN_LIMIT = 4096;

export interface SpanResolverHost<Row> {
  readonly engine: DataGridEngine<Row>;
  readonly props: { readonly mergeCells?: DataGridMergeCells; readonly stickyRows?: number; readonly stickyBottomRows?: number };
}

/** Bounds of the rendered section (sticky top rows, scrolling rows, sticky bottom rows) holding row `r`. */
function sectionOf(r: number, count: number, sticky: number | undefined, stickyBottom: number | undefined): readonly [number, number] {
  const top = Math.min(Math.max(0, Math.floor(sticky ?? 0)), count);
  const bottom = Math.min(Math.max(0, Math.floor(stickyBottom ?? 0)), count - top);
  if (r < top) return [0, top];
  if (r >= count - bottom) return [count - bottom, count];
  return [top, count - bottom];
}

/** The span block covering visible cell `(r, c)`, or null (what the `cellSpans` resolver answers). */
export function spanBlockOf<Row>(host: SpanResolverHost<Row>, r: number, c: number): CellSpanBlock | null {
  const engine = host.engine;
  const snapshot = engine.getSnapshot();
  const columns = snapshot.columns;
  const merge = host.props.mergeCells;
  const flags = spanFlags(columns.visible, merge);
  if (!flags.col && !flags.row) return null;
  const left = columns.left.length;
  const center = columns.center.length;
  const [zone, base] = c < left ? [columns.left, 0] : c < left + center ? [columns.center, left] : [columns.right, left + center];
  const lc = c - base;
  if (lc < 0 || lc >= zone.length) return null;
  const count = snapshot.rows.count;
  const rowId = r >= 0 && r < count ? engine.getRowIdAt(r) : undefined;
  const row = rowId === undefined ? undefined : engine.getRow(rowId);
  if (rowId === undefined || row === undefined) return null;
  const [s0, s1] = sectionOf(r, count, host.props.stickyRows, host.props.stickyBottomRows);
  const from = Math.max(0, lc - SPAN_LOOKBACK);
  const zoneIndex = (id: ColumnId): number => {
    for (let j = from; j <= lc; j++) if ((zone[j] as CompiledColumn<Row>).columnId === id) return j;
    return -1;
  };
  const colSpanAt = (a: number, j: number): number => {
    if (!flags.col) return 1;
    const id = engine.getRowIdAt(a);
    const data = id === undefined ? undefined : engine.getRow(id);
    if (id === undefined || data === undefined) return 1;
    const column = zone[j] as CompiledColumn<Row>;
    return Math.min(cellColSpan(engine, merge, data, id, a, zone, j, engine.getCellValue(id, column.columnId)), zone.length - j);
  };
  const block = (a: number, j: number, rowSpan: number, colSpan: number): CellSpanBlock | null =>
    rowSpan > 1 || colSpan > 1 ? { rowIndex: a, columnIndex: base + j, rowSpan: Math.max(1, Math.min(rowSpan, s1 - a)), colSpan } : null;

  // Row spans: the facts of row r as the body computes them, over the columns
  // that can reach column lc (explicit spans from the anchor index, at any
  // distance, like the rendered window; equal-value merges from the row above).
  let spans: ReadonlyMap<ColumnId, number> | null = null;
  let covered: ReadonlySet<ColumnId> | null = null;
  if (flags.row) {
    const slice = zone.slice(from, lc + 1);
    const info = parseRowSpanKey(computeRowSpans(engine, [{ start: r, end: Math.min(s1, r + 2), scanFrom: Math.max(s0, r - 1), group: [s0, s1] }], [slice], merge)?.get(r));
    if (info) {
      spans = info.spans;
      covered = info.covered;
      const found: [number, number, number][] = info.carried.map((x) => [x.anchor, zoneIndex(x.columnId), x.rowSpan]);
      for (const [id, rs] of info.spans) found.push([r, zoneIndex(id), rs]);
      for (const [anchor, j, rs] of found) {
        if (j < 0) continue;
        const cs = colSpanAt(anchor, j);
        if (j + cs <= lc) continue;
        const column = zone[j] as CompiledColumn<Row>;
        if (rowSpanOf(column, merge) !== true) return block(anchor, j, rs, cs);
        // An equal-value merge: follow its run past the facts' one-row window.
        const value = engine.getCellValue(rowId, column.columnId);
        const same = (i: number): boolean => {
          const id = engine.getRowIdAt(i);
          return id !== undefined && engine.getRow(id) !== undefined && sameValue(value, engine.getCellValue(id, column.columnId));
        };
        let a = anchor;
        while (a > s0 && a > r - MERGE_SCAN_LIMIT && same(a - 1)) a--;
        let end = r + 1;
        while (end < s1 && end < r + MERGE_SCAN_LIMIT && same(end)) end++;
        return block(a, j, end - a, a === anchor ? cs : colSpanAt(a, j));
      }
    }
  }
  // Column spans of row r, left to right as the row plans them.
  if (!flags.col) return null;
  for (let j = from; j <= lc; j++) {
    const id = (zone[j] as CompiledColumn<Row>).columnId;
    if (covered?.has(id)) continue;
    const cs = colSpanAt(r, j);
    if (j + cs > lc) return block(r, j, spans?.get(id) ?? 1, cs);
    j += cs - 1;
  }
  return null;
}

/** The `cellSpans` engine option of a grid instance (read lazily: the engine is created after the options). */
export function createSpanResolver<Row>(host: SpanResolverHost<Row>): CellSpanResolver {
  const resolve = (rowIndex: number, columnIndex: number): CellSpanBlock | null => spanBlockOf(host, rowIndex, columnIndex);
  const active = (): boolean => {
    const flags = spanFlags(host.engine.getSnapshot().columns.visible, host.props.mergeCells);
    return flags.col || flags.row;
  };
  return Object.assign(resolve, { active });
}
