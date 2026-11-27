// `@salmonui/pivot-table/engine/worker`: the Worker entry of the pivot
// engine. Loaded as a module worker it attaches
// itself to the worker global scope; other hosts (for example
// `node:worker_threads`) call `attachPivotWorker(scope)` with an adapter.
// No DOM globals: the scope is detected structurally.
import { createPivotEngine, type PivotEngine } from './engine.js';
import type { PivotFieldInfo } from './types.js';
import { summaryOf, windowOf, type PivotWorkerRequest, type PivotWorkerResponse, type WorkerScopeLike } from './worker-protocol.js';

export type { WorkerScopeLike } from './worker-protocol.js';

const plainField = (f: PivotFieldInfo): PivotFieldInfo => ({ ...f, memberCount: f.memberCount });

/** Serves the pivot protocol on `scope`; returns a detach function. */
export function attachPivotWorker(scope: WorkerScopeLike): () => void {
  let engine: PivotEngine<unknown> | null = null;
  let staged: unknown[] = [];
  const handle = (req: PivotWorkerRequest): unknown => {
    switch (req.op) {
      case 'chunk':
        for (const r of req.rows) staged.push(r);
        return staged.length;
      case 'init': {
        const data = staged;
        staged = [];
        engine?.destroy();
        engine = createPivotEngine({ ...(req.options as object), data });
        return summaryOf(engine.getSnapshot());
      }
      default:
    }
    if (!engine) throw new Error('pivot worker: init has not run');
    const e = engine;
    switch (req.op) {
      case 'data': {
        const data = staged;
        staged = [];
        return summaryOf(e.setData(data));
      }
      case 'call': {
        const fn = (e as unknown as Record<string, (...a: unknown[]) => unknown>)[req.method];
        if (!['setModel', 'expand', 'collapse', 'expandAll', 'collapseAll', 'refresh'].includes(req.method) || !fn) throw new Error(`pivot worker: unknown method ${req.method}`);
        fn(...req.args);
        return summaryOf(e.getSnapshot());
      }
      case 'window':
        return windowOf(e.getSnapshot(), req.request);
      case 'fields':
        return e.getFields().map(plainField);
      case 'members':
        return e.getMembers(req.field, req.options);
      case 'drill':
        return e.drillThrough(req.rowIndex, req.columnIndex);
      default:
        return e.getRawRows(req.indexes);
    }
  };
  const listener = (event: { readonly data: unknown }) => {
    const req = event.data as PivotWorkerRequest;
    let res: PivotWorkerResponse;
    try {
      res = { id: req.id, ok: true, value: handle(req) };
    } catch (err) {
      const e = err as { name?: string; message?: string; position?: number };
      res = { id: req.id, ok: false, error: { name: e.name ?? 'Error', message: e.message ?? String(err), ...(typeof e.position === 'number' ? { position: e.position } : {}) } };
    }
    scope.postMessage(res);
  };
  scope.addEventListener('message', listener);
  return () => {
    scope.removeEventListener?.('message', listener);
    engine?.destroy();
    engine = null;
  };
}

// Auto-attach inside a Worker global scope only (never on a window or in Node).
const g = globalThis as unknown as Partial<WorkerScopeLike>;
if ('WorkerGlobalScope' in globalThis && typeof g.postMessage === 'function' && typeof g.addEventListener === 'function') attachPivotWorker(g as WorkerScopeLike);
