// Infinite scroll driver: turns the
// viewport rows the renderer reports into range reads of the data source.
//
// - At most one read is in flight (sources supersede reads on one channel).
//   A read whose blocks left the wanted window is aborted (stale).
// - The wanted window is the reported rows plus `threshold` rows on each
//   side; with an unknown total it reaches at most one block past the
//   loaded end (the loading row).
// - Growing at the edge of the loaded rows (sequential scrolling) issues at
//   once, then at most one read per `debounceMs`. A jump (scrollbar drag,
//   `scrollTo`) waits until the viewport has been still for `debounceMs`, so
//   dragging across a million rows costs one read.
// - Reporting a range whose blocks are loaded (cache hit) or in flight costs
//   a few map lookups and issues nothing; the renderer reports only when its
//   row window changes, never per scroll frame.
// - With `cache`, blocks beyond `maxBlocks` are evicted farthest from the
//   viewport first; blocks in the wanted window, in flight, or holding the
//   focused or edited row are kept.
// - Write echoes (source `patch` events) replace loaded rows in place; a
//   structural write (added, removed, reset) re-requests the visible blocks
//   and keeps rendering them until the reload lands. The reload reads whole
//   blocks (a row added at the bottom lies past the old total) and a result
//   that ends the data sets the end exactly; an end found by reading (no
//   `totalRowCount`) is forgotten so rows appended after it are found.

import { createAbortController, isPromiseLike, type AbortControllerLike } from './abort.js';
import {
  createInfiniteScrollShell,
  type InfiniteBlock,
  type InfiniteDriver,
  type InfiniteHost,
  type InfiniteScheduler,
  type InfiniteScrollModule,
  type InfiniteScrollOptions,
} from './infinite-state.js';
import type { DataSourceEvent, DataSourceRequest, DataSourceResult, DataSource, DataQuery, RowId } from './types.js';

export {
  INFINITE_LOADING_ID_PREFIX,
  INFINITE_SCROLL_COMMANDS,
  InfiniteStore,
  InfiniteView,
  loadingRowIndex,
  resolveInfiniteOptions,
} from './infinite-state.js';
export { lazyGroupsToAppend } from './lazy-group-scroll.js';
export type {
  InfiniteBlock,
  InfiniteScheduler,
  InfiniteScrollCommand,
  InfiniteScrollFacade,
  InfiniteScrollLoadedCommand,
  InfiniteScrollLoadNextCommand,
  InfiniteScrollMethods,
  InfiniteScrollModule,
  InfiniteScrollOptions,
  InfiniteScrollPublicCommand,
  InfiniteScrollReloadCommand,
  InfiniteScrollRetryCommand,
  InfiniteScrollState,
  InfiniteScrollStats,
  InfiniteStatus,
  ResolvedInfiniteOptions,
} from './infinite-state.js';

interface InFlight {
  readonly controller: AbortControllerLike;
  readonly first: number;
  readonly last: number;
  /** Re-read after a structural write (`refresh`): full blocks, exact end. */
  readonly reload: boolean;
}

function defaultScheduler(): InfiniteScheduler {
  // Timers exist in every supported runtime (browsers, Node, workers); no DOM global is used.
  const g = globalThis as unknown as { setTimeout(run: () => void, ms: number): unknown; clearTimeout(h: unknown): void };
  return { now: () => Date.now(), setTimeout: (run, ms) => g.setTimeout(run, ms), clearTimeout: (h) => g.clearTimeout(h) };
}

