// Query pipeline benchmarks on the `large` fixture (100k x 100): one warm-up
// (three for cold runs), median of 5, gc between runs. Each cold median must
// be at most half of the recorded reference median (lower bound of the
// observed range);
// page change and unchanged re-apply must stay under 1 ms. The last suite
// gates incremental data updates (patch / insert / remove / setRows) with
// sort, filter, and search active.
import assert from 'node:assert/strict';
import os from 'node:os';
import { before, describe, it } from 'node:test';
import { assertBudget } from '../../../../tooling/bench/budget.mjs';
import {
  createFilterModule,
  createDataGridEngine,
  createLocalDataSource,
  createPagingModule,
  createSearchModule,
  createSortModule,
  type DataGridCommand,
  type DataGridModule,
  type DataGridQueryInit,
  type LocalDataSource,
  type RowModelSnapshot,
} from '@salmonui/data-grid/engine';
import { wideFixture, type WideRow } from './fixtures.ts';

const ROWS = 100_000;
const RUNS = 5;
const COLD_WARMUPS = 3;
const gc = (globalThis as { gc?: () => void }).gc;
const { rows, columns } = wideFixture(ROWS);

/** Recorded reference medians (ms) for the same scenarios. */
const REFERENCE = {
  sortNumber: 209,
  sortString: 77,
  multiSort: 713,
  contains: 21,
  typing: 145,
  search: 132,
  pageChange: 226,
  reapply: 101,
} as const;

const SEARCH_COLUMNS = Array.from({ length: 40 }, (_, c) => `s${c}`);

function modulesFor(paging: boolean): DataGridModule<WideRow, any, any, string>[] {
  const list: DataGridModule<WideRow, any, any, string>[] = [createSearchModule<WideRow>(), createFilterModule<WideRow>(), createSortModule<WideRow>()];
  if (paging) list.push(createPagingModule<WideRow>());
  return list;
}

function makeEngine(data: readonly WideRow[], extra: { paging?: { pageSize: number }; defaultQuery?: DataGridQueryInit } = {}) {
  return createDataGridEngine<WideRow, readonly DataGridModule<WideRow, any, any, string>[]>({
    getRowId: (r) => r.id,
    columns,
    dataSource: data,
    dev: false,
    modules: modulesFor(extra.paging !== undefined),
    ...(extra.paging ? { paging: extra.paging } : {}),
    ...(extra.defaultQuery ? { defaultQuery: extra.defaultQuery } : {}),
  });
}

function median(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] as number;
}

