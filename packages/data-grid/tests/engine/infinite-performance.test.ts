// Infinite scroll performance gates: heap stays bounded with `cache` +
// `maxBlocks` while scrolling through 1,000,000 remote rows (measured after
// forced GC, run with --expose-gc), the viewport report costs microseconds while a read is in
// flight, and reads per scroll distance stay at one per block.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertBudget } from '../../../../tooling/bench/budget.mjs';
import { createDataGridEngine, type ColumnDef, type DataSourceRequest, type DataSourceResult, type DataSource } from '@salmonui/data-grid/engine';
import { createInfiniteScrollModule, type InfiniteScheduler, type InfiniteScrollOptions, type InfiniteScrollState, type InfiniteScrollStats } from '@salmonui/data-grid/engine/infinite';

interface Item {
  readonly id: string;
  readonly n: number;
  readonly name: string;
  readonly city: string;
  readonly amount: number;
}

const TOTAL = 1_000_000;
const CITIES = ['Reims', 'Lyon', 'Bern', 'Graz', 'Porto'];
const columns: ColumnDef<Item>[] = [{ field: 'id', primaryKey: true }, { field: 'n', type: 'number' }, { field: 'name' }, { field: 'city' }, { field: 'amount', type: 'number' }];

/** Rows are generated per read (the server side holds nothing in this process). */
function generated(start: number, end: number): Item[] {
  const out: Item[] = [];
  for (let i = start; i < Math.min(end, TOTAL); i++) out.push({ id: `r${i}`, n: i, name: `Customer ${i} ${'x'.repeat(i % 16)}`, city: CITIES[i % 5] as string, amount: (i * 37) % 1000 });
  return out;
}

interface Facade {
  ensureRange(start: number, end: number): void;
  getStatus(): InfiniteScrollState;
  getStats(): InfiniteScrollStats;
}

function clock(): InfiniteScheduler & { advance(ms: number): void } {
  let now = 0;
  const timers = new Map<number, { at: number; run: () => void }>();
  let seq = 0;
  return {
    now: () => now,
    setTimeout(run, ms) {
      timers.set(++seq, { at: now + ms, run });
      return seq;
    },
    clearTimeout(h) {
      timers.delete(h as number);
    },
    advance(ms) {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at > now) continue;
        timers.delete(id);
        t.run();
      }
    },
  };
}

function engineWith(source: DataSource<Item>, options: InfiniteScrollOptions<Item>, scheduler: InfiniteScheduler) {
  const engine = createDataGridEngine({ getRowId: (r: Item) => r.id, columns, dataSource: source, modules: [createInfiniteScrollModule<Item>({ scheduler, ...options })] });
  return { engine, inf: (engine as unknown as { infiniteScroll: Facade }).infiniteScroll };
}

const syncSource = (): DataSource<Item> & { reads: number } => {
  const s = {
    mode: 'remote' as const,
    reads: 0,
    read(request: DataSourceRequest): DataSourceResult<Item> {
      s.reads++;
      const range = request.range ?? { start: 0, end: 100 };
      return { version: request.version, rows: generated(range.start, range.end), totalRowCount: TOTAL, performed: ['search', 'filter', 'sort', 'page'] };
    },
  };
  return s;
};

const gc = (): void => {
  const run = (globalThis as { gc?: () => void }).gc;
  assert.ok(run, 'run with --expose-gc');
  run();
  run();
};

