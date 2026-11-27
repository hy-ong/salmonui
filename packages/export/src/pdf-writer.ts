// PDF writer: a hand-written PDF 1.4 file with the
// standard Helvetica fonts (WinAnsiEncoding), one table laid out per page
// with repeated header rows, group captions, aggregate rows, detail text,
// a page header/footer with `{page}` / `{pages}` placeholders, and content
// streams deflated with the platform `CompressionStream` when available.
// Columns are scaled to the page width unless `columnOverflow: 'paginate'`
// splits them across page sets. Without `font`, characters outside WinAnsi
// print as `?`; with `font` every text is drawn with an embedded,
// subsetted TrueType font (`pdf-fonts.ts`, loaded on demand), which covers
// CJK, Cyrillic, Greek, Hebrew, and Arabic (joined, right to left).
// Image cells are drawn as image XObjects (`pdf-images.ts`, loaded
// on the first image cell), one per distinct image, scaled to fit the cell;
// the row grows to the image height, up to a page body. `appendImages`
// adds one page per image after the table (a chart beside a pivot: table
// and chart in one PDF), scaled to fit the page body.
// Cell spans: `colSpan` / `rowSpan` of the `cell` hook and
// `mergeRepeatedValues` merge cells within a page; a row span stops at a
// non-data line and continues on the next page with the anchor cell drawn
// again, and repeated values restart on every page.

import type { ExportAggregateCells, ExportCell, ExportCellStyle, ExportColumn, ExportDataRow, ExportDetailRow, ExportImage, ExportModel, ExportRow, ExportSource } from '@salmonui/core/export-model';
import { concat, createSlicer, defaultYield, deflate, latin1 } from './bytes.js';
import { hexColor, mergeStyle, stylesOf, type ExportWriterOptions } from './shared.js';
import type { EmbeddedFace, PdfFont, PdfFontData, ShownText } from './pdf-fonts.js';
import { ImageStore, imageType } from './image.js';
import type { PdfImage } from './pdf-images.js';

export type { PdfFont, PdfFontData } from './pdf-fonts.js';

export const PDF_MIME = 'application/pdf';

/**
 * @internal Shared helpers handed to the lazy `pdf-fonts` and `pdf-images`
 * chunks, which import nothing at run time: the helper modules then stay in
 * the writer chunk (each extra chunk compresses on its own).
 */
export const helpers = { concat, deflate, latin1, imageType };
/** @internal */
export type PdfHelpers = typeof helpers;

export type PdfPageSize = 'a0' | 'a1' | 'a2' | 'a3' | 'a4' | 'a5' | 'b4' | 'b5' | 'letter' | 'legal' | 'ledger' | 'tabloid' | 'half-letter' | 'note';

/** PDF writer options. */
export interface PdfOptions extends ExportWriterOptions {
  /** Default `a4`, or `[width, height]` in points. */
  readonly pageSize?: PdfPageSize | readonly [number, number];
  /** Default `portrait`. */
  readonly orientation?: 'portrait' | 'landscape';
  /** Page margin in points. Default 36. */
  readonly margin?: number;
  /** Body font size in points. Default 8. */
  readonly fontSize?: number;
  /** `fit` (default) scales columns to the page width; `paginate` continues them on extra page sets. */
  readonly columnOverflow?: 'fit' | 'paginate';
  /** Page header text; `{page}` and `{pages}` are replaced. */
  readonly header?: string;
  /** Page footer text; default `{page} / {pages}`. Empty string for none. */
  readonly footer?: string;
  /** Header rows. Default true. */
  readonly includeHeaders?: boolean;
  /** Document title (`/Title`). */
  readonly title?: string;
  /** Deflate content streams (when the platform has `CompressionStream`). Default true. */
  readonly compress?: boolean;
  /**
   * TrueType font bytes (`.ttf`, or the first font of a `.ttc`) to embed for
   * all text, required for characters outside WinAnsi (CJK, Cyrillic, Greek,
   * Hebrew, Arabic). Only the used glyphs are embedded. `bold` defaults to a
   * synthetic bold of `regular`. No font is bundled.
   */
  readonly font?: PdfFont | PdfFontData;
  /** Merge repeated values in consecutive data rows, as XLSX. Default false. */
  readonly mergeRepeatedValues?: boolean;
  /**
   * Pages after the table, one PNG or JPEG image each (`width` / `height` in
   * CSS px), scaled down to fit the page body and centered: a chart image
   * beside the table in one PDF. An image that cannot be embedded
   * adds no page.
   */
  readonly appendImages?: readonly ExportImage[];
}

