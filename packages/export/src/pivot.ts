// `@salmonui/export/pivot`: `exportPivot()` to XLSX, PDF or CSV. The XLSX and PDF writers
// load on first use, so this entry stays small. A pivot
// result as an export model, so the XLSX, PDF and CSV writers of the Data Grid
// write it unchanged: row header columns (compact: one indented column;
// tabular: one per row level), stacked merged column headers from the column
// tree, one row per visible leaf row with its tree depth as the outline
// level, subtotal and grand total styling, conditional formats, number
// formats, and a `cell` hook. Results are typed structurally, so a local
// `PivotResult` (`@salmonui/pivot-table/engine`), a remote snapshot
// (`@salmonui/data`) or a reference handler's `compute()` result all fit.
// A window source (the remote engine's `loadWindow`) is paged through.

import { exportFileName, runBeforeExport, streamCsv, writeCsv, type CsvOptions, type CsvStreamOptions } from '@salmonui/core/export-model';
import type { PdfOptions } from './pdf-writer.js';
import type { XlsxOptions } from './xlsx-writer.js';
import type {
  BeforeExportEvent,
  ExportCell,
  ExportCellOverride,
  ExportCellStyle,
  ExportColumn,
  ExportDataRow,
  ExportEvent,
  ExportFile,
  ExportFormat,
  ExportHeaderCell,
  ExportImage,
  ExportModel,
  ExportRow,
} from '@salmonui/core/export-model';

// ---------------------------------------------------------------------------
// Structural result types
// ---------------------------------------------------------------------------

type JsonLike = null | boolean | number | string | readonly JsonLike[] | { readonly [key: string]: JsonLike };

/** A header node (`PivotHeaderNode`). */
export interface PivotExportHeader {
  readonly key: string;
  readonly kind: 'member' | 'subtotal' | 'grandTotal' | 'value';
  readonly path: readonly JsonLike[];
  readonly field: string | null;
  readonly measure: string | null;
  readonly label: string;
  readonly depth: number;
  readonly position: number;
  readonly span: number;
  readonly children?: readonly PivotExportHeader[];
}

/** A value cell (`PivotCell`). */
export interface PivotExportCell {
  readonly rowIndex: number;
  readonly columnIndex: number;
  readonly measure: string | null;
  readonly value: number | null;
  readonly formattedValue: string;
  readonly kind: 'value' | 'subtotal' | 'grandTotal';
}

/** The part of `PivotModel` the export reads. */
export interface PivotExportModelLike {
  readonly rows?: readonly { readonly field: string; readonly caption?: string }[];
  readonly formats?: unknown;
  readonly conditionalFormats?: unknown;
}

/** A pivot result (`PivotResult`, a remote snapshot, or a reference handler `compute()` result). */
export interface PivotExportResult {
  readonly model: PivotExportModelLike;
  readonly rowCount: number;
  readonly columnCount: number;
  readonly rowDepth: number;
  readonly columnDepth: number;
  readonly rowTree: readonly PivotExportHeader[];
  readonly columnTree: readonly PivotExportHeader[];
  memberAt(axis: 'rows' | 'columns', index: number): PivotExportHeader;
  cellAt(rowIndex: number, columnIndex: number): PivotExportCell;
}

/** A remote result paged by window (`RemotePivotEngine` of `@salmonui/data`). */
export interface PivotWindowSource {
  loadWindow(range: { readonly rows: readonly [number, number]; readonly columns: readonly [number, number] }, options?: { readonly signal?: unknown }): Promise<PivotExportResult>;
}

export type PivotExportSource = PivotExportResult | PivotWindowSource;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface PivotExportCellContext {
  /** Leaf row and column headers; `column` is null in row header columns. */
  readonly row: PivotExportHeader;
  readonly column: PivotExportHeader | null;
  /** The value cell; null in row header columns. */
  readonly pivotCell: PivotExportCell | null;
  /** Row header level (tabular layout) or -1 for value cells. */
  readonly level: number;
  /** The computed export cell. */
  readonly cell: ExportCell;
}

