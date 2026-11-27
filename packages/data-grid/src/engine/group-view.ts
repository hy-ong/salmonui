// Visible row model of a grouped grid (group expansion stage). The flattened
// list of caption rows, data rows, and group footer rows is never
// materialized: one O(groups) pass over the group tree emits segments
// (a caption, a footer, or a run of a leaf group's data rows) with their
// visible start index (prefix sums over the collapsed state), and every
// index lookup is a binary search over the segment starts.

import {
  findGroup,
  GROUP_FOOTER_ID_PREFIX,
  GROUP_ID_PREFIX,
  groupPathKey,
  groupRowId,
  positionsOf,
  type GroupTree,
} from './group-tree.js';
import type { RowId, RowKind, RowModelView, ViewRowInfo } from './types.js';

const CAPTION = 0;
const DATA = 1;
const FOOTER = 2;

/** Per-group expanded flags: `defaultExpanded`, overridden by path key. */
export function resolveExpanded(tree: GroupTree, overrides: Readonly<Record<string, boolean>>, defaultExpanded: boolean): Uint8Array {
  const flags = new Uint8Array(tree.count);
  if (defaultExpanded) flags.fill(1);
  for (const key in overrides) {
    const g = findGroup(tree, key);
    if (g >= 0) flags[g] = overrides[key] ? 1 : 0;
  }
  return flags;
}

export class GroupView implements RowModelView {
  readonly kind = 'grouped' as const;
  readonly count: number;
  readonly dataCount: number;
  readonly tree: GroupTree;
  readonly expanded: Uint8Array;
  readonly footers: boolean;
  /** Data position window `[start, end)` of a page, or null. */
  readonly range: readonly [number, number] | null;
  private readonly segKind: Uint8Array;
  private readonly segGroup: Int32Array;
  private readonly segStart: Int32Array;
  private readonly segPos: Int32Array;
  private readonly segs: number;
  /** Leaf group -> segment of its data run, or -1. */
  private readonly leafSeg: Int32Array;
  /** Group -> segment of its caption, or -1 when hidden. */
  private readonly captionSeg: Int32Array;
  /** Group -> segment of its footer, or -1. */
  private readonly footerSeg: Int32Array;

  constructor(tree: GroupTree, expanded: Uint8Array, footers: boolean, range: readonly [number, number] | null) {
    this.tree = tree;
    this.expanded = expanded;
    this.footers = footers;
    this.range = range;
    const G = tree.count;
    const D = tree.depth;
    const cap = G + tree.leaves.length + (footers ? G : 0) + 1;
    const segKind = new Uint8Array(cap);
    const segGroup = new Int32Array(cap);
    const segStart = new Int32Array(cap + 1);
    const segPos = new Int32Array(cap);
    const leafSeg = new Int32Array(G).fill(-1);
    const captionSeg = new Int32Array(G).fill(-1);
    const footerSeg = footers ? new Int32Array(G).fill(-1) : captionSeg;
    const { level, next, start, size } = tree;
    const lo = range ? range[0] : 0;
    const hi = range ? range[1] : tree.dataCount;
    const stack = new Int32Array(D + 1);
    let top = 0;
    let s = 0;
    let visible = 0;
    let g = 0;
    while (g < G) {
      while (top > 0 && (next[stack[top - 1] as number] as number) <= g) {
        const f = stack[--top] as number;
        if (footers) {
          segKind[s] = FOOTER;
          segGroup[s] = f;
          segStart[s] = visible;
          footerSeg[f] = s++;
          visible++;
        }
      }
      const a = start[g] as number;
      const b = a + (size[g] as number);
      if (b <= lo || a >= hi) {
        g = next[g] as number;
        continue;
      }
      segKind[s] = CAPTION;
      segGroup[s] = g;
      segStart[s] = visible;
      captionSeg[g] = s++;
      visible++;
      if (!expanded[g]) {
        g = next[g] as number;
        continue;
      }
      stack[top++] = g;
      if ((level[g] as number) === D - 1) {
        const from = a > lo ? a : lo;
        const to = b < hi ? b : hi;
        segKind[s] = DATA;
        segGroup[s] = g;
        segStart[s] = visible;
        segPos[s] = from;
        leafSeg[g] = s++;
        visible += to - from;
      }
      g++;
    }
    while (top > 0) {
      const f = stack[--top] as number;
      if (footers) {
        segKind[s] = FOOTER;
        segGroup[s] = f;
        segStart[s] = visible;
        footerSeg[f] = s++;
        visible++;
      }
    }
    segStart[s] = visible;
    this.segKind = segKind;
    this.segGroup = segGroup;
    this.segStart = segStart;
    this.segPos = segPos;
    this.segs = s;
    this.leafSeg = leafSeg;
    this.captionSeg = captionSeg;
    this.footerSeg = footerSeg;
    this.count = visible;
    this.dataCount = hi - lo;
  }

