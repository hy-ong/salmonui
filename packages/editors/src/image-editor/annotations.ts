// Annotation model: pure reducers, bounds and hit tests, no
// React and no DOM. Array order is z-order (last on top). Coordinates are
// oriented-image pixels. Loaded lazily with the drawing code.

import { centerOf, type Point, type Rect, type Size } from './geometry.js';
import { flipPoint, resizeFromHandle, rotateAround, rotatePoint90, type Handle } from './transform.js';
import type { ImageEditorAnnotation, ImageEditorTextAnnotation } from './types.js';

/** Measures a text line in a CSS font; the engine passes `ctx.measureText`. */
export type MeasureText = (text: string, font: string) => number;

export const DEFAULT_STROKE = '#e5484d';
export const LINE_HEIGHT = 1.2;

/** Approximate measure for environments without a canvas (tests, SSR). */
export const approxMeasure: MeasureText = (text, font) => text.length * (Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1]) || 16) * 0.6;

export const fontOf = (a: ImageEditorTextAnnotation): string => `${a.italic ? 'italic ' : ''}${a.bold ? 'bold ' : ''}${a.fontSize ?? 32}px ${a.fontFamily ?? 'sans-serif'}`;

export const isPointKind = (a: ImageEditorAnnotation): a is Extract<ImageEditorAnnotation, { points: readonly number[] }> => 'points' in a;

/** Unrotated bounds (before `rotation` is applied around their center). */
export function boundsOf(a: ImageEditorAnnotation, measure: MeasureText = approxMeasure): Rect {
  if (isPointKind(a)) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i + 1 < a.points.length; i += 2) {
      const x = a.points[i]!;
      const y = a.points[i + 1]!;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    if (x0 === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
  }
  if (a.kind === 'text') {
    const size = a.fontSize ?? 32;
    const lines = a.text.split('\n');
    const font = fontOf(a);
    const width = Math.max(size * 0.5, ...lines.map((l) => measure(l, font)));
    return { x: a.x, y: a.y, width, height: lines.length * size * LINE_HEIGHT };
  }
  return { x: a.x, y: a.y, width: a.width, height: a.height };
}

function distToSegment(p: Point, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / len)) : 0;
  return Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy));
}

/** True when `p` (oriented pixels) hits the annotation; `tolerance` widens thin strokes. */
export function hitTest(a: ImageEditorAnnotation, p: Point, tolerance = 4, measure?: MeasureText): boolean {
  const b = boundsOf(a, measure);
  const q = rotateAround(p, centerOf(b), -(a.rotation ?? 0));
  if (isPointKind(a)) {
    const reach = ('strokeWidth' in a ? (a.strokeWidth ?? 4) : 4) / 2 + tolerance;
    const pts = a.points;
    if (a.kind === 'path' && a.closed && a.fill && q.x >= b.x && q.x <= b.x + b.width && q.y >= b.y && q.y <= b.y + b.height) return true;
    for (let i = 0; i + 3 < pts.length; i += 2) if (distToSegment(q, pts[i]!, pts[i + 1]!, pts[i + 2]!, pts[i + 3]!) <= reach) return true;
    if (a.kind === 'path' && a.closed && pts.length >= 4 && distToSegment(q, pts[pts.length - 2]!, pts[pts.length - 1]!, pts[0]!, pts[1]!) <= reach) return true;
    return pts.length === 2 && Math.hypot(q.x - pts[0]!, q.y - pts[1]!) <= reach;
  }
  const t = tolerance;
  if (a.kind === 'ellipse') {
    const rx = b.width / 2 + t;
    const ry = b.height / 2 + t;
    const c = centerOf(b);
    return rx > 0 && ry > 0 && ((q.x - c.x) / rx) ** 2 + ((q.y - c.y) / ry) ** 2 <= 1;
  }
  return q.x >= b.x - t && q.x <= b.x + b.width + t && q.y >= b.y - t && q.y <= b.y + b.height + t;
}

/** The topmost annotation under `p`, or `null`. */
export function hitTopmost(list: readonly ImageEditorAnnotation[], p: Point, tolerance?: number, measure?: MeasureText): ImageEditorAnnotation | null {
  for (let i = list.length - 1; i >= 0; i--) if (hitTest(list[i]!, p, tolerance, measure)) return list[i]!;
  return null;
}

export function moveAnnotation<A extends ImageEditorAnnotation>(a: A, dx: number, dy: number): A {
  if (isPointKind(a)) return { ...a, points: a.points.map((v, i) => v + (i % 2 ? dy : dx)) };
  return { ...a, x: (a as { x: number }).x + dx, y: (a as { y: number }).y + dy };
}

/** Sets the unrotated bounds to `box`: points scale, text scales its font with the height. */
export function setBounds<A extends ImageEditorAnnotation>(a: A, box: Rect, measure?: MeasureText): A {
  const b = boundsOf(a, measure);
  if (isPointKind(a)) {
    const sx = b.width ? box.width / b.width : 1;
    const sy = b.height ? box.height / b.height : 1;
    return { ...a, points: a.points.map((v, i) => (i % 2 ? box.y + (v - b.y) * sy : box.x + (v - b.x) * sx)) };
  }
  if (a.kind === 'text') {
    const size = Math.max(4, Math.round((a.fontSize ?? 32) * (b.height ? box.height / b.height : 1)));
    return { ...a, x: box.x, y: box.y, fontSize: size };
  }
  return { ...a, x: box.x, y: box.y, width: Math.max(1, box.width), height: Math.max(1, box.height) };
}