export interface PivotExportHeaderContext {
  /** The column header node; null for the row header captions. */
  readonly header: PivotExportHeader | null;
  readonly text: string;
  readonly level: number;
  readonly colIndex: number;
}

export interface PivotExportStyles {
  readonly rowHeader?: ExportCellStyle;
  readonly subtotal?: ExportCellStyle;
  readonly grandTotal?: ExportCellStyle;
}

/** Options of every pivot export format. */
export interface PivotExportOptions {
  /** File name; the extension is added. Default `export`. */
  readonly fileName?: string;
  /** `compact` (default): one indented row header column; `tabular`: one column per row level. */
  readonly rowLayout?: 'compact' | 'tabular';
  /** Row header columns. Default true. */
  readonly rowHeaders?: boolean;
  /** Header text of the row header column(s). Default: the row field captions. */
  readonly rowHeaderCaption?: string;
  /** Column widths in CSS px. Defaults 200 (row headers) and 110. */
  readonly rowHeaderWidth?: number;
  readonly columnWidth?: number;
  /** Exported value columns (hidden columns, current page only). Default every leaf column. */
  readonly includeColumn?: (header: PivotExportHeader, index: number) => boolean;
  /** Exported leaf row positions `[start, end)` (current page only). Default every row. */
  readonly rowRange?: readonly [number, number];
  /** Exported rows. Default every visible leaf row. */
  readonly includeRow?: (header: PivotExportHeader, index: number) => boolean;
  /** Subtotal, grand total and row header styles (merged under conditional formats and the hook). */
  readonly pivotStyles?: PivotExportStyles;
  /** Per body cell. */
  readonly cell?: (ctx: PivotExportCellContext) => ExportCellOverride | null | undefined | void;
  /** Per header cell. */
  readonly headerCell?: (ctx: PivotExportHeaderContext) => { readonly text?: string; readonly style?: ExportCellStyle } | null | undefined | void;
  /** Window sources: cells per `pivot` request while paging. Default 200,000. */
  readonly windowCells?: number;
  /** Locale of the model (number formats in PDF / CSV come from `formattedValue`). */
  readonly locale?: string;
}

