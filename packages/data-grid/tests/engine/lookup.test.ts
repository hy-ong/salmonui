import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createFilterModule,
  createDataGridApi,
  createDataGridEngine,
  createGroupingModule,
  createSearchModule,
  createSortModule,
  type ColumnDef,
  type LookupSource,
  type LookupRequest,
  type DataGridEngine,
} from '@salmonui/data-grid/engine';
import { createLookupModule } from '@salmonui/data-grid/engine/lookup';

interface Order {
  readonly id: string;
  readonly customerId: number | string | null;
  readonly qty: number;
}

const customers = [
  { CustomerID: 1, ContactName: 'Maria' },
  { CustomerID: 2, ContactName: 'Ana' },
  { CustomerID: 3, ContactName: 'Thomas' },
  { CustomerID: 4, ContactName: 'Christina' },
];

const orders: Order[] = [
  { id: 'o1', customerId: 3, qty: 1 },
  { id: 'o2', customerId: 1, qty: 2 },
  { id: 'o3', customerId: 2, qty: 3 },
  { id: 'o4', customerId: '4', qty: 4 }, // string key matches the numeric lookup key
  { id: 'o5', customerId: 99, qty: 5 }, // unknown key: blank
  { id: 'o6', customerId: 1, qty: 6 },
  { id: 'o7', customerId: null, qty: 7 },
];

function columns(source: readonly unknown[] | LookupSource): ColumnDef<Order>[] {
  return [
    { field: 'id', primaryKey: true },
    { field: 'customerId', header: 'Customer', lookup: { data: source, keyField: 'CustomerID', displayField: 'ContactName' } },
    { field: 'qty', type: 'number' },
  ];
}

function make(source: readonly unknown[] | LookupSource = customers) {
  return createDataGridEngine({
    getRowId: (r: Order) => r.id,
    columns: columns(source),
    dataSource: orders,
    dev: true,
    instrument: true,
    modules: [createLookupModule<Order>(), createSortModule<Order>(), createFilterModule<Order>(), createSearchModule<Order>(), createGroupingModule<Order>()],
  });
}

function ids(engine: DataGridEngine<Order>): string[] {
  const out: string[] = [];
  const count = engine.getSnapshot().rows.count;
  for (let i = 0; i < count; i++) out.push(engine.getRowIdAt(i) as string);
  return out;
}

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('lookup columns (local lookup)', () => {
  it('displays the lookup value and keeps the raw key in getCellValue', () => {
    const engine = make();
    assert.equal(engine.getCellValue('o1', 'customerId'), 3);
    assert.equal(engine.getCellSnapshot('o1', 'customerId')?.formattedValue, 'Thomas');
    assert.equal(engine.getCellSnapshot('o4', 'customerId')?.formattedValue, 'Christina');
    assert.equal(engine.getCellSnapshot('o5', 'customerId')?.formattedValue, '');
    assert.equal(engine.getCellSnapshot('o7', 'customerId')?.formattedValue, '');
    const column = engine.getSnapshot().columns.byId.get('customerId');
    assert.equal(column?.type, 'string');
    assert.equal(column?.lookup?.rawValue(orders[1]), 1);
    assert.equal(column?.lookup?.display(2), 'Ana');
  });

  it('sorts by display text', () => {
    const engine = make();
    engine.sort.set({ sorting: [{ columnId: 'customerId', direction: 'asc' }] });
    // blanks first, then Ana, Christina, Maria x2 (stable), Thomas
    assert.deepEqual(ids(engine), ['o5', 'o7', 'o3', 'o4', 'o2', 'o6', 'o1']);
    engine.sort.set({ sorting: [{ columnId: 'customerId', direction: 'desc' }] });
    assert.deepEqual(ids(engine).slice(0, 3), ['o1', 'o2', 'o6']);
  });

  it('filters, searches, and builds facets by display text', () => {
    const engine = make();
    engine.filter.byColumn({ columnId: 'customerId', operator: 'startsWith', value: 'ma' });
    assert.deepEqual(ids(engine), ['o2', 'o6']);
    engine.filter.byColumn({ columnId: 'customerId', operator: 'in', value: ['Ana', 'Thomas'] });
    assert.deepEqual(ids(engine), ['o1', 'o3']);
    engine.filter.clear({});
    const facet = engine.filter.getFacet('customerId');
    assert.deepEqual(
      facet?.values.filter((v) => !v.blank).map((v) => [v.label, v.count]),
      [
        ['Ana', 1],
        ['Christina', 1],
        ['Maria', 2],
        ['Thomas', 1],
      ],
    );
    engine.search.set({ text: 'christ' });
    assert.deepEqual(ids(engine), ['o4']);
  });

  it('groups by display text', () => {
    const engine = make();
    engine.grouping.set({ grouping: [{ columnId: 'customerId' }] });
    const captions: string[] = [];
    const count = engine.getSnapshot().rows.count;
    for (let i = 0; i < count; i++) {
      const id = engine.getRowIdAt(i) as string;
      const group = engine.grouping.getGroup(id);
      if (group) captions.push(`${String(group.key)}:${group.count}`);
    }
    assert.deepEqual(captions, ['null:2', 'Ana:1', 'Christina:1', 'Maria:2', 'Thomas:1']);
  });

  it('lists lookup columns and never recompiles', () => {
    const engine = make();
    assert.deepEqual(
      engine.lookup.getColumns().map((c) => c.columnId),
      ['customerId'],
    );
    assert.equal(engine.lookup.getStatus('customerId')?.status, 'ready');
    assert.equal(engine.lookup.getDisplayValue('customerId', 3), 'Thomas');
    assert.equal(engine.lookup.getLookupRows('customerId').length, 4);
    const api = createDataGridApi(engine);
    assert.equal(api.getColumn('customerId')?.lookup?.displayField, 'ContactName');
    engine.sort.set({ sorting: [{ columnId: 'customerId', direction: 'asc' }] });
    assert.equal(engine.getInstrumentation()?.columnCompiles, 1);
  });

  it('runs no lookup on warm queries', () => {
    let reads = 0;
    const engine = createDataGridEngine({
      getRowId: (r: Order) => r.id,
      columns: [
        { field: 'id' },
        {
          id: 'customer',
          valueGetter: (r: Order) => {
            reads++;
            return r.customerId;
          },
          lookup: { data: customers, keyField: 'CustomerID', displayField: 'ContactName' },
        },
      ],
      dataSource: orders,
      dev: false,
      modules: [createLookupModule<Order>(), createSortModule<Order>(), createFilterModule<Order>()],
    });
    engine.sort.set({ sorting: [{ columnId: 'customer', direction: 'asc' }] });
    ids(engine);
    const cold = reads;
    assert.ok(cold >= orders.length, "cold pass reads every row once (plus type inference)");
    engine.sort.set({ sorting: [{ columnId: 'customer', direction: 'desc' }] });
    engine.filter.byColumn({ columnId: 'customer', operator: 'contains', value: 'a' });
    engine.filter.byColumn({ columnId: 'customer', operator: 'contains', value: 'an' });
    ids(engine);
    assert.equal(reads, cold, 'warm queries reuse the cached display keys');
  });
});

