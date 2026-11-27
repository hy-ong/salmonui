// GeoMap model: props to drawing
// geometry. Shapes are projected once per data into "base" pixels (zoom 1,
// the fitted frame); the view (center, zoom) is a transform applied on top,
// so zooming and panning never re-project a shape. Pure; no React, no DOM.

import {
  boundsOf, centroidOf, clusterPoints, featuresOf, fitBounds, geoPath, paletteColor, projection as makeProjection, r2, symbolPath,
  type Bounds, type Cluster, type GeoFeature, type GeoJSON, type ProjectionName, type SymbolShape,
} from '#viz';
import { readField } from '../internal/viz/fields.js';

export type GeoMapMarkerShape = 'circle' | 'rectangle' | 'triangle' | 'invertedTriangle' | 'diamond' | 'pentagon' | 'star' | 'cross' | 'verticalLine' | 'horizontalLine' | 'balloon';
export type LatLon = readonly [number, number];

export interface GeoMapColorStop {
  /** Range stops: `from` (inclusive) and `to` (exclusive, the last one inclusive). */
  readonly from?: number | undefined;
  readonly to?: number | undefined;
  /** Value stops: equality with the field value. */
  readonly value?: unknown;
  /** Data color. Opacity scales use `opacity` with the scale `color`. */
  readonly color?: string | undefined;
  readonly opacity?: number | undefined;
  /** Legend text (default the range or value). */
  readonly label?: string | undefined;
}

export interface GeoMapColorScale {
  readonly kind: 'range' | 'value' | 'opacity';
  /** Field of the joined data row (or of the feature properties). */
  readonly field: string;
  readonly stops?: readonly GeoMapColorStop[] | undefined;
  /** Opacity scale: the color and its `[min, max]` opacity across the field's range. */
  readonly color?: string | undefined;
  readonly opacity?: readonly [number, number] | undefined;
}

export interface GeoMapStyle {
  readonly fill?: string | undefined;
  readonly stroke?: string | undefined;
  readonly opacity?: number | undefined;
  readonly hidden?: boolean | undefined;
}

export interface GeoMapShapeContext<T = unknown> {
  readonly layerId: string;
  readonly key: string;
  readonly name: string;
  readonly feature: GeoFeature;
  readonly datum: T | undefined;
  readonly selected: boolean;
}

export interface GeoMapMarkerContext<T = unknown> {
  readonly layerId: string;
  readonly groupId: string;
  readonly index: number;
  readonly datum: T;
  readonly latitude: number;
  readonly longitude: number;
}

export interface GeoMapClusterContext {
  readonly layerId: string;
  readonly groupId: string;
  readonly count: number;
  readonly latitude: number;
  readonly longitude: number;
  readonly members: readonly number[];
}

export interface GeoMapMarkers<T = unknown> {
  readonly id?: string | undefined;
  readonly data: readonly T[];
  readonly latitudeField?: string | undefined;
  readonly longitudeField?: string | undefined;
  readonly shape?: GeoMapMarkerShape | undefined;
  /** Marker size in px (default 12) or a field scaled into `sizeRange`. */
  readonly size?: number | undefined;
  readonly sizeField?: string | undefined;
  readonly sizeRange?: readonly [number, number] | undefined;
  readonly color?: string | undefined;
  /** Field holding a data color per marker. */
  readonly colorField?: string | undefined;
  /** Accessible and tooltip name. */
  readonly labelField?: string | undefined;
  /** Legend text of the group. */
  readonly label?: string | undefined;
  /** Custom marker content (an image, an icon) centered on the position. */
  readonly render?: ((ctx: GeoMapMarkerContext<T>) => unknown) | undefined;
  readonly getStyle?: ((ctx: GeoMapMarkerContext<T>) => GeoMapStyle | undefined) | undefined;
  /**
   * Grid clustering (recomputed per zoom level). A clicked cluster zooms in (`expand: 'zoom'`, default),
   * fans its markers out around it with connector lines (`'spider'`, a second click or Escape closes it) or
   * does nothing (`'none'`).
   */
  readonly cluster?: boolean | { readonly cell?: number | undefined; readonly expand?: 'zoom' | 'spider' | 'none' | undefined; readonly render?: ((ctx: GeoMapClusterContext) => unknown) | undefined } | undefined;
  /** Markers move by pointer drag and by arrow keys on their focusable handle; `onMarkerMove` reports the drop. */
  readonly draggable?: boolean | undefined;
}

