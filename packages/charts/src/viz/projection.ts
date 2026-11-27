// Map projections and GeoJSON paths (`projection.ts`): forward and inverse
// projections without d3-geo, GeoJSON geometry to SVG path data, bounds and
// fitting. Pure and deterministic; coordinates rounded to 0.01 px.

import { n2 } from './polyline.js';

export type ProjectionName = 'mercator' | 'equirectangular' | 'miller' | 'eckert3' | 'eckert5' | 'eckert6' | 'winkelTripel' | 'aitoff';

/** Longitude / latitude in degrees to unitless projected [x, y] (y up). */
export type Project = (lon: number, lat: number) => [number, number];

const RAD = Math.PI / 180;
const MAX_MERCATOR = 85.05112878;
const PHI1 = Math.acos(2 / Math.PI);
const K3 = Math.sqrt(Math.PI * (4 + Math.PI));
const K56 = Math.sqrt(2 + Math.PI);

function aitoffRaw(l: number, p: number): [number, number] {
  const a = Math.acos(Math.cos(p) * Math.cos(l / 2));
  const sinc = a === 0 ? 1 : Math.sin(a) / a;
  return [(2 * Math.cos(p) * Math.sin(l / 2)) / sinc, Math.sin(p) / sinc];
}

/** Forward projection by name. */
export function projection(name: ProjectionName): Project {
  switch (name) {
    case 'equirectangular':
      return (lon, lat) => [lon * RAD, lat * RAD];
    case 'miller':
      return (lon, lat) => [lon * RAD, 1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * lat * RAD))];
    case 'eckert3':
      return (lon, lat) => {
        const l = lon * RAD;
        const p = lat * RAD;
        return [(2 / K3) * l * (1 + Math.sqrt(Math.max(0, 1 - (4 * p * p) / (Math.PI * Math.PI)))), (4 / K3) * p];
      };
    case 'eckert5':
      return (lon, lat) => [(lon * RAD * (1 + Math.cos(lat * RAD))) / K56, (2 * lat * RAD) / K56];
    case 'eckert6':
      return (lon, lat) => {
        const k = (1 + Math.PI / 2) * Math.sin(lat * RAD);
        let t = lat * RAD;
        for (let i = 0; i < 12; i++) {
          const d = (t + Math.sin(t) - k) / (1 + Math.cos(t));
          t -= d;
          if (Math.abs(d) < 1e-12) break;
        }
        return [(lon * RAD * (1 + Math.cos(t))) / K56, (2 * t) / K56];
      };
    case 'aitoff':
      return (lon, lat) => aitoffRaw(lon * RAD, lat * RAD);
    case 'winkelTripel':
      return (lon, lat) => {
        const l = lon * RAD;
        const p = lat * RAD;
        const [ax, ay] = aitoffRaw(l, p);
        return [(l * Math.cos(PHI1) + ax) / 2, (p + ay) / 2];
      };
    default:
      return (lon, lat) => {
        const p = Math.max(-MAX_MERCATOR, Math.min(MAX_MERCATOR, lat)) * RAD;
        return [lon * RAD, Math.log(Math.tan(Math.PI / 4 + p / 2))];
      };
  }
}

/** Inverse projection: closed forms where they exist, Newton iteration on the forward projection otherwise. */
export function invert(name: ProjectionName, x: number, y: number): [number, number] {
  if (name === 'mercator') return [x / RAD, (2 * Math.atan(Math.exp(y)) - Math.PI / 2) / RAD];
  if (name === 'equirectangular') return [x / RAD, y / RAD];
  if (name === 'miller') return [x / RAD, ((Math.atan(Math.exp(y / 1.25)) - Math.PI / 4) / 0.4) / RAD];
  const f = projection(name);
  let lon = x / RAD;
  let lat = Math.max(-89, Math.min(89, y / RAD));
  for (let i = 0; i < 40; i++) {
    const [fx, fy] = f(lon, lat);
    const ex = fx - x;
    const ey = fy - y;
    if (Math.abs(ex) < 1e-10 && Math.abs(ey) < 1e-10) break;
    const h = 1e-6;
    const [ax, ay] = f(lon + h, lat);
    const [bx, by] = f(lon, lat + h);
    const j11 = (ax - fx) / h;
    const j21 = (ay - fy) / h;
    const j12 = (bx - fx) / h;
    const j22 = (by - fy) / h;
    const det = j11 * j22 - j12 * j21;
    if (Math.abs(det) < 1e-15) break;
    lon -= (j22 * ex - j12 * ey) / det;
    lat -= (-j21 * ex + j11 * ey) / det;
    lat = Math.max(-90, Math.min(90, lat));
  }
  return [lon, lat];
}

