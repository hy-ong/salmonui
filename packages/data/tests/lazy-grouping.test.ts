// Lazy load grouping end to end: the data-grid-core grouping module
// in lazy mode over createJsonDataSource and the reference query handler.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createAggregatesModule, createFilterModule, createDataGridApi, createDataGridEngine, createGroupingModule, createPagingModule, createSortModule, type ColumnDef, type GroupRowSnapshot } from '@salmonui/data-grid/engine';
import { createJsonDataSource, type JsonTransport, type WireReadRequest } from '@salmonui/data';
import { ORDER_FIELDS, orderServer, orders, type Order } from './helpers.ts';

const columns: ColumnDef<Order>[] = [
  { field: 'OrderID', type: 'number', primaryKey: true },
  { field: 'ShipCountry', type: 'string' },
  { field: 'ShipCity', type: 'string' },
  { field: 'Freight', type: 'number' },
];

async function idle(): Promise<void> {
  for (let i = 0; i < 20; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('lazy grouping over the JSON protocol', () => {
  it('captions with server aggregates first, children on expand, invalidation on query change', async () => {
    const server = orderServer();
    const sent: unknown[] = [];
    const transport: JsonTransport = async (req) => {
      sent.push(req);
      return JSON.parse(JSON.stringify(server.handle(req)));
    };
    const source = createJsonDataSource<Order>({ transport, key: 'OrderID', fields: ORDER_FIELDS, rowShape: 'object' });
    const engine = createDataGridEngine({
      getRowId: (r: Order) => String(r.OrderID),
      columns,
      dataSource: source,
      modules: [createSortModule<Order>(), createFilterModule<Order>(), createGroupingModule<Order>(), createAggregatesModule<Order>()],
      grouping: { lazy: true, lazyChunk: 20 },
      defaultQuery: { grouping: [{ columnId: 'ShipCountry' }, { columnId: 'ShipCity' }], aggregates: [{ columnId: 'Freight', type: 'sum', placement: ['groupCaption'] }] },
    });
    const grouping = (engine as unknown as { grouping: { getGroup(id: string): GroupRowSnapshot | undefined } }).grouping;
    await idle();
    const ids = (): string[] => Array.from({ length: engine.getSnapshot().rows.count }, (_, i) => engine.getRowIdAt(i) as string);
    const roots = ids();
    assert.ok(roots.length > 1 && roots.every((id) => id.startsWith('__g:')), 'root captions only, collapsed');
    const france = grouping.getGroup('__g:[["ShipCountry","France"]]') as GroupRowSnapshot;
    const all = orders();
    assert.equal(france.count, all.filter((o) => o.ShipCountry === 'France').length);
    const freight = all.filter((o) => o.ShipCountry === 'France').reduce((n, o) => n + o.Freight, 0);
    assert.ok(Math.abs((france.aggregates['Freight']?.['sum'] as number) - freight) < 1e-6, 'server caption aggregates');
    engine.dispatch({ type: 'grouping.toggle', group: france.id });
    await idle();
    const lyon = '__g:[["ShipCountry","France"],["ShipCity","Lyon"]]';
    assert.ok(ids().includes(lyon));
    engine.dispatch({ type: 'grouping.toggle', group: lyon });
    await idle();
    const rows = ids().filter((id) => !id.startsWith('__g'));
    assert.equal(rows.length, Math.min(20, all.filter((o) => o.ShipCity === 'Lyon').length));
    const first = engine.getRow(rows[0] as string) as unknown;
    assert.ok(first !== undefined, 'lazily loaded rows resolve by id');
    // A filter change reloads the root level and keeps expansion state.
    const before = sent.length;
    engine.dispatch({ type: 'filter.byColumn', columnId: 'Freight', operator: 'greaterThan', value: 50 });
    await idle();
    assert.ok(sent.length > before);
    assert.equal(grouping.getGroup(france.id)?.expanded, true);
    assert.ok(ids().includes(lyon), 'expanded groups reload their children');
    engine.dispose();
  });

  it('a group with more children than one chunk reports hasMore; loadMore appends until the end', async () => {
    const server = orderServer();
    const transport: JsonTransport = async (req) => JSON.parse(JSON.stringify(server.handle(req)));
    const source = createJsonDataSource<Order>({ transport, key: 'OrderID', fields: ORDER_FIELDS, rowShape: 'object' });
    const engine = createDataGridEngine({
      getRowId: (r: Order) => String(r.OrderID),
      columns,
      dataSource: source,
      modules: [createSortModule<Order>(), createGroupingModule<Order>()],
      grouping: { lazy: true, lazyChunk: 10 },
      defaultQuery: { grouping: [{ columnId: 'ShipCountry' }] },
    });
    const grouping = (engine as unknown as { grouping: { getGroup(id: string): GroupRowSnapshot | undefined } }).grouping;
    await idle();
    const france = '__g:[["ShipCountry","France"]]';
    const total = orders().filter((o) => o.ShipCountry === 'France').length;
    assert.ok(total > 20, 'fixture: more than two chunks');
    engine.dispatch({ type: 'grouping.toggle', group: france });
    await idle();
    const loaded = (): number => Array.from({ length: engine.getSnapshot().rows.count }, (_, i) => engine.getRowIdAt(i) as string).filter((id) => !id.startsWith('__g')).length;
    assert.equal(loaded(), 10);
    assert.equal(grouping.getGroup(france)?.hasMore, true, 'the Load more button shows');
    for (let guard = 0; grouping.getGroup(france)?.hasMore && guard < 50; guard++) {
      engine.dispatch({ type: 'grouping.loadMore', group: france });
      await idle();
    }
    assert.equal(loaded(), total, 'every child loaded, in chunks');
    assert.equal(grouping.getGroup(france)?.hasMore, false);
    engine.dispose();
  });

  it('paging pages the top-level groups in the root request, combined with the group path', async () => {
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
      modules: [createSortModule<Order>(), createGroupingModule<Order>(), createPagingModule<Order>()],
      grouping: { lazy: true, lazyChunk: 5 },
      paging: { pageSize: 2 },
      defaultQuery: { grouping: [{ columnId: 'ShipCountry' }] },
    });
    const api = createDataGridApi(engine);
    await idle();
    const countries = new Set(orders().map((o) => o.ShipCountry)).size;
    const root = sent.find((r) => r.groupPath !== undefined && r.groupPath.length === 0) as WireReadRequest;
    assert.deepEqual(root.query.page, { offset: 0, limit: 2 }, 'one request: group path and page');
    const captions = (): string[] => Array.from({ length: engine.getSnapshot().rows.count }, (_, i) => engine.getRowIdAt(i) as string).filter((id) => id.startsWith('__g:'));
    assert.equal(captions().length, 2);
    assert.equal(api.getPageInfo()?.totalRowCount, countries, 'the pager counts top-level groups');
    assert.equal(api.getPageInfo()?.pageCount, Math.ceil(countries / 2));
    const first = captions();
    sent.length = 0;
    api.goToPage(2);
    await idle();
    const next = sent.find((r) => r.groupPath !== undefined && r.groupPath.length === 0) as WireReadRequest;
    assert.deepEqual(next.query.page, { offset: 2, limit: 2 });
    assert.equal(captions().length, 2);
    assert.notDeepEqual(captions(), first);
    // Children of a group on the page page by their own range, not the grid page.
    api.toggleGroup(captions()[0] as string, true);
    await idle();
    const child = sent.find((r) => r.groupPath !== undefined && r.groupPath.length === 1) as WireReadRequest;
    assert.deepEqual(child.query.page, { offset: 0, limit: 5 });
    engine.dispose();
  });
});
