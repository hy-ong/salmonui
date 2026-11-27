'use client';

// `<GeoMap>`: user-supplied GeoJSON
// layers, projections, markers, bubbles, labels, routes, polygons, a
// generic XYZ tile layer with a required attribution, selection, tooltips,
// zoom and pan. No geo data and no provider ship with it.
// Shapes are projected once per data; the view is a transform. Pan, pinch,
// selection-rectangle and marker-drag frames write DOM attributes only; only
// a committed step re-renders (onViewChange / onMarkerMove once per step).

import { lazy, Suspense, useEffect, useId, useImperativeHandle, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type Ref } from 'react';
import { invert, layoutLegend, numberFormatter, pct, r2, tableModel, textWidth, tilesFor, truncateText, type LegendLayout, type ProjectionName } from '#viz';
import { useControllableState } from '@salmonui/core/internal/controllable';
import { useLocale, useLocaleText } from '@salmonui/core/internal/locale';
import { useHydrated } from '@salmonui/core/internal/hydrated';
import { applyRovingMove, rovingMove } from '@salmonui/core/internal/roving';
import { warnLowContrastDataColors } from '../internal/data-colors.js';
import { childProps } from '../internal/viz/children.js';
import { VizFigure } from '../internal/viz/figure.js';
import { LegendButtons, LegendSvg, type VizLegendItem } from '../internal/viz/legend.js';
import { useVizSelector, useVizStore } from '../internal/viz/store.js';
import { VizTooltip } from '../internal/viz/tooltip.js';
import {
  fieldOf, frameOf, fromScreen, GeoMapLayer, layerIdOf, layoutLayer, layoutMarkers, markersOf, routePath, scaleColor, toScreen,
  type ClusterMark, type GeoMapClusterContext, type GeoMapMarkerContext, type GeoMapMarkers, type LatLon, type LayerModel, type MarkerMark, type ShapeMark, type View,
} from './model.js';

// Read inline (not internal/dev.ts `DEV`): bundlers replace it textually, so the branch folds away in production
// builds even when dev.ts lands in a chunk shared with lazy chunks (an imported binding does not fold).
declare const process: { readonly env: { readonly NODE_ENV?: string } };

const GeoMapTiles = lazy(() => import('./tiles.js'));

export type GeoMapChangeSource = 'pointer' | 'keyboard' | 'touch' | 'api';

export interface GeoMapChangeEvent {
  readonly source: GeoMapChangeSource;
  readonly reason: 'zoom' | 'pan' | 'reset' | 'fit' | 'select' | 'layer' | 'move';
}

/** The map view: center `[latitude, longitude]` (planar maps: `[y, x]`) and zoom (1 = the fitted frame). */
export interface GeoMapView {
  readonly center: LatLon;
  readonly zoom: number;
}

export interface GeoMapZoomOptions {
  readonly wheel?: boolean | undefined;
  readonly doubleClick?: boolean | undefined;
  /** Two-finger pinch (default true). */
  readonly pinch?: boolean | undefined;
  /** Shift + drag draws a rectangle and zooms to it (default false). */
  readonly selection?: boolean | undefined;
  /** Zoom buttons over the map (default true). */
  readonly toolbar?: boolean | undefined;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
}

export interface GeoMapTooltipContext {
  readonly target: 'shape' | 'marker' | 'bubble' | 'cluster';
  readonly layerId: string;
  readonly name: string;
  readonly datum: unknown;
  readonly value?: unknown;
}

export interface GeoMapAnnotation {
  readonly id?: string | undefined;
  /** Position in the drawing: px numbers or percentages (`'50%'`). */
  readonly x: number | string;
  readonly y: number | string;
  readonly content: ReactNode;
  readonly align?: 'start' | 'center' | 'end' | undefined;
}

export interface GeoMapLegendOptions {
  readonly source?: 'shapes' | 'bubbles' | 'markers' | undefined;
  /** `'interactive'` (default) toggles items; `'list'` only lists them. */
  readonly mode?: 'list' | 'interactive' | undefined;
  readonly title?: string | undefined;
  /** Default `'bottom'`; `'float'` draws the legend over the map at `x`, `y` (px, default 8). */
  readonly position?: 'top' | 'bottom' | 'start' | 'end' | 'float' | undefined;
  readonly x?: number | undefined;
  readonly y?: number | undefined;
}

/** `onMarkerMove` payload: where a draggable marker was dropped. */
export interface GeoMapMarkerMove {
  /** `<groupId>:<index>`. */
  readonly markerId: string;
  readonly layerId: string;
  readonly groupId: string;
  readonly index: number;
  readonly datum: unknown;
  readonly latitude: number;
  readonly longitude: number;
}

export interface GeoMapApi {
  readonly element: HTMLElement | null;
  /** Fits the view to `[[lat, lon], [lat, lon]]` bounds or to every marker. */
  fitBounds(bounds: readonly [LatLon, LatLon] | 'markers'): void;
  panBy(direction: 'up' | 'down' | 'left' | 'right', fraction?: number): void;
  /** Drawing coordinates (px) to `{ latitude, longitude }`. */
  toCoordinates(point: { readonly x: number; readonly y: number }): { latitude: number; longitude: number };
  /** `[latitude, longitude]` to drawing coordinates (px). */
  toPoint(position: LatLon): { x: number; y: number };
  export(options?: { readonly format?: 'png' | 'jpeg' | 'svg' | undefined; readonly fileName?: string | undefined; readonly scale?: number | undefined }): Promise<void>;
  toBlob(format?: 'png' | 'jpeg' | 'svg'): Promise<Blob>;
  toDataURL(format?: 'png' | 'jpeg' | 'svg'): Promise<string>;
  toSVGString(): string;
  print(): Promise<void>;
  focus(): void;
}

/** `T` is the row type of the layers' `data` (it types the `getShapeStyle` context). */
/** Built-in text of a GeoMap (`text` prop; the `geoMap` entry of a `LocaleProvider` catalog). */
export interface GeoMapText {
  /** Name and role description of the map when there is no `title`. Default `"Map"`. */
  readonly map: string;
  /** Role description of a draggable marker. */
  readonly movableMarker: string;
  /** The zoom toolbar and its buttons. */
  readonly zoom: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly resetZoom: string;
  readonly legend: string;
}