// ------------------------------------------------------------ GeoJSON

export type Position = readonly number[];

export interface GeoGeometry {
  readonly type: 'Point' | 'MultiPoint' | 'LineString' | 'MultiLineString' | 'Polygon' | 'MultiPolygon' | 'GeometryCollection';
  readonly coordinates?: unknown;
  readonly geometries?: readonly GeoGeometry[];
}

export interface GeoFeature {
  readonly type: 'Feature';
  readonly id?: string | number | undefined;
  readonly geometry: GeoGeometry | null;
  readonly properties?: Readonly<Record<string, unknown>> | null;
}

export interface GeoFeatureCollection {
  readonly type: 'FeatureCollection';
  readonly features: readonly GeoFeature[];
}

export type GeoJSON = GeoFeatureCollection | GeoFeature | GeoGeometry;

/** Features of any GeoJSON object (a bare geometry becomes one feature). */
export function featuresOf(geo: GeoJSON | null | undefined): GeoFeature[] {
  if (!geo) return [];
  if (geo.type === 'FeatureCollection') return [...(geo as GeoFeatureCollection).features];
  if (geo.type === 'Feature') return [geo as GeoFeature];
  return [{ type: 'Feature', geometry: geo as GeoGeometry, properties: {} }];
}

/** Visits every ring / line (`closed` for polygon rings) and point of a geometry. */
export function eachLine(g: GeoGeometry | null, line: (points: readonly Position[], closed: boolean) => void, point?: (p: Position) => void): void {
  if (!g) return;
  const c = g.coordinates as never;
  switch (g.type) {
    case 'Point':
      point?.(c);
      break;
    case 'MultiPoint':
      for (const p of c as Position[]) point?.(p);
      break;
    case 'LineString':
      line(c, false);
      break;
    case 'MultiLineString':
      for (const l of c as Position[][]) line(l, false);
      break;
    case 'Polygon':
      for (const r of c as Position[][]) line(r, true);
      break;
    case 'MultiPolygon':
      for (const poly of c as Position[][][]) for (const r of poly) line(r, true);
      break;
    case 'GeometryCollection':
      for (const sub of g.geometries ?? []) eachLine(sub, line, point);
      break;
  }
}

/** A planar or projected point transform to drawing pixels. */
export type ToPixel = (x: number, y: number) => [number, number];

/** SVG path of a geometry; `toPixel` receives GeoJSON positions ([lon, lat] or planar [x, y]). */
export function geoPath(g: GeoGeometry | null, toPixel: ToPixel): string {
  let d = '';
  eachLine(g, (pts, closed) => {
    let last = '';
    pts.forEach((p, i) => {
      const [x, y] = toPixel(p[0]!, p[1]!);
      const s = `${n2(x)},${n2(y)}`;
      if (i > 0 && s === last) return;
      d += (i === 0 ? 'M' : 'L') + s;
      last = s;
    });
    if (closed && pts.length) d += 'Z';
  });
  return d;
}

export interface Bounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** Bounds of geometries in the space `map` puts them in. */
export function boundsOf(geometries: readonly (GeoGeometry | null)[], map: (x: number, y: number) => [number, number]): Bounds | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const add = (p: Position) => {
    const [x, y] = map(p[0]!, p[1]!);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  };
  for (const g of geometries) eachLine(g, (pts) => pts.forEach(add), add);
  return x0 <= x1 ? { x0, y0, x1, y1 } : null;
}

