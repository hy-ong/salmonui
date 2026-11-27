// Chart drag and zoom interactions, a lazy chunk loaded after hydration when
// `zoom`, range or lasso `selection`, or `onPointChange` is on (the zoom,
// pan and selection chunk). Rubber-band and wheel zoom, pan (deferred or framed),
// pinch, range and lasso selection, point drag and keyboard editing. Every
// transient lives in the store or in the drag record; committed changes go
// through the chart's triads and `onPointChange`.

import type { KeyboardEvent, PointerEvent } from 'react';
import { pointInPolygon, type ContinuousScale } from '#viz';
import type { PointTarget } from '../internal/viz/keyboard.js';
import type { VizStore } from '../internal/viz/store.js';
import type { ChartModel } from './model.js';
import type { ChartPointRef, ChartProps, ChartSeriesOptions, ChartZoomOptions, ChartZoomRange } from './types.js';

type Point = { x: number; y: number };
type Mode = 'x' | 'y' | 'xy';
// `model.ts` `currentZoom`, repeated: importing a value from the entry's modules would split them into a
// shared chunk (and the preload helper) in consumer bundles.
function currentZoom(model: ChartModel): ChartZoomRange {
  const out: Record<string, readonly [number, number]> = {};
  for (const a of model.axes) if (a.scale.kind !== 'category' && a.scale.kind !== 'timeCategory') out[a.id] = [a.scale.domain[0] as number, a.scale.domain[1] as number];
  return out;
}

export type ZoomReason = 'wheel' | 'selection' | 'pan' | 'pinch' | 'keyboard' | 'toolbar' | 'scrollbar' | 'reset';
type Source = 'pointer' | 'keyboard' | 'touch' | 'api';

export interface InteractState {
  readonly frame: ChartZoomRange | null;
  readonly selecting: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number; readonly mode: Mode } | null;
  readonly lasso: string | null;
  readonly dragPoint: { readonly series: number; readonly index: number; readonly y: number } | null;
  readonly tool: 'zoom' | 'pan';
  readonly active: PointTarget | null;
  readonly activeSource: 'pointer' | 'keyboard' | 'api' | null;
}

/** What `Chart` hands the chunk on every call (no closure over a stale render). */
export interface InteractContext {
  readonly store: VizStore<InteractState>;
  readonly model: ChartModel;
  readonly props: ChartProps;
  readonly series: readonly ChartSeriesOptions[];
  readonly yAxisOf: (seriesId: string) => string | undefined;
  readonly zoomed: boolean;
  readonly zoom: ChartZoomOptions | null;
  readonly host: HTMLElement | null;
  readonly toDrawing: (clientX: number, clientY: number) => Point | null;
  readonly hit: (x: number, y: number) => PointTarget | null;
  readonly commitZoom: (range: ChartZoomRange, reason: ZoomReason, source: Source) => void;
  readonly select: (points: readonly ChartPointRef[], reason: 'range' | 'lasso') => void;
}

interface Drag {
  kind: 'select' | 'pan' | 'range' | 'lasso' | 'point' | 'pinch';
  x: number;
  y: number;
  start: ChartZoomRange;
  target?: PointTarget;
  points?: number[];
  d0?: number;
  m0?: ChartModel;
  dx?: number;
  dy?: number;
}

