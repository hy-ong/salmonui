// Row pinning: pinned rows leave the sorted order and head the
// visible model, follow search, filter, sort and CRUD, stay out of the page
// window, groups and detail rows, and count in footer totals and
// select-all. Includes a randomized oracle over sort, filter, paging and pins.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createAggregatesModule,
  createFilterModule,
  createFocusModule,
  createDataGridEngine,
  createGroupingModule,
  createLocalDataSource,
  createPagingModule,
  createSearchModule,
  createSelectionModule,
  createSortModule,
  type ColumnDef,
  type LocalDataSource,
} from '@salmonui/data-grid/engine';
import { createDetailModule, dataIndexAt, dataRowCountOf, dataRowIdAt } from '@salmonui/data-grid/engine/expansion';
import { createExportModel, createExportModule } from '@salmonui/data-grid/engine/export';
import { getDataGridState, restoreDataGridState } from '@salmonui/data-grid/engine/persistence';
import { createRowPinningModule, PinnedView } from '@salmonui/data-grid/engine/row-pinning';

interface Item {
  readonly id: string;
  readonly cat: string;
  readonly n: number;
  readonly hot?: boolean;
}

const columns: ColumnDef<Item>[] = [{ field: 'id', primaryKey: true }, { field: 'cat' }, { field: 'n', type: 'number' }];

function items(count: number): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < count; i++) out.push({ id: `r${i}`, cat: ['a', 'b', 'c'][i % 3] as string, n: (i * 7) % 11 });
  return out;
}

function makeEngine(data: readonly Item[] | LocalDataSource<Item>, extra: Record<string, unknown> = {}) {
  return createDataGridEngine({
    getRowId: (r: Item) => r.id,
    columns,
    dataSource: data,
    dev: true,
    instrument: true,
    modules: [
      createSearchModule<Item>(),
      createFilterModule<Item>(),
      createSortModule<Item>(),
      createGroupingModule<Item>(),
      createAggregatesModule<Item>(),
      createDetailModule<Item>(),
      createPagingModule<Item>(),
      createSelectionModule<Item>(),
      createFocusModule<Item>(),
      createRowPinningModule<Item>(),
      createExportModule<Item>(),
    ],
    paging: { enabled: false },
    ...extra,
  });
}

type Engine = ReturnType<typeof makeEngine>;

function visibleIds(engine: Engine): string[] {
  const out: string[] = [];
  const n = engine.getSnapshot().rows.count;
  for (let i = 0; i < n; i++) out.push(engine.getRowIdAt(i) as string);
  return out;
}

