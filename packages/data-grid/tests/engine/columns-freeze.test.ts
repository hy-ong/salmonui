import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { columnZone, createDataGridEngine, type ColumnDef, type ColumnsState } from '@salmonui/data-grid/engine';
import { collectWarnings, people, personColumns, type Person } from './fixtures.ts';

function make(columns: readonly ColumnDef<Person>[] = personColumns, initialColumnState?: Parameters<typeof createDataGridEngine<Person>>[0]['initialColumnState']) {
  const w = collectWarnings();
  const engine = createDataGridEngine<Person>({
    getRowId: (row) => row.id,
    columns,
    dataSource: people(),
    dev: true,
    instrument: true,
    onWarning: w.onWarning,
    timeZone: 'UTC',
    ...(initialColumnState ? { initialColumnState } : {}),
  });
  return { engine, w };
}

const ids = (list: readonly { columnId: string }[]) => list.map((c) => c.columnId);
const state = (engine: ReturnType<typeof make>['engine']) => engine.getModuleState<ColumnsState>('columns') as ColumnsState;

describe('frozen columns', () => {
  it('partitions by definition freeze and exposes the zone map', () => {
    const { engine } = make([{ field: 'id', pinned: 'start' }, { field: 'name' }, { field: 'age', pinned: 'end' }, { field: 'active' }]);
    const cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.left), ['id']);
    assert.deepEqual(ids(cols.center), ['name', 'active']);
    assert.deepEqual(ids(cols.right), ['age']);
    assert.equal(columnZone(cols, 'age'), 'right');
    assert.equal(columnZone(cols, 'name'), 'center');
    assert.equal(engine.getHeaderSnapshot('age')?.freeze, 'right');
  });

  it('frozenColumns count shorthand freezes the first/last visible leaves', () => {
    const { engine } = make(personColumns, { frozenCount: { left: 2, right: 1 } });
    let cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.left), ['id', 'name']);
    assert.deepEqual(ids(cols.right), ['address.city']);
    engine.columns.setFrozenCount({ left: 1 });
    cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.left), ['id']);
    assert.deepEqual(ids(cols.right), ['address.city']);
    assert.equal(engine.columns.setFrozenCount({ left: 1, right: 1 }).status, 'applied');
    assert.equal(state(engine).frozenCount.left, 1);
  });

  it('pins and unpins at runtime, moving to the inner edge of the zone without recompiling', () => {
    const { engine } = make([{ field: 'id', pinned: 'start' }, { field: 'name' }, { field: 'age' }, { field: 'active' }, { field: 'joined', pinned: 'end' }]);
    const compiles = engine.getInstrumentation()?.columnCompiles;
    engine.columns.setFreeze({ columnId: 'active', freeze: 'left' });
    let cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.left), ['id', 'active']);
    assert.deepEqual(ids(cols.center), ['name', 'age']);
    engine.columns.setFreeze({ columnId: 'name', freeze: 'right' });
    cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.right), ['name', 'joined']);
    // Unpinning a definition-frozen column overrides `freeze`.
    engine.columns.setFreeze({ columnId: 'id', freeze: null });
    cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.left), ['active']);
    assert.deepEqual(ids(cols.center), ['id', 'age']);
    engine.columns.setFreeze({ columnId: 'name', freeze: null });
    cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.center), ['id', 'age', 'name']);
    assert.equal(engine.getInstrumentation()?.columnCompiles, compiles);
    assert.equal(engine.columns.setFreeze({ columnId: 'nope', freeze: 'left' }).status, 'rejected');
  });

  it('reorder never crosses a runtime freeze edge', () => {
    const { engine } = make();
    engine.columns.setFreeze({ columnId: 'name', freeze: 'left' });
    const visible = ids(engine.getSnapshot().columns.visible);
    assert.deepEqual(visible.slice(0, 1), ['name']);
    const r = engine.columns.move({ columnId: 'age', toIndex: 0 });
    assert.equal(r.status, 'rejected');
    assert.equal(r.status === 'rejected' && r.reason, 'crossesFreezeZone');
  });

  it('an explicit pin beats the count shorthand', () => {
    const { engine } = make(personColumns, { frozenCount: { left: 3 } });
    engine.columns.setFreeze({ columnId: 'name', freeze: null });
    const cols = engine.getSnapshot().columns;
    assert.ok(!ids(cols.left).includes('name'));
    assert.equal(columnZone(cols, 'name'), 'center');
  });

  it('notifies header subscribers when a frozenColumns count moves them across a zone edge', () => {
    const { engine } = make(personColumns);
    assert.equal(engine.getHeaderSnapshot('name')?.freeze, null);
    assert.equal(engine.getHeaderSnapshot('age')?.freeze, null);
    let nameCalls = 0;
    let ageCalls = 0;
    engine.subscribeHeader('name', () => nameCalls++);
    engine.subscribeHeader('age', () => ageCalls++);
    engine.columns.setFrozenCount({ left: 2 });
    assert.equal(nameCalls, 1);
    assert.equal(ageCalls, 0, 'headers whose zone did not change are not notified');
    assert.equal(engine.getHeaderSnapshot('name')?.freeze, 'left');
    engine.columns.setFrozenCount({ left: 0 });
    assert.equal(nameCalls, 2);
    assert.equal(engine.getHeaderSnapshot('name')?.freeze, null);
  });
});

