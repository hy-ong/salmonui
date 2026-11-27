// Infinite scroll, part of the `./infinite` subpath: options, the
// block store, the row-model view over it, and the `infiniteScroll` module
// shell. The shell serves the main read of a remote source
// (`interceptRead`), owns the `infinite` pipeline stage and the module
// slice, and renders what the store holds. The request scheduling,
// eviction and write echo handling are the driver (`infinite.ts`).

import type { ModuleFacade } from './engine.js';
import type {
  DataSourceEvent,
  DataSourceResult,
  DataGridModule,
  DataGridOptions,
  DataQuery,
  ModuleContext,
  RowId,
  RowKind,
  RowModelSnapshot,
  RowModelView,
  ViewRowInfo,
} from './types.js';

/** Id prefix of placeholder rows (`kind: 'loading'`): `__loading:<rowIndex>`. */
export const INFINITE_LOADING_ID_PREFIX = '__loading:';

/** Command types of the `infiniteScroll` module (a renderer that installs the driver lazily declares them up front). */
export const INFINITE_SCROLL_COMMANDS = Object.freeze([
  'infiniteScroll.loaded',
  'infiniteScroll.loadNext',
  'infiniteScroll.retry',
  'infiniteScroll.reload',
] as const);

/** A block load settled (dispatched by the module; part of the public command union). */
export type InfiniteScrollLoadedCommand = { type: 'infiniteScroll.loaded'; version: number };
/** load the block after the last loaded row (no-op when every row is loaded). */
export type InfiniteScrollLoadNextCommand = { type: 'infiniteScroll.loadNext' };
/** Retry after a failed block load. */
export type InfiniteScrollRetryCommand = { type: 'infiniteScroll.retry' };
/** Drop every block and load the initial blocks again (after changing settings). */
export type InfiniteScrollReloadCommand = { type: 'infiniteScroll.reload' };
export type InfiniteScrollCommand = InfiniteScrollLoadedCommand | InfiniteScrollLoadNextCommand | InfiniteScrollRetryCommand | InfiniteScrollReloadCommand;

export interface InfiniteScrollOptions<Row = unknown> {
  /** Rows per block and per request unit. Default 100. */
  readonly blockSize?: number;
  /** Blocks of the first request. Default 3. */
  readonly initialBlocks?: number;
  /** Bound the blocks held in memory to `maxBlocks`. Default false: every loaded block is kept. */
  readonly cache?: boolean;
  /** Blocks kept with `cache`; never fewer than the viewport needs. Default 3. */
  readonly maxBlocks?: number;
  /** Rows before the loaded end (and around the viewport) at which the next block is requested. Default half a block. */
  readonly threshold?: number;
  /** Quiet time before a request for a jump target (scrollbar drag, scrollTo) and between sequential requests. Default 50 ms. */
  readonly debounceMs?: number;
  /**
   * The first blocks, already fetched (server render): rendered on
   * the server and on the first client render, and not requested again.
   * `rows` start at row 0.
   */
  readonly initialResult?: Pick<DataSourceResult<Row>, 'rows' | 'totalRowCount' | 'pageInfo'>;
  /** Clock and timers (tests). Default `Date.now`, `setTimeout`, `clearTimeout`. */
  readonly scheduler?: InfiniteScheduler;
}

