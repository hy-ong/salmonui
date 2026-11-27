// Accumulation layouts:
// pie and doughnut angles with partial arcs and pad angles, small-slice
// grouping, inside / outside data labels with the
// overlap pass for outside labels (one column per side, pushed apart and
// kept in the box), and funnel / pyramid segment polygons. Angles are
// degrees clockwise from 12 o'clock at the API and radians inside, the
// convention of `geometry.ts` `polar` / `arcPath`.

import { polar } from './geometry.js';
import { r2 } from './ticks.js';

/** Empty-point modes of accumulation charts; filled by `viz:stats` `fillEmpty`. */
export type EmptyPointMode = 'drop' | 'zero' | 'average';

export interface GroupSmallOptions {
  /** Value (`by: 'value'`, a percent of the total 0..100) or a count (`by: 'count'`: keep the N largest). */
  readonly threshold: number;
  readonly by?: 'value' | 'count' | undefined;
}

/** Indices kept and the merged "Others" total. Order of kept items is unchanged. */
export function groupSmall(values: readonly number[], options: GroupSmallOptions): { kept: number[]; grouped: number[]; other: number } {
  const total = values.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  let small: Set<number>;
  if ((options.by ?? 'value') === 'count') {
    const order = values.map((_, i) => i).sort((a, b) => (values[b] as number) - (values[a] as number) || a - b);
    small = new Set(order.slice(Math.max(0, options.threshold)));
  } else {
    small = new Set();
    values.forEach((v, i) => {
      if (total > 0 && (v / total) * 100 < options.threshold) small.add(i);
    });
  }
  if (small.size < 2) return { kept: values.map((_, i) => i), grouped: [], other: 0 };
  const kept: number[] = [];
  const grouped: number[] = [];
  let other = 0;
  values.forEach((v, i) => {
    if (small.has(i)) {
      grouped.push(i);
      other += v > 0 ? v : 0;
    } else kept.push(i);
  });
  return { kept, grouped, other };
}

export interface PieSlice {
  /** Index into the input values. */
  readonly index: number;
  readonly value: number;
  /** Share of the visible total, 0..1. */
  readonly fraction: number;
  /** Radians clockwise from 12 o'clock. */
  readonly start: number;
  readonly end: number;
  readonly mid: number;
}

export interface PieOptions {
  /** Degrees, clockwise from top. Default 0 and 360. */
  readonly startAngle?: number | undefined;
  readonly endAngle?: number | undefined;
  /** Gap between slices in degrees. Default 0. */
  readonly padAngle?: number | undefined;
  /** Indices left out (legend toggles); they keep no angle. */
  readonly hidden?: ReadonlySet<number> | undefined;
}

const RAD = Math.PI / 180;

/** Slice angles for the non-negative finite values. Hidden, zero and NaN values get no slice. */
export function pieLayout(values: readonly number[], options: PieOptions = {}): PieSlice[] {
  const a0 = (options.startAngle ?? 0) * RAD;
  let a1 = (options.endAngle ?? (options.startAngle ?? 0) + 360) * RAD;
  if (a1 <= a0) a1 += Math.PI * 2;
  const span = Math.min(Math.PI * 2, a1 - a0);
  const visible: number[] = [];
  let total = 0;
  values.forEach((v, i) => {
    if (v > 0 && Number.isFinite(v) && !options.hidden?.has(i)) {
      visible.push(i);
      total += v;
    }
  });
  if (total <= 0) return [];
  const full = span >= Math.PI * 2 - 1e-9;
  const pad = Math.min((options.padAngle ?? 0) * RAD, span / Math.max(1, visible.length) / 2);
  const gaps = visible.length > 1 ? (full ? visible.length : visible.length - 1) : 0;
  const room = span - pad * gaps;
  let at = a0;
  return visible.map((i) => {
    const v = values[i] as number;
    const sweep = (v / total) * room;
    const start = at;
    const end = at + sweep;
    at = end + pad;
    return { index: i, value: v, fraction: v / total, start, end, mid: (start + end) / 2 };
  });
}

/** Offset of an exploded slice along its mid angle. */
export function explodeOffset(slice: PieSlice, offset: number): { dx: number; dy: number } {
  const p = polar(0, 0, offset, slice.mid);
  return { dx: r2(p.x), dy: r2(p.y) };
}

export type PieLabelPosition = 'inside' | 'outside' | 'auto';

export interface PieLabelInput {
  readonly slice: PieSlice;
  readonly width: number;
  readonly height: number;
}

export interface PieLabelBox {
  readonly index: number;
  readonly inside: boolean;
  /** Text anchor point (center for inside, start/end edge for outside). */
  readonly x: number;
  readonly y: number;
  readonly anchor: 'start' | 'middle' | 'end';
  /** Connector polyline (outside only): slice edge, elbow, label end. */
  readonly connector: readonly { readonly x: number; readonly y: number }[] | null;
  readonly hidden: boolean;
}

