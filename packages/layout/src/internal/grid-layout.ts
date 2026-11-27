// Grid layout algorithm (`internal/grid-layout`). Pure and framework-agnostic: no React, no DOM, no
// module state, so it can move to a package later. Positions are logical cells: `x` is the column from the
// inline start (mirrored by CSS grid in RTL), `y` the row from the top.
//
// - `clampItem`: min / max size, column count, non-negative position.
// - `settle`: resolves overlaps, keeping static items and one active item in
//   place; an item hit by the active one first tries the free space above
//   it (a swap), otherwise it is pushed down. With `compact: 'vertical'`
//   every movable item then floats up as far as it can.
// - `moveItem` / `resizeItem`: the next layout for a drag, resize or
//   keyboard step. Every function returns new item objects and never
//   mutates its input.

export interface GridLayoutItem {
  /** Stable id (the `DashboardLayout.Panel` id). */
  readonly id: string;
  /** Column from the inline start, 0-based. */
  readonly x: number;
  /** Row from the top, 0-based. */
  readonly y: number;
  /** Width in columns. */
  readonly w: number;
  /** Height in rows. */
  readonly h: number;
  readonly minW?: number | undefined;
  readonly maxW?: number | undefined;
  readonly minH?: number | undefined;
  readonly maxH?: number | undefined;
  /** Never moved or resized, by the user or by other items. */
  readonly static?: boolean | undefined;
}

export type GridCompact = 'vertical' | false;

const int = (n: number, fallback: number): number => (Number.isFinite(n) ? Math.round(n) : fallback);

/** The item within its size limits and the column count, at a non-negative position. */
export function clampItem<T extends GridLayoutItem>(item: T, columns: number): T {
  const minW = Math.max(1, item.minW ?? 1);
  const maxW = Math.max(minW, Math.min(columns, item.maxW ?? columns));
  const minH = Math.max(1, item.minH ?? 1);
  const maxH = Math.max(minH, item.maxH ?? Infinity);
  const w = Math.min(Math.max(int(item.w, minW), minW), Math.min(maxW, columns));
  const h = Math.min(Math.max(int(item.h, minH), minH), maxH);
  const x = Math.min(Math.max(int(item.x, 0), 0), Math.max(0, columns - w));
  const y = Math.max(int(item.y, 0), 0);
  return x === item.x && y === item.y && w === item.w && h === item.h ? item : { ...item, x, y, w, h };
}

/** True when the two items share at least one cell. */
export function collides(a: GridLayoutItem, b: GridLayoutItem): boolean {
  return a.id !== b.id && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

const hits = (item: GridLayoutItem, placed: readonly GridLayoutItem[]): boolean => placed.some((p) => collides(item, p));
const byPosition = (a: GridLayoutItem, b: GridLayoutItem): number => a.y - b.y || a.x - b.x;

/** One row below the lowest item (where a new item goes). */
export function bottom(layout: readonly GridLayoutItem[]): number {
  let max = 0;
  for (const item of layout) max = Math.max(max, item.y + item.h);
  return max;
}

/**
 * A layout without overlaps, in input order. Static items keep their place;
 * `activeId` (the dragged or resized item) keeps its place unless it covers
 * a static item.
 */
export function settle<T extends GridLayoutItem>(layout: readonly T[], columns: number, compact: GridCompact, activeId?: string): T[] {
  const items = layout.map((item) => clampItem(item, columns));
  const placed: T[] = items.filter((item) => item.static);
  const out = new Map<string, T>(placed.map((item) => [item.id, item]));
  const moving = items.find((item) => item.id === activeId && !item.static);
  let active = moving;
  if (active) {
    while (hits(active, placed)) active = { ...active, y: active.y + 1 };
    placed.push(active);
    out.set(active.id, active);
  }
  const rest = items.filter((item) => !item.static && item !== moving).sort(byPosition);
  for (const item of rest) {
    let next = item;
    if (active && collides(next, active)) {
      const up = { ...next, y: active.y - next.h };
      if (up.y >= 0 && !hits(up, placed)) next = up;
    }
    while (hits(next, placed)) next = { ...next, y: next.y + 1 };
    if (compact === 'vertical') while (next.y > 0 && !hits({ ...next, y: next.y - 1 }, placed)) next = { ...next, y: next.y - 1 };
    placed.push(next);
    out.set(next.id, next);
  }
  if (compact === 'vertical' && active) {
    // The active item floats too, now that the others found their place.
    const again: T[] = items.filter((item) => item.static);
    for (const item of [...out.values()].filter((i) => !i.static).sort(byPosition)) {
      let next = item;
      while (next.y > 0 && !hits({ ...next, y: next.y - 1 }, again)) next = { ...next, y: next.y - 1 };
      again.push(next);
      out.set(next.id, next);
    }
  }
  return items.map((item) => {
    const next = out.get(item.id) as T;
    const source = layout.find((i) => i.id === item.id) as T;
    return next.x === source.x && next.y === source.y && next.w === source.w && next.h === source.h ? source : next;
  });
}

/** The layout after moving item `id` to column `x`, row `y` (static items do not move). */
export function moveItem<T extends GridLayoutItem>(layout: readonly T[], id: string, x: number, y: number, columns: number, compact: GridCompact): T[] {
  return settle(
    layout.map((item) => (item.id === id && !item.static ? { ...item, x, y } : item)),
    columns,
    compact,
    id,
  );
}

/** The layout after resizing item `id` to `w` x `h` with its corner at `x`, `y` (start and top edges move it). */
export function resizeItem<T extends GridLayoutItem>(layout: readonly T[], id: string, box: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }, columns: number, compact: GridCompact): T[] {
  return settle(
    layout.map((item) => (item.id === id && !item.static ? { ...item, ...box } : item)),
    columns,
    compact,
    id,
  );
}

/** True when both layouts place every item in the same cells. */
export function sameLayout(a: readonly GridLayoutItem[], b: readonly GridLayoutItem[]): boolean {
  return a.length === b.length && a.every((item, i) => {
    const o = b[i] as GridLayoutItem;
    return o.id === item.id && o.x === item.x && o.y === item.y && o.w === item.w && o.h === item.h;
  });
}
