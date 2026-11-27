// Static public helpers of detail rows and child grids, kept apart
// from the `detail` render feature (detail-config.ts, detail.tsx): an app
// that imports `defineChildGrid` or `DATA_GRID_DETAIL_COLUMN_ID` statically
// pays for these lines only (a module
// that a static and a lazy importer share lands in the static chunk).

import type { DataGridChildGrid } from './detail-types.js';

/** Column id of the detail expand/collapse column. */
export const DETAIL_COLUMN_ID = '__salmon_detail';

/**
 * Types a `childGrid` by its child row type (identity at runtime). The
 * `childGrid` prop holds child grids of any row type, so its child rows are
 * `unknown`; this helper checks the config against `Child` and `Parent`.
 */
export function defineChildGrid<Child, Parent = unknown>(config: DataGridChildGrid<Child, Parent>): DataGridChildGrid<unknown, Parent> {
  return config as unknown as DataGridChildGrid<unknown, Parent>;
}
