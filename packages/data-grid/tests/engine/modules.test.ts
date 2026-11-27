import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createDataGridEngine,
  createRowModel,
  defineDataGridModule,
  orderModules,
  type DataGridModule,
  type RowModelSnapshot,
} from '@salmonui/data-grid/engine';
import { people, personColumns, type Person } from './fixtures.ts';

const base = { getRowId: (row: Person) => row.id, columns: personColumns, dataSource: people(), dev: true, onWarning: () => {} };

function bare(name: string, dependencies?: string[]): DataGridModule<Person> {
  return { name, ...(dependencies ? { dependencies } : {}), commands: [], initialState: () => null };
}

/** A test-only "filter" stage: keeps rows whose `age` is at least `min`. */
type MinAgeCommand = { type: 'minAge.set'; min: number };
function minAgeModule(onRun: () => void) {
  return defineDataGridModule<Person, { min: number }, MinAgeCommand, 'minAge'>({
    name: 'minAge',
    commands: ['minAge.set'],
    initialState: () => ({ min: 0 }),
    reduce: (state, command) => (command.min === state.min ? state : { min: command.min }),
    pipeline: [
      {
        name: 'filter',
        key: (_query, state) => [state.min],
        run(input: RowModelSnapshot<Person>, ctx) {
          onRun();
          if (ctx.state.min === 0) return input;
          const keep: number[] = [];
          for (let i = 0; i < input.count; i++) {
            const at = input.order ? (input.order[i] as number) : i;
            if ((input.source[at]?.age ?? 0) >= ctx.state.min) keep.push(at);
          }
          return createRowModel(input, Int32Array.from(keep));
        },
      },
    ],
  });
}

/** A high-churn module outside the grid snapshot (like selection). */
type MarkCommand = { type: 'mark.toggle'; rowId: string };
const markModule = defineDataGridModule<Person, readonly string[], MarkCommand, 'mark'>({
  name: 'mark',
  inSnapshot: false,
  commands: ['mark.toggle'],
  initialState: () => [],
  reduce: (state, command) =>
    state.includes(command.rowId) ? state.filter((id) => id !== command.rowId) : [...state, command.rowId],
  notify: (prev, next) => ({
    rows: [...prev.filter((id) => !next.includes(id)), ...next.filter((id) => !prev.includes(id))],
  }),
});

describe('module registration', () => {
  it('orders by dependencies, then registration order', () => {
    const ordered = orderModules([bare('c', ['b']), bare('a'), bare('b', ['a']), bare('d')]);
    assert.deepEqual(ordered.map((m) => m.name), ['a', 'b', 'c', 'd']);
    const stable = orderModules([bare('x'), bare('y'), bare('z')]);
    assert.deepEqual(stable.map((m) => m.name), ['x', 'y', 'z']);
  });

  it('throws on missing dependencies, duplicates, cycles and bad names', () => {
    assert.throws(() => createDataGridEngine({ ...base, modules: [bare('a', ['missing'])] }), /depends on "missing"/);
    assert.throws(() => createDataGridEngine({ ...base, modules: [bare('a'), bare('a')] }), /Duplicate grid module "a"/);
    assert.throws(() => createDataGridEngine({ ...base, modules: [bare('columns')] }), /Duplicate grid module "columns"/);
    assert.throws(() => createDataGridEngine({ ...base, modules: [bare('a', ['b']), bare('b', ['a'])] }), /cycle/);
    assert.throws(() => createDataGridEngine({ ...base, modules: [bare('dispatch')] }), /collides with an engine member/);
    assert.throws(() => createDataGridEngine({ ...base, modules: [bare('a.b')] }), /Invalid module name/);
  });

  it('validates command types and collisions', () => {
    const wrongPrefix: DataGridModule<Person> = { ...bare('a'), commands: ['b.set'] };
    assert.throws(() => createDataGridEngine({ ...base, modules: [wrongPrefix] }), /must be "a.<action>"/);
    const one: DataGridModule<Person> = { ...bare('a'), commands: ['a.set', 'a.set'] };
    assert.throws(() => createDataGridEngine({ ...base, modules: [one] }), /declared by both/);
  });

  it('rejects two stages at the same rank and unknown stage names', () => {
    const a = minAgeModule(() => {});
    const b = { ...minAgeModule(() => {}), name: 'other' as const, commands: [] };
    assert.throws(() => createDataGridEngine({ ...base, modules: [a, b] }), /declared by both "minAge" and "other"/);
    const bad: DataGridModule<Person> = { ...bare('x'), pipeline: [{ name: 'nope' as never, key: () => [], run: (i) => i }] };
    assert.throws(() => createDataGridEngine({ ...base, modules: [bad] }), /unknown pipeline stage "nope"/);
  });

  it('keeps module state in namespaced slices', () => {
    const engine = createDataGridEngine({ ...base, modules: [minAgeModule(() => {})] });
    assert.deepEqual(engine.getSnapshot().modules['minAge'], { min: 0 });
    assert.deepEqual(engine.getSnapshot().modules['columns'], { visibility: {}, widths: {}, order: null, freeze: {}, frozenCount: { left: 0, right: 0 } });
    engine.minAge.set({ min: 23 });
    assert.deepEqual(engine.getModuleState('minAge'), { min: 23 });
  });
});

