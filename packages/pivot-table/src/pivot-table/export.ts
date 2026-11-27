// Export and print types of the pivot parts. The
// writers live in the `pivot` subpath of the @salmonui/export package (`exportPivot()`);
// `@salmonui/pivot-table` never imports that package: the app passes a loader (a
// dynamic import), as for the Data Grid `exportWriters`.

import type { ExportImage } from '@salmonui/data-grid/engine/export';

/** The loaded pivot writer module (the `pivot` subpath of the @salmonui/export package). */
export interface PivotWriterModule {
  exportPivot(source: unknown, options?: Record<string, unknown>, handlers?: Record<string, unknown>): Promise<{ readonly fileName: string; readonly mimeType: string; readonly data: Uint8Array | string | Blob } | null>;
}

/**
 * Loader of the pivot writers: a dynamic import of the `pivot` subpath of the @salmonui/export package (a dynamic
 * import, so the writers stay out of the app's initial JS). Excel and PDF need it; CSV and print work
 * without it.
 */
export interface PivotExportWriters {
  readonly pivot?: (() => Promise<PivotWriterModule>) | undefined;
}

/** Options of `api.exportToExcel()` / `exportToCsv()` / `exportToPdf()`, passed through to `exportPivot()` (file name, row layout, styles, `cell` hook, ...). */
export interface PivotExportOptions {
  /** File name without extension. Default `pivot`. */
  readonly fileName?: string | undefined;
  /** Return the file instead of downloading it (the promise still resolves after the write). */
  readonly download?: boolean | undefined;
  /** PDF only: chart image(s) on their own pages after the table (`pivotChartImage(chartApi)`). */
  readonly chart?: ExportImage | readonly ExportImage[] | undefined;
  /** CSV only: neutralize spreadsheet formulas in text cells. Default true; `false` writes raw text. */
  readonly escapeFormulas?: boolean | undefined;
  readonly [option: string]: unknown;
}

/** A written export file (`api.exportToExcel()` and friends resolve with it; null when cancelled). */
export interface PivotExportFile {
  readonly fileName: string;
  readonly mimeType: string;
  readonly data: Uint8Array | string | Blob;
}