/** @internal */
export const PAGE_SIZES: Readonly<Record<PdfPageSize, readonly [number, number]>> = {
  a0: [2383.94, 3370.39],
  a1: [1683.78, 2383.94],
  a2: [1190.55, 1683.78],
  a3: [841.89, 1190.55],
  a4: [595.28, 841.89],
  a5: [419.53, 595.28],
  b4: [708.66, 1000.63],
  b5: [498.9, 708.66],
  letter: [612, 792],
  legal: [612, 1008],
  ledger: [1224, 792],
  tabloid: [792, 1224],
  'half-letter': [396, 612],
  note: [540, 720],
};

// Helvetica advance widths (1/1000 em) for WinAnsi 32..126; other codes use 556.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const WIN_ANSI: Readonly<Record<number, number>> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b,
  0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99,
  0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

/** WinAnsi codes of a string (unsupported characters become `?`). */
export function winAnsi(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const c = ch.codePointAt(0) as number;
    if (c === 9 || c === 10 || c === 13) out.push(32);
    else if ((c >= 32 && c <= 126) || (c >= 0xa0 && c <= 0xff)) out.push(c);
    else out.push(WIN_ANSI[c] ?? 63);
  }
  return out;
}

function widthOf(codes: readonly number[], size: number, bold: boolean): number {
  let w = 0;
  for (const c of codes) w += c >= 32 && c <= 126 ? (HELVETICA[c - 32] as number) : 556;
  return (w * size * (bold ? 1.06 : 1)) / 1000;
}

/** PDF literal string of WinAnsi codes, ASCII only (octal escapes). */
function literal(codes: readonly number[]): string {
  let s = '(';
  for (const c of codes) {
    if (c === 40 || c === 41 || c === 92) s += `\\${String.fromCharCode(c)}`;
    else if (c < 32 || c > 126) s += `\\${c.toString(8).padStart(3, '0')}`;
    else s += String.fromCharCode(c);
  }
  return `${s})`;
}

/** Text fitted into `width` (ellipsis when cut). */
function fit(text: string, width: number, size: number, bold: boolean): number[] {
  const codes = winAnsi(text);
  if (widthOf(codes, size, bold) <= width) return codes;
  const dots = [46, 46, 46];
  const room = width - widthOf(dots, size, bold);
  let w = 0;
  let i = 0;
  for (; i < codes.length; i++) {
    const cw = widthOf([codes[i] as number], size, bold);
    if (w + cw > room) break;
    w += cw;
  }
  return room > 0 ? [...codes.slice(0, i), ...dots] : [];
}

/** @internal Text drawing for one font: Helvetica (WinAnsi literal strings) or an embedded face. */
export interface Face {
  fit(text: string, width: number, size: number): ShownText | null;
}

/** @internal */
export const helvetica = (bold: boolean): Face => ({
  fit(text, width, size) {
    const codes = fit(text, width, size, bold);
    return codes.length ? { s: literal(codes), w: widthOf(codes, size, bold) } : null;
  },
});

/** PDF text string: a literal when WinAnsi holds it, else UTF-16BE hex. */
/** @internal */
export function textString(value: string): string {
  if (/^[\x20-\x7e]*$/.test(value)) return literal(winAnsi(value));
  let hex = '<FEFF';
  for (let i = 0; i < value.length; i++) hex += value.charCodeAt(i).toString(16).padStart(4, '0');
  return `${hex}>`;
}

/** @internal */
export function rgb(color: string | undefined): string | null {
  const h = hexColor(color);
  if (!h) return null;
  const n = Number.parseInt(h, 16);
  const f = (v: number): string => (Math.round((v / 255) * 1000) / 1000).toString();
  return `${f((n >> 16) & 255)} ${f((n >> 8) & 255)} ${f(n & 255)}`;
}

/** @internal */
export const n2 = (v: number): string => (Math.round(v * 100) / 100).toString();

interface LayoutColumn<Row> {
  readonly column: ExportColumn<Row>;
  readonly index: number;
  x: number;
  w: number;
}

