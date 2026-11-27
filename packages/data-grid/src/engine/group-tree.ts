// Group structure over a sorted data order (grouping stage). Groups are runs of equal per-row group ranks in the sorted
// order, found in one pass: a boundary is a rank change at some level. There
// are no per-row or per-group objects; every group is a slot in typed arrays
// in pre-order (a group, then its subgroups), with its data rows at
// `[start, start + size)` of `order`.

import { dirtyRows, mappedIndexes } from './row-delta.js';
import type { ColumnKeys, SortRanks } from './keys.js';
import type { ColumnId, GroupTreeSnapshot, Json, RowDelta, RowId } from './types.js';

/** One grouping level resolved against the current data. */
export interface GroupLevel {
  readonly columnId: ColumnId;
  readonly keys: ColumnKeys;
  readonly desc: boolean;
  /** Group rank per dictionary code (`codeRank.length >= keys.values.length`). */
  readonly codeRank: Int32Array;
  /** Distinct group ranks (counting-sort buckets). */
  readonly rankCount: number;
  /** Group rank per source row; built on first use. */
  rowRank(): Int32Array;
  /** Group-by-format label per code, or null for raw value groups. */
  readonly label: ((code: number) => string) | null;
  /** Sort ranks of a raw level (incremental checks). */
  readonly ranks: SortRanks | null;
  /**
   * Custom group key level (`column.groupKey`): key code per source
   * row, replacing `keys.codes`; `codeRank`, `label`, and `keyValues` are
   * indexed by key code.
   */
  readonly rowCodes?: Int32Array;
  readonly keyValues?: readonly unknown[];
}

/** Caches that depend only on the group structure, shared by trees derived incrementally. */
interface SharedCaches {
  readonly pathKeys: (string | undefined)[];
  readonly byKey: Map<string, number>;
}

export interface GroupTree extends GroupTreeSnapshot {
  readonly depth: number;
  readonly count: number;
  readonly levels: readonly GroupLevel[];
  /** Level per group (0 = top). */
  readonly level: Uint8Array;
  /** Parent group, -1 for top-level groups. */
  readonly parent: Int32Array;
  /** Pre-order index after the group's subtree. */
  readonly next: Int32Array;
  /** Group rank at the group's level. */
  readonly rank: Int32Array;
  /** First data position (index into `order`). */
  readonly start: Int32Array;
  /** Data rows in the group. */
  readonly size: Int32Array;
  /** Leaf groups (deepest level) in order. */
  readonly leaves: Int32Array;
  /** Data order: position -> source index. */
  readonly order: Int32Array;
  /** Data rows (`order.length`). */
  readonly dataCount: number;
  /** Source index -> leaf group, -1 when the row is not in the grouped set. */
  readonly leafOf: Int32Array;
  readonly sourceIds: readonly RowId[];
  /** True when the input order was not grouped and the tree re-sorted it. */
  readonly resorted: boolean;
  /** Tree this one was derived from incrementally, and the leaves whose rows changed. */
  readonly base: GroupTree | null;
  readonly changedLeaves: Int32Array | null;
  /** @internal */
  readonly shared: SharedCaches;
  /** @internal lazily built inverse of `order` */
  posCache: Int32Array | null;
}

function grow<T extends Uint8Array | Int32Array>(a: T, need: number): T {
  if (a.length >= need) return a;
  const b = new (a.constructor as new (n: number) => T)(Math.max(need, a.length * 2));
  b.set(a);
  return b;
}

/**
 * Stable LSD counting sort of `order` by every level's group rank (deepest
 * first). Used when the input is not ordered by the group keys (no sort
 * module, group-by-format labels, custom comparers).
 */
export function sortByLevels(order: Int32Array, levels: readonly GroupLevel[]): Int32Array<ArrayBufferLike> {
  const m = order.length;
  let src: Int32Array<ArrayBufferLike> = order;
  let dst: Int32Array<ArrayBufferLike> = new Int32Array(m);
  let spare: Int32Array<ArrayBufferLike> | null = null;
  for (let k = levels.length - 1; k >= 0; k--) {
    const level = levels[k] as GroupLevel;
    const ranks = level.rowRank();
    const count = level.rankCount;
    const buckets = new Int32Array(count + 1);
    const top = count - 1;
    if (level.desc) {
      for (let i = 0; i < m; i++) buckets[top - (ranks[src[i] as number] as number) + 1]!++;
      for (let b = 1; b <= count; b++) buckets[b]! += buckets[b - 1] as number;
      for (let i = 0; i < m; i++) {
        const r = src[i] as number;
        dst[buckets[top - (ranks[r] as number)]!++] = r;
      }
    } else {
      for (let i = 0; i < m; i++) buckets[(ranks[src[i] as number] as number) + 1]!++;
      for (let b = 1; b <= count; b++) buckets[b]! += buckets[b - 1] as number;
      for (let i = 0; i < m; i++) {
        const r = src[i] as number;
        dst[buckets[ranks[r] as number]!++] = r;
      }
    }
    const done = dst;
    dst = src === order ? (spare ??= new Int32Array(m)) : src;
    src = done;
  }
  return src === order ? order.slice() : src;
}

