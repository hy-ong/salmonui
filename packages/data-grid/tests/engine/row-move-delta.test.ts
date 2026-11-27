// Row reorders as an incremental row delta: a local source's move (through
// `write({ moved })`, `rowDragDrop.move`, and `rowDragDrop.reorder`) updates
// the engine's id array, id index, and pipeline stages incrementally.
// Randomized moves (alone and mixed with added, changed, and deleted rows)
// under filter, sort, grouping, aggregates, selection, and detail rows are
// compared against a full recompute (a fresh engine over a copy of the rows).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createAggregatesModule,
  createFilterModule,
  createDataGridEngine,
  createGroupingModule,
  createLocalDataSource,
  createSearchModule,
  createSelectionModule,
  createSortModule,
  type ColumnDef,
  type DataGridCommand,
  type DataSource,
  type GroupRowSnapshot,
  type LocalDataSource,
  type RowPlacement,
  type WriteRequest,
} from '@salmonui/data-grid/engine';
import { createDetailModule } from '@salmonui/data-grid/engine/expansion';
import { createRowDragDropModule } from '@salmonui/data-grid/engine/row-drag-drop';

interface Item {
  readonly id: string;
  readonly team: string;
  readonly qty: number;
  readonly rank: number;
  readonly name: string;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const TEAMS = ['red', 'green', 'blue'];
const NAMES = ['alpha', 'beta', 'gamma', 'delta', 'epsilon'];

const makeItem = (random: () => number, id: string, rank: number): Item => ({
  id,
  team: TEAMS[Math.floor(random() * TEAMS.length)] as string,
  qty: Math.floor(random() * 6), // many ties: tie order follows the source order
  rank,
  name: NAMES[Math.floor(random() * NAMES.length)] as string,
});

const columns: ColumnDef<Item>[] = [
  { field: 'id', primaryKey: true },
  { field: 'team' },
  { field: 'qty', type: 'number' },
  { field: 'rank', type: 'number' },
  { field: 'name' },
];

function makeEngine(data: readonly Item[] | DataSource<Item>, options: Record<string, unknown> = {}) {
  const modules = [
    createSearchModule<Item>(),
    createFilterModule<Item>(),
    createSortModule<Item>(),
    createGroupingModule<Item>(),
    createAggregatesModule<Item>(),
    createSelectionModule<Item>(),
    createDetailModule<Item>(),
    createRowDragDropModule<Item>(),
  ] as const;
  return createDataGridEngine<Item, typeof modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: data,
    modules,
    instrument: true,
    dev: true,
    onWarning: () => {},
    selection: { type: 'multiple' },
    ...options,
  } as Parameters<typeof createDataGridEngine<Item, typeof modules>>[0]);
}

type Engine = ReturnType<typeof makeEngine>;

interface Scenario {
  readonly name: string;
  readonly commands: DataGridCommand[];
  readonly options?: Record<string, unknown>;
}

const SUMS = [
  { columnId: 'qty', type: 'sum' as const, placement: ['groupCaption' as const, 'footer' as const] },
  { columnId: 'rank', type: 'max' as const, placement: ['groupFooter' as const, 'footer' as const] },
];

const SCENARIOS: Scenario[] = [
  { name: 'no query (plain reorder)', commands: [] },
  { name: 'filter', commands: [{ type: 'filter.byColumn', columnId: 'name', operator: 'contains', value: 'a' }] },
  { name: 'search + sort', commands: [{ type: 'search.set', text: 'e' }, { type: 'sort.set', sorting: [{ columnId: 'name', direction: 'asc' }] }] },
  { name: 'sort with ties (a move is a no-op for display order except tie order)', commands: [{ type: 'sort.set', sorting: [{ columnId: 'qty', direction: 'asc' }] }] },
  {
    name: 'grouping + aggregates + filter',
    commands: [
      { type: 'grouping.groupBy', columnId: 'team' },
      { type: 'aggregates.set', aggregates: SUMS },
      { type: 'filter.byColumn', columnId: 'qty', operator: 'greaterThan', value: 0 },
    ],
  },
  {
    name: 'two-level grouping + sort + aggregates',
    commands: [
      { type: 'grouping.groupBy', columnId: 'team' },
      { type: 'grouping.groupBy', columnId: 'name' },
      { type: 'sort.set', sorting: [{ columnId: 'qty', direction: 'desc' }] },
      { type: 'aggregates.set', aggregates: SUMS },
    ],
  },
  { name: 'orderField with ascending sort', commands: [{ type: 'sort.set', sorting: [{ columnId: 'rank', direction: 'asc' }] }], options: { rowDragDrop: { orderField: 'rank' } } },
];

function group(engine: Engine, id: string): GroupRowSnapshot | undefined {
  return engine.grouping.getGroup(id);
}

/** Everything a renderer reads from the row model. */
function dump(engine: Engine): unknown {
  const count = engine.getSnapshot().rows.count;
  const out: unknown[] = [];
  for (let i = 0; i < count; i++) {
    const id = engine.getRowIdAt(i) as string;
    const g = group(engine, id);
    if (g) out.push([g.kind, id, g.depth, g.count, JSON.stringify(g.key), JSON.stringify(g.aggregates)]);
    else {
      const snap = engine.getRowSnapshot(id);
      out.push([snap?.kind, id, snap?.depth, snap?.index, snap?.parentId]);
    }
  }
  return { rows: out, footer: engine.aggregates.getFooter() };
}

