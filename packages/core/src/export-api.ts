// Public export surface shared by every format. Every public export option, hook, and
// event name lives in this file, so a rename is a change here plus the
// format-specific options of `@salmonui/export`. The format-neutral
// export model (`export-model.ts`) stays internal vocabulary.
//
// Hooks and events cost nothing when unbound: a hook is installed on the
// model only when its handler is set, and event objects are created only for
// bound handlers.

import { resolveExportModel, writeCsv, type CsvOptions, type ExportSource } from './csv.js';
import type { ExportCellStyle, ExportColumnDef, ExportColumnSelection, ExportImage, ExportDetail, ExportDetailContext, ExportModel, ExportModelOptions } from './export-model.js';
import type { AggregateType, ColumnId, Json, RowId } from './data.js';

/** Export formats (`excel` writes an `.xlsx` file). */
export type ExportFormat = 'excel' | 'csv' | 'pdf';

/** An export-only column: picked by `id` (or `field`), with an optional header text and width (px). */
export interface ExportColumnOption {
  readonly id?: string;
  readonly field?: string;
  readonly header?: string;
  readonly width?: number;
}

/** Options shared by `exportCsv`, `exportXlsx`, and `exportPdf`. */
export interface ExportOptions<Row> {
  /** `all` (default): every page of the current query. `current`: the current page as shown. */
  readonly pages?: 'current' | 'all';
  /** Include hidden columns. Default false. */
  readonly includeHiddenColumns?: boolean;
  /** Rows to export instead of the grid rows (for example the selected rows), with the grid's columns. */
  readonly rows?: readonly Row[];
  /** Export-only columns, in order. */
  readonly columns?: readonly ExportColumnOption[];
  /** Download name; the format extension is added when missing. Default `export`. */
  readonly fileName?: string;
  /** Detail and child-grid rows: `expanded` (default), `all`, or `none`. */
  readonly hierarchy?: 'expanded' | 'all' | 'none';
  /**
   * Tree mode rows: `expanded` (default) exports the
   * visible rows in pre-order; `all` exports every kept row regardless of
   * expansion (XLSX `outlineCollapsed` then keeps the collapsed state).
   */
  readonly tree?: 'expanded' | 'all';
}

export interface ExportCellHookContext<Row> {
  readonly row: Row;
  readonly rowId: RowId;
  readonly column: ExportColumnDef;
  /** Typed value (numbers, booleans, `Date`, strings). */
  readonly value: unknown;
  /** Display text. */
  readonly text: string;
}

/**
 * Returned by the `cell` hook: any field replaces the computed one. A `text`
 * without `value` replaces the typed value too, so XLSX writes a text cell.
 */
export interface ExportCellPatch {
  readonly value?: unknown;
  readonly text?: string;
  readonly style?: ExportCellStyle;
  /** XLSX formula (with or without the leading `=`). Security: runs when the workbook opens; never build it from untrusted input. */
  readonly formula?: string;
  readonly colSpan?: number;
  readonly rowSpan?: number;
  /**
   * Image drawn in the cell: PNG or JPEG bytes with the display size
   * in px. XLSX anchors a picture to the cell (the text is still written
   * unless `text: ''`); PDF draws it in the cell box, scaled to fit. Rows grow
   * to the image height. CSV writes the text.
   */
  readonly image?: ExportImage;
}

export interface ExportHeaderCellHookContext<Row> {
  /** Leaf column, or undefined for a stacked group header. */
  readonly column: ExportColumnDef | undefined;
  readonly columnId: ColumnId;
  readonly text: string;
  readonly colSpan: number;
  readonly rowSpan: number;
}

export interface ExportAggregateCellHookContext {
  readonly placement: 'footer' | 'groupFooter' | 'groupCaption';
  readonly columnId: ColumnId;
  readonly type: AggregateType;
  readonly value: unknown;
  readonly text: string;
}

export interface ExportGroupCaptionHookContext {
  readonly columnId: ColumnId;
  readonly header: string;
  readonly key: Json;
  readonly value: unknown;
  readonly formattedKey: string;
  readonly count: number;
  readonly depth: number;
  /** Default caption (`Header: key - N items`). */
  readonly text: string;
}

export interface BeforeExportEvent {
  readonly format: ExportFormat;
  readonly defaultPrevented: boolean;
  /** Cancels the export; the export resolves to null. */
  preventDefault(): void;
}

/** Result of an export; the React instance methods download it as `fileName`. */
export interface ExportFile<Data = Uint8Array> {
  readonly fileName: string;
  readonly mimeType: string;
  readonly data: Data;
}

export interface ExportEvent<Data = Uint8Array> {
  readonly format: ExportFormat;
  readonly file: Promise<ExportFile<Data>>;
}

/** Hooks and events of an export. */
export interface ExportHandlers<Row, Data = Uint8Array> {
  /** Synchronous; `preventDefault()` cancels. */
  readonly onBeforeExport?: (event: BeforeExportEvent) => void;
  /** Called once the file is being produced; `file` resolves when it is ready. */
  readonly onExport?: (event: ExportEvent<Data>) => void;
  /** Per data cell. Not called when unset. */
  readonly cell?: (ctx: ExportCellHookContext<Row>) => ExportCellPatch | null | undefined | void;
  /** Per header cell. */
  readonly headerCell?: (ctx: ExportHeaderCellHookContext<Row>) => { readonly text?: string; readonly style?: ExportCellStyle } | null | undefined | void;
  /** Per aggregate cell (grid footer, group footer, group caption). */
  readonly aggregateCell?: (ctx: ExportAggregateCellHookContext) => { readonly text?: string; readonly style?: ExportCellStyle } | null | undefined | void;
  /** Group caption text. */
  readonly groupCaption?: (ctx: ExportGroupCaptionHookContext) => string | null | undefined | void;
  /** A detail block written after a data row (text lines or a child table), or null for none. */
  readonly detail?: (ctx: ExportDetailContext<Row>) => ExportDetail | null | undefined | void;
}

