// `@salmonui/export/pdf`: `exportPdf` (grid in, file out, with the shared
// export options, hooks, and events) and the lower-level `writePdf` over an
// export model.

import { runExport, type ExportFile, type ExportHandlers, type ExportModel, type ExportOptions, type ExportSource } from '@salmonui/core/export-model';
import { writePdf, type PdfOptions } from './pdf-writer.js';

export const PDF_MIME_TYPE = 'application/pdf';

export interface PdfExportOptions<Row> extends ExportOptions<Row>, PdfOptions {}

/**
 * Exports a grid as PDF. Resolves to `{ fileName, mimeType, data }`, or null
 * when `onBeforeExport` prevents it.
 */
export function exportPdf<Row>(source: ExportSource<Row>, options?: PdfExportOptions<Row>, handlers: ExportHandlers<Row> = {}): Promise<ExportFile | null> {
  // The writer is a static import: the subpath re-exports `writePdf` anyway, and one chunk compresses better.
  return runExport('pdf', source, options, handlers, 'pdf', PDF_MIME_TYPE, (models) => writePdf(models[0] as ExportModel<Row>, options));
}

export { writePdf };
export type { PdfFont, PdfFontData, PdfOptions, PdfPageSize } from './pdf-writer.js';
export type { ExportStyles, ExportWriterOptions } from './shared.js';
