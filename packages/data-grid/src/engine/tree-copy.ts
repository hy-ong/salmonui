// Tree copy modes (`tree.copyMode`): the rows a copy writes when tree mode adds the
// ancestors and/or descendants of the copied rows. Pure, with a grid-free
// signature: the renderer (or any caller of `api.copy()`) maps the copied
// row ids through it before serializing.

import type { TreeStructure } from './tree-view.js';
import type { RowId } from './types.js';

/**
 * The copied row ids widened by `mode` over the kept layout of the current
 * query: `ancestors` adds every kept ancestor, `descendants` every kept
 * descendant, `both` both, `none` nothing. The result is in tree pre-order
 * without duplicates; ids that are not in the layout keep their relative
 * order after the tree rows. O(n) over the kept rows.
 */
export function treeCopyRowIds(structure: TreeStructure, rowIds: readonly RowId[], mode: 'ancestors' | 'descendants' | 'both' | 'none'): RowId[] {
  const layout = structure.layout;
  const mark = new Uint8Array(layout.sourceCount);
  const outside: RowId[] = [];
  const up = mode === 'ancestors' || mode === 'both';
  const down = mode === 'descendants' || mode === 'both';
  let any = false;
  for (const id of rowIds) {
    const s = structure.sourceIndexOf(id);
    const slot = s < 0 ? -1 : (layout.slot[s] as number);
    if (slot < 0) {
      if (!outside.includes(id)) outside.push(id);
      continue;
    }
    any = true;
    mark[s] = 1;
    if (up) for (let p = layout.parent[s] as number; p >= 0 && !mark[p]; p = layout.parent[p] as number) mark[p] = 1;
    if (down) for (let k = slot + 1, end = layout.next[slot] as number; k < end; k++) mark[layout.order[k] as number] = 1;
  }
  const out: RowId[] = [];
  if (any) {
    for (let k = 0; k < layout.count; k++) {
      const s = layout.order[k] as number;
      if (mark[s]) out.push(structure.sourceIds[s] as RowId);
    }
  }
  return outside.length ? out.concat(outside) : out;
}
