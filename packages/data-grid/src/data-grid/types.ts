// Public types of `DataGrid`. Types are grouped
// per feature; the query UI (sorting, filtering, search, paging) lives in
// query-types.ts and the column chrome (pinning, menus, toolbar, spans) in
// chrome-types.ts. `DataGridProps`, `DataGridColumn`, `DataGridApi`, and
// `DataGridLocaleText` extend the interfaces there.

import type {
  AggregateType,
  AggregateValues,
  ColumnDef,
  CompiledColumn,
  DataGridApi as CoreDataGridApi,
  DataSource,
  DataGridModule,
  DataGridWarning,
  GroupPathSegment,
  GroupRowSnapshot,
  RowId,
  SelectionSummary,
  SerializedSelection,
  VirtualRange,
} from '@salmonui/data-grid/engine';
import type { CSSProperties, ReactElement, ReactNode, Ref } from 'react';
import type {
  DataGridChromeApi,
  DataGridChromeColumn,
  DataGridChromeProps,
  DataGridColumnReorderEvent,
  DataGridColumnVisibilityChangeEvent,
} from './chrome-types.js';
import type { DataGridLocaleText } from './locale-text.js';
import type { DataGridFeature } from './features/types.js';
import type { DataGridIcons } from './icons.js';
import type { DataGridPersistState, DataGridStateMethods } from './persist-state.js';
import type { DataGridDetailApi, DataGridDetailProps } from './detail-types.js';
import type { DataGridRowPinningApi, DataGridRowPinningProps } from './row-pinning.js';
import type { DataGridAdaptiveApi, DataGridAdaptiveProps } from './adaptive-types.js';
import type { DataGridDataUiApi, DataGridDataUiProps } from './data-ui-types.js';
import type { DataGridFilterBuilderApi, DataGridFilterBuilderProps } from './filter-builder-types.js';
import type { DataGridViewApi } from './view-api.js';
import type { DataGridEvent } from '@salmonui/core/internal/events';
import type { DataGridColumnInfo, DataGridDataErrorContext, DataGridViewChangeEvent } from './feature-types.js';
import type { DataGridApiEngine, DataGridInfiniteScroll, DataGridLoadingRowContext } from './infinite-types.js';
import type { DataGridOutputApi, DataGridOutputColumn, DataGridOutputProps } from './output.js';
import type { DataGridActionResult, DataGridQueryApi, DataGridQueryColumn, DataGridQueryProps } from './query-types.js';
import type { DataGridEditApi, DataGridEditColumn, DataGridEditorProps, DataGridEditProps } from './editing/edit-types.js';
import type { DataGridTreeApi, DataGridTreeContext, DataGridTreeProps } from './tree-types.js';

export type { DataGridEvent, DataGridEventSource } from '@salmonui/core/internal/events';
export type { DataGridActionResult } from './query-types.js';


// ---------------------------------------------------------------------------
// Cells, rows, and render props
// ---------------------------------------------------------------------------

/** `className`, `style`, `title`, and `data-*` attributes for a row, cell, or header cell. */
export type DataGridElementProps = {
  className?: string;
  style?: CSSProperties;
  title?: string;
} & { [key: `data-${string}`]: string | number | boolean | undefined };

export interface DataGridCellContext<Row> {
  row: Row;
  rowId: RowId;
  /** The column key (column `id`, else `field`). */
  field: string;
  column: DataGridColumnInfo<Row>;
  value: unknown;
  formattedValue: string;
  rowIndex: number;
  selected: boolean;
  editing: boolean;
  /** Tree mode, the tree column's cells only: depth, children, expansion and child load status. */
  tree?: DataGridTreeContext;
}

export interface DataGridHeaderContext<Row> {
  column: DataGridColumnInfo<Row>;
  /** Null when the column is not sorted. */
  sortDirection: 'asc' | 'desc' | null;
  /** Position in a multi-column sort (0-based); -1 when not sorted. */
  sortIndex: number;
  filtered: boolean;
  grouped: boolean;
}