export interface GeoMapBubbles {
  /** Field of the joined data row whose value sizes the bubble. */
  readonly valueField: string;
  /** Radius range in px (default `[4, 24]`), area proportional to the value. */
  readonly radius?: readonly [number, number] | undefined;
  readonly shape?: 'circle' | 'square' | undefined;
  readonly color?: string | undefined;
  readonly colorScale?: GeoMapColorScale | undefined;
  readonly label?: string | undefined;
}

export interface GeoMapLabels {
  /** Field of the joined data row or of the feature properties (default the shape name). */
  readonly field?: string | undefined;
  /** `'hide'` drops labels wider than their shape, `'trim'` shortens them with an ellipsis. */
  readonly overflow?: 'none' | 'hide' | 'trim' | undefined;
  /** `'hide'` drops a label that overlaps an earlier one (default). */
  readonly overlap?: 'hide' | 'show' | undefined;
  /** Custom label content centered on the shape (replaces the text). */
  readonly render?: ((ctx: { readonly key: string; readonly name: string; readonly text: string; readonly datum: unknown }) => unknown) | undefined;
}

export interface GeoMapRoute {
  readonly id?: string | undefined;
  /** `[latitude, longitude]` points. */
  readonly points: readonly LatLon[];
  /** Bend of each segment as a fraction of its length (0 = straight). */
  readonly curvature?: number | undefined;
  readonly arrows?: 'none' | 'start' | 'end' | 'both' | undefined;
  readonly lineStyle?: 'solid' | 'dashed' | 'dotted' | undefined;
  readonly color?: string | undefined;
  readonly width?: number | undefined;
  readonly label?: string | undefined;
}

export interface GeoMapPolygon {
  readonly id?: string | undefined;
  readonly points: readonly LatLon[];
  readonly color?: string | undefined;
  readonly label?: string | undefined;
}

export interface GeoMapTiles {
  /** XYZ URL template: `https://tile.example.org/{z}/{x}/{y}.png` (`{s}` picks from `subdomains`). */
  readonly url: string;
  /** Required: the provider's attribution, always rendered. */
  readonly attribution: unknown;
  readonly minZoom?: number | undefined;
  readonly maxZoom?: number | undefined;
  readonly subdomains?: readonly string[] | undefined;
}

export interface GeoMapLayer<T = unknown> {
  readonly id?: string | undefined;
  /** `'base'` layers are alternatives (one is active); `'overlay'` layers draw over the active one. */
  readonly kind?: 'base' | 'overlay' | undefined;
  readonly name?: string | undefined;
  readonly shapes?: GeoJSON | undefined;
  /** `'planar'` takes shape coordinates as plain x / y (seat maps, floor plans). */
  readonly geometry?: 'geographic' | 'planar' | undefined;
  readonly data?: readonly T[] | undefined;
  /** Field of a data row matched against `shapeKey`. */
  readonly dataKey?: string | undefined;
  /** Feature property naming a shape (default `'name'`). */
  readonly shapeKey?: string | undefined;
  readonly color?: string | undefined;
  readonly palette?: readonly string[] | undefined;
  readonly colorScale?: GeoMapColorScale | undefined;
  readonly getShapeStyle?: ((ctx: GeoMapShapeContext<T>) => GeoMapStyle | undefined) | undefined;
  readonly markers?: GeoMapMarkers | readonly GeoMapMarkers[] | undefined;
  readonly bubbles?: GeoMapBubbles | undefined;
  readonly labels?: GeoMapLabels | boolean | undefined;
  readonly routes?: readonly GeoMapRoute[] | undefined;
  readonly polygons?: readonly GeoMapPolygon[] | undefined;
  readonly tiles?: GeoMapTiles | undefined;
}

