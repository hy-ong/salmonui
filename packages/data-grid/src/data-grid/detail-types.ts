// Public types of detail rows, child grids, and row drag and drop (React
// layer), named by the public binding names. Events
// share the `DataGridEvent` base; before-events cancel with
// `event.preventDefault()`. `DataGridProps`, `DataGridApi`, and `DataGridLocaleText`
// extend the interfaces here.

import type { DataSource, RowDragHandoff, RowId } from '@salmonui/data-grid/engine';
import type { ReactNode } from 'react';
import type { DataGridEvent } from '@salmonui/core/internal/events';
import type { DataGridActionResult } from './query-types.js';
import type { DataGridApi, DataGridProps } from './types.js';

// ---------------------------------------------------------------------------
// Detail rows
// ---------------------------------------------------------------------------

/** Async detail content state (`loadDetail`), per parent row. */
export type DataGridDetailStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Context of `renderDetail`. */
export interface DataGridDetailContext<Row> {
  readonly row: Row;
  readonly rowId: RowId;
  /** Collapses this detail row. */
  readonly collapse: () => void;
  /** `loadDetail` state; `ready` without a loader. */
  readonly status: DataGridDetailStatus;
  /** The value `loadDetail` resolved to. */
  readonly data: unknown;
  readonly error: unknown;
  /** Loads the detail content again (after an error). */
  readonly retry: () => void;
}

/** Context of `loadDetail`. */
export interface DataGridDetailLoadContext<Row> {
  readonly rowId: RowId;
  readonly row: Row;
  /** Aborted when the row object is replaced or the grid unmounts. */
  readonly signal: AbortSignal;
}

/** `onBeforeDetailToggle` / `onDetailToggle`. */
export interface DataGridDetailToggleEvent<Row> extends DataGridEvent {
  readonly rowId: RowId;
  readonly row: Row | null;
  /** The state after the toggle (proposed in the before-event). */
  readonly expanded: boolean;
}

/** The parent row a child grid belongs to (factory form of `childGrid.data`). */
export interface DataGridChildGridParent<Parent> {
  readonly rowId: RowId;
  readonly row: Parent;
  /** Depth of the child grid (1 for children of the root grid). */
  readonly depth: number;
}

/**
 * `childGrid` prop: every
 * `DataGrid` prop of the child, plus the child rows and the relation. The child
 * inherits `locale`, `dir`, `timeZone`, and `currency` unless set.
 */
export interface DataGridChildGrid<Child = unknown, Parent = unknown> extends Omit<DataGridProps<Child>, 'data' | 'id' | 'ref' | 'children'> {
  /**
   * Child rows: one array shared by every parent (indexed once by the join
   * value), a data source (remote sources receive the relation filter), or a
   * factory per parent.
   */
  readonly data: readonly Child[] | DataSource<Child> | ((parent: DataGridChildGridParent<Parent>) => readonly Child[] | DataSource<Child>);
  /** Field present in parent and child rows. */
  readonly joinField?: string;
  /** Parent field when the names differ. Default `joinField`. */
  readonly parentField?: string;
  /** Child field when the names differ. Default `joinField`. */
  readonly childField?: string;
}

// ---------------------------------------------------------------------------
// Row drag and drop
// ---------------------------------------------------------------------------

/** `rowDrag` prop. */
export interface DataGridRowDrag {
  /** Drop into another grid (its `id`) or onto a custom element (its `id`). Default: reorder within the grid. */
  readonly targetId?: string;
  /** Allow drops into another group (grouped values are rewritten). Default false. */
  readonly acrossGroups?: boolean;
  /** Field holding a persisted order; drops write new values to it. */
  readonly orderField?: string;
  /** Registry shared by the grids that exchange rows. Default: one registry shared by every `DataGrid` of the page. */
  readonly handoff?: RowDragHandoff;
}

