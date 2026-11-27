import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, previewColumnsCommand, type ColumnDef, type ColumnsState, type DataGridModule } from '@salmonui/data-grid/engine';
import { collectWarnings, people, personColumns, type Person } from './fixtures.ts';

function make(columns: readonly ColumnDef<Person>[] = personColumns) {
  const w = collectWarnings();
  const engine = createDataGridEngine<Person>({
    getRowId: (row) => row.id,
    columns,
    dataSource: people(),
    dev: true,
    instrument: true,
    onWarning: w.onWarning,
    timeZone: 'UTC',
  });
  return { engine, w };
}

const ids = (list: readonly { columnId: string }[]) => list.map((c) => c.columnId);
const state = (engine: ReturnType<typeof make>['engine']) => engine.getModuleState<ColumnsState>('columns') as ColumnsState;

describe('column widths', () => {
  it('sets, clamps, merges, and replaces runtime widths without recompiling', () => {
    const { engine } = make([{ field: 'id', minWidth: 50, maxWidth: 300 }, { field: 'name' }]);
    assert.equal(engine.columns.setWidth({ columnId: 'id', width: 10 }).status, 'applied');
    assert.deepEqual(state(engine).widths, { id: 50 });
    engine.columns.setWidth({ columnId: 'id', width: 999 });
    assert.equal(state(engine).widths['id'], 300);
    engine.columns.setWidths({ widths: { name: 120.4 } });
    assert.deepEqual(state(engine).widths, { id: 300, name: 120 });
    engine.columns.setWidths({ widths: { name: 80 }, replace: true });
    assert.deepEqual(state(engine).widths, { name: 80 });
    assert.equal(engine.getInstrumentation()?.columnCompiles, 1);
  });

  it('rejects unknown columns and keeps identity for no-op widths', () => {
    const { engine, w } = make();
    assert.equal(engine.columns.setWidth({ columnId: 'nope', width: 10 }).status, 'rejected');
    engine.columns.setWidth({ columnId: 'name', width: 100 });
    const before = engine.getSnapshot();
    engine.columns.setWidth({ columnId: 'name', width: 100 });
    assert.equal(engine.getSnapshot(), before);
    engine.columns.setWidths({ widths: { ghost: 10 } });
    assert.ok(w.codes().includes('column-unknown'));
  });

  it('notifies the header of a resized column', () => {
    const { engine } = make();
    let name = 0;
    let age = 0;
    engine.subscribeHeader('name', () => name++);
    engine.subscribeHeader('age', () => age++);
    engine.getHeaderSnapshot('name');
    engine.getHeaderSnapshot('age');
    engine.columns.setWidth({ columnId: 'name', width: 222 });
    assert.equal(name, 1);
    assert.equal(age, 0);
  });
});

describe('column order', () => {
  it('moves a column among the visible leaves and keeps hidden slots', () => {
    const { engine } = make();
    engine.columns.hide({ keys: ['age'] });
    // visible: id name active joined address.city
    assert.equal(engine.columns.move({ columnId: 'address.city', toIndex: 1 }).status, 'applied');
    assert.deepEqual(ids(engine.getSnapshot().columns.visible), ['id', 'address.city', 'name', 'active', 'joined']);
    engine.columns.show({ keys: ['age'] });
    assert.deepEqual(ids(engine.getSnapshot().columns.visible), ['id', 'address.city', 'age', 'name', 'active', 'joined'], 'hidden columns keep their slot');
    // leaves keep definition order and identity
    assert.deepEqual(ids(engine.getSnapshot().columns.leaves), ids(personColumns.map((c) => ({ columnId: c.field as string }))));
    assert.equal(engine.getInstrumentation()?.columnCompiles, 1);
  });

  it('rejects moves across freeze zones, of locked columns, and before locked columns', () => {
    const { engine } = make([
      { field: 'id', pinned: 'start' },
      { field: 'name', lockPosition: true },
      { field: 'age' },
      { field: 'active' },
      { field: 'joined', pinned: 'end' },
    ]);
    assert.deepEqual(ids(engine.getSnapshot().columns.center), ['name', 'age', 'active']);
    const result = (c: { status: string; reason?: string }) => (c.status === 'rejected' ? c.reason : c.status);
    assert.equal(result(engine.columns.move({ columnId: 'age', toIndex: 0 })), 'crossesFreezeZone');
    assert.equal(result(engine.columns.move({ columnId: 'name', toIndex: 3 })), 'columnLocked');
    assert.equal(result(engine.columns.move({ columnId: 'active', toIndex: 1 })), 'columnLocked');
    assert.equal(result(engine.columns.move({ columnId: 'active', toIndex: 2 })), 'applied');
    assert.deepEqual(ids(engine.getSnapshot().columns.center), ['name', 'active', 'age']);
    assert.equal(result(engine.columns.move({ columnId: 'age', toIndex: 9 })), 'indexOutOfRange');
  });

  it('replaces the order with setOrder and ignores unknown ids', () => {
    const { engine } = make();
    engine.columns.setOrder({ order: ['name', 'ghost', 'id'] });
    assert.deepEqual(ids(engine.getSnapshot().columns.visible), ['name', 'id', 'age', 'active', 'joined', 'address.city']);
    const before = engine.getSnapshot();
    engine.columns.setOrder({ order: ['name', 'id'] });
    assert.equal(engine.getSnapshot(), before, 'an equivalent order is a no-op');
  });

  it('does not re-run pipeline stages on reorder or resize', () => {
    let runs = 0;
    const probe: DataGridModule<Person> = {
      name: 'probe',
      commands: [],
      initialState: () => null,
      pipeline: [{ name: 'filter', key: () => [], run: (input) => (runs++, input) }],
    };
    const engine = createDataGridEngine({
      getRowId: (r: Person) => r.id,
      columns: personColumns,
      dataSource: people(),
      dev: false,
      modules: [probe],
    });
    engine.getSnapshot();
    const base = runs;
    engine.dispatch({ type: 'columns.move', columnId: 'name', toIndex: 3 });
    engine.dispatch({ type: 'columns.setWidth', columnId: 'name', width: 90 });
    engine.getSnapshot();
    assert.equal(runs, base);
  });
});

describe('initial column state and dry runs', () => {
  it('applies initialColumnState before the server snapshot', () => {
    const engine = createDataGridEngine({
      getRowId: (r: Person) => r.id,
      columns: personColumns,
      dataSource: people(),
      dev: false,
      initialColumnState: { visibility: { age: false }, widths: { name: 99 }, order: ['name', 'id'] },
    });
    const server = engine.getServerSnapshot();
    assert.deepEqual(ids(server.columns.visible), ['name', 'id', 'active', 'joined', 'address.city']);
    assert.deepEqual((server.modules['columns'] as ColumnsState).widths, { name: 99 });
  });

  it('previewColumnsCommand is pure and reports rejections as null', () => {
    const { engine } = make();
    const columns = engine.getSnapshot().columns;
    const before = state(engine);
    const next = previewColumnsCommand(columns, before, { type: 'columns.hide', keys: ['age'] });
    assert.equal(next?.visibility['age'], false);
    assert.equal(state(engine), before, 'engine state untouched');
    assert.equal(previewColumnsCommand(columns, before, { type: 'columns.hide', keys: ['ghost'] }), null);
  });
});