/**
 * A layer as a child of `GeoMap` (same fields as a `layers` entry).
 * Renders nothing: `GeoMap` reads the props of its direct children.
 */
export function GeoMapLayer<T = unknown>(_props: GeoMapLayer<T>): null {
  return null;
}

/** Field reader shared with the chart families (dotted paths). */
export const fieldOf = (row: unknown, path: string | undefined): unknown => (row === null || typeof row !== 'object' ? undefined : readField(row as Readonly<Record<string, unknown>>, path));
const num = (v: unknown): number => (typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : Number.NaN);

export function markersOf(layer: GeoMapLayer): readonly GeoMapMarkers[] {
  const m = layer.markers;
  if (!m) return [];
  return Array.isArray(m) ? (m as readonly GeoMapMarkers[]) : [m as GeoMapMarkers];
}

export function layerIdOf(layer: GeoMapLayer, i: number): string {
  return layer.id ?? `layer${i}`;
}

/** The color of a value under a scale, or undefined. */
export function scaleColor(scale: GeoMapColorScale, value: unknown, extent: readonly [number, number]): { color?: string | undefined; opacity?: number | undefined; stop: number } {
  if (scale.kind === 'opacity') {
    const v = num(value);
    if (!Number.isFinite(v)) return { stop: -1 };
    const [o0, o1] = scale.opacity ?? [0.2, 1];
    const t = extent[1] > extent[0] ? (v - extent[0]) / (extent[1] - extent[0]) : 1;
    return { color: scale.color, opacity: r2(o0 + (o1 - o0) * Math.min(1, Math.max(0, t))), stop: 0 };
  }
  const stops = scale.stops ?? [];
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i]!;
    if (scale.kind === 'value' ? Object.is(s.value, value) || String(s.value) === String(value) : num(value) >= (s.from ?? -Infinity) && (num(value) < (s.to ?? Infinity) || (i === stops.length - 1 && num(value) <= (s.to ?? Infinity)))) {
      return { color: s.color, opacity: s.opacity, stop: i };
    }
  }
  return { stop: -1 };
}

export interface ShapeMark {
  readonly key: string;
  readonly name: string;
  readonly index: number;
  readonly d: string;
  readonly fill: string;
  readonly opacity?: number | undefined;
  readonly stroke?: string | undefined;
  /** Colour-scale stop (legend item) or -1. */
  readonly stop: number;
  readonly cx: number;
  readonly cy: number;
  readonly bbox: Bounds | null;
  readonly datum: unknown;
  readonly feature: GeoFeature;
}

export interface LayerModel {
  readonly id: string;
  readonly index: number;
  readonly kind: 'base' | 'overlay';
  readonly name: string;
  readonly shapes: readonly ShapeMark[];
  /** Field value extent of the color scale (opacity) and bubbles. */
  readonly bubbleExtent: readonly [number, number];
}

export interface Frame {
  readonly geographic: boolean;
  readonly projection: ProjectionName;
  /** GeoJSON position (lon, lat or planar x, y) to base pixels. */
  readonly toBase: (x: number, y: number) => [number, number];
  /** Base pixels to GeoJSON position. */
  readonly fromBase: (x: number, y: number) => [number, number];
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
}

const WORLD: Bounds = { x0: -180, y0: -85, x1: 180, y1: 85 };

export interface FrameInput {
  readonly layers: readonly GeoMapLayer[];
  readonly activeBase: number;
  readonly projection: ProjectionName;
  readonly width: number;
  readonly height: number;
  readonly fitTo?: 'markers' | readonly [LatLon, LatLon] | undefined;
}

