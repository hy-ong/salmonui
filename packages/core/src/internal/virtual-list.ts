// One-dimensional virtual list metrics: fixed and variable row metrics
// for TreeView and other long lists. A copy of the row metrics of
// `packages/core/src/virtual.ts`, so non-grid families do not
// import the grid engine; the Data Grid keeps its own. Pure math, no DOM.

/** Vertical metrics of a virtual list. Offsets are in px. */
export interface RowMetrics {
  readonly count: number;
  readonly totalHeight: number;
  /** Top offset of the row at `index` (`index === count` returns `totalHeight`). */
  offsetOf(index: number): number;
  heightOf(index: number): number;
  /** Index of the row that contains `offset`, clamped to `[0, count - 1]`; 0 when empty. */
  indexAt(offset: number): number;
}

/** Row metrics with measured or per-row heights, kept in a Fenwick tree (O(log n) updates and lookups). */
export interface VariableRowMetrics extends RowMetrics {
  /** Sets a row height; returns the height delta (0 when unchanged). */
  setHeight(index: number, height: number): number;
}

/** O(1) metrics for the fixed row height fast path. */
export function createFixedRowMetrics(count: number, rowHeight: number): RowMetrics {
  const n = Math.max(0, count | 0);
  const h = rowHeight > 0 ? rowHeight : 1;
  return Object.freeze({
    count: n,
    totalHeight: n * h,
    offsetOf: (index: number) => Math.min(Math.max(index, 0), n) * h,
    heightOf: () => h,
    indexAt: (offset: number) => (n === 0 ? 0 : Math.min(n - 1, Math.max(0, Math.floor(offset / h)))),
  });
}

/** Builds variable row metrics in O(n) from a height function. */
export function createVariableRowMetrics(count: number, heightAt: (index: number) => number): VariableRowMetrics {
  const n = Math.max(0, count | 0);
  const heights = new Float64Array(n);
  const tree = new Float64Array(n + 1);
  let total = 0;
  for (let i = 0; i < n; i++) {
    const h = heightAt(i);
    const v = h > 0 ? h : 0;
    heights[i] = v;
    total += v;
    tree[i + 1] = (tree[i + 1] as number) + v;
    const j = i + 1 + ((i + 1) & -(i + 1));
    if (j <= n) tree[j] = (tree[j] as number) + (tree[i + 1] as number);
  }
  let highBit = 1;
  while (highBit * 2 <= n) highBit *= 2;

  const prefix = (index: number): number => {
    let i = Math.min(Math.max(index, 0), n);
    let sum = 0;
    while (i > 0) {
      sum += tree[i] as number;
      i -= i & -i;
    }
    return sum;
  };

  return {
    get count() {
      return n;
    },
    get totalHeight() {
      return total;
    },
    offsetOf: prefix,
    heightOf: (index) => heights[index] ?? 0,
    indexAt(offset) {
      if (n === 0) return 0;
      if (offset <= 0) return 0;
      // Largest idx with prefix(idx) <= offset is the row containing offset.
      let idx = 0;
      let rest = offset;
      for (let step = highBit; step > 0; step >>= 1) {
        const next = idx + step;
        if (next <= n && (tree[next] as number) <= rest) {
          idx = next;
          rest -= tree[next] as number;
        }
      }
      return Math.min(idx, n - 1);
    },
    setHeight(index, height) {
      if (index < 0 || index >= n) return 0;
      const v = height > 0 ? height : 0;
      const delta = v - (heights[index] as number);
      if (delta === 0) return 0;
      heights[index] = v;
      total += delta;
      for (let i = index + 1; i <= n; i += i & -i) tree[i] = (tree[i] as number) + delta;
      return delta;
    },
  };
}