/** One controller per chart instance (created in a ref, never module state). */
export function createInteractions() {
  let drag: Drag | null = null;
  const touches = new Map<number, Point>();
  const modeOf = (c: InteractContext): Mode => c.zoom?.mode ?? 'x';
  const selOf = (c: InteractContext) => (typeof c.props.selection === 'object' ? c.props.selection : {});
  const groups = (c: InteractContext) => c.host?.querySelectorAll<SVGGElement>('.salmon-chart-series-group') ?? [];
  const editableOf = (c: InteractContext, id: string) => {
    const o = c.series.find((s, i) => (s.id ?? s.name ?? s.yField ?? `series-${i}`) === id)?.editable;
    return o ? (typeof o === 'object' ? o : {}) : null;
  };
  const valueAxis = (c: InteractContext, id: string) => {
    const a = c.model.axes.find((x) => x.id === c.yAxisOf(id));
    return a && a.scale.kind !== 'category' && a.scale.kind !== 'timeCategory' ? a : undefined;
  };
  const clamp = (e: { min?: number | undefined; max?: number | undefined }, v: number) => Math.min(e.max ?? Number.POSITIVE_INFINITY, Math.max(e.min ?? Number.NEGATIVE_INFINITY, v));
  const propose = (c: InteractContext, target: PointTarget, value: number, source: 'pointer' | 'keyboard') => {
    const s = c.model.series[target.series];
    if (s) c.props.onPointChange?.({ seriesId: s.id, index: target.index, value }, { source, reason: source === 'pointer' ? 'drag' : 'keyboard' });
  };
  const pointsIn = (m: ChartModel, inside: (x: number, y: number) => boolean): ChartPointRef[] => {
    const out: ChartPointRef[] = [];
    for (const s of m.series) {
      if (s.hidden) continue;
      for (let i = 0; i < s.count; i++) if (inside(s.px[i] as number, s.py[i] as number)) out.push({ seriesId: s.id, index: i });
    }
    return out;
  };

  return {
    down(c: InteractContext, event: PointerEvent<HTMLElement>): void {
      if (event.button !== 0) return;
      const p = c.toDrawing(event.clientX, event.clientY);
      if (!p) return;
      const m = c.model;
      if (event.pointerType === 'touch') touches.set(event.pointerId, p);
      const el = event.currentTarget;
      const capture = () => {
        try {
          el.setPointerCapture(event.pointerId);
        } catch {
          // Synthetic or already released pointers cannot be captured.
        }
      };
      const base = { x: p.x, y: p.y, start: currentZoom(m) };
      if (touches.size === 2 && c.zoom && c.zoom.pinch !== false) {
        // Pinch: the frame scales around the midpoint of the two touches.
        const [a, b] = [...touches.values()] as [Point, Point];
        c.store.set({ selecting: null, lasso: null });
        c.host?.setAttribute('data-dragging', '');
        drag = { ...base, kind: 'pinch', x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d0: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), m0: m };
        capture();
        return;
      }
      const hit = c.props.onPointChange ? c.hit(p.x, p.y) : null;
      const hs = hit ? m.series[hit.series] : undefined;
      if (hit && hs && editableOf(c, hs.id) && Math.hypot((hs.px[hit.index] as number) - p.x, (hs.py[hit.index] as number) - p.y) < 16) {
        capture();
        drag = { ...base, kind: 'point', target: hit };
        return;
      }
      const sel = selOf(c).mode;
      if (sel === 'range' || sel === 'lasso') {
        capture();
        drag = { ...base, kind: sel, points: [p.x, p.y] };
        return;
      }
      const z = c.zoom;
      if (!z) return;
      const pan = z.pan !== false && (c.store.get().tool === 'pan' || (c.zoomed && (event.shiftKey || z.selection === false)));
      if (!pan && z.selection === false) return;
      capture();
      c.host?.setAttribute('data-dragging', '');
      drag = { ...base, kind: pan ? 'pan' : 'select' };
    },

    /** Returns true while a drag owns the pointer (no hover then). */
    move(c: InteractContext, event: PointerEvent<HTMLElement>): boolean {
      const d = drag;
      const p = c.toDrawing(event.clientX, event.clientY);
      if (!p) return Boolean(d);
      if (touches.has(event.pointerId)) touches.set(event.pointerId, p);
      if (!d) return false;
      const mode = modeOf(c);
      const store = c.store;
      if (d.kind === 'pinch' && d.m0 && d.d0) {
        const [a, b] = [...touches.values()];
        if (a && b) store.set({ frame: scaleRange(d.m0, d.d0 / Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), d.x, d.y, mode) });
      } else if (d.kind === 'point' && d.target) store.set({ dragPoint: { series: d.target.series, index: d.target.index, y: c.model.horizontal ? p.x : p.y } });
      else if (d.kind === 'lasso' && d.points) {
        d.points.push(p.x, p.y);
        store.set({ lasso: `M${d.points.map((v) => Math.round(v * 10) / 10).join(' ')}Z` });
      } else if (d.kind === 'select' || d.kind === 'range') store.set({ selecting: { x0: d.x, y0: d.y, x1: p.x, y1: p.y, mode: d.kind === 'range' ? (selOf(c).axis ?? 'xy') : mode } });
      else if (c.zoom?.deferred) {
        // Deferred pan: only the drawn series move until release.
        d.dx = mode === 'y' ? 0 : p.x - d.x;
        d.dy = mode === 'x' ? 0 : p.y - d.y;
        for (const g of groups(c)) g.setAttribute('transform', `translate(${d.dx} ${d.dy})`);
      } else store.set({ frame: panRange(c.model, d.start, p.x - d.x, p.y - d.y, mode) });
      return true;
    },

    up(c: InteractContext, event: PointerEvent<HTMLElement>): void {
      touches.delete(event.pointerId);
      const d = drag;
      if (!d) return;
      drag = null;
      c.host?.removeAttribute('data-dragging');
      const p = c.toDrawing(event.clientX, event.clientY);
      const store = c.store;
      const state = store.get();
      const m = c.model;
      const mode = modeOf(c);
      if (d.kind === 'point' && d.target) {
        store.set({ dragPoint: null });
        const s = m.series[d.target.series];
        const axis = s && valueAxis(c, s.id);
        const e = s && editableOf(c, s.id);
        if (axis && e && state.dragPoint) propose(c, d.target, clamp(e, (axis.scale as ContinuousScale).invert(state.dragPoint.y)), 'pointer');
      } else if (d.kind === 'range' || d.kind === 'lasso') {
        store.set({ selecting: null, lasso: null });
        if (!p) return;
        const axis = selOf(c).axis ?? 'xy';
        const [x0, x1] = [Math.min(d.x, p.x), Math.max(d.x, p.x)];
        const [y0, y1] = [Math.min(d.y, p.y), Math.max(d.y, p.y)];
        const poly = d.points ?? [];
        const points = d.kind === 'lasso' ? (poly.length >= 6 ? pointsIn(m, (x, y) => pointInPolygon(x, y, poly)) : []) : pointsIn(m, (x, y) => (axis === 'y' || (x >= x0 && x <= x1)) && (axis === 'x' || (y >= y0 && y <= y1)));
        c.select(points, d.kind);
        c.props.onRangeSelect?.({ ranges: d.kind === 'range' ? selectionRange(m, d.x, d.y, p.x, p.y, axis) : {}, points }, { source: 'pointer', reason: d.kind });
      } else if (d.kind === 'select') {
        store.set({ selecting: null });
        if (p && Math.abs(p.x - d.x) > 4) c.commitZoom(selectionRange(m, d.x, d.y, p.x, p.y, mode), 'selection', 'pointer');
      } else if (d.kind === 'pan' && c.zoom?.deferred) {
        for (const g of groups(c)) g.removeAttribute('transform');
        if (d.dx || d.dy) c.commitZoom(panRange(m, d.start, d.dx ?? 0, d.dy ?? 0, mode), 'pan', 'pointer');
      } else {
        store.set({ frame: null });
        if (state.frame) c.commitZoom(state.frame, d.kind === 'pinch' ? 'pinch' : 'pan', event.pointerType === 'touch' ? 'touch' : 'pointer');
      }
    },

    wheel(c: InteractContext, event: WheelEvent): void {
      const p = c.toDrawing(event.clientX, event.clientY);
      if (!p) return;
      event.preventDefault();
      c.commitZoom(scaleRange(c.model, event.deltaY < 0 ? 0.8 : 1.25, p.x, p.y, modeOf(c)), 'wheel', 'pointer');
    },

    /** Zooms around the plot center (keyboard `+` / `-`, toolbar buttons). */
    zoomBy(c: InteractContext, factor: number, reason: ZoomReason, source: Source): void {
      const p = c.model.plot;
      c.commitZoom(scaleRange(c.model, factor, p.x + p.width / 2, p.y + p.height / 2, modeOf(c)), reason, source);
    },

    /** Keyboard editing: Up / Down (Left / Right in a horizontal chart) step the focused editable point; Shift steps tenfold. */
    key(c: InteractContext, event: KeyboardEvent<HTMLElement>): boolean {
      const { active, activeSource } = c.store.get();
      const m = c.model;
      const s = active && activeSource === 'keyboard' ? m.series[active.series] : undefined;
      const e = s && c.props.onPointChange ? editableOf(c, s.id) : null;
      const delta = ({ ArrowUp: 1, ArrowDown: -1, ArrowRight: 1, ArrowLeft: -1 } as Record<string, number>)[event.key];
      const axis = s && valueAxis(c, s.id);
      if (!active || !s || !e || !delta || !axis || m.horizontal !== (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) return false;
      event.preventDefault();
      const t = axis.ticks;
      const step = e.step ?? (t.length > 1 ? Math.abs((t[1]?.value as number) - (t[0]?.value as number)) / 10 : 1);
      propose(c, active, clamp(e, s.yValue(active.index) + delta * step * (event.shiftKey ? 10 : 1)), 'keyboard');
      return true;
    },
  };
}

