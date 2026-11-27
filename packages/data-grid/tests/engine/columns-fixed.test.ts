import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { columnZone, createDataGridEngine, type ColumnDef, type ColumnsState } from '@salmonui/data-grid/engine';
import { getDataGridState, normalizeDataGridState, restoreDataGridState } from '@salmonui/data-grid/engine/persistence';
import { collectWarnings, people, type Person } from './fixtures.ts';

function make(columns: readonly ColumnDef<Person>[], initialColumnState?: Parameters<typeof createDataGridEngine<Person>>[0]['initialColumnState']) {
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

const fiveColumns: readonly ColumnDef<Person>[] = [
  { field: 'id', pinned: 'start' },
  { field: 'name' },
  { field: 'age', pinned: 'center' },
  { field: 'active' },
  { field: 'joined', pinned: 'end' },
];

describe('fixed zone (pinned: center)', () => {
  it('keeps a fixed column in its center slot and lists it in snapshot.fixed', () => {
    const { engine } = make(fiveColumns);
    const cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.left), ['id']);
    assert.deepEqual(ids(cols.center), ['name', 'age', 'active']);
    assert.deepEqual(ids(cols.fixed), ['age']);
    assert.deepEqual(ids(cols.right), ['joined']);
    // Visible (keyboard and aria-colindex) order is the visual order.
    assert.deepEqual(ids(cols.visible), ['id', 'name', 'age', 'active', 'joined']);
    assert.equal(columnZone(cols, 'age'), 'center');
    assert.equal(cols.byId.get('age')?.freeze, 'fixed');
    assert.equal(engine.getHeaderSnapshot('age')?.freeze, null);
  });

  it('costs nothing when unused: one shared empty fixed list across snapshots', () => {
    const { engine } = make([{ field: 'id' }, { field: 'name' }, { field: 'age' }]);
    const before = engine.getSnapshot().columns.fixed;
    assert.equal(before.length, 0);
    assert.ok(Object.isFrozen(before));
    engine.columns.setWidth({ columnId: 'name', width: 200 });
    engine.columns.move({ columnId: 'age', toIndex: 0 });
    assert.equal(engine.getSnapshot().columns.fixed, before);
  });

  it('fixes and unfixes a center column at runtime without moving it or recompiling', () => {
    const { engine } = make([{ field: 'id' }, { field: 'name' }, { field: 'age' }, { field: 'active' }]);
    const compiles = engine.getInstrumentation()?.columnCompiles;
    assert.equal(engine.columns.setFreeze({ columnId: 'age', freeze: 'fixed' }).status, 'applied');
    let cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.center), ['id', 'name', 'age', 'active']);
    assert.deepEqual(ids(cols.fixed), ['age']);
    assert.equal(state(engine).freeze['age'], 'fixed');
    // Same state again is a no-op.
    const s = state(engine);
    engine.columns.setFreeze({ columnId: 'age', freeze: 'fixed' });
    assert.equal(state(engine), s);
    engine.columns.setFreeze({ columnId: 'age', freeze: null });
    cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.center), ['id', 'name', 'age', 'active']);
    assert.equal(cols.fixed.length, 0);
    assert.equal(engine.getInstrumentation()?.columnCompiles, compiles);
  });

  it('a start or end pinned column fixed at runtime enters the center at the inner edge of its old zone', () => {
    const { engine } = make(fiveColumns);
    engine.columns.setFreeze({ columnId: 'id', freeze: 'fixed' });
    let cols = engine.getSnapshot().columns;
    assert.equal(cols.left.length, 0);
    assert.deepEqual(ids(cols.center), ['id', 'name', 'age', 'active']);
    assert.deepEqual(ids(cols.fixed), ['id', 'age']);
    engine.columns.setFreeze({ columnId: 'joined', freeze: 'fixed' });
    cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.center), ['id', 'name', 'age', 'active', 'joined']);
    assert.deepEqual(ids(cols.fixed), ['id', 'age', 'joined']);
    // Pinning a fixed column to the start leaves the fixed zone.
    engine.columns.setFreeze({ columnId: 'age', freeze: 'left' });
    cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.left), ['age']);
    assert.deepEqual(ids(cols.fixed), ['id', 'joined']);
  });

  it('a fixed column reorders within the center but never across a pin edge', () => {
    const { engine } = make(fiveColumns);
    assert.equal(engine.columns.move({ columnId: 'age', toIndex: 3 }).status, 'applied');
    let cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.center), ['name', 'active', 'age']);
    assert.deepEqual(ids(cols.fixed), ['age']);
    const toStart = engine.columns.move({ columnId: 'age', toIndex: 0 });
    assert.equal(toStart.status, 'rejected');
    assert.equal(toStart.status === 'rejected' ? toStart.reason : '', 'crossesFreezeZone');
    // A scrolling column may pass the fixed column.
    assert.equal(engine.columns.move({ columnId: 'name', toIndex: 3 }).status, 'applied');
    cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.center), ['active', 'age', 'name']);
  });

  it('the frozenColumns count beats a fixed definition for the positions it covers', () => {
    const { engine } = make([{ field: 'id', pinned: 'center' }, { field: 'name' }, { field: 'age', pinned: 'center' }], { frozenCount: { left: 1 } });
    const cols = engine.getSnapshot().columns;
    assert.deepEqual(ids(cols.left), ['id']);
    assert.deepEqual(ids(cols.fixed), ['age']);
  });

  it('initialColumnState, setPinning and saved state accept the fixed pin', () => {
    const { engine } = make([{ field: 'id' }, { field: 'name' }, { field: 'age' }], { freeze: { name: 'fixed' } });
    assert.deepEqual(ids(engine.getSnapshot().columns.fixed), ['name']);
    engine.dispatch({ type: 'columns.setPinning', freeze: { age: 'fixed' }, frozenCount: {} });
    assert.deepEqual(ids(engine.getSnapshot().columns.fixed), ['age']);
    const saved = getDataGridState(engine);
    assert.deepEqual(saved.pinning, { start: 0, end: 0, columns: { age: 'center' } });
    const target = make([{ field: 'id' }, { field: 'name' }, { field: 'age' }]).engine;
    assert.equal(restoreDataGridState(target, saved).status, 'applied');
    assert.deepEqual(ids(target.getSnapshot().columns.fixed), ['age']);
    assert.deepEqual(normalizeDataGridState({ version: 1, pinning: { start: 0, end: 0, columns: { a: 'center' } } }).pinning?.columns, { a: 'center' });
  });
});
