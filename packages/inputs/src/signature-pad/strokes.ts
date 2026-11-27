// SignaturePad stroke model. Pure functions, no React and no DOM: the canvas render and
// `toSVG()` both walk `segments()`, so the raster and the vector output use
// the same smoothed curves and widths.

/** A drawn stroke. `points` is flat `[x, y, pressure, t, ...]` in CSS pixels of the pad; pressure is -1 without a pen. */
export interface Stroke {
  readonly kind: 'stroke';
  readonly points: readonly number[];
  readonly color: string;
  readonly minWidth: number;
  readonly maxWidth: number;
  /** Velocity filter weight 0..1. */
  readonly velocity: number;
}

/** Text drawn by `drawText` or the "type your name" mode, centered. */
export interface TextItem {
  readonly kind: 'text';
  readonly text: string;
  readonly fontFamily: string;
  /** CSS pixels; 0 fits the text to the pad. */
  readonly fontSize: number;
  readonly color: string;
}

export type SignatureItem = Stroke | TextItem;

/** One undo step: an optional loaded image under the items. */
export interface SignatureState {
  readonly base: string | null;
  readonly items: readonly SignatureItem[];
}

export const EMPTY_STATE: SignatureState = Object.freeze({ base: null, items: Object.freeze([]) as readonly SignatureItem[] });

/** Incremental stroke width from velocity (px/ms, filtered) or pen pressure. */
export class WidthTracker {
  private v = 0;
  private x = 0;
  private y = 0;
  private t = 0;
  private started = false;
  constructor(private readonly s: Pick<Stroke, 'minWidth' | 'maxWidth' | 'velocity'>) {}
  next(x: number, y: number, pressure: number, t: number): number {
    const { minWidth, maxWidth, velocity } = this.s;
    if (pressure >= 0) {
      this.track(x, y, t);
      return minWidth + (maxWidth - minWidth) * pressure;
    }
    if (this.started) {
      const dt = t - this.t;
      const speed = dt > 0 ? Math.hypot(x - this.x, y - this.y) / dt : this.v;
      this.v = velocity * speed + (1 - velocity) * this.v;
    }
    this.track(x, y, t);
    return Math.max(maxWidth / (this.v + 1), minWidth);
  }
  private track(x: number, y: number, t: number): void {
    this.x = x;
    this.y = y;
    this.t = t;
    this.started = true;
  }
}

/** Widths of every point of a stroke. */
export function widthsOf(stroke: Stroke): number[] {
  const tracker = new WidthTracker(stroke);
  const p = stroke.points;
  const out: number[] = [];
  for (let i = 0; i < p.length; i += 4) out.push(tracker.next(p[i]!, p[i + 1]!, p[i + 2]!, p[i + 3]!));
  return out;
}

/** Segment callback: a cubic Bézier from (x0, y0) to (x1, y1) and its width. */
export type SegmentFn = (x0: number, y0: number, c1x: number, c1y: number, c2x: number, c2y: number, x1: number, y1: number, width: number) => void;

/**
 * Calls `fn` for segments `from..to - 1` (segment i joins points i and i + 1)
 * with control points from the neighbors (Catmull-Rom style, as signature_pad).
 * Segment i needs point i + 2, so a live stroke draws up to `count - 3` and
 * the rest at its end; the result equals a full redraw.
 */
export function segments(points: readonly number[], widths: readonly number[], fn: SegmentFn, from = 0, to = points.length / 4 - 1): void {
  const n = points.length / 4;
  const X = (i: number): number => points[Math.max(0, Math.min(n - 1, i)) * 4]!;
  const Y = (i: number): number => points[Math.max(0, Math.min(n - 1, i)) * 4 + 1]!;
  for (let i = from; i < to; i++) {
    // Outgoing control of point i (neighbors i - 1, i + 1), incoming control of point i + 1 (neighbors i, i + 2).
    control(X(i - 1), Y(i - 1), X(i), Y(i), X(i + 1), Y(i + 1), A);
    control(X(i), Y(i), X(i + 1), Y(i + 1), X(i + 2), Y(i + 2), B);
    fn(X(i), Y(i), A[2], A[3], B[0], B[1], X(i + 1), Y(i + 1), (widths[i]! + widths[i + 1]!) / 2);
  }
}

const A: [number, number, number, number] = [0, 0, 0, 0];
const B: [number, number, number, number] = [0, 0, 0, 0];

/** Control points around (x2, y2): `[inX, inY, outX, outY]` written into `out`. */
function control(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, out: [number, number, number, number]): void {
  const m1x = (x1 + x2) / 2;
  const m1y = (y1 + y2) / 2;
  const m2x = (x2 + x3) / 2;
  const m2y = (y2 + y3) / 2;
  const l1 = Math.hypot(x1 - x2, y1 - y2);
  const l2 = Math.hypot(x2 - x3, y2 - y3);
  const k = l1 + l2 > 0 ? l1 / (l1 + l2) : 0.5;
  // The point on m1..m2 split like the two chords; shifting it onto (x2, y2) moves both controls.
  const tx = x2 - (m1x + (m2x - m1x) * k);
  const ty = y2 - (m1y + (m2y - m1y) * k);
  out[0] = m1x + tx;
  out[1] = m1y + ty;
  out[2] = m2x + tx;
  out[3] = m2y + ty;
}

const round = (n: number): number => Math.round(n * 100) / 100;

const escape = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Font size of a text item for a pad of `width` by `height` CSS pixels. */
export function fontSizeOf(item: TextItem, width: number, height: number, measure?: (size: number) => number): number {
  if (item.fontSize > 0) return item.fontSize;
  let size = Math.max(12, Math.round(height * 0.4));
  if (measure) {
    const w = measure(size);
    if (w > width * 0.9 && w > 0) size = Math.max(8, Math.floor((size * width * 0.9) / w));
  }
  return size;
}

/** SVG markup of a state: one path per segment, a circle per dot. */
export function toSVG(state: SignatureState, width: number, height: number, background: { readonly color?: string | undefined; readonly image?: string | undefined } | null): string {
  let body = '';
  if (background?.color) body += `<rect width="100%" height="100%" fill="${escape(background.color)}"/>`;
  if (background?.image) body += `<image href="${escape(background.image)}" width="${width}" height="${height}" preserveAspectRatio="none"/>`;
  if (state.base) body += `<image href="${escape(state.base)}" width="${width}" height="${height}" preserveAspectRatio="none"/>`;
  for (const item of state.items) {
    if (item.kind === 'text') {
      const size = fontSizeOf(item, width, height);
      body += `<text x="${round(width / 2)}" y="${round(height / 2)}" fill="${escape(item.color)}" font-family="${escape(item.fontFamily)}" font-size="${size}" text-anchor="middle" dominant-baseline="middle">${escape(item.text)}</text>`;
      continue;
    }
    const p = item.points;
    const w = widthsOf(item);
    if (p.length === 4) {
      body += `<circle cx="${round(p[0]!)}" cy="${round(p[1]!)}" r="${round(w[0]! / 2)}" fill="${escape(item.color)}"/>`;
      continue;
    }
    segments(p, w, (x0, y0, c1x, c1y, c2x, c2y, x1, y1, width) => {
      body += `<path d="M${round(x0)} ${round(y0)}C${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(x1)} ${round(y1)}" stroke="${escape(item.color)}" stroke-width="${round(width)}" fill="none" stroke-linecap="round"/>`;
    });
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
}
