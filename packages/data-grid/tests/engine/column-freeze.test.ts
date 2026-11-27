import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { columnZone, createDataGridEngine, declaredZone, type ColumnDef, type ColumnsState } from '@salmonui/data-grid/engine';
import { people, personColumns, type Person } from './fixtures.ts';

// Freeze zone resolution of the `columns` module : runtime override > count shorthand > definition
// `pinned`, count bookkeeping on pin/unpin, inner-edge placement, and the move
// rules at freeze and column-group edges.

type Init = NonNullable<Parameters<typeof createDataGridEngine<Person>>[0]['initialColumnState']>;

function make(columns: readonly ColumnDef<Person>[] = personColumns, initialColumnState?: Init) {
  return createDataGridEngine<Person>({
    getRowId: (row) => row.id,
    columns,
    dataSource: people(),
    timeZone: 'UTC',
    ...(initialColumnState ? { initialColumnState } : {}),
  });
}

type Engine = ReturnType<typeof make>;
const ids = (list: readonly { columnId: string }[]) => list.map((c) => c.columnId);
const zones = (engine: Engine) => {
  const cols = engine.getSnapshot().columns;
  return { left: ids(cols.left), center: ids(cols.center), right: ids(cols.right) };
};
const state = (engine: Engine) => engine.getModuleState<ColumnsState>('columns') as ColumnsState;

describe('columns.setFreeze', () => {
  it('rejects unknown ids and column groups with unknownColumn', () => {
    const engine = make([{ field: 'id' }, { id: 'grp', header: 'Group', columns: [{ field: 'name' }, { field: 'age' }] }]);
    const unknown = engine.columns.setFreeze({ columnId: 'nope', freeze: 'left' });
    assert.equal(unknown.status === 'rejected' && unknown.reason, 'unknownColumn');
    const group = engine.columns.setFreeze({ columnId: 'grp', freeze: 'left' });
    assert.equal(group.status === 'rejected' && group.reason, 'unknownColumn');
    assert.deepEqual(state(engine).freeze, {});
  });

  it('pinning end moves the leaf to the start of the right zone (its inner edge)', () => {
    const engine = make([{ field: 'id' }, { field: 'name' }, { field: 'age', pinned: 'end' }, { field: 'active' }]);
    engine.columns.setFreeze({ columnId: 'id', freeze: 'right' });
    assert.deepEqual(zones(engine), { left: [], center: ['name', 'active'], right: ['id', 'age'] });
  });

  it('unpinning from the right zone puts the leaf at the end of the center zone', () => {
    const engine = make([{ field: 'id', pinned: 'end' }, { field: 'name' }, { field: 'age' }, { field: 'active', pinned: 'end' }]);
    engine.columns.setFreeze({ columnId: 'id', freeze: null });
    assert.deepEqual(zones(engine), { left: [], center: ['name', 'age', 'id'], right: ['active'] });
  });

  it('a no-op pin (already in the declared zone) does not record an override', () => {
    const engine = make([{ field: 'id', pinned: 'start' }, { field: 'name' }]);
    const before = state(engine);
    engine.columns.setFreeze({ columnId: 'id', freeze: 'left' });
    assert.equal(state(engine), before);
    assert.deepEqual(state(engine).freeze, {});
  });

  it('records overrides in ColumnsState.freeze and declaredZone reads them', () => {
    const engine = make([{ field: 'id', pinned: 'start' }, { field: 'name' }]);
    engine.columns.setFreeze({ columnId: 'id', freeze: null });
    engine.columns.setFreeze({ columnId: 'name', freeze: 'right' });
    assert.deepEqual(state(engine).freeze, { id: null, name: 'right' });
    const cols = engine.getSnapshot().columns;
    assert.equal(declaredZone(cols.byId.get('id')!, state(engine)), 'center');
    assert.equal(declaredZone(cols.byId.get('name')!, state(engine)), 'right');
    assert.equal(engine.getHeaderSnapshot('name')?.freeze, 'right');
    assert.equal(engine.getHeaderSnapshot('id')?.freeze, null);
  });

  it('initialColumnState.freeze overrides definition pins before the first snapshot', () => {
    const engine = make([{ field: 'id', pinned: 'start' }, { field: 'name' }, { field: 'age' }], { freeze: { id: null, age: 'left' } });
    assert.deepEqual(zones(engine), { left: ['age'], center: ['id', 'name'], right: [] });
  });
});

