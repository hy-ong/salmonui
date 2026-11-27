// Incremental maintenance of keys, search, filter, sort, and paging after data
// changes: randomized patch / append / remove / setRows sequences compared
// against a full recompute (a fresh engine over a copy of the same rows).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  createFilterModule,
  createDataGridEngine,
  createLocalDataSource,
  createPagingModule,
  createSearchModule,
  createSortModule,
  type ColumnDef,
  type DataGridCommand,
  type DataGridModule,
  type LocalDataSource,
} from '@salmonui/data-grid/engine';

interface Rec {
  readonly id: string;
  readonly name: string | null | undefined;
  readonly qty: number | null;
  readonly when: Date | null;
  readonly ok: boolean;
  readonly tag: string;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const NAMES = ['alpha', 'Alpha', 'beta', 'Béta', 'gamma', 'delta', 'Delta', 'epsilon', '', 'zeta', 'eta', 'theta'];
const TAGS = ['x1', 'x2', 'y1', 'y2', 'z'];

function makeRec(random: () => number, id: string): Rec {
  const pick = random();
  // A growing pool so updates keep introducing new distinct values (dictionary appends, rank inserts).
  const name =
    pick < 0.08 ? null : pick < 0.12 ? undefined : pick < 0.2 ? `n${Math.floor(random() * 1000)}` : (NAMES[Math.floor(random() * NAMES.length)] as string);
  const q = random();
  const qty = q < 0.1 ? null : q < 0.15 ? Number.NaN : q < 0.25 ? Math.floor(random() * 100000) / 7 : Math.floor(random() * 12);
  const when = random() < 0.1 ? null : new Date(Date.UTC(2025, 0, 1 + Math.floor(random() * 20), Math.floor(random() * 24)));
  return { id, name, qty, when, ok: random() < 0.5, tag: TAGS[Math.floor(random() * TAGS.length)] as string };
}

const columns: ColumnDef<Rec>[] = [
  { field: 'id', primaryKey: true, type: 'string' },
  { field: 'name', type: 'string' },
  { field: 'qty', type: 'number' },
  { field: 'when', type: 'datetime' },
  { field: 'ok', type: 'boolean' },
  { field: 'tag', type: 'string', sortComparator: (a, b) => String(b).localeCompare(String(a)) },
  { id: 'upper', valueGetter: (r: Rec) => (r.name == null ? null : r.name.toUpperCase()), type: 'string' },
];

interface Scenario {
  readonly name: string;
  readonly commands: DataGridCommand[];
  readonly pageSize?: number;
}

const SCENARIOS: Scenario[] = [
  {
    name: 'sort qty (ties) + contains filter + search',
    commands: [
      { type: 'sort.set', sorting: [{ columnId: 'qty', direction: 'asc' }] },
      { type: 'filter.byColumn', columnId: 'name', operator: 'contains', value: 'a' },
      { type: 'search.set', text: 'e' },
    ],
  },
  {
    name: 'multi-sort name desc, qty asc + numeric filter',
    commands: [
      {
        type: 'sort.set',
        sorting: [
          { columnId: 'name', direction: 'desc' },
          { columnId: 'qty', direction: 'asc' },
        ],
      },
      { type: 'filter.byColumn', columnId: 'qty', operator: 'greaterThanOrEqual', value: 3 },
    ],
  },
  {
    name: 'custom comparer + group filter + column search + paging',
    pageSize: 7,
    commands: [
      {
        type: 'sort.set',
        sorting: [
          { columnId: 'tag', direction: 'asc' },
          { columnId: 'when', direction: 'desc' },
        ],
      },
      {
        type: 'filter.set',
        filters: [
          {
            kind: 'group',
            predicate: 'or',
            filters: [
              { columnId: 'ok', operator: 'equal', value: true },
              { columnId: 'qty', operator: 'lessThan', value: 8 },
            ],
          },
        ],
      },
      { type: 'search.set', text: 'ta', columnIds: ['name', 'upper', 'tag'] },
      { type: 'paging.goToPage', page: 2 },
    ],
  },
  {
    name: 'in filter + numeric search + date sort, paging',
    pageSize: 25,
    commands: [
      { type: 'filter.byColumn', columnId: 'tag', operator: 'in', value: ['x1', 'y2', 'z'] },
      { type: 'search.set', text: '1' },
      { type: 'sort.set', sorting: [{ columnId: 'when', direction: 'asc' }] },
      { type: 'paging.goToPage', page: 3 },
    ],
  },
  {
    name: 'sort only (valueGetter column)',
    commands: [{ type: 'sort.set', sorting: [{ columnId: 'upper', direction: 'asc' }] }],
  },
];

type Modules = readonly DataGridModule<Rec, any, any, string>[];

function modules(): Modules {
  return [createSearchModule<Rec>(), createFilterModule<Rec>(), createSortModule<Rec>(), createPagingModule<Rec>()];
}

function engineFor(data: readonly Rec[] | LocalDataSource<Rec>, scenario: Scenario, dev: boolean) {
  const engine = createDataGridEngine<Rec, Modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: data,
    dev,
    onWarning: () => {},
    instrument: true,
    modules: modules(),
    paging: { pageSize: scenario.pageSize ?? 100000 },
  });
  for (const command of scenario.commands) engine.dispatch(command);
  return engine;
}

