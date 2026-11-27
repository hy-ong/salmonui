// Tree index.
// Pure and grid-free: typed arrays over source indexes, O(n), no per-row
// objects, so the same code can serve a single-column TreeView or a
// TreeSelect. Two steps:
//
// 1. Parents: one `Int32Array` (source index -> parent source index, -1 for
//    roots) from nested rows (`parentsFromNested`, over the flat pre-order
//    array that `flattenTree` produces) or from flat self-referential rows
//    (`parentsFromIds`). Orphans become roots and cycles break at the first
//    repeated row; both are reported through `onIssue`.
// 2. Layout (`buildTreeLayout`): a pre-order over the rows kept by a mask,
//    siblings ordered by a priority list (the sort stage's order), with the
//    same `parent` / `next` (end of subtree) arrays the group tree uses.
//    Rows dropped by the mask re-parent their kept descendants to the nearest
//    kept ancestor.

/** A data problem found while resolving parents: an unknown parent id (`orphan`) or a parent chain that loops (`cycle`). */
export interface TreeIssue {
  readonly kind: 'orphan' | 'cycle';
  /** Source index of the row that became a root. */
  readonly index: number;
}

/**
 * Nested rows (`childrenField` arrays) as one flat pre-order array, rows by
 * reference (never copied). Iterative, so deep trees never overflow the
 * stack; a row that contains itself (a cycle in the nesting) is emitted once
 * and its looping child skipped (`onIssue` with kind `cycle`).
 */
export function flattenTree<Row>(roots: readonly Row[], childrenField: string, onIssue?: (issue: TreeIssue) => void): Row[] {
  const out: Row[] = [];
  const onPath = new Set<unknown>();
  // Explicit stack of (children array, next position).
  const lists: (readonly Row[])[] = [roots];
  const positions: number[] = [0];
  const owners: unknown[] = [null];
  while (lists.length) {
    const top = lists.length - 1;
    const list = lists[top] as readonly Row[];
    const at = positions[top] as number;
    if (at >= list.length) {
      lists.pop();
      positions.pop();
      onPath.delete(owners.pop());
      continue;
    }
    positions[top] = at + 1;
    const row = list[at] as Row;
    if (row === null || typeof row !== 'object') continue;
    if (onPath.has(row)) {
      onIssue?.({ kind: 'cycle', index: out.length - 1 });
      continue;
    }
    out.push(row);
    const children = (row as Record<string, unknown>)[childrenField];
    if (Array.isArray(children) && children.length) {
      onPath.add(row);
      lists.push(children as readonly Row[]);
      positions.push(0);
      owners.push(row);
    }
  }
  return out;
}

/**
 * Parents of nested rows that are already in flat pre-order (`flattenTree`
 * output). One parallel walk of the nesting and the flat array; when the
 * flat array is not exactly the flattening (rows appended by a patch, or
 * reordered), falls back to an identity map, O(n) either way. A child object
 * that is not in `rows` (a parent replaced with copies of its children) is
 * matched through `indexOfRow` (the row id) when given. Rows that are
 * nobody's child are roots.
 */
export function parentsFromNested(rows: readonly unknown[], childrenField: string, indexOfRow?: (row: unknown) => number): Int32Array {
  const n = rows.length;
  const parent = new Int32Array(n).fill(-1);
  // Fast path: rows[cursor] must be the next row of the pre-order walk.
  let ok = true;
  let cursor = 0;
  const stackRows: unknown[][] = [];
  const stackAt: number[] = [];
  const stackParent: number[] = [];
  outer: while (cursor < n) {
    const root = rows[cursor];
    const rootIndex = cursor++;
    const kids = childrenOf(root, childrenField);
    if (!kids) continue;
    stackRows.push(kids);
    stackAt.push(0);
    stackParent.push(rootIndex);
    while (stackRows.length) {
      const top = stackRows.length - 1;
      const list = stackRows[top] as unknown[];
      const at = stackAt[top] as number;
      if (at >= list.length) {
        stackRows.pop();
        stackAt.pop();
        stackParent.pop();
        continue;
      }
      stackAt[top] = at + 1;
      const child = list[at];
      if (child === null || typeof child !== 'object') continue;
      if (cursor >= n || rows[cursor] !== child) {
        ok = false;
        break outer;
      }
      const index = cursor++;
      parent[index] = stackParent[top] as number;
      const grand = childrenOf(child, childrenField);
      if (grand && stackRows.length < 65535) {
        stackRows.push(grand);
        stackAt.push(0);
        stackParent.push(index);
      }
    }
  }
  if (ok) return parent;
  parent.fill(-1);
  const at = new Map<unknown, number>();
  for (let i = 0; i < n; i++) if (!at.has(rows[i])) at.set(rows[i], i);
  for (let i = 0; i < n; i++) {
    const kids = childrenOf(rows[i], childrenField);
    if (!kids) continue;
    for (const child of kids) {
      const c = at.get(child) ?? (indexOfRow && child !== null && typeof child === 'object' ? indexOfRow(child) : -1);
      if (c !== undefined && c >= 0 && c !== i && parent[c] === -1) parent[c] = i;
    }
  }
  breakCycles(parent);
  return parent;
}