describe('zone resolution order', () => {
  it('the count beats a definition pin for the positions it covers', () => {
    // `name` declares `end` but sits at position 1, inside the left count of 2.
    const engine = make([{ field: 'id' }, { field: 'name', pinned: 'end' }, { field: 'age' }, { field: 'active' }], { frozenCount: { left: 2 } });
    assert.deepEqual(zones(engine), { left: ['id', 'name'], center: ['age', 'active'], right: [] });
  });

  it('positions outside the count fall back to the definition pin', () => {
    const engine = make([{ field: 'id' }, { field: 'name' }, { field: 'age', pinned: 'start' }, { field: 'active', pinned: 'end' }, { field: 'joined' }], { frozenCount: { left: 1 } });
    assert.deepEqual(zones(engine), { left: ['id', 'age'], center: ['name', 'joined'], right: ['active'] });
  });

  it('an explicit override wins over both the count and the definition', () => {
    const engine = make([{ field: 'id' }, { field: 'name' }, { field: 'age' }, { field: 'active' }], { frozenCount: { left: 2, right: 1 }, freeze: { id: 'right' } });
    const z = zones(engine);
    assert.ok(z.right.includes('id'), 'override right wins over the left count');
    assert.equal(columnZone(engine.getSnapshot().columns, 'id'), 'right');
  });

  it('the left and right counts never overlap when they exceed the visible leaves', () => {
    const engine = make([{ field: 'id' }, { field: 'name' }, { field: 'age' }], { frozenCount: { left: 2, right: 5 } });
    assert.deepEqual(zones(engine), { left: ['id', 'name'], center: [], right: ['age'] });
  });

  it('hidden leaves do not take a counted position', () => {
    const engine = make([{ field: 'id' }, { field: 'name' }, { field: 'age' }, { field: 'active' }], { frozenCount: { left: 2 }, visibility: { name: false } });
    assert.deepEqual(zones(engine).left, ['id', 'age']);
  });

  it('lockPosition leaves sort first within their zone', () => {
    const engine = make([{ field: 'id' }, { field: 'name', pinned: 'start' }, { field: 'age', pinned: 'start', lockPosition: true }, { field: 'active', lockPosition: true }]);
    assert.deepEqual(zones(engine), { left: ['age', 'name'], center: ['active', 'id'], right: [] });
  });

  it('columnZone reports center for unknown and hidden ids', () => {
    const engine = make([{ field: 'id', pinned: 'start' }, { field: 'name', pinned: 'end', hidden: true }]);
    const cols = engine.getSnapshot().columns;
    assert.equal(columnZone(cols, 'nope'), 'center');
    assert.equal(columnZone(cols, 'name'), 'center');
    assert.equal(columnZone(cols, 'id'), 'left');
  });
});

