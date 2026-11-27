// `@salmonui/core/export-model`: the format-neutral export model (columns,
// header rows, body rows, footer aggregates) that every Salmon UI export
// writes from, the CSV writer, CSV formula escaping and the export run
// helpers shared by the `@salmonui/export` writers. The Data Grid builds the
// model from its engine (`@salmonui/data-grid/engine/export`); charts,
// Scheduler and Pivot Table build it from their own data. No React, no DOM.

import type { AggregateType, ColumnId, Json, RowId } from './data.js';
import type { ColumnType, FormatDescriptor, FormatOptions } from './format.js';

/** The column definition fields an export hook may read (the Data Grid passes its column definition). */
export interface ExportColumnDef {
  readonly id?: string;
  readonly field?: string;
  readonly type?: ColumnType;
  readonly format?: string | FormatOptions;
  readonly header?: string;
}

/** The host column behind an export column (the Data Grid passes its compiled column). */
export interface ExportSourceColumn<Row> {
  readonly columnId: ColumnId;
  /** Stacked header ancestry, root first, including this column. */
  readonly path: readonly ColumnId[];
  readonly def: ExportColumnDef;
  readonly accessor: (row: Row) => unknown;
}

/** An engine-like source; it must have the `export` module (`engine.export.getModel`), checked at run time. */
export interface ExportEngine<Row = unknown> {
  getRow(rowId: RowId): Row | undefined;
}

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Which rows an export covers:
 * - `filtered` (default, `AllPages`): every page of the current query (search,
 *   filter, sort, grouping applied).
 * - `page` (`CurrentPage`): the rows of the current page as the grid shows them.
 * - `selected`: the selected rows, in view order (ungrouped).
 * - `all`: every source row in source order, ignoring the query.
 */
export type ExportScope = 'filtered' | 'page' | 'selected' | 'all';

/** Detail / hierarchy export mode (`hierarchyExportMode`). Reserved for the detail and tree modules. */
export type ExportHierarchyMode = 'expanded' | 'all' | 'none';

export interface ExportCellStyle {
  readonly bold?: boolean;
  readonly italic?: boolean;
  /** `#rrggbb`. */
  readonly color?: string;
  /** `#rrggbb`. */
  readonly backgroundColor?: string;
  readonly textAlign?: 'start' | 'center' | 'end';
  readonly fontSize?: number;
  /** Excel number format code (XLSX only), e.g. `#,##0.00`. */
  readonly numberFormat?: string;
  /** Indent levels of the text (XLSX alignment indent; PDF one font size per level). */
  readonly indent?: number;
}

/**
 * An image drawn in a cell: PNG or JPEG bytes and the display size
 * in CSS px (96 dpi). `type` is sniffed from the magic bytes when absent.
 * XLSX embeds it as a picture anchored to the cell, PDF as an image XObject;
 * CSV writes the cell text.
 */
export interface ExportImage {
  readonly data: Uint8Array;
  readonly type?: 'png' | 'jpeg';
  readonly width: number;
  readonly height: number;
}

/** One exported cell. `value` is the typed value (numbers, booleans, `Date`, strings), `text` the display string. */
export interface ExportCell {
  readonly value: unknown;
  readonly text: string;
  readonly type: ColumnType;
  readonly style?: ExportCellStyle;
  /** XLSX formula without the leading `=`. Security: never build it from untrusted input. */
  readonly formula?: string;
  readonly colSpan?: number;
  readonly rowSpan?: number;
  /** Image drawn in the cell; `text` stays the fallback. */
  readonly image?: ExportImage;
}

/** Returned by the `cell` hook: any field overrides the computed cell. */
export interface ExportCellOverride {
  readonly value?: unknown;
  readonly text?: string;
  readonly style?: ExportCellStyle;
  readonly formula?: string;
  readonly colSpan?: number;
  readonly rowSpan?: number;
  readonly image?: ExportImage;
}

export interface ExportColumn<Row> {
  /** Position in `model.columns`. */
  readonly index: number;
  readonly columnId: ColumnId;
  readonly field: string | null;
  readonly headerText: string;
  readonly type: ColumnType;
  /** Width in CSS px (runtime width, else the numeric definition width, else 150). */
  readonly width: number;
  readonly textAlign: 'start' | 'center' | 'end';
  readonly format: FormatDescriptor | null;
  /** Freeze zone of the column at export time. */
  readonly freeze: 'left' | 'right' | null;
  readonly visible: boolean;
  /** The host column the export column was built from (the Data Grid passes its compiled column). */
  readonly column: ExportSourceColumn<Row>;
  /** Typed value of a row (numbers, booleans, `Date` for date columns, strings). */
  value(row: Row): unknown;
  /** Display text of a row (column formatter, `formatValue`). */
  text(row: Row): string;
}

