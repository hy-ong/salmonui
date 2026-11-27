// Detail rows: expansion commands, the detail
// visible row model over plain, sorted, filtered, paged, and grouped models,
// async detail loads, notifications, sparse row metrics, and a randomized
// oracle that materializes the expected visible list.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createAggregatesModule,
  createFilterModule,
  createDataGridEngine,
  createGroupingModule,
  createLocalDataSource,
  createPagingModule,
  createSortModule,
  createVariableRowMetrics,
  type ColumnDef,
  type DataGridCommand,
  type DataGridModule,
  type LocalDataSource,
} from '@salmonui/data-grid/engine';
import {
  createDetailModule,
  createSparseRowMetrics,
  dataIndexAt,
  dataRowIdAt,
  DetailView,
} from '@salmonui/data-grid/engine/expansion';

interface Item {
  readonly id: string;
  readonly cat: string;
  readonly n: number;
}

const columns: ColumnDef<Item>[] = [{ field: 'id', primaryKey: true }, { field: 'cat' }, { field: 'n', type: 'number' }];

function items(count: number): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < count; i++) out.push({ id: `r${i}`, cat: ['a', 'b', 'c'][i % 3] as string, n: (i * 7) % 11 });
  return out;
}

type Modules = readonly DataGridModule<Item, any, any, string>[];

