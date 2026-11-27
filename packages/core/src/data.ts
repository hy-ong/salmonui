// `@salmonui/core/data`: data and query contracts shared by every data-bound
// Salmon UI component (Data Grid, dropdowns, Kanban, Gantt, Pivot Table,
// QueryBuilder) and the neutral filter operator helpers. No React, no DOM.

export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export type JsonObject = { readonly [key: string]: Json };

export type RowId = string;
export type ColumnId = string;

/**
 * Minimal structural view of an `AbortSignal`. @salmonui/core neutral subpaths compile
 * without the DOM lib, so it cannot name the platform type; at runtime the engine passes a
 * real `AbortSignal` whenever the platform provides `AbortController`.
 */
export interface AbortSignalLike {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

/**
 * Built-in filter operators. `like` treats `%` and `*` as "any sequence";
 * `wildcard` treats `*` as "any sequence" and `?` as "one character". Both
 * match the whole value. Lowercase names (`startswith`,
 * `doesnotcontain`, `greaterthanorequal`, ...) are accepted by the filter
 * commands and normalized to these names.
 */
export type FilterOperator =
  | 'equal' | 'notEqual' | 'contains' | 'doesNotContain' | 'startsWith' | 'doesNotStartWith'
  | 'endsWith' | 'doesNotEndWith' | 'isEmpty' | 'isNotEmpty' | 'isNull' | 'isNotNull'
  | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual' | 'between'
  | 'in' | 'notIn' | 'like' | 'wildcard';

/** `wildcard`: `*` any sequence, `?` one character; `like`: `%` (or `*`) any sequence. Both match the whole value. */
export type SearchOperator = 'contains' | 'startsWith' | 'endsWith' | 'equal' | 'notEqual' | 'wildcard' | 'like';

export interface SearchDescriptor {
  readonly text: string;
  readonly columnIds: readonly ColumnId[] | 'all';
  readonly operator: SearchOperator;
  readonly ignoreCase: boolean;
  readonly ignoreAccent: boolean;
}

export type FilterSource = 'bar' | 'menu' | 'checkbox' | 'excel' | 'api';

export interface FilterDescriptor {
  readonly kind?: 'condition';
  readonly columnId: ColumnId;
  /** A built-in operator or the name of a custom operator registered with `createFilterModule({ operators })`. */
  readonly operator: FilterOperator | (string & {});
  /** `between`: `[from, to]` (inclusive). `in` / `notIn`: an array. Dates: ISO strings or epoch milliseconds. */
  readonly value: Json;
  /** Combination with the previous condition on the same column at the top level; ignored inside a group. */
  readonly predicate: 'and' | 'or';
  readonly matchCase?: boolean;
  readonly ignoreAccent?: boolean;
  readonly source: FilterSource;
}

/**
 * Nested AND/OR group: `predicate` combines its members (`{ predicate: 'or',
 * filters: [A, B] }` is A OR B); member
 * predicates are ignored. A top-level group is ANDed with the other
 * top-level entries; a nested group is one member of its parent.
 */
export interface FilterGroupDescriptor {
  readonly kind: 'group';
  readonly predicate: 'and' | 'or';
  /** Negates the combined group: NOT (A AND B). */
  readonly not?: boolean;
  readonly filters: readonly FilterEntry[];
  readonly source?: FilterSource;
}

export type FilterEntry = FilterDescriptor | FilterGroupDescriptor;

export interface SortDescriptor {
  readonly columnId: ColumnId;
  readonly direction: 'asc' | 'desc';
}

export interface GroupDescriptor {
  readonly columnId: ColumnId;
  /** Group-by-format: a number or date format (`N0`, `yMMM`) whose formatted value is the group key. */
  readonly format?: string;
  /** Group order when the sort list has no descriptor for the column. Default `asc`. */
  readonly direction?: 'asc' | 'desc';
}

/** One level of a group path: the grouped column and the group key (JSON form of the value). */
export interface GroupPathSegment {
  readonly columnId: ColumnId;
  readonly key: Json;
}

/** Aggregate values by column and aggregate type (`{ n0: { sum: 12, average: 3 } }`). */
export type AggregateValues = Readonly<Record<ColumnId, Readonly<Record<string, unknown>>>>;

/** Group envelope of a lazy group load (`DataSourceRequest.groupPath`). */
export interface GroupedRowEnvelope<Row> {
  readonly kind: 'group';
  readonly key: Json;
  readonly columnId: ColumnId;
  readonly groupPath: readonly GroupPathSegment[];
  /** Total descendants (data rows), not loaded descendants. */
  readonly count: number;
  readonly aggregates?: AggregateValues;
  /** Omitted for lazy groups. */
  readonly items?: readonly (Row | GroupedRowEnvelope<Row>)[];
}

export type AggregateType = 'sum' | 'average' | 'min' | 'max' | 'count' | 'trueCount' | 'falseCount' | 'custom';

export interface AggregateDescriptor {
  readonly columnId: ColumnId;
  readonly type: AggregateType;
  /** Local only; never serialized. The Data Grid passes its compiled column. */
  readonly custom?: { custom(rows: readonly unknown[], column: unknown): unknown }['custom'];
  readonly placement: readonly ('footer' | 'groupFooter' | 'groupCaption')[];
  readonly format?: string;
}

export interface PagingDescriptor {
  readonly page: number;
  readonly pageSize: number;
}

export interface ExpansionDescriptor {
  readonly groups: Readonly<Record<string, boolean>>;
  readonly tree: Readonly<Record<RowId, boolean>>;
  readonly detail: Readonly<Record<RowId, boolean>>;
  readonly defaultGroupExpanded: boolean;
}

export interface DataQuery {
  readonly search: SearchDescriptor | null;
  /** Top level: conditions on the same column fold by `predicate`; columns and groups are ANDed. */
  readonly filters: readonly FilterEntry[];
  readonly sorting: readonly SortDescriptor[];
  readonly grouping: readonly GroupDescriptor[];
  readonly aggregates: readonly AggregateDescriptor[];
  /** null when the paging module is off. */
  readonly paging: PagingDescriptor | null;
  readonly expansion: ExpansionDescriptor;
}

// ---------------------------------------------------------------------------
// Data source
// ---------------------------------------------------------------------------

export type DataSourceMode = 'local' | 'remote' | 'live';

/** Stages a remote source may declare as already performed. */
export type PerformedStage = 'search' | 'filter' | 'sort' | 'group' | 'aggregate' | 'page';

export interface DataSourceRequest {
  readonly version: number;
  readonly query: DataQuery;
  readonly range?: { readonly start: number; readonly end: number };
  readonly cursor?: string | null;
  /** Lazy group load: `[]` loads the root group level; a non-empty path loads that group's children. Absent for plain reads. */
  readonly groupPath?: readonly GroupPathSegment[];
  /**
   * Tree read (tree mode over a remote source, `createRemoteTree`): `null`
   * reads the root level, a row id reads that row's children. Sources answer
   * with `TreeRowEnvelope`-shaped items (`{ kind: 'tree', row, parentId,
   * hasChildren, childCount?, depth?, children? }`). Absent for plain reads.
   */
  readonly parentRowId?: RowId | null;
  /**
   * Facet read: distinct values of a column with counts over the
   * rows passing search and every other column's filter, for remote
   * checklist and Excel filters. Sources answer with `facet`.
   */
  readonly facet?: DataSourceFacetRequest;
  readonly signal: AbortSignalLike;
}

export interface DataSourceFacetRequest {
  readonly columnId: ColumnId;
  /** Case-insensitive substring of the label. */
  readonly search?: string;
  /** Entries at most (checklist page); `complete: false` when more exist. */
  readonly limit?: number;
}

export interface DataSourceFacetResult {
  readonly columnId: ColumnId;
  /** `key`: the server's value key (`BLANK_FACET_KEY` for blanks); `label`: display text. Sorted by label. */
  readonly entries: readonly { readonly key: string; readonly label: string; readonly count: number }[];
  /** False when `limit` truncated the list. */
  readonly complete: boolean;
}

export interface DataSourceResult<Row> {
  readonly version: number;
  /** Plain rows; group envelopes for lazy group loads. */
  readonly rows: readonly Row[];
  readonly totalRowCount?: number;
  readonly performed?: readonly PerformedStage[];
  /** Totals over every matching row (remote aggregates). */
  readonly aggregates?: AggregateValues;
  readonly pageInfo?: { readonly hasNextPage?: boolean; readonly hasPreviousPage?: boolean; readonly endCursor?: string | null };
  /** Row index of `rows[0]` for a `range` read (block sources after evicting leading blocks); default `range.start`, or 0 for `capabilities.infinite` sources. */
  readonly rowOffset?: number;
  /** Answer to a `facet` request. */
  readonly facet?: DataSourceFacetResult;
}

export interface WriteRequest<Row> {
  readonly version: number;
  /** `parentId` (tree mode): the parent the added row joins (null: a root); its `parentIdField` value is already set for flat data. */
  readonly added: readonly { readonly tempId: RowId; readonly row: Row; readonly parentId?: RowId | null }[];
  readonly changed: readonly { readonly rowId: RowId; readonly row: Row; readonly previous: Row; readonly changedColumnIds: readonly ColumnId[] }[];
  readonly deleted: readonly { readonly rowId: RowId; readonly row: Row }[];
  readonly mode: 'row' | 'dialog' | 'batch' | 'cell';
  readonly signal: AbortSignalLike;
  /** Row reorder placement hint (row drag and drop): local sources move the rows in their array. */
  readonly moved?: RowPlacement;
}

/** Moves `rowIds` (in this order) next to `targetRowId`; a null target means the start (`before`) or the end (`after`). */
export interface RowPlacement {
  readonly rowIds: readonly RowId[];
  readonly targetRowId: RowId | null;
  readonly position: 'before' | 'after';
  /**
   * Tree mode: the new parent of the moved rows (null: roots; absent outside
   * tree mode). `targetRowId` / `position` stay a placement in the source
   * array; the moved rows' subtrees travel with them, and flat
   * (`parentIdField`) data also lists the rows whose parent changes in
   * `changed`.
   */
  readonly parentId?: RowId | null;
}

export interface WriteResult<Row> {
  readonly version: number;
  readonly status: 'applied' | 'partial' | 'rejected';
  readonly added?: readonly { readonly tempId: RowId; readonly row: Row }[];
  readonly changed?: readonly { readonly rowId: RowId; readonly row: Row }[];
  readonly deleted?: readonly RowId[];
  readonly rowErrors?: Readonly<Record<RowId, readonly string[]>>;
  /** Cell errors keyed `${rowId}:${columnId}` (server field errors). */
  readonly cellErrors?: Readonly<Record<string, readonly string[]>>;
  /** Version conflicts; the rows stay dirty. */
  readonly conflicts?: readonly ConflictSnapshot<Row>[];
  readonly totalRowCount?: number;
}

/** A version conflict reported by a write (structural copy of `@salmonui/data` `ConflictSnapshot`). */
export interface ConflictSnapshot<Row> {
  readonly rowId: RowId;
  readonly local: Row;
  readonly server: Row;
  readonly base: Row | null;
  readonly cells: readonly { readonly columnId: ColumnId; readonly local: unknown; readonly server: unknown }[];
  readonly version?: string;
}

/**
 * Change notification from a data source. `rows` is always the complete new
 * row array; the id lists let the engine update incrementally.
 */
export type DataSourceEvent<Row> =
  | { readonly type: 'reset'; readonly rows: readonly Row[]; readonly totalRowCount?: number }
  | {
      readonly type: 'patch';
      readonly rows: readonly Row[];
      /** Ids whose row object was replaced in place. */
      readonly updated: readonly RowId[];
      /** Ids appended at the end of `rows`, in order. */
      readonly added: readonly RowId[];
      readonly removed: readonly RowId[];
      readonly totalRowCount?: number;
    };

export interface DataSourceCapabilities {
  readonly facets: boolean;
  readonly lazyGroups: boolean;
  readonly treeChildren: boolean;
  readonly cursor: boolean;
  readonly infinite: boolean;
  readonly lookups: boolean;
  readonly write: boolean;
  readonly exportJobs: boolean;
  readonly reload: boolean;
}

export interface DataSource<Row> {
  readonly mode: DataSourceMode;
  read(request: DataSourceRequest): DataSourceResult<Row> | Promise<DataSourceResult<Row>>;
  write?(request: WriteRequest<Row>): Promise<WriteResult<Row>>;
  subscribe?(listener: (event: DataSourceEvent<Row>) => void): () => void;
  /** Drops cached results; `engine.refresh()` calls it with `'all'` before re-reading. Must not notify. */
  invalidate?(scope?: 'rows' | 'counts' | 'facets' | 'all'): void;
  readonly capabilities?: Partial<DataSourceCapabilities>;
}

// ---------------------------------------------------------------------------
// Filter operator helpers
// ---------------------------------------------------------------------------

const BUILT_IN: readonly FilterOperator[] = [
  'equal', 'notEqual', 'contains', 'doesNotContain', 'startsWith', 'doesNotStartWith', 'endsWith', 'doesNotEndWith',
  'isEmpty', 'isNotEmpty', 'isNull', 'isNotNull', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual',
  'between', 'in', 'notIn', 'like', 'wildcard',
];

const ALIASES: ReadonlyMap<string, FilterOperator> = new Map<string, FilterOperator>([
  ...BUILT_IN.map((op) => [op.toLowerCase(), op] as const),
  ['eq', 'equal'], ['neq', 'notEqual'], ['ne', 'notEqual'], ['notcontains', 'doesNotContain'],
  ['gt', 'greaterThan'], ['gte', 'greaterThanOrEqual'], ['ge', 'greaterThanOrEqual'],
  ['lt', 'lessThan'], ['lte', 'lessThanOrEqual'], ['le', 'lessThanOrEqual'],
]);

/** Canonical built-in operator for a name (case-insensitive). */
export function normalizeFilterOperator(name: string): FilterOperator | null {
  return ALIASES.get(name.toLowerCase()) ?? null;
}

const REGEX_SPECIALS = /[.+^${}()|[\]\\]/g;

/** Compiles `like` (`%` / `*` = any sequence) or `wildcard` (`*` = any sequence, `?` = one character) into an anchored RegExp. */
export function compilePattern(pattern: string, operator: 'like' | 'wildcard'): RegExp {
  let source = '';
  for (const ch of pattern) {
    if (ch === '*' || (operator === 'like' && ch === '%')) source += '[\\s\\S]*';
    else if (operator === 'wildcard' && ch === '?') source += '[\\s\\S]';
    else source += ch.replace(REGEX_SPECIALS, '\\$&').replace(/[?*]/g, '\\$&');
  }
  return new RegExp(`^${source}$`);
}

export { freezeJsonCopy, isJsonValue, shallowEqual, shallowEqualArrays, stableStringify } from './json.js';
