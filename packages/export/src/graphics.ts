// `@salmonui/export/graphics`: standalone SVG drawings as
// vector PDF pages. The input is SVG markup (a visualization's `toBlob('svg')`
// text, or any server-rendered SVG with resolved colors), parsed here without
// a DOM, so the writer runs in browsers, workers and Node alike. Paths,
// rectangles, circles, ellipses, lines, polylines and polygons become PDF path
// operators (arcs as cubic Béziers, transforms applied), `<text>` / `<tspan>`
// become text operators in the PDF writer's fonts (Helvetica WinAnsi or an
// embedded TrueType `font`), rectangle and path clip paths clip, opacity uses
// graphics states, and gradients paint with their first stop. The page,
// fonts, `{page}` / `{pages}` header and footer and the object layout follow
// the Gantt PDF writer (`gantt.ts`), reusing the same helpers.

import { concat, createSlicer, defaultYield, deflate, latin1 } from './bytes.js';
import type { EmbeddedFace, PdfFont, PdfFontData } from './pdf-fonts.js';
import { helpers, helvetica, n2, PAGE_SIZES, textString, type Face, type PdfPageSize } from './pdf-writer.js';

export type { PdfFont, PdfFontData, PdfPageSize } from './pdf-writer.js';

/** One drawing per page. */
export interface GraphicsPdfPage {
  /** Standalone SVG markup (`<svg xmlns=...>`) with resolved colors. */
  readonly svg: string;
}

export interface GraphicsPdfOptions {
  /** Default `Chart.pdf`. */
  readonly fileName?: string;
  /** A PDF writer page size (case-insensitive) or the size in points. Default `a4`. */
  readonly pageSize?: PdfPageSize | 'A4' | 'A3' | 'Letter' | 'Legal' | readonly [number, number] | { readonly width: number; readonly height: number };
  /** Default: landscape when the drawing is wider than tall. */
  readonly orientation?: 'portrait' | 'landscape';
  /** Page margin in points. Default 36. */
  readonly margin?: number;
  /** Page header text; `{page}` and `{pages}` are replaced. */
  readonly header?: string;
  /** Page footer text. Default none. */
  readonly footer?: string;
  /** Document title (PDF Info). */
  readonly title?: string;
  /** TrueType font for all text: needed outside WinAnsi. */
  readonly font?: PdfFont | PdfFontData;
  /** Deflate the page streams when the platform has `CompressionStream`. Default true. */
  readonly compress?: boolean;
}

export interface GraphicsPdfFile {
  readonly fileName: string;
  readonly mimeType: 'application/pdf';
  readonly data: Uint8Array;
}

// ---------------------------------------------------------------------------
// XML
// ---------------------------------------------------------------------------

interface El {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: (El | string)[];
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string): string => s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? Number.parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e] ?? m)));

/** A small, forgiving XML reader for SVG (no DTDs, no namespaces beyond prefixes). */
export function parseSvgXml(src: string): El | null {
  const root: El = { tag: '#', attrs: {}, children: [] };
  const stack: El[] = [root];
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<![^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*)\s*(\/?)>|([^<]+)/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    const top = stack[stack.length - 1] as El;
    if (m[1] !== undefined) top.children.push(m[1]);
    else if (m[2] !== undefined) {
      if (stack.length > 1) stack.pop();
    } else if (m[3] !== undefined) {
      const attrs: Record<string, string> = {};
      for (const a of (m[4] ?? '').matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1] as string] = decode(a[2] ?? a[3] ?? '');
      const el: El = { tag: m[3].replace(/^.*:/, ''), attrs, children: [] };
      top.children.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] !== undefined) top.children.push(decode(m[6]));
  }
  return (root.children.find((c) => typeof c !== 'string' && c.tag === 'svg') as El | undefined) ?? null;
}

// ---------------------------------------------------------------------------
// Colors
// ---------------------------------------------------------------------------

/** sRGB 0..1 plus alpha. */
export type Rgba = readonly [number, number, number, number];

const NAMED: Record<string, string> = { black: '000', white: 'fff', red: 'f00', green: '008000', blue: '00f', gray: '808080', grey: '808080', silver: 'c0c0c0', yellow: 'ff0', orange: 'ffa500' };
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const gamma = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

function oklab(l: number, a: number, b: number, alpha: number): Rgba {
  const L = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const M = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const S = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [clamp01(gamma(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S)), clamp01(gamma(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S)), clamp01(gamma(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S)), alpha];
}

