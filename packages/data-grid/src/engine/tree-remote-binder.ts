// Remote tree data: child rows loaded on demand.
//
// `createRemoteTree(source, options)` adapts a remote `DataSource`
// whose `read` accepts `parentRowId` to tree mode. It returns the data source
// the engine reads (`dataSource`) and the tree module to register
// (`module(treeOptions)`):
//
// - The root read is `read({ parentRowId: null })`; expanding a row whose
//   envelope says `hasChildren` loads `read({ parentRowId })` through the
//   tree module's `loadChildren` (per-row `loadStatus`, abort on supersede,
//   `tree.retry`). The query (search, filters, sort) travels with root and
//   child reads alike, so a server that filters with the ancestor chain
//   (`filterMode: 'ancestors'`) keeps lazily loaded trees filtered.
// - Envelopes with nested `children` (load all, nested remote data) or flat
//   envelopes naming another `parentId` (ancestor chains) populate whole
//   subtrees at once. Plain rows are accepted too (their parent comes from
//   `parentIdField`).
// - Children stay cached per parent until the structural query (everything
//   but paging and expansion) changes or the source is invalidated; then
//   the expanded loaded parents are read again with the new query and the
//   other parents return to `loadStatus: 'idle'`.
// - `pageBy: 'root'` sends the paging with the root read (the server pages
//   roots); `pageBy: 'all'` reads every root and the engine pages the
//   visible rows locally.
// - `rootBlocks` (infinite scroll in tree mode): the root read
//   takes `initialBlocks` blocks of root rows (`range` over the root level,
//   `parentRowId: null`), `loadMoreRoots()` appends the next block. The tree
//   view covers the loaded roots; expansion, loaded children, selection and
//   edits are keyed by row id and survive block loads. A query change starts
//   again from the first blocks.
// - Writes go to the source; the settled `WriteResult` is applied to the
//   loaded tree (added rows join their parent, deleted rows leave with their
//   subtree, moved rows change parent) and emitted as one source event.
//   Events of the wrapped source itself are not forwarded.
//
// The loaded rows are the engine's source rows (by reference); the relation
// and the lazy flag live in a WeakMap keyed by row object, read by the tree
// module through its `parentIdOf` / `hasChildren` hooks.
//
// The body of `createRemoteTree` (entry `./tree-remote.js`,
// tree-remote.ts) with the tree module factory and the query serializer
// passed in instead of imported: it has no runtime import, so a renderer
// that loads it as a lazy chunk shares no module with its static graph (a
// shared module would be split into a chunk of its own by the consumer's
// bundler; persistence-binder.ts does the same). Not for apps.

import type { createTreeModule, TreeLoadContext, TreeModule, TreeOptions, TreeState } from './tree.js';
import type {
  AbortSignalLike,
  DataSource,
  DataGridOptions,
  DataQuery,
  DataSourceCapabilities,
  DataSourceEvent,
  DataSourceRequest,
  DataSourceResult,
  ModuleContext,
  PerformedStage,
  RowId,
  WriteRequest,
  WriteResult,
} from './types.js';

/** A tree read item (structural copy of `@salmonui/data` `TreeRowEnvelope`; `depth` is informational). */
export interface RemoteTreeEnvelope<Row> {
  readonly kind: 'tree';
  readonly row: Row;
  /** Parent of the row (null: a root). Default: the requested parent, or the envelope holding it in `children`. */
  readonly parentId?: RowId | null;
  readonly depth?: number;
  readonly hasChildren?: boolean;
  readonly childCount?: number;
  /** Children loaded with the row (load all, nested remote data); `[]` means a leaf. */
  readonly children?: readonly RemoteTreeEnvelope<Row>[];
}

/** A failed child load (`onError` with `action: 'treeChildren'` in the React layer). */
export interface RemoteTreeError {
  readonly action: 'treeChildren';
  readonly rowId: RowId;
  readonly error: unknown;
}

export interface RemoteTreeOptions<Row> {
  /** The grid's `getRowId`. */
  readonly getRowId: (row: Row, index: number) => RowId;
  /** Called once per failed child load (not for aborted loads). */
  readonly onError?: (event: RemoteTreeError) => void;
  /**
   * Infinite scroll in tree mode: read the root rows in blocks of
   * `blockSize` (default 100; `range` over the root level), `initialBlocks`
   * (default 3) on the first read, the next block on `loadMoreRoots()`.
   * Ignored while the query pages (`pageBy: 'root'` paging).
   */
  readonly rootBlocks?: { readonly blockSize?: number; readonly initialBlocks?: number };
}

