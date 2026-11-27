// Export and print.
//
// - `exportToCsv` loads `@salmonui/data-grid/engine/export` (CSV writer) on first
//   use; `exportToExcel` / `exportToPdf` call the writer loaders the app
//   passes in `exportWriters` (a dynamic import of @salmonui/export `xlsx`
//   / `pdf` subpath).
//   No `@salmonui/data-grid` module imports `@salmonui/export`, so the default bundle never grows by a
//   writer, and the export items are available exactly when a writer is.
// - The export model is built from a context-only module registered with
//   every grid (no export code in the default bundle); the export code is
//   imported when the first export or print runs.
// - `print()` renders the print projection (`print-document.ts`, also loaded
//   on demand) into a print-only container, then calls `window.print()`;
//   `onAfterPrint` follows the window's `afterprint`.
// - Busy state is a tiny external store read by `DataGridOutputStatus`.
// - This file is the static async facade on every grid (the context module,
//   the busy store and the `exportTo*` / `print` methods); the export and
//   print implementation is the lazy `output-impl.ts`, loaded on the first
//   export or print in parallel with the core export code.

import { defineDataGridModule, type DataGridModule, type ModuleContext } from '@salmonui/data-grid/engine';
import type { CsvOptions, ExportFile, ExportFormat, ExportHandlers, ExportHierarchyMode, ExportOptions } from '@salmonui/data-grid/engine/export';
import { DEV } from '@salmonui/core/internal/dev';
import { gridEvent, type DataGridEvent, type DataGridEventSource } from '@salmonui/core/internal/events';
import type { DataGridInstance } from './instance.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Export hooks (per-cell, header cell, aggregate cell, group caption, detail). */
export type DataGridExportHooks<Row> = Pick<ExportHandlers<Row>, 'cell' | 'headerCell' | 'aggregateCell' | 'groupCaption' | 'detail'>;

/** Options of every export method. */
export interface DataGridExportOptions<Row> extends ExportOptions<Row>, DataGridExportHooks<Row> {
  /** Downloads the file (default true); `false` only resolves it. */
  readonly download?: boolean;
}

export interface DataGridCsvExportOptions<Row> extends DataGridExportOptions<Row>, CsvOptions {}

/**
 * Excel options: the shared options plus the `XlsxOptions` of
 * `@salmonui/export/xlsx` (`sheetName`, `styles`, `header`, `footer`,
 * `freezeHeader`, `mergeRepeatedValues`, `layout`, `gap`, ...), passed through.
 */
export interface DataGridExcelExportOptions<Row> extends DataGridExportOptions<Row> {
  /** Further grids written into the same workbook (`layout: 'sheets' | 'stacked'`). */
  readonly grids?: readonly { readonly exportToExcel: unknown }[];
  readonly [option: string]: unknown;
}

/** PDF options: the shared options plus the `PdfOptions` of `@salmonui/export/pdf` (`orientation`, `pageSize`, `header`, `footer`, `font`, ...), passed through. */
export interface DataGridPdfExportOptions<Row> extends DataGridExportOptions<Row> {
  readonly [option: string]: unknown;
}

/** Any writer entry (`exportXlsx`, `exportPdf`); called with an export model and the writer options. */
type WriterFn = (source: never, options?: never) => Promise<ExportFile | null>;

/**
 * On-demand Excel and PDF writer modules. Pass dynamic imports so the writers
 * stay out of the initial bundle: `excel` loads the `xlsx` subpath and
 * `pdf` the `pdf` subpath of the @salmonui/export package (docs: Export).
 */
export interface DataGridExportWriters {
  readonly excel?: () => Promise<{ readonly exportXlsx: WriterFn }>;
  readonly pdf?: () => Promise<{ readonly exportPdf: WriterFn }>;
}

/** Before an Excel or PDF export: `preventDefault()` cancels (the method resolves to null). */
export interface DataGridBeforeExportEvent<Row> extends DataGridEvent {
  readonly format: ExportFormat;
  readonly options: DataGridExportOptions<Row>;
}

/** An Excel or PDF export finished: the file is ready (before the download). */
export interface DataGridExportEvent<Row> extends DataGridEvent {
  readonly format: ExportFormat;
  readonly options: DataGridExportOptions<Row>;
  readonly file: ExportFile<Uint8Array | string>;
}

/** Print scope, hierarchy, detail and tree options. */
export interface DataGridPrinting<Row = unknown> {
  /** `all` (default): every page of the current query. `page`: the current page. */
  readonly scope?: 'all' | 'page';
  /** Detail and child-grid rows: `expanded` (default), `all`, or `none`. */
  readonly hierarchy?: ExportHierarchyMode;
  /**
   * A detail block printed after a data row (text lines or a child table), as
   * the export `detail` hook: React detail templates never print by
   * themselves. `undefined` falls back to the child grid (hierarchy), `null`
   * prints none.
   */
  readonly detail?: ExportHandlers<Row>['detail'];
  /** Tree mode: `expanded` (default) prints the visible rows, `all` every kept row; the tree column is indented. */
  readonly tree?: 'expanded' | 'all';
}

