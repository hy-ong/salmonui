// Detail, row drag and child grid gates on the `large` fixture (100k x
// 100): detail expansion, sparse row metrics, row drag pointer moves and
// reorder drops, and child grid indexing. Same method as grouping-performance.test.ts (one warm-up, median
// of 5 or of a batch for per-call costs, gc between runs, one retry on a
// failing timing).
import assert from 'node:assert/strict';
import os from 'node:os';
import { describe, it } from 'node:test';
import { assertBudget } from '../../../../tooling/bench/budget.mjs';
import {
  createFilterModule,
  createDataGridEngine,
  createGroupingModule,
  createLocalDataSource,
  createPagingModule,
  createSortModule,
  type DataSource,
  type LocalDataSource,
  type RowDragDropState,
} from '@salmonui/data-grid/engine';
import { createDetailModule, createSparseRowMetrics } from '@salmonui/data-grid/engine/expansion';
import { childRowsOf, createHierarchyModule } from '@salmonui/data-grid/engine/hierarchy';
import { createRowDragDropModule } from '@salmonui/data-grid/engine/row-drag-drop';
import { wideFixture, type WideRow } from './fixtures.ts';

const ROWS = 100_000;
const RUNS = 5;
// Reorder windows vary with the random target: a larger sample for a stable median.
const DROP_RUNS = 9;
const gc = (globalThis as { gc?: () => void }).gc;
const { rows, columns } = wideFixture(ROWS);

const BUDGET = {
  toggle: 1,
  expandAll: 50,
  collapseAll: 5,
  page: 1,
  patch: 2,
  groupedToggle: 1,
  sparseBuild: 2,
  sparseLookupUs: 2,
  overUs: 20,
  drop: 5,
  dropSorted: 8,
  dropGrouped: 5,
  childIndex: 30,
  descriptorUs: 50,
} as const;

function makeEngine(data: readonly WideRow[] | DataSource<WideRow>, paging = false, rowDragDrop: { orderField?: string } = {}) {
  const modules = [
    createFilterModule<WideRow>(),
    createSortModule<WideRow>(),
    createGroupingModule<WideRow>(),
    createDetailModule<WideRow>(),
    createHierarchyModule<WideRow>(),
    createRowDragDropModule<WideRow>(),
    createPagingModule<WideRow>(),
  ] as const;
  return createDataGridEngine<WideRow, typeof modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: data,
    dev: false,
    instrument: true,
    modules,
    paging: { enabled: paging, pageSize: 50 },
    hierarchy: { childGrid: { relationField: 's1', data: rows, getRowId: (r: WideRow) => r.id } },
    rowDragDrop,
  });
}

const sortFilter = (engine: ReturnType<typeof makeEngine>): void => {
  engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n0', direction: 'asc' }] });
  engine.dispatch({ type: 'filter.byColumn', columnId: 's0', operator: 'contains', value: '1' });
  engine.getSnapshot();
};

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

function gate(scenario: string, budget: number, run: () => number, unit = 'ms'): void {
  let v = run();
  if (v > budget) {
    console.log(`[perf] ${scenario}: retrying once (${v.toFixed(3)}${unit})`);
    v = run();
  }
  console.log(`[perf] ${scenario}: median=${v.toFixed(3)}${unit} budget=${budget}${unit} load=${os.loadavg()[0]?.toFixed(2)}`);
  assertBudget(v, budget, scenario, { unit });
}

/** Visible data row ids (first `n`). */
function firstIds(engine: ReturnType<typeof makeEngine>, n: number): string[] {
  const out: string[] = [];
  const count = engine.getSnapshot().rows.count;
  for (let i = 0; i < count && out.length < n; i++) {
    const id = engine.getRowIdAt(i) as string;
    if (!id.startsWith('__')) out.push(id);
  }
  return out;
}

