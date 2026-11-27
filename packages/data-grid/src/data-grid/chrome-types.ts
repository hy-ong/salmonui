// Public types of the column chrome: pinned columns, sticky rows, spans,
// the shared menu item model, column menu, column chooser, toolbar, context
// menu, column resize / drag / reorder / visibility events, and UI commands.
// `DataGridProps`, `DataGridColumn`, and `DataGridApi` extend the interfaces at the
// bottom of this file. Every event extends `DataGridEvent` (events.ts).

import type { CommandResult, CompiledColumn, RowId } from '@salmonui/data-grid/engine';
import type { ReactNode } from 'react';
import type { DataGridEvent } from '@salmonui/core/internal/events';
import type { DataGridColumnChooserContext, DataGridColumnInfo } from './feature-types.js';
import type { DataGridApi, DataGridPart } from './types.js';

// ---------------------------------------------------------------------------
// Pinned columns, sticky rows
// ---------------------------------------------------------------------------

/**
 * Logical pin side: `start` is the left edge in LTR and the right edge in RTL;
 * `center` is the fixed zone: the column
 * stays where it is at scroll start while the other center columns scroll on
 * both sides of it.
 */
export type DataGridColumnPin = 'start' | 'end' | 'center';

/** Count shorthand: the first / last N visible columns are pinned. */
export interface DataGridPinnedColumns {
  readonly start?: number;
  readonly end?: number;
}

/** `onBeforeColumnPinChange` (cancellable) / `onColumnPinChange`. */
export interface DataGridColumnPinChangeEvent extends DataGridEvent {
  readonly field: string;
  /** Proposed (before) or applied (after) side; `null` unpins. */
  readonly pinned: DataGridColumnPin | null;
  readonly previousPinned: DataGridColumnPin | null;
}

// ---------------------------------------------------------------------------
// Spanning
// ---------------------------------------------------------------------------

export interface DataGridSpanContext<Row> {
  readonly row: Row;
  readonly rowId: RowId;
  readonly rowIndex: number;
  readonly column: DataGridColumnInfo<Row>;
  /** Column id of the cell. */
  readonly field: string;
  readonly value: unknown;
}

/**
 * Span of a cell: a function returns an explicit span (1 = no span); `true`
 * merges equal adjacent non-empty values. Called for rendered rows only.
 */
export type DataGridSpan<Row> = boolean | ((ctx: DataGridSpanContext<Row>) => number);

/**
 * DataGrid-wide merging of equal adjacent values: `true` both directions,
 * `'rows'` vertical (`rowSpan: true` on every column), `'columns'`
 * horizontal. A column's own `colSpan` / `rowSpan` wins.
 */
export type DataGridMergeCells = boolean | 'rows' | 'columns';

/** Span fields of a column. */
export interface DataGridSpanColumn<Row> {
  /** Covers following visible columns of the same pin zone (clamped at a pin edge). */
  readonly colSpan?: DataGridSpan<Row>;
  /** Covers following rows, also under row virtualization; in tree mode a span ends at a parent boundary. */
  readonly rowSpan?: DataGridSpan<Row>;
}

/** Chrome fields of `DataGridColumn`. */
export interface DataGridChromeColumn<Row> extends DataGridSpanColumn<Row> {
  /** Column menu button on this header. Default true when the grid `columnMenu` is on. */
  readonly menu?: boolean;
}

// ---------------------------------------------------------------------------
// Menus (shared item model)
// ---------------------------------------------------------------------------

export interface DataGridMenuItem {
  /** Built-in id or a custom id (reported in click events). */
  readonly id: string;
  readonly label?: string;
  /** Decorative icon (rendered `aria-hidden`). */
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
  /** Shown as the item tooltip when disabled. */
  readonly disabledReason?: string;
  /** Renders `menuitemcheckbox` with `aria-checked`. */
  readonly checked?: boolean;
  readonly separator?: boolean;
  /** Nested submenu. */
  readonly items?: readonly DataGridMenuItem[];
  /** Custom content of the item (the item keeps its role and keyboard behavior). */
  readonly render?: () => ReactNode;
  /** Renders the item as a link (`<a role="menuitem">`). */
  readonly href?: string;
  /** Link target of an `href` item (`_blank`, ...). */
  readonly target?: string;
  /**
   * Context menu only: the target kinds the item shows on (a selector).
   * Omitted: every target. Built-in
   * ids keep their own area (header, content, pager) and ignore it.
   */
  readonly targets?: readonly DataGridContextMenuTarget['kind'][];
}