export interface PieLabelOptions {
  readonly cx: number;
  readonly cy: number;
  readonly radius: number;
  readonly innerRadius: number;
  readonly position?: PieLabelPosition | undefined;
  /** Connector length beyond the radius. Default 16. */
  readonly connectorLength?: number | undefined;
  readonly lineHeight: number;
  /** Box the labels must stay in. */
  readonly bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

/**
 * Places labels inside the ring or outside with connectors. With
 * `auto` a label goes inside when it fits the slice's chord at the label
 * radius. Outside labels are split by side, sorted by y and pushed apart by
 * one line height; labels that cannot fit the bounds are hidden.
 */
export function pieLabels(inputs: readonly PieLabelInput[], options: PieLabelOptions): PieLabelBox[] {
  const position = options.position ?? 'auto';
  const len = options.connectorLength ?? 16;
  const { cx, cy, radius, innerRadius, lineHeight, bounds } = options;
  const midR = innerRadius > 0 ? (radius + innerRadius) / 2 : radius * 0.62;
  const out: PieLabelBox[] = [];
  const outside: { i: number; side: 1 | -1; y: number; ex: number; ey: number; bx: number; width: number }[] = [];
  inputs.forEach((inp, k) => {
    const s = inp.slice;
    const sweep = s.end - s.start;
    const chord = 2 * midR * Math.sin(Math.min(Math.PI / 2, sweep / 2));
    const ring = radius - innerRadius;
    const p = polar(cx, cy, midR, s.mid);
    // The chord test assumes text along the chord; a horizontal box near 3 or 9 o'clock runs
    // radially, so its corners must also stay inside the outer edge.
    const corners = [-1, 1].every((dx) => [-1, 1].every((dy) => Math.hypot(p.x + (dx * inp.width) / 2 - cx, p.y + (dy * inp.height) / 2 - cy) <= radius - 2));
    const fits = inp.width <= chord && inp.height <= Math.min(ring, chord) && corners;
    const inside = position === 'inside' || (position === 'auto' && fits);
    if (inside) {
      out[k] = { index: s.index, inside: true, x: r2(p.x), y: r2(p.y), anchor: 'middle', connector: null, hidden: position === 'inside' ? false : !fits };
      return;
    }
    const e = polar(cx, cy, radius, s.mid);
    const elbow = polar(cx, cy, radius + len, s.mid);
    const side: 1 | -1 = Math.sin(s.mid) >= 0 ? 1 : -1;
    outside.push({ i: k, side, y: elbow.y, ex: e.x, ey: e.y, bx: elbow.x, width: inp.width });
  });
  for (const side of [1, -1] as const) {
    const col = outside.filter((o) => o.side === side).sort((a, b) => a.y - b.y || a.i - b.i);
    const top = bounds.y + lineHeight / 2;
    const bottom = bounds.y + bounds.height - lineHeight / 2;
    const ys = col.map((o) => o.y);
    for (let j = 0; j < ys.length; j++) ys[j] = Math.max(ys[j] as number, j > 0 ? (ys[j - 1] as number) + lineHeight : top);
    for (let j = ys.length - 1; j >= 0; j--) ys[j] = Math.min(ys[j] as number, j < ys.length - 1 ? (ys[j + 1] as number) - lineHeight : bottom);
    col.forEach((o, j) => {
      const y = ys[j] as number;
      const hx = cx + side * (radius + len + 8);
      const tx = hx + side * 4;
      const room = side > 0 ? bounds.x + bounds.width - tx : tx - bounds.x;
      const s = (inputs[o.i] as PieLabelInput).slice;
      out[o.i] = {
        index: s.index,
        inside: false,
        x: r2(tx),
        y: r2(y),
        anchor: side > 0 ? 'start' : 'end',
        connector: [
          { x: r2(o.ex), y: r2(o.ey) },
          { x: r2(o.bx), y: r2(y) },
          { x: r2(hx), y: r2(y) },
        ],
        hidden: y < top - 0.01 || y > bottom + 0.01 || room < Math.min(o.width, 24),
      };
    });
  }
  return out;
}

export type FunnelShape = 'funnel' | 'pyramid';

export interface FunnelOptions {
  readonly shape: FunnelShape;
  readonly width: number;
  readonly height: number;
  /** Funnel neck width and height, px. Defaults 20 % of width and 20 % of height. */
  readonly neckWidth?: number | undefined;
  readonly neckHeight?: number | undefined;
  /** Gap between segments, px. Default 2 (10 for a trapezoidal funnel). */
  readonly gap?: number | undefined;
  /**
   * Funnel `standard` (cone and neck) or `trapezoidal` (equal-height bars as wide as value / max,
   * joined by `connector` trapezoids in the gaps; no neck). Default standard.
   */
  readonly variant?: 'standard' | 'trapezoidal' | undefined;
  /** Pyramid `linear` (height proportional to value) or `area` (area proportional). Default linear. */
  readonly mode?: 'linear' | 'area' | undefined;
  readonly hidden?: ReadonlySet<number> | undefined;
}

export interface FunnelSegment {
  readonly index: number;
  readonly value: number;
  readonly fraction: number;
  /** Polygon points (clockwise from top start). */
  readonly points: readonly { readonly x: number; readonly y: number }[];
  /** Center of the segment, for labels. */
  readonly cx: number;
  readonly cy: number;
  readonly top: number;
  readonly bottom: number;
  /** Trapezoidal variant: the trapezoid from this bar to the next one, in the gap. */
  readonly connector?: readonly { readonly x: number; readonly y: number }[] | undefined;
}

/**
 * Funnel and pyramid segments, first value on top. Segment
 * heights are proportional to the value; a pyramid in `area` mode makes the
 * segment area proportional instead.
 */
export function funnelLayout(values: readonly number[], options: FunnelOptions): FunnelSegment[] {
  const { width: W, height: H } = options;
  const pyramid = options.shape === 'pyramid';
  const trap = !pyramid && options.variant === 'trapezoidal';
  const gap = options.gap ?? (trap ? 10 : 2);
  const visible: number[] = [];
  let total = 0;
  values.forEach((v, i) => {
    if (v > 0 && Number.isFinite(v) && !options.hidden?.has(i)) {
      visible.push(i);
      total += v;
    }
  });
  if (total <= 0) return [];
  const usable = Math.max(0, H - gap * (visible.length - 1));
  const mid = W / 2;
  if (trap) {
    const bh = usable / visible.length;
    const max = Math.max(...visible.map((i) => values[i] as number));
    const xs = (i: number | undefined): [number, number] => {
      const w = i === undefined ? 0 : (W * (values[i] as number)) / max / 2;
      return [r2(mid - w), r2(mid + w)];
    };
    return visible.map((i, k) => {
      const y0 = r2(k * (bh + gap));
      const y1 = r2(y0 + bh);
      const [a, b] = xs(i);
      const v = values[i] as number;
      const next = visible[k + 1];
      const [c, d] = xs(next);
      return {
        index: i,
        value: v,
        fraction: v / total,
        points: [{ x: a, y: y0 }, { x: b, y: y0 }, { x: b, y: y1 }, { x: a, y: y1 }],
        cx: r2(mid),
        cy: r2(y0 + bh / 2),
        top: y0,
        bottom: y1,
        connector: next === undefined ? undefined : [{ x: a, y: y1 }, { x: b, y: y1 }, { x: d, y: r2(y1 + gap) }, { x: c, y: r2(y1 + gap) }],
      };
    });
  }
  const neckW = pyramid ? 0 : Math.min(W, options.neckWidth ?? W * 0.2);
  const neckH = pyramid ? 0 : Math.min(usable, options.neckHeight ?? H * 0.2);
  // Half width at a vertical position t (0 top .. usable bottom) in gap-free space.
  const half = (t: number): number => {
    if (pyramid) return ((t / (usable || 1)) * W) / 2;
    const cone = usable - neckH;
    if (t >= cone) return neckW / 2;
    return (W - ((W - neckW) * t) / (cone || 1)) / 2;
  };
  // Boundaries in gap-free space.
  const bounds: number[] = [0];
  let acc = 0;
  for (const i of visible) {
    acc += values[i] as number;
    const f = acc / total;
    // Area mode on a pyramid: area of the top part grows with t^2, so t = sqrt(f).
    bounds.push((pyramid && options.mode === 'area' ? Math.sqrt(f) : f) * usable);
  }
  return visible.map((i, k) => {
    const t0 = bounds[k] as number;
    const t1 = bounds[k + 1] as number;
    const y0 = t0 + k * gap;
    const y1 = t1 + k * gap;
    const pts: { x: number; y: number }[] = [];
    pts.push({ x: mid - half(t0), y: y0 }, { x: mid + half(t0), y: y0 });
    // A neck corner inside the segment.
    const cone = usable - neckH;
    if (!pyramid && t0 < cone && t1 > cone) pts.push({ x: mid + neckW / 2, y: cone + k * gap });
    pts.push({ x: mid + half(t1), y: y1 }, { x: mid - half(t1), y: y1 });
    if (!pyramid && t0 < cone && t1 > cone) pts.push({ x: mid - neckW / 2, y: cone + k * gap });
    const v = values[i] as number;
    return { index: i, value: v, fraction: v / total, points: pts.map((p) => ({ x: r2(p.x), y: r2(p.y) })), cx: r2(mid), cy: r2((y0 + y1) / 2), top: r2(y0), bottom: r2(y1) };
  });
}

/** SVG polygon `points` attribute. */
export function polygonPoints(points: readonly { readonly x: number; readonly y: number }[]): string {
  return points.map((p) => `${p.x},${p.y}`).join(' ');
}
