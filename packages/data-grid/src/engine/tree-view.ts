// Visible row model of tree mode. A collapsed row hides
// its subtree, and a subtree is one contiguous slot range of the kept
// pre-order (`TreeLayout`), so the visible rows are a sorted list of k slot
// ranges with prefix sums over their lengths: index -> row is a binary
// search, O(log k), and nothing is materialized per row. Building the ranges
// is one pass over the visible rows that jumps over collapsed subtrees
// (`buildVisibleRanges`); expand all is one O(n) pass, collapse all O(roots).
// Optional child summary rows (`__tf:<rowId>`, kind `groupFooter`) sit after
// the last visible descendant of each expanded parent; only their k
// positions are stored, as `DetailView` stores detail rows.

import type { TreeLayout } from './tree-index.js';
import type { RowId, RowKind, RowModelView, ViewRowInfo } from './types.js';

/** Id prefix of tree child summary rows. */
export const TREE_FOOTER_ID_PREFIX = '__tf:';

/** Visible slot ranges of a layout (grid-free). */
export interface TreeRanges {
  /** Range starts and ends (slots, `[start, end)`), ascending. */
  readonly starts: Int32Array;
  readonly ends: Int32Array;
  /** `prefix[r]`: visible data rows before range r; `prefix[k]` is the total. */
  readonly prefix: Int32Array;
  /** Visible data rows. */
  readonly total: number;
  /** Child summary rows: data rows before footer j (ascending; ties keep inner parents first). */
  readonly footerAt: Int32Array;
  /** Child summary rows: source index of the parent of footer j. */
  readonly footerOwner: Int32Array;
}

const EMPTY = new Int32Array(0);
const visibleOrders = new WeakMap<object, { readonly order: Int32Array; readonly sourceIds: readonly RowId[]; readonly dataCount: number }>();

/**
 * Visible ranges of `layout` where `expanded[s]` (by source index) opens a
 * row with kept children. With `footers`, a child summary row follows the
 * last visible descendant of every expanded parent. O(visible rows + k);
 * O(1) when `allOpen` says every row is expanded (no footers).
 */
export function buildVisibleRanges(layout: TreeLayout, expanded: Uint8Array, footers: boolean, allOpen = false): TreeRanges {
  const { order, next } = layout;
  const K = layout.count;
  if (allOpen && !footers) {
    const one = K > 0 ? Int32Array.of(0) : EMPTY;
    return { starts: one, ends: K > 0 ? Int32Array.of(K) : EMPTY, prefix: K > 0 ? Int32Array.of(0, K) : Int32Array.of(0), total: K, footerAt: EMPTY, footerOwner: EMPTY };
  }
  const starts: number[] = [];
  const ends: number[] = [];
  const fAt: number[] = [];
  const fOwner: number[] = [];
  const open: number[] = [];
  let s = 0;
  let p = 0;
  let rs = 0;
  while (s < K) {
    const src = order[s] as number;
    let jump = s + 1;
    if ((next[s] as number) > s + 1) {
      if (expanded[src]) {
        if (footers) open.push(s);
      } else jump = next[s] as number;
    }
    p++;
    if (jump !== s + 1) {
      starts.push(rs);
      ends.push(s + 1);
      rs = jump;
    }
    s = jump;
    if (footers) {
      while (open.length && (next[open[open.length - 1] as number] as number) <= s) {
        fAt.push(p);
        fOwner.push(order[open.pop() as number] as number);
      }
    }
  }
  if (rs < K) {
    starts.push(rs);
    ends.push(K);
  }
  const k = starts.length;
  const prefix = new Int32Array(k + 1);
  for (let r = 0; r < k; r++) prefix[r + 1] = (prefix[r] as number) + ((ends[r] as number) - (starts[r] as number));
  return {
    starts: Int32Array.from(starts),
    ends: Int32Array.from(ends),
    prefix,
    total: p,
    footerAt: fAt.length ? Int32Array.from(fAt) : EMPTY,
    footerOwner: fOwner.length ? Int32Array.from(fOwner) : EMPTY,
  };
}

