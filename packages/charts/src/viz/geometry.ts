// Path builders: lines and areas
// with linear, step, natural, monotone, cardinal and clamped curves, arcs,
// polar transforms and marker symbols. Every coordinate is rounded to
// 0.01 px when serialized, so Node and every browser emit identical markup.
// The same path strings feed the SVG and the canvas renderer (`Path2D`).

import { n2, pt, segments } from './polyline.js';

export type Curve = 'linear' | 'natural' | 'monotone' | 'cardinal' | 'clamped' | 'step';
export type StepPosition = 'start' | 'center' | 'end';

export interface CurveOptions {
  readonly curve?: Curve | undefined;
  /** Cardinal tension 0..1 (0 = Catmull-Rom like, 1 = straight). Default 0.5. */
  readonly tension?: number | undefined;
  readonly stepPosition?: StepPosition | undefined;
  /** Step risers (vertical segments). Default true. */
  readonly risers?: boolean | undefined;
}

/** Path commands after the initial point (no leading `M`). */
function curveBody(xs: number[], ys: number[], o: CurveOptions): string {
  const n = xs.length;
  if (n < 2) return '';
  const curve = o.curve ?? 'linear';
  let d = '';
  if (curve === 'linear' || n === 2 && curve !== 'step') {
    for (let i = 1; i < n; i++) d += `L${pt(xs[i] as number, ys[i] as number)}`;
    return d;
  }
  if (curve === 'step') {
    const pos = o.stepPosition ?? 'start';
    const risers = o.risers !== false;
    for (let i = 1; i < n; i++) {
      const x0 = xs[i - 1] as number;
      const y0 = ys[i - 1] as number;
      const x1 = xs[i] as number;
      const y1 = ys[i] as number;
      if (pos === 'start') {
        // the value holds until the next point
        d += risers ? `L${pt(x1, y0)}L${pt(x1, y1)}` : `L${pt(x1, y0)}M${pt(x1, y1)}`;
      } else if (pos === 'end') {
        d += risers ? `L${pt(x0, y1)}L${pt(x1, y1)}` : `M${pt(x0, y1)}L${pt(x1, y1)}`;
      } else {
        const xm = (x0 + x1) / 2;
        d += risers ? `L${pt(xm, y0)}L${pt(xm, y1)}L${pt(x1, y1)}` : `L${pt(xm, y0)}M${pt(xm, y1)}L${pt(x1, y1)}`;
      }
    }
    return d;
  }
  if (curve === 'cardinal') {
    const t = Math.min(1, Math.max(0, o.tension ?? 0.5));
    const k = (1 - t) / 6;
    for (let i = 0; i < n - 1; i++) {
      const p0x = xs[Math.max(0, i - 1)] as number;
      const p0y = ys[Math.max(0, i - 1)] as number;
      const p1x = xs[i] as number;
      const p1y = ys[i] as number;
      const p2x = xs[i + 1] as number;
      const p2y = ys[i + 1] as number;
      const p3x = xs[Math.min(n - 1, i + 2)] as number;
      const p3y = ys[Math.min(n - 1, i + 2)] as number;
      d += `C${pt(p1x + (p2x - p0x) * k, p1y + (p2y - p0y) * k)} ${pt(p2x - (p3x - p1x) * k, p2y - (p3y - p1y) * k)} ${pt(p2x, p2y)}`;
    }
    return d;
  }
  if (curve === 'monotone') {
    // Fritsch-Carlson tangents (monotone in x, no overshoot).
    const m = new Array<number>(n).fill(0);
    const delta: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const h = (xs[i + 1] as number) - (xs[i] as number);
      delta.push(h === 0 ? 0 : ((ys[i + 1] as number) - (ys[i] as number)) / h);
    }
    m[0] = delta[0] as number;
    m[n - 1] = delta[n - 2] as number;
    for (let i = 1; i < n - 1; i++) {
      const a = delta[i - 1] as number;
      const b = delta[i] as number;
      m[i] = a * b <= 0 ? 0 : (a + b) / 2;
    }
    for (let i = 0; i < n - 1; i++) {
      const a = delta[i] as number;
      if (a === 0) {
        m[i] = 0;
        m[i + 1] = 0;
        continue;
      }
      const al = (m[i] as number) / a;
      const be = (m[i + 1] as number) / a;
      const s = al * al + be * be;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        m[i] = tau * al * a;
        m[i + 1] = tau * be * a;
      }
    }
    for (let i = 0; i < n - 1; i++) {
      const x0 = xs[i] as number;
      const x1 = xs[i + 1] as number;
      const h = (x1 - x0) / 3;
      d += `C${pt(x0 + h, (ys[i] as number) + (m[i] as number) * h)} ${pt(x1 - h, (ys[i + 1] as number) - (m[i + 1] as number) * h)} ${pt(x1, ys[i + 1] as number)}`;
    }
    return d;
  }
  // natural / clamped cubic spline through the points, parametrized by x.
  const second = splineSecondDerivatives(xs, ys, curve === 'clamped');
  for (let i = 0; i < n - 1; i++) {
    const x0 = xs[i] as number;
    const x1 = xs[i + 1] as number;
    const y0 = ys[i] as number;
    const y1 = ys[i + 1] as number;
    const h = x1 - x0;
    const s0 = second[i] as number;
    const s1 = second[i + 1] as number;
    // First derivatives at the ends of the interval.
    const d0 = h === 0 ? 0 : (y1 - y0) / h - (h * (2 * s0 + s1)) / 6;
    const d1 = h === 0 ? 0 : (y1 - y0) / h + (h * (s0 + 2 * s1)) / 6;
    d += `C${pt(x0 + h / 3, y0 + (d0 * h) / 3)} ${pt(x1 - h / 3, y1 - (d1 * h) / 3)} ${pt(x1, y1)}`;
  }
  return d;
}

