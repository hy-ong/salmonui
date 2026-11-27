// Fixed-row-height vertical windowing, extracted from the Data Grid
// checklist (`FacetList` in data-grid/overlays.tsx), which uses it too.
// Framework-agnostic: pure index math over a scroll offset.

/** Default overscan in items on each side. */
export const OVERSCAN = 6;

/** Mounted `[first, last)` range for a window starting at item `start`. */
export function windowRange(count: number, start: number, visible: number, overscan: number = OVERSCAN): { first: number; last: number } {
  const first = Math.max(0, Math.min(start, Math.max(0, count - visible)) - overscan);
  const last = Math.min(count, first + visible + overscan * 2);
  return { first, last };
}

/** Whether `index` is within an overscan of the end of the loaded `count` (load the next range). */
export function nearEnd(index: number, count: number, visible: number, overscan: number = OVERSCAN): boolean {
  return index + visible + overscan >= count;
}

/** The scroll offset that reveals item `index`, or null when it is already in view. */
export function revealOffset(index: number, itemHeight: number, scrollTop: number, viewport: number): number | null {
  const top = index * itemHeight;
  if (top < scrollTop) return top;
  if (top + itemHeight > scrollTop + viewport) return top + itemHeight - viewport;
  return null;
}

/**
 * Hysteresis for the mounted window: keeps `current` while the visible
 * items `[start, start + visible)` stay inside it with at least half an
 * overscan of slack on each side that can still grow, so the list commits
 * about once per half overscan of scrolling (never per scroll event) and a
 * fast scroll never shows an unrendered row before the commit lands.
 */
export function nextWindow(
  current: { first: number; last: number },
  count: number,
  start: number,
  visible: number,
  overscan: number = OVERSCAN,
): { first: number; last: number } {
  const end = Math.min(count, start + visible);
  const size = Math.min(count, visible + overscan * 2);
  const slack = overscan >> 1;
  const before = current.first > 0 ? slack : 0;
  const after = current.last < count ? slack : 0;
  if (current.last <= count && current.last - current.first >= size && start >= current.first + before && end <= current.last - after) return current;
  return windowRange(count, start, visible, overscan);
}