function childrenOf(row: unknown, field: string): unknown[] | null {
  if (row === null || typeof row !== 'object') return null;
  const kids = (row as Record<string, unknown>)[field];
  return Array.isArray(kids) && kids.length ? kids : null;
}

/**
 * Parents of flat self-referential rows. `parentIdOf(i)` returns row `i`'s
 * parent id (null for a root); `indexOf` resolves an id to a source index
 * (-1 when unknown, through the engine id index). Unknown ids make the row an
 * orphan root; a parent chain that loops is broken at the first repeated row,
 * which becomes a root.
 */
export function parentsFromIds(count: number, parentIdOf: (index: number) => string | null, indexOf: (id: string) => number, onIssue?: (issue: TreeIssue) => void): Int32Array {
  const parent = new Int32Array(count);
  // Siblings are often adjacent: the last lookup is reused.
  let lastId: string | null = null;
  let last = -1;
  for (let i = 0; i < count; i++) {
    const id = parentIdOf(i);
    if (id === null) {
      parent[i] = -1;
      continue;
    }
    const p = id === lastId ? last : (last = indexOf((lastId = id)));
    if (p < 0 || p >= count || p === i) {
      parent[i] = -1;
      onIssue?.({ kind: p === i ? 'cycle' : 'orphan', index: i });
    } else parent[i] = p;
  }
  breakCycles(parent, onIssue);
  return parent;
}

/** Breaks every parent cycle at the first repeated row (it becomes a root). O(n): each row is walked once. */
function breakCycles(parent: Int32Array, onIssue?: (issue: TreeIssue) => void): void {
  const n = parent.length;
  // 0 unvisited, 1 on the current walk, 2 resolved (reaches a root).
  const mark = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (mark[i]) continue;
    let v = i;
    while (v >= 0 && mark[v] === 0) {
      mark[v] = 1;
      v = parent[v] as number;
    }
    if (v >= 0 && mark[v] === 1) {
      // `v` repeats on this walk: it closes a cycle and becomes a root.
      parent[v] = -1;
      onIssue?.({ kind: 'cycle', index: v });
    }
    // Walk the path again (it now ends at a root or a resolved row).
    for (let u = i; u >= 0 && mark[u] === 1; u = parent[u] as number) mark[u] = 2;
  }
}

/** Pre-order layout of the kept rows of a tree. Arrays named `by slot` are indexed by pre-order slot, the others by source index. */
export interface TreeLayout {
  /** Source rows the layout was built over. */
  readonly sourceCount: number;
  /** Kept rows (slots). */
  readonly count: number;
  /** By slot: source index. */
  readonly order: Int32Array;
  /** Source index -> slot, or -1 when the row is not kept. */
  readonly slot: Int32Array;
  /** By slot: first slot after the subtree. */
  readonly next: Int32Array;
  /** Effective parent (nearest kept ancestor) source index, or -1 for a root. */
  readonly parent: Int32Array;
  readonly depth: Uint16Array;
  /** Kept children. */
  readonly childCount: Int32Array;
  /** 1-based ordinal among kept siblings (`aria-posinset`; 0: not kept). Built on first read. */
  readonly posinset: Int32Array;
  /** Kept siblings including the row (`aria-setsize`; 0: not kept). Built on first read. */
  readonly setsize: Int32Array;
  /** Slots of the root rows, ascending. */
  readonly roots: Int32Array;
}

