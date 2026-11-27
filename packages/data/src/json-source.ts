// Remote data source over the Salmon UI JSON protocol.

import { stableStringify } from './canonical.js';
import { createRequestRunner, type CacheScope, type RunnerStats } from './policy.js';
import {
  decodeTuples,
  objectToTuple,
  tuplesToObjects,
  type WirePage,
  type WireReadRequest,
  type WireReadResponse,
  type WireRequest,
  type WireResponse,
  type WireTuple,
  type WireWriteRequest,
  type WireWriteResponse,
} from './protocol.js';
import { performedFor, structuralQueryKey, toWireQuery } from './query-model.js';
import { abortError, createAbortController, linkSignal, systemScheduler, type AbortControllerLike } from './scheduler.js';
import { createBatchingFetchTransport, createFetchTransport, ProtocolError, type JsonTransport } from './transport.js';
import type {
  AbortSignalLike,
  AggregateValues,
  CellKey,
  ColumnId,
  ConflictSnapshot,
  DataSourceCapabilities,
  DataSourceEvent,
  DataSourceRequest,
  DataSourceResult,
  FetchLike,
  DataSource,
  DataQuery,
  GroupedRowEnvelope,
  GroupLoadResult,
  GroupPathSegment,
  Json,
  PagingStrategy,
  RequestPolicy,
  RowId,
  Scheduler,
  TreeLoadResult,
  TreeRowEnvelope,
  RowPlacement,
  WriteRequest,
  WriteResult,
} from './types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type RequestKind = 'read' | 'prefetch' | 'group' | 'tree' | 'facet' | 'write';

export interface RequestEvent {
  readonly kind: RequestKind;
  readonly request: WireRequest;
}
export interface ResponseEvent extends RequestEvent {
  readonly response: WireResponse;
  readonly durationMs: number;
}
export interface RequestErrorEvent extends RequestEvent {
  readonly error: unknown;
}

export interface JsonDataSourceOptions {
  /** Endpoint for the default fetch transport. Ignored when `transport` is set. */
  readonly url?: string;
  readonly fetch?: FetchLike;
  readonly headers?: Readonly<Record<string, string>> | (() => Readonly<Record<string, string>>);
  /** Multiplex same-tick requests into one `{ v: 1, batch }` POST. Default true. */
  readonly batch?: boolean;
  /** Custom transport (GraphQL bridge, WebSocket, in-process handler, ...). */
  readonly transport?: JsonTransport;
  /** Primary key field. */
  readonly key: string;
  /**
   * Requested field list (`select`). Required for tuple rows: rows are the
   * decoded tuples in this order. Without it rows are objects.
   */
  readonly fields?: readonly string[];
  /** Default `tuple` when `fields` is set, else `object`. */
  readonly rowShape?: 'tuple' | 'object';
  /** columnId to server field. Default identity. */
  readonly fieldOf?: (columnId: ColumnId) => string;
  /** server field to columnId, for errors and aggregates. Default: inverse of `fieldOf` over the query, else identity. */
  readonly columnIdOf?: (field: string) => ColumnId;
  readonly paging?: PagingStrategy;
  readonly policy?: RequestPolicy;
  readonly scheduler?: Scheduler;
  /** Default: true for `batch` and `cell` writes, false otherwise. */
  readonly optimistic?: boolean;
  /** Row field holding the row version (ETag); forwarded as expected version on change/remove. */
  readonly versionField?: string;
  readonly capabilities?: Partial<DataSourceCapabilities>;
  /** Cancelable (`return false`): the request rejects with `RequestCanceledError`. */
  readonly onRequest?: (event: RequestEvent) => boolean | void;
  /**
   * Called with every successful protocol response before the source decodes
   * it. Returning a response object replaces
   * the response for this request (e.g. to rewrite rows or `total`); any other
   * return value keeps it. Return a new object: the cache keeps the original
   * response and a cache hit runs the hook again.
   */
  readonly onResponse?: (event: ResponseEvent) => WireResponse | void;
  readonly onError?: (event: RequestErrorEvent) => void;
}

export interface WriteStateSnapshot<Row> {
  readonly pending: ReadonlySet<RowId>;
  readonly rowErrors: Readonly<Record<RowId, readonly string[]>>;
  readonly cellErrors: Readonly<Record<CellKey, readonly string[]>>;
  readonly conflicts: readonly ConflictSnapshot<Row>[];
}

/** Which rows and cells a write-state change touched. */
export interface WriteStateEvent {
  readonly rows: readonly RowId[];
  readonly cells: readonly CellKey[];
}

export interface JsonDataSource<Row> extends DataSource<Row> {
  readonly mode: 'remote';
  read(request: DataSourceRequest & { readonly groupPath: readonly GroupPathSegment[] }): Promise<GroupLoadResult<Row>>;
  read(request: DataSourceRequest & { readonly parentRowId: RowId | null }): Promise<TreeLoadResult<Row>>;
  read(request: DataSourceRequest): Promise<DataSourceResult<Row>>;
  write(request: WriteRequest<Row>): Promise<WriteResult<Row>>;
  subscribe(listener: (event: DataSourceEvent<Row>) => void): () => void;
  readonly capabilities: Partial<DataSourceCapabilities>;
  /** Clears cached rows/counts/facets (or everything), cursor chains, infinite blocks, and lazy group loads. Does not notify. */
  invalidate(scope?: 'rows' | 'counts' | 'facets' | 'all'): void;
  /** True when no foreground read is in flight. */
  canReload(): boolean;
  /** Repeats the last foreground read, bypassing the cache. */
  reload(signal?: AbortSignalLike): Promise<DataSourceResult<Row>>;
  /** Rows of the last foreground result, including optimistic edits. */
  getRows(): readonly Row[];
  getWriteState(): WriteStateSnapshot<Row>;
  subscribeWriteState(listener: (event: WriteStateEvent) => void): () => void;
  /** Drops a conflict after review. */
  dismissConflict(rowId: RowId): void;
  getStats(): Readonly<RunnerStats>;
}

