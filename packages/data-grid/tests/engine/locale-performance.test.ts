// Locale switch gates:
// `engine.setLocale` on the `large` fixture (100k x 100). Same method as
// lookup-performance.test.ts: one warm-up, median of 5, gc between runs, one
// retry on a failing timing.
import assert from 'node:assert/strict';
import os from 'node:os';
import { describe, it } from 'node:test';
import { assertBudget } from '../../../../tooling/bench/budget.mjs';
import { createFilterModule, createDataGridEngine, createSortModule } from '@salmonui/data-grid/engine';
import { wideFixture, type WideRow } from './fixtures.ts';

const ROWS = 100_000;
const RUNS = 5;
const gc = (globalThis as { gc?: () => void }).gc;
const { rows, columns } = wideFixture(ROWS);
const BUDGET = { plain: 5, sorted: 20 } as const;
const LOCALES = ['de-DE', 'fr-FR', 'en-US', 'ja-JP', 'es-ES', 'it-IT', 'nl-NL'];

function makeEngine() {
  return createDataGridEngine({
    getRowId: (r: WideRow) => r.id,
    columns,
    dataSource: rows,
    dev: false,
    instrument: true,
    modules: [createSortModule<WideRow>(), createFilterModule<WideRow>()],
  });
}

function median(times: number[]): number {
  const sorted = [...times].sort((a, b) => a - b);
  return sorted[sorted.length >> 1] as number;
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

function switches(engine: ReturnType<typeof makeEngine>): number {
  let i = 0;
  const next = () => {
    engine.setLocale({ locale: LOCALES[i++ % LOCALES.length] as string });
    engine.getSnapshot();
    engine.getCellSnapshot(engine.getRowIdAt(0) as string, 'n0');
  };
  next();
  const times: number[] = [];
  for (let r = 0; r < RUNS; r++) {
    gc?.();
    const t = performance.now();
    next();
    times.push(performance.now() - t);
  }
  return median(times);
}

describe('locale switch (100k x 100)', () => {
  it('recompiles formatters without re-reading rows', () => {
    const engine = makeEngine();
    engine.getSnapshot();
    gate('setLocale, no query', BUDGET.plain, () => switches(engine));
    assert.equal(engine.getInstrumentation()?.dataReads, 1, 'rows are never re-read');
    engine.dispose();
  });

  it('re-sorts a string sort under the new collation within the sort budget', () => {
    const engine = makeEngine();
    engine.dispatch({ type: 'sort.set', sorting: [{ columnId: 's0', direction: 'asc' }] });
    engine.dispatch({ type: 'filter.byColumn', columnId: 's1', operator: 'contains', value: 'word-1' });
    engine.getSnapshot();
    gate('setLocale with a string sort and a contains filter', BUDGET.sorted, () => switches(engine));
    engine.dispose();
  });
});
