// Grouping gates on the `large` fixture (100k x 100), same method as
// query-performance.test.ts (one warm-up, median of 5, gc between runs, one
// retry on a failing timing). Cold runs use a fresh copy of the rows (no
// cached keys) and a fresh engine. REFERENCE holds recorded reference medians
// (sortBy + group + sum/average aggregates).
import assert from 'node:assert/strict';
import os from 'node:os';
import { describe, it } from 'node:test';
import { assertBudget } from '../../../../tooling/bench/budget.mjs';
import {
  createAggregatesModule,
  createFilterModule,
  createDataGridEngine,
  createGroupingModule,
  createLocalDataSource,
  createPagingModule,
  createSearchModule,
  createSortModule,
  type DataGridCommand,
  type DataSource,
  type DataGridModule,
  type LocalDataSource,
} from '@salmonui/data-grid/engine';
import { wideFixture, type WideRow } from './fixtures.ts';

const ROWS = 100_000;
const RUNS = 5;
const gc = (globalThis as { gc?: () => void }).gc;
const { rows, columns } = wideFixture(ROWS);

const REFERENCE = { group1: 135.69, group3: 696.69 } as const;
const BUDGET = { group1: 30, group3: 450, toggle: 1, all: 5, patch: 2 } as const;

const AGGREGATES = ['n0', 'n1', 'n2'].flatMap((columnId) => [
  { columnId, type: 'sum' as const, placement: ['groupCaption' as const, 'footer' as const] },
  { columnId, type: 'average' as const, placement: ['groupCaption' as const] },
]);

type Modules = readonly DataGridModule<WideRow, any, any, string>[];

function makeEngine(data: readonly WideRow[] | DataSource<WideRow>) {
  return createDataGridEngine<WideRow, Modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: data,
    dev: false,
    instrument: true,
    modules: [
      createSearchModule<WideRow>(),
      createFilterModule<WideRow>(),
      createSortModule<WideRow>(),
      createGroupingModule<WideRow>(),
      createAggregatesModule<WideRow>(),
      createPagingModule<WideRow>(),
    ],
    paging: { enabled: false },
  });
}

const groupCommands = (fields: string[]): DataGridCommand[] => [
  { type: 'aggregates.set', aggregates: AGGREGATES },
  { type: 'grouping.set', grouping: fields.map((columnId) => ({ columnId })) },
];

function median(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] as number;
}

/** 1 warm-up + `runs` measured runs; `setup` runs untimed and returns the timed body. */
function measure(setup: () => () => void, runs = RUNS): number {
  setup()();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const body = setup();
    gc?.();
    const t = performance.now();
    body();
    times.push(performance.now() - t);
  }
  return median(times);
}

const report: { scenario: string; ms: number; budget: number; reference?: number }[] = [];

function gate(scenario: string, budget: number, run: () => number, reference?: number): void {
  let ms = run();
  if (ms > budget) {
    console.log(`[perf] ${scenario}: retrying once (${ms.toFixed(3)}ms)`);
    ms = run();
  }
  report.push({ scenario, ms, budget, ...(reference ? { reference } : {}) });
  console.log(`[perf] ${scenario}: median=${ms.toFixed(3)}ms budget=${budget}ms${reference ? ` reference=${reference}ms ratio=${(ms / reference).toFixed(3)}` : ''} load=${os.loadavg()[0]?.toFixed(2)}`);
  assertBudget(ms, budget, scenario);
  if (reference) assertBudget(ms, reference * 0.5, `${scenario} (0.5 x reference median)`);
}

function cold(fields: string[]): number {
  return measure(() => {
    const engine = makeEngine(rows.slice());
    engine.getSnapshot();
    const list = groupCommands(fields);
    return () => {
      engine.batch(() => {
        for (const c of list) engine.dispatch(c);
      });
      engine.getSnapshot();
    };
  });
}

function captionIds(engine: ReturnType<typeof makeEngine>, limit: number): string[] {
  const ids: string[] = [];
  const count = engine.getSnapshot().rows.count;
  for (let i = 0; i < count && ids.length < limit; i++) {
    const id = engine.getRowIdAt(i) as string;
    if (id.startsWith('__g:')) ids.push(id);
  }
  return ids;
}

