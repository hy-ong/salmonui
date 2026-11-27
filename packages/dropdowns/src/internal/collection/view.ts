// Per-render list view over local or remote entries, shared by Listbox and
// the Select / Combobox popups: entry codes (item index or group header),
// item accessors, `aria-posinset`, and the entry of an item. Extracted from
// listbox/Listbox.tsx. Framework-agnostic: no React, no DOM.

import type { Collection, CollectionEntries, CollectionKey } from './collection.js';
import type { RemoteSnapshot } from './remote.js';

/** A per-render view over local or remote entries. */
export interface ListView<T> {
  readonly count: number;
  readonly itemCount: number;
  readonly remote: boolean;
  code(entry: number): number;
  item(index: number): T | undefined;
  value(index: number): CollectionKey | undefined;
  label(index: number): string;
  disabled(index: number): boolean;
  group(entry: number): string | undefined;
  posinset(entry: number): number;
  /** Entry index of an item index, or -1. */
  entryOf(index: number): number;
  /** Insertion index in `data` for a drop before `entry` (entry === count: after the last). */
  dataIndexAt(entry: number): number;
}

export function localView<T>(
  collection: Collection<T>,
  entries: CollectionEntries,
  isDisabled: (item: T) => boolean,
): ListView<T> {
  const codes = entries.codes;
  let reverse: Map<number, number> | null = null;
  const headersBefore = (entry: number): number => {
    const at = entries.headerAt;
    let lo = 0;
    let hi = at.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((at[mid] as number) <= entry) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  return {
    count: codes.length,
    itemCount: entries.itemCount,
    remote: false,
    code: (entry) => codes[entry] as number,
    item: (index) => collection.items[index],
    value: (index) => collection.value(index),
    label: (index) => collection.label(index),
    disabled: (index) => isDisabled(collection.items[index] as T),
    group: (entry) => {
      const code = codes[entry] as number;
      return code < 0 ? entries.groups[-code - 1] : collection.group(code);
    },
    posinset: (entry) => entry - headersBefore(entry) + 1,
    entryOf: (index) => {
      if (codes.length === collection.size && entries.headerAt.length === 0) return index < codes.length ? index : -1;
      if (!reverse) {
        reverse = new Map();
        for (let e = 0; e < codes.length; e++) if ((codes[e] as number) >= 0) reverse.set(codes[e] as number, e);
      }
      return reverse.get(index) ?? -1;
    },
    dataIndexAt: (entry) => {
      for (let e = entry; e < codes.length; e++) if ((codes[e] as number) >= 0) return codes[e] as number;
      for (let e = codes.length - 1; e >= 0; e--) if ((codes[e] as number) >= 0) return (codes[e] as number) + 1;
      return collection.size;
    },
  };
}

export function remoteView<T>(
  snapshot: RemoteSnapshot<T> | null,
  getValue: (item: T) => CollectionKey,
  getLabel: (item: T) => string,
  isDisabled: (item: T) => boolean,
): ListView<T> {
  const total = snapshot && snapshot.total > 0 ? snapshot.total : 0;
  return {
    count: total,
    itemCount: total,
    remote: true,
    code: (entry) => entry,
    item: (index) => snapshot?.item(index),
    value: (index) => {
      const item = snapshot?.item(index);
      return item === undefined ? undefined : getValue(item);
    },
    label: (index) => {
      const item = snapshot?.item(index);
      return item === undefined ? '' : getLabel(item);
    },
    disabled: (index) => {
      const item = snapshot?.item(index);
      return item === undefined ? true : isDisabled(item);
    },
    group: () => undefined,
    posinset: (entry) => entry + 1,
    entryOf: (index) => (index < total ? index : -1),
    dataIndexAt: (entry) => entry,
  };
}