class Layout implements TreeLayout {
  readonly sourceCount: number;
  readonly count: number;
  readonly order: Int32Array;
  readonly slot: Int32Array;
  readonly next: Int32Array;
  readonly parent: Int32Array;
  readonly depth: Uint16Array;
  readonly roots: Int32Array;
  #kids: Int32Array | null;
  #pos: Int32Array | null = null;
  #size: Int32Array | null = null;
  /** By slot: parent slot + 1 (`resort`). */
  #up: Int32Array | null = null;

  constructor(order: Int32Array, slot: Int32Array, next: Int32Array, parent: Int32Array, depth: Uint16Array, childCount: Int32Array | null, roots: Int32Array, up: Int32Array | null = null) {
    this.sourceCount = parent.length;
    this.count = order.length;
    this.order = order;
    this.slot = slot;
    this.next = next;
    this.parent = parent;
    this.depth = depth;
    this.#kids = childCount;
    this.roots = roots;
    this.#up = up;
  }

  get childCount(): Int32Array {
    if (!this.#kids) {
      const { order, parent } = this;
      const kids = new Int32Array(this.sourceCount);
      for (let a = 0; a < order.length; a++) {
        const p = parent[order[a] as number] as number;
        if (p >= 0) kids[p]!++;
      }
      this.#kids = kids;
    }
    return this.#kids;
  }

  get posinset(): Int32Array {
    if (!this.#pos) {
      // Siblings are a `next` chain from the first child (or the roots list).
      const { order, next, roots } = this;
      const pos = new Int32Array(this.sourceCount);
      for (let i = 0; i < roots.length; i++) pos[order[roots[i] as number] as number] = i + 1;
      for (let a = 0; a < order.length; a++) {
        const end = next[a] as number;
        for (let c = a + 1, k = 1; c < end; c = next[c] as number) pos[order[c] as number] = k++;
      }
      this.#pos = pos;
    }
    return this.#pos;
  }

  get setsize(): Int32Array {
    if (!this.#size) {
      const { order, parent } = this;
      const kids = this.childCount;
      const size = new Int32Array(this.sourceCount);
      const r = this.roots.length;
      for (let a = 0; a < order.length; a++) {
        const s = order[a] as number;
        const p = parent[s] as number;
        size[s] = p < 0 ? r : (kids[p] as number);
      }
      this.#size = size;
    }
    return this.#size;
  }

  #scratch: [Int32Array, Int32Array] | null = null;
  /** The layout whose scratch buffers this one uses (`share`). */
  #shared: Layout | null = null;

