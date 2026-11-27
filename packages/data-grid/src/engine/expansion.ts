// Detail row module. Expansion state is keyed by row id and survives
// sorting, filtering, paging, grouping, and data patches. The
// `detailExpansion` stage wraps the model entering it in a `DetailView`
// that stores only the k detail positions. The slice is not part of the grid
// snapshot: async detail loads settle without replacing it; expansion
// changes replace it through the row model and the query.

import { createAbortController, isPromiseLike, type AbortControllerLike } from './abort.js';
import { DetailView, PlainView, type DetailResolver } from './detail-view.js';
import { detailRowId } from './view-helpers.js';
import { defineDataGridModule } from './engine.js';
import type { AbortSignalLike, DataGridModule, DataGridOptions, DataQuery, ModuleContext, RowId, RowModelSnapshot } from './types.js';

// The `./expansion` subpath also publishes the detail row-model view helpers
// and the sparse row metrics that detail rows need (not on the root entry).
export { DetailView, PlainView } from './detail-view.js';
export { baseView, dataIndexAt, dataRowCountOf, dataRowIdAt, DETAIL_ID_PREFIX, detailParentId, detailRowId, outerIndex } from './view-helpers.js';
export type { DetailResolver } from './detail-view.js';
export { createSparseRowMetrics } from './sparse-metrics.js';
export type { SparseRowMetrics, SparseRows } from './sparse-metrics.js';

export interface DetailLoadContext<Row> {
  readonly rowId: RowId;
  readonly row: Row;
  readonly signal: AbortSignalLike;
}

export interface DetailOptions<Row> {
  /** Enables detail rows. Default true when the module is registered. */
  readonly enabled?: boolean;
  /** Every data row starts expanded. Default false. */
  readonly defaultExpanded?: boolean;
  /** Initial per-row expansion overrides. */
  readonly expanded?: Readonly<Record<RowId, boolean>>;
  /** Rows without a detail (no expand toggle). Evaluated only for expanded rows. */
  readonly hasDetail?: (row: Row) => boolean;
  /** Async detail content (`detailDataBound`). Started on explicit expand and by `detail.load`. */
  readonly load?: (ctx: DetailLoadContext<Row>) => unknown;
  /** Estimated detail row height in px before measurement. Default 150. */
  readonly height?: number;
}

export interface DetailState {
  readonly enabled: boolean;
  readonly defaultExpanded: boolean;
  /** Row id -> expanded, overriding `defaultExpanded` (only values that differ from it). */
  readonly expanded: Readonly<Record<RowId, boolean>>;
  /** Bumped when an async load settles. */
  readonly loadVersion: number;
}

export interface DetailLoadSnapshot {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly data: unknown;
  readonly error: unknown;
}

export interface DetailInfo {
  readonly enabled: boolean;
  readonly defaultExpanded: boolean;
  readonly height: number;
}

export type DetailExpandCommand = { type: 'detail.expand'; rowId: RowId };
export type DetailCollapseCommand = { type: 'detail.collapse'; rowId: RowId };
export type DetailToggleCommand = { type: 'detail.toggle'; rowId: RowId; expanded?: boolean };
export type DetailExpandAllCommand = { type: 'detail.expandAll' };
export type DetailCollapseAllCommand = { type: 'detail.collapseAll' };
/** Controlled expansion: replaces the overrides (and optionally the default). */
export type DetailSetExpandedCommand = { type: 'detail.setExpanded'; expanded: { [rowId: string]: boolean }; defaultExpanded?: boolean };
/** Starts the async load of a visible row's detail when it is idle (renderers dispatch it when a detail row mounts). */
export type DetailLoadCommand = { type: 'detail.load'; rowId: RowId };
export type DetailRetryCommand = { type: 'detail.retry'; rowId: RowId };
export type DetailSetEnabledCommand = { type: 'detail.setEnabled'; enabled: boolean };
/** A detail load settled (dispatched by the engine; part of the public command union). */
export type DetailLoadedCommand = { type: 'detail.loaded'; rowId: RowId; version: number };
export type DetailCommand =
  | DetailExpandCommand
  | DetailCollapseCommand
  | DetailToggleCommand
  | DetailExpandAllCommand
  | DetailCollapseAllCommand
  | DetailSetExpandedCommand
  | DetailLoadCommand
  | DetailRetryCommand
  | DetailSetEnabledCommand
  | DetailLoadedCommand;

export type DetailMethods<Row> = {
  isExpanded(ctx: ModuleContext<Row>, rowId: RowId): boolean;
  /** Async load state of a row's detail; stable identity while unchanged. `idle` once the row object was replaced. */
  getLoad(ctx: ModuleContext<Row>, rowId: RowId): DetailLoadSnapshot;
  /** Ids expanded explicitly (expand-all mode: ids collapsed explicitly are excluded by `isExpanded`). */
  getExpandedIds(ctx: ModuleContext<Row>): readonly RowId[];
  getInfo(ctx: ModuleContext<Row>): DetailInfo;
};

