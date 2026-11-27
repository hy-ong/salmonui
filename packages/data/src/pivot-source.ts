// Remote pivot source over the JSON protocol. `createJsonPivotSource`
// sends `pivot` requests (result windows, drill-through pages) and `facet`
// requests (member lists) through the same transports, policy (cache, dedupe,
// retry) and hooks as `createJsonDataSource`. `source.createEngine()` is the
// window-based remote engine the React layer drives like the local engine:
// a store (`subscribe` / `getSnapshot`) whose snapshot reads like a
// `PivotResult` for the windows loaded so far. Structurally typed: no
// package imports.

import { stableStringify } from './canonical.js';
import { createRequestRunner, type CacheScope, type RunnerStats } from './policy.js';
import type {
  WirePivotHeader,
  WirePivotModel,
  WirePivotRequest,
  WirePivotResponse,
  WirePivotWindow,
  WirePredicate,
  WireReadRequest,
  WireReadResponse,
  WireAnyRequest,
  WireAnyResponse,
  WireType,
} from './protocol.js';
import { toWirePivotModel } from './pivot-wire.js';
import { RequestCanceledError } from './json-source.js';
import { createAbortController, systemScheduler, type AbortControllerLike } from './scheduler.js';
import { createBatchingFetchTransport, createFetchTransport, ProtocolError, type PivotJsonTransport } from './transport.js';
import type { AbortSignalLike, FetchLike, Json, RequestPolicy, Scheduler } from './types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type PivotRequestKind = 'pivot' | 'facet';

export interface PivotRequestEvent {
  readonly kind: PivotRequestKind;
  readonly request: WireAnyRequest;
}
export interface PivotResponseEvent extends PivotRequestEvent {
  readonly response: WireAnyResponse;
  readonly durationMs: number;
}
export interface PivotRequestErrorEvent extends PivotRequestEvent {
  readonly error: unknown;
}

export interface JsonPivotSourceOptions {
  /** Endpoint for the default fetch transport. Ignored when `transport` is set. */
  readonly url?: string;
  readonly fetch?: FetchLike;
  /** Request headers (auth), or a function read per request. */
  readonly headers?: Readonly<Record<string, string>> | (() => Readonly<Record<string, string>>);
  /** Multiplex same-tick requests into one `{ v: 1, batch }` POST. Default true. */
  readonly batch?: boolean;
  /** Custom transport (auth refresh, signing, WebSocket, in-process handler). */
  readonly transport?: PivotJsonTransport;
  /** Cache, dedupe and retry, as `createJsonDataSource`. */
  readonly policy?: RequestPolicy;
  readonly scheduler?: Scheduler;
  /** Called before every request; `return false` cancels it (`RequestCanceledError`). Mutate nothing: replace through `transport`. */
  readonly onRequest?: (event: PivotRequestEvent) => boolean | void;
  /** Called with every successful response; returning an object replaces it. */
  readonly onResponse?: (event: PivotResponseEvent) => WireAnyResponse | void;
  readonly onError?: (event: PivotRequestErrorEvent) => void;
}

export interface PivotWindowQuery {
  readonly model: WirePivotModel;
  readonly where?: WirePredicate;
  readonly window: WirePivotWindow;
  /** Default true. */
  readonly headers?: boolean;
  readonly signal?: AbortSignalLike;
}

export interface PivotDrillThroughQuery {
  readonly model: WirePivotModel;
  readonly where?: WirePredicate;
  readonly rowPath: readonly Json[];
  readonly columnPath: readonly Json[];
  readonly value?: string;
  readonly page: { readonly offset: number; readonly limit: number };
  readonly select?: readonly string[];
  readonly signal?: AbortSignalLike;
}

/** Raw rows behind one cell: objects, dates as `Date`. */
export interface PivotDrillThroughPage {
  readonly rows: readonly Record<string, unknown>[];
  readonly fields: readonly string[];
  readonly total: number;
}