/** Overflow of cell and header text (CSS `text-overflow` vocabulary). */
export type DataGridOverflow = 'clip' | 'ellipsis' | 'ellipsisWithTooltip';

/** A `DataGrid` column: the core `ColumnDef` plus React render hooks. Also the `<DataGridColumn>` element's props. */
export interface DataGridColumn<Row = unknown> extends ColumnDef<Row>, DataGridQueryColumn<Row>, DataGridChromeColumn<Row>, DataGridOutputColumn, Omit<DataGridEditColumn<Row>, 'editor' | 'editorProps'> {
  /** Built-in editor. Default: from `type` and lookups. */
  readonly editor?: NonNullable<DataGridEditColumn<Row>['editor']>;
  /** Props of the built-in editor. */
  readonly editorProps?: DataGridEditorProps;
  /** Overflow behavior of cell and header text. Default: the grid `overflow` (`ellipsis`). */
  readonly overflow?: DataGridOverflow;
  /** Cell content. Receives a stable context; must not hold engine state. */
  readonly renderCell?: (ctx: DataGridCellContext<Row>) => ReactNode;
  /** Header content (`headerTemplate`); sort, menu, and resize affordances stay. */
  readonly renderHeader?: (ctx: DataGridHeaderContext<Row>) => ReactNode;
  /** Extra props on every body cell of the column. */
  readonly cellProps?: DataGridElementProps | ((ctx: DataGridCellContext<Row>) => DataGridElementProps | undefined);
  /** Class name per cell; avoids allocating a props object per cell. */
  readonly cellClassName?: string | ((ctx: DataGridCellContext<Row>) => string | undefined);
  /** Extra props on the header cell. */
  readonly headerProps?: DataGridElementProps;
  /** Stacked header: child columns (or nested `<DataGridColumn>` children). */
  readonly columns?: readonly DataGridColumn<Row>[];
}

export type DataGridPart =
  | 'root' | 'toolbar' | 'header' | 'headerCell' | 'body' | 'row' | 'cell'
  | 'footer' | 'pager' | 'groupDropArea' | 'groupCaption' | 'detailRow'
  | 'columnMenu' | 'contextMenu' | 'filterMenu' | 'editor' | 'empty'
  | 'loading';

export interface DataGridVirtualization {
  /** Row virtualization. Default true. */
  rows?: boolean;
  /** Column virtualization of the center (unpinned) zone. Default true. */
  columns?: boolean;
  /** Rows rendered beyond each edge of the viewport. Default 5. */
  rowOverscan?: number;
  /** Center columns rendered beyond each edge of the viewport. Default 2. */
  columnOverscan?: number;
  /** Physical scroll height cap; taller content is compressed. Default 15,000,000 px. */
  maxScrollHeight?: number;
  /** Shimmer skeleton rows instead of the loading text for rows that are not loaded yet (infinite scroll). Default true. */
  skeletonRows?: boolean;
}

export type DataGridTextWrap = boolean | 'header' | 'content' | 'both';
export type DataGridLines = 'default' | 'both' | 'none' | 'horizontal' | 'vertical';

/** Props a custom row must spread onto its `role="row"` element. */
export interface DataGridRowElementProps {
  role: 'row';
  'aria-rowindex': number;
  className: string;
  style?: CSSProperties;
  'data-row-id': RowId;
  'data-row-index': number;
  'aria-selected'?: boolean;
  /**
   * Rows with a detail row or child grid: `'true'` / `'false'`. Not `aria-expanded`, which ARIA
   * allows on `treegrid` rows only; the detail toggle button carries `aria-expanded`.
   */
  'data-expanded'?: 'true' | 'false';
  /** Tree mode (`role="treegrid"` only): depth + 1, sibling ordinal and count, parents' expansion, loading children. */
  'aria-level'?: number;
  'aria-posinset'?: number;
  'aria-setsize'?: number;
  'aria-expanded'?: boolean;
  'aria-busy'?: boolean;
  'data-alt'?: '';
  ref?: Ref<HTMLDivElement>;
  [key: `data-${string}`]: string | number | boolean | undefined;
}