export type DetailModule<Row> = DataGridModule<Row, DetailState, DetailCommand, 'detail', DetailMethods<Row>>;

/** Reserved `query.expansion.detail` key carrying `defaultExpanded: true`. */
export const DETAIL_DEFAULT_KEY = '*';

const EMPTY_RECORD: Readonly<Record<string, boolean>> = Object.freeze({});
const EMPTY_IDS: readonly RowId[] = Object.freeze([]);
const IDLE: DetailLoadSnapshot = Object.freeze({ status: 'idle', data: undefined, error: undefined });
const DEFAULT_HEIGHT = 150;

/** Row object of a visible row (source rows and view-owned rows). */
export function visibleRowOf<Row>(ctx: ModuleContext<Row>, rowId: RowId): Row | undefined {
  const index = ctx.getRowIndex(rowId);
  if (index < 0) return undefined;
  const model = ctx.getRows();
  const view = model.view;
  if (view) {
    const s = view.sourceIndexAt(index);
    if (s >= 0) return model.source[s];
    const info = view.resolve(rowId);
    return info && info.kind === 'data' ? (info.row as Row) : undefined;
  }
  const s = model.order === null ? index : (model.order[index] as number);
  return model.source[s];
}

function validId(id: unknown): id is RowId {
  return typeof id === 'string' && id !== '';
}

function withOverride(state: DetailState, rowId: RowId, expanded: boolean): DetailState {
  const current = state.expanded[rowId] ?? state.defaultExpanded;
  if (current === expanded) return state;
  const next = { ...state.expanded };
  if (expanded === state.defaultExpanded) delete next[rowId];
  else next[rowId] = expanded;
  return Object.freeze({ ...state, expanded: Object.keys(next).length ? Object.freeze(next) : EMPTY_RECORD });
}

interface LoadEntry {
  row: unknown;
  version: number;
  controller: AbortControllerLike | null;
  snap: DetailLoadSnapshot;
}

/**
 * Creates the `detail` module. Options are read from `options.detail`
 * (`DetailOptions`).
 */
