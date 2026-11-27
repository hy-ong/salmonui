// Text markup annotation model for PdfViewer. Pure: coordinate
// transforms between PDF user space and page CSS pixels (the pdf.js
// PageViewport matrix), selection rectangles to merged line rectangles,
// QuadPoints and appearance outlines for the writer, and the byte patch
// that gives saved underline and strikethrough annotations their subtype.
import type { PdfRect, PdfTextMarkupAnnotation, PdfTextMarkupKind } from './types.js';

/** A page's `/MediaBox`-derived view box `[x0, y0, x1, y1]` and `/Rotate`. */
export interface PageGeometry {
  readonly view: readonly [number, number, number, number];
  readonly rotate: number;
}

export interface CssRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

type Matrix = readonly [number, number, number, number, number, number];

/** The pdf.js PageViewport transform for `scale` (CSS px per PDF unit). */
export function pageTransform(geometry: PageGeometry, scale: number): Matrix {
  const [x0, y0, x1, y1] = geometry.view;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const rotation = ((geometry.rotate % 360) + 360) % 360;
  let a = 1;
  let b = 0;
  let c = 0;
  let d = -1;
  if (rotation === 90) [a, b, c, d] = [0, 1, 1, 0];
  else if (rotation === 180) [a, b, c, d] = [-1, 0, 0, 1];
  else if (rotation === 270) [a, b, c, d] = [0, -1, -1, 0];
  const ox = a === 0 ? Math.abs(cy - y0) * scale : Math.abs(cx - x0) * scale;
  const oy = a === 0 ? Math.abs(cx - x0) * scale : Math.abs(cy - y0) * scale;
  return [a * scale, b * scale, c * scale, d * scale, ox - a * scale * cx - c * scale * cy, oy - b * scale * cx - d * scale * cy];
}