export interface PivotExportHandlers<Data = Uint8Array> {
  readonly onBeforeExport?: (event: BeforeExportEvent) => void;
  readonly onExport?: (event: ExportEvent<Data>) => void;
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/** Excel number format code of `Intl.NumberFormat` options (supplied by the XLSX writer). */
export type PivotNumberFormatCode = (options: Intl.NumberFormatOptions) => string | number | null;

interface ConditionalFormat {
  readonly measure?: string;
  readonly operator: string;
  readonly value: number;
  readonly value2?: number;
  readonly tone?: string;
  readonly style?: Readonly<Record<string, string>>;
  readonly applyGrandTotals?: boolean;
}

/** Export colors of the conditional format tones (light fills, dark text). */
const TONES: Readonly<Record<string, ExportCellStyle>> = {
  accent: { backgroundColor: '#DBEAFE', color: '#1E3A8A' },
  success: { backgroundColor: '#DCFCE7', color: '#14532D' },
  warning: { backgroundColor: '#FEF3C7', color: '#78350F' },
  danger: { backgroundColor: '#FEE2E2', color: '#7F1D1D' },
  neutral: { backgroundColor: '#F3F4F6', color: '#111827' },
};

const hex = (c: string | undefined): string | undefined => (c && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(c.trim()) ? c.trim() : undefined);

function conditionalStyle(f: ConditionalFormat): ExportCellStyle {
  const s = f.style ?? {};
  const bg = hex(s['backgroundColor'] ?? s['background-color'] ?? s['background']);
  const color = hex(s['color']);
  const weight = s['fontWeight'] ?? s['font-weight'];
  return {
    ...(f.tone ? TONES[f.tone] : {}),
    ...(bg ? { backgroundColor: bg } : {}),
    ...(color ? { color } : {}),
    ...(weight === 'bold' || Number(weight) >= 600 ? { bold: true } : {}),
  };
}

function matches(f: ConditionalFormat, v: number): boolean {
  const a = f.value;
  const b = f.value2 ?? a;
  switch (f.operator) {
    case 'equal':
      return v === a;
    case 'notEqual':
      return v !== a;
    case 'greaterThan':
      return v > a;
    case 'greaterThanOrEqual':
      return v >= a;
    case 'lessThan':
      return v < a;
    case 'lessThanOrEqual':
      return v <= a;
    case 'between':
      return v >= Math.min(a, b) && v <= Math.max(a, b);
    case 'notBetween':
      return v < Math.min(a, b) || v > Math.max(a, b);
    default:
      return false;
  }
}

const STUB = Object.freeze({}) as ExportColumn<number>['column'];
const BOLD: ExportCellStyle = { bold: true };

function leafPositions(tree: readonly PivotExportHeader[], count: number): PivotExportHeader[][] {
  // Root-to-leaf chain per visible position (tabular row headers).
  const chains: PivotExportHeader[][] = new Array(count);
  const walk = (node: PivotExportHeader, chain: PivotExportHeader[]): void => {
    const next = [...chain, node];
    const kids = node.children ?? [];
    if (kids.length === 0) {
      for (let p = node.position; p < Math.min(count, node.position + node.span); p++) chains[p] ??= next;
      return;
    }
    for (const k of kids) walk(k, next);
    // Positions of the node not covered by a child (a subtotal or collapsed part).
    for (let p = node.position; p < Math.min(count, node.position + node.span); p++) chains[p] ??= next;
  };
  for (const root of tree) walk(root, []);
  return chains;
}

/**
 * The export model of a pivot result: `writeXlsx`, `writePdf`, `writeCsv`
 * and `streamCsv` accept it. `numberFormat` turns the model's `formats` into
 * Excel codes (the XLSX entry passes the writer's converter).
 */
export function createPivotExportModel(result: PivotExportResult, options: PivotExportOptions = {}, numberFormat?: PivotNumberFormatCode): ExportModel<number> {
  const model = result.model;
  const tabular = options.rowLayout === 'tabular';
  const rowFields = model.rows ?? [];
  const styles = options.pivotStyles ?? {};
  const formats = (model.formats ?? {}) as Readonly<Record<string, { readonly number?: Intl.NumberFormatOptions } | undefined>>;
  const conditional = (Array.isArray(model.conditionalFormats) ? model.conditionalFormats : []) as readonly ConditionalFormat[];

  // Rows and columns kept, by position.
  const rowsKept: number[] = [];
  let maxDepth = 0;
  const rowEnd = Math.min(result.rowCount, options.rowRange?.[1] ?? result.rowCount);
  for (let r = Math.max(0, options.rowRange?.[0] ?? 0); r < rowEnd; r++) {
    const h = result.memberAt('rows', r);
    if (options.includeRow && !options.includeRow(h, r)) continue;
    rowsKept.push(r);
    if (h.depth > maxDepth) maxDepth = h.depth;
  }
  const colsKept: number[] = [];
  const colIndexOf = new Map<number, number>();
  for (let c = 0; c < result.columnCount; c++) {
    const h = result.memberAt('columns', c);
    if (options.includeColumn && !options.includeColumn(h, c)) continue;
    colIndexOf.set(c, colsKept.length);
    colsKept.push(c);
  }
  const levels = options.rowHeaders === false ? 0 : tabular ? Math.max(1, rowFields.length, maxDepth + 1) : 1;
  const chains = tabular && levels ? leafPositions(result.rowTree, result.rowCount) : null;

  const codes = new Map<string, string | number | null>();
  const codeOf = (measure: string | null): string | number | null => {
    if (!numberFormat || measure === null) return null;
    if (!codes.has(measure)) {
      const n = formats[measure]?.number;
      codes.set(measure, n ? numberFormat(n) : null);
    }
    return codes.get(measure) as string | number | null;
  };

  // Columns
  const caption = (l: number): string => options.rowHeaderCaption ?? (tabular ? (rowFields[l]?.caption ?? rowFields[l]?.field ?? '') : rowFields.map((f) => f.caption ?? f.field).join(' / '));
  const columns: ExportColumn<number>[] = [];
  const firstRow = rowsKept[0] ?? 0;
  const labelOf = (r: number, l: number): string => {
    const leaf = result.memberAt('rows', r);
    if (!chains || l === leaf.depth) return leaf.label;
    // Tabular: an outer member label shows on the first row of its member (or of the export).
    const node = l < leaf.depth ? chains[r]?.[l] : undefined;
    return node && (node.position === r || r === firstRow) ? node.label : '';
  };
  for (let l = 0; l < levels; l++) {
    columns.push({
      index: l,
      columnId: `row:${l}`,
      field: rowFields[l]?.field ?? null,
      headerText: caption(l),
      type: 'string',
      width: options.rowHeaderWidth ?? (tabular ? 140 : 200),
      textAlign: 'start',
      format: null,
      freeze: 'left',
      visible: true,
      column: STUB,
      value: (r) => labelOf(r, l),
      text: (r) => labelOf(r, l),
    });
  }
  for (const c of colsKept) {
    const h = result.memberAt('columns', c);
    columns.push({
      index: columns.length,
      columnId: h.key || `column:${c}`,
      field: h.measure,
      headerText: h.label,
      type: 'number',
      width: options.columnWidth ?? 110,
      textAlign: 'end',
      format: null,
      freeze: null,
      visible: true,
      column: STUB,
      value: (r) => result.cellAt(r, c).value,
      text: (r) => result.cellAt(r, c).formattedValue,
    });
  }

  // Header rows: the column tree as stacked merged headers, row captions on the left.
  const depth = Math.max(1, result.columnDepth);
  const headerRows: ExportHeaderCell[][] = Array.from({ length: depth }, () => []);
  const header = (level: number, cell: ExportHeaderCell, node: PivotExportHeader | null): void => {
    const patch = options.headerCell?.({ header: node, text: cell.text, level, colIndex: cell.colIndex });
    (headerRows[level] as ExportHeaderCell[]).push(patch ? { ...cell, ...(patch.text !== undefined ? { text: patch.text } : {}), ...(patch.style ? { style: patch.style } : {}) } : cell);
  };
  for (let l = 0; l < levels; l++) header(0, { text: caption(l), columnId: `row:${l}`, colIndex: l, colSpan: 1, rowSpan: depth, leaf: true, textAlign: 'start' }, null);
  const visit = (node: PivotExportHeader): void => {
    let first = -1;
    let span = 0;
    for (let p = node.position; p < node.position + node.span; p++) {
      const at = colIndexOf.get(p);
      if (at === undefined) continue;
      if (first < 0) first = at;
      span++;
    }
    if (span === 0) return;
    const kids = node.children ?? [];
    const level = Math.min(depth - 1, node.depth);
    const leaf = kids.length === 0;
    const style = node.kind === 'grandTotal' ? (styles.grandTotal ?? BOLD) : node.kind === 'subtotal' ? (styles.subtotal ?? BOLD) : undefined;
    header(
      level,
      { text: node.label, columnId: node.key, colIndex: levels + first, colSpan: span, rowSpan: leaf ? depth - level : 1, leaf, textAlign: leaf ? 'end' : 'center', ...(style ? { style } : {}) },
      node,
    );
    for (const k of kids) visit(k);
  };
  for (const root of result.columnTree) visit(root);
  for (const row of headerRows) row.sort((a, b) => a.colIndex - b.colIndex);

  const totalStyle = (kind: string): ExportCellStyle | undefined => (kind === 'grandTotal' ? (styles.grandTotal ?? BOLD) : kind === 'subtotal' ? (styles.subtotal ?? BOLD) : undefined);
  const rowAt = (i: number): ExportDataRow<number> => {
    const r = rowsKept[i] as number;
    return { kind: 'data', index: i, id: String(r), row: r, depth: Math.min(7, result.memberAt('rows', r).depth) };
  };

  const cell = (row: ExportDataRow<number>, column: ExportColumn<number>): ExportCell => {
    const r = row.row;
    const leaf = result.memberAt('rows', r);
    let out: ExportCell;
    let pivotCell: PivotExportCell | null = null;
    let columnHeader: PivotExportHeader | null = null;
    if (column.index < levels) {
      const text = labelOf(r, column.index);
      const rowStyle = { ...styles.rowHeader, ...totalStyle(leaf.kind), ...(chains ? {} : { indent: leaf.depth }) };
      out = { value: text, text, type: 'string', style: rowStyle };
    } else {
      const c = colsKept[column.index - levels] as number;
      columnHeader = result.memberAt('columns', c);
      pivotCell = result.cellAt(r, c);
      const v = pivotCell.value;
      let style: ExportCellStyle = { ...totalStyle(leaf.kind), ...totalStyle(columnHeader.kind) };
      const code = codeOf(pivotCell.measure);
      if (typeof code === 'string') style = { ...style, numberFormat: code };
      if (v !== null) {
        for (const f of conditional) {
          if (f.measure !== undefined && f.measure !== pivotCell.measure) continue;
          if (pivotCell.kind === 'grandTotal' && f.applyGrandTotals === false) continue;
          if (matches(f, v)) style = { ...style, ...conditionalStyle(f) };
        }
      }
      out = { value: v, text: pivotCell.formattedValue, type: 'number', ...(Object.keys(style).length ? { style } : {}) };
    }
    const patch = options.cell?.({ row: leaf, column: columnHeader, pivotCell, level: pivotCell ? -1 : column.index, cell: out });
    if (!patch) return out;
    const merged = { ...out, ...patch, ...(patch.style ? { style: { ...out.style, ...patch.style } } : {}) };
    return 'value' in patch && patch.text === undefined ? { ...merged, text: patch.value == null ? '' : String(patch.value) } : merged;
  };

  return {
    scope: 'filtered',
    columns,
    headerRows,
    rowCount: rowsKept.length,
    dataRowCount: rowsKept.length,
    detailRowCount: 0,
    groupDepth: maxDepth,
    footerRows: [],
    frozen: { left: levels, right: 0, top: 0 },
    locale: options.locale ?? 'en-US',
    direction: 'ltr',
    timeZone: undefined,
    hasCellHook: true,
    getRow: rowAt as (index: number) => ExportRow<number>,
    *rows() {
      for (let i = 0; i < rowsKept.length; i++) yield rowAt(i);
    },
    cell,
  };
}

// ---------------------------------------------------------------------------
// Window sources
// ---------------------------------------------------------------------------

const ALL = Number.MAX_SAFE_INTEGER;

export function isPivotWindowSource(source: PivotExportSource): source is PivotWindowSource {
  return typeof (source as PivotWindowSource).loadWindow === 'function' && typeof (source as PivotExportResult).cellAt !== 'function';
}

/** Merges the header trees of several windows (nodes by key, children by position). */
function mergeTrees(lists: readonly (readonly PivotExportHeader[])[]): PivotExportHeader[] {
  type Node = { -readonly [K in keyof PivotExportHeader]: PivotExportHeader[K] } & { children: Node[] };
  const byKey = new Map<string, Node>();
  const roots: Node[] = [];
  const add = (h: PivotExportHeader, into: Node[]): void => {
    const id = `${h.position}:${h.depth}:${h.key}`;
    let node = byKey.get(id);
    if (!node) {
      node = { ...h, children: [] };
      byKey.set(id, node);
      into.push(node);
    }
    for (const k of h.children ?? []) add(k, node.children);
  };
  for (const list of lists) for (const h of list) add(h, roots);
  const sort = (list: Node[]): void => {
    list.sort((a, b) => a.position - b.position);
    for (const n of list) sort(n.children);
  };
  sort(roots);
  return roots;
}

/**
 * Pages a window source into one in-memory result: all columns, row windows
 * of `windowCells` cells. Values are kept as numbers (8 bytes per cell) and
 * the cell text is kept per distinct value and measure.
 */
export async function loadPivotResult(source: PivotWindowSource, options: { readonly windowCells?: number; readonly signal?: unknown } = {}): Promise<PivotExportResult> {
  const signal = options.signal ? { signal: options.signal } : {};
  const first = await source.loadWindow({ rows: [0, 1], columns: [0, ALL] }, signal);
  const rows = first.rowCount;
  const cols = first.columnCount;
  const values = new Float64Array(rows * cols).fill(NaN);
  const leaves: PivotExportHeader[] = new Array(rows);
  const measures: (string | null)[] = new Array(rows * cols);
  const kinds = new Uint8Array(rows * cols);
  const texts = new Map<string, string>();
  const trees: (readonly PivotExportHeader[])[] = [];
  const step = Math.max(1, Math.floor((options.windowCells ?? 200_000) / Math.max(1, cols)));
  for (let r0 = 0; r0 < rows; r0 += step) {
    const r1 = Math.min(rows, r0 + step);
    const w = r0 === 0 && r1 === 1 ? first : await source.loadWindow({ rows: [r0, r1], columns: [0, cols] }, signal);
    trees.push(w.rowTree);
    for (let r = r0; r < r1; r++) {
      leaves[r] = w.memberAt('rows', r);
      for (let c = 0; c < cols; c++) {
        const cell = w.cellAt(r, c);
        const at = r * cols + c;
        measures[at] = cell.measure;
        kinds[at] = cell.kind === 'grandTotal' ? 2 : cell.kind === 'subtotal' ? 1 : 0;
        if (cell.value !== null) {
          values[at] = cell.value;
          texts.set(`${cell.measure}|${cell.value}`, cell.formattedValue);
        }
      }
    }
  }
  const columnLeaves = Array.from({ length: cols }, (_, c) => first.memberAt('columns', c));
  return {
    model: first.model,
    rowCount: rows,
    columnCount: cols,
    rowDepth: first.rowDepth,
    columnDepth: first.columnDepth,
    rowTree: mergeTrees(trees),
    columnTree: first.columnTree,
    memberAt: (a, i) => (a === 'rows' ? (leaves[i] as PivotExportHeader) : (columnLeaves[i] as PivotExportHeader)),
    cellAt(r, c) {
      const at = r * cols + c;
      const v = values[at] as number;
      const measure = measures[at] ?? null;
      const value = Number.isNaN(v) ? null : v;
      return { rowIndex: r, columnIndex: c, measure, value, formattedValue: value === null ? '' : (texts.get(`${measure}|${value}`) ?? String(value)), kind: kinds[at] === 2 ? 'grandTotal' : kinds[at] === 1 ? 'subtotal' : 'value' };
    },
  };
}

/** @internal Resolves a source to a result (window sources are paged). */
export function resolvePivotResult(source: PivotExportSource, options: PivotExportOptions & { readonly signal?: unknown }): Promise<PivotExportResult> {
  return isPivotWindowSource(source) ? loadPivotResult(source, options) : Promise.resolve(source);
}

/**
 * @internal One pivot export: `onBeforeExport`, the results (window sources
 * paged), the writer, then `onExport`. Resolves to null when prevented.
 */
export async function runPivotExport<Data>(
  format: ExportFormat,
  source: PivotExportSource | readonly PivotExportSource[],
  options: PivotExportOptions,
  handlers: PivotExportHandlers<Data>,
  extension: string,
  mimeType: string,
  write: (results: readonly PivotExportResult[]) => Promise<Data>,
): Promise<ExportFile<Data> | null> {
  if (!runBeforeExport(handlers, format)) return null;
  const list: readonly PivotExportSource[] = Array.isArray(source) ? (source as readonly PivotExportSource[]) : [source as PivotExportSource];
  const file = (async (): Promise<ExportFile<Data>> => {
    const results: PivotExportResult[] = [];
    for (const s of list) results.push(await resolvePivotResult(s, options));
    return { fileName: exportFileName(options.fileName, extension), mimeType, data: await write(results) };
  })();
  handlers.onExport?.({ format, file });
  return file;
}

// ---------------------------------------------------------------------------
// exportPivot
// ---------------------------------------------------------------------------

export type PivotExportFormat = 'xlsx' | 'pdf' | 'csv';

/** `exportPivot()` options: the pivot options, the format, and that format's writer options. */
export interface PivotFileExportOptions extends PivotExportOptions {
  /** Default `xlsx`. */
  readonly format?: PivotExportFormat;
  /** XLSX writer options (sheet names, `layout: 'stacked'` for several results on one sheet, header and footer rows, styles). */
  readonly xlsx?: XlsxOptions;
  /** PDF writer options (page size, orientation, font, page header and footer). */
  readonly pdf?: PdfOptions;
  /** CSV options (delimiter, BOM; `values: 'formatted'` writes the formatted texts instead of the raw numbers). */
  readonly csv?: CsvOptions;
  /**
   * PDF only: chart image(s) (PNG or JPEG bytes with their CSS px size, e.g.
   * from `Chart`'s `toBlob('png')`), each on its own page after the table:
   * table and chart in one PDF. Same as `pdf.appendImages`.
   */
  readonly chart?: ExportImage | readonly ExportImage[];
}

/**
 * Exports a pivot result (or a window source, paged) as XLSX
 * (default; several results become one sheet each, or `xlsx.layout:
 * 'stacked'`), PDF or CSV. XLSX: an outlined sheet with stacked merged column
 * headers, row outline levels, number formats from `model.formats`, subtotal
 * and grand total styles, conditional formats and the `cell` hook.
 * PDF: the same table with the column headers repeated on every page, then one page per `chart` image. CSV: one header line of column paths (`2024 / Sum of Amount`,
 * the labels of every column header level joined), then raw numbers, or the
 * formatted texts with `csv.values: 'formatted'`. Resolves to
 * `{ fileName, mimeType, data }`, or null when `onBeforeExport` prevents it.
 */
export function exportPivot(source: PivotExportSource, options: PivotFileExportOptions & { readonly format: 'csv' }, handlers?: PivotExportHandlers<string>): Promise<ExportFile<string> | null>;
export function exportPivot(source: PivotExportSource | readonly PivotExportSource[], options?: PivotFileExportOptions & { readonly format?: 'xlsx' | 'pdf' }, handlers?: PivotExportHandlers): Promise<ExportFile | null>;
export function exportPivot(source: PivotExportSource | readonly PivotExportSource[], options?: PivotFileExportOptions, handlers?: PivotExportHandlers<Uint8Array | string>): Promise<ExportFile<Uint8Array | string> | null>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function exportPivot(source: PivotExportSource | readonly PivotExportSource[], options: PivotFileExportOptions = {}, handlers: PivotExportHandlers<any> = {}): Promise<ExportFile<Uint8Array | string> | null> {
  const format = options.format ?? 'xlsx';
  if (format === 'csv') return runPivotExport('csv', source, options, handlers, 'csv', 'text/csv', async ([result]) => writeCsv(createPivotCsvModel(result as PivotExportResult, options), csvDefaults(options.csv)));
  if (format === 'pdf') {
    return runPivotExport('pdf', source, options, handlers, 'pdf', 'application/pdf', async ([result]) => {
      const { writePdf } = await import('./pdf-writer.js');
      const charts = options.chart ? (Array.isArray(options.chart) ? (options.chart as readonly ExportImage[]) : [options.chart as ExportImage]) : [];
      const pdf = charts.length ? { ...options.pdf, appendImages: [...(options.pdf?.appendImages ?? []), ...charts] } : options.pdf;
      return writePdf(createPivotExportModel(result as PivotExportResult, options), pdf);
    });
  }
  return runPivotExport('excel', source, options, handlers, 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', async (results) => {
    const { writeXlsx, excelNumberFormat } = await import('./xlsx-writer.js');
    const code = (o: Intl.NumberFormatOptions): string | number | null =>
      excelNumberFormat({ kind: 'number', style: o.style === 'currency' || o.style === 'percent' ? o.style : 'decimal', pattern: null, options: o as never }, 'number');
    return writeXlsx(results.map((r) => createPivotExportModel(r, options, code)), { freezeHeader: true, ...options.xlsx });
  });
}

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