/** A member of a field (`PivotMember`). */
export interface RemotePivotMember {
  readonly key: Json;
  readonly label: string;
  readonly count: number;
}

export interface JsonPivotSource {
  readonly mode: 'remote';
  readonly kind: 'pivot';
  /** One result window. Rejects with `ProtocolError` `pivot/unsupported-aggregate` before sending a model with a client-side aggregator. */
  query(query: PivotWindowQuery): Promise<WirePivotResponse>;
  /** Raw rows behind one cell, paged. */
  drillThrough(query: PivotDrillThroughQuery): Promise<PivotDrillThroughPage>;
  /** Members of a field through the `facet` request (member editor, filter axis). */
  members(field: string, options?: { readonly where?: WirePredicate; readonly search?: string; readonly limit?: number; readonly signal?: AbortSignalLike }): Promise<{ readonly members: readonly RemotePivotMember[]; readonly complete: boolean }>;
  /** The window-based remote engine (one per `PivotTable`). */
  createEngine(options?: RemotePivotEngineOptions): RemotePivotEngine;
  /** Clears cached responses. */
  invalidate(): void;
  getStats(): Readonly<RunnerStats>;
}

export interface RemotePivotEngineOptions {
  readonly model?: WirePivotModel;
  /** Pre-aggregation filter over raw rows. */
  readonly where?: WirePredicate;
  readonly locale?: string;
  /** First window. Default 100 rows × 50 columns. */
  readonly window?: WirePivotWindow;
  /** Positions loaded beyond a requested window on each side. Default 40 rows, 10 columns. */
  readonly overscan?: { readonly rows?: number; readonly columns?: number };
  /** Loaded windows kept per result. Default 16. */
  readonly maxBlocks?: number;
  /** Cell text (default: `Intl.NumberFormat` with `model.formats[measure].number`). */
  readonly formatValue?: (value: number, measure: string | null, model: WirePivotModel) => string;
}

/** A header node as `PivotHeaderNode`. */
export interface RemotePivotHeader {
  readonly key: string;
  readonly axis: 'rows' | 'columns';
  readonly kind: 'member' | 'subtotal' | 'grandTotal' | 'value';
  readonly path: readonly Json[];
  readonly field: string | null;
  readonly measure: string | null;
  readonly label: string;
  readonly depth: number;
  readonly position: number;
  readonly span: number;
  readonly expandable: boolean;
  readonly expanded: boolean;
  readonly children?: readonly RemotePivotHeader[];
}

/** A cell as `PivotCell`. `rawValue` equals `value` and `rowCount` is 0: use `drillThrough`. */
export interface RemotePivotCell {
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly rowKey: string;
  readonly columnKey: string;
  readonly measure: string | null;
  readonly value: number | null;
  readonly rawValue: number | null;
  readonly formattedValue: string;
  readonly kind: 'value' | 'subtotal' | 'grandTotal';
  readonly rowCount: number;
}

/**
 * The snapshot of a remote engine: a `PivotResult` over the loaded windows.
 * Trees hold the header nodes of the loaded windows only; `memberAt` of a
 * position outside them returns a placeholder (`key: ''`, `label: ''`) and
 * `valueAt` returns null (check `isLoaded`); `rowsAt` is empty (raw rows stay
 * on the server).
 */
export interface RemotePivotResult {
  readonly remote: true;
  readonly version: number;
  /** Server result version; '' before the first response. */
  readonly resultVersion: string;
  readonly model: WirePivotModel;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly rowTree: readonly RemotePivotHeader[];
  readonly columnTree: readonly RemotePivotHeader[];
  readonly columnDepth: number;
  readonly rowDepth: number;
  memberAt(axis: 'rows' | 'columns', index: number): RemotePivotHeader;
  valueAt(rowIndex: number, columnIndex: number): number | null;
  cellAt(rowIndex: number, columnIndex: number): RemotePivotCell;
  rowsAt(rowIndex: number, columnIndex: number): readonly number[];
  isLoaded(rowIndex: number, columnIndex: number): boolean;
}