function check(engine: Engine, source: LocalDataSource<Item>, scenario: Scenario, expanded: readonly string[], selected: readonly string[], label: string): void {
  const fresh = makeEngine([...source.getRows()], scenario.options);
  for (const command of scenario.commands) fresh.dispatch(command);
  for (const id of expanded) fresh.dispatch({ type: 'detail.expand', rowId: id });
  fresh.dispatch({ type: 'selection.selectRows', rowIds: [...selected] });
  assert.deepEqual(dump(engine), dump(fresh), `${scenario.name}: ${label}`);
  assert.deepEqual([...engine.selection.getSelectedRowIds()].sort(), [...selected].sort(), `${scenario.name}: selection kept (${label})`);
  for (const id of expanded) assert.equal(engine.detail.isExpanded(id), true, `${scenario.name}: detail kept (${label})`);
  const rows = source.getRows();
  for (let i = 0; i < rows.length; i += 7) {
    const id = (rows[i] as Item).id;
    assert.equal(engine.getRowIndex(id), fresh.getRowIndex(id), `${scenario.name}: index of ${id} (${label})`);
    assert.equal(engine.getRow(id), rows[i], `${scenario.name}: row by id ${id} (${label})`);
  }
  fresh.dispose();
}

const signal = { aborted: false, addEventListener() {}, removeEventListener() {} } as unknown as WriteRequest<Item>['signal'];

function write(source: LocalDataSource<Item>, request: Partial<Pick<WriteRequest<Item>, 'added' | 'changed' | 'deleted' | 'moved'>>): void {
  void source.write({ version: 0, mode: 'row', signal, added: [], changed: [], deleted: [], ...request });
}

function randomStep(random: () => number, engine: Engine, source: LocalDataSource<Item>, nextId: () => string): string {
  const rows = source.getRows();
  const any = (): Item => rows[Math.floor(random() * rows.length)] as Item;
  const pickIds = (k: number): string[] => {
    const ids = new Set<string>();
    while (ids.size < k) ids.add(any().id);
    return [...ids];
  };
  const placement = (ids: readonly string[]): RowPlacement => {
    let target: Item = any();
    while (ids.includes(target.id)) target = any();
    const r = random();
    return { rowIds: ids, targetRowId: r < 0.05 ? null : target.id, position: random() < 0.5 ? 'before' : 'after' };
  };
  const op = random();
  if (op < 0.35) {
    const ids = pickIds(1);
    write(source, { moved: placement(ids) });
    return `move one ${ids[0]}`;
  }
  if (op < 0.5) {
    // Short hop: a small window.
    const at = Math.floor(random() * (rows.length - 3));
    const id = (rows[at] as Item).id;
    write(source, { moved: { rowIds: [id], targetRowId: (rows[at + 2] as Item).id, position: 'after' } });
    return `hop ${id}`;
  }
  if (op < 0.62) {
    const ids = pickIds(1 + Math.floor(random() * 4));
    write(source, { moved: placement(ids) });
    return `move ${ids.length}`;
  }
  if (op < 0.72) {
    const ids = pickIds(1);
    const r = any();
    write(source, { changed: [{ rowId: r.id, row: { ...r, qty: (r.qty + 1) % 6 }, previous: r, changedColumnIds: ['qty'] }], moved: placement(ids) });
    return 'change + move';
  }
  if (op < 0.8) {
    const ids = pickIds(2);
    const gone = ids[1] as string;
    const row = rows.find((x) => x.id === gone) as Item;
    write(source, { deleted: [{ rowId: gone, row }], moved: { ...placement([ids[0] as string]), rowIds: [ids[0] as string] } });
    return 'delete + move';
  }
  if (op < 0.86) {
    const id = nextId();
    const added = makeItem(random, id, rows.length + 1);
    write(source, { added: [{ tempId: id, row: added }], moved: { rowIds: [id], targetRowId: any().id, position: 'before' } });
    return 'add + move added';
  }
  if (op < 0.94) {
    // Through the module (ids over the whole loaded set).
    const ids = pickIds(1);
    const result = engine.dispatch({ type: 'rowDragDrop.move', rowIds: ids, targetRowId: placement(ids).targetRowId, position: 'before' });
    return `rowDragDrop.move ${result.status}`;
  }
  const count = rows.length;
  const from = Math.floor(random() * count);
  const result = engine.dispatch({ type: 'rowDragDrop.reorder', fromIndexes: [from], toIndex: Math.floor(random() * (count - 1)) });
  return `rowDragDrop.reorder ${result.status}`;
}

