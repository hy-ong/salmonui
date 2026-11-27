// Pure list operations for reorder and dual-list recipes.
// They never mutate their inputs and return new arrays.

import { defaultItemValue } from '../internal/collection/collection.js';
import type { ListboxKey } from './types.js';

/**
 * Moves the items whose values are in `values` from `source` to `target`,
 * inserted at `index` of `target` (default: the end), in `source` order.
 * Returns `[nextSource, nextTarget]`. When `source === target` the items
 * move within the list: `index` is the insertion index in the current list
 * (as a drop position), and both results are the same new array.
 */
export function moveItems<T>(
  source: readonly T[],
  target: readonly T[],
  values: Iterable<ListboxKey>,
  index?: number,
  getItemValue: (item: T) => ListboxKey = defaultItemValue as (item: T) => ListboxKey,
): [nextSource: T[], nextTarget: T[]] {
  const set = new Set(values);
  const moved: T[] = [];
  const rest: T[] = [];
  let before = 0;
  const at = index === undefined ? target.length : Math.max(0, Math.min(index, target.length));
  source.forEach((item, i) => {
    if (set.has(getItemValue(item))) {
      moved.push(item);
      if (source === target && i < at) before++;
    } else rest.push(item);
  });
  if (source === target) {
    const next = rest.slice();
    next.splice(at - before, 0, ...moved);
    return [next, next];
  }
  const next = target.slice();
  next.splice(at, 0, ...moved);
  return [rest, next];
}

/**
 * Moves the items whose values are in `values` by `delta` positions
 * (negative: up), keeping their relative order; items stop at the ends of
 * the list (a block that reaches an end keeps its shape).
 */
export function reorderItems<T>(
  list: readonly T[],
  values: Iterable<ListboxKey>,
  delta: number,
  getItemValue: (item: T) => ListboxKey = defaultItemValue as (item: T) => ListboxKey,
): T[] {
  const set = new Set(values);
  const next = list.slice();
  if (delta === 0 || set.size === 0) return next;
  const steps = Math.abs(delta);
  const up = delta < 0;
  for (let s = 0; s < steps; s++) {
    let moved = false;
    if (up) {
      for (let i = 1; i < next.length; i++) {
        if (set.has(getItemValue(next[i] as T)) && !set.has(getItemValue(next[i - 1] as T))) {
          [next[i - 1], next[i]] = [next[i] as T, next[i - 1] as T];
          moved = true;
        }
      }
    } else {
      for (let i = next.length - 2; i >= 0; i--) {
        if (set.has(getItemValue(next[i] as T)) && !set.has(getItemValue(next[i + 1] as T))) {
          [next[i + 1], next[i]] = [next[i] as T, next[i + 1] as T];
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  return next;
}