describe('stacked headers', () => {
  const stacked: ColumnDef<Person>[] = [
    { field: 'id' },
    { id: 'person', header: 'Person', columns: [{ field: 'name' }, { field: 'age' }] },
    { id: 'meta', header: 'Meta', columns: [{ field: 'active' }, { id: 'when', header: 'When', columns: [{ field: 'joined' }] }] },
  ];

  it('compiles a header tree whose depth is the header row count', () => {
    const { engine } = make(stacked);
    const cols = engine.getSnapshot().columns;
    assert.equal(cols.headerRowCount, 3);
    assert.deepEqual(ids(cols.visible), ['id', 'name', 'age', 'active', 'joined']);
    assert.deepEqual(cols.byId.get('joined')?.path, ['meta', 'when', 'joined']);
  });

  it('reorders leaves within their parent and rejects moves out of a group', () => {
    const { engine } = make(stacked);
    assert.equal(engine.columns.move({ columnId: 'age', toIndex: 1 }).status, 'applied');
    assert.deepEqual(ids(engine.getSnapshot().columns.visible), ['id', 'age', 'name', 'active', 'joined']);
    const out = engine.columns.move({ columnId: 'age', toIndex: 0 });
    assert.equal(out.status === 'rejected' && out.reason, 'crossesColumnGroup');
    const into = engine.columns.move({ columnId: 'id', toIndex: 1 });
    assert.equal(into.status === 'rejected' && into.reason, 'crossesColumnGroup');
  });
});

describe('UI command probing', () => {
  it('hasCommand reports declared command types', () => {
    const { engine } = make();
    assert.equal(engine.hasCommand('columns.setFreeze'), true);
    assert.equal(engine.hasCommand('edit.add'), false);
  });
});

describe('frozen count and runtime pinning', () => {
  it('unpinning a counted column keeps the other counted columns frozen', () => {
    const { engine } = make(personColumns, { frozenCount: { left: 3 } });
    assert.deepEqual(ids(engine.getSnapshot().columns.left), ['id', 'name', 'age']);
    engine.dispatch({ type: 'columns.setFreeze', columnId: 'name', freeze: null });
    const cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.left), ['id', 'age']);
    assert.equal(columnZone(cols, 'name'), 'center');
    assert.equal(state(engine).frozenCount.left, 2);
  });

  it('pinning a counted column right does not pull the next column into the count', () => {
    const { engine } = make(personColumns, { frozenCount: { left: 3 } });
    engine.dispatch({ type: 'columns.setFreeze', columnId: 'name', freeze: 'right' });
    const cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.left), ['id', 'age']);
    assert.deepEqual(ids(cols.right), ['name']);
    assert.equal(columnZone(cols, 'active'), 'center');
  });

  it('uses runtime order positions when a definition-frozen column is present', () => {
    const columns: ColumnDef<Person>[] = [{ field: 'id' }, { field: 'name' }, { field: 'age', pinned: 'start' }, { field: 'active' }];
    const { engine } = make(columns, { frozenCount: { left: 1 } });
    assert.deepEqual(ids(engine.getSnapshot().columns.left), ['id', 'age']);
    engine.dispatch({ type: 'columns.setFreeze', columnId: 'age', freeze: null });
    const cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.left), ['id'], 'the counted column stays frozen');
    assert.equal(state(engine).frozenCount.left, 1);
  });
});