/** Root block state of `rootBlocks`. */
export interface RemoteTreeRootBlocks {
  /** Root rows read so far (the offset of the next block). */
  readonly loadedRoots: number;
  /** More root rows may follow. */
  readonly hasMore: boolean;
  /** A block read is in flight. */
  readonly loading: boolean;
}

export interface RemoteTree<Row> {
  /** The engine's `dataSource` (`mode: 'remote'`). */
  readonly dataSource: DataSource<Row>;
  /** The tree module to register instead of `createTreeModule(options)` (call once per engine). */
  module(options?: TreeOptions<Row>): TreeModule<Row>;
  /** Error of the last failed child load of a row, or undefined. */
  getLoadError(rowId: RowId): unknown;
  /**
   * `rootBlocks`: reads the next block of root rows and appends it (one read
   * at a time). Resolves true when rows were appended; false when there is
   * nothing to read, a read is in flight, or a query change superseded it.
   * Rejects when the read fails.
   */
  loadMoreRoots(): Promise<boolean>;
  /** `rootBlocks` state (`hasMore` is false without `rootBlocks`). */
  getRootBlocks(): RemoteTreeRootBlocks;
}

interface Meta {
  readonly parentId: RowId | null | undefined;
  hasChildren: boolean | undefined;
}

const ALL_PERFORMED: readonly PerformedStage[] = Object.freeze(['search', 'filter', 'sort', 'group', 'aggregate', 'page']);
const NO_IDS: readonly RowId[] = Object.freeze([]);
/** Signal of root block reads: never aborted (a root read supersedes them on the source's channel). */
const IDLE_SIGNAL: AbortSignalLike = Object.freeze({ aborted: false, addEventListener() {}, removeEventListener() {} });

function isEnvelope<Row>(item: unknown): item is RemoteTreeEnvelope<Row> {
  return typeof item === 'object' && item !== null && (item as { kind?: unknown }).kind === 'tree' && 'row' in item;
}

function abortError(signal: AbortSignalLike): unknown {
  return signal.reason ?? new Error('Aborted');
}

/** What `bindRemoteTree` is given instead of importing it. */
export interface RemoteTreeDeps {
  readonly createTreeModule: typeof createTreeModule;
  readonly serializeDataGridQuery: (query: DataQuery) => string;
}