  /** Two buffers reused by every `resort` call: the first zeroed (`sourceCount + 1`), the second dirty. */
  scratch(): [Int32Array, Int32Array] {
    if (this.#shared) return this.#shared.scratch();
    const s = (this.#scratch ??= [new Int32Array(this.sourceCount + 1), new Int32Array(this.sourceCount)]);
    s[0].fill(0);
    return s;
  }

  kids(): Int32Array | null {
    return this.#kids;
  }

  /** Uses the scratch buffers of `other` (same source rows), allocated on the first `scratch()` call. */
  share(other: Layout): this {
    this.#shared = other.#shared ?? other;
    return this;
  }

  get up(): Int32Array {
    if (!this.#up) {
      const { order, slot, parent } = this;
      const up = new Int32Array(order.length);
      for (let i = 0; i < order.length; i++) up[i] = (slot[parent[order[i] as number] as number] ?? -1) + 1;
      this.#up = up;
    }
    return this.#up;
  }
}

const CAP = 64;

/** `spliceTreeLayout`: a 1,024-index block that is not inside one run of the map. */
const MIXED = 0x7fffffff;

/** Kept children of the row at `slot`, or -1 past `CAP` (`next` chain walk). */
function kidsAt(next: Int32Array, slot: number): number {
  let k = 0;
  for (let c = slot + 1, end = next[slot] as number; c < end; c = next[c] as number) if (++k > CAP) return -1;
  return k;
}

/**
 * `[childCount, posinset, setsize]` of a kept row (source index): short
 * sibling walks, falling back to the layout's arrays (built on first read)
 * for wide sibling lists, so per-row reads stay O(1) amortized without an
 * O(n) pass per layout.
 */
export function siblingInfo(layout: TreeLayout, s: number): readonly [number, number, number] {
  const { slot, next, roots } = layout;
  const a = slot[s] as number;
  if (a < 0) return [0, 0, 0];
  let kids = kidsAt(next, a);
  if (kids < 0) kids = layout.childCount[s] as number;
  const p = layout.parent[s] as number;
  if (p < 0) {
    let lo = 0;
    let hi = roots.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if ((roots[mid] as number) < a) lo = mid + 1;
      else hi = mid;
    }
    return [kids, lo + 1, roots.length];
  }
  const b = slot[p] as number;
  let pos = 1;
  for (let c = b + 1; c < a && pos <= CAP; c = next[c] as number) pos++;
  if (pos > CAP) pos = layout.posinset[s] as number;
  let size = kidsAt(next, b);
  if (size < 0) size = layout.childCount[p] as number;
  return [kids, pos, size];
}

/** Effective parents: nearest kept ancestor (path-compressed walk up). */
function nearestKept(parent: Int32Array, keep: Uint8Array): Int32Array {
  const n = parent.length;
  const eff = new Int32Array(n).fill(-2);
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (eff[i] !== -2) continue;
    let v = i;
    // Collect rows whose effective parent is unknown, up to a resolved one.
    while (v >= 0 && eff[v] === -2) {
      stack.push(v);
      v = parent[v] as number;
    }
    // `v` is -1 or resolved; walk back down assigning.
    let above = v < 0 ? -1 : keep[v] ? v : (eff[v] as number);
    for (let k = stack.length - 1; k >= 0; k--) {
      const u = stack[k] as number;
      eff[u] = above;
      if (keep[u]) above = u;
    }
    stack.length = 0;
  }
  return eff;
}

/** Source sibling order layout of the rows kept by `keep` under `parent` (already effective parents). */
function sourceLayout(parent: Int32Array, keep: Uint8Array | null): Layout {
  const n = parent.length;
  // Children of p are kids[heads[p + 1] .. heads[p + 2]) (bucket 0: roots).
  const heads = new Int32Array(n + 2);
  let kept = 0;
  for (let s = 0; s < n; s++) {
    if (keep && !keep[s]) continue;
    heads[(parent[s] as number) + 2]!++;
    kept++;
  }
  for (let p = 1; p < n + 2; p++) heads[p]! += heads[p - 1] as number;
  // Filled backwards so each bucket stays in source order and `cur[p + 1]` ends at its first child.
  const cur = heads.slice(1);
  const kids = new Int32Array(kept);
  for (let s = n - 1; s >= 0; s--) if (!keep || keep[s]) kids[--cur[(parent[s] as number) + 1]!] = s;
  const order = new Int32Array(kept);
  const slot = new Int32Array(n).fill(-1);
  const next = new Int32Array(kept);
  const depth = new Uint16Array(n);
  const childCount = new Int32Array(n);
  const roots = new Int32Array((heads[1] as number) - (heads[0] as number));
  const stack = new Int32Array(kept + 1);
  const up = new Int32Array(kept);
  let w = 0;
  let r = 0;
  let top = 0;
  stack[0] = -1;
  while (top >= 0) {
    const p = stack[top] as number;
    const at = cur[p + 1] as number;
    if (at >= (heads[p + 2] as number)) {
      if (p >= 0) next[slot[p] as number] = w;
      top--;
      continue;
    }
    cur[p + 1] = at + 1;
    const s = kids[at] as number;
    order[w] = s;
    slot[s] = w;
    if (p < 0) roots[r++] = w;
    else {
      depth[s] = Math.min(65535, (depth[p] as number) + 1);
      up[w] = (slot[p] as number) + 1;
    }
    const c = (heads[s + 2] as number) - (heads[s + 1] as number);
    childCount[s] = c;
    w++;
    if (c > 0) stack[++top] = s;
    else next[w - 1] = w;
  }
  return new Layout(order, slot, next, parent, depth, childCount, roots, up);
}

