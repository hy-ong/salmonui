// Live / streaming source: a snapshot read plus pushed patches from any
// subscription channel (SSE, WebSocket, polling). Transport-agnostic.

import { decodeTuples, tuplesToObjects, type WireLiveMessage, type WireTuple } from './protocol.js';
import { structuralQueryKey } from './query-model.js';
import { createAbortController, delay, systemScheduler, type AbortControllerLike } from './scheduler.js';
import type {
  ConflictSnapshot,
  DataSourceEvent,
  DataSourceRequest,
  DataSourceResult,
  DataSource,
  DataQuery,
  Json,
  RowId,
  AbortSignalLike,
  Scheduler,
  WriteRequest,
  WriteResult,
} from './types.js';

export interface LivePatch<Row> {
  readonly upsert?: readonly Row[];
  readonly remove?: readonly RowId[];
  readonly append?: readonly Row[];
}

export interface LiveEmitter<Row> {
  replace(rows: readonly Row[], totalRowCount?: number): void;
  patch(patch: LivePatch<Row>): void;
  /** Applies a JSON-protocol live message (tuples, dictionaries). */
  message(message: WireLiveMessage): void;
  conflict(conflict: ConflictSnapshot<Row>): void;
  fail(error: unknown): void;
}

export interface LiveDataSourceOptions<Row> {
  /** Snapshot read (local or remote). */
  readonly initial: DataSource<Row>;
  readonly getRowId: (row: Row) => RowId;
  /** Opens the stream for a query; return a cleanup function. Re-called per structural query. */
  readonly connect: (query: DataQuery, emit: LiveEmitter<Row>, signal: AbortSignalLike) => void | (() => void);
  readonly reconnect?: { readonly attempts: number; readonly delayMs: number | ((attempt: number) => number) };
  /** Tuple header for `message()`: rows stay tuples in this order. Omit for object rows. */
  readonly fields?: readonly string[];
  readonly scheduler?: Scheduler;
  readonly onConflict?: (conflict: ConflictSnapshot<Row>) => void;
  readonly onError?: (error: unknown) => void;
}

export interface LiveDataSource<Row> extends DataSource<Row> {
  readonly mode: 'live';
  read(request: DataSourceRequest): Promise<DataSourceResult<Row>>;
  subscribe(listener: (event: DataSourceEvent<Row>) => void): () => void;
  getRows(): readonly Row[];
  /** Closes the stream. */
  close(): void;
}

const EMPTY: readonly RowId[] = Object.freeze([]);