function makeEngine(data: readonly Item[] | LocalDataSource<Item>, extra: Record<string, unknown> = {}) {
  return createDataGridEngine({
    getRowId: (r: Item) => r.id,
    columns,
    dataSource: data,
    dev: true,
    instrument: true,
    modules: [createFilterModule<Item>(), createSortModule<Item>(), createGroupingModule<Item>(), createAggregatesModule<Item>(), createDetailModule<Item>(), createPagingModule<Item>()],
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

describe('detail expansion', () => {
  it('inserts a detail row after each expanded data row', () => {
    const engine = makeEngine(items(5));
    assert.equal(engine.dispatch({ type: 'detail.expand', rowId: 'r1' }).status, 'applied');
    engine.dispatch({ type: 'detail.toggle', rowId: 'r3' });
    assert.deepEqual(visibleIds(engine), ['r0', 'r1', '__detail:r1', 'r2', 'r3', '__detail:r3', 'r4']);
    const rows = engine.getSnapshot().rows;
    assert.equal(rows.count, 7);
    assert.equal(rows.view?.kind, 'detail');
    assert.equal(rows.view?.dataCount, 5);
    const detail = engine.getRowSnapshot('__detail:r1');
    assert.deepEqual({ ...detail }, { id: '__detail:r1', kind: 'detail', row: null, index: 2, depth: 0, parentId: 'r1' });
    assert.equal(engine.getRowIndex('r4'), 6);
    assert.equal(engine.getRowAt(6)?.id, 'r4');
    assert.equal(engine.getRowAt(2), undefined);
    assert.equal(engine.detail.isExpanded('r1'), true);
    assert.equal(engine.detail.isExpanded('r2'), false);
    engine.dispatch({ type: 'detail.collapse', rowId: 'r1' });
    engine.dispatch({ type: 'detail.toggle', rowId: 'r3' });
    assert.deepEqual(visibleIds(engine), ['r0', 'r1', 'r2', 'r3', 'r4']);
    assert.equal(engine.getSnapshot().rows.view ?? null, null, 'no detail rows: the stage passes its input through');
  });

  it('expandAll and collapseAll, with explicit collapses in expand-all mode', () => {
    const engine = makeEngine(items(3));
    engine.dispatch({ type: 'detail.expandAll' });
    assert.deepEqual(visibleIds(engine), ['r0', '__detail:r0', 'r1', '__detail:r1', 'r2', '__detail:r2']);
    engine.dispatch({ type: 'detail.collapse', rowId: 'r1' });
    assert.deepEqual(visibleIds(engine), ['r0', '__detail:r0', 'r1', 'r2', '__detail:r2']);
    assert.deepEqual(engine.getSnapshot().query.expansion.detail, { r1: false, '*': true });
    engine.dispatch({ type: 'detail.collapseAll' });
    assert.deepEqual(visibleIds(engine), ['r0', 'r1', 'r2']);
    assert.deepEqual(engine.getSnapshot().query.expansion.detail, {});
  });

  it('keeps expansion by id across sorting, filtering, paging and patches', () => {
    const source = createLocalDataSource(items(10), { getRowId: (r: Item) => r.id });
    const engine = makeEngine(source, { paging: { enabled: true, pageSize: 3 } });
    engine.dispatch({ type: 'detail.expand', rowId: 'r4' });
    engine.dispatch({ type: 'detail.expand', rowId: 'r0' });
    assert.deepEqual(visibleIds(engine), ['r0', '__detail:r0', 'r1', 'r2']);
    engine.dispatch({ type: 'paging.goToPage', page: 2 });
    assert.deepEqual(visibleIds(engine), ['r3', 'r4', '__detail:r4', 'r5']);
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'id', direction: 'desc' }] });
    engine.dispatch({ type: 'paging.goToPage', page: 1 });
    // r9 r8 r7 | r6 r5 r4 | ...
    engine.dispatch({ type: 'paging.goToPage', page: 2 });
    assert.deepEqual(visibleIds(engine), ['r6', 'r5', 'r4', '__detail:r4']);
    engine.dispatch({ type: 'filter.byColumn', columnId: 'cat', operator: 'equal', value: 'b' });
    // cat b: r1 r4 r7 -> desc r7 r4 r1; page 1 (filter resets page)
    assert.deepEqual(visibleIds(engine), ['r7', 'r4', '__detail:r4', 'r1']);
    source.patch({ upsert: [{ id: 'r4', cat: 'b', n: 100 }] });
    assert.deepEqual(visibleIds(engine), ['r7', 'r4', '__detail:r4', 'r1']);
    source.patch({ remove: ['r4'] });
    assert.deepEqual(visibleIds(engine), ['r7', 'r1']);
    assert.equal(engine.detail.isExpanded('r4'), true, 'state is by id; a returning row is expanded again');
    // Page totals count data rows only.
    assert.equal(engine.paging.getInfo().totalRowCount, 2);
  });

  it('detail rows exist only inside expanded groups and follow their parent', () => {
    const engine = makeEngine(items(6));
    engine.dispatch({ type: 'grouping.groupBy', columnId: 'cat' });
    engine.dispatch({ type: 'detail.expand', rowId: 'r3' });
    engine.dispatch({ type: 'detail.expand', rowId: 'r1' });
    const ids = visibleIds(engine);
    assert.deepEqual(ids, ['__g:[["cat","a"]]', 'r0', 'r3', '__detail:r3', '__g:[["cat","b"]]', 'r1', '__detail:r1', 'r4', '__g:[["cat","c"]]', 'r2', 'r5']);
    const detail = engine.getRowSnapshot('__detail:r3');
    assert.equal(detail?.depth, 1);
    assert.equal(detail?.parentId, 'r3');
    assert.equal(engine.getRowSnapshot('r3')?.parentId, '__g:[["cat","a"]]');
    // Grouping methods see through the detail view.
    const group = engine.grouping.getGroup('__g:[["cat","b"]]');
    assert.equal(group?.index, 4);
    assert.equal(group?.count, 2);
    engine.dispatch({ type: 'grouping.toggle', group: '__g:[["cat","a"]]' });
    assert.deepEqual(visibleIds(engine).slice(0, 4), ['__g:[["cat","a"]]', '__g:[["cat","b"]]', 'r1', '__detail:r1']);
    assert.equal(engine.getRowSnapshot('__detail:r3'), undefined);
  });

  it('group-aware paging carries the detail rows of the page', () => {
    const engine = makeEngine(items(9), { paging: { enabled: true, pageSize: 2 } });
    engine.dispatch({ type: 'grouping.groupBy', columnId: 'cat' });
    engine.dispatch({ type: 'detail.expand', rowId: 'r3' });
    // a: r0 r3 r6 | b: ...; page 1 = r0 r3
    assert.deepEqual(visibleIds(engine), ['__g:[["cat","a"]]', 'r0', 'r3', '__detail:r3']);
    engine.dispatch({ type: 'paging.next' });
    assert.deepEqual(visibleIds(engine), ['__g:[["cat","a"]]', 'r6', '__g:[["cat","b"]]', 'r1']);
  });

  it('page-wise footer aggregates still cover the page with detail rows', () => {
    const engine = makeEngine(items(6), { paging: { enabled: true, pageSize: 2 } });
    engine.dispatch({ type: 'aggregates.set', aggregates: [{ columnId: 'n', type: 'sum', placement: ['footer'] }] });
    const before = engine.aggregates.getFooter();
    engine.dispatch({ type: 'detail.expand', rowId: 'r0' });
    assert.deepEqual(engine.aggregates.getFooter(), before);
    assert.equal((before as Record<string, Record<string, number>>)['n']?.['sum'], 0 + 7);
  });

  it('hasDetail excludes rows and rejects their expansion', () => {
    const engine = makeEngine(items(4), { detail: { hasDetail: (r: Item) => r.cat !== 'b' } });
    assert.deepEqual(engine.dispatch({ type: 'detail.expand', rowId: 'r1' }), { status: 'rejected', reason: 'noDetail' });
    engine.dispatch({ type: 'detail.expandAll' });
    assert.deepEqual(visibleIds(engine), ['r0', '__detail:r0', 'r1', 'r2', '__detail:r2', 'r3', '__detail:r3']);
  });

  it('is disabled by detail.setEnabled and validates commands', () => {
    const engine = makeEngine(items(2), { detail: { expanded: { r0: true } } });
    assert.equal(engine.getSnapshot().rows.count, 3);
    engine.dispatch({ type: 'detail.setEnabled', enabled: false });
    assert.equal(engine.getSnapshot().rows.count, 2);
    assert.deepEqual(engine.dispatch({ type: 'detail.expand', rowId: 'r1' }), { status: 'rejected', reason: 'detailDisabled' });
    engine.dispatch({ type: 'detail.setEnabled', enabled: true });
    assert.deepEqual(engine.dispatch({ type: 'detail.expand', rowId: '' }), { status: 'rejected', reason: 'invalidRowId' });
    assert.deepEqual(engine.dispatch({ type: 'detail.setExpanded', expanded: [] as never }), { status: 'rejected', reason: 'invalidExpanded' });
    engine.dispatch({ type: 'detail.setExpanded', expanded: { r1: true } });
    assert.deepEqual(visibleIds(engine), ['r0', 'r1', '__detail:r1']);
  });

  it('reads defaultQuery.expansion.detail with the reserved default key', () => {
    const engine = makeEngine(items(2), { defaultQuery: { expansion: { detail: { '*': true, r0: false } } } });
    assert.deepEqual(visibleIds(engine), ['r0', 'r1', '__detail:r1']);
  });

  it('notifies only the toggled row and its detail row', () => {
    const engine = makeEngine(items(4));
    const hits: string[] = [];
    for (const id of ['r0', 'r1', 'r2', '__detail:r1']) engine.subscribeRow(id, () => hits.push(id));
    engine.getSnapshot();
    for (const id of ['r0', 'r1', 'r2']) engine.getRowSnapshot(id);
    engine.dispatch({ type: 'detail.expand', rowId: 'r1' });
    assert.ok(hits.includes('r1') && hits.includes('__detail:r1'));
    assert.ok(!hits.includes('r0'));
  });

  it('loads async detail content once per row object without replacing the grid snapshot', async () => {
    const calls: string[] = [];
    let release: (v: string) => void = () => {};
    const source = createLocalDataSource(items(3), { getRowId: (r: Item) => r.id });
    const engine = makeEngine(source, {
      detail: {
        load: ({ rowId }: { rowId: string }) => {
          calls.push(rowId);
          return new Promise<string>((resolve) => (release = resolve));
        },
      },
    });
    let rowHits = 0;
    engine.subscribeRow('__detail:r1', () => rowHits++);
    engine.dispatch({ type: 'detail.expand', rowId: 'r1' });
    await Promise.resolve();
    assert.deepEqual(calls, ['r1']);
    assert.equal(engine.detail.getLoad('r1').status, 'loading');
    const version = engine.getSnapshot().version;
    release('content');
    await new Promise((r) => setTimeout(r, 0));
    const load = engine.detail.getLoad('r1');
    assert.equal(load.status, 'ready');
    assert.equal(load.data, 'content');
    assert.equal(engine.detail.getLoad('r1'), load, 'stable identity');
    assert.equal(engine.getSnapshot().version, version, 'settling does not replace the grid snapshot');
    assert.ok(rowHits >= 2);
    // Same row object: no reload; a replaced row object is idle until loaded again.
    engine.dispatch({ type: 'detail.load', rowId: 'r1' });
    assert.deepEqual(calls, ['r1']);
    source.patch({ upsert: [{ id: 'r1', cat: 'x', n: 1 }] });
    assert.equal(engine.detail.getLoad('r1').status, 'idle');
    engine.dispatch({ type: 'detail.load', rowId: 'r1' });
    assert.deepEqual(calls, ['r1', 'r1']);
    assert.deepEqual(engine.dispatch({ type: 'detail.load', rowId: 'r0' }), { status: 'rejected', reason: 'notExpanded' });
  });

  it('reports load errors and retries', async () => {
    let fail = true;
    const engine = makeEngine(items(2), { detail: { load: () => (fail ? Promise.reject(new Error('boom')) : Promise.resolve(1)) } });
    engine.dispatch({ type: 'detail.expand', rowId: 'r0' });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(engine.detail.getLoad('r0').status, 'error');
    fail = false;
    engine.dispatch({ type: 'detail.retry', rowId: 'r0' });
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(engine.detail.getLoad('r0').status, 'ready');
  });

  it('maps data row indexes (expand by index)', () => {
    const engine = makeEngine(items(6));
    engine.dispatch({ type: 'grouping.groupBy', columnId: 'cat' });
    engine.dispatch({ type: 'detail.expand', rowId: dataRowIdAt(engine.getSnapshot().rows, 1) as string });
    const rows = engine.getSnapshot().rows;
    assert.equal(dataRowIdAt(rows, 1), 'r3');
    // Visible: g(a) r0 r3 detail g(b) r1 ...
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((i) => dataIndexAt(rows, i)), [-1, 0, 1, -1, -1, 2]);
  });
});

