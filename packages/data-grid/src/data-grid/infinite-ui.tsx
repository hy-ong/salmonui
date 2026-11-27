'use client';

// Infinite scroll host of the `infiniteScroll` render feature
// (features/feature-infinite-scroll.ts): the `infiniteScroll`
// prop helpers, a stand-in for the core `infiniteScroll` module, the
// viewport wiring and the loading row. A grid without `infiniteScroll`
// never loads it. The core module
// (`@salmonui/data-grid/engine/infinite`: block store, request scheduling,
// eviction, write echoes) is the lazy `infinite-chunk.ts`, loaded when a
// grid with `infiniteScroll` is created on the client and installed in mount;
// nothing of it is in the initial JS.
//
// At rest the stand-in serves the main read (the engine shows no source
// rows), holds the query and the last reported range, and renders the
// seeded `initialResult` rows followed by loading rows, or one loading row.
// The server render and the first client render always use the stand-in,
// so hydration never depends on whether the chunk is cached. Once
// installed, every hook (read, stage, commands, methods, source events) is
// forwarded to the real module, which seeds its store from the same
// `initialResult` and continues from the held query. The chunk is requested
// in mount (the server never loads it).
//
// The viewport reports the rendered rows only when the layout's row window
// changes (the layout emits on window changes, never per scroll frame); the
// report is a few map lookups when the rows are loaded or in flight.

import { memo, type ReactNode } from 'react';
import type {
  DataGridModule,
  DataGridOptions,
  DataQuery,
  ModuleContext,
  PipelineStage,
  RowId,
  RowKind,
  RowModelSnapshot,
  RowModelView,
  ViewRowInfo,
} from '@salmonui/data-grid/engine';
import type { InfiniteScrollState } from '@salmonui/data-grid/engine/infinite';
import type { DataGridInfiniteScroll, DataGridLoadingRowContext } from './infinite-types.js';
import type { DataGridInstance } from './instance.js';
import { useDataGridInstance, useDataGridRender, useEngineSelector } from './context.js';
import { errorMessage } from './view-events.js';

type InfiniteChunk = typeof import('./infinite-chunk.js');

let chunkLoad: Promise<InfiniteChunk> | null = null;
let loadedChunk: InfiniteChunk | null = null;

/** Starts (once) and returns the infinite scroll chunk load (a load cache, not render state). */
function loadInfiniteChunk(): Promise<InfiniteChunk> {
  return (chunkLoad ??= import('./infinite-chunk.js').then((chunk) => (loadedChunk = chunk)));
}

/** Same values as `INFINITE_LOADING_ID_PREFIX` and `INFINITE_SCROLL_COMMANDS` of `@salmonui/data-grid/engine/infinite`. */
const LOADING = '__loading:';
const COMMANDS = ['infiniteScroll.loaded', 'infiniteScroll.loadNext', 'infiniteScroll.retry', 'infiniteScroll.reload'] as const;

/** `infiniteScroll` prop as settings (`true`: defaults; `false` and absent: null). */
export function infiniteOf<Row>(props: { readonly infiniteScroll?: boolean | DataGridInfiniteScroll<Row> | undefined }): DataGridInfiniteScroll<Row> | null {
  const v = props.infiniteScroll;
  if (!v) return null;
  return v === true ? {} : v;
}

/** The stand-in's view: the seeded rows, then loading rows (the total) or one loading row (more may follow). */
class AtRestView implements RowModelView {
  readonly kind = 'infinite' as const;
  readonly count: number;
  readonly dataCount: number;
  private readonly rows: readonly unknown[];
  private readonly ids: readonly RowId[];

  /** `initialEnd`: rows of the initial blocks; a shorter seed without a total ends the data (as the core store places it). */
  constructor(rows: readonly unknown[], getRowId: (row: never, index: number) => RowId, total: number | undefined, hasNext: boolean | undefined, initialEnd: number) {
    this.rows = rows;
    this.ids = rows.map((row, i) => String(getRowId(row as never, i)));
    const ended = hasNext === false || (hasNext === undefined && rows.length > 0 && rows.length < initialEnd);
    this.count = total ?? rows.length + (ended ? 0 : 1);
    this.dataCount = this.count;
  }

  kindAt(index: number): RowKind {
    return index < this.rows.length ? 'data' : 'loading';
  }

  sourceIndexAt(): number {
    return -1;
  }

  idAt(index: number): RowId | undefined {
    return index < 0 || index >= this.count ? undefined : (this.ids[index] ?? LOADING + index);
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
    const at = this.ids.indexOf(id);
    if (at >= 0) return { index: at, kind: 'data', depth: 0, parentId: null, row: this.rows[at] };
    const n = id.startsWith(LOADING) ? Number(id.slice(LOADING.length)) : -1;
    return Number.isInteger(n) && n >= this.rows.length && n < this.count ? { index: n, kind: 'loading', depth: 0, parentId: null, row: null } : undefined;
  }
}

