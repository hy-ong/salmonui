// Public types of tree mode. Types only: importing this file never
// pulls tree code. The `tree` render feature (features/feature-tree.tsx,
// tree-ui.tsx) implements them; `DataGridTreeToggle` (tree-toggle.tsx) is the
// public part for row templates.

import type { RowId } from '@salmonui/data-grid/engine';
import type { DataGridEvent } from '@salmonui/core/internal/events';
import type { DataGridActionResult } from './query-types.js';

/** Child load status of a lazy parent (`tree.hasChildrenField`). */
export type DataGridTreeLoadStatus = 'idle' | 'loading' | 'loaded' | 'error';

/** Relatives a filter (or a copy) keeps: matches with their ancestors (default), descendants, both, or matches only. */
export type DataGridTreeFilterMode = 'ancestors' | 'descendants' | 'both' | 'none';

/** Load context of `tree.loadChildren`. */
export interface DataGridTreeLoadContext<Row> {
  readonly rowId: RowId;
  readonly row: Row;
  readonly signal: AbortSignal;
}

/** `tree` prop (`true`: `{ childrenField: 'children' }`). */
export interface DataGridTree<Row = unknown> {
  /** Nested rows: the field holding child arrays. Default `'children'` unless `parentIdField` is set. */
  readonly childrenField?: string;
  /** Flat self-referential rows: the field holding the parent's row id (`parentIdMapping`); the id is `getRowId`. */
  readonly parentIdField?: string;
  /** Rows whose children load on demand (`hasChildMapping`). */
  readonly hasChildrenField?: string;
  /** Initial expansion from a boolean data field (`expandStateMapping`). */
  readonly expandedField?: string;
  /** Field or column id of the tree column (`treeColumnIndex`). Default: the first visible data column; follows reorder, pinning and hiding. */
  readonly column?: string;
  /** `true` (default): parents expanded; `false`: collapsed (`enableCollapseAll`); `n`: depths below `n` expanded. */
  readonly defaultExpanded?: boolean | number;
  /** *Salmon*: reactive expansion overrides over `defaultExpanded`. */
  readonly expandedRows?: Readonly<Record<RowId, boolean>>;
  /** Rows a filter or search keeps (`filterSettings.hierarchyMode`). Default `'ancestors'`. */
  readonly filterMode?: DataGridTreeFilterMode;
  /** Paging counts every visible row (default) or root rows with their subtrees (`pageSizeMode`). */
  readonly pageBy?: 'all' | 'root';
  /** Checkbox in the tree column (column `showCheckbox`); its state is the row selection. `cascade` selects subtrees (`hierarchyCheckboxMode`). */
  readonly checkbox?: boolean | { readonly cascade?: boolean | 'filtered' };
  /** Rows `copy()` adds around the copied rows (`copyHierarchyMode`). Default `'ancestors'`. */
  readonly copyMode?: DataGridTreeFilterMode;
  /**
   * Loads the children of a lazy row (`hasChildrenField`) for local data; the
   * returned rows join the data under the row. With a remote `data` source the
   * grid reads `read({ parentRowId })` instead.
   */
  readonly loadChildren?: (ctx: DataGridTreeLoadContext<Row>) => readonly Row[] | Promise<readonly Row[]>;
}

/** `ctx.tree` of `column.renderCell`, `getRowProps` and row templates in tree mode. */
export interface DataGridTreeContext {
  /** 0 for root rows. */
  readonly depth: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  readonly loadStatus: DataGridTreeLoadStatus;
}

/** `onBeforeTreeToggle` (cancel with `preventDefault()`) / `onTreeToggle`. */
export interface DataGridTreeToggleEvent<Row> extends DataGridEvent {
  readonly rowId: RowId;
  readonly row: Row | null;
  /** The new state. */
  readonly expanded: boolean;
  readonly depth: number;
  /** The row loads its children on demand. */
  readonly lazy: boolean;
}

/** Row info of `api.getTreeRow(rowId)`. */
export interface DataGridTreeRowInfo {
  readonly rowId: RowId;
  readonly depth: number;
  readonly parentId: RowId | null;
  readonly hasChildren: boolean;
  readonly childCount: number;
  readonly expanded: boolean;
  readonly loadStatus: DataGridTreeLoadStatus;
  /** 1-based ordinal and count among the kept siblings (`aria-posinset` / `aria-setsize`). */
  readonly posinset: number;
  readonly setsize: number;
  /** Kept only as an ancestor or descendant of a filter match. */
  readonly context: boolean;
  readonly visible: boolean;
}

/** Tree props of `DataGridProps`. */
export interface DataGridTreeProps<Row> {
  /** Tree mode: rows with children, indented in the tree column. Read at creation (its options are reactive). */
  tree?: boolean | DataGridTree<Row>;
  onBeforeTreeToggle?: (event: DataGridTreeToggleEvent<Row>) => void;
  onTreeToggle?: (event: DataGridTreeToggleEvent<Row>) => void;
}

/** Tree methods of `DataGridApi` (rejected or empty without `tree`). */
export interface DataGridTreeApi<Row> {
  expandAllTreeRows(): DataGridActionResult;
  collapseAllTreeRows(): DataGridActionResult;
  /** Expands the parents at `depth` (0: roots). */
  expandTreeLevel(depth: number): DataGridActionResult;
  collapseTreeLevel(depth: number): DataGridActionResult;
  expandTreeRows(rowIds: RowId | readonly RowId[]): DataGridActionResult;
  collapseTreeRows(rowIds: RowId | readonly RowId[]): DataGridActionResult;
  toggleTreeRow(rowId: RowId, expanded?: boolean): DataGridActionResult;
  /** Moves rows under their previous sibling. */
  indentRows(rowIds: RowId | readonly RowId[]): DataGridActionResult;
  /** Moves rows after their parent, as its siblings. */
  outdentRows(rowIds: RowId | readonly RowId[]): DataGridActionResult;
  getTreeRow(rowId: RowId): DataGridTreeRowInfo | null;
  /** Kept children of a row in view order (`null`: the roots). */
  getChildRows(rowId: RowId | null): readonly Row[];
  /** *Salmon*: retries a failed lazy child load. */
  reloadTreeChildren(rowId: RowId): DataGridActionResult;
  /** Visible data rows in view order. */
  getVisibleRows(): readonly Row[];
}