describe('row pinning', () => {
  it('passes the model through while nothing is pinned', () => {
    const engine = makeEngine(items(5));
    const before = engine.getSnapshot().rows;
    assert.equal(before.pinned ?? null, null);
    assert.deepEqual(visibleIds(engine), ['r0', 'r1', 'r2', 'r3', 'r4']);
    engine.dispatch({ type: 'rowPinning.pin', rowIds: [] });
    assert.equal(engine.getSnapshot().rows, before, 'an empty pin is a no-op');
    assert.deepEqual(engine.rowPinning.getPinnedRowIds(), []);
  });

  it('moves pinned rows to the head in the current sort order', () => {
    const engine = makeEngine(items(6));
    assert.equal(engine.rowPinning.pin({ rowIds: ['r4', 'r1'] }).status, 'applied');
    assert.deepEqual(visibleIds(engine), ['r1', 'r4', 'r0', 'r2', 'r3', 'r5']);
    const rows = engine.getSnapshot().rows;
    assert.deepEqual(Array.from(rows.pinned ?? []), [1, 4]);
    assert.equal(rows.count, 6, 'a pinned row is shown once');
    assert.equal(engine.getRowIndex('r4'), 1);
    assert.equal(engine.getRowIndex('r0'), 2);
    assert.equal(engine.rowPinning.isPinned('r4'), true);
    assert.equal(engine.rowPinning.isPinned('r0'), false);
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'id', direction: 'desc' }] });
    assert.deepEqual(visibleIds(engine), ['r4', 'r1', 'r5', 'r3', 'r2', 'r0']);
    assert.deepEqual(engine.rowPinning.getPinnedRowIds(), ['r4', 'r1']);
    engine.rowPinning.unpin({ rowIds: ['r4'] });
    assert.deepEqual(visibleIds(engine), ['r1', 'r5', 'r4', 'r3', 'r2', 'r0']);
    engine.rowPinning.unpin({ rowIds: ['r1'] });
    assert.equal(engine.getSnapshot().rows.pinned ?? null, null);
  });

  it('pinned rows are not data positions (row numbers, row moves)', () => {
    const engine = makeEngine(items(5));
    engine.rowPinning.pin({ rowIds: ['r3'] });
    let rows = engine.getSnapshot().rows;
    assert.deepEqual([0, 1, 2, 4].map((i) => dataIndexAt(rows, i)), [-1, 0, 1, 3]);
    assert.equal(dataRowIdAt(rows, 0), 'r0');
    assert.equal(dataRowCountOf(rows), 4);
    engine.dispatch({ type: 'grouping.groupBy', columnId: 'cat' });
    rows = engine.getSnapshot().rows;
    // r3 | a: r0 | b: r1 r4 | c: r2
    assert.equal(dataIndexAt(rows, 0), -1);
    assert.equal(dataIndexAt(rows, 2), 0);
    assert.equal(dataRowCountOf(rows), 4);
  });

  it('hides pinned rows that the filter or search excludes', () => {
    const engine = makeEngine(items(6));
    engine.rowPinning.pin({ rowIds: ['r1', 'r2'] });
    engine.dispatch({ type: 'filter.byColumn', columnId: 'cat', operator: 'equal', value: 'b' });
    assert.deepEqual(visibleIds(engine), ['r1', 'r4']);
    assert.equal(engine.rowPinning.isPinned('r2'), true, 'a filtered-out row stays pinned');
    engine.dispatch({ type: 'filter.clear' });
    engine.dispatch({ type: 'search.set', text: 'r2' });
    assert.deepEqual(visibleIds(engine), ['r2']);
  });

  it('keeps pinned rows out of the page window and its totals', () => {
    const engine = makeEngine(items(10), { paging: { enabled: true, pageSize: 3 } });
    engine.rowPinning.pin({ rowIds: ['r8', 'r0'] });
    assert.deepEqual(visibleIds(engine), ['r0', 'r8', 'r1', 'r2', 'r3']);
    assert.equal(engine.paging.getInfo().totalRowCount, 8);
    assert.equal(engine.paging.getInfo().pageCount, 3);
    engine.dispatch({ type: 'paging.goToPage', page: 3 });
    assert.deepEqual(visibleIds(engine), ['r0', 'r8', 'r7', 'r9']);
  });

  it('pins by predicate, follows CRUD, and lets unpin override the predicate', () => {
    const source = createLocalDataSource(items(5), { getRowId: (r: Item) => r.id });
    const engine = makeEngine(source, { rowPinning: { isRowPinned: (r: Item) => r.hot === true } });
    assert.equal(engine.getSnapshot().rows.pinned ?? null, null);
    source.patch({ upsert: [{ id: 'r3', cat: 'a', n: 1, hot: true }] });
    assert.deepEqual(visibleIds(engine), ['r3', 'r0', 'r1', 'r2', 'r4']);
    source.patch({ upsert: [{ id: 'r9', cat: 'a', n: 1, hot: true }] });
    assert.deepEqual(visibleIds(engine), ['r3', 'r9', 'r0', 'r1', 'r2', 'r4']);
    assert.ok((engine.getInstrumentation()?.stageUpdates['pin'] ?? 0) > 0, 'predicate verdicts follow the row delta');
    source.patch({ remove: ['r0'], upsert: [{ id: 'r2', cat: 'c', n: 2, hot: true }] });
    assert.deepEqual(visibleIds(engine), ['r2', 'r3', 'r9', 'r1', 'r4']);
    source.patch({ upsert: [{ id: 'r2', cat: 'c', n: 2 }, { id: 'r0', cat: 'a', n: 0 }] });
    assert.deepEqual(visibleIds(engine), ['r3', 'r9', 'r1', 'r2', 'r4', 'r0']);
    engine.rowPinning.unpin({ rowIds: ['r3'] });
    assert.deepEqual(visibleIds(engine), ['r9', 'r1', 'r2', 'r3', 'r4', 'r0']);
    assert.equal(engine.rowPinning.isPinned('r3'), false);
    engine.rowPinning.pin({ rowIds: ['r3'] });
    assert.equal(engine.rowPinning.isPinned('r3'), true);
    source.patch({ remove: ['r9'] });
    assert.deepEqual(visibleIds(engine), ['r3', 'r1', 'r2', 'r4', 'r0']);
    source.patch({ upsert: [{ id: 'r3', cat: 'a', n: 50, hot: false }] });
    assert.deepEqual(visibleIds(engine), ['r3', 'r1', 'r2', 'r4', 'r0'], 'explicit pins do not depend on the predicate');
  });

  it('incremental patches with a predicate match a fresh engine (grouped, sorted, paged)', () => {
    const source = createLocalDataSource(items(30), { getRowId: (r: Item) => r.id });
    const options = { rowPinning: { isRowPinned: (r: Item) => r.hot === true }, paging: { enabled: true, pageSize: 7 } };
    const setup = (engine: Engine) => {
      engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n', direction: 'desc' }] });
      engine.dispatch({ type: 'grouping.groupBy', columnId: 'cat' });
      engine.dispatch({ type: 'aggregates.set', aggregates: [{ columnId: 'n', type: 'sum', placement: ['footer', 'groupFooter'] }] });
    };
    const engine = makeEngine(source, options);
    setup(engine);
    const patches = [
      { upsert: [{ id: 'r4', cat: 'b', n: 3, hot: true }] },
      { upsert: [{ id: 'r9', cat: 'a', n: 9, hot: true }, { id: 'r12', cat: 'c', n: 1 }] },
      { remove: ['r2'], append: [{ id: 'r40', cat: 'a', n: 5, hot: true }] },
      { upsert: [{ id: 'r4', cat: 'b', n: 3 }] },
    ];
    for (const patch of patches) {
      source.patch(patch as never);
      const fresh = makeEngine(source.getRows(), options);
      setup(fresh);
      assert.deepEqual(visibleIds(engine), visibleIds(fresh), JSON.stringify(patch));
      assert.deepEqual(engine.aggregates.getFooter(), fresh.aggregates.getFooter());
    }
  });

  it('takes initial row ids and rejects invalid ids', () => {
    const engine = makeEngine(items(4), { rowPinning: { rowIds: ['r2'] } });
    assert.deepEqual(visibleIds(engine), ['r2', 'r0', 'r1', 'r3']);
    assert.equal(engine.dispatch({ type: 'rowPinning.pin', rowIds: [1] as never }).status, 'rejected');
    engine.rowPinning.pin({ rowIds: ['missing'] });
    assert.deepEqual(visibleIds(engine), ['r2', 'r0', 'r1', 'r3'], 'unknown ids are kept but show nothing');
  });

  it('puts pinned rows in front of groups, outside every group', () => {
    const engine = makeEngine(items(6));
    engine.dispatch({ type: 'grouping.groupBy', columnId: 'cat' });
    engine.rowPinning.pin({ rowIds: ['r4'] });
    const rows = engine.getSnapshot().rows;
    assert.ok(rows.view instanceof PinnedView);
    assert.deepEqual(visibleIds(engine), ['r4', '__g:[["cat","a"]]', 'r0', 'r3', '__g:[["cat","b"]]', 'r1', '__g:[["cat","c"]]', 'r2', 'r5']);
    assert.equal(engine.getRowIndex('r4'), 0);
    assert.equal(engine.getRowIndex('r1'), 5);
    assert.equal(engine.getRowSnapshot('r4')?.parentId ?? null, null);
    assert.equal(engine.getRowSnapshot('r1')?.parentId, '__g:[["cat","b"]]');
    assert.equal(engine.grouping.getGroup('__g:[["cat","b"]]')?.index, 4);
    assert.equal(engine.getRowAt(0)?.id, 'r4');
  });

  it('pinned rows have no detail row; detail rows of scrolling rows shift down', () => {
    const engine = makeEngine(items(4));
    engine.dispatch({ type: 'detail.expand', rowId: 'r1' });
    engine.dispatch({ type: 'detail.expand', rowId: 'r2' });
    engine.rowPinning.pin({ rowIds: ['r2'] });
    assert.deepEqual(visibleIds(engine), ['r2', 'r0', 'r1', '__detail:r1', 'r3']);
    assert.equal(engine.getRowIndex('__detail:r1'), 3);
  });

  it('counts pinned rows in footer totals (all scope and page-wise)', () => {
    const engine = makeEngine(items(6), { paging: { enabled: true, pageSize: 2 } });
    engine.dispatch({ type: 'aggregates.set', aggregates: [{ columnId: 'n', type: 'sum' }, { columnId: 'n', type: 'count' }] });
    engine.rowPinning.pin({ rowIds: ['r5'] });
    // n: r0 0, r1 7, r2 3, r3 10, r4 6, r5 2. Page 1: r5 (pinned) + r0 r1.
    assert.deepEqual(visibleIds(engine), ['r5', 'r0', 'r1']);
    assert.deepEqual(engine.aggregates.getFooter()['n'], { sum: 9, count: 3 });
    engine.dispatch({ type: 'aggregates.setScope', scope: 'all' });
    assert.deepEqual(engine.aggregates.getFooter()['n'], { sum: 28, count: 6 });
    engine.dispatch({ type: 'paging.setEnabled', enabled: false });
    engine.dispatch({ type: 'aggregates.setScope', scope: 'page' });
    assert.deepEqual(engine.aggregates.getFooter()['n'], { sum: 28, count: 6 });
    engine.dispatch({ type: 'grouping.groupBy', columnId: 'cat' });
    assert.deepEqual(engine.aggregates.getFooter()['n'], { sum: 28, count: 6 });
  });

  it('select-all covers pinned rows; range selection and focus walk the visible order', () => {
    const engine = makeEngine(items(5), { paging: { enabled: true, pageSize: 2 }, selection: { type: 'multiple' } });
    engine.rowPinning.pin({ rowIds: ['r4'] });
    engine.dispatch({ type: 'selection.selectAllFiltered' });
    assert.deepEqual([...engine.selection.getSelectedRowIds()].sort(), ['r0', 'r1', 'r2', 'r3', 'r4']);
    engine.dispatch({ type: 'selection.clear' });
    engine.dispatch({ type: 'selection.selectRange', fromId: 'r4', toId: 'r0' });
    assert.deepEqual([...engine.selection.getSelectedRowIds()], ['r4', 'r0']);
    engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId: 'r4', columnId: 'id' } });
    engine.dispatch({ type: 'focus.move', direction: 'down' });
    assert.deepEqual(engine.focus.getTarget(), { kind: 'cell', rowId: 'r0', columnId: 'id' });
  });

  it('exports pinned rows first in ungrouped exports, totals included', () => {
    const engine = makeEngine(items(6), { paging: { enabled: true, pageSize: 2 } });
    engine.dispatch({ type: 'aggregates.set', aggregates: [{ columnId: 'n', type: 'sum' }] });
    engine.rowPinning.pin({ rowIds: ['r5'] });
    const dataIds = (scope: 'filtered' | 'page' | 'selected') =>
      [...createExportModel(engine, { scope }).rows()].flatMap((r) => (r.kind === 'data' ? [r.id] : []));
    assert.deepEqual(dataIds('filtered'), ['r5', 'r0', 'r1', 'r2', 'r3', 'r4']);
    assert.deepEqual(dataIds('page'), ['r5', 'r0', 'r1']);
    engine.dispatch({ type: 'selection.selectRows', rowIds: ['r5'] });
    assert.deepEqual(dataIds('selected'), ['r5']);
    const footer = createExportModel(engine, { scope: 'filtered' }).footerRows[0];
    assert.ok(footer);
    assert.equal(footer.aggregates.find((c) => c !== null)?.value, 28);
  });

  it('persists explicit pins and unpins with getDataGridState / restoreDataGridState', () => {
    const engine = makeEngine(items(5), { rowPinning: { isRowPinned: (r: Item) => r.id === 'r0' } });
    engine.rowPinning.pin({ rowIds: ['r3'] });
    engine.rowPinning.unpin({ rowIds: ['r0'] });
    const state = getDataGridState(engine);
    assert.deepEqual(state.pinnedRows, { rowIds: ['r3'], unpinnedRowIds: ['r0'] });
    const other = makeEngine(items(5), { rowPinning: { isRowPinned: (r: Item) => r.id === 'r0' } });
    assert.deepEqual(visibleIds(other), ['r0', 'r1', 'r2', 'r3', 'r4']);
    restoreDataGridState(other, JSON.parse(JSON.stringify(state)));
    assert.deepEqual(visibleIds(other), ['r3', 'r0', 'r1', 'r2', 'r4']);
    assert.equal(getDataGridState(other, { exclude: ['pinnedRows'] }).pinnedRows, undefined);
    const plain = createDataGridEngine({ getRowId: (r: Item) => r.id, columns, dataSource: items(2), modules: [] });
    assert.equal(getDataGridState(plain).pinnedRows, undefined, 'no part without the module');
  });

  it('matches a materialized oracle over random sort, filter, paging and pins', () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed % n;
    };
    const data = items(40);
    for (let round = 0; round < 60; round++) {
      const pageSize = 1 + rand(8);
      const paged = rand(2) === 0;
      const engine = makeEngine(data, { paging: { enabled: paged, pageSize } });
      const pins = new Set<string>();
      for (let k = rand(6); k > 0; k--) pins.add(`r${rand(40)}`);
      engine.rowPinning.pin({ rowIds: [...pins] });
      const dir = rand(2) === 0 ? 'asc' : 'desc';
      engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n', direction: dir }] });
      const cat = ['a', 'b', 'c', null][rand(4)];
      if (cat) engine.dispatch({ type: 'filter.byColumn', columnId: 'cat', operator: 'equal', value: cat });
      const page = 1 + rand(4);
      engine.dispatch({ type: 'paging.goToPage', page });
      // Oracle.
      let rows = data.filter((r) => !cat || r.cat === cat);
      rows = rows.map((r, i) => [r, i] as const).sort((a, b) => (dir === 'asc' ? a[0].n - b[0].n : b[0].n - a[0].n) || a[1] - b[1]).map(([r]) => r);
      const pinned = rows.filter((r) => pins.has(r.id));
      const rest = rows.filter((r) => !pins.has(r.id));
      let window = rest;
      if (paged) {
        const pages = Math.max(1, Math.ceil(rest.length / pageSize));
        const p = Math.min(page, pages);
        window = rest.slice((p - 1) * pageSize, p * pageSize);
      }
      assert.deepEqual(visibleIds(engine), [...pinned, ...window].map((r) => r.id), `round ${round}`);
      for (const [i, r] of [...pinned, ...window].entries()) assert.equal(engine.getRowIndex(r.id), i);
    }
  });
});