/** Set entries of a 0 / 1 mask. */
function countKept(keep: Uint8Array): number {
  let w = 0;
  for (let s = 0; s < keep.length; s++) w += keep[s] as number;
  return w;
}

/**
 * Kept rows of the base pre-order into `order`, their base slots into
 * `next`. Returns the kept count.
 */
function keptPreorder(bo: Int32Array, keep: Uint8Array, order: Int32Array, next: Int32Array): number {
  let k = 0;
  for (let i = 0; i < bo.length; i++) {
    const s = bo[i] as number;
    if (!keep[s]) continue;
    order[k] = s;
    next[k++] = i;
  }
  return k;
}

/**
 * `slot` and `next` of the kept rows (`next` holds their base slots on
 * entry); the root slots go to `roots`. A kept row's `next` is the first
 * kept slot at or after its base subtree end; the open kept rows form the
 * ancestor chain, a stack as deep as the tree. False when a kept row's
 * parent is not kept.
 */
function linkKept(order: Int32Array, next: Int32Array, w: number, bn: Int32Array, parent: Int32Array, keep: Uint8Array, slot: Int32Array, roots: number[]): boolean {
  // Open kept rows (slot, base subtree end), innermost on top; grows past 64 levels.
  let openSlot = new Int32Array(64);
  let openEnd = new Int32Array(64);
  let top = 0;
  for (let k = 0; k < w; k++) {
    const s = order[k] as number;
    const i = next[k] as number;
    const p = parent[s] as number;
    if (p >= 0 && !keep[p]) return false;
    while (top > 0 && (openEnd[top - 1] as number) <= i) next[openSlot[--top] as number] = k;
    if (p < 0) roots.push(k);
    slot[s] = k;
    if (top === openSlot.length) {
      const grownSlot = new Int32Array(top * 2);
      const grownEnd = new Int32Array(top * 2);
      grownSlot.set(openSlot);
      grownEnd.set(openEnd);
      openSlot = grownSlot;
      openEnd = grownEnd;
    }
    openSlot[top] = k;
    openEnd[top++] = bn[i] as number;
  }
  while (top > 0) next[openSlot[--top] as number] = w;
  return true;
}

/**
 * The rows of `base` kept by an ancestor closed `keep`, in base order: the
 * kept pre-order is a subsequence of the base pre-order, so one
 * pass over the base slots and a pass over the kept rows build it with no
 * tree walk and no scratch buffer to clear (a cold 1M filter allocated and
 * zeroed 8 MB more). The loops are small functions of their own: called
 * once per query, a loop inside one large function ran in the baseline tier
 * on every cold query until its on-stack replacement compiled. Null when
 * `keep` is not closed under ancestors.
 */
function subsequence(base: Layout, keep: Uint8Array): Layout | null {
  const n = base.sourceCount;
  if (base.count !== n || keep.length !== n) return null;
  const w = countKept(keep);
  const order = new Int32Array(w);
  const next = new Int32Array(w);
  if (keptPreorder(base.order, keep, order, next) !== w) return null;
  const slot = new Int32Array(n).fill(-1);
  const roots: number[] = [];
  if (!linkKept(order, next, w, base.next, base.parent, keep, slot, roots)) return null;
  return new Layout(order, slot, next, base.parent, base.depth, null, Int32Array.from(roots)).share(base);
}

/**
 * `base` with siblings in `priority` order: each row's offset among its
 * siblings from the subtree sizes, then one pass over the base pre-order
 * (parents first) turns offsets into slots. Typed arrays only, the hot loop
 * write-only (a read-before-write check costs 2-3x at 1M rows) and the second
 * pass in base slot order. A priority that is not a permutation of the base
 * rows is completed first (repeats dropped, missing rows in source order).
 */
