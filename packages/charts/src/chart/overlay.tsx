// Chart overlay: tooltip, crosshair, hover and
// focus marks, selection rectangle, lasso and drag preview. A lazy chunk
// mounted after hydration (the server markup has no overlay); it reads the
// per-instance store with `useSyncExternalStore` and gets the entry's
// functions as `tools`, so it shares no module with the entry chunk.

import { useSyncExternalStore, type ReactNode } from 'react';
import type { BandScale } from '#viz';
import type { PointTarget } from '../internal/viz/keyboard.js';
import type { VizStore } from '../internal/viz/store.js';
import { VizTooltip } from '../internal/viz/tooltip.js';
import type { ChartState } from './Chart.js';
import type { SyncContextValue, SyncState } from './ChartSyncGroup.js';
import type { ChartModel, SeriesModel } from './model.js';
import type { ChartCrosshairOptions, ChartDatum, ChartPlotPoint, ChartPointContext, ChartPointRef, ChartProps, ChartTooltipContext, ChartTooltipOptions } from './types.js';

export interface OverlayProps {
  readonly store: VizStore<ChartState>;
  readonly model: ChartModel;
  readonly tooltip: ChartTooltipOptions | null;
  readonly crosshair: ChartProps['crosshair'];
  readonly shared: boolean;
  readonly sync: SyncContextValue | null;
  readonly syncStore: VizStore<SyncState>;
  readonly uid: string;
  readonly datumOf: (m: SeriesModel, index: number) => ChartDatum | undefined;
  readonly xFieldOf: (m: SeriesModel) => string | undefined;
  /** Entry functions, passed in so this chunk imports no value from the entry's modules. */
  readonly tools: OverlayTools;
}

export interface OverlayTools {
  readonly pointContext: (m: SeriesModel, index: number, datum: ChartDatum | undefined, xField: string | undefined) => ChartPointContext;
  readonly nearestSorted: (xs: ArrayLike<number>, x: number) => number;
  readonly textWidth: (text: string) => number;
  readonly lineHeight: (size: 'sm') => number;
}

/** Nearest drawn point to (x, y) in drawing px, or null. */
export function hitPoint(model: ChartModel, x: number, y: number, shared: boolean, nearestSorted: OverlayTools['nearestSorted']): PointTarget | null {
  let best: PointTarget | null = null;
  let bestD = shared ? Number.POSITIVE_INFINITY : 40 * 40;
  let bestOwn = Number.POSITIVE_INFINITY;
  model.series.forEach((s, si) => {
    if (s.hidden || !s.tooltip || s.count === 0) return;
    const along = model.horizontal ? s.py : s.px;
    const pos = model.horizontal ? y : x;
    const candidates: number[] = [];
    if (s.sortedX && s.type !== 'scatter' && s.type !== 'bubble') {
      const i = nearestSorted(along, pos);
      if (i >= 0) candidates.push(i, i - 1, i + 1);
    } else for (let i = 0; i < s.count; i++) candidates.push(i);
    for (const i of candidates) {
      if (i < 0 || i >= s.count) continue;
      const px = s.px[i] as number;
      const py = s.py[i] as number;
      if (!Number.isFinite(px) || !Number.isFinite(py)) continue;
      const scatterType = s.type === 'scatter' || s.type === 'bubble' || model.polar === true;
      if (!shared && !scatterType && s.sortedX) {
        // A cartesian point owns half the distance to its neighbors along x.
        const at = along[i] as number;
        const prev = i > 0 ? Math.abs(at - (along[i - 1] as number)) : Number.POSITIVE_INFINITY;
        const next = i < s.count - 1 ? Math.abs((along[i + 1] as number) - at) : Number.POSITIVE_INFINITY;
        const reach = Math.max(24, Math.min(prev, next) / 2);
        if (Math.abs(at - pos) > reach) continue;
        const dd = (at - pos) ** 2 + (((model.horizontal ? px - x : py - y) * 0.25) ** 2);
        if (dd < bestOwn) {
          bestOwn = dd;
          best = { series: si, index: i };
        }
        continue;
      }
      // Cartesian series favor the x distance (the pointer anywhere above a column or near a line's x hits it);
      // scatter and bubble use the plain distance.
      const da = model.horizontal ? py - y : px - x;
      const db = model.horizontal ? px - x : py - y;
      const scatter = scatterType;
      const d = shared ? Math.abs(da) : scatter ? da * da + db * db : da * da + (db * 0.25) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { series: si, index: i };
      }
    }
  });
  return best;
}

