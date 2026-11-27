// Interaction layer of the ImageEditor engine, loaded after mount: pointer, pinch, two-finger pan, wheel zoom,
// crop handles, annotation select / move / resize / rotate / draw, and the
// overlays (crop frame, selection handles, quick toolbar and text editor
// placement). Every transient lives in this object; only committed
// operations reach React through `engine.host`.

import type { EngineState, ImageEditorEngine, View } from './engine.js';
import { centerOf, clamp, clampPan, clampRect, cropOf, orientedSize, outputSize, type Point, type Rect } from './geometry.js';
import { fitRatio, HANDLES, panForZoom, resizeFromHandle, rotateAround, roundRect, type Handle } from './transform.js';
import type { ImageEditorAnnotation, ImageEditorAnnotationKind, ImageEditorCrop, ImageEditorCropShape, ImageEditorInputSource } from './types.js';

type Gesture =
  | { readonly type: 'pan'; readonly start: Point; readonly pan: Point }
  | { readonly type: 'pinch'; readonly dist: number; readonly mid: Point; readonly zoom: number; readonly pan: Point }
  | { readonly type: 'crop'; readonly handle: Handle | 'move' | 'new'; readonly start: Point; readonly rect: Rect }
  | { readonly type: 'move'; readonly id: string; readonly start: Point; readonly base: ImageEditorAnnotation; moved: boolean }
  | { readonly type: 'resize'; readonly id: string; readonly handle: Handle; readonly base: ImageEditorAnnotation }
  | { readonly type: 'rotate'; readonly id: string; readonly base: ImageEditorAnnotation; readonly center: Point; readonly angle: number }
  | { readonly type: 'draw'; readonly kind: ImageEditorAnnotationKind; readonly start: Point; readonly base: ImageEditorAnnotation; moved: boolean };

const CURSOR: Readonly<Record<Handle, string>> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };
const DRAG_KINDS: ReadonlySet<string> = new Set(['rectangle', 'ellipse', 'line', 'arrow', 'freehand', 'redact']);
const r10 = (v: number): number => Math.round(v * 10) / 10;

/** Committed annotations use tenths of a pixel. */
function roundAnnotation(a: ImageEditorAnnotation): ImageEditorAnnotation {
  if ('points' in a) return { ...a, points: a.points.map(r10) };
  if (a.kind === 'text') return { ...a, x: r10(a.x), y: r10(a.y) };
  return { ...a, x: r10(a.x), y: r10(a.y), width: r10(a.width), height: r10(a.height) };
}

export class EngineUI {
  readonly e: ImageEditorEngine;
  /** Crop being edited in the crop tool (oriented pixels). */
  cropRect: Rect | null = null;
  cropShape: ImageEditorCropShape = 'rect';
  cropRatio: number | null = null;
  /** Points of a `path` being placed. */
  pathPoints: number[] | null = null;
  coarse = false;
  private gesture: Gesture | null = null;
  private pointers = new Map<number, Point>();
  private zoomTimer = 0;

  constructor(engine: ImageEditorEngine) {
    this.e = engine;
    this.coarse = !!engine.canvas?.ownerDocument.defaultView?.matchMedia?.('(pointer: coarse)').matches;
  }

  busy(): boolean {
    return this.gesture?.type === 'pinch' || this.gesture?.type === 'pan';
  }

  detach(): void {
    if (this.zoomTimer) clearTimeout(this.zoomTimer);
    this.zoomTimer = 0;
  }

  sync(prev: EngineState | null, s: EngineState): void {
    if (s.tool === 'crop' && (!prev || prev.tool !== 'crop' || !this.cropRect)) this.beginCrop();
    if (s.tool !== 'crop') this.cropRect = null;
    if (s.tool !== 'path' && this.pathPoints) this.setPath(null);
  }

  // ---------- coordinates ----------

  private outputMap(): { ox: number; oy: number; kx: number; ky: number } | null {
    const s = this.e.state;
    const size = this.e.size;
    if (!s || !size) return null;
    const crop = cropOf(s.transform, orientedSize(size, s.transform.rotation));
    const out = outputSize(s.transform, size);
    return { ox: crop.x, oy: crop.y, kx: out.width / crop.width, ky: out.height / crop.height };
  }

