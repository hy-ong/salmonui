// Sankey layout: node
// columns from the longest path, values from the larger of the in and out
// flows, an iterative relaxation that pulls each node toward the weighted
// center of its neighbours, collision resolution inside a column, and link
// offsets sorted by the far end so flows do not cross needlessly. No d3.
// Computed in horizontal space; `orientation: 'vertical'` transposes it.

import { n2 } from './polyline.js';
import { r2 } from './ticks.js';

export interface SankeyNodeInput {
  readonly id: string;
  /** Pixel shift along the column after layout (`node.offset`). */
  readonly offset?: number | undefined;
}

export interface SankeyLinkInput {
  readonly source: string;
  readonly target: string;
  readonly value: number;
}

export interface SankeyOptions {
  readonly width: number;
  readonly height: number;
  readonly orientation?: 'horizontal' | 'vertical' | undefined;
  /** Node thickness across the flow. Default 16. */
  readonly nodeWidth?: number | undefined;
  /** Gap between nodes of one column. Default 12. */
  readonly nodePadding?: number | undefined;
  /** Relaxation passes. Default 6. */
  readonly iterations?: number | undefined;
  /** Link curvature 0 (straight) .. 1. Default 0.5. */
  readonly curvature?: number | undefined;
}

export interface SankeyNodeBox {
  readonly index: number;
  readonly id: string;
  readonly column: number;
  readonly value: number;
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  /** Incoming and outgoing link indices. */
  readonly sourceLinks: readonly number[];
  readonly targetLinks: readonly number[];
}

export interface SankeyLinkBox {
  readonly index: number;
  readonly source: number;
  readonly target: number;
  readonly value: number;
  /** Stroke width of the band. */
  readonly width: number;
  /** Center of the band at the source and target node (cross-flow axis). */
  readonly y0: number;
  readonly y1: number;
  /** Center-line path; draw with `stroke-width = width`. */
  readonly path: string;
  /** Start and end points of the center line (gradient direction). */
  readonly from: { readonly x: number; readonly y: number };
  readonly to: { readonly x: number; readonly y: number };
}

export interface SankeyLayout {
  readonly nodes: readonly SankeyNodeBox[];
  readonly links: readonly SankeyLinkBox[];
  readonly columns: number;
  /** Links dropped because they name an unknown node, have no value or close a cycle. */
  readonly dropped: readonly number[];
}

interface WorkNode {
  index: number;
  id: string;
  offset: number;
  column: number;
  value: number;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  out: number[];
  in: number[];
}

interface WorkLink {
  index: number;
  source: number;
  target: number;
  value: number;
  width: number;
  y0: number;
  y1: number;
}