describe('row moves are applied as incremental row deltas', () => {
  for (const [si, scenario] of SCENARIOS.entries()) {
    it(scenario.name, () => {
      const random = rng(9000 + si * 31);
      let counter = 0;
      const nextId = () => `n${counter++}`;
      const initial: Item[] = [];
      for (let i = 0; i < 240; i++) initial.push(makeItem(random, `i${i}`, i + 1));
      const source = createLocalDataSource<Item>(initial, { getRowId: (r) => r.id });
      const engine = makeEngine(source, scenario.options);
      for (const command of scenario.commands) engine.dispatch(command);
      const expanded = ['i3', 'i50', 'i120'];
      for (const id of expanded) engine.dispatch({ type: 'detail.expand', rowId: id });
      const selected = ['i1', 'i7', 'i99', 'i200'];
      engine.dispatch({ type: 'selection.selectRows', rowIds: selected });
      check(engine, source, scenario, expanded, selected, 'initial');
      let incremental = 0;
      for (let step = 0; step < 120; step++) {
        const before = Object.values(engine.getInstrumentation()?.stageUpdates ?? {}).reduce((a, b) => a + b, 0);
        const what = randomStep(random, engine, source, nextId);
        const live = new Set(source.getRows().map((r) => r.id));
        // Deleted ids stay in the explicit selection set (existing semantics); moves never change it.
        check(engine, source, scenario, expanded.filter((id) => live.has(id)), selected, `step ${step} (${what})`);
        const after = Object.values(engine.getInstrumentation()?.stageUpdates ?? {}).reduce((a, b) => a + b, 0);
        if (after > before) incremental++;
      }
      if (scenario.commands.length) assert.ok(incremental > 40, `incremental steps: ${incremental}`);
      engine.dispose();
    });
  }

  it('composes moves with patches inside one batch', () => {
    const random = rng(77);
    let counter = 0;
    const nextId = () => `b${counter++}`;
    const initial: Item[] = [];
    for (let i = 0; i < 200; i++) initial.push(makeItem(random, `i${i}`, i + 1));
    const source = createLocalDataSource<Item>(initial, { getRowId: (r) => r.id });
    const scenario = SCENARIOS[4] as Scenario; // grouping + aggregates + filter
    const engine = makeEngine(source, scenario.options);
    for (const command of scenario.commands) engine.dispatch(command);
    engine.getSnapshot();
    let incremental = 0;
    for (let round = 0; round < 25; round++) {
      const before = engine.getInstrumentation()?.stageUpdates['group'] ?? 0;
      engine.batch(() => {
        for (let k = 0; k < 4; k++) {
          randomStep(random, engine, source, nextId);
          if (random() < 0.4) {
            const rows = source.getRows();
            const r = rows[Math.floor(random() * rows.length)] as Item;
            source.patch({ upsert: [{ ...r, qty: (r.qty + 2) % 6 }], append: [makeItem(random, nextId(), rows.length + 1)] });
          }
        }
      });
      check(engine, source, scenario, [], [], `batch ${round}`);
      if ((engine.getInstrumentation()?.stageUpdates['group'] ?? 0) > before) incremental++;
    }
    assert.ok(incremental > 15, `incremental batches: ${incremental}`);
    engine.dispose();
  });

  it('moves keep the engine id index exact without a full id recompute', () => {
    const rows: Item[] = [];
    const random = rng(5);
    for (let i = 0; i < 2000; i++) rows.push(makeItem(random, `i${i}`, i + 1));
    let calls = 0;
    const source = createLocalDataSource<Item>(rows, { getRowId: (r) => r.id });
    const modules = [createSortModule<Item>(), createRowDragDropModule<Item>()] as const;
    const engine = createDataGridEngine<Item, typeof modules>({
      getRowId: (r) => {
        calls++;
        return r.id;
      },
      columns,
      dataSource: source,
      modules,
      dev: false,
    });
    engine.getSnapshot();
    calls = 0;
    for (let k = 0; k < 50; k++) {
      const from = (k * 397) % rows.length;
      const to = (k * 1201) % rows.length;
      engine.dispatch({ type: 'rowDragDrop.reorder', fromIndexes: [from], toIndex: to });
      engine.getSnapshot();
    }
    assert.ok(calls < 500, `getRowId calls after 50 one-row reorders: ${calls} (a full recompute is ${rows.length} per reorder)`);
    const list = source.getRows();
    for (let i = 0; i < list.length; i++) {
      assert.equal(engine.getRowIdAt(i), (list[i] as Item).id);
      assert.equal(engine.getRowIndex((list[i] as Item).id), i);
    }
    engine.dispose();
  });

  it('a reset that only looks like a move (third-party source) still takes the full path', () => {
    const rows: Item[] = [];
    const random = rng(6);
    for (let i = 0; i < 50; i++) rows.push(makeItem(random, `i${i}`, i + 1));
    const source = createLocalDataSource<Item>(rows, { getRowId: (r) => r.id });
    const engine = makeEngine(source);
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'qty', direction: 'asc' }] });
    const next = [...rows];
    const [moved] = next.splice(3, 1);
    next.splice(40, 0, moved as Item);
    source.setRows(next);
    const fresh = makeEngine(next);
    fresh.dispatch({ type: 'sort.set', sorting: [{ columnId: 'qty', direction: 'asc' }] });
    assert.deepEqual(dump(engine), dump(fresh));
    engine.dispose();
    fresh.dispose();
  });
});
