// A small query cache: keyed entries, one in-flight request per key,
// subscribers through useSyncExternalStore, prefix invalidation. Enough for
// the template's list, detail and history reads; swap it for any data layer.
import { useCallback, useEffect, useSyncExternalStore } from 'react';

export type QueryKey = readonly string[];

interface Entry<T> {
  status: 'pending' | 'success' | 'error';
  data: T | undefined;
  error: Error | null;
  fetching: boolean;
  /** Set when the entry must be refetched on the next read. */
  stale: boolean;
  promise: Promise<void> | null;
  fetcher: () => Promise<T>;
}

export interface QueryResult<T> {
  readonly status: Entry<T>['status'];
  readonly data: T | undefined;
  readonly error: Error | null;
  readonly isPending: boolean;
  readonly isError: boolean;
  readonly isSuccess: boolean;
  readonly isFetching: boolean;
  refetch(): Promise<void>;
}

const cache = new Map<string, Entry<unknown>>();
const listeners = new Set<() => void>();
const hash = (key: QueryKey): string => JSON.stringify(key);
const notify = (): void => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

function run<T>(id: string): Promise<void> {
  const entry = cache.get(id) as Entry<T> | undefined;
  if (!entry) return Promise.resolve();
  if (entry.promise) return entry.promise;
  // Replace the entry object so useSyncExternalStore sees a new snapshot.
  const next: Entry<T> = { ...entry, fetching: true, stale: false, promise: null };
  next.promise = entry
    .fetcher()
    .then(
      (data) => {
        if (cache.get(id) === next) cache.set(id, { ...next, status: 'success', data, error: null, fetching: false, promise: null });
      },
      (error: unknown) => {
        if (cache.get(id) === next) cache.set(id, { ...next, status: 'error', error: error instanceof Error ? error : new Error(String(error)), fetching: false, promise: null });
      },
    )
    .finally(notify);
  cache.set(id, next as Entry<unknown>);
  notify();
  return next.promise;
}

/** Reads `key`, fetching it on first use and after an invalidation. */
export function useQuery<T>(key: QueryKey, fetcher: () => Promise<T>): QueryResult<T> {
  const id = hash(key);
  if (!cache.has(id)) cache.set(id, { status: 'pending', data: undefined, error: null, fetching: false, stale: true, promise: null, fetcher } as Entry<unknown>);
  const entry = useSyncExternalStore(subscribe, () => cache.get(id) as Entry<T> | undefined);
  useEffect(() => {
    const current = cache.get(id);
    if (current && current.stale && !current.promise) void run(id);
  }, [id, entry]);
  const refetch = useCallback(() => run<T>(id), [id]);
  const status = entry?.status ?? 'pending';
  return {
    status,
    data: entry?.data,
    error: entry?.error ?? null,
    isPending: status === 'pending',
    isError: status === 'error',
    isSuccess: status === 'success',
    isFetching: entry?.fetching ?? true,
    refetch,
  };
}

const matches = (id: string, prefix: QueryKey): boolean => {
  const key = JSON.parse(id) as string[];
  return prefix.every((part, index) => key[index] === part);
};

/** Marks every entry under `prefix` stale; mounted readers refetch it. */
export function invalidateQueries(prefix: QueryKey): void {
  for (const [id, entry] of cache) if (matches(id, prefix)) cache.set(id, { ...entry, stale: true });
  notify();
}

export function setQueryData<T>(key: QueryKey, data: T): void {
  const id = hash(key);
  const entry = cache.get(id);
  if (entry) cache.set(id, { ...entry, status: 'success', data, error: null });
  notify();
}

export function removeQueries(prefix: QueryKey): void {
  for (const id of [...cache.keys()]) if (matches(id, prefix)) cache.delete(id);
  notify();
}

/** Runs an async mutation and tracks whether it is pending. */
export { useMutation } from './mutation';
