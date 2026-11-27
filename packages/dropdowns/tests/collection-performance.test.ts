// Dropdown collection budgets in Node: search index build for
// 100,000 labels with `ignoreAccents` (≤ 40 ms), one local filter step per
// keystroke over the built index (≤ 8 ms p95), select all over
// 100,000 items (≤ 20 ms), and the virtual window per scroll step.
// The browser half (open, scroll, active move) is
// tests/browser/dropdowns-perf.spec.ts.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertBudget } from '../../../tooling/bench/budget.mjs';
import { createCollection } from '../dist/internal/collection/collection.js';
import { createSearchIndex } from '../dist/internal/collection/search.js';
import { SELECT_NONE, selectAllValues, toggleSelected, selectedCount } from '../dist/internal/collection/selection.js';
import { nextWindow, windowRange } from '../../core/dist/internal/collection/virtual.js';

const N = 100_000;
const gc = (globalThis as { gc?: () => void }).gc;
const WORDS = ['Ångström', 'Café', 'Zürich', 'Øresund', 'Crème', 'naïve', 'Señor', 'Straße', 'Łódź', 'São Paulo', 'Kraków', 'Málaga'];
const items = Array.from({ length: N }, (_, i) => ({ value: i, label: `${WORDS[i % WORDS.length]} ${WORDS[(i * 7) % WORDS.length]} ${i}` }));

function p95(samples: number[]): number {
  const sorted = samples.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] as number;
}

function median(samples: number[]): number {
  const sorted = samples.slice().sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] as number;
}

describe('dropdown collection performance (100,000 items)', () => {
  it('builds the ignoreAccents search index in ≤ 40 ms', () => {
    const runs: number[] = [];
    for (let r = 0; r < 5; r++) {
      gc?.();
      const index = createSearchIndex(createCollection(items), { ignoreAccents: true });
      const t0 = performance.now();
      index.build();
      runs.push(performance.now() - t0);
    }
    const m = median(runs);
    assertBudget(m, 40, 'index build median');
  });

  it('filters per keystroke in ≤ 8 ms p95 over the built index', () => {
    const steps: number[] = [];
    for (const operator of ['startsWith', 'contains'] as const) {
      for (let r = 0; r < 5; r++) {
        const index = createSearchIndex(createCollection(items), { ignoreAccents: true });
        index.build();
        gc?.();
        // Typing, a correction, and clearing: every step is one keystroke.
        for (const text of ['c', 'ca', 'caf', 'cafe', 'caf', 'cafe ', 'cafe z', '', 'z', 'zu', 'zur', 'zuri']) {
          const t0 = performance.now();
          index.search(text, operator);
          steps.push(performance.now() - t0);
        }
      }
    }
    const value = p95(steps);
    assertBudget(value, 8, 'filter step p95');
  });

  it('selects all 100,000 items in ≤ 20 ms', () => {
    const collection = createCollection(items);
    collection.indexOf(0); // the value map exists after the first lookup
    const runs: number[] = [];
    for (let r = 0; r < 5; r++) {
      gc?.();
      const t0 = performance.now();
      const all = selectAllValues(collection, new Set());
      runs.push(performance.now() - t0);
      assert.equal(all.length, N);
    }
    const m = median(runs);
    assertBudget(m, 20, 'select all median');
    // The base-plus-toggles draft selects all in O(1).
    const t0 = performance.now();
    const draft = toggleSelected({ ...SELECT_NONE, base: 'all' }, 5);
    assertBudget(performance.now() - t0, 1, 'select all draft toggle', { strict: true });
    assert.equal(selectedCount(draft, N), N - 1);
  });

  it('moves the virtual window in O(1) per scroll step', () => {
    let w = windowRange(N, 0, 8);
    let commits = 0;
    const t0 = performance.now();
    for (let start = 0; start < N - 8; start++) {
      const next = nextWindow(w, N, start, 8);
      if (next !== w) commits++;
      w = next;
    }
    const perStep = (performance.now() - t0) / N;
    assertBudget(perStep, 0.01, 'window step', { strict: true });
    assert.ok(commits <= N / 3 + 1, `window commits ${commits} for ${N} one-row scroll steps`);
  });
});
