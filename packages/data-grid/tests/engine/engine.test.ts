import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, shallowEqual } from '@salmonui/data-grid/engine';
import { collectWarnings, people, personColumns, type Person } from './fixtures.ts';

function engineFor(rows: Person[] = people()) {
  return createDataGridEngine<Person>({
    getRowId: (row) => row.id,
    columns: personColumns,
    dataSource: rows,
    dev: true,
    instrument: true,
    onWarning: () => {},
  });
}

describe('engine snapshots', () => {
  it('requires getRowId', () => {
    assert.throws(() => createDataGridEngine({ columns: [], dataSource: [] } as never), /getRowId is required/);
  });

  it('returns the same snapshot identity until observed data changes', () => {
    const engine = engineFor();
    const a = engine.getSnapshot();
    assert.equal(engine.getSnapshot(), a);
    assert.equal(engine.getSnapshot().rows, a.rows);
    assert.ok(Object.isFrozen(a));
    assert.ok(Object.isFrozen(a.columns));
    assert.ok(Object.isFrozen(a.data));
    assert.ok(Object.isFrozen(a.query));

    // A command that changes nothing keeps the snapshot.
    engine.columns.show({ keys: ['name'] });
    assert.equal(engine.getSnapshot(), a);

    engine.columns.hide({ keys: ['name'] });
    const b = engine.getSnapshot();
    assert.notEqual(b, a);
    assert.equal(b.version, a.version + 1);
    // Unchanged parts keep their identity (structural sharing).
    assert.equal(b.rows, a.rows);
    assert.equal(b.data, a.data);
    assert.equal(b.query, a.query);
    assert.equal(b.columns.leaves, a.columns.leaves);
    assert.notEqual(b.columns.visible, a.columns.visible);
  });

  it('exposes a stable, deterministic server snapshot', () => {
    const one = engineFor();
    const two = engineFor();
    assert.equal(one.getServerSnapshot(), one.getSnapshot());
    assert.deepEqual(
      JSON.parse(JSON.stringify({ ...one.getServerSnapshot(), columns: null })),
      JSON.parse(JSON.stringify({ ...two.getServerSnapshot(), columns: null })),
    );
    assert.deepEqual(one.getServerSnapshot().viewport.rows, { start: 0, end: 5, overscanStart: 0, overscanEnd: 5, offsetTop: 0, totalHeight: 5 * 36 });
    one.columns.hide({ keys: ['age'] });
    assert.notEqual(one.getSnapshot(), one.getServerSnapshot());
    assert.equal(one.getServerSnapshot().version, 1);
  });

  it('notifies subscribe() once per snapshot change and coalesces batches', () => {
    const engine = engineFor();
    let calls = 0;
    engine.subscribe(() => calls++);
    engine.columns.hide({ keys: ['age'] });
    assert.equal(calls, 1);
    engine.batch(() => {
      engine.columns.hide({ keys: ['name'] });
      engine.columns.hide({ keys: ['active'] });
      engine.columns.show({ keys: ['age'] });
    });
    assert.equal(calls, 2);
    engine.columns.hide({ keys: ['name'] }); // already hidden: no change
    assert.equal(calls, 2);
  });

  it('select and subscribeSelector notify only when the selected value changes', () => {
    const engine = engineFor();
    assert.equal(engine.select((s) => s.rows.count), 5);
    const counts: number[] = [];
    const visible: string[][] = [];
    engine.subscribeSelector((s) => s.rows.count, (v) => counts.push(v));
    engine.subscribeSelector(
      (s) => s.columns.visible.map((c) => c.columnId),
      (v) => visible.push(v),
      shallowEqual,
    );
    engine.columns.hide({ keys: ['age'] });
    assert.deepEqual(counts, []);
    assert.equal(visible.length, 1);
    // A new array with equal items is filtered by the equality function.
    engine.columns.setVisibility({ visibility: { age: false } });
    assert.equal(visible.length, 1);
  });

  it('subscribeHeader notifies only the headers whose visibility changed', () => {
    const engine = engineFor();
    const hits: string[] = [];
    for (const col of engine.getSnapshot().columns.leaves) {
      engine.getHeaderSnapshot(col.columnId);
      engine.subscribeHeader(col.columnId, () => hits.push(col.columnId));
    }
    const before = engine.getHeaderSnapshot('age');
    engine.columns.hide({ keys: ['age'] });
    assert.deepEqual(hits, ['age']);
    assert.notEqual(engine.getHeaderSnapshot('age'), before);
    assert.equal(engine.getHeaderSnapshot('age')?.visible, false);
    assert.equal(engine.getHeaderSnapshot('name'), engine.getHeaderSnapshot('name'));
  });

  it('dispose stops notifications and rejects commands', () => {
    const engine = engineFor();
    let calls = 0;
    engine.subscribe(() => calls++);
    engine.dispose();
    assert.equal(engine.disposed, true);
    assert.deepEqual(engine.columns.hide({ keys: ['age'] }), { status: 'rejected', reason: 'disposed' });
    assert.equal(calls, 0);
    engine.dispose(); // idempotent
  });

  it('warns once per message', () => {
    const w = collectWarnings();
    const engine = createDataGridEngine<Person>({
      getRowId: (row) => row.id,
      columns: personColumns,
      dataSource: people(),
      dev: true,
      onWarning: w.onWarning,
    });
    engine.dispatch({ type: 'nope.x' });
    engine.dispatch({ type: 'nope.x' });
    assert.deepEqual(w.codes(), ['command-unknown']);
  });

  it('dev: false suppresses warnings', () => {
    const w = collectWarnings();
    const engine = createDataGridEngine<Person>({
      getRowId: () => 'same',
      columns: [{}],
      dataSource: people(),
      dev: false,
      onWarning: w.onWarning,
    });
    engine.dispatch({ type: 'nope.x' });
    assert.deepEqual(w.warnings, []);
  });
});
