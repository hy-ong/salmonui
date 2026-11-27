// Cell spanning, the static part: the span types, the
// cheap `spanFlags` gate of the default path and the row span fact parser.
// The planning code (column spans, row spans under virtualization, the
// anchor index) lives in `span-plans.ts`, which only the `spans` render
// feature reaches.

import type { ColumnId, CompiledColumn, RowId } from '@salmonui/data-grid/engine';
import type { CSSProperties } from 'react';
import type { DataGridMergeCells, DataGridSpanColumn } from './chrome-types.js';

/** Rows above the rendered row window read for an equal-value merge that reaches into it (the same value, so drawn from there). */
export const ROW_SPAN_LOOKBACK = 64;

/** One rendered cell of a zone: the column, its colIndex offset in the zone, its span, and extra styles. */
export interface PlannedCell<Row> {
  readonly column: CompiledColumn<Row>;
  /** Index in the full zone. */
  readonly index: number;
  readonly colSpan: number;
  readonly rowSpan: number;
  readonly style: CSSProperties | undefined;
  /** Set for a row span whose first row is above the rendered window: the cell renders that row's value. */
  readonly anchorRowId?: RowId;
  readonly anchorRowIndex?: number;
}

/** A row span that starts above the rendered window and reaches into its first row. */
export interface CarriedSpan {
  readonly columnId: ColumnId;
  /** Row index of the span's first row. */
  readonly anchor: number;
  /** Rows of the whole span, from the anchor. */
  readonly rowSpan: number;
  readonly colSpan: number;
}

/** Row span facts of one rendered row, computed by the body for its window. */
export interface RowSpanInfo {
  /** Columns covered by a span from a row above. */
  readonly covered: ReadonlySet<ColumnId>;
  /** Row spans (> 1) that start in this row. */
  readonly spans: ReadonlyMap<ColumnId, number>;
  /** Spans that start above the window (first rendered row only). */
  readonly carried: readonly CarriedSpan[];
}

export interface SpanFlags {
  readonly col: boolean;
  readonly row: boolean;
}

const NO_SPANS: SpanFlags = { col: false, row: false };
const flagsCache = new WeakMap<readonly CompiledColumn<unknown>[], Map<DataGridMergeCells | undefined, SpanFlags>>();

/** Whether any visible column spans (cached per visible-columns snapshot): the cheap gate of the default path. */
export function spanFlags<Row>(visible: readonly CompiledColumn<Row>[], merge: DataGridMergeCells | undefined): SpanFlags {
  if (merge === true) return { col: true, row: true };
  const key = visible as readonly CompiledColumn<unknown>[];
  let byMerge = flagsCache.get(key);
  const hit = byMerge?.get(merge);
  if (hit) return hit;
  let col = merge === 'columns';
  let row = merge === 'rows';
  for (const c of visible) {
    if (col && row) break;
    const def = c.def as DataGridSpanColumn<Row>;
    if (def.colSpan) col = true;
    if (def.rowSpan) row = true;
  }
  const flags = col || row ? { col, row } : NO_SPANS;
  if (!byMerge) flagsCache.set(key, (byMerge = new Map()));
  byMerge.set(merge, flags);
  return flags;
}

/** One rendered row range of the body: `[start, end)`, scanned for row spans from `scanFrom`. */
export interface RowSpanSection {
  readonly start: number;
  readonly end: number;
  readonly scanFrom: number;
  /** Bounds `[top, bottom)` of the row group: explicit spans that start above `scanFrom` come from the anchor index. */
  readonly group?: readonly [number, number];
}

/** Parses a row's serialized span facts (`computeRowSpans`). */
export function parseRowSpanKey(key: string | undefined): RowSpanInfo | null {
  if (!key) return null;
  const [cov, spans, carry] = JSON.parse(key) as [ColumnId[], [ColumnId, number][], [ColumnId, number, number, number][]];
  return {
    covered: new Set(cov),
    spans: new Map(spans),
    carried: carry.map(([columnId, anchor, rowSpan, colSpan]) => ({ columnId, anchor, rowSpan, colSpan })),
  };
}