type Engine = ReturnType<typeof engineFor>;

function visible(engine: Engine): string[] {
  const snap = engine.getSnapshot();
  const out: string[] = [];
  for (let i = 0; i < snap.rows.count; i++) out.push(engine.getRowIdAt(i) as string);
  return out;
}

function pageInfo(engine: Engine): unknown {
  return (engine as unknown as { paging: { getInfo(): unknown } }).paging.getInfo();
}

function facet(engine: Engine, columnId: string): unknown {
  const f = (engine as unknown as { filter: { getFacet(id: string): { values: readonly { key: string; count: number }[] } | undefined } }).filter.getFacet(
    columnId,
  );
  return f?.values.map((v) => `${v.key}=${v.count}`);
}

function updates(engine: Engine): number {
  const u = engine.getInstrumentation()?.stageUpdates ?? {};
  return Object.values(u).reduce((a, b) => a + b, 0);
}

function check(engine: Engine, source: LocalDataSource<Rec>, scenario: Scenario, step: string): void {
  const oracle = engineFor([...source.getRows()], scenario, false);
  const label = `${scenario.name} @ ${step}`;
  assert.deepEqual(visible(engine), visible(oracle), `visible order: ${label}`);
  assert.deepEqual(pageInfo(engine), pageInfo(oracle), `page info: ${label}`);
  const rows = source.getRows();
  for (const at of [0, rows.length >> 1, rows.length - 1]) {
    const id = rows[at]?.id;
    if (id !== undefined) assert.equal(engine.getRowIndex(id), oracle.getRowIndex(id), `row index of ${id}: ${label}`);
  }
  for (const columnId of ['name', 'qty', 'when', 'tag']) assert.deepEqual(facet(engine, columnId), facet(oracle, columnId), `facet ${columnId}: ${label}`);
  oracle.dispose();
}