  /** Oriented-image point of a CSS point on the canvas. */
  toImage(p: Point): Point | null {
    const v = this.e.view();
    if (!v) return null;
    const sp = { x: (p.x - v.x) / v.scale, y: (p.y - v.y) / v.scale };
    if (v.space === 'oriented') return sp;
    const m = this.outputMap();
    return m ? { x: sp.x / m.kx + m.ox, y: sp.y / m.ky + m.oy } : null;
  }

  /** CSS point of an oriented-image point. */
  toView(p: Point): Point | null {
    const v = this.e.view();
    if (!v) return null;
    let sp = p;
    if (v.space === 'output') {
      const m = this.outputMap();
      if (!m) return null;
      sp = { x: (p.x - m.ox) * m.kx, y: (p.y - m.oy) * m.ky };
    }
    return { x: v.x + sp.x * v.scale, y: v.y + sp.y * v.scale };
  }

  /** CSS pixels per oriented pixel. */
  viewScale(): number {
    const v = this.e.view();
    if (!v) return 1;
    const m = v.space === 'output' ? this.outputMap() : null;
    return m ? v.scale * m.kx : v.scale;
  }

  // ---------- overlays ----------

  private handleSize(): number {
    return this.coarse ? 22 : 10;
  }

  private boxHandles(b: Rect, rotation: number): [Handle, Point][] {
    const c = centerOf(b);
    const x = { w: b.x, n: c.x, e: b.x + b.width };
    const y = { n: b.y, w: c.y, s: b.y + b.height };
    return HANDLES.map((h) => {
      const hx = h.includes('w') ? x.w : h.includes('e') ? x.e : x.n;
      const hy = h.includes('n') ? y.n : h.includes('s') ? y.s : y.w;
      return [h, rotateAround({ x: hx, y: hy }, c, rotation)];
    });
  }

  private cropBox(v: View): Rect {
    const r = this.cropRect!;
    return { x: v.x + r.x * v.scale, y: v.y + r.y * v.scale, width: r.width * v.scale, height: r.height * v.scale };
  }

  /** The selected annotation's frame in CSS pixels: corners, handles, rotate knob. */
  selectionFrame(): { box: Rect; handles: [Handle, Point][]; knob: Point; corners: Point[] } | null {
    const s = this.e.state;
    const model = this.e.mods.annotations;
    if (!s || !model || !s.selected || s.tool === 'crop') return null;
    const a = model.findAnnotation(this.e.draft ?? s.annotations, s.selected);
    if (!a) return null;
    const b = model.boundsOf(a, this.e.measure);
    const k = this.viewScale();
    const tl = this.toView(b);
    if (!tl) return null;
    const box = { x: tl.x, y: tl.y, width: Math.max(1, b.width * k), height: Math.max(1, b.height * k) };
    const rotation = a.rotation ?? 0;
    const c = centerOf(box);
    const corners = [box, { x: box.x + box.width, y: box.y }, { x: box.x + box.width, y: box.y + box.height }, { x: box.x, y: box.y + box.height }].map((p) => rotateAround(p, c, rotation));
    const knob = rotateAround({ x: c.x, y: box.y - (this.coarse ? 36 : 24) }, c, rotation);
    return { box, handles: this.boxHandles(box, rotation), knob, corners };
  }

  private handles(ctx: CanvasRenderingContext2D, pts: readonly [Handle, Point][], accent: string): void {
    const hs = this.handleSize();
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 1.5;
    for (const [, p] of pts) {
      ctx.beginPath();
      ctx.rect(p.x - hs / 2, p.y - hs / 2, hs, hs);
      ctx.fill();
      ctx.stroke();
    }
  }

