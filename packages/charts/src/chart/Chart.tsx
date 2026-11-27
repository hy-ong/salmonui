'use client';

// `Chart`: props compile to
// an id-keyed spec, the pure model lays it out for the stored size and zoom
// frame, `ChartSvg` draws it (or the lazy canvas layer draws the marks), and
// a store-driven overlay shows the tooltip, crosshair, focus ring and zoom
// selection. Pointer, wheel and drag transients live in the store and refs,
// never React state; committed changes go through the controlled triads.

import { Children, isValidElement, lazy, Suspense, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { lineHeight, nearestSorted, pct, textWidth, type BandScale } from '#viz';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { warnOnce } from '@salmonui/core/internal/dev';
import { useHydrated } from '@salmonui/core/internal/hydrated';
import { VizCanvas, type CanvasMark } from '../internal/viz/canvas.js';
import { NamedVizFigure } from '../internal/viz/figure.js';
import { movePointFocus, plotKeyAction, type PointTarget } from '../internal/viz/keyboard.js';
import { LegendButtons, LegendPager, type VizLegendItem } from '../internal/viz/legend.js';
import { svgMarkup } from '../internal/viz/instance.js';
import { initialSize, useMeasuredSize } from '../internal/viz/size.js';
import { useVizSelector, useVizStore, type VizStore } from '../internal/viz/store.js';
import { ChartAxis, ChartSeries, type ChartAxisProps } from './ChartSeries.js';
import { useChartSync, type SyncContextValue, type SyncState } from './ChartSyncGroup.js';
import type { IndicatorLayout } from './indicators.js';
import type { buildPolarModel } from './polar.js';
import type { InteractContext, Interactions, ZoomReason } from './interact.js';
import type { OverlayTools } from './overlay.js';
import { buildModel, compileSpec, currentZoom, DEFAULT_TEXT, hideAxes, readField, seriesId, type ChartModel, type SeriesModel } from './model.js';
import { ChartSvg } from './render.js';
import type { ChartApi, ChartAxisOptions, ChartCrosshairOptions, ChartDatum, ChartPointContext, ChartPointRef, ChartProps, ChartSeriesOptions, ChartTooltipContext, ChartTooltipOptions, ChartZoomRange } from './types.js';

// Read inline (not internal/dev.ts `DEV`): bundlers replace it textually, so the warning text folds away in
// production builds even when dev.ts lands in a chunk shared with lazy chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };

export interface ChartState {
  readonly width: number;
  readonly height: number;
  /** Hovered or focused point. */
  readonly active: PointTarget | null;
  readonly activeSource: 'pointer' | 'keyboard' | 'api' | null;
  /** Crosshair position in drawing px. */
  readonly pointer: { readonly x: number; readonly y: number } | null;
  /** Transient zoom frame during a pan drag. */
  readonly frame: ChartZoomRange | null;
  /** Rubber-band selection in drawing px (`mode`: the constrained axes). */
  readonly selecting: { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number; readonly mode: 'x' | 'y' | 'xy' } | null;
  /** Lasso outline in drawing px. */
  readonly lasso: string | null;
  /** Point drag preview. */
  readonly dragPoint: { readonly series: number; readonly index: number; readonly y: number } | null;
  /** Zoom toolbar drag tool. */
  readonly tool: 'zoom' | 'pan';
  readonly legendPage: number;
  readonly highlight: string | null;
  /** Bumped by `api.appendPoints` (store-driven re-layout). */
  readonly version: number;
}

type PolarLayout = typeof buildPolarModel;
const ZoomToolbar = lazy(() => import('./zoom-toolbar.js'));
const ChartOverlay = lazy(() => import('./overlay.js'));
const OVERLAY_TOOLS: OverlayTools = { pointContext, nearestSorted, textWidth, lineHeight };
const ALL_TOOLS = ['zoom', 'zoomIn', 'zoomOut', 'pan', 'reset'] as const;
const EMPTY: readonly string[] = [];
const EMPTY_POINTS: readonly ChartPointRef[] = [];
const EMPTY_ZOOM: ChartZoomRange = {};

function collectChildren(children: ReactNode): { series: ChartSeriesOptions[]; axes: (ChartAxisOptions & { id: string; direction: 'x' | 'y' })[] } {
  const series: ChartSeriesOptions[] = [];
  const axes: (ChartAxisOptions & { id: string; direction: 'x' | 'y' })[] = [];
  // Reading direct children's props is pure, so JSX series render on the server like the array form.
  for (const child of Children.toArray(children)) {
    if (!isValidElement(child)) continue;
    if (child.type === ChartSeries) series.push(child.props as ChartSeriesOptions);
    else if (child.type === ChartAxis) {
      const p = child.props as ChartAxisProps;
      axes.push({ ...p, id: p.id ?? p.direction });
    }
  }
  return { series, axes };
}

const toggle = (list: readonly string[], id: string): string[] => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

function pointContext(m: SeriesModel, index: number, datum: ChartDatum | undefined, xField: string | undefined): ChartPointContext {
  return { seriesId: m.id, seriesName: m.name, index, datum: datum ?? {}, x: readField(datum, xField), y: m.yValue(index), xText: m.xText(index), yText: m.yText(index), color: m.color };
}

export function Chart(props: ChartProps): ReactNode {
  const uid = useId().replace(/:/g, '');
  const store = useVizStore<ChartState>(() => ({
    ...initialSize({ width: props.width, height: props.height ?? 300 }),
    active: null,
    activeSource: null,
    pointer: null,
    frame: null,
    selecting: null,
    lasso: null,
    dragPoint: null,
    tool: 'zoom',
    legendPage: 0,
    highlight: null,
    version: 0,
  }));
  const surfaceRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const svgHost = useRef<HTMLDivElement>(null);
  // without `height` the surface is a flex item of the root (300 px basis, filling a root whose height CSS
  // fixes); the measured height relays out.
  useMeasuredSize(surfaceRef, store, { width: props.width, height: props.height }, props.onResize);
  const width = useVizSelector(store, (s) => s.width);
  const height = useVizSelector(store, (s) => s.height);
  const frameZoom = useVizSelector(store, (s) => s.frame);
  const legendPage = useVizSelector(store, (s) => s.legendPage);
  const highlightId = useVizSelector(store, (s) => s.highlight);
  const tool = useVizSelector(store, (s) => s.tool);
  const hydrated = useHydrated();
  const version = useVizSelector(store, (s) => s.version);
  const sync = useChartSync();
  const ownSync = useVizStore<SyncState>(() => ({ x: null, source: null, zoom: null }));
  const syncStore = sync?.store ?? ownSync;
  const syncZoom = useVizSelector(syncStore, (s) => s.zoom);

  const [hidden, setHidden] = useControllableState<readonly string[], [{ source: 'pointer' | 'keyboard'; reason: 'legend' }]>(props.hiddenSeries, props.defaultHiddenSeries ?? EMPTY, props.onHiddenSeriesChange, 'Chart hiddenSeries');
  const [zoomRange, setZoomRange] = useControllableState<ChartZoomRange, [{ source: 'pointer' | 'keyboard' | 'touch' | 'api'; reason: ZoomReason }]>(props.zoomRange, props.defaultZoomRange ?? EMPTY_ZOOM, props.onZoomRangeChange, 'Chart zoomRange');
  const [selected, setSelected] = useControllableState<readonly ChartPointRef[], [{ source: 'pointer' | 'keyboard' | 'api'; reason: 'click' | 'keyboard' | 'range' | 'lasso' | 'sync' }]>(props.selectedPoints, props.defaultSelectedPoints ?? EMPTY_POINTS, props.onSelectedPointsChange, 'Chart selectedPoints');

  // Streamed points (api.appendPoints) per series id, kept outside React state.
  const appended = useRef(new Map<string, { points: ChartDatum[]; maxPoints?: number | undefined }>());
  // The chart's own text and locale over the nearest LocaleProvider's (the model reads them from the props).
  const ownText = useLocaleText('chart', props.text);
  const locale = useLocale(props.locale);
  const children = useMemo(() => collectChildren(props.children), [props.children]);
  const seriesList = useMemo(() => {
    const list = [...(props.series ?? []), ...children.series];
    if (version === 0 || appended.current.size === 0) return list;
    return list.map((s, i) => {
      const id = seriesId(s, i);
      const extra = appended.current.get(id);
      if (!extra) return s;
      let data = [...(s.data ?? props.data ?? []), ...extra.points];
      if (extra.maxPoints && data.length > extra.maxPoints) data = data.slice(data.length - extra.maxPoints);
      return { ...s, data };
    });
  }, [props.series, props.data, children.series, version]);
  // One object per props, text, locale and child axes, so the model memo holds across store-only renders.
  const effectiveProps = useMemo<ChartProps>(() => {
    const own = { ...props, text: ownText, locale };
    return children.axes.length ? { ...own, xAxis: { ...props.xAxis, ...children.axes.find((a) => a.id === 'x') }, yAxis: { ...props.yAxis, ...children.axes.find((a) => a.id === 'y') }, axes: [...(props.axes ?? []), ...children.axes.filter((a) => a.id !== 'x' && a.id !== 'y')] } : own;
  }, [props, ownText, locale, children.axes]);
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const spec = useMemo(() => compileSpec(effectiveProps, seriesList, hiddenSet), [effectiveProps.data, effectiveProps.xAxis, effectiveProps.yAxis, effectiveProps.axes, effectiveProps.orientation, effectiveProps.palette, seriesList, hiddenSet]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoom: ChartZoomRange = frameZoom ?? (sync?.zoom && syncZoom ? { ...zoomRange, x: syncZoom } : zoomRange);
  // Polar and radar: the opt-in `polar` feature of `@salmonui/charts/chart/features`.
  const polarOn = props.coordinate === 'polar' || props.coordinate === 'radar';
  const polar = polarOn ? ((props.features?.find((f) => f.name === 'polar') as { layout?: PolarLayout } | undefined)?.layout ?? null) : null;
  // Technical indicators: the opt-in `@salmonui/charts/chart/indicators` feature.
  const indicatorLayout = (props.features?.find((f) => f.name === 'indicators') as { layout?: IndicatorLayout } | undefined)?.layout ?? null;
  const model = useMemo(
    () => (polar ? polar(effectiveProps, spec, { width, height, zoom }) : buildModel(effectiveProps, polarOn ? hideAxes(spec, []) : spec, { width, height, zoom }, indicatorLayout)),
    [spec, width, height, zoom, effectiveProps, polar, polarOn, indicatorLayout],
  );

  const tooltipOpt: ChartTooltipOptions | null = props.tooltip === false ? null : typeof props.tooltip === 'object' ? props.tooltip : {};
  const sharedTooltip = tooltipOpt?.mode === 'shared' || tooltipOpt?.mode === 'split' || Boolean(props.crosshair && typeof props.crosshair === 'object' && props.crosshair.snap);
  const zoomOpt = props.zoom ? (typeof props.zoom === 'object' ? props.zoom : { wheel: true, selection: true, pan: true }) : null;
  const legendOpt = typeof props.legend === 'object' ? props.legend : {};
  // Point, range and gradient legends are keys: only series items toggle.
  const legendToggle = legendOpt.toggle !== false && (legendOpt.mode ?? 'series') === 'series';
  const text = { ...DEFAULT_TEXT, ...ownText };
  const renderer = props.renderer ?? 'svg';
  const canvas = renderer === 'canvas' || (renderer === 'auto' && model.drawnPoints > 20_000);
  const selectedKeys = useMemo(() => new Set(selected.map((p) => `${p.seriesId}:${p.index}`)), [selected]);
  const dimmed = useMemo(() => {
    const out = new Set<string>();
    if (highlightId && (legendOpt.highlight !== false || props.highlight === 'series')) for (const s of model.series) if (s.id !== highlightId) out.add(s.id);
    return out;
  }, [highlightId, model, legendOpt.highlight, props.highlight]);

  // Custom markers and labels: SVG content from the series options, per drawn point.
  const customPoints = seriesList.some((s) => s.renderMarker || (typeof s.labels === 'object' && s.labels.render));
  const pointContent = customPoints
    ? (kind: 'marker' | 'label', id: string, index: number): ReactNode => {
        const opt = spec.series.find((c) => c.id === id)?.options;
        const fn = kind === 'marker' ? opt?.renderMarker : typeof opt?.labels === 'object' ? opt.labels.render : undefined;
        const m = model.series.find((x) => x.id === id);
        return fn && m ? fn(pointContext(m, index, datumOf(m, index), opt?.xField)) : undefined;
      }
    : undefined;
  const legendItems: VizLegendItem[] = model.legend.map((l) => ({ id: l.id, label: l.label, color: l.color, shape: l.shape === 'gradient' ? 'rectangle' : l.shape, hidden: l.hidden, lineStyle: l.lineStyle }));
  // Custom legend content and the gradient key: HTML over the item boxes, in place of the drawn item.
  const legendContent: ReactNode[] = model.legend.map((l) =>
    legendOpt.renderItem ? (
      legendOpt.renderItem({ id: l.id, label: l.label, color: l.color, hidden: l.hidden, seriesId: l.seriesId, index: l.index })
    ) : l.shape === 'gradient' ? (
      <>
        <span className="salmon-chart-gradient-key" style={{ background: `linear-gradient(to right, ${(l.stops ?? []).join(', ')})` }} />
        {l.label}
      </>
    ) : undefined,
  );
  const customLegend = new Set(legendContent.flatMap((x, i) => (x === undefined ? [] : [i])));
  const xFieldOf = (m: SeriesModel) => seriesList.find((s, i) => seriesId(s, i) === m.id)?.xField;
  const datumOf = (m: SeriesModel, index: number): ChartDatum | undefined => spec.series.find((s) => s.id === m.id)?.data[index];

  // --- latest values for event handlers (no stale closures, no re-subscription) ---
  const latest = useRef({ model, props, zoomRange, selected, hidden, syncSelection: null as SyncState['selection'] });
  useEffect(() => {
    latest.current = { ...latest.current, model, props, zoomRange, selected, hidden };
    // Development checks of the opt-in features (production drops them, leaving no empty effect).
    if (process.env.NODE_ENV !== 'production') {
      if (polarOn && !polar) warnOnce('chart-polar', 'Chart coordinate="polar" or "radar" needs features={[polar]} from @salmonui/charts/chart/features.');
      if (effectiveProps.indicators?.length && !indicatorLayout) warnOnce('chart-indicators', 'Chart indicators need features={[technicalIndicators]} from @salmonui/charts/chart/indicators.');
    }
  });

  // Hit-testing lives in the overlay chunk (pointer events only arrive after hydration, when it loads).
  const hover = useRef<typeof import('./overlay.js') | null>(null);
  useEffect(() => {
    if (hydrated && !hover.current)
      void import('./overlay.js').then((m) => {
        hover.current = m;
      });
  }, [hydrated]);
  const hitPoint = (m: ChartModel, x: number, y: number, shared: boolean): PointTarget | null => hover.current?.hitPoint(m, x, y, shared, nearestSorted) ?? null;

  // Entrance and update transitions: CSS keyed on `data-animate`, set after hydration only, so the server
  // markup and the first client render match and reduced motion turns them off in CSS.
  // Path transitions start once the entrance is over, so the first measured relayout does not slide.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || props.animated === false) return el?.removeAttribute('data-animate');
    el.setAttribute('data-animate', '');
    const t = setTimeout(() => el.setAttribute('data-animate', 'update'), 700);
    return () => clearTimeout(t);
  }, [props.animated]);

  // Committed visible ranges: reported after the commit, never per drag frame.
  const visibleRanges = useRef<Record<string, string> | null>(null);
  useEffect(() => {
    if (!props.onVisibleRangeChange || frameZoom) return;
    const prev = visibleRanges.current;
    const next: Record<string, string> = {};
    for (const [axisId, range] of Object.entries(currentZoom(model))) {
      next[axisId] = `${range[0]}:${range[1]}`;
      if (prev && prev[axisId] !== next[axisId]) props.onVisibleRangeChange({ axisId, range });
    }
    visibleRanges.current = next;
  });

  // Point and cluster highlight: fades the other marks through a DOM attribute, no React render.
  useEffect(() => {
    if (props.highlight !== 'point' && props.highlight !== 'cluster') return;
    return store.subscribe(() => {
      const a = store.get().active;
      const m = latest.current.model;
      const id = a ? m.series[a.series]?.id : undefined;
      for (const el of svgHost.current?.querySelectorAll<SVGElement>('.salmon-viz-mark[data-index]') ?? []) {
        const keep = !a || (Number(el.dataset['index']) === a.index && (props.highlight === 'cluster' || el.closest('[data-series]')?.getAttribute('data-series') === id));
        if (keep) el.removeAttribute('data-faded');
        else el.setAttribute('data-faded', '');
      }
    });
  }, [store, props.highlight]);

  const toDrawing = (clientX: number, clientY: number): { x: number; y: number } | null => {
    const el = surfaceRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return null;
    const k = latest.current.model.width / r.width;
    return { x: (clientX - r.left) * k, y: (clientY - r.top) * k };
  };

  const setActive = (target: PointTarget | null, source: ChartState['activeSource']) => {
    const prev = store.get().active;
    if (prev?.series === target?.series && prev?.index === target?.index && store.get().activeSource === source) return;
    store.set({ active: target, activeSource: target ? source : null });
    const m = latest.current.model;
    const s = target ? m.series[target.series] : undefined;
    if (sync && s && target) {
      const xValue = m.horizontal ? (s.py[target.index] as number) : (s.px[target.index] as number);
      sync.store.set({ x: invertX(m, xValue), source: uid });
    } else if (sync && !target && sync.store.get().source === uid) sync.store.set({ x: null, source: null });
    props.onPointHover?.(s && target ? pointContext(s, target.index, datumOf(s, target.index), xFieldOf(s)) : null);
  };

  // Drag, wheel and pinch interactions live in a lazy chunk, loaded after hydration when a feature needs it.
  const selOpt = typeof props.selection === 'object' ? props.selection : {};
  const dragSel = selOpt.mode === 'range' || selOpt.mode === 'lasso';
  const interactive = Boolean(zoomOpt || dragSel || props.onPointChange);
  const fx = useRef<Interactions | null>(null);
  useEffect(() => {
    const ready = (create: () => Interactions) => {
      fx.current ??= create();
      plotRef.current?.setAttribute('data-interactive', '');
    };
    const pre = props.features?.find((f) => f.name === 'interactions') as { create?: () => Interactions } | undefined;
    if (interactive && !fx.current) {
      if (pre?.create) ready(pre.create);
      else void import('./interact.js').then((m) => ready(m.createInteractions));
    }
  }, [interactive]);
  const ctx = (): InteractContext => {
    const l = latest.current;
    return {
      store,
      model: l.model,
      props: l.props,
      series: seriesList,
      yAxisOf: (id) => spec.series.find((c) => c.id === id)?.yAxis,
      zoomed: Object.keys(l.zoomRange).length > 0,
      zoom: zoomOpt,
      host: svgHost.current,
      toDrawing,
      hit: (x, y) => hitPoint(l.model, x, y, false),
      commitZoom,
      select: (points, reason) => commitSelection(points, { source: 'pointer', reason }),
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (fx.current?.move(ctx(), event)) return;
    const p = toDrawing(event.clientX, event.clientY);
    if (!p) return;
    // A moving touch cancels a pending long press.
    if (press.current && Math.hypot(p.x - press.current.x, p.y - press.current.y) > 10) clearTimeout(press.current.t);
    const m = latest.current.model;
    if (props.onPlotPointerMove) props.onPlotPointerMove(hover.current?.plotPoint(m, p) ?? { ...p, xValue: undefined, yValue: undefined }, event);
    if (event.pointerType === 'touch') return;
    store.set({ pointer: p });
    if (tooltipOpt || props.crosshair || props.onPointHover || props.highlight === 'point' || props.highlight === 'cluster') setActive(hitPoint(latest.current.model, p.x, p.y, sharedTooltip), 'pointer');
  };

  const onPointerLeave = () => {
    if (store.get().selecting || store.get().dragPoint || store.get().lasso || store.get().frame) return;
    store.set({ pointer: null });
    if (store.get().activeSource === 'pointer') setActive(null, null);
  };

  // Shared selection: a user selection is published by index; the other charts of the group select the same indices.
  type SelectEvent = Parameters<typeof setSelected>[1];
  const commitSelection = (points: readonly ChartPointRef[], event: SelectEvent) => {
    setSelected(points, event);
    if (sync?.selection) sync.store.set({ selection: { source: uid, indices: [...new Set(points.map((p) => p.index))] } });
  };
  useEffect(() => {
    if (!sync?.selection || !props.selection) return;
    return sync.store.subscribe(() => {
      const sel = sync.store.get().selection;
      // Hover writes the same store: act on a new selection object only.
      if (!sel || sel.source === uid || sel === latest.current.syncSelection) return;
      latest.current.syncSelection = sel;
      const points = latest.current.model.series.filter((s) => !s.hidden).flatMap((s) => sel.indices.filter((i) => i < s.count).map((index) => ({ seriesId: s.id, index })));
      setSelected(points, { source: 'api', reason: 'sync' });
    });
  }, [sync, props.selection]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitZoom = (range: ChartZoomRange, reason: ZoomReason, source: 'pointer' | 'keyboard' | 'touch' | 'api') => {
    setZoomRange(range, { source, reason });
    if (sync?.zoom) sync.store.set({ zoom: range.x ? [range.x[0], range.x[1]] : null });
  };

  // Wheel zoom needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const el = plotRef.current;
    if (!el || !zoomOpt || zoomOpt.wheel === false) return;
    const onWheel = (event: WheelEvent) => fx.current?.wheel(ctx(), event);
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  });

  // Touch: a long press shows the tooltip of the nearest point; moving the finger cancels it.
  const press = useRef<{ x: number; y: number; t: ReturnType<typeof setTimeout> } | null>(null);
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    fx.current?.down(ctx(), event);
    const p = event.pointerType === 'touch' && toDrawing(event.clientX, event.clientY);
    if (!p || !tooltipOpt) return;
    if (press.current) clearTimeout(press.current.t);
    press.current = {
      ...p,
      t: setTimeout(() => {
        store.set({ pointer: p });
        setActive(hitPoint(latest.current.model, p.x, p.y, sharedTooltip), 'pointer');
      }, 500),
    };
  };
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const p = toDrawing(event.clientX, event.clientY);
    if (!p) return;
    const m = latest.current.model;
    // Plot clicks with data coordinates.
    if (props.onPlotClick) props.onPlotClick(hover.current?.plotPoint(m, p) ?? { ...p, xValue: undefined, yValue: undefined }, event);
    const hit = hitPoint(m, p.x, p.y, false);
    if (!hit) return;
    const s = m.series[hit.series];
    if (!s) return;
    props.onPointClick?.(pointContext(s, hit.index, datumOf(s, hit.index), xFieldOf(s)), event);
    if (props.selection && !dragSel) selectPoint(s.id, hit.index, event.ctrlKey || event.metaKey, 'pointer', 'click');
  };

  // Axis label and label-group clicks: the drawn text carries its tick index.
  const onDrawingClick = (event: MouseEvent<HTMLDivElement>) => {
    const t = event.target as Element;
    const axis = latest.current.model.axes.find((a) => a.id === t.closest('[data-axis]')?.getAttribute('data-axis'));
    const tick = t.closest('[data-tick]');
    const group = t.closest('[data-group]')?.getAttribute('data-group');
    if (!axis) return;
    if (tick) {
      const k = Number(tick.getAttribute('data-tick'));
      const at = axis.ticks[k];
      if (at) props.onAxisLabelClick?.({ axisId: axis.id, value: axis.scale.kind === 'category' || axis.scale.kind === 'timeCategory' ? axis.scale.domain[at.value] : axis.scale.kind === 'time' ? new Date(at.value) : at.value, text: at.text.join(' '), index: k }, event);
    } else if (group) {
      const [g, l] = group.split('-').map(Number) as [number, number];
      props.onAxisLabelGroupClick?.({ axisId: axis.id, group: g, level: l, label: axis.options.labelGroups?.[g]?.levels[l]?.label ?? '' }, event);
    }
  };

  const selectPoint = (seriesIdValue: string, index: number, additive: boolean, source: 'pointer' | 'keyboard', reason: 'click' | 'keyboard') => {
    const opt = typeof props.selection === 'object' ? props.selection : {};
    const cur = latest.current.selected;
    const m = latest.current.model;
    let next: ChartPointRef[];
    if (opt.mode === 'cluster') {
      // Every visible series' point at the same index.
      const all = m.series.filter((x) => !x.hidden && index < x.count).map((x) => ({ seriesId: x.id, index }));
      next = cur.some((p) => p.index === index) ? cur.filter((p) => p.index !== index) : opt.multiple || additive ? [...cur, ...all] : all;
    } else if (opt.mode === 'series') {
      const s = m.series.find((x) => x.id === seriesIdValue);
      const all = Array.from({ length: s?.count ?? 0 }, (_, i) => ({ seriesId: seriesIdValue, index: i }));
      next = cur.some((p) => p.seriesId === seriesIdValue) ? cur.filter((p) => p.seriesId !== seriesIdValue) : opt.multiple || additive ? [...cur, ...all] : all;
    } else {
      const exists = cur.some((p) => p.seriesId === seriesIdValue && p.index === index);
      next = exists ? cur.filter((p) => !(p.seriesId === seriesIdValue && p.index === index)) : opt.multiple || additive ? [...cur, { seriesId: seriesIdValue, index }] : [{ seriesId: seriesIdValue, index }];
    }
    commitSelection(next, { source, reason });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const m = latest.current.model;
    if (fx.current?.key(ctx(), event)) return;
    const action = plotKeyAction(event.key, { horizontal: m.horizontal, zoom: Boolean(zoomOpt) });
    if (!action) return;
    event.preventDefault();
    const state = store.get();
    if (action === 'escape') {
      setActive(null, null);
      return;
    }
    if (action === 'zoomIn' || action === 'zoomOut') {
      fx.current?.zoomBy(ctx(), action === 'zoomIn' ? 0.8 : 1.25, 'keyboard', 'keyboard');
      return;
    }
    if (action === 'zoomReset') {
      commitZoom({}, 'reset', 'keyboard');
      return;
    }
    if (action === 'select') {
      const a = state.active;
      const s = a ? m.series[a.series] : undefined;
      if (a && s && props.selection) selectPoint(s.id, a.index, event.ctrlKey || event.metaKey, 'keyboard', 'keyboard');
      return;
    }
    const counts = m.series.map((s) => (s.hidden || !s.tooltip ? 0 : s.count));
    setActive(movePointFocus(state.active, action, counts), 'keyboard');
  };

  const onLegendToggle = (id: string, event: MouseEvent | KeyboardEvent) => {
    if (!legendToggle) return;
    setHidden(toggle(latest.current.hidden, id), { source: event.type === 'click' && (event as MouseEvent).detail === 0 ? 'keyboard' : 'pointer', reason: 'legend' });
  };

  // Export: one lazy chunk, `export-data.ts`: images and print, CSV through the core writer, XLSX and
  // PDF through `exportWriters`.
  const runExport = <T,>(method: 'toBlob' | 'toDataURL' | 'print', arg?: 'png' | 'jpeg' | 'svg'): Promise<T> => import('../internal/viz/export-data.js').then((m) => m.runImage(rootRef.current, method, arg, latest.current.props.title ?? text.chart) as Promise<T>);
  const api: ChartApi = {
    get element() {
      return rootRef.current;
    },
    export: (options = {}) => import('../internal/viz/export-data.js').then((m) => m.exportDocument(rootRef.current, latest.current.model.table, latest.current.props.exportWriters, options, latest.current.props.title ?? text.chart, 'chart')),
    toBlob: (format) => runExport('toBlob', format),
    toDataURL: (format) => runExport('toDataURL', format),
    // synchronous on every family.
    toSVGString: () => svgMarkup(svgHost.current?.querySelector('svg')),
    print: () => runExport('print'),
    focus() {
      plotRef.current?.focus();
    },
    resetZoom() {
      commitZoom({}, 'reset', 'api');
    },
    showTooltip(point) {
      const si = latest.current.model.series.findIndex((s) => s.id === point.seriesId);
      if (si >= 0) setActive({ series: si, index: point.index }, 'api');
    },
    hideTooltip() {
      setActive(null, null);
    },
    showCrosshair(at) {
      // The overlay chunk resolves the position (it is loaded after hydration, before any API call can show a crosshair).
      const m = latest.current.model;
      const hit = hover.current?.crosshairAt(m, at);
      if (!hit) return;
      store.set({ pointer: hit.pointer });
      if (hit.target) setActive(hit.target, 'api');
    },
    hideCrosshair() {
      store.set({ pointer: null });
      if (store.get().activeSource === 'api') setActive(null, null);
    },
    appendPoints(id, points, options) {
      const cur = appended.current.get(id) ?? { points: [] };
      let next = [...cur.points, ...points];
      if (options?.maxPoints && next.length > options.maxPoints) next = next.slice(next.length - options.maxPoints);
      appended.current.set(id, { points: next, maxPoints: options?.maxPoints });
      store.set({ version: store.get().version + 1 });
    },
  };
  useImperativeHandle(props.ref, () => api);

  // an application name wins over `title` and the summary, on the figure and the focusable plot.
  const labelledBy = props['aria-labelledby'] || undefined;
  const label = labelledBy ? undefined : props['aria-label'] || undefined;
  const plot = model.plot;
  const canvasMarks: CanvasMark[] = canvas
    ? model.series.flatMap((s) => (s.hidden ? [] : s.marks.map((m) => ({ d: m.d, fill: m.fill, stroke: m.stroke, strokeWidth: m.strokeWidth, opacity: m.opacity, dash: m.dash ? m.dash.split(' ').map(Number) : undefined }))))
    : [];

  return (
    <NamedVizFigure
      family="salmon-chart"
      className={props.className}
      style={props.style}
      rootRef={rootRef}
      surfaceRef={surfaceRef}
      surfaceStyle={{ ...(props.height ? { height, flex: 'none' } : {}), ...(props.width ? { width: props.width } : {}) }}
      idBase={uid}
      title={props.title}
      subtitle={props.subtitle}
      summary={model.summary}
      table={model.table}
      showTable={props.showDataTable}
      tableSummary={text.moreRows}
      announcement={<ChartAnnouncer store={store} model={model} />}
      naming={labelledBy || label ? { 'aria-labelledby': labelledBy, 'aria-label': label } : undefined}
      extra={{ onClick: props.onClick, onDoubleClick: props.onDoubleClick, onContextMenu: props.onContextMenu, onPointerDown: props.onPointerDown, onPointerUp: props.onPointerUp, onPointerMove: props.onPointerMove, onPointerLeave: props.onPointerLeave }}
    >
      <div ref={svgHost} className="salmon-chart-drawing" onClick={props.onAxisLabelClick || props.onAxisLabelGroupClick ? onDrawingClick : undefined}>
        <ChartSvg model={model} clipId={`${uid}-clip`} canvas={canvas} legendItems={legendItems} legendPage={legendPage} selected={selectedKeys} dimmed={dimmed} highlighted={highlightId} emptyText={polarOn && !polar ? '' : text.noData} renderEmpty={props.renderEmpty} pointContent={pointContent} legendCustom={customLegend} />
      </div>
      {canvas ? (
        <div className="salmon-viz-canvas" style={{ left: pct(plot.x - 1, model.width), top: pct(plot.y - 1, model.height), width: pct(plot.width + 2, model.width), height: pct(plot.height + 2, model.height) }}>
          <VizCanvas marks={canvasMarks} originX={plot.x - 1} originY={plot.y - 1} width={Math.ceil(plot.width + 2)} height={Math.ceil(plot.height + 2)} className="salmon-chart-canvas" />
        </div>
      ) : null}
      {model.empty && props.renderEmpty ? (
        <div className="salmon-chart-empty" style={{ left: pct(plot.x, model.width), top: pct(plot.y, model.height), width: pct(plot.width, model.width), height: pct(plot.height, model.height) }}>
          {props.renderEmpty()}
        </div>
      ) : null}
      {hydrated ? (
        <Suspense fallback={null}>
          <ChartOverlay store={store} syncStore={syncStore} model={model} tooltip={tooltipOpt} crosshair={props.crosshair} shared={sharedTooltip} sync={sync} uid={uid} datumOf={datumOf} xFieldOf={xFieldOf} tools={OVERLAY_TOOLS} />
        </Suspense>
      ) : null}
      <div
        ref={plotRef}
        className="salmon-viz-plot"
        role="group"
        aria-roledescription={text.chart.toLowerCase()}
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : (label ?? props.title ?? model.summary.split('.')[0])}
        aria-describedby={`${uid}-summary`}
        tabIndex={0}
        style={{ left: pct(plot.x, model.width), top: pct(plot.y, model.height), width: pct(plot.width, model.width), height: pct(plot.height, model.height), touchAction: interactive ? 'none' : 'pan-y', cursor: zoomOpt || dragSel ? 'crosshair' : undefined }}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onPointerDown={onPointerDown}
        onPointerUp={(event) => {
          if (press.current) clearTimeout(press.current.t);
          fx.current?.up(ctx(), event);
        }}
        onPointerCancel={(event) => fx.current?.up(ctx(), event)}
        onClick={onClick}
        onDoubleClick={
          props.onPointDoubleClick
            ? (event) => {
                const p = toDrawing(event.clientX, event.clientY);
                const m = latest.current.model;
                const hit = p && hitPoint(m, p.x, p.y, false);
                const s = hit ? m.series[hit.series] : undefined;
                if (hit && s) props.onPointDoubleClick?.(pointContext(s, hit.index, datumOf(s, hit.index), xFieldOf(s)), event);
              }
            : undefined
        }
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (store.get().activeSource === 'keyboard') setActive(null, null);
        }}
      />
      {(props.annotations ?? []).map((a, i) => (
        <ChartAnnotationView key={i} model={model} annotation={a} />
      ))}
      {hydrated && zoomOpt?.toolbar ? (
        <Suspense fallback={null}>
          <ZoomToolbar
            tools={zoomOpt.toolbar === true ? ALL_TOOLS : zoomOpt.toolbar}
            tool={tool}
            zoomed={Object.keys(zoomRange).length > 0}
            position={zoomOpt.toolbarPosition ?? 'topEnd'}
            text={text}
            onTool={(t) => store.set({ tool: t })}
            onZoom={(f) => fx.current?.zoomBy(ctx(), f, 'toolbar', 'pointer')}
            onReset={() => commitZoom({}, 'reset', 'pointer')}
          />
        </Suspense>
      ) : null}
      {model.frame.legend && customLegend.size
        ? model.frame.legend.items.map((b) =>
            customLegend.has(b.index) && b.page === legendPage ? (
              <span key={b.index} className="salmon-chart-legend-content" aria-hidden="true" style={{ left: pct(b.x, model.width), top: pct(b.y, model.height), width: pct(b.width, model.width), height: pct(b.height, model.height) }}>
                {legendContent[b.index]}
              </span>
            ) : null,
          )
        : null}
      {model.frame.legend ? (
        <LegendButtons
          // A one-column top or bottom legend (`orientation: 'vertical'`) takes the vertical keyboard model of a side legend.
          layout={legendOpt.orientation === 'vertical' ? { ...model.frame.legend, position: 'start' } : model.frame.legend}
          items={legendItems}
          width={model.width}
          height={model.height}
          page={legendPage}
          label={legendOpt.title ?? text.legend}
          toggle={legendToggle}
          onToggle={onLegendToggle}
          onHighlight={(id) => store.set({ highlight: id })}
        >
          <LegendPager layout={model.frame.legend} width={model.width} height={model.height} page={legendPage} text={text} onPage={(page) => store.set({ legendPage: page })} />
        </LegendButtons>
      ) : null}
    </NamedVizFigure>
  );
}

