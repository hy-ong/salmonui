// Public type contracts of @salmonui/data.
//
// Types shared with @salmonui/data-grid/engine are duplicated structurally (this
// package never imports `@salmonui/data-grid/engine` at runtime or at type level); the
// type-contract test in tests/types.test.ts verifies they stay assignable.

// ---------------------------------------------------------------------------
// Shared with @salmonui/data-grid/engine (structural copies)
// ---------------------------------------------------------------------------

export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };
export type RowId = string;
export type ColumnId = string;

export interface AbortSignalLike {
  readonly aborted: boolean;
  readonly reason?: unknown;
  addEventListener(type: 'abort', listener: () => void): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

export type FilterSource = 'bar' | 'menu' | 'checkbox' | 'excel' | 'api';

/** Built-in filter operators (Data Grid engine names). Custom operator names pass through as strings. */
export type FilterOperator =
  | 'equal' | 'notEqual' | 'contains' | 'doesNotContain' | 'startsWith' | 'doesNotStartWith'
  | 'endsWith' | 'doesNotEndWith' | 'isEmpty' | 'isNotEmpty' | 'isNull' | 'isNotNull'
  | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual' | 'between'
  | 'in' | 'notIn' | 'like' | 'wildcard';

export type SearchOperator = 'contains' | 'startsWith' | 'endsWith' | 'equal' | 'notEqual' | 'wildcard' | 'like';

export interface SearchDescriptor {
  readonly text: string;
  readonly columnIds: readonly ColumnId[] | 'all';
  readonly operator: SearchOperator;
  readonly ignoreCase: boolean;
  readonly ignoreAccent: boolean;
}

export interface FilterDescriptor {
  readonly kind?: 'condition';
  readonly columnId: ColumnId;
  readonly operator: FilterOperator | (string & {});
  readonly value: Json;
  readonly predicate: 'and' | 'or';
  readonly matchCase?: boolean;
  readonly ignoreAccent?: boolean;
  readonly source: FilterSource;
}

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
  readonly format?: string;
}

export type AggregateType = 'sum' | 'average' | 'min' | 'max' | 'count' | 'trueCount' | 'falseCount' | 'custom';

export interface AggregateDescriptor {
  readonly columnId: ColumnId;
  readonly type: AggregateType;
  /**
   * Local only; never serialized. The grid calls it with its compiled column
   * (Data Grid engine `CompiledColumn`); declared as a method so that signature
   * stays assignable both ways.
   */
  readonly custom?: { custom(rows: readonly unknown[], column: unknown): unknown }['custom'];
  readonly placement: readonly ('footer' | 'groupFooter' | 'groupCaption')[];
  readonly format?: string;
}

export interface PagingDescriptor {
  /** 1-based. */
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
  readonly filters: readonly FilterEntry[];
  readonly sorting: readonly SortDescriptor[];
  readonly grouping: readonly GroupDescriptor[];
  readonly aggregates: readonly AggregateDescriptor[];
  readonly paging: PagingDescriptor | null;
  readonly expansion: ExpansionDescriptor;
}

export type DataSourceMode = 'local' | 'remote' | 'live';
export type PerformedStage = 'search' | 'filter' | 'sort' | 'group' | 'aggregate' | 'page';

export interface GroupPathSegment {
  readonly columnId: ColumnId;
  readonly key: Json;
}

export interface DataSourceRequest {
  readonly version: number;
  readonly query: DataQuery;
  readonly range?: { readonly start: number; readonly end: number };
  readonly cursor?: string | null;
  /** Lazy group load. `[]` loads the root group level; a non-empty path loads that group's children. */
  readonly groupPath?: readonly GroupPathSegment[];
  /** Tree read: `null` reads the root level, a row id reads that row's children (wire `parent`). */
  readonly parentRowId?: RowId | null;
  /** Distinct values of a column: `search` narrows by label, `limit` caps the entries (`complete: false` when more exist). */
  readonly facet?: { readonly columnId: ColumnId; readonly search?: string; readonly limit?: number };
  readonly signal: AbortSignalLike;
}

export interface PageInfo {
  readonly hasNextPage?: boolean;
  readonly hasPreviousPage?: boolean;
  readonly startCursor?: string | null;
  readonly endCursor?: string | null;
}

export interface FacetPayload {
  readonly columnId: ColumnId;
  readonly entries: readonly { readonly key: string; readonly label: string; readonly count: number }[];
  /** False when the server truncated the list. */
  readonly complete: boolean;
}

export type AggregateValues = Readonly<Record<ColumnId, Readonly<Record<string, unknown>>>>;

export interface DataSourceResult<Row, Item = Row> {
  readonly version: number;
  readonly rows: readonly Item[];
  readonly totalRowCount?: number;
  readonly performed?: readonly PerformedStage[];
  readonly aggregates?: AggregateValues;
  readonly pageInfo?: PageInfo;
  readonly facet?: FacetPayload;
  /** Infinite mode: index of `rows[0]` within the full result when leading blocks were evicted (`maxBlocks`). */
  readonly rowOffset?: number;
}

export interface GroupedRowEnvelope<Row> {
  readonly kind: 'group';
  readonly key: Json;
  readonly columnId: ColumnId;
  readonly groupPath: readonly GroupPathSegment[];
  /** Total descendants, not loaded descendants. */
  readonly count: number;
  readonly aggregates?: AggregateValues;
  /** Omitted for lazy groups. */
  readonly items?: readonly (Row | GroupedRowEnvelope<Row>)[];
  readonly pageInfo?: PageInfo;
}

