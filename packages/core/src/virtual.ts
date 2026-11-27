// Pure virtualization math shared by renderers: row/column metrics, visible
// ranges with overscan, and scroll height compression for very tall grids.
// No DOM, no allocation
// per scroll event beyond the returned range object.

/** Vertical metrics of the visible row model. Offsets are in virtual px. */
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

/** Horizontal metrics for one column zone. */
export interface ColumnMetrics {
  readonly count: number;
  readonly totalWidth: number;
  offsetOf(index: number): number;
  widthOf(index: number): number;
  indexAt(offset: number): number;
}

export function createColumnMetrics(widths: ArrayLike<number>): ColumnMetrics {
  const n = widths.length;
  const offsets = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) offsets[i + 1] = (offsets[i] as number) + Math.max(0, widths[i] as number);
  const total = offsets[n] as number;
  return Object.freeze({
    count: n,
    totalWidth: total,
    offsetOf: (index: number) => offsets[Math.min(Math.max(index, 0), n)] as number,
    widthOf: (index: number) => Math.max(0, (widths[index] as number | undefined) ?? 0),
    indexAt(offset: number) {
      if (n === 0 || offset <= 0) return 0;
      let lo = 0;
      let hi = n - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if ((offsets[mid] as number) <= offset) lo = mid;
        else hi = mid - 1;
      }
      return lo;
    },
  });
}

/** A rendered window: `[start, end)` is visible, `[overscanStart, overscanEnd)` is rendered. */
export interface VirtualRange {
  readonly start: number;
  readonly end: number;
  readonly overscanStart: number;
  readonly overscanEnd: number;
}

export const EMPTY_RANGE: VirtualRange = Object.freeze({ start: 0, end: 0, overscanStart: 0, overscanEnd: 0 });

interface Metrics {
  readonly count: number;
  offsetOf(index: number): number;
  indexAt(offset: number): number;
}

/**
 * Visible range for a scroll offset and viewport extent, widened by
 * `overscan` items on each side. Works for rows and columns.
 */
export function computeRange(metrics: Metrics, offset: number, extent: number, overscan: number): VirtualRange {
  const n = metrics.count;
  if (n === 0 || !(extent > 0)) return EMPTY_RANGE;
  const start = metrics.indexAt(Math.max(0, offset));
  let end = metrics.indexAt(offset + extent);
  if (metrics.offsetOf(end) < offset + extent) end += 1;
  end = Math.min(n, Math.max(end, start + 1));
  const o = Math.max(0, overscan | 0);
  return { start, end, overscanStart: Math.max(0, start - o), overscanEnd: Math.min(n, end + o) };
}

export function sameRange(a: VirtualRange, b: VirtualRange): boolean {
  return a.overscanStart === b.overscanStart && a.overscanEnd === b.overscanEnd && a.start === b.start && a.end === b.end;
}

/**
 * Maps between the physical scroll offset of the scroll container and the
 * virtual offset of the row model. Below `maxScrollHeight` the mapping is the
 * identity. Above it the physical scroll height is capped and the offset is
 * mapped linearly (scroll height compression), so 10M+ rows stay reachable in
 * browsers that cap element heights (~17.9M px Firefox, ~33.5M px Chromium).
 */
export interface ScrollMapping {
  readonly compressed: boolean;
  /** Physical height of the scrollable content. */
  readonly scrollHeight: number;
  readonly totalHeight: number;
  /** Virtual px per physical px (1 when not compressed). */
  readonly ratio: number;
  toVirtual(scrollTop: number): number;
  toPhysical(virtualTop: number): number;
  /** Deterministic segment of a virtual offset; null when not compressed. */
  segmentAt(virtualTop: number, estimatedRowHeight: number): { index: number; count: number; rowsPerSegment: number } | null;
}

/** Default physical cap, below every browser's element height limit. */
export const DEFAULT_MAX_SCROLL_HEIGHT = 15_000_000;

export function createScrollMapping(totalHeight: number, viewportHeight: number, maxScrollHeight = DEFAULT_MAX_SCROLL_HEIGHT): ScrollMapping {
  const total = Math.max(0, totalHeight);
  const max = Math.max(1, maxScrollHeight);
  const vh = Math.max(0, viewportHeight);
  if (total <= max) {
    return Object.freeze({
      compressed: false,
      scrollHeight: total,
      totalHeight: total,
      ratio: 1,
      toVirtual: (s: number) => s,
      toPhysical: (v: number) => v,
      segmentAt: () => null,
    });
  }
  const physicalRange = Math.max(1, max - vh);
  const virtualRange = Math.max(1, total - vh);
  const ratio = virtualRange / physicalRange;
  const count = Math.ceil(total / max);
  return Object.freeze({
    compressed: true,
    scrollHeight: max,
    totalHeight: total,
    ratio,
    toVirtual: (s: number) => Math.min(virtualRange, Math.max(0, s) * ratio),
    toPhysical: (v: number) => Math.min(physicalRange, Math.max(0, v) / ratio),
    segmentAt(virtualTop: number, estimatedRowHeight: number) {
      const index = Math.min(count - 1, Math.max(0, Math.floor(virtualTop / max)));
      return { index, count, rowsPerSegment: Math.max(1, Math.floor(max / Math.max(1, estimatedRowHeight))) };
    },
  });
}
