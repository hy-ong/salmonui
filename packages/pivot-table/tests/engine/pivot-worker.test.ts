// Pivot Worker host: createPivotWorkerEngine over
// an in-process fake WorkerLike (structured clone at the boundary) and over a
// real node:worker_threads Worker running `@salmonui/pivot-table/engine/worker`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { Worker } from 'node:worker_threads';
import { createPivotEngine, createPivotWorkerEngine, windowOf, type WorkerLike } from '@salmonui/pivot-table/engine';
import { attachPivotWorker } from '@salmonui/pivot-table/engine/worker';
import { SALES } from './pivot-fixtures.ts';

const MODEL = {
  rows: [{ field: 'region' }, { field: 'country' }],
  columns: [{ field: 'year' }],
  values: [{ field: 'amount', aggregate: 'sum' as const }, { field: 'units', aggregate: 'average' as const }],
};

/** Two ends of a fake message channel; every message is structured-cloned like postMessage. */
function fakeWorker(): { worker: WorkerLike; messages: unknown[] } {
  const toWorker: ((e: { data: unknown }) => void)[] = [];
  const toHost: ((e: { data: unknown }) => void)[] = [];
  const messages: unknown[] = [];
  const deliver = (list: ((e: { data: unknown }) => void)[], m: unknown) => queueMicrotask(() => list.forEach((l) => l({ data: structuredClone(m) })));
  attachPivotWorker({ postMessage: (m) => deliver(toHost, m), addEventListener: (_t, l) => toWorker.push(l) });
  return {
    messages,
    worker: {
      postMessage: (m) => (messages.push(m), deliver(toWorker, m)),
      addEventListener: (_t, l) => toHost.push(l),
      removeEventListener: (_t, l) => toHost.splice(toHost.indexOf(l), 1),
    },
  };
}

function threadWorker(): { worker: WorkerLike; thread: Worker } {
  const thread = new Worker(new URL('./pivot-worker-thread.mjs', import.meta.url));
  const map = new Map<(e: { data: unknown }) => void, (d: unknown) => void>();
  return {
    thread,
    worker: {
      postMessage: (m) => thread.postMessage(m),
      addEventListener: (_t, l) => {
        const h = (data: unknown) => l({ data });
        map.set(l, h);
        thread.on('message', h);
      },
      removeEventListener: (_t, l) => thread.off('message', map.get(l)!),
      terminate: () => void thread.terminate(),
    },
  };
}

describe('pivot worker host', () => {
  it('computes the same windows as the in-process engine (fake WorkerLike, chunked upload)', async () => {
    const { worker, messages } = fakeWorker();
    const remote = createPivotWorkerEngine(worker, { data: SALES, model: MODEL, chunkSize: 3 });
    assert.equal(remote.getStatus(), 'computing');
    const summary = await remote.ready;
    const local = createPivotEngine({ data: SALES, model: MODEL });
    assert.equal(summary.rowCount, local.getSnapshot().rowCount);
    assert.equal(summary.columnCount, local.getSnapshot().columnCount);
    assert.equal(remote.getStatus(), 'ready');
    // Rows cross in chunks of 3: 7 rows -> 3 chunk messages before init.
    assert.deepEqual((messages as { op: string }[]).map((m) => m.op), ['chunk', 'chunk', 'chunk', 'init']);
    const req = { rowStart: 0, rowEnd: 10, columnStart: 0, columnEnd: 10 };
    assert.deepEqual(await remote.getWindow(req), JSON.parse(JSON.stringify(windowOf(local.getSnapshot(), req))));

    await remote.expand(['rows', 'Asia']);
    local.expand(['rows', 'Asia']);
    const w = await remote.getWindow(req);
    assert.equal(w.rowCount, local.getSnapshot().rowCount);
    assert.deepEqual(w.rows.map((h) => h.key), Array.from({ length: w.rowCount }, (_, i) => local.getSnapshot().memberAt('rows', i).key));
    assert.equal(w.cells.length, w.rowCount * w.columnCount);
    // Header nodes cross without their subtrees.
    assert.ok(w.rowHeaders.every((h) => !('children' in h)));

    const s = await remote.setModel((m) => ({ ...m, filterBy: { region: { include: ['Asia'] } } }));
    assert.equal(remote.getModel().filterBy.region !== undefined, true);
    assert.equal(s.rowCount, 4); // Asia, India, Japan, Grand Total
    assert.deepEqual(await remote.getMembers('region'), local.getMembers('region'));
    assert.equal((await remote.getFields()).find((f) => f.field === 'country')?.memberCount, 5);
    const drill = await remote.drillThrough(1, 0);
    assert.deepEqual(drill, SALES.filter((r) => r.country === 'India' && r.year === 2024));
    assert.deepEqual(await remote.getRawRows([0, 2]), [SALES[0], SALES[2]]);

    const next = await remote.setData(SALES.slice(0, 2));
    assert.equal(next.rowCount, 3); // Asia, Japan, Grand Total
    remote.destroy();
    await assert.rejects(remote.refresh());
  });

  it('reports engine errors as rejected calls', async () => {
    const { worker } = fakeWorker();
    const remote = createPivotWorkerEngine(worker, { data: SALES, model: MODEL });
    await remote.ready;
    worker.postMessage({ id: 999_999, op: 'call', method: 'nope', args: [] });
    const summary = await remote.setModel({ ...MODEL, calculatedFields: [{ name: 'bad', formula: '"Sum(amount)" +' }], values: [{ field: 'bad', aggregate: 'sum' }] });
    assert.equal(summary.errors[0]?.name, 'bad');
    assert.equal(summary.errors[0]?.position, 15);
    remote.destroy();
  });

  it('runs in a real worker thread from the ./pivot/worker entry', async () => {
    const { worker, thread } = threadWorker();
    const remote = createPivotWorkerEngine(worker, { data: SALES, model: { ...MODEL, expanded: 'all' } });
    const summary = await remote.ready;
    const local = createPivotEngine({ data: SALES, model: { ...MODEL, expanded: 'all' } });
    assert.equal(summary.rowCount, local.getSnapshot().rowCount);
    const req = { rowStart: 0, rowEnd: 100, columnStart: 0, columnEnd: 100 };
    const w = await remote.getWindow(req);
    assert.deepEqual(
      w.cells.map((c) => c.value),
      windowOf(local.getSnapshot(), req).cells.map((c) => c.value),
    );
    remote.destroy();
    await new Promise((resolve) => thread.once('exit', resolve));
  });

  it('the worker entry references no DOM globals and only attaches inside a worker scope', () => {
    const src = readFileSync(new URL('../../dist/engine/worker.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\b(self|window|document)\b\./);
    assert.match(src, /'WorkerGlobalScope' in globalThis/);
  });
});