export interface InfiniteScheduler {
  now(): number;
  setTimeout(run: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface ResolvedInfiniteOptions {
  readonly blockSize: number;
  readonly initialBlocks: number;
  readonly cache: boolean;
  readonly maxBlocks: number;
  readonly threshold: number;
  readonly debounceMs: number;
}

export function resolveInfiniteOptions(o: InfiniteScrollOptions<never> = {}): ResolvedInfiniteOptions {
  const int = (v: number | undefined, d: number, min: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.floor(v)) : d);
  const blockSize = int(o.blockSize, 100, 1);
  return Object.freeze({
    blockSize,
    initialBlocks: int(o.initialBlocks, 3, 1),
    cache: o.cache === true,
    maxBlocks: int(o.maxBlocks, 3, 1),
    threshold: int(o.threshold, Math.ceil(blockSize / 2), 0),
    debounceMs: int(o.debounceMs, 50, 0),
  });
}

export type InfiniteStatus = 'idle' | 'loading' | 'ready' | 'error';

/** The `infiniteScroll` module slice (`snapshot.modules.infiniteScroll`); replaced once per settled load. */
export interface InfiniteScrollState {
  /** The module serves the main read (remote source, no grouping). */
  readonly active: boolean;
  /** Bumped whenever the loaded blocks change. */
  readonly version: number;
  /** Bumped when the blocks are dropped for a new query (the renderer scrolls back to the top). */
  readonly generation: number;
  readonly status: InfiniteStatus;
  readonly error: unknown;
  /** Exact row count: the source total, or the loaded end once the last block arrived; null while unknown. */
  readonly totalRowCount: number | null;
  /** Rows held in memory. */
  readonly loadedRowCount: number;
  /** Unknown total only: more rows may follow the loaded end (a loading row is shown there). */
  readonly hasMore: boolean;
}

export interface InfiniteScrollStats {
  /** Range reads issued. */
  readonly requests: number;
  /** Reads aborted because the viewport moved away (stale) or the query changed. */
  readonly aborted: number;
  /** Blocks evicted beyond `maxBlocks`. */
  readonly evicted: number;
}

export interface InfiniteBlock<Row> {
  readonly rows: readonly Row[];
  readonly ids: readonly RowId[];
  /** Re-requested after a structural write; still rendered until the reload lands. */
  readonly stale: boolean;
}

/** Placement hints of one result. */
export interface PlaceInfo {
  /** End of the requested range (a shorter result ends the data). */
  readonly requestedEnd: number;
  readonly totalRowCount?: number | undefined;
  readonly hasNextPage?: boolean | undefined;
  /**
   * The read re-requested blocks after a structural write: a result that
   * ends the data sets the end exactly (rows past it were removed), instead
   * of never shrinking below the loaded end.
   */
  readonly exactEnd?: boolean | undefined;
}

/**
 * Loaded blocks of the current query. `blocks` and `pending` are replaced on
 * every change (a view keeps the maps it was built from); `index` maps the
 * ids of loaded rows to their row index and is checked against the blocks.
 */
export class InfiniteStore<Row> {
  readonly options: ResolvedInfiniteOptions;
  blocks: ReadonlyMap<number, InfiniteBlock<Row>> = new Map();
  pending: ReadonlySet<number> = new Set();
  readonly index = new Map<RowId, number>();
  total: number | null = null;
  /** `total` came from the source (`totalRowCount`), not from reaching the end of an unknown total. */
  totalKnown = false;
  hasMore = true;
  /** End of the highest loaded block. */
  highest = 0;
  active = false;
  /** Blocks came from `initialResult`; the first query keeps them. */
  seeded = false;
  status: InfiniteStatus = 'idle';
  error: unknown = null;
  version = 0;
  generation = 0;
  loadedRows = 0;
  stats = { requests: 0, aborted: 0, evicted: 0 };

  constructor(options: ResolvedInfiniteOptions) {
    this.options = options;
  }

  /** Rows of the view: the exact total, else the loaded end plus one loading row while more may follow. */
  count(): number {
    return this.total ?? this.highest + (this.hasMore ? 1 : 0);
  }

  clear(): void {
    this.blocks = new Map();
    this.pending = new Set();
    this.index.clear();
    this.total = null;
    this.totalKnown = false;
    this.hasMore = true;
    this.highest = 0;
    this.loadedRows = 0;
    this.status = 'idle';
    this.error = null;
  }

  /** Places result rows starting at row `offset`; complete blocks only (the last block of the data may be short). */
  place(offset: number, rows: readonly Row[], getRowId: (row: Row, index: number) => RowId, info: PlaceInfo): void {
    const B = this.options.blockSize;
    const n = rows.length;
    const end = offset + n;
    let reachedEnd = info.totalRowCount === undefined && (info.hasNextPage === false || end < info.requestedEnd);
    if (info.totalRowCount !== undefined) {
      this.total = Math.max(0, info.totalRowCount);
      this.totalKnown = true;
    }
    const next = new Map(this.blocks);
    for (let b = Math.ceil(offset / B); b * B < end; b++) {
      const start = b * B;
      const stop = Math.min(start + B, end);
      const short = stop - start < B;
      if (short && !(reachedEnd || (this.total !== null && stop >= this.total) || info.hasNextPage !== true)) break;
      // A short block ends the data (a source that returned fewer rows than a block).
      if (short) reachedEnd = this.total === null;
      const blockRows = rows.slice(start - offset, stop - offset);
      const ids: RowId[] = new Array<RowId>(blockRows.length);
      for (let k = 0; k < blockRows.length; k++) {
        const id = getRowId(blockRows[k] as Row, start + k);
        ids[k] = typeof id === 'string' ? id : String(id);
      }
      this.drop(next, b);
      for (let k = 0; k < ids.length; k++) this.index.set(ids[k] as RowId, start + k);
      next.set(b, Object.freeze({ rows: blockRows, ids, stale: false }));
      this.highest = Math.max(this.highest, stop);
      if (short) break;
    }
    if (reachedEnd) {
      if (info.exactEnd) {
        // Rows past the end were removed by the write: drop their blocks.
        for (const b of [...next.keys()]) if (b * B >= end) this.drop(next, b);
        this.highest = end;
      }
      this.total = Math.max(this.highest, end);
      this.hasMore = false;
    } else if (this.total === null) this.hasMore = true;
    if (this.total !== null && this.highest > this.total) this.highest = this.total;
    this.setBlocks(next);
  }

