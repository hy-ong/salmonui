import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertBudget } from '../../../../tooling/bench/budget.mjs';
import { createDataGridEngine, type ColumnDef } from '@salmonui/data-grid/engine';
import { wideFixture, type WideRow } from './fixtures.ts';

const ROWS = 100_000;
const gc = (globalThis as { gc?: () => void }).gc;

function heapUsed(): number {
  gc?.();
  gc?.();
  return process.memoryUsage().heapUsed;
}

describe('100k x 100 smoke (`large` fixture)', () => {
  const { rows, columns } = wideFixture(ROWS);
  let accessorCalls = 0;
  // Counting accessors prove no per-cell work happens at creation.
  const counted: ColumnDef<WideRow>[] = columns.map((c) => {
    const field = c.field as string;
    return {
      ...c,
      id: field,
      valueGetter: (row) => {
        accessorCalls++;
        return row[field];
      },
    };
  });
  const declaredTypes: ColumnDef<WideRow>[] = columns.map((c) => ({ ...c, type: (c.field as string).startsWith('n') ? 'number' : 'string' }));

  it('creates the engine and reads a viewport without O(cells) work', () => {
    // Warm-up so the timing reflects steady-state JIT rather than first parse.
    createDataGridEngine<WideRow>({ getRowId: (r) => r.id, columns: declaredTypes, dataSource: rows.slice(0, 1000), dev: false }).dispose();

    const heapBefore = heapUsed();
    const t0 = performance.now();
    const engine = createDataGridEngine<WideRow>({
      getRowId: (r) => r.id,
      columns: counted,
      dataSource: rows,
      dev: false,
      instrument: true,
    });
    const snapshot = engine.getSnapshot();
    const t1 = performance.now();

    const vp = snapshot.viewport;
    const visible = snapshot.columns.center.slice(vp.columns.start, vp.columns.end);
    let chars = 0;
    for (let i = vp.rows.start; i < vp.rows.end; i++) {
      const rowId = engine.getRowIdAt(i) as string;
      for (const col of visible) chars += engine.getCellSnapshot(rowId, col.columnId)?.formattedValue.length ?? 0;
    }
    const t2 = performance.now();
    const heapAfter = heapUsed();

    const creationMs = t1 - t0;
    const viewportMs = t2 - t1;
    const heapDeltaMb = (heapAfter - heapBefore) / 1024 / 1024;
    const counters = engine.getInstrumentation();
    console.log(
      `[perf] rows=${ROWS} cols=${columns.length} create=${creationMs.toFixed(2)}ms ` +
        `firstViewport=${viewportMs.toFixed(2)}ms (${vp.rows.end}x${visible.length} cells) ` +
        `heapDelta=${gc ? `${heapDeltaMb.toFixed(2)}MB` : 'n/a (run with --expose-gc)'} accessorCalls=${accessorCalls}`,
    );

    assert.equal(snapshot.rows.count, ROWS);
    assert.equal(counters?.columnCompiles, 1);
    assert.equal(counters?.snapshots, 1);
    // Creation touches at most the type-inference sample, never every cell.
    const cellsVisible = vp.rows.end * visible.length;
    assert.equal(counters?.cellSnapshots, cellsVisible);
    assert.ok(accessorCalls <= columns.length + cellsVisible, `accessor calls ${accessorCalls}`);
    assert.ok(chars > 0);
    assertBudget(creationMs, 50, 'engine creation', { strict: true });
    assertBudget(viewportMs, 10, 'first viewport read', { strict: true });
    // A cell matrix would be >= 10M entries (>80 MB). Ids array + id map are ~10 MB.
    if (gc) assert.ok(heapDeltaMb < 25, `heap delta ${heapDeltaMb.toFixed(2)}MB`);

    // Notifications and reads after creation stay narrow.
    let gridNotifications = 0;
    engine.subscribe(() => gridNotifications++);
    const t3 = performance.now();
    engine.columns.hide({ keys: ['s0'] });
    const t4 = performance.now();
    assert.equal(gridNotifications, 1);
    assert.equal(engine.getInstrumentation()?.columnCompiles, 1);
    assertBudget(t4 - t3, 5, 'hideColumn', { strict: true });
    console.log(`[perf] hideColumn=${(t4 - t3).toFixed(3)}ms`);
    engine.dispose();
  });

  it('a single-row patch is incremental', async () => {
    const { createLocalDataSource } = await import('@salmonui/data-grid/engine');
    const source = createLocalDataSource(rows, { getRowId: (r: WideRow) => r.id });
    const engine = createDataGridEngine<WideRow>({ getRowId: (r) => r.id, columns: declaredTypes, dataSource: source, dev: false, instrument: true });
    let hits = 0;
    engine.getRowSnapshot('r500');
    engine.subscribeRow('r500', () => hits++);
    const target = rows[500] as WideRow;
    source.patch({ upsert: [{ ...target, s1: 'changed' }] }); // builds the source id index once
    const t0 = performance.now();
    source.patch({ upsert: [{ ...target, s1: 'changed again' }] });
    const t1 = performance.now();
    console.log(`[perf] singleRowPatch=${(t1 - t0).toFixed(3)}ms`);
    assert.equal(hits, 2);
    assert.equal(engine.getCellValue('r500', 's1'), 'changed again');
    assertBudget(t1 - t0, 5, 'singleRowPatch', { strict: true });
    engine.dispose();
  });
});