/**
 * Builds the group tree over `order` (data positions -> source indexes).
 * Returns null when `order` is not grouped (a key reappears out of order);
 * the caller then sorts with `sortByLevels` and builds again.
 */
export function buildGroupTree(
  order: Int32Array,
  sourceCount: number,
  sourceIds: readonly RowId[],
  levels: readonly GroupLevel[],
  resorted: boolean,
): GroupTree | null {
  const D = levels.length;
  const m = order.length;
  const ranks = levels.map((l) => l.rowRank());
  const desc = levels.map((l) => l.desc);
  let cap = 64;
  let level = new Uint8Array(cap);
  let parent = new Int32Array(cap);
  let next = new Int32Array(cap);
  let rank = new Int32Array(cap);
  let start = new Int32Array(cap);
  let size = new Int32Array(cap);
  let leaves = new Int32Array(cap);
  let leafCount = 0;
  const open = new Int32Array(D).fill(-1);
  const leafOf = new Int32Array(sourceCount).fill(-1);
  let G = 0;
  let prev = -1;
  for (let i = 0; i < m; i++) {
    const r = order[i] as number;
    let d = 0;
    if (i > 0) {
      // Fast path: same deepest key usually means the same group chain.
      while (d < D && (ranks[d] as Int32Array)[r] === (ranks[d] as Int32Array)[prev]) d++;
      if (d === D) {
        leafOf[r] = open[D - 1] as number;
        prev = r;
        continue;
      }
      const a = (ranks[d] as Int32Array)[prev] as number;
      const b = (ranks[d] as Int32Array)[r] as number;
      if (desc[d] ? b > a : b < a) return null;
      for (let k = D - 1; k >= d; k--) {
        const g = open[k] as number;
        size[g] = i - (start[g] as number);
        next[g] = G;
      }
    }
    if (G + D > cap) {
      cap = Math.max(cap * 2, G + D);
      level = grow(level, cap);
      parent = grow(parent, cap);
      next = grow(next, cap);
      rank = grow(rank, cap);
      start = grow(start, cap);
      size = grow(size, cap);
    }
    for (let k = d; k < D; k++) {
      const g = G++;
      level[g] = k;
      parent[g] = k === 0 ? -1 : (open[k - 1] as number);
      rank[g] = (ranks[k] as Int32Array)[r] as number;
      start[g] = i;
      open[k] = g;
    }
    const leaf = open[D - 1] as number;
    if (leafCount >= leaves.length) leaves = grow(leaves, leafCount + 1);
    leaves[leafCount++] = leaf;
    leafOf[r] = leaf;
    prev = r;
  }
  if (m > 0) {
    for (let k = D - 1; k >= 0; k--) {
      const g = open[k] as number;
      size[g] = m - (start[g] as number);
      next[g] = G;
    }
  }
  return {
    depth: D,
    count: G,
    levels,
    level: level.subarray(0, G),
    parent: parent.subarray(0, G),
    next: next.subarray(0, G),
    rank: rank.subarray(0, G),
    start: start.subarray(0, G),
    size: size.subarray(0, G),
    leaves: leaves.subarray(0, leafCount),
    order,
    dataCount: m,
    leafOf,
    sourceIds,
    resorted,
    base: null,
    changedLeaves: null,
    shared: { pathKeys: [], byKey: new Map() },
    posCache: null,
  };
}

/** Position of every source row in `tree.order` (-1 when absent), built once per tree. */
export function positionsOf(tree: GroupTree): Int32Array {
  let pos = tree.posCache;
  if (!pos) {
    pos = new Int32Array(tree.leafOf.length).fill(-1);
    const order = tree.order;
    for (let i = 0; i < order.length; i++) pos[order[i] as number] = i;
    tree.posCache = pos;
  }
  return pos;
}

/** Children of `g` (or the top-level groups for g = -1), in order. */
export function childrenOf(tree: GroupTree, g: number): number[] {
  const out: number[] = [];
  const end = g < 0 ? tree.count : (tree.next[g] as number);
  for (let c = g + 1; c < end; c = tree.next[c] as number) out.push(c);
  return out;
}