function invertX(model: ChartModel, pixel: number): number {
  const a = model.axes.find((x) => x.id === model.xAxisId);
  if (!a) return pixel;
  return a.scale.invert(pixel);
}

/** Live region text for the keyboard-focused point. */
function ChartAnnouncer({ store, model }: { store: VizStore<ChartState>; model: ChartModel }): ReactNode {
  const active = useVizSelector(store, (s) => (s.activeSource === 'keyboard' ? s.active : null));
  if (!active) return null;
  const s = model.series[active.series];
  if (!s) return null;
  return `${s.name}, ${s.xText(active.index)}: ${s.yText(active.index)}. ${active.index + 1} of ${s.count}.`;
}

function ChartAnnotationView({ model, annotation }: { model: ChartModel; annotation: NonNullable<ChartProps['annotations']>[number] }): ReactNode {
  let x: number;
  let y: number;
  if (annotation.units === 'pixel') {
    x = Number(annotation.x);
    y = annotation.y;
  } else {
    const xa = model.axes.find((a) => a.id === (annotation.xAxis ?? 'x'));
    const ya = model.axes.find((a) => a.id === (annotation.yAxis ?? 'y'));
    if (!xa || !ya) return null;
    const xv = xa.scale.kind === 'category' || xa.scale.kind === 'timeCategory' ? Math.max(0, (xa.scale as BandScale).domain.indexOf(String(annotation.x))) : annotation.x instanceof Date ? annotation.x.getTime() : Number(annotation.x);
    const px = xa.scale.map(xv);
    const py = ya.scale.map(annotation.y);
    [x, y] = model.horizontal ? [py, px] : [px, py];
  }
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return (
    <div className="salmon-chart-annotation" style={{ left: pct(x, model.width), top: pct(y, model.height) }}>
      {annotation.content}
    </div>
  );
}
