// Pure reorder helper for TagGroup `onReorder` / `onTagDrop`. Never mutates its input.

/**
 * Moves the entries whose value is in `values` to the insertion index
 * `toIndex` of `list` (an index in the current order, before the moved
 * entries are removed), keeping their relative order. A cross-group drop
 * (`onTagDrop`) is a filter on the source and a splice on the target.
 */
export function moveTags<T>(list: readonly T[], values: readonly string[], toIndex: number, getValue: (item: T) => string = String): T[] {
  const set = new Set(values);
  const moved: T[] = [];
  const rest: T[] = [];
  let before = 0;
  list.forEach((item, i) => {
    if (set.has(getValue(item))) {
      moved.push(item);
      if (i < toIndex) before++;
    } else rest.push(item);
  });
  rest.splice(Math.max(0, Math.min(toIndex - before, rest.length)), 0, ...moved);
  return rest;
}
