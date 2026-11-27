// Row metrics for a fixed-height grid with a few rows of other heights
// (detail rows). Offsets are `index * rowHeight` plus a Fenwick tree over the
// k exception height deltas: O(k) to build, O(log k) offsets, O(log^2 k)
// `indexAt`. Nothing scales with the total row count.

import type { VariableRowMetrics } from '@salmonui/core/virtual';

/** Rows whose height differs from the fixed row height, ascending by index. */
export interface SparseRows {
  readonly detailCount: number;
  /** Visible index of exception `j` (ascending in `j`). */
  detailIndex(j: number): number;
}

export interface SparseRowMetrics extends VariableRowMetrics {
  /** Sets exception `j`'s height; returns the delta. */
  setExceptionHeight(j: number, height: number): number;
}

export function createSparseRowMetrics(count: number, rowHeight: number, rows: SparseRows, heightOf: (j: number) => number): SparseRowMetrics {
  const n = Math.max(0, count | 0);
  const base = rowHeight > 0 ? rowHeight : 1;
  const k = rows.detailCount;
  const at = new Int32Array(k);
  const heights = new Float64Array(k);
  const tree = new Float64Array(k + 1);
  let extra = 0;
  for (let j = 0; j < k; j++) {
    at[j] = rows.detailIndex(j);
    const h = heightOf(j);
    const v = h > 0 ? h : 0;
    heights[j] = v;
    extra += v - base;
    tree[j + 1] = (tree[j + 1] as number) + (v - base);
    const p = j + 1 + ((j + 1) & -(j + 1));
    if (p <= k) tree[p] = (tree[p] as number) + (tree[j + 1] as number);
  }
  /** Sum of deltas of exceptions [0, j). */
  const prefix = (j: number): number => {
    let i = Math.min(Math.max(j, 0), k);
    let sum = 0;
    while (i > 0) {
      sum += tree[i] as number;
      i -= i & -i;
    }
    return sum;
  };
  /** Exceptions with index < i. */
  const before = (i: number): number => {
    let lo = 0;
    let hi = k;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((at[mid] as number) < i) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const exceptionOf = (index: number): number => {
    const j = before(index);
    return j < k && at[j] === index ? j : -1;
  };
  const offsetOf = (index: number): number => {
    const i = Math.min(Math.max(index, 0), n);
    return i * base + prefix(before(i));
  };
  const setExceptionHeight = (j: number, height: number): number => {
    if (j < 0 || j >= k) return 0;
    const v = height > 0 ? height : 0;
    const delta = v - (heights[j] as number);
    if (delta === 0) return 0;
    heights[j] = v;
    extra += delta;
    for (let i = j + 1; i <= k; i += i & -i) tree[i] = (tree[i] as number) + delta;
    return delta;
  };
  return {
    get count() {
      return n;
    },
    get totalHeight() {
      return n * base + extra;
    },
    offsetOf,
    heightOf(index) {
      if (index < 0 || index >= n) return 0;
      const j = exceptionOf(index);
      return j < 0 ? base : (heights[j] as number);
    },
    indexAt(offset) {
      if (n === 0 || offset <= 0) return 0;
      // Last exception whose top is <= offset.
      let lo = 0;
      let hi = k - 1;
      let j = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        const top = (at[mid] as number) * base + prefix(mid);
        if (top <= offset) {
          j = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      let index: number;
      if (j < 0) index = Math.floor(offset / base);
      else {
        const top = (at[j] as number) * base + prefix(j);
        const h = heights[j] as number;
        index = offset < top + h ? (at[j] as number) : (at[j] as number) + 1 + Math.floor((offset - top - h) / base);
        // Rows before the next exception only.
        if (j + 1 < k) index = Math.min(index, at[j + 1] as number);
      }
      return Math.min(n - 1, Math.max(0, index));
    },
    setHeight(index, height) {
      const j = exceptionOf(index);
      return j < 0 ? 0 : setExceptionHeight(j, height);
    },
    setExceptionHeight,
  };
}
