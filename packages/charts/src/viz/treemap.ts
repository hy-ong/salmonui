// Treemap layout:
// hierarchy weights, squarified (Bruls, Huizing, van Wijk) and
// slice-and-dice tilings, group gaps and header bands per level, and the
// four render directions as a mirror of the top-start tiling. Pure and
// deterministic; rectangles are rounded to 0.01 px.

import { r2 } from './ticks.js';

export interface TreeNode<T> {
  readonly item: T | null;
  /** Path of group keys or leaf labels from the root, the drill-down address. */
  readonly path: readonly string[];
  readonly key: string;
  readonly depth: number;
  readonly value: number;
  readonly children: readonly TreeNode<T>[];
}

export interface HierarchyOptions<T> {
  /** Weight of a leaf item. */
  readonly weight: (item: T) => number;
  /** Children of a hierarchical item (`childrenField`). */
  readonly children?: ((item: T) => readonly T[] | null | undefined) | undefined;
  /** Grouping keys of flat data, one per level (`levels[].groupBy`). */
  readonly groupBy?: readonly ((item: T) => string)[] | undefined;
  /** Key of a leaf (label). */
  readonly key: (item: T, index: number) => string;
}

/** Builds the weighted tree from flat (grouped) or hierarchical data. Non-positive weights are dropped. */
export function hierarchy<T>(data: readonly T[], options: HierarchyOptions<T>): TreeNode<T> {
  const build = (items: readonly T[], depth: number, path: readonly string[]): TreeNode<T>[] => {
    const level = options.groupBy?.[depth];
    if (level) {
      const groups = new Map<string, T[]>();
      for (const it of items) {
        const k = level(it);
        let g = groups.get(k);
        if (!g) groups.set(k, (g = []));
        g.push(it);
      }
      const out: TreeNode<T>[] = [];
      for (const [k, g] of groups) {
        const p = [...path, k];
        const children = build(g, depth + 1, p);
        const value = children.reduce((s, c) => s + c.value, 0);
        if (value > 0) out.push({ item: null, path: p, key: k, depth: depth + 1, value, children });
      }
      return out;
    }
    const out: TreeNode<T>[] = [];
    items.forEach((it, i) => {
      const k = options.key(it, i);
      const p = [...path, k];
      const kids = options.children?.(it);
      if (kids && kids.length) {
        const children = build(kids, depth + 1, p);
        const value = children.reduce((s, c) => s + c.value, 0);
        if (value > 0) out.push({ item: it, path: p, key: k, depth: depth + 1, value, children });
      } else {
        const w = options.weight(it);
        if (w > 0 && Number.isFinite(w)) out.push({ item: it, path: p, key: k, depth: depth + 1, value: w, children: [] });
      }
    });
    return out;
  };
  const children = build(data, 0, []);
  return { item: null, path: [], key: '', depth: 0, value: children.reduce((s, c) => s + c.value, 0), children };
}

/** The node at `path` (drill-down), or null. */
export function findNode<T>(root: TreeNode<T>, path: readonly string[]): TreeNode<T> | null {
  let node: TreeNode<T> | undefined = root;
  for (const k of path) {
    node = node.children.find((c) => c.key === k);
    if (!node) return null;
  }
  return node;
}

export type TreemapTiling = 'squarified' | 'sliceHorizontal' | 'sliceVertical' | 'sliceAuto';
export type TreemapDirection = 'topStart' | 'topEnd' | 'bottomStart' | 'bottomEnd';

export interface TreemapLevelOptions {
  /** Gap between sibling groups of this level. Default 0 (leaves) or 2 (groups). */
  readonly gap?: number | undefined;
  /** Header band height of a group at this level; 0 for none. */
  readonly header?: number | undefined;
}

export interface TreemapOptions {
  readonly width: number;
  readonly height: number;
  readonly tiling?: TreemapTiling | undefined;
  /** `topStart` is top-left in LTR; pass `rtl` to mirror the start side. */
  readonly direction?: TreemapDirection | undefined;
  readonly rtl?: boolean | undefined;
  /** Per depth (1 = top level under the root). */
  readonly levels?: readonly TreemapLevelOptions[] | undefined;
  /** Gap between leaves. Default 1. */
  readonly leafGap?: number | undefined;
  /** Depth to lay out below the root (`showParentLevels` false = 1 level of groups). Default: all. */
  readonly maxDepth?: number | undefined;
}

