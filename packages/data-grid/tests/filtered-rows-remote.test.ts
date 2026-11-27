// getFilteredRows with a remote source: the server filters, sorts
// and pages, so the API returns the rows it loaded (the current page), not a
// promise of every filtered row.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createFilterModule, createDataGridApi, createDataGridEngine, createPagingModule, createSortModule, type ColumnDef } from '@salmonui/data-grid/engine';
import { createJsonDataSource } from '@salmonui/data';
import { createJsonQueryHandler } from '@salmonui/data/server';

type Item = { id: number; city: string; qty: number };
const CITIES = ['Lyon', 'Osaka', 'Tokyo'];
const items: Item[] = Array.from({ length: 60 }, (_, i) => ({ id: i, city: CITIES[i % CITIES.length] as string, qty: i }));
const columns: ColumnDef<Item>[] = [
  { field: 'id', type: 'number', primaryKey: true },
  { field: 'city', type: 'string' },
  { field: 'qty', type: 'number' },
];

async function idle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

function make(paging: boolean) {
  const handler = createJsonQueryHandler(items as unknown as Record<string, unknown>[], { key: 'id', fields: ['id', 'city', 'qty'] });
  const source = createJsonDataSource<Item>({ transport: handler.transport(), key: 'id', fields: ['id', 'city', 'qty'], rowShape: 'object' });
  const modules = [createFilterModule<Item>(), createSortModule<Item>(), ...(paging ? [createPagingModule<Item>()] : [])];
  const engine = createDataGridEngine({
    getRowId: (r: Item) => String(r.id),
    columns,
    dataSource: source,
    modules,
    ...(paging ? { defaultQuery: { paging: { page: 1, pageSize: 5 } } } : {}),
  });
  engine.connect();
  return { engine, api: createDataGridApi(engine) };
}

describe('getFilteredRows with a remote source', () => {
  it('returns the loaded rows: the server-filtered, server-sorted page, never a promise', async () => {
    const { api } = make(true);
    await idle();
    api.filterColumn('city', 'equal', 'Tokyo');
    api.sortColumn('qty', 'desc');
    await idle();
    const rows = api.getFilteredRows();
    assert.ok(Array.isArray(rows), 'synchronous array');
    assert.equal(api.getPageInfo()?.totalRowCount, 20, 'the server reports every filtered row');
    assert.equal(rows.length, 5, 'only the loaded page');
    assert.ok(rows.every((r) => r.city === 'Tokyo'));
    assert.deepEqual(
      rows.map((r) => r.qty),
      [59, 56, 53, 50, 47],
    );
    api.goToPage(2);
    await idle();
    assert.deepEqual(
      api.getFilteredRows().map((r) => r.qty),
      [44, 41, 38, 35, 32],
      'a page change loads, and returns, the next page',
    );
  });

  it('without paging, every server-filtered row is loaded and returned', async () => {
    const { api } = make(false);
    await idle();
    api.filterColumn('city', 'equal', 'Osaka');
    await idle();
    const rows = api.getFilteredRows();
    assert.equal(rows.length, 20);
    assert.ok(rows.every((r) => r.city === 'Osaka'));
  });
});