/** The fitted frame: projection plus the scale and offset that fit the base layer (or `fitTo`) into the drawing. */
export function frameOf(input: FrameInput, invert: (name: ProjectionName, x: number, y: number) => [number, number]): Frame {
  const base = input.layers[input.activeBase];
  const geographic = (base?.geometry ?? 'geographic') === 'geographic';
  const hasTiles = input.layers.some((l) => l.tiles);
  const name: ProjectionName = hasTiles ? 'mercator' : input.projection;
  const proj = makeProjection(name);
  const map = geographic ? proj : (x: number, y: number): [number, number] => [x, y];
  let bounds: Bounds | null = null;
  if (input.fitTo === 'markers') {
    const pts: [number, number][] = [];
    for (const l of input.layers) for (const g of markersOf(l)) for (const d of g.data) pts.push([num(fieldOf(d, g.longitudeField ?? 'longitude')), num(fieldOf(d, g.latitudeField ?? 'latitude'))]);
    bounds = boundsOf([{ type: 'MultiPoint', coordinates: pts }], map);
  } else if (input.fitTo) {
    const [[a, b], [c, d]] = input.fitTo;
    bounds = boundsOf([{ type: 'MultiPoint', coordinates: [[b, a], [d, c]] }], map);
  }
  if (!bounds && base?.shapes) bounds = boundsOf(featuresOf(base.shapes).map((f) => f.geometry), map);
  if (!bounds && geographic) bounds = boundsOf([{ type: 'MultiPoint', coordinates: [[WORLD.x0, WORLD.y0], [WORLD.x1, WORLD.y1]] }], map);
  bounds ??= { x0: 0, y0: 0, x1: 1, y1: 1 };
  const fit = fitBounds(bounds, input.width, input.height, 8, geographic);
  const sy = geographic ? -1 : 1;
  return {
    geographic,
    projection: name,
    scale: fit.scale,
    tx: fit.tx,
    ty: fit.ty,
    toBase: (x, y) => {
      const [px, py] = map(x, y);
      return [fit.tx + px * fit.scale, fit.ty + sy * py * fit.scale];
    },
    fromBase: (x, y) => {
      const px = (x - fit.tx) / fit.scale;
      const py = (sy * (y - fit.ty)) / fit.scale;
      return geographic ? invert(name, px, py) : [px, py];
    },
  };
}

export function shapeKeyOf(feature: GeoFeature, layer: GeoMapLayer, index: number): string {
  const p = feature.properties ?? {};
  const k = p[layer.shapeKey ?? 'name'] ?? feature.id ?? index;
  return String(k);
}

