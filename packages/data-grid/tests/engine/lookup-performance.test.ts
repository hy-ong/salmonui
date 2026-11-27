// Foreign-key and persistence gates: the
// `large` fixture (100k x 100) plus one foreign-key column over a 1,000-row
// lookup. Same method as query-performance.test.ts: one warm-up, median of
// 5, gc between runs, one retry on a failing timing. Cold runs use a fresh
// copy of the rows array (no cached keys) and a fresh engine.
import assert from 'node:assert/strict';
import os from 'node:os';
import { describe, it } from 'node:test';
import { assertBudget } from '../../../../tooling/bench/budget.mjs';
import {
  createFilterModule,
  createDataGridEngine,
  createGroupingModule,
  createPagingModule,
  createSearchModule,
  createSelectionModule,
  createSortModule,
  type ColumnDef,
} from '@salmonui/data-grid/engine';
import { createLookupModule } from '@salmonui/data-grid/engine/lookup';
import { getDataGridState, restoreDataGridState, serializeDataGridState } from '@salmonui/data-grid/engine/persistence';
import { wideFixture, type WideRow } from './fixtures.ts';

const ROWS = 100_000;
const RUNS = 5;
const gc = (globalThis as { gc?: () => void }).gc;
const { rows, columns: baseColumns } = wideFixture(ROWS);
let seed = 7;
for (const row of rows) {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  (row as Record<string, unknown>)['cust'] = seed % 1000;
}
const customers = Array.from({ length: 1000 }, (_, i) => ({ CustomerID: i, ContactName: `Customer ${String((i * 7919) % 1000).padStart(3, '0')}` }));
let displayReads = 0;
const lookupRows = customers.map((c) => ({
  CustomerID: c.CustomerID,
  get ContactName() {
    displayReads++;
    return c.ContactName;
  },
}));
const columns: ColumnDef<WideRow>[] = [...baseColumns, { field: 'cust', lookup: { data: lookupRows, keyField: 'CustomerID', displayField: 'ContactName' }, width: 160 }];

const BUDGET = { sortCold: 50, sortWarm: 10, filterWarm: 10, groupCold: 50, restore: 120, read: 1 } as const;


function makeEngine(data: readonly WideRow[]) {
  return createDataGridEngine({
    getRowId: (r) => r.id,
    columns,
    dataSource: data,
    dev: false,
    instrument: true,
    modules: [
      createLookupModule<WideRow>(),
      createSearchModule<WideRow>(),
      createFilterModule<WideRow>(),
      createSortModule<WideRow>(),
      createGroupingModule<WideRow>(),
      createPagingModule<WideRow>(),
      createSelectionModule<WideRow>(),
    ],
    paging: { enabled: false },
  });
}

function median(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] as number;
}

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

function gate(scenario: string, budget: number, run: () => number): void {
  let ms = run();
  if (ms > budget) {
    console.log(`[perf] ${scenario}: retrying once (${ms.toFixed(3)}ms)`);
    ms = run();
  }
  console.log(`[perf] ${scenario}: median=${ms.toFixed(3)}ms budget=${budget}ms load=${os.loadavg()[0]?.toFixed(2)}`);
  assertBudget(ms, budget, scenario);
}

describe('foreign keys and persistence (100k x 100)', () => {
  it('sorts by foreign-key display text cold and warm', () => {
    gate('lookup sort cold (display resolution + keys)', BUDGET.sortCold, () =>
      measure(() => {
        const engine = makeEngine(rows.slice());
        engine.getSnapshot();
        return () => {
          engine.sort.set({ sorting: [{ columnId: 'cust', direction: 'asc' }] });
          engine.getSnapshot();
        };
      }),
    );
    const engine = makeEngine(rows);
    engine.sort.set({ sorting: [{ columnId: 'cust', direction: 'asc' }] });
    engine.getSnapshot();
    let dir: 'asc' | 'desc' = 'asc';
    displayReads = 0;
    gate('lookup sort warm direction change', BUDGET.sortWarm, () =>
      measure(() => () => {
        dir = dir === 'asc' ? 'desc' : 'asc';
        engine.sort.set({ sorting: [{ columnId: 'cust', direction: dir }] });
        engine.getSnapshot();
      }),
    );
    assert.equal(displayReads, 0, 'warm queries never read the lookup');
    // Ordered by display text.
    engine.sort.set({ sorting: [{ columnId: 'cust', direction: 'asc' }] });
    const first = engine.getCellSnapshot(engine.getRowIdAt(0) as string, 'cust')?.formattedValue ?? '';
    const last = engine.getCellSnapshot(engine.getRowIdAt(ROWS - 1) as string, 'cust')?.formattedValue ?? '';
    assert.ok(first <= last && first === 'Customer 000', `${first} .. ${last}`);
    engine.dispose();
  });

  it('filters by display text (warm, contains)', () => {
    const engine = makeEngine(rows);
    engine.filter.byColumn({ columnId: 'cust', operator: 'contains', value: '1' });
    engine.getSnapshot();
    let i = 0;
    displayReads = 0;
    gate('lookup contains filter warm', BUDGET.filterWarm, () =>
      measure(() => () => {
        engine.filter.byColumn({ columnId: 'cust', operator: 'contains', value: `${i++ % 10}${i % 7}` });
        engine.getSnapshot();
      }),
    );
    assert.equal(displayReads, 0);
    engine.dispose();
  });

  it('groups by the foreign-key column (cold)', () => {
    gate('lookup group cold', BUDGET.groupCold, () =>
      measure(() => {
        const engine = makeEngine(rows.slice());
        engine.getSnapshot();
        return () => {
          engine.grouping.set({ grouping: [{ columnId: 'cust' }] });
          engine.getSnapshot();
        };
      }),
    );
    const engine = makeEngine(rows);
    engine.grouping.set({ grouping: [{ columnId: 'cust' }] });
    assert.equal(engine.getSnapshot().rows.groups?.count, 1000);
    engine.dispose();
  });

  it('restores sort, filter, search, group, page, and column state; reads state in under 1 ms', () => {
    const source = makeEngine(rows);
    source.batch(() => {
      source.dispatch({ type: 'columns.setOrder', order: ['s1', 's0', 'n0'] });
      source.dispatch({ type: 'columns.setWidths', widths: { s0: 220, n0: 90 } });
      source.dispatch({ type: 'columns.hide', keys: ['b0', 'b1'] });
      source.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n0', direction: 'desc' }] });
      source.dispatch({ type: 'filter.byColumn', columnId: 's1', operator: 'contains', value: 'word-1' });
      source.dispatch({ type: 'search.set', text: 'word-2', columnIds: ['s2', 's3'] });
      source.dispatch({ type: 'grouping.set', grouping: [{ columnId: 'b2' }] });
    });
    const state = getDataGridState(source);
    gate('getGridState + serializeGridState', BUDGET.read, () => measure(() => () => void serializeDataGridState(getDataGridState(source)), 9));
    gate('restoreGridState (large)', BUDGET.restore, () =>
      measure(() => {
        const engine = makeEngine(rows.slice());
        engine.getSnapshot();
        return () => {
          const result = restoreDataGridState(engine, state);
          engine.getSnapshot();
          assert.equal(result.status, 'applied');
          assert.equal(engine.getInstrumentation()?.columnCompiles, 1);
        };
      }),
    );
    source.dispose();
  });
});
