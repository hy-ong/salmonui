// Canvas 2D drawing of annotations, redaction and frames. No
// browser global at module level: canvases come from the engine's factory.
// Loaded lazily, with `annotations.ts`, the first time an edit needs it.

import { boundsOf, DEFAULT_STROKE, fontOf, isPointKind, LINE_HEIGHT, type MeasureText } from './annotations.js';
import { centerOf, type Rect } from './geometry.js';
import { rotateAround } from './transform.js';
import type { ImageEditorAnnotation, ImageEditorFrame, ImageEditorRedactAnnotation } from './types.js';

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface DrawEnv {
  readonly createCanvas: (width: number, height: number) => AnyCanvas;
  /** A decoded image for an `'image'` annotation, or `null` while it loads. */
  readonly image: (src: string) => CanvasImageSource | null;
  readonly filterSupported: boolean;
  readonly pixels: typeof import('./pixels.js') | null;
  readonly measure: MeasureText;
}

/** Oriented to output mapping: `out = (p - o) * k`. */
export interface OutputMap {
  readonly ox: number;
  readonly oy: number;
  readonly kx: number;
  readonly ky: number;
}

const ctx2d = (c: AnyCanvas): Ctx2D => c.getContext('2d') as Ctx2D;

function setMap(ctx: Ctx2D, m: OutputMap, a: ImageEditorAnnotation, b: Rect): void {
  ctx.setTransform(m.kx, 0, 0, m.ky, -m.ox * m.kx, -m.oy * m.ky);
  const r = a.rotation ?? 0;
  if (r) {
    const c = centerOf(b);
    ctx.translate(c.x, c.y);
    ctx.rotate((r * Math.PI) / 180);
    ctx.translate(-c.x, -c.y);
  }
}