/**
 * Parses a CSS color as browsers serialize computed values (hex, `rgb()`,
 * `hsl()`, `oklch()`, `oklab()`, `color(srgb ...)`, a few names); null for
 * `none`, `transparent` and anything unknown.
 */
export function parseColor(input: string | undefined): Rgba | null {
  if (!input) return null;
  let s = input.trim().toLowerCase();
  const ld = /^light-dark\(\s*([^,]+(?:\([^)]*\))?)\s*,/.exec(s);
  if (ld) s = (ld[1] as string).trim();
  const fallback = /^var\([^,]+,\s*(.+)\)$/.exec(s);
  if (fallback) return parseColor(fallback[1]);
  if (NAMED[s]) s = `#${NAMED[s]}`;
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (!/^[\da-f]{6}([\da-f]{2})?$/.test(h)) return null;
    const n = (i: number): number => Number.parseInt(h.slice(i, i + 2), 16) / 255;
    return [n(0), n(2), n(4), h.length === 8 ? n(6) : 1];
  }
  const fn = /^([a-z]+)\((.*)\)$/.exec(s);
  if (!fn) return null;
  const parts = (fn[2] as string).replace(/[,/]/g, ' ').trim().split(/\s+/);
  const num = (v: string | undefined, scale = 1): number => (v === undefined || v === 'none' ? 0 : v.endsWith('%') ? (Number.parseFloat(v) / 100) * scale : Number.parseFloat(v));
  const alpha = parts.length > 3 ? clamp01(num(parts[parts.length - 1], 1)) : 1;
  switch (fn[1]) {
    case 'rgb':
    case 'rgba':
      return [clamp01(num(parts[0], 255) / 255), clamp01(num(parts[1], 255) / 255), clamp01(num(parts[2], 255) / 255), alpha];
    case 'hsl':
    case 'hsla': {
      const h = num(parts[0]) / 360;
      const sat = num(parts[1], 1);
      const l = num(parts[2], 1);
      const q = l < 0.5 ? l * (1 + sat) : l + sat - l * sat;
      const p = 2 * l - q;
      const f = (t: number): number => {
        const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
        return u < 1 / 6 ? p + (q - p) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p;
      };
      return [f(h + 1 / 3), f(h), f(h - 1 / 3), alpha];
    }
    case 'oklch': {
      const c = num(parts[1], 0.4);
      const h = (num(parts[2]) * Math.PI) / 180;
      return oklab(num(parts[0], 1), c * Math.cos(h), c * Math.sin(h), alpha);
    }
    case 'oklab':
      return oklab(num(parts[0], 1), num(parts[1], 0.4), num(parts[2], 0.4), alpha);
    case 'color':
      return parts[0] === 'srgb' ? [clamp01(num(parts[1], 1)), clamp01(num(parts[2], 1)), clamp01(num(parts[3], 1)), parts.length > 4 ? clamp01(num(parts[4], 1)) : 1] : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** Affine matrix [a b c d e f]. */
type Mat = readonly [number, number, number, number, number, number];
const ID: Mat = [1, 0, 0, 1, 0, 0];
const mul = (m: Mat, n: Mat): Mat => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const nums = (s: string | undefined): number[] => (s ? (s.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []).map(Number) : []);

function parseTransform(s: string | undefined): Mat {
  let m: Mat = ID;
  if (!s) return m;
  for (const t of s.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
    const v = nums(t[2]);
    const [a = 0, b, c] = v;
    let n: Mat = ID;
    if (t[1] === 'matrix' && v.length === 6) n = v as unknown as Mat;
    else if (t[1] === 'translate') n = [1, 0, 0, 1, a, b ?? 0];
    else if (t[1] === 'scale') n = [a, 0, 0, b ?? a, 0, 0];
    else if (t[1] === 'rotate') {
      const r = (a * Math.PI) / 180;
      const cos = Math.cos(r);
      const sin = Math.sin(r);
      n = [cos, sin, -sin, cos, 0, 0];
      if (b !== undefined) n = mul(mul([1, 0, 0, 1, b, c ?? 0], n), [1, 0, 0, 1, -b, -(c ?? 0)]);
    } else if (t[1] === 'skewX') n = [1, 0, Math.tan((a * Math.PI) / 180), 1, 0, 0];
    else if (t[1] === 'skewY') n = [1, Math.tan((a * Math.PI) / 180), 0, 1, 0, 0];
    m = mul(m, n);
  }
  return m;
}

/** SVG path data to absolute PDF path operators under `m` (arcs and quadratics become cubics). */
export function pathOps(d: string, m: Mat): string {
  const tokens = d.match(/[a-df-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const out: string[] = [];
  const pt = (x: number, y: number): string => {
    const [px, py] = apply(m, x, y);
    return `${n2(px)} ${n2(py)}`;
  };
  let i = 0;
  let cmd = '';
  let x = 0;
  let y = 0;
  let sx = 0;
  let sy = 0;
  let cx = 0;
  let cy = 0;
  let prev = '';
  const next = (): number => Number(tokens[i++]);
  const cubic = (x1: number, y1: number, x2: number, y2: number, ex: number, ey: number): void => {
    out.push(`${pt(x1, y1)} ${pt(x2, y2)} ${pt(ex, ey)} c`);
    cx = x2;
    cy = y2;
    x = ex;
    y = ey;
  };
  while (i < tokens.length) {
    const t = tokens[i] as string;
    if (/[a-z]/i.test(t)) {
      cmd = t;
      i++;
      if (cmd === 'z' || cmd === 'Z') {
        out.push('h');
        x = sx;
        y = sy;
        prev = 'z';
        continue;
      }
    } else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const ox = rel ? x : 0;
    const oy = rel ? y : 0;
    const C = cmd.toUpperCase();
    if (C === 'M') {
      x = ox + next();
      y = oy + next();
      sx = x;
      sy = y;
      out.push(`${pt(x, y)} m`);
      cmd = rel ? 'l' : 'L';
    } else if (C === 'L') {
      x = ox + next();
      y = oy + next();
      out.push(`${pt(x, y)} l`);
    } else if (C === 'H') {
      x = ox + next();
      out.push(`${pt(x, y)} l`);
    } else if (C === 'V') {
      y = oy + next();
      out.push(`${pt(x, y)} l`);
    } else if (C === 'C') {
      const v = [next(), next(), next(), next(), next(), next()] as const;
      cubic(ox + v[0], oy + v[1], ox + v[2], oy + v[3], ox + v[4], oy + v[5]);
    } else if (C === 'S') {
      const v = [next(), next(), next(), next()] as const;
      const smooth = /[cs]/i.test(prev);
      cubic(smooth ? 2 * x - cx : x, smooth ? 2 * y - cy : y, ox + v[0], oy + v[1], ox + v[2], oy + v[3]);
    } else if (C === 'Q' || C === 'T') {
      const smooth = C === 'T' && /[qt]/i.test(prev);
      const qx = C === 'Q' ? ox + next() : smooth ? 2 * x - cx : x;
      const qy = C === 'Q' ? oy + next() : smooth ? 2 * y - cy : y;
      const ex = ox + next();
      const ey = oy + next();
      const x0 = x;
      const y0 = y;
      cubic(x0 + (2 / 3) * (qx - x0), y0 + (2 / 3) * (qy - y0), ex + (2 / 3) * (qx - ex), ey + (2 / 3) * (qy - ey), ex, ey);
      cx = qx;
      cy = qy;
    } else if (C === 'A') {
      const [rxIn, ryIn, rot, large, sweep] = [next(), next(), next(), next(), next()];
      const ex = ox + next();
      const ey = oy + next();
      arc(x, y, Math.abs(rxIn), Math.abs(ryIn), rot, large !== 0, sweep !== 0, ex, ey, cubic);
      x = ex;
      y = ey;
    } else break;
    prev = C;
  }
  return out.join(' ');
}

/** SVG arc (F.6.5 endpoint to center) as cubic Béziers of at most 90 degrees. */
function arc(x1: number, y1: number, rx: number, ry: number, rotDeg: number, large: boolean, sweep: boolean, x2: number, y2: number, cubic: (a: number, b: number, c: number, d: number, e: number, f: number) => void): void {
  if (!rx || !ry || (x1 === x2 && y1 === y2)) {
    cubic(x1, y1, x2, y2, x2, y2);
    return;
  }
  const phi = (rotDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const xp = cos * dx + sin * dy;
  const yp = -sin * dx + cos * dy;
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / (rx * rx * yp * yp + ry * ry * xp * xp)));
  const cxp = (k * rx * yp) / ry;
  const cyp = (-k * ry * xp) / rx;
  const ccx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const ccy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number): number => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
  let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const segs = Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9);
  const step = dt / segs;
  const alpha = (4 / 3) * Math.tan(step / 4);
  const at = (t: number): [number, number, number, number] => {
    const ct = Math.cos(t);
    const st = Math.sin(t);
    return [ccx + rx * ct * cos - ry * st * sin, ccy + rx * ct * sin + ry * st * cos, -rx * st * cos - ry * ct * sin, -rx * st * sin + ry * ct * cos];
  };
  for (let s = 0; s < segs; s++) {
    const a = at(t1 + s * step);
    const b = at(t1 + (s + 1) * step);
    cubic(a[0] + alpha * a[2], a[1] + alpha * a[3], b[0] - alpha * b[2], b[1] - alpha * b[3], b[0], b[1]);
  }
}

