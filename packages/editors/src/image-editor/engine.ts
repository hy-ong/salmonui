// The ImageEditor render engine: a Canvas 2D
// renderer that lives outside React. React hands it the committed edit
// (`sync`); it repaints in a requestAnimationFrame loop. Pointer, pinch,
// pan, wheel and drag transients live in the lazily loaded interaction layer
// (`interact.ts`, `engine.ui`), never in React state. No browser global is read at module level.

import { cssFilter, filterOps, type FilterOp } from './adjust.js';
import { clamp, cropOf, fitView, normRotation, normStraighten, orientedSize, outputSize, straightenScale, type Point, type Size } from './geometry.js';
import type { EngineUI } from './interact.js';
import type { ImageEditorAnnotation, ImageEditorAnnotationKind, ImageEditorEditState, ImageEditorInputSource, ImageEditorSource, ImageEditorTool } from './types.js';

export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type AnnotationsModule = typeof import('./annotations.js');
type DrawModule = typeof import('./draw.js');
type PixelsModule = typeof import('./pixels.js');

/** Committed operations the interaction layer proposes; the component turns them into change callbacks. */
export interface EngineHost {
  annotations(next: readonly ImageEditorAnnotation[], action: 'add' | 'update' | 'delete', source: ImageEditorInputSource, select?: string | null): void;
  select(id: string | null, source: ImageEditorInputSource): void;
  /** `false` when `onBeforeZoom` cancelled. */
  zoom(zoom: number, source: ImageEditorInputSource): boolean;
  /** `false` when `onBeforePan` cancelled. */
  panStart(source: ImageEditorInputSource): boolean;
  panEnd(pan: Point, source: ImageEditorInputSource): void;
  editText(id: string): void;
  pickImage(at: Point): void;
  /** The crop draft changed (the quick toolbar follows it). */
  cropDraft(): void;
  /** A new annotation of `kind` at the oriented point: default-sized and centered when `sized`, else empty at the point (a drag grows it). */
  create(kind: ImageEditorAnnotationKind, at: Point, list: readonly ImageEditorAnnotation[], sized: boolean): ImageEditorAnnotation | null;
}

export interface EngineState extends ImageEditorEditState {
  readonly zoom: number;
  readonly tool: ImageEditorTool;
  readonly selected: string | null;
  readonly editing: string | null;
  readonly smoothing: boolean;
  readonly minZoom: number;
  readonly maxZoom: number;
}

export interface View {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
  readonly scene: Size;
  readonly space: 'oriented' | 'output';
}

export class ImageEditorEngine {
  host: EngineHost;
  state: EngineState | null = null;
  source: CanvasImageSource | null = null;
  size: Size | null = null;
  canvas: HTMLCanvasElement | null = null;
  textBox: HTMLElement | null = null;
  quick: HTMLElement | null = null;
  /** The interaction layer, once its chunk has loaded. */
  ui: EngineUI | null = null;
  // Live view (the committed zoom arrives through `sync`).
  zoom = 1;
  pan: Point = { x: 0, y: 0 };
  /** Set while a wheel zoom waits for its commit. */
  zoomPending = false;
  /** Annotations shown instead of the committed ones while a drag runs. */
  draft: readonly ImageEditorAnnotation[] | null = null;
  /** An annotation being placed (a path), drawn on top. */
  extra: ImageEditorAnnotation | null = null;
  /** Uncommitted panel values (a slider being dragged) shown over the committed state. */
  preview: { readonly adjustments?: ImageEditorEditState['adjustments']; readonly frame?: ImageEditorEditState['frame']; readonly straighten?: number } | null = null;
  viewport: Size = { width: 0, height: 0 };
  dpr = 1;
  private frame = 0;
  private orientedCache: { key: string; canvas: AnyCanvas } | null = null;
  private outputCache: { key: unknown[]; canvas: AnyCanvas } | null = null;
  private images = new Map<string, CanvasImageSource | 'loading' | 'error'>();
  mods: { annotations: AnnotationsModule | null; draw: DrawModule | null; pixels: PixelsModule | null } = { annotations: null, draw: null, pixels: null };
  private loading: Promise<void> | null = null;
  private stop: (() => void) | null = null;
  private filterOk: boolean | null = null;
  private loadToken = 0;