describe('columns.setFrozenCount', () => {
  it('keeps an omitted side and normalizes negative or fractional counts', () => {
    const engine = make(personColumns, { frozenCount: { left: 1, right: 1 } });
    engine.columns.setFrozenCount({ right: 2 });
    assert.deepEqual(state(engine).frozenCount, { left: 1, right: 2 });
    engine.columns.setFrozenCount({ left: 2.9 });
    assert.deepEqual(state(engine).frozenCount, { left: 2, right: 2 });
    engine.columns.setFrozenCount({ left: -3 });
    assert.deepEqual(state(engine).frozenCount, { left: 0, right: 2 });
    assert.deepEqual(zones(engine).right, ['joined', 'address.city']);
  });

  it('an unchanged count keeps the state identity', () => {
    const engine = make(personColumns, { frozenCount: { left: 1 } });
    const before = state(engine);
    engine.columns.setFrozenCount({ left: 1 });
    assert.equal(state(engine), before);
  });

  it('unpinning a right-counted leaf decrements the right count only', () => {
    const engine = make(personColumns, { frozenCount: { left: 1, right: 2 } });
    assert.deepEqual(zones(engine).right, ['joined', 'address.city']);
    engine.columns.setFreeze({ columnId: 'address.city', freeze: null });
    assert.deepEqual(state(engine).frozenCount, { left: 1, right: 1 });
    const z = zones(engine);
    assert.deepEqual(z.left, ['id']);
    assert.deepEqual(z.right, ['joined']);
    assert.ok(z.center.includes('address.city'));
    assert.ok(!z.right.includes('active'), 'the next leaf is not pulled into the count');
  });

  it('pinning a left-counted leaf to the right decrements the left count', () => {
    const engine = make(personColumns, { frozenCount: { left: 2 } });
    engine.columns.setFreeze({ columnId: 'id', freeze: 'right' });
    assert.deepEqual(state(engine).frozenCount, { left: 1, right: 0 });
    assert.deepEqual(zones(engine).left, ['name']);
    assert.deepEqual(zones(engine).right, ['id']);
  });

  it('pinning a center leaf does not touch the count', () => {
    const engine = make(personColumns, { frozenCount: { left: 1 } });
    engine.columns.setFreeze({ columnId: 'age', freeze: 'left' });
    assert.deepEqual(state(engine).frozenCount, { left: 1, right: 0 });
    assert.deepEqual(zones(engine).left, ['id', 'age']);
  });
});

describe('columns.move at freeze and group edges', () => {
  it('rejects a move into another zone set by the definition or the count', () => {
    const engine = make([{ field: 'id', pinned: 'start' }, { field: 'name' }, { field: 'age' }, { field: 'active', pinned: 'end' }]);
    const toLeft = engine.columns.move({ columnId: 'name', toIndex: 0 });
    assert.equal(toLeft.status === 'rejected' && toLeft.reason, 'crossesFreezeZone');
    const toRight = engine.columns.move({ columnId: 'name', toIndex: 3 });
    assert.equal(toRight.status === 'rejected' && toRight.reason, 'crossesFreezeZone');
    assert.equal(engine.columns.move({ columnId: 'name', toIndex: 2 }).status, 'applied');
    assert.deepEqual(ids(engine.getSnapshot().columns.visible), ['id', 'age', 'name', 'active']);

    const counted = make(personColumns, { frozenCount: { left: 2 } });
    const out = counted.columns.move({ columnId: 'age', toIndex: 1 });
    assert.equal(out.status === 'rejected' && out.reason, 'crossesFreezeZone');
    assert.equal(counted.columns.move({ columnId: 'name', toIndex: 0 }).status, 'applied');
    assert.deepEqual(ids(counted.getSnapshot().columns.left), ['name', 'id']);
  });

  it('rejects unknown ids on move with unknownColumn', () => {
    const engine = make();
    const r = engine.columns.move({ columnId: 'nope', toIndex: 0 });
    assert.equal(r.status === 'rejected' && r.reason, 'unknownColumn');
  });

  it('a group split by a freeze edge stays contiguous per zone', () => {
    const stacked: ColumnDef<Person>[] = [
      { id: 'g', header: 'G', columns: [{ field: 'id', pinned: 'start' }, { field: 'name', pinned: 'start' }, { field: 'age' }, { field: 'active' }] },
      { field: 'joined' },
    ];
    const engine = make(stacked);
    // Within the left part of the split group the leaves still reorder.
    assert.equal(engine.columns.move({ columnId: 'name', toIndex: 0 }).status, 'applied');
    assert.deepEqual(ids(engine.getSnapshot().columns.left), ['name', 'id']);
    // In the center, the group's leaves cannot be separated by an outside leaf.
    const split = engine.columns.move({ columnId: 'joined', toIndex: 3 });
    assert.equal(split.status === 'rejected' && split.reason, 'crossesColumnGroup');
    assert.equal(engine.columns.move({ columnId: 'active', toIndex: 2 }).status, 'applied');
    assert.deepEqual(ids(engine.getSnapshot().columns.center), ['active', 'age', 'joined']);
  });
});
