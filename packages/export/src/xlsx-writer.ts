// XLSX writer: SpreadsheetML
// parts zipped by the in-package ZIP writer, deflated with the platform
// `CompressionStream`. No third-party code. Worksheet XML is produced row by
// row from the export model and streamed into the ZIP entry in ~512 KB
// batches; the writer yields to the event loop whenever a time slice
// (default 25 ms) is used up, so the main thread is never blocked for long
// without a worker. Image cells become pictures anchored to their
// cell (`xl/media`, `xl/drawings`); the parts exist only when a `cell` hook
// returned an image.

import type {
  ExportAggregateCells,
  ExportCell,
  ExportCellStyle,
  ExportColumn,
  ExportDataRow,
  ExportImage,
  ExportModel,
  ExportRow,
} from '@salmonui/core/export-model';
import { isFormulaText } from '@salmonui/core/export-model';
import type { FormatDescriptor } from '@salmonui/core/format';
import { createSlicer, defaultYield, utf8 } from './bytes.js';
import { ImageStore, imageType } from './image.js';
import { hexColor, mergeStyle, stylesOf, type ExportStyles, type ExportWriterOptions } from './shared.js';
import { ZipWriter, type ZipEntryWriter } from './zip.js';

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** XLSX writer options. */
export interface XlsxOptions extends ExportWriterOptions {
  /** Sheet name of a single-sheet workbook (default `Sheet1`). */
  readonly sheetName?: string;
  /** Sheet names per grid with `layout: 'sheets'`. */
  readonly sheetNames?: readonly string[];
  /** Several grids in one workbook: one sheet each (`sheets`, default) or stacked on one sheet (`stacked`). */
  readonly layout?: 'sheets' | 'stacked';
  /** Empty rows between stacked grids. Default 5. */
  readonly gap?: number;
  /** `typed` (default): numbers, booleans, and dates as Excel values with number formats. `text`: the display text. */
  readonly values?: 'typed' | 'text';
  /** Header rows. Default true. */
  readonly includeHeaders?: boolean;
  /** Freeze the header rows (in addition to pinned columns). Default false. */
  readonly freezeHeader?: boolean;
  /**
   * Tree mode: with
   * `tree: 'all'`, rows under a parent collapsed in the grid are written
   * hidden and the parent row carries the outline's collapsed flag, so Excel
   * opens with the grid's expansion. Default false (every outline open).
   */
  readonly outlineCollapsed?: boolean;
  /** Merge repeated values in consecutive data rows. Default false. */
  readonly mergeRepeatedValues?: boolean;
  /** Deflate entries (when the platform has `CompressionStream`). Default true. */
  readonly compress?: boolean;
  /** Rows above the grid, then `gap` empty rows. */
  readonly header?: XlsxContent;
  /** `gap` empty rows, then rows below the grid. */
  readonly footer?: XlsxContent;
}

export interface XlsxContentCell {
  /** 0-based column. Default: after the previous cell. */
  readonly column?: number;
  readonly value?: string | number | boolean | Date | null;
  readonly colSpan?: number;
  readonly rowSpan?: number;
  readonly style?: ExportCellStyle;
}

export interface XlsxContent {
  readonly gap?: number;
  readonly rows: readonly { readonly cells: readonly XlsxContentCell[] }[];
}