  /** Removes a block (eviction, refresh). */
  drop(next: Map<number, InfiniteBlock<Row>>, b: number): void {
    const block = next.get(b);
    if (!block) return;
    const start = b * this.options.blockSize;
    for (let k = 0; k < block.ids.length; k++) {
      const id = block.ids[k] as RowId;
      if (this.index.get(id) === start + k) this.index.delete(id);
    }
    next.delete(b);
  }

  setBlocks(next: ReadonlyMap<number, InfiniteBlock<Row>>): void {
    this.blocks = next;
    let n = 0;
    for (const block of next.values()) n += block.rows.length;
    this.loadedRows = n;
  }

  /** Loaded row at a row index, or undefined. */
  rowAt(index: number): Row | undefined {
    const B = this.options.blockSize;
    return this.blocks.get(Math.floor(index / B))?.rows[index % B];
  }
}

/** Row model view over the loaded blocks: loaded rows are `data`, the others `loading` placeholders. */
export class InfiniteView<Row = unknown> implements RowModelView {
  readonly kind = 'infinite' as const;
  readonly count: number;
  readonly dataCount: number;
  readonly status: InfiniteStatus;
  private readonly blocks: ReadonlyMap<number, InfiniteBlock<Row>>;
  private readonly pending: ReadonlySet<number>;
  private readonly store: InfiniteStore<Row>;
  private readonly B: number;

  constructor(store: InfiniteStore<Row>) {
    this.store = store;
    this.blocks = store.blocks;
    this.pending = store.pending;
    this.count = store.count();
    this.dataCount = this.count;
    this.status = store.status;
    this.B = store.options.blockSize;
  }

  private block(index: number): InfiniteBlock<Row> | undefined {
    return this.blocks.get(Math.floor(index / this.B));
  }

  /** The row at `index` is loaded. */
  isLoaded(index: number): boolean {
    return index >= 0 && index < this.count && (this.block(index)?.ids.length ?? 0) > index % this.B;
  }

  /** Placeholder state: `error` after a failed load of its block, else `loading`. */
  statusAt(index: number): 'loading' | 'error' {
    return this.status === 'error' && !this.pending.has(Math.floor(index / this.B)) ? 'error' : 'loading';
  }

  kindAt(index: number): RowKind {
    return this.isLoaded(index) ? 'data' : 'loading';
  }

  sourceIndexAt(): number {
    return -1;
  }

  idAt(index: number): RowId | undefined {
    if (index < 0 || index >= this.count) return undefined;
    return this.block(index)?.ids[index % this.B] ?? INFINITE_LOADING_ID_PREFIX + index;
  }

  depthAt(): number {
    return 0;
  }

  indexOfSource(): number {
    return -1;
  }

  parentOfSource(): RowId | null {
    return null;
  }

