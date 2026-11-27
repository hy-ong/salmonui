// Row drag and drop: drop points, sessions outside the
// grid snapshot, reorder writes through local and remote sources,
// `reorderRows` / `fromIndex` / `dropIndex` semantics, multi-row drags,
// grouping rules, keyboard moves, cancelation, cross-grid handoff, and the
// pinned row policy (pinned rows are neither drag sources nor drop targets).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDataGridEngine,
  createGroupingModule,
  createLocalDataSource,
  createSelectionModule,
  createSortModule,
  type DataSource,
  type DataGridOptions,
  type LocalDataSource,
  type RowDragDropState,
  type RowDragHandoff,
  type WriteRequest,
} from '@salmonui/data-grid/engine';
import { createDetailModule } from '@salmonui/data-grid/engine/expansion';
import { computeDropPoint, createRowDragDropModule, createRowDragHandoff, isPinnedIndex } from '@salmonui/data-grid/engine/row-drag-drop';
import { createRowPinningModule } from '@salmonui/data-grid/engine/row-pinning';

interface Task {
  readonly id: string;
  readonly team: string;
  readonly rank: number;
}

function tasks(count: number): Task[] {
  return Array.from({ length: count }, (_, i) => ({ id: `t${i}`, team: i % 2 === 0 ? 'x' : 'y', rank: i + 1 }));
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function makeEngine(source: readonly Task[] | DataSource<Task>, options: Record<string, unknown> = {}) {
  const modules = [createSortModule<Task>(), createGroupingModule<Task>(), createSelectionModule<Task>(), createDetailModule<Task>(), createRowDragDropModule<Task>()] as const;
  return createDataGridEngine<Task, typeof modules>({
    getRowId: (t: Task) => t.id,
    columns: [{ field: 'id', primaryKey: true }, { field: 'team' }, { field: 'rank', type: 'number' }],
    dataSource: source,
    modules,
    selection: { type: 'multiple' },
    ...options,
  } as DataGridOptions<Task> & { modules: typeof modules });
}

const local = (count: number) => createLocalDataSource(tasks(count), { getRowId: (t: Task) => t.id });
const order = (source: LocalDataSource<Task>) => source.getRows().map((t) => t.id);
const state = (engine: { getModuleState<T>(name: string): T | undefined }) => engine.getModuleState<RowDragDropState>('rowDragDrop') as RowDragDropState;

describe('computeDropPoint', () => {
  it('splits data rows in halves and clamps past the end', () => {
    const engine = makeEngine(tasks(3));
    const rows = engine.getSnapshot().rows;
    assert.equal(computeDropPoint(rows, 1, 0.2).position, 'before');
    assert.equal(computeDropPoint(rows, 1, 0.7).position, 'after');
    assert.deepEqual({ ...computeDropPoint(rows, 9, 0) }, { index: 2, rowId: 't2', kind: 'data', position: 'after', groupId: null });
  });
});

describe('row drag and drop', () => {
  it('reorders within the grid through dataSource.write', async () => {
    const source = local(5);
    const engine = makeEngine(source);
    assert.equal(engine.dispatch({ type: 'rowDragDrop.start', rowId: 't0' }).status, 'applied');
    engine.dispatch({ type: 'rowDragDrop.over', index: 3, fraction: 0.8 });
    const args = engine.rowDragDrop.getEventArgs();
    assert.equal(args?.fromIndex, 0);
    assert.equal(args?.dropIndex, 3, 'dropIndex: the final data index');
    assert.equal(args?.data[0]?.id, 't0');
    engine.dispatch({ type: 'rowDragDrop.drop' });
    assert.deepEqual(order(source), ['t1', 't2', 't3', 't0', 't4']);
    assert.equal(state(engine).drag, null);
    assert.equal(state(engine).lastDrop?.status, 'pending');
    await flush();
    assert.equal(state(engine).lastDrop?.status, 'applied');
    assert.equal(engine.getRowIdAt(3), 't0');
  });

  it('keeps pointer moves out of the grid snapshot and notifies only indicator rows', () => {
    const engine = makeEngine(tasks(50));
    engine.dispatch({ type: 'rowDragDrop.start', rowId: 't5' });
    const version = engine.getSnapshot().version;
    for (const id of ['t10', 't11', 't20']) engine.getRowSnapshot(id);
    const hits: string[] = [];
    for (const id of ['t10', 't11', 't20']) engine.subscribeRow(id, () => hits.push(id));
    let moduleHits = 0;
    engine.subscribeModule('rowDragDrop', () => moduleHits++);
    let gridHits = 0;
    engine.subscribe(() => gridHits++);
    engine.dispatch({ type: 'rowDragDrop.over', index: 10, fraction: 0.2 });
    engine.dispatch({ type: 'rowDragDrop.over', index: 10, fraction: 0.3 }); // same target
    engine.dispatch({ type: 'rowDragDrop.over', index: 11, fraction: 0.2 });
    for (let i = 0; i < 1000; i++) engine.dispatch({ type: 'rowDragDrop.over', index: i % 40, fraction: (i % 10) / 10 });
    assert.equal(engine.getSnapshot().version, version);
    assert.equal(gridHits, 0);
    assert.ok(moduleHits > 0);
    assert.deepEqual(hits.slice(0, 3), ['t10', 't10', 't11']);
    assert.ok(!hits.includes('t20') || hits.indexOf('t20') > 2);
  });

  it('rejects drops onto dragged rows and on sorted grids', async () => {
    const source = local(4);
    const engine = makeEngine(source);
    engine.dispatch({ type: 'rowDragDrop.start', rowId: 't1' });
    engine.dispatch({ type: 'rowDragDrop.over', rowId: 't1', position: 'after' });
    assert.equal(state(engine).drag?.over?.reason, 'self');
    engine.dispatch({ type: 'rowDragDrop.drop' });
    assert.equal(state(engine).lastDrop?.status, 'invalid');
    assert.deepEqual(order(source), ['t0', 't1', 't2', 't3']);
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'id', direction: 'desc' }] });
    engine.dispatch({ type: 'rowDragDrop.start', rowId: 't1' });
    engine.dispatch({ type: 'rowDragDrop.over', index: 0, fraction: 0 });
    assert.equal(state(engine).drag?.over?.reason, 'sorted');
    assert.deepEqual(engine.dispatch({ type: 'rowDragDrop.reorder', fromIndexes: [0], toIndex: 2 }), { status: 'rejected', reason: 'sorted' });
  });

  it('drags the selected rows when a selected row is dragged', () => {
    const source = local(6);
    const engine = makeEngine(source);
    engine.dispatch({ type: 'selection.selectRows', rowIds: ['t4', 't1'] });
    engine.dispatch({ type: 'rowDragDrop.start', rowId: 't4' });
    assert.deepEqual(state(engine).drag?.rowIds, ['t1', 't4']);
    assert.deepEqual(state(engine).drag?.fromIndexes, [1, 4]);
    engine.dispatch({ type: 'rowDragDrop.over', index: 0, fraction: 0.1 });
    assert.equal(state(engine).drag?.over?.dropIndex, 0);
    engine.dispatch({ type: 'rowDragDrop.drop' });
    assert.deepEqual(order(source), ['t1', 't4', 't0', 't2', 't3', 't5']);
    // An unselected row drags alone.
    engine.dispatch({ type: 'rowDragDrop.start', rowId: 't3' });
    assert.deepEqual(state(engine).drag?.rowIds, ['t3']);
    engine.dispatch({ type: 'rowDragDrop.cancel' });
    assert.equal(state(engine).drag, null);
  });

  it('reorders by data indexes like reorderRows', () => {
    const cases: [number[], number, string[]][] = [
      [[0], 3, ['t1', 't2', 't3', 't0', 't4']],
      [[3], 0, ['t3', 't0', 't1', 't2', 't4']],
      [[0, 1], 2, ['t2', 't3', 't0', 't1', 't4']],
      [[2], 99, ['t0', 't1', 't3', 't4', 't2']],
    ];
    for (const [from, to, expected] of cases) {
      const source = local(5);
      const engine = makeEngine(source);
      assert.equal(engine.dispatch({ type: 'rowDragDrop.reorder', fromIndexes: from, toIndex: to }).status, 'applied');
      assert.deepEqual(order(source), expected, `reorderRows(${JSON.stringify(from)}, ${to})`);
    }
    const engine = makeEngine(local(2));
    assert.deepEqual(engine.dispatch({ type: 'rowDragDrop.reorder', fromIndexes: [7], toIndex: 0 }), { status: 'rejected', reason: 'invalidIndexes' });
  });

  it('dropIndex matches the reorderRows result for every pointer target', () => {
    for (let from = 0; from < 5; from++) {
      for (let at = 0; at < 5; at++) {
        for (const fraction of [0.1, 0.9]) {
          const source = local(5);
          const engine = makeEngine(source);
          engine.dispatch({ type: 'rowDragDrop.start', rowId: `t${from}` });
          engine.dispatch({ type: 'rowDragDrop.over', index: at, fraction });
          const over = state(engine).drag?.over;
          if (!over?.valid) continue;
          engine.dispatch({ type: 'rowDragDrop.drop' });
          assert.equal(order(source).indexOf(`t${from}`), over.dropIndex, `from ${from} over ${at} ${fraction}`);
        }
      }
    }
  });

  it('moves rows with the keyboard alternative', () => {
    const source = local(4);
    const engine = makeEngine(source);
    engine.dispatch({ type: 'rowDragDrop.moveBy', rowIds: ['t2'], offset: -1 });
    assert.deepEqual(order(source), ['t0', 't2', 't1', 't3']);
    engine.dispatch({ type: 'rowDragDrop.moveBy', rowIds: ['t2'], offset: 2 });
    assert.deepEqual(order(source), ['t0', 't1', 't3', 't2']);
    assert.deepEqual(engine.dispatch({ type: 'rowDragDrop.moveBy', rowIds: ['t2'], offset: 1 }), { status: 'rejected', reason: 'edge' });
  });

  it('cancels a drag start through onBeforeCommand (rowDragStart args.cancel)', () => {
    const engine = makeEngine(tasks(3));
    engine.onBeforeCommand(({ command }) => (command.type === 'rowDragDrop.start' && command['rowId'] === 't1' ? false : undefined));
    assert.deepEqual(engine.dispatch({ type: 'rowDragDrop.start', rowId: 't1' }), { status: 'rejected', reason: 'cancelled' });
    assert.equal(engine.dispatch({ type: 'rowDragDrop.start', rowId: 't0' }).status, 'applied');
  });

  it('respects groups unless allowGroupChange, which rewrites grouped values', () => {
    const source = local(6);
    const engine = makeEngine(source);
    engine.dispatch({ type: 'grouping.groupBy', columnId: 'team' });
    // x: t0 t2 t4 | y: t1 t3 t5
    engine.dispatch({ type: 'rowDragDrop.start', rowId: 't0' });
    engine.dispatch({ type: 'rowDragDrop.over', rowId: 't3', position: 'before' });
    assert.equal(state(engine).drag?.over?.reason, 'groupChange');
    engine.dispatch({ type: 'rowDragDrop.over', rowId: 't4', position: 'after' });
    assert.equal(state(engine).drag?.over?.valid, true);
    engine.dispatch({ type: 'rowDragDrop.drop' });
    assert.deepEqual(order(source), ['t1', 't2', 't3', 't4', 't0', 't5']);
    engine.dispatch({ type: 'rowDragDrop.setOptions', allowGroupChange: true });
    engine.dispatch({ type: 'rowDragDrop.start', rowId: 't2' });
    engine.dispatch({ type: 'rowDragDrop.over', rowId: '__g:[["team","y"]]' });
    const over = state(engine).drag?.over;
    assert.equal(over?.position, 'into');
    assert.equal(over?.valid, true);
    engine.dispatch({ type: 'rowDragDrop.drop' });
    const moved = source.getRows().find((t) => t.id === 't2');
    assert.equal(moved?.team, 'y');
    assert.deepEqual(
      source.getRows().map((t) => t.id),
      ['t2', 't1', 't3', 't4', 't0', 't5'],
    );
    assert.equal(engine.getRowSnapshot('t2')?.parentId, '__g:[["team","y"]]');
  });

  it('drops after the parent row when the pointer is over a detail row', () => {
    const source = local(4);
    const engine = makeEngine(source);
    engine.dispatch({ type: 'detail.expand', rowId: 't1' });
    engine.dispatch({ type: 'rowDragDrop.start', rowId: 't3' });
    engine.dispatch({ type: 'rowDragDrop.over', index: 2, fraction: 0.1 });
    const over = state(engine).drag?.over;
    assert.equal(over?.kind, 'detail');
    assert.equal(over?.rowId, 't1');
    assert.equal(over?.dropIndex, 2);
    engine.dispatch({ type: 'rowDragDrop.drop' });
    assert.deepEqual(order(source), ['t0', 't1', 't3', 't2']);
  });

  it('persists the order through orderField on a remote source', async () => {
    const writes: WriteRequest<Task>[] = [];
    let rows = tasks(4);
    const remote: DataSource<Task> = {
      mode: 'remote',
      read: (request) => ({ version: request.version, rows, totalRowCount: rows.length, performed: ['sort'] }),
      write(request) {
        writes.push(request);
        return Promise.resolve({ version: request.version, status: 'applied' });
      },
    };
    const engine = makeEngine(remote, { rowDragDrop: { orderField: 'rank' }, defaultQuery: { sorting: [{ columnId: 'rank', direction: 'asc' }] } });
    engine.getSnapshot();
    engine.dispatch({ type: 'rowDragDrop.start', rowId: 't3' });
    engine.dispatch({ type: 'rowDragDrop.over', index: 1, fraction: 0.2 });
    assert.equal(state(engine).drag?.over?.valid, true, 'an ascending sort on orderField keeps drops valid');
    engine.dispatch({ type: 'rowDragDrop.drop' });
    assert.equal(writes.length, 1);
    const w = writes[0] as WriteRequest<Task>;
    assert.deepEqual(w.moved, { rowIds: ['t3'], targetRowId: 't1', position: 'before' });
    assert.deepEqual(
      w.changed.map((c) => [c.rowId, c.row.rank, c.changedColumnIds]),
      [['t3', 1.5, ['rank']]],
    );
    await flush();
    assert.equal(state(engine).lastDrop?.status, 'applied');
    void rows;
    rows = [];
  });

  it('renumbers when the order gap is exhausted', () => {
    const source = createLocalDataSource<Task>(
      [
        { id: 'a', team: 'x', rank: 1 },
        { id: 'b', team: 'x', rank: 1 },
        { id: 'c', team: 'x', rank: 2 },
      ],
      { getRowId: (t) => t.id },
    );
    const engine = makeEngine(source, { rowDragDrop: { orderField: 'rank' } });
    engine.dispatch({ type: 'rowDragDrop.move', rowIds: ['c'], targetRowId: 'b', position: 'before' });
    assert.deepEqual(source.getRows().map((t) => [t.id, t.rank]), [['a', 1], ['c', 2], ['b', 3]]);
  });

  it('reports a read-only source', () => {
    const engine = makeEngine({ mode: 'remote', read: (r) => ({ version: r.version, rows: tasks(2), performed: [] }) });
    engine.getSnapshot();
    engine.dispatch({ type: 'rowDragDrop.move', rowIds: ['t0'], targetRowId: 't1', position: 'after' });
    assert.equal(state(engine).lastDrop?.reason, 'readOnlySource');
  });

  it('hands rows to another grid and exposes the payload for custom targets', async () => {
    const handoff: RowDragHandoff = createRowDragHandoff();
    const a = local(3);
    const b = createLocalDataSource<Task>([{ id: 'b0', team: 'x', rank: 1 }, { id: 'b1', team: 'x', rank: 2 }], { getRowId: (t) => t.id });
    const ga = makeEngine(a, { id: 'a', rowDragDrop: { handoff } });
    const gb = makeEngine(b, { id: 'b', rowDragDrop: { handoff } });
    ga.dispatch({ type: 'rowDragDrop.start', rowId: 't1' });
    const payload = ga.rowDragDrop.getPayload();
    assert.equal(payload?.sourceGridId, 'a');
    assert.deepEqual(payload?.rows.map((t) => t.id), ['t1']);
    const token = payload?.token as string;
    assert.deepEqual(ga.dispatch({ type: 'rowDragDrop.overExternal', token, index: 0 }), { status: 'rejected', reason: 'sameGrid' });
    gb.dispatch({ type: 'rowDragDrop.overExternal', token, index: 1, fraction: 0.1 });
    assert.equal(state(gb).drag?.over?.dropIndex, 1);
    gb.dispatch({ type: 'rowDragDrop.receive', token });
    assert.deepEqual(order(b), ['b0', 't1', 'b1']);
    assert.deepEqual(order(a), ['t0', 't2']);
    assert.equal(state(ga).drag, null);
    assert.equal(state(gb).drag, null);
    await flush();
    assert.equal(state(ga).lastDrop?.status, 'applied');
    // Dropped on a custom element: the source keeps its rows.
    ga.dispatch({ type: 'rowDragDrop.start', rowId: 't0' });
    const t2 = ga.rowDragDrop.getPayload()?.token as string;
    ga.dispatch({ type: 'rowDragDrop.end', dropped: false });
    assert.equal(handoff.get(t2), undefined);
    assert.deepEqual(order(a), ['t0', 't2']);
  });

  it('rejects synthetic rows and disabled drags', () => {
    const engine = makeEngine(tasks(4), { rowDragDrop: { enabled: false } });
    assert.deepEqual(engine.dispatch({ type: 'rowDragDrop.start', rowId: 't0' }), { status: 'rejected', reason: 'rowDragDisabled' });
    engine.dispatch({ type: 'rowDragDrop.setEnabled', enabled: true });
    engine.dispatch({ type: 'grouping.groupBy', columnId: 'team' });
    assert.deepEqual(engine.dispatch({ type: 'rowDragDrop.start', rowId: '__g:[["team","x"]]' }), { status: 'rejected', reason: 'notDataRow' });
    assert.deepEqual(engine.dispatch({ type: 'rowDragDrop.over', index: 0 }), { status: 'rejected', reason: 'notDragging' });
  });

  it('keeps the local id index exact across random moves, removals and upserts', async () => {
    let s = 11;
    const random = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
    const source = local(200);
    let expected = order(source);
    for (let step = 0; step < 300; step++) {
      const r = random();
      if (r < 0.7) {
        const k = 1 + Math.floor(random() * 4);
        const ids = [...new Set(Array.from({ length: k }, () => expected[Math.floor(random() * expected.length)] as string))];
        const rest = expected.filter((id) => !ids.includes(id));
        const target = rest[Math.floor(random() * rest.length)] ?? null;
        const position = random() < 0.5 ? 'before' : 'after';
        await source.write({ version: 1, added: [], changed: [], deleted: [], mode: 'row', signal: new AbortController().signal, moved: { rowIds: ids, targetRowId: target, position } });
        const at = target === null ? (position === 'before' ? 0 : rest.length) : rest.indexOf(target) + (position === 'after' ? 1 : 0);
        rest.splice(at, 0, ...ids);
        expected = rest;
      } else if (r < 0.85) {
        const id = expected[Math.floor(random() * expected.length)] as string;
        source.patch({ remove: [id] });
        expected = expected.filter((x) => x !== id);
      } else {
        const id = expected[Math.floor(random() * expected.length)] as string;
        source.patch({ upsert: [{ id, team: 'z', rank: step }] });
        const row = source.getRows().find((t) => t.id === id);
        assert.equal(row?.rank, step, `upsert hits ${id} at step ${step}`);
      }
      assert.deepEqual(order(source), expected, `step ${step}`);
    }
    assert.equal(source.getRows().filter((t) => t.team === 'z').length, new Set(source.getRows().filter((t) => t.team === 'z').map((t) => t.id)).size);
  });

  it('drags rows outside the rendered window by id', () => {
    const source = local(1000);
    const engine = makeEngine(source);
    engine.dispatch({ type: 'rowDragDrop.move', rowIds: ['t999', 't500'], targetRowId: 't0', position: 'before' });
    assert.deepEqual(order(source).slice(0, 3), ['t500', 't999', 't0']);
  });
});