/** Writes one or more export models (or engines with the `export` module) as an XLSX workbook. */
export async function writeXlsx<Row>(models: ExportModel<Row> | readonly ExportModel<Row>[], options: XlsxOptions = {}): Promise<Uint8Array> {
  const list: readonly ExportModel<Row>[] = Array.isArray(models) ? (models as readonly ExportModel<Row>[]) : [models as ExportModel<Row>];
  if (list.length === 0) throw new Error('writeXlsx: no export model.');
  const book = new Workbook<Row>(options);
  if (options.layout === 'stacked') {
    await book.sheet(options.sheetName ?? 'Sheet1', list, options);
  } else {
    for (let i = 0; i < list.length; i++) {
      await book.sheet(options.sheetNames?.[i] ?? (list.length === 1 ? (options.sheetName ?? 'Sheet1') : `Sheet${i + 1}`), [list[i] as ExportModel<Row>], options);
    }
  }
  return book.finish();
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

const XML_SPECIAL = /[&<>"\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/;
const XML_REPLACE = /[&<>"\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;

/** XML text / attribute escape; drops characters XML 1.0 cannot carry. */
export function xml(text: string): string {
  if (!XML_SPECIAL.test(text)) return text;
  return text.replace(XML_REPLACE, (c) => (c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : ''));
}

/** Column letters of a 0-based index (`0` -> `A`). */
export function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const PKG_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const EMU_PER_PX = 9525;

// ---------------------------------------------------------------------------
// Number formats: the grid format descriptor as an Excel code
// ---------------------------------------------------------------------------

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = { USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', INR: '₹', KRW: '₩' };

function fractionCode(min: number | undefined, max: number | undefined, fallbackMax: number): string {
  const lo = min ?? 0;
  const hi = Math.max(lo, max ?? fallbackMax);
  return lo === 0 && hi === 0 ? '' : `.${'0'.repeat(lo)}${'#'.repeat(hi - lo)}`;
}

/** Excel number format code (or built-in id) of a column; null for General. */
export function excelNumberFormat(format: FormatDescriptor | null, type: string): string | number | null {
  if (type === 'date' || type === 'datetime' || format?.kind === 'date') {
    if (format?.kind === 'date' && format.pattern) return excelDatePattern(format.pattern);
    return type === 'datetime' || format?.options.type === 'datetime' ? 22 : 14;
  }
  if (!format || format.kind !== 'number') return null;
  if (format.pattern) return format.pattern;
  const o = format.options;
  const grouping = o.useGrouping === false ? '0' : '#,##0';
  if (format.style === 'percent') return `0${fractionCode(o.minimumFractionDigits, o.maximumFractionDigits, 0)}%`;
  if (format.style === 'currency') {
    const code = (o.currency ?? 'USD').toUpperCase();
    const symbol = CURRENCY_SYMBOLS[code];
    const body = `${grouping}${fractionCode(o.minimumFractionDigits ?? 2, o.maximumFractionDigits ?? 2, 2)}`;
    return symbol ? `"${symbol}"${body}` : `[$${code}] ${body}`;
  }
  return `${grouping}${fractionCode(o.minimumFractionDigits, o.maximumFractionDigits, 3)}`;
}

/** DataGrid date pattern (`dd/MM/yyyy HH:mm`) as an Excel code. */
export function excelDatePattern(pattern: string): string {
  let out = '';
  let twelve = false;
  for (const token of pattern.match(/'[^']*'|(.)\1*/g) ?? []) {
    const c = token[0];
    switch (c) {
      case "'":
        out += token.length > 2 ? `"${token.slice(1, -1)}"` : "'";
        break;
      case 'y':
        out += token.length === 2 ? 'yy' : 'yyyy';
        break;
      case 'M':
      case 'L':
        out += token.length >= 4 ? 'mmmm' : token.length === 3 ? 'mmm' : token.length === 2 ? 'mm' : 'm';
        break;
      case 'd':
        out += token.length >= 2 ? 'dd' : 'd';
        break;
      case 'E':
        out += token.length >= 4 ? 'dddd' : 'ddd';
        break;
      case 'H':
        out += token.length >= 2 ? 'hh' : 'h';
        break;
      case 'h':
        twelve = true;
        out += token.length >= 2 ? 'hh' : 'h';
        break;
      case 'm':
        out += token.length >= 2 ? 'mm' : 'm';
        break;
      case 's':
        out += token.length >= 2 ? 'ss' : 's';
        break;
      case 'f':
        out += `.${'0'.repeat(Math.min(3, token.length))}`;
        break;
      case 'a':
        twelve = true;
        out += 'AM/PM';
        break;
      default:
        out += /[A-Za-z]/.test(token) ? `"${token}"` : token.replace(/"/g, '');
    }
  }
  if (twelve && !out.includes('AM/PM')) out += ' AM/PM';
  return out;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MS_PER_DAY = 86_400_000;
const EPOCH_OFFSET = 25569; // 1970-01-01 in the 1900 date system

function createSerial(timeZone: string | undefined): (d: Date) => number {
  if (timeZone === 'UTC' || timeZone === 'Etc/UTC' || timeZone === 'GMT') return (d) => d.getTime() / MS_PER_DAY + EPOCH_OFFSET;
  if (timeZone === undefined) return (d) => (d.getTime() - d.getTimezoneOffset() * 60_000) / MS_PER_DAY + EPOCH_OFFSET;
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  const memo = new Map<number, number>();
  return (d) => {
    const t = d.getTime();
    let hit = memo.get(t);
    if (hit === undefined) {
      const p: Record<string, number> = {};
      for (const part of fmt.formatToParts(d)) if (part.type !== 'literal') p[part.type] = Number(part.value);
      const wall = Date.UTC(p['year'] ?? 1970, (p['month'] ?? 1) - 1, p['day'] ?? 1, p['hour'] ?? 0, p['minute'] ?? 0, p['second'] ?? 0) + (t % 1000 + 1000) % 1000;
      hit = wall / MS_PER_DAY + EPOCH_OFFSET;
      if (memo.size > 65_536) memo.clear();
      memo.set(t, hit);
    }
    return hit;
  };
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

interface StyleKey {
  readonly style: ExportCellStyle;
  readonly numFmt: string | number | null;
  readonly indent: number;
}

class Styles {
  private readonly numFmts = new Map<string, number>();
  private readonly fonts: string[] = ['<font><sz val="11"/><name val="Calibri"/></font>'];
  private readonly fontIds = new Map<string, number>([[this.fonts[0] as string, 0]]);
  private readonly fills: string[] = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>'];
  private readonly fillIds = new Map<string, number>();
  private readonly xfs: string[] = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'];
  private readonly xfIds = new Map<string, number>();
  private readonly quotedIds = new Map<number, number>();

  get({ style, numFmt, indent: base }: StyleKey): number {
    const indent = style.indent ?? base;
    const fmt = style.numberFormat ?? numFmt;
    const key = `${JSON.stringify(style)}|${fmt}|${indent}`;
    const hit = this.xfIds.get(key);
    if (hit !== undefined) return hit;
    let numFmtId = 0;
    if (typeof fmt === 'number') numFmtId = fmt;
    else if (typeof fmt === 'string' && fmt !== '' && fmt !== 'General') {
      numFmtId = this.numFmts.get(fmt) ?? 164 + this.numFmts.size;
      this.numFmts.set(fmt, numFmtId);
    }
    const color = hexColor(style.color);
    const font = `<font>${style.bold ? '<b/>' : ''}${style.italic ? '<i/>' : ''}<sz val="${style.fontSize ?? 11}"/>${color ? `<color rgb="FF${color}"/>` : ''}<name val="Calibri"/></font>`;
    let fontId = this.fontIds.get(font);
    if (fontId === undefined) {
      fontId = this.fonts.length;
      this.fonts.push(font);
      this.fontIds.set(font, fontId);
    }
    let fillId = 0;
    const bg = hexColor(style.backgroundColor);
    if (bg) {
      fillId = this.fillIds.get(bg) ?? this.fills.length;
      if (fillId === this.fills.length) {
        this.fills.push(`<fill><patternFill patternType="solid"><fgColor rgb="FF${bg}"/><bgColor indexed="64"/></patternFill></fill>`);
        this.fillIds.set(bg, fillId);
      }
    }
    const horizontal = style.textAlign === 'center' ? 'center' : style.textAlign === 'end' ? 'right' : indent > 0 || style.textAlign === 'start' ? 'left' : null;
    const alignment = horizontal || indent > 0 ? `<alignment${horizontal ? ` horizontal="${horizontal}"` : ''}${indent > 0 ? ` indent="${indent}"` : ''}/>` : '';
    const attrs = `numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="0" xfId="0"${numFmtId ? ' applyNumberFormat="1"' : ''}${fontId ? ' applyFont="1"' : ''}${fillId ? ' applyFill="1"' : ''}${alignment ? ' applyAlignment="1"' : ''}`;
    const id = this.xfs.length;
    this.xfs.push(alignment ? `<xf ${attrs}>${alignment}</xf>` : `<xf ${attrs}/>`);
    this.xfIds.set(key, id);
    return id;
  }

  /** The same style with Excel's quote prefix: re-entering the cell keeps formula-like text as text. */
  quoted(id: number): number {
    let q = this.quotedIds.get(id);
    if (q === undefined) {
      q = this.xfs.length;
      this.xfs.push((this.xfs[id] as string).replace('<xf ', '<xf quotePrefix="1" '));
      this.quotedIds.set(id, q);
    }
    return q;
  }

  xml(): string {
    const numFmts = [...this.numFmts].map(([code, id]) => `<numFmt numFmtId="${id}" formatCode="${xml(code)}"/>`).join('');
    return (
      `${HEAD}<styleSheet xmlns="${NS}">` +
      (numFmts ? `<numFmts count="${this.numFmts.size}">${numFmts}</numFmts>` : '') +
      `<fonts count="${this.fonts.length}">${this.fonts.join('')}</fonts>` +
      `<fills count="${this.fills.length}">${this.fills.join('')}</fills>` +
      '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
      '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
      `<cellXfs count="${this.xfs.length}">${this.xfs.join('')}</cellXfs>` +
      '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
      '</styleSheet>'
    );
  }
}

// ---------------------------------------------------------------------------
// Workbook
// ---------------------------------------------------------------------------

const FLUSH_CHARS = 512 * 1024;
const MAX_OUTLINE = 7;

/**
 * Deepest row outline level of a model relative to its own rows: group
 * levels, and child models one level below their detail row. Only
 * models with detail rows are scanned.
 */
function outlineDepth(model: ExportModel<unknown>): number {
  let depth = model.groupDepth ? model.groupDepth + 1 : (model.tree?.depth ?? 0);
  for (let i = 0; model.detailRowCount && i < model.rowCount && depth < MAX_OUTLINE; i++) {
    const row = model.getRow(i);
    if (row.kind === 'detail') depth = Math.max(depth, row.depth + (row.detail.model ? outlineDepth(row.detail.model) : 0));
  }
  return depth;
}

function sheetNameOf(name: string, used: Set<string>): string {
  let base = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

class Workbook<Row> {
  private readonly zip: ZipWriter;
  private readonly styles = new Styles();
  private readonly strings = new Map<string, number>();
  private readonly stringList: string[] = [];
  private stringRefs = 0;
  private readonly sheets: string[] = [];
  private readonly used = new Set<string>();
  private readonly slicer: { due(): boolean; pause(): Promise<void> };
  private readonly typed: boolean;
  private readonly theme: Required<ExportStyles>;
  /** Image parts, created on the first image cell. */
  private media: { readonly store: ImageStore<string>; readonly files: [string, Uint8Array][] } | null = null;
  private drawings = 0;

  constructor(options: XlsxOptions) {
    this.zip = new ZipWriter({ compress: options.compress !== false });
    this.slicer = createSlicer(Math.max(1, options.sliceMs ?? 25), options.yield ?? defaultYield);
    this.typed = options.values !== 'text';
    this.theme = stylesOf(options.styles);
  }

  sharedString(text: string): number {
    this.stringRefs++;
    let id = this.strings.get(text);
    if (id === undefined) {
      id = this.stringList.length;
      this.stringList.push(text);
      this.strings.set(text, id);
    }
    return id;
  }

  async sheet(name: string, models: readonly ExportModel<Row>[], options: XlsxOptions): Promise<void> {
    const index = this.sheets.length + 1;
    this.sheets.push(sheetNameOf(name, this.used));
    const entry = this.zip.entry(`xl/worksheets/sheet${index}.xml`);
    const writer = new SheetWriter(this, entry, this.slicer, options, this.typed, this.theme);
    const pictures = await writer.write(models);
    if (pictures) await this.drawing(index, pictures);
  }

  /** Media part name of an image (one per distinct bytes), or null when it cannot be embedded. */
  mediaOf(image: ExportImage): string | null {
    const type = imageType(image);
    if (!type) return null;
    const media = (this.media ??= { store: new ImageStore<string>(), files: [] });
    return media.store.get(image.data, () => {
      const name = `image${media.files.length + 1}.${type}`;
      media.files.push([name, image.data]);
      return name;
    });
  }

  /** Drawing part, its relationships, and the sheet relationship for a sheet's pictures. */
  private async drawing(sheet: number, pictures: Pictures): Promise<void> {
    const d = ++this.drawings;
    const rels = (items: string): string => `${HEAD}<Relationships xmlns="${PKG_REL_NS}">${items}</Relationships>`;
    await this.zip.add(`xl/worksheets/_rels/sheet${sheet}.xml.rels`, rels(`<Relationship Id="rId1" Type="${REL_NS}/drawing" Target="../drawings/drawing${d}.xml"/>`));
    await this.zip.add(
      `xl/drawings/drawing${d}.xml`,
      `${HEAD}<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL_NS}">${pictures.anchors.join('')}</xdr:wsDr>`,
    );
    await this.zip.add(`xl/drawings/_rels/drawing${d}.xml.rels`, rels([...pictures.rIds].map(([name, id]) => `<Relationship Id="${id}" Type="${REL_NS}/image" Target="../media/${name}"/>`).join('')));
  }

  styleId(key: StyleKey): number {
    return this.styles.get(key);
  }

  quotedStyle(id: number): number {
    return this.styles.quoted(id);
  }

  async finish(): Promise<Uint8Array> {
    const n = this.sheets.length;
    let overrides = this.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    let defaults = '';
    if (this.media) {
      const files = this.media.files;
      for (const ext of ['png', 'jpeg']) if (files.some(([name]) => name.endsWith(ext))) defaults += `<Default Extension="${ext}" ContentType="image/${ext}"/>`;
      for (let d = 1; d <= this.drawings; d++) overrides += `<Override PartName="/xl/drawings/drawing${d}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
      for (const [name, data] of files) await this.zip.add(`xl/media/${name}`, data);
    }
    await this.zip.add(
      '[Content_Types].xml',
      `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        defaults +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        overrides +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' +
        '</Types>',
    );
    await this.zip.add(
      '_rels/.rels',
      `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    );
    await this.zip.add(
      'xl/workbook.xml',
      `${HEAD}<workbook xmlns="${NS}" xmlns:r="${REL_NS}"><bookViews><workbookView/></bookViews><sheets>` +
        this.sheets.map((s, i) => `<sheet name="${xml(s)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    );
    await this.zip.add(
      'xl/_rels/workbook.xml.rels',
      `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        this.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${n + 1}" Type="${REL_NS}/styles" Target="styles.xml"/>` +
        `<Relationship Id="rId${n + 2}" Type="${REL_NS}/sharedStrings" Target="sharedStrings.xml"/>` +
        '</Relationships>',
    );
    await this.zip.add('xl/styles.xml', this.styles.xml());
    const sst = this.zip.entry('xl/sharedStrings.xml');
    await sst.write(utf8(`${HEAD}<sst xmlns="${NS}" count="${this.stringRefs}" uniqueCount="${this.stringList.length}">`));
    let parts: string[] = [];
    let size = 0;
    for (const s of this.stringList) {
      const t = xml(s);
      parts.push(`<si><t xml:space="preserve">${t}</t></si>`);
      size += t.length + 40;
      if (size > FLUSH_CHARS) {
        await sst.write(utf8(parts.join('')));
        parts = [];
        size = 0;
      }
    }
    parts.push('</sst>');
    await sst.write(utf8(parts.join('')));
    await sst.close();
    return this.zip.finish();
  }
}

/** Picture anchors of one sheet and the image relationship ids of its drawing. */
interface Pictures {
  readonly anchors: string[];
  readonly rIds: Map<string, string>;
}

interface Placement {
  readonly colOffset: number;
  readonly outline: number;
}

class SheetWriter<Row> {
  private row = 0;
  private parts: string[] = [];
  private size = 0;
  private readonly merges: string[] = [];
  private readonly letters: string[] = [];
  private maxOutline = 0;
  private pictures: Pictures | null = null;

  private readonly book: Workbook<Row>;
  private readonly entry: ZipEntryWriter;
  private readonly slicer: { due(): boolean; pause(): Promise<void> };
  private readonly options: XlsxOptions;
  private readonly typed: boolean;
  private readonly theme: Required<ExportStyles>;

  constructor(book: Workbook<Row>, entry: ZipEntryWriter, slicer: { due(): boolean; pause(): Promise<void> }, options: XlsxOptions, typed: boolean, theme: Required<ExportStyles>) {
    this.book = book;
    this.entry = entry;
    this.slicer = slicer;
    this.options = options;
    this.typed = typed;
    this.theme = theme;
  }

  private ref(col: number): string {
    let l = this.letters[col];
    if (l === undefined) {
      l = columnLetter(col);
      this.letters[col] = l;
    }
    return l;
  }

  private async emit(text: string): Promise<void> {
    this.parts.push(text);
    this.size += text.length;
    if (this.size >= FLUSH_CHARS) await this.flush();
    if (this.slicer.due()) await this.slicer.pause();
  }

  private async flush(): Promise<void> {
    if (!this.parts.length) return;
    const chunk = this.parts.join('');
    this.parts = [];
    this.size = 0;
    await this.entry.write(utf8(chunk));
  }

  private rowOpen(outline: number, extra = ''): string {
    this.row++;
    const level = Math.min(MAX_OUTLINE, outline);
    if (level > this.maxOutline) this.maxOutline = level;
    return level > 0 ? `<row r="${this.row}" outlineLevel="${level}"${extra}>` : `<row r="${this.row}"${extra}>`;
  }

  private textCell(col: number, text: string, s: number): string {
    if (text === '') return s ? `<c r="${this.ref(col)}${this.row}" s="${s}"/>` : '';
    const style = isFormulaText(text) ? this.book.quotedStyle(s) : s;
    return `<c r="${this.ref(col)}${this.row}"${style ? ` s="${style}"` : ''} t="s"><v>${this.book.sharedString(text)}</v></c>`;
  }

  private valueCell(col: number, value: unknown, text: string, s: number, dateS: number, serial: (d: Date) => number, formula?: string): string {
    const r = `${this.ref(col)}${this.row}`;
    if (formula !== undefined) {
      const f = `<f>${xml(formula.startsWith('=') ? formula.slice(1) : formula)}</f>`;
      return typeof value === 'number' && Number.isFinite(value) ? `<c r="${r}"${s ? ` s="${s}"` : ''}>${f}<v>${value}</v></c>` : `<c r="${r}"${s ? ` s="${s}"` : ''}>${f}</c>`;
    }
    if (!this.typed) return this.textCell(col, text, s);
    if (typeof value === 'number') {
      if (Number.isFinite(value)) return `<c r="${r}"${s ? ` s="${s}"` : ''}><v>${value}</v></c>`;
      return this.textCell(col, text, s);
    }
    if (typeof value === 'boolean') return `<c r="${r}"${s ? ` s="${s}"` : ''} t="b"><v>${value ? 1 : 0}</v></c>`;
    if (value instanceof Date) {
      const t = value.getTime();
      if (Number.isNaN(t)) return this.textCell(col, text, s);
      return `<c r="${r}" s="${dateS}"><v>${serial(value)}</v></c>`;
    }
    if (value === null || value === undefined) return s ? `<c r="${r}" s="${s}"/>` : '';
    return this.textCell(col, text, s);
  }

  /** Anchors an image at a cell (0-based column, 1-based row); returns its height in points, or 0 when it cannot be embedded. */
  private picture(col: number, row: number, image: ExportImage): number {
    const name = this.book.mediaOf(image);
    if (!name) return 0;
    const p = (this.pictures ??= { anchors: [] as string[], rIds: new Map<string, string>() });
    let rId = p.rIds.get(name);
    if (!rId) p.rIds.set(name, (rId = `rId${p.rIds.size + 1}`));
    const id = p.anchors.length + 1;
    const cx = Math.round(image.width * EMU_PER_PX);
    const cy = Math.round(image.height * EMU_PER_PX);
    p.anchors.push(
      `<xdr:oneCellAnchor><xdr:from><xdr:col>${col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="${cx}" cy="${cy}"/>` +
        `<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${id + 1}" name="Picture ${id}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
        `<xdr:blipFill><a:blip r:embed="${rId}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
        `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`,
    );
    return image.height * 0.75;
  }

  /** Writes the sheet; returns its pictures, if any. */
  async write(models: readonly ExportModel<Row>[]): Promise<Pictures | null> {
    const o = this.options;
    const first = models[0] as ExportModel<Row>;
    const includeHeaders = o.includeHeaders !== false;
    const headerLines = o.header ? o.header.rows.length + (o.header.gap ?? 0) : 0;
    const headerRows = includeHeaders ? first.headerRows.length : 0;
    // Columns: widest model per position.
    const widths: number[] = [];
    for (const m of models) m.columns.forEach((c, i) => (widths[i] = Math.max(widths[i] ?? 0, c.width)));
    const cols = widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${Math.max(1, Math.round(((w - 5) / 7) * 100) / 100)}" customWidth="1"/>`).join('');
    const xSplit = first.frozen.left;
    const ySplit = o.freezeHeader ? headerLines + headerRows : 0;
    let pane = '';
    if (xSplit > 0 || ySplit > 0) {
      const active = xSplit && ySplit ? 'bottomRight' : xSplit ? 'topRight' : 'bottomLeft';
      pane = `<pane${xSplit ? ` xSplit="${xSplit}"` : ''}${ySplit ? ` ySplit="${ySplit}"` : ''} topLeftCell="${columnLetter(xSplit)}${ySplit + 1}" activePane="${active}" state="frozen"/>`;
    }
    const rtl = first.direction === 'rtl' ? ' rightToLeft="1"' : '';
    const maxDepth = Math.min(MAX_OUTLINE, Math.max(0, ...models.map((m) => outlineDepth(m as ExportModel<unknown>))));
    await this.emit(
      `${HEAD}<worksheet xmlns="${NS}" xmlns:r="${REL_NS}">` +
        '<sheetPr><outlinePr summaryBelow="0"/></sheetPr>' +
        `<sheetViews><sheetView workbookViewId="0"${rtl}>${pane}</sheetView></sheetViews>` +
        `<sheetFormatPr defaultRowHeight="15"${maxDepth > 0 ? ` outlineLevelRow="${maxDepth}"` : ''}/>` +
        (cols ? `<cols>${cols}</cols>` : '') +
        '<sheetData>',
    );
    if (o.header) {
      await this.content(o.header.rows);
      for (let b = 0; b < (o.header.gap ?? 0); b++) await this.emit(`${this.rowOpen(0)}</row>`);
    }
    for (let i = 0; i < models.length; i++) {
      if (i > 0) for (let b = 0; b < (o.gap ?? 5); b++) await this.emit(`${this.rowOpen(0)}</row>`);
      await this.model(models[i] as ExportModel<Row>, { colOffset: 0, outline: 0 }, includeHeaders);
    }
    if (o.footer) {
      for (let b = 0; b < (o.footer.gap ?? 0); b++) await this.emit(`${this.rowOpen(0)}</row>`);
      await this.content(o.footer.rows);
    }
    await this.emit('</sheetData>');
    if (this.merges.length) await this.emit(`<mergeCells count="${this.merges.length}">${this.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`);
    await this.emit(`<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>${this.pictures ? '<drawing r:id="rId1"/>' : ''}</worksheet>`);
    await this.flush();
    await this.entry.close();
    return this.pictures;
  }

  private async content(rows: XlsxContent['rows']): Promise<void> {
    const serial = createSerial(undefined);
    for (const r of rows) {
      let xmlRow = this.rowOpen(0);
      let next = 0;
      const cells = [...r.cells].map((c) => {
        const index = c.column ?? next;
        next = index + (c.colSpan ?? 1);
        return { ...c, index };
      });
      cells.sort((a, b) => a.index - b.index);
      for (const c of cells) {
        const s = c.style ? this.book.styleId({ style: c.style, numFmt: null, indent: 0 }) : 0;
        const ds = this.book.styleId({ style: c.style ?? {}, numFmt: 14, indent: 0 });
        const value = c.value ?? null;
        xmlRow += this.valueCell(c.index, value, value instanceof Date ? value.toISOString() : value === null ? '' : String(value), s, ds, serial);
        if ((c.colSpan ?? 1) > 1 || (c.rowSpan ?? 1) > 1) this.merge(c.index, this.row, c.index + (c.colSpan ?? 1) - 1, this.row + (c.rowSpan ?? 1) - 1);
      }
      await this.emit(`${xmlRow}</row>`);
    }
  }

  private merge(c0: number, r0: number, c1: number, r1: number): void {
    if (c0 === c1 && r0 === r1) return;
    this.merges.push(`${this.ref(c0)}${r0}:${this.ref(c1)}${r1}`);
  }

  private async model(model: ExportModel<Row>, at: Placement, includeHeaders: boolean): Promise<void> {
    const book = this.book;
    const theme = this.theme;
    const columns = model.columns;
    const n = columns.length;
    const off = at.colOffset;
    const serial = createSerial(model.timeZone);
    const numFmts = columns.map((c) => excelNumberFormat(c.format, c.type));
    const align = (c: ExportColumn<Row>): ExportCellStyle => (c.textAlign === 'start' ? {} : { textAlign: c.textAlign });
    const recordStyles = columns.map((c, i) => book.styleId({ style: mergeStyle(theme.row, align(c)), numFmt: numFmts[i] ?? null, indent: 0 }));
    const dateStyles = columns.map((c, i) => book.styleId({ style: mergeStyle(theme.row, align(c)), numFmt: typeof numFmts[i] === 'string' || typeof numFmts[i] === 'number' ? (numFmts[i] as string | number) : 14, indent: 0 }));
    const aggregateFmt = (i: number, type: string): string | number | null => (type === 'count' || type === 'trueCount' || type === 'falseCount' ? null : (numFmts[i] ?? null));

    // --- header rows ---------------------------------------------------------
    if (includeHeaders && model.headerRows.length) {
      const top = this.row + 1;
      const depth = model.headerRows.length;
      const covered: boolean[][] = Array.from({ length: depth }, () => new Array<boolean>(n).fill(false));
      const anchors: (string | null)[][] = Array.from({ length: depth }, () => new Array<string | null>(n).fill(null));
      const aligns: ('start' | 'center' | 'end')[][] = Array.from({ length: depth }, () => new Array<'start' | 'center' | 'end'>(n).fill('start'));
      const styles: (ExportCellStyle | undefined)[][] = Array.from({ length: depth }, () => new Array<ExportCellStyle | undefined>(n).fill(undefined));
      model.headerRows.forEach((cells, level) => {
        for (const h of cells) {
          (anchors[level] as (string | null)[])[h.colIndex] = h.text;
          (aligns[level] as string[])[h.colIndex] = h.textAlign;
          if (h.style) for (let c = h.colIndex; c < Math.min(n, h.colIndex + h.colSpan); c++) (styles[level] as (ExportCellStyle | undefined)[])[c] = h.style;
          for (let r = level; r < Math.min(depth, level + h.rowSpan); r++) for (let c = h.colIndex; c < Math.min(n, h.colIndex + h.colSpan); c++) (covered[r] as boolean[])[c] = true;
          if (h.colSpan > 1 || h.rowSpan > 1) this.merge(off + h.colIndex, top + level, off + h.colIndex + h.colSpan - 1, top + level + h.rowSpan - 1);
        }
      });
      for (let level = 0; level < depth; level++) {
        let xmlRow = this.rowOpen(at.outline);
        for (let c = 0; c < n; c++) {
          const text = (anchors[level] as (string | null)[])[c] ?? null;
          const s = book.styleId({ style: mergeStyle(mergeStyle(theme.header, { textAlign: (aligns[level] as string[])[c] as 'start' }), (styles[level] as (ExportCellStyle | undefined)[])[c]), numFmt: null, indent: 0 });
          if (text !== null) xmlRow += this.textCell(off + c, text, s);
          else if ((covered[level] as boolean[])[c]) xmlRow += `<c r="${this.ref(off + c)}${this.row}" s="${s}"/>`;
        }
        await this.emit(`${xmlRow}</row>`);
      }
    }

    // --- body ------------------------------------------------------------------
    const mergeRepeated = this.options.mergeRepeatedValues === true;
    const keepCollapsed = this.options.outlineCollapsed === true;
    const runStart = new Int32Array(n).fill(-1);
    const runText: (string | null)[] = new Array<string | null>(n).fill(null);
    const coverUntil = new Int32Array(n);
    const closeRuns = (): void => {
      if (!mergeRepeated) return;
      for (let c = 0; c < n; c++) {
        const s = runStart[c] as number;
        if (s >= 0 && this.row > s) this.merge(off + c, s, off + c, this.row);
        runStart[c] = -1;
        runText[c] = null;
      }
    };
    const captionStyleCache = new Map<number, number>();
    const captionStyle = (depth: number): number => {
      let s = captionStyleCache.get(depth);
      if (s === undefined) {
        s = book.styleId({ style: theme.groupCaption, numFmt: null, indent: depth });
        captionStyleCache.set(depth, s);
      }
      return s;
    };
    const aggregateRow = async (cells: ExportAggregateCells, outline: number, first: string | null, firstStyle: number, style: ExportCellStyle): Promise<void> => {
      let xmlRow = this.rowOpen(outline);
      for (let c = 0; c < n; c++) {
        const a = cells[c] ?? null;
        if (c === 0 && first !== null) {
          xmlRow += this.textCell(off, a ? `${first} ${a.text}` : first, firstStyle);
          continue;
        }
        const cellStyle = mergeStyle(mergeStyle(style, align(columns[c] as ExportColumn<Row>)), a?.style);
        const s = book.styleId({ style: cellStyle, numFmt: a ? aggregateFmt(c, a.type) : null, indent: 0 });
        if (!a) {
          xmlRow += `<c r="${this.ref(off + c)}${this.row}" s="${s}"/>`;
          continue;
        }
        const ds = book.styleId({ style: cellStyle, numFmt: numFmts[c] ?? 14, indent: 0 });
        xmlRow += this.valueCell(off + c, a.value, a.text, s, ds, serial);
      }
      await this.emit(`${xmlRow}</row>`);
    };

    for (let i = 0; i < model.rowCount; i++) {
      const row: ExportRow<Row> = model.getRow(i);
      switch (row.kind) {
        case 'data': {
          let xmlRow = this.rowOpen(at.outline + row.depth, keepCollapsed && (row.hidden || row.collapsed) ? `${row.hidden ? ' hidden="1"' : ''}${row.collapsed ? ' collapsed="1"' : ''}` : '');
          const r = this.row;
          let skip = 0;
          let imageHeight = 0;
          for (let c = 0; c < n; c++) {
            const column = columns[c] as ExportColumn<Row>;
            if (skip > 0 || (coverUntil[c] as number) >= r) {
              if (skip > 0) skip--;
              continue;
            }
            let cell: ExportCell;
            let s = recordStyles[c] as number;
            let ds = dateStyles[c] as number;
            if (model.hasCellHook) {
              cell = model.cell(row as ExportDataRow<Row>, column);
              if (cell.style) {
                s = book.styleId({ style: mergeStyle(mergeStyle(theme.row, align(column)), cell.style), numFmt: numFmts[c] ?? null, indent: 0 });
                ds = book.styleId({ style: mergeStyle(mergeStyle(theme.row, align(column)), cell.style), numFmt: numFmts[c] ?? 14, indent: 0 });
              }
              const cs = Math.max(1, Math.min(n - c, cell.colSpan ?? 1));
              const rs = Math.max(1, cell.rowSpan ?? 1);
              if (cs > 1 || rs > 1) {
                this.merge(off + c, r, off + c + cs - 1, r + rs - 1);
                skip = cs - 1;
                if (rs > 1) for (let k = c; k < c + cs; k++) coverUntil[k] = r + rs - 1;
              }
              if (cell.image) imageHeight = Math.max(imageHeight, this.picture(off + c, r, cell.image));
            } else {
              cell = { value: column.value(row.row), text: this.typed ? '' : column.text(row.row), type: column.type };
            }
            if (mergeRepeated) {
              const text = this.typed && !model.hasCellHook ? column.text(row.row) : cell.text;
              if (runStart[c] !== -1 && runText[c] === text) {
                xmlRow += s ? `<c r="${this.ref(off + c)}${r}" s="${s}"/>` : '';
                continue;
              }
              const st = runStart[c] as number;
              if (st >= 0 && r - 1 > st) this.merge(off + c, st, off + c, r - 1);
              runStart[c] = r;
              runText[c] = text;
            }
            const value = cell.value;
            // Text is only needed for strings and the text mode; avoid formatting typed values.
            const text = this.typed && !model.hasCellHook && (typeof value !== 'string' && value !== null && typeof value === 'object') ? column.text(row.row) : this.typed && !model.hasCellHook && typeof value === 'string' ? value : cell.text;
            xmlRow += this.valueCell(off + c, value, text, s, ds, serial, cell.formula);
          }
          // A row grows to its tallest image (Excel caps row heights at 409 pt).
          if (imageHeight > 15) xmlRow = xmlRow.replace(`<row r="${r}"`, `<row r="${r}" ht="${Math.min(409, Math.ceil(imageHeight * 4) / 4)}" customHeight="1"`);
          await this.emit(`${xmlRow}</row>`);
          break;
        }
        case 'group': {
          closeRuns();
          await aggregateRow(row.aggregates, at.outline + row.depth, row.caption, captionStyle(row.depth), theme.groupCaption);
          break;
        }
        case 'groupFooter':
          closeRuns();
          await aggregateRow(row.aggregates, at.outline + row.depth + 1, null, 0, theme.aggregate);
          break;
        case 'aggregate':
          closeRuns();
          await aggregateRow(row.aggregates, at.outline, null, 0, theme.aggregate);
          break;
        case 'detail': {
          closeRuns();
          const detail = row.detail;
          for (const line of detail.text ?? []) await this.emit(`${this.rowOpen(at.outline + row.depth)}${this.textCell(off + 1, line, 0)}</row>`);
          if (detail.model) await this.model(detail.model as unknown as ExportModel<Row>, { colOffset: off + 1, outline: at.outline + row.depth }, true);
          break;
        }
      }
    }
    // Last row of open runs.
    if (mergeRepeated) {
      for (let c = 0; c < n; c++) {
        const s = runStart[c] as number;
        if (s >= 0 && this.row > s) this.merge(off + c, s, off + c, this.row);
      }
    }
    for (const f of model.footerRows) await aggregateRow(f.aggregates, at.outline, null, 0, theme.aggregate);
  }
}