function randomStep(random: () => number, source: LocalDataSource<Rec>, nextId: () => string): string {
  const rows = source.getRows();
  const any = (): Rec => rows[Math.floor(random() * rows.length)] as Rec;
  const changed = (r: Rec): Rec => ({ ...makeRec(random, r.id) });
  const op = random();
  if (op < 0.3) {
    const k = 1 + Math.floor(random() * 3);
    const list: Rec[] = [];
    for (let i = 0; i < k; i++) list.push(changed(any()));
    source.patch({ upsert: list });
    return `upsert ${k}`;
  }
  if (op < 0.42) {
    source.patch({ append: [makeRec(random, nextId())] });
    return 'append';
  }
  if (op < 0.5) {
    source.patch({ upsert: [makeRec(random, nextId()), changed(any())] });
    return 'upsert new + existing';
  }
  if (op < 0.62) {
    const k = 1 + Math.floor(random() * 2);
    const ids = new Set<string>();
    for (let i = 0; i < k; i++) ids.add(any().id);
    source.patch({ remove: [...ids] });
    return `remove ${ids.size}`;
  }
  if (op < 0.72) {
    source.patch({ remove: [any().id], upsert: [changed(any())], append: [makeRec(random, nextId())] });
    return 'mixed patch';
  }
  if (op < 0.8) {
    const list = [...rows];
    const at = Math.floor(random() * list.length);
    list[at] = changed(list[at] as Rec);
    source.setRows(list);
    return 'setRows one changed';
  }
  if (op < 0.86) {
    source.setRows([...rows, makeRec(random, nextId()), makeRec(random, nextId())]);
    return 'setRows appended';
  }
  if (op < 0.92) {
    const at = Math.floor(random() * Math.max(1, rows.length - 3));
    source.setRows([...rows.slice(0, at), ...rows.slice(at + 3)]);
    return 'setRows removed block';
  }
  if (op < 0.95) {
    // Same-row updates through a write (CRUD path).
    const r = any();
    const signal = { aborted: false, addEventListener() {}, removeEventListener() {} } as unknown as AbortSignal;
    void source.write({ version: 0, added: [], changed: [{ rowId: r.id, row: changed(r), previous: r, changedColumnIds: [] }], deleted: [], mode: 'row', signal });
    return 'write change';
  }
  const list: Rec[] = [];
  for (let i = 0; i < rows.length; i++) list.push(makeRec(random, `fresh${nextId()}`));
  source.setRows(list);
  return 'setRows replaced';
}

