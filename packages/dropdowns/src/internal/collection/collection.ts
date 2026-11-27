// Collection model shared by the dropdown components (Select, Combobox,
// Listbox, Mention). Framework-agnostic: no React, no DOM globals, so it can
// move to a core package later.
//
// Items are the application's objects and are never copied. Per `items`
// identity the collection keeps lazily built values, labels and a
// value-to-index map; group entries are flattened into one list of entries
// (header or item) for the virtual list.

/** Item values: one stable key per item. */
export type CollectionKey = string | number | boolean;

/** Internal. */
export interface CollectionAccessors<T> {
  readonly getItemValue?: ((item: T) => CollectionKey) | undefined;
  readonly getItemLabel?: ((item: T) => string) | undefined;
  readonly getItemGroup?: ((item: T) => string | null | undefined) | undefined;
  readonly isItemDisabled?: ((item: T) => boolean) | undefined;
}

function isRecord(item: unknown): item is Record<string, unknown> {
  return typeof item === 'object' && item !== null;
}

/** Default value accessor: a primitive is its own value; objects read `value`. */
export function defaultItemValue(item: unknown): CollectionKey {
  if (isRecord(item)) return item['value'] as CollectionKey;
  return item as CollectionKey;
}

/** Default label accessor: a primitive is its own label; objects read `label` (then `value`). */
export function defaultItemLabel(item: unknown): string {
  if (isRecord(item)) {
    const label = item['label'] ?? item['value'];
    return label == null ? '' : String(label);
  }
  return item == null ? '' : String(item);
}

/** Default group accessor: objects read `group`. */
export function defaultItemGroup(item: unknown): string | undefined {
  if (isRecord(item)) {
    const group = item['group'];
    return group == null ? undefined : String(group);
  }
  return undefined;
}

/** Default disabled accessor: objects read `disabled`. */
export function defaultItemDisabled(item: unknown): boolean {
  return isRecord(item) && item['disabled'] === true;
}

/** Entry of the flattened list: an item index (>= 0) or a group header (`-(groupIndex + 1)`). */
export type EntryCode = number;

/** Internal. */
export interface CollectionEntries {
  /** Entry codes in display order (items and group headers). */
  readonly codes: Int32Array;
  /** Group names; a header entry `-(g + 1)` names `groups[g]`. */
  readonly groups: readonly string[];
  /** Entry index of each group header, in order (sticky header lookup). */
  readonly headerAt: Int32Array;
  /** Number of item entries. */
  readonly itemCount: number;
}

/** Internal. */
export interface Collection<T> {
  readonly items: readonly T[];
  readonly size: number;
  readonly grouped: boolean;
  value(index: number): CollectionKey;
  label(index: number): string;
  disabled(index: number): boolean;
  group(index: number): string | undefined;
  /** Index of the item with `value`, or -1 (map built on first use). */
  indexOf(value: CollectionKey): number;
  /** Values that occur more than once (computed with the map). */
  duplicates(): readonly CollectionKey[];
  /** Groups whose items are not contiguous (computed with the entries). */
  splitGroups(): readonly string[];
  /** The flattened entries, over every item or over `subset` (ascending item indexes). */
  entries(subset?: Int32Array | null): CollectionEntries;
}

/** Builds the collection model over `items`. O(1) until a lookup needs more. */
export function createCollection<T>(items: readonly T[], accessors: CollectionAccessors<T> = {}): Collection<T> {
  const getValue = (accessors.getItemValue ?? defaultItemValue) as (item: T) => CollectionKey;
  const getLabel = (accessors.getItemLabel ?? defaultItemLabel) as (item: T) => string;
  // The default group accessor applies when the first item has a `group` field.
  const first = items[0];
  const getGroup = (accessors.getItemGroup ?? (isRecord(first) && 'group' in first ? defaultItemGroup : undefined)) as
    | ((item: T) => string | null | undefined)
    | undefined;
  const isDisabled = (accessors.isItemDisabled ?? defaultItemDisabled) as (item: T) => boolean;
  const size = items.length;
  let map: Map<CollectionKey, number> | null = null;
  let dupes: CollectionKey[] = [];
  let labels: (string | undefined)[] | null = null;
  let full: CollectionEntries | null = null;
  let split: string[] = [];

  const buildMap = (): Map<CollectionKey, number> => {
    if (map) return map;
    const next = new Map<CollectionKey, number>();
    const seen: CollectionKey[] = [];
    for (let i = 0; i < size; i++) {
      const v = getValue(items[i] as T);
      if (next.has(v)) seen.push(v);
      else next.set(v, i);
    }
    map = next;
    dupes = seen;
    return next;
  };

  const groupOf = (index: number): string | undefined => {
    if (!getGroup) return undefined;
    const g = getGroup(items[index] as T);
    return g == null ? undefined : String(g);
  };

  const buildEntries = (subset: Int32Array | null): CollectionEntries => {
    const count = subset ? subset.length : size;
    if (!getGroup) {
      const codes = subset ? subset : Int32Array.from({ length: count }, (_, i) => i);
      return { codes, groups: [], headerAt: new Int32Array(0), itemCount: count };
    }
    const codes: number[] = [];
    const groups: string[] = [];
    const headerAt: number[] = [];
    const seen = new Set<string>();
    const splitNow: string[] = [];
    let current: string | undefined;
    let started = false;
    for (let k = 0; k < count; k++) {
      const i = subset ? (subset[k] as number) : k;
      const g = groupOf(i);
      if (!started || g !== current) {
        started = true;
        current = g;
        if (g !== undefined) {
          if (seen.has(g)) splitNow.push(g);
          seen.add(g);
          headerAt.push(codes.length);
          groups.push(g);
          codes.push(-groups.length);
        }
      }
      codes.push(i);
    }
    if (!subset) split = splitNow;
    return { codes: Int32Array.from(codes), groups, headerAt: Int32Array.from(headerAt), itemCount: count };
  };

  return {
    items,
    size,
    grouped: getGroup !== undefined,
    value: (index) => getValue(items[index] as T),
    label: (index) => {
      if (!labels) labels = new Array<string | undefined>(size);
      let l = labels[index];
      if (l === undefined) {
        l = getLabel(items[index] as T);
        labels[index] = l;
      }
      return l;
    },
    disabled: (index) => isDisabled(items[index] as T),
    group: groupOf,
    indexOf: (value) => buildMap().get(value) ?? -1,
    duplicates: () => {
      buildMap();
      return dupes;
    },
    splitGroups: () => {
      if (!full) full = buildEntries(null);
      return split;
    },
    entries: (subset) => {
      if (subset) return buildEntries(subset);
      if (!full) full = buildEntries(null);
      return full;
    },
  };
}

/** Group name of the header at or before `entryIndex` (sticky header), or undefined. */
export function groupAtEntry(entries: CollectionEntries, entryIndex: number): string | undefined {
  const at = entries.headerAt;
  let lo = 0;
  let hi = at.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((at[mid] as number) <= entryIndex) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found < 0 ? undefined : entries.groups[found];
}
