// Export and print implementation, the lazy
// `output-impl` chunk: loaded by the static facade (`output.ts`) on the first
// export or print, in parallel with the core export model and CSV writer
// (`@salmonui/data-grid/engine/export`) and, for print, the print document
// builder (`print-document.ts`), which the facade passes in. It has no
// runtime import: everything it needs from the static graph comes through
// the facade (`host`), so loading it never splits the main chunk.

import type { CsvOptions, ExportFile, ExportFormat, ExportHandlers, ExportModel, ExportModelOptions } from '@salmonui/data-grid/engine/export';
import type { DataGridEventSource } from '@salmonui/core/internal/events';
import type {
  DataGridAfterPrintEvent,
  DataGridExcelExportOptions,
  DataGridExportEvent,
  DataGridExportOptions,
  DataGridOutput,
  DataGridOutputColumn,
  DataGridPrintOptions,
} from './output.js';

type ExportCore = typeof import('@salmonui/data-grid/engine/export');
type PrintDocument = typeof import('./print-document.js');
type CallableWriter = (source: unknown, options?: unknown) => Promise<ExportFile | null>;

const REACT_KEYS = new Set(['download', 'grids', 'cell', 'headerCell', 'aggregateCell', 'groupCaption', 'detail']);

/** The export model of the grid of `host`. */
function model<Row>(host: DataGridOutput<Row>, core: ExportCore, options: DataGridExportOptions<Row>, extra: Partial<ExportModelOptions<Row>> = {}): ExportModel<Row> {
  const hierarchy = options.hierarchy ?? 'expanded';
  const detail = core.hierarchyExportDetail(host.instance.engine, hierarchy, options.detail);
  const { cell, headerCell, aggregateCell, groupCaption } = options;
  const hooks: ExportHandlers<Row> = {
    ...(cell ? { cell } : {}),
    ...(headerCell ? { headerCell } : {}),
    ...(aggregateCell ? { aggregateCell } : {}),
    ...(groupCaption ? { groupCaption } : {}),
    ...(detail ? { detail } : {}),
  };
  return core.createExportModelFromContext(host.context(), { ...core.toExportModelOptions(options, hooks), ...extra });
}

/** Builds, announces and downloads one export file (the busy state and the before-event are the facade's). */
export async function exportFile<Row>(host: DataGridOutput<Row>, core: ExportCore, format: ExportFormat, options: DataGridExportOptions<Row>, source: DataGridEventSource): Promise<ExportFile<Uint8Array | string> | null> {
  const props = host.instance.props;
  const grid = model(host, core, options);
  const writerOptions: Record<string, unknown> = {};
  for (const key of Object.keys(options)) if (!REACT_KEYS.has(key)) writerOptions[key] = (options as Record<string, unknown>)[key];
  let file: ExportFile<Uint8Array | string> | null;
  if (format === 'csv') {
    file = await core.exportCsv(grid, writerOptions as CsvOptions);
  } else if (format === 'excel') {
    const load = props.exportWriters?.excel;
    if (!load) throw new Error('exportToExcel: the DataGrid has no exportWriters.excel loader (a dynamic import of @salmonui/export xlsx subpath).');
    const others = ((options as DataGridExcelExportOptions<Row>).grids ?? []).map((api) => {
      const output = host.outputOf(api as object);
      if (!output) throw new Error('exportToExcel: `grids` must hold DataGrid APIs.');
      return model(output, core, {});
    });
    const { exportXlsx } = await load();
    file = await (exportXlsx as CallableWriter)(others.length ? [grid, ...others] : grid, writerOptions);
  } else {
    const load = props.exportWriters?.pdf;
    if (!load) throw new Error('exportToPdf: the DataGrid has no exportWriters.pdf loader (a dynamic import of @salmonui/export pdf subpath).');
    const { exportPdf } = await load();
    file = await (exportPdf as CallableWriter)(grid, writerOptions);
  }
  if (!file) return null;
  const after = host.instance.props.onExport;
  if (after) after(host.gridEvent<DataGridExportEvent<Row>>('export', source, { format, options, file }));
  if (options.download !== false) host.downloadBlob(file, undefined, host.instance.root?.ownerDocument);
  return file;
}

/**
 * Renders the print projection into a print-only container (the busy state
 * ends there), then calls `window.print()`; `onAfterPrint` follows the
 * window's `afterprint`.
 */
export function printGrid<Row>(
  host: DataGridOutput<Row>,
  core: ExportCore,
  printDocument: PrintDocument,
  doc: Document,
  win: Window,
  options: DataGridPrintOptions<Row>,
  scope: 'all' | 'page',
  hierarchy: NonNullable<DataGridPrintOptions<Row>['hierarchy']>,
  source: DataGridEventSource,
): void {
  const instance = host.instance;
  let container: HTMLDivElement;
  try {
    const snapshot = instance.engine.getSnapshot().columns;
    const printable = snapshot.visible.filter((c) => (c.def as DataGridOutputColumn).printable !== false);
    const detail = options.detail ?? instance.props.printing?.detail;
    const tree = options.tree ?? instance.props.printing?.tree;
    const grid = model(host, core, { pages: scope === 'page' ? 'current' : 'all', hierarchy, ...(detail ? { detail } : {}), ...(tree ? { tree } : {}) }, {
      // Print what the grid shows: collapsed groups stay collapsed.
      collapsedGroups: 'exclude',
      ...(printable.length !== snapshot.visible.length ? { columns: printable.map((c) => c.columnId) } : {}),
    });
    const props = instance.props;
    container = doc.createElement('div');
    container.className = 'salmon-data-grid-print';
    container.setAttribute('data-grid-id', instance.gridId);
    if (instance.rtl) container.dir = 'rtl';
    container.innerHTML = printDocument.renderPrintTable(grid, props['aria-label'] ? { label: props['aria-label'] } : {});
    doc.body.appendChild(container);
  } finally {
    host.setBusy(null);
  }
  const html = doc.documentElement;
  html.setAttribute('data-salmon-printing', '');
  let done = false;
  const cleanup = (): void => {
    if (done) return;
    done = true;
    win.removeEventListener('afterprint', cleanup);
    container.remove();
    html.removeAttribute('data-salmon-printing');
    if (host.printCleanup === cleanup) host.printCleanup = null;
    const onAfter = instance.props.onAfterPrint;
    if (onAfter) onAfter(host.gridEvent<DataGridAfterPrintEvent>('afterPrint', source, { scope, hierarchy }));
  };
  host.printCleanup = cleanup;
  win.addEventListener('afterprint', cleanup);
  win.print();
  // Without `afterprint` support the blocking `print()` has returned: clean up now.
  if (!('onafterprint' in win)) cleanup();
}