/** Lays out a Sankey diagram in a `width` x `height` box. */
export function sankeyLayout(nodesIn: readonly SankeyNodeInput[], linksIn: readonly SankeyLinkInput[], options: SankeyOptions): SankeyLayout {
  const vertical = options.orientation === 'vertical';
  const W = vertical ? options.height : options.width;
  const H = vertical ? options.width : options.height;
  const nodeWidth = options.nodeWidth ?? 16;
  const padding = options.nodePadding ?? 12;
  const iterations = options.iterations ?? 6;
  const curvature = options.curvature ?? 0.5;

  const byId = new Map<string, number>();
  const nodes: WorkNode[] = [];
  for (const n of nodesIn) {
    if (byId.has(n.id)) continue;
    byId.set(n.id, nodes.length);
    nodes.push({ index: nodes.length, id: n.id, offset: n.offset ?? 0, column: 0, value: 0, x0: 0, x1: 0, y0: 0, y1: 0, out: [], in: [] });
  }
  const links: WorkLink[] = [];
  const dropped: number[] = [];
  linksIn.forEach((l, i) => {
    const s = byId.get(l.source);
    const t = byId.get(l.target);
    if (s === undefined || t === undefined || s === t || !(l.value > 0)) {
      dropped.push(i);
      return;
    }
    links.push({ index: i, source: s, target: t, value: l.value, width: 0, y0: 0, y1: 0 });
  });

  // Drop links that close a cycle (depth-first, in input order), so columns are well defined.
  const adj: number[][] = nodes.map(() => []);
  links.forEach((l, k) => adj[l.source]!.push(k));
  const state = new Uint8Array(nodes.length);
  const cyclic = new Set<number>();
  const visit = (start: number) => {
    const stack: [number, number][] = [[start, 0]];
    state[start] = 1;
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const [n, i] = top;
      const edges = adj[n]!;
      if (i >= edges.length) {
        state[n] = 2;
        stack.pop();
        continue;
      }
      top[1] = i + 1;
      const k = edges[i]!;
      const t = links[k]!.target;
      if (state[t] === 1) cyclic.add(k);
      else if (state[t] === 0) {
        state[t] = 1;
        stack.push([t, 0]);
      }
    }
  };
  for (let i = 0; i < nodes.length; i++) if (state[i] === 0) visit(i);
  const live: WorkLink[] = [];
  for (let k = 0; k < links.length; k++) {
    if (cyclic.has(k)) dropped.push(links[k]!.index);
    else live.push(links[k]!);
  }
  dropped.sort((a, b) => a - b);
  live.forEach((l, k) => {
    nodes[l.source]!.out.push(k);
    nodes[l.target]!.in.push(k);
  });

  // Values and columns (longest path from a source; sinks move to the last column).
  for (const n of nodes) {
    let sIn = 0;
    let sOut = 0;
    for (const k of n.in) sIn += live[k]!.value;
    for (const k of n.out) sOut += live[k]!.value;
    n.value = Math.max(sIn, sOut);
  }
  const indeg = nodes.map((n) => n.in.length);
  const queue: number[] = [];
  nodes.forEach((n, i) => {
    if (indeg[i] === 0) queue.push(i);
  });
  for (let q = 0; q < queue.length; q++) {
    const n = nodes[queue[q]!]!;
    for (const k of n.out) {
      const t = live[k]!.target;
      const tn = nodes[t]!;
      tn.column = Math.max(tn.column, n.column + 1);
      if (--indeg[t]! === 0) queue.push(t);
    }
  }
  let columns = 0;
  for (const n of nodes) columns = Math.max(columns, n.column + 1);
  for (const n of nodes) if (n.out.length === 0 && n.in.length > 0) n.column = columns - 1;

  const cols: WorkNode[][] = Array.from({ length: columns }, () => []);
  for (const n of nodes) cols[n.column]!.push(n);
  const dx = columns > 1 ? (W - nodeWidth) / (columns - 1) : 0;
  for (const n of nodes) {
    n.x0 = columns > 1 ? n.column * dx : (W - nodeWidth) / 2;
    n.x1 = n.x0 + nodeWidth;
  }

  // Scale: the most crowded column fills the height.
  let ky = Number.POSITIVE_INFINITY;
  for (const col of cols) {
    let sum = 0;
    for (const n of col) sum += n.value;
    if (sum > 0) ky = Math.min(ky, (H - (col.length - 1) * padding) / sum);
  }
  if (!Number.isFinite(ky) || ky < 0) ky = 0;
  for (const col of cols) {
    let y = 0;
    for (const n of col) {
      n.y0 = y;
      n.y1 = y + n.value * ky;
      y = n.y1 + padding;
    }
  }
  for (const l of live) l.width = l.value * ky;

  const center = (n: WorkNode) => (n.y0 + n.y1) / 2;
  const resolve = (col: WorkNode[]) => {
    col.sort((a, b) => a.y0 - b.y0 || a.index - b.index);
    let y = 0;
    for (const n of col) {
      const d = y - n.y0;
      if (d > 0) {
        n.y0 += d;
        n.y1 += d;
      }
      y = n.y1 + padding;
    }
    let bottom = H;
    for (let i = col.length - 1; i >= 0; i--) {
      const n = col[i]!;
      const d = n.y1 - bottom;
      if (d > 0) {
        n.y0 -= d;
        n.y1 -= d;
      }
      bottom = n.y0 - padding;
    }
  };
  let alpha = 1;
  for (let it = 0; it < iterations; it++) {
    alpha *= 0.99;
    const beta = Math.max(1 - alpha, (it + 1) / iterations);
    // Right to left: pull toward targets; left to right: toward sources.
    for (let c = columns - 2; c >= 0; c--) {
      for (const n of cols[c]!) {
        let wsum = 0;
        let sum = 0;
        for (const k of n.out) {
          const l = live[k]!;
          sum += center(nodes[l.target]!) * l.value;
          wsum += l.value;
        }
        if (wsum > 0) {
          const d = (sum / wsum - center(n)) * beta * 0.5;
          n.y0 += d;
          n.y1 += d;
        }
      }
      resolve(cols[c]!);
    }
    for (let c = 1; c < columns; c++) {
      for (const n of cols[c]!) {
        let wsum = 0;
        let sum = 0;
        for (const k of n.in) {
          const l = live[k]!;
          sum += center(nodes[l.source]!) * l.value;
          wsum += l.value;
        }
        if (wsum > 0) {
          const d = (sum / wsum - center(n)) * beta * 0.5;
          n.y0 += d;
          n.y1 += d;
        }
      }
      resolve(cols[c]!);
    }
  }
  for (const n of nodes) {
    if (n.offset) {
      n.y0 += n.offset;
      n.y1 += n.offset;
    }
  }

  // Link offsets: outgoing sorted by the target's position, incoming by the source's.
  for (const n of nodes) {
    n.out.sort((a, b) => nodes[live[a]!.target]!.y0 - nodes[live[b]!.target]!.y0 || a - b);
    n.in.sort((a, b) => nodes[live[a]!.source]!.y0 - nodes[live[b]!.source]!.y0 || a - b);
    let y = n.y0;
    for (const k of n.out) {
      const l = live[k]!;
      l.y0 = y + l.width / 2;
      y += l.width;
    }
    y = n.y0;
    for (const k of n.in) {
      const l = live[k]!;
      l.y1 = y + l.width / 2;
      y += l.width;
    }
  }

  const pt = (x: number, y: number) => (vertical ? `${n2(y)},${n2(x)}` : `${n2(x)},${n2(y)}`);
  const P = (x: number, y: number) => (vertical ? { x: r2(y), y: r2(x) } : { x: r2(x), y: r2(y) });
  const outLinks: SankeyLinkBox[] = live.map((l) => {
    const x0 = nodes[l.source]!.x1;
    const x1 = nodes[l.target]!.x0;
    const xa = x0 + (x1 - x0) * curvature;
    const xb = x1 - (x1 - x0) * curvature;
    return {
      index: l.index,
      source: l.source,
      target: l.target,
      value: l.value,
      width: r2(Math.max(1, l.width)),
      y0: r2(l.y0),
      y1: r2(l.y1),
      path: `M${pt(x0, l.y0)}C${pt(xa, l.y0)} ${pt(xb, l.y1)} ${pt(x1, l.y1)}`,
      from: P(x0, l.y0),
      to: P(x1, l.y1),
    };
  });
  const outNodes: SankeyNodeBox[] = nodes.map((n) => {
    const box = vertical ? { x0: r2(n.y0), x1: r2(n.y1), y0: r2(n.x0), y1: r2(n.x1) } : { x0: r2(n.x0), x1: r2(n.x1), y0: r2(n.y0), y1: r2(n.y1) };
    // `live` keeps input order, so a live link index is its index in `links`.
    return { index: n.index, id: n.id, column: n.column, value: n.value, ...box, sourceLinks: [...n.out], targetLinks: [...n.in] };
  });
  return { nodes: outNodes, links: outLinks, columns, dropped };
}

