// Public types of the query UI: sorting, filtering,
// searching, and paging. One `boolean | Object` prop per feature
// (`true` = defaults, `false` / absent = off); options props are reactive
// (compared structurally with the previous prop value); `on*` events share
// the `DataGridEvent` base, before-events cancel with `event.preventDefault()`.
// The column key in every payload, option, and argument is `field` (a column
// id, or a `field` resolved to the first leaf with it). `DataGridProps`,
// `DataGridColumn` and `DataGridApi` extend the interfaces here.

import type { CommandResult, Json } from '@salmonui/data-grid/engine';
import type { ReactNode } from 'react';
import type { DataGridEvent } from '@salmonui/core/internal/events';
import type { DataGridColumnInfo } from './feature-types.js';

/** Result of an action method (`applied`, `rejected`, or `async`). */
export type DataGridActionResult = CommandResult;

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

export type DataGridSortDirection = 'asc' | 'desc';

/** One sorted column. */
export interface DataGridSortItem {
  field: string;
  direction: DataGridSortDirection;
}

/** `sorting` prop. */
export interface DataGridSorting {
  /** Ctrl/Cmd+click and Ctrl/Cmd+Enter add columns to the sort. Default false. */
  multiple?: boolean;
  /** Header click cycle. Default `['asc', 'desc', null]`; `['asc', 'desc']` never unsorts. */
  order?: readonly (DataGridSortDirection | null)[];
  /** Sorted columns, in priority order. */
  sortBy?: readonly DataGridSortItem[];
  /**
   * `'sorted'` (default): only a sorted header shows its direction arrow.
   * `'always'`: every sortable header shows an up and down arrow pair, the
   * active direction highlighted.
   */
  indicators?: 'sorted' | 'always';
}

/** `onBeforeSortChange` (`type: 'beforeSortChange'`) and `onSortChange` (`'sortChange'`). */
export interface DataGridSortChangeEvent extends DataGridEvent {
  /** Proposed (before) or applied (after) sort. */
  readonly sortBy: readonly DataGridSortItem[];
  readonly previousSortBy: readonly DataGridSortItem[];
  /** Column that triggered the change, if any. */
  readonly field: string | null;
}

// ---------------------------------------------------------------------------
// Filtering
// ---------------------------------------------------------------------------

/** Filter UI of the grid or a column. */
export type DataGridFilterUi = 'row' | 'menu' | 'checklist' | 'excel';

/** Built-in operators (the core also accepts the lowercase spellings); custom operator names pass through. */
export type DataGridFilterOperator =
  | 'equal'
  | 'notEqual'
  | 'startsWith'
  | 'endsWith'
  | 'contains'
  | 'doesNotContain'
  | 'doesNotStartWith'
  | 'doesNotEndWith'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'isNull'
  | 'isNotNull'
  | 'isEmpty'
  | 'isNotEmpty'
  | 'between'
  | 'in'
  | 'notIn'
  | 'like'
  | 'wildcard'
  | (string & {});

/** One filter condition. */
export interface DataGridFilterCondition {
  field: string;
  operator: DataGridFilterOperator;
  /** `between`: `[from, to]`; `in` / `notIn`: an array. */
  value?: Json;
  /** How the condition joins the previous condition on the same column at the top level. Default `and`. Ignored inside a group (the group's `logic` combines its members). */
  logic?: 'and' | 'or';
  matchCase?: boolean;
  ignoreAccents?: boolean;
}

/**
 * Nested AND/OR group: `logic` combines its members (`{ logic: 'or',
 * filters: [A, B] }` is A OR B); member `logic` is ignored. A top-level
 * group is ANDed with the other top-level filters.
 */
export interface DataGridFilterGroup {
  logic: 'and' | 'or';
  /** Negates the group: NOT (A AND B). Default false. */
  not?: boolean;
  filters: readonly DataGridFilter[];
}

export type DataGridFilter = DataGridFilterCondition | DataGridFilterGroup;

/** `filtering` prop. */
export interface DataGridFiltering {
  /** Default `row`. */
  ui?: DataGridFilterUi;
  /** Active filters. */
  filters?: readonly DataGridFilter[];
  /** Default for conditions that omit it. Default false. */
  matchCase?: boolean;
  /** Default for conditions that omit it. Default false. */
  ignoreAccents?: boolean;
  /** Filter row: apply on Enter (default) or while typing after `debounce`. */
  trigger?: 'input' | 'enter';
  /** Delay of `trigger: 'input'` in ms. Default 1500. */
  debounce?: number;
  /** Filter row: an operator dropdown per cell. Default false. */
  showOperators?: boolean;
  /** Operators offered per column type, in order (the first is the default). Labels come from the `localeText` keys `operator<Name>` (`operatorContains`). */
  operators?: Partial<Record<'string' | 'number' | 'date' | 'datetime' | 'boolean', readonly DataGridFilterOperator[]>>;
  /** Header filter button for `menu` / `checklist` / `excel` (Salmon). Default true. */
  headerButton?: boolean;
  /**
   * Distinct values the `checklist` / `excel` list requests at a time.
   * Default 100.
   */
  checklistPageSize?: number;
  /**
   * Load the next `checklistPageSize` values as the list scrolls to its end.
   * Default true; false requests
   * every value at once.
   */
  checklistInfiniteScroll?: boolean;
  /**
   * Filter row: the default pager shows the applied filters ("Filtered by
   * ..."). Default true. No pager, no
   * status.
   */
  showStatus?: boolean;
  /**
   * Loading state of the `checklist` / `excel` values while a remote facet
   * loads. Default `skeleton` (shimmer placeholder rows).
   */
  loadingIndicator?: 'spinner' | 'skeleton';
  /**
   * Advanced filter builder dialog: edits the nested AND/OR groups of `filters`.
   * Open it with the `filterBuilder` toolbar item or `api.openFilterBuilder()`.
   * `includeHidden` also offers hidden columns. Default false.
   */
  builder?: boolean | { readonly includeHidden?: boolean };
}

