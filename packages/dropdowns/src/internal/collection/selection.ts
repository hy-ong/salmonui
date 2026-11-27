// Selection model shared by the dropdowns and the Data Grid checklist: a base (`all` or `none`) plus the toggled values, so
// select all over remote or virtualized data never needs unloaded values.
// Framework-agnostic.

import type { Collection, CollectionKey } from './collection.js';

/** Internal. */
export interface SelectionDraft {
  readonly base: 'all' | 'none';
  readonly toggled: ReadonlySet<CollectionKey>;
}

const EMPTY: ReadonlySet<CollectionKey> = new Set();

/** Internal. */
export const SELECT_NONE: SelectionDraft = { base: 'none', toggled: EMPTY };
/** Internal. */
export const SELECT_ALL: SelectionDraft = { base: 'all', toggled: EMPTY };

/** Internal. */
export function selectionFromValues(values: Iterable<CollectionKey>): SelectionDraft {
  return { base: 'none', toggled: new Set(values) };
}

/** Internal. */
export function isSelected(draft: SelectionDraft, value: CollectionKey): boolean {
  return draft.toggled.has(value) !== (draft.base === 'all');
}

/** Internal. */
export function toggleSelected(draft: SelectionDraft, value: CollectionKey): SelectionDraft {
  const toggled = new Set(draft.toggled);
  if (toggled.has(value)) toggled.delete(value);
  else toggled.add(value);
  return { base: draft.base, toggled };
}

/** Sets `values` to `selected` in one step (range selection, group selection). */
export function setSelected(draft: SelectionDraft, values: Iterable<CollectionKey>, selected: boolean): SelectionDraft {
  const toggled = new Set(draft.toggled);
  const flip = selected !== (draft.base === 'all');
  for (const v of values) {
    if (flip) toggled.add(v);
    else toggled.delete(v);
  }
  return { base: draft.base, toggled };
}

/** Selected count over `total` items (exact when every toggled value is in the collection). */
export function selectedCount(draft: SelectionDraft, total: number): number {
  return draft.base === 'all' ? total - draft.toggled.size : draft.toggled.size;
}

/**
 * Materializes the selected values of a local collection, in data
 * order. Disabled items keep their current state (select all never selects a
 * disabled item that was not selected).
 */
export function selectedValues<T>(draft: SelectionDraft, collection: Collection<T>): CollectionKey[] {
  if (draft.base === 'none') {
    const out: CollectionKey[] = [];
    for (const v of draft.toggled) if (collection.indexOf(v) >= 0) out.push(v);
    return out.sort((a, b) => collection.indexOf(a) - collection.indexOf(b));
  }
  const out: CollectionKey[] = [];
  for (let i = 0; i < collection.size; i++) {
    const v = collection.value(i);
    if (!draft.toggled.has(v)) out.push(v);
  }
  return out;
}

/**
 * Select all over a local collection: every enabled value plus the
 * already selected disabled ones, up to `limit` values. O(n), no Set copies
 * of unselected values.
 */
export function selectAllValues<T>(collection: Collection<T>, current: ReadonlySet<CollectionKey>, limit = Infinity): CollectionKey[] {
  const out: CollectionKey[] = [];
  let room = limit - current.size;
  for (let i = 0; i < collection.size; i++) {
    const v = collection.value(i);
    if (current.has(v)) out.push(v);
    else if (room > 0 && !collection.disabled(i)) {
      out.push(v);
      room--;
    }
  }
  return out;
}