export interface Fit {
  readonly scale: number;
  readonly tx: number;
  readonly ty: number;
}

/** Uniform scale and offset that center `b` in a `width` x `height` box with `padding` (y flipped when `flipY`). */
export function fitBounds(b: Bounds, width: number, height: number, padding = 8, flipY = true): Fit {
  const w = Math.max(1e-9, b.x1 - b.x0);
  const h = Math.max(1e-9, b.y1 - b.y0);
  const scale = Math.min((width - padding * 2) / w, (height - padding * 2) / h);
  const tx = (width - w * scale) / 2 - b.x0 * scale;
  const ty = flipY ? (height - h * scale) / 2 + b.y1 * scale : (height - h * scale) / 2 - b.y0 * scale;
  return { scale, tx, ty };
}

/** Area-weighted centroid of the largest ring of a geometry (label anchor), in the space `toPixel` maps to. */
export function centroidOf(g: GeoGeometry | null, toPixel: ToPixel): [number, number] | null {
  let best: [number, number] | null = null;
  let bestArea = -1;
  let point: [number, number] | null = null;
  eachLine(
    g,
    (pts, closed) => {
      if (!closed) {
        if (!best && pts.length) best = toPixel(pts[Math.floor(pts.length / 2)]![0]!, pts[Math.floor(pts.length / 2)]![1]!);
        return;
      }
      let a = 0;
      let cx = 0;
      let cy = 0;
      const ps = pts.map((p) => toPixel(p[0]!, p[1]!));
      for (let i = 0; i < ps.length - 1; i++) {
        const [x0, y0] = ps[i]!;
        const [x1, y1] = ps[i + 1]!;
        const f = x0 * y1 - x1 * y0;
        a += f;
        cx += (x0 + x1) * f;
        cy += (y0 + y1) * f;
      }
      if (Math.abs(a) > bestArea && a !== 0) {
        bestArea = Math.abs(a);
        best = [cx / (3 * a), cy / (3 * a)];
      }
    },
    (p) => {
      point ??= toPixel(p[0]!, p[1]!);
    },
  );
  return best ?? point;
}

/** Ray-casting point-in-polygon over every ring of a geometry (even-odd), in GeoJSON coordinates. */
export function geometryContains(g: GeoGeometry | null, x: number, y: number): boolean {
  let inside = false;
  eachLine(g, (pts, closed) => {
    if (!closed) return;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i]![0]!;
      const yi = pts[i]![1]!;
      const xj = pts[j]![0]!;
      const yj = pts[j]![1]!;
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  });
  return inside;
}

/** XYZ tiles covering the drawing for a Web Mercator world of `worldSize` px whose origin (lon -180, lat 85) sits at (ox, oy). */
export function tilesFor(worldSize: number, ox: number, oy: number, width: number, height: number, minZoom = 0, maxZoom = 19): { z: number; size: number; tiles: { x: number; y: number; px: number; py: number }[] } {
  const z = Math.max(minZoom, Math.min(maxZoom, Math.ceil(Math.log2(Math.max(1, worldSize / 256)))));
  const n = 2 ** z;
  const size = worldSize / n;
  const tiles: { x: number; y: number; px: number; py: number }[] = [];
  const tx0 = Math.floor(-ox / size);
  const tx1 = Math.ceil((width - ox) / size) - 1;
  const ty0 = Math.max(0, Math.floor(-oy / size));
  const ty1 = Math.min(n - 1, Math.ceil((height - oy) / size) - 1);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1 && tiles.length < 400; tx++) {
      tiles.push({ x: ((tx % n) + n) % n, y: ty, px: Math.round((ox + tx * size) * 100) / 100, py: Math.round((oy + ty * size) * 100) / 100 });
    }
  }
  return { z, size, tiles };
}
