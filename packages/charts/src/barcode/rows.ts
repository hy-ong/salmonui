// Drawing model of a stacked symbol: rows of bar modules
// with per-row heights (PDF417 rows, GS1 DataBar stacked rows and
// separators). Shared by `Pdf417` and `Gs1DataBar`; no React, no DOM.

import { barsPath } from './encode/svg.js';
import { FONT_SIZE, type Drawing } from './render.js';

export interface RowsSymbol {
  readonly kind: 'rows';
  /** One module string per row (`'1'` bar, `'0'` space), quiet zones excluded. */
  readonly rows: readonly string[];
  /** Height of each row in modules (X). */
  readonly rowHeights: readonly number[];
  /** Quiet zone on every side, in modules. */
  readonly quietZone: number;
  /** Human-readable text. */
  readonly text: string;
  /** Show `text` by default (GS1 DataBar); PDF417 hides it unless asked. */
  readonly showText?: boolean | undefined;
  /** PDF417: data columns and error correction level chosen. */
  readonly columns?: number | undefined;
  readonly level?: number | undefined;
}

export interface RowsLayoutOptions {
  readonly moduleSize?: number | undefined;
  readonly width?: number | undefined;
  /** Total height in px: scales the rows vertically. */
  readonly height?: number | undefined;
  readonly quietZone?: boolean | undefined;
  readonly text: string | null;
}

const r2 = (v: number): number => Math.round(v * 100) / 100;

export function layoutRows(s: RowsSymbol, o: RowsLayoutOptions): Drawing {
  const q = o.quietZone === false ? 0 : s.quietZone;
  const cols = Math.max(...s.rows.map((r) => r.length));
  const wide = cols + q * 2;
  const m = o.width ? o.width / wide : (o.moduleSize ?? 2);
  const textH = o.text === null ? 0 : FONT_SIZE + 4;
  const units = s.rowHeights.reduce((a, b) => a + b, 0) + q * 2;
  const v = o.height ? Math.max(0.01, (o.height - textH) / units) : m;
  let y = q * v;
  let d = '';
  s.rows.forEach((row, i) => {
    const h = s.rowHeights[i]! * v;
    d += barsPath(row, q * m, y, m, h);
    y += h;
  });
  const symbolH = units * v;
  return {
    width: r2(wide * m),
    height: r2(symbolH + textH),
    d,
    bearer: '',
    texts: o.text === null ? [] : [{ x: r2((wide * m) / 2), y: r2(symbolH + FONT_SIZE), anchor: 'middle', text: o.text }],
  };
}