export type DataGridColumnMenuItemId =
  | 'autoSize' | 'autoSizeAll' | 'group' | 'ungroup' | 'sortAscending' | 'sortDescending' | 'clearSort'
  | 'columnChooser' | 'filter' | 'pinStart' | 'pinEnd' | 'unpin';

/** `onBeforeColumnMenuOpen` (cancellable: the menu stays closed). */
export interface DataGridColumnMenuOpenEvent<Row> extends DataGridEvent {
  readonly field: string;
  readonly column: DataGridColumnInfo<Row>;
  /** Mutable copy of the resolved items; edit the array in place (`splice`, `push`) to hide or add items for this column. The field itself is read-only. */
  readonly items: DataGridMenuItem[];
}

/** `onBeforeColumnMenuClose` (cancellable: the menu stays open). */
export interface DataGridColumnMenuCloseEvent<Row> extends DataGridEvent {
  readonly field: string;
  readonly column: DataGridColumnInfo<Row>;
}

/** `onColumnMenuItemClick`; `preventDefault()` skips the built-in action. */
export interface DataGridColumnMenuItemClickEvent<Row> extends DataGridEvent {
  readonly item: DataGridMenuItem;
  readonly field: string;
  readonly column: DataGridColumnInfo<Row>;
}

export interface DataGridColumnMenuContext<Row> {
  readonly field: string;
  readonly column: DataGridColumnInfo<Row>;
  readonly items: readonly DataGridMenuItem[];
  readonly defaultMenu: ReactNode;
  readonly close: () => void;
}

// ---------------------------------------------------------------------------
// Column chooser
// ---------------------------------------------------------------------------

export interface DataGridColumnChooser<Row = unknown> {
  /** Search box above the list (`enableSearching`). Default true. */
  readonly searchable?: boolean;
  /** Search operator (`columnChooserSettings.operator`). Default `contains`. */
  readonly searchOperator?: 'contains' | 'startsWith' | 'endsWith' | 'equal';
  /** Search ignores diacritics (`ignoreAccent`): `"resume"` finds `"Résumé"`. Default false. */
  readonly ignoreAccents?: boolean;
  /** Delay in ms before typed search text filters the list (`immediateModeDelay`). Default 0. */
  readonly debounce?: number;
  /** `confirm` (default): OK applies, Cancel discards. `immediate`: every toggle applies. */
  readonly mode?: 'confirm' | 'immediate';
  /** Replaces the search box and the column list (`template`, `renderCustomColumnChooser`); `defaultContent` is the built-in. */
  readonly renderChooser?: (ctx: DataGridColumnChooserContext<Row>) => ReactNode;
  /** Content above the search box (`headerTemplate`). */
  readonly renderHeader?: (ctx: DataGridColumnChooserContext<Row>) => ReactNode;
  /** Replaces the OK / Cancel buttons (`footerTemplate`); `defaultContent` is the built-in buttons. */
  readonly renderFooter?: (ctx: DataGridColumnChooserContext<Row>) => ReactNode;
}

