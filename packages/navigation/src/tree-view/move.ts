// `moveTreeItems`: applies an `onMove` event to nested data. The
// tree never changes `data` itself; this pure helper returns new arrays
// along the changed paths only (unchanged subtrees keep their identity).

import type { TreeViewDropPosition, TreeViewKey } from './types.js';

export interface MoveTreeItemsOptions<T> {
  readonly getItemId: (item: T) => TreeViewKey;
  readonly getChildren: (item: T) => readonly T[] | null | undefined;
  /** Returns a copy of `item` with `children`. */
  readonly withChildren: (item: T, children: readonly T[]) => T;
}

/**
 * Moves the items `ids` (taken from `data`, or from `items` when they come
 * from another tree) `before`, `after` or `into` the item `targetId`.
 */
export function moveTreeItems<T>(
  data: readonly T[],
  move: { readonly ids: readonly TreeViewKey[]; readonly targetId: TreeViewKey; readonly position: TreeViewDropPosition; readonly items?: readonly T[] },
  options: MoveTreeItemsOptions<T>,
): T[] {
  const { getItemId, getChildren, withChildren } = options;
  const moving = new Set(move.ids);
  const taken = new Map<TreeViewKey, T>();
  for (const item of move.items ?? []) taken.set(getItemId(item), item);
  const remove = (list: readonly T[]): readonly T[] => {
    let changed = false;
    const out: T[] = [];
    for (const item of list) {
      const id = getItemId(item);
      if (moving.has(id)) {
        if (!taken.has(id)) taken.set(id, item);
        changed = true;
        continue;
      }
      const kids = getChildren(item);
      const next = kids ? remove(kids) : kids;
      if (next !== kids) {
        changed = true;
        out.push(withChildren(item, next as readonly T[]));
      } else out.push(item);
    }
    return changed ? out : list;
  };
  const rest = remove(data);
  const moved = move.ids.map((id) => taken.get(id)).filter((x): x is T => x !== undefined);
  const insert = (list: readonly T[]): readonly T[] => {
    const at = list.findIndex((item) => getItemId(item) === move.targetId);
    if (at >= 0) {
      const out = list.slice();
      if (move.position === 'into') {
        const target = list[at] as T;
        out[at] = withChildren(target, [...(getChildren(target) ?? []), ...moved]);
      } else out.splice(move.position === 'before' ? at : at + 1, 0, ...moved);
      return out;
    }
    let changed = false;
    const out = list.map((item) => {
      const kids = getChildren(item);
      if (!kids || changed) return item;
      const next = insert(kids);
      if (next === kids) return item;
      changed = true;
      return withChildren(item, next);
    });
    return changed ? out : list;
  };
  return insert(rest) as T[];
}