export interface DataGridRowContext<Row> {
  row: Row;
  rowId: RowId;
  rowIndex: number;
  /** The default row element; return it, wrap its cells, or render `rowProps` + `cells` yourself. */
  defaultRow: ReactElement;
  rowProps: DataGridRowElementProps;
  /** The row's cells (pinned zones included), to place inside a custom row element. */
  cells: ReactNode;
}

export interface DataGridEmptyContext {
  reason: 'noData' | 'noMatch';
}

/** Row and optional cell resolved from a row id or a DOM element. */
export interface DataGridRowInfo<Row> {
  readonly rowId: RowId;
  readonly row: Row | null;
  /** Position in the visible row model; -1 when the row is filtered out. */
  readonly rowIndex: number;
  /** Column of the cell the element is in; null for a row id or a row-level element. */
  readonly field: string | null;
  readonly column: DataGridColumnInfo<Row> | null;
  /** The row element; null outside the rendered window. */
  readonly element: HTMLElement | null;
  readonly cellElement: HTMLElement | null;
}

export interface DataGridScrollOptions {
  align?: 'start' | 'center' | 'end' | 'nearest';
}

// ---------------------------------------------------------------------------
// Selection
// ---------------------------------------------------------------------------

/** `selection` prop. Selection is on by default (single row). */
export interface DataGridSelection {
  /** Several rows (or cells). Default false (single). */
  readonly multiple?: boolean;
  /** Default `row`. */
  readonly mode?: 'row' | 'cell' | 'both';
  /** Cell range shape. Default `flow`. */
  readonly cellRange?: 'flow' | 'box' | 'boxWithBorder';
  /** With a `type: 'selection'` column: `add` (default) toggles the clicked row; `replace` selects only it. */
  readonly checkboxRowClick?: 'add' | 'replace';
  /** Only the selection column's checkbox selects rows. */
  readonly checkboxOnly?: boolean;
  /** Clicking the only selected row deselects it. Default true. */
  readonly toggle?: boolean;
  /** Keep selection across sort, filter, search, page, and group changes. Default false. */
  readonly persistent?: boolean;
  /** Plain clicks add to the selection (no modifier keys) in multiple mode. */
  readonly additive?: boolean;
  /** Column selection. */
  readonly columns?: boolean;
  /** Selected row ids. Reactive: a changed value re-applies. */
  readonly rowIds?: readonly RowId[];
}

/** A cell by row id and column key. */
export interface DataGridCellKey {
  readonly rowId: RowId;
  readonly field: string;
}

/**
 * `onBeforeSelectionChange` / `onSelectionChange`: one event per selection command, for row, cell and column
 * selection, selecting and deselecting alike. Every selection field is the selection after the change (proposed
 * in the before-event, applied in the after-event); `target` names the part the command selects. Large fields
 * are computed on first read; read them synchronously. Built only while a handler is bound.
 */
export interface DataGridSelectionChangeEvent<Row> extends DataGridEvent {
  /** Selected row ids after the change. */
  readonly rowIds: readonly RowId[];
  /** Rows that become selected / deselected. */
  readonly added: readonly RowId[];
  readonly removed: readonly RowId[];
  /** Selected rows (raw references), in `rowIds` order. */
  rows(): readonly Row[];
  /** Selected cells after the change: the anchor and focus cell of each range, like `api.getSelectedCells()`. */
  readonly cells: readonly DataGridCellKey[];
  /** Cells that become selected / deselected (every cell of the changed ranges; O(cells in the ranges)). */
  readonly addedCells: readonly DataGridCellKey[];
  readonly removedCells: readonly DataGridCellKey[];
  /** Selected column fields after the change. */
  readonly columns: readonly string[];
  /** Columns that become selected / deselected. */
  readonly addedColumns: readonly string[];
  readonly removedColumns: readonly string[];
  /** `allFiltered` after a select-all across pages: `excludedRowIds` lists the exceptions. */
  readonly scope: 'explicit' | 'allFiltered';
  readonly excludedRowIds: readonly RowId[];
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly target: 'row' | 'cell' | 'column' | 'checkbox' | null;
}

