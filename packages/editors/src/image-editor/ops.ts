// Edit operations of ImageEditor, loaded after
// mount with the interaction layer: rotate / flip (crop and annotations
// follow), crop, annotation creation and the quick-access actions, the
// keyboard table of the canvas, the text editor commit and export. Every
// function runs from an event handler and receives the latest render (`c`).

import type { Ctx } from './ImageEditor.js';
import { normRotation, normStraighten, orientedSize, outputSize, type Point, type Size } from './geometry.js';
import { flipRect, rotateRect90 } from './transform.js';
import type { ImageEditorAnnotation, ImageEditorAnnotationKind, ImageEditorExportOptions, ImageEditorInputSource, ImageEditorQuickItemId, ImageEditorTransform } from './types.js';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
const DRAWING: ReadonlySet<string> = new Set(['rectangle', 'ellipse', 'line', 'arrow', 'path', 'freehand', 'text', 'image', 'redact']);

const oriented = (c: Ctx): Size | null => (c.natural ? orientedSize(c.natural, c.transform.rotation) : null);

/** A fresh `kind-n` id. */
export function freshId(list: readonly ImageEditorAnnotation[], kind: string): string {
  const used = new Set(list.map((a) => a.id));
  let n = list.length + 1;
  while (used.has(`${kind}-${n}`)) n++;
  return `${kind}-${n}`;
}

/** A 90-degree turn; with one flip active the internal step is reversed so the view turns as asked. */
export function rotate(c: Ctx, dir: 1 | -1, source: ImageEditorInputSource): void {
  const o = oriented(c);
  if (!o) return;
  const t = c.current.transform;
  const single = !!t.flip?.horizontal !== !!t.flip?.vertical;
  const rotation = normRotation((t.rotation ?? 0) + dir * (single ? -90 : 90));
  const next: ImageEditorTransform = { ...t, rotation, crop: t.crop ? { ...rotateRect90(t.crop, o, dir), shape: t.crop.shape } : t.crop, resize: t.resize ? { width: t.resize.height, height: t.resize.width } : t.resize };
  const prev = { rotation: normRotation(t.rotation), straighten: normStraighten(t.straighten) };
  const go = (annotations: readonly ImageEditorAnnotation[]): void => void c.edit('rotate', prev, { ...prev, rotation }, { ...c.current, transform: next, annotations }, source, { detail: `${rotation}°` });
  if (!c.annotations.length) go(c.annotations);
  else void c.engine.model$().then((m) => go(m.rotateAnnotations90(c.annotations, o, dir, c.engine.measure)));
}

/** Flip; crop and annotations mirror with the image. */
export function flip(c: Ctx, axis: 'horizontal' | 'vertical', source: ImageEditorInputSource): void {
  const o = oriented(c);
  if (!o) return;
  const t = c.current.transform;
  const f = { horizontal: !!t.flip?.horizontal, vertical: !!t.flip?.vertical };
  const nextFlip = { ...f, [axis]: !f[axis] };
  const next: ImageEditorTransform = { ...t, flip: nextFlip, crop: t.crop ? { ...flipRect(t.crop, o, axis), shape: t.crop.shape } : t.crop };
  const go = (annotations: readonly ImageEditorAnnotation[]): void => void c.edit('flip', f, nextFlip, { ...c.current, transform: next, annotations }, source);
  if (!c.annotations.length) go(c.annotations);
  else void c.engine.model$().then((m) => go(m.flipAnnotations(c.annotations, o, axis, c.engine.measure)));
}

/** Commits the crop draft; `resize` resets to the new crop size. */
export function applyCrop(c: Ctx, source: ImageEditorInputSource): void {
  const crop = c.engine.ui?.cropValue() ?? null;
  const prev = c.transform.crop ?? null;
  if (JSON.stringify(crop) !== JSON.stringify(prev)) c.edit('crop', prev, crop, { ...c.current, transform: { ...c.current.transform, crop, resize: null } }, source, { detail: crop ? `${crop.width} × ${crop.height}` : '' });
  c.setTool('select', source);
}