describe('grouping and aggregates (100k x 100)', () => {
  it('group by one string column + sum/average on 3 number columns (cold)', () => {
    gate('group s0 + sum/avg n0..n2 (cold)', BUDGET.group1, () => cold(['s0']), REFERENCE.group1);
  });

  it('3-level grouping with aggregates (cold)', () => {
    gate('group s0, d0, b0 + sum/avg n0..n2 (cold)', BUDGET.group3, () => cold(['s0', 'd0', 'b0']), REFERENCE.group3);
    const engine = makeEngine(rows);
    for (const c of groupCommands(['s0', 'd0', 'b0'])) engine.dispatch(c);
    const groups = engine.getSnapshot().rows.groups;
    console.log(`[perf] 3-level groups: ${groups?.count}`);
    assert.ok((groups?.count ?? 0) > 10_000);
    engine.dispose();
  });

  for (const fields of [['s0'], ['s0', 'd0', 'b0']]) {
    it(`expand/collapse one group and all groups (${fields.join(', ')})`, () => {
      const engine = makeEngine(rows);
      for (const c of groupCommands(fields)) engine.dispatch(c);
      engine.getSnapshot();
      const ids = captionIds(engine, 40);
      let n = 0;
      gate(`toggle one group (${fields.join(',')})`, BUDGET.toggle, () =>
        measure(() => {
          const id = ids[n++ % ids.length] as string;
          return () => {
            engine.dispatch({ type: 'grouping.toggle', group: id });
            engine.getSnapshot();
          };
        }, 15),
      );
      let collapsed = false;
      gate(`collapse/expand all (${fields.join(',')})`, BUDGET.all, () =>
        measure(() => {
          const type = collapsed ? 'grouping.expandAll' : 'grouping.collapseAll';
          collapsed = !collapsed;
          return () => {
            engine.dispatch({ type } as DataGridCommand);
            engine.getSnapshot();
          };
        }, 9),
      );
      engine.dispose();
    });
  }

  for (const fields of [['s0'], ['s0', 'd0', 'b0']]) {
    it(`single-row patch in a grouped grid takes the incremental path (${fields.join(', ')})`, () => {
      const source: LocalDataSource<WideRow> = createLocalDataSource<WideRow>(rows.slice(), { getRowId: (r) => r.id });
      const engine = makeEngine(source);
      engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n0', direction: 'asc' }] });
      for (const c of groupCommands(fields)) engine.dispatch(c);
      engine.getSnapshot();
      let seq = 0;
      const before = engine.getInstrumentation()?.stageUpdates ?? {};
      gate(`patch 1 row (${fields.join(',')})`, BUDGET.patch, () =>
        measure(() => {
          seq++;
          const list = source.getRows();
          const row = list[(seq * 104729) % list.length] as WideRow;
          const donor = list[(seq * 7919) % list.length] as WideRow;
          const next = { ...row, n0: (seq * 7919) % 100000, n1: seq, s0: donor['s0'] as string };
          return () => {
            source.patch({ upsert: [next] });
            engine.getSnapshot();
          };
        }, 15),
      );
      const after = engine.getInstrumentation()?.stageUpdates ?? {};
      for (const stage of ['sort', 'group', 'aggregate']) {
        assert.ok((after[stage] ?? 0) > (before[stage] ?? 0), `${stage} stage did not take the incremental path`);
      }
      // Matches a fresh engine over the same rows.
      const oracle = makeEngine(source.getRows().slice());
      oracle.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n0', direction: 'asc' }] });
      for (const c of groupCommands(fields)) oracle.dispatch(c);
      const a = engine.getSnapshot().rows;
      const b = oracle.getSnapshot().rows;
      assert.equal(a.count, b.count);
      for (let i = 0; i < a.count; i += 97) assert.equal(engine.getRowIdAt(i), oracle.getRowIdAt(i));
      const grouping = (e: typeof engine) => (e as unknown as { grouping: { getGroup(id: string): { aggregates: unknown } | undefined } }).grouping;
      for (const id of captionIds(engine, 30)) assert.deepEqual(grouping(engine).getGroup(id)?.aggregates, grouping(oracle).getGroup(id)?.aggregates);
      oracle.dispose();
      engine.dispose();
    });
  }

  it('prints the table', () => {
    console.log(`[perf] scenario | median ms | budget ms | reference ms (load average ${os.loadavg().map((l) => l.toFixed(2)).join(' ')})`);
    for (const r of report) console.log(`[perf] ${r.scenario} | ${r.ms.toFixed(3)} | ${r.budget} | ${r.reference ?? '-'}`);
  });
});
