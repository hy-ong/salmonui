// Pivot Table core-path budgets on the `pivot` fixture: 1,000,000 seeded rows, 3 row fields,
// 2 column fields, 2 value fields (about 50,000 x 500 cells fully expanded).
// Same method as the other perf suites: one warm-up, median of the runs, gc
// between runs, one retry on a failing timing. Every timed operation ends
// with the first painted window read (60 x 60 cells), so lazily computed
// work is included. `REFERENCE` holds recorded reference medians
// (React 18, 1,000,000 rows); every budget must also beat them by 2x.
import assert from 'node:assert/strict';
import os from 'node:os';
import { after, before, describe, it } from 'node:test';
import { assertBudget } from '../../../../tooling/bench/budget.mjs';
import { Worker } from 'node:worker_threads';
import { computePivot, createPivotEngine, createPivotWorkerEngine, windowOf, type PivotEngine, type PivotModelInput, type WorkerLike } from '@salmonui/pivot-table/engine';
import { pivotFixture, type PivotFixtureRow } from './pivot-fixtures.ts';

const gc = (globalThis as { gc?: () => void }).gc;
const BUDGET = { initial: 1500, drill: 50, filter: 300, sort: 100, valueSort: 150, move: 1500, ssr: 100 } as const;
const REFERENCE = { initial: 3690, drillDownRow: 281, drillUpRow: 187, drillDownColumn: 5307, drillUpColumn: 254, filterRow: 584, clearRow: 2922, filterColumn: 1000, clearColumn: 207, sortRow: 275, sortColumn: 213 } as const;
const MODEL: PivotModelInput = {
  rows: [{ field: 'r0' }, { field: 'r1' }, { field: 'r2' }],
  columns: [{ field: 'c0' }, { field: 'c1' }],
  values: [
    { field: 'amount', aggregate: 'sum' },
    { field: 'units', aggregate: 'average' },
  ],
};
const WINDOW = { rowStart: 0, rowEnd: 60, columnStart: 0, columnEnd: 60 };

let rows: PivotFixtureRow[] = [];
let engine: PivotEngine<PivotFixtureRow>;

const median = (t: number[]) => [...t].sort((a, b) => a - b)[t.length >> 1]!;
const paint = (e: PivotEngine<PivotFixtureRow>) => windowOf(e.getSnapshot(), WINDOW);

function time(body: () => void): number {
  gc?.();
  const t = performance.now();
  body();
  return performance.now() - t;
}

function gate(scenario: string, budget: number, run: () => number, reference?: number): void {
  let ms = run();
  if (ms > budget || (reference && ms > reference / 2)) {
    console.log(`[perf] ${scenario}: retrying once (${ms.toFixed(3)}ms)`);
    ms = run();
  }
  console.log(`[perf] ${scenario}: median=${ms.toFixed(3)}ms budget=${budget}ms${reference ? ` reference=${reference}ms ratio=${(ms / reference).toFixed(3)}` : ''} load=${os.loadavg()[0]?.toFixed(2)}`);
  assertBudget(ms, budget, scenario);
  if (reference) assertBudget(ms, reference / 2, `${scenario} (0.5 x reference median)`);
}

const member = (prefix: string, i: number) => `${prefix}${String(i).padStart(2, '0')}`;