/** Points shown together with `active` in a shared tooltip (same x index per series). */
export function sharedPoints(model: ChartModel, active: PointTarget, nearestSorted: OverlayTools['nearestSorted']): PointTarget[] {
  const anchor = model.series[active.series];
  if (!anchor) return [];
  const pos = model.horizontal ? (anchor.py[active.index] as number) : (anchor.px[active.index] as number);
  const out: PointTarget[] = [];
  model.series.forEach((s, si) => {
    if (s.hidden || !s.tooltip) return;
    const along = model.horizontal ? s.py : s.px;
    const i = s.sortedX ? nearestSorted(along, pos) : active.index;
    if (i >= 0 && i < s.count && Math.abs((along[i] as number) - pos) < 1) out.push({ series: si, index: i });
  });
  return out;
}

/** Data coordinates of a drawing point: the x axis and the first y axis, inverted. */
export function plotPoint(m: ChartModel, p: { readonly x: number; readonly y: number }): ChartPlotPoint {
  const value = (a: ChartModel['axes'][number] | undefined, px: number): unknown => {
    if (!a) return undefined;
    const v = a.scale.invert(px);
    return a.scale.kind === 'category' || a.scale.kind === 'timeCategory' ? a.scale.domain[Math.round(v)] : a.scale.kind === 'time' ? new Date(v) : v;
  };
  const xa = m.axes.find((a) => a.id === m.xAxisId);
  const ya = m.axes.find((a) => a.id === 'y') ?? m.axes.find((a) => a.direction === 'y');
  return { x: p.x, y: p.y, xValue: value(xa, m.horizontal ? p.y : p.x), yValue: value(ya, m.horizontal ? p.x : p.y) };
}

/** `api.showCrosshair` position: a point, or data values on the x axis and the first y axis. */
export function crosshairAt(m: ChartModel, at: ChartPointRef | { readonly x: unknown; readonly y?: number | undefined }): { pointer: { x: number; y: number }; target?: PointTarget } | null {
  if ('seriesId' in at) {
    const si = m.series.findIndex((s) => s.id === at.seriesId);
    const s = m.series[si];
    return s ? { pointer: { x: s.px[at.index] as number, y: s.py[at.index] as number }, target: { series: si, index: at.index } } : null;
  }
  const xa = m.axes.find((a) => a.id === m.xAxisId);
  const ya = m.axes.find((a) => a.direction === 'y' && a.id === 'y') ?? m.axes.find((a) => a.direction === 'y');
  if (!xa) return null;
  const xv = xa.scale.kind === 'category' || xa.scale.kind === 'timeCategory' ? (xa.scale as BandScale).domain.indexOf(String(at.x)) : at.x instanceof Date ? at.x.getTime() : Number(at.x);
  const px = xa.scale.map(xv);
  const py = ya && at.y !== undefined ? ya.scale.map(at.y) : m.plot.y + m.plot.height / 2;
  return { pointer: m.horizontal ? { x: py, y: px } : { x: px, y: py } };
}

/** Store slice without the entry's `useVizSelector` (stored values keep their identity). */
function useSlice<S extends object, T>(store: VizStore<S>, read: (s: S) => T): T {
  return useSyncExternalStore(store.subscribe, () => read(store.get()), () => read(store.initial));
}


