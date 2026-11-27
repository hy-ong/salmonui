// `treeOf(model)`: the tree of a tree-mode row model, for modules that act on
// subtrees (row drag `into`, subtree delete, tree row positions) without
// importing tree code. Class-free and tiny; it lives outside
// `view-helpers.ts` so renderers that load the view helpers on the default
// path pay nothing for tree mode.

import type { RowModelSnapshot, RowModelView } from './types.js';
import type { TreeStructure } from './tree-view.js';

/** The tree (full index and kept layout) of a tree-mode model, or null. */
export function treeOf<Row>(model: RowModelSnapshot<Row>): TreeStructure | null {
  let v: RowModelView | null = model.view ?? null;
  while (v && v.inner) v = v.inner;
  return v && v.kind === 'tree' ? (v as RowModelView & { readonly model: { readonly structure: TreeStructure } }).model.structure : null;
}