/** The cursor of the requested page is not known (jump without walking the chain). */
export class CursorUnknownError extends Error {
  override readonly name = 'CursorUnknownError';
  readonly reason = 'cursorUnknown';
  constructor(page: number) {
    super(`No cursor is known for page ${page}; walk pages in order.`);
  }
}

/** A response arrived for a version older than one already applied on the same channel. */
export class StaleResponseError extends Error {
  override readonly name = 'StaleResponseError';
  readonly version: number;
  constructor(version: number, applied: number) {
    super(`Response for version ${version} is stale (version ${applied} already applied).`);
    this.version = version;
  }
}

/** `onRequest` returned false. */
export class RequestCanceledError extends Error {
  override readonly name = 'RequestCanceledError';
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

interface Channel {
  controller: AbortControllerLike | null;
  started: number;
  applied: number;
}

interface Decoded<Row> {
  rows: Row[];
  response: WireReadResponse;
}

const EMPTY_IDS: readonly RowId[] = Object.freeze([]);

let requestSeq = 0;

export function createJsonDataSource<Row = readonly unknown[]>(options: JsonDataSourceOptions): JsonDataSource<Row> {
  const scheduler = options.scheduler ?? systemScheduler();
  const policy = options.policy ?? {};
  const runner = createRequestRunner(policy, scheduler);
  const paging: PagingStrategy = options.paging ?? { kind: 'offset' };
  const fields = options.fields ?? null;
  const tuple = (options.rowShape ?? (fields ? 'tuple' : 'object')) === 'tuple';
  if (tuple && !fields) throw new Error('createJsonDataSource: tuple rows require the fields option.');
  const fieldOf = options.fieldOf ?? ((id: string) => id);
  const keyField = options.key;
  const keyIndex = fields ? fields.indexOf(keyField) : -1;
  if (tuple && keyIndex < 0) throw new Error(`createJsonDataSource: key "${keyField}" must be one of fields.`);
  const fieldPos = new Map<string, number>();
  fields?.forEach((f, i) => fieldPos.set(f, i));

  let transport: JsonTransport | null = options.transport ?? null;
  const getTransport = (): JsonTransport => {
    if (transport) return transport;
    if (!options.url) throw new Error('createJsonDataSource: pass url or transport.');
    const http = { url: options.url, ...(options.fetch ? { fetch: options.fetch } : {}), ...(options.headers ? { headers: options.headers } : {}) };
    transport = options.batch === false ? createFetchTransport(http) : createBatchingFetchTransport(http);
    return transport;
  };

  // Row accessors (tuple or object)
  const get = (row: Row, field: string): unknown =>
    tuple ? (row as unknown as readonly unknown[])[fieldPos.get(field) ?? -1] : (row as Record<string, unknown>)[field];
  const keyOf = (row: Row): Json => get(row, keyField) as Json;
  const rowIdOf = (row: Row): RowId => String(keyOf(row));
  const toTuple = (row: Row): WireTuple => (tuple ? (row as unknown as WireTuple) : objectToTuple(row, fields ?? Object.keys(row as object)));
  const decodeRows = (response: WireReadResponse): Row[] => {
    const tuples = decodeTuples(response.rows, response.fields, tuple ? fields : null, response.dict);
    return tuple ? (tuples as unknown as Row[]) : tuplesToObjects<Row>(tuples, response.fields);
  };
  const decodeOne = (t: WireTuple, header: readonly string[]): Row => decodeRows({ v: 1, id: '', fields: header, rows: [t.slice()] })[0] as Row;
  const versionOf = (row: Row | undefined): string | undefined => {
    if (!row || !options.versionField) return undefined;
    const v = get(row, options.versionField);
    return v === undefined || v === null ? undefined : String(v);
  };

  const channels = new Map<string, Channel>();
  const channel = (name: string): Channel => {
    let c = channels.get(name);
    if (!c) {
      c = { controller: null, started: 0, applied: 0 };
      channels.set(name, c);
    }
    return c;
  };

  let structural = '';
  const cursors = new Map<number, string | null>(); // page (1-based) -> cursor, for `structural`
  let blocks = new Map<number, Row[]>(); // infinite blocks for `structural`
  let blockCursors = new Map<number, string | null>();
  let blockTotal: number | undefined;
  let prefetch: AbortControllerLike | null = null;
  let lastMain: { request: DataSourceRequest; result: DataSourceResult<Row> } | null = null;
  let rows: Row[] = [];
  let rowIndex: Map<RowId, number> | null = null;
  const listeners = new Set<(event: DataSourceEvent<Row>) => void>();
  const writeListeners = new Set<(event: WriteStateEvent) => void>();
  const pending = new Set<RowId>();
  let rowErrors: Record<RowId, readonly string[]> = {};
  let cellErrors: Record<CellKey, readonly string[]> = {};
  let conflicts: ConflictSnapshot<Row>[] = [];
  let writeVersion = 0;

  const emit = (event: DataSourceEvent<Row>): void => {
    for (const l of listeners) l(event);
  };
  const emitWrite = (rowsTouched: readonly RowId[], cells: readonly CellKey[]): void => {
    if (rowsTouched.length === 0 && cells.length === 0) return;
    const event = Object.freeze({ rows: Object.freeze([...rowsTouched]), cells: Object.freeze([...cells]) });
    for (const l of writeListeners) l(event);
  };
  const index = (): Map<RowId, number> => {
    if (!rowIndex) {
      rowIndex = new Map();
      for (let i = 0; i < rows.length; i++) rowIndex.set(rowIdOf(rows[i] as Row), i);
    }
    return rowIndex;
  };

  const resetStructural = (key: string): void => {
    if (key === structural) return;
    structural = key;
    cursors.clear();
    cursors.set(1, null);
    blocks = new Map();
    blockCursors = new Map([[0, null]]);
    blockTotal = undefined;
    abortChannels((name) => name !== 'main');
  };

  const abortChannels = (match: (name: string) => boolean): void => {
    for (const [name, c] of channels) {
      if (match(name) && c.controller) {
        c.controller.abort();
        c.controller = null;
      }
    }
  };

  const send = async (kind: RequestKind, wire: WireRequest, signal: AbortSignalLike, scope: CacheScope, cacheable = true): Promise<WireResponse> => {
    if (options.onRequest?.({ kind, request: wire }) === false) throw new RequestCanceledError(`${kind} request canceled by onRequest.`);
    const { id: _id, ...rest } = wire;
    const key = stableStringify(rest);
    const started = scheduler.now();
    try {
      const response = await runner.run(
        key,
        scope,
        signal,
        async (s) => {
          const res = await getTransport()(wire, { signal: s });
          if (res.error) throw new ProtocolError(res.error.code, res.error.message);
          return res;
        },
        cacheable,
      );
      const replaced: unknown = options.onResponse?.({ kind, request: wire, response, durationMs: scheduler.now() - started });
      return typeof replaced === 'object' && replaced !== null ? (replaced as WireResponse) : response;
    } catch (error) {
      if (!signal.aborted) options.onError?.({ kind, request: wire, error });
      throw error;
    }
  };

  const readRequest = (query: DataQuery, page: WirePage | undefined, extra: Partial<WireReadRequest> = {}): WireReadRequest => ({
    v: 1,
    id: `r${++requestSeq}`,
    query: toWireQuery(query, { fieldOf, ...(page ? { page } : {}), ...(fields ? { select: fields } : {}) }),
    ...extra,
  });

  const columnMap = (query: DataQuery): ((field: string) => ColumnId) => {
    if (options.columnIdOf) return options.columnIdOf;
    const map = new Map<string, ColumnId>();
    for (const a of query.aggregates) map.set(fieldOf(a.columnId), a.columnId);
    for (const g of query.grouping) map.set(fieldOf(g.columnId), g.columnId);
    return (field) => map.get(field) ?? field;
  };

  const mapAggregates = (
    raw: Readonly<Record<string, Readonly<Record<string, unknown>>>> | undefined,
    query: DataQuery,
  ): AggregateValues | undefined => {
    if (!raw) return undefined;
    const toColumn = columnMap(query);
    const out: Record<ColumnId, Readonly<Record<string, unknown>>> = {};
    for (const field of Object.keys(raw)) out[toColumn(field)] = raw[field] as Readonly<Record<string, unknown>>;
    return out;
  };

  /** Starts a request on a channel: aborts the previous one, links the caller signal. */
  const begin = (name: string, request: DataSourceRequest): { ch: Channel; signal: AbortSignalLike; done: () => void } => {
    const ch = channel(name);
    ch.controller?.abort();
    const controller = createAbortController();
    ch.controller = controller;
    ch.started = Math.max(ch.started, request.version);
    const unlink = linkSignal(request.signal, controller);
    return {
      ch,
      signal: controller.signal,
      done: () => {
        unlink();
        if (ch.controller === controller) ch.controller = null;
      },
    };
  };

  const accept = (ch: Channel, version: number, signal: AbortSignalLike): void => {
    if (signal.aborted) throw abortError(signal);
    if (version < ch.applied) throw new StaleResponseError(version, ch.applied);
    ch.applied = version;
  };

  const pageOf = (request: DataSourceRequest): { page: WirePage | undefined; pageNumber: number | null } => {
    const q = request.query;
    if (request.range) return { page: { offset: request.range.start, limit: request.range.end - request.range.start }, pageNumber: null };
    if (!q.paging) return { page: undefined, pageNumber: null };
    if (paging.kind === 'cursor') {
      const n = q.paging.page;
      if (request.cursor !== undefined) return { page: { cursor: request.cursor, limit: q.paging.pageSize }, pageNumber: n };
      if (!cursors.has(n)) throw new CursorUnknownError(n);
      return { page: { cursor: cursors.get(n) ?? null, limit: q.paging.pageSize }, pageNumber: n };
    }
    return { page: { offset: (q.paging.page - 1) * q.paging.pageSize, limit: q.paging.pageSize }, pageNumber: q.paging.page };
  };

  const setMainRows = (next: Row[]): void => {
    rows = next;
    rowIndex = null;
  };

  const readMain = async (request: DataSourceRequest): Promise<DataSourceResult<Row>> => {
    resetStructural(structuralQueryKey(request.query));
    // Outstanding prefetches are aborted only after the foreground request has
    // been issued, so a foreground read of a page being prefetched joins it.
    const stalePrefetch = prefetch;
    prefetch = null;
    if (paging.kind === 'infinite') {
      stalePrefetch?.abort();
      return readInfinite(request);
    }
    const { page, pageNumber } = pageOf(request);
    const { ch, signal, done } = begin('main', request);
    try {
      const wire = readRequest(request.query, page);
      const sent = send('read', wire, signal, 'rows');
      stalePrefetch?.abort();
      const response = (await sent) as WireReadResponse;
      accept(ch, request.version, signal);
      const decoded = decodeRows(response);
      if (paging.kind === 'cursor' && pageNumber !== null && response.next !== undefined) cursors.set(pageNumber + 1, response.next);
      const result = mainResult(request, response, decoded, page);
      setMainRows(decoded);
      lastMain = { request, result };
      schedulePrefetch(request, response);
      return result;
    } finally {
      done();
    }
  };

  const mainResult = (request: DataSourceRequest, response: WireReadResponse, decoded: Row[], page: WirePage | undefined): DataSourceResult<Row> => {
    const offset = page && 'offset' in page ? page.offset : 0;
    const hasNext = response.next !== undefined ? response.next !== null : response.total !== undefined && page ? offset + decoded.length < response.total : false;
    const aggregates = mapAggregates(response.aggregates, request.query);
    return Object.freeze({
      version: request.version,
      rows: decoded,
      ...(response.total !== undefined ? { totalRowCount: response.total } : {}),
      performed: performedFor(request.query, page !== undefined),
      ...(aggregates ? { aggregates } : {}),
      pageInfo: Object.freeze({
        hasNextPage: hasNext,
        hasPreviousPage: page ? ('offset' in page ? page.offset > 0 : page.cursor !== null) : false,
        endCursor: response.next ?? null,
        startCursor: response.prev ?? null,
      }),
    });
  };

  const schedulePrefetch = (request: DataSourceRequest, response: WireReadResponse): void => {
    const adjacent = policy.prefetch?.adjacentPages ?? 0;
    const q = request.query;
    if (adjacent <= 0 || !q.paging || request.range || !(policy.cache && policy.cache.ttlMs > 0)) return;
    const controller = createAbortController();
    prefetch = controller;
    const pageCount = response.total !== undefined ? Math.max(1, Math.ceil(response.total / q.paging.pageSize)) : Infinity;
    const run = async (page: number, cursor: string | null | undefined): Promise<void> => {
      const p: WirePage =
        paging.kind === 'cursor' ? { cursor: cursor ?? null, limit: q.paging!.pageSize } : { offset: (page - 1) * q.paging!.pageSize, limit: q.paging!.pageSize };
      const res = (await send('prefetch', readRequest(q, p), controller.signal, 'rows')) as WireReadResponse;
      if (paging.kind === 'cursor' && res.next !== undefined && !controller.signal.aborted) cursors.set(page + 1, res.next);
    };
    const ignore = (): void => {};
    if (paging.kind === 'cursor') {
      // Cursors only chain forward.
      void (async () => {
        for (let k = 1; k <= adjacent; k++) {
          const page = q.paging!.page + k;
          if (page > pageCount || !cursors.has(page) || cursors.get(page) === null) return;
          await run(page, cursors.get(page));
        }
      })().catch(ignore);
      return;
    }
    for (let k = 1; k <= adjacent; k++) {
      for (const page of [q.paging.page + k, q.paging.page - k]) {
        if (page >= 1 && page <= pageCount) run(page, undefined).catch(ignore);
      }
    }
  };

  const readInfinite = async (request: DataSourceRequest): Promise<DataSourceResult<Row>> => {
    if (paging.kind !== 'infinite') throw new Error('unreachable');
    const size = paging.blockSize;
    const range = request.range ?? { start: 0, end: size };
    const first = Math.floor(range.start / size);
    const last = Math.max(first, Math.floor((Math.max(range.end, range.start + 1) - 1) / size));
    const { ch, signal, done } = begin('main', request);
    try {
      const needed: number[] = [];
      for (let b = first; b <= last; b++) if (!blocks.has(b) && (blockTotal === undefined || b * size < blockTotal)) needed.push(b);
      const load = async (b: number): Promise<[number, WireReadResponse]> => {
        let page: WirePage;
        if (paging.strategy === 'cursor') {
          if (!blockCursors.has(b)) throw new CursorUnknownError(b + 1);
          page = { cursor: blockCursors.get(b) ?? null, limit: size };
        } else page = { offset: b * size, limit: size };
        return [b, (await send('read', readRequest(request.query, page), signal, 'rows')) as WireReadResponse];
      };
      let loaded: [number, WireReadResponse][];
      if (paging.strategy === 'cursor') {
        loaded = [];
        for (const b of needed) loaded.push(await load(b));
      } else loaded = await Promise.all(needed.map(load));
      accept(ch, request.version, signal);
      let response: WireReadResponse | undefined;
      for (const [b, res] of loaded) {
        blocks.set(b, decodeRows(res));
        if (res.next !== undefined) blockCursors.set(b + 1, res.next);
        if (res.total !== undefined) blockTotal = res.total;
        response = res;
      }
      // Evict the farthest blocks beyond maxBlocks.
      const max = paging.maxBlocks;
      if (max !== undefined && blocks.size > max) {
        const order = [...blocks.keys()].sort((a, b) => Math.abs(b - first) - Math.abs(a - first) || b - a);
        for (const b of order.slice(0, blocks.size - max)) blocks.delete(b);
      }
      // Contiguous run containing the requested window.
      let lo = first;
      while (blocks.has(lo - 1)) lo--;
      const out: Row[] = [];
      let hi = lo;
      for (; blocks.has(hi); hi++) for (const r of blocks.get(hi) as Row[]) out.push(r);
      const lastBlock = blocks.get(hi - 1);
      const reachedEnd =
        blockTotal !== undefined ? hi * size >= blockTotal : lastBlock !== undefined && lastBlock.length < size ? true : blockCursors.get(hi) === null;
      const aggregates = response ? mapAggregates(response.aggregates, request.query) : undefined;
      const result: DataSourceResult<Row> = Object.freeze({
        version: request.version,
        rows: out,
        ...(blockTotal !== undefined ? { totalRowCount: blockTotal } : {}),
        performed: performedFor(request.query, true),
        ...(aggregates ? { aggregates } : {}),
        pageInfo: Object.freeze({ hasNextPage: !reachedEnd, hasPreviousPage: lo > 0, endCursor: blockCursors.get(hi) ?? null }),
        ...(lo > 0 ? { rowOffset: lo * size } : {}),
      });
      setMainRows(out);
      lastMain = { request, result };
      return result;
    } finally {
      done();
    }
  };

  const groupColumn = (query: DataQuery, depth: number): ColumnId => query.grouping[depth]?.columnId ?? '';

  const readGroup = async (request: DataSourceRequest & { groupPath: readonly GroupPathSegment[] }): Promise<GroupLoadResult<Row>> => {
    const path = request.groupPath;
    const { ch, signal, done } = begin(`group:${stableStringify(path)}`, request);
    try {
      const limit = request.range ? request.range.end - request.range.start : undefined;
      const paged = request.query.paging;
      // the root level of a paged grid pages its top-level groups in the same request.
      const page: WirePage | undefined =
        request.cursor !== undefined
          ? { cursor: request.cursor, limit: limit ?? paged?.pageSize ?? 100 }
          : request.range
            ? { offset: request.range.start, limit: limit as number }
            : path.length === 0 && paged
              ? { offset: (paged.page - 1) * paged.pageSize, limit: paged.pageSize }
              : undefined;
      const query = { ...request.query, paging: null };
      const wire = readRequest(query, page, { groupPath: path.map((s) => ({ field: fieldOf(s.columnId), key: s.key })) });
      const response = (await send('group', wire, signal, 'rows')) as WireReadResponse;
      accept(ch, request.version, signal);
      let items: (Row | GroupedRowEnvelope<Row>)[];
      if (response.groups) {
        const columnId = groupColumn(request.query, path.length);
        items = response.groups.map((g) =>
          Object.freeze({
            kind: 'group' as const,
            key: g.key,
            columnId,
            groupPath: Object.freeze([...path, { columnId, key: g.key }]),
            count: g.count,
            ...(g.aggregates ? { aggregates: mapAggregates(g.aggregates, request.query) as AggregateValues } : {}),
          }),
        );
      } else items = decodeRows(response);
      // more children exist when the server says so (`next`), else when the offset page ends before `total`.
      const offset = page && 'offset' in page ? page.offset : null;
      const hasNextPage =
        response.next !== undefined ? response.next !== null : offset !== null && response.total !== undefined ? offset + items.length < response.total : false;
      const pageInfo = Object.freeze({ hasNextPage, hasPreviousPage: offset !== null ? offset > 0 : response.prev != null, endCursor: response.next ?? null });
      return Object.freeze({
        version: request.version,
        rows: items,
        ...(response.total !== undefined ? { totalRowCount: response.total } : {}),
        performed: performedFor(request.query, page !== undefined).concat('group'),
        pageInfo,
      });
    } finally {
      done();
    }
  };

  const readTree = async (request: DataSourceRequest & { parentRowId: RowId | null }): Promise<TreeLoadResult<Row>> => {
    const parent = request.parentRowId;
    const { ch, signal, done } = begin(`tree:${parent === null ? '' : 'r:' + parent}`, request);
    try {
      // The root level pages like a main read (`pageBy: 'root'`); child levels page by `range` only.
      const page = request.range ? { offset: request.range.start, limit: request.range.end - request.range.start } : parent === null ? pageOf(request).page : undefined;
      const wire = readRequest(parent === null ? request.query : { ...request.query, paging: null }, page, { parent });
      const response = (await send('tree', wire, signal, 'rows')) as WireReadResponse;
      accept(ch, request.version, signal);
      const decoded = decodeRows(response);
      const counts = response.childCounts;
      const parents = response.parents;
      const depths = response.depths;
      const items: TreeRowEnvelope<Row>[] = decoded.map((row, i) => {
        const n = counts?.[i] ?? 0;
        const p = parents ? parents[i] : parent;
        return Object.freeze({
          kind: 'tree' as const,
          row,
          depth: depths?.[i] ?? 0,
          parentId: p === null || p === undefined ? null : String(p),
          hasChildren: n > 0,
          childCount: n,
        });
      });
      const aggregates = mapAggregates(response.aggregates, request.query);
      const offset = page && 'offset' in page ? page.offset : 0;
      return Object.freeze({
        version: request.version,
        rows: items,
        ...(response.total !== undefined ? { totalRowCount: response.total } : {}),
        performed: performedFor(request.query, page !== undefined),
        ...(aggregates ? { aggregates } : {}),
        pageInfo: Object.freeze({
          hasNextPage: response.next !== undefined ? response.next !== null : response.total !== undefined && page !== undefined ? offset + parentCount(items, parent) < response.total : false,
          endCursor: response.next ?? null,
        }),
      });
    } finally {
      done();
    }
  };

  /** Rows of a tree answer that are direct children of the requested level (paging counts them). */
  const parentCount = (items: readonly TreeRowEnvelope<Row>[], parent: RowId | null): number => {
    let n = 0;
    for (const item of items) if (item.parentId === parent) n++;
    return n;
  };

  const readFacet = async (request: DataSourceRequest & { facet: { columnId: ColumnId; search?: string; limit?: number } }): Promise<DataSourceResult<Row>> => {
    const { columnId, search, limit } = request.facet;
    const { ch, signal, done } = begin(`facet:${columnId}`, request);
    try {
      const field = fieldOf(columnId);
      const facet = { field, ...(search ? { search } : {}), ...(limit !== undefined ? { limit } : {}) };
      const wire = readRequest({ ...request.query, paging: null }, undefined, { facet, count: false });
      const response = (await send('facet', wire, signal, 'facets')) as WireReadResponse;
      accept(ch, request.version, signal);
      const f = response.facet;
      return Object.freeze({
        version: request.version,
        rows: [],
        facet: Object.freeze({
          columnId,
          entries: (f?.entries ?? []).map(([key, label, count]) => ({ key, label, count })),
          complete: f?.complete ?? true,
        }),
      });
    } finally {
      done();
    }
  };

  // ------------------------------------------------------------------------
  // Writes
  // ------------------------------------------------------------------------

  const cellKey = (rowId: RowId, columnId: ColumnId): CellKey => `${rowId}:${columnId}`;

  const write = async (request: WriteRequest<Row>): Promise<WriteResult<Row>> => {
    const optimistic = options.optimistic ?? (request.mode === 'batch' || request.mode === 'cell');
    const header = fields ?? (request.added[0] ? Object.keys(request.added[0].row as object) : []);
    const toColumn = new Map<string, ColumnId>();
    for (const c of request.changed) for (const id of c.changedColumnIds) toColumn.set(fieldOf(id), id);
    const columnIdOf = options.columnIdOf ?? ((f: string) => toColumn.get(f) ?? f);
    const wire: WireWriteRequest = {
      v: 1,
      id: `w${++requestSeq}`,
      write: {
        fields: header,
        added: request.added.map((a) => (tuple ? toTuple(a.row) : objectToTuple(a.row, header))),
        changed: request.changed.map((c) => {
          const set: Record<string, unknown> = {};
          for (const id of c.changedColumnIds) {
            const f = fieldOf(id);
            set[f] = get(c.row, f);
          }
          const version = versionOf(c.previous);
          return version === undefined ? { key: keyOf(c.row), set } : { key: keyOf(c.row), set, version };
        }),
        removed: request.deleted.map((d) => {
          const version = versionOf(d.row);
          return version === undefined ? { key: keyOf(d.row) } : { key: keyOf(d.row), version };
        }),
        ...(request.added.some((a) => a.parentId !== undefined) ? { parents: request.added.map((a) => a.parentId ?? null) } : {}),
        ...(request.moved && request.moved.parentId !== undefined
          ? { moved: { keys: request.moved.rowIds, parent: request.moved.parentId, target: request.moved.targetRowId, position: request.moved.position } }
          : {}),
      },
    };

    // Optimistic apply
    const touched = [...request.added.map((a) => a.tempId), ...request.changed.map((c) => c.rowId), ...request.deleted.map((d) => d.rowId)];
    const touchedCells: CellKey[] = [];
    for (const c of request.changed) for (const id of c.changedColumnIds) touchedCells.push(cellKey(c.rowId, id));
    const snapshot = rows;
    const tempIds = new Map<RowId, RowId>(); // rowIdOf(added row) -> tempId
    for (const a of request.added) tempIds.set(rowIdOf(a.row), a.tempId);
    if (optimistic) {
      applyLocal(request.added.map((a) => a.row), request.changed.map((c) => c.row), request.deleted.map((d) => d.rowId));
      for (const id of touched) pending.add(id);
      emitWrite(touched, touchedCells);
    }

    const { signal, done } = begin(`write:${++writeVersion}`, { version: request.version, query: null as unknown as DataQuery, signal: request.signal });
    let response: WireWriteResponse;
    try {
      response = (await send('write', wire, signal, 'rows', false)) as WireWriteResponse;
    } catch (error) {
      if (optimistic) {
        setMainRows(snapshot);
        emit(Object.freeze({ type: 'reset', rows, totalRowCount: rows.length }));
        for (const id of touched) pending.delete(id);
        emitWrite(touched, touchedCells);
      }
      throw error;
    } finally {
      done();
    }

    const echoHeader = response.fields ?? header;
    const rowErr: Record<RowId, string[]> = {};
    const cellErr: Record<CellKey, string[]> = {};
    const failed = new Set<RowId>();
    const idOfError = (e: { key?: Json; index?: number }): RowId | undefined =>
      e.index !== undefined ? request.added[e.index]?.tempId : e.key !== undefined ? String(e.key) : undefined;
    for (const e of response.errors ?? []) {
      const rowId = idOfError(e);
      if (rowId === undefined) continue;
      failed.add(rowId);
      if (e.field) (cellErr[cellKey(rowId, columnIdOf(e.field))] ??= []).push(e.message);
      else (rowErr[rowId] ??= []).push(e.message);
    }
    const changedById = new Map(request.changed.map((c) => [c.rowId, c] as const));
    const newConflicts: ConflictSnapshot<Row>[] = [];
    for (const c of response.conflicts ?? []) {
      const rowId = String(c.key);
      failed.add(rowId);
      const server = decodeOne(c.server, echoHeader);
      const local = changedById.get(rowId);
      const cells = (local?.changedColumnIds ?? []).map((columnId) => ({ columnId, local: get(local!.row, fieldOf(columnId)), server: get(server, fieldOf(columnId)) }));
      newConflicts.push(
        Object.freeze({
          rowId,
          local: (local?.row ?? server) as Row,
          server,
          base: (local?.previous ?? null) as Row | null,
          cells: Object.freeze(cells),
          ...(c.version !== undefined ? { version: c.version } : {}),
        }),
      );
    }

    const addedEcho: { tempId: RowId; row: Row }[] = [];
    const changedEcho: { rowId: RowId; row: Row }[] = [];
    const deletedOk: RowId[] = [];
    const deletedIds = new Set(request.deleted.map((d) => d.rowId));
    for (const ok of response.ok ?? []) {
      if (ok.index !== undefined) {
        const a = request.added[ok.index];
        if (a) addedEcho.push({ tempId: a.tempId, row: ok.row ? decodeOne(ok.row, echoHeader) : a.row });
        continue;
      }
      const rowId = String(ok.key);
      if (deletedIds.has(rowId)) deletedOk.push(rowId);
      else {
        const c = changedById.get(rowId);
        if (c) changedEcho.push({ rowId, row: ok.row ? decodeOne(ok.row, echoHeader) : c.row });
      }
    }

    // Reconcile local rows
    const echoIds: RowId[] = [];
    const next = rows.slice();
    const idx = new Map<RowId, number>();
    for (let i = 0; i < next.length; i++) idx.set(rowIdOf(next[i] as Row), i);
    let structuralChange = false;
    const placeAdded = (tempRow: Row, row: Row | null): void => {
      const at = idx.get(rowIdOf(tempRow));
      if (row === null) {
        if (at !== undefined) next.splice(at, 1);
        structuralChange = true;
      } else if (at !== undefined) next[at] = row;
      else {
        next.push(row);
        structuralChange = true;
      }
    };
    if (optimistic) {
      for (const a of request.added) {
        const echo = addedEcho.find((e) => e.tempId === a.tempId);
        placeAdded(a.row, echo ? echo.row : failed.has(a.tempId) ? null : a.row);
        if (echo && rowIdOf(echo.row) !== rowIdOf(a.row)) structuralChange = true;
      }
      for (const c of request.changed) {
        const at = idx.get(c.rowId);
        if (at === undefined) continue;
        const echo = changedEcho.find((e) => e.rowId === c.rowId);
        if (echo) next[at] = echo.row;
        else if (failed.has(c.rowId)) next[at] = c.previous;
        echoIds.push(c.rowId);
      }
      for (const d of request.deleted) {
        if (failed.has(d.rowId)) {
          const original = snapshot.findIndex((r) => rowIdOf(r) === d.rowId);
          next.splice(Math.min(Math.max(original, 0), next.length), 0, d.row);
          structuralChange = true;
        }
      }
    } else {
      for (const echo of addedEcho) placeAdded(echo.row, echo.row);
      for (const echo of changedEcho) {
        const at = idx.get(echo.rowId);
        if (at !== undefined) {
          next[at] = echo.row;
          echoIds.push(echo.rowId);
        }
      }
      if (deletedOk.length) {
        const drop = new Set(deletedOk);
        for (let i = next.length - 1; i >= 0; i--) if (drop.has(rowIdOf(next[i] as Row))) next.splice(i, 1);
        structuralChange = true;
      }
    }
    // Row reorder (`moved` hint): place the rows in the cached page once the server accepted them.
    if (request.moved && failed.size === 0 && placeRows(next, request.moved)) structuralChange = true;
    setMainRows(next);
    if (structuralChange) emit(Object.freeze({ type: 'reset', rows, totalRowCount: response.total ?? rows.length }));
    else if (echoIds.length) emit(Object.freeze({ type: 'patch', rows, updated: Object.freeze(echoIds), added: EMPTY_IDS, removed: EMPTY_IDS, ...(response.total !== undefined ? { totalRowCount: response.total } : {}) }));

    // Write state
    for (const id of touched) pending.delete(id);
    const clearedRows = touched.filter((id) => !failed.has(id));
    const nextRowErrors = { ...rowErrors };
    const nextCellErrors = { ...cellErrors };
    for (const id of touched) delete nextRowErrors[id];
    for (const key of Object.keys(nextCellErrors) as CellKey[]) if (touched.includes(key.slice(0, key.lastIndexOf(':')))) delete nextCellErrors[key];
    rowErrors = Object.freeze({ ...nextRowErrors, ...rowErr });
    cellErrors = Object.freeze({ ...nextCellErrors, ...cellErr });
    conflicts = [...conflicts.filter((c) => !touched.includes(c.rowId)), ...newConflicts];
    emitWrite([...new Set([...touched, ...clearedRows])], [...new Set([...touchedCells, ...(Object.keys(cellErr) as CellKey[])])]);

    const okCount = addedEcho.length + changedEcho.length + deletedOk.length;
    const status = failed.size === 0 ? 'applied' : okCount > 0 ? 'partial' : 'rejected';
    if (okCount > 0 && (policy.invalidate ?? 'onWrite') === 'onWrite') runner.invalidate('all');
    return Object.freeze({
      version: request.version,
      status,
      added: addedEcho,
      changed: changedEcho,
      deleted: deletedOk,
      ...(Object.keys(rowErr).length ? { rowErrors: rowErr } : {}),
      ...(Object.keys(cellErr).length ? { cellErrors: cellErr } : {}),
      ...(newConflicts.length ? { conflicts: newConflicts } : {}),
      ...(response.total !== undefined ? { totalRowCount: response.total } : {}),
    });
  };

  /** Moves `placement.rowIds` next to the target inside `list` (in place); false when nothing moved. */
  const placeRows = (list: Row[], placement: RowPlacement): boolean => {
    const moving = new Set(placement.rowIds);
    const picked = new Map<RowId, Row>();
    for (const row of list) if (moving.has(rowIdOf(row))) picked.set(rowIdOf(row), row);
    if (picked.size === 0) return false;
    const rest = list.filter((row) => !moving.has(rowIdOf(row)));
    let at: number;
    if (placement.targetRowId === null) at = placement.position === 'before' ? 0 : rest.length;
    else {
      const t = rest.findIndex((row) => rowIdOf(row) === placement.targetRowId);
      if (t < 0) return false;
      at = t + (placement.position === 'after' ? 1 : 0);
    }
    const ordered = placement.rowIds.flatMap((id) => (picked.has(id) ? [picked.get(id) as Row] : []));
    rest.splice(at, 0, ...ordered);
    let same = true;
    for (let i = 0; i < rest.length; i++) if (rest[i] !== list[i]) same = false;
    if (same) return false;
    for (let i = 0; i < rest.length; i++) list[i] = rest[i] as Row;
    return true;
  };

  /** Applies drafts to the local rows and emits one event. */
  const applyLocal = (added: readonly Row[], changed: readonly Row[], removed: readonly RowId[]): void => {
    const map = index();
    const next = rows.slice();
    const updated: RowId[] = [];
    for (const row of changed) {
      const at = map.get(rowIdOf(row));
      if (at !== undefined) {
        next[at] = row;
        updated.push(rowIdOf(row));
      }
    }
    let structural = false;
    if (removed.length) {
      const drop = new Set(removed);
      for (let i = next.length - 1; i >= 0; i--) {
        if (drop.has(rowIdOf(next[i] as Row))) {
          next.splice(i, 1);
          structural = true;
        }
      }
    }
    const addedIds: RowId[] = [];
    for (const row of added) {
      next.push(row);
      addedIds.push(rowIdOf(row));
    }
    setMainRows(next);
    if (structural) emit(Object.freeze({ type: 'reset', rows, totalRowCount: rows.length }));
    else emit(Object.freeze({ type: 'patch', rows, updated: Object.freeze(updated), added: Object.freeze(addedIds), removed: EMPTY_IDS }));
  };

  // ------------------------------------------------------------------------

  const read = (request: DataSourceRequest): Promise<DataSourceResult<any>> => {
    try {
      if (request.groupPath) return readGroup(request as DataSourceRequest & { groupPath: readonly GroupPathSegment[] });
      if (request.parentRowId !== undefined) return readTree(request as DataSourceRequest & { parentRowId: RowId | null });
      if (request.facet) return readFacet(request as DataSourceRequest & { facet: { columnId: ColumnId; search?: string; limit?: number } });
      return readMain(request);
    } catch (error) {
      return Promise.reject(error);
    }
  };

  const capabilities: Partial<DataSourceCapabilities> = Object.freeze({
    facets: true,
    lazyGroups: true,
    treeChildren: true,
    cursor: paging.kind === 'cursor' || (paging.kind === 'infinite' && paging.strategy === 'cursor'),
    infinite: paging.kind === 'infinite',
    lookups: false,
    write: true,
    exportJobs: false,
    reload: true,
    ...options.capabilities,
  });

  return {
    mode: 'remote',
    capabilities,
    read: read as JsonDataSource<Row>['read'],
    write,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    invalidate(scope = 'all') {
      runner.invalidate(scope);
      if (scope === 'rows' || scope === 'all') {
        structural = '';
        cursors.clear();
        blocks = new Map();
        blockCursors = new Map();
        blockTotal = undefined;
        abortChannels((name) => name.startsWith('group:') || name.startsWith('tree:'));
      }
      if (scope === 'facets' || scope === 'all') abortChannels((name) => name.startsWith('facet:'));
    },
    canReload: () => !channels.get('main')?.controller,
    reload(signal) {
      if (!lastMain) return Promise.reject(new Error('reload: nothing was read yet.'));
      runner.invalidate('rows');
      if (paging.kind === 'infinite') {
        blocks = new Map();
      }
      const { request } = lastMain;
      const controller = createAbortController();
      linkSignal(signal, controller);
      return readMain({ ...request, version: Math.max(request.version, channel('main').applied), signal: controller.signal });
    },
    getRows: () => rows,
    getWriteState: () => Object.freeze({ pending: new Set(pending), rowErrors, cellErrors, conflicts: Object.freeze([...conflicts]) }),
    subscribeWriteState(listener) {
      writeListeners.add(listener);
      return () => {
        writeListeners.delete(listener);
      };
    },
    dismissConflict(rowId) {
      const before = conflicts.length;
      conflicts = conflicts.filter((c) => c.rowId !== rowId);
      if (conflicts.length !== before) emitWrite([rowId], []);
    },
    getStats: () => ({ ...runner.stats }),
  };
}
