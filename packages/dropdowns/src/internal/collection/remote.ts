// Remote adapter: a dropdown list over any `@salmonui/data` source through
// the structural `DataSource` contract. No new request kind: the search text becomes the query's
// `search`, the visible window a `range` read, and `totalRowCount` the list
// length (`aria-setsize`). Framework-agnostic; type-only core imports.

import type { DataQuery } from '@salmonui/core/data';
import type { DataSourceRequest, DataSourceResult, FilterEntry, SortDescriptor } from '@salmonui/core/data';
import type { SearchOperatorName } from './search.js';

/** The structural part of a data source the adapter uses. */
export interface RemoteSource<T> {
  read(request: DataSourceRequest): DataSourceResult<T> | Promise<DataSourceResult<T>>;
}

/** Base query merged into every read (filters and sort of the `@salmonui/data` query model). */
export interface RemoteQuery {
  readonly filters?: readonly FilterEntry[] | undefined;
  readonly sorting?: readonly SortDescriptor[] | undefined;
}

/** Internal. */
export interface RemoteOptions {
  /** Fields the search text runs over (default `['label']`). */
  readonly searchFields?: readonly string[] | undefined;
  readonly operator?: SearchOperatorName | undefined;
  readonly matchCase?: boolean | undefined;
  readonly ignoreAccents?: boolean | undefined;
  readonly query?: RemoteQuery | undefined;
  /** Items per range read (default 100). */
  readonly blockSize?: number | undefined;
  /** Blocks kept in memory (default 20); the farthest from the last request are evicted. */
  readonly maxBlocks?: number | undefined;
  /** Caps the list length and the read range. */
  readonly maxResults?: number | undefined;
  /** Searches shorter than this hold requests (the list stays empty). */
  readonly minSearchLength?: number | undefined;
  /** Search debounce in ms (default 300; 0 searches synchronously). */
  readonly debounce?: number | undefined;
}

/** Internal. */
export interface RemoteSnapshot<T> {
  /** Changes on every update (store identity for `useSyncExternalStore`). */
  readonly revision: number;
  /** Search generation; a new search starts a new generation. */
  readonly generation: number;
  readonly search: string;
  /** List length: `totalRowCount`, capped by `maxResults`; -1 until the first response. */
  readonly total: number;
  readonly loading: boolean;
  readonly error: unknown;
  /** Whether the search is held by `minSearchLength`. */
  readonly held: boolean;
  /** Items of the initial values, once read (`createValueCollection`). */
  readonly known?: readonly T[] | undefined;
  item(index: number): T | undefined;
}

/** Internal. */
export interface RemoteCollection<T> {
  getSnapshot(): RemoteSnapshot<T>;
  subscribe(listener: () => void): () => void;
  /** Sets the search text (debounced); an empty text clears the search immediately. */
  setSearch(text: string): void;
  /** Makes sure items `[start, end)` are loaded or requested. */
  ensure(start: number, end: number): void;
  /** Re-reads after an error. */
  retry(): void;
  dispose(): void;
}

const NO_EXPANSION = { groups: {}, tree: {}, detail: {}, defaultGroupExpanded: true } as const;

