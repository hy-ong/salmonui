// Checkbox cascade over a tree layout. Pure and grid-free: selection stays an id set owned
// by the selection module; this file only derives, per row, how many of its
// descendants are selected (one bottom-up O(n) pass, then O(depth) per
// changed row) and the tri-state of a parent from those counts. Nothing is
// stored per row besides one `Int32Array`.

import type { TreeLayout } from './tree-index.js';

export type TreeCheckState = 'checked' | 'mixed' | 'unchecked';

/** Selected descendants of every kept row of `layout` (by source index). O(n): one reverse pre-order pass. */
export function countSelectedDescendants(layout: TreeLayout, selected: (sourceIndex: number) => boolean): Int32Array {
  const counts = new Int32Array(layout.sourceCount);
  const { order, parent } = layout;
  for (let slot = layout.count - 1; slot >= 0; slot--) {
    const s = order[slot] as number;
    const p = parent[s] as number;
    if (p >= 0) counts[p]! += (counts[s] as number) + (selected(s) ? 1 : 0);
  }
  return counts;
}

/** Applies a selection change to the counts in place: every ancestor of a changed row moves by one. O(changed × depth). */
export function applySelectionDelta(layout: TreeLayout, counts: Int32Array, added: Iterable<number>, removed: Iterable<number>): void {
  const { parent, slot } = layout;
  for (const s of added) {
    if (s < 0 || (slot[s] as number) < 0) continue;
    for (let p = parent[s] as number; p >= 0; p = parent[p] as number) counts[p]!++;
  }
  for (const s of removed) {
    if (s < 0 || (slot[s] as number) < 0) continue;
    for (let p = parent[s] as number; p >= 0; p = parent[p] as number) counts[p]!--;
  }
}

/** Kept descendants of a row. */
export function descendantCount(layout: TreeLayout, sourceIndex: number): number {
  const a = layout.slot[sourceIndex] ?? -1;
  return a < 0 ? 0 : (layout.next[a] as number) - a - 1;
}

/**
 * Tri-state of a row: `checked` when it and every kept descendant are
 * selected, `unchecked` when none is, else `mixed`.
 */
export function checkStateOf(layout: TreeLayout, counts: Int32Array, sourceIndex: number, own: boolean): TreeCheckState {
  const total = descendantCount(layout, sourceIndex);
  if (total === 0) return own ? 'checked' : 'unchecked';
  const c = counts[sourceIndex] as number;
  if (own && c >= total) return 'checked';
  if (!own && c <= 0) return 'unchecked';
  return 'mixed';
}

/**
 * Rows a cascade toggle of `sourceIndex` changes: the row and its kept
 * subtree (`[slot, next)`), then the ancestors whose state follows. Checking
 * selects every ancestor whose descendants become all selected (bottom-up,
 * stopping at the first that does not); unchecking deselects every selected
 * ancestor. Returns source indexes to select and to deselect.
 */
export function cascadePlan(
  layout: TreeLayout,
  counts: Int32Array,
  sourceIndex: number,
  checked: boolean,
  selected: (sourceIndex: number) => boolean,
): { readonly select: number[]; readonly deselect: number[] } {
  const select: number[] = [];
  const deselect: number[] = [];
  const a = layout.slot[sourceIndex] ?? -1;
  if (a < 0) return { select, deselect };
  const end = layout.next[a] as number;
  const order = layout.order;
  let delta = 0;
  const next = layout.next;
  const list = checked ? select : deselect;
  const step = checked ? 1 : -1;
  for (let slot = a; slot < end; ) {
    const s = order[slot] as number;
    if (selected(s) !== checked) {
      list.push(s);
      if (slot > a) delta += step;
    }
    // The counts say when a whole subtree is uniform: skip it, or take it without lookups.
    const stop = next[slot] as number;
    const below = stop - slot - 1;
    const c = counts[s] as number;
    if (c === (checked ? below : 0)) slot = stop;
    else if (c === (checked ? 0 : below)) {
      for (let x = slot + 1; x < stop; x++) list.push(order[x] as number);
      delta += step * below;
      slot = stop;
    } else slot++;
  }
  // The row itself counts for its ancestors too.
  const selfChange = checked ? (selected(sourceIndex) ? 0 : 1) : selected(sourceIndex) ? -1 : 0;
  let carry = delta + selfChange;
  for (let p = layout.parent[sourceIndex] as number; p >= 0; p = layout.parent[p] as number) {
    const on = selected(p);
    if (checked) {
      const full = (counts[p] as number) + carry >= descendantCount(layout, p);
      if (!full) break;
      if (!on) {
        select.push(p);
        carry++;
      }
    } else if (on) {
      deselect.push(p);
      carry--;
    }
  }
  return { select, deselect };
}
