// Public types of features added after the code rename: the public column
// view of render contexts, `onViewChange`, `renderError`, the column chooser
// render props and search options, the `DataGridSearchBox` before-search event,
// and their labels. `DataGridProps`, `DataGridLocaleText`, and the render contexts
// in types.ts / query-types.ts / chrome-types.ts use these.

import type { ColumnType, ColumnWidth, FormatOptions } from '@salmonui/data-grid/engine';
import type { ReactNode } from 'react';
import type { DataGridEvent } from '@salmonui/core/internal/events';

// ---------------------------------------------------------------------------
// Public column view
// ---------------------------------------------------------------------------

/**
 * Read-only public view of a compiled column, as render props and events
 * receive it. Field names follow the name table; flags carry their resolved
 * defaults. Values are the definition's (runtime visibility, width, order,
 * and pin state are in `api.getState()` and the column events).
 */
export interface DataGridColumnInfo<Row = unknown> {
  /** The column key: `id`, else `field`, else a generated id. Payloads call it `field`. */
  readonly id: string;
  /** The data field (dot path), or null for columns without one. */
  readonly field: string | null;
  readonly header: string;
  readonly type: ColumnType;
  readonly format: string | FormatOptions | undefined;
  readonly align: 'start' | 'center' | 'end' | 'justify' | undefined;
  readonly headerAlign: 'start' | 'center' | 'end' | undefined;
  readonly width: ColumnWidth;
  readonly minWidth: number;
  /** `Infinity` when unbounded. */
  readonly maxWidth: number;
  /** Definition pin side. */
  readonly pinned: 'start' | 'end' | 'center' | null;
  /** Definition visibility. */
  readonly hidden: boolean;
  readonly sortable: boolean;
  readonly filterable: boolean;
  readonly searchable: boolean;
  readonly groupable: boolean;
  readonly editable: boolean;
  readonly resizable: boolean;
  readonly reorderable: boolean;
  /** Listed in the column chooser. */
  readonly hideable: boolean;
  readonly primaryKey: boolean;
  readonly lockPosition: boolean;
  readonly displayAsCheckbox: boolean;
  /** False for stacked header groups. */
  readonly leaf: boolean;
  /** Header depth (0 for top level). */
  readonly depth: number;
  /** Stacked header group ids, root first, ending with this column. */
  readonly path: readonly string[];
  /** Child column ids of a stacked header group. */
  readonly children: readonly string[];
  /** The column definition as given (`columns` entry or `<DataGridColumn>` props). */
  readonly definition: Readonly<Record<string, unknown>>;
  /** The column value of a row (`valueGetter`, else `field`). */
  getValue(row: Row): unknown;
  /** The display text of a value (`valueFormatter`, else `format`). */
  formatValue(value: unknown, row: Row): string;
}

// ---------------------------------------------------------------------------
// View change, data error
// ---------------------------------------------------------------------------

/** What changed the view (`onViewChange`). */
export type DataGridViewChangeReason = 'data' | 'sort' | 'filter' | 'search' | 'group' | 'page' | 'refresh';

/**
 * `onViewChange` (`type: 'viewChange'`): fires once
 * per committed change of the displayed rows (data, sort, filter, search,
 * group, page), after the commit that rendered it. Never on scroll, focus,
 * selection, or group / detail expansion. Not cancellable.
 */
export interface DataGridViewChangeEvent extends DataGridEvent {
  /** Data rows in the view (the current page; captions and footers not counted). */
  readonly rowCount: number;
  /** Rows matching the query across every page. */
  readonly totalRowCount: number;
  readonly reason: DataGridViewChangeReason;
}

/** Context of `renderError` (the data source failed to load). */
export interface DataGridDataErrorContext {
  readonly error: unknown;
  /** `error.message` when the error is an `Error`, else its string form. */
  readonly message: string;
  /** Re-reads the data source with the current query. */
  retry(): void;
}

// ---------------------------------------------------------------------------
// Column chooser
// ---------------------------------------------------------------------------

/** One listed column of the column chooser. */
export interface DataGridColumnChooserItem<Row = unknown> {
  /** Column key. */
  readonly field: string;
  readonly header: string;
  /** Draft visibility (applied on OK, or at once with `mode: 'immediate'`). */
  readonly hidden: boolean;
  /** Shown by the current search text. */
  readonly matches: boolean;
  readonly column: DataGridColumnInfo<Row>;
}

/** Context of `columnChooser.renderChooser`, `renderHeader`, and `renderFooter`. */
export interface DataGridColumnChooserContext<Row = unknown> {
  /** Hideable leaf columns in definition order. */
  readonly columns: readonly DataGridColumnChooserItem<Row>[];
  /** Current search text (empty without `searchable`). */
  readonly searchText: string;
  setSearchText(text: string): void;
  /** Updates the draft visibility (immediate mode applies it at once). At least one column stays visible. */
  setHidden(fields: string | readonly string[], hidden: boolean): void;
  /** Applies the draft and closes (the OK button). */
  apply(): void;
  /** Discards the draft and closes. */
  close(): void;
  /** The built-in content the render prop replaces (search box and list, or the OK / Cancel buttons). */
  readonly defaultContent: ReactNode;
}

// ---------------------------------------------------------------------------
// DataGridSearchBox
// ---------------------------------------------------------------------------

/** `DataGridSearchBox` `onBeforeSearch` (`type: 'beforeSearch'`); `preventDefault()` skips the search. */
export interface DataGridSearchBoxSearchEvent extends DataGridEvent {
  readonly text: string;
}

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

