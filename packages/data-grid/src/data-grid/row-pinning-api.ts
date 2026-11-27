// Row pinning API methods, on every grid: they read the core
// `rowPinning` module through its engine facade only, so they import no
// feature code. Without the module (no `isRowPinned` / `defaultPinnedRows`,
// so no `rowPinning` render feature) `pinRows` and `unpinRows` are rejected,
// `isRowPinned` is false and `getPinnedRowIds` is `[]`.

import type { DataGridCommand, RowId } from '@salmonui/data-grid/engine';
import type { DataGridInstance } from './instance.js';
import type { DataGridActionResult } from './query-types.js';
import type { DataGridRowPinningApi } from './row-pinning.js';

type RowPinningFacade = {
  isPinned(rowId: RowId): boolean;
  getPinnedRowIds(): readonly RowId[];
};

const NO_IDS: readonly RowId[] = Object.freeze([]);
const OFF = Object.freeze({ status: 'rejected', reason: 'row pinning is off (set isRowPinned or defaultPinnedRows)' } as const);

/** The `DataGridRowPinningApi` methods of one grid. */
export function rowPinningApi<Row>(instance: DataGridInstance<Row>): DataGridRowPinningApi {
  const facade = (): RowPinningFacade | undefined => (instance.engine as unknown as { rowPinning?: RowPinningFacade }).rowPinning;
  const dispatch = (type: 'rowPinning.pin' | 'rowPinning.unpin', rowIds: RowId | readonly RowId[]): DataGridActionResult => {
    if (!facade()) return OFF;
    const ids = (typeof rowIds === 'string' ? [rowIds] : [...rowIds]).map(String);
    return instance.dispatchFrom('api', { type, rowIds: ids } as DataGridCommand);
  };
  return {
    pinRows: (rowIds) => dispatch('rowPinning.pin', rowIds),
    unpinRows: (rowIds) => dispatch('rowPinning.unpin', rowIds),
    isRowPinned: (rowId) => facade()?.isPinned(rowId) ?? false,
    getPinnedRowIds: () => facade()?.getPinnedRowIds() ?? NO_IDS,
  };
}
