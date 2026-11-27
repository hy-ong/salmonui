// Remote whole-result aggregates: a non-lazy read over the
// JSON protocol whose response carries `aggregates` (with `aggregate` among
// the performed stages) drives the engine footer and `api.getAggregates()`
// with totals over every matching row, not just the loaded page.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAggregatesModule, createFilterModule, createDataGridApi, createDataGridEngine, createPagingModule, createSortModule, type ColumnDef } from '@salmonui/data-grid/engine';
import { createJsonDataSource, type JsonTransport, type WireReadRequest } from '@salmonui/data';
import { ORDER_FIELDS, orderServer, orders, type Order } from './helpers.ts';

const columns: ColumnDef<Order>[] = [
  { field: 'OrderID', type: 'number', primaryKey: true },
  { field: 'ShipCountry', type: 'string' },
  { field: 'Freight', type: 'number' },
];

async function idle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('remote footer aggregates', () => {
  it('a paged remote result with aggregates and performed aggregate fills the footer and getAggregates() over every matching row', async () => {
    const server = orderServer();
    const sent: WireReadRequest[] = [];
    const transport: JsonTransport = async (req) => {
      sent.push(req as WireReadRequest);
      return JSON.parse(JSON.stringify(server.handle(req)));
    };
    const source = createJsonDataSource<Order>({ transport, key: 'OrderID', fields: ORDER_FIELDS, rowShape: 'object' });
    const engine = createDataGridEngine({
      getRowId: (r: Order) => String(r.OrderID),
      columns,
      dataSource: source,
      modules: [createSortModule<Order>(), createFilterModule<Order>(), createPagingModule<Order>(), createAggregatesModule<Order>()],
      defaultQuery: {
        paging: { page: 1, pageSize: 10 },
        aggregates: [
          { columnId: 'Freight', type: 'sum', placement: ['footer'] },
          { columnId: 'Freight', type: 'count', placement: ['footer'] },
        ],
      },
    });
    const api = createDataGridApi(engine);
    await idle();
    const all = orders();
    const total = all.reduce((n, o) => n + o.Freight, 0);
    assert.deepEqual(
      (sent[0] as unknown as { query: { aggregates: unknown } }).query.aggregates,
      [{ field: 'Freight', type: 'sum' }, { field: 'Freight', type: 'count' }],
      'the aggregates are sent with the read',
    );
    assert.equal(engine.getSnapshot().rows.count, 10, 'one page of rows is loaded');
    assert.ok(engine.getSnapshot().data.performed.includes('aggregate'));
    const footer = api.getAggregates();
    assert.ok(footer);
    assert.equal(footer['Freight']?.['count'], all.length, 'count covers every matching row, not the page');
    assert.ok(Math.abs((footer['Freight']?.['sum'] as number) - total) < 1e-6);

    // A filter re-reads; the footer follows the server totals of the new result.
    engine.dispatch({ type: 'filter.byColumn', columnId: 'ShipCountry', operator: 'equal', value: 'France' });
    await idle();
    const france = all.filter((o) => o.ShipCountry === 'France');
    const next = api.getAggregates();
    assert.equal(next?.['Freight']?.['count'], france.length);
    assert.ok(Math.abs((next?.['Freight']?.['sum'] as number) - france.reduce((n, o) => n + o.Freight, 0)) < 1e-6);
    engine.dispose();
  });
});