describe('infinite scroll performance', () => {
  it('heap stays bounded by maxBlocks while scrolling through 1,000,000 rows', async () => {
    const c = clock();
    const source = syncSource();
    const { engine, inf } = engineWith(source, { blockSize: 100, cache: true, maxBlocks: 3, debounceMs: 0, threshold: 20 }, c);
    const scroll = async (from: number, to: number): Promise<void> => {
      for (let top = from; top < to; top += 25) {
        inf.ensureRange(top, top + 30);
        c.advance(1);
        // The renderer reads the window it shows.
        for (let i = top; i < top + 30; i++) engine.getRowIdAt(i);
        if (top % 1000 === 0) await Promise.resolve();
      }
      await new Promise((r) => setTimeout(r, 0));
    };
    await scroll(0, 50_000);
    gc();
    const before = process.memoryUsage().heapUsed;
    await scroll(50_000, 1_000_000);
    gc();
    const after = process.memoryUsage().heapUsed;
    const status = inf.getStatus();
    const growth = (after - before) / 1024 / 1024;
    console.log(`[perf] infinite cache maxBlocks=3: ${source.reads} reads over 1M rows, ${status.loadedRowCount} rows held, heap growth ${growth.toFixed(2)} MB`);
    assert.ok(status.loadedRowCount <= 400, `rows held ${status.loadedRowCount}`);
    assert.ok(growth < 4, `heap grew ${growth.toFixed(2)} MB`);
    assert.ok(source.reads <= Math.ceil(TOTAL / 100) + 3, `reads ${source.reads}`);
  });

  it('without cache the heap grows with the rows loaded (the default), so the bound is the cache', async () => {
    const c = clock();
    const source = syncSource();
    const { inf } = engineWith(source, { blockSize: 100, debounceMs: 0, threshold: 20 }, c);
    gc();
    const before = process.memoryUsage().heapUsed;
    for (let top = 0; top < 200_000; top += 25) {
      inf.ensureRange(top, top + 30);
      c.advance(1);
      if (top % 1000 === 0) await Promise.resolve();
    }
    await new Promise((r) => setTimeout(r, 0));
    gc();
    const growth = (process.memoryUsage().heapUsed - before) / 1024 / 1024;
    console.log(`[perf] infinite without cache: 200k rows held, heap growth ${growth.toFixed(2)} MB`);
    assert.equal(inf.getStatus().loadedRowCount >= 200_000, true);
    assert.ok(growth > 8, 'held rows are reachable');
  });

  it('a viewport report costs microseconds while a read is in flight', () => {
    const c = clock();
    const pending: DataSourceRequest[] = [];
    const source: DataSource<Item> = { mode: 'remote', read: (request) => (pending.push(request), new Promise(() => {})) };
    const { inf } = engineWith(source, { blockSize: 100, debounceMs: 50 }, c);
    // The initial read stays in flight; every report inside its window is coalesced.
    const samples: number[] = [];
    for (let k = 0; k < 400; k++) {
      const t0 = performance.now();
      for (let i = 0; i < 100; i++) inf.ensureRange((k + i) % 250, ((k + i) % 250) + 30);
      samples.push(((performance.now() - t0) / 100) * 1000);
    }
    // And with jumps (a read in flight is aborted, the next one debounced).
    for (let k = 0; k < 200; k++) {
      const t0 = performance.now();
      for (let i = 0; i < 100; i++) inf.ensureRange(1_000 + ((k * 100 + i) * 997) % 900_000, 1_030 + ((k * 100 + i) * 997) % 900_000);
      samples.push(((performance.now() - t0) / 100) * 1000);
    }
    samples.sort((a, b) => a - b);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1] as number;
    console.log(`[perf] infinite ensureRange with a read in flight: p95 ${p95.toFixed(2)} µs per report, ${pending.length} reads issued`);
    assertBudget(p95, 50, 'infinite ensureRange with a read in flight p95', { strict: true, unit: 'us' });
    assert.equal(pending.length, 1, 'no read while the viewport keeps moving (debounced)');
  });

  it('reads per scroll distance: one per block at 2,000 px/s and at a fling', async () => {
    for (const rowsPerFrame of [2, 15, 60]) {
      const c = clock();
      const source = syncSource();
      const { inf } = engineWith(source, { blockSize: 100, cache: true, maxBlocks: 6 }, c);
      const distance = 100_000;
      for (let top = 0; top < distance; top += rowsPerFrame) {
        inf.ensureRange(top, top + 30);
        c.advance(16);
        if (top % 500 < rowsPerFrame) await Promise.resolve();
      }
      const reads = source.reads - 1;
      console.log(`[perf] infinite reads over ${distance} rows at ${rowsPerFrame} rows/frame: ${reads}`);
      assert.ok(reads <= distance / 100 + 2, `${reads} reads`);
    }
  });
});