/** Internal. */
export function createRemoteCollection<T>(source: RemoteSource<T>, options: RemoteOptions = {}): RemoteCollection<T> {
  const blockSize = Math.max(1, options.blockSize ?? 100);
  const maxBlocks = Math.max(2, options.maxBlocks ?? 20);
  const maxResults = options.maxResults ?? Infinity;
  const minSearch = options.minSearchLength ?? 0;
  const debounce = options.debounce ?? 300;
  const listeners = new Set<() => void>();
  const blocks = new Map<number, readonly T[]>();
  const pending = new Map<number, AbortController>();
  let requestVersion = 0;
  let generation = 0;
  let search = '';
  let total = -1;
  let error: unknown = null;
  let revision = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastWanted: [number, number] = [0, blockSize];
  let disposed = false;
  let snapshot: RemoteSnapshot<T>;

  const publish = (): void => {
    revision++;
    const s = search;
    const t = total;
    const e = error;
    const g = generation;
    snapshot = {
      revision,
      generation: g,
      search: s,
      total: t,
      loading: pending.size > 0,
      error: e,
      held: s.length > 0 && s.length < minSearch,
      item: (index) => {
        const block = blocks.get(Math.floor(index / blockSize));
        return block?.[index % blockSize];
      },
    };
    for (const l of listeners) l();
  };

  const queryOf = (): DataQuery => ({
    search: search
      ? {
          text: search,
          columnIds: options.searchFields ?? ['label'],
          operator: options.operator ?? 'startsWith',
          ignoreCase: options.matchCase !== true,
          ignoreAccent: options.ignoreAccents === true,
        }
      : null,
    filters: options.query?.filters ?? [],
    sorting: options.query?.sorting ?? [],
    grouping: [],
    aggregates: [],
    paging: null,
    expansion: NO_EXPANSION,
  });

  const evict = (): void => {
    if (blocks.size <= maxBlocks) return;
    const center = Math.floor(lastWanted[0] / blockSize);
    const order = [...blocks.keys()].sort((a, b) => Math.abs(b - center) - Math.abs(a - center));
    for (const b of order) {
      if (blocks.size <= maxBlocks) break;
      blocks.delete(b);
    }
  };

  const readBlock = (block: number): void => {
    if (blocks.has(block) || pending.has(block)) return;
    const start = block * blockSize;
    const end = Math.min(start + blockSize, maxResults);
    if (end <= start) return;
    const controller = new AbortController();
    const version = ++requestVersion;
    const gen = generation;
    pending.set(block, controller);
    let result: DataSourceResult<T> | Promise<DataSourceResult<T>>;
    try {
      result = source.read({ version, query: queryOf(), range: { start, end }, signal: controller.signal });
    } catch (e) {
      pending.delete(block);
      error = e;
      publish();
      return;
    }
    const settle = (res: DataSourceResult<T>): void => {
      // A response for an older search or an aborted window is dropped.
      if (disposed || gen !== generation || controller.signal.aborted) return;
      pending.delete(block);
      blocks.set(block, res.rows);
      const known = res.totalRowCount ?? (res.rows.length < end - start ? start + res.rows.length : Math.max(total, end + blockSize));
      total = Math.min(known, maxResults);
      error = null;
      evict();
      publish();
    };
    const fail = (e: unknown): void => {
      if (disposed || gen !== generation || controller.signal.aborted) return;
      pending.delete(block);
      error = e;
      publish();
    };
    if (result && typeof (result as Promise<unknown>).then === 'function') (result as Promise<DataSourceResult<T>>).then(settle, fail);
    else settle(result as DataSourceResult<T>);
  };

  const ensure = (start: number, end: number): void => {
    if (disposed || error !== null || (search.length > 0 && search.length < minSearch)) return;
    lastWanted = [start, end];
    const from = Math.floor(Math.max(0, start) / blockSize);
    const to = Math.floor(Math.max(start, end - 1) / blockSize);
    // A new window aborts reads for blocks it no longer needs.
    for (const [block, controller] of pending) {
      if (block < from || block > to) {
        controller.abort();
        pending.delete(block);
      }
    }
    let changed = false;
    for (let b = from; b <= to; b++) {
      if (total >= 0 && b * blockSize >= total) break;
      if (!blocks.has(b) && !pending.has(b)) {
        readBlock(b);
        changed = true;
      }
    }
    if (changed) publish();
  };

  const restart = (): void => {
    generation++;
    for (const c of pending.values()) c.abort();
    pending.clear();
    blocks.clear();
    total = -1;
    error = null;
    lastWanted = [0, blockSize];
    publish();
    ensure(0, blockSize);
  };

  const applySearch = (text: string): void => {
    timer = undefined;
    if (text === search) return;
    search = text;
    restart();
  };

  publish();

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    setSearch: (text) => {
      if (timer !== undefined) clearTimeout(timer);
      if (text === '' || debounce <= 0) applySearch(text);
      else timer = setTimeout(() => applySearch(text), debounce);
    },
    ensure,
    retry: () => {
      error = null;
      const [s, e] = lastWanted;
      publish();
      ensure(s, e);
    },
    dispose: () => {
      disposed = true;
      if (timer !== undefined) clearTimeout(timer);
      for (const c of pending.values()) c.abort();
      pending.clear();
      listeners.clear();
    },
  };
}

/**
 * One read for the items of `values`: the base query filters plus
 * `field in [...values]`, one range of `values.length`. A remote dropdown with
 * a value and no `selectedItems` runs it after mount, so the trigger shows the
 * label without the popup opening. Resolves to null when aborted.
 */
export function readValueItems<T>(source: RemoteSource<T>, values: readonly (string | number | boolean)[], field: string, query: RemoteQuery | undefined, signal: AbortSignal): Promise<readonly T[] | null> {
  const filter: FilterEntry = { columnId: field, operator: 'in', value: [...values], predicate: 'and', source: 'api' };
  return Promise.resolve(
    source.read({
      version: 1,
      query: { search: null, filters: [...(query?.filters ?? []), filter], sorting: [], grouping: [], aggregates: [], paging: null, expansion: NO_EXPANSION },
      range: { start: 0, end: values.length },
      signal,
    }),
  ).then((res) => (signal.aborted ? null : res.rows));
}

/**
 * A remote collection whose snapshot also carries `known`: the items of
 * `values`, read once with `readValueItems`. Dropdowns with a
 * value and no `selectedItems` use it, so the trigger shows the label
 * without the popup opening; other remote lists never bundle the read.
 */
export function createValueCollection<T>(source: RemoteSource<T>, options: RemoteOptions, values: readonly (string | number | boolean)[] | undefined): RemoteCollection<T> {
  const inner = createRemoteCollection(source, options);
  if (!values?.length) return inner;
  const listeners = new Set<() => void>();
  const read = new AbortController();
  let known: readonly T[] | undefined;
  let base: RemoteSnapshot<T> | undefined;
  let snapshot: RemoteSnapshot<T>;
  readValueItems(source, values, 'value', options.query, read.signal).then(
    (rows) => {
      if (!rows?.length) return;
      known = rows;
      base = undefined;
      for (const l of listeners) l();
    },
    () => {},
  );
  return {
    ...inner,
    getSnapshot: () => {
      const s = inner.getSnapshot();
      if (s !== base) {
        base = s;
        snapshot = { ...s, known };
      }
      return snapshot;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      const off = inner.subscribe(listener);
      return () => {
        listeners.delete(listener);
        off();
      };
    },
    dispose: () => {
      read.abort();
      listeners.clear();
      inner.dispose();
    },
  };
}