/** Maps public export options and bound hooks to export model options. */
export function toExportModelOptions<Row, Data>(options: ExportOptions<Row> | undefined, handlers: ExportHandlers<Row, Data> = {}): ExportModelOptions<Row> {
  const o = options ?? {};
  const columns: ExportColumnSelection[] | undefined = o.columns?.flatMap((c) => {
    const columnId = c.id ?? c.field;
    if (!columnId) return [];
    return [{ columnId, ...(c.header !== undefined ? { headerText: c.header } : {}), ...(c.width !== undefined ? { width: c.width } : {}) }];
  });
  const { cell: formatCell, headerCell: formatHeaderCell, aggregateCell: formatAggregateCell, groupCaption: formatGroupCaption, detail } = handlers;
  return {
    scope: o.pages === 'current' ? 'page' : 'filtered',
    hierarchy: o.hierarchy ?? 'expanded',
    ...(o.tree ? { tree: o.tree } : {}),
    ...(o.includeHiddenColumns ? { includeHiddenColumns: true } : {}),
    ...(o.rows ? { rows: o.rows } : {}),
    ...(columns ? { columns } : {}),
    ...(formatCell
      ? {
          cell: ({ row, rowId, column, cell }) => {
            const patch = formatCell({ row, rowId, column: column.column.def, value: cell.value, text: cell.text });
            if (!patch) return null;
            // A new value without a new text writes the value's string form.
            if ('value' in patch && patch.text === undefined) return { ...patch, text: patch.value == null ? '' : patch.value instanceof Date ? cell.text : String(patch.value) };
            return patch;
          },
        }
      : {}),
    ...(formatHeaderCell
      ? {
          headerRows: ({ columns: exported, headerRows }) =>
            headerRows.map((row) =>
              row.map((h) => {
                const patch = formatHeaderCell({ column: h.leaf ? exported[h.colIndex]?.column.def : undefined, columnId: h.columnId, text: h.text, colSpan: h.colSpan, rowSpan: h.rowSpan });
                if (!patch) return h;
                return { ...h, ...(patch.text !== undefined ? { text: patch.text } : {}), ...(patch.style ? { style: patch.style } : {}) };
              }),
            ),
        }
      : {}),
    ...(formatAggregateCell
      ? { aggregate: ({ placement, columnId, type, value, text }) => formatAggregateCell({ placement, columnId, type, value, text }) }
      : {}),
    ...(formatGroupCaption
      ? {
          groupCaption: (ctx) => formatGroupCaption({ columnId: ctx.columnId, header: ctx.headerText, key: ctx.key, value: ctx.value, formattedKey: ctx.formattedKey, count: ctx.count, depth: ctx.depth, text: ctx.caption }),
        }
      : {}),
    ...(detail ? { detail } : {}),
  };
}

/** File name with the format extension (default `export`). */
export function exportFileName(name: string | undefined, extension: string): string {
  const base = name && name.trim() ? name.trim() : 'export';
  return base.toLowerCase().endsWith(`.${extension}`) ? base : `${base}.${extension}`;
}

/** Raises `onBeforeExport`; true when the export may proceed. */
export function runBeforeExport(handlers: { readonly onBeforeExport?: ((event: BeforeExportEvent) => void) | undefined }, format: ExportFormat): boolean {
  const handler = handlers.onBeforeExport;
  if (!handler) return true;
  let prevented = false;
  const event: BeforeExportEvent = {
    format,
    get defaultPrevented() {
      return prevented;
    },
    preventDefault() {
      prevented = true;
    },
  };
  handler(event);
  return !prevented;
}

/**
 * Runs one export: `onBeforeExport`, the model from the source and options,
 * the writer, then `onExport`. Resolves to null when prevented.
 */
export async function runExport<Row, Data>(
  format: ExportFormat,
  source: ExportSource<Row> | readonly ExportSource<Row>[],
  options: ExportOptions<Row> | undefined,
  handlers: ExportHandlers<Row, Data>,
  extension: string,
  mimeType: string,
  write: (models: readonly ExportModel<Row>[]) => Promise<Data>,
): Promise<ExportFile<Data> | null> {
  if (!runBeforeExport(handlers, format)) return null;
  const modelOptions = toExportModelOptions(options, handlers);
  const sources: readonly ExportSource<Row>[] = Array.isArray(source) ? (source as readonly ExportSource<Row>[]) : [source as ExportSource<Row>];
  const file = (async (): Promise<ExportFile<Data>> => {
    const data = await write(sources.map((s) => resolveExportModel(s, modelOptions)));
    return { fileName: exportFileName(options?.fileName, extension), mimeType, data };
  })();
  handlers.onExport?.({ format, file });
  return file;
}

export interface CsvExportOptions<Row> extends ExportOptions<Row>, CsvOptions {}

/** Exports a grid (an engine with the `export` module, or a model) as CSV text. */
export function exportCsv<Row>(source: ExportSource<Row>, options?: CsvExportOptions<Row>, handlers: ExportHandlers<Row, string> = {}): Promise<ExportFile<string> | null> {
  return runExport('csv', source, options, handlers, 'csv', 'text/csv', async (models) => writeCsv(models[0] as ExportModel<Row>, options));
}