describe('query pipeline', () => {
  it('a plugged-in stage runs only when its inputs change', () => {
    let runs = 0;
    const engine = createDataGridEngine({ ...base, modules: [minAgeModule(() => runs++), markModule], instrument: true });
    assert.equal(runs, 1);
    assert.equal(engine.getSnapshot().rows.count, 5);

    engine.minAge.set({ min: 23 });
    assert.equal(runs, 2);
    assert.deepEqual([...Array(engine.getSnapshot().rows.count).keys()].map((i) => engine.getRowIdAt(i)), ['p3', 'p4']);
    assert.equal(engine.getRowIndex('p4'), 1);
    assert.equal(engine.getRowIndex('p1'), -1);
    assert.equal(engine.getRowSnapshot('p1')?.index, -1);

    engine.minAge.set({ min: 23 }); // unchanged state
    engine.columns.hide({ keys: ['age'] }); // visibility does not re-run stages
    engine.mark.toggle({ rowId: 'p3' }); // high-churn module
    assert.equal(runs, 2);
    assert.equal(engine.getInstrumentation()?.stageRuns['filter'], 2);
    assert.equal(engine.getInstrumentation()?.columnCompiles, 1);
  });

  it('inSnapshot:false modules notify affected rows only and keep the snapshot', () => {
    const engine = createDataGridEngine({ ...base, modules: [markModule] });
    const snap = engine.getSnapshot();
    const hits: string[] = [];
    let grid = 0;
    let moduleHits = 0;
    engine.subscribe(() => grid++);
    engine.subscribeModule('mark', () => moduleHits++);
    for (const p of people()) engine.subscribeRow(p.id, () => hits.push(p.id));
    engine.mark.toggle({ rowId: 'p2' });
    engine.mark.toggle({ rowId: 'p4' });
    engine.mark.toggle({ rowId: 'p2' });
    assert.deepEqual(hits, ['p2', 'p4', 'p2']);
    assert.equal(grid, 0);
    assert.equal(moduleHits, 3);
    assert.equal(engine.getSnapshot(), snap);
    assert.equal(engine.getSnapshot().modules['mark'], undefined);
    assert.deepEqual(engine.getModuleState('mark'), ['p4']);
  });

  it('stage dev check flags a mutated input order', () => {
    const codes: string[] = [];
    const mutating: DataGridModule<Person> = {
      ...bare('bad'),
      pipeline: [
        { name: 'sort', key: () => [], run: (input) => createRowModel(input, Int32Array.from([4, 3, 2, 1, 0])) },
        { name: 'page', key: () => [], run: (input) => ({ ...input, count: 2 }) },
      ],
    };
    createDataGridEngine({ ...base, modules: [mutating], onWarning: (w) => codes.push(w.code) });
    assert.deepEqual(codes, ['pipeline-mutated-input']);
  });

  it('extendQuery and extendColumns contribute through modules', () => {
    type Init = { sorting: { columnId: string; direction: 'asc' | 'desc' }[] };
    const sortLike: DataGridModule<Person, Init> = {
      name: 'sortLike',
      commands: [],
      initialState: () => ({ sorting: [{ columnId: 'age', direction: 'desc' }] }),
      extendQuery: (query, state) => ({ ...query, sorting: state.sorting }),
      extendColumns: (columns) => columns.map((c) => ({ ...c, moduleMeta: { ...c.moduleMeta, sortLike: c.flags.allowSorting } })),
      pipeline: [{ name: 'sort', key: (q) => [q.sorting], run: (i) => i }],
    };
    const engine = createDataGridEngine({ ...base, modules: [sortLike], instrument: true });
    assert.deepEqual(engine.getSnapshot().query.sorting, [{ columnId: 'age', direction: 'desc' }]);
    assert.equal(engine.getSnapshot().columns.byId.get('age')?.moduleMeta['sortLike'], true);
    assert.equal(engine.getInstrumentation()?.columnCompiles, 1);
  });
});
