// Lookup (foreign-key) columns in the React grid: the module
// registration of the `lookup` render feature (features/feature-lookup.ts).
// The `lookup` core module is registered automatically when a declared
// column (nested and hidden ones included) has `lookup: { data, keyField,
// displayField }` (no module injection). It is creation-only; the header
// load status is a static structural read (`lookup-status.ts`).

import { createLookupModule } from '@salmonui/data-grid/engine/lookup';
import type { DataGridModule } from '@salmonui/data-grid/engine';
import { FEATURE_TRIGGERS } from './features/detect.js';
import type { NormalizedProps } from './features/types.js';

/** The `lookup` module when a declared column has `lookup` and the app passes none. */
export function lookupModules(props: NormalizedProps, modules: readonly DataGridModule<unknown>[]): readonly DataGridModule<unknown>[] {
  if (modules.some((m) => m.name === 'lookup') || FEATURE_TRIGGERS.lookup?.(props) !== true) return [];
  return [createLookupModule<unknown>() as unknown as DataGridModule<unknown>];
}