/** Projects and styles the shapes of one layer (memoized by the caller per layer and frame). */
export function layoutLayer(layer: GeoMapLayer, index: number, frame: Frame, selected: ReadonlySet<string>, hiddenStops: ReadonlySet<number>): LayerModel {
  const id = layerIdOf(layer, index);
  const rows = new Map<string, unknown>();
  if (layer.data && layer.dataKey) for (const row of layer.data) rows.set(String(fieldOf(row, layer.dataKey)), row);
  const feats = featuresOf(layer.shapes);
  const scale = layer.colorScale;
  let lo = Infinity;
  let hi = -Infinity;
  const valueOf = (f: GeoFeature, datum: unknown, field: string) => fieldOf(datum, field) ?? fieldOf(f.properties, field);
  if (scale || layer.bubbles) {
    for (const f of feats) {
      const datum = rows.get(shapeKeyOf(f, layer, 0));
      for (const field of [scale?.kind === 'opacity' ? scale.field : undefined, layer.bubbles?.valueField]) {
        if (!field) continue;
        const v = num(valueOf(f, datum, field));
        if (Number.isFinite(v)) {
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
      }
    }
  }
  const extent: [number, number] = lo <= hi ? [lo, hi] : [0, 1];
  const shapes: ShapeMark[] = [];
  feats.forEach((f, i) => {
    const key = shapeKeyOf(f, layer, i);
    const datum = rows.get(key);
    const name = String(fieldOf(f.properties, layer.shapeKey ?? 'name') ?? key);
    let fill = layer.color ?? (layer.palette && layer.palette.length ? layer.palette[i % layer.palette.length]! : 'var(--salmon-geo-map-shape)');
    let opacity: number | undefined;
    let stop = -1;
    if (scale) {
      const c = scaleColor(scale, valueOf(f, datum, scale.field), extent);
      stop = c.stop;
      if (c.color) fill = c.color;
      else if (c.stop >= 0 && scale.kind !== 'opacity') fill = paletteColor(c.stop);
      opacity = c.opacity;
    }
    if (stop >= 0 && hiddenStops.has(stop)) return;
    let stroke: string | undefined;
    if (layer.getShapeStyle) {
      const s = layer.getShapeStyle({ layerId: id, key, name, feature: f, datum, selected: selected.has(key) });
      if (s?.hidden) return;
      if (s?.fill) fill = s.fill;
      if (s?.opacity !== undefined) opacity = s.opacity;
      stroke = s?.stroke;
    }
    const d = geoPath(f.geometry, frame.toBase);
    if (!d && f.geometry?.type !== 'Point') return;
    const c = centroidOf(f.geometry, frame.toBase) ?? [0, 0];
    shapes.push({ key, name, index: i, d, fill, opacity, stroke, stop, cx: c[0], cy: c[1], bbox: boundsOf([f.geometry], frame.toBase), datum, feature: f });
  });
  return { id, index, kind: layer.kind ?? 'base', name: layer.name ?? id, shapes, bubbleExtent: extent };
}

export interface View {
  readonly k: number;
  /** View center in base pixels. */
  readonly cx: number;
  readonly cy: number;
}

export const toScreen = (v: View, width: number, height: number, x: number, y: number): [number, number] => [r2((x - v.cx) * v.k + width / 2), r2((y - v.cy) * v.k + height / 2)];
export const fromScreen = (v: View, width: number, height: number, x: number, y: number): [number, number] => [(x - width / 2) / v.k + v.cx, (y - height / 2) / v.k + v.cy];

export interface MarkerMark {
  readonly groupId: string;
  readonly index: number;
  readonly x: number;
  readonly y: number;
  readonly d: string;
  readonly fill: string;
  readonly size: number;
  readonly label: string;
  readonly datum: unknown;
  readonly latitude: number;
  readonly longitude: number;
  /** Spider expansion: the cluster center the connector line starts at. */
  readonly spoke?: readonly [number, number] | undefined;
}

export interface ClusterMark {
  readonly groupId: string;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly count: number;
  readonly members: readonly number[];
  readonly latitude: number;
  readonly longitude: number;
}

const SYMBOLS: Record<string, SymbolShape> = { circle: 'circle', rectangle: 'rectangle', triangle: 'triangle', invertedTriangle: 'invertedTriangle', diamond: 'diamond', pentagon: 'pentagon', star: 'star', cross: 'cross', verticalLine: 'verticalLine', horizontalLine: 'horizontalLine' };

/** Marker glyph centered at (x, y); a balloon's tip sits on the point. */
export function markerGlyph(shape: GeoMapMarkerShape, x: number, y: number, size: number): string {
  if (shape === 'balloon') {
    const r = size / 2;
    const cy = y - size;
    return `M${r2(x)},${r2(y)}L${r2(x - r * 0.75)},${r2(cy + r * 0.5)}A${r2(r)},${r2(r)} 0 1,1 ${r2(x + r * 0.75)},${r2(cy + r * 0.5)}Z`;
  }
  return symbolPath(SYMBOLS[shape] ?? 'circle', x, y, size);
}

/** Markers of one group in screen coordinates; clustered when the group asks for it. */
export function layoutMarkers(group: GeoMapMarkers, groupId: string, frame: Frame, view: View, width: number, height: number, spider = -1): { markers: MarkerMark[]; clusters: ClusterMark[] } {
  const latF = group.latitudeField ?? 'latitude';
  const lonF = group.longitudeField ?? 'longitude';
  let sizes: [number, number] | null = null;
  if (group.sizeField) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const d of group.data) {
      const v = num(fieldOf(d, group.sizeField));
      if (Number.isFinite(v)) {
        lo = Math.min(lo, v);
        hi = Math.max(hi, v);
      }
    }
    sizes = [lo, hi];
  }
  const [s0, s1] = group.sizeRange ?? [8, 24];
  const markers: MarkerMark[] = [];
  group.data.forEach((d, index) => {
    const lat = num(fieldOf(d, latF));
    const lon = num(fieldOf(d, lonF));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    const [bx, by] = frame.toBase(lon, lat);
    const [x, y] = toScreen(view, width, height, bx, by);
    let size = group.size ?? 12;
    if (sizes && group.sizeField) {
      const v = num(fieldOf(d, group.sizeField));
      size = sizes[1] > sizes[0] && Number.isFinite(v) ? s0 + ((v - sizes[0]) / (sizes[1] - sizes[0])) * (s1 - s0) : (s0 + s1) / 2;
    }
    let fill = (group.colorField ? (fieldOf(d, group.colorField) as string | undefined) : undefined) ?? group.color ?? 'var(--salmon-chart-1)';
    const ctx: GeoMapMarkerContext = { layerId: '', groupId, index, datum: d, latitude: lat, longitude: lon };
    const style = group.getStyle?.(ctx);
    if (style?.hidden) return;
    if (style?.fill) fill = style.fill;
    const label = group.labelField ? String(fieldOf(d, group.labelField) ?? '') : `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    markers.push({ groupId, index, x, y, d: group.render ? '' : markerGlyph(group.shape ?? 'circle', x, y, size), fill, size: r2(size), label, datum: d, latitude: lat, longitude: lon });
  });
  if (!group.cluster) return { markers, clusters: [] };
  const cell = typeof group.cluster === 'object' && group.cluster.cell ? group.cluster.cell : 48;
  const groups: Cluster[] = clusterPoints(markers.map((m, i) => ({ x: m.x, y: m.y, index: i })), cell);
  const out: MarkerMark[] = [];
  const clusters: ClusterMark[] = [];
  for (const g of groups) {
    if (g.members.length === 1) {
      out.push(markers[g.members[0]!]!);
      continue;
    }
    const members = g.members.map((i) => markers[i]!.index);
    // The spider-expanded cluster (keyed by its first member) lays its markers on a circle around it.
    if (members[0] === spider) {
      const n = members.length;
      const rr = Math.max(24, n * 5);
      g.members.forEach((i, j) => {
        const m = markers[i]!;
        const x = r2(g.x + rr * Math.sin((j / n) * 2 * Math.PI));
        const y = r2(g.y - rr * Math.cos((j / n) * 2 * Math.PI));
        out.push({ ...m, x, y, d: m.d && markerGlyph(group.shape ?? 'circle', x, y, m.size), spoke: [g.x, g.y] });
      });
      continue;
    }
    const lat = g.members.reduce((s, i) => s + markers[i]!.latitude, 0) / g.members.length;
    const lon = g.members.reduce((s, i) => s + markers[i]!.longitude, 0) / g.members.length;
    clusters.push({ groupId, x: g.x, y: g.y, r: r2(Math.min(24, 10 + Math.sqrt(g.members.length) * 3)), count: g.members.length, members, latitude: lat, longitude: lon });
  }
  return { markers: out, clusters };
}

/** Quadratic route path through screen points with a perpendicular bend. */
export function routePath(points: readonly [number, number][], curvature: number): string {
  let d = '';
  points.forEach(([x, y], i) => {
    if (i === 0) {
      d = `M${r2(x)},${r2(y)}`;
      return;
    }
    const [px, py] = points[i - 1]!;
    if (!curvature) {
      d += `L${r2(x)},${r2(y)}`;
      return;
    }
    const mx = (px + x) / 2 - (y - py) * curvature;
    const my = (py + y) / 2 + (x - px) * curvature;
    d += `Q${r2(mx)},${r2(my)} ${r2(x)},${r2(y)}`;
  });
  return d;
}