// ---------------------------------------------------------------------------
// Focus and keyboard
// ---------------------------------------------------------------------------

export type DataGridKeyContext = 'body' | 'header' | 'pager' | 'groupCaption' | 'groupChip' | 'editor' | 'global';

/** Context of `onKeyDown`. */
export interface DataGridKeyDownContext {
  readonly nativeEvent: KeyboardEvent;
  /** Keyboard command bound to the key in this context (`focus.down`, `edit.begin`), or null. */
  readonly command: string | null;
  readonly context: DataGridKeyContext;
  /** Focused cell or header. */
  readonly rowId: RowId | null;
  readonly field: string | null;
  /** Suppresses the built-in behavior of the binding. */
  preventDefault(): void;
}

/** Handler for a keyboard command; return true when it handled the key (the event is then consumed). */
export type DataGridKeyHandler = (ctx: { readonly nativeEvent: KeyboardEvent; readonly context: DataGridKeyContext; readonly command: string }) => boolean;

export interface DataGridFocusedCell {
  readonly rowId: RowId | null;
  readonly field: string;
  readonly region: 'body' | 'header';
}

export type { DataGridLocaleText, DataGridLocaleTextKey } from './locale-text.js';

// ---------------------------------------------------------------------------
// Grouping and aggregates
// ---------------------------------------------------------------------------

/** Context of `grouping.renderCaption`. */
export interface DataGridGroupCaptionContext<Row> {
  readonly group: GroupRowSnapshot;
  readonly field: string;
  readonly header: string;
  /** JSON key and raw value of the group. */
  readonly key: GroupRowSnapshot['key'];
  readonly value: unknown;
  readonly formattedKey: string;
  readonly count: number;
  readonly expanded: boolean;
  readonly aggregates: AggregateValues;
  /** Data rows of the group (computed on call). */
  readonly rows: () => readonly Row[];
  readonly toggle: () => void;
}

/** `grouping` prop. */
export interface DataGridGrouping<Row> {
  /** Grouped fields in order. Reactive. Group order follows `sorting.sortBy` for the field, else ascending. */
  readonly groupBy?: readonly string[];
  /** Group drop area above the header. Default true. */
  readonly showDropArea?: boolean;
  /** Keep grouped columns visible. Default false. */
  readonly showGroupedColumns?: boolean;
  /**
   * Group toggle button (`aria-pressed`) in the header of every groupable column: groups or ungroups by it. Default false. The sort-direction toggle on group chips has no
   * option: it follows `sorting` (shown when the grid sorts and the column is sortable).
   */
  readonly showHeaderToggle?: boolean;
  /** Remove button on group chips. Default true. */
  readonly showRemoveButton?: boolean;
  /** Reorder group chips by drag and Alt+Arrow keys. Default false. */
  readonly reorderable?: boolean;
  /** Groups start expanded. Default true (false in lazy mode). */
  readonly defaultExpanded?: boolean;
  /** Lazy group loading with a remote source that has `capabilities.lazyGroups`. */
  readonly lazy?: boolean;
  /** Lazy mode: child rows per load. Default 100. */
  readonly lazyChunkSize?: number;
  /** Replaces the caption text; the toggle stays. */
  readonly renderCaption?: (ctx: DataGridGroupCaptionContext<Row>) => ReactNode;
}