export interface TreemapRect<T> {
  readonly node: TreeNode<T>;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly leaf: boolean;
  /** Header band (groups with a header). */
  readonly header: number;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Squarify `values` (sorted descending by the caller) into `box`. */
function squarify(values: readonly number[], box: Box): Box[] {
  const out: Box[] = new Array(values.length);
  const total = values.reduce((s, v) => s + v, 0);
  if (total <= 0) return values.map(() => ({ x: box.x, y: box.y, w: 0, h: 0 }));
  let { x, y, w, h } = box;
  const scale = (w * h) / total;
  let i = 0;
  while (i < values.length) {
    const side = Math.min(w, h);
    let rowSum = 0;
    let rowMin = Number.POSITIVE_INFINITY;
    let rowMax = 0;
    let worst = Number.POSITIVE_INFINITY;
    let j = i;
    for (; j < values.length; j++) {
      const a = (values[j] as number) * scale;
      const sum = rowSum + a;
      const min = Math.min(rowMin, a);
      const max = Math.max(rowMax, a);
      const s2 = side * side;
      const ratio = Math.max((s2 * max) / (sum * sum), (sum * sum) / (s2 * min));
      if (j > i && ratio > worst) break;
      worst = ratio;
      rowSum = sum;
      rowMin = min;
      rowMax = max;
    }
    // Lay the row along the shorter side.
    const thick = side > 0 ? rowSum / side : 0;
    let off = 0;
    for (let k = i; k < j; k++) {
      const a = (values[k] as number) * scale;
      const len = thick > 0 ? a / thick : 0;
      out[k] = w >= h ? { x, y: y + off, w: thick, h: len } : { x: x + off, y, w: len, h: thick };
      off += len;
    }
    if (w >= h) {
      x += thick;
      w -= thick;
    } else {
      y += thick;
      h -= thick;
    }
    i = j;
  }
  return out;
}

function slice(values: readonly number[], box: Box, horizontal: boolean): Box[] {
  const total = values.reduce((s, v) => s + v, 0) || 1;
  let off = 0;
  return values.map((v) => {
    const t = v / total;
    const b = horizontal ? { x: box.x + off, y: box.y, w: box.w * t, h: box.h } : { x: box.x, y: box.y + off, w: box.w, h: box.h * t };
    off += horizontal ? box.w * t : box.h * t;
    return b;
  });
}

/**
 * Lays out the subtree of `root` (already drilled) into the box. Returns
 * every visible node in paint order (parents before children).
 */
export function treemapLayout<T>(root: TreeNode<T>, options: TreemapOptions): TreemapRect<T>[] {
  const tiling = options.tiling ?? 'squarified';
  const dir = options.direction ?? 'topStart';
  const flipX = (dir === 'topEnd' || dir === 'bottomEnd') !== Boolean(options.rtl);
  const flipY = dir === 'bottomStart' || dir === 'bottomEnd';
  const leafGap = options.leafGap ?? 1;
  const maxDepth = options.maxDepth ?? Number.POSITIVE_INFINITY;
  const out: TreemapRect<T>[] = [];
  const emit = (node: TreeNode<T>, b: Box, rel: number, header: number) => {
    let { x, y } = b;
    if (flipX) x = options.width - b.x - b.w;
    if (flipY) y = options.height - b.y - b.h;
    // Headers stay at the top of a group in every direction (text reads top down).
    out.push({ node, x: r2(x), y: r2(y), width: r2(Math.max(0, b.w)), height: r2(Math.max(0, b.h)), leaf: node.children.length === 0 || rel >= maxDepth, header });
  };
  const visit = (node: TreeNode<T>, box: Box, rel: number) => {
    if (node.children.length === 0 || rel >= maxDepth) return;
    const order = node.children.map((_, i) => i).sort((a, b) => (node.children[b] as TreeNode<T>).value - (node.children[a] as TreeNode<T>).value || a - b);
    const values = order.map((i) => (node.children[i] as TreeNode<T>).value);
    const depth = rel + 1;
    const childIsGroup = (c: TreeNode<T>) => c.children.length > 0 && depth < maxDepth;
    const boxes =
      tiling === 'squarified'
        ? squarify(values, box)
        : slice(values, box, tiling === 'sliceHorizontal' ? true : tiling === 'sliceVertical' ? false : depth % 2 === 1 ? box.w >= box.h : box.w < box.h);
    order.forEach((ci, k) => {
      const child = node.children[ci] as TreeNode<T>;
      const level = options.levels?.[depth - 1];
      const group = childIsGroup(child);
      const gap = group ? (level?.gap ?? 2) : leafGap;
      const b = boxes[k] as Box;
      const inner = { x: b.x + gap / 2, y: b.y + gap / 2, w: Math.max(0, b.w - gap), h: Math.max(0, b.h - gap) };
      const header = group ? Math.min(level?.header ?? 0, inner.h) : 0;
      // Header band is laid out unflipped at the top; flipping vertical directions keeps it on top.
      emit(child, inner, depth, header);
      if (group) visit(child, { x: inner.x, y: flipY ? inner.y : inner.y + header, w: inner.w, h: Math.max(0, inner.h - header) }, depth);
    });
  };
  visit(root, { x: 0, y: 0, w: options.width, h: options.height }, 0);
  return out;
}
