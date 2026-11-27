import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeRange,
  createColumnMetrics,
  createFixedRowMetrics,
  createScrollMapping,
  createVariableRowMetrics,
  sameRange,
} from '@salmonui/core/virtual';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

describe('row metrics', () => {
  it('fixed metrics are O(1) arithmetic', () => {
    const m = createFixedRowMetrics(100_000, 36);
    assert.equal(m.totalHeight, 3_600_000);
    assert.equal(m.offsetOf(10), 360);
    assert.equal(m.indexAt(359), 9);
    assert.equal(m.indexAt(360), 10);
    assert.equal(m.indexAt(1e12), 99_999);
    assert.equal(m.indexAt(-5), 0);
  });

  it('variable metrics agree with a naive prefix sum and update in O(log n)', () => {
    const heights = Array.from({ length: 1000 }, (_, i) => 20 + ((i * 7) % 30));
    const m = createVariableRowMetrics(heights.length, (i) => heights[i] as number);
    const naive = (i: number) => heights.slice(0, i).reduce((a, b) => a + b, 0);
    for (const i of [0, 1, 2, 3, 500, 999, 1000]) assert.equal(m.offsetOf(i), naive(i));
    for (const i of [0, 1, 17, 500, 999]) {
      assert.equal(m.indexAt(naive(i)), i);
      assert.equal(m.indexAt(naive(i) + heights[i]! - 0.5), i);
    }
    assert.equal(m.setHeight(10, heights[10]! + 100), 100);
    heights[10] = heights[10]! + 100;
    assert.equal(m.totalHeight, naive(1000));
    for (const i of [11, 600]) assert.equal(m.offsetOf(i), naive(i));
    assert.equal(m.setHeight(10, heights[10]!), 0);
  });

  it('builds 1M variable heights quickly @perf', () => {
    const t0 = performance.now();
    const m = createVariableRowMetrics(1_000_000, () => 36);
    const t1 = performance.now();
    assert.equal(m.totalHeight, 36_000_000);
    assert.equal(m.indexAt(36 * 654_321 + 1), 654_321);
    assertBudget(t1 - t0, 100, 'build 1M variable heights', { strict: true });
  });
});

describe('ranges and overscan', () => {
  it('computes the visible window plus overscan and clamps at the edges', () => {
    const m = createFixedRowMetrics(100_000, 36);
    const r = computeRange(m, 0, 560, 5);
    assert.deepEqual(r, { start: 0, end: 16, overscanStart: 0, overscanEnd: 21 });
    const mid = computeRange(m, 36 * 1000 + 10, 560, 5);
    assert.deepEqual(mid, { start: 1000, end: 1016, overscanStart: 995, overscanEnd: 1021 });
    const end = computeRange(m, m.totalHeight - 560, 560, 5);
    assert.equal(end.end, 100_000);
    assert.equal(end.overscanEnd, 100_000);
    assert.ok(sameRange(mid, computeRange(m, 36 * 1000 + 11, 560, 5)), 'sub-row scroll keeps the range');
    assert.deepEqual(computeRange(createFixedRowMetrics(0, 36), 0, 500, 5), { start: 0, end: 0, overscanStart: 0, overscanEnd: 0 });
  });

  it('column metrics index by offset', () => {
    const c = createColumnMetrics([100, 200, 50, 160]);
    assert.equal(c.totalWidth, 510);
    assert.equal(c.indexAt(99), 0);
    assert.equal(c.indexAt(100), 1);
    assert.equal(c.indexAt(349), 2);
    assert.equal(c.indexAt(10_000), 3);
    assert.deepEqual(computeRange(c, 120, 200, 1), { start: 1, end: 3, overscanStart: 0, overscanEnd: 4 });
  });
});

describe('scroll height compression', () => {
  it('is the identity below the cap', () => {
    const map = createScrollMapping(3_600_000, 600);
    assert.equal(map.compressed, false);
    assert.equal(map.toVirtual(1234), 1234);
    assert.equal(map.segmentAt(0, 36), null);
  });

  it('maps 10M rows linearly into a capped physical height', () => {
    const total = 10_000_000 * 36;
    const map = createScrollMapping(total, 600, 15_000_000);
    assert.equal(map.compressed, true);
    assert.equal(map.scrollHeight, 15_000_000);
    assert.equal(map.toVirtual(0), 0);
    assert.equal(map.toVirtual(15_000_000 - 600), total - 600);
    const v = map.toVirtual(7_000_000);
    assert.ok(Math.abs(map.toPhysical(v) - 7_000_000) < 1e-6);
    assert.deepEqual(map.segmentAt(total - 600, 36), { index: 23, count: 24, rowsPerSegment: 416_666 });
    const rows = createFixedRowMetrics(10_000_000, 36);
    assert.equal(rows.indexAt(map.toVirtual(15_000_000 - 600) + 599), 9_999_999);
  });
});