describe('detail rows (100k x 100, sorted + filtered)', () => {
  const engine = makeEngine(rows);
  sortFilter(engine);
  const ids = firstIds(engine, 200);

  it('expand or collapse one detail row', () => {
    let k = 0;
    gate('detail toggle one row', BUDGET.toggle, () =>
      measure(() => {
        const id = ids[k++ % ids.length] as string;
        return () => {
          engine.dispatch({ type: 'detail.toggle', rowId: id });
          engine.getSnapshot();
          engine.getRowIndex(id);
        };
      }),
    );
    engine.dispatch({ type: 'detail.collapseAll' });
  });

  it('expand all and collapse all', () => {
    gate('detail expand all', BUDGET.expandAll, () =>
      measure(() => {
        engine.dispatch({ type: 'detail.collapseAll' });
        engine.getSnapshot();
        return () => {
          engine.dispatch({ type: 'detail.expandAll' });
          engine.getSnapshot();
        };
      }),
    );
    assert.ok(engine.getSnapshot().rows.count > engine.getSnapshot().rows.view!.dataCount);
    gate('detail collapse all', BUDGET.collapseAll, () =>
      measure(() => {
        engine.dispatch({ type: 'detail.expandAll' });
        engine.getSnapshot();
        return () => {
          engine.dispatch({ type: 'detail.collapseAll' });
          engine.getSnapshot();
        };
      }),
    );
  });

  it('page change with 100 expanded details', () => {
    const paged = makeEngine(rows, true);
    sortFilter(paged);
    const all = firstIds(paged, 50);
    paged.dispatch({ type: 'paging.setPageSize', pageSize: 1000 });
    const many = firstIds(paged, 1000);
    paged.dispatch({ type: 'paging.setPageSize', pageSize: 50 });
    for (let i = 0; i < 100; i++) paged.dispatch({ type: 'detail.expand', rowId: many[i * 10] as string });
    void all;
    let page = 1;
    gate('page change with 100 details', BUDGET.page, () =>
      measure(() => {
        page = page === 1 ? 2 : 1;
        const target = page;
        return () => {
          paged.dispatch({ type: 'paging.goToPage', page: target });
          paged.getSnapshot();
        };
      }),
    );
    paged.dispose();
  });

  it('one-row patch with 100 expanded details', () => {
    const source: LocalDataSource<WideRow> = createLocalDataSource(rows.slice(), { getRowId: (r) => r.id });
    const patched = makeEngine(source);
    sortFilter(patched);
    const list = firstIds(patched, 1000);
    for (let i = 0; i < 100; i++) patched.dispatch({ type: 'detail.expand', rowId: list[i * 10] as string });
    patched.getSnapshot();
    let k = 0;
    gate('one-row patch with 100 details', BUDGET.patch, () =>
      measure(() => {
        const row = source.getRows()[(k++ * 7919) % ROWS] as WideRow;
        const next = { ...row, n1: (row.n1 as number) + 1 };
        return () => {
          source.patch({ upsert: [next] });
          patched.getSnapshot();
        };
      }),
    );
    patched.dispose();
  });

  it('expand one detail inside a grouped grid', () => {
    const grouped = makeEngine(rows);
    grouped.dispatch({ type: 'grouping.groupBy', columnId: 's0' });
    grouped.getSnapshot();
    const list = firstIds(grouped, 200);
    let k = 0;
    gate('grouped detail toggle', BUDGET.groupedToggle, () =>
      measure(() => {
        const id = list[k++ % list.length] as string;
        return () => {
          grouped.dispatch({ type: 'detail.toggle', rowId: id });
          grouped.getSnapshot();
          grouped.grouping.getGroup(grouped.getRowSnapshot(id)?.parentId as string);
        };
      }),
    );
    grouped.dispose();
  });
});

describe('sparse row metrics', () => {
  it('builds with 10,000 detail rows and answers lookups in O(log^2 k)', () => {
    const k = 10_000;
    const count = ROWS + k;
    const at = new Int32Array(k);
    for (let j = 0; j < k; j++) at[j] = j * 10 + j + 1;
    const rowsOf = { detailCount: k, detailIndex: (j: number) => at[j] as number };
    gate('sparse metrics build (10k details)', BUDGET.sparseBuild, () => measure(() => () => void createSparseRowMetrics(count, 36, rowsOf, () => 150)));
    const metrics = createSparseRowMetrics(count, 36, rowsOf, () => 150);
    gate(
      'sparse metrics indexAt + offsetOf',
      BUDGET.sparseLookupUs,
      () =>
        measure(() => () => {
          let sink = 0;
          for (let i = 0; i < 10_000; i++) sink += metrics.offsetOf(metrics.indexAt((i * 7919) % metrics.totalHeight));
          if (sink < 0) throw new Error('unreachable');
        }) / 10,
      'us',
    );
  });
});

