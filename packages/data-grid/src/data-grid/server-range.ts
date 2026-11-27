import type { VirtualRange } from '@salmonui/data-grid/engine';

export interface DataGridInitialRangeOptions {
  rowCount: number;
  /** Visible center (unfrozen) leaf columns. */
  centerColumnCount: number;
  /** Default 20. */
  initialRows?: number;
  /** Default 20. */
  initialColumns?: number;
}

export interface DataGridInitialRange {
  readonly rows: VirtualRange;
  readonly columns: VirtualRange;
}

const range = (end: number): VirtualRange => Object.freeze({ start: 0, end, overscanStart: 0, overscanEnd: end });

/**
 * The deterministic range `DataGrid` renders on the server and during hydration,
 * before the viewport is measured. Server work and markup depend on
 * this range only, never on the total row count.
 */
export function getDataGridInitialRange(options: DataGridInitialRangeOptions): DataGridInitialRange {
  const rows = Math.max(0, Math.min(options.rowCount, options.initialRows ?? 20));
  const columns = Math.max(0, Math.min(options.centerColumnCount, options.initialColumns ?? 20));
  return Object.freeze({ rows: range(rows), columns: range(columns) });
}