/** Whether `g` is a leaf group (deepest level). */
export function isLeaf(tree: GroupTree, g: number): boolean {
  return (tree.level[g] as number) === tree.depth - 1;
}

// ---------------------------------------------------------------------------
// Keys and ids
// ---------------------------------------------------------------------------

/** JSON form of a group key value: dates as ISO strings, NaN/undefined as null. */
export function jsonKey(value: unknown): Json {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  return String(value);
}

/** Code of the group's key at its level (the code of its first row). */
export function groupCode(tree: GroupTree, g: number): number {
  const level = tree.levels[tree.level[g] as number] as GroupLevel;
  return (level.rowCodes ?? level.keys.codes)[tree.order[tree.start[g] as number] as number] as number;
}

/** Raw key value of a group (the first row's value, or the group-by-format label). */
export function groupValue(tree: GroupTree, g: number): unknown {
  const level = tree.levels[tree.level[g] as number] as GroupLevel;
  const code = groupCode(tree, g);
  if (level.keyValues) return level.keyValues[code];
  return level.label ? level.label(code) : level.keys.values[code];
}

/** Serialized group path, e.g. `[["city","Tokyo"],["active",true]]`; stable across data versions. */
export function groupPathKey(tree: GroupTree, g: number): string {
  const cache = tree.shared.pathKeys;
  let key = cache[g];
  if (key !== undefined) return key;
  const level = tree.level[g] as number;
  const seg = JSON.stringify([(tree.levels[level] as GroupLevel).columnId, jsonKey(groupValue(tree, g))]);
  const p = tree.parent[g] as number;
  key = p < 0 ? `[${seg}]` : `${groupPathKey(tree, p).slice(0, -1)},${seg}]`;
  cache[g] = key;
  tree.shared.byKey.set(key, g);
  return key;
}

export const GROUP_ID_PREFIX = '__g:';
export const GROUP_FOOTER_ID_PREFIX = '__gf:';

export function groupRowId(tree: GroupTree, g: number): RowId {
  return GROUP_ID_PREFIX + groupPathKey(tree, g);
}

/** Parses a path key; null when malformed. */
export function parsePathKey(key: string): [ColumnId, Json][] | null {
  try {
    const parsed = JSON.parse(key) as unknown;
    if (!Array.isArray(parsed)) return null;
    for (const seg of parsed) if (!Array.isArray(seg) || seg.length !== 2 || typeof seg[0] !== 'string') return null;
    return parsed as [ColumnId, Json][];
  } catch {
    return null;
  }
}

/** Group index of a path key, or -1. Descends level by level; results are cached per structure. */
export function findGroup(tree: GroupTree, key: string): number {
  const hit = tree.shared.byKey.get(key);
  if (hit !== undefined) return hit;
  const path = parsePathKey(key);
  if (!path || path.length === 0 || path.length > tree.depth) return -1;
  let g = -1;
  for (let d = 0; d < path.length; d++) {
    const [columnId, want] = path[d] as [ColumnId, Json];
    if ((tree.levels[d] as GroupLevel).columnId !== columnId) return -1;
    const wanted = JSON.stringify(want);
    const end = g < 0 ? tree.count : (tree.next[g] as number);
    let found = -1;
    for (let c = g + 1; c < end; c = tree.next[c] as number) {
      if (JSON.stringify(jsonKey(groupValue(tree, c))) === wanted) {
        found = c;
        break;
      }
    }
    if (found < 0) return -1;
    g = found;
  }
  // Canonical key form (key order, spacing) maps to the same group.
  groupPathKey(tree, g);
  if (!tree.shared.byKey.has(key)) tree.shared.byKey.set(key, g);
  return g;
}

/** Group path of `g` as segments. */
export function groupPath(tree: GroupTree, g: number): { columnId: ColumnId; key: Json }[] {
  const chain: number[] = [];
  for (let x = g; x >= 0; x = tree.parent[x] as number) chain.push(x);
  chain.reverse();
  return chain.map((x) => ({ columnId: (tree.levels[tree.level[x] as number] as GroupLevel).columnId, key: jsonKey(groupValue(tree, x)) }));
}

// ---------------------------------------------------------------------------
// Incremental update
// ---------------------------------------------------------------------------