function splineSecondDerivatives(xs: number[], ys: number[], clamped: boolean): number[] {
  const n = xs.length;
  const a = new Array<number>(n).fill(0);
  const b = new Array<number>(n).fill(0);
  const c = new Array<number>(n).fill(0);
  const r = new Array<number>(n).fill(0);
  const h = (i: number) => (xs[i + 1] as number) - (xs[i] as number) || 1e-9;
  const slope = (i: number) => ((ys[i + 1] as number) - (ys[i] as number)) / h(i);
  if (clamped) {
    // Clamped: first derivative at the ends equals the end chord slope.
    b[0] = h(0) / 3;
    c[0] = h(0) / 6;
    r[0] = slope(0) - slope(0);
    b[n - 1] = h(n - 2) / 3;
    a[n - 1] = h(n - 2) / 6;
    r[n - 1] = slope(n - 2) - slope(n - 2);
  } else {
    b[0] = 1;
    b[n - 1] = 1;
  }
  for (let i = 1; i < n - 1; i++) {
    a[i] = h(i - 1) / 6;
    b[i] = (h(i - 1) + h(i)) / 3;
    c[i] = h(i) / 6;
    r[i] = slope(i) - slope(i - 1);
  }
  // Thomas algorithm.
  for (let i = 1; i < n; i++) {
    const w = (a[i] as number) / (b[i - 1] as number);
    b[i] = (b[i] as number) - w * (c[i - 1] as number);
    r[i] = (r[i] as number) - w * (r[i - 1] as number);
  }
  const m = new Array<number>(n).fill(0);
  m[n - 1] = (r[n - 1] as number) / (b[n - 1] as number);
  for (let i = n - 2; i >= 0; i--) m[i] = ((r[i] as number) - (c[i] as number) * (m[i + 1] as number)) / (b[i] as number);
  return m;
}