/** Store-driven layer: re-renders on hover, focus and drags only. */
export default function ChartOverlay(props: OverlayProps): ReactNode {
  const { store, model } = props;
  const { pointContext, nearestSorted } = props.tools;
  const active = useSlice(store, (s) => s.active);
  const source = useSlice(store, (s) => s.activeSource);
  const pointer = useSlice(store, (s) => s.pointer);
  const selecting = useSlice(store, (s) => s.selecting);
  const lasso = useSlice(store, (s) => s.lasso);
  const dragPoint = useSlice(store, (s) => s.dragPoint);
  const syncX = useSlice(props.syncStore, (s) => (s.source !== props.uid ? s.x : null));
  let target = active;
  if (!target && syncX !== null && props.sync) {
    const a = model.axes.find((x) => x.id === model.xAxisId);
    if (a) {
      const pos = a.scale.kind === 'category' || a.scale.kind === 'timeCategory' ? (a.scale as BandScale).map(Math.round(syncX)) : a.scale.map(syncX);
      model.series.some((s, si) => {
        if (s.hidden || !s.sortedX) return false;
        const i = nearestSorted(model.horizontal ? s.py : s.px, pos);
        if (i >= 0) target = { series: si, index: i };
        return i >= 0;
      });
    }
  }
  const s = target ? model.series[target.series] : undefined;
  const crossOpt = props.crosshair ? (typeof props.crosshair === 'object' ? props.crosshair : {}) : null;
  const plot = model.plot;
  const ax = s && target ? (s.px[target.index] as number) : Number.NaN;
  const ay = s && target ? (s.py[target.index] as number) : Number.NaN;
  const cx = crossOpt?.snap && Number.isFinite(ax) ? ax : pointer?.x;
  const cy = crossOpt?.snap && Number.isFinite(ay) ? ay : pointer?.y;
  const points = target && s ? (props.shared ? sharedPoints(model, target, nearestSorted) : [target]) : [];
  const ctxs = points.map((p) => {
    const m = model.series[p.series] as SeriesModel;
    return pointContext(m, p.index, props.datumOf(m, p.index), props.xFieldOf(m));
  });
  const header = ctxs[0]?.xText ?? '';
  const tooltipCtx: ChartTooltipContext = { header, points: ctxs };
  const showTooltip = props.tooltip && s && target && Number.isFinite(ax) && ctxs.length > 0;
  const split = props.tooltip?.mode === 'split' && !props.tooltip.render;
  const pos = props.tooltip?.position;
  const anchor = typeof pos === 'object' ? pos : pos === 'pointer' && pointer ? pointer : { x: ax, y: ay };
  const crossOn = crossOpt !== null && cx !== undefined && cy !== undefined && cx >= plot.x && cx <= plot.x + plot.width && cy >= plot.y && cy <= plot.y + plot.height;
  return (
    <>
      <svg className="salmon-chart-overlay" viewBox={`0 0 ${model.width} ${model.height}`} aria-hidden="true" focusable="false">
        {crossOn ? <CrosshairView model={model} options={crossOpt} x={cx} y={cy} tools={props.tools} /> : null}
        {points.map((p) => {
          const m = model.series[p.series] as SeriesModel;
          const x = m.px[p.index] as number;
          const y = m.py[p.index] as number;
          if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
          return <circle key={`${p.series}-${p.index}`} className={source === 'keyboard' ? 'salmon-viz-focus-mark' : 'salmon-chart-hover-mark'} cx={x} cy={y} r={source === 'keyboard' ? 7 : 4} style={source === 'keyboard' ? undefined : { fill: m.color }} />;
        })}
        {selecting ? (
          <rect
            className="salmon-chart-selection"
            x={selecting.mode === 'y' ? plot.x : Math.min(selecting.x0, selecting.x1)}
            y={selecting.mode === 'x' ? plot.y : Math.min(selecting.y0, selecting.y1)}
            width={selecting.mode === 'y' ? plot.width : Math.abs(selecting.x1 - selecting.x0)}
            height={selecting.mode === 'x' ? plot.height : Math.abs(selecting.y1 - selecting.y0)}
          />
        ) : null}
        {lasso ? <path className="salmon-chart-selection" d={lasso} /> : null}
        {dragPoint
          ? (() => {
              const m = model.series[dragPoint.series];
              const x0 = m?.px[dragPoint.index] as number;
              const y0 = m?.py[dragPoint.index] as number;
              const [x, y] = model.horizontal ? [dragPoint.y, y0] : [x0, dragPoint.y];
              return (
                <g className="salmon-chart-drag-preview">
                  <path d={`M${x0},${y0}L${x},${y}`} />
                  <circle cx={x} cy={y} r={6} style={{ fill: m?.color }} />
                </g>
              );
            })()
          : null}
      </svg>
      {showTooltip && split
        ? ctxs.map((c, k) => {
            const p = points[k] as PointTarget;
            const m = model.series[p.series] as SeriesModel;
            return (
              <VizTooltip key={`${c.seriesId}-${c.index}`} x={m.px[p.index] as number} y={m.py[p.index] as number} width={model.width} height={model.height} offset={props.tooltip?.offset}>
                <div className="salmon-viz-tooltip-row">
                  <span className="salmon-viz-tooltip-swatch" style={{ background: c.color }} />
                  <span>{c.seriesName}</span>
                  <span className="salmon-viz-tooltip-value">{props.tooltip?.format ? props.tooltip.format(c) : c.yText}</span>
                </div>
              </VizTooltip>
            );
          })
        : null}
      {showTooltip && !split ? (
        <VizTooltip x={anchor.x} y={anchor.y} width={model.width} height={model.height} offset={props.tooltip?.offset}>
          {props.tooltip?.render ? (
            props.tooltip.render(tooltipCtx)
          ) : (
            <>
              <div className="salmon-viz-tooltip-header">{typeof props.tooltip?.header === 'function' ? props.tooltip.header(tooltipCtx) : (props.tooltip?.header ?? header)}</div>
              {ctxs.map((c) => (
                <div key={`${c.seriesId}-${c.index}`} className="salmon-viz-tooltip-row">
                  <span className="salmon-viz-tooltip-swatch" style={{ background: c.color }} />
                  <span>{c.seriesName}</span>
                  <span className="salmon-viz-tooltip-value">{props.tooltip?.format ? props.tooltip.format(c) : c.yText}</span>
                </div>
              ))}
            </>
          )}
        </VizTooltip>
      ) : null}
    </>
  );
}