/** An image XObject of the document; `id` is assigned when the objects are written. */
interface Picture {
  readonly name: string;
  readonly image: PdfImage;
  id: number;
}

/** One printed line of the table body. With a `cell` hook, data lines carry their cells, pictures, and height. */
type Line<Row> =
  | { readonly kind: 'row'; readonly row: ExportRow<Row>; readonly cells?: readonly ExportCell[]; readonly pictures?: readonly (Picture | null)[]; readonly h?: number }
  | { readonly kind: 'text'; readonly text: string; readonly depth: number }
  | { readonly kind: 'nested'; readonly model: ExportModel<unknown>; readonly index: number; readonly depth: number };

/** Writes an export model as PDF bytes. */
export async function writePdf<Row>(model: ExportModel<Row>, options: PdfOptions = {}): Promise<Uint8Array> {
  const slicer = createSlicer(Math.max(1, options.sliceMs ?? 25), options.yield ?? defaultYield);
  const theme = stylesOf(options.styles);
  const base = Array.isArray(options.pageSize) ? (options.pageSize as readonly [number, number]) : PAGE_SIZES[(options.pageSize as PdfPageSize | undefined) ?? 'a4'];
  const landscape = options.orientation === 'landscape';
  const pageW = landscape ? Math.max(base[0], base[1]) : Math.min(base[0], base[1]);
  const pageH = landscape ? Math.min(base[0], base[1]) : Math.max(base[0], base[1]);
  const margin = options.margin ?? 36;
  const size = options.fontSize ?? 8;
  const rowH = Math.round(size * 1.9 * 100) / 100;
  const pad = 3;
  const usableW = pageW - 2 * margin;
  const rtl = model.direction === 'rtl';
  const compress = options.compress !== false;
  const headerText = options.header ?? '';
  const footerText = options.footer ?? '{page} / {pages}';
  const includeHeaders = options.includeHeaders !== false;
  const headerRows = includeHeaders ? model.headerRows : [];

  // --- fonts -------------------------------------------------------------------
  let regular: Face = helvetica(false);
  let bold: Face = helvetica(true);
  let embedded: { regular: EmbeddedFace; bold: EmbeddedFace | null } | null = null;
  if (options.font) {
    const { createEmbeddedFace } = await import('./pdf-fonts.js');
    const spec = options.font as PdfFont;
    const font: PdfFont = spec.regular ? spec : { regular: options.font as PdfFontData };
    const r = createEmbeddedFace(font.regular, rtl, helpers);
    const b = font.bold ? createEmbeddedFace(font.bold, rtl, helpers) : null;
    embedded = { regular: r, bold: b };
    regular = r;
    bold = b ?? r;
  }
  const fakeBold = embedded !== null && embedded.bold === null;

  // --- column page sets ------------------------------------------------------
  const all: LayoutColumn<Row>[] = model.columns.map((c, i) => ({ column: c, index: i, x: 0, w: c.width * 0.75 }));
  const sets: LayoutColumn<Row>[][] = [];
  if (options.columnOverflow === 'paginate') {
    let current: LayoutColumn<Row>[] = [];
    let used = 0;
    for (const c of all) {
      const w = Math.min(c.w, usableW);
      if (current.length && used + w > usableW) {
        sets.push(current);
        current = [];
        used = 0;
      }
      c.w = w;
      current.push(c);
      used += w;
    }
    if (current.length) sets.push(current);
  } else {
    const total = all.reduce((s, c) => s + c.w, 0);
    const scale = total > usableW ? usableW / total : 1;
    for (const c of all) c.w *= scale;
    sets.push(all);
  }
  for (const set of sets) {
    let x = 0;
    const width = set.reduce((s, c) => s + c.w, 0);
    for (const c of set) {
      c.x = rtl ? margin + width - x - c.w : margin + x;
      x += c.w;
    }
  }
  if (sets.length === 0) sets.push([]);

  // --- body lines --------------------------------------------------------------
  // Detail blocks nest: a child model's own detail rows (deeper hierarchy levels) follow their row, one indent deeper.
  const lineCount = (row: ExportRow<unknown>): number => {
    if (row.kind !== 'detail') return 1;
    const m = row.detail.model;
    let count = (row.detail.text?.length ?? 0) + (m ? m.headerRows.length : 0);
    for (let k = 0; m && k < m.rowCount; k++) count += lineCount(m.getRow(k));
    return count;
  };
  let totalLines = model.footerRows.length;
  for (let i = 0; i < model.rowCount; i++) totalLines += lineCount(model.getRow(i));
  function* detailLines(row: ExportDetailRow<unknown>, base: number): Generator<Line<Row>> {
    const depth = base + row.depth;
    for (const text of row.detail.text ?? []) yield { kind: 'text', text, depth };
    const m = row.detail.model;
    for (let k = m ? -m.headerRows.length : 0; m && k < m.rowCount; k++) {
      const r = k < 0 ? null : m.getRow(k);
      if (r?.kind === 'detail') yield* detailLines(r, depth + 1);
      else yield { kind: 'nested', model: m, index: k, depth };
    }
  }
  function* lines(): Generator<Line<Row>> {
    for (const row of model.rows()) {
      if (row.kind === 'detail') yield* detailLines(row as ExportDetailRow<unknown>, 0);
      else yield { kind: 'row', row };
    }
    for (const f of model.footerRows) yield { kind: 'row', row: f };
  }

  const pageTop = pageH - margin - (headerText ? rowH : 0);
  const pageBottom = margin + (footerText ? rowH : 0);
  const perPage = Math.max(1, Math.floor((pageTop - pageBottom) / rowH) - headerRows.length);
  const bodyPages = Math.max(1, Math.ceil(totalLines / perPage));

  // --- drawing -----------------------------------------------------------------
  const ops: string[] = [];
  const fill = (color: string | undefined, x: number, y: number, w: number, h: number): void => {
    const c = rgb(color);
    if (c) ops.push(`${c} rg ${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re f`);
  };
  /** Draws an image XObject `w` x `h` with its lower left corner at (`x`, `y`). */
  const imageOp = (p: Picture, w: number, h: number, x: number, y: number): string => `q ${n2(w)} 0 0 ${n2(h)} ${n2(x)} ${n2(y)} cm /${p.name} Do Q`;
  /** Left edge of content `cw` wide in a box at `x`, `w` wide (RTL swaps start and end). */
  const place = (align: 'start' | 'center' | 'end', x: number, w: number, cw: number): number => {
    // At the end edge: 'end' in LTR, 'start' in RTL.
    return align === 'center' ? x + (w - cw) / 2 : (align === 'end') !== rtl ? x + w - pad - cw : x + pad;
  };
  const text = (value: string, x: number, y: number, w: number, style: ExportCellStyle, align: 'start' | 'center' | 'end'): void => {
    if (!value) return;
    const isBold = style.bold === true;
    const fs = style.fontSize ?? size;
    const shown = (isBold ? bold : regular).fit(value, w - 2 * pad, fs);
    if (!shown) return;
    const tx = place(align, x, w, shown.w);
    const color = rgb(style.color) ?? '0 0 0';
    const ty = n2(y + (rowH - fs) / 2 + fs * 0.22);
    if (isBold && fakeBold) ops.push(`q BT /F1 ${fs} Tf ${color} rg ${color} RG 2 Tr ${n2(fs * 0.025)} w ${n2(tx)} ${ty} Td ${shown.s} Tj ET Q`);
    else ops.push(`BT /${isBold ? 'F2' : 'F1'} ${fs} Tf ${color} rg ${n2(tx)} ${ty} Td ${shown.s} Tj ET`);
  };
  const hline = (x0: number, x1: number, y: number): void => {
    ops.push(`${n2(x0)} ${n2(y)} m ${n2(x1)} ${n2(y)} l S`);
  };

  const setBounds = (set: readonly LayoutColumn<Row>[]): [number, number] =>
    set.length ? [Math.min(...set.map((c) => c.x)), Math.max(...set.map((c) => c.x + c.w))] : [margin, margin];

  const drawHeader = (set: readonly LayoutColumn<Row>[], top: number): number => {
    const byIndex = new Map(set.map((c) => [c.index, c] as const));
    let y = top;
    headerRows.forEach((cells, level) => {
      y = top - (level + 1) * rowH;
      for (const h of cells) {
        const covered: LayoutColumn<Row>[] = [];
        for (let k = h.colIndex; k < h.colIndex + h.colSpan; k++) {
          const c = byIndex.get(k);
          if (c) covered.push(c);
        }
        if (!covered.length) continue;
        const [x0, x1] = setBounds(covered);
        const hgt = rowH * h.rowSpan;
        const yb = top - (level + h.rowSpan) * rowH;
        const style = h.style ? mergeStyle(theme.header, h.style) : theme.header;
        fill(style.backgroundColor, x0, yb, x1 - x0, hgt);
        text(h.text, x0, yb + (hgt - rowH) / 2, x1 - x0, style, style.textAlign ?? (h.leaf ? h.textAlign : 'center'));
      }
    });
    return top - headerRows.length * rowH;
  };

  const aggregateLine = (set: readonly LayoutColumn<Row>[], cells: ExportAggregateCells, y: number, style: ExportCellStyle, caption: string | null, depth: number): void => {
    const [x0, x1] = setBounds(set);
    fill(style.backgroundColor, x0, y, x1 - x0, rowH);
    const firstIndex = set[0]?.index ?? -1;
    if (caption !== null && firstIndex === 0) {
      // The caption spans until the first column with a caption aggregate.
      let end = x1;
      for (const c of set) if (c.index > 0 && cells[c.index]) {
        end = rtl ? x1 : c.x;
        break;
      }
      const indent = depth * size;
      text(caption, rtl ? x0 : x0 + indent, y, end - x0 - indent, style, 'start');
    }
    for (const c of set) {
      const a = cells[c.index];
      if (!a || (caption !== null && c.index === 0)) continue;
      const st = a.style ? mergeStyle(style, a.style) : style;
      text(a.text, c.x, y, c.w, st, st.textAlign ?? (c.column.textAlign === 'start' && typeof a.value === 'number' ? 'end' : c.column.textAlign));
    }
  };

  /** One data cell box (spanned boxes are opaque: they cover the grid lines below their first row). */
  const cellBox = (c: LayoutColumn<Row>, line: Line<Row> & { kind: 'row' }, x: number, y: number, w: number, h: number, opaque: boolean, used: Set<Picture>): void => {
    const cell = line.cells ? (line.cells[c.index] as ExportCell) : null;
    const style = cell?.style ? mergeStyle(theme.row, cell.style) : theme.row;
    if (opaque) fill(style.backgroundColor ?? '#FFFFFF', x, y + 0.3, w, h - 0.6);
    else if (cell?.style?.backgroundColor) fill(cell.style.backgroundColor, x, y, w, h);
    const align = style.textAlign ?? c.column.textAlign;
    const pic = line.pictures?.[c.index];
    if (pic && cell?.image) {
      // Scaled to fit the cell box, aspect kept, never enlarged.
      const iw = cell.image.width * 0.75;
      const ih = cell.image.height * 0.75;
      const k = Math.min(1, Math.max(0, w - 2 * pad) / iw, Math.max(0, h - 2 * pad) / ih);
      const dw = iw * k;
      const dh = ih * k;
      const ix = place(align, x, w, dw);
      if (dw > 0 && dh > 0) {
        ops.push(imageOp(pic, dw, dh, ix, y + (h - dh) / 2));
        used.add(pic);
      }
      return;
    }
    // Indent from the start edge: the pivot row header level (`style.indent`) and,
    // in tree mode, the row depth in the tree column.
    const depth = c.index === model.tree?.column ? (line.row as ExportDataRow<Row>).depth : 0;
    const indent = ((style.indent ?? 0) + depth) * size;
    text(cell ? cell.text : c.column.text((line.row as ExportDataRow<Row>).row), rtl ? x : x + indent, y + (h - rowH) / 2, w - indent, style, align);
  };

  const drawLine = (set: readonly LayoutColumn<Row>[], line: Line<Row>, y: number, h: number, used: Set<Picture>, sp: number[] | null | undefined, i: number, hs: readonly number[], late: (() => void)[]): void => {
    const [x0, x1] = setBounds(set);
    if (line.kind === 'text') {
      text(line.text, x0 + (line.depth + 1) * size, y, x1 - x0 - (line.depth + 1) * size, theme.row, 'start');
      return;
    }
    if (line.kind === 'nested') {
      const m = line.model;
      const indent = (line.depth + 1) * size;
      const w = (x1 - x0 - indent) / Math.max(1, m.columns.length);
      if (line.index < 0) {
        const cells = m.headerRows[m.headerRows.length + line.index] ?? [];
        for (const h of cells) text(h.text, x0 + indent + h.colIndex * w, y, w * h.colSpan, theme.header, 'start');
        return;
      }
      const r = m.getRow(line.index);
      if (r.kind === 'data') m.columns.forEach((c, k) => text(m.cell(r, c).text, x0 + indent + k * w, y, w, theme.row, c.textAlign));
      else if (r.kind === 'group') text(r.caption, x0 + indent, y, x1 - x0 - indent, theme.groupCaption, 'start');
      return;
    }
    const row = line.row;
    switch (row.kind) {
      case 'data': {
        fill(theme.row.backgroundColor, x0, y, x1 - x0, h);
        for (let j = 0; j < set.length; j++) {
          const c = set[j] as LayoutColumn<Row>;
          const k = c.index;
          const cs = sp ? (sp[2 * k] as number) : 1;
          if (!cs) continue;
          const rs = sp ? (sp[2 * k + 1] as number) : 1;
          let bx = c.x;
          let bw = c.w;
          for (let q = 1; q < cs; q++) {
            const o = set[j + q];
            if (o?.index !== k + q) break;
            bw += o.w;
            bx = Math.min(bx, o.x);
          }
          let bh = h;
          for (let q = 1; q < rs; q++) bh += hs[i + q] as number;
          if (rs > 1) late.push(() => cellBox(c, line, bx, y + h - bh, bw, bh, true, used));
          else cellBox(c, line, bx, y, bw, h, false, used);
        }
        return;
      }
      case 'group':
        aggregateLine(set, row.aggregates, y, theme.groupCaption, row.caption, row.depth);
        return;
      case 'groupFooter':
      case 'aggregate':
        aggregateLine(set, row.aggregates, y, theme.aggregate, null, 0);
        return;
      default:
        return;
    }
  };

  // --- objects -----------------------------------------------------------------
  const objects: Uint8Array[] = [];
  const offsets: number[] = [];
  const addObject = (id: number, body: Uint8Array | string): void => {
    objects[id] = typeof body === 'string' ? latin1(`${id} 0 obj\n${body}\nendobj\n`) : body;
  };
  const streamObject = async (id: number, content: string | Uint8Array, dict = ''): Promise<void> => {
    const raw = typeof content === 'string' ? latin1(content) : content;
    const packed = compress ? await deflate(raw, 'deflate') : null;
    const data = packed ?? raw;
    const head = latin1(`${id} 0 obj\n<< /Length ${data.length}${packed ? ' /Filter /FlateDecode' : ''}${dict ? ` ${dict}` : ''} >>\nstream\n`);
    objects[id] = concat([head, data, latin1('\nendstream\nendobj\n')]);
  };

  // --- cell hook: cells, pictures, and line heights ---------------------------
  // With a `cell` hook, data lines are measured while they are paginated (the
  // hook runs once per cell); a line holding an image grows to the image
  // height, so the page count is known only at the end (also with
  // `appendImages`): the page header, footer, and page objects are written
  // then, for every page.
  const hooked = model.hasCellHook;
  const capacity = perPage * rowH;
  let pictures: ImageStore<Promise<Picture | null>> | null = null;
  const pictureList: Picture[] = [];
  /** A new image XObject (image cells and `appendImages`), or null when the image cannot be embedded. */
  const picture = async (image: ExportImage): Promise<Picture | null> => {
    const { pdfImage } = await import('./pdf-images.js');
    const prepared = await pdfImage(image, helpers);
    if (!prepared) return null;
    const p: Picture = { name: `Im${pictureList.length}`, image: prepared, id: 0 };
    pictureList.push(p);
    return p;
  };
  const measure = async (line: Line<Row>): Promise<Line<Row>> => {
    if (line.kind !== 'row' || line.row.kind !== 'data') return line;
    const row = line.row;
    const cells = model.columns.map((c) => model.cell(row, c));
    for (const cell of cells) if ((cell.colSpan ?? 1) > 1 || (cell.rowSpan ?? 1) > 1) spanned = true;
    let pics: (Picture | null)[] | undefined;
    let h = rowH;
    for (let k = 0; k < cells.length; k++) {
      const image = (cells[k] as ExportCell).image;
      if (!image) continue;
      const pic = await (pictures ??= new ImageStore()).get(image.data, () => picture(image));
      if (!pic) continue;
      (pics ??= new Array<Picture | null>(cells.length).fill(null))[k] = pic;
      const iw = image.width * 0.75;
      const fitW = Math.max(1, (all[k] as LayoutColumn<Row>).w - 2 * pad);
      h = Math.max(h, Math.min(capacity, image.height * 0.75 * Math.min(1, fitW / iw) + 2 * pad));
    }
    return { kind: 'row', row, cells, ...(pics ? { pictures: pics } : {}), h };
  };

  // --- spans: per data line of a page, [colSpan, rowSpan] per column (0 = covered) ---
  const merge = options.mergeRepeatedValues === true;
  let spanned = false;
  let carry: ([number, number, ExportCell] | undefined)[] = [];
  const n = model.columns.length;
  const textAt = (l: Line<Row>, c: number): string =>
    l.kind === 'row' && l.cells ? (l.cells[c] as ExportCell).text : (model.columns[c] as ExportColumn<Row>).text((l as { row: ExportDataRow<Row> }).row.row);
  const planPage = (buffer: Line<Row>[]): (number[] | null)[] | null => {
    if (!merge && !spanned) return null;
    const plan = buffer.map((l) => (l.kind === 'row' && l.row.kind === 'data' ? new Array<number>(2 * n).fill(1) : null));
    const next: typeof carry = [];
    const first = buffer[0];
    // A row span cut by the page break draws its anchor cell again on this page.
    if (first?.kind === 'row' && first.cells && carry.length) buffer[0] = { ...first, cells: first.cells.map((cell, c) => carry[c]?.[2] ?? cell) };
    for (let i = 0; i < buffer.length; i++) {
      const p = plan[i];
      if (!p) continue;
      const line = buffer[i] as Line<Row> & { kind: 'row' };
      for (let c = 0; c < n; c++) {
        if (!p[2 * c]) continue;
        const held = i ? undefined : carry[c];
        const cell = (held?.[2] ?? line.cells?.[c]) as ExportCell;
        const cs = Math.max(1, Math.min(n - c, held ? held[1] : (cell?.colSpan ?? 1)));
        const rs = held ? held[0] : (cell?.rowSpan ?? 1);
        let fit = 1;
        if (rs > 1) {
          while (fit < rs && plan[i + fit]) fit++;
          if (fit < rs && i + fit === buffer.length) next[c] = [rs - fit, cs, cell];
        } else if (merge && cs === 1) {
          const t = textAt(line, c);
          while (plan[i + fit]?.[2 * c] && textAt(buffer[i + fit] as Line<Row>, c) === t) fit++;
        }
        for (let k = 0; k < fit; k++) for (let j = 0; j < cs; j++) if (k || j) (plan[i + k] as number[])[2 * (c + j)] = 0;
        p[2 * c] = cs;
        p[2 * c + 1] = fit;
      }
    }
    carry = next;
    return plan;
  };

  let pageNo = 0;
  const iter = lines();
  let buffer: Line<Row>[] = [];
  let carried: Line<Row> | null = null;
  // Pages are written once the page count is known; page `n` (from 1) is object 4 + 2n, its content stream the next.
  const deferred: { readonly page: number; readonly body: string; readonly used: Set<Picture> }[] = [];
  const idOf = (page: number): number => 4 + 2 * page;
  const pageText = (value: string, page: number, pages: number): string => value.replace(/\{page\}/g, String(page)).replace(/\{pages\}/g, String(pages));
  const pageObject = (pageId: number, used: Set<Picture>): void => {
    const xobjects = used.size ? ` /XObject << ${[...used].map((p) => `/${p.name} ${p.id} 0 R`).join(' ')} >>` : '';
    addObject(pageId, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n2(pageW)} ${n2(pageH)}] /Resources << /Font << /F1 3 0 R /F2 ${embedded && !embedded.bold ? 3 : 4} 0 R >>${xobjects} >> /Contents ${pageId + 1} 0 R >>`);
  };
  /** One page content stream: grid lines, header text, body, footer text. */
  const pageStream = async (page: number, pages: number, body: string): Promise<void> => {
    ops.length = 0;
    ops.push('0.75 0.75 0.75 RG 0.5 w');
    if (headerText) text(pageText(headerText, page, pages), margin, pageH - margin - rowH, usableW, { bold: true }, 'start');
    if (body) ops.push(body);
    if (footerText) text(pageText(footerText, page, pages), margin, margin, usableW, {}, 'end');
    await streamObject(idOf(page) + 1, ops.join('\n'));
  };
  for (let p = 0; hooked || p < bodyPages; p++) {
    buffer = [];
    if (hooked) {
      let filled = 0;
      for (;;) {
        let line: Line<Row> | null = carried;
        carried = null;
        if (!line) {
          const next = iter.next();
          if (next.done) break;
          line = await measure(next.value);
        }
        const h = (line.kind === 'row' && line.h) || rowH;
        if (buffer.length && filled + h > capacity + 1e-6) {
          carried = line;
          break;
        }
        buffer.push(line);
        filled += h;
      }
      if (p > 0 && !buffer.length) break;
    } else {
      for (let k = 0; k < perPage; k++) {
        const next = iter.next();
        if (next.done) break;
        buffer.push(next.value);
      }
    }
    const plan = planPage(buffer);
    const hs = buffer.map((line) => (line.kind === 'row' && line.h) || rowH);
    for (const set of sets) {
      pageNo++;
      ops.length = 0;
      const [x0, x1] = setBounds(set);
      let y = drawHeader(set, pageTop);
      if (headerRows.length) hline(x0, x1, y);
      const used = new Set<Picture>();
      const late: (() => void)[] = [];
      buffer.forEach((line, i) => {
        const h = hs[i] as number;
        y -= h;
        drawLine(set, line, y, h, used, plan?.[i], i, hs, late);
        hline(x0, x1, y);
      });
      for (const draw of late) draw();
      deferred.push({ page: pageNo, body: ops.join('\n'), used });
      if (slicer.due()) await slicer.pause();
    }
  }
  // Image pages after the table (`appendImages`), scaled to fit the page body.
  for (const image of options.appendImages ?? []) {
    const p = await picture(image);
    if (!p) continue;
    // CSS px to pt (0.75), never enlarged.
    const k = Math.min(0.75, usableW / image.width, (pageTop - pageBottom) / image.height);
    const dw = image.width * k;
    const dh = image.height * k;
    deferred.push({ page: ++pageNo, body: imageOp(p, dw, dh, margin + (usableW - dw) / 2, pageTop - dh), used: new Set([p]) });
  }
  for (const d of deferred) {
    await pageStream(d.page, pageNo, d.body);
    if (slicer.due()) await slicer.pause();
  }
  addObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
  addObject(2, `<< /Type /Pages /Kids [${deferred.map((d) => `${idOf(d.page)} 0 R`).join(' ')}] /Count ${pageNo} >>`);
  let next = idOf(pageNo + 1);
  if (embedded) {
    // Type0 fonts at 3 (regular) and 4 (bold, or the regular CIDFont when bold is synthetic); the rest follow the pages.
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
  // Image XObjects (and soft masks) follow the pages and fonts.
  const rawStream = (id: number, dict: string, data: Uint8Array): void => {
    objects[id] = concat([latin1(`${id} 0 obj\n<< /Length ${data.length} ${dict} >>\nstream\n`), data, latin1('\nendstream\nendobj\n')]);
  };
  for (const pic of pictureList) {
    pic.id = next++;
    const mask = pic.image.smask;
    const smask = mask ? next++ : 0;
    rawStream(pic.id, `${pic.image.dict}${smask ? ` /SMask ${smask} 0 R` : ''}`, pic.image.data);
    if (mask) rawStream(smask, mask.dict, mask.data);
  }
  for (const d of deferred) pageObject(idOf(d.page), d.used);
  addObject(5, `<< /Producer ${literal(winAnsi('Salmon UI'))}${options.title ? ` /Title ${textString(options.title)}` : ''} >>`);

  const out: Uint8Array[] = [latin1('%PDF-1.4\n%âãÏÓ\n')];
  let at = (out[0] as Uint8Array).length;
  for (let id = 1; id < objects.length; id++) {
    const o = objects[id] as Uint8Array;
    offsets[id] = at;
    out.push(o);
    at += o.length;
  }
  let xref = `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) xref += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${at}\n%%EOF\n`;
  out.push(latin1(xref));
  return concat(out);
}