function strokeAndFill(ctx: Ctx2D, a: { stroke?: string | undefined; fill?: string | undefined; strokeWidth?: number | undefined }, fillable: boolean): void {
  if (fillable && a.fill && a.fill !== 'transparent') {
    ctx.fillStyle = a.fill;
    ctx.fill();
  }
  const width = a.strokeWidth ?? 4;
  const stroke = a.stroke ?? (fillable && a.fill ? undefined : DEFAULT_STROKE);
  if (stroke && stroke !== 'transparent' && width > 0) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function polyline(ctx: Ctx2D, pts: readonly number[], smooth: boolean): void {
  ctx.moveTo(pts[0]!, pts[1]!);
  if (pts.length === 2) {
    ctx.lineTo(pts[0]! + 0.01, pts[1]!);
    return;
  }
  if (!smooth || pts.length < 6) {
    for (let i = 2; i + 1 < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
    return;
  }
  // Freehand: quadratic curves through the midpoints of the samples.
  for (let i = 2; i + 3 < pts.length; i += 2) {
    const mx = (pts[i]! + pts[i + 2]!) / 2;
    const my = (pts[i + 1]! + pts[i + 3]!) / 2;
    ctx.quadraticCurveTo(pts[i]!, pts[i + 1]!, mx, my);
  }
  ctx.lineTo(pts[pts.length - 2]!, pts[pts.length - 1]!);
}

/** Device-pixel bounds of the (rotated) box on the output canvas, clamped to it. */
function deviceBounds(b: Rect, rotation: number, m: OutputMap, w: number, h: number): Rect {
  const c = centerOf(b);
  const corners = [
    { x: b.x, y: b.y },
    { x: b.x + b.width, y: b.y },
    { x: b.x + b.width, y: b.y + b.height },
    { x: b.x, y: b.y + b.height },
  ].map((p) => rotateAround(p, c, rotation));
  const xs = corners.map((p) => (p.x - m.ox) * m.kx);
  const ys = corners.map((p) => (p.y - m.oy) * m.ky);
  const x0 = Math.max(0, Math.floor(Math.min(...xs)));
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const x1 = Math.min(w, Math.ceil(Math.max(...xs)));
  const y1 = Math.min(h, Math.ceil(Math.max(...ys)));
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/** Burns a blur or pixelation of what is already drawn into the annotation's box. */
function drawRedact(ctx: Ctx2D, a: ImageEditorRedactAnnotation, m: OutputMap, env: DrawEnv): void {
  const canvas = ctx.canvas as AnyCanvas;
  const b = boundsOf(a);
  const d = deviceBounds(b, a.rotation ?? 0, m, canvas.width, canvas.height);
  if (!d.width || !d.height) return;
  const strength = Math.max(1, (a.strength ?? 12) * Math.max(m.kx, m.ky));
  const pixelate = a.mode === 'pixelate';
  // A margin around a blurred region keeps its edges from fading to transparent.
  const pad = pixelate ? 0 : Math.ceil(strength * 2);
  const sx = Math.max(0, d.x - pad);
  const sy = Math.max(0, d.y - pad);
  const sw = Math.min(canvas.width, d.x + d.width + pad) - sx;
  const sh = Math.min(canvas.height, d.y + d.height + pad) - sy;
  const scratch = env.createCanvas(sw, sh);
  const sctx = ctx2d(scratch);
  if (pixelate || !env.filterSupported) {
    sctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
    const img = sctx.getImageData(0, 0, sw, sh);
    if (env.pixels) {
      if (pixelate) env.pixels.pixelatePixels(img.data, sw, sh, strength);
      else env.pixels.blurPixels(img.data, sw, sh, strength);
    }
    sctx.putImageData(img, 0, 0);
  } else {
    sctx.filter = `blur(${strength}px)`;
    sctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
  }
  ctx.save();
  setMap(ctx, m, a, b);
  ctx.beginPath();
  ctx.rect(b.x, b.y, b.width, b.height);
  ctx.clip();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = a.opacity ?? 1;
  ctx.drawImage(scratch, sx, sy);
  ctx.restore();
}

/** Draws `list` in array order onto an output canvas (`m` maps oriented to output pixels). */
export function drawAnnotations(ctx: Ctx2D, list: readonly ImageEditorAnnotation[], m: OutputMap, env: DrawEnv): void {
  for (const a of list) {
    if (a.kind === 'redact') {
      drawRedact(ctx, a, m, env);
      continue;
    }
    const b = boundsOf(a, env.measure);
    ctx.save();
    setMap(ctx, m, a, b);
    ctx.globalAlpha = a.opacity ?? 1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    if (isPointKind(a)) {
      if (a.points.length >= 2) {
        polyline(ctx, a.points, a.kind === 'freehand');
        if (a.kind === 'path' && a.closed) ctx.closePath();
        strokeAndFill(ctx, a, a.kind === 'path' && !!a.closed);
        if (a.kind === 'arrow' && a.points.length >= 4) {
          const n = a.points.length;
          const x2 = a.points[n - 2]!;
          const y2 = a.points[n - 1]!;
          const t = Math.atan2(y2 - a.points[n - 3]!, x2 - a.points[n - 4]!);
          const size = Math.max(10, (a.strokeWidth ?? 4) * 3.5);
          ctx.beginPath();
          ctx.moveTo(x2, y2);
          ctx.lineTo(x2 - size * Math.cos(t - 0.45), y2 - size * Math.sin(t - 0.45));
          ctx.lineTo(x2 - size * Math.cos(t + 0.45), y2 - size * Math.sin(t + 0.45));
          ctx.closePath();
          ctx.fillStyle = a.stroke ?? DEFAULT_STROKE;
          ctx.fill();
        }
      }
    } else if (a.kind === 'rectangle') {
      if (a.radius && 'roundRect' in ctx) ctx.roundRect(a.x, a.y, a.width, a.height, a.radius);
      else ctx.rect(a.x, a.y, a.width, a.height);
      strokeAndFill(ctx, a, true);
    } else if (a.kind === 'ellipse') {
      ctx.ellipse(a.x + a.width / 2, a.y + a.height / 2, Math.abs(a.width / 2), Math.abs(a.height / 2), 0, 0, Math.PI * 2);
      strokeAndFill(ctx, a, true);
    } else if (a.kind === 'text') {
      const size = a.fontSize ?? 32;
      ctx.font = fontOf(a);
      ctx.textBaseline = 'top';
      ctx.fillStyle = a.color ?? DEFAULT_STROKE;
      a.text.split('\n').forEach((line, i) => ctx.fillText(line, a.x, a.y + i * size * LINE_HEIGHT));
    } else if (a.kind === 'image') {
      const img = env.image(a.src);
      if (img) ctx.drawImage(img, a.x, a.y, a.width, a.height);
    }
    ctx.restore();
  }
}

/** Draws a frame over the output edges. */
export function drawFrame(ctx: Ctx2D, w: number, h: number, frame: ImageEditorFrame): void {
  if (frame.type === 'none') return;
  const size = Math.max(1, frame.size ?? Math.round(Math.min(w, h) * 0.05));
  const inset = frame.inset ?? size;
  const radius = Math.max(0, frame.radius ?? 0);
  let paint: string | CanvasGradient = frame.color ?? '#ffffff';
  if (frame.gradientColor) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, frame.color ?? '#ffffff');
    g.addColorStop(1, frame.gradientColor);
    paint = g;
  }
  const rounded = (x: number, y: number, rw: number, rh: number, r: number): void => {
    if (r > 0 && 'roundRect' in ctx) ctx.roundRect(x, y, rw, rh, Math.min(r, rw / 2, rh / 2));
    else ctx.rect(x, y, rw, rh);
  };
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = paint;
  ctx.strokeStyle = paint;
  const band = (): void => {
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    rounded(size, size, w - 2 * size, h - 2 * size, radius);
    ctx.fill('evenodd');
  };
  if (frame.type === 'mat' || frame.type === 'bevel' || frame.type === 'inset') band();
  if (frame.type === 'bevel') {
    const t = Math.max(1, size / 4);
    ctx.lineWidth = t;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(size - t / 2, h - size + t / 2);
    ctx.lineTo(size - t / 2, size - t / 2);
    ctx.lineTo(w - size + t / 2, size - t / 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(w - size + t / 2, size - t / 2);
    ctx.lineTo(w - size + t / 2, h - size + t / 2);
    ctx.lineTo(size - t / 2, h - size + t / 2);
    ctx.stroke();
  }
  if (frame.type === 'line' || frame.type === 'inset') {
    const lw = frame.type === 'inset' ? Math.max(1, size / 4) : size;
    const at = frame.type === 'inset' ? size + inset / 2 : inset / 2;
    ctx.lineWidth = lw;
    ctx.strokeStyle = paint;
    ctx.beginPath();
    rounded(at, at, w - 2 * at, h - 2 * at, radius);
    ctx.stroke();
  }
  if (frame.type === 'hook') {
    const len = Math.min(w, h) * 0.15;
    const at = inset / 2 + size / 2;
    ctx.lineWidth = size;
    ctx.lineCap = 'square';
    ctx.beginPath();
    for (const [x, y, dx, dy] of [
      [at, at, 1, 1],
      [w - at, at, -1, 1],
      [w - at, h - at, -1, -1],
      [at, h - at, 1, -1],
    ] as const) {
      ctx.moveTo(x + dx * len, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + dy * len);
    }
    ctx.stroke();
  }
  ctx.restore();
}