export interface GeoMapProps<T = unknown> {
  /** The layers; or `GeoMapLayer` children, read when `layers` is absent. */
  readonly layers?: readonly GeoMapLayer<T>[] | undefined;
  readonly children?: ReactNode;
  /** Entrance transition (`@salmonui/charts/viz-animations.css`); default true. */
  readonly animated?: boolean | undefined;
  readonly projection?: ProjectionName | undefined;
  /** Drawing size in px (default 600 x 400); the map scales to its container through `viewBox`. */
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly title?: string | undefined;
  readonly subtitle?: string | undefined;
  readonly description?: string | undefined;
  readonly locale?: string | undefined;
  /** Built-in text (over the nearest `LocaleProvider`'s `geoMap` entry). */
  readonly text?: Partial<GeoMapText> | undefined;
  /** Initial frame: fit every marker or `[[lat, lon], [lat, lon]]` bounds instead of the base layer. */
  readonly fitTo?: 'markers' | readonly [LatLon, LatLon] | undefined;
  readonly view?: GeoMapView | undefined;
  readonly defaultView?: GeoMapView | undefined;
  readonly onViewChange?: ((view: GeoMapView, event: GeoMapChangeEvent) => void) | undefined;
  readonly activeLayer?: string | undefined;
  readonly defaultActiveLayer?: string | undefined;
  readonly onActiveLayerChange?: ((id: string, event: GeoMapChangeEvent) => void) | undefined;
  /** Shape selection (default single); `false` disables it. */
  readonly selection?: boolean | { readonly multiple?: boolean | undefined } | undefined;
  readonly selectedShapes?: readonly string[] | undefined;
  readonly defaultSelectedShapes?: readonly string[] | undefined;
  readonly onSelectedShapesChange?: ((keys: readonly string[], event: GeoMapChangeEvent) => void) | undefined;
  /** Hover highlight of shapes (default true). */
  readonly highlight?: boolean | undefined;
  readonly zoom?: boolean | GeoMapZoomOptions | undefined;
  /** Drag and Ctrl+arrow panning (default true when zoom is on). */
  readonly pan?: boolean | undefined;
  readonly tooltip?: boolean | { readonly trigger?: 'hover' | 'click' | undefined; readonly render?: ((ctx: GeoMapTooltipContext) => ReactNode) | undefined } | undefined;
  readonly legend?: boolean | GeoMapLegendOptions | undefined;
  readonly annotations?: readonly GeoMapAnnotation[] | undefined;
  readonly onShapeClick?: ((ctx: { readonly layerId: string; readonly key: string; readonly name: string; readonly datum: unknown }) => void) | undefined;
  readonly onMarkerClick?: ((ctx: GeoMapMarkerContext) => void) | undefined;
  readonly onClusterClick?: ((ctx: GeoMapClusterContext) => void) | undefined;
  /** A draggable marker was dropped (pointer release) or moved by an arrow key; update the marker data. */
  readonly onMarkerMove?: ((move: GeoMapMarkerMove, event: GeoMapChangeEvent) => void) | undefined;
  readonly onBubbleClick?: ((ctx: { readonly layerId: string; readonly key: string; readonly value: unknown; readonly datum: unknown }) => void) | undefined;
  readonly onMapClick?: ((position: { readonly latitude: number; readonly longitude: number }) => void) | undefined;
  readonly showDataTable?: boolean | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
  readonly ref?: Ref<GeoMapApi> | undefined;
  readonly id?: string | undefined;
  readonly 'data-testid'?: string | undefined;
}

interface MapState {
  readonly hover: string | null;
  readonly focus: number;
  /** Key of the spider-expanded cluster. */
  readonly spider: string | null;
}

/** Arrow key directions (screen px per unit): marker moves; panning moves the other way. */
const ARROWS: Record<string, readonly [number, number]> = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
/** Keyboard zoom factors (0 resets). */
const ZOOM_KEYS: Record<string, number> = { '+': 1.5, '=': 1.5, '-': 1 / 1.5, _: 1 / 1.5, 0: 0 };

const EMPTY: readonly string[] = [];
const freeze = (source: GeoMapChangeSource, reason: GeoMapChangeEvent['reason']): GeoMapChangeEvent => Object.freeze({ source, reason });
const pos = (v: number | string, total: number) => (typeof v === 'number' ? pct(v, total) : v);
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