/** Column `filter`: per-column UI, default operator, and offered operators. */
export interface DataGridColumnFilter {
  ui?: DataGridFilterUi;
  operator?: DataGridFilterOperator;
  operators?: readonly DataGridFilterOperator[];
  /**
   * Attributes of the built-in value editors of this column: `placeholder`, `min`, `max`, `step`, `inputMode`,
   * `aria-*`, `data-*`, `className`, `style`, ... Value, type, ref, and
   * event handlers stay the grid's. `renderFilter` / `renderFilterCell`
   * receive them as `editorProps`.
   */
  editorProps?: Readonly<Record<string, unknown>>;
}

/** Context of column `renderFilter` (menu value editor) and `renderFilterCell` (filter row cell). */
export interface DataGridFilterContext<Row> {
  readonly column: DataGridColumnInfo<Row>;
  readonly field: string;
  /** Operators offered for the column. */
  readonly operators: readonly DataGridFilterOperator[];
  readonly operator: DataGridFilterOperator;
  /** Column `filter.editorProps` (empty when not set). */
  readonly editorProps: Readonly<Record<string, unknown>>;
  /** The draft value (menu) or the applied value (filter row). */
  readonly value: Json;
  setOperator(operator: DataGridFilterOperator): void;
  setValue(value: Json): void;
  /** Applies the draft; `value` overrides it. The menu closes after applying. */
  apply(value?: Json): void;
  clear(): void;
}

/** `onBeforeFilterChange` (`type: 'beforeFilterChange'`) and `onFilterChange` (`'filterChange'`). */
export interface DataGridFilterChangeEvent extends DataGridEvent {
  /** Proposed (before) or applied (after) filters. */
  readonly filters: readonly DataGridFilter[];
  readonly previousFilters: readonly DataGridFilter[];
  readonly field: string | null;
  /** `'builder'` when the filter builder dialog applied the change; absent otherwise. */
  readonly ui?: 'builder';
}

/**
 * `onBeforeFilterMenuOpen` (`type: 'beforeFilterMenuOpen'`, cancellable: the
 * menu or dialog stays closed) and `onFilterMenuOpen` (`'filterMenuOpen'`,
 * after it rendered). Opening the custom-condition section of the Excel menu
 * raises both with `dialog: 'custom'`.
 */
export interface DataGridFilterMenuOpenEvent extends DataGridEvent {
  readonly field: string;
  /** The menu's filter UI (a filter row column opened from the column menu shows `'menu'`). */
  readonly ui: Exclude<DataGridFilterUi, 'row'>;
  readonly dialog: 'menu' | 'custom';
}

// ---------------------------------------------------------------------------
// Searching
// ---------------------------------------------------------------------------

/** `search` prop. */
export interface DataGridSearch {
  text?: string;
  /** Columns searched. Default: every searchable non-date column. */
  fields?: readonly string[];
  /** Default `contains`. `wildcard` (`*` any sequence, `?` one character) and `like` (`%` any sequence) match the whole value. */
  operator?: 'contains' | 'startsWith' | 'endsWith' | 'equal' | 'notEqual' | 'wildcard' | 'like';
  /** Default false. */
  matchCase?: boolean;
  /** Default false. */
  ignoreAccents?: boolean;
  /**
   * Wraps the matches of the applied search in `<mark class="salmon-data-grid-search-mark">`
   * in the displayed text of rendered cells of the searched columns (not in
   * `renderCell` templates). Default false; no cost while off.
   */
  highlight?: boolean;
}

/** `onBeforeSearchChange` (`type: 'beforeSearchChange'`) and `onSearchChange` (`'searchChange'`). */
export interface DataGridSearchChangeEvent extends DataGridEvent {
  /** Proposed (before) or applied (after) text. */
  readonly text: string;
  readonly previousText: string;
}

// ---------------------------------------------------------------------------
// Paging
// ---------------------------------------------------------------------------

