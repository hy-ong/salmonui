// Helpers for incremental pipeline stages (PipelineStage.update). A RowDelta
// says how the source array changed; these helpers carry a previous order over
// to the new index space and merge in the rows that have to be re-evaluated.

import type { PipelineStage, RowDelta, RowModelSnapshot } from './types.js';

/** Frozen `RowDelta`. All deltas share one shape. */
export function createRowDelta(previousCount: number, count: number, removed: Int32Array, updated: Int32Array): RowDelta {
  return Object.freeze({ previousCount, count, removed, updated });
}

// Keeps the frozen delta shape alive across garbage collections: deltas are
// short-lived, and optimized code specialized on a shape that died is thrown
// away (a deopt per major GC on the incremental hot path otherwise). Read in
// `deltaSize` so bundlers keep it.
const SHAPE_ANCHOR: RowDelta = createRowDelta(0, 0, new Int32Array(0), new Int32Array(0));

/** Index in the new array where appended rows start. */
export function appendStart(delta: RowDelta): number {
  return delta.previousCount - delta.removed.length;
}

/** Rows touched by the delta (updated + appended + removed). */
export function deltaSize(delta: RowDelta): number {
  if (delta === SHAPE_ANCHOR) return 0;
  const mapped = indexMaps.get(delta);
  if (mapped) return mapped.stale.length + mapped.dirty.length;
  return delta.updated.length + delta.removed.length + (delta.count - appendStart(delta));
}

const survivorMaps = new WeakMap<RowDelta, Int32Array>();
const dirtyLists = new WeakMap<RowDelta, Int32Array>();

// ---------------------------------------------------------------------------
// Mapped deltas (row reorders)
// ---------------------------------------------------------------------------
//
// A reorder shifts every row between the first and the last touched position,
// which removed / updated / appended indexes cannot express. A mapped delta
// carries the previous -> new index map instead: carried rows keep their
// relative order (so ascending and sorted orders stay valid after the remap),
// `stale` lists the previous indexes that are not carried (moved, removed, or
// updated rows), and `dirty` the new indexes to re-evaluate (moved, updated,
// and appended rows). Mapped deltas are internal: the engine hands them only
// to stages marked with `acceptMappedDeltas` (the built-in incremental
// stages, whose helpers below and in keys.ts / group-tree.ts handle them);
// other stages run in full. Their public fields hold `removed: stale` and an
// empty `updated`.

interface IndexMap {
  readonly map: Int32Array;
  readonly stale: Int32Array;
  readonly dirty: Int32Array;
}

const indexMaps = new WeakMap<RowDelta, IndexMap>();
const EMPTY_INDEXES = new Int32Array(0);

function createMappedDelta(previousCount: number, count: number, map: Int32Array, stale: Int32Array, dirty: Int32Array): RowDelta {
  const delta = createRowDelta(previousCount, count, stale, EMPTY_INDEXES);
  indexMaps.set(delta, Object.freeze({ map, stale, dirty }));
  survivorMaps.set(delta, map);
  dirtyLists.set(delta, dirty);
  return delta;
}

/**
 * @internal The delta of moving the rows at previous `positions` (distinct,
 * in placement order) so the first lands at `insertAt` of the list without
 * them; the row count `count` is unchanged. O(count) typed-array work.
 */
export function createMoveDelta(count: number, positions: ArrayLike<number>, insertAt: number): RowDelta {
  const k = positions.length;
  const stale = Int32Array.from(positions).sort();
  const lo = Math.min(stale[0] as number, insertAt);
  const hi = Math.min(count, Math.max((stale[k - 1] as number) + 1, insertAt + k));
  const map = new Int32Array(count);
  for (let i = 0; i < lo; i++) map[i] = i;
  const rel = insertAt - lo;
  let w = 0;
  let s = 0;
  for (let p = lo; p < hi; p++) {
    if (s < k && stale[s] === p) {
      map[p] = -1;
      s++;
      continue;
    }
    if (w === rel) w += k;
    map[p] = lo + w++;
  }
  for (let i = hi; i < count; i++) map[i] = i;
  const dirty = new Int32Array(k);
  for (let i = 0; i < k; i++) dirty[i] = insertAt + i;
  return createMappedDelta(count, count, map, stale, dirty);
}