describe('detail view oracle', () => {
  function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  it('matches a materialized list over random queries and expansion', () => {
    const random = rng(7);
    const data = items(60);
    const engine = makeEngine(data, { paging: { enabled: false, pageSize: 7 } });
    const commands: (() => DataGridCommand)[] = [
      () => ({ type: 'detail.toggle', rowId: `r${Math.floor(random() * 60)}` }),
      () => ({ type: 'detail.toggle', rowId: `r${Math.floor(random() * 60)}` }),
      () => ({ type: random() < 0.5 ? 'detail.expandAll' : 'detail.collapseAll' }),
      () => ({ type: 'grouping.set', grouping: random() < 0.5 ? [] : [{ columnId: 'cat' }] }),
      () => ({ type: 'grouping.toggle', group: '__g:[["cat","b"]]' }),
      () => ({ type: 'sort.set', sorting: random() < 0.5 ? [] : [{ columnId: 'n', direction: random() < 0.5 ? 'asc' : 'desc' }] }),
      () => ({ type: 'filter.set', filters: random() < 0.5 ? [] : [{ columnId: 'n', operator: 'greaterThan', value: Math.floor(random() * 8), predicate: 'and', source: 'api' }] }),
      () => ({ type: 'paging.setEnabled', enabled: random() < 0.5 }),
      () => ({ type: 'paging.goToPage', page: 1 + Math.floor(random() * 3) }),
    ];
    for (let step = 0; step < 300; step++) {
      engine.dispatch((commands[Math.floor(random() * commands.length)] as () => DataGridCommand)());
      const rows = engine.getSnapshot().rows;
      const view = rows.view;
      // Expected: the inner list with a detail id after every expanded data row.
      const inner = view instanceof DetailView ? view.inner : view;
      const innerIds: string[] = [];
      const innerKinds: string[] = [];
      const innerCount = inner ? inner.count : rows.count;
      for (let i = 0; i < innerCount; i++) {
        innerIds.push(inner ? (inner.idAt(i) as string) : (rows.sourceIds[rows.order === null ? i : (rows.order[i] as number)] as string));
        innerKinds.push(inner ? inner.kindAt(i) : 'data');
      }
      const expected: string[] = [];
      for (let i = 0; i < innerIds.length; i++) {
        const id = innerIds[i] as string;
        expected.push(id);
        if (innerKinds[i] === 'data' && engine.detail.isExpanded(id)) expected.push(`__detail:${id}`);
      }
      assert.deepEqual(visibleIds(engine), expected, `step ${step}`);
      for (let i = 0; i < expected.length; i++) {
        const id = expected[i] as string;
        assert.equal(engine.getRowIndex(id), i, `index of ${id} at step ${step}`);
      }
    }
  });
});

