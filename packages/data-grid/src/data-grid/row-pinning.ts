// Row pinning between `DataGridProps` and the engine: the props and API
// types, and the module registration and engine options of the `rowPinning`
// render feature (features/feature-row-pinning.ts), so a grid without pinned
// rows never loads this file or core `row-pinning.ts`. The API methods are
// static (`row-pinning-api.ts`) and answer the documented off values without
// the module. Pinned rows head the row model (core `rowPinning` module); the
// body renders them in the sticky top rowgroup with the `stickyRows` rows
// (Body.tsx), so no rendering code lives here.

import type { DataGridModule, RowId } from '@salmonui/data-grid/engine';
import { createRowPinningModule } from '@salmonui/data-grid/engine/row-pinning';
import { FEATURE_TRIGGERS } from './features/detect.js';
import type { NormalizedProps } from './features/types.js';
import type { DataGridActionResult } from './query-types.js';

export interface DataGridRowPinningProps<Row> {
  /**
   * Rows pinned to the top zone. Pinned rows stay
   * visible above the scrolling rows on every page, are left out of
   * `pageSize`, and follow sorting, filtering, search and edits. Pure; read
   * once when the grid is created. Turns row pinning on.
   */
  isRowPinned?: (row: Row) => boolean;
  /** Initially pinned row ids (initial only). Turns row pinning on; pass `[]` to only use `pinRows`. */
  defaultPinnedRows?: readonly RowId[];
}

export interface DataGridRowPinningApi {
  /** Pins rows to the top zone (rejected unless `isRowPinned` or `defaultPinnedRows` is set). */
  pinRows(rowIds: RowId | readonly RowId[]): DataGridActionResult;
  /** Unpins rows, also rows `isRowPinned` matches. */
  unpinRows(rowIds: RowId | readonly RowId[]): DataGridActionResult;
  /** True when the row is pinned, whether or not the current filter shows it. */
  isRowPinned(rowId: RowId): boolean;
  /** Ids of the pinned rows shown, in display order. */
  getPinnedRowIds(): readonly RowId[];
}

/** Row pinning is on when the grid declares pinned rows by data or by id (the `rowPinning` trigger). */
function hasRowPinning(props: NormalizedProps): boolean {
  return FEATURE_TRIGGERS.rowPinning?.(props) === true;
}

/** The `rowPinning` module the pinning props need, unless the app passes one. */
export function rowPinningModules(props: NormalizedProps, modules: readonly DataGridModule<unknown>[]): readonly DataGridModule<unknown>[] {
  if (!hasRowPinning(props) || modules.some((m) => m.name === 'rowPinning')) return [];
  return [createRowPinningModule<unknown>() as unknown as DataGridModule<unknown>];
}

/** Engine options of the `rowPinning` module (`options.rowPinning`). */
export function rowPinningEngineOptions(props: NormalizedProps): Record<string, unknown> {
  if (!hasRowPinning(props)) return {};
  return {
    rowPinning: {
      ...(props.isRowPinned ? { isRowPinned: props.isRowPinned } : {}),
      ...(props.defaultPinnedRows ? { rowIds: [...props.defaultPinnedRows].map(String) } : {}),
    },
  };
}
