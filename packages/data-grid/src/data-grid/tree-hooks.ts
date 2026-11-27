// Tree mode hooks the lazy interaction chunks read without importing tree
// code: set by the `tree` render feature
// (tree-ui.tsx) per engine. Tiny and static.

import type { RowId } from '@salmonui/data-grid/engine';

/** `tree.copyMode`: widens the copied row ids (ancestors and/or descendants, tree pre-order). */
export const treeCopyHooks = new WeakMap<object, (rowIds: readonly RowId[]) => readonly RowId[]>();