/** SVG path of a line through (xs[i], ys[i]); non-finite values break the line (gaps). */
export function linePath(xs: ArrayLike<number>, ys: ArrayLike<number>, options: CurveOptions = {}): string {
  let d = '';
  for (const s of segments(xs, ys)) {
    d += `M${pt(s.xs[0] as number, s.ys[0] as number)}`;
    d += curveBody(s.xs, s.ys, options);
  }
  return d;
}

/**
 * SVG path of an area between a top line and a base line (`base` is a
 * constant pixel or one value per point, for stacked and range areas).
 */
export function areaPath(xs: ArrayLike<number>, top: ArrayLike<number>, base: number | ArrayLike<number>, options: CurveOptions = {}): string {
  const n = Math.min(xs.length, top.length);
  let d = '';
  let start = -1;
  const baseAt = (i: number) => (typeof base === 'number' ? base : (base[i] as number));
  const flush = (end: number) => {
    if (start < 0) return;
    const sx: number[] = [];
    const st: number[] = [];
    const sb: number[] = [];
    for (let i = start; i < end; i++) {
      sx.push(xs[i] as number);
      st.push(top[i] as number);
      sb.push(baseAt(i));
    }
    d += `M${pt(sx[0] as number, st[0] as number)}${curveBody(sx, st, options)}`;
    const rx = sx.slice().reverse();
    const rb = sb.slice().reverse();
    const reverseOptions: CurveOptions = options.curve === 'step' ? { ...options, stepPosition: options.stepPosition === 'end' ? 'start' : options.stepPosition === 'center' ? 'center' : 'end' } : options;
    d += `L${pt(rx[0] as number, rb[0] as number)}${typeof base === 'number' ? (rx.length > 1 ? `L${pt(rx[rx.length - 1] as number, base)}` : '') : curveBody(rx, rb, reverseOptions)}Z`;
    start = -1;
  };
  for (let i = 0; i < n; i++) {
    const ok = Number.isFinite(xs[i] as number) && Number.isFinite(top[i] as number) && Number.isFinite(baseAt(i));
    if (ok && start < 0) start = i;
    if (!ok) flush(i);
  }
  flush(n);
  return d;
}

/** Point at `angle` (radians, clockwise from 12 o'clock) on a circle. */
export function polar(cx: number, cy: number, radius: number, angle: number): { x: number; y: number } {
  return { x: cx + radius * Math.sin(angle), y: cy - radius * Math.cos(angle) };
}

/**
 * Annular sector from `start` to `end` (radians, clockwise from 12 o'clock).
 * `inner` 0 draws a pie slice; a full turn draws two half arcs.
 */
export function arcPath(cx: number, cy: number, inner: number, outer: number, start: number, end: number): string {
  let sweep = end - start;
  if (Math.abs(sweep) < 1e-9 || outer <= 0) return '';
  const full = Math.abs(sweep) >= Math.PI * 2 - 1e-9;
  if (full) {
    const a = polar(cx, cy, outer, 0);
    const b = polar(cx, cy, outer, Math.PI);
    let d = `M${pt(a.x, a.y)}A${n2(outer)},${n2(outer)} 0 1 1 ${pt(b.x, b.y)}A${n2(outer)},${n2(outer)} 0 1 1 ${pt(a.x, a.y)}Z`;
    if (inner > 0) {
      const c = polar(cx, cy, inner, 0);
      const e = polar(cx, cy, inner, Math.PI);
      d += `M${pt(c.x, c.y)}A${n2(inner)},${n2(inner)} 0 1 0 ${pt(e.x, e.y)}A${n2(inner)},${n2(inner)} 0 1 0 ${pt(c.x, c.y)}Z`;
    }
    return d;
  }
  const clockwise = sweep > 0 ? 1 : 0;
  sweep = Math.abs(sweep);
  const large = sweep > Math.PI ? 1 : 0;
  const o0 = polar(cx, cy, outer, start);
  const o1 = polar(cx, cy, outer, end);
  let d = `M${pt(o0.x, o0.y)}A${n2(outer)},${n2(outer)} 0 ${large} ${clockwise} ${pt(o1.x, o1.y)}`;
  if (inner > 0) {
    const i1 = polar(cx, cy, inner, end);
    const i0 = polar(cx, cy, inner, start);
    d += `L${pt(i1.x, i1.y)}A${n2(inner)},${n2(inner)} 0 ${large} ${1 - clockwise} ${pt(i0.x, i0.y)}Z`;
  } else {
    d += `L${pt(cx, cy)}Z`;
  }
  return d;
}