export function createLiveDataSource<Row>(options: LiveDataSourceOptions<Row>): LiveDataSource<Row> {
  const scheduler = options.scheduler ?? systemScheduler();
  const getRowId = options.getRowId;
  const listeners = new Set<(event: DataSourceEvent<Row>) => void>();
  let rows: readonly Row[] = [];
  let total: number | undefined;
  let index: Map<RowId, number> | null = null;
  let streamKey: string | null = null;
  let stream: { controller: AbortControllerLike; cleanup: (() => void) | void; generation: number } | null = null;
  let generation = 0;
  let snapshotVersion = 0;

  const emit = (event: DataSourceEvent<Row>): void => {
    for (const l of listeners) l(event);
  };
  const ids = (): Map<RowId, number> => {
    if (!index) {
      index = new Map();
      for (let i = 0; i < rows.length; i++) index.set(getRowId(rows[i] as Row), i);
    }
    return index;
  };

  const replace = (next: readonly Row[], totalRowCount?: number): void => {
    rows = next;
    index = null;
    total = totalRowCount;
    emit(Object.freeze({ type: 'reset', rows, totalRowCount: total ?? rows.length }));
  };

  const patch = (p: LivePatch<Row>): void => {
    const map = ids();
    let next: Row[] | null = null;
    const updated: RowId[] = [];
    const added: RowId[] = [];
    const removed: RowId[] = [];
    if (p.remove?.length) {
      const drop = new Set<number>();
      for (const id of p.remove) {
        const at = map.get(id);
        if (at !== undefined && !drop.has(at)) {
          drop.add(at);
          removed.push(id);
        }
      }
      if (drop.size) {
        next = rows.filter((_, i) => !drop.has(i));
        index = null;
      }
    }
    const base = (): Row[] => (next ??= rows.slice());
    const current = (): Map<RowId, number> => {
      if (index) return index;
      index = new Map();
      const list = next ?? rows;
      for (let i = 0; i < list.length; i++) index.set(getRowId(list[i] as Row), i);
      return index;
    };
    for (const row of p.upsert ?? []) {
      const id = getRowId(row);
      const at = current().get(id);
      const list = base();
      if (at === undefined) {
        current().set(id, list.length);
        list.push(row);
        added.push(id);
      } else {
        list[at] = row;
        updated.push(id);
      }
    }
    for (const row of p.append ?? []) {
      const list = base();
      const id = getRowId(row);
      current().set(id, list.length);
      list.push(row);
      added.push(id);
    }
    if (!next) return;
    rows = next;
    if (total !== undefined) total += added.length - removed.length;
    emit(
      Object.freeze({
        type: 'patch',
        rows,
        updated: updated.length ? Object.freeze(updated) : EMPTY,
        added: added.length ? Object.freeze(added) : EMPTY,
        removed: removed.length ? Object.freeze(removed) : EMPTY,
        totalRowCount: total ?? rows.length,
      }),
    );
  };

  const decode = (tuples: readonly WireTuple[], header: readonly string[] | undefined, dict: WireLiveMessage['dict']): Row[] => {
    const h = header ?? options.fields ?? [];
    const decoded = decodeTuples(tuples.map((t) => t.slice()), h, options.fields ?? null, dict);
    return options.fields ? (decoded as unknown as Row[]) : tuplesToObjects<Row>(decoded, h);
  };

  const open = (query: DataQuery, attempt: number): void => {
    const gen = ++generation;
    const controller = createAbortController();
    const live = (): boolean => gen === generation && !controller.signal.aborted;
    const emitter: LiveEmitter<Row> = {
      replace: (next, totalRowCount) => {
        if (live()) replace(next, totalRowCount);
      },
      patch: (p) => {
        if (live()) patch(p);
      },
      message: (m) => {
        if (!live()) return;
        if (m.type === 'replace') replace(decode(m.rows, m.fields, m.dict), m.total);
        else
          patch({
            ...(m.upsert ? { upsert: decode(m.upsert, m.fields, m.dict) } : {}),
            ...(m.append ? { append: decode(m.append, m.fields, m.dict) } : {}),
            ...(m.remove ? { remove: m.remove.map((k: Json) => String(k)) } : {}),
          });
      },
      conflict: (c) => {
        if (live()) options.onConflict?.(c);
      },
      fail: (error) => {
        if (!live()) return;
        closeStream();
        options.onError?.(error);
        const r = options.reconnect;
        if (r && attempt < r.attempts) {
          const ms = typeof r.delayMs === 'function' ? r.delayMs(attempt + 1) : r.delayMs * 2 ** attempt;
          const waitGen = generation;
          delay(scheduler, ms).then(
            () => {
              if (waitGen === generation && streamKey !== null) open(query, attempt + 1);
            },
            () => {},
          );
        }
      },
    };
    stream = { controller, cleanup: undefined, generation: gen };
    const cleanup = options.connect(query, emitter, controller.signal);
    if (stream && stream.generation === gen) stream.cleanup = cleanup;
  };

  const closeStream = (): void => {
    if (!stream) return;
    const s = stream;
    stream = null;
    s.controller.abort();
    if (typeof s.cleanup === 'function') s.cleanup();
  };

  return {
    mode: 'live',
    capabilities: Object.freeze({ ...(options.initial.capabilities ?? {}), reload: true }),
    async read(request) {
      const version = ++snapshotVersion;
      const key = structuralQueryKey(request.query);
      if (key !== streamKey) {
        closeStream();
        generation++;
        streamKey = key;
      }
      const result = await options.initial.read(request);
      if (version === snapshotVersion) {
        rows = result.rows;
        index = null;
        total = result.totalRowCount;
        if (!stream && streamKey === key) open(request.query, 0);
      }
      return result;
    },
    write: options.initial.write
      ? (request: WriteRequest<Row>): Promise<WriteResult<Row>> => (options.initial.write as (r: WriteRequest<Row>) => Promise<WriteResult<Row>>)(request)
      : undefined,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getRows: () => rows,
    close() {
      streamKey = null;
      generation++;
      closeStream();
    },
  } as LiveDataSource<Row>;
}