  /** Segment containing visible index `i` (0 <= i < count). */
  private seg(i: number): number {
    const starts = this.segStart;
    let lo = 0;
    let hi = this.segs - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((starts[mid] as number) <= i) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  kindAt(index: number): RowKind {
    if (index < 0 || index >= this.count) return 'data';
    const k = this.segKind[this.seg(index)];
    return k === CAPTION ? 'group' : k === FOOTER ? 'groupFooter' : 'data';
  }

  /** Group of the caption or footer at `index`, or of the data row's leaf group. */
  groupAt(index: number): number {
    if (index < 0 || index >= this.count) return -1;
    return this.segGroup[this.seg(index)] as number;
  }

  /** Data position (index into the tree order) at `index`, or -1 for synthetic rows. */
  positionAt(index: number): number {
    if (index < 0 || index >= this.count) return -1;
    const s = this.seg(index);
    if (this.segKind[s] !== DATA) return -1;
    return (this.segPos[s] as number) + index - (this.segStart[s] as number);
  }

  sourceIndexAt(index: number): number {
    const p = this.positionAt(index);
    return p < 0 ? -1 : (this.tree.order[p] as number);
  }

  idAt(index: number): RowId | undefined {
    if (index < 0 || index >= this.count) return undefined;
    const s = this.seg(index);
    const g = this.segGroup[s] as number;
    switch (this.segKind[s]) {
      case CAPTION:
        return groupRowId(this.tree, g);
      case FOOTER:
        return GROUP_FOOTER_ID_PREFIX + groupPathKey(this.tree, g);
      default:
        return this.tree.sourceIds[this.tree.order[(this.segPos[s] as number) + index - (this.segStart[s] as number)] as number];
    }
  }

  depthAt(index: number): number {
    if (index < 0 || index >= this.count) return 0;
    const s = this.seg(index);
    return this.segKind[s] === DATA ? this.tree.depth : (this.tree.level[this.segGroup[s] as number] as number);
  }

  /** Visible index of a group caption, or -1 when hidden. */
  captionIndex(g: number): number {
    const s = g >= 0 && g < this.tree.count ? (this.captionSeg[g] as number) : -1;
    return s < 0 ? -1 : (this.segStart[s] as number);
  }

  /** Visible index of a group footer, or -1. */
  footerIndex(g: number): number {
    if (!this.footers || g < 0 || g >= this.tree.count) return -1;
    const s = this.footerSeg[g] as number;
    return s < 0 ? -1 : (this.segStart[s] as number);
  }

  indexOfSource(sourceIndex: number): number {
    const tree = this.tree;
    const g = sourceIndex >= 0 && sourceIndex < tree.leafOf.length ? (tree.leafOf[sourceIndex] as number) : -1;
    if (g < 0) return -1;
    const s = this.leafSeg[g] as number;
    if (s < 0) return -1;
    const off = (positionsOf(tree)[sourceIndex] as number) - (this.segPos[s] as number);
    const len = (this.segStart[s + 1] as number) - (this.segStart[s] as number);
    return off < 0 || off >= len ? -1 : (this.segStart[s] as number) + off;
  }

  parentOfSource(sourceIndex: number): RowId | null {
    const g = sourceIndex >= 0 && sourceIndex < this.tree.leafOf.length ? (this.tree.leafOf[sourceIndex] as number) : -1;
    return g < 0 ? null : groupRowId(this.tree, g);
  }

  /** Group index of a caption or footer row id, or -1. */
  groupOfId(id: RowId): number {
    const key = id.startsWith(GROUP_ID_PREFIX) ? id.slice(GROUP_ID_PREFIX.length) : id.startsWith(GROUP_FOOTER_ID_PREFIX) ? id.slice(GROUP_FOOTER_ID_PREFIX.length) : null;
    return key === null ? -1 : findGroup(this.tree, key);
  }

  resolve(id: RowId): ViewRowInfo | undefined {
    const footer = id.startsWith(GROUP_FOOTER_ID_PREFIX);
    if (!footer && !id.startsWith(GROUP_ID_PREFIX)) return undefined;
    const g = this.groupOfId(id);
    if (g < 0) return undefined;
    const index = footer ? this.footerIndex(g) : this.captionIndex(g);
    if (index < 0) return undefined;
    const p = this.tree.parent[g] as number;
    return Object.freeze({
      index,
      kind: footer ? ('groupFooter' as const) : ('group' as const),
      depth: this.tree.level[g] as number,
      parentId: footer ? groupRowId(this.tree, g) : p < 0 ? null : groupRowId(this.tree, p),
      row: null,
    });
  }

  page(start: number, end: number): GroupView {
    return new GroupView(this.tree, this.expanded, this.footers, [Math.max(0, start), Math.min(this.tree.dataCount, end)]);
  }
}