export function createDetailModule<Row>(): DetailModule<Row> {
  let hasDetail: ((row: Row) => boolean) | null = null;
  let load: DetailOptions<Row>['load'] | null = null;
  let height = DEFAULT_HEIGHT;
  const loads = new Map<RowId, LoadEntry>();
  let loadSeq = 0;
  /** Rows whose load state changed since the last notify. */
  const touched = new Set<RowId>();
  const resolvers = new WeakMap<object, Set<RowId>>();
  const queries = new WeakMap<object, Readonly<Record<string, boolean>>>();
  let disposed = false;
  let lastQuery: { input: DataQuery; detail: Readonly<Record<string, boolean>>; output: DataQuery } | null = null;

  const idsOf = (state: DetailState): Set<RowId> => {
    let ids = resolvers.get(state.expanded);
    if (!ids) {
      ids = new Set();
      // Explicit mode: the expanded ids; expand-all mode: the collapsed ids.
      for (const id in state.expanded) if (state.expanded[id] !== state.defaultExpanded) ids.add(id);
      resolvers.set(state.expanded, ids);
    }
    return ids;
  };

  const isExpanded = (state: DetailState, rowId: RowId): boolean => state.enabled && (state.expanded[rowId] ?? state.defaultExpanded);

  const startLoad = (ctx: ModuleContext<Row>, rowId: RowId, force: boolean): void => {
    if (!load || disposed) return;
    const row = visibleRowOf(ctx, rowId);
    if (row === undefined) return;
    if (hasDetail && !hasDetail(row)) return;
    const previous = loads.get(rowId);
    if (!force && previous && previous.row === row && previous.snap.status !== 'error') return;
    previous?.controller?.abort();
    const version = ++loadSeq;
    const controller = createAbortController();
    const entry: LoadEntry = { row, version, controller, snap: Object.freeze({ status: 'loading', data: undefined, error: undefined }) };
    loads.set(rowId, entry);
    touched.add(rowId);
    const settle = (snap: DetailLoadSnapshot): void => {
      const current = loads.get(rowId);
      if (disposed || current !== entry || controller.signal.aborted) return;
      entry.snap = snap;
      entry.controller = null;
      touched.add(rowId);
      ctx.dispatch({ type: 'detail.loaded', rowId, version });
    };
    let result: unknown;
    try {
      result = load({ rowId, row, signal: controller.signal });
    } catch (error) {
      entry.snap = Object.freeze({ status: 'error', data: undefined, error });
      entry.controller = null;
      return;
    }
    if (isPromiseLike(result)) {
      Promise.resolve(result).then(
        (data) => settle(Object.freeze({ status: 'ready', data, error: undefined })),
        (error: unknown) => settle(Object.freeze({ status: 'error', data: undefined, error })),
      );
    } else {
      entry.snap = Object.freeze({ status: 'ready', data: result, error: undefined });
      entry.controller = null;
    }
  };

  const methods: DetailMethods<Row> = {
    isExpanded(ctx, rowId) {
      return isExpanded(ctx.getModuleState<DetailState>('detail') as DetailState, rowId);
    },
    getLoad(ctx, rowId) {
      const entry = loads.get(rowId);
      if (!entry) return IDLE;
      const row = visibleRowOf(ctx, rowId);
      if (row !== undefined && row !== entry.row) return IDLE;
      return entry.snap;
    },
    getExpandedIds(ctx) {
      const state = ctx.getModuleState<DetailState>('detail') as DetailState;
      if (state.defaultExpanded) return EMPTY_IDS;
      const ids = Object.keys(state.expanded);
      return ids.length ? Object.freeze(ids) : EMPTY_IDS;
    },
    getInfo(ctx) {
      const state = ctx.getModuleState<DetailState>('detail') as DetailState;
      return Object.freeze({ enabled: state.enabled, defaultExpanded: state.defaultExpanded, height });
    },
  };

  return defineDataGridModule<Row, DetailState, DetailCommand, 'detail', DetailMethods<Row>>({
    name: 'detail',
    inSnapshot: false,
    commands: [
      'detail.expand',
      'detail.collapse',
      'detail.toggle',
      'detail.expandAll',
      'detail.collapseAll',
      'detail.setExpanded',
      'detail.load',
      'detail.retry',
      'detail.setEnabled',
      'detail.loaded',
    ],
    initialState(options: DataGridOptions<Row>): DetailState {
      const o = (options['detail'] ?? {}) as DetailOptions<Row>;
      hasDetail = o.hasDetail ?? null;
      load = o.load ?? null;
      height = typeof o.height === 'number' && o.height > 0 ? o.height : DEFAULT_HEIGHT;
      const fromQuery = options.defaultQuery?.expansion?.detail ?? null;
      const defaultExpanded = o.defaultExpanded ?? fromQuery?.[DETAIL_DEFAULT_KEY] === true;
      const expanded: Record<RowId, boolean> = {};
      for (const [id, v] of Object.entries(o.expanded ?? fromQuery ?? {})) {
        if (id === DETAIL_DEFAULT_KEY) continue;
        if ((v === true) !== defaultExpanded) expanded[id] = v === true;
      }
      return Object.freeze({
        enabled: o.enabled ?? true,
        defaultExpanded,
        expanded: Object.keys(expanded).length ? Object.freeze(expanded) : EMPTY_RECORD,
        loadVersion: 0,
      });
    },
    reduce(state, command, ctx) {
      switch (command.type) {
        case 'detail.loaded':
          return command.version === state.loadVersion ? state : Object.freeze({ ...state, loadVersion: command.version });
        case 'detail.setEnabled':
          if (typeof command.enabled !== 'boolean') return ctx.reject('invalidEnabled');
          return command.enabled === state.enabled ? state : Object.freeze({ ...state, enabled: command.enabled });
        default:
          break;
      }
      if (!state.enabled) return ctx.reject('detailDisabled');
      switch (command.type) {
        case 'detail.expand':
        case 'detail.collapse':
        case 'detail.toggle': {
          if (!validId(command.rowId)) return ctx.reject('invalidRowId');
          const current = isExpanded(state, command.rowId);
          const next =
            command.type === 'detail.expand' ? true : command.type === 'detail.collapse' ? false : typeof command.expanded === 'boolean' ? command.expanded : !current;
          if (next && hasDetail) {
            const row = visibleRowOf(ctx, command.rowId);
            if (row !== undefined && !hasDetail(row)) return ctx.reject('noDetail');
          }
          const result = withOverride(state, command.rowId, next);
          if (next && result !== state) queueMicrotaskLoad(ctx, command.rowId);
          return result;
        }
        case 'detail.expandAll':
          return state.defaultExpanded && state.expanded === EMPTY_RECORD ? state : Object.freeze({ ...state, defaultExpanded: true, expanded: EMPTY_RECORD });
        case 'detail.collapseAll':
          return !state.defaultExpanded && state.expanded === EMPTY_RECORD ? state : Object.freeze({ ...state, defaultExpanded: false, expanded: EMPTY_RECORD });
        case 'detail.setExpanded': {
          if (typeof command.expanded !== 'object' || command.expanded === null || Array.isArray(command.expanded)) return ctx.reject('invalidExpanded');
          const def = typeof command.defaultExpanded === 'boolean' ? command.defaultExpanded : state.defaultExpanded;
          const expanded: Record<RowId, boolean> = {};
          for (const [id, v] of Object.entries(command.expanded)) {
            if (!validId(id) || id === DETAIL_DEFAULT_KEY) continue;
            if ((v === true) !== def) expanded[id] = v === true;
          }
          return Object.freeze({ ...state, defaultExpanded: def, expanded: Object.keys(expanded).length ? Object.freeze(expanded) : EMPTY_RECORD });
        }
        case 'detail.load':
        case 'detail.retry':
          if (!validId(command.rowId)) return ctx.reject('invalidRowId');
          if (!load) return ctx.reject('noLoader');
          if (!isExpanded(state, command.rowId)) return ctx.reject('notExpanded');
          startLoad(ctx, command.rowId, command.type === 'detail.retry');
          // Sync loads settle immediately; bump so subscribers re-read.
          return touched.size ? Object.freeze({ ...state, loadVersion: ++loadSeq }) : state;
        default:
          return state;
      }
    },
    extendQuery(query: DataQuery, state: DetailState): DataQuery {
      let detail = queries.get(state.expanded);
      if (!state.enabled) detail = EMPTY_RECORD;
      else if (!detail || (detail[DETAIL_DEFAULT_KEY] === true) !== state.defaultExpanded) {
        detail = state.defaultExpanded ? Object.freeze({ ...state.expanded, [DETAIL_DEFAULT_KEY]: true }) : state.expanded;
        queries.set(state.expanded, detail);
      }
      if (query.expansion.detail === detail) return query;
      // Same input and record: same output (load settles must not change the query identity).
      if (lastQuery && lastQuery.input === query && lastQuery.detail === detail) return lastQuery.output;
      const output: DataQuery = Object.freeze({ ...query, expansion: Object.freeze({ ...query.expansion, detail }) });
      lastQuery = { input: query, detail, output };
      return output;
    },
    notify(previous, next) {
      if (previous.enabled !== next.enabled || previous.defaultExpanded !== next.defaultExpanded) {
        touched.clear();
        return { allRows: true };
      }
      const rows = new Set<RowId>();
      if (previous.expanded !== next.expanded) {
        for (const id in previous.expanded) if (previous.expanded[id] !== next.expanded[id]) rows.add(id);
        for (const id in next.expanded) if (previous.expanded[id] !== next.expanded[id]) rows.add(id);
      }
      for (const id of touched) rows.add(id);
      touched.clear();
      const out: RowId[] = [];
      for (const id of rows) out.push(id, detailRowId(id));
      return { rows: out };
    },
    dispose() {
      disposed = true;
      for (const entry of loads.values()) entry.controller?.abort();
      loads.clear();
    },
    methods,
    pipeline: [
      {
        name: 'detailExpansion',
        key: (_query, state) => [state.enabled, state.defaultExpanded, state.expanded],
        run(input: RowModelSnapshot<Row>, ctx) {
          const state = ctx.state;
          if (!state.enabled || input.count === 0) return input;
          const ids = idsOf(state);
          if (!state.defaultExpanded && ids.size === 0) return input;
          const resolver: DetailResolver = {
            all: state.defaultExpanded,
            ids,
            sourceIndexOf: ctx.sourceIndexOf ?? fallbackIndexOf(input),
            hasDetail: hasDetail as ((row: unknown) => boolean) | null,
            source: input.source,
          };
          const view = new DetailView(input.view ?? PlainView.of(input), resolver);
          if (view.detailCount === 0) return input;
          return Object.freeze({ ...input, count: view.count, view });
        },
      },
    ],
  });

  /** Explicit expands start the async load after the expansion is applied (the row model must be current). */
  function queueMicrotaskLoad(ctx: ModuleContext<Row>, rowId: RowId): void {
    if (!load) return;
    void Promise.resolve().then(() => {
      if (disposed) return;
      const state = ctx.getModuleState<DetailState>('detail');
      if (!state || !isExpanded(state, rowId)) return;
      const before = touched.size;
      startLoad(ctx, rowId, false);
      // Notify the row (and its detail row) that the load started.
      if (touched.size !== before || touched.has(rowId)) ctx.dispatch({ type: 'detail.loaded', rowId, version: ++loadSeq });
    });
  }
}

const fallbackMaps = new WeakMap<object, Map<RowId, number>>();
/** Id lookup for engines that do not provide `StageContext.sourceIndexOf`. */
function fallbackIndexOf<Row>(input: RowModelSnapshot<Row>): (rowId: RowId) => number {
  let map = fallbackMaps.get(input.sourceIds);
  if (!map) {
    map = new Map();
    for (let i = 0; i < input.sourceIds.length; i++) if (!map.has(input.sourceIds[i] as RowId)) map.set(input.sourceIds[i] as RowId, i);
    fallbackMaps.set(input.sourceIds, map);
  }
  const m = map;
  return (id) => m.get(id) ?? -1;
}

