// Main-thread side of the Worker host. The
// application creates the Worker (bundlers differ):
//   createPivotWorkerEngine(new Worker(new URL('@salmonui/pivot-table/engine/worker', import.meta.url), { type: 'module' }), { data, model })
import { normalizePivotModel } from './model.js';
import type { PivotEngineOptions } from './engine.js';
import type { PivotComputeStatus, PivotFieldInfo, PivotMember, PivotMemberPath, PivotModel, PivotModelInput } from './types.js';
import type { PivotSummary, PivotWindow, PivotWindowRequest, PivotWorkerRequest, PivotWorkerResponse, WorkerLike } from './worker-protocol.js';

export type PivotWorkerEngineOptions = Omit<PivotEngineOptions<unknown>, 'data' | 'customAggregates' | 'getCellValue'> & {
  readonly data: readonly unknown[];
  /** Rows per transfer message (default 20,000). */
  readonly chunkSize?: number;
};

/** The window-based engine running in a Worker; every call resolves once the worker is done. */
export interface AsyncPivotEngine {
  /** Resolves with the first result summary. */
  readonly ready: Promise<PivotSummary>;
  subscribe(listener: () => void): () => void;
  /** The latest summary (null until ready). */
  getSnapshot(): PivotSummary | null;
  getStatus(): PivotComputeStatus;
  /** The latest model requested (applied optimistically). */
  getModel(): PivotModel;
  setModel(input: PivotModelInput | ((model: PivotModel) => PivotModelInput)): Promise<PivotSummary>;
  setData(rows: readonly unknown[]): Promise<PivotSummary>;
  expand(path: PivotMemberPath): Promise<PivotSummary>;
  collapse(path: PivotMemberPath): Promise<PivotSummary>;
  expandAll(axis?: 'rows' | 'columns'): Promise<PivotSummary>;
  collapseAll(axis?: 'rows' | 'columns'): Promise<PivotSummary>;
  refresh(): Promise<PivotSummary>;
  getWindow(request: PivotWindowRequest): Promise<PivotWindow>;
  getFields(): Promise<readonly PivotFieldInfo[]>;
  getMembers(field: string, options?: { readonly search?: string; readonly limit?: number }): Promise<readonly PivotMember[]>;
  drillThrough(rowIndex: number, columnIndex: number): Promise<readonly unknown[]>;
  getRawRows(indexes: readonly number[]): Promise<readonly unknown[]>;
  /** Rejects pending calls and terminates the worker. */
  destroy(): void;
}

export class PivotWorkerError extends Error {
  readonly position: number | undefined;
  constructor(name: string, message: string, position?: number) {
    super(message);
    this.name = name;
    this.position = position;
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export function createPivotWorkerEngine(worker: WorkerLike, options: PivotWorkerEngineOptions): AsyncPivotEngine {
  const { data, chunkSize = 20_000, ...rest } = options;
  let nextId = 1;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: unknown) => void }>();
  const listeners = new Set<() => void>();
  let summary: PivotSummary | null = null;
  let model = normalizePivotModel(options.model);
  let inFlight = 0;
  let failed = false;
  let destroyed = false;
  const onMessage = (event: { readonly data: unknown }) => {
    const msg = event.data as PivotWorkerResponse;
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    if (msg.ok) p.resolve(msg.value);
    else p.reject(new PivotWorkerError(msg.error.name, msg.error.message, msg.error.position));
  };
  worker.addEventListener('message', onMessage);
  const notify = () => {
    for (const l of [...listeners]) l();
  };
  const send = <T>(req: DistributiveOmit<PivotWorkerRequest, 'id'>): Promise<T> => {
    if (destroyed) return Promise.reject(new Error('pivot worker engine is destroyed'));
    const id = nextId++;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      worker.postMessage({ ...req, id });
    });
  };
  const track = async (work: Promise<PivotSummary>): Promise<PivotSummary> => {
    inFlight++;
    notify();
    try {
      const s = await work;
      if (!summary || s.version >= summary.version) (summary = s), (model = s.model);
      failed = false;
      return s;
    } catch (e) {
      failed = true;
      throw e;
    } finally {
      inFlight--;
      notify();
    }
  };
  /** Sends rows in chunks; each chunk waits for the worker's ack so the main thread never clones everything at once. */
  const upload = async (rows: readonly unknown[]) => {
    for (let i = 0; i < rows.length; i += chunkSize) await send({ op: 'chunk', rows: rows.slice(i, i + chunkSize) });
  };
  // Calls run one after another, so a functional setModel sees the model of every earlier call.
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const next = queue.then(work);
    queue = next.catch(() => {});
    return next;
  };
  const call = (method: string, ...args: unknown[]) => serial(() => track(send<PivotSummary>({ op: 'call', method, args })));
  const ready = track(
    (async () => {
      await upload(data);
      return send<PivotSummary>({ op: 'init', options: { ...rest, model } as Record<string, unknown> });
    })(),
  );
  ready.catch(() => {});
  queue = ready.catch(() => {});
  return {
    ready,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => summary,
    getStatus: () => (failed ? 'error' : inFlight > 0 ? 'computing' : summary ? 'ready' : 'idle'),
    getModel: () => model,
    setModel(input) {
      if (typeof input !== 'function') model = normalizePivotModel(input);
      return serial(() => {
        if (typeof input === 'function') model = normalizePivotModel(input(model));
        return track(send<PivotSummary>({ op: 'call', method: 'setModel', args: [model] }));
      });
    },
    setData: (rows) => serial(() => track((async () => (await upload(rows), send<PivotSummary>({ op: 'data' })))())),
    expand: (path) => call('expand', path),
    collapse: (path) => call('collapse', path),
    expandAll: (axis) => call('expandAll', axis),
    collapseAll: (axis) => call('collapseAll', axis),
    refresh: () => call('refresh'),
    getWindow: (request) => ready.then(() => send<PivotWindow>({ op: 'window', request })),
    getFields: () => ready.then(() => send<PivotFieldInfo[]>({ op: 'fields' })),
    getMembers: (field, opts) => ready.then(() => send<PivotMember[]>({ op: 'members', field, ...(opts ? { options: opts } : {}) })),
    drillThrough: (rowIndex, columnIndex) => ready.then(() => send<unknown[]>({ op: 'drill', rowIndex, columnIndex })),
    getRawRows: (indexes) => ready.then(() => send<unknown[]>({ op: 'rows', indexes })),
    destroy() {
      destroyed = true;
      worker.removeEventListener?.('message', onMessage);
      for (const p of pending.values()) p.reject(new Error('pivot worker engine is destroyed'));
      pending.clear();
      listeners.clear();
      worker.terminate?.();
    },
  };
}