/**
 * Index of the link whose band contains (x, y), or -1 (topmost last). The
 * center line is the cubic of `sankeyLayout` with the same `curvature`; the
 * flow coordinate is solved by bisection (the curve is monotone along the
 * flow), then the cross-flow distance is compared with half the width.
 */
export function sankeyLinkAt(links: readonly SankeyLinkBox[], x: number, y: number, vertical = false, curvature = 0.5): number {
  const at = (t: number, a: number, b: number, c: number, d: number) => {
    const u = 1 - t;
    return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d;
  };
  for (let i = links.length - 1; i >= 0; i--) {
    const l = links[i] as SankeyLinkBox;
    const f = vertical ? y : x;
    const c = vertical ? x : y;
    const f0 = vertical ? l.from.y : l.from.x;
    const f1 = vertical ? l.to.y : l.to.x;
    const c0 = vertical ? l.from.x : l.from.y;
    const c1 = vertical ? l.to.x : l.to.y;
    if (f < Math.min(f0, f1) || f > Math.max(f0, f1)) continue;
    const fa = f0 + (f1 - f0) * curvature;
    const fb = f1 - (f1 - f0) * curvature;
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (at(mid, f0, fa, fb, f1) < f === f1 >= f0) lo = mid;
      else hi = mid;
    }
    const cc = at((lo + hi) / 2, c0, c0, c1, c1);
    if (Math.abs(c - cc) <= Math.max(2, l.width / 2)) return i;
  }
  return -1;
}
