// Infinite scroll end to end: the data-grid-core infiniteScroll
// module over createJsonDataSource and the reference query handler, with
// offset paging (`range` maps to offset/limit) and the block-caching
// `paging: { kind: 'infinite' }` strategy (contiguous runs with `rowOffset`).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, createSortModule, type ColumnDef } from '@salmonui/data-grid/engine';
import { createInfiniteScrollModule } from '@salmonui/data-grid/engine/infinite';
import { createJsonDataSource, type JsonTransport } from '@salmonui/data';
import { ORDER_FIELDS, orderServer, type Order } from './helpers.ts';

const columns: ColumnDef<Order>[] = [
  { field: 'OrderID', type: 'number', primaryKey: true },
  { field: 'ShipCity', type: 'string' },
  { field: 'Freight', type: 'number' },
];

async function idle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

function grid(paging: Parameters<typeof createJsonDataSource>[0]['paging']) {
  const server = orderServer(1_000);
  const sent: { page?: unknown }[] = [];
  const transport: JsonTransport = async (req) => {
    sent.push(req as { page?: unknown });
    return JSON.parse(JSON.stringify(server.handle(req)));
  };
  const source = createJsonDataSource<Order>({ transport, key: 'OrderID', fields: ORDER_FIELDS, rowShape: 'object', ...(paging ? { paging } : {}) });
  const engine = createDataGridEngine({
    getRowId: (r: Order) => String(r.OrderID),
    columns,
    dataSource: source,
    modules: [createSortModule<Order>(), createInfiniteScrollModule<Order>({ blockSize: 50, initialBlocks: 2, debounceMs: 0 })],
  });
  const inf = (engine as unknown as { infiniteScroll: { ensureRange(s: number, e: number): void; isRowLoaded(i: number): boolean } }).infiniteScroll;
  return { engine, sent, inf };
}

describe('infinite scroll over the JSON protocol', () => {
  for (const [name, paging] of [
    ['offset paging', undefined],
    ['infinite block strategy', { kind: 'infinite', blockSize: 50, maxBlocks: 4 }],
  ] as const) {
    it(`${name}: range reads land at their row index`, async () => {
      const { engine, sent, inf } = grid(paging as never);
      await idle();
      assert.equal(engine.getSnapshot().rows.count, 1_000);
      assert.equal(engine.getRowIdAt(0), '10248');
      assert.equal(engine.getRowIdAt(99), String(10248 + 99));
      inf.ensureRange(600, 620);
      await idle();
      await new Promise((r) => setTimeout(r, 5));
      await idle();
      assert.ok(inf.isRowLoaded(610));
      assert.equal(engine.getRowIdAt(610), String(10248 + 610), 'rows placed at their absolute index');
      assert.equal((engine.getRow(String(10248 + 610)) as Order).OrderID, 10248 + 610);
      assert.ok(sent.length >= 2);
      engine.dispatch({ type: 'sort.toggle', columnId: 'OrderID' });
      engine.dispatch({ type: 'sort.toggle', columnId: 'OrderID' });
      await idle();
      assert.equal(engine.getRowIdAt(0), String(10248 + 999), 'descending after the reset');
    });
  }
});