/** A new annotation of `kind` with the current style defaults. */
export function create(c: Ctx, kind: ImageEditorAnnotationKind, at: Point, list: readonly ImageEditorAnnotation[], sized: boolean): ImageEditorAnnotation | null {
  const o = oriented(c);
  if (!o || kind === 'image') return null;
  const d = c.styleDefaults;
  const id = freshId(list, kind);
  const side = Math.round(Math.min(o.width, o.height) / 4);
  const half = sized ? side / 2 : 0;
  const x = Math.round(at.x - half);
  const y = Math.round(at.y - half);
  const w = sized ? side : 0;
  const stroke = { stroke: d.stroke, strokeWidth: d.strokeWidth, ...(d.fill ? { fill: d.fill } : {}) };
  switch (kind) {
    case 'rectangle':
    case 'ellipse':
      return { id, kind, x, y, width: w, height: w, ...stroke };
    case 'redact':
      return { id, kind, x, y, width: w, height: w, mode: d.redactMode, strength: d.strength };
    case 'line':
    case 'arrow':
      return { id, kind, points: sized ? [x, y + side, x + side, y] : [at.x, at.y, at.x, at.y], ...stroke };
    case 'path':
      return { id, kind, points: sized ? [x, y + side, x + side / 2, y, x + side, y + side] : [at.x, at.y], ...stroke };
    case 'freehand':
      return { id, kind, points: sized ? [x, y + half, x + side / 3, y, x + (2 * side) / 3, y + side, x + side, y + half] : [at.x, at.y], stroke: d.stroke, strokeWidth: d.strokeWidth };
    case 'text':
      return { id, kind, x: Math.round(at.x), y: Math.round(at.y), text: '', fontSize: d.fontSize, fontFamily: d.fontFamily, color: d.color };
  }
}

/** Keyboard (or API) insertion of a tool's annotation at the image center, selected. */
export function insertAt(c: Ctx, kind: ImageEditorAnnotationKind, source: ImageEditorInputSource): void {
  const o = oriented(c);
  if (!o) return;
  const center = { x: o.width / 2, y: o.height / 2 };
  if (kind === 'image') return c.pickFile({ kind: 'image', at: center });
  const a = create(c, kind, center, c.annotations, true);
  if (a && c.changeAnnotations([...c.annotations, a], 'add', source, a.id) && kind === 'text') c.setEditing(a.id);
  c.canvas()?.focus();
}

/** Adds a picked file as an `'image'` annotation, at most half the shorter side. */
export function addImage(c: Ctx, file: Blob, at: Point | null): void {
  const reader = new FileReader();
  reader.onload = () => {
    const url = String(reader.result);
    const img = new Image();
    img.onload = () => {
      const latest = c.latest();
      const o = oriented(latest);
      if (!o) return;
      const k = Math.min(1, Math.min(o.width, o.height) / 2 / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * k));
      const height = Math.max(1, Math.round(img.naturalHeight * k));
      const p = at ?? { x: o.width / 2, y: o.height / 2 };
      const list = latest.annotations;
      const a: ImageEditorAnnotation = { id: freshId(list, 'image'), kind: 'image', x: Math.round(p.x - width / 2), y: Math.round(p.y - height / 2), width, height, src: url };
      latest.changeAnnotations([...list, a], 'add', 'pointer', a.id);
      latest.setTool('select', 'pointer');
    };
    img.src = url;
  };
  reader.readAsDataURL(file);
}

