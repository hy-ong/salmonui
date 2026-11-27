// CSV export gate: the `large`
// fixture (100k x 100) streamed through `streamCsv` finishes within 2 s,
// never blocks the main thread longer than 50 ms per chunk, and keeps the
// peak heap delta at or below 150 MB while chunks are consumed (the consumer
// discards them, as a `WritableStream` sink would). Building the export
// model itself is part of the measured time. One retry on a failing timing,
// as in the other performance suites.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertBudget } from '../../../../tooling/bench/budget.mjs';
import { createDataGridEngine, createSortModule, type DataGridModule } from '@salmonui/data-grid/engine';
import { createExportModel, createExportModule, streamCsv } from '@salmonui/data-grid/engine/export';
import { wideFixture, type WideRow } from './fixtures.ts';

const ROWS = 100_000;
const BUDGET = { totalMs: 2000, chunkMs: 50, heapMb: 150 } as const;
const gc = (globalThis as { gc?: () => void }).gc;
const { rows, columns } = wideFixture(ROWS);

type Modules = readonly DataGridModule<WideRow, any, any, string>[];

interface Run {
  readonly totalMs: number;
  readonly maxChunkMs: number;
  readonly peakHeapMb: number;
  readonly bytes: number;
  readonly chunks: number;
}

async function run(): Promise<Run> {
  const engine = createDataGridEngine<WideRow, Modules>({
    getRowId: (r) => r.id,
    columns,
    dataSource: rows,
    dev: false,
    timeZone: 'UTC',
    modules: [createSortModule<WideRow>(), createExportModule<WideRow>()],
  });
  engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 'n0', direction: 'asc' }] });
  engine.getSnapshot();
  gc?.();
  const heap0 = process.memoryUsage().heapUsed;
  let peak = heap0;
  let maxChunk = 0;
  let bytes = 0;
  let chunks = 0;
  const t0 = performance.now();
  const model = createExportModel(engine);
  const it = streamCsv(model, { sliceMs: 25 });
  let last = performance.now();
  // Chunk time is measured from the resumption after a yield to the chunk's delivery.
  const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
  for (;;) {
    const before = performance.now();
    const next = await it.next();
    const after = performance.now();
    if (next.done) break;
    maxChunk = Math.max(maxChunk, after - Math.max(before, last));
    bytes += next.value.length;
    chunks++;
    const heap = process.memoryUsage().heapUsed;
    if (heap > peak) peak = heap;
    await pause();
    last = performance.now();
  }
  const totalMs = performance.now() - t0;
  engine.dispose();
  return { totalMs, maxChunkMs: maxChunk, peakHeapMb: (peak - heap0) / 1024 / 1024, bytes, chunks };
}

describe('CSV export performance (large, 100k x 100)', () => {
  it(`streams within ${BUDGET.totalMs} ms, <= ${BUDGET.chunkMs} ms per chunk, <= ${BUDGET.heapMb} MB heap delta`, async () => {
    await run(); // warm-up
    let result = await run();
    if (result.totalMs > BUDGET.totalMs || result.maxChunkMs > BUDGET.chunkMs) result = await run();
    console.log(
      `csv large: total ${result.totalMs.toFixed(0)} ms, max chunk ${result.maxChunkMs.toFixed(1)} ms, peak heap delta ${result.peakHeapMb.toFixed(1)} MB, ${result.chunks} chunks, ${(result.bytes / 1024 / 1024).toFixed(1)} MB text`,
    );
    assert.ok(result.bytes > ROWS * 100, 'every cell is written');
    assertBudget(result.totalMs, BUDGET.totalMs, 'csv large total');
    assertBudget(result.maxChunkMs, BUDGET.chunkMs, 'csv large max chunk');
    assert.ok(result.peakHeapMb <= BUDGET.heapMb, `heap delta ${result.peakHeapMb.toFixed(1)} MB > ${BUDGET.heapMb} MB`);
  });
});