/** `onBeforeGroupChange` / `onGroupChange`. */
export interface DataGridGroupChangeEvent extends DataGridEvent {
  /** Grouped fields proposed (before) or applied (after). */
  readonly groupBy: readonly string[];
  readonly previousGroupBy: readonly string[];
  readonly action: 'group' | 'ungroup' | 'move' | 'clear';
  /** The column grouped, ungrouped, or moved; null for clear and set. */
  readonly field: string | null;
}

/** `onBeforeGroupToggle` / `onGroupToggle` (lazy and eager groups). */
export interface DataGridGroupToggleEvent<Row> extends DataGridEvent {
  readonly groupId: RowId;
  readonly path: readonly GroupPathSegment[];
  readonly key: GroupRowSnapshot['key'];
  /** The state after the toggle (proposed in the before-event). */
  readonly expanded: boolean;
  /** True in lazy mode. */
  readonly lazy: boolean;
  rows(): readonly Row[];
}

/** Context of aggregate templates (`renderFooter`, `renderGroupFooter`, `renderGroupCaption`). */
export interface DataGridAggregateContext<Row> {
  readonly field: string;
  readonly column: DataGridColumnInfo<Row> | undefined;
  /** Values of this column's aggregates by type (`{ sum, average }`). */
  readonly values: Readonly<Record<string, unknown>>;
  /** Formatted values by type. */
  readonly formatted: Readonly<Record<string, string>>;
  /** The group for group footers and captions; null in the grid footer. */
  readonly group: GroupRowSnapshot | null;
  /**
   * `key` and `count` of the group. In the grid footer: null and the data
   * rows the values cover (the page for `aggregateScope: 'page'`, every
   * matching row for `'all'` or server aggregates).
   */
  readonly key: GroupRowSnapshot['key'] | null;
  readonly count: number;
  /** Every aggregate of the group or grid. */
  readonly aggregates: AggregateValues;
  readonly rows: () => readonly Row[];
}

/** One aggregate of an aggregate row (also the `<DataGridAggregate>` element's props). */
export interface DataGridAggregate<Row = unknown> {
  /** The aggregated field. */
  readonly field: string;
  /** The column the value shows under. Default `field`. */
  readonly displayField?: string;
  /** One type or several. */
  readonly type: AggregateType | readonly AggregateType[];
  /** `type: 'custom'`: receives the group's (or grid's) rows. */
  readonly custom?: (rows: readonly Row[], column: CompiledColumn<Row>) => unknown;
  /** Number or date format of the value (`N2`, `C0`, `yMMM`). */
  readonly format?: string;
  /** The value shows where a template is given; without any, in the footer. */
  readonly renderFooter?: (ctx: DataGridAggregateContext<Row>) => ReactNode;
  readonly renderGroupFooter?: (ctx: DataGridAggregateContext<Row>) => ReactNode;
  readonly renderGroupCaption?: (ctx: DataGridAggregateContext<Row>) => ReactNode;
  /** Tree mode: a child summary row under each expanded parent, over its kept descendants. */
  readonly renderChildFooter?: (ctx: DataGridAggregateContext<Row>) => ReactNode;
}

/** One aggregate row; several rows stack in the footer and group footers. */
export interface DataGridAggregateRow<Row = unknown> {
  readonly columns: readonly DataGridAggregate<Row>[];
}

// ---------------------------------------------------------------------------
// Imperative API (`ref`, `useDataGridApi()`)
// ---------------------------------------------------------------------------

