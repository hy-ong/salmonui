// Header load status of lookup (foreign-key) columns, on every grid:
// a structural read of the `lookup` module state in the snapshot (type
// imports only), so it needs no feature code and also covers lookup
// columns added after creation while the module is registered (late
// enable). The module itself comes with the `lookup` render feature.

import type { ColumnId, DataGridSnapshot } from '@salmonui/data-grid/engine';
import type { LookupState, LookupStatus } from '@salmonui/data-grid/engine/lookup';

/** Load status of a lookup column for the header (`null` for plain columns, settled local lookups, and grids without the module). */
export function lookupStatusOf(snapshot: DataGridSnapshot<unknown>, columnId: ColumnId): Extract<LookupStatus, 'loading' | 'error'> | null {
  const state = snapshot.modules['lookup'] as LookupState | undefined;
  const status = state?.columns[columnId]?.status;
  return status === 'loading' || status === 'error' ? status : null;
}