// Erased shapes: the stand-in forwards whatever the real module takes.
type AnyModule = DataGridModule<unknown, unknown, never>;
type Method = (ctx: ModuleContext<unknown>, ...args: unknown[]) => unknown;

const AT_REST_STATE: InfiniteScrollState = { active: true, version: 0, generation: 0, status: 'loading', error: null, totalRowCount: null, loadedRowCount: 0, hasMore: true };

export interface DataGridInfiniteUi<Row> {
  /** The stand-in to register (null without `infiniteScroll`). */
  readonly module: DataGridModule<Row> | null;
  /** Client-only: installs the real module and reports the rendered rows on every row window change. */
  mount(instance: DataGridInstance<Row>): () => void;
}

/**
 * The `infiniteScroll` module of one grid. Settings are read once, at
 * instance creation (data sources and their paging are initial-only too);
 * `infiniteScroll.reload` re-reads from the start.
 */
export function createInfiniteUi<Row>(props: { readonly infiniteScroll?: boolean | DataGridInfiniteScroll<Row> | undefined }): DataGridInfiniteUi<Row> {
  const options = infiniteOf(props);
  if (!options) return { module: null, mount: () => () => {} };
  let real: AnyModule | null = null;
  let realState: unknown;
  let engineOptions: DataGridOptions<unknown> | null = null;
  let context: ModuleContext<unknown> | null = null;
  let heldQuery: DataQuery | null = null;
  let active = false;
  let view: AtRestView | null = null;

  /** The engine holds the stand-in's state until the real module's first state replaces it. */
  const own = (state: unknown): unknown => (state === AT_REST_STATE && real ? realState : state);
  const realStage = (): PipelineStage<unknown, unknown> | undefined => real?.pipeline?.[0];

  const methods: Record<string, Method> = {};
  // At rest `getStatus` is the at-rest state and the others return undefined; reports wait for the module (mount re-reports after installing it).
  for (const name of ['getStatus', 'getStats', 'ensureRange', 'isRowLoaded']) {
    methods[name] = (ctx, ...args) => (real ? (real.methods as unknown as Record<string, Method>)[name]?.(ctx, ...args) : name === 'getStatus' ? AT_REST_STATE : undefined);
  }
  const standIn = {
    name: 'infiniteScroll',
    commands: COMMANDS,
    methods,
    initialState: (o: DataGridOptions<unknown>) => {
      engineOptions = o;
      const seed = options.initialResult;
      view = new AtRestView(seed?.rows ?? [], o.getRowId as (row: never, index: number) => RowId, seed?.totalRowCount, seed?.hasNextPage, (options.initialBlocks ?? 3) * (options.blockSize ?? 100));
      return AT_REST_STATE;
    },
    reduce: (state: unknown, command: never, ctx: ModuleContext<unknown>) => (real ? (real.reduce?.(own(state), command, ctx) ?? state) : ctx.reject('moduleLoading')),
    interceptRead: (query: DataQuery, state: unknown, ctx: ModuleContext<unknown>) => {
      context = ctx;
      if (real) return real.interceptRead?.(query, own(state) as never, ctx) ?? false;
      active = query.grouping.length === 0;
      heldQuery = active ? query : null;
      return active;
    },
    onQueryChange: (previous: DataQuery, next: DataQuery, ctx: ModuleContext<unknown>) => {
      if (real) real.onQueryChange?.(previous, next, ctx);
      else if (next.grouping.length > 0) active = false;
    },
    onSourceEvent: (event: never, state: unknown, ctx: ModuleContext<unknown>) => (real ? (real.onSourceEvent?.(event, own(state) as never, ctx) ?? false) : active),
    pipeline: [
      {
        name: 'infinite',
        key: (query: DataQuery, state: unknown) => realStage()?.key(query, own(state)).concat('real') ?? [state, active, query.grouping.length],
        run: (input: RowModelSnapshot<unknown>, ctx: { readonly query: DataQuery; readonly state: unknown }) => {
          const stage = realStage();
          if (stage) return stage.run(input, { ...ctx, state: own(ctx.state) } as never);
          return !active || ctx.query.grouping.length > 0 || !view ? input : Object.freeze({ ...input, count: view.count, view });
        },
      },
    ],
    dispose: () => real?.dispose?.(),
  };

  /** Installs the real module: it seeds from the same options and continues from the held query. */
  const install = (chunk: InfiniteChunk): void => {
    if (real || !engineOptions) return;
    real = chunk.createModule(options as DataGridInfiniteScroll<unknown>) as unknown as AnyModule;
    realState = real.initialState(engineOptions);
    if (context && heldQuery) real.interceptRead?.(heldQuery, realState as never, context);
  };

  return {
    module: standIn as unknown as DataGridModule<Row>,
    mount(instance) {
      let live = true;
      const facade = (instance.engine as unknown as { infiniteScroll: { ensureRange(start: number, end: number): void; getStatus(): InfiniteScrollState } }).infiniteScroll;
      const layout = instance.layout;
      let start = -1;
      let end = -1;
      let generation = 0;
      const report = (): void => {
        if (!live || !layout.measured || !real) return;
        groups?.();
        const g = facade.getStatus().generation;
        if (g !== generation) {
          // A new query dropped the blocks: back to the top on sort, filter and search.
          generation = g;
          const viewport = instance.getViewport();
          if (viewport && viewport.scrollTop !== 0) viewport.scrollTop = 0;
        }
        const rows = layout.getRanges().rows;
        if (rows.overscanStart === start && rows.overscanEnd === end) return;
        start = rows.overscanStart;
        end = rows.overscanEnd;
        facade.ensureRange(start, end);
      };
      // With lazy grouping the module yields: scrolling appends group children instead.
      let groups: (() => void) | undefined;
      const ready = (chunk: InfiniteChunk): void => {
        if (!live) return;
        install(chunk);
        start = -1;
        groups = chunk.watchLazyGroups(instance as DataGridInstance<unknown>, options);
        report();
      };
      const off = layout.subscribe(report);
      if (loadedChunk) ready(loadedChunk);
      else void loadInfiniteChunk().then(ready, () => undefined);
      return () => {
        live = false;
        off();
      };
    },
  };
}