  resolve(id: RowId): ViewRowInfo | undefined {
    const at = loadingRowIndex(id);
    if (at >= 0) return at < this.count && !this.isLoaded(at) ? { index: at, kind: 'loading', depth: 0, parentId: null, row: null } : undefined;
    const index = this.store.index.get(id);
    if (index === undefined || index >= this.count || this.block(index)?.ids[index % this.B] !== id) return undefined;
    return { index, kind: 'data', depth: 0, parentId: null, row: this.block(index)?.rows[index % this.B] };
  }
}

/** Placeholder row index of a `__loading:<n>` id, or -1. */
export function loadingRowIndex(rowId: RowId): number {
  if (!rowId.startsWith(INFINITE_LOADING_ID_PREFIX)) return -1;
  const n = Number(rowId.slice(INFINITE_LOADING_ID_PREFIX.length));
  return Number.isInteger(n) && n >= 0 ? n : -1;
}

/** What the module shell hands its driver. */
export interface InfiniteHost<Row> {
  readonly store: InfiniteStore<Row>;
  readonly options: InfiniteScrollOptions<Row>;
  readonly getRowId: (row: Row, index: number) => RowId;
  /** The store changed: bumps the version and replaces the slice (one command per microtask). */
  changed(): void;
  /** Context of the engine the module is registered with (null before the first read). */
  ctx(): ModuleContext<Row> | null;
}

/** Request scheduling, eviction and write echoes (`createInfiniteDriver` in `./infinite`). */
export interface InfiniteDriver<Row> {
  /** Drops the blocks (except seeded ones on the first query) and loads the initial blocks of `query`. */
  reset(query: DataQuery, ctx: ModuleContext<Row>): void;
  /** Viewport rows `[start, end)`; loads what is missing around them (debounced, at most one read in flight). */
  ensure(start: number, end: number): void;
  loadNext(): void;
  retry(): void;
  sourceEvent(event: DataSourceEvent<Row>): void;
  /** Same query read again (`engine.reload()`, `engine.refresh()`): re-reads the visible blocks in place. */
  refresh(): void;
  /** Stops serving reads (grouping took over); aborts the read in flight. */
  deactivate(): void;
  dispose(): void;
}

export type InfiniteScrollMethods<Row> = {
  /** Load state, exact total (null while unknown) and loaded row count. */
  getStatus(ctx: ModuleContext<Row>): InfiniteScrollState;
  /** Request counters (performance gates, demos). */
  getStats(ctx: ModuleContext<Row>): InfiniteScrollStats;
  /**
   * Viewport sink: the renderer reports the rendered rows `[start, end)`
   * when its row window changes (never per scroll frame). Schedules loads;
   * does not change the slice until a load settles.
   */
  ensureRange(ctx: ModuleContext<Row>, start: number, end: number): void;
  isRowLoaded(ctx: ModuleContext<Row>, index: number): boolean;
};

export type InfiniteScrollModule<Row> = DataGridModule<Row, InfiniteScrollState, InfiniteScrollCommand, 'infiniteScroll', InfiniteScrollMethods<Row>>;

/**
 * `engine.infiniteScroll`: the generated façade of the
 * `infiniteScroll` module. Commands `loadNext()`, `retry()`, `reload()`
 * dispatch `infiniteScroll.loadNext` / `retry` / `reload`; methods
 * `getStatus()`, `getStats()`, `ensureRange(start, end)`,
 * `isRowLoaded(index)`. The internal `infiniteScroll.loaded` is left out.
 */
export type InfiniteScrollFacade<Row = unknown> = Omit<ModuleFacade<InfiniteScrollModule<Row>>['infiniteScroll'], 'loaded'>;

/** Public `infiniteScroll.*` commands (`engine.dispatch`); `infiniteScroll.loaded` is the module's own. */
export type InfiniteScrollPublicCommand = InfiniteScrollLoadNextCommand | InfiniteScrollRetryCommand | InfiniteScrollReloadCommand;


function stateOf<Row>(store: InfiniteStore<Row>): InfiniteScrollState {
  return Object.freeze({
    active: store.active,
    version: store.version,
    generation: store.generation,
    status: store.status,
    error: store.error,
    totalRowCount: store.total,
    loadedRowCount: store.loadedRows,
    hasMore: store.total === null && store.hasMore,
  });
}

/** The `infiniteScroll` module over a store and the driver `create` makes for it. */
export function createInfiniteScrollShell<Row>(options: InfiniteScrollOptions<Row>, create: (host: InfiniteHost<Row>) => InfiniteDriver<Row>): InfiniteScrollModule<Row> {
  const store = new InfiniteStore<Row>(resolveInfiniteOptions(options as InfiniteScrollOptions<never>));
  let context: ModuleContext<Row> | null = null;
  let getRowId: (row: Row, index: number) => RowId = () => '';
  let lastQuery: DataQuery | null = null;
  let queued = false;
  let disposed = false;

  const changed = (): void => {
    store.version++;
    if (queued || disposed) return;
    queued = true;
    void Promise.resolve().then(() => {
      queued = false;
      const ctx = context;
      if (!ctx || disposed) return;
      ctx.dispatch({ type: 'infiniteScroll.loaded', version: store.version });
      refocus(ctx);
    });
  };

  /** Keyboard focus moved onto a placeholder (ArrowDown past the loaded end, Ctrl+End): follow the row once it loads. */
  const refocus = (ctx: ModuleContext<Row>): void => {
    const target = ctx.getModuleState<{ readonly target: { kind: string; rowId?: RowId; columnId: string } | null }>('focus')?.target;
    if (!target || target.kind !== 'cell' || target.rowId === undefined) return;
    const index = loadingRowIndex(target.rowId);
    if (index < 0) return;
    const B = store.options.blockSize;
    const id = store.blocks.get(Math.floor(index / B))?.ids[index % B];
    if (id !== undefined) ctx.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: id, columnId: target.columnId } });
  };

  const driver = create({
    store,
    options,
    getRowId: (row, index) => getRowId(row, index),
    changed,
    ctx: () => context,
  });

  const module: InfiniteScrollModule<Row> = {
    name: 'infiniteScroll',
    commands: INFINITE_SCROLL_COMMANDS as unknown as readonly InfiniteScrollCommand['type'][],
    initialState(o: DataGridOptions<Row>) {
      getRowId = o.getRowId;
      const seed = options.initialResult;
      if (seed && store.version === 0) {
        store.place(0, seed.rows as readonly Row[], getRowId, {
          requestedEnd: store.options.initialBlocks * store.options.blockSize,
          totalRowCount: seed.totalRowCount,
          hasNextPage: seed.pageInfo?.hasNextPage,
        });
        store.status = 'ready';
        store.seeded = true;
      }
      return stateOf(store);
    },
    reduce(state, command, ctx) {
      context = ctx;
      switch (command.type) {
        case 'infiniteScroll.loaded':
          return state.version === store.version && state.status === store.status ? state : stateOf(store);
        case 'infiniteScroll.loadNext':
          if (!store.active) return ctx.reject('inactive');
          if (store.total !== null && store.highest >= store.total) return ctx.reject('noMoreRows');
          driver.loadNext();
          return state;
        case 'infiniteScroll.retry':
          if (store.status !== 'error') return ctx.reject('notFailed');
          driver.retry();
          return state;
        case 'infiniteScroll.reload':
          if (!store.active || !lastQuery) return ctx.reject('inactive');
          store.seeded = false;
          driver.reset(lastQuery, ctx);
          return state;
        default:
          return state;
      }
    },
    interceptRead(query, _state, ctx) {
      context = ctx;
      // Grouping yields to group loading (lazy groups load their children in chunks).
      if (query.grouping.length > 0) {
        if (store.active) {
          store.active = false;
          driver.deactivate();
          changed();
        }
        return false;
      }
      if (!store.active) {
        store.active = true;
        changed();
      }
      // The same query object again is a reload or refresh: keep the position and re-read in place.
      if (query === lastQuery && store.status !== 'idle') driver.refresh();
      else driver.reset(query, ctx);
      lastQuery = query;
      return true;
    },
    onQueryChange(_previous, next) {
      if (next.grouping.length > 0 && store.active) {
        store.active = false;
        driver.deactivate();
        changed();
      }
    },
    onSourceEvent(event) {
      if (!store.active) return false;
      driver.sourceEvent(event);
      return true;
    },
    pipeline: [
      {
        name: 'infinite',
        // `store.active` is read live: the first read is intercepted during engine construction, before the slice can change.
        key: (query, state) => [state.version, store.active, query.grouping.length],
        run(input: RowModelSnapshot<Row>, ctx) {
          if (!store.active || ctx.query.grouping.length > 0) return input;
          const view = new InfiniteView(store);
          return Object.freeze({ ...input, count: view.count, view });
        },
      },
    ],
    methods: {
      getStatus: () => stateOf(store),
      getStats: () => store.stats,
      ensureRange: (_ctx, start, end) => driver.ensure(start, end),
      isRowLoaded: (_ctx, index) => store.rowAt(index) !== undefined && index < store.count(),
    },
    dispose() {
      disposed = true;
      driver.dispose();
    },
  };
  return module;
}