describe('pivot core paths (pivot fixture, 1,000,000 rows)', () => {
  before(() => {
    rows = pivotFixture();
    engine = createPivotEngine({ data: rows, model: MODEL });
  });
  after(() => {
    rows = [];
  });

  it('initial aggregation, data to result ready (in-process)', () => {
    gate(
      'pivot initial aggregation 1M rows (in-process)',
      BUDGET.initial,
      () => {
        time(() => paint(createPivotEngine({ data: rows, model: MODEL })));
        return median([0, 1, 2].map(() => time(() => paint(createPivotEngine({ data: rows, model: MODEL })))));
      },
      REFERENCE.initial,
    );
  });

  it('initial aggregation through the Worker host (rows transferred in chunks)', async () => {
    const run = async () => {
      const thread = new Worker(new URL('./pivot-worker-thread.mjs', import.meta.url));
      const worker: WorkerLike = {
        postMessage: (m) => thread.postMessage(m),
        addEventListener: (_t, l) => void thread.on('message', (data) => l({ data })),
        terminate: () => void thread.terminate(),
      };
      await new Promise((resolve) => thread.once('online', resolve));
      gc?.();
      const t = performance.now();
      const remote = createPivotWorkerEngine(worker, { data: rows, model: MODEL, chunkSize: 50_000 });
      await remote.ready;
      await remote.getWindow(WINDOW);
      const ms = performance.now() - t;
      remote.destroy();
      return ms;
    };
    await run();
    let ms = median([await run(), await run(), await run()]);
    if (ms > BUDGET.initial) ms = median([await run(), await run(), await run()]);
    console.log(`[perf] pivot initial aggregation 1M rows (worker): median=${ms.toFixed(3)}ms budget=${BUDGET.initial}ms reference=${REFERENCE.initial}ms ratio=${(ms / REFERENCE.initial).toFixed(3)} load=${os.loadavg()[0]?.toFixed(2)}`);
    assertBudget(ms, BUDGET.initial, 'pivot initial aggregation 1M rows (worker)');
  });

  it('drill down and up one row member', () => {
    let k = 0;
    const down: number[] = [];
    const up: number[] = [];
    const runDown = () => {
      down.length = up.length = 0;
      for (let i = 0; i < 6; i++, k++) {
        const path = ['rows', member('Region ', k % 50)] as const;
        down.push(time(() => (engine.expand([...path]), paint(engine))));
        up.push(time(() => (engine.collapse([...path]), paint(engine))));
      }
      return median(down.slice(1));
    };
    gate('pivot drill down row member', BUDGET.drill, runDown, REFERENCE.drillDownRow);
    gate('pivot drill up row member', BUDGET.drill, () => median(up.slice(1)), REFERENCE.drillUpRow);
    // A second level under an expanded member.
    engine.expand(['rows', member('Region ', 7)]);
    gate('pivot drill down row member (level 2)', BUDGET.drill, () => median([1, 2, 3, 4, 5].map((c) => time(() => (engine.expand(['rows', member('Region ', 7), member('Country ', c)]), paint(engine))))));
    engine.collapseAll();
  });

  it('drill down and up one column member', () => {
    const down: number[] = [];
    const up: number[] = [];
    for (let i = 0; i < 6; i++) {
      const path = ['columns', member('Year ', i)] as const;
      down.push(time(() => (engine.expand([...path]), paint(engine))));
      up.push(time(() => (engine.collapse([...path]), paint(engine))));
    }
    gate('pivot drill down column member', BUDGET.drill, () => median(down.slice(1)), REFERENCE.drillDownColumn);
    gate('pivot drill up column member', BUDGET.drill, () => median(up.slice(1)), REFERENCE.drillUpColumn);
  });

  it('apply and clear a member filter on a row and on a column field', () => {
    const cycle = (field: 'r0' | 'c0', prefix: string) => {
      const apply: number[] = [];
      const clear: number[] = [];
      // Three warm-up cycles left out of the median (the first filter of a
      // field compiles its code), then the median of five.
      for (let i = 0; i < 8; i++) {
        apply.push(time(() => (engine.setModel((m) => ({ ...m, filterBy: { [field]: { exclude: [member(prefix, i), member(prefix, i + 1)] } } })), paint(engine))));
        clear.push(time(() => (engine.setModel((m) => ({ ...m, filterBy: {} })), paint(engine))));
      }
      return { apply: median(apply.slice(3)), clear: median(clear.slice(3)) };
    };
    // Each gate run (and its retry) measures a new cycle.
    gate('pivot filter apply row member', BUDGET.filter, () => cycle('r0', 'Region ').apply, REFERENCE.filterRow);
    gate('pivot filter clear row member', BUDGET.filter, () => cycle('r0', 'Region ').clear, REFERENCE.clearRow);
    gate('pivot filter apply column member', BUDGET.filter, () => cycle('c0', 'Year ').apply, REFERENCE.filterColumn);
    gate('pivot filter clear column member', BUDGET.filter, () => cycle('c0', 'Year ').clear, REFERENCE.clearColumn);
  });

  it('sort a row field and a column field', () => {
    const cycle = (field: string) => median([0, 1, 2, 3, 4].map((i) => time(() => (engine.setModel((m) => ({ ...m, sort: { [field]: i % 2 ? 'asc' : 'desc' } })), paint(engine)))).slice(1));
    gate('pivot sort row field', BUDGET.sort, () => cycle('r0'), REFERENCE.sortRow);
    gate('pivot sort column field', BUDGET.sort, () => cycle('c0'), REFERENCE.sortColumn);
    engine.setModel((m) => ({ ...m, sort: {} }));
  });

  it('value sort on one column', () => {
    engine.expand(['rows', member('Region ', 3)]);
    const run = () =>
      median(
        [0, 1, 2, 3, 4].map((i) =>
          time(() => (engine.setModel((m) => ({ ...m, valueSort: { columnKey: i % 2 ? '' : JSON.stringify([member('Year ', i)]), measure: 'amount', direction: i % 2 ? 'asc' : 'desc', multipleAxis: true } })), paint(engine))),
        ).slice(1),
      );
    gate('pivot value sort one column', BUDGET.valueSort, run);
    engine.setModel((m) => ({ ...m, valueSort: null, expanded: [] }));
  });

  it('move a field between axes (full recompute)', () => {
    // Every run moves to an axis layout not seen before (no cached axis index).
    const layouts: [string[], string[]][] = [
      [['r0', 'c1'], ['c0', 'r1']],
      [['r1', 'r0', 'r2'], ['c1', 'c0']],
      [['c0', 'r0'], ['r2', 'c1']],
      [['r2', 'r1'], ['c0', 'r0', 'c1']],
    ];
    const times = layouts.map(([r, c]) => time(() => (engine.setModel({ ...MODEL, rows: r.map((field) => ({ field })), columns: c.map((field) => ({ field })) }), paint(engine))));
    gate('pivot move field between axes', BUDGET.move, () => median(times.slice(1)));
    engine.setModel(MODEL);
  });

  it('fully expanded result (reported)', () => {
    const t = time(() => (engine.expandAll(), paint(engine)));
    const r = engine.getSnapshot();
    console.log(`[perf] pivot expand all rows and columns: ${t.toFixed(3)}ms`);
    assert.ok(r.rowCount > 50_000 && r.columnCount > 500, `${r.rowCount} x ${r.columnCount}`);
    const f = time(() => (engine.setModel((m) => ({ ...m, filterBy: { r0: { exclude: ['Region 01'] } } })), paint(engine)));
    console.log(`[perf] pivot member filter on the fully expanded result: ${f.toFixed(3)}ms`);
    engine.setModel((m) => ({ ...m, filterBy: {}, expanded: [] }));
  });

  it('SSR-size compute: 10,000 rows, engine share of the SSR budget', () => {
    const small = rows.slice(0, 10_000);
    gate('pivot ssr compute 10k rows (engine share)', BUDGET.ssr, () => {
      time(() => windowOf(computePivot({ data: small, model: MODEL }), WINDOW));
      return median([0, 1, 2, 3, 4].map(() => time(() => windowOf(computePivot({ data: small, model: MODEL }), WINDOW))));
    });
  });
});