/** Quick-access and keyboard actions on the selection. */
export function quickAction(c: Ctx, id: ImageEditorQuickItemId, source: ImageEditorInputSource): void {
  if (id === 'applyCrop') return applyCrop(c, source);
  if (id === 'cancelCrop') return c.setTool('select', source);
  const sel = c.selected;
  if (!sel) return;
  void c.engine.model$().then((m) => {
    const s = c.latest();
    const list = s.annotations;
    const a = m.findAnnotation(list, sel);
    if (!a) return;
    if (id === 'edit') return a.kind === 'text' ? s.setEditing(a.id) : undefined;
    if (id === 'delete') s.changeAnnotations(m.removeAnnotation(list, sel), 'delete', source, null);
    else if (id === 'clone') {
      const copy = m.cloneAnnotation(a, freshId(list, a.kind));
      s.changeAnnotations([...list, copy], 'clone', source, copy.id);
    } else s.changeAnnotations(m.reorderAnnotation(list, sel, ({ bringForward: 'forward', sendBackward: 'backward', bringToFront: 'front', sendToBack: 'back' } as const)[id]), 'reorder', source);
    s.canvas()?.focus();
  });
}

/** Zoom by a factor around the center, committed. */
export function zoomBy(c: Ctx, factor: number, source: ImageEditorInputSource): void {
  const ui = c.engine.ui;
  if (!ui) return;
  ui.zoomAround(c.engine.zoom * factor);
  ui.commitZoom(source);
}

/** Built-in toolbar items that are actions (the tools and history items are in the component). */
export function toolbarAction(c: Ctx, id: string, source: ImageEditorInputSource): void {
  if (id === 'zoomIn') zoomBy(c, 1.25, source);
  else if (id === 'zoomOut') zoomBy(c, 0.8, source);
  else if (id === 'rotateLeft') rotate(c, -1, source);
  else if (id === 'rotateRight') rotate(c, 1, source);
  else if (id === 'flipHorizontal') flip(c, 'horizontal', source);
  else if (id === 'flipVertical') flip(c, 'vertical', source);
  else if (id === 'save') void exportBlob(c, {}).then((blob) => blob && c.onSave?.(blob));
  else if (source === 'keyboard' && DRAWING.has(id)) insertAt(c, id as ImageEditorAnnotationKind, source);
}

const isMod = (e: { ctrlKey: boolean; metaKey: boolean }): boolean => e.ctrlKey || e.metaKey;

/** The canvas keyboard table; returns true when the key was handled. */
export function canvasKey(c: Ctx, event: KeyboardEvent): boolean {
  const ui = c.engine.ui;
  if (!ui) return false;
  const k = event.key;
  const step = event.shiftKey ? 10 : 1;
  const arrow = k.startsWith('Arrow');
  const dx = k === 'ArrowLeft' ? -step : k === 'ArrowRight' ? step : 0;
  const dy = k === 'ArrowUp' ? -step : k === 'ArrowDown' ? step : 0;
  const tool = c.tool;
  if (tool === 'crop') {
    if (arrow) ui.nudgeCrop(dx, dy, event.altKey);
    else if (k === 'Enter') applyCrop(c, 'keyboard');
    else if (k === 'Escape') c.setTool('select', 'keyboard');
    else return false;
    return true;
  }
  if (tool === 'path' && (k === 'Enter' || k === 'Escape')) {
    if (k === 'Enter') ui.finishPath('keyboard');
    else ui.cancelGesture();
    return true;
  }
  if (k === 'Escape' && ui.cancelGesture()) return true;
  if (k === '+' || k === '=') zoomBy(c, 1.25, 'keyboard');
  else if (k === '-' || k === '_') zoomBy(c, 0.8, 'keyboard');
  else if (k === '0' && !isMod(event)) zoomBy(c, 1 / c.engine.zoom, 'keyboard');
  else if ((k === ']' || k === '[') && !isMod(event)) {
    const list = c.annotations;
    if (!list.length) return false;
    const i = list.findIndex((a) => a.id === c.selected);
    const n = list.length;
    const next = list[k === ']' ? (i + 1) % n : i <= 0 ? n - 1 : i - 1]!;
    c.select(next.id, 'keyboard');
    c.say('selection', `${c.text[next.kind]} ${list.indexOf(next) + 1} / ${n}`);
  } else if (!c.selected) {
    if (arrow && c.zoom > 1) ui.panBy(-dx * 10, -dy * 10, 'keyboard');
    else if (k === 'Enter' && DRAWING.has(tool)) insertAt(c, tool as ImageEditorAnnotationKind, 'keyboard');
    else return false;
  } else {
    const sel = c.selected;
    if (k === 'Escape') c.select(null, 'keyboard');
    else if (k === 'Delete' || k === 'Backspace') quickAction(c, 'delete', 'keyboard');
    else if (isMod(event) && (k === 'd' || k === 'D')) quickAction(c, 'clone', 'keyboard');
    else if (isMod(event) && /^[\][{}]$/.test(k)) {
      const up = k === ']' || k === '}';
      quickAction(c, event.shiftKey ? (up ? 'bringToFront' : 'sendToBack') : up ? 'bringForward' : 'sendBackward', 'keyboard');
    } else if (k === 'Enter') {
      if (c.annotations.find((x) => x.id === sel)?.kind === 'text') c.setEditing(sel);
    } else if (arrow || k === 'r' || k === 'R') {
      void c.engine.model$().then((m) => {
        const s = c.latest();
        const a = m.findAnnotation(s.annotations, sel);
        if (!a) return;
        let next: ImageEditorAnnotation;
        if (!arrow) next = m.rotateAnnotation(a, k === 'R' ? -15 : 15);
        else if (event.altKey) {
          const b = m.boundsOf(a, s.engine.measure);
          next = m.setBounds(a, { x: b.x, y: b.y, width: Math.max(1, b.width + dx), height: Math.max(1, b.height + dy) }, s.engine.measure);
        } else next = m.moveAnnotation(a, dx, dy);
        // Repeated nudges of one annotation merge into one undo step.
        s.changeAnnotations(m.updateAnnotation(s.annotations, sel, () => next), 'update', 'keyboard', undefined, `key:${sel}`);
      });
    } else return false;
  }
  return true;
}