/** @internal Whether `delta` is a mapped delta (a reorder, possibly composed with other changes). */
export function isMappedDelta(delta: RowDelta): boolean {
  return indexMaps.has(delta);
}

/** @internal Previous index -> new index (-1: not carried) of a mapped delta, else undefined. */
export function mappedIndexes(delta: RowDelta): Int32Array | undefined {
  return indexMaps.get(delta)?.map;
}

const mappedStages = new WeakSet<object>();

/** @internal Marks a built-in stage whose `update` handles mapped deltas. */
export function acceptMappedDeltas<Row, State>(stage: PipelineStage<Row, State>): PipelineStage<Row, State> {
  mappedStages.add(stage);
  return stage;
}

/** @internal Whether a stage's `update` may receive mapped deltas. */
export function acceptsMappedDeltas(stage: object): boolean {
  return mappedStages.has(stage);
}

function toIndexMap(delta: RowDelta): IndexMap {
  const mapped = indexMaps.get(delta);
  if (mapped) return mapped;
  const { removed, updated } = delta;
  const stale = new Int32Array(removed.length + updated.length);
  let a = 0;
  let b = 0;
  let w = 0;
  while (a < removed.length || b < updated.length) {
    if (b >= updated.length || (a < removed.length && (removed[a] as number) < (updated[b] as number))) stale[w++] = removed[a++] as number;
    else stale[w++] = updated[b++] as number;
  }
  return { map: survivorMap(delta), stale, dirty: dirtyRows(delta) };
}

/** A->B and B->C composed when either is mapped. */
function composeMapped(first: RowDelta, second: RowDelta): RowDelta {
  const a = toIndexMap(first);
  const b = toIndexMap(second);
  const n = first.previousCount;
  const map = new Int32Array(n);
  const stale: number[] = [];
  const am = a.map;
  const bm = b.map;
  for (let i = 0; i < n; i++) {
    const x = am[i] as number;
    const m = x >= 0 ? (bm[x] as number) : -1;
    map[i] = m;
    if (m < 0) stale.push(i);
  }
  const dirty = new Set<number>(b.dirty);
  for (const d of a.dirty) {
    const m = bm[d] as number;
    if (m >= 0) dirty.add(m);
  }
  return createMappedDelta(n, second.count, map, Int32Array.from(stale), Int32Array.from(dirty).sort());
}

/** Previous index -> new index for rows that are unchanged; -1 for removed and updated rows. */
export function survivorMap(delta: RowDelta): Int32Array {
  let map = survivorMaps.get(delta);
  if (map) return map;
  const n = delta.previousCount;
  map = new Int32Array(n);
  const { removed, updated } = delta;
  let ri = 0;
  let ui = 0;
  let shift = 0;
  let nextR = removed.length ? (removed[0] as number) : n;
  let nextU = updated.length ? (updated[0] as number) : n;
  let i = 0;
  while (i < n) {
    const stop = nextR < nextU ? nextR : nextU;
    for (; i < stop; i++) map[i] = i - shift;
    if (i >= n) break;
    map[i] = -1;
    if (i === nextR) {
      shift++;
      ri++;
      nextR = ri < removed.length ? (removed[ri] as number) : n;
    } else {
      ui++;
      nextU = ui < updated.length ? (updated[ui] as number) : n;
    }
    i++;
  }
  survivorMaps.set(delta, map);
  return map;
}

/** New indexes of updated and appended rows, ascending. */
export function dirtyRows(delta: RowDelta): Int32Array {
  let list = dirtyLists.get(delta);
  if (list) return list;
  const start = appendStart(delta);
  list = new Int32Array(delta.updated.length + (delta.count - start));
  const { removed, updated } = delta;
  let ri = 0;
  let w = 0;
  for (let u = 0; u < updated.length; u++) {
    const old = updated[u] as number;
    while (ri < removed.length && (removed[ri] as number) < old) ri++;
    list[w++] = old - ri;
  }
  for (let r = start; r < delta.count; r++) list[w++] = r;
  dirtyLists.set(delta, list);
  return list;
}