/** Row and cell selection methods (ids and fields). */
export interface DataGridSelectionApi<Row> {
  selectRows(rowIds: RowId | readonly RowId[], options?: { mode?: 'replace' | 'add' | 'remove' | 'toggle' }): DataGridActionResult;
  selectRowRange(fromRowId: RowId, toRowId: RowId, options?: { mode?: 'replace' | 'add' }): DataGridActionResult;
  /** `page`: every row of the current page (all rows without paging). `filtered` (default with paging off): every row matching the query, O(1). */
  selectAll(options?: { scope?: 'page' | 'filtered' }): DataGridActionResult;
  clearSelection(parts?: { rows?: boolean; cells?: boolean; columns?: boolean }): DataGridActionResult;
  selectCells(cells: readonly DataGridCellKey[], options?: { mode?: 'replace' | 'add' | 'toggle' }): DataGridActionResult;
  selectCellRange(anchor: DataGridCellKey, focus: DataGridCellKey, options?: { mode?: 'replace' | 'add' }): DataGridActionResult;
  selectColumns(fields: string | readonly string[], options?: { mode?: 'replace' | 'add' | 'toggle' }): DataGridActionResult;
  isRowSelected(rowId: RowId): boolean;
  getSelectedRowIds(): readonly RowId[];
  /** Raw rows, in the order of `getSelectedRowIds()`. */
  getSelectedRows(): readonly Row[];
  getSelectedCells(): readonly DataGridCellKey[];
  getSelectedColumns(): readonly string[];
  /** Serializable selection (scope, ids or excluded ids, cell ranges, columns). */
  getSelection(): SerializedSelection | undefined;
  setSelection(selection: SerializedSelection): DataGridActionResult;
  getSelectionSummary(): SelectionSummary | undefined;
}

