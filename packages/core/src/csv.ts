// CSV writer over the export model. Dependency-free, so it lives in @salmonui/core. `writeCsv`
// returns one string; `streamCsv` streams the same text as an async iterator
// of chunks and yields to the event loop between time slices, so a large
// export never blocks the main thread for more than one slice.

import { escapeCsvFormula, isFormulaText } from './csv-formula.js';
import { createExportModel, isExportCapableEngine, type ExportAggregateCells, type ExportColumn, type ExportEngine, type ExportModel, type ExportModelOptions, type ExportRow } from './export-model.js';

export interface CsvOptions {
  /** Default `,`. */
  readonly delimiter?: string;
  /** Default `\r\n` (RFC 4180). */
  readonly lineBreak?: string;
  /** Header line with the leaf header texts. Default true. */
  readonly includeHeaders?: boolean;
  /** `formatted` (default): the column display text. `raw`: numbers and booleans as is, dates as ISO 8601. */
  readonly values?: 'formatted' | 'raw';
  /** Group caption, group footer, and grid footer aggregate lines. Default true. */
  readonly aggregateRows?: boolean;
  /** Prefix a UTF-8 byte order mark (Excel detects UTF-8). Default false. */
  readonly bom?: boolean;
  /** Quote every field instead of only those that need it. Default false. */
  readonly quoteAll?: boolean;
  /** Neutralize spreadsheet formulas in text cells: a leading `'` on tab, CR, or `=`, `+`, `-`, `@` after optional whitespace. Real numbers are kept. Default true; `false` writes raw text. */
  readonly escapeFormulas?: boolean;
  /**
   * Tree mode: a leading column with each row's tree depth (0 for
   * roots). `true` names it `Depth`; a string is the header text. Ignored
   * outside tree mode.
   */
  readonly treeDepthColumn?: boolean | string;
}

export interface CsvStreamOptions extends CsvOptions {
  /** Upper bound of rows per chunk. Default 5,000. */
  readonly chunkRows?: number;
  /** Time slice per chunk in ms; a chunk ends early when it runs longer. Default 25. */
  readonly sliceMs?: number;
  /** Awaited between chunks. Default: a macrotask (`setTimeout(0)`) when available, else a resolved promise. */
  readonly yield?: () => Promise<void>;
}

/** Export model source: a prebuilt model or an engine with the `export` module. */
export type ExportSource<Row> = ExportModel<Row> | ExportEngine<Row>;

/** Resolves an export source to a model. */
export function resolveExportModel<Row>(source: ExportSource<Row>, options?: ExportModelOptions<Row>): ExportModel<Row> {
  if (isExportCapableEngine<Row>(source)) return createExportModel(source, options);
  if (typeof (source as ExportModel<Row>).getRow === 'function') return source as ExportModel<Row>;
  return createExportModel(source as ExportEngine<Row>, options);
}

interface Writer<Row> {
  header: string | null;
  row(r: ExportRow<Row>): string | null;
  footers: string[];
  lineBreak: string;
  bom: boolean;
}