/** Composes A->B and B->C into A->C. Null when the result is not representable. */
export function composeDeltas(first: RowDelta, second: RowDelta): RowDelta | null {
  if (first.count !== second.previousCount) return null;
  if (indexMaps.has(first) || indexMaps.has(second)) return composeMapped(first, second);
  const firstStart = appendStart(first);
  const removedA = first.removed;
  // B index (< firstStart) -> A index: the b-th surviving A row.
  const toA = (b: number): number => {
    let a = b;
    for (let i = 0; i < removedA.length; i++) {
      if ((removedA[i] as number) <= a) a++;
      else break;
    }
    return a;
  };
  const removed = new Set<number>(removedA);
  for (const b of second.removed) if (b < firstStart) removed.add(toA(b));
  const updated = new Set<number>();
  for (const a of first.updated) if (!removed.has(a)) updated.add(a);
  for (const b of second.updated) {
    if (b >= firstStart) continue; // still an appended row relative to A
    const a = toA(b);
    if (!removed.has(a)) updated.add(a);
  }
  return createRowDelta(
    first.previousCount,
    second.count,
    Int32Array.from([...removed].sort((x, y) => x - y)),
    Int32Array.from([...updated].sort((x, y) => x - y)),
  );
}

/** `order` (null = identity over `len` rows) through a previous -> new index map, dropping unmapped rows. */
function remapThroughMap(order: Int32Array | null, len: number, map: Int32Array, out: Int32Array, offset: number): number {
  let w = offset;
  if (order) {
    for (let i = 0; i < len; i++) {
      const v = map[order[i] as number] as number;
      if (v >= 0) out[w++] = v;
    }
  } else {
    for (let i = 0; i < len; i++) {
      const v = map[i] as number;
      if (v >= 0) out[w++] = v;
    }
  }
  return w - offset;
}

/**
 * Writes `order` (null = identity over the previous array) carried to the new
 * index space into `out` from `offset`, dropping removed and updated rows.
 * Returns the number of entries written. Small deltas are handled inline
 * without the O(previous rows) survivor map.
 */
function remapInto(order: Int32Array | null, delta: RowDelta, out: Int32Array, offset: number): number {
  const len = order ? order.length : delta.previousCount;
  const { removed, updated } = delta;
  let w = offset;
  if (indexMaps.has(delta)) return remapThroughMap(order, len, survivorMap(delta), out, offset);
  if (removed.length === 0 && order !== null && updated.length <= 64) {
    // No index shift: locate the few updated entries natively and block-copy the rest.
    const at: number[] = [];
    const sorted = ascending.has(order);
    for (let j = 0; j < updated.length; j++) {
      const u = updated[j] as number;
      const p = sorted ? lowerBound(order, u) : order.indexOf(u);
      if (p >= 0 && p < len && order[p] === u) at.push(p);
    }
    at.sort((a, b) => a - b);
    let from = 0;
    for (const p of at) {
      if (p > from) out.set(order.subarray(from, p), w);
      w += p - from;
      from = p + 1;
    }
    if (from < len) out.set(order.subarray(from), w);
    w += len - from;
    return w - offset;
  }
  if (removed.length === 1 && updated.length === 0 && order !== null) {
    // One removal: drop its entry and shift later indexes down by one. Ascending
    // orders copy the unchanged prefix natively; the rest is one tight loop.
    const r0 = removed[0] as number;
    let from = 0;
    if (ascending.has(order)) {
      from = lowerBound(order, r0);
      if (from > 0) out.set(order.subarray(0, from), w);
      w += from;
      if (from < len && order[from] === r0) from++;
      for (let i = from; i < len; i++) out[w++] = (order[i] as number) - 1;
      return w - offset;
    }
    for (let i = 0; i < len; i++) {
      const x = order[i] as number;
      if (x === r0) continue;
      // x - 1 when x > r0, branch-free.
      out[w++] = x - ((r0 - x) >>> 31);
    }
    return w - offset;
  }
  if (removed.length + updated.length <= 4) {
    const r0 = removed.length > 0 ? (removed[0] as number) : -1;
    if (removed.length <= 1 && updated.length <= 1) {
      const u0 = updated.length > 0 ? (updated[0] as number) : -1;
      for (let i = 0; i < len; i++) {
        const x = order ? (order[i] as number) : i;
        if (x === r0 || x === u0) continue;
        out[w++] = r0 >= 0 && x > r0 ? x - 1 : x;
      }
      return w - offset;
    }
    for (let i = 0; i < len; i++) {
      const x = order ? (order[i] as number) : i;
      let drop = false;
      let shift = 0;
      for (let j = 0; j < removed.length; j++) {
        const r = removed[j] as number;
        if (r < x) shift++;
        else {
          drop = r === x;
          break;
        }
      }
      if (!drop) for (let j = 0; j < updated.length; j++) if (updated[j] === x) drop = true;
      if (!drop) out[w++] = x - shift;
    }
    return w - offset;
  }
  const map = survivorMap(delta);
  if (order) {
    for (let i = 0; i < len; i++) {
      const v = map[order[i] as number] as number;
      if (v >= 0) out[w++] = v;
    }
  } else {
    for (let i = 0; i < len; i++) {
      const v = map[i] as number;
      if (v >= 0) out[w++] = v;
    }
  }
  return w - offset;
}