const apply = (m: Matrix, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function invert(m: Matrix): Matrix {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/** Page CSS rectangle (at `scale`) to a normalized PDF rectangle. */
export function cssRectToPdf(geometry: PageGeometry, scale: number, rect: CssRect): PdfRect {
  const inv = invert(pageTransform(geometry, scale));
  const [ax, ay] = apply(inv, rect.left, rect.top);
  const [bx, by] = apply(inv, rect.left + rect.width, rect.top + rect.height);
  return [round2(Math.min(ax, bx)), round2(Math.min(ay, by)), round2(Math.max(ax, bx)), round2(Math.max(ay, by))];
}

/** PDF rectangle to a page CSS rectangle at `scale`. */
export function pdfRectToCss(geometry: PageGeometry, scale: number, rect: PdfRect): CssRect {
  const m = pageTransform(geometry, scale);
  const [ax, ay] = apply(m, rect[0], rect[1]);
  const [bx, by] = apply(m, rect[2], rect[3]);
  return { left: Math.min(ax, bx), top: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}

/**
 * Merges selection client rectangles into one rectangle per line: rectangles
 * that overlap vertically by at least half the smaller height and touch
 * horizontally join; empty and contained rectangles drop.
 */
export function mergeLineRects(rects: readonly CssRect[]): CssRect[] {
  const list = rects.filter((r) => r.width > 0.5 && r.height > 0.5).map((r) => ({ l: r.left, t: r.top, r: r.left + r.width, b: r.top + r.height }));
  list.sort((p, q) => p.t - q.t || p.l - q.l);
  const out: Array<{ l: number; t: number; r: number; b: number }> = [];
  for (const cur of list) {
    const line = out.find((o) => {
      const overlap = Math.min(o.b, cur.b) - Math.max(o.t, cur.t);
      return overlap >= Math.min(o.b - o.t, cur.b - cur.t) / 2 && cur.l <= o.r + 4 && cur.r >= o.l - 4;
    });
    if (line) {
      line.l = Math.min(line.l, cur.l);
      line.r = Math.max(line.r, cur.r);
      line.t = Math.min(line.t, cur.t);
      line.b = Math.max(line.b, cur.b);
    } else out.push({ ...cur });
  }
  return out.map((o) => ({ left: o.l, top: o.t, width: o.r - o.l, height: o.b - o.t }));
}

/** Bounding rectangle of PDF rectangles. */
export function boundingRect(rects: readonly PdfRect[]): PdfRect {
  let [x1, y1, x2, y2] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rects) {
    x1 = Math.min(x1, r[0]);
    y1 = Math.min(y1, r[1]);
    x2 = Math.max(x2, r[2]);
    y2 = Math.max(y2, r[3]);
  }
  return rects.length ? [x1, y1, x2, y2] : [0, 0, 0, 0];
}

/** `/QuadPoints` of line rectangles (upper left, upper right, lower left, lower right per line). */
export function quadPoints(rects: readonly PdfRect[]): number[] {
  return rects.flatMap((r) => [r[0], r[3], r[2], r[3], r[0], r[1], r[2], r[1]]);
}

/**
 * The band of a line rectangle a markup kind paints, in PDF units: the whole
 * line for a highlight, a thin bar near the bottom for an underline, one
 * through the middle for a strikethrough.
 */
export function markBand(kind: PdfTextMarkupKind, rect: PdfRect): PdfRect {
  if (kind === 'highlight') return rect;
  const h = rect[3] - rect[1];
  const t = Math.max(0.5, h * 0.07);
  const y = kind === 'underline' ? rect[1] + h * 0.08 : rect[1] + h * 0.45;
  return [rect[0], round2(y), rect[2], round2(y + t)];
}

/** Closed polygons (`[x, y, ...]`) of the appearance stream the writer draws. */
export function markOutlines(kind: PdfTextMarkupKind, rects: readonly PdfRect[]): number[][] {
  return rects.map((r) => {
    const [x1, y1, x2, y2] = markBand(kind, r);
    return [x1, y1, x2, y1, x2, y2, x1, y2];
  });
}

export const DEFAULT_MARKUP_COLORS: Readonly<Record<PdfTextMarkupKind, string>> = Object.freeze({ highlight: '#ffd400', underline: '#2563eb', strikethrough: '#dc2626' });

/** `#rgb` / `#rrggbb` to 0..255 components (black when unparsable). */
export function hexToRgb(color: string): [number, number, number] {
  let hex = color.trim().replace(/^#/, '');
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c);
  const n = /^[0-9a-f]{6}$/i.test(hex) ? Number.parseInt(hex, 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Editor-storage record pdf.js `saveDocument` writes as a markup annotation (HIGHLIGHT editor type, outlines as appearance). */
export function toEngineRecord(annotation: PdfTextMarkupAnnotation): Record<string, unknown> {
  const rect = boundingRect(annotation.rects);
  const record: Record<string, unknown> = {
    annotationType: 9,
    pageIndex: annotation.page - 1,
    color: hexToRgb(annotation.color),
    opacity: annotation.opacity ?? 1,
    thickness: 1,
    quadPoints: quadPoints(annotation.rects),
    outlines: markOutlines(annotation.kind, annotation.rects),
    rect: [...rect],
    rotation: 0,
    user: annotation.author,
    date: annotation.createdAt,
    structTreeParentId: null,
  };
  if (annotation.comment) record['popup'] = { contents: annotation.comment, rect: [rect[2], rect[3] - 80, rect[2] + 160, rect[3]] };
  return record;
}

const SUBTYPE: Readonly<Record<PdfTextMarkupKind, string>> = { highlight: '/Highlight', underline: '/Underline', strikethrough: '/StrikeOut' };
const latin1 = (bytes: Uint8Array, from: number) => {
  let s = '';
  for (let i = from; i < bytes.length; i += 8192) s += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + 8192)));
  return s;
};
const nums = (s: string) => s.trim().split(/\s+/).map(Number);

/**
 * pdf.js writes every new markup annotation as `/Highlight`. The names
 * `/Highlight`, `/Underline` and `/StrikeOut` have the same byte length, so
 * the subtype of each annotation appended after `from` is patched in place
 * (xref offsets stay valid); the annotation is found by its `/Rect`.
 * Returns the number of patched annotations.
 */
export function patchMarkupSubtypes(bytes: Uint8Array, from: number, annotations: readonly PdfTextMarkupAnnotation[]): number {
  const wanted = annotations.filter((a) => a.kind !== 'highlight').map((a) => ({ a, rect: boundingRect(a.rects), done: false }));
  if (!wanted.length) return 0;
  const tail = latin1(bytes, from);
  const objRe = /\d+\s+\d+\s+obj\b([\s\S]*?)\bendobj\b/g;
  let patched = 0;
  for (let m = objRe.exec(tail); m; m = objRe.exec(tail)) {
    const body = m[1] as string;
    const sub = body.indexOf('/Subtype /Highlight');
    const rect = /\/Rect\s*\[([^\]]*)\]/.exec(body);
    if (sub < 0 || !rect) continue;
    const r = nums(rect[1] as string);
    const hit = wanted.find((w) => !w.done && w.rect.every((v, i) => Math.abs(v - (r[i] ?? NaN)) < 0.6));
    if (!hit) continue;
    hit.done = true;
    const at = from + m.index + m[0].indexOf(body) + sub + '/Subtype '.length;
    const name = SUBTYPE[hit.a.kind];
    for (let i = 0; i < name.length; i++) bytes[at + i] = name.charCodeAt(i);
    patched++;
  }
  return patched;
}

let seq = 0;
/** A fresh annotation id (time based, unique per session). */
export const annotationId = (): string => `pdfv-${Date.now().toString(36)}-${(seq++).toString(36)}`;