export interface PivotCsvStreamOptions extends PivotExportOptions, CsvStreamOptions {
  readonly signal?: unknown;
}

/** Separator of the column path labels in the CSV header (as the React built-in CSV). */
const PATH_SEPARATOR = ' / ';

/** Pivot CSV writes raw numbers unless `values: 'formatted'` is asked for. */
const csvDefaults = <O extends CsvOptions>(options: O | undefined): O => ({ ...options, values: options?.values ?? 'raw' }) as O;

/**
 * The export model with a single CSV header line: each value column's header
 * is its column path, the texts of every header cell above it (header hooks
 * applied) joined by ` / `; stacked merged headers have no CSV form.
 */
function createPivotCsvModel(result: PivotExportResult, options: PivotExportOptions): ExportModel<number> {
  const model = createPivotExportModel(result, options);
  const paths: string[][] = model.columns.map(() => []);
  for (const row of model.headerRows) {
    for (const h of row) {
      const end = Math.min(paths.length, h.colIndex + Math.max(1, h.colSpan));
      for (let i = h.colIndex; i < end; i++) (paths[i] as string[]).push(h.text);
    }
  }
  const headerRow: ExportHeaderCell[] = model.columns.map((c, i) => ({
    text: (paths[i] as string[]).join(PATH_SEPARATOR) || c.headerText,
    columnId: c.columnId,
    colIndex: i,
    colSpan: 1,
    rowSpan: 1,
    leaf: true,
    textAlign: c.textAlign,
  }));
  return { ...model, headerRows: [headerRow] };
}