export interface TreeRowEnvelope<Row> {
  readonly kind: 'tree';
  readonly row: Row;
  readonly depth: number;
  readonly parentId: RowId | null;
  readonly hasChildren: boolean;
  readonly childCount?: number;
  readonly children?: readonly TreeRowEnvelope<Row>[];
}

export type GroupLoadResult<Row> = DataSourceResult<Row, Row | GroupedRowEnvelope<Row>>;
export type TreeLoadResult<Row> = DataSourceResult<Row, TreeRowEnvelope<Row>>;

export interface WriteRequest<Row> {
  readonly version: number;
  /** `parentId` (tree mode): the parent the added row joins (null: a root). */
  readonly added: readonly { readonly tempId: RowId; readonly row: Row; readonly parentId?: RowId | null }[];
  readonly changed: readonly { readonly rowId: RowId; readonly row: Row; readonly previous: Row; readonly changedColumnIds: readonly ColumnId[] }[];
  readonly deleted: readonly { readonly rowId: RowId; readonly row: Row }[];
  readonly mode: 'row' | 'dialog' | 'batch' | 'cell';
  readonly signal: AbortSignalLike;
  /** Row reorder placement hint (row drag and drop). Remote sources persist order through `changed` rows (`orderField`). */
  readonly moved?: RowPlacement;
}

export interface RowPlacement {
  readonly rowIds: readonly RowId[];
  readonly targetRowId: RowId | null;
  readonly position: 'before' | 'after';
  /** Tree mode: the new parent of the moved rows (null: roots). */
  readonly parentId?: RowId | null;
}

export type CellKey = `${RowId}:${ColumnId}`;

export interface ConflictSnapshot<Row> {
  readonly rowId: RowId;
  readonly local: Row;
  readonly server: Row;
  readonly base: Row | null;
  readonly cells: readonly { readonly columnId: ColumnId; readonly local: unknown; readonly server: unknown }[];
  readonly version?: string;
}

export interface WriteResult<Row> {
  readonly version: number;
  readonly status: 'applied' | 'partial' | 'rejected';
  readonly added?: readonly { readonly tempId: RowId; readonly row: Row }[];
  readonly changed?: readonly { readonly rowId: RowId; readonly row: Row }[];
  readonly deleted?: readonly RowId[];
  readonly rowErrors?: Readonly<Record<RowId, readonly string[]>>;
  readonly cellErrors?: Readonly<Record<CellKey, readonly string[]>>;
  readonly conflicts?: readonly ConflictSnapshot<Row>[];
  readonly totalRowCount?: number;
}

export type DataSourceEvent<Row> =
  | { readonly type: 'reset'; readonly rows: readonly Row[]; readonly totalRowCount?: number }
  | {
      readonly type: 'patch';
      readonly rows: readonly Row[];
      readonly updated: readonly RowId[];
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
  readonly capabilities?: Partial<DataSourceCapabilities>;
}

/** Structural subset of the Data Grid engine's `DataGridState` used by the storage adapters. */
export interface DataGridState {
  /** Schema version of the state (Data Grid engine `DATA_GRID_STATE_VERSION`). */
  readonly version: number;
  readonly [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Platform seams
// ---------------------------------------------------------------------------

/** Injected timer and clock. `systemScheduler()` reads the globals lazily; tests use `createManualScheduler()`. */
export interface Scheduler {
  now(): number;
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export interface FetchResponseLike {
  readonly ok: boolean;
  readonly status: number;
  readonly statusText?: string;
  readonly headers?: { get(name: string): string | null };
  json(): Promise<unknown>;
  text(): Promise<string>;
}

/** Structural `fetch`; the platform `fetch` is assignable. */
export type FetchLike = (input: string, init?: FetchRequestInit) => Promise<FetchResponseLike>;

export interface FetchRequestInit {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  /**
   * The request's abort signal: the platform `AbortSignal` wherever the
   * consumer's lib declares one (the Data Grid engine uses the platform
   * `AbortController` whenever the runtime has it), else `AbortSignalLike`.
   */
  readonly signal?: typeof globalThis extends { readonly AbortSignal: { readonly prototype: infer S } } ? S : AbortSignalLike;
  readonly credentials?: 'omit' | 'same-origin' | 'include';
  readonly [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Request policy
// ---------------------------------------------------------------------------

export interface RequestPolicy {
  /** Keyed by canonical serialized query + range + cursor + groupPath + facet. */
  readonly cache?: { readonly ttlMs: number; readonly maxEntries?: number };
  /** Default true: identical in-flight requests share one transport call. */
  readonly dedupe?: boolean;
  readonly retry?: {
    readonly attempts: number;
    readonly delayMs: number | ((attempt: number) => number);
    /** Default: network errors and HTTP 5xx/408/429; never aborts or 4xx. */
    readonly retryOn?: (error: unknown) => boolean;
  };
  /** After a successful foreground page load, fetch this many pages on each side (off the status path). */
  readonly prefetch?: { readonly adjacentPages: number };
  /** Default `onWrite`: a successful write clears the read cache. */
  readonly invalidate?: 'onWrite' | 'manual';
}

export type PagingStrategy =
  | { readonly kind: 'offset' }
  | { readonly kind: 'cursor' }
  | { readonly kind: 'infinite'; readonly blockSize: number; readonly strategy?: 'offset' | 'cursor'; readonly maxBlocks?: number };

export type InvalidateScope = 'rows' | 'counts' | 'facets' | 'all';
