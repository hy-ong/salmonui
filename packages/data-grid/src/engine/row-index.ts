// Id -> position index that survives removals without rewriting the map or
// every later position. Ids map to stable slots; each slot holds a coordinate
// (its position at the last renumbering, or a fresh coordinate past the end
// for appended rows), and removals record their coordinates in a sorted
// "gone" list. A live position is the coordinate minus the number of gone
// coordinates below it (binary search). Removing rows is therefore a native
// block move of the position -> slot array plus a sorted merge; positions are
// renumbered in one pass only after many removals (amortized O(1)).

import type { RowId } from './types.js';

/** Removals recorded before positions are renumbered in one pass. */
const RENUMBER_AFTER = 1024;

/** @internal */
export class RowIndex {
  private readonly slots = new Map<RowId, number>();
  /** Slot -> coordinate (-1 for freed slots). */
  private coord: Int32Array;
  /** Position -> slot. */
  private at: Int32Array;
  /** Sorted coordinates removed since the last renumbering. */
  private gone: Int32Array = new Int32Array(0);
  private goneCount = 0;
  private length = 0;
  private nextSlot = 0;
  private nextCoord = 0;
  /** Ids seen more than once (lookups resolve to the first). */
  duplicates = 0;

  constructor(capacity = 0) {
    this.coord = new Int32Array(capacity);
    this.at = new Int32Array(capacity);
  }

  static from(ids: readonly RowId[]): RowIndex {
    const index = new RowIndex(ids.length);
    for (let i = 0; i < ids.length; i++) index.append(ids[i] as RowId);
    return index;
  }

  get size(): number {
    return this.length;
  }