/** A header cell. Header rows list cells at their start column; covered positions have no entry. */
export interface ExportHeaderCell {
  readonly text: string;
  readonly columnId: ColumnId;
  /** Index of the first exported column the cell covers. */
  readonly colIndex: number;
  readonly colSpan: number;
  readonly rowSpan: number;
  readonly leaf: boolean;
  readonly textAlign: 'start' | 'center' | 'end';
  /** Set by header hooks (`excelHeaderQueryCellInfo`); merged over the theme header style. */
  readonly style?: ExportCellStyle;
}

export type ExportHeaderRow = readonly ExportHeaderCell[];

export interface ExportAggregateCell {
  readonly columnId: ColumnId;
  readonly type: AggregateType;
  /** Set by the `aggregate` hook; merged over the theme aggregate / caption style. */
  readonly style?: ExportCellStyle;
  readonly value: unknown;
  readonly text: string;
}

/** Aggregate cells per exported column (`null` where a column has none). */
export type ExportAggregateCells = readonly (ExportAggregateCell | null)[];

export interface ExportDataRow<Row> {
  readonly kind: 'data';
  readonly index: number;
  readonly id: RowId;
  readonly row: Row;
  /** Nesting depth (group levels above the row; tree depth for hierarchy rows). */
  readonly depth: number;
  /** Tree mode: a parent collapsed in the grid whose subtree follows in the export (`tree: 'all'`). */
  readonly collapsed?: true;
  /** Tree mode: a row under a collapsed ancestor (`tree: 'all'`); XLSX `outlineCollapsed` hides it. */
  readonly hidden?: true;
}

export interface ExportGroupRow {
  readonly kind: 'group';
  readonly index: number;
  readonly id: RowId;
  readonly depth: number;
  readonly columnId: ColumnId;
  readonly headerText: string;
  readonly key: Json;
  readonly value: unknown;
  readonly formattedKey: string;
  readonly count: number;
  /** Caption text (`groupCaption` hook, else `Header: key - N items`). */
  readonly caption: string;
  /** `groupCaption` aggregates. */
  readonly aggregates: ExportAggregateCells;
}

export interface ExportGroupFooterRow {
  readonly kind: 'groupFooter';
  readonly index: number;
  readonly id: RowId;
  readonly groupId: RowId;
  readonly depth: number;
  /** One footer line per aggregate stacked on a column. */
  readonly line: number;
  readonly aggregates: ExportAggregateCells;
}

/** DataGrid footer aggregate line (`model.footerRows`). */
export interface ExportAggregateRow {
  readonly kind: 'aggregate';
  readonly index: number;
  readonly id: RowId;
  readonly depth: 0;
  readonly line: number;
  readonly aggregates: ExportAggregateCells;
}

/**
 * Detail block of a data row (`exportDetailDataBound`).
 * Produced by the `detail` hook today; the detail and hierarchy modules
 * produce it from their expansion state.
 */
export interface ExportDetail {
  /** A nested grid (child grid / hierarchy level). */
  readonly model?: ExportModel<unknown>;
  /** Plain text lines (detail template text). */
  readonly text?: readonly string[];
}

export interface ExportDetailRow<Row> {
  readonly kind: 'detail';
  readonly index: number;
  readonly id: RowId;
  readonly parentId: RowId;
  readonly row: Row;
  readonly depth: number;
  readonly detail: ExportDetail;
}

export type ExportRow<Row> = ExportDataRow<Row> | ExportGroupRow | ExportGroupFooterRow | ExportAggregateRow | ExportDetailRow<Row>;

export interface ExportCellContext<Row> {
  readonly row: Row;
  readonly rowId: RowId;
  readonly column: ExportColumn<Row>;
  /** The computed cell before the override. */
  readonly cell: ExportCell;
}

export interface ExportGroupCaptionContext {
  readonly columnId: ColumnId;
  readonly headerText: string;
  readonly key: Json;
  readonly value: unknown;
  readonly formattedKey: string;
  readonly count: number;
  readonly depth: number;
  readonly caption: string;
}

export interface ExportAggregateContext {
  readonly placement: 'footer' | 'groupFooter' | 'groupCaption';
  readonly columnId: ColumnId;
  readonly type: AggregateType;
  readonly value: unknown;
  readonly text: string;
  /** Group row id for group placements. */
  readonly groupId: RowId | null;
}

export interface ExportDetailContext<Row> {
  readonly row: Row;
  readonly rowId: RowId;
  readonly depth: number;
  readonly hierarchy: ExportHierarchyMode;
}

export interface ExportHeaderContext<Row> {
  readonly columns: readonly ExportColumn<Row>[];
  /** The rows built from the column header tree. */
  readonly headerRows: readonly ExportHeaderRow[];
}

/** An exported column picked by id (or field) with optional overrides. */
export interface ExportColumnSelection {
  readonly columnId: ColumnId;
  readonly headerText?: string;
  /** CSS px. */
  readonly width?: number;
}

