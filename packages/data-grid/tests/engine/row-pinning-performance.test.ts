// Row pinning on the `large` fixture (100k x 100), sorted by n0 and
// paged by 50: registering the module without pins keeps patches on the
// incremental path; pinning, sorting and patching with pinned rows stay
// within the query and patch budgets. Median of 5 after
// one warm-up, gc between runs, one retry over budget.
import assert from 'node:assert/strict';
import os from 'node:os';
import { describe, it } from 'node:test';
import { assertBudget } from '../../../../tooling/bench/budget.mjs';
import {
  createFilterModule,
  createDataGridEngine,
  createLocalDataSource,
  createPagingModule,
  createSearchModule,
  createSortModule,
  type DataGridModule,
  type LocalDataSource,
} from '@salmonui/data-grid/engine';
import { createRowPinningModule, type RowPinningOptions } from '@salmonui/data-grid/engine/row-pinning';
import { wideFixture, type WideRow } from './fixtures.ts';

const ROWS = 100_000;
const RUNS = 5;
const gc = (globalThis as { gc?: () => void }).gc;
const { rows, columns } = wideFixture(ROWS);

function makeEngine(source: LocalDataSource<WideRow>, rowPinning: RowPinningOptions<WideRow> = {}) {
  const engine = createDataGridEngine<WideRow, readonly DataGridModule<WideRow, any, any, string>[]>({
    getRowId: (r) => r.id,
    columns,
    dataSource: source,
    dev: false,
    instrument: true,
    modules: [createSearchModule<WideRow>(), createFilterModule<WideRow>(), createSortModule<WideRow>(), createPagingModule<WideRow>(), createRowPinningModule<WideRow>()],
    paging: { pageSize: 50 },
    rowPinning,
  });
  engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n0', direction: 'asc' }] });
  engine.getSnapshot();
  return engine;
}

function median(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] as number;
}

function measure(setup: () => () => void): number {
  setup()();
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const body = setup();
    gc?.();
    const t = performance.now();
    body();
    times.push(performance.now() - t);
  }
  return median(times);
}

function gate(scenario: string, budget: number, run: () => number): void {
  let ms = run();
  if (ms > budget) {
    console.log(`[perf] ${scenario}: retrying once (${ms.toFixed(3)}ms)`);
    ms = run();
  }
  console.log(`[perf] ${scenario}: median=${ms.toFixed(3)}ms budget=${budget}ms load=${os.loadavg()[0]?.toFixed(2)}`);
  assertBudget(ms, budget, scenario);
}

const PINNED = Array.from({ length: 20 }, (_, i) => `r${i * 4999}`);

describe('row pinning performance (100k x 100)', () => {
  it('registered without pins: a 1-row patch stays incremental and <= 2 ms', () => {
    const source = createLocalDataSource<WideRow>(rows.slice(), { getRowId: (r) => r.id });
    const engine = makeEngine(source);
    let seq = 0;
    const before = engine.getInstrumentation()?.stageUpdates['sort'] ?? 0;
    gate('patch 1 row, module without pins', 2, () =>
      measure(() => {
        const current = source.getRows();
        const row = current[(++seq * 104729) % current.length] as WideRow;
        const next = { ...row, n0: (seq * 7919) % 100000 };
        return () => {
          source.patch({ upsert: [next] });
          engine.getSnapshot();
        };
      }),
    );
    assert.ok((engine.getInstrumentation()?.stageUpdates['sort'] ?? 0) > before, 'sort took the incremental path');
    assert.equal(engine.getSnapshot().rows.pinned ?? null, null);
  });

  it('pin and unpin 20 rows <= 16 ms', () => {
    const source = createLocalDataSource<WideRow>(rows.slice(), { getRowId: (r) => r.id });
    const engine = makeEngine(source);
    let flip = false;
    gate('pin or unpin 20 rows', 16, () =>
      measure(() => () => {
        flip = !flip;
        engine.dispatch({ type: flip ? 'rowPinning.pin' : 'rowPinning.unpin', rowIds: PINNED });
        engine.getSnapshot();
      }),
    );
  });

  it('sort with 20 pinned rows <= 150 ms (single-column sort budget)', () => {
    const source = createLocalDataSource<WideRow>(rows.slice(), { getRowId: (r) => r.id });
    const engine = makeEngine(source, { rowIds: PINNED });
    assert.equal(engine.getSnapshot().rows.pinned?.length, 20);
    let desc = false;
    gate('sort n1 with 20 pinned rows', 150, () =>
      measure(() => () => {
        desc = !desc;
        engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n1', direction: desc ? 'desc' : 'asc' }] });
        engine.getSnapshot();
      }),
    );
  });

  for (const [name, options] of [
    ['explicit pins', { rowIds: PINNED }],
    ['isRowPinned', { isRowPinned: (r: WideRow) => PINNED.includes(r.id) }],
  ] as const) {
    it(`1-row patch with 20 pinned rows (${name}) <= 2 ms`, () => {
      const source = createLocalDataSource<WideRow>(rows.slice(), { getRowId: (r) => r.id });
      const engine = makeEngine(source, options);
      assert.equal(engine.getSnapshot().rows.pinned?.length, 20);
      let seq = 0;
      gate(`patch 1 row, 20 pinned (${name})`, 2, () =>
        measure(() => {
          const current = source.getRows();
          const row = current[(++seq * 104729) % current.length] as WideRow;
          const next = { ...row, n0: (seq * 7919) % 100000 };
          return () => {
            source.patch({ upsert: [next] });
            engine.getSnapshot();
          };
        }),
      );
      assert.equal(engine.getSnapshot().rows.pinned?.length, 20);
    });
  }
});