/** The driver of the `infiniteScroll` module shell. */
function createInfiniteDriver<Row>(host: InfiniteHost<Row>): InfiniteDriver<Row> {
  const { store } = host;
  const o = store.options;
  const B = o.blockSize;
  const clock = host.options.scheduler ?? defaultScheduler();
  let query: DataQuery | null = null;
  let source: DataSource<Row> | null = null;
  /** Reported viewport rows; null until the renderer reports (the initial blocks are wanted then). */
  let wanted: [number, number] | null = null;
  let inflight: InFlight | null = null;
  let timer: unknown = null;
  let timerJump = false;
  let lastIssue = Number.NEGATIVE_INFINITY;
  let requestVersion = 0;
  /** `loadNext` asked for rows past the loaded end. */
  let extraEnd = 0;
  /** The next read re-requests blocks after a structural write (the loaded total may be stale). */
  let reloading = false;
  let disposed = false;
  let started = false;

  const has = (b: number): boolean => {
    const block = store.blocks.get(b);
    return block !== undefined && !block.stale;
  };

  /** Wanted rows `[lo, hi)`. */
  const windowOf = (): [number, number] => {
    let lo: number;
    let hi: number;
    if (wanted === null) {
      lo = 0;
      hi = o.initialBlocks * B;
    } else {
      lo = Math.max(0, wanted[0] - o.threshold);
      hi = wanted[1] + o.threshold;
    }
    hi = Math.max(hi, extraEnd);
    // Unknown total: at most one block past the loaded end (the initial blocks before the first result).
    const limit = store.total ?? (store.hasMore ? Math.max(store.highest + B, extraEnd, wanted === null ? o.initialBlocks * B : 0) : store.highest);
    return [Math.min(lo, limit), Math.min(hi, limit)];
  };

  /** First run of contiguous missing blocks in the window (the one under the viewport first). */
  const missingRun = (lo: number, hi: number): [number, number] | null => {
    if (hi <= lo) return null;
    const from = Math.floor(lo / B);
    const to = Math.ceil(hi / B) - 1;
    const focusBlock = wanted === null ? from : Math.floor(wanted[0] / B);
    let best: [number, number] | null = null;
    let b = from;
    while (b <= to) {
      if (has(b) || store.pending.has(b)) {
        b++;
        continue;
      }
      const first = b;
      while (b + 1 <= to && !has(b + 1) && !store.pending.has(b + 1)) b++;
      const run: [number, number] = [first, b];
      if (first <= focusBlock && focusBlock <= b) return run;
      if (best === null || Math.abs(first - focusBlock) < Math.abs(best[0] - focusBlock)) best = run;
      b++;
    }
    return best;
  };

  const clearTimer = (): void => {
    if (timer === null) return;
    clock.clearTimeout(timer);
    timer = null;
  };

  /** Ends the flight: its blocks are no longer pending. */
  const land = (): void => {
    const flight = inflight as InFlight;
    inflight = null;
    const next = new Set(store.pending);
    for (let b = flight.first; b <= flight.last; b++) next.delete(b);
    store.pending = next;
  };

  const abortInflight = (): void => {
    if (!inflight) return;
    inflight.controller.abort();
    land();
    store.stats.aborted++;
  };

  const pump = (now: boolean): void => {
    if (disposed || !query || !source || !store.active || store.status === 'error') return;
    const [lo, hi] = windowOf();
    if (inflight) {
      // Stale: the viewport left the blocks in flight.
      if ((inflight.last + 1) * B <= lo || inflight.first * B >= hi) abortInflight();
      else return; // settles first, then pumps again
    }
    const run = missingRun(lo, hi);
    if (!run) return;
    if (timer !== null) return;
    const adjacent = (run[0] === 0 && store.blocks.size === 0) || has(run[0] - 1) || has(run[1] + 1) || run[0] * B === store.highest;
    const elapsed = clock.now() - lastIssue;
    if (now || (adjacent && elapsed >= o.debounceMs)) {
      issue(run);
      return;
    }
    timerJump = !adjacent;
    timer = clock.setTimeout(() => {
      timer = null;
      pump(true);
    }, adjacent ? Math.max(0, o.debounceMs - elapsed) : o.debounceMs);
  };

  const issue = ([first, last]: [number, number]): void => {
    const q = query as DataQuery;
    const src = source as DataSource<Row>;
    const controller = createAbortController();
    const start = first * B;
    // After a structural write the total may have grown (a row added at the bottom): read whole blocks.
    const reload = reloading;
    reloading = false;
    const end = store.total === null || reload ? (last + 1) * B : Math.min((last + 1) * B, store.total);
    const next = new Set(store.pending);
    for (let b = first; b <= last; b++) next.add(b);
    store.pending = next;
    inflight = { controller, first, last, reload };
    lastIssue = clock.now();
    store.stats.requests++;
    const request: DataSourceRequest = Object.freeze({ version: ++requestVersion, query: q, range: Object.freeze({ start, end }), signal: controller.signal });
    if (store.status !== 'ready' || store.loadedRows === 0) {
      store.status = 'loading';
      host.changed();
    }
    let result: DataSourceResult<Row> | Promise<DataSourceResult<Row>>;
    try {
      result = src.read(request);
    } catch (error) {
      fail(controller, error);
      return;
    }
    if (!isPromiseLike<DataSourceResult<Row>>(result)) {
      settle(controller, request, result);
      return;
    }
    Promise.resolve(result).then(
      (value) => settle(controller, request, value),
      (error: unknown) => fail(controller, error),
    );
  };

  const current = (controller: AbortControllerLike): boolean => !disposed && inflight !== null && inflight.controller === controller && !controller.signal.aborted;

  const settle = (controller: AbortControllerLike, request: DataSourceRequest, result: DataSourceResult<Row>): void => {
    if (!current(controller)) return;
    const reload = (inflight as InFlight).reload;
    land();
    const range = request.range as { start: number; end: number };
    // Block sources (`capabilities.infinite`) answer with their contiguous loaded run, starting at `rowOffset` (default 0).
    const offset = result.rowOffset ?? (source?.capabilities?.infinite ? 0 : range.start);
    store.place(offset, result.rows as readonly Row[], host.getRowId, {
      requestedEnd: range.end,
      totalRowCount: result.totalRowCount,
      hasNextPage: result.pageInfo?.hasNextPage,
      exactEnd: reload,
    });
    store.status = 'ready';
    store.error = null;
    if (store.total !== null || store.highest >= extraEnd) extraEnd = Math.min(extraEnd, store.highest);
    evict();
    host.changed();
    pump(false);
  };

  const fail = (controller: AbortControllerLike, error: unknown): void => {
    if (!current(controller)) return;
    if ((error as { name?: unknown } | null)?.name === 'AbortError') return;
    land();
    store.status = 'error';
    store.error = error;
    host.changed();
  };

  /** Blocks that must stay: in the window, in flight, the focused row's and the edited row's. */
  const protectedBlocks = (): Set<number> => {
    const keep = new Set<number>(store.pending);
    const [lo, hi] = windowOf();
    for (let b = Math.floor(lo / B); b * B < hi; b++) keep.add(b);
    const c = host.ctx();
    if (c) {
      const focus = c.getModuleState<{ readonly target: { readonly rowId?: RowId } | null }>('focus')?.target?.rowId;
      const edit = c.getModuleState<{ readonly active: { readonly rowId: RowId } | null }>('edit')?.active?.rowId;
      for (const id of [focus, edit]) {
        const at = id === undefined ? undefined : store.index.get(id);
        if (at !== undefined) keep.add(Math.floor(at / B));
      }
    }
    return keep;
  };

  const evict = (): void => {
    if (!o.cache) return;
    const keep = protectedBlocks();
    const max = Math.max(o.maxBlocks, keep.size);
    if (store.blocks.size <= max) return;
    const center = wanted === null ? 0 : Math.floor((wanted[0] + wanted[1]) / 2 / B);
    const candidates = [...store.blocks.keys()].filter((b) => !keep.has(b)).sort((a, b) => Math.abs(b - center) - Math.abs(a - center));
    const next = new Map(store.blocks);
    for (const b of candidates) {
      if (next.size <= max) break;
      store.drop(next, b);
      store.stats.evicted++;
    }
    store.setBlocks(next);
  };

  /** Structural write: re-request the visible blocks (kept on screen until they land), drop the rest. */
  const refresh = (): void => {
    abortInflight();
    clearTimer();
    if (store.status === 'error') {
      store.status = 'ready';
      store.error = null;
    }
    // An end found by reading (unknown total) may have moved: rows added at the bottom follow it.
    if (store.total !== null && !store.totalKnown) {
      store.total = null;
      store.hasMore = true;
    }
    reloading = true;
    const [lo, hi] = windowOf();
    const next = new Map<number, InfiniteBlock<Row>>(store.blocks);
    for (const [b, block] of store.blocks) {
      if ((b + 1) * B > lo && b * B < hi) next.set(b, Object.freeze({ ...block, stale: true }));
      else store.drop(next, b);
    }
    store.setBlocks(next);
    host.changed();
    pump(true);
  };

  return {
    reset(q, c) {
      abortInflight();
      clearTimer();
      if (store.seeded) store.seeded = false;
      else {
        store.clear();
        // The first query keeps generation 0: a renderer scrolls back to the top on later ones.
        if (started) store.generation++;
      }
      started = true;
      query = q;
      source = c.getDataSource();
      wanted = null;
      extraEnd = 0;
      reloading = false;
      lastIssue = Number.NEGATIVE_INFINITY;
      host.changed();
      pump(true);
    },
    ensure(start, end) {
      const changed = wanted === null || wanted[0] !== start || wanted[1] !== end;
      wanted = [Math.max(0, start), Math.max(start, end)];
      if (!changed && (inflight || timer !== null)) return;
      if (timer !== null && timerJump) clearTimer(); // a jump waits for the viewport to settle
      pump(false);
    },
    loadNext() {
      extraEnd = Math.max(extraEnd, store.highest + B);
      if (store.total !== null) extraEnd = Math.min(extraEnd, store.total);
      clearTimer();
      pump(true);
    },
    retry() {
      store.status = store.loadedRows > 0 ? 'ready' : 'loading';
      store.error = null;
      host.changed();
      pump(true);
    },
    sourceEvent(event: DataSourceEvent<Row>) {
      if (event.type === 'patch' && event.added.length === 0 && event.removed.length === 0) {
        const updated = new Set(event.updated);
        if (updated.size === 0) return;
        const next = new Map(store.blocks);
        let touched = false;
        for (let i = 0; i < event.rows.length; i++) {
          const row = event.rows[i] as Row;
          let id = host.getRowId(row, i);
          if (typeof id !== 'string') id = String(id);
          if (!updated.has(id)) continue;
          const at = store.index.get(id);
          if (at === undefined) continue;
          const b = Math.floor(at / B);
          const block = next.get(b);
          if (!block || block.ids[at % B] !== id) continue;
          const rows = block.rows.slice();
          rows[at % B] = row;
          next.set(b, Object.freeze({ ...block, rows }));
          touched = true;
        }
        if (!touched) return;
        store.setBlocks(next);
        host.changed();
        return;
      }
      refresh();
    },
    refresh,
    deactivate() {
      abortInflight();
      clearTimer();
      query = null;
    },
    dispose() {
      disposed = true;
      abortInflight();
      clearTimer();
    },
  };
}

/**
 * Infinite scroll for remote sources: the grid requests row ranges
 * (`DataSourceRequest.range`) as the viewport approaches rows that are not
 * loaded; see the module header for the scheduling rules.
 */
export function createInfiniteScrollModule<Row>(options: InfiniteScrollOptions<Row> = {}): InfiniteScrollModule<Row> {
  return createInfiniteScrollShell<Row>(options, createInfiniteDriver);
}