describe('incremental pipeline updates match a full recompute', () => {
  for (const [si, scenario] of SCENARIOS.entries()) {
    it(scenario.name, () => {
      const random = rng(1000 + si * 77);
      let counter = 0;
      const nextId = () => `k${counter++}`;
      const initial: Rec[] = [];
      for (let i = 0; i < 300; i++) initial.push(makeRec(random, nextId()));
      const source = createLocalDataSource<Rec>(initial, { getRowId: (r) => r.id });
      const engine = engineFor(source, scenario, si % 2 === 0);
      check(engine, source, scenario, 'initial');
      let incremental = 0;
      for (let step = 0; step < 160; step++) {
        const before = updates(engine);
        const what = randomStep(random, source, nextId);
        check(engine, source, scenario, `step ${step} (${what})`);
        if (updates(engine) > before) incremental++;
      }
      // Most steps must have taken the incremental path.
      assert.ok(incremental > 100, `incremental steps: ${incremental}`);
      engine.dispose();
    });
  }

  it('composes deltas of several changes inside one batch', () => {
    const random = rng(42);
    let counter = 0;
    const nextId = () => `b${counter++}`;
    const initial: Rec[] = [];
    for (let i = 0; i < 200; i++) initial.push(makeRec(random, nextId()));
    const source = createLocalDataSource<Rec>(initial, { getRowId: (r) => r.id });
    const scenario = SCENARIOS[0] as Scenario;
    const engine = engineFor(source, scenario, true);
    for (let round = 0; round < 30; round++) {
      const before = updates(engine);
      engine.batch(() => {
        for (let k = 0; k < 4; k++) randomStep(() => random() * 0.9, source, nextId);
      });
      check(engine, source, scenario, `batch ${round}`);
      void before;
    }
    engine.dispose();
  });

  it('interleaves data changes with narrowing / widening query changes', () => {
    // Query edits (typing into the filter and search, sort toggles, page moves)
    // between data changes: the narrowing caches must follow the incremental
    // results, not the pre-change ones.
    const random = rng(4242);
    let counter = 0;
    const nextId = () => `q${counter++}`;
    const initial: Rec[] = [];
    for (let i = 0; i < 400; i++) initial.push(makeRec(random, nextId()));
    const source = createLocalDataSource<Rec>(initial, { getRowId: (r) => r.id });
    const FILTER_TEXT = 'elta';
    const SEARCH_TEXT = 'ta1';
    let filterLen = 1;
    let searchLen = 1;
    let sortDesc = false;
    let multi = false;
    let page = 1;
    const commandsNow = (): DataGridCommand[] => [
      {
        type: 'sort.set',
        sorting: multi
          ? [
              { columnId: 'tag', direction: sortDesc ? 'desc' : 'asc' },
              { columnId: 'qty', direction: 'asc' },
            ]
          : [{ columnId: 'qty', direction: sortDesc ? 'desc' : 'asc' }],
      },
      { type: 'filter.byColumn', columnId: 'name', operator: 'contains', value: FILTER_TEXT.slice(0, filterLen) },
      { type: 'search.set', text: SEARCH_TEXT.slice(0, searchLen) },
      { type: 'paging.goToPage', page },
    ];
    const live: Scenario = { name: 'mixed', pageSize: 9, commands: commandsNow() };
    const engine = engineFor(source, live, true);
    let incremental = 0;
    for (let step = 0; step < 300; step++) {
      const op = random();
      let what: string;
      const before = updates(engine);
      if (op < 0.55) {
        what = randomStep(() => random() * 0.95, source, nextId);
      } else {
        if (op < 0.68) filterLen = filterLen >= FILTER_TEXT.length ? 1 : filterLen + 1;
        else if (op < 0.8) searchLen = searchLen >= SEARCH_TEXT.length ? 1 : searchLen + 1;
        else if (op < 0.87) sortDesc = !sortDesc;
        else if (op < 0.93) multi = !multi;
        else page = 1 + Math.floor(random() * 4);
        what = `query f=${filterLen} s=${searchLen} desc=${sortDesc} multi=${multi} page=${page}`;
        for (const command of commandsNow()) engine.dispatch(command);
      }
      if (updates(engine) > before) incremental++;
      check(engine, source, { ...live, commands: commandsNow() }, `step ${step} (${what})`);
    }
    assert.ok(incremental > 80, `incremental steps: ${incremental}`);
    engine.dispose();
  });

  it('keeps id lookups exact across many removals, appends, and id-index renumbering', () => {
    const random = rng(9);
    let counter = 0;
    const nextId = () => `m${counter++}`;
    const initial: Rec[] = [];
    for (let i = 0; i < 3000; i++) initial.push(makeRec(random, nextId()));
    const source = createLocalDataSource<Rec>(initial, { getRowId: (r) => r.id });
    const scenario: Scenario = { name: 'removals', commands: [{ type: 'sort.set', sorting: [{ columnId: 'qty', direction: 'asc' }] }] };
    const engine = engineFor(source, scenario, false);
    for (let step = 0; step < 1500; step++) {
      const rows = source.getRows();
      const a = rows[Math.floor(random() * rows.length)] as Rec;
      const b = rows[Math.floor(random() * rows.length)] as Rec;
      if (step % 7 === 0) source.patch({ remove: [a.id], append: [makeRec(random, nextId())] });
      else source.patch({ remove: [a.id, b.id] });
      // Upserts resolve through the source's own id index.
      const live = source.getRows();
      const c = live[Math.floor(random() * live.length)] as Rec;
      source.patch({ upsert: [{ ...c, qty: -step }] });
      assert.equal(source.getRows().length, live.length, `upsert must update in place @ ${step}`);
      if (step % 150 === 149) {
        const now = source.getRows();
        for (let i = 0; i < now.length; i += 37) {
          const id = (now[i] as Rec).id;
          assert.equal(engine.getRowSnapshot(id)?.row, now[i], `row of ${id} @ ${step}`);
        }
        check(engine, source, scenario, `step ${step}`);
      }
    }
    engine.dispose();
  });

  it('keeps stable order for equal keys (ties keep source order)', () => {
    const rows: Rec[] = [];
    for (let i = 0; i < 50; i++) rows.push({ id: `t${i}`, name: 'same', qty: i % 3, when: null, ok: true, tag: 'x1' });
    const source = createLocalDataSource<Rec>(rows, { getRowId: (r) => r.id });
    const scenario: Scenario = { name: 'ties', commands: [{ type: 'sort.set', sorting: [{ columnId: 'qty', direction: 'desc' }] }] };
    const engine = engineFor(source, scenario, true);
    source.patch({ upsert: [{ ...(rows[10] as Rec), qty: 2 }, { ...(rows[40] as Rec), qty: 0 }] });
    source.patch({ remove: ['t3'], append: [{ id: 't50', name: 'same', qty: 1, when: null, ok: true, tag: 'x1' }] });
    check(engine, source, scenario, 'ties');
    const ids = visible(engine);
    const qty = new Map(source.getRows().map((r) => [r.id, r.qty as number]));
    const pos = new Map(source.getRows().map((r, i) => [r.id, i]));
    for (let i = 1; i < ids.length; i++) {
      const a = ids[i - 1] as string;
      const b = ids[i] as string;
      assert.ok((qty.get(a) as number) > (qty.get(b) as number) || ((qty.get(a) as number) === (qty.get(b) as number) && (pos.get(a) as number) < (pos.get(b) as number)));
    }
    assert.ok((engine.getInstrumentation()?.stageUpdates['sort'] ?? 0) >= 2);
    engine.dispose();
  });
});