  constructor(host: EngineHost) {
    this.host = host;
  }

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    const win = canvas.ownerDocument.defaultView;
    const measure = (): void => {
      const r = canvas.getBoundingClientRect();
      this.viewport = { width: r.width, height: r.height };
      this.dpr = win?.devicePixelRatio || 1;
      this.invalidate();
    };
    const observer = win && 'ResizeObserver' in win ? new win.ResizeObserver(measure) : null;
    observer?.observe(canvas);
    measure();
    const wheel = (e: WheelEvent): void => this.ui?.wheel(e);
    canvas.addEventListener('wheel', wheel, { passive: false });
    this.stop = () => {
      observer?.disconnect();
      canvas.removeEventListener('wheel', wheel);
      if (this.frame) win?.cancelAnimationFrame(this.frame);
      this.frame = 0;
    };
  }

  detach(): void {
    this.stop?.();
    this.stop = null;
    this.ui?.detach();
    this.canvas = null;
  }

  /** Takes the committed state from React (every commit). */
  sync(state: EngineState): void {
    const prev = this.state;
    this.state = state;
    if (!this.ui?.busy() && !this.zoomPending) this.zoom = clamp(state.zoom, state.minZoom, state.maxZoom);
    this.ui?.sync(prev, state);
    if (state.annotations.length || state.frame.type !== 'none') void this.need(state.annotations);
    this.invalidate();
  }

  /** Loads `src`; resolves with the source size. A newer call supersedes an older one. */
  async load(src: ImageEditorSource, crossOrigin: string | null | undefined): Promise<Size | null> {
    const token = ++this.loadToken;
    const doc = this.canvas?.ownerDocument;
    let img: CanvasImageSource;
    let size: Size;
    if (typeof src === 'string') {
      if (!doc) return null;
      const el = doc.createElement('img');
      if (crossOrigin !== null && !/^(data|blob):/.test(src)) el.crossOrigin = crossOrigin ?? 'anonymous';
      el.src = src;
      await el.decode();
      img = el;
      size = { width: el.naturalWidth, height: el.naturalHeight };
    } else if (typeof ImageData !== 'undefined' && src instanceof ImageData) {
      const c = this.createCanvas(src.width, src.height);
      this.ctxOf(c).putImageData(src, 0, 0);
      img = c;
      size = { width: src.width, height: src.height };
    } else if (typeof Blob !== 'undefined' && src instanceof Blob) {
      const bmp = await createImageBitmap(src);
      img = bmp;
      size = { width: bmp.width, height: bmp.height };
    } else {
      const el = src as HTMLImageElement | HTMLCanvasElement | ImageBitmap;
      if ('decode' in el && !el.complete) await el.decode();
      img = el;
      size = 'naturalWidth' in el ? { width: el.naturalWidth, height: el.naturalHeight } : { width: el.width, height: el.height };
    }
    if (token !== this.loadToken) return null;
    if (!size.width || !size.height) throw new Error('ImageEditor: the image has no size');
    this.source = img;
    this.size = size;
    this.orientedCache = this.outputCache = null;
    this.pan = { x: 0, y: 0 };
    this.ui?.sync(null, this.state!);
    this.invalidate();
    return size;
  }

  clear(): void {
    this.loadToken++;
    this.source = this.size = null;
    this.orientedCache = this.outputCache = null;
    this.invalidate();
  }

  createCanvas(width: number, height: number): AnyCanvas {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = (this.canvas?.ownerDocument ?? document).createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  ctxOf(c: AnyCanvas, read = false): Ctx2D {
    return c.getContext('2d', read ? { willReadFrequently: true } : undefined) as Ctx2D;
  }

  /** True when the 2D context implements `ctx.filter` (Safari before 18 does not); else the pixel fallback runs. */
  filterSupported(): boolean {
    if (this.filterOk === null) this.filterOk = 'filter' in this.ctxOf(this.createCanvas(1, 1));
    return this.filterOk;
  }

  /** Loads the lazy modules an edit needs (annotations and drawing, the pixel fallback). */
  need(annotations: readonly ImageEditorAnnotation[] = [], ops: readonly FilterOp[] = []): Promise<void> {
    const redact = annotations.some((a) => a.kind === 'redact');
    const wantPixels = (!this.filterSupported() && (ops.length > 0 || redact)) || annotations.some((a) => a.kind === 'redact' && a.mode === 'pixelate');
    const wantDraw = annotations.length > 0 || (this.state?.frame.type ?? 'none') !== 'none';
    const m = this.mods;
    if ((!wantDraw || (m.draw && m.annotations)) && (!wantPixels || m.pixels)) return Promise.resolve();
    if (this.loading) return this.loading.then(() => this.need(annotations, ops));
    this.loading = Promise.all([wantDraw ? import('./annotations.js') : null, wantDraw ? import('./draw.js') : null, wantPixels ? import('./pixels.js') : null]).then(([a, d, p]) => {
      m.annotations = a ?? m.annotations;
      m.draw = d ?? m.draw;
      m.pixels = p ?? m.pixels;
      this.loading = null;
      this.orientedCache = this.outputCache = null;
      this.invalidate();
    });
    return this.loading;
  }

  /** The annotation model (reducers and hit tests), loading it when needed. */
  async model$(): Promise<AnnotationsModule> {
    return (this.mods.annotations ??= await import('./annotations.js'));
  }

  image(src: string): CanvasImageSource | null {
    const hit = this.images.get(src);
    if (hit && hit !== 'loading' && hit !== 'error') return hit;
    if (!hit && this.canvas) {
      this.images.set(src, 'loading');
      const el = this.canvas.ownerDocument.createElement('img');
      if (!/^(data|blob):/.test(src)) el.crossOrigin = 'anonymous';
      el.src = src;
      el.decode().then(
        () => {
          this.images.set(src, el);
          this.outputCache = null;
          this.invalidate();
        },
        () => this.images.set(src, 'error'),
      );
    }
    return null;
  }

  invalidate(): void {
    const win = this.canvas?.ownerDocument.defaultView;
    if (!win || this.frame) return;
    this.frame = win.requestAnimationFrame(() => {
      this.frame = 0;
      this.draw();
    });
  }

  /** The source rotated, flipped, straightened and filtered, at oriented size. */
  oriented(state: ImageEditorEditState, smoothing: boolean): AnyCanvas | null {
    const src = this.source;
    const size = this.size;
    if (!src || !size) return null;
    const t = state.transform;
    const ops = filterOps(state.adjustments, state.filter);
    const fallback = ops.length > 0 && !this.filterSupported();
    const px = this.mods.pixels;
    if (fallback && !px) void this.need([], ops);
    const key = JSON.stringify([t.rotation, t.straighten, t.flip, ops, smoothing, fallback && !!px]);
    const cache = this.orientedCache;
    if (cache?.key === key) return cache.canvas;
    const o = orientedSize(size, t.rotation);
    const c = cache && cache.canvas.width === o.width && cache.canvas.height === o.height ? cache.canvas : this.createCanvas(o.width, o.height);
    const ctx = this.ctxOf(c, fallback);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = smoothing;
    if (!fallback) ctx.filter = cssFilter(ops);
    drawOriented(ctx, src, size, o, t.rotation ?? 0, t.straighten ?? 0, !!t.flip?.horizontal, !!t.flip?.vertical);
    if (!fallback) ctx.filter = 'none';
    else if (px) {
      const img = ctx.getImageData(0, 0, c.width, c.height);
      px.applyFilterOps(img.data, c.width, c.height, ops);
      ctx.putImageData(img, 0, 0);
    }
    this.orientedCache = { key, canvas: c };
    return c;
  }

  /** The output image: crop (and circle clip), resize, annotations, frame. */
  output(state: ImageEditorEditState, annotations: readonly ImageEditorAnnotation[], smoothing: boolean, fresh = false): AnyCanvas | null {
    const oriented = this.oriented(state, smoothing);
    const size = this.size;
    if (!oriented || !size) return null;
    const t = state.transform;
    const draw = this.mods.draw;
    const key = [this.orientedCache?.key, t.crop, t.resize, annotations, state.frame, draw];
    const cache = this.outputCache;
    if (!fresh && cache && cache.key.every((k, i) => k === key[i])) return cache.canvas;
    const crop = cropOf(t, orientedSize(size, t.rotation));
    const out = outputSize(t, size);
    const c = !fresh && cache?.canvas.width === out.width && cache.canvas.height === out.height ? cache.canvas : this.createCanvas(out.width, out.height);
    const ctx = this.ctxOf(c, !this.filterSupported());
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.imageSmoothingEnabled = smoothing;
    ctx.drawImage(oriented, crop.x, crop.y, crop.width, crop.height, 0, 0, out.width, out.height);
    if (annotations.length || state.frame.type !== 'none') {
      if (draw) {
        const env = { createCanvas: (w: number, h: number) => this.createCanvas(w, h), image: (s: string) => this.image(s), filterSupported: this.filterSupported(), pixels: this.mods.pixels, measure: this.measure };
        draw.drawAnnotations(ctx, annotations, { ox: crop.x, oy: crop.y, kx: out.width / crop.width, ky: out.height / crop.height }, env);
        draw.drawFrame(ctx, out.width, out.height, state.frame);
      } else void this.need(annotations);
    }
    if (crop.shape === 'circle') {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.beginPath();
      ctx.ellipse(out.width / 2, out.height / 2, out.width / 2, out.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (!fresh) this.outputCache = { key, canvas: c };
    return c;
  }

  /** `ctx.measureText` on the view canvas (text annotation bounds). */
  readonly measure = (text: string, font: string): number => {
    const ctx = this.canvas?.getContext('2d');
    if (!ctx) return text.length * 10;
    ctx.save();
    ctx.font = font;
    const w = ctx.measureText(text).width;
    ctx.restore();
    return w;
  };

  /** Renders the edit at output size for export; waits for lazy modules and annotation images. */
  async render(state: ImageEditorEditState, smoothing: boolean): Promise<AnyCanvas | null> {
    if (!this.source) return null;
    await this.need(state.annotations, filterOps(state.adjustments, state.filter));
    for (let i = 0; i < 200; i++) {
      for (const a of state.annotations) if (a.kind === 'image') this.image(a.src);
      if (!state.annotations.some((a) => a.kind === 'image' && this.images.get(a.src) === 'loading')) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    return this.output(state, state.annotations, smoothing, true);
  }

  /** The state shown now: committed values with the panel preview over them. */
  shown(): EngineState | null {
    const s = this.state;
    const p = this.preview;
    if (!s || !p) return s;
    return { ...s, adjustments: p.adjustments ?? s.adjustments, frame: p.frame ?? s.frame, transform: p.straighten === undefined ? s.transform : { ...s.transform, straighten: p.straighten } };
  }

  /** Scene placement in CSS pixels: the oriented image in the crop tool, else the output. */
  view(): View | null {
    const s = this.state;
    const size = this.size;
    if (!s || !size) return null;
    const crop = s.tool === 'crop';
    const scene = crop ? orientedSize(size, s.transform.rotation) : outputSize(s.transform, size);
    return { ...fitView(scene, this.viewport, this.zoom, this.pan), scene, space: crop ? 'oriented' : 'output' };
  }

  private draw(): void {
    const canvas = this.canvas;
    const s = this.shown();
    if (!canvas || !s) return;
    const w = Math.max(1, Math.round(this.viewport.width * this.dpr));
    const h = Math.max(1, Math.round(this.viewport.height * this.dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const v = this.view();
    const list = this.draft ?? s.annotations;
    const scene = s.tool === 'crop' ? this.oriented(s, s.smoothing) : this.output(s, this.extra ? [...list, this.extra] : list, s.smoothing);
    if (!scene || !v) return;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.imageSmoothingEnabled = s.smoothing;
    ctx.drawImage(scene, v.x, v.y, v.scene.width * v.scale, v.scene.height * v.scale);
    this.ui?.overlay(ctx, v);
  }
}

/** Draws the source into the oriented canvas: flip, straighten (scaled to cover), 90-degree rotation. */
export function drawOriented(ctx: Ctx2D, src: CanvasImageSource, size: Size, oriented: Size, rotation: number, straighten: number, flipH: boolean, flipV: boolean): void {
  const st = normStraighten(straighten);
  ctx.save();
  ctx.translate(oriented.width / 2, oriented.height / 2);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  if (st) {
    const k = straightenScale(oriented, st);
    ctx.rotate((st * Math.PI) / 180);
    ctx.scale(k, k);
  }
  ctx.rotate((normRotation(rotation) * Math.PI) / 180);
  ctx.drawImage(src, -size.width / 2, -size.height / 2, size.width, size.height);
  ctx.restore();
}
