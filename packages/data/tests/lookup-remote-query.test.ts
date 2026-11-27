// Lookup columns over a server-side source: the grid sends
// sort and group by the column field (the foreign key); the server joins the lookup table to order by the
// display value (`createJsonQueryHandler({ lookupFields })`).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createJsonDataSource, type WireReadRequest } from '@salmonui/data';
import { createJsonQueryHandler } from '@salmonui/data/server';
import { createDataGridEngine, createGroupingModule, createSortModule, type ColumnDef } from '@salmonui/data-grid/engine';
import { createLookupModule } from '@salmonui/data-grid/engine/lookup';
import { settle } from './helpers.ts';

interface OrderRow {
  readonly id: string;
  readonly customerId: number;
}

// Key order (1, 2, 3, 4) differs from display order (Ana, Maria, Thomas, Zoe).
const customers = [
  { id: 1, name: 'Zoe' },
  { id: 2, name: 'Maria' },
  { id: 3, name: 'Ana' },
  { id: 4, name: 'Thomas' },
];
const rows: OrderRow[] = Array.from({ length: 12 }, (_, i) => ({ id: `o${i + 1}`, customerId: (i % 4) + 1 }));
const nameOf = (key: number): string => customers.find((c) => c.id === key)?.name ?? '';

function setup(join: boolean) {
  const server = createJsonQueryHandler(rows as never, {
    key: 'id',
    lookups: { customers },
    ...(join ? { lookupFields: { customerId: { lookup: 'customers', keyField: 'id', displayField: 'name' } } } : {}),
  });
  const sent: WireReadRequest[] = [];
  const source = createJsonDataSource<OrderRow>({
    key: 'id',
    transport: async (req) => {
      sent.push(req as WireReadRequest);
      return JSON.parse(JSON.stringify(server.handle(req)));
    },
  });
  const columns: ColumnDef<OrderRow>[] = [
    { field: 'id', primaryKey: true },
    { field: 'customerId', lookup: { data: customers, keyField: 'id', displayField: 'name' } },
  ];
  const engine = createDataGridEngine({
    getRowId: (r: OrderRow) => r.id,
    columns,
    dataSource: source,
    modules: [createLookupModule<OrderRow>(), createSortModule<OrderRow>(), createGroupingModule<OrderRow>()],
  });
  const keys = (): number[] => {
    const out: number[] = [];
    for (let i = 0; i < engine.getSnapshot().rows.count; i++) {
      const id = engine.getRowIdAt(i);
      if (id !== undefined && engine.getRow(id)) out.push(engine.getCellValue(id, 'customerId') as number);
    }
    return out;
  };
  return { engine, sent, keys, last: () => sent.at(-1)!.query };
}

describe('lookup columns with a server-side source', () => {
  it('sort sends the foreign key field; without a join the server orders by key', async () => {
    const t = setup(false);
    await settle(10);
    t.engine.dispatch({ type: 'sort.column', columnId: 'customerId', direction: 'asc' });
    await settle(10);
    assert.deepEqual(t.last().sort, [{ field: 'customerId', dir: 'asc' }]);
    assert.deepEqual([...new Set(t.keys())], [1, 2, 3, 4], 'key order, not display order');
    t.engine.dispose();
  });

  it('sort by a lookup column: the joining reference server returns display-value order', async () => {
    const t = setup(true);
    await settle(10);
    t.engine.dispatch({ type: 'sort.column', columnId: 'customerId', direction: 'asc' });
    await settle(10);
    assert.deepEqual(t.last().sort, [{ field: 'customerId', dir: 'asc' }]);
    assert.deepEqual([...new Set(t.keys().map(nameOf))], ['Ana', 'Maria', 'Thomas', 'Zoe']);
    t.engine.dispatch({ type: 'sort.column', columnId: 'customerId', direction: 'desc' });
    await settle(10);
    assert.deepEqual([...new Set(t.keys().map(nameOf))], ['Zoe', 'Thomas', 'Maria', 'Ana']);
    assert.equal(t.engine.getCellSnapshot(t.engine.getRowIdAt(0)!, 'customerId')?.formattedValue, 'Zoe');
    t.engine.dispose();
  });

  it('group by a lookup column: the request groups by the key field, the server orders groups by display value', async () => {
    const t = setup(true);
    await settle(10);
    t.engine.dispatch({ type: 'grouping.groupBy', columnId: 'customerId' });
    await settle(10);
    assert.deepEqual(
      t.last().group?.map((g) => g.field),
      ['customerId'],
    );
    assert.deepEqual([...new Set(t.keys().map(nameOf))], ['Ana', 'Maria', 'Thomas', 'Zoe'], 'rows arrive in display-value group order');
    t.engine.dispose();
  });

  it('lazy group levels come back in display-value order with the key as the group key', () => {
    const server = createJsonQueryHandler(rows as never, {
      key: 'id',
      lookups: { customers },
      lookupFields: { customerId: { lookup: 'customers', keyField: 'id', displayField: 'name' } },
    });
    const response = server.handle({ v: 1, id: 'g1', query: { group: [{ field: 'customerId' }] }, groupPath: [] }) as { groups: { key: number; count: number }[] };
    assert.deepEqual(response.groups.map((g) => [g.key, g.count]), [[3, 3], [2, 3], [4, 3], [1, 3]]);
  });
});
