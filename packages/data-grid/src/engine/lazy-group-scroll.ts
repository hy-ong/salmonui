// Scroll-driven lazy group loading: which expanded lazy
// groups should append their next chunk for a rendered row window. With
// `infiniteScroll` and lazy grouping, the renderer calls this when the row
// window or the row model changes (never per scroll frame) and dispatches
// `grouping.loadMore` for each returned group, so scrolling appends group
// children; the caption Load more button stays the
// keyboard and assistive technology path.
//
// A group's loaded content ends at its last loaded row (data row, sub-group
// subtree, or group footer). When that end lies within the window plus
// `threshold` rows below it and the group reports `hasMore`, the group is
// due. Cost: O((window + threshold) * group depth) array reads and map
// lookups; nothing is allocated for a window without due groups.

//
// Imports are type-only: a runtime import of a statically used module
// (`./lazy-groups.js`, `./group-tree.js`, `./view-helpers.js`) from this
// lazy-only file would split that module into its own chunk in renderer
// bundles.

import type { LazyGroupView, LazyNode } from './lazy-groups.js';
import type { RowId, RowModelView } from './types.js';

/** Same value as `GROUP_ID_PREFIX` of `./group-tree.js`. */
const GROUP_ID_PREFIX = '__g:';

/** The innermost (structural) view, as `baseView` of `./view-helpers.js`. */
function baseOf(view: RowModelView): RowModelView {
  let v = view;
  while (v.inner) v = v.inner;
  return v;
}

/** First node whose expanded content holds the row: a caption belongs to its parent's content. */
function ownerAt(view: LazyGroupView, index: number): LazyNode | null {
  const node = view.nodeAt(index);
  if (!node) return null;
  return view.kindAt(index) === 'group' ? node.parent : node;
}

function contains(ancestor: LazyNode, node: LazyNode | null): boolean {
  for (let n = node; n; n = n.parent) if (n === ancestor) return true;
  return false;
}

/** Base view range covered by the visible rows `[start, end)` of a possibly wrapped view (detail, pinned rows). */
function baseRange(view: RowModelView, base: LazyGroupView, start: number, end: number): [number, number] {
  if (view === base) return [start, end];
  let a = Infinity;
  let b = -1;
  for (let i = start; i < end; i++) {
    const id = view.idAt(i);
    const at = id === undefined ? undefined : base.resolve(id)?.index;
    if (at === undefined) continue;
    if (at < a) a = at;
    if (at > b) b = at;
  }
  return b < 0 ? [0, 0] : [a, b + 1];
}

/**
 * Group row ids (`__g:` ids) whose next chunk should load for the rendered
 * rows `[start, end)` of `view`: expanded lazy groups with `hasMore`, not
 * loading and not failed, whose loaded content ends within `threshold` rows
 * past the window. Empty unless the base view is a lazy group view.
 */
export function lazyGroupsToAppend(view: RowModelView | null | undefined, start: number, end: number, threshold = 0): RowId[] {
  if (!view || end <= start) return [];
  const inner = baseOf(view);
  if (inner.kind !== 'lazyGrouped') return [];
  const base = inner as LazyGroupView;
  const [a, b] = baseRange(view, base, Math.max(0, start), Math.min(end, view.count));
  const last = Math.min(base.count, b + Math.max(0, threshold));
  let out: RowId[] | null = null;
  let owner = a < last ? ownerAt(base, a) : null;
  for (let i = a; i < last; i++) {
    const next = i + 1 < base.count ? ownerAt(base, i + 1) : null;
    // Every group holding row i but not row i+1 ends at i.
    for (let n = owner; n && !contains(n, next); n = n.parent) {
      if (n.hasMore && n.status === 'ready') (out ??= []).push(GROUP_ID_PREFIX + n.pathKey);
    }
    owner = next;
  }
  return out ?? [];
}