/** Path data of a basic shape element; null when it is not a shape. */
function shapeData(el: El, vw: number, vh: number): string | null {
  const a = el.attrs;
  const len = (v: string | undefined, of: number): number => (v === undefined ? 0 : v.endsWith('%') ? (Number.parseFloat(v) / 100) * of : Number.parseFloat(v) || 0);
  switch (el.tag) {
    case 'path':
      return a['d'] ?? null;
    case 'rect': {
      const x = len(a['x'], vw);
      const y = len(a['y'], vh);
      const w = len(a['width'], vw);
      const h = len(a['height'], vh);
      if (w <= 0 || h <= 0) return null;
      const rx = Math.min(w / 2, len(a['rx'] ?? a['ry'], vw));
      const ry = Math.min(h / 2, len(a['ry'] ?? a['rx'], vh));
      if (!rx || !ry) return `M${x},${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx},${y}H${x + w - rx}A${rx},${ry} 0 0 1 ${x + w},${y + ry}V${y + h - ry}A${rx},${ry} 0 0 1 ${x + w - rx},${y + h}H${x + rx}A${rx},${ry} 0 0 1 ${x},${y + h - ry}V${y + ry}A${rx},${ry} 0 0 1 ${x + rx},${y}Z`;
    }
    case 'circle':
    case 'ellipse': {
      const cx = len(a['cx'], vw);
      const cy = len(a['cy'], vh);
      const rx = len(a['r'] ?? a['rx'], vw);
      const ry = len(a['r'] ?? a['ry'], vh);
      if (rx <= 0 || ry <= 0) return null;
      return `M${cx - rx},${cy}A${rx},${ry} 0 1 0 ${cx + rx},${cy}A${rx},${ry} 0 1 0 ${cx - rx},${cy}Z`;
    }
    case 'line':
      return `M${len(a['x1'], vw)},${len(a['y1'], vh)}L${len(a['x2'], vw)},${len(a['y2'], vh)}`;
    case 'polyline':
    case 'polygon': {
      const p = nums(a['points']);
      if (p.length < 4) return null;
      let d = `M${p[0]},${p[1]}`;
      for (let k = 2; k + 1 < p.length; k += 2) d += `L${p[k]},${p[k + 1]}`;
      return el.tag === 'polygon' ? `${d}Z` : d;
    }
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

interface Style {
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly fillOpacity: number;
  readonly strokeOpacity: number;
  readonly opacity: number;
  readonly fontSize: number;
  readonly bold: boolean;
  readonly anchor: string;
  readonly baseline: string;
  readonly dash: string;
  readonly cap: string;
  readonly join: string;
  readonly color: string;
  readonly fillRule: string;
}

const INHERITED: Style = { fill: '#000', stroke: 'none', strokeWidth: 1, fillOpacity: 1, strokeOpacity: 1, opacity: 1, fontSize: 16, bold: false, anchor: 'start', baseline: 'auto', dash: 'none', cap: 'butt', join: 'miter', color: '#000', fillRule: 'nonzero' };
const SKIP = new Set(['defs', 'clipPath', 'mask', 'pattern', 'linearGradient', 'radialGradient', 'title', 'desc', 'style', 'metadata', 'foreignObject', 'symbol', 'marker', 'script']);

const size = (v: string, base: number): number => {
  const n = Number.parseFloat(v);
  if (!Number.isFinite(n)) return base;
  return v.endsWith('rem') ? n * 16 : v.endsWith('em') ? n * base : v.endsWith('%') ? (n / 100) * base : v.endsWith('pt') ? n / 0.75 : n;
};

function styleOf(el: El, parent: Style): { style: Style; hidden: boolean } {
  const decl: Record<string, string> = { ...el.attrs };
  for (const part of (el.attrs['style'] ?? '').split(';')) {
    const at = part.indexOf(':');
    if (at > 0) decl[part.slice(0, at).trim().toLowerCase()] = part.slice(at + 1).trim();
  }
  const g = (k: string): string | undefined => {
    const v = decl[k];
    return v === undefined || v === 'inherit' ? undefined : v.replace(/\s*!important$/, '');
  };
  const color = g('color') ?? parent.color;
  const paint = (v: string | undefined, inherited: string): string => (v === undefined ? inherited : v.toLowerCase() === 'currentcolor' ? color : v);
  const weight = g('font-weight');
  const st: Style = {
    fill: paint(g('fill'), parent.fill),
    stroke: paint(g('stroke'), parent.stroke),
    strokeWidth: g('stroke-width') !== undefined ? size(g('stroke-width') as string, 1) : parent.strokeWidth,
    fillOpacity: g('fill-opacity') !== undefined ? Number(g('fill-opacity')) : parent.fillOpacity,
    strokeOpacity: g('stroke-opacity') !== undefined ? Number(g('stroke-opacity')) : parent.strokeOpacity,
    opacity: parent.opacity * (g('opacity') !== undefined ? Number(g('opacity')) : 1),
    fontSize: g('font-size') !== undefined ? size(g('font-size') as string, parent.fontSize) : parent.fontSize,
    bold: weight !== undefined ? weight === 'bold' || weight === 'bolder' || Number(weight) >= 600 : parent.bold,
    anchor: g('text-anchor') ?? parent.anchor,
    baseline: g('dominant-baseline') ?? parent.baseline,
    dash: g('stroke-dasharray') ?? parent.dash,
    cap: g('stroke-linecap') ?? parent.cap,
    join: g('stroke-linejoin') ?? parent.join,
    color,
    fillRule: g('fill-rule') ?? parent.fillRule,
  };
  return { style: st, hidden: g('display') === 'none' || g('visibility') === 'hidden' || g('visibility') === 'collapse' };
}

interface Canvas {
  readonly ops: string[];
  readonly ids: ReadonlyMap<string, El>;
  readonly regular: Face;
  readonly bold: Face;
  readonly fakeBold: boolean;
  readonly states: Map<string, string>;
}

function paintOf(value: string, ids: ReadonlyMap<string, El>): Rgba | null {
  const url = /^url\(\s*['"]?#([^'")]+)['"]?\s*\)/.exec(value.trim());
  if (url) {
    // Gradients paint with their first stop (a vector approximation).
    const stop = ids.get(url[1] as string)?.children.find((c): c is El => typeof c !== 'string' && c.tag === 'stop');
    if (!stop) return null;
    const decl: Record<string, string> = { ...stop.attrs };
    for (const part of (stop.attrs['style'] ?? '').split(';')) {
      const at = part.indexOf(':');
      if (at > 0) decl[part.slice(0, at).trim()] = part.slice(at + 1).trim();
    }
    const c = parseColor(decl['stop-color'] ?? '#000');
    return c ? [c[0], c[1], c[2], c[3] * (decl['stop-opacity'] !== undefined ? Number(decl['stop-opacity']) : 1)] : null;
  }
  return parseColor(value);
}

const rgbOp = (c: Rgba, op: 'rg' | 'RG'): string => `${n2r(c[0])} ${n2r(c[1])} ${n2r(c[2])} ${op}`;
const n2r = (v: number): string => (Math.round(v * 1000) / 1000).toString();
const scaleOf = (m: Mat): number => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

/** The graphics state name for a fill / stroke alpha pair (`/GSn gs`). */
function alphaOp(cv: Canvas, fa: number, sa: number): string {
  if (fa >= 0.999 && sa >= 0.999) return '';
  const key = `${n2r(fa)} ${n2r(sa)}`;
  let name = cv.states.get(key);
  if (!name) {
    name = `GS${cv.states.size}`;
    cv.states.set(key, name);
  }
  return `/${name} gs `;
}

function draw(el: El, m: Mat, parent: Style, cv: Canvas, vw: number, vh: number): void {
  if (SKIP.has(el.tag)) return;
  const { style, hidden } = styleOf(el, parent);
  if (hidden) return;
  let ctm = mul(m, parseTransform(el.attrs['transform']));
  let w = vw;
  let h = vh;
  if (el.tag === 'svg') {
    // Nested viewport (combined exports place each drawing at x / y).
    const x = Number.parseFloat(el.attrs['x'] ?? '0') || 0;
    const y = Number.parseFloat(el.attrs['y'] ?? '0') || 0;
    ctm = mul(ctm, [1, 0, 0, 1, x, y]);
    const box = nums(el.attrs['viewBox']);
    w = Number.parseFloat(el.attrs['width'] ?? '') || box[2] || vw;
    h = Number.parseFloat(el.attrs['height'] ?? '') || box[3] || vh;
    if (box.length === 4 && box[2] && box[3]) ctm = mul(ctm, [w / (box[2] as number), 0, 0, h / (box[3] as number), -(box[0] as number) * (w / (box[2] as number)), -(box[1] as number) * (h / (box[3] as number))]);
    if (box.length === 4 && box[2] && box[3]) {
      w = box[2] as number;
      h = box[3] as number;
    }
  }
  const clip = /^url\(\s*['"]?#([^'")]+)['"]?\s*\)/.exec(el.attrs['clip-path'] ?? '');
  const clipEl = clip ? cv.ids.get(clip[1] as string) : undefined;
  let saved = false;
  if (clipEl) {
    const parts = clipEl.children.filter((c): c is El => typeof c !== 'string').map((c) => {
      const d = shapeData(c, w, h);
      return d ? pathOps(d, mul(ctm, parseTransform(c.attrs['transform']))) : '';
    });
    if (parts.some(Boolean)) {
      cv.ops.push(`q ${parts.join(' ')} W n`);
      saved = true;
    }
  }
  if (el.tag === 'text') drawText(el, ctm, style, cv);
  else {
    const d = shapeData(el, w, h);
    if (d) drawShape(d, ctm, style, cv, el.tag === 'line' || el.tag === 'polyline');
    else for (const c of el.children) if (typeof c !== 'string') draw(c, ctm, style, cv, w, h);
  }
  if (saved) cv.ops.push('Q');
}

function drawShape(d: string, m: Mat, st: Style, cv: Canvas, open: boolean): void {
  const fill = open ? null : paintOf(st.fill, cv.ids);
  const stroke = st.stroke === 'none' || st.strokeWidth <= 0 ? null : paintOf(st.stroke, cv.ids);
  const fa = fill ? fill[3] * st.fillOpacity * st.opacity : 0;
  const sa = stroke ? stroke[3] * st.strokeOpacity * st.opacity : 0;
  if (fa <= 0.001 && sa <= 0.001) return;
  const ops = pathOps(d, m);
  if (!ops) return;
  const k = scaleOf(m);
  const dash = st.dash === 'none' ? [] : nums(st.dash).map((v) => n2(v * k));
  const parts = [`q ${alphaOp(cv, fa > 0.001 ? fa : 1, sa > 0.001 ? sa : 1)}`];
  if (fa > 0.001 && fill) parts.push(`${rgbOp(fill, 'rg')} `);
  if (sa > 0.001 && stroke) parts.push(`${rgbOp(stroke, 'RG')} ${n2(st.strokeWidth * k)} w [${dash.join(' ')}] 0 d ${st.cap === 'round' ? 1 : st.cap === 'square' ? 2 : 0} J ${st.join === 'round' ? 1 : st.join === 'bevel' ? 2 : 0} j `);
  const even = st.fillRule === 'evenodd' ? '*' : '';
  const paint = fa > 0.001 && sa > 0.001 ? `B${even}` : fa > 0.001 ? `f${even}` : 'S';
  cv.ops.push(`${parts.join('')}${ops} ${paint} Q`);
}

function drawText(el: El, m: Mat, base: Style, cv: Canvas): void {
  const pos = { x: nums(el.attrs['x'])[0] ?? 0, y: nums(el.attrs['y'])[0] ?? 0 };
  const run = (node: El, st: Style): void => {
    for (const c of node.children) {
      if (typeof c === 'string') {
        const text = c.replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const fill = paintOf(st.fill, cv.ids);
        const alpha = fill ? fill[3] * st.fillOpacity * st.opacity : 0;
        if (!fill || alpha <= 0.001) continue;
        const face = st.bold ? cv.bold : cv.regular;
        const shown = face.fit(text, 1e6, st.fontSize);
        if (!shown) continue;
        const dx = st.anchor === 'middle' ? -shown.w / 2 : st.anchor === 'end' ? -shown.w : 0;
        const dy = st.baseline === 'middle' || st.baseline === 'central' ? st.fontSize * 0.35 : st.baseline === 'hanging' || st.baseline === 'text-before-edge' ? st.fontSize * 0.8 : 0;
        const tm = mul(m, [1, 0, 0, -1, pos.x + dx, pos.y + dy]);
        const font = st.bold && !cv.fakeBold ? 'F2' : 'F1';
        const fake = st.bold && cv.fakeBold ? `${rgbOp(fill, 'RG')} 2 Tr ${n2(st.fontSize * 0.025)} w ` : '';
        cv.ops.push(`q ${alphaOp(cv, alpha, alpha)}BT /${font} ${n2(st.fontSize)} Tf ${rgbOp(fill, 'rg')} ${fake}${tm.map((v) => n2r(v)).join(' ')} Tm ${shown.s} Tj ET Q`);
        pos.x += shown.w;
      } else if (c.tag === 'tspan') {
        const { style, hidden } = styleOf(c, st);
        if (hidden) continue;
        const xs = nums(c.attrs['x']);
        const ys = nums(c.attrs['y']);
        if (xs.length) pos.x = xs[0] as number;
        if (ys.length) pos.y = ys[0] as number;
        pos.x += size(c.attrs['dx'] ?? '0', style.fontSize);
        pos.y += size(c.attrs['dy'] ?? '0', style.fontSize);
        run(c, style);
      }
    }
  };
  pos.x += size(el.attrs['dx'] ?? '0', base.fontSize);
  pos.y += size(el.attrs['dy'] ?? '0', base.fontSize);
  run(el, base);
}

function collectIds(el: El, out: Map<string, El>): void {
  if (el.attrs['id']) out.set(el.attrs['id'], el);
  for (const c of el.children) if (typeof c !== 'string') collectIds(c, out);
}

/** Drawing size in px: `width` / `height`, else the `viewBox`. */
function drawingSize(svg: El): [number, number] {
  const box = nums(svg.attrs['viewBox']);
  const w = Number.parseFloat(svg.attrs['width'] ?? '') || box[2] || 300;
  const h = Number.parseFloat(svg.attrs['height'] ?? '') || box[3] || 150;
  return [w, h];
}

type Pt = readonly [number, number];

/** Writes SVG drawings as a vector PDF, one page per drawing, each scaled to fit the page. */
export async function writeGraphicsPdf(pages: string | GraphicsPdfPage | readonly (string | GraphicsPdfPage)[], options: GraphicsPdfOptions = {}): Promise<GraphicsPdfFile> {
  const list = (Array.isArray(pages) ? pages : [pages]) as readonly (string | GraphicsPdfPage)[];
  const drawings = list.map((p) => parseSvgXml(typeof p === 'string' ? p : p.svg));
  if (!drawings.length || drawings.some((d) => !d)) throw new Error('writeGraphicsPdf: every page needs SVG markup with an <svg> root.');
  const slicer = createSlicer(25, defaultYield);
  const ps = options.pageSize;
  const base: Pt = Array.isArray(ps) ? (ps as Pt) : typeof ps === 'object' ? [(ps as { width: number }).width, (ps as { height: number }).height] : (PAGE_SIZES[((ps as string | undefined) ?? 'a4').toLowerCase() as PdfPageSize] ?? PAGE_SIZES.a4);
  const margin = options.margin ?? 36;
  const lineH = 15.2;
  const headerText = options.header ?? '';
  const footerText = options.footer ?? '';

  let regular: Face = helvetica(false);
  let bold: Face = helvetica(true);
  let embedded: { regular: EmbeddedFace; bold: EmbeddedFace | null } | null = null;
  if (options.font) {
    const { createEmbeddedFace } = await import('./pdf-fonts.js');
    const spec = options.font as PdfFont;
    const font: PdfFont = spec.regular ? spec : { regular: options.font as PdfFontData };
    const r = createEmbeddedFace(font.regular, false, helpers);
    const b = font.bold ? createEmbeddedFace(font.bold, false, helpers) : null;
    embedded = { regular: r, bold: b };
    regular = r;
    bold = b ?? r;
  }

  const objects: Uint8Array[] = [];
  const addObject = (id: number, body: string): void => {
    objects[id] = latin1(`${id} 0 obj\n${body}\nendobj\n`);
  };
  const streamObject = async (id: number, content: string | Uint8Array, dict = ''): Promise<void> => {
    const raw = typeof content === 'string' ? latin1(content) : content;
    const packed = options.compress === false ? null : await deflate(raw, 'deflate');
    const data = packed ?? raw;
    objects[id] = concat([latin1(`${id} 0 obj\n<< /Length ${data.length}${packed ? ' /Filter /FlateDecode' : ''}${dict ? ` ${dict}` : ''} >>\nstream\n`), data, latin1('\nendstream\nendobj\n')]);
  };
  const count = drawings.length;
  const idOf = (page: number): number => 4 + 2 * page;
  const pageText = (value: string, page: number): string => value.replace(/\{page\}/g, String(page)).replace(/\{pages\}/g, String(count));

  for (let p = 0; p < count; p++) {
    const svg = drawings[p] as El;
    const [w, h] = drawingSize(svg);
    const landscape = options.orientation ? options.orientation === 'landscape' : w > h;
    const pageW = landscape ? Math.max(base[0], base[1]) : Math.min(base[0], base[1]);
    const pageH = landscape ? Math.min(base[0], base[1]) : Math.max(base[0], base[1]);
    const top = pageH - margin - (headerText ? lineH : 0);
    const bottom = margin + (footerText ? lineH : 0);
    const s = Math.min((pageW - 2 * margin) / w, Math.max(1, top - bottom) / h);
    const ox = (pageW - w * s) / 2;
    // SVG px (y down) to PDF points (y up), top-aligned and centered.
    const page: Mat = [s, 0, 0, -s, ox, top];
    const ids = new Map<string, El>();
    collectIds(svg, ids);
    const cv: Canvas = { ops: [], ids, regular, bold, fakeBold: embedded !== null && embedded.bold === null, states: new Map() };
    draw(svg, page, INHERITED, cv, w, h);
    const label = (value: string, y: number, end: boolean): void => {
      const shown = regular.fit(pageText(value, p + 1), pageW - 2 * margin, 8);
      if (shown) cv.ops.push(`BT /F1 8 Tf 0 0 0 rg ${n2(end ? pageW - margin - shown.w : margin)} ${n2(y)} Td ${shown.s} Tj ET`);
    };
    if (headerText) label(headerText, pageH - margin - 10, false);
    if (footerText) label(footerText, margin + 2, true);
    await streamObject(idOf(p + 1) + 1, cv.ops.join('\n'));
    const states = [...cv.states].map(([key, name]) => {
      const [fa, sa] = key.split(' ');
      return `/${name} << /ca ${fa} /CA ${sa} >>`;
    });
    addObject(idOf(p + 1), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(pageW)} ${n2(pageH)}] /Resources << /Font << /F1 3 0 R /F2 ${embedded && !embedded.bold ? 3 : 4} 0 R >>${states.length ? ` /ExtGState << ${states.join(' ')} >>` : ''} >> /Contents ${idOf(p + 1) + 1} 0 R >>`);
    if (slicer.due()) await slicer.pause();
  }

  addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  addObject(2, `<< /Type /Pages /Kids [${Array.from({ length: count }, (_, i) => `${idOf(i + 1)} 0 R`).join(' ')}] /Count ${count} >>`);
  if (embedded) {
    let next = idOf(count + 1);
    let reserved4 = embedded.bold === null;
    const alloc = (): number => {
      if (reserved4) {
        reserved4 = false;
        return 4;
      }
      return next++;
    };
    await embedded.regular.write(3, alloc, addObject, streamObject);
    if (embedded.bold) await embedded.bold.write(4, alloc, addObject, streamObject);
  } else {
    addObject(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    addObject(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  }
  addObject(5, `<< /Producer (Salmon UI)${options.title ? ` /Title ${textString(options.title)}` : ''} >>`);

  const out: Uint8Array[] = [latin1('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')];
  let at = (out[0] as Uint8Array).length;
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    const o = objects[id] as Uint8Array;
    xref += `${String(at).padStart(10, '0')} 00000 n \n`;
    out.push(o);
    at += o.length;
  }
  xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${at}\n%%EOF\n`;
  out.push(latin1(xref));
  const name = options.fileName ?? 'Chart.pdf';
  return { fileName: /\.pdf$/i.test(name) ? name : `${name}.pdf`, mimeType: 'application/pdf', data: concat(out) };
}
