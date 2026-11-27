// `@salmonui/export/xlsx`: `exportXlsx` (grid in, file out, with the
// shared export options, hooks, and events) and the lower-level `writeXlsx`
// over export models.

import { runExport, type ExportFile, type ExportHandlers, type ExportOptions, type ExportSource } from '@salmonui/core/export-model';
import type { XlsxOptions } from './xlsx-writer.js';

export const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export interface XlsxExportOptions<Row> extends ExportOptions<Row>, XlsxOptions {}

/**
 * Exports one grid, or several into one workbook (`layout`), as XLSX.
 * Resolves to `{ fileName, mimeType, data }`, or null when `onBeforeExport`
 * prevents it. The writer module is loaded on first use.
 */
export function exportXlsx<Row>(source: ExportSource<Row> | readonly ExportSource<Row>[], options?: XlsxExportOptions<Row>, handlers: ExportHandlers<Row> = {}): Promise<ExportFile | null> {
  return runExport('excel', source, options, handlers, 'xlsx', XLSX_MIME_TYPE, async (models) => {
    const { writeXlsx } = await import('./xlsx-writer.js');
    return writeXlsx(models, options);
  });
}

export { writeXlsx } from './xlsx-writer.js';
export type { XlsxContent, XlsxContentCell, XlsxOptions } from './xlsx-writer.js';
export type { ExportStyles, ExportWriterOptions } from './shared.js';