/** `warmups` untimed runs + 5 measured runs. `setup` runs untimed before each run and returns the timed body. */
function measure(setup: () => () => void, warmups = 1): number {
  for (let i = 0; i < warmups; i++) setup()();
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

const sortSet = (sorting: { columnId: string; direction: 'asc' | 'desc' }[]): DataGridCommand => ({ type: 'sort.set', sorting });
const contains = (text: string): DataGridCommand => ({ type: 'filter.byColumn', columnId: 's0', operator: 'contains', value: text });

/**
 * Cold: a fresh copy of the rows (new data version, no cached keys) and a
 * fresh engine per run, after COLD_WARMUPS untimed cold runs (one run left
 * the engine code tiering up during the measured runs in some processes).
 */
function cold(commands: () => DataGridCommand[], extra?: Parameters<typeof makeEngine>[1]): number {
  return measure(() => {
    const engine = makeEngine(rows.slice(), extra);
    const list = commands();
    return () => {
      for (const c of list) engine.dispatch(c);
    };
  }, COLD_WARMUPS);
}

/** Warm: keys already extracted for this data version; the query itself changes so the stage re-runs. */
function warm(commands: () => DataGridCommand[], reset: DataGridCommand[], extra?: Parameters<typeof makeEngine>[1]): number {
  const engine = makeEngine(rows, extra);
  for (const c of commands()) engine.dispatch(c);
  const result = measure(() => {
    for (const c of reset) engine.dispatch(c);
    const list = commands();
    return () => {
      for (const c of list) engine.dispatch(c);
    };
  });
  engine.dispose();
  return result;
}

const report: { scenario: string; reference: number; cold: number; warm: number }[] = [];

/**
 * Asserts the gate on the cold median. A failing timing is re-measured once
 * (flaky timing checks are retried once).
 */
function gate(scenario: string, reference: number, coldRun: () => number, warmRun: () => number, absolute?: number): void {
  const limit = absolute ?? reference * 0.5;
  const ok = (c: number, w: number) => (absolute !== undefined ? c < absolute && w < absolute : c <= limit);
  let coldMs = coldRun();
  let warmMs = warmRun();
  if (!ok(coldMs, warmMs)) {
    console.log(`[perf] ${scenario}: retrying once (cold ${coldMs.toFixed(2)}ms, warm ${warmMs.toFixed(2)}ms)`);
    coldMs = coldRun();
    warmMs = warmRun();
  }
  report.push({ scenario, reference, cold: coldMs, warm: warmMs });
  console.log(
    `[perf] ${scenario}: reference=${reference}ms cold=${coldMs.toFixed(2)}ms warm=${warmMs.toFixed(2)}ms ratio=${(coldMs / reference).toFixed(3)}`,
  );
  if (absolute !== undefined) {
    assertBudget(coldMs, absolute, `${scenario} (cold)`, { strict: true });
    assertBudget(warmMs, absolute, `${scenario} (warm)`, { strict: true });
  } else {
    assertBudget(coldMs, limit, `${scenario} (cold, 0.5 x reference median)`);
  }
}

function assertSorted(model: RowModelSnapshot<WideRow>, field: string): void {
  const order = model.order as Int32Array;
  for (let i = 1; i < order.length; i++) {
    const a = model.source[order[i - 1] as number]?.[field] as number;
    const b = model.source[order[i] as number]?.[field] as number;
    assert.ok(a < b || (a === b && (order[i - 1] as number) < (order[i] as number)), `not stably sorted at ${i}`);
  }
}

describe('query pipeline vs reference medians (100k x 100)', () => {
  it('sort number column (n0)', () => {
    const cmds = () => [sortSet([{ columnId: 'n0', direction: 'asc' }])];
    gate('sort number column', REFERENCE.sortNumber, () => cold(cmds), () => warm(cmds, [{ type: 'sort.clear' }]));
    const engine = makeEngine(rows);
    engine.dispatch(cmds()[0] as DataGridCommand);
    assertSorted(engine.getSnapshot().rows, 'n0');
    engine.dispose();
  });

  it('sort string column (s0)', () => {
    const cmds = () => [sortSet([{ columnId: 's0', direction: 'asc' }])];
    gate('sort string column', REFERENCE.sortString, () => cold(cmds), () => warm(cmds, [{ type: 'sort.clear' }]));
  });

  it('multi-sort 3 columns (s0, n0, d0)', () => {
    const cmds = () => [
      sortSet([
        { columnId: 's0', direction: 'asc' },
        { columnId: 'n0', direction: 'asc' },
        { columnId: 'd0', direction: 'asc' },
      ]),
    ];
    gate('multi-sort 3 columns', REFERENCE.multiSort, () => cold(cmds), () => warm(cmds, [{ type: 'sort.clear' }]));
  });

  it("contains filter (s0 'word-1')", () => {
    const cmds = () => [contains('word-1')];
    gate('contains filter (string)', REFERENCE.contains, () => cold(cmds), () => warm(cmds, [{ type: 'filter.clear' }]));
    const engine = makeEngine(rows);
    engine.dispatch(contains('word-1'));
    const expected = rows.filter((r) => (r['s0'] as string).includes('word-1')).length;
    assert.equal(engine.getSnapshot().rows.count, expected);
    engine.dispose();
  });

  it('three combined filters (two string columns, one number) stay within 200 ms', () => {
    const budget = 200;
    const cmds = (): DataGridCommand[] => [
      contains('word-1'),
      { type: 'filter.byColumn', columnId: 'n0', operator: 'greaterThan', value: 25_000 },
      { type: 'filter.byColumn', columnId: 's1', operator: 'contains', value: 'word-2' },
    ];
    let coldMs = cold(cmds);
    let warmMs = warm(cmds, [{ type: 'filter.clear' }]);
    if (coldMs > budget || warmMs > budget) {
      console.log(`[perf] three combined filters: retrying once (cold ${coldMs.toFixed(2)}ms, warm ${warmMs.toFixed(2)}ms)`);
      coldMs = cold(cmds);
      warmMs = warm(cmds, [{ type: 'filter.clear' }]);
    }
    console.log(`[perf] three combined filters: budget=${budget}ms cold=${coldMs.toFixed(2)}ms warm=${warmMs.toFixed(2)}ms`);
    assertBudget(coldMs, budget, 'three combined filters (cold)');
    assertBudget(warmMs, budget, 'three combined filters (warm)');
    const engine = makeEngine(rows);
    for (const cmd of cmds()) engine.dispatch(cmd);
    const expected = rows.filter((r) => (r['s0'] as string).includes('word-1') && (r['n0'] as number) > 25_000 && (r['s1'] as string).includes('word-2')).length;
    assert.ok(expected > 0);
    assert.equal(engine.getSnapshot().rows.count, expected);
    engine.dispose();
  });

  it("typing 'word-12' char by char into a contains filter (7 queries)", () => {
    const text = 'word-12';
    const cmds = () => Array.from({ length: text.length }, (_, i) => contains(text.slice(0, i + 1)));
    gate('type filter char by char', REFERENCE.typing, () => cold(cmds), () => warm(cmds, [{ type: 'filter.clear' }]));
    const engine = makeEngine(rows);
    for (const cmd of cmds()) engine.dispatch(cmd);
    assert.equal(engine.getSnapshot().rows.count, rows.filter((r) => (r['s0'] as string).includes(text)).length);
    engine.dispose();
  });

  it("global search 'word-12' across s0..s39", () => {
    const cmds = (): DataGridCommand[] => [{ type: 'search.set', text: 'word-12', columnIds: SEARCH_COLUMNS }];
    gate('global search 40 string columns', REFERENCE.search, () => cold(cmds), () => warm(cmds, [{ type: 'search.clear' }]));
    const engine = makeEngine(rows);
    engine.dispatch(cmds()[0] as DataGridCommand);
    const expected = rows.filter((r) => SEARCH_COLUMNS.some((f) => (r[f] as string).includes('word-12'))).length;
    assert.equal(engine.getSnapshot().rows.count, expected);
    engine.dispose();
  });

  it('page change (sorted by n0, page 50, size 20)', () => {
    const extra = { paging: { pageSize: 20 }, defaultQuery: { sorting: [{ columnId: 'n0', direction: 'asc' as const }] } };
    const goTo: DataGridCommand = { type: 'paging.goToPage', page: 50 };
    const run = (data: readonly WideRow[]): number =>
      measure(() => {
        const engine = makeEngine(data, extra);
        engine.getSnapshot();
        return () => {
          engine.dispatch(goTo);
        };
      });
    gate('page change (sorted, page 50 of 20)', REFERENCE.pageChange, () => run(rows.slice()), () => run(rows), 1);
    const engine = makeEngine(rows, extra);
    engine.dispatch(goTo);
    const snap = engine.getSnapshot();
    assert.equal(snap.rows.count, 20);
    assert.deepEqual((engine as unknown as { paging: { getInfo(): { page: number; totalRowCount: number } } }).paging.getInfo().page, 50);
    engine.dispose();
  });

  it('re-apply unchanged sort + filter', () => {
    const cmds = (): DataGridCommand[] => [contains('word-1'), sortSet([{ columnId: 'n0', direction: 'asc' }])];
    const run = (data: readonly WideRow[]): number =>
      measure(() => {
        const engine = makeEngine(data);
        for (const c of cmds()) engine.dispatch(c);
        engine.getSnapshot();
        const list = cmds();
        return () => {
          engine.batch(() => {
            for (const c of list) engine.dispatch(c);
          });
        };
      });
    gate('re-apply unchanged sort+filter', REFERENCE.reapply, () => run(rows.slice()), () => run(rows), 1);
  });

  it('prints the comparison table', () => {
    console.log('[perf] scenario | reference | Salmon UI cold | Salmon UI warm | cold/reference');
    for (const r of report) {
      console.log(`[perf] ${r.scenario} | ${r.reference} | ${r.cold.toFixed(2)} | ${r.warm.toFixed(2)} | ${(r.cold / r.reference).toFixed(3)}`);
    }
  });
});

const WORDS = Array.from({ length: 256 }, (_, i) => `word-${i}`);

/** Engine over a live local source with sort (n0), contains filter (s0), and the 40-column search applied. */
function makeLiveEngine(data: readonly WideRow[] | LocalDataSource<WideRow>) {
  const engine = createDataGridEngine<WideRow, readonly DataGridModule<WideRow, any, any, string>[]>({
    getRowId: (r) => r.id,
    columns,
    dataSource: data,
    dev: false,
    instrument: true,
    modules: modulesFor(true),
    paging: { pageSize: 50 },
  });
  engine.dispatch(sortSet([{ columnId: 'n0', direction: 'asc' }]));
  engine.dispatch(contains('word-1'));
  engine.dispatch({ type: 'search.set', text: 'word-12', columnIds: SEARCH_COLUMNS });
  engine.getSnapshot();
  return engine;
}

// Incremental data updates (a single row update via a data source patch
// stays <= 2 ms) with sort (n0), a contains filter (s0), and the
// 40-column search active. Runs after the query gates in this file so the two
// never compete for the machine.
describe('incremental updates with sort + filter + search active (100k x 100)', () => {
  let source: LocalDataSource<WideRow>;
  let engine: ReturnType<typeof makeLiveEngine>;
  // A viewport's worth of row and cell subscribers, as a renderer would hold.
  let rowNotifications = 0;
  let cellNotifications = 0;
  const watched: string[] = [];
  before(() => {
    source = createLocalDataSource<WideRow>(rows.slice(), { getRowId: (r) => r.id });
    engine = makeLiveEngine(source);
    for (let i = 0; i < 50; i++) watched.push(engine.getRowIdAt(i) as string);
    for (const id of watched) {
      engine.getRowSnapshot(id);
      engine.subscribeRow(id, () => {
        rowNotifications++;
        engine.getRowSnapshot(id);
      });
      for (const col of ['s0', 'n0', 's5']) {
        engine.getCellSnapshot(id, col);
        engine.subscribeCell(id, col, () => {
          cellNotifications++;
          engine.getCellSnapshot(id, col);
        });
      }
    }
  });

  let seq = 0;
  const pick = (): WideRow => {
    const current = source.getRows();
    seq++;
    return current[(seq * 104729) % current.length] as WideRow;
  };
  const changed = (row: WideRow): WideRow => ({ ...row, n0: (seq * 7919) % 100000, s0: WORDS[(seq * 31) & 255] as string, s5: WORDS[(seq * 17) & 255] as string });

  const updateReport: { scenario: string; ms: number; budget: number }[] = [];
  function gate(scenario: string, budget: number, run: () => number): void {
    const before = engine.getInstrumentation()?.stageUpdates ?? {};
    let ms = run();
    if (ms > budget) {
      console.log(`[perf] ${scenario}: retrying once (${ms.toFixed(3)}ms)`);
      ms = run();
    }
    const after = engine.getInstrumentation()?.stageUpdates ?? {};
    updateReport.push({ scenario, ms, budget });
    console.log(`[perf] ${scenario}: median=${ms.toFixed(3)}ms budget=${budget}ms load=${os.loadavg()[0]?.toFixed(2)}`);
    for (const stage of ['search', 'filter', 'sort']) {
      assert.ok((after[stage] ?? 0) > (before[stage] ?? 0), `${scenario}: ${stage} stage did not take the incremental path`);
    }
    assertBudget(ms, budget, scenario);
  }

  it('patch 1 row', () => {
    gate('patch 1 row', 2, () =>
      measure(() => {
        const row = changed(pick());
        return () => source.patch({ upsert: [row] });
      }),
    );
  });

  it('patch 100 rows', () => {
    gate('patch 100 rows', 10, () =>
      measure(() => {
        const byId = new Map<string, WideRow>();
        while (byId.size < 100) {
          const row = changed(pick());
          byId.set(row.id, row);
        }
        const list = [...byId.values()];
        return () => source.patch({ upsert: list });
      }),
    );
  });

  it('insert 1 row', () => {
    gate('insert 1 row', 2, () =>
      measure(() => {
        const row = { ...changed(pick()), id: `new${seq}` };
        return () => source.patch({ append: [row] });
      }),
    );
  });

  it('remove 1 row', () => {
    gate('remove 1 row', 2, () =>
      measure(() => {
        const id = pick().id;
        return () => source.patch({ remove: [id] });
      }),
    );
  });

  it('setRows with 1 changed row', () => {
    gate('setRows 1 changed row', 2, () =>
      measure(() => {
        const list = source.getRows().slice();
        const at = (seq * 104729) % list.length;
        list[at] = changed(list[at] as WideRow);
        return () => source.setRows(list);
      }),
    );
  });

  it('matches a full recompute and notifies narrowly', () => {
    const oracle = makeLiveEngine(source.getRows().slice());
    const a = engine.getSnapshot().rows;
    const b = oracle.getSnapshot().rows;
    assert.equal(a.count, b.count);
    for (let i = 0; i < a.count; i++) assert.equal(engine.getRowIdAt(i), oracle.getRowIdAt(i));
    assert.deepEqual(
      (engine as unknown as { paging: { getInfo(): unknown } }).paging.getInfo(),
      (oracle as unknown as { paging: { getInfo(): unknown } }).paging.getInfo(),
    );
    oracle.dispose();

    // A change to a row outside the first page reaches no viewport subscriber.
    rowNotifications = 0;
    cellNotifications = 0;
    const outside = source.getRows().find((r) => !watched.includes(r.id)) as WideRow;
    source.patch({ upsert: [{ ...outside, n5: -1 }] });
    assert.equal(rowNotifications, 0);
    assert.equal(cellNotifications, 0);
    // A change to a watched row's non-key cell reaches that row and its cells only.
    const target = source.getRows().find((r) => r.id === watched[3]) as WideRow;
    source.patch({ upsert: [{ ...target, n5: -2 }] });
    assert.equal(rowNotifications, 1);
    assert.equal(cellNotifications, 3);
  });

  it('prints the table', () => {
    console.log(`[perf] scenario | median ms | budget ms (load average ${os.loadavg().map((l) => l.toFixed(2)).join(' ')})`);
    for (const r of updateReport) console.log(`[perf] ${r.scenario} | ${r.ms.toFixed(3)} | ${r.budget}`);
    engine.dispose();
  });
});