export function GeoMap<T = unknown>(props: GeoMapProps<T>): ReactNode {
  const locale = useLocale(props.locale);
  const text = { map: 'Map', movableMarker: 'movable marker', zoom: 'Zoom', zoomIn: 'Zoom in', zoomOut: 'Zoom out', resetZoom: 'Reset zoom', legend: 'Legend', ...useLocaleText('geoMap', props.text) };
  const width = props.width ?? 600;
  const height = props.height ?? 400;
  const idBase = useId().replace(/:/g, '');
  const rootRef = useRef<HTMLElement | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const shapesRef = useRef<SVGGElement | null>(null);
  const overRef = useRef<SVGGElement | null>(null);
  const tilesRef = useRef<HTMLDivElement | null>(null);
  const selRef = useRef<SVGPathElement | null>(null);
  // Transient gestures live in refs and DOM attributes, never in React state: the pan, marker drag or
  // selection rectangle of one pointer (`el` the dragged marker, `sel` the rectangle start), and pinch.
  const drag = useRef<{ x: number; y: number; id: number; moved: boolean; dx: number; dy: number; el: Element | null; sel: readonly [number, number] | null } | null>(null);
  const touches = useRef<Map<number, [number, number]> | null>(null);
  const pinch = useRef<{ d: number; mx: number; my: number; s: number } | null>(null);
  const store = useVizStore<MapState>(() => ({ hover: null, focus: -1, spider: null }));
  const hover = useVizSelector(store, (s) => s.hover);
  const spider = useVizSelector(store, (s) => s.spider);
  const focus = useVizSelector(store, (s) => s.focus);
  const hydrated = useHydrated();
  const [hiddenItems, setHiddenItems] = useState<readonly number[]>(EMPTY as never);
  const layers = useMemo(() => (props.layers ?? childProps(props.children, GeoMapLayer)) as readonly GeoMapLayer[], [props.layers, props.children]);
  const bases = layers.map((l, i) => ({ l, i })).filter(({ l }) => (l.kind ?? 'base') === 'base');
  const [activeId, setActive] = useControllableState<string, [GeoMapChangeEvent]>(props.activeLayer, props.defaultActiveLayer ?? (bases[0] ? layerIdOf(bases[0].l, bases[0].i) : ''), props.onActiveLayerChange, 'GeoMap activeLayer');
  const active = Math.max(0, layers.findIndex((l, i) => layerIdOf(l, i) === activeId && (l.kind ?? 'base') === 'base'));
  const [selectedList, setSelected] = useControllableState<readonly string[], [GeoMapChangeEvent]>(props.selectedShapes, props.defaultSelectedShapes ?? EMPTY, props.onSelectedShapesChange, 'GeoMap selectedShapes');
  const selected = new Set(selectedList);
  const zoomOpts = props.zoom ? (props.zoom === true ? {} : props.zoom) : null;
  const minZoom = zoomOpts?.min ?? 1;
  const maxZoom = zoomOpts?.max ?? 10;
  const panOn = props.pan ?? zoomOpts !== null;
  const legendOpts = props.legend ? (props.legend === true ? {} : props.legend) : null;
  const legendSource = legendOpts?.source ?? 'shapes';

  // Legend items (reserve room at the bottom).
  const baseLayer = layers[active];
  const legendItems: VizLegendItem[] = [];
  if (legendOpts) {
    if (legendSource === 'shapes' && baseLayer?.colorScale && baseLayer.colorScale.kind !== 'opacity') {
      (baseLayer.colorScale.stops ?? []).forEach((s, i) => legendItems.push({ id: String(i), label: s.label ?? (baseLayer.colorScale!.kind === 'value' ? String(s.value) : `${s.from ?? ''}–${s.to ?? ''}`), color: s.color ?? `var(--salmon-chart-${(i % 10) + 1})`, shape: 'rectangle', hidden: hiddenItems.includes(i) }));
    } else if (legendSource === 'markers') {
      let gi = 0;
      for (const l of layers) for (const g of markersOf(l)) {
        legendItems.push({ id: String(gi), label: g.label ?? g.id ?? `Markers ${gi + 1}`, color: g.color ?? 'var(--salmon-chart-1)', shape: 'circle', hidden: hiddenItems.includes(gi) });
        gi++;
      }
    } else if (legendSource === 'bubbles' && baseLayer?.bubbles) {
      legendItems.push({ id: '0', label: baseLayer.bubbles.label ?? baseLayer.bubbles.valueField, color: baseLayer.bubbles.color ?? 'var(--salmon-chart-2)', shape: 'circle', hidden: hiddenItems.includes(0) });
    }
  }
  // The map area (mapW x mapH at ox, oy) leaves room for the legend. Screen coordinates use the area
  // centered in sw x sh, so every toScreen / fromScreen call carries the offset.
  let legendLayout: LegendLayout | undefined;
  let mapW = width;
  let mapH = height;
  let ox = 0;
  let oy = 0;
  if (legendItems.length) {
    const lp = legendOpts?.position ?? 'bottom';
    const side = lp === 'start' || lp === 'end' ? lp : 'bottom';
    const l = layoutLegend({ position: side, items: legendItems.map((it) => ({ label: it.label })), title: legendOpts?.title }, side, { width: width - 16, height: side === 'bottom' ? height / 3 : height - 16 });
    let x = (width - l.width) / 2;
    let y = height - l.height - 6;
    if (lp === 'float') {
      x = legendOpts?.x ?? 8;
      y = legendOpts?.y ?? 8;
    } else if (lp === 'top') {
      y = 6;
      oy = l.height + 12;
      mapH -= oy;
    } else if (lp === 'bottom') mapH -= l.height + 12;
    else {
      x = lp === 'start' ? 8 : width - l.width - 8;
      y = (height - l.height) / 2;
      mapW -= l.width + 16;
      if (lp === 'start') ox = l.width + 16;
    }
    legendLayout = { ...l, position: side, x, y, items: l.items.map((it) => ({ ...it, x: x + it.x, y: y + it.y })), title: undefined };
  }
  const sw = mapW + 2 * ox;
  const sh = mapH + 2 * oy;

  const frame = useMemo(() => frameOf({ layers, activeBase: active, projection: props.projection ?? 'mercator', width: mapW, height: mapH, fitTo: props.fitTo }, invert), [layers, active, props.projection, mapW, mapH, props.fitTo]);
  const models: LayerModel[] = useMemo(
    () => layers.map((l, i) => ((l.kind ?? 'base') === 'overlay' || i === active ? layoutLayer(l, i, frame, new Set(selectedList), i === active ? new Set(legendSource === 'shapes' ? hiddenItems : []) : new Set()) : null)).filter((m): m is LayerModel => m !== null),
    [layers, frame, active, selectedList, hiddenItems, legendSource],
  );

  const toView = (v: GeoMapView | undefined): View => {
    if (!v) return { k: 1, cx: mapW / 2, cy: mapH / 2 };
    const [bx, by] = frame.toBase(v.center[1], v.center[0]);
    return { k: Math.min(maxZoom, Math.max(minZoom, v.zoom)), cx: bx, cy: by };
  };
  const toGeoView = (v: View): GeoMapView => {
    const [x, y] = frame.fromBase(v.cx, v.cy);
    return { center: [r2(y * 1e4) / 1e4, r2(x * 1e4) / 1e4], zoom: r2(v.k) };
  };
  const [geoView, setGeoView] = useControllableState<GeoMapView | undefined, [GeoMapChangeEvent]>(props.view, props.defaultView, props.onViewChange as never, 'GeoMap view');
  const view = toView(geoView);
  const scr = (x: number, y: number) => toScreen(view, sw, sh, x, y);
  const unscr = (x: number, y: number) => fromScreen(view, sw, sh, x, y);
  // Client coordinates to drawing px.
  const at = (e: { readonly clientX: number; readonly clientY: number }): [number, number] => {
    const rect = plotRef.current!.getBoundingClientRect();
    return [((e.clientX - rect.left) / (rect.width || width)) * width, ((e.clientY - rect.top) / (rect.height || height)) * height];
  };
  const commitView = (v: View, event: GeoMapChangeEvent) => {
    const k = Math.min(maxZoom, Math.max(minZoom, v.k));
    setGeoView(toGeoView({ k, cx: v.cx, cy: v.cy }), event);
  };
  const zoomAt = (factor: number, sx: number, sy: number, event: GeoMapChangeEvent) => {
    const k = Math.min(maxZoom, Math.max(minZoom, view.k * factor));
    if (k === view.k) return;
    const [bx, by] = unscr(sx, sy);
    // Keep the base point under (sx, sy) fixed.
    commitView({ k, cx: bx - (sx - sw / 2) / k, cy: by - (sy - sh / 2) / k }, event);
  };
  const panBy = (dx: number, dy: number, event: GeoMapChangeEvent) => commitView({ k: view.k, cx: view.cx - dx / view.k, cy: view.cy - dy / view.k }, event);
  // Fits the bounding box of base points.
  const fitBase = (pts: readonly (readonly [number, number])[], event: GeoMapChangeEvent) => {
    if (!pts.length) return;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    commitView({ k: Math.min((mapW - 16) / Math.max(1, x1 - x0), (mapH - 16) / Math.max(1, y1 - y0)), cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }, event);
  };
  // Toolbar and keyboard zoom: a factor about the center, 0 resets.
  const zoomBy = (factor: number, source: GeoMapChangeSource) =>
    factor ? zoomAt(factor, sw / 2, sh / 2, freeze(source, 'zoom')) : commitView({ k: 1, cx: mapW / 2, cy: mapH / 2 }, freeze(source, 'reset'));

  // Markers, clusters, bubbles, labels, routes and polygons in screen coordinates.
  const markerGroups: MarkerGroup[] = [];
  let gi = 0;
  layers.forEach((l, li) => {
    if (!((l.kind ?? 'base') === 'overlay' || li === active)) {
      gi += markersOf(l).length;
      return;
    }
    for (const group of markersOf(l)) {
      const groupId = group.id ?? `${layerIdOf(l, li)}-markers${gi}`;
      const sp = spider?.startsWith(`${groupId}:c`) ? Number(spider.slice(groupId.length + 2)) : -1;
      if (!(legendSource === 'markers' && hiddenItems.includes(gi))) markerGroups.push({ layerId: layerIdOf(l, li), groupId, gi, group, ...layoutMarkers(group, groupId, frame, view, sw, sh, sp) });
      gi++;
    }
  });
  const fmt = numberFormatter(locale, 1, { maximumFractionDigits: 2 });
  const valueText = (v: unknown): string => (typeof v === 'number' ? fmt(v) : String(v));
  const shapesOfActive = models.find((m) => m.index === active)?.shapes ?? [];
  const readingOrder = useMemo(() => [...shapesOfActive].sort((a, b) => (Math.abs(a.cy - b.cy) > 12 ? a.cy - b.cy : a.cx - b.cx)), [shapesOfActive]);
  const focused = focus >= 0 ? readingOrder[focus] : undefined;
  const tooltipOpts = props.tooltip ? (props.tooltip === true ? {} : props.tooltip) : null;
  const selection = props.selection === false ? null : props.selection === true || props.selection === undefined ? {} : props.selection;

  const valueOfShape = (layer: GeoMapLayer, s: { datum: unknown; feature: { properties?: unknown } }) => {
    const field = layer.colorScale?.field ?? layer.bubbles?.valueField;
    return field ? (fieldOf(s.datum, field) ?? fieldOf(s.feature.properties, field)) : undefined;
  };
  const describe = (s: (typeof shapesOfActive)[number]) => {
    const v = baseLayer ? valueOfShape(baseLayer, s) : undefined;
    return v === undefined ? s.name : `${s.name}: ${valueText(v)}`;
  };

  const toggleShape = (key: string, source: GeoMapChangeSource) => {
    if (!selection) return;
    const has = selected.has(key);
    const next = selection.multiple ? (has ? selectedList.filter((k) => k !== key) : [...selectedList, key]) : has ? [] : [key];
    setSelected(next, freeze(source, 'select'));
  };

  // Delegated pointer handling: targets carry data-* attributes.
  const targetOf = (el: EventTarget | null): HTMLElement | SVGElement | null => (el instanceof Element ? (el.closest('[data-target]') as HTMLElement | SVGElement | null) : null);
  // One lookup for tooltips, clicks and marker moves: the data-target kind and data-key of a mark.
  const find = (kind: string | null | undefined, key: string): Hit | null => {
    if (kind === 'shape' || kind === 'bubble') {
      for (const m of models) {
        const s = m.shapes.find((x) => `${m.id}:${x.key}` === key);
        const b = layers[m.index]!.bubbles;
        if (s && (kind === 'shape' || b)) {
          const [x, y] = scr(s.cx, s.cy);
          const value = kind === 'shape' ? valueOfShape(layers[m.index]!, s) : (fieldOf(s.datum, b!.valueField) ?? fieldOf(s.feature.properties, b!.valueField));
          return { x, y, m, s, ctx: { target: kind, layerId: m.id, name: s.name, datum: s.datum, value } };
        }
      }
    }
    for (const g of markerGroups) {
      const mk = kind === 'marker' ? g.markers.find((x) => `${g.groupId}:${x.index}` === key) : undefined;
      if (mk) return { x: mk.x, y: mk.y - mk.size / 2, g, mk, ctx: { target: 'marker', layerId: g.layerId, name: mk.label, datum: mk.datum } };
      const c = kind === 'cluster' ? g.clusters.find((x) => `${g.groupId}:c${x.members[0]}` === key) : undefined;
      if (c) return { x: c.x, y: c.y - c.r, g, c, ctx: { target: 'cluster', layerId: g.layerId, name: `${c.count}`, datum: c.members.map((i) => g.group.data[i]), value: c.count } };
    }
    return null;
  };
  const clickMarker = (g: MarkerGroup, mk: MarkerMark) => props.onMarkerClick?.({ layerId: g.layerId, groupId: g.groupId, index: mk.index, datum: mk.datum, latitude: mk.latitude, longitude: mk.longitude });

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    if (drag.current?.moved) return;
    const t = targetOf(event.target);
    const kind = t?.getAttribute('data-target');
    const key = t?.getAttribute('data-key') ?? '';
    if (tooltipOpts?.trigger === 'click') store.set({ hover: t ? `${kind}|${key}` : null });
    // A click outside the fanned markers closes the spider.
    if (spider && kind !== 'marker' && kind !== 'cluster') store.set({ spider: null });
    const h = find(kind, key);
    const { m, s, g, mk, c } = h ?? {};
    if (m && s) {
      if (kind === 'bubble') props.onBubbleClick?.({ layerId: m.id, key: s.key, value: h!.ctx.value, datum: s.datum });
      else {
        if (m.index === active) toggleShape(s.key, 'pointer');
        props.onShapeClick?.({ layerId: m.id, key: s.key, name: s.name, datum: s.datum });
      }
    }
    if (g && mk) clickMarker(g, mk);
    if (g && c) {
      props.onClusterClick?.({ layerId: g.layerId, groupId: g.groupId, count: c.count, latitude: c.latitude, longitude: c.longitude, members: c.members });
      const expand = typeof g.group.cluster === 'object' ? (g.group.cluster.expand ?? 'zoom') : 'zoom';
      if (expand === 'spider') store.set({ spider: key });
      else if (expand === 'zoom') {
        const [bx, by] = frame.toBase(c.longitude, c.latitude);
        commitView({ k: Math.min(maxZoom, view.k * 2), cx: bx, cy: by }, freeze('pointer', 'zoom'));
      }
    }
    if (props.onMapClick) {
      const [x, y] = frame.fromBase(...unscr(...at(event)));
      props.onMapClick({ latitude: r4(y), longitude: r4(x) });
    }
  };

  const moveMarker = (key: string, dx: number, dy: number, event: GeoMapChangeEvent) => {
    const { g, mk } = find('marker', key) ?? {};
    if (!g || !mk) return;
    const [lon, lat] = frame.fromBase(...unscr(mk.x + dx, mk.y + dy));
    props.onMarkerMove?.(Object.freeze({ markerId: key, layerId: g.layerId, groupId: g.groupId, index: mk.index, datum: mk.datum, latitude: r4(lat), longitude: r4(lon) }), event);
  };
  // Restores the DOM the transient frames wrote (React owns shapesRef's transform, not overRef's).
  const settle = () => {
    shapesRef.current?.setAttribute('transform', gTransform);
    overRef.current?.removeAttribute('transform');
    if (tilesRef.current) tilesRef.current.style.transform = '';
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const pts = (touches.current ??= new Map());
    pts.set(event.pointerId, [event.clientX, event.clientY]);
    if (pts.size === 2 && zoomOpts && zoomOpts.pinch !== false) {
      // Pinch replaces the pan of the first finger; it scales about the start midpoint.
      const [a, b] = [...pts.values()] as [[number, number], [number, number]];
      const [mx, my] = at({ clientX: (a[0] + b[0]) / 2, clientY: (a[1] + b[1]) / 2 });
      pinch.current = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, mx, my, s: 1 };
      drag.current = null;
      return;
    }
    if (event.button !== 0) return;
    const t = targetOf(event.target);
    const key = t?.getAttribute('data-target') === 'marker' ? t.getAttribute('data-key')! : '';
    const el = key && markerGroups.some((g) => g.group.draggable && key.startsWith(`${g.groupId}:`)) ? t : null;
    const sel = !el && zoomOpts?.selection && event.shiftKey ? at(event) : null;
    if (!el && !sel && !panOn) return;
    drag.current = { x: event.clientX, y: event.clientY, id: event.pointerId, moved: false, dx: 0, dy: 0, el, sel };
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (tooltipOpts && tooltipOpts.trigger !== 'click' && !drag.current) {
      const t = targetOf(event.target);
      const next = t ? `${t.getAttribute('data-target')}|${t.getAttribute('data-key')}` : null;
      if (next !== store.get().hover) store.set({ hover: next });
    }
    const p = pinch.current;
    const pts = touches.current;
    if (p && pts?.has(event.pointerId)) {
      pts.set(event.pointerId, [event.clientX, event.clientY]);
      const [a, b] = [...pts.values()] as [[number, number], [number, number]];
      p.s = Math.min(maxZoom, Math.max(minZoom, (view.k * Math.hypot(a[0] - b[0], a[1] - b[1])) / p.d)) / view.k;
      // Transient pinch frame: DOM transforms only, committed once when a finger lifts.
      const tr = `translate(${r2(p.mx * (1 - p.s))} ${r2(p.my * (1 - p.s))}) scale(${r2(p.s * 1000) / 1000})`;
      shapesRef.current?.setAttribute('transform', `${tr} ${gTransform}`);
      overRef.current?.setAttribute('transform', tr);
      return;
    }
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const dx = ((event.clientX - d.x) / (rect.width || width)) * width;
    const dy = ((event.clientY - d.y) / (rect.height || height)) * height;
    if (!d.moved && Math.hypot(dx, dy) < 3) return;
    if (!d.moved) {
      d.moved = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      store.set({ hover: null });
    }
    d.dx = dx;
    d.dy = dy;
    // Transient frames: DOM attributes only, no React render.
    if (d.el) d.el.setAttribute('transform', `translate(${r2(dx)} ${r2(dy)})`);
    else if (d.sel) selRef.current!.setAttribute('d', `M${r2(d.sel[0])},${r2(d.sel[1])}h${r2(dx)}v${r2(dy)}h${r2(-dx)}Z`);
    else {
      shapesRef.current?.setAttribute('transform', `translate(${r2(sw / 2 - view.cx * view.k + dx)} ${r2(sh / 2 - view.cy * view.k + dy)}) scale(${view.k})`);
      overRef.current?.setAttribute('transform', `translate(${r2(dx)} ${r2(dy)})`);
      if (tilesRef.current) tilesRef.current.style.transform = `translate(${(dx / width) * 100}%, ${(dy / height) * 100}%)`;
    }
  };
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    touches.current?.delete(event.pointerId);
    const p = pinch.current;
    if (p) {
      pinch.current = null;
      settle();
      zoomAt(p.s, p.mx, p.my, freeze('touch', 'zoom'));
      return;
    }
    const d = drag.current;
    if (!d || d.id !== event.pointerId) return;
    if (d.moved) {
      const source = freeze(event.pointerType === 'touch' ? 'touch' : 'pointer', d.el ? 'move' : d.sel ? 'zoom' : 'pan');
      if (d.el) {
        d.el.removeAttribute('transform');
        moveMarker(d.el.getAttribute('data-key')!, d.dx, d.dy, source);
      } else if (d.sel) {
        selRef.current!.setAttribute('d', '');
        fitBase([unscr(...d.sel), unscr(d.sel[0] + d.dx, d.sel[1] + d.dy)], source);
      } else {
        settle();
        panBy(d.dx, d.dy, source);
      }
      // Swallow the click that follows a drag.
      setTimeout(() => {
        drag.current = null;
      }, 0);
    } else drag.current = null;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = Math.min(width, mapH) / 4;
    const arrow = ARROWS[event.key];
    if (event.ctrlKey && panOn && arrow) {
      event.preventDefault();
      panBy(-arrow[0] * step, -arrow[1] * step, freeze('keyboard', 'pan'));
      return;
    }
    const zk = zoomOpts ? ZOOM_KEYS[event.key] : undefined;
    if (zk !== undefined) {
      event.preventDefault();
      zoomBy(zk, 'keyboard');
      return;
    }
    if (event.key === 'Escape') {
      store.set({ hover: null, spider: null });
      return;
    }
    const n = readingOrder.length;
    if (!n) return;
    let next = focus;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = focus < 0 ? 0 : (focus + 1) % n;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') next = focus <= 0 ? n - 1 : focus - 1;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = n - 1;
    else if ((event.key === 'Enter' || event.key === ' ') && focused) {
      event.preventDefault();
      toggleShape(focused.key, 'keyboard');
      return;
    } else return;
    event.preventDefault();
    const s = readingOrder[next]!;
    store.set({ focus: next, hover: tooltipOpts ? `shape|${models.find((m) => m.index === active)!.id}:${s.key}` : null });
  };

  // Wheel zoom needs a non-passive listener (preventDefault keeps the page from scrolling).
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    zoomAt(e.deltaY < 0 ? 1.25 : 0.8, ...at(e), freeze('pointer', 'zoom'));
  };
  const wheelOn = Boolean(zoomOpts && zoomOpts.wheel !== false);
  useEffect(() => {
    // the development-only data-color contrast check, on mount (dropped from production builds).
    if (process.env.NODE_ENV !== 'production') warnLowContrastDataColors(rootRef.current);
    const el = plotRef.current;
    if (!el || !wheelOn) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      wheelRef.current(e);
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [wheelOn]);

  useImperativeHandle(props.ref, () => {
    const io = () => import('../internal/viz/export.js');
    const blob = async (format: 'png' | 'jpeg' | 'svg' = 'png', scale?: number) => (await io()).toBlob(svgRef.current!, { format, scale });
    return {
      get element() {
        return rootRef.current;
      },
      fitBounds(b) {
        if (b === 'markers') {
          fitBase(markerGroups.flatMap((g) => g.group.data.map((d) => frame.toBase(Number(fieldOf(d, g.group.longitudeField ?? 'longitude')), Number(fieldOf(d, g.group.latitudeField ?? 'latitude'))))), freeze('api', 'fit'));
          return;
        }
        fitBase([frame.toBase(b[0][1], b[0][0]), frame.toBase(b[1][1], b[1][0])], freeze('api', 'fit'));
      },
      panBy(direction, fraction = 0.25) {
        const s = Math.min(width, mapH) * fraction;
        const dir = { up: [0, s], down: [0, -s], left: [s, 0], right: [-s, 0] }[direction];
        panBy(dir[0]!, dir[1]!, freeze('api', 'pan'));
      },
      toCoordinates({ x, y }) {
        const [lon, lat] = frame.fromBase(...unscr(x, y));
        return { latitude: lat, longitude: lon };
      },
      toPoint([lat, lon]) {
        const [x, y] = scr(...frame.toBase(lon, lat));
        return { x, y };
      },
      toBlob: blob,
      toDataURL: async (format) => (await io()).blobToDataURL(await blob(format)),
      toSVGString: () => (svgRef.current ? new XMLSerializer().serializeToString(svgRef.current) : ''),
      async export(options = {}) {
        const format = options.format ?? 'png';
        (await io()).download(await blob(format, options.scale), options.fileName ?? `map.${format === 'jpeg' ? 'jpg' : format}`);
      },
      async print() {
        const m = await io();
        await m.printSvg(m.serializeSvg(svgRef.current!), props.title ?? text.map);
      },
      focus() {
        plotRef.current?.focus();
      },
    };
  });

  // Accessible table: shapes of the active layer, then markers.
  const rows: string[][] = [
    ...shapesOfActive.map((s) => {
      const v = baseLayer ? valueOfShape(baseLayer, s) : undefined;
      return [s.name, v === undefined ? '' : valueText(v)];
    }),
    ...markerGroups.flatMap((g) => g.group.data.map((d, i) => [g.group.labelField ? String(fieldOf(d, g.group.labelField) ?? '') : `Marker ${i + 1}`, `${fieldOf(d, g.group.latitudeField ?? 'latitude')}, ${fieldOf(d, g.group.longitudeField ?? 'longitude')}`])),
  ];
  const valueHeader = baseLayer?.colorScale?.field ?? baseLayer?.bubbles?.valueField ?? 'Value';
  const table = tableModel(props.title ?? 'Map data', ['Name', valueHeader], rows.length, (r, c) => rows[r]![c]!);
  const summary = props.description ?? `${props.title ?? 'Map'}, ${shapesOfActive.length} shapes${markerGroups.length ? `, ${markerGroups.reduce((s, g) => s + g.group.data.length, 0)} markers` : ''}.`;

  const tileLayer = layers.find((l, i) => l.tiles && ((l.kind ?? 'base') === 'overlay' || i === active))?.tiles;
  let tip: ReactNode = null;
  if (tooltipOpts && hover) {
    const [kind, key] = hover.split('|');
    const h = find(kind, key!);
    if (h) {
      tip = (
        <VizTooltip x={h.x} y={h.y} width={width} height={height}>
          {tooltipOpts.render ? tooltipOpts.render(h.ctx) : (
            <span className="salmon-viz-tooltip-row">
              {h.ctx.name}
              {h.ctx.value !== undefined && h.ctx.target !== 'cluster' ? (
                <>
                  : <span className="salmon-viz-tooltip-value">{valueText(h.ctx.value)}</span>
                </>
              ) : h.ctx.target === 'cluster' ? ' markers' : null}
            </span>
          )}
        </VizTooltip>
      );
    }
  }

  const announcement = focused ? describe(focused) : null;
  const k = view.k;
  const gTransform = `translate(${r2(sw / 2 - view.cx * k)} ${r2(sh / 2 - view.cy * k)}) scale(${r2(k * 1000) / 1000})`;

  return (
    <VizFigure
      family="salmon-geo-map"
      className={props.className}
      style={props.style}
      rootRef={rootRef}
      surfaceStyle={{ aspectRatio: `${width} / ${height}` }}
      idBase={idBase}
      title={props.title}
      subtitle={props.subtitle}
      summary={summary}
      table={table}
      showTable={props.showDataTable}
      announcement={announcement}
      // the entrance transition keys on `data-animate`, present after hydration only (never in server markup).
      extra={{ id: props.id, 'data-testid': props['data-testid'], 'data-projection': frame.projection, 'data-animate': hydrated && props.animated !== false ? '' : undefined }}
    >
      {tileLayer && hydrated ? (
        <div className="salmon-geo-map-tiles" ref={tilesRef} aria-hidden="true">
          <Suspense fallback={null}>
            <GeoMapTiles
              tiles={tileLayer}
              // The Web Mercator world square: longitude -180..180 is 2π projected units wide.
              grid={tilesFor(2 * Math.PI * frame.scale * view.k, ...scr(...frame.toBase(-180, 85.05112878)), sw, sh, tileLayer.minZoom ?? 0, tileLayer.maxZoom ?? 19)}
              width={width}
              height={height}
            />
          </Suspense>
        </div>
      ) : null}
      <div
        ref={plotRef}
        className="salmon-viz-plot salmon-geo-map-plot"
        role="group"
        aria-roledescription={text.map.toLowerCase()}
        aria-label={props.title ?? text.map}
        aria-describedby={`${idBase}-summary`}
        tabIndex={0}
        data-pan={panOn ? '' : undefined}
        onClick={onClick}
        onDoubleClick={zoomOpts && zoomOpts.doubleClick !== false ? (e) => zoomAt(2, ...at(e), freeze('pointer', 'zoom')) : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={(e) => {
          touches.current?.delete(e.pointerId);
          drag.current?.el?.removeAttribute('transform');
          drag.current = pinch.current = null;
          settle();
        }}
        onPointerLeave={() => {
          if (!drag.current && tooltipOpts?.trigger !== 'click') store.set({ hover: null });
        }}
        onKeyDown={onKeyDown}
        onBlur={() => store.set({ focus: -1, hover: null })}
      >
        <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true" focusable="false">
          <defs>
            <marker id={`${idBase}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0L10,5L0,10Z" fill="context-stroke" />
            </marker>
            <clipPath id={`${idBase}-clip`}>
              <rect x={ox} y={oy} width={mapW} height={mapH} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${idBase}-clip)`}>
            <g ref={shapesRef} transform={gTransform}>
              {models.map((m) => (
                <g key={m.id} className="salmon-geo-map-layer" data-layer={m.id} data-kind={m.kind}>
                  {m.shapes.map((s) =>
                    s.d ? (
                      <path
                        key={s.key + s.index}
                        className="salmon-geo-map-shape"
                        d={s.d}
                        fill={s.fill}
                        fillOpacity={s.opacity}
                        stroke={s.stroke}
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                        data-target="shape"
                        data-key={`${m.id}:${s.key}`}
                        data-selected={m.index === active && selected.has(s.key) ? '' : undefined}
                        data-highlight={props.highlight === false ? undefined : ''}
                      />
                    ) : null,
                  )}
                </g>
              ))}
              {focused?.d ? <path className="salmon-viz-focus-mark" d={focused.d} vectorEffect="non-scaling-stroke" /> : null}
            </g>
            <g ref={overRef}>
              {models.map((m) => {
                const layer = layers[m.index]!;
                const routes = (layer.routes ?? []).map((r, i) => {
                  const pts = r.points.map(([lat, lon]) => scr(...frame.toBase(lon, lat)));
                  return (
                    <path
                      key={r.id ?? i}
                      className="salmon-geo-map-route"
                      d={routePath(pts, r.curvature ?? 0)}
                      stroke={r.color ?? 'var(--salmon-chart-2)'}
                      strokeWidth={r.width ?? 2}
                      strokeDasharray={r.lineStyle === 'dashed' ? '6 4' : r.lineStyle === 'dotted' ? '2 3' : undefined}
                      markerEnd={r.arrows === 'end' || r.arrows === 'both' ? `url(#${idBase}-arrow)` : undefined}
                      markerStart={r.arrows === 'start' || r.arrows === 'both' ? `url(#${idBase}-arrow)` : undefined}
                    />
                  );
                });
                const polys = (layer.polygons ?? []).map((p, i) => {
                  const pts = p.points.map(([lat, lon]) => scr(...frame.toBase(lon, lat)));
                  return <path key={p.id ?? i} className="salmon-geo-map-polygon" d={`M${pts.map(([x, y]) => `${x},${y}`).join('L')}Z`} fill={p.color ?? 'var(--salmon-chart-3)'} />;
                });
                const b = layer.bubbles;
                let bubbles: ReactNode = null;
                if (b && !(legendSource === 'bubbles' && hiddenItems.includes(0))) {
                  const [rmin, rmax] = b.radius ?? [4, 24];
                  const [lo, hi] = m.bubbleExtent;
                  bubbles = m.shapes.map((s) => {
                    const v = Number(fieldOf(s.datum, b.valueField) ?? fieldOf(s.feature.properties, b.valueField));
                    if (!Number.isFinite(v)) return null;
                    const t = hi > lo ? (v - lo) / (hi - lo) : 1;
                    const r = r2(Math.sqrt(rmin * rmin + t * (rmax * rmax - rmin * rmin)));
                    const [x, y] = scr(s.cx, s.cy);
                    const fill = (b.colorScale ? scaleColor(b.colorScale, fieldOf(s.datum, b.colorScale.field), m.bubbleExtent).color : undefined) ?? b.color ?? 'var(--salmon-chart-2)';
                    const common = { className: 'salmon-geo-map-bubble', fill, 'data-target': 'bubble', 'data-key': `${m.id}:${s.key}` };
                    return b.shape === 'square' ? <rect key={s.key + s.index} {...common} x={r2(x - r)} y={r2(y - r)} width={r2(r * 2)} height={r2(r * 2)} /> : <circle key={s.key + s.index} {...common} cx={x} cy={y} r={r} />;
                  });
                }
                const labelOpts = layer.labels ? (layer.labels === true ? {} : layer.labels) : null;
                const placed: { x: number; y: number; w: number }[] = [];
                const labels = labelOpts
                  ? m.shapes.map((s) => {
                      let text = String(labelOpts.field ? (fieldOf(s.datum, labelOpts.field) ?? fieldOf(s.feature.properties, labelOpts.field) ?? '') : s.name);
                      if (!text) return null;
                      const [x, y] = scr(s.cx, s.cy);
                      const room = s.bbox ? (s.bbox.x1 - s.bbox.x0) * view.k : Infinity;
                      let w = textWidth(text, 'sm');
                      if (labelOpts.overflow === 'hide' && w > room) return null;
                      if (labelOpts.overflow === 'trim' && w > room) {
                        text = truncateText(text, room, 'sm');
                        w = textWidth(text, 'sm');
                        if (!text || text === '…') return null;
                      }
                      if (labelOpts.overlap !== 'show' && placed.some((p) => Math.abs(p.x - x) < (p.w + w) / 2 && Math.abs(p.y - y) < 14)) return null;
                      placed.push({ x, y, w });
                      if (labelOpts.render) {
                        return (
                          <foreignObject key={s.key + s.index} className="salmon-geo-map-label-content" x={r2(x - w / 2 - 20)} y={r2(y - 12)} width={r2(w + 40)} height={24}>
                            {labelOpts.render({ key: s.key, name: s.name, text, datum: s.datum }) as ReactNode}
                          </foreignObject>
                        );
                      }
                      return (
                        <text key={s.key + s.index} className="salmon-geo-map-label" x={x} y={r2(y + 4)} textAnchor="middle">
                          {text}
                        </text>
                      );
                    })
                  : null;
                return (
                  <g key={m.id}>
                    {polys}
                    {routes}
                    {bubbles}
                    {labels}
                  </g>
                );
              })}
              {markerGroups.map((g) => (
                <g key={g.groupId} className="salmon-geo-map-markers" data-group={g.groupId}>
                  {g.markers.map((mk) => (mk.spoke ? <path key={`s${mk.index}`} className="salmon-geo-map-spoke" d={`M${mk.spoke[0]},${mk.spoke[1]}L${mk.x},${mk.y}`} /> : null))}
                  {g.markers.map((mk) =>
                    g.group.render ? (
                      <foreignObject key={mk.index} x={r2(mk.x - mk.size / 2)} y={r2(mk.y - mk.size / 2)} width={mk.size} height={mk.size} data-target="marker" data-key={`${g.groupId}:${mk.index}`} className="salmon-geo-map-marker">
                        {g.group.render({ layerId: g.layerId, groupId: g.groupId, index: mk.index, datum: mk.datum, latitude: mk.latitude, longitude: mk.longitude }) as ReactNode}
                      </foreignObject>
                    ) : (
                      <path key={mk.index} className="salmon-geo-map-marker" d={mk.d} fill={mk.fill} data-target="marker" data-key={`${g.groupId}:${mk.index}`} />
                    ),
                  )}
                  {g.clusters.map((c) => {
                    const custom = typeof g.group.cluster === 'object' ? g.group.cluster.render : undefined;
                    return (
                      <g key={`c${c.members[0]}`} className="salmon-geo-map-cluster" data-target="cluster" data-key={`${g.groupId}:c${c.members[0]}`}>
                        {custom ? (
                          <foreignObject x={r2(c.x - c.r)} y={r2(c.y - c.r)} width={c.r * 2} height={c.r * 2}>
                            {custom({ layerId: g.layerId, groupId: g.groupId, count: c.count, latitude: c.latitude, longitude: c.longitude, members: c.members }) as ReactNode}
                          </foreignObject>
                        ) : (
                          <>
                            <circle cx={c.x} cy={c.y} r={c.r} fill={g.group.color ?? 'var(--salmon-chart-1)'} />
                            <text x={c.x} y={r2(c.y + 4)} textAnchor="middle" className="salmon-geo-map-cluster-count">
                              {c.count}
                            </text>
                          </>
                        )}
                      </g>
                    );
                  })}
                </g>
              ))}
            </g>
          </g>
          {zoomOpts?.selection ? <path ref={selRef} className="salmon-geo-map-selection" d="" /> : null}
          {legendLayout ? <LegendSvg layout={legendLayout} items={legendItems} page={0} /> : null}
        </svg>
      </div>
      {props.title || props.subtitle ? (
        <div className="salmon-geo-map-header" aria-hidden="true">
          {props.title ? <div className="salmon-geo-map-title">{props.title}</div> : null}
          {props.subtitle ? <div className="salmon-geo-map-subtitle">{props.subtitle}</div> : null}
        </div>
      ) : null}
      {(props.annotations ?? []).map((a, i) => (
        <div key={a.id ?? i} className="salmon-geo-map-annotation" data-align={a.align ?? 'center'} style={{ left: pos(a.x, width), top: pos(a.y, height) }}>
          {a.content}
        </div>
      ))}
      {markerGroups.map((g) =>
        g.group.draggable
          ? g.markers.map((mk) => (
              // Keyboard handle of a draggable marker: arrows move it 8 px, Enter or Space clicks it.
              <div
                key={`${g.groupId}:${mk.index}`}
                role="button"
                tabIndex={0}
                className="salmon-geo-map-handle"
                aria-label={mk.label}
                aria-roledescription={text.movableMarker}
                style={{ left: pct(mk.x, width), top: pct(mk.y, height) }}
                onKeyDown={(e) => {
                  const a = ARROWS[e.key];
                  if (a) moveMarker(`${g.groupId}:${mk.index}`, a[0] * 8, a[1] * 8, freeze('keyboard', 'move'));
                  else if (e.key === 'Enter' || e.key === ' ') clickMarker(g, mk);
                  else return;
                  e.preventDefault();
                }}
              />
            ))
          : null,
      )}
      {zoomOpts && zoomOpts.toolbar !== false ? <ZoomToolbar text={text} onZoom={zoomBy} canIn={view.k < maxZoom} canOut={view.k > minZoom} /> : null}
      {tileLayer ? <div className="salmon-geo-map-attribution">{tileLayer.attribution as ReactNode}</div> : null}
      {legendLayout ? (
        <LegendButtons
          layout={legendLayout}
          items={legendItems}
          width={width}
          height={height}
          page={0}
          label={legendOpts?.title ?? text.legend}
          toggle={legendOpts?.mode !== 'list'}
          onToggle={legendOpts?.mode === 'list' ? undefined : (id) => setHiddenItems((h) => (h.includes(Number(id)) ? h.filter((x) => x !== Number(id)) : [...h, Number(id)]))}
        />
      ) : null}
      {tip}
    </VizFigure>
  );
}


interface MarkerGroup {
  readonly layerId: string;
  readonly groupId: string;
  readonly gi: number;
  readonly group: GeoMapMarkers;
  readonly markers: MarkerMark[];
  readonly clusters: ClusterMark[];
}

/** A mark found by kind and key: its tooltip anchor and context, and the model objects behind it. */
interface Hit {
  readonly x: number;
  readonly y: number;
  readonly ctx: GeoMapTooltipContext;
  readonly m?: LayerModel | undefined;
  readonly s?: ShapeMark | undefined;
  readonly g?: MarkerGroup | undefined;
  readonly mk?: MarkerMark | undefined;
  readonly c?: ClusterMark | undefined;
}

function ZoomToolbar(props: { readonly text: GeoMapText; readonly onZoom: (factor: number, source: GeoMapChangeSource) => void; readonly canIn: boolean; readonly canOut: boolean }): ReactNode {
  const [active, setActive] = useState(0);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const buttons: [string, string, number, boolean][] = [
    // SVG glyphs (16 x 16 path data) in currentColor.
    [props.text.zoomIn, 'M8 3v10M3 8h10', 1.5, props.canIn],
    [props.text.zoomOut, 'M3 8h10', 1 / 1.5, props.canOut],
    [props.text.resetZoom, 'M3 8a5 5 0 1 0 1.5-3.5M3 2v3h3', 0, true],
  ];
  return (
    <div
      role="toolbar"
      aria-label={props.text.zoom}
      aria-orientation="vertical"
      className="salmon-geo-map-toolbar"
      onKeyDown={(e) => {
        const move = rovingMove(e.key, { orientation: 'vertical' });
        if (!move) return;
        e.preventDefault();
        const next = applyRovingMove(move, buttons.length, active, () => true);
        setActive(next);
        refs.current[next]?.focus();
      }}
    >
      {buttons.map(([label, glyph, factor, enabled], i) => (
        <button
          key={label}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          className="salmon-geo-map-toolbar-button"
          aria-label={label}
          aria-disabled={enabled ? undefined : 'true'}
          tabIndex={i === active ? 0 : -1}
          onFocus={() => setActive(i)}
          onClick={(e) => {
            if (enabled) props.onZoom(factor, e.detail === 0 ? 'keyboard' : 'pointer');
          }}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d={glyph} />
          </svg>
        </button>
      ))}
    </div>
  );
}