export type Interactions = ReturnType<typeof createInteractions>;

const zoomAxes = (model: ChartModel, mode: Mode) => model.axes.filter((a) => a.scale.kind !== 'category' && a.scale.kind !== 'timeCategory' && (mode === 'xy' || a.direction === mode));
const along = (side: string, x: number, y: number) => (side === 'top' || side === 'bottom' ? x : y);

/** Zooms every matching continuous axis by `factor` around (x, y). */
export function scaleRange(model: ChartModel, factor: number, x: number, y: number, mode: Mode): ChartZoomRange {
  const out: Record<string, readonly [number, number]> = { ...currentZoom(model) };
  for (const a of zoomAxes(model, mode)) {
    const s = a.scale as ContinuousScale;
    const center = s.invert(along(a.side, x, y));
    const [d0, d1] = s.domain;
    out[a.id] = [center - (center - d0) * factor, center + (d1 - center) * factor];
  }
  return out;
}

export function selectionRange(model: ChartModel, x0: number, y0: number, x1: number, y1: number, mode: Mode): ChartZoomRange {
  const out: Record<string, readonly [number, number]> = {};
  for (const a of zoomAxes(model, mode)) {
    const s = a.scale as ContinuousScale;
    out[a.id] = [s.invert(along(a.side, x0, y0)), s.invert(along(a.side, x1, y1))].sort((m, n) => m - n) as [number, number];
  }
  return out;
}

export function panRange(model: ChartModel, start: ChartZoomRange, dx: number, dy: number, mode: Mode): ChartZoomRange {
  const out: Record<string, readonly [number, number]> = { ...start };
  for (const a of zoomAxes(model, mode)) {
    const s = a.scale as ContinuousScale;
    const r = start[a.id];
    if (!r) continue;
    const delta = s.invert(0) - s.invert(along(a.side, dx, dy));
    out[a.id] = [r[0] + delta, r[1] + delta];
  }
  return out;
}