/** Crosshair lines, the category band and the axis value labels. */
function CrosshairView({ model, options, x, y, tools }: { model: ChartModel; options: ChartCrosshairOptions; x: number; y: number; tools: OverlayTools }): ReactNode {
  const plot = model.plot;
  const { textWidth, lineHeight } = tools;
  const xa = model.axes.find((a) => a.id === model.xAxisId);
  let band: ReactNode = null;
  if (options.highlightCategory && xa && (xa.scale.kind === 'category' || xa.scale.kind === 'timeCategory')) {
    const bs = xa.scale as BandScale;
    const at = bs.map(Math.round(bs.invert(model.horizontal ? y : x)));
    const half = bs.step / 2;
    band = <rect className="salmon-chart-crosshair-band" x={model.horizontal ? plot.x : at - half} y={model.horizontal ? at - half : plot.y} width={model.horizontal ? plot.width : bs.step} height={model.horizontal ? bs.step : plot.height} />;
  }
  const labels = options.axisLabels
    ? model.axes.flatMap((a) => {
        if (a.hidden) return [];
        const horizontal = a.side === 'top' || a.side === 'bottom';
        if ((horizontal && options.lines === 'y') || (!horizontal && options.lines === 'x')) return [];
        const p = horizontal ? x : y;
        const raw = a.scale.invert(p);
        const band = a.scale.kind === 'category' || a.scale.kind === 'timeCategory';
        const v = band ? Math.round(raw) : raw;
        const value = band ? a.scale.domain[v] : a.scale.kind === 'time' ? new Date(v) : v;
        if (band && value === undefined) return [];
        const text = options.formatLabel ? options.formatLabel(value, a.id) : a.format(v);
        const w = textWidth(text) + 10;
        const h = lineHeight('sm') + 4;
        const dir = a.side === 'bottom' || a.side === 'right' ? 1 : -1;
        const bx = horizontal ? p - w / 2 : dir > 0 ? a.line : a.line - w;
        const by = horizontal ? (dir > 0 ? a.line : a.line - h) : p - h / 2;
        return [
          <g key={a.id} className="salmon-chart-crosshair-label" data-axis={a.id}>
            <rect x={bx} y={by} width={w} height={h} rx={2} />
            <text x={bx + w / 2} y={by + h / 2} textAnchor="middle" dominantBaseline="central">
              {text}
            </text>
          </g>,
        ];
      })
    : null;
  return (
    <>
      {band}
      <path className="salmon-viz-crosshair" d={`${options.lines !== 'y' ? `M${x},${plot.y}V${plot.y + plot.height}` : ''}${options.lines !== 'x' ? `M${plot.x},${y}H${plot.x + plot.width}` : ''}`} />
      {labels}
    </>
  );
}

