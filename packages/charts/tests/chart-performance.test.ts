// Chart decimation budget in Node (a 1,000,000-point canvas line mounts to first paint in <= 300 ms, of which
// decimation <= 50 ms; the browser half is tests/browser/chart-perf.spec.ts).
// Median of several runs.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { decimateLine } from '../dist/viz/decimate.js';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

describe('Chart decimation timing', () => {
  it('min/max decimation of 1,000,000 sorted points onto a 1,200 px plot <= 50 ms (median of 7)', () => {
    const n = 1_000_000;
    const xs = new Float64Array(n);
    const ys = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      xs[i] = i;
      ys[i] = Math.sin(i / 5000) * 50 + Math.sin(i / 37) * 5;
    }
    const width = 1200;
    const toPixel = (x: number) => (x / (n - 1)) * width;
    const times: number[] = [];
    let kept = 0;
    for (let r = 0; r < 7; r++) {
      const t0 = performance.now();
      const idx = decimateLine(xs, ys, toPixel, width, 'auto');
      times.push(performance.now() - t0);
      kept = idx?.length ?? n;
    }
    const median = [...times].sort((a, b) => a - b)[3] as number;
    console.log(`[perf] chart decimation 1M median: ${Math.round(median * 100) / 100}ms, ${kept} points kept`);
    assert.ok(kept <= width * 4, `kept ${kept}`);
    assertBudget(median, 50, 'chart decimation 1M median');
  });
});