function resort(base: Layout, priority: Int32Array): Layout {
  const n = base.sourceCount;
  const m = base.count;
  const { order: bo, next: bn, slot: bs, up } = base;
  const seen = new Uint8Array(n);
  let w = 0;
  for (let i = 0; i < priority.length; i++) {
    const s = priority[i] as number;
    if (!(s >= 0 && s < n) || seen[s] || (bs[s] as number) < 0) break;
    seen[s] = 1;
    w++;
  }
  if (w < m || priority.length !== m) {
    const full = new Int32Array(m);
    seen.fill(0);
    w = 0;
    for (let i = 0; i < priority.length + n; i++) {
      const s = i < priority.length ? (priority[i] as number) : i - priority.length;
      if (s >= 0 && s < n && !seen[s] && (bs[s] as number) >= 0) {
        seen[s] = 1;
        full[w++] = s;
      }
    }
    priority = full;
  }
  // Scratch kept by the base: sibling cursors, and by base slot the offset among the siblings, then the slot.
  const [acc, at] = base.scratch();
  const roots = new Int32Array(base.roots.length);
  let r = 0;
  for (let i = 0; i < m; i++) {
    const b = bs[priority[i] as number] as number;
    const u = up[b] as number;
    const o = acc[u] as number;
    at[b] = o;
    acc[u] = o + (bn[b] as number) - b;
    if (u === 0) roots[r++] = o;
  }
  const order = new Int32Array(m);
  const next = new Int32Array(m);
  const slot = new Int32Array(n);
  if (m < n) slot.fill(-1);
  for (let i = 0; i < m; i++) {
    const u = up[i] as number;
    const a = (at[i] as number) + (u === 0 ? 0 : (at[u - 1] as number) + 1);
    at[i] = a;
    const s = bo[i] as number;
    slot[s] = a;
    order[a] = s;
    next[a] = a + (bn[i] as number) - i;
  }
  return new Layout(order, slot, next, base.parent, base.depth, base.kids(), roots);
}

/**
 * Builds the pre-order of the rows kept by `keep` (null: every row).
 * `priority` lists source indexes in sibling order (the sort stage's order;
 * null: source order); kept rows missing from it follow in source order.
 * Rows whose parent is not kept hang under the nearest kept ancestor (root
 * when none). `base`, the source order layout of every row under `parent`
 * (`buildTreeLayout(parent, null, null)`), makes a re-order or an ancestor
 * closed filter (`filterMode` `'ancestors'` / `'both'`) skip the tree walk.
 * O(n).
 */
export function buildTreeLayout(parent: Int32Array, priority: Int32Array | null, keep: Uint8Array | null, base?: TreeLayout | null): TreeLayout {
  let layout = base instanceof Layout && base.count === parent.length && base.sourceCount === parent.length ? base : null;
  if (layout && keep) layout = subsequence(layout, keep);
  layout ??= sourceLayout(keep ? nearestKept(parent, keep) : parent, keep);
  return priority ? resort(layout, priority) : layout;
}

/**
 * The source order layout after a few rows changed parent or position
 * (moves, indent / outdent, parent id edits), without re-resolving
 * any parent or walking the tree. `base` is the full source order layout of
 * the previous rows (`buildTreeLayout(parent, null, null)`); `map` carries it
 * to the new source indexes (previous -> new; null: same indexes; a -1
 * entry, a row the map does not carry, is looked up in `moved`, so together
 * they form a permutation). Then each `moves[i] = [row, parent]` (new indexes, -1: root) cuts
 * the row's subtree, a contiguous block of the pre-order, and splices it in
 * under `parent` at its source order place among the siblings. Each splice
 * rewrites only the slots between the block and its new place plus the
 * ancestors' ends; the rest is native array copies. Rows of later moves are
 * skipped when placing earlier ones, so siblings end in source order. Null
 * when a parent lies inside the moved subtree (a cycle; the caller rebuilds).
 */