/** Ends text editing: empty text removes the annotation. */
export function commitText(c: Ctx, value: string, source: ImageEditorInputSource): void {
  const id = c.editing;
  c.setEditing(null);
  const a = id ? c.annotations.find((x) => x.id === id) : undefined;
  if (!a || a.kind !== 'text') return;
  if (!value.trim()) c.changeAnnotations(c.annotations.filter((x) => x.id !== id), 'delete', source, null);
  else if (value !== a.text) c.changeAnnotations(c.annotations.map((x) => (x.id === id ? { ...a, text: value } : x)), 'update', source);
  c.canvas()?.focus();
}

/** Renders the export canvas after `onBeforeExport`; `null` when cancelled or empty. */
export async function exportCanvas(c: Ctx, options: ImageEditorExportOptions): Promise<AnyCanvas | null> {
  const size = c.natural ? outputSize(c.current.transform, c.natural) : null;
  if (!size) return null;
  let prevented = false;
  c.onBeforeExport?.({
    type: options.type ?? 'image/png',
    quality: options.quality,
    width: size.width,
    height: size.height,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  });
  return prevented ? null : c.engine.render(c.current, c.imageSmoothing);
}

async function blobOf(canvas: AnyCanvas, type: string, quality: number | undefined): Promise<Blob | null> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type, ...(quality === undefined ? {} : { quality }) });
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function exportBlob(c: Ctx, options: ImageEditorExportOptions): Promise<Blob | null> {
  const canvas = await exportCanvas(c, options);
  return canvas ? blobOf(canvas, options.type ?? 'image/png', options.quality) : null;
}

export async function exportDataURL(c: Ctx, options: ImageEditorExportOptions): Promise<string | null> {
  const blob = await exportBlob(c, options);
  if (!blob) return null;
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

export async function exportImageData(c: Ctx): Promise<ImageData | null> {
  const canvas = await exportCanvas(c, {});
  return canvas ? (canvas.getContext('2d') as CanvasRenderingContext2D).getImageData(0, 0, canvas.width, canvas.height) : null;
}
