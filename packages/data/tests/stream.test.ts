// Live data, offline, controlled binding, state storage.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createControlledDataSource,
  createJsonDataSource,
  createJsonStateStorage,
  createKeyValueStateStorage,
  createLiveDataSource,
  createManualScheduler,
  createMemoryStore,
  createOfflineDataSource,
  encodeRows,
  type DataSourceEvent,
  type DataQuery,
  type LiveEmitter,
} from '@salmonui/data';
import { createJsonQueryHandler } from '@salmonui/data/server';
import { fakeFetch, ORDER_FIELDS, orderServer, orders, query, request, settle } from './helpers.ts';

type Tuple = readonly unknown[];

describe('live source', () => {
  function live(options: { reconnect?: { attempts: number; delayMs: number } } = {}) {
    const scheduler = createManualScheduler();
    const emitters: { query: DataQuery; emit: LiveEmitter<Tuple>; signal: AbortSignal; closed: boolean }[] = [];
    const errors: unknown[] = [];
    const source = createLiveDataSource<Tuple>({
      initial: createJsonDataSource({ transport: orderServer(20).transport(), key: 'OrderID', fields: ORDER_FIELDS }),
      getRowId: (row) => String(row[0]),
      fields: ORDER_FIELDS,
      scheduler,
      onError: (e) => errors.push(e),
      connect(q, emit, signal) {
        const entry = { query: q, emit, signal: signal as AbortSignal, closed: false };
        emitters.push(entry);
        return () => {
          entry.closed = true;
        };
      },
      ...options,
    });
    const events: DataSourceEvent<Tuple>[] = [];
    source.subscribe((e) => events.push(e));
    return { source, emitters, events, scheduler, errors };
  }

  it('applies tuple patch messages by id and adjusts totalRowCount by the delta', async () => {
    const { source, emitters, events } = live();
    await source.read(request(query()));
    assert.equal(emitters.length, 1);
    const [row] = encodeRows([{ ...orders(1)[0], Freight: 1 }], { fields: ORDER_FIELDS }).rows;
    const [fresh] = encodeRows([{ ...orders(1)[0], OrderID: 99999 }], { fields: ORDER_FIELDS }).rows;
    emitters[0]!.emit.message({ v: 1, type: 'patch', upsert: [row!], append: [fresh!], remove: [10249] });
    const e = events[0] as Extract<DataSourceEvent<Tuple>, { type: 'patch' }>;
    assert.deepEqual([e.updated, e.added, e.removed], [['10248'], ['99999'], ['10249']]);
    assert.equal(e.totalRowCount, 20);
    assert.equal(source.getRows().length, 20);
    assert.equal(source.getRows()[0]![ORDER_FIELDS.indexOf('Freight')], 1);
  });

  it('resubscribes per query, cleans up the previous stream, and ignores stale emissions', async () => {
    const { source, emitters, events } = live();
    await source.read(request(query()));
    await source.read(request(query({ sorting: [{ columnId: 'Freight', direction: 'desc' }] })));
    assert.equal(emitters.length, 2);
    assert.equal(emitters[0]!.closed, true);
    assert.equal(emitters[0]!.signal.aborted, true);
    emitters[0]!.emit.replace([]);
    assert.equal(events.length, 0, 'stale emitter ignored');
    emitters[1]!.emit.replace([], 0);
    assert.deepEqual(events[0], { type: 'reset', rows: [], totalRowCount: 0 });
    // Same structural query (page change) keeps the stream.
    await source.read(request(query({ sorting: [{ columnId: 'Freight', direction: 'desc' }], paging: { page: 2, pageSize: 5 } })));
    assert.equal(emitters.length, 2);
  });

  it('reconnects with backoff after a failure', async () => {
    const { source, emitters, scheduler, errors } = live({ reconnect: { attempts: 2, delayMs: 100 } });
    await source.read(request(query()));
    emitters[0]!.emit.fail(new Error('socket closed'));
    assert.equal(errors.length, 1);
    assert.equal(emitters[0]!.closed, true);
    scheduler.advance(100);
    await settle();
    assert.equal(emitters.length, 2);
    emitters[1]!.emit.fail(new Error('again'));
    scheduler.advance(199);
    await settle();
    assert.equal(emitters.length, 2);
    scheduler.advance(1);
    await settle();
    assert.equal(emitters.length, 3);
    emitters[2]!.emit.fail(new Error('give up'));
    scheduler.runAll();
    await settle();
    assert.equal(emitters.length, 3, 'attempts exhausted');
    source.close();
  });
});

describe('offline, controlled', () => {
  it('offline source loads once and runs locally', async () => {
    let loads = 0;
    const source = createOfflineDataSource({ load: async () => (loads++, orders(5)) });
    const events: DataSourceEvent<unknown>[] = [];
    source.subscribe((e) => events.push(e));
    assert.equal(source.read(request(query())).rows.length, 0);
    await settle();
    assert.equal(source.status, 'ready');
    assert.equal(events[0]!.type, 'reset');
    assert.equal(source.read(request(query())).rows.length, 5);
    assert.equal(loads, 1);
    assert.equal(source.mode, 'local');
  });

  it('controlled source hands every read and write to the app', async () => {
    const seen: string[] = [];
    const source = createControlledDataSource<{ id: string }>({
      onQueryChange: (req) => (seen.push(`query:${req.query.paging?.page}`), { version: req.version, rows: [{ id: 'a' }], totalRowCount: 1 }),
      onDataChange: async (req) => (seen.push(`data:${req.changed.length}`), { version: req.version, status: 'applied' }),
    });
    await source.read(request(query({ paging: { page: 3, pageSize: 5 } })));
    await source.write!({ version: 1, added: [], changed: [{ rowId: 'a', row: { id: 'a' }, previous: { id: 'a' }, changedColumnIds: ['id'] }], deleted: [], mode: 'row', signal: new AbortController().signal });
    assert.deepEqual(seen, ['query:3', 'data:1']);
    assert.equal(source.mode, 'remote');
  });
});

describe('grid-state storage (single state)', () => {
  const state = { version: 1, query: query(), columns: { order: ['a'] } };

  it('key-value storage with expected-version conflicts', async () => {
    const map = new Map<string, string>();
    const storage = createKeyValueStateStorage(createMemoryStore(map));
    assert.equal(await storage.load('orders'), null);
    const saved = await storage.save('orders', state);
    assert.deepEqual(saved, { status: 'saved', version: '1' });
    assert.deepEqual(await storage.load('orders'), state);
    const other = await storage.save('orders', { ...state, columns: { order: ['b'] } }, '1');
    assert.deepEqual(other, { status: 'saved', version: '2' });
    const stale = await storage.save('orders', state, '1');
    assert.equal(stale.status, 'conflict');
    await storage.remove('orders');
    assert.equal(map.size, 0);
  });

  it('JSON-protocol storage against the reference handler', async () => {
    const { fetch, calls } = fakeFetch(createJsonQueryHandler([], { key: 'id' }));
    const storage = createJsonStateStorage({ url: '/api/state', fetch });
    assert.deepEqual(await storage.save('orders', state), { status: 'saved', version: '1' });
    assert.deepEqual(await storage.load('orders'), state);
    assert.equal((await storage.save('orders', state, '0')).status, 'conflict');
    await storage.remove('orders');
    assert.equal(await storage.load('orders'), null);
    assert.deepEqual(calls[0]!.body, { v: 1, state: { op: 'save', gridId: 'orders', state } });
    assert.equal(calls[0]!.headers['content-type'], 'application/json');
  });
});
