import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createDataGridEngine, isJsonValue, type CommandEvent, type DataGridCommand } from '@salmonui/data-grid/engine';
import { collectWarnings, people, personColumns, type Person } from './fixtures.ts';

function engineFor(extra: { recordCommands?: boolean } = {}) {
  const w = collectWarnings();
  const engine = createDataGridEngine<Person>({
    getRowId: (row) => row.id,
    columns: personColumns,
    dataSource: people(),
    dev: true,
    onWarning: w.onWarning,
    ...extra,
  });
  return { engine, w };
}

describe('commands', () => {
  it('dispatches serializable commands and the generated façade is equivalent', () => {
    const { engine } = engineFor();
    const command: DataGridCommand = { type: 'columns.hide', keys: ['age'] };
    assert.ok(isJsonValue(command));
    assert.deepEqual(JSON.parse(JSON.stringify(command)), command);
    assert.deepEqual(engine.dispatch(command), { status: 'applied' });
    assert.equal(engine.getSnapshot().columns.byId.get('age') !== undefined, true);
    assert.equal(engine.getSnapshot().columns.visible.some((c) => c.columnId === 'age'), false);
    assert.deepEqual(engine.columns.show({ keys: ['age'] }), { status: 'applied' });
    assert.equal(engine.getSnapshot().columns.visible.some((c) => c.columnId === 'age'), true);
  });

  it('rejects unknown, malformed and non-serializable commands with dev warnings', () => {
    const { engine, w } = engineFor();
    assert.deepEqual(engine.dispatch({ type: 'sort.set' }), { status: 'rejected', reason: 'unknownCommand' });
    assert.deepEqual(engine.dispatch({ type: 'nodot' } as never), { status: 'rejected', reason: 'invalidCommand' });
    assert.deepEqual(engine.dispatch({ type: 'columns.hide', keys: [new Date() as never] }), {
      status: 'rejected',
      reason: 'notSerializable',
    });
    assert.deepEqual(engine.dispatch({ type: 'columns.hide', keys: ['x'], fn: (() => 1) as never }), {
      status: 'rejected',
      reason: 'notSerializable',
    });
    assert.deepEqual(w.codes(), ['command-unknown', 'command-invalid', 'command-not-serializable']);
  });

  it('rejects a command that matches no column', () => {
    const { engine, w } = engineFor();
    assert.deepEqual(engine.columns.hide({ keys: ['missing'] }), { status: 'rejected', reason: 'noMatchingColumns' });
    assert.ok(w.codes().includes('column-unknown'));
  });

  it('records a frozen, replayable command log', () => {
    const { engine } = engineFor({ recordCommands: true });
    engine.columns.hide({ keys: ['age', 'name'] });
    engine.columns.show({ keys: ['Name'], by: 'headerText' });
    engine.dispatch({ type: 'nope.nope' });
    const log = engine.getCommandLog();
    assert.equal(log.length, 2);
    assert.ok(Object.isFrozen(log) && Object.isFrozen(log[0]) && Object.isFrozen(log[0]?.['keys']));
    const replayed = JSON.parse(JSON.stringify(log)) as DataGridCommand[];
    const { engine: other } = engineFor();
    for (const command of replayed) other.dispatch(command);
    assert.deepEqual(
      other.getSnapshot().columns.visible.map((c) => c.columnId),
      engine.getSnapshot().columns.visible.map((c) => c.columnId),
    );
  });

  it('command events carry frozen copies, never the caller or store objects', () => {
    const { engine } = engineFor();
    const events: CommandEvent[] = [];
    engine.onCommand((e) => events.push(e));
    const keys = ['age'];
    const command = { type: 'columns.hide', keys } as const;
    engine.dispatch(command);
    const event = events[0];
    assert.ok(event);
    assert.ok(Object.isFrozen(event));
    assert.ok(Object.isFrozen(event.command));
    assert.ok(Object.isFrozen(event.command['keys']));
    assert.notEqual(event.command, command);
    assert.notEqual(event.command['keys'], keys);
    assert.equal(Object.isFrozen(keys), false, 'the caller object is not frozen');
    assert.equal(event.version, engine.getSnapshot().version);
    assert.throws(() => {
      (event.command['keys'] as string[]).push('x');
    }, TypeError);
  });

  it('onBeforeCommand can cancel with a reason', () => {
    const { engine } = engineFor();
    const off = engine.onBeforeCommand((e) => {
      assert.ok(Object.isFrozen(e) && Object.isFrozen(e.command));
      return e.command.type === 'columns.hide' ? 'locked' : undefined;
    });
    assert.deepEqual(engine.columns.hide({ keys: ['age'] }), { status: 'rejected', reason: 'locked' });
    assert.equal(engine.getSnapshot().columns.visible.length, personColumns.length);
    off();
    assert.deepEqual(engine.columns.hide({ keys: ['age'] }), { status: 'applied' });
  });

  it('snapshot parts handed to listeners are frozen', () => {
    const { engine } = engineFor();
    engine.subscribeSelector(
      (s) => s.columns,
      (columns) => {
        assert.ok(Object.isFrozen(columns) && Object.isFrozen(columns.visible) && Object.isFrozen(columns.visible[0]));
      },
    );
    engine.columns.hide({ keys: ['age'] });
    const cell = engine.getCellSnapshot('p1', 'name');
    const row = engine.getRowSnapshot('p1');
    assert.ok(Object.isFrozen(cell) && Object.isFrozen(row));
  });
});