function createWriter<Row>(model: ExportModel<Row>, options: CsvOptions): Writer<Row> {
  const delimiter = options.delimiter ?? ',';
  if (delimiter.length === 0 || /["\r\n]/.test(delimiter)) throw new Error('CSV delimiter must be non-empty and contain no quote or line break.');
  const lineBreak = options.lineBreak ?? '\r\n';
  const raw = options.values === 'raw';
  const quoteAll = options.quoteAll === true;
  const escapeFormulas = options.escapeFormulas !== false;
  const aggregateRows = options.aggregateRows !== false;
  const special = new RegExp(`["\\r\\n]|${delimiter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  const columns = model.columns;
  const count = columns.length;
  const hook = model.hasCellHook;
  const depthColumn = model.tree && options.treeDepthColumn ? (typeof options.treeDepthColumn === 'string' ? options.treeDepthColumn : 'Depth') : null;

  const quote = (t: string): string => (quoteAll || special.test(t) ? `"${t.replace(/"/g, '""')}"` : t);
  const field = (text: string, value?: unknown): string => quote(escapeFormulas ? escapeCsvFormula(text, value) : text);
  const rawText = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : value.toISOString();
    return String(value);
  };
  const textOf = raw
    ? (column: ExportColumn<Row>, row: Row) => rawText(column.value(row))
    : (column: ExportColumn<Row>, row: Row) => column.text(row);
  const aggregateLine = (cells: ExportAggregateCells, first: string | null): string => {
    let out = '';
    for (let c = 0; c < count; c++) {
      if (c) out += delimiter;
      const cell = cells[c] ?? null;
      let text = cell ? (raw ? rawText(cell.value) : cell.text) : '';
      if (c === 0 && first !== null) text = text ? `${first} ${text}` : first;
      out += field(text, c === 0 && first !== null ? undefined : cell?.value);
    }
    return out;
  };

  let header: string | null = null;
  if (options.includeHeaders !== false) {
    // Leaf header texts (header hooks applied); stacked group headers have no CSV form.
    const leaf: (string | undefined)[] = [];
    for (const row of model.headerRows) for (const h of row) if (h.leaf) leaf[h.colIndex] = h.text;
    header = columns.map((c, i) => field(leaf[i] ?? c.headerText)).join(delimiter);
    if (depthColumn !== null) header = field(depthColumn) + delimiter + header;
  }

  const body = (r: ExportRow<Row>): string | null => {
    switch (r.kind) {
      case 'data': {
        let out = '';
        if (hook) {
          for (let c = 0; c < count; c++) {
            if (c) out += delimiter;
            const cell = model.cell(r, columns[c] as ExportColumn<Row>);
            out += field(raw ? rawText(cell.value) : cell.text, cell.value);
          }
          return out;
        }
        const data = r.row;
        for (let c = 0; c < count; c++) {
          if (c) out += delimiter;
          const column = columns[c] as ExportColumn<Row>;
          const t = textOf(column, data);
          // The typed value is read only for the rare formula-like text.
          out += quote(escapeFormulas && isFormulaText(t) ? escapeCsvFormula(t, column.value(data)) : t);
        }
        return out;
      }
      case 'group':
        return aggregateRows ? aggregateLine(r.aggregates, r.caption) : null;
      case 'groupFooter':
      case 'aggregate':
        return aggregateRows ? aggregateLine(r.aggregates, null) : null;
      case 'detail':
        // Detail blocks (child grids, templates) have no CSV form; XLSX and PDF write them.
        return null;
    }
  };
  // The depth column: the row depth on data rows, empty on aggregate lines.
  const row =
    depthColumn === null
      ? body
      : (r: ExportRow<Row>): string | null => {
          const line = body(r);
          return line === null ? null : (r.kind === 'data' ? String(r.depth) : '') + delimiter + line;
        };
  const footers = aggregateRows ? model.footerRows.map((f) => (depthColumn === null ? '' : delimiter) + aggregateLine(f.aggregates, null)) : [];
  return { header, row, footers, lineBreak, bom: options.bom === true };
}

/** Writes the whole model as one CSV string. */
export function writeCsv<Row>(model: ExportModel<Row>, options: CsvOptions = {}): string {
  const w = createWriter(model, options);
  const lines: string[] = [];
  if (w.header !== null) lines.push(w.header);
  for (let i = 0; i < model.rowCount; i++) {
    const line = w.row(model.getRow(i));
    if (line !== null) lines.push(line);
  }
  lines.push(...w.footers);
  const text = lines.length ? lines.join(w.lineBreak) + w.lineBreak : '';
  return w.bom ? `﻿${text}` : text;
}

const defaultYield = (): Promise<void> => {
  const timer = (globalThis as { setTimeout?: (fn: () => void, ms: number) => unknown }).setTimeout;
  return timer ? new Promise((resolve) => void timer(resolve, 0)) : Promise.resolve();
};

/**
 * Streams the model as CSV chunks. Each chunk is complete lines; chunks end
 * at `chunkRows` rows or after `sliceMs`, then the iterator awaits `yield`
 * before producing the next one. Pipe into a `WritableStream`, a file, or
 * collect into a `Blob`.
 */
export async function* streamCsv<Row>(model: ExportModel<Row>, options: CsvStreamOptions = {}): AsyncGenerator<string, void, undefined> {
  const w = createWriter(model, options);
  const chunkRows = Math.max(1, options.chunkRows ?? 5000);
  const sliceMs = Math.max(1, options.sliceMs ?? 25);
  const pause = options.yield ?? defaultYield;
  const lb = w.lineBreak;
  let parts: string[] = [];
  if (w.bom) parts.push('﻿');
  if (w.header !== null) parts.push(w.header, lb);
  let i = 0;
  while (i < model.rowCount) {
    const started = Date.now();
    const end = Math.min(model.rowCount, i + chunkRows);
    for (; i < end; i++) {
      const line = w.row(model.getRow(i));
      if (line !== null) parts.push(line, lb);
      if ((i & 255) === 255 && Date.now() - started >= sliceMs) {
        i++;
        break;
      }
    }
    if (parts.length) yield parts.join('');
    parts = [];
    if (i < model.rowCount) await pause();
  }
  for (const f of w.footers) parts.push(f, lb);
  if (parts.length) yield parts.join('');
}
