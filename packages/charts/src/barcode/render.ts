// Pure drawing model of a barcode or QR symbol: the
// same model renders the React SVG and `api.toSVGString()` (which works on
// the server), so both are byte-identical. No React, no DOM.

import { barsPath, matrixPath } from './encode/svg.js';
import type { LinearSymbol } from './encode/linear.js';

export interface MatrixLike {
  readonly width: number;
  readonly height: number;
  readonly modules: Uint8Array;
  readonly quietZone: number;
}

export interface DrawText {
  readonly x: number;
  readonly y: number;
  readonly anchor: 'start' | 'middle' | 'end';
  readonly text: string;
}

export interface Drawing {
  readonly width: number;
  readonly height: number;
  /** Dark modules path. */
  readonly d: string;
  /** Bearer bars path (ITF-14). */
  readonly bearer: string;
  readonly texts: readonly DrawText[];
  /** Cleared logo box (QR), in px. */
  readonly logo?: { readonly x: number; readonly y: number; readonly size: number } | undefined;
}

export type BearerBar = 'frame' | 'horizontal' | 'none';
export type TextPosition = 'top' | 'bottom';
export type TextAlign = 'start' | 'center' | 'end';

export interface LinearLayoutOptions {
  readonly moduleSize?: number | undefined;
  readonly width?: number | undefined;
  readonly height?: number | undefined;
  readonly quietZone?: boolean | undefined;
  /** Text to draw (`null` hides it). */
  readonly text: string | null;
  /** Use the symbol's guard text segments (EAN / UPC) when the text is the encoded value. */
  readonly segmented: boolean;
  readonly textPosition: TextPosition;
  readonly textAlign: TextAlign;
  readonly bearerBar: BearerBar;
}

export const FONT_SIZE = 14;
const TEXT_GAP = 4;
const r2 = (v: number): number => Math.round(v * 100) / 100;

export function layoutLinear(symbol: LinearSymbol, o: LinearLayoutOptions): Drawing {
  const quiet = o.quietZone === false ? 0 : symbol.quietZone;
  const modulesWide = symbol.modules.length + quiet * 2;
  const bearerModules = o.bearerBar === 'none' ? 0 : 4;
  const extra = o.bearerBar === 'frame' ? bearerModules * 2 : 0;
  const m = o.width ? o.width / (modulesWide + extra) : (o.moduleSize ?? 2);
  const textH = o.text === null ? 0 : FONT_SIZE + TEXT_GAP;
  const bearer = bearerModules * m;
  const total = o.height ?? Math.max(40, Math.round(m * 30)) + textH + bearer * 2;
  const barTop = (o.text !== null && o.textPosition === 'top' ? textH : 0) + bearer;
  const barH = Math.max(1, total - textH - bearer * 2);
  const x0 = (o.bearerBar === 'frame' ? bearer : 0) + quiet * m;
  const guards = o.segmented && o.text !== null && o.textPosition === 'bottom' ? symbol.guards : undefined;
  const guardExtra = guards ? (FONT_SIZE + TEXT_GAP) / 2 : 0;
  const height = (start: number) => (guards && guards.some(([a, b]) => start >= a && start < b) ? barH + guardExtra : barH);
  const d = barsPath(symbol.modules, x0, barTop, m, (start) => height(start));
  const width = r2((modulesWide + extra) * m);
  const texts: DrawText[] = [];
  if (o.text !== null) {
    const baseline = o.textPosition === 'top' ? FONT_SIZE : barTop + barH + bearer + TEXT_GAP + FONT_SIZE - 2;
    if (o.segmented && symbol.textSegments && o.textPosition === 'bottom') {
      for (const [text, a, b] of symbol.textSegments) texts.push({ x: r2(x0 + ((a + b) / 2) * m), y: r2(baseline), anchor: 'middle', text });
    } else {
      const start = x0;
      const end = x0 + symbol.modules.length * m;
      const x = o.textAlign === 'start' ? start : o.textAlign === 'end' ? end : (start + end) / 2;
      texts.push({ x: r2(x), y: r2(baseline), anchor: o.textAlign === 'start' ? 'start' : o.textAlign === 'end' ? 'end' : 'middle', text: o.text });
    }
  }
  let bearerD = '';
  if (o.bearerBar !== 'none') {
    const bw = width;
    const top = barTop - bearer;
    const bottom = barTop + barH;
    bearerD = `M0 ${r2(top)}h${bw}v${r2(bearer)}h${-bw}z M0 ${r2(bottom)}h${bw}v${r2(bearer)}h${-bw}z`;
    if (o.bearerBar === 'frame') bearerD += ` M0 ${r2(top)}h${r2(bearer)}v${r2(barH + bearer * 2)}h${r2(-bearer)}z M${r2(bw - bearer)} ${r2(top)}h${r2(bearer)}v${r2(barH + bearer * 2)}h${r2(-bearer)}z`;
  }
  return { width, height: r2(total), d, bearer: bearerD, texts };
}