/**
 * Streams a pivot as CSV chunks (large results). A result streams
 * through `streamCsv`; a window source is paged one row window at a time and
 * never held whole.
 */
export async function* streamPivotCsv(source: PivotExportSource, options: PivotCsvStreamOptions = {}): AsyncGenerator<string, void, undefined> {
  if (!isPivotWindowSource(source)) {
    yield* streamCsv(createPivotCsvModel(source, options), csvDefaults(options));
    return;
  }
  const signal = options.signal ? { signal: options.signal } : {};
  const first = await source.loadWindow({ rows: [0, 1], columns: [0, ALL] }, signal);
  const step = Math.max(1, Math.floor((options.windowCells ?? 200_000) / Math.max(1, first.columnCount)));
  for (let r0 = 0; r0 < first.rowCount || r0 === 0; r0 += step) {
    const r1 = Math.min(first.rowCount, r0 + step);
    const w = r0 === 0 && r1 === 1 ? first : await source.loadWindow({ rows: [r0, r1], columns: [0, first.columnCount] }, signal);
    const part: PivotCsvStreamOptions = csvDefaults({ ...options, rowRange: [r0, r1], ...(r0 > 0 ? { includeHeaders: false, bom: false } : {}) });
    yield* streamCsv(createPivotCsvModel(w, part), part);
    if (r1 >= first.rowCount) break;
  }
}