/** Carries `order` (null = identity over the previous array) to the new index space, dropping removed and updated rows. */
export function remapOrder(order: Int32Array | null, delta: RowDelta): Int32Array {
  const out = new Int32Array(order ? order.length : delta.previousCount);
  const w = remapInto(order, delta, out, 0);
  return w === out.length ? out : out.subarray(0, w);
}

/**
 * `order` carried to the new index space (see `remapOrder`) with `extra`
 * (sorted by `compare`) merged in by binary search. The comparison must be a
 * strict total order consistent with `order` (ties broken by index). One
 * allocation: the carried rows are written behind a gap of `extra.length`
 * entries and merged forward in place.
 */
export function remapAndMerge(
  order: Int32Array | null,
  delta: RowDelta,
  extra: readonly number[],
  compare: (a: number, b: number) => number,
): Int32Array {
  const e = extra.length;
  const out = new Int32Array((order ? order.length : delta.previousCount) + e);
  const kept = remapInto(order, delta, out, e);
  let read = e;
  const end = e + kept;
  let w = 0;
  for (let i = 0; i < e; i++) {
    const x = extra[i] as number;
    let lo = read;
    let hi = end;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compare(out[mid] as number, x) < 0) lo = mid + 1;
      else hi = mid;
    }
    if (lo > read) out.copyWithin(w, read, lo);
    w += lo - read;
    read = lo;
    out[w++] = x;
  }
  if (end > read) out.copyWithin(w, read, end);
  w += end - read;
  return w === out.length ? out : out.subarray(0, w);
}

const ascending = new WeakSet<Int32Array>();

function lowerBound(order: Int32Array, value: number): number {
  let lo = 0;
  let hi = order.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((order[mid] as number) < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Records that `order` is strictly ascending (stages that subset their input in order). */
export function markAscending(order: Int32Array): Int32Array {
  ascending.add(order);
  return order;
}

/** Whether a model's order is the identity or strictly ascending (checked once per array). */
export function isAscendingModel<Row>(model: RowModelSnapshot<Row>): boolean {
  const order = model.order;
  if (order === null || ascending.has(order)) return true;
  for (let i = 1; i < order.length; i++) if ((order[i] as number) <= (order[i - 1] as number)) return false;
  ascending.add(order);
  return true;
}

/** Whether source index `r` is in an ascending model. */
export function inAscendingModel<Row>(model: RowModelSnapshot<Row>, r: number): boolean {
  const order = model.order;
  if (order === null) return r < model.count;
  let lo = 0;
  let hi = order.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const v = order[mid] as number;
    if (v === r) return true;
    if (v < r) lo = mid + 1;
    else hi = mid - 1;
  }
  return false;
}

const byIndex = (a: number, b: number): number => a - b;

/**
 * Incremental update of an order-preserving subset stage (search, filter):
 * the previous output minus changed rows, plus the changed rows of the new
 * input that pass `test`. Requires an ascending input. Null when the caller
 * should run the full stage.
 */
export function updateSubset<Row>(
  input: RowModelSnapshot<Row>,
  previousOutput: RowModelSnapshot<Row>,
  delta: RowDelta,
  test: (row: number) => boolean,
): Int32Array | null {
  if (!isAscendingModel(input) || !isAscendingModel(previousOutput)) return null;
  const dirty = dirtyRows(delta);
  const extra: number[] = [];
  for (let i = 0; i < dirty.length; i++) {
    const r = dirty[i] as number;
    if (inAscendingModel(input, r) && test(r)) extra.push(r);
  }
  return markAscending(remapAndMerge(previousOutput.order, delta, extra, byIndex));
}