export type RemotePivotStatus = 'idle' | 'computing' | 'ready' | 'error';

export interface RemotePivotEngine {
  readonly remote: true;
  subscribe(listener: () => void): () => void;
  getSnapshot(): RemotePivotResult;
  getStatus(): RemotePivotStatus;
  getError(): unknown;
  getModel(): WirePivotModel;
  /** New model (drill, filter, sort, field moves): one `pivot` request; aborts its predecessor. */
  setModel(input: WirePivotModel | ((model: WirePivotModel) => WirePivotModel)): Promise<RemotePivotResult>;
  setWhere(where: WirePredicate | undefined): Promise<RemotePivotResult>;
  /** Visible window (overscan added); cells only while the headers are held. */
  setWindow(window: WirePivotWindow): Promise<RemotePivotResult>;
  expand(path: readonly Json[]): Promise<RemotePivotResult>;
  collapse(path: readonly Json[]): Promise<RemotePivotResult>;
  expandAll(): Promise<RemotePivotResult>;
  collapseAll(axis?: 'rows' | 'columns'): Promise<RemotePivotResult>;
  getMembers(field: string, options?: { readonly search?: string; readonly limit?: number }): Promise<readonly RemotePivotMember[]>;
  drillThrough(rowIndex: number, columnIndex: number, options?: { readonly page?: { readonly offset: number; readonly limit: number }; readonly select?: readonly string[] }): Promise<PivotDrillThroughPage>;
  /** A standalone result of one window of the current model (export paging); not merged into the view. */
  loadWindow(window: WirePivotWindow, options?: { readonly signal?: AbortSignalLike }): Promise<RemotePivotResult>;
  refresh(): Promise<RemotePivotResult>;
  destroy(): void;
}

// ---------------------------------------------------------------------------
// Result state
// ---------------------------------------------------------------------------

interface Block {
  readonly r0: number;
  readonly r1: number;
  readonly c0: number;
  readonly c1: number;
  readonly cells: readonly (readonly (number | null)[])[];
  readonly kinds: readonly string[] | undefined;
}

interface Axis {
  readonly name: 'rows' | 'columns';
  readonly nodes: Map<string, RemotePivotHeader & { children?: RemotePivotHeader[] }>;
  readonly roots: RemotePivotHeader[];
  readonly leaves: Map<number, RemotePivotHeader>;
  /** Sorted disjoint `[start, end)` ranges whose headers are held. */
  held: [number, number][];
}

const EMPTY: readonly never[] = Object.freeze([]);

const axis = (name: 'rows' | 'columns'): Axis => ({ name, nodes: new Map(), roots: [], leaves: new Map(), held: [] });

const covers = (held: readonly [number, number][], s: number, e: number): boolean => e <= s || held.some(([a, b]) => a <= s && e <= b);

