// Range source: rows loaded for a visible range, for lazy charts. Feed it
// from `Chart` `onVisibleRangeChange` (it fires on commit, not per drag
// frame) and read it with `useSyncExternalStore(source.subscribe,
// source.getSnapshot)`. A new request aborts the one in flight; loaded
// ranges are cached (most recent first, `cacheSize` entries), so zooming
// back is instant. Zero dependencies, no React.

import { createAbortController, type AbortControllerLike } from './scheduler.js';
import type { AbortSignalLike } from './types.js';

export type Range = readonly [number, number];

export interface RangeSourceSnapshot<T> {
  /** Rows of the last completed range (kept while the next one loads). */
  readonly rows: readonly T[];
  /** The range the rows belong to, or null before the first load. */
  readonly range: Range | null;
  readonly loading: boolean;
  readonly error: unknown;
}

export interface RangeSourceOptions<T> {
  /** Loads the rows of a range; honor `signal` to stop superseded requests. */
  readonly load: (range: Range, options: { readonly signal: AbortSignalLike }) => Promise<readonly T[]>;
  /** Widens each request by this fraction of its span on both sides (default 0.5), so small pans hit the cache. */
  readonly overscan?: number | undefined;
  /** Cached ranges (default 8). */
  readonly cacheSize?: number | undefined;
  /** Rows before the first load. */
  readonly initialRows?: readonly T[] | undefined;
}

export interface RangeSource<T> {
  getSnapshot(): RangeSourceSnapshot<T>;
  subscribe(listener: () => void): () => void;
  /** Shows `range`: served from a cached range that covers it, else loaded (the previous load is aborted). */
  request(range: Range): void;
  /** Drops the cache (for example after the data changed on the server). */
  invalidate(): void;
}

export function createRangeSource<T>(options: RangeSourceOptions<T>): RangeSource<T> {
  const overscan = options.overscan ?? 0.5;
  const cacheSize = Math.max(1, options.cacheSize ?? 8);
  let snapshot: RangeSourceSnapshot<T> = { rows: options.initialRows ?? [], range: null, loading: false, error: null };
  let cache: { range: Range; rows: readonly T[] }[] = [];
  let inflight: AbortControllerLike | null = null;
  const listeners = new Set<() => void>();
  const set = (patch: Partial<RangeSourceSnapshot<T>>) => {
    snapshot = { ...snapshot, ...patch };
    for (const l of [...listeners]) l();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    request(range) {
      const lo = Math.min(range[0], range[1]);
      const hi = Math.max(range[0], range[1]);
      const hit = cache.find((c) => c.range[0] <= lo && c.range[1] >= hi);
      if (hit) {
        inflight?.abort();
        inflight = null;
        cache = [hit, ...cache.filter((c) => c !== hit)];
        if (snapshot.range !== hit.range || snapshot.loading) set({ rows: hit.rows, range: hit.range, loading: false, error: null });
        return;
      }
      const pad = (hi - lo) * overscan;
      const wide: Range = [lo - pad, hi + pad];
      inflight?.abort();
      const controller = createAbortController();
      inflight = controller;
      set({ loading: true, error: null });
      options.load(wide, { signal: controller.signal }).then(
        (rows) => {
          if (controller.signal.aborted) return;
          inflight = null;
          cache = [{ range: wide, rows }, ...cache].slice(0, cacheSize);
          set({ rows, range: wide, loading: false });
        },
        (error: unknown) => {
          if (controller.signal.aborted) return;
          inflight = null;
          set({ loading: false, error });
        },
      );
    },
    invalidate() {
      cache = [];
    },
  };
}