describe('lookup columns (remote lookup)', () => {
  function remote(options: { fail?: boolean } = {}) {
    const calls: LookupRequest[] = [];
    let release: (() => void) | null = null;
    const lookup: LookupSource = {
      load(request) {
        calls.push(request);
        return new Promise((resolve, reject) => {
          release = () => (options.fail ? reject(new Error('lookup down')) : resolve(customers.filter((c) => request.keys.some((k) => String(k) === String(c.CustomerID)))));
        });
      },
    };
    return { lookup, calls, release: () => release?.() };
  }

  it('loads the missing keys in one batched request and re-sorts by display text', async () => {
    const r = remote();
    const engine = make(r.lookup);
    engine.sort.set({ sorting: [{ columnId: 'customerId', direction: 'asc' }] });
    assert.equal(engine.getCellSnapshot('o1', 'customerId')?.formattedValue, '');
    await tick();
    assert.equal(r.calls.length, 1, 'one batched request');
    assert.deepEqual([...r.calls[0]!.keys].map(String).sort(), ['1', '2', '3', '4', '99']);
    assert.equal(r.calls[0]!.keyField, 'CustomerID');
    assert.equal(engine.lookup.getStatus('customerId')?.status, 'loading');
    r.release();
    await tick();
    assert.equal(engine.lookup.getStatus('customerId')?.status, 'ready');
    assert.equal((engine.getSnapshot().modules['lookup'] as { columns: Record<string, { status: string }> }).columns['customerId']?.status, 'ready');
    assert.equal(engine.getCellSnapshot('o1', 'customerId')?.formattedValue, 'Thomas');
    assert.deepEqual(ids(engine), ['o5', 'o7', 'o3', 'o4', 'o2', 'o6', 'o1']);
    assert.equal(engine.getInstrumentation()?.columnCompiles, 1, 're-extension is not a recompile');
    // Missing keys are not requested again.
    engine.sort.set({ sorting: [{ columnId: 'customerId', direction: 'desc' }] });
    await tick();
    assert.equal(r.calls.length, 1);
  });

  it('reports errors and reloads on demand', async () => {
    const r = remote({ fail: true });
    const engine = make(r.lookup);
    ids(engine);
    engine.sort.set({ sorting: [{ columnId: 'customerId', direction: 'asc' }] });
    ids(engine);
    await tick();
    r.release();
    await tick();
    const status = engine.lookup.getStatus('customerId');
    assert.equal(status?.status, 'error');
    assert.equal(status?.error, 'lookup down');
    assert.equal(engine.lookup.reload({}).status, 'applied');
    ids(engine);
    await tick();
    assert.equal(r.calls.length, 2, 'reload requests again');
    engine.dispose();
  });
});