export function spliceTreeLayout(base: TreeLayout, map: Int32Array | null, moved: ReadonlyMap<number, number> | null, moves: readonly (readonly [number, number])[]): TreeLayout | null {
  const n = base.sourceCount;
  const m = base.count;
  if (m !== n) return null;
  const { order: bo, slot: bs, depth: bd, parent: bp } = base;
  // Working arrays, owned (written in place): by slot `ord` / `nxt`, by source the rest.
  let ord: Int32Array;
  let slot: Int32Array;
  let depth: Uint16Array;
  let cur: Int32Array;
  if (map) {
    // Rows the map does not carry, by previous index (few).
    const off = (i: number): number => moved?.get(i) ?? -1;
    slot = new Int32Array(n);
    depth = new Uint16Array(n);
    // A move map is a few runs of consecutive indexes: native block copies, and an offset per
    // 1,024-index block inside one run (`shift`), so remapping a value rarely reads the 1M map.
    const shift = new Int32Array((n >> 10) + 1).fill(MIXED);
    for (let i = 0; i < n; ) {
      let j = map[i] as number;
      let k = i + 1;
      if (j >= 0) while (k < n && map[k] === j + (k - i)) k++;
      else if ((j = off(i)) < 0) return null;
      if (k - i > 8) {
        slot.set(bs.subarray(i, k), j);
        depth.set(bd.subarray(i, k), j);
        for (let blk = (i + 1023) >> 10; (blk + 1) << 10 <= k; blk++) shift[blk] = j - i;
      } else {
        for (let x = i; x < k; x++) {
          slot[j + x - i] = bs[x] as number;
          depth[j + x - i] = bd[x] as number;
        }
      }
      i = k;
    }
    // Inline remaps (hot loops); rows the map does not carry read -1 here and are fixed below.
    ord = new Int32Array(m);
    for (let x = 0; x < m; x++) {
      const v = bo[x] as number;
      const t = shift[v >> 10] as number;
      ord[x] = t !== MIXED ? v + t : (map[v] as number);
    }
    cur = new Int32Array(n);
    for (let i = 0; i < n; i++) {
      const t = shift[i >> 10] as number;
      const j = t !== MIXED ? i + t : (map[i] as number);
      const p = bp[i] as number;
      if (p < 0) cur[j] = -1;
      else {
        const u = shift[p >> 10] as number;
        cur[j] = u !== MIXED ? p + u : (map[p] as number);
      }
    }
    if (moved) {
      const to = (v: number): number => {
        const j = map[v] as number;
        return j >= 0 ? j : off(v);
      };
      for (const [p, j] of moved) {
        const a = bs[p] as number;
        ord[a] = j;
        const q = bp[p] as number;
        cur[j] = q < 0 ? -1 : to(q);
        // Its children (and only they) point at it.
        for (let c = a + 1, end = base.next[a] as number; c < end; c = base.next[c] as number) cur[to(bo[c] as number)] = j;
      }
    }
  } else {
    ord = bo.slice();
    slot = bs.slice();
    depth = bd.slice();
    cur = bp.slice();
  }
  let nxt: Int32Array | null = null;
  let roots = base.roots;
  const pending = moves.length > 1 ? new Set<number>(moves.map((mv) => mv[0])) : null;
  for (const [d, P] of moves) {
    pending?.delete(d);
    const ends: Int32Array = nxt ?? base.next;
    const a = slot[d] as number;
    const e = ends[a] as number;
    const z = e - a;
    const ps = P < 0 ? -1 : (slot[P] as number);
    if (P >= 0 && ps >= a && ps < e) return null;
    // Boundary `b`: before the first other sibling with a larger source index, else the end of the parent's range.
    const end = P < 0 ? m : (ends[ps] as number);
    let b = end;
    for (let c = ps + 1; c < end; c = ends[c] as number) {
      if (c === a) continue;
      const s = ord[c] as number;
      if (pending?.has(s)) continue;
      if (s > d) {
        b = c;
        break;
      }
    }
    const oldP = cur[d] as number;
    // Cut coordinates (the block removed): boundary and parent slot. `bc === a`: the block keeps its slots.
    const bc = b <= a ? b : b - z;
    const pc = ps < a ? ps : ps - z;
    if (bc === a && oldP === P) continue;
    const lo = bc === a ? a : Math.min(a, b);
    const hi = bc === a ? a : Math.max(e, b);
    // Ancestors before the region (of the block's old place and of its new one): only their ends change.
    const ancestors: number[] = [];
    for (let u = oldP; u >= 0; u = cur[u] as number) {
      const x = slot[u] as number;
      if (x < lo) ancestors.push(x);
    }
    for (let u = P; u >= 0; u = cur[u] as number) {
      const x = slot[u] as number;
      if (x < lo) ancestors.push(x);
    }
    nxt ??= base.next.slice();
    if (lo < hi) {
      // Rotate the region natively, then rewrite its ends and slots in the new coordinates.
      const block = ord.slice(a, e);
      const blockEnds = nxt.slice(a, e);
      if (b > e) {
        ord.copyWithin(a, e, b);
        nxt.copyWithin(a, e, b);
      } else {
        ord.copyWithin(b + z, b, a);
        nxt.copyWithin(b + z, b, a);
      }
      ord.set(block, bc);
      nxt.set(blockEnds, bc);
      for (let y = lo; y < hi; y++) {
        const E = nxt[y] as number;
        if (y >= bc && y < bc + z) nxt[y] = bc + (E - a);
        else {
          const sc = y < bc ? y : y - z;
          const c = E <= a ? E : E - z;
          nxt[y] = c < bc ? c : c > bc ? c + z : sc <= pc ? bc + z : bc;
        }
        slot[ord[y] as number] = y;
      }
    }
    for (const x of ancestors) {
      const E = nxt[x] as number;
      const c = E <= a ? E : E - z;
      nxt[x] = c < bc ? c : c > bc ? c + z : x <= pc ? bc + z : bc;
    }
    // Root slots move with the region; the block's root slot leaves or joins.
    if (lo < hi || P < 0 || oldP < 0) {
      const out: number[] = [];
      for (let r = 0; r < roots.length; r++) {
        const x = roots[r] as number;
        if (x === a && oldP < 0) continue;
        if (x < lo || x >= hi) out.push(x);
        else {
          const sc = x < a ? x : x - z;
          out.push(sc < bc ? sc : sc + z);
        }
      }
      if (P < 0) {
        out.push(bc);
        out.sort((x, y) => x - y);
      }
      roots = Int32Array.from(out);
    }
    // The block's depths follow its new parent.
    const shift = (P < 0 ? 0 : (depth[P] as number) + 1) - (depth[d] as number);
    if (shift !== 0) {
      for (let x = bc; x < bc + z; x++) {
        const s = ord[x] as number;
        depth[s] = Math.max(0, Math.min(65535, (depth[s] as number) + shift));
      }
    }
    cur[d] = P;
  }
  // Child counts are built on first read (`hasTreeChildren` answers the common question from `next`).
  return new Layout(ord, slot, nxt ?? base.next, cur, depth, null, roots);
}