export interface DataGridPrintOptions<Row = unknown> extends DataGridPrinting<Row> {}

/** `beforePrint`: `preventDefault()` cancels. Fired by `print()` before `window.print()`. */
export interface DataGridBeforePrintEvent extends DataGridEvent {
  readonly scope: 'all' | 'page';
  readonly hierarchy: ExportHierarchyMode;
}

/** After printing: the window's `afterprint` after a `print()`. */
export interface DataGridAfterPrintEvent extends DataGridEvent {
  readonly scope: 'all' | 'page';
  readonly hierarchy: ExportHierarchyMode;
}

/** Column fields of export and print. */
export interface DataGridOutputColumn {
  /** `false` leaves the column out of print. Default true. */
  printable?: boolean;
}

export interface DataGridOutputProps<Row> {
  /** Excel and PDF writer loaders; without one the matching toolbar and menu items are disabled. */
  exportWriters?: DataGridExportWriters;
  onBeforeExport?: (event: DataGridBeforeExportEvent<Row>) => void;
  onExport?: (event: DataGridExportEvent<Row>) => void;
  /** Print scope and hierarchy mode (`print()` options override them). */
  printing?: DataGridPrinting<Row>;
  onBeforePrint?: (event: DataGridBeforePrintEvent) => void;
  onAfterPrint?: (event: DataGridAfterPrintEvent) => void;
}

export interface DataGridOutputApi<Row> {
  /** XLSX export (`excelExport`); resolves to the file, or null when prevented. Downloads unless `download: false`. */
  exportToExcel(options?: DataGridExcelExportOptions<Row>): Promise<ExportFile | null>;
  /** PDF export (`pdfExport`). */
  exportToPdf(options?: DataGridPdfExportOptions<Row>): Promise<ExportFile | null>;
  /** CSV export (`csvExport`); no writer package needed. */
  exportToCsv(options?: DataGridCsvExportOptions<Row>): Promise<ExportFile<string> | null>;
  /** Prints the grid (every row of the scope, no virtualization). Resolves false when prevented or outside a browser. */
  print(options?: DataGridPrintOptions<Row>): Promise<boolean>;
}


// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

/**
 * Saves a `Blob` or an export file through a temporary object URL. Returns
 * false outside a browser (SSR, workers without a document), so it is safe
 * to call anywhere.
 */
export function downloadBlob(data: Blob | ExportFile<Uint8Array | string>, fileName?: string, doc: Document | undefined = typeof document === 'undefined' ? undefined : document): boolean {
  const url = typeof URL === 'undefined' ? undefined : URL;
  if (!doc?.body || typeof url?.createObjectURL !== 'function' || typeof Blob === 'undefined') return false;
  const blob = data instanceof Blob ? data : new Blob([data.data as BlobPart], { type: data.mimeType });
  const name = fileName ?? (data instanceof Blob ? 'download' : data.fileName);
  const href = url.createObjectURL(blob);
  const a = doc.createElement('a');
  a.href = href;
  a.download = name;
  a.rel = 'noopener';
  a.style.display = 'none';
  doc.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked after the click task: some browsers read the URL asynchronously.
  setTimeout(() => url.revokeObjectURL(href), 1000);
  return true;
}

// ---------------------------------------------------------------------------
// Context module
// ---------------------------------------------------------------------------

/** @internal Sentinel module that hands its context to the on-demand export code. */
export const OUTPUT_CONTEXT_MODULE = '__salmon_ui_output';

/** @internal */
export function createOutputContextModule<Row>(): DataGridModule<Row, null, never> {
  return defineDataGridModule<Row, null, never, typeof OUTPUT_CONTEXT_MODULE, { context: (ctx: ModuleContext<Row>) => ModuleContext<Row> }>({
    name: OUTPUT_CONTEXT_MODULE,
    inSnapshot: false,
    commands: [],
    initialState: () => null,
    methods: { context: (ctx) => ctx },
  }) as unknown as DataGridModule<Row, null, never>;
}

type Busy = ExportFormat | 'print' | null;
type OutputImpl = typeof import('./output-impl.js');

/** Export controllers by API (multiple-grid workbooks resolve the other grids' models). */
const byApi = new WeakMap<object, DataGridOutput<any>>();

// One load per page (a load cache, not render state).
let implLoad: Promise<OutputImpl> | null = null;
const loadImpl = (): Promise<OutputImpl> => (implLoad ??= import('./output-impl.js').catch((error: unknown) => {
  implLoad = null; // the next export retries
  throw error;
}));
const loadCore = () => import('./output-core.js');

// ---------------------------------------------------------------------------
// Controller: the static async facade (the implementation is `output-impl.ts`)
// ---------------------------------------------------------------------------