/** Drags a handle of the annotation to `pointer` (oriented pixels). Text and images keep their ratio. */
export function resizeAnnotation<A extends ImageEditorAnnotation>(a: A, handle: Handle, pointer: Point, keepAspect = false, measure?: MeasureText): A {
  const b = boundsOf(a, measure);
  const lock = keepAspect || a.kind === 'text' || a.kind === 'image';
  // Lines keep zero-height bounds; give the box a nominal extent so a handle can move them.
  const box = { ...b, width: Math.max(1, b.width), height: Math.max(1, b.height) };
  return setBounds(a, resizeFromHandle(box, a.rotation ?? 0, handle, pointer, lock ? box.width / box.height : null), measure);
}

export function rotateAnnotation<A extends ImageEditorAnnotation>(a: A, deg: number): A {
  const r = (((a.rotation ?? 0) + deg) % 360 + 360) % 360;
  return { ...a, rotation: Math.round(r * 100) / 100 };
}

/** A copy with a new id, offset so it does not hide the original. */
export function cloneAnnotation<A extends ImageEditorAnnotation>(a: A, id: string, offset = 16): A {
  return { ...moveAnnotation(a, offset, offset), id };
}

export const findAnnotation = (list: readonly ImageEditorAnnotation[], id: string | null | undefined): ImageEditorAnnotation | undefined => (id == null ? undefined : list.find((a) => a.id === id));

export function updateAnnotation(list: readonly ImageEditorAnnotation[], id: string, update: (a: ImageEditorAnnotation) => ImageEditorAnnotation): readonly ImageEditorAnnotation[] {
  let changed = false;
  const next = list.map((a) => {
    if (a.id !== id) return a;
    const n = update(a);
    if (n !== a) changed = true;
    return n;
  });
  return changed ? next : list;
}

export const removeAnnotation = (list: readonly ImageEditorAnnotation[], id: string): readonly ImageEditorAnnotation[] => (list.some((a) => a.id === id) ? list.filter((a) => a.id !== id) : list);

export type ZOrderMove = 'forward' | 'backward' | 'front' | 'back';

/** Reorders the array (z-order) for the bring forward / send backward / to front / to back items. */
export function reorderAnnotation(list: readonly ImageEditorAnnotation[], id: string, move: ZOrderMove): readonly ImageEditorAnnotation[] {
  const i = list.findIndex((a) => a.id === id);
  if (i < 0) return list;
  const to = move === 'front' ? list.length - 1 : move === 'back' ? 0 : move === 'forward' ? Math.min(list.length - 1, i + 1) : Math.max(0, i - 1);
  if (to === i) return list;
  const next = list.slice();
  const [item] = next.splice(i, 1);
  next.splice(to, 0, item!);
  return next;
}

/** A fresh id not used in `list` (`kind-n`). */
export function nextId(list: readonly ImageEditorAnnotation[], kind: string): string {
  const used = new Set(list.map((a) => a.id));
  let n = list.length + 1;
  while (used.has(`${kind}-${n}`)) n++;
  return `${kind}-${n}`;
}

function mapBoxed<A extends ImageEditorAnnotation>(a: A, map: (p: Point) => Point, rotation: (r: number) => number, measure?: MeasureText): A {
  if (isPointKind(a)) {
    const pts: number[] = [];
    for (let i = 0; i + 1 < a.points.length; i += 2) {
      const p = map({ x: a.points[i]!, y: a.points[i + 1]! });
      pts.push(p.x, p.y);
    }
    const r = a.rotation ? rotation(a.rotation) - rotation(0) : 0;
    return { ...a, points: pts, rotation: r ? ((r % 360) + 360) % 360 : a.rotation };
  }
  const b = boundsOf(a, measure);
  const c = map(centerOf(b));
  const moved = { ...a, x: c.x - b.width / 2, y: c.y - b.height / 2 };
  const r = ((rotation(a.rotation ?? 0) % 360) + 360) % 360;
  return { ...moved, rotation: r || undefined } as A;
}

/** Follows a 90-degree turn of the image (`size` is the oriented size before the turn). */
export function rotateAnnotations90(list: readonly ImageEditorAnnotation[], size: Size, dir: 1 | -1, measure?: MeasureText): readonly ImageEditorAnnotation[] {
  return list.map((a) => {
    if (a.kind === 'rectangle' || a.kind === 'ellipse' || a.kind === 'redact') {
      // Symmetric boxes turn by swapping their sides; the own rotation stays.
      const c = rotatePoint90(centerOf(a), size, dir);
      return { ...a, x: c.x - a.height / 2, y: c.y - a.width / 2, width: a.height, height: a.width };
    }
    return mapBoxed(a, (p) => rotatePoint90(p, size, dir), (r) => r + dir * 90, measure);
  });
}

/** Follows a flip of the image; text stays readable (mirrored position, not glyphs). */
export function flipAnnotations(list: readonly ImageEditorAnnotation[], size: Size, axis: 'horizontal' | 'vertical', measure?: MeasureText): readonly ImageEditorAnnotation[] {
  return list.map((a) => mapBoxed(a, (p) => flipPoint(p, size, axis), (r) => -r, measure));
}