/** True when the row (source index) has kept children in `layout`. O(1), without the `childCount` array. */
export function hasTreeChildren(layout: TreeLayout, s: number): boolean {
  const a = layout.slot[s] ?? -1;
  return a >= 0 && (layout.next[a] as number) > a + 1;
}

/** True when `ancestor` is a proper ancestor of `row` in `layout` (both source indexes). O(1). */
export function isAncestorOf(layout: TreeLayout, ancestor: number, row: number): boolean {
  const a = layout.slot[ancestor] ?? -1;
  const b = layout.slot[row] ?? -1;
  return a >= 0 && b > a && b < (layout.next[a] as number);
}

/** Source indexes of the kept descendants of a row, in pre-order (`[slot + 1, next)`). */
export function descendantsOf(layout: TreeLayout, row: number): Int32Array {
  const a = layout.slot[row] ?? -1;
  if (a < 0) return new Int32Array(0);
  return layout.order.subarray(a + 1, layout.next[a] as number);
}

/** Source indexes of the kept children of a row (`-1`: the roots), in sibling order. */
export function childrenIn(layout: TreeLayout, row: number): number[] {
  const out: number[] = [];
  if (row < 0) {
    for (let i = 0; i < layout.roots.length; i++) out.push(layout.order[layout.roots[i] as number] as number);
    return out;
  }
  const a = layout.slot[row] ?? -1;
  if (a < 0) return out;
  const end = layout.next[a] as number;
  for (let c = a + 1; c < end; c = layout.next[c] as number) out.push(layout.order[c] as number);
  return out;
}