describe('incremental notifications', () => {
  it('reach only the changed row, rows whose position moved, and grid-level subscribers', () => {
    const rows: Rec[] = [];
    for (let i = 0; i < 1000; i++) rows.push({ id: `r${i}`, name: `name${i % 10}`, qty: i, when: null, ok: i % 2 === 0, tag: 'x1' });
    const source = createLocalDataSource<Rec>(rows, { getRowId: (r) => r.id });
    const scenario: Scenario = { name: 'notify', commands: [{ type: 'sort.set', sorting: [{ columnId: 'qty', direction: 'asc' }] }] };
    const engine = engineFor(source, scenario, false);
    const rowHits = new Map<string, number>();
    const cellHits = new Map<string, number>();
    const watched = Array.from({ length: 40 }, (_, i) => `r${i}`);
    for (const id of watched) {
      engine.getRowSnapshot(id);
      // Like useSyncExternalStore subscribers, listeners re-read their snapshot.
      engine.subscribeRow(id, () => {
        rowHits.set(id, (rowHits.get(id) ?? 0) + 1);
        engine.getRowSnapshot(id);
      });
      for (const col of ['name', 'qty']) {
        engine.getCellSnapshot(id, col);
        engine.subscribeCell(id, col, () => {
          cellHits.set(`${id}:${col}`, (cellHits.get(`${id}:${col}`) ?? 0) + 1);
          engine.getCellSnapshot(id, col);
        });
      }
    }
    let grid = 0;
    let counts = 0;
    let orders = 0;
    engine.subscribe(() => grid++);
    engine.subscribeSelector((s) => s.rows.count, () => counts++);
    engine.subscribeSelector((s) => s.rows.order, () => orders++);

    // Non-key change: only r5 (row + both cells); order and positions unchanged.
    source.patch({ upsert: [{ ...(rows[5] as Rec), name: 'renamed' }] });
    assert.deepEqual([...rowHits.keys()], ['r5']);
    assert.deepEqual([...cellHits.keys()].sort(), ['r5:name', 'r5:qty']);
    assert.equal(grid, 1);
    assert.equal(counts, 0);
    assert.equal(orders, 1);

    // Sort-key change moving r5 from position 5 to 20: rows r6..r20 shift up by one.
    rowHits.clear();
    cellHits.clear();
    source.patch({ upsert: [{ ...(rows[5] as Rec), name: 'renamed', qty: 20.5 }] });
    const moved = Array.from({ length: 15 }, (_, i) => `r${i + 6}`);
    assert.deepEqual([...rowHits.keys()].sort(), ['r5', ...moved].sort());
    assert.deepEqual([...cellHits.keys()].sort(), ['r5:name', 'r5:qty']);
    assert.equal(engine.getRowIndex('r5'), 20);
    assert.equal(counts, 0);

    // Removing r0 shifts every visible row; the count subscriber fires once.
    rowHits.clear();
    cellHits.clear();
    source.patch({ remove: ['r0'] });
    assert.equal(counts, 1);
    assert.equal(rowHits.get('r0'), 1);
    assert.deepEqual([...cellHits.keys()].sort(), ['r0:name', 'r0:qty']);
    assert.equal((engine.getInstrumentation()?.stageUpdates['sort'] ?? 0) >= 3, true);
    engine.dispose();
  });
});
