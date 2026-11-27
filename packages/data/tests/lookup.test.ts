// Cached lookups and grid-state storage end to end with
// the data-grid-core engine.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createLookup,
  createJsonLookup,
  createKeyValueStateStorage,
  createManualScheduler,
  createMemoryStore,
} from '@salmonui/data';
import { createJsonQueryHandler } from '@salmonui/data/server';
import { createDataGridEngine, createSortModule } from '@salmonui/data-grid/engine';
import { createLookupModule } from '@salmonui/data-grid/engine/lookup';
import { createDataGridPersistence, getDataGridState, serializeDataGridState } from '@salmonui/data-grid/engine/persistence';
import { fakeFetch } from './helpers.ts';

const customers = [
  { CustomerID: 1, ContactName: 'Maria' },
  { CustomerID: 2, ContactName: 'Ana' },
  { CustomerID: 3, ContactName: 'Thomas' },
];
const signal = new AbortController().signal;
const req = (keys: (number | string)[]) => ({ keys, keyField: 'CustomerID', displayField: 'ContactName', signal });
const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('createLookup', () => {
  it('caches per key, joins in-flight keys, remembers missing keys, and expires by ttl', async () => {
    const scheduler = createManualScheduler();
    const asked: (number | string)[][] = [];
    const lookup = createLookup({
      scheduler,
      ttl: 1000,
      load: async ({ keys }) => {
        asked.push([...keys] as (number | string)[]);
        return customers.filter((c) => keys.includes(c.CustomerID));
      },
    });
    const [a, b] = await Promise.all([lookup.load(req([1, 2])), lookup.load(req([2, 3]))]);
    assert.deepEqual(a.map((r) => (r as { ContactName: string }).ContactName), ['Maria', 'Ana']);
    assert.deepEqual(b.map((r) => (r as { ContactName: string }).ContactName), ['Ana', 'Thomas']);
    assert.deepEqual(asked, [[1, 2], [3]], 'key 2 joined the in-flight request');
    assert.equal((await lookup.load(req([1, 99]))).length, 1);
    assert.deepEqual(asked.at(-1), [99]);
    await lookup.load(req([1, 99]));
    assert.equal(lookup.loads, 3, 'known-missing keys are cached too');
    assert.equal(lookup.peek(99), null);
    scheduler.advance(1000);
    await lookup.load(req([1]));
    assert.equal(lookup.loads, 4, 'expired entries reload');
    lookup.invalidate();
    assert.equal(lookup.peek(1), undefined);
  });
});

describe('createJsonLookup', () => {
  it('requests uncached keys over the protocol and drives a grid lookup column', async () => {
    const server = createJsonQueryHandler([{ id: 'o1' }], { key: 'id', lookups: { customers } });
    const { fetch, calls } = fakeFetch(server);
    const lookup = createJsonLookup({ url: '/api/grid', name: 'customers', fetch });
    const orders = [
      { id: 'o1', customerId: 3 },
      { id: 'o2', customerId: 1 },
      { id: 'o3', customerId: 2 },
    ];
    const engine = createDataGridEngine({
      getRowId: (r: { id: string; customerId: number }) => r.id,
      columns: [{ field: 'id' }, { field: 'customerId', lookup: { data: lookup, keyField: 'CustomerID', displayField: 'ContactName' } }],
      dataSource: orders,
      modules: [createLookupModule<{ id: string; customerId: number }>(), createSortModule<{ id: string; customerId: number }>()],
    });
    engine.sort.set({ sorting: [{ columnId: 'customerId', direction: 'asc' }] });
    engine.getRowIdAt(0);
    for (let i = 0; i < 5 && engine.lookup.getStatus('customerId')?.status !== 'ready'; i++) await tick();
    assert.equal(engine.lookup.getStatus('customerId')?.status, 'ready');
    assert.deepEqual([0, 1, 2].map((i) => engine.getRowIdAt(i)), ['o3', 'o2', 'o1']);
    assert.equal(calls.length, 1);
    assert.deepEqual((calls[0]?.body as { lookup: { name: string } }).lookup.name, 'customers');
    // A second grid reuses the cache: no request.
    await lookup.load(req([1, 2, 3]));
    assert.equal(calls.length, 1);
    await assert.rejects(createJsonLookup({ url: '/api/grid', name: 'nope', fetch }).load(req([1])), /Unknown lookup/);
  });
});

describe('grid-state storage with data-grid-core persistence', () => {
  it('saves the grid state through createKeyValueStateStorage and restores it', async () => {
    const map = new Map<string, string>();
    const storage = createKeyValueStateStorage(createMemoryStore(map));
    const make = () =>
      createDataGridEngine({
        id: 'orders',
        getRowId: (r: { id: string; n: number }) => r.id,
        columns: [{ field: 'id' }, { field: 'n', type: 'number' as const }],
        dataSource: [
          { id: 'a', n: 2 },
          { id: 'b', n: 1 },
        ],
        modules: [createSortModule<{ id: string; n: number }>()],
      });
    const a = make();
    const pa = createDataGridPersistence(a, { storage });
    a.sort.set({ sorting: [{ columnId: 'n', direction: 'desc' }] });
    await tick();
    assert.equal(map.size, 1);
    const b = make();
    const result = await createDataGridPersistence(b, { storage }).load();
    assert.equal(result?.status, 'applied');
    assert.equal(serializeDataGridState(getDataGridState(b)), serializeDataGridState(getDataGridState(a)));
    pa.dispose();
  });
});