/** `paging` prop. */
export interface DataGridPaging {
  /** 1-based. Default 1. */
  page?: number;
  /** Default 12. */
  pageSize?: number;
  /** Numeric page buttons shown at once. Default 8. */
  buttonCount?: number;
  /** Page size dropdown: `true` for `['all', 5, 10, 12, 20]`, or the options (`'all'` for every row). Default false. */
  pageSizeOptions?: boolean | readonly (number | 'all')[];
  /**
   * Keeps the page in the URL query string.
   * Opt-in. After mount the grid reads the parameter (default `page`) and
   * goes to that page, then writes page changes with `history.replaceState`
   * (no history entries). The server renders `page`; pass the parameter as
   * `page` from the request to render the same page on the server. Read on
   * mount only.
   */
  syncUrl?: boolean | { readonly param?: string };
  /**
   * Total row count for the pager when the data source pages remotely and
   * reports no total (or a wrong one); wins over the source's total.
   * Reactive. Ignored when paging runs locally.
   */
  totalRowCount?: number;
}

/** Context of `renderPager`. */
export interface DataGridPagerContext {
  /** Effective 1-based page. */
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
  readonly totalRowCount: number;
  /** `paging.pageSizeOptions` with `'all'` resolved to the row count. */
  readonly pageSizeOptions: readonly number[];
  goToPage(page: number): void;
  setPageSize(pageSize: number): void;
  /** The built-in pager, to wrap or decorate. */
  readonly defaultPager: ReactNode;
}

/** `onBeforePageChange` (`type: 'beforePageChange'`) and `onPageChange` (`'pageChange'`). */
export interface DataGridPageChangeEvent extends DataGridEvent {
  readonly page: number;
  readonly previousPage: number;
  readonly pageSize: number;
  readonly previousPageSize: number;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** `onError` (`type: 'error'`): a rejected action. Not cancellable. */
export interface DataGridErrorEvent extends DataGridEvent {
  readonly error: Error;
  /**
   * `data`: the data source failed to load (the body shows
   * `renderError`). `save`: a write (save or delete) failed or was rejected
   * in part; the failed rows keep their drafts (`onSave` carries the result).
   */
  readonly action: 'sort' | 'filter' | 'search' | 'page' | 'data' | 'save' | 'persistState' | (string & {});
}

// ---------------------------------------------------------------------------
// Props, columns, API, text
// ---------------------------------------------------------------------------

export interface DataGridQueryProps {
  /** `true` or options: header sorting. */
  sorting?: boolean | DataGridSorting;
  /** `true` or options: filtering and its UI. */
  filtering?: boolean | DataGridFiltering;
  /** `true` or options: searching. */
  search?: boolean | DataGridSearch;
  /** `true` or options: paging and the pager. */
  paging?: boolean | DataGridPaging;
  /** Replaces the pager. */
  renderPager?: (ctx: DataGridPagerContext) => ReactNode;
  onBeforeSortChange?: (event: DataGridSortChangeEvent) => void;
  onSortChange?: (event: DataGridSortChangeEvent) => void;
  onBeforeFilterChange?: (event: DataGridFilterChangeEvent) => void;
  onFilterChange?: (event: DataGridFilterChangeEvent) => void;
  onBeforeFilterMenuOpen?: (event: DataGridFilterMenuOpenEvent) => void;
  onFilterMenuOpen?: (event: DataGridFilterMenuOpenEvent) => void;
  onBeforeSearchChange?: (event: DataGridSearchChangeEvent) => void;
  onSearchChange?: (event: DataGridSearchChangeEvent) => void;
  onBeforePageChange?: (event: DataGridPageChangeEvent) => void;
  onPageChange?: (event: DataGridPageChangeEvent) => void;
  /** An action was rejected (unknown column, page out of range, ...). */
  onError?: (event: DataGridErrorEvent) => void;
}

/** Column additions of the query UI. */
export interface DataGridQueryColumn<Row> {
  readonly filter?: DataGridColumnFilter;
  readonly renderFilter?: (ctx: DataGridFilterContext<Row>) => ReactNode;
  readonly renderFilterCell?: (ctx: DataGridFilterContext<Row>) => ReactNode;
}

/** Query methods of `DataGridApi`. */
export interface DataGridQueryApi {
  /** Sorts by a column; `multiple` adds it to a multi-column sort. */
  sortColumn(field: string, direction: DataGridSortDirection, options?: { multiple?: boolean }): DataGridActionResult;
  removeSort(field: string): DataGridActionResult;
  clearSorting(): DataGridActionResult;
  /** Replaces the column's top-level conditions with one condition (an array value with a scalar operator ORs one condition per value). */
  filterColumn(field: string, operator: DataGridFilterOperator, value: Json, options?: { logic?: 'and' | 'or'; matchCase?: boolean; ignoreAccents?: boolean }): DataGridActionResult;
  /** Removes the filters of one column. */
  removeFilter(field: string): DataGridActionResult;
  /** Removes the filters of the given columns, or every filter. */
  clearFiltering(fields?: string | readonly string[]): DataGridActionResult;
  search(text: string): DataGridActionResult;
  clearSearch(): DataGridActionResult;
  goToPage(page: number): DataGridActionResult;
  setPageSize(pageSize: number): DataGridActionResult;
}