export interface MatrixLayoutOptions {
  readonly moduleSize?: number | undefined;
  readonly width?: number | undefined;
  readonly quietZone?: boolean | undefined;
  /** Logo box as a fraction of the symbol width (QR), 0 for none. */
  readonly logoFraction?: number | undefined;
  readonly text: string | null;
}

export function layoutMatrix(symbol: MatrixLike, o: MatrixLayoutOptions): Drawing {
  const q = o.quietZone === false ? 0 : symbol.quietZone;
  const wide = symbol.width + q * 2;
  const m = o.width ? o.width / wide : (o.moduleSize ?? 4);
  let skip: ((x: number, y: number) => boolean) | undefined;
  let logo: Drawing['logo'];
  if (o.logoFraction) {
    // An odd module count centered on the symbol, at most the given fraction of its width.
    let n = Math.floor(symbol.width * o.logoFraction);
    if (n % 2 !== symbol.width % 2) n--;
    const a = (symbol.width - n) / 2;
    skip = (x, y) => x >= a && x < a + n && y >= a && y < a + n;
    logo = { x: r2((q + a) * m), y: r2((q + a) * m), size: r2(n * m) };
  }
  const d = matrixPath(symbol.modules, symbol.width, symbol.height, q * m, q * m, m, skip);
  const symbolH = (symbol.height + q * 2) * m;
  const texts: DrawText[] = o.text === null ? [] : [{ x: r2((wide * m) / 2), y: r2(symbolH + FONT_SIZE), anchor: 'middle', text: o.text }];
  return { width: r2(wide * m), height: r2(symbolH + (o.text === null ? 0 : FONT_SIZE + TEXT_GAP)), d, bearer: '', texts, logo };
}

const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Standalone SVG markup of a drawing (`api.toSVGString()` without a DOM). */
export function drawingToSvg(dr: Drawing, label: string, color: string, background: string): string {
  const texts = dr.texts.map((t) => `<text x="${t.x}" y="${t.y}" text-anchor="${t.anchor}" font-family="system-ui, sans-serif" font-size="${FONT_SIZE}" fill="${esc(color)}">${esc(t.text)}</text>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dr.width}" height="${dr.height}" viewBox="0 0 ${dr.width} ${dr.height}" role="img" aria-label="${esc(label)}"><rect width="${dr.width}" height="${dr.height}" fill="${esc(background)}"/><path d="${dr.d}" fill="${esc(color)}" shape-rendering="crispEdges"/>${dr.bearer ? `<path d="${dr.bearer}" fill="${esc(color)}" shape-rendering="crispEdges"/>` : ''}${texts}</svg>`;
}

/** WCAG relative-luminance contrast of two `#rgb` / `#rrggbb` colors, or undefined for other syntaxes. */
export function hexContrast(a: string, b: string): number | undefined {
  const lum = (hex: string): number | undefined => {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return undefined;
    const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join('') : m[1]!;
    const ch = [0, 2, 4].map((i) => {
      const v = parseInt(h.slice(i, i + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
  };
  const la = lum(a);
  const lb = lum(b);
  if (la === undefined || lb === undefined) return undefined;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