describe('row drag and drop (100k)', () => {
  it('pointer moves cost microseconds and never replace the grid snapshot', () => {
    const engine = makeEngine(rows);
    engine.getSnapshot();
    engine.dispatch({ type: 'rowDragDrop.start', rowId: 'r10' });
    const before = engine.getInstrumentation()?.snapshots ?? 0;
    const version = engine.getSnapshot().version;
    gate(
      'rowDragDrop.over per command',
      BUDGET.overUs,
      () =>
        measure(() => () => {
          for (let i = 0; i < 1000; i++) engine.dispatch({ type: 'rowDragDrop.over', index: (i * 37) % ROWS, fraction: (i % 10) / 10 });
        }),
      'us',
    );
    assert.equal(engine.getSnapshot().version, version);
    assert.equal((engine.getInstrumentation()?.snapshots ?? 0) - before, 0, 'no grid snapshot replacement during a drag');
    engine.dispose();
  });

  it('a one-row reorder drop settles within the budget (unsorted local grid)', () => {
    const source: LocalDataSource<WideRow> = createLocalDataSource(rows.slice(), { getRowId: (r) => r.id });
    const engine = makeEngine(source);
    engine.getSnapshot();
    let k = 0;
    gate('reorder drop one row', BUDGET.drop, () =>
      measure(() => {
        const from = `r${(k * 7919) % ROWS}`;
        const index = (k++ * 104729) % ROWS;
        engine.dispatch({ type: 'rowDragDrop.start', rowId: from });
        engine.dispatch({ type: 'rowDragDrop.over', index, fraction: 0.2 });
        return () => {
          engine.dispatch({ type: 'rowDragDrop.drop' });
          engine.getSnapshot();
        };
      }, DROP_RUNS),
    );
    gate('reorder one row (rowDragDrop.reorder)', BUDGET.drop, () =>
      measure(() => {
        const from = (k * 7919) % ROWS;
        const to = (k++ * 104729) % (ROWS - 1);
        return () => {
          engine.dispatch({ type: 'rowDragDrop.reorder', fromIndexes: [from], toIndex: to });
          engine.getSnapshot();
        };
      }, DROP_RUNS),
    );
    // The local move is a row delta: the engine never recomputes every id.
    const list = source.getRows();
    for (let i = 0; i < ROWS; i += 997) assert.equal(engine.getRowIndex((list[i] as WideRow).id), i);
    engine.dispose();
  });

  it('a one-row reorder drop with an orderField sort and a filter active', () => {
    const source: LocalDataSource<WideRow> = createLocalDataSource(rows.slice(), { getRowId: (r) => r.id });
    const engine = makeEngine(source, false, { orderField: 'n0' });
    sortFilter(engine);
    let k = 0;
    gate('reorder drop one row (orderField sort + filter)', BUDGET.dropSorted, () =>
      measure(() => {
        const count = engine.getSnapshot().rows.count;
        const at = (k * 7919) % count;
        const t = (k++ * 104729) % (count - 1);
        const index = t >= at ? t + 1 : t; // never the dragged row itself
        engine.dispatch({ type: 'rowDragDrop.start', rowId: engine.getRowIdAt(at) as string });
        engine.dispatch({ type: 'rowDragDrop.over', index, fraction: 0.2 });
        return () => {
          engine.dispatch({ type: 'rowDragDrop.drop' });
          engine.getSnapshot();
        };
      }, DROP_RUNS),
    );
    assert.notEqual(engine.getModuleState<RowDragDropState>('rowDragDrop')?.lastDrop?.status, 'invalid', 'the measured drops are valid');
    engine.dispose();
  });

  it('a one-row reorder drop inside a group', () => {
    const source: LocalDataSource<WideRow> = createLocalDataSource(rows.slice(), { getRowId: (r) => r.id });
    const engine = makeEngine(source);
    engine.dispatch({ type: 'grouping.groupBy', columnId: 's0' });
    engine.getSnapshot();
    let k = 0;
    gate('reorder drop one row (grouped)', BUDGET.dropGrouped, () =>
      measure(() => {
        const count = engine.getSnapshot().rows.count;
        let at = (k++ * 7919) % (count - 4);
        while ((engine.getRowIdAt(at) as string).startsWith('__') || (engine.getRowIdAt(at + 3) as string).startsWith('__')) at++;
        engine.dispatch({ type: 'rowDragDrop.start', rowId: engine.getRowIdAt(at) as string });
        engine.dispatch({ type: 'rowDragDrop.over', index: at + 3, fraction: 0.7 });
        return () => {
          engine.dispatch({ type: 'rowDragDrop.drop' });
          engine.getSnapshot();
        };
      }, DROP_RUNS),
    );
    engine.dispose();
  });
});

describe('child grids (100k child rows)', () => {
  it('indexes the child array once and resolves descriptors in microseconds', () => {
    gate('child row index (100k)', BUDGET.childIndex, () =>
      measure(() => {
        const copy = rows.slice();
        return () => void childRowsOf(copy, 's1', 'word-1');
      }),
    );
    const engine = makeEngine(rows);
    engine.dispatch({ type: 'detail.expandAll' });
    childRowsOf(rows, 's1', 'word-1');
    const ids = firstIds(engine, 1000);
    gate(
      'child grid descriptor',
      BUDGET.descriptorUs,
      () =>
        measure(() => {
          // Fresh parent rows each run (descriptors are cached per row object).
          const fresh = makeEngine(rows);
          fresh.dispatch({ type: 'detail.expandAll' });
          fresh.getSnapshot();
          return () => {
            for (const id of ids) fresh.hierarchy.getChildGrid(id);
          };
        }) / (ids.length / 1000),
      'us',
    );
    engine.dispose();
  });
});
