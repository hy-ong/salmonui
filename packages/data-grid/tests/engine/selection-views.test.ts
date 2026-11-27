// Selection over row-model views (grouping, detail rows):
// ranges, select-all and the selection summary count data rows only, never
// group captions, group footers, or detail rows, and index data rows through
// the view instead of the raw order.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createAggregatesModule,
  createFocusModule,
  createDataGridEngine,
  createGroupingModule,
  createPagingModule,
  createSelectionApi,
  createSelectionModule,
  type ColumnDef,
  type DataGridModule,
} from '@salmonui/data-grid/engine';
import { createDetailModule, detailRowId } from '@salmonui/data-grid/engine/expansion';

interface Item {
  readonly id: string;
  readonly g: string;
}

const columns: ColumnDef<Item>[] = [{ field: 'id', primaryKey: true }, { field: 'g' }];
const items = (n: number): Item[] => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, g: i % 2 ? 'odd' : 'even' }));

function make(extra: { grouping?: boolean; detail?: boolean; paging?: boolean }, count = 10) {
  const modules: DataGridModule<Item, any, any>[] = [createSelectionModule<Item>() as DataGridModule<Item, any, any>, createFocusModule<Item>() as DataGridModule<Item, any, any>];
  if (extra.grouping) modules.push(createGroupingModule<Item>() as unknown as DataGridModule<Item, any, any>, createAggregatesModule<Item>() as unknown as DataGridModule<Item, any, any>);
  if (extra.detail) modules.push(createDetailModule<Item>() as unknown as DataGridModule<Item, any, any>);
  if (extra.paging) modules.push(createPagingModule<Item>() as unknown as DataGridModule<Item, any, any>);
  const engine = createDataGridEngine<Item>({
    getRowId: (r: Item) => r.id,
    columns,
    dataSource: items(count),
    modules,
    selection: { enabled: true, type: 'multiple' },
    ...(extra.grouping ? { defaultQuery: { grouping: [{ columnId: 'g' }] } } : {}),
    ...(extra.paging ? { paging: { pageSize: 4 } } : {}),
  } as never);
  return { engine, api: createSelectionApi(engine) };
}

describe('selection over row views', () => {
  it('ranges skip detail rows and keep the data row order', () => {
    const { engine, api } = make({ detail: true });
    engine.dispatch({ type: 'detail.expand', rowId: 'r1' });
    engine.dispatch({ type: 'detail.expand', rowId: 'r3' });
    assert.equal(engine.getSnapshot().rows.count, 12);
    assert.equal(engine.getRowIndex(detailRowId('r1')), 2);
    api.selectRowRange('r0', 'r4');
    assert.deepEqual([...api.getSelectedRowIds()], ['r0', 'r1', 'r2', 'r3', 'r4']);
    const summary = api.getSelectionSummary();
    assert.equal(summary?.total, 10, 'the total counts data rows only');
    assert.equal(summary?.count, 5);
  });

  it('select-all and its summary count data rows of a detail view', () => {
    const { engine, api } = make({ detail: true });
    engine.dispatch({ type: 'detail.expandAll' });
    assert.equal(engine.getSnapshot().rows.count, 20);
    api.selectAllFiltered();
    assert.equal(api.getSelectionSummary()?.header, 'all');
    assert.equal(api.getSelectedRowIds().length, 10);
    assert.ok(api.getSelectedRowIds().every((id) => !id.startsWith('__')));
  });

  it('ranges and select-all over grouped rows skip captions and footers', () => {
    const { engine, api } = make({ grouping: true });
    assert.ok(engine.getSnapshot().rows.count > 10, 'captions are part of the visible order');
    // Groups: even (r0 r2 r4 r6 r8), then odd (r1 r3 ...).
    api.selectRowRange('r2', 'r3');
    const ids = [...api.getSelectedRowIds()];
    assert.ok(ids.every((id) => /^r\d+$/.test(id)), `data ids only: ${ids.join(',')}`);
    assert.deepEqual(ids, ['r2', 'r4', 'r6', 'r8', 'r1', 'r3']);
    api.selectAllFiltered();
    assert.equal(api.getSelectionSummary()?.total, 10);
    assert.equal(api.getSelectionSummary()?.header, 'all');
    assert.equal(api.getSelectedRowIds().length, 10);
  });

  it('page select-all with detail rows selects the page data rows', () => {
    const { engine, api } = make({ detail: true, paging: true });
    engine.dispatch({ type: 'detail.expandAll' });
    assert.equal(engine.getSnapshot().rows.count, 8, 'four data rows and four detail rows on the page');
    api.selectAll();
    assert.deepEqual([...api.getSelectedRowIds()], ['r0', 'r1', 'r2', 'r3']);
    assert.equal(api.getSelectionSummary()?.total, 10);
  });
});