  get(id: RowId): number | undefined {
    const slot = this.slots.get(id);
    if (slot === undefined) return undefined;
    const c = this.coord[slot] as number;
    const k = this.goneCount;
    if (k === 0) return c;
    const gone = this.gone;
    let lo = 0;
    let hi = k;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((gone[mid] as number) < c) lo = mid + 1;
      else hi = mid;
    }
    return c - lo;
  }

  has(id: RowId): boolean {
    return this.slots.has(id);
  }

  /** Adds a row at the end. Returns false (and indexes nothing) when the id already exists. */
  append(id: RowId): boolean {
    const slot = this.nextSlot++;
    if (slot >= this.coord.length) this.coord = grow(this.coord, slot + 1);
    if (this.length >= this.at.length) this.at = grow(this.at, this.length + 1);
    this.coord[slot] = this.nextCoord++;
    this.at[this.length] = slot;
    this.length++;
    if (this.slots.has(id)) {
      this.duplicates++;
      return false;
    }
    this.slots.set(id, slot);
    return true;
  }

  /** Removes rows at ascending `positions`; `ids[i]` is the id at `positions[i]`. */
  remove(positions: ArrayLike<number>, ids: readonly RowId[]): void {
    const k = positions.length;
    if (k === 0) return;
    const removedCoords = new Int32Array(k);
    for (let i = 0; i < k; i++) {
      const p = positions[i] as number;
      const slot = this.at[p] as number;
      removedCoords[i] = this.coord[slot] as number;
      this.coord[slot] = -1;
      const id = ids[i] as RowId;
      if (this.slots.get(id) === slot) this.slots.delete(id);
    }
    // Compact position -> slot with block moves.
    const at = this.at;
    let w = positions[0] as number;
    for (let i = 0; i < k; i++) {
      const from = (positions[i] as number) + 1;
      const to = i + 1 < k ? (positions[i + 1] as number) : this.length;
      if (to > from) at.copyWithin(w, from, to);
      w += to - from;
    }
    this.length -= k;
    // Coordinates follow positions, so `removedCoords` is ascending: merge into `gone`.
    const total = this.goneCount + k;
    if (total > RENUMBER_AFTER) {
      this.renumber();
      return;
    }
    const merged = new Int32Array(Math.max(total, this.gone.length));
    let a = 0;
    let b = 0;
    let m = 0;
    while (a < this.goneCount && b < k) {
      const x = this.gone[a] as number;
      const y = removedCoords[b] as number;
      if (x < y) {
        merged[m++] = x;
        a++;
      } else {
        merged[m++] = y;
        b++;
      }
    }
    while (a < this.goneCount) merged[m++] = this.gone[a++] as number;
    while (b < k) merged[m++] = removedCoords[b++] as number;
    this.gone = merged;
    this.goneCount = total;
    if (this.nextSlot > 2 * this.length + RENUMBER_AFTER) this.compactSlots();
  }

  /**
   * Moves the rows at `positions` (distinct, in insertion order) so they sit
   * at `insertAt` of the list without them (row reorder). Only the window
   * between the first touched position and the last one is rewritten
   * (typed arrays only; ids keep their slots).
   */
  move(positions: ArrayLike<number>, insertAt: number): void {
    const k = positions.length;
    if (k === 0) return;
    if (this.goneCount) this.renumber();
    const at = this.at;
    const n = this.length;
    const moved = Int32Array.from(positions, (p) => at[p] as number);
    const sorted = Int32Array.from(positions).sort();
    // Native block moves: close the moved positions' gaps, open one at `insertAt`.
    let w = sorted[0] as number;
    for (let i = 0; i < k; i++) {
      const from = (sorted[i] as number) + 1;
      const to = i + 1 < k ? (sorted[i + 1] as number) : n;
      at.copyWithin(w, from, to);
      w += to - from;
    }
    at.copyWithin(insertAt + k, insertAt, n - k);
    at.set(moved, insertAt);
    const hi = Math.min(n, Math.max((sorted[k - 1] as number) + 1, insertAt + k));
    for (let i = Math.min(sorted[0] as number, insertAt); i < hi; i++) this.coord[at[i] as number] = i;
  }

  /** Coordinates := positions (one pass); clears the gone list. */
  private renumber(): void {
    const { at, coord } = this;
    for (let i = 0; i < this.length; i++) coord[at[i] as number] = i;
    this.nextCoord = this.length;
    this.goneCount = 0;
    if (this.nextSlot > 2 * this.length + RENUMBER_AFTER) this.compactSlots();
  }

  /** Renumbers slots to positions once freed slots dominate (amortized O(1) per removal). */
  private compactSlots(): void {
    if (this.goneCount) this.renumber();
    for (const [id, slot] of this.slots) this.slots.set(id, this.coord[slot] as number);
    const ident = new Int32Array(this.length);
    for (let i = 0; i < this.length; i++) ident[i] = i;
    // Duplicate positions (ids not in the map) keep their own slot number = position.
    this.coord = ident;
    this.at = Int32Array.from(ident);
    this.nextSlot = this.length;
    this.nextCoord = this.length;
  }
}

function grow(a: Int32Array, need: number): Int32Array {
  const b = new Int32Array(Math.max(need, a.length + (a.length >> 1) + 16));
  b.set(a);
  return b;
}

/**
 * @internal A copy of `list` with the elements at `positions` (distinct, in
 * placement order) moved so the first lands at `insertAt` of the list
 * without them (row reorder), by native splices (block moves on a fast
 * array: a 1M-row move costs well under a millisecond). Many positions are
 * dropped in one filter pass instead.
 */
export function movedCopy<T>(list: readonly T[], positions: ArrayLike<number>, insertAt: number): T[] {
  const moved = Array.from(positions, (p) => list[p] as T);
  let out: T[];
  if (positions.length > 16) {
    const drop = new Set(Array.from(positions));
    out = list.filter((_, i) => !drop.has(i));
  } else {
    out = [...list]; // spread: slice() of a frozen array takes a slow generic path
    for (const p of Int32Array.from(positions).sort().reverse()) out.splice(p, 1);
  }
  out.splice(insertAt, 0, ...moved);
  return out;
}