/** Carries `leafOf` to the new index space; appended rows start at -1. */
function carryLeafOf(previous: Int32Array, delta: RowDelta): Int32Array {
  const map = mappedIndexes(delta);
  if (map) {
    // Reorder: carried rows take their leaf to the new index; the rest start at -1.
    const moved = new Int32Array(delta.count).fill(-1);
    for (let i = 0; i < map.length; i++) {
      const m = map[i] as number;
      if (m >= 0) moved[m] = previous[i] as number;
    }
    return moved;
  }
  const out = new Int32Array(delta.count).fill(-1, delta.previousCount - delta.removed.length);
  const removed = delta.removed;
  if (removed.length === 0) {
    out.set(previous.subarray(0, Math.min(previous.length, delta.count)));
    return out;
  }
  let w = 0;
  let from = 0;
  for (let i = 0; i < removed.length; i++) {
    const r = removed[i] as number;
    if (r > from) out.set(previous.subarray(from, r), w);
    w += r - from;
    from = r + 1;
  }
  if (from < delta.previousCount) out.set(previous.subarray(from, delta.previousCount), w);
  return out;
}

/**
 * Updates `previous` for a small data change: the changed rows leave their
 * old leaf group and join the leaf matching their new keys; only the sizes
 * along those group chains change, then starts are re-derived in one O(groups)
 * pass. Returns null (full rebuild) when a group would appear or vanish or a
 * level's ranks changed.
 *
 * `isMember(r)` tells whether new source index `r` is in the new order.
 */
export function updateGroupTree(
  previous: GroupTree,
  order: Int32Array,
  sourceIds: readonly RowId[],
  levels: readonly GroupLevel[],
  delta: RowDelta,
  isMember: (r: number) => boolean,
): GroupTree | null {
  if (previous.resorted || levels.length !== previous.depth) return null;
  const D = previous.depth;
  for (let d = 0; d < D; d++) {
    const a = levels[d] as GroupLevel;
    const b = previous.levels[d] as GroupLevel;
    if (a.label || b.label || a.columnId !== b.columnId || a.desc !== b.desc || a.keys !== b.keys || a.rankCount !== b.rankCount) return null;
  }
  const { parent, level, rank, leaves } = previous;
  const size = previous.size.slice();
  const changed: number[] = [];
  const dec = (g: number): void => {
    changed.push(g);
    for (let x = g; x >= 0; x = parent[x] as number) size[x]!--;
  };
  // Mapped deltas (reorders) list every row that is not carried in `removed`.
  for (const u of delta.removed) {
    const g = previous.leafOf[u] as number;
    if (g >= 0) dec(g);
  }
  for (const u of delta.updated) {
    const g = previous.leafOf[u] as number;
    if (g >= 0) dec(g);
  }
  const leafOf = carryLeafOf(previous.leafOf, delta);
  const dirty = dirtyRows(delta);
  const rowRanks = new Int32Array(D);
  const chain = new Int32Array(D);
  for (let i = 0; i < dirty.length; i++) {
    const r = dirty[i] as number;
    leafOf[r] = -1;
    if (!isMember(r)) continue;
    for (let d = 0; d < D; d++) {
      const l = levels[d] as GroupLevel;
      rowRanks[d] = l.codeRank[l.keys.codes[r] as number] as number;
    }
    // Binary search over the leaves: they are in group-key order.
    let lo = 0;
    let hi = leaves.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const leaf = leaves[mid] as number;
      for (let x = leaf; x >= 0; x = parent[x] as number) chain[level[x] as number] = x;
      let c = 0;
      for (let d = 0; d < D && c === 0; d++) {
        const gr = rank[chain[d] as number] as number;
        const rr = rowRanks[d] as number;
        c = (levels[d] as GroupLevel).desc ? gr - rr : rr - gr;
      }
      if (c === 0) {
        found = leaf;
        break;
      }
      if (c < 0) hi = mid - 1;
      else lo = mid + 1;
    }
    if (found < 0) return null; // a new group
    changed.push(found);
    for (let x = found; x >= 0; x = parent[x] as number) size[x]!++;
    leafOf[r] = found;
  }
  for (const g of changed) if ((size[g] as number) <= 0) return null; // a group vanished
  const G = previous.count;
  const start = new Int32Array(G);
  let pos = 0;
  for (let g = 0; g < G; g++) {
    start[g] = pos;
    if ((level[g] as number) === D - 1) pos += size[g] as number;
  }
  if (pos !== order.length) return null;
  changed.sort((a, b) => a - b);
  let u = 0;
  for (let i = 0; i < changed.length; i++) if (i === 0 || changed[i] !== changed[i - 1]) changed[u++] = changed[i] as number;
  changed.length = u;
  return {
    ...previous,
    levels,
    start,
    size,
    order,
    dataCount: order.length,
    leafOf,
    sourceIds,
    base: previous,
    changedLeaves: Int32Array.from(changed),
    posCache: null,
  };
}