function hold(held: [number, number][], s: number, e: number): [number, number][] {
  const all = [...held, [s, e] as [number, number]].sort((x, y) => x[0] - y[0]);
  const out: [number, number][] = [];
  for (const r of all) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

function addHeaders(ax: Axis, headers: readonly WirePivotHeader[], s: number, e: number): void {
  const stack: (RemotePivotHeader & { children?: RemotePivotHeader[] })[] = [];
  for (const h of headers) {
    // Depth-first order: the parent is the nearest shallower node on the stack (depths may skip levels).
    while (stack.length > 0 && (stack[stack.length - 1] as RemotePivotHeader).depth >= h.depth) stack.pop();
    // Keyed by position too: keys are unique per axis, but a node map must not merge nodes if a result breaks that.
    const id = `${h.position}:${h.depth}:${h.key}`;
    let node = ax.nodes.get(id);
    if (!node) {
      node = {
        key: h.key,
        axis: ax.name,
        kind: h.kind,
        path: h.path,
        field: h.field ?? null,
        measure: h.measure ?? null,
        label: h.label,
        depth: h.depth,
        position: h.position,
        span: h.span,
        expandable: h.expandable === true,
        expanded: h.expanded === true,
      };
      ax.nodes.set(id, node);
      const parent = stack[stack.length - 1];
      const list = parent ? (parent.children ??= []) : ax.roots;
      let at = list.length;
      while (at > 0 && (list[at - 1] as RemotePivotHeader).position > node.position) at--;
      list.splice(at, 0, node);
    }
    stack.push(node);
    for (let p = Math.max(s, h.position); p < Math.min(e, h.position + h.span); p++) {
      const leaf = ax.leaves.get(p);
      if (!leaf || leaf.depth <= node.depth) ax.leaves.set(p, node);
    }
  }
  ax.held = hold(ax.held, s, e);
}

interface ResultState {
  resultVersion: string;
  readonly model: WirePivotModel;
  rowCount: number;
  columnCount: number;
  rowDepth: number;
  columnDepth: number;
  readonly rows: Axis;
  readonly columns: Axis;
  blocks: Block[];
}

const newState = (model: WirePivotModel): ResultState => ({ resultVersion: '', model, rowCount: 0, columnCount: 0, rowDepth: 0, columnDepth: 0, rows: axis('rows'), columns: axis('columns'), blocks: [] });

function applyResponse(state: ResultState, response: WirePivotResponse, w: WirePivotWindow, maxBlocks: number): void {
  state.resultVersion = response.resultVersion ?? state.resultVersion;
  state.rowCount = response.rowCount ?? state.rowCount;
  state.columnCount = response.columnCount ?? state.columnCount;
  state.rowDepth = response.rowDepth ?? state.rowDepth;
  state.columnDepth = response.columnDepth ?? state.columnDepth;
  const r0 = Math.min(w.rows[0], state.rowCount);
  const r1 = Math.min(Math.max(r0, w.rows[1]), state.rowCount);
  const c0 = Math.min(w.columns[0], state.columnCount);
  const c1 = Math.min(Math.max(c0, w.columns[1]), state.columnCount);
  if (response.rowHeaders) addHeaders(state.rows, response.rowHeaders, r0, r1);
  if (response.columnHeaders) addHeaders(state.columns, response.columnHeaders, c0, c1);
  if (response.cells) {
    state.blocks.push({ r0, r1, c0, c1, cells: response.cells, kinds: response.kinds });
    if (state.blocks.length > maxBlocks) state.blocks.splice(0, state.blocks.length - maxBlocks);
  }
}

type Formatter = (value: number, measure: string | null) => string;

function snapshot(state: ResultState, version: number, format: Formatter): RemotePivotResult {
  const placeholder = (ax: 'rows' | 'columns', index: number): RemotePivotHeader => ({
    key: '',
    axis: ax,
    kind: 'member',
    path: EMPTY,
    field: null,
    measure: null,
    label: '',
    depth: 0,
    position: index,
    span: 1,
    expandable: false,
    expanded: false,
  });
  const memberAt = (ax: 'rows' | 'columns', index: number): RemotePivotHeader => state[ax].leaves.get(index) ?? placeholder(ax, index);
  const find = (r: number, c: number): Block | undefined => {
    for (let i = state.blocks.length - 1; i >= 0; i--) {
      const b = state.blocks[i] as Block;
      if (r >= b.r0 && r < b.r1 && c >= b.c0 && c < b.c1) return b;
    }
    return undefined;
  };
  const valueAt = (r: number, c: number): number | null => {
    const b = find(r, c);
    return b ? ((b.cells[r - b.r0]?.[c - b.c0] as number | null | undefined) ?? null) : null;
  };
  return Object.freeze({
    remote: true as const,
    version,
    resultVersion: state.resultVersion,
    model: state.model,
    rowCount: state.rowCount,
    columnCount: state.columnCount,
    rowDepth: state.rowDepth,
    columnDepth: state.columnDepth,
    rowTree: state.rows.roots,
    columnTree: state.columns.roots,
    memberAt,
    valueAt,
    isLoaded: (r: number, c: number) => find(r, c) !== undefined,
    rowsAt: () => EMPTY,
    cellAt(r: number, c: number): RemotePivotCell {
      const row = memberAt('rows', r);
      const column = memberAt('columns', c);
      const b = find(r, c);
      const value = b ? ((b.cells[r - b.r0]?.[c - b.c0] as number | null | undefined) ?? null) : null;
      const measure = column.measure ?? row.measure;
      const k = b?.kinds?.[r - b.r0]?.[c - b.c0];
      return {
        rowIndex: r,
        columnIndex: c,
        rowKey: row.key,
        columnKey: column.key,
        measure,
        value,
        rawValue: value,
        formattedValue: value === null ? '' : format(value, measure),
        kind: k === '2' ? 'grandTotal' : k === '1' ? 'subtotal' : 'value',
        rowCount: 0,
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Source
// ---------------------------------------------------------------------------

let requestSeq = 0;
/** Show-as kinds whose values are ratios (formatted as percent by default). */
const PERCENT = /^percentOf/;
const BLANK = '__salmon_ui_blank__';

function memberFilters(model: WirePivotModel, except: string): WirePredicate[] {
  const out: WirePredicate[] = [];
  const by = (model.filterBy ?? {}) as Readonly<Record<string, { include?: readonly Json[]; exclude?: readonly Json[] }>>;
  for (const field of Object.keys(by)) {
    if (field === except) continue;
    const f = by[field];
    if (f?.include) out.push({ field, op: 'in', value: f.include as Json[] });
    else if (f?.exclude) out.push({ field, op: 'notIn', value: f.exclude as Json[] });
  }
  return out;
}

const decodeKey = (key: string, type: WireType | undefined): Json =>
  key === BLANK ? null : type === 'number' || type === 'date' ? Number(key) : type === 'boolean' ? key === 'true' : key;

/** Remote pivot source over the Salmon UI JSON protocol. */
export function createJsonPivotSource(options: JsonPivotSourceOptions): JsonPivotSource {
  const scheduler = options.scheduler ?? systemScheduler();
  const runner = createRequestRunner(options.policy ?? {}, scheduler);
  let transport: PivotJsonTransport | null = options.transport ?? null;
  const getTransport = (): PivotJsonTransport => {
    if (transport) return transport;
    if (!options.url) throw new Error('createJsonPivotSource: pass url or transport.');
    const http = { url: options.url, ...(options.fetch ? { fetch: options.fetch } : {}), ...(options.headers ? { headers: options.headers } : {}) };
    transport = options.batch === false ? createFetchTransport(http) : createBatchingFetchTransport(http);
    return transport;
  };

  const send = async (kind: PivotRequestKind, wire: WireAnyRequest, signal: AbortSignalLike, scope: CacheScope): Promise<WireAnyResponse> => {
    if (options.onRequest?.({ kind, request: wire }) === false) throw new RequestCanceledError(`${kind} request canceled by onRequest.`);
    const { id: _id, ...rest } = wire;
    const started = scheduler.now();
    try {
      const response = await runner.run(stableStringify(rest), scope, signal, async (s) => {
        const res = await getTransport()(wire, { signal: s });
        if (res.error) throw new ProtocolError(res.error.code, res.error.message);
        return res;
      });
      const replaced: unknown = options.onResponse?.({ kind, request: wire, response, durationMs: scheduler.now() - started });
      return typeof replaced === 'object' && replaced !== null ? (replaced as WireAnyResponse) : response;
    } catch (error) {
      if (!signal.aborted) options.onError?.({ kind, request: wire, error });
      throw error;
    }
  };
  const never = createAbortController().signal;

  const pivotRequest = (model: WirePivotModel, where: WirePredicate | undefined, body: Omit<WirePivotRequest['pivot'], 'model' | 'where'>): WirePivotRequest => ({
    v: 1,
    id: `p${++requestSeq}`,
    pivot: { model: toWirePivotModel(model), ...(where ? { where } : {}), ...body },
  });

  let types: Promise<Readonly<Record<string, WireType>>> | null = null;
  /** Field wire types, read once (one-row `read`), to type member keys. */
  const fieldTypes = (): Promise<Readonly<Record<string, WireType>>> =>
    (types ??= (async () => {
      const wire: WireReadRequest = { v: 1, id: `p${++requestSeq}`, query: { page: { offset: 0, limit: 1 } }, count: false };
      try {
        const r = (await send('facet', wire, never, 'rows')) as WireReadResponse;
        const out: Record<string, WireType> = {};
        r.fields.forEach((f, i) => (out[f] = r.types?.[i] ?? 'string'));
        return out;
      } catch {
        types = null;
        return {};
      }
    })());

  const source: JsonPivotSource = {
    mode: 'remote',
    kind: 'pivot',
    async query(q) {
      const wire = pivotRequest(q.model, q.where, { window: q.window, ...(q.headers === false ? { headers: false } : {}) });
      return (await send('pivot', wire, q.signal ?? never, 'rows')) as WirePivotResponse;
    },
    async drillThrough(q) {
      const wire = pivotRequest(q.model, q.where, {
        drillThrough: { rowPath: q.rowPath, columnPath: q.columnPath, ...(q.value !== undefined ? { value: q.value } : {}), page: q.page, ...(q.select ? { select: q.select } : {}) },
      });
      const r = (await send('pivot', wire, q.signal ?? never, 'rows')) as WirePivotResponse;
      const fields = r.fields ?? [];
      const rows = (r.rows ?? []).map((t) => {
        const o: Record<string, unknown> = {};
        fields.forEach((f, i) => {
          let v = t[i];
          const dict = r.dict?.[f];
          if (dict && typeof v === 'number') v = dict[v];
          o[f] = r.types?.[i] === 'date' && typeof v === 'number' ? new Date(v) : v;
        });
        return o;
      });
      return { rows, fields, total: r.total ?? rows.length };
    },
    async members(field, o = {}) {
      const known = await fieldTypes();
      const where = o.where;
      const wire: WireReadRequest = {
        v: 1,
        id: `p${++requestSeq}`,
        query: where ? { where } : {},
        facet: { field, ...(o.search ? { search: o.search } : {}), ...(o.limit !== undefined ? { limit: o.limit } : {}) },
        count: false,
      };
      const r = (await send('facet', wire, o.signal ?? never, 'facets')) as WireReadResponse;
      return {
        members: (r.facet?.entries ?? []).map(([key, label, count]) => ({ key: decodeKey(key, known[field]), label, count })),
        complete: r.facet?.complete ?? true,
      };
    },
    createEngine: (o) => createRemotePivotEngine(source, o ?? {}),
    invalidate: () => runner.invalidate('all'),
    getStats: () => ({ ...runner.stats }),
  };
  return source;
}

// ---------------------------------------------------------------------------
// Remote engine
// ---------------------------------------------------------------------------

function createRemotePivotEngine(source: JsonPivotSource, options: RemotePivotEngineOptions): RemotePivotEngine {
  let model: WirePivotModel = options.model ?? {};
  let where = options.where;
  const overscanRows = options.overscan?.rows ?? 40;
  const overscanColumns = options.overscan?.columns ?? 10;
  const maxBlocks = options.maxBlocks ?? 16;
  let view: WirePivotWindow = options.window ?? { rows: [0, 100], columns: [0, 50] };
  let state = newState(model);
  let version = 0;
  let status: RemotePivotStatus = 'idle';
  let error: unknown = null;
  let destroyed = false;
  let channel: AbortControllerLike | null = null;
  const listeners = new Set<() => void>();
  const formatters = new Map<string, Intl.NumberFormat>();
  // The engine's defaults: `formats[measure]` (or the calculated field's), else 2 fraction digits, percent for percent show-as kinds.
  const format: Formatter = (value, measure) => {
    const m = state.model;
    if (options.formatValue) return options.formatValue(value, measure, m);
    type Format = { readonly number?: Intl.NumberFormatOptions; readonly locale?: string };
    const f = measure ? ((m.formats as Readonly<Record<string, Format>> | undefined)?.[measure] ?? (m.calculatedFields?.find((c) => c.name === measure)?.format as Format | undefined)) : undefined;
    const kind = (m.values?.find((v) => v.field === measure)?.showAs as { kind?: string } | undefined)?.kind;
    const opts = f?.number ?? (kind && PERCENT.test(kind) ? { style: 'percent' as const, maximumFractionDigits: 2 } : { maximumFractionDigits: 2 });
    const locale = f?.locale ?? options.locale ?? 'en-US';
    const key = `${locale}|${stableStringify(opts)}`;
    let nf = formatters.get(key);
    if (!nf) {
      nf = new Intl.NumberFormat(locale, opts);
      formatters.set(key, nf);
    }
    return nf.format(value);
  };
  let current = snapshot(state, version, format);
  const publish = (): RemotePivotResult => {
    current = snapshot(state, ++version, format);
    for (const l of listeners) l();
    return current;
  };

  const clamp = (w: WirePivotWindow, known: boolean): WirePivotWindow => {
    const rows = known ? state.rowCount : Number.MAX_SAFE_INTEGER;
    const cols = known ? state.columnCount : Number.MAX_SAFE_INTEGER;
    const r0 = Math.max(0, Math.min(rows, w.rows[0] - overscanRows));
    const c0 = Math.max(0, Math.min(cols, w.columns[0] - overscanColumns));
    return { rows: [r0, Math.max(r0, Math.min(rows, w.rows[1] + overscanRows))], columns: [c0, Math.max(c0, Math.min(cols, w.columns[1] + overscanColumns))] };
  };

  /** Loads a window into the current state (`fresh`: a new model or where). */
  const load = async (fresh: boolean): Promise<RemotePivotResult> => {
    if (destroyed) return current;
    channel?.abort();
    const controller = createAbortController();
    channel = controller;
    const target = fresh ? newState(model) : state;
    const w = clamp(view, !fresh && state.resultVersion !== '');
    const headers = fresh || !covers(target.rows.held, w.rows[0], w.rows[1]) || !covers(target.columns.held, w.columns[0], w.columns[1]);
    if (!headers && target.blocks.some((b) => b.r0 <= w.rows[0] && w.rows[1] <= b.r1 && b.c0 <= w.columns[0] && w.columns[1] <= b.c1)) return current;
    if (fresh) {
      status = 'computing';
      publish();
    }
    try {
      let response = await source.query({ model: target.model, ...(where ? { where } : {}), window: w, headers, signal: controller.signal });
      if (!headers && response.resultVersion !== target.resultVersion) {
        // The data changed on the server: the held headers are stale.
        response = await source.query({ model: target.model, ...(where ? { where } : {}), window: w, signal: controller.signal });
        state = newState(model);
      } else {
        state = target;
      }
      applyResponse(state, response, w, maxBlocks);
      status = 'ready';
      error = null;
    } catch (e) {
      if (controller.signal.aborted) return current;
      status = 'error';
      error = e;
      publish();
      throw e;
    } finally {
      if (channel === controller) channel = null;
    }
    return publish();
  };

  const expandedList = (): readonly (readonly Json[])[] | 'all' => model.expanded ?? [];
  const same = (a: readonly Json[], b: readonly Json[]): boolean => stableStringify(a) === stableStringify(b);

  const engine: RemotePivotEngine = {
    remote: true,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => current,
    getStatus: () => status,
    getError: () => error,
    getModel: () => model,
    async setModel(input) {
      const next = typeof input === 'function' ? input(model) : input;
      // Validates before anything is sent (custom aggregators stay on the client).
      toWirePivotModel(next);
      model = next;
      return load(true);
    },
    setWhere(next) {
      where = next;
      return load(true);
    },
    setWindow(next) {
      view = next;
      return load(false);
    },
    expand(path) {
      const list = expandedList();
      if (list === 'all' || list.some((p) => same(p, path))) return Promise.resolve(current);
      return engine.setModel({ ...model, expanded: [...list, path] });
    },
    collapse(path) {
      let list = expandedList();
      if (list === 'all') {
        // `'all'` minus one member: the expanded members of the held headers, without it.
        const held: (readonly Json[])[] = [];
        for (const ax of [state.rows, state.columns]) for (const n of ax.nodes.values()) if (n.expanded) held.push([ax.name, ...n.path]);
        list = held;
      }
      const prefix = stableStringify(path).slice(0, -1);
      return engine.setModel({ ...model, expanded: list.filter((p) => !same(p, path) && !stableStringify(p).startsWith(`${prefix},`)) });
    },
    expandAll: () => engine.setModel({ ...model, expanded: 'all' }),
    collapseAll(ax) {
      const list = expandedList();
      return engine.setModel({ ...model, expanded: !ax || list === 'all' ? [] : list.filter((p) => p[0] !== ax) });
    },
    async getMembers(field, o = {}) {
      const filters = memberFilters(model, field);
      const all = where ? [where, ...filters] : filters;
      const combined: WirePredicate | undefined = all.length === 0 ? undefined : all.length === 1 ? all[0] : { and: all };
      return (await source.members(field, { ...(combined ? { where: combined } : {}), ...o })).members;
    },
    drillThrough(rowIndex, columnIndex, o = {}) {
      const row = current.memberAt('rows', rowIndex);
      const column = current.memberAt('columns', columnIndex);
      return source.drillThrough({
        model,
        ...(where ? { where } : {}),
        rowPath: row.path,
        columnPath: column.path,
        ...(column.measure ?? row.measure ? { value: (column.measure ?? row.measure) as string } : {}),
        page: o.page ?? { offset: 0, limit: 1000 },
        ...(o.select ? { select: o.select } : {}),
      });
    },
    async loadWindow(w, o = {}) {
      // Served from the held result when it already covers the window (no reload in flight, same model):
      // a small pivot arrives whole with the first `refresh()`, so the windowed renderer's follow-up reads
      // (column headers, the first block) cost no request.
      if (!channel && status === 'ready' && state.model === model && state.resultVersion !== '') {
        const r0 = Math.min(w.rows[0], state.rowCount);
        const r1 = Math.min(Math.max(r0, w.rows[1]), state.rowCount);
        const c0 = Math.min(w.columns[0], state.columnCount);
        const c1 = Math.min(Math.max(c0, w.columns[1]), state.columnCount);
        if (covers(state.rows.held, r0, r1) && covers(state.columns.held, c0, c1) && state.blocks.some((b) => b.r0 <= r0 && r1 <= b.r1 && b.c0 <= c0 && c1 <= b.c1)) return current;
      }
      const s = newState(model);
      const response = await source.query({ model, ...(where ? { where } : {}), window: w, ...(o.signal ? { signal: o.signal } : {}) });
      applyResponse(s, response, w, Number.MAX_SAFE_INTEGER);
      return snapshot(s, 0, format);
    },
    refresh: () => load(true),
    destroy() {
      destroyed = true;
      channel?.abort();
      listeners.clear();
    },
  };
  return engine;
}