  /** Draws the crop frame or the selection handles, then places the quick toolbar and text editor. */
  overlay(ctx: CanvasRenderingContext2D, v: View): void {
    const canvas = this.e.canvas!;
    const accent = canvas.ownerDocument.defaultView?.getComputedStyle(canvas).getPropertyValue('--salmon-image-editor-accent').trim() || '#2f6fed';
    let anchor: Rect | null = null;
    if (this.e.state?.tool === 'crop' && this.cropRect) {
      const b = this.cropBox(v);
      anchor = b;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.rect(v.x, v.y, v.scene.width * v.scale, v.scene.height * v.scale);
      if (this.cropShape === 'circle') ctx.ellipse(b.x + b.width / 2, b.y + b.height / 2, b.width / 2, b.height / 2, 0, 0, Math.PI * 2);
      else ctx.rect(b.x, b.y, b.width, b.height);
      ctx.fill('evenodd');
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < 3; i++) {
        ctx.moveTo(b.x + (b.width * i) / 3, b.y);
        ctx.lineTo(b.x + (b.width * i) / 3, b.y + b.height);
        ctx.moveTo(b.x, b.y + (b.height * i) / 3);
        ctx.lineTo(b.x + b.width, b.y + (b.height * i) / 3);
      }
      ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x, b.y, b.width, b.height);
      this.handles(ctx, this.boxHandles(b, 0), accent);
    } else {
      const f = this.selectionFrame();
      if (f) {
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        f.corners.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        const top = f.handles[1]![1];
        ctx.beginPath();
        ctx.moveTo(top.x, top.y);
        ctx.lineTo(f.knob.x, f.knob.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(f.knob.x, f.knob.y, this.handleSize() / 2 + 1, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.stroke();
        this.handles(ctx, f.handles, accent);
        const xs = f.corners.map((p) => p.x);
        const ys = [...f.corners.map((p) => p.y), f.knob.y];
        anchor = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
      }
    }
    this.place(anchor);
  }

  private rtl(el: Element): boolean {
    return el.ownerDocument.defaultView?.getComputedStyle(el).direction === 'rtl';
  }

  /** Positions the quick-access toolbar and the text editor (DOM writes only, no React state). */
  private place(anchor: Rect | null): void {
    const vp = this.e.viewport;
    const q = this.e.quick;
    if (q) {
      if (anchor) {
        const qh = q.offsetHeight || 36;
        const qw = q.offsetWidth || 200;
        const above = anchor.y - qh - 8;
        // Below the anchor only when it clears the tool panel docked at the
        // stage bottom; otherwise inside the anchor's top edge, so the two
        // bars never overlap (a crop frame that fills the stage).
        const panel = q.parentElement?.querySelector<HTMLElement>('.salmon-image-editor-panel');
        const floor = vp.height - qh - (panel ? panel.offsetHeight + 16 : 0);
        const below = anchor.y + anchor.height + 8;
        const y = above >= 0 ? above : below <= floor ? below : Math.min(Math.max(0, floor), anchor.y + 8);
        const x = clamp(anchor.x + anchor.width / 2 - qw / 2, 0, Math.max(0, vp.width - qw));
        // The element sits at the inline start (the right edge in RTL); the translate is physical.
        const tx = this.rtl(q) ? x + qw - vp.width : x;
        q.style.transform = `translate(${Math.round(tx)}px, ${Math.round(Math.max(0, y))}px)`;
        q.style.visibility = 'visible';
      } else q.style.visibility = 'hidden';
    }
    const t = this.e.textBox;
    const s = this.e.state;
    const model = this.e.mods.annotations;
    if (t && s?.editing && model) {
      const a = model.findAnnotation(s.annotations, s.editing);
      const p = a?.kind === 'text' ? this.toView(a) : null;
      if (a?.kind === 'text' && p) {
        const tx = this.rtl(t) ? p.x + t.offsetWidth - vp.width : p.x;
        t.style.transform = `translate(${Math.round(tx)}px, ${Math.round(p.y)}px)${a.rotation ? ` rotate(${a.rotation}deg)` : ''}`;
        Object.assign(t.style, { fontSize: `${Math.max(8, (a.fontSize ?? 32) * this.viewScale())}px`, fontFamily: a.fontFamily ?? 'sans-serif', fontWeight: a.bold ? 'bold' : '', fontStyle: a.italic ? 'italic' : '', color: a.color ?? '#e5484d' });
      }
    }
  }

  // ---------- crop ----------

  beginCrop(): void {
    const s = this.e.state;
    const size = this.e.size;
    if (!s || !size) return;
    const c = cropOf(s.transform, orientedSize(size, s.transform.rotation));
    this.cropRect = { x: c.x, y: c.y, width: c.width, height: c.height };
    this.cropShape = c.shape ?? 'rect';
    this.e.invalidate();
  }

  /** Applies a ratio preset to the crop draft (the largest centered rect of that ratio). */
  setCropRatio(ratio: number | null, shape: ImageEditorCropShape): void {
    const s = this.e.state;
    const size = this.e.size;
    if (!s || !size) return;
    this.cropRatio = ratio;
    this.cropShape = shape;
    const o = orientedSize(size, s.transform.rotation);
    const whole = { x: 0, y: 0, width: o.width, height: o.height };
    this.cropRect = fitRatio(ratio ? whole : (this.cropRect ?? whole), ratio, o);
    this.e.host.cropDraft();
    this.e.invalidate();
  }

  /** The committed form of the crop draft (whole pixels), or `null` for the whole image. */
  cropValue(): ImageEditorCrop | null {
    const r = this.cropRect;
    const s = this.e.state;
    const size = this.e.size;
    if (!r || !s || !size) return null;
    const o = orientedSize(size, s.transform.rotation);
    const rr = clampRect(roundRect(r), o);
    if (rr.x === 0 && rr.y === 0 && rr.width === o.width && rr.height === o.height && this.cropShape === 'rect') return null;
    return this.cropShape === 'circle' ? { ...rr, shape: 'circle' } : rr;
  }

  /** Keyboard: moves (or with `resize` grows) the crop draft by oriented pixels. */
  nudgeCrop(dx: number, dy: number, resize: boolean): void {
    const r = this.cropRect;
    const s = this.e.state;
    const size = this.e.size;
    if (!r || !s || !size) return;
    let next: Rect = resize ? { ...r, width: r.width + dx, height: r.height + dy } : { ...r, x: r.x + dx, y: r.y + dy };
    if (resize && this.cropRatio) next = { ...next, height: next.width / this.cropRatio };
    this.cropRect = clampRect(next, orientedSize(size, s.transform.rotation));
    this.e.host.cropDraft();
    this.e.invalidate();
  }

  // ---------- zoom and pan ----------

  /** Sets the live zoom around a CSS point (the center by default). */
  zoomAround(next: number, at?: Point): void {
    const s = this.e.state;
    const v = this.e.view();
    if (!s || !v) return;
    const z = clamp(next, s.minZoom, s.maxZoom);
    const vp = this.e.viewport;
    this.e.pan = panForZoom(v.scene, vp, { zoom: this.e.zoom, pan: this.e.pan }, z, at ?? { x: vp.width / 2, y: vp.height / 2 });
    this.e.zoom = z;
    this.e.invalidate();
  }

  /** Commits the live zoom (cancellable through the host); reverts when cancelled. */
  commitZoom(source: ImageEditorInputSource): void {
    const s = this.e.state;
    this.e.zoomPending = false;
    if (!s || Math.abs(this.e.zoom - s.zoom) < 1e-6) return;
    if (!this.e.host.zoom(this.e.zoom, source)) {
      this.e.zoom = clamp(s.zoom, s.minZoom, s.maxZoom);
      const v = this.e.view();
      if (v) this.e.pan = clampPan(v.scene, this.e.viewport, v.scale, this.e.pan);
      this.e.invalidate();
    }
  }

  panBy(dx: number, dy: number, source: ImageEditorInputSource): void {
    const v = this.e.view();
    if (!v || !this.e.host.panStart(source)) return;
    this.e.pan = clampPan(v.scene, this.e.viewport, v.scale, { x: this.e.pan.x + dx, y: this.e.pan.y + dy });
    this.e.invalidate();
    this.e.host.panEnd(this.e.pan, source);
  }

  wheel(ev: WheelEvent): void {
    if (!(ev.ctrlKey || ev.metaKey) || !this.e.source || !this.e.canvas) return;
    ev.preventDefault();
    const r = this.e.canvas.getBoundingClientRect();
    this.zoomAround(this.e.zoom * Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.002)), { x: ev.clientX - r.left, y: ev.clientY - r.top });
    this.e.zoomPending = true;
    if (this.zoomTimer) clearTimeout(this.zoomTimer);
    this.zoomTimer = setTimeout(() => {
      this.zoomTimer = 0;
      this.commitZoom('pointer');
    }, 200) as unknown as number;
  }

  // ---------- pointer ----------

  private local(ev: { clientX: number; clientY: number }): Point {
    const r = this.e.canvas!.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  private hitHandle(p: Point, pts: readonly [Handle, Point][]): Handle | null {
    const reach = this.handleSize() / 2 + 4;
    for (const [h, q] of pts) if (Math.abs(p.x - q.x) <= reach && Math.abs(p.y - q.y) <= reach) return h;
    return null;
  }

  private hit(q: Point): ImageEditorAnnotation | null {
    const s = this.e.state;
    const m = this.e.mods.annotations;
    return s && m ? m.hitTopmost(s.annotations, q, 4 / this.viewScale(), this.e.measure) : null;
  }

  /** Cursor for a CSS point (hover feedback). */
  cursorAt(p: Point): string {
    const s = this.e.state;
    if (!s || !this.e.source) return '';
    if (s.tool === 'pan') return 'grab';
    const v = this.e.view();
    if (s.tool === 'crop' && this.cropRect && v) {
      const b = this.cropBox(v);
      const h = this.hitHandle(p, this.boxHandles(b, 0));
      return h ? CURSOR[h] : p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height ? 'move' : 'crosshair';
    }
    if (DRAG_KINDS.has(s.tool) || s.tool === 'path') return 'crosshair';
    if (s.tool === 'text') return 'text';
    const f = this.selectionFrame();
    if (f) {
      if (Math.hypot(p.x - f.knob.x, p.y - f.knob.y) <= this.handleSize()) return 'grab';
      const h = this.hitHandle(p, f.handles);
      if (h) return CURSOR[h];
    }
    const q = this.toImage(p);
    if (q && this.hit(q)) return 'move';
    return this.e.zoom > 1 ? 'grab' : '';
  }

  pointerDown(ev: PointerEvent, source: ImageEditorInputSource): void {
    const s = this.e.state;
    const canvas = this.e.canvas;
    if (!s || !canvas || !this.e.source) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0 && ev.button !== 1) return;
    const p = this.local(ev);
    this.pointers.set(ev.pointerId, p);
    try {
      canvas.setPointerCapture(ev.pointerId);
    } catch {}
    if (this.pointers.size === 2) {
      // Two fingers: pinch zoom and two-finger pan; whatever one finger started is dropped.
      this.e.draft = null;
      if (this.gesture?.type === 'crop') this.cropRect = this.gesture.rect;
      const [a, b] = [...this.pointers.values()] as [Point, Point];
      this.gesture = { type: 'pinch', dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, zoom: this.e.zoom, pan: this.e.pan };
      this.e.invalidate();
      return;
    }
    if (this.pointers.size > 2) return;
    const q = this.toImage(p);
    if (!q) return;
    const tool = s.tool;
    if (ev.button === 1 || tool === 'pan') return this.startPan(p, source);
    if (tool === 'crop' && this.cropRect) {
      const b = this.cropBox(this.e.view()!);
      const inside = p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height;
      this.gesture = { type: 'crop', handle: this.hitHandle(p, this.boxHandles(b, 0)) ?? (inside ? 'move' : 'new'), start: q, rect: this.cropRect };
      return;
    }
    if (tool === 'image') return this.e.host.pickImage(q);
    if (tool === 'path') return; // points are placed on pointer up
    if (DRAG_KINDS.has(tool) || tool === 'text') {
      const base = this.e.host.create(tool as ImageEditorAnnotationKind, q, s.annotations, tool === 'text');
      if (!base) return;
      if (tool === 'text') {
        // The text input takes focus; the canvas must not take it back on mousedown.
        ev.preventDefault();
        this.e.host.annotations([...s.annotations, base], 'add', source, base.id);
        this.e.host.editText(base.id);
        return;
      }
      this.gesture = { type: 'draw', kind: tool as ImageEditorAnnotationKind, start: q, base, moved: false };
      void this.e.need([base]);
      return;
    }
    // Select: the selection's knob and handles first, then the topmost annotation, else pan or deselect.
    const model = this.e.mods.annotations;
    const f = this.selectionFrame();
    const a = f && model && s.selected ? model.findAnnotation(s.annotations, s.selected) : undefined;
    if (f && a && model) {
      if (Math.hypot(p.x - f.knob.x, p.y - f.knob.y) <= this.handleSize()) {
        const c = centerOf(model.boundsOf(a, this.e.measure));
        this.gesture = { type: 'rotate', id: a.id, base: a, center: c, angle: Math.atan2(q.y - c.y, q.x - c.x) };
        return;
      }
      const h = this.hitHandle(p, f.handles);
      if (h) {
        this.gesture = { type: 'resize', id: a.id, handle: h, base: a };
        return;
      }
    }
    const hit = this.hit(q);
    if (hit) {
      if (hit.id !== s.selected) this.e.host.select(hit.id, source);
      this.gesture = { type: 'move', id: hit.id, start: q, base: hit, moved: false };
      return;
    }
    if (s.selected) this.e.host.select(null, source);
    if (this.e.zoom > 1) this.startPan(p, source);
  }

  private startPan(p: Point, source: ImageEditorInputSource): void {
    if (this.e.host.panStart(source)) this.gesture = { type: 'pan', start: p, pan: this.e.pan };
  }

  pointerMove(ev: PointerEvent): void {
    if (!this.pointers.has(ev.pointerId)) return;
    const p = this.local(ev);
    this.pointers.set(ev.pointerId, p);
    const g = this.gesture;
    const s = this.e.state;
    const v = this.e.view();
    if (!g || !s || !v) return;
    const vp = this.e.viewport;
    if (g.type === 'pinch') {
      const [a, b] = [...this.pointers.values()] as [Point, Point];
      if (!a || !b) return;
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const z = clamp((g.zoom * Math.max(1, Math.hypot(a.x - b.x, a.y - b.y))) / g.dist, s.minZoom, s.maxZoom);
      const pan = panForZoom(v.scene, vp, { zoom: g.zoom, pan: g.pan }, z, g.mid);
      this.e.zoom = z;
      this.e.pan = clampPan(v.scene, vp, Math.min(vp.width / v.scene.width, vp.height / v.scene.height) * z, { x: pan.x + mid.x - g.mid.x, y: pan.y + mid.y - g.mid.y });
      this.e.invalidate();
      return;
    }
    if (g.type === 'pan') {
      this.e.pan = clampPan(v.scene, vp, v.scale, { x: g.pan.x + p.x - g.start.x, y: g.pan.y + p.y - g.start.y });
      this.e.invalidate();
      return;
    }
    const q = this.toImage(p);
    if (!q) return;
    if (g.type === 'crop') {
      const o = orientedSize(this.e.size!, s.transform.rotation);
      let r: Rect;
      if (g.handle === 'move') r = { ...g.rect, x: g.rect.x + q.x - g.start.x, y: g.rect.y + q.y - g.start.y };
      else if (g.handle === 'new') {
        const w = q.x - g.start.x;
        const h = this.cropRatio ? (Math.sign(q.y - g.start.y || 1) * Math.abs(w)) / this.cropRatio : q.y - g.start.y;
        r = { x: Math.min(g.start.x, g.start.x + w), y: Math.min(g.start.y, g.start.y + h), width: Math.abs(w), height: Math.abs(h) };
      } else r = resizeFromHandle(g.rect, 0, g.handle, { x: clamp(q.x, 0, o.width), y: clamp(q.y, 0, o.height) }, this.cropRatio, 4);
      this.cropRect = clampRect(r, o, g.handle === 'new' ? 1 : 4);
      this.e.invalidate();
      return;
    }
    const list = s.annotations;
    if (g.type === 'draw') {
      g.moved = true;
      this.e.draft = [...list, this.drawn(g, q, ev)];
      this.e.invalidate();
      return;
    }
    const model = this.e.mods.annotations;
    if (!model) return;
    let next: ImageEditorAnnotation;
    if (g.type === 'move') {
      g.moved = true;
      next = model.moveAnnotation(g.base, q.x - g.start.x, q.y - g.start.y);
    } else if (g.type === 'resize') next = model.resizeAnnotation(g.base, g.handle, q, ev.shiftKey, this.e.measure);
    else {
      let deg = ((Math.atan2(q.y - g.center.y, q.x - g.center.x) - g.angle) * 180) / Math.PI;
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      next = model.rotateAnnotation(g.base, deg);
    }
    this.e.draft = model.updateAnnotation(list, g.id, () => next);
    this.e.invalidate();
  }

  private drawn(g: Extract<Gesture, { type: 'draw' }>, q: Point, ev: PointerEvent): ImageEditorAnnotation {
    const b = g.base;
    if ('points' in b) {
      if (b.kind !== 'freehand') return { ...b, points: [g.start.x, g.start.y, q.x, q.y] };
      // Freehand records every coalesced sample since the last frame.
      const prev = this.e.draft?.[this.e.draft.length - 1];
      const pts = prev && prev.id === b.id && 'points' in prev ? [...prev.points] : [...b.points];
      const samples = 'getCoalescedEvents' in ev ? ev.getCoalescedEvents() : [];
      for (const c of samples.length ? samples : [ev]) {
        const cq = c === ev ? q : this.toImage(this.local(c));
        if (cq) pts.push(r10(cq.x), r10(cq.y));
      }
      return { ...b, points: pts };
    }
    let w = q.x - g.start.x;
    let h = q.y - g.start.y;
    if (ev.shiftKey) {
      const m = Math.max(Math.abs(w), Math.abs(h));
      w = Math.sign(w || 1) * m;
      h = Math.sign(h || 1) * m;
    }
    return { ...b, x: Math.min(g.start.x, g.start.x + w), y: Math.min(g.start.y, g.start.y + h), width: Math.abs(w), height: Math.abs(h) } as ImageEditorAnnotation;
  }

  pointerUp(ev: PointerEvent, source: ImageEditorInputSource, canceled = false): void {
    if (!this.pointers.has(ev.pointerId)) return;
    this.pointers.delete(ev.pointerId);
    try {
      this.e.canvas?.releasePointerCapture(ev.pointerId);
    } catch {}
    const g = this.gesture;
    const s = this.e.state;
    if (g?.type === 'pinch') {
      if (!this.pointers.size) {
        this.gesture = null;
        if (!canceled) this.commitZoom(source);
      }
      return;
    }
    if (this.pointers.size || !s) return;
    this.gesture = null;
    const host = this.e.host;
    if (!g) {
      if (s.tool === 'path' && !canceled) {
        const q = this.toImage(this.local(ev));
        if (q) {
          this.setPath([...(this.pathPoints ?? []), Math.round(q.x), Math.round(q.y)]);
        }
      }
      return;
    }
    const draft = this.e.draft;
    this.e.draft = null;
    this.e.invalidate();
    if (canceled) {
      if (g.type === 'crop') this.cropRect = g.rect;
      return;
    }
    if (g.type === 'pan') return host.panEnd(this.e.pan, source);
    if (g.type === 'crop') {
      if (this.cropRect && (this.cropRect.width < 4 || this.cropRect.height < 4)) this.cropRect = g.rect;
      return host.cropDraft();
    }
    if (g.type === 'draw') {
      let a = draft ? draft[draft.length - 1]! : g.base;
      const b = this.e.mods.annotations?.boundsOf(a, this.e.measure);
      // A click (no drag) places a default-sized shape.
      if (a.kind !== 'freehand' && (!g.moved || (b && Math.max(b.width, b.height) < 3))) a = host.create(g.kind, g.start, s.annotations, true) ?? a;
      if (a.kind === 'freehand' && a.points.length < 4) return;
      return host.annotations([...s.annotations, roundAnnotation(a)], 'add', source, a.id);
    }
    if (g.type === 'move' && !g.moved) return;
    if (draft) host.annotations(draft.map((a) => (a.id === g.id ? roundAnnotation(a) : a)), 'update', source);
  }

  private setPath(points: number[] | null): void {
    this.pathPoints = points;
    const s = this.e.state;
    const base = points && points.length >= 2 && s ? this.e.host.create('path', { x: points[0]!, y: points[1]! }, s.annotations, false) : null;
    this.e.extra = base ? ({ ...base, id: '\u0000path', points } as ImageEditorAnnotation) : null;
    if (points) void this.e.need([this.e.extra ?? ({ kind: 'path', id: '', points: [] } as ImageEditorAnnotation)]);
    this.e.invalidate();
  }

  /** Commits the path being placed (double click or Enter); fewer than two points is dropped. */
  finishPath(source: ImageEditorInputSource): void {
    const pts = this.pathPoints;
    const s = this.e.state;
    this.setPath(null);
    if (!pts || !s) return;
    // A double click adds its point twice; drop exact repeats.
    const clean: number[] = [];
    for (let i = 0; i + 1 < pts.length; i += 2) if (clean[clean.length - 2] !== pts[i] || clean[clean.length - 1] !== pts[i + 1]) clean.push(pts[i]!, pts[i + 1]!);
    if (clean.length < 4) return;
    const base = this.e.host.create('path', { x: clean[0]!, y: clean[1]! }, s.annotations, false);
    if (base) this.e.host.annotations([...s.annotations, { ...base, points: clean } as ImageEditorAnnotation], 'add', source, base.id);
  }

  /** Escape: drops the gesture or the path being placed. */
  cancelGesture(): boolean {
    if (this.pathPoints) {
      this.setPath(null);
      return true;
    }
    const g = this.gesture;
    if (!g) return false;
    if (g.type === 'crop') this.cropRect = g.rect;
    this.gesture = null;
    this.e.draft = null;
    this.pointers.clear();
    this.e.invalidate();
    return true;
  }
}