/** `onBeforeColumnChooserOpen` (cancellable). */
export interface DataGridColumnChooserOpenEvent<Row> extends DataGridEvent {
  readonly columns: readonly DataGridColumnInfo<Row>[];
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

export type DataGridToolbarItemId =
  | 'add' | 'edit' | 'save' | 'delete' | 'cancel' | 'search' | 'print' | 'columnChooser'
  | 'exportExcel' | 'exportPdf' | 'exportCsv' | 'expandAll' | 'collapseAll' | 'copy' | 'filterBuilder'
  /** Tree mode: disabled when the focused or selected rows cannot move. */
  | 'indent' | 'outdent';

/**
 * A toolbar item. An object whose `id` is a built-in id keeps the built-in
 * behavior (use it to change the label, icon, or alignment of a built-in).
 * `disabled` is reactive.
 */
export interface DataGridToolbarItem {
  readonly id: string;
  /** Button text; for a `render` item its accessible name and overflow menu text (development builds warn when a `render` item has neither `label` nor `title`). */
  readonly label?: string;
  readonly icon?: ReactNode;
  /** Tooltip (`title`). */
  readonly title?: string;
  readonly align?: 'start' | 'center' | 'end';
  readonly disabled?: boolean;
  /** Custom content; the item keeps its roving tab stop. */
  readonly render?: (ctx: { readonly disabled: boolean }) => ReactNode;
}

/** `onToolbarItemClick`; `preventDefault()` skips the built-in action. */
export interface DataGridToolbarItemClickEvent extends DataGridEvent {
  readonly item: DataGridToolbarItem;
}

export interface DataGridToolbarContext<Row = unknown> {
  readonly items: readonly DataGridToolbarItem[];
  readonly defaultToolbar: ReactNode;
  readonly api: DataGridApi<Row>;
}

// ---------------------------------------------------------------------------
// Context menu
// ---------------------------------------------------------------------------

export type DataGridContextMenuItemId =
  | 'autoSize' | 'autoSizeAll' | 'sortAscending' | 'sortDescending' | 'group' | 'ungroup'
  | 'edit' | 'delete' | 'save' | 'cancel' | 'copy' | 'exportPdf' | 'exportExcel' | 'exportCsv'
  | 'firstPage' | 'previousPage' | 'nextPage' | 'lastPage' | 'pinStart' | 'pinEnd' | 'unpin';

export type DataGridContextMenuTarget =
  | { readonly kind: 'header'; readonly field: string }
  | { readonly kind: 'cell'; readonly rowId: RowId; readonly field: string }
  | { readonly kind: 'row'; readonly rowId: RowId }
  | { readonly kind: 'groupCaption'; readonly rowId: RowId }
  | { readonly kind: 'pager' };

/** `onBeforeContextMenuOpen` (cancellable). */
export interface DataGridContextMenuOpenEvent extends DataGridEvent {
  readonly target: DataGridContextMenuTarget;
  /** Mutable copy of the resolved items; edit the array in place (`splice`, `push`). The field itself is read-only. */
  readonly items: DataGridMenuItem[];
}

/** `onBeforeContextMenuClose` (cancellable: the menu stays open). */
export interface DataGridContextMenuCloseEvent extends DataGridEvent {
  readonly target: DataGridContextMenuTarget;
}

/** `onContextMenuItemClick`; `preventDefault()` skips the built-in action. */
export interface DataGridContextMenuItemClickEvent<Row> extends DataGridEvent {
  readonly item: DataGridMenuItem;
  readonly target: DataGridContextMenuTarget;
  /** The target row, or the selection when the target row is selected; empty for header and pager targets. Lazy. */
  readonly rowIds: readonly RowId[];
  /** Row objects of `rowIds`. */
  rows(): readonly Row[];
}

export interface DataGridContextMenuContext {
  readonly target: DataGridContextMenuTarget;
  readonly items: readonly DataGridMenuItem[];
  readonly defaultMenu: ReactNode;
  readonly close: () => void;
}

// ---------------------------------------------------------------------------
// Resize, drag, reorder, and visibility events
// ---------------------------------------------------------------------------

/** `onColumnResizeStart` (cancellable) / `onColumnResize` (per frame) / `onColumnResizeEnd`. */
export interface DataGridColumnResizeEvent extends DataGridEvent {
  readonly field: string;
  /** Width in px (live during the drag; committed on end). */
  readonly width: number;
  /** Width in px when the resize started. */
  readonly previousWidth: number;
}

/** `onColumnDragStart` / `onColumnDrag` (per frame) / `onColumnDrop`. */
export interface DataGridColumnDragEvent extends DataGridEvent {
  readonly field: string;
  readonly fromIndex: number;
  /** Proposed visible index (-1 when the current drop target is invalid). */
  readonly toIndex: number;
}

/** `onBeforeColumnReorder` (cancellable) / `onColumnReorder`, raised for every column move. */
export interface DataGridColumnReorderEvent extends DataGridEvent {
  readonly field: string;
  readonly fromIndex: number;
  readonly toIndex: number;
}

/** `onBeforeColumnVisibilityChange` (cancellable) / `onColumnVisibilityChange`. */
export interface DataGridColumnVisibilityChangeEvent extends DataGridEvent {
  readonly hidden: readonly string[];
  readonly shown: readonly string[];
}

// ---------------------------------------------------------------------------
// UI commands (toolbar, menus) for optional modules (editing, export, print)
// ---------------------------------------------------------------------------

/**
 * Named UI commands the toolbar and menus run. A handler registered with
 * `api.registerCommandHandler` wins; otherwise a module that declares the
 * command type receives it through `dispatch`; otherwise the command is a
 * no-op with a development warning.
 */
export type DataGridUiCommand =
  | 'edit.add' | 'edit.begin' | 'edit.delete' | 'edit.save' | 'edit.cancel'
  | 'clipboard.copy' | 'export.excel' | 'export.pdf' | 'export.csv' | 'grid.print';

export type DataGridCommandHandler = (payload: Readonly<Record<string, unknown>>) => boolean | void;

// ---------------------------------------------------------------------------
// Props and API added to DataGrid
// ---------------------------------------------------------------------------

export interface DataGridChromeProps<Row> {
  /** The first / last N visible columns are pinned. Reactive. */
  pinnedColumns?: DataGridPinnedColumns;
  /** The first N rows of the visible row model stick below the header. */
  stickyRows?: number;
  /** The last N rows of the visible row model stick above the footer. */
  stickyBottomRows?: number;
  onBeforeColumnPinChange?: (event: DataGridColumnPinChangeEvent) => void;
  onColumnPinChange?: (event: DataGridColumnPinChangeEvent) => void;
  /** DataGrid-wide merging of equal adjacent values (row merging also works under row virtualization). */
  mergeCells?: DataGridMergeCells;
  /** Column menu; an array lists the items in order (built-in ids or custom items). `column.menu: false` opts a column out. */
  columnMenu?: boolean | readonly (DataGridColumnMenuItemId | DataGridMenuItem)[];
  onBeforeColumnMenuOpen?: (event: DataGridColumnMenuOpenEvent<Row>) => void;
  onBeforeColumnMenuClose?: (event: DataGridColumnMenuCloseEvent<Row>) => void;
  onColumnMenuItemClick?: (event: DataGridColumnMenuItemClickEvent<Row>) => void;
  renderColumnMenu?: (ctx: DataGridColumnMenuContext<Row>) => ReactNode;
  columnChooser?: boolean | DataGridColumnChooser<Row>;
  onBeforeColumnChooserOpen?: (event: DataGridColumnChooserOpenEvent<Row>) => void;
  toolbar?: readonly (DataGridToolbarItemId | DataGridToolbarItem)[];
  onToolbarItemClick?: (event: DataGridToolbarItemClickEvent) => void;
  renderToolbar?: (ctx: DataGridToolbarContext<Row>) => ReactNode;
  /** Context menu; an array lists the items in order. Items that do not apply to the target are dropped. */
  contextMenu?: boolean | readonly (DataGridContextMenuItemId | DataGridMenuItem)[];
  onBeforeContextMenuOpen?: (event: DataGridContextMenuOpenEvent) => void;
  onBeforeContextMenuClose?: (event: DataGridContextMenuCloseEvent) => void;
  onContextMenuItemClick?: (event: DataGridContextMenuItemClickEvent<Row>) => void;
  renderContextMenu?: (ctx: DataGridContextMenuContext) => ReactNode;
  onColumnResizeStart?: (event: DataGridColumnResizeEvent) => void;
  onColumnResize?: (event: DataGridColumnResizeEvent) => void;
  onColumnResizeEnd?: (event: DataGridColumnResizeEvent) => void;
  onColumnDragStart?: (event: DataGridColumnDragEvent) => void;
  onColumnDrag?: (event: DataGridColumnDragEvent) => void;
  onColumnDrop?: (event: DataGridColumnDragEvent) => void;
}

export interface DataGridChromeApi {
  /** Pins a column (id or field) to a side or unpins it (`null`). */
  pinColumn(field: string, pinned: DataGridColumnPin | null): CommandResult;
  /** Opens the column chooser; at the given viewport point, else at the grid start. */
  openColumnChooser(position?: { readonly x: number; readonly y: number }): void;
  openColumnMenu(field: string): void;
  openFilterMenu(field: string): void;
  /** Closes any open menu, dialog, or chooser (focus returns to its invoker). */
  closeOverlays(): void;
  /** Registers the handler of a UI command (toolbar, menus); returns the unregister function. */
  registerCommandHandler(command: DataGridUiCommand | (string & {}), handler: DataGridCommandHandler): () => void;
  /** Runs a UI command (handler, then a module command, else a dev warning). Returns true when handled. */
  runCommand(command: DataGridUiCommand | (string & {}), payload?: Readonly<Record<string, unknown>>): boolean;
  /** Header cell of a column (id or field); `null` outside the rendered window. */
  getHeaderElement(field: string): HTMLElement | null;
  /** First rendered element of a part; `null` when it is not rendered. */
  getPartElement(part: DataGridPart): HTMLElement | null;
}