/** Range containing data position `p` (largest r with prefix[r] <= p). */
function rangeOfPosition(ranges: TreeRanges, p: number): number {
  const prefix = ranges.prefix;
  let lo = 0;
  let hi = ranges.starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((prefix[mid] as number) <= p) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Slot of visible data position `p`. */
export function slotAtPosition(ranges: TreeRanges, p: number): number {
  const r = rangeOfPosition(ranges, p);
  return (ranges.starts[r] as number) + p - (ranges.prefix[r] as number);
}

/** Visible data position of a slot, or -1 when it is hidden by a collapsed ancestor. */
export function positionOfSlot(ranges: TreeRanges, slot: number): number {
  const starts = ranges.starts;
  let lo = 0;
  let hi = starts.length - 1;
  if (hi < 0 || slot < (starts[0] as number)) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] as number) <= slot) lo = mid;
    else hi = mid - 1;
  }
  if (slot >= (ranges.ends[lo] as number)) return -1;
  return (ranges.prefix[lo] as number) + slot - (starts[lo] as number);
}

/** First footer index with `footerAt > p` (or `>= p` when `inclusive` is false). */
function footersUpTo(at: Int32Array, p: number): number {
  let lo = 0;
  let hi = at.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((at[mid] as number) <= p) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Tree reads the selection, editing, and row drag modules use through
 * `treeOf(model)` (view-helpers.ts) without importing tree code: the full
 * (unfiltered) tree and the kept layout of the current query.
 */
export interface TreeStructure {
  /** Every source row (unfiltered, source sibling order). */
  readonly index: TreeLayout;
  /** Rows kept by the current query, in sorted sibling order. */
  readonly layout: TreeLayout;
  readonly sourceIds: readonly RowId[];
  /** Source index of a row id, or -1. */
  sourceIndexOf(rowId: RowId): number;
  /** `parentIdField` of flat data, or null for nested data. */
  readonly parentIdField: string | null;
  /** Parents come from the nesting (`childrenField`): moves keep the new parent through `tree.setParents`. */
  readonly nested?: boolean;
  /** Returns a copy of `row` with its parent set (flat data), or null when the shape cannot express it (moves then dispatch `tree.setParents`). */
  withParent(row: unknown, parentId: RowId | null): unknown;
}

/** The tree view's per-model data (shared by its paged views). */
export interface TreeViewModel {
  readonly structure: TreeStructure;
  /** By source index: 1 when the row is expanded. */
  readonly expanded: Uint8Array;
  /** By source index: 1 when the row matches the query (null: every kept row matches). Kept rows that do not match are context rows. */
  readonly match: Uint8Array | null;
  /** By source index: 1 when the row has children that are not loaded (lazy), or null. */
  readonly lazy: Uint8Array | null;
  readonly ranges: TreeRanges;
  /**
   * `root`: the page stage pages root rows. The unpaged view then reports
   * the root count as `dataCount` (the page stage's unit); its paged
   * windows report their data rows.
   */
  readonly pageBy: 'all' | 'root';
}

export class TreeView implements RowModelView {
  readonly kind = 'tree' as const;
  readonly model: TreeViewModel;
  readonly count: number;
  readonly dataCount: number;
  /** Data position window `[lo, hi)` and footer window `[f0, f1)`. */
  readonly lo: number;
  readonly hi: number;
  /** `[lo, hi)` (the page window over data positions; read by `dataIndexAt` / `dataRowIdAt` in view-helpers.ts). */
  readonly range: readonly [number, number];
  private readonly f0: number;
  private readonly f1: number;
  private byFooter: Map<RowId, number> | null = null;

  constructor(model: TreeViewModel, lo = 0, hi = model.ranges.total, paged = false) {
    this.model = model;
    const total = model.ranges.total;
    this.lo = Math.max(0, Math.min(lo, total));
    this.hi = Math.max(this.lo, Math.min(hi, total));
    this.range = [this.lo, this.hi];
    const at = model.ranges.footerAt;
    // Footers after a data row of the window: lo < footerAt <= hi.
    this.f0 = at.length ? footersUpTo(at, this.lo) : 0;
    this.f1 = at.length ? footersUpTo(at, this.hi) : 0;
    const rows = this.hi - this.lo;
    this.count = rows + (this.f1 - this.f0);
    this.dataCount = !paged && model.pageBy === 'root' ? model.structure.layout.roots.length : rows;
  }

  get layout(): TreeLayout {
    return this.model.structure.layout;
  }

  /** Visible index of footer j (absolute footer index). */
  private footerIndex(j: number): number {
    return (this.model.ranges.footerAt[j] as number) - this.lo + (j - this.f0);
  }

  /** Largest footer j in the window with footerIndex(j) <= index, or f0 - 1. */
  private footerBefore(index: number): number {
    let lo = this.f0;
    let hi = this.f1 - 1;
    let found = this.f0 - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.footerIndex(mid) <= index) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found;
  }

  /** Data position (absolute) at a visible index, or -1 for a footer. */
  positionAt(index: number): number {
    if (index < 0 || index >= this.count) return -1;
    if (this.f1 === this.f0) return this.lo + index;
    const j = this.footerBefore(index);
    if (j >= this.f0 && this.footerIndex(j) === index) return -1;
    return this.lo + index - (j - this.f0 + 1);
  }

  /**
   * Visible data rows in data position order (source indexes), materialized
   * on first read and shared by the paged views: the data order
   * `dataRowIdAt` (view-helpers.ts) indexes, like a grouped view's tree.
   */
  get tree(): { readonly order: Int32Array; readonly sourceIds: readonly RowId[]; readonly dataCount: number } {
    let hit = visibleOrders.get(this.model);
    if (!hit) {
      const { starts, ends, total } = this.model.ranges;
      const pre = this.layout.order;
      const order = new Int32Array(total);
      let p = 0;
      for (let r = 0; r < starts.length; r++) for (let slot = starts[r] as number; slot < (ends[r] as number); slot++) order[p++] = pre[slot] as number;
      hit = { order, sourceIds: this.model.structure.sourceIds, dataCount: total };
      visibleOrders.set(this.model, hit);
    }
    return hit;
  }

  /** Visible data rows of this view (`dataCount` counts roots on an unpaged `pageBy: 'root'` view). */
  get dataRows(): number {
    return this.hi - this.lo;
  }

  /** Visible index of an absolute data position. */
  indexOfPosition(p: number): number {
    if (p < this.lo || p >= this.hi) return -1;
    const before = this.f1 === this.f0 ? 0 : footersUpTo(this.model.ranges.footerAt, p) - this.f0;
    return p - this.lo + Math.max(0, before);
  }

  /** Source index of the parent a footer row summarizes, or -1 when `index` is not a footer. */
  footerOwnerAt(index: number): number {
    if (index < 0 || index >= this.count || this.f1 === this.f0) return -1;
    const j = this.footerBefore(index);
    return j >= this.f0 && this.footerIndex(j) === index ? (this.model.ranges.footerOwner[j] as number) : -1;
  }

  kindAt(index: number): RowKind {
    return this.footerOwnerAt(index) >= 0 ? 'groupFooter' : 'data';
  }

  sourceIndexAt(index: number): number {
    const p = this.positionAt(index);
    if (p < 0) return -1;
    return this.layout.order[slotAtPosition(this.model.ranges, p)] as number;
  }

  idAt(index: number): RowId | undefined {
    const owner = this.footerOwnerAt(index);
    if (owner >= 0) return TREE_FOOTER_ID_PREFIX + (this.model.structure.sourceIds[owner] as RowId);
    const s = this.sourceIndexAt(index);
    return s < 0 ? undefined : this.model.structure.sourceIds[s];
  }

  depthAt(index: number): number {
    const owner = this.footerOwnerAt(index);
    if (owner >= 0) return (this.layout.depth[owner] as number) + 1;
    const s = this.sourceIndexAt(index);
    return s < 0 ? 0 : (this.layout.depth[s] as number);
  }

  indexOfSource(sourceIndex: number): number {
    const slot = this.layout.slot[sourceIndex] ?? -1;
    if (slot < 0) return -1;
    const p = positionOfSlot(this.model.ranges, slot);
    return p < 0 ? -1 : this.indexOfPosition(p);
  }

  parentOfSource(sourceIndex: number): RowId | null {
    const p = this.layout.parent[sourceIndex] ?? -1;
    return p < 0 || (this.layout.slot[sourceIndex] ?? -1) < 0 ? null : (this.model.structure.sourceIds[p] as RowId);
  }

  resolve(id: RowId): ViewRowInfo | undefined {
    if (!id.startsWith(TREE_FOOTER_ID_PREFIX)) return undefined;
    if (!this.byFooter) {
      const map = new Map<RowId, number>();
      const owners = this.model.ranges.footerOwner;
      for (let j = this.f0; j < this.f1; j++) map.set(this.model.structure.sourceIds[owners[j] as number] as RowId, j);
      this.byFooter = map;
    }
    const parentId = id.slice(TREE_FOOTER_ID_PREFIX.length);
    const j = this.byFooter.get(parentId);
    if (j === undefined) return undefined;
    const owner = this.model.ranges.footerOwner[j] as number;
    return Object.freeze({ index: this.footerIndex(j), kind: 'groupFooter' as const, depth: (this.layout.depth[owner] as number) + 1, parentId, row: null });
  }

  /** True when the row at a visible index is kept only as context (an ancestor or descendant of a match). */
  isContextAt(index: number): boolean {
    const s = this.sourceIndexAt(index);
    return s >= 0 && this.model.match !== null && this.model.match[s] === 0;
  }

  /**
   * Export rows (read duck-typed by export-model.ts, so
   * the export code loads no tree code): source indexes in pre-order with
   * depth by source index. `all`: every row of the window, collapsed
   * subtrees included (a subtree is contiguous in pre-order), with `flags`
   * by source index (1: a collapsed parent with kept children, 2: under a
   * collapsed ancestor); else the visible rows. `source`: the full tree
   * (every source row, the query ignored) instead of this view's window.
   */
  exportRows(all: boolean, source: boolean): { readonly order: Int32Array; readonly depth: Uint16Array; readonly flags: Uint8Array | null; readonly maxDepth: number } {
    const layout = source ? this.model.structure.index : this.layout;
    const expanded = this.model.expanded;
    const { order: pre, next, depth } = layout;
    let a = 0;
    let b = layout.count;
    if (!source) {
      const visible = this.tree.order;
      a = this.lo < visible.length ? (layout.slot[visible[this.lo] as number] as number) : b;
      b = this.hi < visible.length ? (layout.slot[visible[this.hi] as number] as number) : b;
    }
    let order: Int32Array;
    let flags: Uint8Array | null = null;
    if (all) {
      order = pre.subarray(a, b);
      flags = new Uint8Array(layout.sourceCount);
      let hideUntil = -1;
      for (let s = a; s < b; s++) {
        const src = pre[s] as number;
        if (s < hideUntil) flags[src] = 2;
        if ((next[s] as number) > s + 1 && !expanded[src]) {
          flags[src] = (flags[src] as number) | 1;
          hideUntil = Math.max(hideUntil, next[s] as number);
        }
      }
    } else if (!source) order = this.tree.order.subarray(this.lo, this.hi);
    else {
      const out: number[] = [];
      for (let s = 0; s < b; ) {
        const src = pre[s] as number;
        out.push(src);
        s = (next[s] as number) > s + 1 && !expanded[src] ? (next[s] as number) : s + 1;
      }
      order = Int32Array.from(out);
    }
    let maxDepth = 0;
    for (let i = 0; i < order.length; i++) maxDepth = Math.max(maxDepth, depth[order[i] as number] as number);
    return { order, depth, flags, maxDepth };
  }

  /**
   * Page window. `pageBy: 'all'`: data positions `[start, end)`. `pageBy:
   * 'root'`: root ordinals `[start, end)`, each with its visible subtree.
   */
  page(start: number, end: number): TreeView {
    if (this.model.pageBy === 'root') {
      const layout = this.layout;
      const roots = layout.roots;
      const R = roots.length;
      const a = Math.max(0, Math.min(start, R));
      const b = Math.max(a, Math.min(end, R));
      const ranges = this.model.ranges;
      const lo = a < R ? positionOfSlot(ranges, roots[a] as number) : ranges.total;
      const hi = b < R ? positionOfSlot(ranges, roots[b] as number) : ranges.total;
      return new TreeView(this.model, lo, hi, true);
    }
    return new TreeView(this.model, this.lo + Math.max(0, start), Math.min(this.hi, this.lo + Math.max(0, end)), true);
  }
}