export interface DataGridLoadingRowProps {
  readonly rowId: RowId;
  readonly rowIndex: number;
}

/** Placeholder row of a row that is not loaded yet: `renderLoadingRow`, or the loading text; a Retry button after a failed load. */
function DataGridLoadingRowImpl({ rowId, rowIndex }: DataGridLoadingRowProps) {
  const instance = useDataGridInstance<unknown>();
  const render = useDataGridRender<unknown>();
  const columnCount = useEngineSelector(instance, (s) => s.columns.visible.length);
  const status = useEngineSelector(instance, (s) => (s.rows.view as { statusAt?(index: number): 'loading' | 'error' } | undefined)?.statusAt?.(rowIndex) ?? 'loading');
  // A failed load sets the status and the error in one snapshot.
  const error = status === 'error' ? (instance.engine.getSnapshot().modules['infiniteScroll'] as InfiniteScrollState | undefined)?.error : null;
  const retry = (event?: { preventDefault(): void }): void => {
    // Not a row click (selection, focus).
    event?.preventDefault();
    instance.engine.dispatch({ type: 'infiniteScroll.retry' });
  };
  const ctx: DataGridLoadingRowContext = { rowIndex, status, error, retry };
  const renderLoadingRow = (instance.props as { renderLoadingRow?: (ctx: DataGridLoadingRowContext) => ReactNode }).renderLoadingRow;
  // Skeleton rows (`virtualization.skeletonRows`): one shimmer bar per visible column (at most 8), the loading text for assistive technology.
  const v = instance.props.virtualization;
  const skeleton = !renderLoadingRow && status === 'loading' && !(typeof v === 'object' && v.skeletonRows === false);
  const content: ReactNode = renderLoadingRow ? (
    renderLoadingRow(ctx)
  ) : skeleton ? (
    <>
      {Array.from({ length: Math.min(8, Math.max(1, columnCount)) }, (_, i) => (
        <span key={i} className="salmon-data-grid-skeleton-bar" aria-hidden="true" />
      ))}
      <span className="salmon-data-grid-visually-hidden">{render.text('loading')}</span>
    </>
  ) : status === 'error' ? (
    <>
      {errorMessage(error)}
      <button type="button" className="salmon-data-grid-button" onClick={retry}>
        {render.text('retry')}
      </button>
    </>
  ) : (
    render.text('loading')
  );
  return (
    <div
      role="row"
      aria-rowindex={render.headerRows + rowIndex + 1}
      aria-busy={status === 'loading' ? true : undefined}
      className={skeleton ? 'salmon-data-grid-row salmon-data-grid-loading-row salmon-data-grid-skeleton-row' : 'salmon-data-grid-row salmon-data-grid-loading-row'}
      data-row-id={rowId}
      data-row-index={rowIndex}
      data-status={status}
    >
      <div role="gridcell" aria-colindex={1} aria-colspan={Math.max(1, columnCount)} className="salmon-data-grid-loading-row__cell">
        {content}
      </div>
    </div>
  );
}

export const DataGridLoadingRow = memo(DataGridLoadingRowImpl);