/** Imperative `DataGrid` API (`ref`, `useDataGridApi()`). */
export interface DataGridApi<Row = unknown>
  extends Omit<CoreDataGridApi<Row>, 'engine' | 'getRowInfo' | keyof DataGridQueryApi>,
    DataGridSelectionApi<Row>,
    DataGridChromeApi,
    DataGridQueryApi,
    DataGridStateMethods,
    DataGridEditApi<Row>,
    DataGridOutputApi<Row>,
    DataGridAdaptiveApi,
    DataGridDetailApi,
    DataGridRowPinningApi,
    DataGridDataUiApi,
    DataGridFilterBuilderApi,
    DataGridViewApi,
    DataGridTreeApi<Row> {
  /** The engine, with the façades of the optional modules a prop registers (`infiniteScroll`). */
  readonly engine: DataGridApiEngine<Row>;
  /** The root element; null before mount and after unmount. */
  readonly element: HTMLDivElement | null;
  /** Focuses the grid content: the focused body cell, else the last focused body cell, else the first body cell (also from the header, like Alt+W). */
  focus(): void;
  /** Scrolls the cell into view and focuses it. */
  focusCell(rowId: RowId, field: string): void;
  focusHeader(field: string): void;
  getFocusedCell(): DataGridFocusedCell | null;
  /** Registers a handler for a keyboard command (`DEFAULT_KEY_BINDINGS`); higher priority runs first. Returns the unregister function. */
  registerKeyHandler(command: string, handler: DataGridKeyHandler, options?: { priority?: number }): () => void;
  /** Row info by row id, or by any element inside a row (cell, custom template content). */
  getRowInfo(target: RowId | Element | EventTarget | null): DataGridRowInfo<Row> | undefined;
  getRowElement(rowId: RowId): HTMLElement | null;
  getCellElement(rowId: RowId, field: string): HTMLElement | null;
  scrollToRow(rowId: RowId, options?: DataGridScrollOptions): void;
  scrollToColumn(field: string, options?: DataGridScrollOptions): void;
  /** Fits widths to header and rendered content; every visible column when omitted. */
  autoSizeColumns(fields?: string | readonly string[]): void;
  setColumnWidth(field: string, width: number): DataGridActionResult;
  moveColumn(field: string, toIndex: number): DataGridActionResult;
  /** Rendered row range and center column range (overscan included). */
  getRenderedRange(): { readonly rows: VirtualRange; readonly columns: VirtualRange };
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DataGridProps<Row> extends DataGridChromeProps<Row>, DataGridQueryProps, DataGridEditProps<Row>, DataGridOutputProps<Row>, DataGridAdaptiveProps, DataGridDetailProps<Row>, DataGridRowPinningProps<Row>, DataGridDataUiProps<Row>, DataGridFilterBuilderProps, DataGridTreeProps<Row> {
  /** Rows (reactive: a new array replaces the rows) or a `DataSource` (read once on mount). */
  data?: readonly Row[] | DataSource<Row>;
  /** Column definitions; `<DataGridColumn>` children are the JSX form (children win over `columns`). */
  columns?: readonly DataGridColumn<Row>[];
  /** `<DataGridColumn>` and `<DataGridAggregateRow>` elements. */
  children?: ReactNode;
  /** Row identity. Default: the `primaryKey` column(s), else the `id` field (with a development warning). */
  getRowId?: (row: Row) => RowId | number;
  /** Extra core modules (initial only). */
  modules?: readonly DataGridModule<Row>[];
  /**
   * *Salmon*. Render features to use
   * synchronously, from `@salmonui/data-grid/features`. Optional: a grid
   * loads the features its props need on demand; features passed here skip
   * that load (no placeholder on a client-only render). Read at creation.
   */
  features?: readonly DataGridFeature[];
  locale?: string;
  /** IANA time zone for date formatting. Set it for SSR: server and client must format identically. */
  timeZone?: string;
  currency?: string;
  /**
   * Text direction. `'auto'` follows the
   * `locale` script (`ar`, `he`, `fa`, ... are right-to-left). Default: the
   * inherited `dir`. Reactive.
   */
  dir?: 'ltr' | 'rtl' | 'auto';

  /** Viewport height: px, any CSS length (`'100%'` needs a fixed-height parent), or `'auto'` (no row virtualization). Default 400. */
  height?: number | string;
  width?: number | string;
  /** Fixed row height in px. Default 36. */
  rowHeight?: number;
  /** Per-row fixed height. */
  getRowHeight?: (row: Row) => number;
  /** Enables measured row heights with this estimate (variable content, templates, wrapping). */
  estimatedRowHeight?: number;
  /** Header row height in px (per stacked level). Default 40. */
  headerHeight?: number;
  /** Width of columns without `width`. Default 160. */
  defaultColumnWidth?: number;
  /** Row and column virtualization; `true` (default) for the defaults, `false` renders every row and column. */
  virtualization?: boolean | DataGridVirtualization;
  /** Infinite scrolling for remote sources: rows load in blocks as the viewport approaches them. */
  infiniteScroll?: boolean | DataGridInfiniteScroll<Row>;
  /** Placeholder row while its block loads, or after the load failed. Default: the loading text, or the error and a Retry button. */
  renderLoadingRow?: (ctx: DataGridLoadingRowContext) => ReactNode;
  /** Rows in the deterministic server/initial range. Default 20. */
  initialRows?: number;
  /** Center columns in the deterministic server/initial range. Default 20. */
  initialColumns?: number;

  textWrap?: DataGridTextWrap;
  gridLines?: DataGridLines;
  /** Default text overflow of every column. Default `ellipsis`. */
  overflow?: DataGridOverflow;
  /** Row hover highlight. Default true. */
  highlightOnHover?: boolean;
  /** Alternate row shading. Default true. */
  striped?: boolean;
  /** Pointer and keyboard column resize. Default false; column `resizable` refines it. */
  resizable?: boolean;
  /**
   * Column fit. `'normal'`
   * (default): widths are kept, leaving empty space or scrolling. `'auto'`:
   * when the columns are narrower than the grid they stretch proportionally
   * to fill it, and a pointer resize re-fits the other columns.
   */
  resizeMode?: 'normal' | 'auto';
  /** Pointer and keyboard column reorder. Default false; column `reorderable` refines it. */
  reorderable?: boolean;

  onBeforeColumnVisibilityChange?: (event: DataGridColumnVisibilityChangeEvent) => void;
  onColumnVisibilityChange?: (event: DataGridColumnVisibilityChangeEvent) => void;
  onBeforeColumnReorder?: (event: DataGridColumnReorderEvent) => void;
  onColumnReorder?: (event: DataGridColumnReorderEvent) => void;

  /** `true` or settings: grouping UI and behavior. */
  grouping?: boolean | DataGridGrouping<Row>;
  onBeforeGroupChange?: (event: DataGridGroupChangeEvent) => void;
  onGroupChange?: (event: DataGridGroupChangeEvent) => void;
  onBeforeGroupToggle?: (event: DataGridGroupToggleEvent<Row>) => void;
  onGroupToggle?: (event: DataGridGroupToggleEvent<Row>) => void;
  /** Aggregate rows (or `<DataGridAggregateRow>` children). */
  aggregates?: readonly DataGridAggregateRow<Row>[];
  /** With paging: `page` (default) aggregates the current page, `all` every matching row. */
  aggregateScope?: 'page' | 'all';

  renderRow?: (ctx: DataGridRowContext<Row>) => ReactNode;
  renderEmpty?: (ctx: DataGridEmptyContext) => ReactNode;
  /** Body content while the data source failed to load. Default: the error message and a Retry button. */
  renderError?: (ctx: DataGridDataErrorContext) => ReactNode;
  /** Once per committed change of the displayed rows; never on scroll, focus, selection, or expansion. */
  onViewChange?: (event: DataGridViewChangeEvent) => void;
  /** Called for rendered rows only; `ctx.tree` in tree mode. */
  getRowProps?: (row: Row, rowIndex: number, ctx: { readonly tree?: DataGridTreeContext }) => DataGridElementProps | undefined;
  rowClassName?: (row: Row, rowIndex: number) => string | undefined;
  /** Called for rendered cells only. */
  getCellProps?: (ctx: DataGridCellContext<Row>) => DataGridElementProps | undefined;

  className?: string;
  style?: CSSProperties;
  classNames?: Partial<Record<DataGridPart, string>>;
  styles?: Partial<Record<DataGridPart, CSSProperties>>;
  /**
   * Icon overrides by name:
   * a node replaces the built-in SVG icon, `null` hides it. Merges over an
   * enclosing `DataGridIconsProvider`. A component prop, not a theme input.
   */
  icons?: DataGridIcons | undefined;
  /** Receives the grid instance; the root element is `api.element`. */
  ref?: Ref<DataGridApi<Row>>;
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  onWarning?: (warning: DataGridWarning) => void;
  /** Fires once after the first commit with the instance. */
  onReady?: (api: DataGridApi<Row>) => void;

  /** Selection. On by default: single row selection. `false` turns it off. */
  selection?: boolean | DataGridSelection;
  /** Cancel with `event.preventDefault()`. */
  onBeforeSelectionChange?: (event: DataGridSelectionChangeEvent<Row>) => void;
  onSelectionChange?: (event: DataGridSelectionChangeEvent<Row>) => void;
  /** Replaces the combos of keyboard commands (`{ 'selection.selectAll': ['Mod+Shift+L'] }`). Reactive: a changed value (compared by value) rebuilds the keymap. */
  keyBindings?: Readonly<Record<string, readonly string[]>>;
  /** Called for every key pressed in the grid before the built-in binding runs. */
  onKeyDown?: (ctx: DataGridKeyDownContext) => void;
  /**
   * Text overrides over the English catalog (`DATA_GRID_DEFAULT_LOCALE_TEXT`):
   * every visible and assistive string of the grid. Plain JSON with
   * `{param}` templates and plural forms. Reactive.
   */
  localeText?: DataGridLocaleText;
  /**
   * Saves the user's grid state (column order, widths, visibility, pinning,
   * sorting, filters, grouping, page, search, selection, scroll) and restores
   * it on mount. `true` uses `localStorage`
   * under `salmon-data-grid:<id>` (set `id`); an object sets the key, storage,
   * excluded parts, and an application version. Read on mount.
   */
  persistState?: boolean | DataGridPersistState;
}
