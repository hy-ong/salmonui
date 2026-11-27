// Drag and drop math. Pure and framework-agnostic: the drop point idea of
// Data Grid engine `row-drag-drop.ts` `computeDropPoint` (a pointer fraction
// within the target row picks `before` / `after`, and `into` for rows that
// accept children), the pointer travel threshold and the edge auto-scroll
// step. The DOM session (pointer capture, indicator attributes) belongs to
// each consumer's lazy chunk.

export type DropPosition = 'before' | 'after' | 'into';

/** Pointer travel in px before a press becomes a drag. */
export const DRAG_THRESHOLD = 4;

/**
 * Drop position for a pointer at `fraction` (0 top .. 1 bottom) of the
 * target row. With `into` allowed the middle half drops into the row.
 */
export function dropPosition(fraction: number, allowInto: boolean): DropPosition {
  if (!allowInto) return fraction < 0.5 ? 'before' : 'after';
  if (fraction < 0.25) return 'before';
  if (fraction > 0.75) return 'after';
  return 'into';
}

/** True once the pointer moved `threshold` px from the press. */
export function pastThreshold(dx: number, dy: number, threshold: number = DRAG_THRESHOLD): boolean {
  return dx * dx + dy * dy >= threshold * threshold;
}

/**
 * Auto-scroll step for a pointer at `y` inside a scroll box spanning
 * `[top, bottom)`: negative near the top edge, positive near the bottom,
 * growing to `max` px per frame at the edge; 0 elsewhere.
 */
export function edgeScrollStep(y: number, top: number, bottom: number, edge = 32, max = 16): number {
  if (y < top + edge) return -Math.ceil(max * Math.min(1, (top + edge - y) / edge));
  if (y > bottom - edge) return Math.ceil(max * Math.min(1, (y - (bottom - edge)) / edge));
  return 0;
}
