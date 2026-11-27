// Public types of the data-state UI and the row and cell click events: the loading
// indicator, `refresh()`, the delegated
// row and cell click events, and the engine dev-tooling switches.

import type { ReactNode } from 'react';
import type { RowId } from '@salmonui/data-grid/engine';
import type { DataGridEvent } from '@salmonui/core/internal/events';
import type { DataGridColumnInfo } from './feature-types.js';

/** What the loading indicator is shown for. */
export type DataGridLoadingPhase = 'initial' | 'refresh' | 'page';

/** Context of `renderLoading`. */
export interface DataGridLoadingContext {
  /** `initial` before the first result, `page` while a page change loads, else `refresh` (also `setLoading(true)`). */
  readonly phase: DataGridLoadingPhase;
}

/** `onRowClick` / `onRowDoubleClick`. `preventDefault()` cancels the built-in action. */
export interface DataGridRowClickEvent<Row> extends DataGridEvent {
  readonly rowId: RowId;
  readonly row: Row;
  /** Visible index of the row. */
  readonly rowIndex: number;
  /** Column key of the clicked cell, or null outside a cell. */
  readonly field: string | null;
  readonly column: DataGridColumnInfo<Row> | null;
  /** The row element. */
  readonly element: HTMLElement;
  readonly nativeEvent: MouseEvent;
}

/** `onCellClick` / `onCellDoubleClick`. `preventDefault()` cancels the built-in action. */
export interface DataGridCellClickEvent<Row> extends DataGridEvent {
  readonly rowId: RowId;
  readonly row: Row;
  readonly rowIndex: number;
  readonly field: string;
  readonly column: DataGridColumnInfo<Row> | null;
  /** The cell value (`valueGetter`, else `field`). */
  readonly value: unknown;
  /** The cell element. */
  readonly element: HTMLElement;
  readonly nativeEvent: MouseEvent;
}

/** `DataGrid` props of the data-state UI, the click events, and the engine dev tooling. */
export interface DataGridDataUiProps<Row> {
  /** Built-in loading indicator. Default `spinner`. */
  loadingIndicator?: 'spinner' | 'skeleton';
  /** Replaces the content of the loading indicator (presentational: the grid announces loading itself). */
  renderLoading?: (ctx: DataGridLoadingContext) => ReactNode;
  /** A data row was clicked. `preventDefault()` skips the built-in selection and focus. */
  onRowClick?: (event: DataGridRowClickEvent<Row>) => void;
  /** A data row was double-clicked. `preventDefault()` skips the built-in edit start. */
  onRowDoubleClick?: (event: DataGridRowClickEvent<Row>) => void;
  /** A cell of a data row was clicked; fires before `onRowClick`. */
  onCellClick?: (event: DataGridCellClickEvent<Row>) => void;
  /** A cell of a data row was double-clicked; fires before `onRowDoubleClick`. */
  onCellDoubleClick?: (event: DataGridCellClickEvent<Row>) => void;
  /** Keeps a serializable log of applied commands (`api.engine.getCommandLog()`). Initial only. Default false. */
  recordCommands?: boolean;
  /** Exposes store counters (`api.engine.getInstrumentation()`). Initial only. Default false. */
  instrument?: boolean;
}

/** `DataGridApi` methods of the data-state UI. */
export interface DataGridDataUiApi {
  /**
   * Shows the loading indicator until `setLoading(false)`. A data load in progress shows it
   * regardless.
   */
  setLoading(loading: boolean): void;
}