/** Not for apps (use `createRemoteTree`): `createRemoteTree` over injected functions. */
export function bindRemoteTree<Row>(source: DataSource<Row>, options: RemoteTreeOptions<Row>, { createTreeModule, serializeDataGridQuery }: RemoteTreeDeps): RemoteTree<Row> {
  /** Structural query: paging and expansion never invalidate loaded children. */
  const structuralKey = (query: DataQuery): string => serializeDataGridQuery({ ...query, paging: null, expansion: { groups: {}, tree: {}, detail: {}, defaultGroupExpanded: true } });
  const getRowId = (row: Row, index: number): RowId => String(options.getRowId(row, index));
  let ctx: ModuleContext<Row> | null = null;
  let treeModule: TreeModule<Row> | null = null;
  const listeners = new Set<(event: DataSourceEvent<Row>) => void>();
  /** Relation and lazy flag per row object (rows are the engine's, by reference). */
  const meta = new WeakMap<object, Meta>();
  /** Loaded rows by id (current structural query). */
  let nodes = new Map<RowId, Row>();
  /** Loaded children per parent (complete lists only). */
  let kids = new Map<RowId, RowId[]>();
  /** Root ids of the last root read, in order. */
  let roots: RowId[] = [];
  /** Rows a response named under a parent that is not loaded (kept at the end, shown as roots). */
  let strays: RowId[] = [];
  /** Parents whose children this adapter loaded through the tree module. */
  const loaded = new Set<RowId>();
  const loading = new Set<RowId>();
  const errors = new Map<RowId, unknown>();
  let cacheKey: string | null = null;
  let generation = 0;
  let childVersion = 0;
  /** Query (without paging) of the last root read: sent with child reads. */
  let childQuery: DataQuery | null = null;
  let lastRoot: { wireKey: string; result: DataSourceResult<unknown> } | null = null;
  let pagedRoots = false;
  let total = 0;
  let store: { rows: readonly Row[]; ids: readonly RowId[]; pos: Map<RowId, number> } = { rows: Object.freeze([]), ids: NO_IDS, pos: new Map() };
  // Root blocks.
  const rb = options.rootBlocks;
  const blockSize = rb ? (rb.blockSize ?? 100) : 0;
  /** Root rows of the first read. */
  const firstRoots = blockSize * (rb?.initialBlocks ?? 3);
  /** Block mode of the last root read (`rootBlocks`, no paging). */
  let blocks = false;
  /** Root rows read so far: the offset of the next block. */
  let rootOffset = 0;
  /** Block mode only: more root rows may follow. */
  let moreRoots = false;
  let rootLoad: Promise<boolean> | null = null;
  /** Version of the last root read: block reads share the source's root channel. */
  let rootVersion = 0;

  const treeState = (): TreeState | undefined => ctx?.getModuleState<TreeState>('tree');

  const setMeta = (row: Row, parentId: RowId | null | undefined, hasChildren: boolean | undefined): void => {
    if (typeof row === 'object' && row !== null) meta.set(row as object, { parentId, hasChildren });
  };
  const metaOf = (row: Row): Meta | undefined => (typeof row === 'object' && row !== null ? meta.get(row as object) : undefined);

  const emit = (event: DataSourceEvent<Row>): void => {
    for (const listener of [...listeners]) listener(event);
  };

  /**
   * Records a tree read answer for `parent` (null: roots; `append`: after
   * the loaded roots). Returns the number of rows directly under `parent`.
   */
  const ingest = (parent: RowId | null, items: readonly unknown[], append = false): number => {
    const direct: RowId[] = [];
    const listed = new Map<RowId, RowId[]>();
    const named: RowId[] = [];
    let index = 0;
    const visit = (item: unknown, holder: RowId | null, nested: boolean): void => {
      const env = isEnvelope<Row>(item) ? item : null;
      const row = (env ? env.row : item) as Row;
      const id = getRowId(row, index++);
      let parentId: RowId | null | undefined;
      if (env && env.parentId !== undefined && !nested) parentId = env.parentId === null ? null : String(env.parentId);
      else if (env || holder !== null) parentId = holder;
      // Loaded children are authoritative; otherwise the envelope's flag or count.
      const hasChildren = env ? (env.children ? env.children.length > 0 : (env.hasChildren ?? (env.childCount !== undefined ? env.childCount > 0 : undefined))) : undefined;
      setMeta(row, parentId, hasChildren);
      nodes.set(id, row);
      const at = parentId === undefined ? holder : parentId;
      if (at === parent) direct.push(id);
      else if (at !== null) {
        let list = listed.get(at);
        if (!list) listed.set(at, (list = []));
        list.push(id);
        named.push(id);
      } else direct.push(id);
      if (env?.children) {
        if (!listed.has(id)) listed.set(id, []);
        for (const child of env.children) visit(child, id, true);
      }
    };
    for (const item of items) visit(item, parent, false);
    if (parent === null) roots = append ? roots.concat(direct) : direct;
    else kids.set(parent, direct);
    for (const [p, list] of listed) kids.set(p, list);
    // A parent with listed children is loaded; a lazy flag the response did not set follows from the list.
    for (const [p, list] of listed) {
      const row = nodes.get(p);
      const m = row === undefined ? undefined : metaOf(row);
      if (m && m.hasChildren === undefined) m.hasChildren = list.length > 0;
    }
    for (const id of named) {
      const row = nodes.get(id) as Row;
      const p = metaOf(row)?.parentId;
      if (typeof p === 'string' && !nodes.has(p)) strays.push(id);
    }
    return direct.length;
  };

  /** Pre-order of the loaded tree. */
  const order = (): RowId[] => {
    const out: RowId[] = [];
    const seen = new Set<RowId>();
    const stack: RowId[] = [];
    const walk = (start: RowId): void => {
      stack.push(start);
      while (stack.length) {
        const id = stack.pop() as RowId;
        if (seen.has(id) || !nodes.has(id)) continue;
        seen.add(id);
        out.push(id);
        const list = kids.get(id);
        if (list) for (let i = list.length - 1; i >= 0; i--) stack.push(list[i] as RowId);
      }
    };
    for (const id of roots) walk(id);
    for (const id of strays) walk(id);
    return out;
  };

  const rebuild = (): void => {
    const ids = order();
    const rows = ids.map((id) => nodes.get(id) as Row);
    const pos = new Map<RowId, number>();
    for (let i = 0; i < ids.length; i++) pos.set(ids[i] as RowId, i);
    store = { rows: Object.freeze(rows), ids: Object.freeze(ids), pos };
  };

  const totalRowCount = (): number => (pagedRoots ? total : store.rows.length);

  /** Appends the rows of `list` and their loaded subtrees that are not in the store yet; emits one patch. */
  const appendFrom = (list: readonly RowId[] | undefined): void => {
    const rows = store.rows.slice();
    const ids = store.ids.slice();
    const pos = new Map(store.pos);
    const added: RowId[] = [];
    const updated: RowId[] = [];
    const stack: RowId[] = [];
    const push = (list: readonly RowId[] | undefined): void => {
      if (list) for (let i = list.length - 1; i >= 0; i--) stack.push(list[i] as RowId);
    };
    push(list);
    const seen = new Set<RowId>();
    while (stack.length) {
      const id = stack.pop() as RowId;
      if (seen.has(id)) continue;
      seen.add(id);
      const row = nodes.get(id);
      if (row === undefined) continue;
      const at = pos.get(id);
      if (at === undefined) {
        pos.set(id, rows.length);
        rows.push(row);
        ids.push(id);
        added.push(id);
      } else if (rows[at] !== row) {
        rows[at] = row;
        updated.push(id);
      }
      push(kids.get(id));
    }
    if (!added.length && !updated.length) return;
    store = { rows: Object.freeze(rows), ids: Object.freeze(ids), pos };
    if (!pagedRoots) total = rows.length;
    emit(Object.freeze({ type: 'patch', rows: store.rows, updated: Object.freeze(updated), added: Object.freeze(added), removed: NO_IDS, totalRowCount: totalRowCount() }));
  };

  const readChildren = async (rowId: RowId, query: DataQuery, signal: AbortSignalLike): Promise<readonly unknown[]> => {
    const result = await source.read({ version: ++childVersion, query, parentRowId: rowId, signal });
    if (signal.aborted) throw abortError(signal);
    return result.rows as readonly unknown[];
  };

  const report = (rowId: RowId, error: unknown): void => {
    errors.set(rowId, error);
    options.onError?.({ action: 'treeChildren', rowId, error });
  };

  // --- tree module hooks ---------------------------------------------------------

  const loadChildren = async ({ rowId, signal }: TreeLoadContext<Row>): Promise<readonly Row[]> => {
    const gen = generation;
    loading.add(rowId);
    try {
      const items = await readChildren(rowId, childQuery ?? (ctx?.getSnapshot().query as DataQuery), signal);
      // A query change superseded the load: the root read resets this row's status.
      if (gen !== generation) return [];
      ingest(rowId, items);
      loaded.add(rowId);
      errors.delete(rowId);
      appendFrom(kids.get(rowId));
      return [];
    } catch (error) {
      if (!signal.aborted && gen === generation) report(rowId, error);
      throw error;
    } finally {
      loading.delete(rowId);
    }
  };
  const hasChildren = (row: Row): boolean | undefined => metaOf(row)?.hasChildren;
  const parentIdOf = (row: Row): RowId | null | undefined => metaOf(row)?.parentId;
  const hooks = { loadChildren, hasChildren, parentIdOf } as const;

  // --- reads ----------------------------------------------------------------------

  const isExpanded = (id: RowId): boolean => {
    const methods = treeModule?.methods;
    return ctx !== null && methods !== undefined && methods.isExpanded(ctx, id);
  };

  /** Reads the children of the expanded parents again (new query), level by level. */
  const reloadExpanded = async (ids: readonly RowId[], query: DataQuery, signal: AbortSignalLike): Promise<Set<RowId>> => {
    const pending = new Set(ids);
    const done = new Set<RowId>();
    for (;;) {
      const ready = [...pending].filter((id) => nodes.has(id) && !kids.has(id));
      if (!ready.length) break;
      for (const id of ready) pending.delete(id);
      const answers = await Promise.all(
        ready.map((id) =>
          readChildren(id, query, signal).then(
            (items) => ({ id, items, error: undefined as unknown }),
            (error: unknown) => ({ id, items: null, error }),
          ),
        ),
      );
      if (signal.aborted) throw abortError(signal);
      for (const a of answers) {
        if (a.items) {
          ingest(a.id, a.items);
          done.add(a.id);
        } else report(a.id, a.error);
      }
    }
    return done;
  };

  const readRoot = async (request: DataSourceRequest): Promise<DataSourceResult<Row>> => {
    const state = treeState();
    const byRoot = state?.pageBy === 'root' && request.query.paging !== null;
    const inBlocks = blockSize > 0 && request.query.paging === null;
    const query = request.query.paging !== null && !byRoot ? Object.freeze({ ...request.query, paging: null }) : request.query;
    const key = structuralKey(request.query);
    const reset = key !== cacheKey;
    const wireKey = serializeDataGridQuery({ ...query, expansion: { groups: {}, tree: {}, detail: {}, defaultGroupExpanded: true } });
    // Loaded parents that are expanded now are read again with the new query.
    const again = reset ? [...loaded].filter(isExpanded) : [];
    const before = reset ? new Set([...loaded, ...loading]) : null;
    if (reset) {
      generation++;
      // Child loads of the previous query: back to idle (aborts them) once this dispatch settles.
      const stale = [...loading];
      if (stale.length) {
        void Promise.resolve().then(() => {
          for (const id of stale) if (ctx && loading.has(id)) ctx.dispatch({ type: 'tree.loaded', rowId: id, status: 'idle' });
        });
      }
    }
    let result: DataSourceResult<unknown>;
    const cached = !reset && lastRoot !== null && lastRoot.wireKey === wireKey && blocks === inBlocks;
    if (cached) result = (lastRoot as { result: DataSourceResult<unknown> }).result;
    else {
      // A block read of the previous root read is superseded; no block is read until this read settles.
      rootLoad = null;
      moreRoots = false;
      rootVersion = request.version;
      const range = inBlocks ? { range: { start: 0, end: firstRoots } } : {};
      result = (await source.read({ ...request, ...range, query, parentRowId: null })) as DataSourceResult<unknown>;
      if (request.signal.aborted) throw abortError(request.signal);
    }
    let reloaded = new Set<RowId>();
    if (reset) {
      // `meta` is keyed by row object, so the rows still shown keep their relation until replaced.
      nodes = new Map();
      kids = new Map();
      cacheKey = key;
      loaded.clear();
      errors.clear();
    }
    blocks = inBlocks;
    let more = moreRoots;
    // The same query in block mode: the loaded blocks (and the writes applied to them) stand.
    if (!(inBlocks && cached)) {
      strays = [];
      const n = ingest(null, result.rows as readonly unknown[]);
      rootOffset = n;
      more = inBlocks && hasMoreAfter(result, n, firstRoots);
    }
    if (reset && again.length) {
      reloaded = await reloadExpanded(again, Object.freeze({ ...query, paging: null }), request.signal);
      for (const id of reloaded) loaded.add(id);
    }
    lastRoot = { wireKey, result };
    childQuery = query.paging === null ? query : Object.freeze({ ...query, paging: null });
    moreRoots = more;
    pagedRoots = byRoot;
    total = byRoot ? (result.totalRowCount ?? roots.length) : 0;
    rebuild();
    if (!byRoot) total = store.rows.length;
    if (before && ctx) {
      for (const id of before) if (!reloaded.has(id)) ctx.dispatch({ type: 'tree.loaded', rowId: id, status: 'idle' });
    }
    const performed = (result.performed ?? ALL_PERFORMED).filter((s) => s !== 'group' && (byRoot || s !== 'page'));
    return Object.freeze({
      version: request.version,
      rows: store.rows,
      totalRowCount: totalRowCount(),
      performed: Object.freeze(performed),
      ...(result.aggregates ? { aggregates: result.aggregates } : {}),
      ...(result.pageInfo ? { pageInfo: result.pageInfo } : {}),
    });
  };

  /** More root rows follow a block that answered `n` of `requested` roots (`rootOffset` loaded in all). */
  const hasMoreAfter = (result: DataSourceResult<unknown>, n: number, requested: number): boolean =>
    result.pageInfo?.hasNextPage ?? (result.totalRowCount !== undefined ? rootOffset < result.totalRowCount : n >= requested);

  const loadMoreRoots = (): Promise<boolean> => {
    if (!moreRoots || rootLoad) return Promise.resolve(false);
    // Block mode reads without paging: the child query is the root query.
    const query = childQuery as DataQuery;
    const start = rootOffset;
    // The next root read supersedes the block on the source's root channel; its answer is dropped here.
    const load: Promise<boolean> = Promise.resolve()
      .then(() => source.read({ version: rootVersion, query, range: { start, end: start + blockSize }, parentRowId: null, signal: IDLE_SIGNAL }))
      .then(
        (result) => {
          if (rootLoad !== load) return false;
          rootLoad = null;
          const r0 = roots.length;
          const s0 = strays.length;
          const n = ingest(null, result.rows as readonly unknown[], true);
          rootOffset += n;
          moreRoots = n > 0 && hasMoreAfter(result, n, blockSize);
          appendFrom(roots.slice(r0).concat(strays.slice(s0)));
          return n > 0;
        },
        (error: unknown) => {
          if (rootLoad !== load) return false;
          rootLoad = null;
          throw error;
        },
      );
    rootLoad = load;
    return load;
  };

  // --- writes ---------------------------------------------------------------------

  const failedIds = (request: WriteRequest<Row>, result: WriteResult<Row>): Set<RowId> => {
    const failed = new Set<RowId>();
    for (const id of Object.keys(result.rowErrors ?? {})) failed.add(id);
    for (const k of Object.keys(result.cellErrors ?? {})) failed.add(k.slice(0, k.lastIndexOf(':')));
    for (const c of result.conflicts ?? []) failed.add(c.rowId);
    if (result.status === 'rejected' && failed.size === 0) {
      for (const a of request.added) failed.add(a.tempId);
      for (const c of request.changed) failed.add(c.rowId);
      for (const d of request.deleted) failed.add(d.rowId);
    }
    return failed;
  };

  const detach = (id: RowId): void => {
    const row = nodes.get(id);
    const p = row === undefined ? undefined : metaOf(row)?.parentId;
    const list = typeof p === 'string' ? kids.get(p) : roots;
    if (list) {
      const at = list.indexOf(id);
      if (at >= 0) list.splice(at, 1);
      if (typeof p === 'string' && list.length === 0) {
        const parentRow = nodes.get(p);
        const m = parentRow === undefined ? undefined : metaOf(parentRow);
        if (m) m.hasChildren = false;
      }
    }
  };

  const dropSubtree = (id: RowId): void => {
    const stack = [id];
    while (stack.length) {
      const x = stack.pop() as RowId;
      const list = kids.get(x);
      if (list) stack.push(...list);
      kids.delete(x);
      nodes.delete(x);
      loaded.delete(x);
    }
  };

  /** Puts `id` under `parent` (null: roots) next to `target`; false when the parent's children are not loaded. */
  const attach = (id: RowId, parent: RowId | null, target: RowId | null, position: 'before' | 'after' | 'into'): boolean => {
    const list = parent === null ? roots : kids.get(parent);
    if (parent !== null) {
      const parentRow = nodes.get(parent);
      const m = parentRow === undefined ? undefined : metaOf(parentRow);
      if (m) m.hasChildren = true;
    }
    if (!list) return false;
    const at = target !== null && position !== 'into' ? list.indexOf(target) : -1;
    if (at < 0) list.push(id);
    else list.splice(position === 'before' ? at : at + 1, 0, id);
    return true;
  };

  const applyWrite = (request: WriteRequest<Row>, result: WriteResult<Row>): void => {
    const roots0 = roots.length;
    const failed = failedIds(request, result);
    const changedEcho = new Map<RowId, Row>();
    for (const c of result.changed ?? []) changedEcho.set(c.rowId, c.row);
    const addedEcho = new Map<RowId, Row>();
    for (const a of result.added ?? []) addedEcho.set(a.tempId, a.row);
    let structural = false;
    const updated: RowId[] = [];
    for (const c of request.changed) {
      if (failed.has(c.rowId) || !nodes.has(c.rowId)) continue;
      const row = changedEcho.get(c.rowId) ?? c.row;
      const old = metaOf(nodes.get(c.rowId) as Row);
      setMeta(row, old?.parentId, old?.hasChildren);
      nodes.set(c.rowId, row);
      updated.push(c.rowId);
    }
    for (const d of request.deleted) {
      if (failed.has(d.rowId) || !nodes.has(d.rowId)) continue;
      detach(d.rowId);
      dropSubtree(d.rowId);
      structural = true;
    }
    for (const a of request.added) {
      if (failed.has(a.tempId)) continue;
      const row = addedEcho.get(a.tempId) ?? a.row;
      const id = getRowId(row, -1);
      const parent = a.parentId === undefined ? null : a.parentId;
      setMeta(row, a.parentId === undefined ? undefined : parent, false);
      if (parent !== null && !nodes.has(parent)) continue;
      nodes.set(id, row);
      if (!attach(id, parent, null, 'after')) nodes.delete(id);
      structural = true;
    }
    const moved = request.moved;
    if (moved && moved.parentId !== undefined && failed.size === 0) {
      const parent = moved.parentId;
      for (const id of moved.rowIds) {
        const row = nodes.get(id);
        if (row === undefined) continue;
        detach(id);
        const m = metaOf(row);
        setMeta(row, parent, m?.hasChildren);
        if (parent !== null && !nodes.has(parent)) {
          dropSubtree(id);
          continue;
        }
        if (!attach(id, parent, moved.targetRowId, moved.position)) dropSubtree(id);
      }
      structural = true;
    }
    if (pagedRoots) total = Math.max(0, total + roots.length - roots0);
    // Root rows added or removed shift the server offset of the next root block.
    rootOffset = Math.max(0, rootOffset + roots.length - roots0);
    if (!structural && !updated.length) return;
    if (structural) {
      rebuild();
      if (!pagedRoots) total = store.rows.length;
      emit(Object.freeze({ type: 'reset', rows: store.rows, totalRowCount: totalRowCount() }));
      return;
    }
    const rows = store.rows.slice();
    for (const id of updated) {
      const at = store.pos.get(id);
      if (at !== undefined) rows[at] = nodes.get(id) as Row;
    }
    store = { rows: Object.freeze(rows), ids: store.ids, pos: store.pos };
    emit(Object.freeze({ type: 'patch', rows: store.rows, updated: Object.freeze(updated), added: NO_IDS, removed: NO_IDS, totalRowCount: totalRowCount() }));
  };

  const write = source.write;
  const capabilities: Partial<DataSourceCapabilities> = Object.freeze({ ...source.capabilities, treeChildren: true, lazyGroups: false });

  const dataSource: DataSource<Row> = {
    mode: 'remote',
    capabilities,
    read(request) {
      if (request.groupPath || request.facet || request.parentRowId !== undefined) return source.read(request);
      return readRoot(request);
    },
    ...(write
      ? {
          write: (request: WriteRequest<Row>) =>
            Promise.resolve(write.call(source, request)).then((result) => {
              applyWrite(request, result);
              return result;
            }),
        }
      : {}),
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    invalidate(scope) {
      source.invalidate?.(scope);
      if (scope === undefined || scope === 'rows' || scope === 'all') {
        cacheKey = null;
        lastRoot = null;
      }
    },
  };

  return {
    dataSource,
    getLoadError: (rowId) => errors.get(rowId),
    loadMoreRoots,
    getRootBlocks: () => ({ loadedRoots: rootOffset, hasMore: moreRoots, loading: rootLoad !== null }),
    module(treeOptions = {}) {
      const inner = createTreeModule<Row>({ ...treeOptions, ...hooks });
      treeModule = inner;
      const capture = (c: ModuleContext<Row>): void => {
        ctx = c;
      };
      return {
        ...inner,
        initialState(gridOptions: DataGridOptions<Row>) {
          const raw = gridOptions['tree'];
          const tree = raw === true ? { childrenField: 'children', ...hooks } : typeof raw === 'object' && raw !== null ? { ...(raw as object), ...hooks } : raw;
          return inner.initialState(raw === undefined ? gridOptions : { ...gridOptions, tree });
        },
        reduce(state, command, c) {
          capture(c);
          return (inner.reduce as NonNullable<typeof inner.reduce>)(state, command, c);
        },
        notify(previous, next, c) {
          capture(c);
          return inner.notify ? inner.notify(previous, next, c) : { grid: true };
        },
        interceptRead(_query, _state, c) {
          capture(c);
          return false;
        },
        onConnect(c) {
          capture(c);
          inner.onConnect?.(c);
        },
        dispose() {
          generation++;
          inner.dispose?.();
          ctx = null;
        },
      };
    },
  };
}