/** Rectangle path with normalized negative sizes. */
export function rectPath(x: number, y: number, width: number, height: number): string {
  const x0 = width < 0 ? x + width : x;
  const y0 = height < 0 ? y + height : y;
  const w = Math.abs(width);
  const h = Math.abs(height);
  return `M${pt(x0, y0)}h${n2(w)}v${n2(h)}h${n2(-w)}Z`;
}

export type SymbolShape =
  | 'circle'
  | 'rectangle'
  | 'triangle'
  | 'invertedTriangle'
  | 'diamond'
  | 'cross'
  | 'plus'
  | 'multiply'
  | 'horizontalLine'
  | 'verticalLine'
  | 'pentagon'
  | 'star'
  | 'none';

export const SYMBOL_SHAPES: readonly SymbolShape[] = ['circle', 'rectangle', 'triangle', 'diamond', 'invertedTriangle', 'pentagon', 'star', 'cross', 'plus', 'multiply', 'horizontalLine', 'verticalLine'];

/** True for symbols drawn with a stroke only (lines and crosses). */
export const isStrokeSymbol = (shape: SymbolShape): boolean => shape === 'cross' || shape === 'plus' || shape === 'multiply' || shape === 'horizontalLine' || shape === 'verticalLine';

function polygon(cx: number, cy: number, r: number, count: number, rotation = 0, innerRatio = 0): string {
  let d = '';
  const total = innerRatio ? count * 2 : count;
  for (let i = 0; i < total; i++) {
    const rad = innerRatio && i % 2 === 1 ? r * innerRatio : r;
    const p = polar(cx, cy, rad, rotation + (i * Math.PI * 2) / total);
    d += `${i ? 'L' : 'M'}${pt(p.x, p.y)}`;
  }
  return `${d}Z`;
}

/** Marker symbol of `size` px (bounding box) centered at (x, y). */
export function symbolPath(shape: SymbolShape, x: number, y: number, size: number): string {
  const r = size / 2;
  switch (shape) {
    case 'none':
      return '';
    case 'circle':
      return `M${pt(x - r, y)}a${n2(r)},${n2(r)} 0 1,0 ${n2(size)},0a${n2(r)},${n2(r)} 0 1,0 ${n2(-size)},0Z`;
    case 'rectangle':
      return rectPath(x - r, y - r, size, size);
    case 'triangle':
      return polygon(x, y + r * 0.15, r * 1.1, 3);
    case 'invertedTriangle':
      return polygon(x, y - r * 0.15, r * 1.1, 3, Math.PI);
    case 'diamond':
      return polygon(x, y, r * 1.15, 4);
    case 'pentagon':
      return polygon(x, y, r * 1.05, 5);
    case 'star':
      return polygon(x, y, r * 1.2, 5, 0, 0.45);
    case 'cross':
    case 'plus':
      return `M${pt(x - r, y)}H${n2(x + r)}M${pt(x, y - r)}V${n2(y + r)}`;
    case 'multiply':
      return `M${pt(x - r, y - r)}L${pt(x + r, y + r)}M${pt(x + r, y - r)}L${pt(x - r, y + r)}`;
    case 'horizontalLine':
      return `M${pt(x - r, y)}H${n2(x + r)}`;
    case 'verticalLine':
      return `M${pt(x, y - r)}V${n2(y + r)}`;
  }
}