describe('createSparseRowMetrics', () => {
  it('matches variable metrics built from the same heights', () => {
    const count = 500;
    const detailAt = [3, 4, 50, 51, 52, 200, 499];
    const heightOf = (j: number) => 100 + j * 13;
    const sparse = createSparseRowMetrics(count, 36, { detailCount: detailAt.length, detailIndex: (j) => detailAt[j] as number }, heightOf);
    const byIndex = new Map(detailAt.map((idx, j) => [idx, heightOf(j)]));
    const variable = createVariableRowMetrics(count, (i) => byIndex.get(i) ?? 36);
    assert.equal(sparse.totalHeight, variable.totalHeight);
    for (let i = 0; i <= count; i++) assert.equal(sparse.offsetOf(i), variable.offsetOf(i), `offset ${i}`);
    for (let i = 0; i < count; i++) assert.equal(sparse.heightOf(i), variable.heightOf(i));
    for (let y = 0; y < variable.totalHeight + 50; y += 7) assert.equal(sparse.indexAt(y), variable.indexAt(y), `indexAt ${y}`);
    sparse.setHeight(50, 10);
    variable.setHeight(50, 10);
    sparse.setExceptionHeight(6, 5);
    variable.setHeight(499, 5);
    assert.equal(sparse.setHeight(10, 99), 0, 'non-exception rows keep the fixed height');
    for (let y = 0; y < variable.totalHeight + 50; y += 5) assert.equal(sparse.indexAt(y), variable.indexAt(y), `indexAt after update ${y}`);
    assert.equal(sparse.totalHeight, variable.totalHeight);
  });

  it('builds from a detail view', () => {
    const engine = makeEngine(items(5));
    engine.dispatch({ type: 'detail.expand', rowId: 'r2' });
    const view = engine.getSnapshot().rows.view as DetailView;
    const metrics = createSparseRowMetrics(view.count, 36, view, () => 200);
    assert.equal(metrics.totalHeight, 5 * 36 + 200);
    assert.equal(metrics.indexAt(3 * 36 + 10), 3);
    assert.equal(metrics.offsetOf(4), 3 * 36 + 200);
  });
});
