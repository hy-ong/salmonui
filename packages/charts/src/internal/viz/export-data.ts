// Chart `api.export`, a lazy chunk: images through `export.ts`,
// the vector PDF through the application's `exportWriters.pdf` loader
// (`@salmonui/export/graphics`), and the accessible table model as a
// `@salmonui/data-grid/engine` export model, written by the core CSV writer
// (`writeCsv`, the Data Grid's own) or by the application's
// `exportWriters.xlsx` loader (`@salmonui/export/xlsx`
// `writeXlsx`). Cells that read as plain numbers (`1,234.5`, `-3`, `12%` is
// text) are typed numbers in XLSX; everything else is the table text.

import { writeCsv, type ExportCell, type ExportColumn, type ExportDataRow, type ExportHeaderCell, type ExportModel, type ExportRow } from '@salmonui/core/export-model';
import { blobToDataURL, download, pdfBlob, printSvg, serializeSvg, toBlob } from './export.js';
import type { VizExportWriters } from './instance.js';

export interface VizTable {
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

type Row = readonly string[];

const NUMBER = /^[-+]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?(?:e[-+]?\d+)?$/i;

/** A typed value of a table cell: a number when the text is a plain number, else the text. */
export function cellValue(text: string): string | number {
  const t = text.trim();
  return NUMBER.test(t) ? Number(t.replace(/,/g, '')) : text;
}

/** The table as an export model (one header row, one data row per table row). */
export function tableExportModel(table: VizTable, locale = 'en-US'): ExportModel<Row> {
  const numeric = table.columns.map((_, c) => table.rows.length > 0 && table.rows.every((r) => (r[c] ?? '') === '' || typeof cellValue(r[c] as string) === 'number'));
  const columns: ExportColumn<Row>[] = table.columns.map((headerText, index) => ({
    index,
    columnId: `c${index}`,
    field: null,
    headerText,
    type: numeric[index] ? 'number' : 'string',
    width: 120,
    textAlign: numeric[index] ? 'end' : 'start',
    format: null,
    freeze: null,
    visible: true,
    // The writers read no compiled column of a model built outside a grid.
    column: null as unknown as ExportColumn<Row>['column'],
    value: (row) => (numeric[index] && row[index] ? cellValue(row[index] as string) : (row[index] ?? '')),
    text: (row) => row[index] ?? '',
  }));
  const header: ExportHeaderCell[] = columns.map((c) => ({ text: c.headerText, columnId: c.columnId, colIndex: c.index, colSpan: 1, rowSpan: 1, leaf: true, textAlign: c.textAlign }));
  const rows: ExportDataRow<Row>[] = table.rows.map((row, index) => ({ kind: 'data', index, id: String(index), row, depth: 0 }));
  return {
    scope: 'all',
    columns,
    headerRows: [header],
    rowCount: rows.length,
    dataRowCount: rows.length,
    detailRowCount: 0,
    groupDepth: 0,
    footerRows: [],
    frozen: { left: 0, right: 0, top: 0 },
    locale,
    direction: 'ltr',
    timeZone: undefined,
    hasCellHook: false,
    getRow: (i: number): ExportRow<Row> => rows[i] as ExportRow<Row>,
    rows: () => rows[Symbol.iterator]() as IterableIterator<ExportRow<Row>>,
    cell: (row, column): ExportCell => ({ value: column.value(row.row as Row), text: column.text(row.row as Row), type: column.type }),
  } as ExportModel<Row>;
}

/** CSV text of the table through the core writer (formula prefixes neutralized by default; plain numbers stay). */
export function tableCsv(table: VizTable, escapeFormulas = true): string {
  const model = tableExportModel(table);
  return writeCsv({ ...model, columns: model.columns.map((c) => ({ ...c, value: (r: Row) => cellValue(r[c.index] ?? '') })) }, { escapeFormulas });
}

/** The table file: CSV, or XLSX through `writers.xlsx`. */
export async function tableBlob(table: VizTable, format: 'csv' | 'xlsx', writers: VizExportWriters | undefined, sheetName = 'Sheet1', escapeFormulas = true): Promise<Blob> {
  if (format === 'csv') return new Blob([tableCsv(table, escapeFormulas)], { type: 'text/csv;charset=utf-8' });
  const load = writers?.xlsx;
  if (!load) throw new Error('Salmon UI: xlsx needs exportWriters.xlsx');
  const { writeXlsx } = await load();
  const data = await (writeXlsx as (model: ExportModel<Row>, o: { sheetName: string }) => Promise<Uint8Array>)(tableExportModel(table), { sheetName: sheetName.slice(0, 31) });
  return new Blob([data as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export interface DocumentExportOptions {
  readonly format?: 'png' | 'jpeg' | 'svg' | 'csv' | 'xlsx' | 'pdf' | undefined;
  readonly fileName?: string | undefined;
  readonly scale?: number | undefined;
  readonly orientation?: 'portrait' | 'landscape' | undefined;
  readonly pageSize?: string | undefined;
  readonly escapeFormulas?: boolean | undefined;
}

/** Downloads the drawing as an image or a vector PDF, or its table as CSV or XLSX. */
export async function exportDocument(root: Element | null, table: VizTable | null, writers: VizExportWriters | undefined, options: DocumentExportOptions, title: string, name: string): Promise<void> {
  const format = options.format ?? 'png';
  let blob: Blob;
  if (format === 'csv' || format === 'xlsx') blob = await tableBlob(table ?? { columns: [], rows: [] }, format, writers, title, options.escapeFormulas !== false);
  else {
    const svg = root?.querySelector<SVGSVGElement>('.salmon-viz-surface svg');
    if (!svg) throw new Error('Salmon UI: the visualization is not mounted');
    blob = format === 'pdf' ? await pdfBlob([serializeSvg(svg)], writers?.pdf, { orientation: options.orientation, pageSize: options.pageSize, title }) : await toBlob(svg, { format, scale: options.scale });
  }
  download(blob, options.fileName ?? `${name}.${format === 'jpeg' ? 'jpg' : format}`);
}

/**
 * Chart `toBlob`, `toDataURL` and `print` from this chunk, so `/chart` loads one export chunk instead of also
 * the shared instance runner (`instance-run.ts`).
 */
export async function runImage(root: Element | null, method: 'toBlob' | 'toDataURL' | 'print', format: 'png' | 'jpeg' | 'svg' = 'png', title = ''): Promise<unknown> {
  const svg = root?.querySelector<SVGSVGElement>('.salmon-viz-surface svg');
  if (!svg) throw new Error('Salmon UI: the visualization is not mounted');
  if (method === 'print') return printSvg(serializeSvg(svg), title);
  const blob = await toBlob(svg, { format });
  return method === 'toBlob' ? blob : blobToDataURL(blob);
}