export class DataGridOutput<Row> {
  private busy: Busy = null;
  private running = 0;
  private readonly listeners = new Set<() => void>();
  /** @internal The open print's cleanup (`output-impl.ts`). */
  printCleanup: (() => void) | null = null;
  readonly api: DataGridOutputApi<Row>;
  /** @internal Static helpers handed to `output-impl.ts`, so it imports nothing from the static graph. */
  readonly gridEvent = gridEvent;
  /** @internal */
  readonly downloadBlob = downloadBlob;

  constructor(readonly instance: DataGridInstance<Row>) {
    this.api = {
      exportToExcel: (options) => this.export('excel', options ?? {}, 'api'),
      exportToPdf: (options) => this.export('pdf', options ?? {}, 'api'),
      exportToCsv: (options) => this.export('csv', options ?? {}, 'api') as Promise<ExportFile<string> | null>,
      print: (options) => this.print(options ?? {}, 'api'),
    };
    // Mod+P with focus in the grid prints the grid.
    instance.interaction.registerKeyHandler('grid.print', () => {
      void this.print({}, 'keyboard').catch(reportError);
      return true;
    });
  }

  /** @internal Called once the public API exists. */
  register(api: object): void {
    byApi.set(api, this);
  }

  /** @internal The export controller of another grid's API (`grids` of `exportToExcel`). */
  outputOf(api: object): DataGridOutput<unknown> | undefined {
    return byApi.get(api);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getBusy = (): Busy => this.busy;

  /** @internal */
  setBusy(busy: Busy): void {
    if (busy !== null) this.running++;
    else this.running = Math.max(0, this.running - 1);
    const next = busy ?? (this.running > 0 ? this.busy : null);
    if (next === this.busy) return;
    this.busy = next;
    for (const l of this.listeners) l();
  }

  /** Whether a toolbar / menu export or print item can run. */
  available(format: ExportFormat | 'print'): boolean {
    if (format === 'excel') return typeof this.instance.props.exportWriters?.excel === 'function';
    if (format === 'pdf') return typeof this.instance.props.exportWriters?.pdf === 'function';
    return true;
  }

  /** Toolbar and context-menu commands (default options; customize with `api.registerCommandHandler`). */
  runCommand(format: ExportFormat | 'print', source: DataGridEventSource): boolean {
    if (!this.available(format)) return false;
    const run = format === 'print' ? this.print({}, source) : this.export(format, {}, source);
    void run.catch(reportError);
    return true;
  }

  /** @internal The module context the export model is built from. */
  context(): ModuleContext<Row> {
    const facade = (this.instance.engine as unknown as Record<string, { context?: () => ModuleContext<Row> } | undefined>)[OUTPUT_CONTEXT_MODULE];
    if (!facade?.context) throw new Error('DataGrid export: the output context module is not registered.');
    return facade.context();
  }

  private async export(format: ExportFormat, options: DataGridExportOptions<Row>, source: DataGridEventSource): Promise<ExportFile<any> | null> {
    const props = this.instance.props;
    if (props.onBeforeExport) {
      const event = gridEvent<DataGridBeforeExportEvent<Row>>('beforeExport', source, { format, options });
      props.onBeforeExport(event);
      if (event.defaultPrevented) return null;
    }
    this.setBusy(format);
    try {
      const [impl, core] = await Promise.all([loadImpl(), loadCore()]);
      return await impl.exportFile(this, core, format, options, source);
    } finally {
      this.setBusy(null);
    }
  }

  private async print(options: DataGridPrintOptions<Row>, source: DataGridEventSource): Promise<boolean> {
    const doc = this.instance.root?.ownerDocument ?? (typeof document === 'undefined' ? undefined : document);
    const win = doc?.defaultView;
    if (!doc || !win) return false;
    const settings = this.instance.props.printing;
    const scope = options.scope ?? settings?.scope ?? 'all';
    const hierarchy = options.hierarchy ?? settings?.hierarchy ?? 'expanded';
    const onBefore = this.instance.props.onBeforePrint;
    if (onBefore) {
      const event = gridEvent<DataGridBeforePrintEvent>('beforePrint', source, { scope, hierarchy });
      onBefore(event);
      if (event.defaultPrevented) return false;
    }
    this.printCleanup?.();
    this.setBusy('print');
    let loaded: [OutputImpl, Awaited<ReturnType<typeof loadCore>>, typeof import('./print-document.js')];
    try {
      loaded = await Promise.all([loadImpl(), loadCore(), import('./print-document.js')]);
    } catch (error) {
      this.setBusy(null);
      throw error;
    }
    // Ends the busy state once the print container is in the document.
    loaded[0].printGrid(this, loaded[1], loaded[2], doc, win, options, scope, hierarchy, source);
    return true;
  }

  dispose(): void {
    this.printCleanup?.();
  }
}

function reportError(error: unknown): void {
  if (DEV) console.error(error);
}
