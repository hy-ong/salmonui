// Remote checklist values: the filter dialog's facet reads through
// a remote JSON source and the reference handler, without a DOM.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BLANK_FACET_KEY, createFilterModule, createDataGridEngine, type ColumnDef, type CompiledColumn } from '@salmonui/data-grid/engine';
import { createJsonDataSource } from '@salmonui/data';
import { createJsonQueryHandler } from '@salmonui/data/server';
import { facetOf, isRemoteFacet, readRemoteFacet } from '../dist/data-grid/remote-facet.js';

type Item = { id: number; city: string | null; qty: number };
const CITIES = ['Lyon', 'Osaka', 'Penang', 'Reims', 'Tokyo', null];
const items: Item[] = Array.from({ length: 60 }, (_, i) => ({ id: i, city: CITIES[i % CITIES.length] as string | null, qty: i % 4 }));
const columns: ColumnDef<Item>[] = [
  { field: 'id', type: 'number', primaryKey: true },
  { field: 'city', type: 'string' },
  { field: 'qty', type: 'number' },
];

async function idle(): Promise<void> {
  for (let i = 0; i < 10; i++) await new Promise((r) => setTimeout(r, 0));
}

function make() {
  const handler = createJsonQueryHandler(items as unknown as Record<string, unknown>[], { key: 'id', fields: ['id', 'city', 'qty'] });
  const sent: { facet?: unknown }[] = [];
  const transport = handler.transport();
  const source = createJsonDataSource<Item>({
    transport: (req, ctx) => {
      sent.push(req as { facet?: unknown });
      return transport(req, ctx);
    },
    key: 'id',
    fields: ['id', 'city', 'qty'],
    rowShape: 'object',
  });
  const engine = createDataGridEngine({ getRowId: (r: Item) => String(r.id), columns, dataSource: source, modules: [createFilterModule<Item>()] });
  engine.connect();
  const column = (id: string) => engine.getSnapshot().columns.byId.get(id) as CompiledColumn<unknown>;
  return { engine, column, sent };
}

const signal = () => new AbortController().signal;

describe('remote facets', () => {
  it('the core answers unavailable; the dialog reads paged, searchable values from the source', async () => {
    const { engine, column, sent } = make();
    await idle();
    assert.equal(isRemoteFacet(engine as never), true);
    const core = (engine as unknown as { filter: { getFacet(id: string): { status: string } } }).filter.getFacet('city');
    assert.equal(core.status, 'unavailable');
    const page = await readRemoteFacet(engine as never, column('city'), { search: '', limit: 3, signal: signal() });
    assert.equal(page.status, 'ready');
    assert.equal(page.values.length, 3);
    assert.equal(page.truncated, true, 'more values exist');
    assert.deepEqual(sent.at(-1)?.facet, { field: 'city', limit: 3 });
    // The blank entry sorts first (empty label) and shares the blank key.
    assert.equal(page.values[0]?.key, BLANK_FACET_KEY);
    assert.equal(page.values[0]?.value, null);
    assert.equal(page.values[0]?.count, 10);
    const all = await readRemoteFacet(engine as never, column('city'), { search: '', limit: 100, signal: signal() });
    assert.equal(all.values.length, 6);
    assert.equal(all.truncated, false);
    const searched = await readRemoteFacet(engine as never, column('city'), { search: 'ka', limit: 100, signal: signal() });
    assert.deepEqual(searched.values.map((v) => v.value), ['Osaka']);
    assert.deepEqual(sent.at(-1)?.facet, { field: 'city', search: 'ka', limit: 100 });
    engine.dispose();
  });

  it('counts exclude the own column filter and selected follows its in / notIn values; numbers are typed', async () => {
    const { engine, column } = make();
    await idle();
    engine.dispatch({ type: 'filter.byColumn', columnId: 'city', operator: 'in', value: ['Lyon', 'Tokyo'] });
    engine.dispatch({ type: 'filter.byColumn', columnId: 'qty', operator: 'equal', value: 0 });
    await idle();
    const city = await readRemoteFacet(engine as never, column('city'), { search: '', limit: 100, signal: signal() });
    // Every city of the qty = 0 rows, also those the own city filter drops.
    const expected = new Set(items.filter((i) => i.qty === 0).map((i) => i.city));
    assert.equal(city.values.length, expected.size, 'the own city filter does not narrow its values');
    assert.ok(city.values.some((v) => !v.selected), 'values outside the in list stay listed, unchecked');
    assert.deepEqual(city.values.filter((v) => v.selected).map((v) => v.value), ['Lyon', 'Tokyo'].filter((c) => expected.has(c)));
    const qty = await readRemoteFacet(engine as never, column('qty'), { search: '', limit: 100, signal: signal() });
    assert.ok(qty.values.every((v) => typeof v.value === 'number'));
    // Rows pass the other column's filter (city in Lyon, Tokyo).
    assert.equal(qty.rowCount, items.filter((i) => i.city === 'Lyon' || i.city === 'Tokyo').length);
    engine.dispatch({ type: 'filter.byColumn', columnId: 'city', operator: 'notIn', value: ['Lyon'] });
    const notIn = facetOf(engine as never, column('city'), { columnId: 'city', entries: [{ key: 'Lyon', label: 'Lyon', count: 1 }, { key: 'Osaka', label: 'Osaka', count: 1 }], complete: true });
    assert.deepEqual(notIn.values.map((v) => v.selected), [false, true]);
    engine.dispose();
  });
});