describe('row drag with pinned rows', () => {
  function pinnedEngine(source: LocalDataSource<Task>, pinned: readonly string[], options: Record<string, unknown> = {}) {
    const modules = [createSortModule<Task>(), createSelectionModule<Task>(), createDetailModule<Task>(), createRowPinningModule<Task>(), createRowDragDropModule<Task>()] as const;
    return createDataGridEngine<Task, typeof modules>({
      getRowId: (t: Task) => t.id,
      columns: [{ field: 'id', primaryKey: true }, { field: 'team' }, { field: 'rank', type: 'number' }],
      dataSource: source,
      modules,
      selection: { type: 'multiple' },
      rowPinning: { rowIds: [...pinned] },
      ...options,
    } as DataGridOptions<Task> & { modules: typeof modules });
  }
  const visible = (engine: { getSnapshot(): { rows: { count: number } }; getRowIdAt(i: number): string | undefined }) =>
    Array.from({ length: engine.getSnapshot().rows.count }, (_, i) => engine.getRowIdAt(i));

  it('a pinned row is not a drag source; a selected pinned row is left out of a selection drag', () => {
    const source = local(6);
    const engine = pinnedEngine(source, ['t4']);
    assert.deepEqual(visible(engine), ['t4', 't0', 't1', 't2', 't3', 't5']);
    assert.equal(isPinnedIndex(engine.getSnapshot().rows, 0), true);
    assert.equal(isPinnedIndex(engine.getSnapshot().rows, 1), false);
    assert.deepEqual(engine.dispatch({ type: 'rowDragDrop.start', rowId: 't4' }), { status: 'rejected', reason: 'pinnedRow' });
    assert.equal(state(engine).drag, null);
    engine.dispatch({ type: 'selection.selectRows', rowIds: ['t4', 't1', 't2'] });
    assert.equal(engine.dispatch({ type: 'rowDragDrop.start', rowId: 't1' }).status, 'applied');
    assert.deepEqual([...(state(engine).drag?.rowIds ?? [])], ['t1', 't2']);
    assert.deepEqual([...(state(engine).drag?.fromIndexes ?? [])], [1, 2], 'data indexes count the scrolling rows only');
  });

  it('a pinned row is not a drop target; the first scrolling row is', () => {
    const source = local(6);
    const engine = pinnedEngine(source, ['t4', 't5']);
    engine.dispatch({ type: 'rowDragDrop.start', rowId: 't2' });
    for (const [index, fraction] of [[0, 0.2], [1, 0.8]] as const) {
      engine.dispatch({ type: 'rowDragDrop.over', index, fraction });
      assert.equal(state(engine).drag?.over?.valid, false);
      assert.equal(state(engine).drag?.over?.reason, 'pinnedRow');
    }
    engine.dispatch({ type: 'rowDragDrop.over', rowId: 't5', position: 'after' });
    assert.equal(state(engine).drag?.over?.reason, 'pinnedRow');
    engine.dispatch({ type: 'rowDragDrop.drop' });
    assert.equal(state(engine).lastDrop?.status, 'invalid');
    assert.equal(state(engine).lastDrop?.reason, 'pinnedRow');
    assert.deepEqual(order(source), ['t0', 't1', 't2', 't3', 't4', 't5']);
    // Before the first scrolling row: valid, the row lands at data index 0 below the pinned rows.
    engine.dispatch({ type: 'rowDragDrop.start', rowId: 't2' });
    engine.dispatch({ type: 'rowDragDrop.over', index: 2, fraction: 0.2 });
    assert.equal(state(engine).drag?.over?.valid, true);
    assert.equal(engine.rowDragDrop.getEventArgs()?.dropIndex, 0);
    engine.dispatch({ type: 'rowDragDrop.drop' });
    assert.deepEqual(order(source), ['t2', 't0', 't1', 't3', 't4', 't5']);
    assert.deepEqual(visible(engine).slice(0, 3), ['t4', 't5', 't2']);
  });

  it('move, moveBy and reorder never move pinned rows or place rows among them; orderField renumbering skips them', () => {
    const source = local(5);
    const engine = pinnedEngine(source, ['t3']);
    assert.deepEqual(engine.dispatch({ type: 'rowDragDrop.move', rowIds: ['t3'], targetRowId: 't0', position: 'before' }), { status: 'rejected', reason: 'pinnedRow' });
    assert.deepEqual(engine.dispatch({ type: 'rowDragDrop.move', rowIds: ['t1'], targetRowId: 't3', position: 'after' }), { status: 'rejected', reason: 'pinnedRow' });
    assert.deepEqual(engine.dispatch({ type: 'rowDragDrop.moveBy', rowIds: ['t3'], offset: 1 }), { status: 'rejected', reason: 'pinnedRow' });
    // The first scrolling row has no neighbour above: the pinned rows are not one.
    assert.deepEqual(engine.dispatch({ type: 'rowDragDrop.moveBy', rowIds: ['t0'], offset: -1 }), { status: 'rejected', reason: 'edge' });
    assert.deepEqual(order(source), ['t0', 't1', 't2', 't3', 't4']);
    // reorder data indexes skip the pinned rows: index 0 is t0, the last is t4.
    assert.equal(engine.dispatch({ type: 'rowDragDrop.reorder', fromIndexes: [3], toIndex: 0 }).status, 'applied');
    assert.deepEqual(order(source), ['t4', 't0', 't1', 't2', 't3']);
    assert.deepEqual(visible(engine), ['t3', 't4', 't0', 't1', 't2']);

    const ranked = createLocalDataSource<Task>(
      [
        { id: 'p', team: 'x', rank: 9 },
        { id: 'a', team: 'x', rank: 1 },
        { id: 'b', team: 'x', rank: 1 },
        { id: 'c', team: 'x', rank: 2 },
      ],
      { getRowId: (t) => t.id },
    );
    const withOrder = pinnedEngine(ranked, ['p'], { rowDragDrop: { orderField: 'rank' } });
    withOrder.dispatch({ type: 'rowDragDrop.move', rowIds: ['c'], targetRowId: 'b', position: 'before' });
    assert.deepEqual(ranked.getRows().map((t) => [t.id, t.rank]), [['p', 9], ['a', 1], ['c', 2], ['b', 3]], 'the pinned row keeps its order value');
  });

  it('pin changes notify the affected rows (a row pinned in place re-renders)', () => {
    const engine = pinnedEngine(local(4), []);
    const seen: string[] = [];
    for (const id of ['t0', 't1', 't2']) engine.getRowSnapshot(id);
    for (const id of ['t0', 't1', 't2']) engine.subscribeRow(id, () => seen.push(id));
    engine.dispatch({ type: 'rowPinning.pin', rowIds: ['t0'] });
    assert.equal(engine.getRowIndex('t0'), 0, 'same visible index');
    assert.ok(seen.includes('t0'));
    assert.ok(!seen.includes('t2'));
  });
});

describe('row-drag-state subpath (lazy row drag stand-in)', () => {
  it('the at-rest state, command types and handoff match the row drag module', async () => {
    const state = await import('@salmonui/data-grid/engine/row-drag-state');
    for (const rowDragDrop of [undefined, { allowGroupChange: true, orderField: 'order' }, { enabled: false }]) {
      const options = { getRowId: (r: unknown) => (r as { id: string }).id, columns: [], dataSource: [], ...(rowDragDrop ? { rowDragDrop } : {}) } as DataGridOptions<unknown>;
      assert.deepEqual(state.createInitialRowDragState(options), createRowDragDropModule().initialState(options));
    }
    assert.deepEqual([...state.ROW_DRAG_COMMANDS].sort(), [...createRowDragDropModule().commands].sort());
    assert.equal(state.createRowDragHandoff, createRowDragHandoff);
  });
});