export interface ExportModelOptions<Row> {
  /** Default `filtered`. */
  readonly scope?: ExportScope;
  /** Export hidden columns too. Default false. */
  readonly includeHiddenColumns?: boolean;
  /** Explicit leaf columns, in export order (overrides visibility and order); objects override header text and width. */
  readonly columns?: readonly (ColumnId | ExportColumnSelection)[];
  /** Custom data: exported with the grid's columns, ungrouped, in the given order. */
  readonly rows?: readonly Row[];
  /** Explicit rows by id, in the given order (overrides `scope`). */
  readonly rowIds?: readonly RowId[];
  /** Group rows: `captions` (default) writes caption and group footer rows; `flatten` writes data rows only. */
  readonly groups?: 'captions' | 'flatten';
  /** `include` (default) exports the rows of collapsed groups; `exclude` exports what the grid shows. */
  readonly collapsedGroups?: 'include' | 'exclude';
  /** Aggregate rows (grid footer, group footers, caption aggregates). Default true. */
  readonly aggregates?: boolean;
  /** Detail / hierarchy mode passed to the `detail` hook. Default `expanded`. */
  readonly hierarchy?: ExportHierarchyMode;
  /**
   * Tree mode rows: `expanded` (default) writes the visible
   * rows in pre-order; `all` writes every kept row regardless of expansion,
   * flagging collapsed parents and the rows they hide.
   */
  readonly tree?: 'expanded' | 'all';
  /** Per-cell customization. */
  readonly cell?: (ctx: ExportCellContext<Row>) => ExportCellOverride | null | undefined | void;
  /** Returns the group caption text. */
  readonly groupCaption?: (ctx: ExportGroupCaptionContext) => string | null | undefined | void;
  /** Returns the aggregate text, or text and style. */
  readonly aggregate?: (ctx: ExportAggregateContext) => string | { readonly text?: string; readonly style?: ExportCellStyle } | null | undefined | void;
  /** A detail block written after the row, or null. */
  readonly detail?: (ctx: ExportDetailContext<Row>) => ExportDetail | null | undefined | void;
  /** Replaces the header rows (custom stacked headers). */
  readonly headerRows?: (ctx: ExportHeaderContext<Row>) => readonly ExportHeaderRow[];
}

export interface ExportModel<Row> {
  readonly scope: ExportScope;
  readonly columns: readonly ExportColumn<Row>[];
  /** Header rows, top first; the last row holds the leaves (rowSpan covers shallower leaves). */
  readonly headerRows: readonly ExportHeaderRow[];
  /** Body rows (data, captions, group footers, details). */
  readonly rowCount: number;
  /** Data rows among the body rows. */
  readonly dataRowCount: number;
  /** Detail rows among the body rows (detail blocks and child models). */
  readonly detailRowCount: number;
  /** Grouping levels (outline depth). 0 when ungrouped or flattened. */
  readonly groupDepth: number;
  /**
   * Tree mode: the exported tree column (index in `columns`, -1
   * when it is not exported) and the deepest data row depth. Absent outside
   * tree mode.
   */
  readonly tree?: { readonly column: number; readonly depth: number };
  /** DataGrid footer aggregate lines. */
  readonly footerRows: readonly ExportAggregateRow[];
  /** Frozen exported columns at the start (left zone) and end (right zone); frozen body rows at the top. */
  readonly frozen: { readonly left: number; readonly right: number; readonly top: number };
  readonly locale: string;
  readonly direction: 'ltr' | 'rtl';
  readonly timeZone: string | undefined;
  /** True when a `cell` hook is set (writers then go through `cell()` for every cell). */
  readonly hasCellHook: boolean;
  getRow(index: number): ExportRow<Row>;
  rows(): IterableIterator<ExportRow<Row>>;
  /** The exported cell of a data row (hook applied). */
  cell(row: ExportDataRow<Row>, column: ExportColumn<Row>): ExportCell;
}

/** An engine with the `export` module registered. */
export interface ExportCapableEngine<Row> extends ExportEngine<Row> {
  readonly export: { getModel(options?: ExportModelOptions<Row>): ExportModel<Row> };
}

/** `createExportModel(engine, options)`: the export model of an engine with the `export` module. */
export function createExportModel<Row>(engine: ExportEngine<Row>, options: ExportModelOptions<Row> = {}): ExportModel<Row> {
  const facade = (engine as Partial<ExportCapableEngine<Row>>).export;
  if (!facade || typeof facade.getModel !== 'function') {
    throw new Error('createExportModel: register createExportModule() in the engine modules.');
  }
  return facade.getModel(options);
}

/** True for an engine with the `export` module (as opposed to a prebuilt model). */
export function isExportCapableEngine<Row>(value: unknown): value is ExportCapableEngine<Row> {
  const facade = (value as { export?: { getModel?: unknown } } | null)?.export;
  return typeof facade?.getModel === 'function';
}

export * from './csv.js';
export { escapeCsvFormula, isFormulaText } from './csv-formula.js';
export * from './export-api.js';