/** Row drag events (`onRowDragStart`, `onRowDrag`, `onBeforeRowDrop`, `onRowDrop`). */
export interface DataGridRowDragEvent<Row> extends DataGridEvent {
  readonly rowIds: readonly RowId[];
  /** The dragged rows (raw references). */
  rows(): readonly Row[];
  /** Data row index of the first dragged row (-1 for rows from another grid). */
  readonly fromIndex: number;
  /** Data row index the first row occupies after the drop; -1 without a valid target. */
  readonly toIndex: number;
  /** Target row and side; null outside the grid rows. */
  readonly targetRowId: RowId | null;
  readonly position: 'before' | 'after' | 'into' | null;
  /** Tree mode: the parent the rows join (`into`: the target row; null: the roots); undefined outside tree mode. */
  readonly parentId?: RowId | null;
  readonly valid: boolean;
  /** Why the target is invalid (`self`, `sorted`, `groupChange`, ...), or null. */
  readonly reason: string | null;
  /** The grid the rows drop into: this grid's id, another grid's id, or null (custom target or nowhere). */
  readonly targetGridId: string | null;
  /** Element under the pointer (pointer drags); null for keyboard and API moves. */
  readonly target: Element | null;
}

/** Context of `renderRowDragPreview`. */
export interface DataGridRowDragPreviewContext<Row> {
  readonly rowIds: readonly RowId[];
  readonly rows: readonly Row[];
}

// ---------------------------------------------------------------------------
// Props, API, text
// ---------------------------------------------------------------------------

export interface DataGridDetailProps<Row> {
  /** Detail row content below each expanded row. */
  renderDetail?: (ctx: DataGridDetailContext<Row>) => ReactNode;
  /** Estimated detail row height in px before measurement. Default 150. */
  detailHeight?: number;
  /** Rows without a detail (no toggle). Called for rendered rows only. */
  hasDetail?: (row: Row) => boolean;
  /** Async detail content, started on expand; `renderDetail` receives `status`, `data`, `error`. */
  loadDetail?: (ctx: DataGridDetailLoadContext<Row>) => unknown;
  /** Initially expanded details: `true` for every row, or row ids (initial only). */
  defaultExpandedDetails?: boolean | readonly RowId[];
  /**
   * Child grid inside each expanded row (hierarchy grid). An inline object
   * sees child rows as `unknown`; `defineChildGrid<Child, Parent>(config)`
   * types the child rows.
   */
  childGrid?: DataGridChildGrid<unknown, Row>;
  onBeforeDetailToggle?: (event: DataGridDetailToggleEvent<Row>) => void;
  onDetailToggle?: (event: DataGridDetailToggleEvent<Row>) => void;

  /** Row drag and drop with a drag handle column; `true` reorders within the grid. */
  rowDrag?: boolean | DataGridRowDrag;
  /** Cancel with `event.preventDefault()`. */
  onRowDragStart?: (event: DataGridRowDragEvent<Row>) => void;
  /** Once per animation frame while dragging. */
  onRowDrag?: (event: DataGridRowDragEvent<Row>) => void;
  /** Cancel with `event.preventDefault()`. */
  onBeforeRowDrop?: (event: DataGridRowDragEvent<Row>) => void;
  onRowDrop?: (event: DataGridRowDragEvent<Row>) => void;
  /** Drag preview content (default: the first cell text and the row count). */
  renderRowDragPreview?: (ctx: DataGridRowDragPreviewContext<Row>) => ReactNode;
}

/** Target of `moveRows(rowIds, { targetRowId, position })`. */
export interface DataGridMoveTarget {
  readonly targetRowId: RowId;
  readonly position: 'before' | 'after' | 'into';
}

export interface DataGridDetailApi {
  expandDetail(rowId: RowId): DataGridActionResult;
  collapseDetail(rowId: RowId): DataGridActionResult;
  /** Toggles one detail row; `expanded` forces a state. */
  toggleDetail(rowId: RowId, expanded?: boolean): DataGridActionResult;
  expandAllDetails(): DataGridActionResult;
  collapseAllDetails(): DataGridActionResult;
  isDetailExpanded(rowId: RowId): boolean;
  /** The mounted child grid of a parent row (null when collapsed or not rendered). */
  getChildGrid(rowId: RowId): DataGridApi<unknown> | null;
  /**
   * Moves rows so the first one ends at data row index `toIndex`, or next to / into a target row (`{ targetRowId, position }`;
   * `into` makes them the last children of the target in tree mode).
   */
  moveRows(rowIds: RowId | readonly RowId[], to: number | DataGridMoveTarget): DataGridActionResult;
}

