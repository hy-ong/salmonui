// Windowing over one axis (layer `timeline`): the
// rendered index range of rows (Scheduler resource rows, Gantt task rows)
// or columns (horizontal virtualization of the time axis) for a scroll
// offset and viewport size, from uniform sizes or prefix offsets. Pure.

export interface IndexWindow {
  /** First rendered index and the exclusive end. */
  readonly start: number;
  readonly end: number;
}

/** Prefix offsets of `sizes` (length n + 1: `offsets[i]` is where item i starts, `offsets[n]` the total). */
export function prefixOffsets(sizes: ArrayLike<number>): Float64Array {
  const out = new Float64Array(sizes.length + 1);
  for (let i = 0; i < sizes.length; i++) out[i + 1] = (out[i] as number) + Math.max(0, sizes[i] as number);
  return out;
}

/** Index of the item that contains `offset` (clamped to the items; 0 when empty). */
export function indexAt(offsets: Float64Array, offset: number): number {
  const n = offsets.length - 1;
  if (n <= 0) return 0;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((offsets[mid] as number) <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Items visible in [scroll, scroll + viewport), widened by `overscan` items on each side. */
export function offsetWindow(offsets: Float64Array, scroll: number, viewport: number, overscan: number): IndexWindow {
  const n = offsets.length - 1;
  if (n <= 0) return { start: 0, end: 0 };
  const first = indexAt(offsets, Math.max(0, scroll));
  const last = indexAt(offsets, Math.max(0, scroll + Math.max(0, viewport) - 1));
  return { start: Math.max(0, first - overscan), end: Math.min(n, last + 1 + overscan) };
}

/** The same window for items of one size (columns of a time axis). */
export function uniformWindow(count: number, size: number, scroll: number, viewport: number, overscan: number): IndexWindow {
  if (count <= 0 || size <= 0) return { start: 0, end: 0 };
  const first = Math.min(count - 1, Math.max(0, Math.floor(scroll / size)));
  const last = Math.min(count - 1, Math.max(first, Math.floor((scroll + Math.max(0, viewport) - 1) / size)));
  return { start: Math.max(0, first - overscan), end: Math.min(count, last + 1 + overscan) };
}
