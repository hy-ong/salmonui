// Public type contracts of the Data Grid engine (@salmonui/data-grid/engine).

import type { ColumnValidation, ValidatorContext } from '@salmonui/core/validation';
import type { ColumnLookup, CompiledLookup } from './lookup.js';
import type { CellSpanResolver } from './cell-spans.js';
// Data and query contracts live in `@salmonui/core/data`; re-exported here
// so the engine entry keeps one import site for its consumers.
import type {
  Json,
  JsonObject,
  RowId,
  ColumnId,
  AbortSignalLike,
  FilterOperator,
  SearchOperator,
  SearchDescriptor,
  FilterSource,
  FilterDescriptor,
  FilterGroupDescriptor,
  FilterEntry,
  SortDescriptor,
  GroupDescriptor,
  GroupPathSegment,
  AggregateValues,
  GroupedRowEnvelope,
  AggregateType,
  AggregateDescriptor,
  PagingDescriptor,
  ExpansionDescriptor,
  DataQuery,
  DataSourceMode,
  PerformedStage,
  DataSourceRequest,
  DataSourceFacetRequest,
  DataSourceFacetResult,
  DataSourceResult,
  WriteRequest,
  RowPlacement,
  WriteResult,
  ConflictSnapshot,
  DataSourceEvent,
  DataSourceCapabilities,
  DataSource,
} from '@salmonui/core/data';
export type {
  Json,
  JsonObject,
  RowId,
  ColumnId,
  AbortSignalLike,
  FilterOperator,
  SearchOperator,
  SearchDescriptor,
  FilterSource,
  FilterDescriptor,
  FilterGroupDescriptor,
  FilterEntry,
  SortDescriptor,
  GroupDescriptor,
  GroupPathSegment,
  AggregateValues,
  GroupedRowEnvelope,
  AggregateType,
  AggregateDescriptor,
  PagingDescriptor,
  ExpansionDescriptor,
  DataQuery,
  DataSourceMode,
  PerformedStage,
  DataSourceRequest,
  DataSourceFacetRequest,
  DataSourceFacetResult,
  DataSourceResult,
  WriteRequest,
  RowPlacement,
  WriteResult,
  ConflictSnapshot,
  DataSourceEvent,
  DataSourceCapabilities,
  DataSource,
} from '@salmonui/core/data';
import type { ColumnType, FormatDescriptor, FormatOptions } from '@salmonui/core/format';
export type { ColumnType, FormatDescriptor, FormatOptions } from '@salmonui/core/format';


// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

export interface CellRef {
  readonly rowId: RowId;
  readonly columnId: ColumnId;
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

export type ColumnWidth = number | `${number}%` | 'auto';

export interface ValueContext<Row> {
  readonly row: Row;
  readonly column: CompiledColumn<Row>;
  readonly locale: string;
}

export interface ColumnDef<Row> {
  /** columnId precedence: `id` > `field` > generated (development warning). */
  readonly id?: string;
  /** Dot paths are allowed: `customer.name`. */
  readonly field?: string;
  readonly valueGetter?: (row: Row) => unknown;
  readonly valueSetter?: (row: Row, value: unknown) => Row;
  /** Inferred from the first non-null value when absent. `selection` is the row selection checkbox column; `rowNumber` the row number column. */
  readonly type?: ColumnType;
  readonly format?: string | FormatOptions;
  readonly header?: string;
  /**
   * Computes the header text from the compiled column. Called once per column compile; its result
   * replaces `header` everywhere header text is shown or exported.
   */
  readonly headerValueGetter?: (column: CompiledColumn<Row>) => string;
  readonly align?: 'start' | 'center' | 'end' | 'justify';
  readonly headerAlign?: 'start' | 'center' | 'end';
  readonly width?: ColumnWidth;
  readonly minWidth?: number;
  readonly maxWidth?: number;
  /** Default false. Runtime visibility is state in the `columns` module. */
  readonly hidden?: boolean;
  /**
   * Logical pin side: `start` is the left zone in LTR, `end` the right zone,
   * `center` the fixed zone (the column stays at its scroll-start
   * position while the center columns scroll on both sides of it).
   */
  readonly pinned?: 'start' | 'end' | 'center';
  /** Fixed at the start of its zone, not reorderable. */
  readonly lockPosition?: boolean;
  readonly sortable?: boolean;
  readonly filterable?: boolean;
  readonly searchable?: boolean;
  readonly groupable?: boolean;
  /** Group by the formatted value (`format`) instead of the raw value. */
  readonly groupByFormat?: boolean;
  /**
   * Custom group key: rows group by this per-row value instead of the
   * column value (`groupByFormat` is then ignored for bucketing). Local data
   * only; groups order by key. See docs/site/content/grouping.md.
   */
  readonly groupKey?: (row: Row) => unknown;
  readonly editable?: boolean;
  readonly resizable?: boolean;
  readonly reorderable?: boolean;
  readonly primaryKey?: boolean;
  /** Server-generated key. */
  readonly identity?: boolean;
  /** Value of the column in a row added through editing. */
  readonly defaultValue?: unknown;
  /** Editor preset name: `text`, `number`, `select`, `checkbox`, `date`, `datetime`, or a registered custom editor. Inferred from `type` when absent. */
  readonly editor?: string;
  /** Props of the built-in editor, passed to the editor as is. */
  readonly editorProps?: { readonly [key: string]: unknown };
  /** Validation rules. */
  readonly validation?: ColumnValidation<Row, ValidatorContext<Row, CompiledColumn<Row>>>;
  readonly displayAsCheckbox?: boolean;
  /** Listed in the column chooser. Default true. */
  readonly hideable?: boolean;
  readonly valueParser?: (input: unknown, ctx: ValueContext<Row>) => unknown;
  readonly valueFormatter?: (value: unknown, ctx: ValueContext<Row>) => string;
  readonly clipboardFormatter?: (value: unknown, ctx: ValueContext<Row>) => string;
  readonly sortComparator?: (a: unknown, b: unknown, rowA: Row, rowB: Row) => number;
  /**
   * Custom filter comparer: replaces the built-in test of every
   * built-in operator on this column. Called once per distinct cell value with
   * the raw value, the condition's value, and the camelCase operator; returns
   * whether the value matches. Local data only.
   */
  readonly filterComparator?: (value: unknown, filterValue: Json, operator: FilterOperator) => boolean;
  /** Lookup (foreign-key) column; needs the `lookup` module. */
  readonly lookup?: ColumnLookup;
  /** Stacked header group: child definitions. */
  readonly columns?: readonly ColumnDef<Row>[];
  readonly meta?: Json;
}

export interface ColumnFlags {
  readonly allowSorting: boolean;
  readonly allowFiltering: boolean;
  readonly allowSearching: boolean;
  readonly allowGrouping: boolean;
  readonly allowEditing: boolean;
  readonly allowResizing: boolean;
  readonly allowReordering: boolean;
  readonly isPrimaryKey: boolean;
  readonly isIdentity: boolean;
  readonly lockColumn: boolean;
  readonly displayAsCheckBox: boolean;
  readonly showInColumnChooser: boolean;
}

export interface ColumnWidthSpec {
  readonly initial: ColumnWidth;
  readonly min: number;
  /** `Infinity` when unbounded. */
  readonly max: number;
}

export type ColumnTypeSource = 'definition' | 'inferred' | 'fallback' | 'pending';

export interface CompiledColumn<Row> {
  readonly columnId: ColumnId;
  /** Stacked header ancestry, root first, including this column. */
  readonly path: readonly ColumnId[];
  readonly leaf: boolean;
  /** Header depth (0 for top level). */
  readonly depth: number;
  /** Position among leaf columns in definition order; -1 for group headers. */
  readonly leafIndex: number;
  /** Child column ids for group headers; empty for leaves. */
  readonly children: readonly ColumnId[];
  readonly def: ColumnDef<Row>;
  readonly field: string | null;
  readonly headerText: string;
  readonly accessor: (row: Row) => unknown;
  readonly setter: ((row: Row, value: unknown) => Row) | null;
  readonly type: ColumnType;
  readonly typeSource: ColumnTypeSource;
  readonly format: FormatDescriptor | null;
  readonly formatter: (value: unknown, row: Row) => string;
  readonly clipboardFormatter: (value: unknown, row: Row) => string;
  readonly parser: (input: unknown, row: Row) => unknown;
  readonly comparer: (a: unknown, b: unknown, rowA: Row, rowB: Row) => number;
  readonly width: ColumnWidthSpec;
  readonly flags: ColumnFlags;
  /** Definition freeze: `fixed` (`pinned: 'center'`) stays in the center zone and is listed in `ColumnSnapshot.fixed`. */
  readonly freeze: 'left' | 'right' | 'fixed' | null;
  /** Filled by module `extendColumns`. */
  readonly moduleMeta: Readonly<Record<string, unknown>>;
  /** Set by the `lookup` module on lookup columns (raw value accessor, display lookup). */
  readonly lookup?: CompiledLookup;
}

export interface ColumnSnapshot<Row> {
  /** Every node of the header tree, depth-first, groups before their children. */
  readonly tree: readonly CompiledColumn<Row>[];
  /** Leaf (data) columns in definition order, including hidden ones (identity is stable across reorder). */
  readonly leaves: readonly CompiledColumn<Row>[];
  /** Runtime freeze zone of every visible leaf (definition `pinned`, runtime pin/unpin, and `frozenColumns` counts). */
  readonly zones: ReadonlyMap<ColumnId, 'left' | 'center' | 'right'>;
  /** Visible leaves in runtime order: left zone, center, right zone. */
  readonly visible: readonly CompiledColumn<Row>[];
  readonly left: readonly CompiledColumn<Row>[];
  readonly center: readonly CompiledColumn<Row>[];
  readonly right: readonly CompiledColumn<Row>[];
  /**
   * Center leaves in the fixed zone (`pinned: 'center'`), in runtime
   * order: a subset of `center`, so `visible` order, keyboard order and
   * `aria-colindex` stay the visual order. Empty (a shared frozen array)
   * when no column is fixed.
   */
  readonly fixed: readonly CompiledColumn<Row>[];
  readonly byId: ReadonlyMap<ColumnId, CompiledColumn<Row>>;
  /** Number of header rows (tree depth). */
  readonly headerRowCount: number;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/** Partial query accepted by `createDataGridQuery` and the `defaultQuery` option. */
export interface DataGridQueryInit {
  readonly search?: SearchDescriptor | null;
  readonly filters?: readonly FilterEntry[];
  readonly sorting?: readonly SortDescriptor[];
  readonly grouping?: readonly GroupDescriptor[];
  readonly aggregates?: readonly AggregateDescriptor[];
  readonly paging?: PagingDescriptor | null;
  readonly expansion?: Partial<ExpansionDescriptor>;
}

export interface LocalDataPatch<Row> {
  readonly append?: readonly Row[];
  /** Replaces rows with a matching id; unknown ids are appended. */
  readonly upsert?: readonly Row[];
  readonly remove?: readonly RowId[];
}

export interface LocalDataSource<Row> extends DataSource<Row> {
  readonly mode: 'local';
  getRows(): readonly Row[];
  setRows(rows: readonly Row[]): void;
  patch(patch: LocalDataPatch<Row>): void;
  write(request: WriteRequest<Row>): Promise<WriteResult<Row>>;
  subscribe(listener: (event: DataSourceEvent<Row>) => void): () => void;
}

export interface DataStatusSnapshot {
  readonly status: 'idle' | 'loading' | 'ready' | 'error';
  readonly error: unknown;
  readonly totalRowCount: number;
  /** Version of the request that produced the current rows; 0 before the first result. */
  readonly version: number;
  readonly mode: DataSourceMode;
  /** Stages the source performed for the current rows (always empty for local and live). */
  readonly performed: readonly PerformedStage[];
  /** Server totals of the current result (`DataSourceResult.aggregates`), or null. */
  readonly aggregates: AggregateValues | null;
}

// ---------------------------------------------------------------------------
// Row model
// ---------------------------------------------------------------------------

export type RowKind =
  | 'data' | 'group' | 'groupFooter' | 'tree' | 'detail' | 'aggregate' | 'frozenTop' | 'frozenBottom' | 'addNew'
  /** Infinite scroll placeholder for a row that is not loaded yet. */
  | 'loading';

/**
 * Visible row model. Rows are stored by reference in `source` with parallel
 * `sourceIds`; `order` maps a visible index to a source index (null means the
 * identity order). No per-row wrapper objects exist.
 */
export interface RowModelSnapshot<Row> {
  readonly source: readonly Row[];
  readonly sourceIds: readonly RowId[];
  /** Data rows in view order (source indexes). With a `view`, the data order the view windows into. */
  readonly order: Int32Array | null;
  /** Visible rows: `order.length`, or `view.count` when a view mixes in synthetic rows. */
  readonly count: number;
  /** Group structure from the `group` stage (grouping module). */
  readonly groups?: GroupTreeSnapshot | null;
  /** Aggregate results from the `aggregate` stage (aggregates module). */
  readonly aggregates?: AggregateModelSnapshot | null;
  /**
   * Visible row model mixing synthetic rows (group captions and footers) with
   * data rows, addressed by visible index without a materialized list. When
   * present, `count === view.count` and index lookups go through the view.
   */
  readonly view?: RowModelView | null;
  /**
   * Pinned rows: source indexes of the rows at visible indexes
   * `[0, pinned.length)`, in sort order. They are outside the page window,
   * the groups, and the detail rows. Absent when no row is pinned.
   */
  readonly pinned?: Int32Array | null;
}

/** Opaque group structure carried by the row model (see `./index.js` grouping). */
export interface GroupTreeSnapshot {
  /** Grouping levels. */
  readonly depth: number;
  /** Groups over all levels. */
  readonly count: number;
}

/** Opaque aggregate results carried by the row model (see `./index.js` aggregates). */
export interface AggregateModelSnapshot {
  readonly scope: 'page' | 'all';
  /**
   * @internal Values of group `g` (or the totals for `g = -1`) as `model`
   * shows them. Set by the aggregates module, so a reader (the grouping
   * module) does not import the aggregates code.
   */
  readonly read?: (model: RowModelSnapshot<unknown>, g: number) => AggregateValues | null;
  /** @internal Values over data positions `[a, b)` of `result.order`, cached per `owner` (tree child summaries), without importing the aggregates code. */
  range?(result: AggregateModelSnapshot, owner: object, slot: number, a: number, b: number): AggregateValues;
}

/** A row the view owns or synthesizes, resolved by id. */
export interface ViewRowInfo {
  readonly index: number;
  readonly kind: RowKind;
  readonly depth: number;
  readonly parentId: RowId | null;
  /** The data row for `kind: 'data'` rows the view owns (lazy group children); null for synthetic rows. */
  readonly row: unknown;
}

/** Visible row model of a grouped (or otherwise structured) grid. */
export interface RowModelView {
  readonly kind: 'grouped' | 'lazyGrouped' | 'detail' | 'plain' | 'pinned' | 'infinite' | 'tree';
  /** The view a wrapping view (`detail`) adds rows to; absent for base views. */
  readonly inner?: RowModelView | null;
  /** Visible rows (captions, data rows, footers). */
  readonly count: number;
  /**
   * Data rows the view windows into (paging totals). A tree view paging by
   * root rows (`pageBy: 'root'` with paging on) counts root rows here until
   * the page stage windows it.
   */
  readonly dataCount: number;
  kindAt(index: number): RowKind;
  /** Source index of the data row at `index`, or -1 for synthetic and view-owned rows. */
  sourceIndexAt(index: number): number;
  idAt(index: number): RowId | undefined;
  depthAt(index: number): number;
  /** Visible index of a source row, or -1 (filtered out or inside a collapsed group). */
  indexOfSource(sourceIndex: number): number;
  /** Id of the group directly containing a source row, or null. */
  parentOfSource(sourceIndex: number): RowId | null;
  /** Synthetic and view-owned rows by id. */
  resolve(id: RowId): ViewRowInfo | undefined;
  /** Group-aware page window over data positions `[start, end)`. */
  page?(start: number, end: number): RowModelView;
}

/**
 * Change from one source rows array to the next within one data version
 * chain (local patches, or a `setRows` that differs from the previous array
 * in a few rows). Rows that are not listed keep their object identity and
 * their relative order; removed rows disappear; updated rows were replaced in
 * place; new rows are appended at the end (from index
 * `previousCount - removed.length`).
 */
export interface RowDelta {
  /** Row count of the previous source array. */
  readonly previousCount: number;
  /** Row count of the new source array. */
  readonly count: number;
  /** Previous source indexes of removed rows, ascending. */
  readonly removed: Int32Array;
  /** Previous source indexes of rows replaced in place (still present), ascending. */
  readonly updated: Int32Array;
}

export interface RowSnapshot<Row> {
  readonly id: RowId;
  readonly kind: RowKind;
  readonly row: Row | null;
  /** Position in the visible row model; -1 when the row is filtered out. */
  readonly index: number;
  readonly depth: number;
  readonly parentId: RowId | null;
}

export interface CellSnapshot {
  readonly rowId: RowId;
  readonly columnId: ColumnId;
  readonly value: unknown;
  readonly formattedValue: string;
}

export interface HeaderSnapshot {
  readonly columnId: ColumnId;
  readonly headerText: string;
  readonly leaf: boolean;
  readonly depth: number;
  readonly visible: boolean;
  readonly freeze: 'left' | 'right' | null;
  readonly flags: ColumnFlags;
}

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

export type PipelineStageName =
  | 'search' | 'filter' | 'sort' | 'group' | 'aggregate'
  | 'groupExpansion' | 'treeExpansion' | 'detailExpansion'
  | 'infinite' | 'page' | 'frozenSplit'
  // Row pinning (`./row-pinning.js`): `pin` takes the
  // pinned rows out of the sorted order, `pinnedRows` puts them at the head
  // of the final model.
  | 'pin' | 'pinnedRows';

export interface StageContext<Row, State> {
  readonly query: DataQuery;
  readonly columns: ColumnSnapshot<Row>;
  readonly state: State;
  readonly locale: string;
  /** The grid `timeZone` option (undefined: the runtime's local zone). */
  readonly timeZone: string | undefined;
  /** Source index of a row id through the engine id index, or -1. */
  readonly sourceIndexOf?: (rowId: RowId) => number;
  /**
   * @internal How the source rows changed since the previous pipeline run:
   * `from` is that run's source array and `delta` leads from it to the
   * current one (null when unknown, e.g. after a reset). Lets a stage carry a
   * per-source memo across a key change (the tree index after a move).
   */
  readonly sourceChange?: { readonly from: readonly Row[]; readonly delta: RowDelta } | null;
}

export interface PipelineStage<Row, State = unknown> {
  readonly name: PipelineStageName;
  /**
   * Inputs besides the row model and compiled columns. The stage re-runs only
   * when the row model identity, the compiled leaf columns, or one of these
   * values (compared with `Object.is`) changes.
   */
  key(query: DataQuery, state: State): readonly unknown[];
  /** Pure. Must not mutate `input`; return `input` itself when nothing changes. */
  run(input: RowModelSnapshot<Row>, ctx: StageContext<Row, State>): RowModelSnapshot<Row>;
  /**
   * Optional incremental path. Called instead of `run` when the stage key and
   * the compiled leaves are unchanged, every earlier stage was also updated
   * incrementally (or passed its input through), and the source rows changed
   * only by `delta` since the stage last ran. `previous` holds the stage's
   * last input and output (indexes in the previous source array). Must return
   * exactly what `run(input, ctx)` would return, or undefined to fall back to
   * `run`.
   */
  update?(
    input: RowModelSnapshot<Row>,
    previous: { readonly input: RowModelSnapshot<Row>; readonly output: RowModelSnapshot<Row> },
    delta: RowDelta,
    ctx: StageContext<Row, State>,
  ): RowModelSnapshot<Row> | undefined;
}

// ---------------------------------------------------------------------------
// Commands and modules
// ---------------------------------------------------------------------------

export type CommandType = `${string}.${string}`;

export type DataGridCommand = { readonly type: CommandType; readonly [key: string]: Json | undefined };

export type CommandResult =
  | { readonly status: 'applied' }
  | { readonly status: 'rejected'; readonly reason: string }
  | { readonly status: 'async'; readonly promise: Promise<void> };

/** Result of a mutating DataGrid action (public name of `CommandResult`). */
export type DataGridActionResult = CommandResult;

/** Returned from `reduce` through `ctx.reject(reason)`. */
export interface CommandRejection {
  readonly rejected: true;
  readonly reason: string;
  /** State to publish although the command is rejected (validation errors of a refused commit). */
  readonly state?: unknown;
}

export interface NotificationScope {
  /** Replace the grid snapshot (bump `version`). */
  readonly grid?: boolean;
  readonly rows?: readonly RowId[];
  readonly cells?: readonly CellRef[];
  readonly headers?: readonly ColumnId[];
  /** Notify every subscribed row (large selection changes: O(subscribed rows), not O(changed rows)). */
  readonly allRows?: boolean;
  /** Notify every subscribed header. */
  readonly allHeaders?: boolean;
}

export interface ModuleContext<Row> {
  getSnapshot(): DataGridSnapshot<Row>;
  getModuleState<T = unknown>(name: string): T | undefined;
  dispatch(command: DataGridCommand): CommandResult;
  getColumns(): ColumnSnapshot<Row>;
  getRows(): RowModelSnapshot<Row>;
  /**
   * The row model entering a pipeline stage (brings the pipeline up to date
   * first). For a stage skipped because a remote source performed it, the
   * model that would have entered it. Undefined when no module registers it.
   */
  getStageInput(name: PipelineStageName): RowModelSnapshot<Row> | undefined;
  getDataSource(): DataSource<Row>;
  /**
   * False until `connect()` for an engine created with `deferDataSource`:
   * modules must not start loads (user callbacks, fetches) before it; see
   * `DataGridModule.onConnect`.
   */
  isConnected?(): boolean;
  /** Raw row by id (source rows, including rows filtered out of the view), or undefined. */
  getRow(rowId: RowId): Row | undefined;
  /** Visible index of a row (after the pipeline), or -1. */
  getRowIndex(rowId: RowId): number;
  /** Row id at a visible index. */
  getRowIdAt(index: number): RowId | undefined;
  /** The grid `timeZone` option (undefined: the runtime's local zone). */
  readonly timeZone: string | undefined;
  /** Rejects the command; `state`, when given, is still applied and notified (the command result stays `rejected`). */
  reject(reason: string, state?: unknown): CommandRejection;
  warn(code: string, message: string): void;
}

/** Read-only module methods exposed on the façade (`engine.<module>.<method>(...args)`); they receive the module context first. */
export type ModuleMethods<Row> = Readonly<Record<string, (ctx: ModuleContext<Row>, ...args: never[]) => unknown>>;

export interface DataGridModule<
  Row = unknown,
  State = unknown,
  Command extends DataGridCommand = DataGridCommand,
  Name extends string = string,
  Methods extends ModuleMethods<Row> = {},
> {
  readonly name: Name;
  /** Validated at engine creation. */
  readonly dependencies?: readonly string[];
  /**
   * When true (default) the slice lives in `snapshot.modules[name]` and every
   * change replaces the grid snapshot. High-churn modules (focus, selection,
   * drafts) set false and notify through row/cell/header/module channels only.
   */
  readonly inSnapshot?: boolean;
  /** Declared, validated, serializable. Every type must start with `${name}.`. */
  readonly commands: readonly Command['type'][];
  initialState(options: DataGridOptions<Row>): State;
  reduce?(state: State, command: Command, ctx: ModuleContext<Row>): State | CommandRejection;
  extendColumns?(columns: readonly CompiledColumn<Row>[], ctx: ModuleContext<Row>): readonly CompiledColumn<Row>[];
  extendQuery?(query: DataQuery, state: State): DataQuery;
  readonly pipeline?: readonly PipelineStage<Row, State>[];
  readonly selectors?: Readonly<Record<string, (snapshot: DataGridSnapshot<Row>) => unknown>>;
  /** Reads that need more than the snapshot (facets, pager totals). Must not change state; names may not collide with command actions. */
  readonly methods?: Methods;
  notify?(previous: State, next: State, ctx: ModuleContext<Row>): NotificationScope;
  /** Leaf columns this module hides from the visible column set (grouped columns with `showGroupedColumns: false`). */
  hiddenColumns?(state: State): readonly ColumnId[];
  /**
   * Remote sources only: return true to serve the main read of `query`
   * yourself (lazy grouping loads group levels instead of rows). The engine
   * then shows no source rows and runs only the stages the source did not perform.
   */
  interceptRead?(query: DataQuery, state: State, ctx: ModuleContext<Row>): boolean;
  /**
   * Called after the effective query changed (sort, filter, search, page,
   * group). Runs inside the dispatch of the command that changed it; may
   * dispatch commands through `ctx` (selection clears itself here when it
   * does not persist).
   */
  onQueryChange?(previous: DataQuery, next: DataQuery, ctx: ModuleContext<Row>): void;
  /** `engine.connect()` ran (`deferDataSource`): start loads that were held while disconnected. */
  onConnect?(ctx: ModuleContext<Row>): void;
  /**
   * A data source event (patch or reset). Return true to consume it: the
   * engine then leaves its source rows unchanged (infinite scroll applies
   * write echoes to the blocks it owns).
   */
  onSourceEvent?(event: DataSourceEvent<Row>, state: State, ctx: ModuleContext<Row>): boolean;
  dispose?(): void;
}

// ---------------------------------------------------------------------------
// Snapshots and options
// ---------------------------------------------------------------------------

export interface ViewportSnapshot {
  readonly scrollTop: number;
  readonly scrollLeft: number;
  readonly width: number;
  readonly height: number;
  readonly rows: {
    readonly start: number;
    readonly end: number;
    readonly overscanStart: number;
    readonly overscanEnd: number;
    readonly offsetTop: number;
    readonly totalHeight: number;
  };
  readonly columns: { readonly start: number; readonly end: number; readonly offsetLeft: number; readonly totalWidth: number };
  readonly segment: { readonly index: number; readonly count: number; readonly rowsPerSegment: number } | null;
}

export interface DataGridSnapshot<Row> {
  readonly version: number;
  readonly columns: ColumnSnapshot<Row>;
  readonly rows: RowModelSnapshot<Row>;
  readonly viewport: ViewportSnapshot;
  readonly data: DataStatusSnapshot;
  readonly query: DataQuery;
  readonly direction: 'ltr' | 'rtl';
  readonly locale: string;
  readonly modules: Readonly<Record<string, unknown>>;
}

export interface DataGridWarning {
  readonly code: string;
  readonly message: string;
  readonly gridId: string;
}

export interface DataGridOptions<Row> {
  /** Required. Index-based ids are never generated by the core. */
  readonly getRowId: (row: Row, index: number) => RowId;
  readonly columns: readonly ColumnDef<Row>[];
  /** A plain array is wrapped in `createLocalDataSource`. */
  readonly dataSource: readonly Row[] | DataSource<Row>;
  readonly modules?: readonly DataGridModule<Row>[];
  /** Initial query (`where`/`take` equivalent). Modules read their part in `initialState`. */
  readonly defaultQuery?: DataGridQueryInit;
  readonly id?: string;
  readonly direction?: 'ltr' | 'rtl';
  readonly locale?: string;
  readonly timeZone?: string;
  /** Default ISO 4217 currency for `C` formats. Default `USD`. */
  readonly currency?: string;
  readonly rowHeight?: number | ((row: Row) => number);
  readonly estimatedRowHeight?: number;
  readonly headerRowHeight?: number;
  readonly defaultColumnWidth?: number;
  /** Rows in the deterministic server/initial range. Default 20. */
  readonly initialRows?: number;
  /** Center columns in the deterministic server/initial range. Default 20. */
  readonly initialColumns?: number;
  /** Initial runtime column visibility, widths (px), and order, applied before the server snapshot. */
  readonly initialColumnState?: {
    readonly visibility?: Readonly<Record<ColumnId, boolean>>;
    readonly widths?: Readonly<Record<ColumnId, number>>;
    readonly order?: readonly ColumnId[] | null;
    /** Runtime freeze overrides (`null` unfreezes a column that declares `pinned`). */
    readonly freeze?: Readonly<Record<ColumnId, 'left' | 'right' | 'fixed' | null>>;
    /** Frozen column counts: the first `left` and last `right` visible leaves are frozen. */
    readonly frozenCount?: { readonly left?: number; readonly right?: number };
  };
  /** Development checks and warnings. Defaults to `process.env.NODE_ENV !== 'production'`. */
  readonly dev?: boolean;
  readonly onWarning?: (warning: DataGridWarning) => void;
  /** Expose store counters through `getInstrumentation()`. */
  readonly instrument?: boolean;
  /** Keep a serializable log of applied commands (`getCommandLog()`). */
  readonly recordCommands?: boolean;
  /**
   * Creating the engine performs no data-source side effect: no `subscribe`,
   * no `read` (so no load, fetch, stream, or user callback). Only a local
   * source with a `getRows()` snapshot is read at creation; remote and live
   * reads are requested but held until `connect()` (the snapshot shows their
   * loading state). Renderers set it so creation stays render-pure.
   */
  readonly deferDataSource?: boolean;
  /**
   * Span resolver of a renderer that draws cell spans: focus moves,
   * cell selection, and editing treat a span as one cell at its anchor. Omit
   * it when nothing spans.
   */
  readonly cellSpans?: CellSpanResolver;
  /** Module options are passed under the module name. */
  readonly [module: string]: unknown;
}

export interface DataGridInstrumentation {
  readonly columnCompiles: number;
  readonly columnDefCompiles: number;
  readonly columnTypeResolves: number;
  readonly snapshots: number;
  readonly pipelineRuns: number;
  readonly stageRuns: Readonly<Record<string, number>>;
  /** Stage executions served by the incremental `update` path (a subset of `stageRuns`). */
  readonly stageUpdates: Readonly<Record<string, number>>;
  readonly notifications: number;
  readonly selectorEvaluations: number;
  readonly cellSnapshots: number;
  readonly rowSnapshots: number;
  readonly dataReads: number;
  readonly staleResults: number;
  readonly commands: number;
}

export interface BeforeCommandEvent {
  readonly command: DataGridCommand;
}

export interface CommandEvent {
  readonly command: DataGridCommand;
  readonly result: CommandResult;
  readonly version: number;
}

export interface DataGridEngine<Row> {
  readonly id: string;
  getSnapshot(): DataGridSnapshot<Row>;
  getServerSnapshot(): DataGridSnapshot<Row>;
  subscribe(listener: () => void): () => void;
  select<T>(selector: (snapshot: DataGridSnapshot<Row>) => T): T;
  subscribeSelector<T>(
    selector: (snapshot: DataGridSnapshot<Row>) => T,
    listener: (value: T) => void,
    isEqual?: (a: T, b: T) => boolean,
  ): () => void;
  subscribeCell(rowId: RowId, columnId: ColumnId, listener: () => void): () => void;
  subscribeRow(rowId: RowId, listener: () => void): () => void;
  subscribeHeader(columnId: ColumnId, listener: () => void): () => void;
  subscribeModule(name: string, listener: () => void): () => void;
  getCellSnapshot(rowId: RowId, columnId: ColumnId): CellSnapshot | undefined;
  getRowSnapshot(rowId: RowId): RowSnapshot<Row> | undefined;
  getHeaderSnapshot(columnId: ColumnId): HeaderSnapshot | undefined;
  getModuleState<T = unknown>(name: string): T | undefined;
  getSelector(moduleName: string, selectorName: string): ((snapshot: DataGridSnapshot<Row>) => unknown) | undefined;
  /** Raw row by id (source rows, including rows filtered out of the view). */
  getRow(rowId: RowId): Row | undefined;
  /** Visible index of a row, or -1. */
  getRowIndex(rowId: RowId): number;
  getRowAt(index: number): Row | undefined;
  getRowIdAt(index: number): RowId | undefined;
  getCellValue(rowId: RowId, columnId: ColumnId): unknown;
  getDataSource(): DataSource<Row>;
  /** Recompiles only when the array identity or a definition identity changes. */
  setColumns(columns: readonly ColumnDef<Row>[]): void;
  /**
   * Changes the locale, currency, time zone, or direction at runtime. A format change recompiles the column formatters once
   * and re-runs the pipeline (collation follows the locale); a direction
   * change updates `snapshot.direction` and the focus module. Omitted fields
   * keep their value (`timeZone: undefined` given explicitly resets to the
   * runtime zone). Returns false when nothing changed.
   */
  setLocale(next: { readonly locale?: string; readonly currency?: string; readonly timeZone?: string | undefined; readonly direction?: 'ltr' | 'rtl' }): boolean;
  dispatch(command: DataGridCommand): CommandResult;
  /** Whether a registered module declares the command type (UI commands probe it before dispatching). */
  hasCommand(type: string): boolean;
  batch(run: () => void): void;
  onBeforeCommand(listener: (event: BeforeCommandEvent) => boolean | string | void): () => void;
  onCommand(listener: (event: CommandEvent) => void): () => void;
  getCommandLog(): readonly DataGridCommand[];
  getInstrumentation(): DataGridInstrumentation | null;
  /**
   * With `deferDataSource`: subscribes to the source and issues the pending
   * read. Returns the disconnect (unsubscribes, aborts the in-flight read, which
   * the next `connect()` re-issues). A no-op when already connected.
   */
  connect(): () => void;
  /** Re-reads the data source with the current query (retry after a data error). Before `connect()` the read waits for it. */
  reload(): void;
  /**
   * Refresh: drops the row and cell snapshot caches,
   * invalidates the source cache (`DataSource.invalidate`), aborts and
   * re-issues the current read, and keeps every module state (sort, filter,
   * group, page, selection, expansion). Rows mutated in place render their
   * new values.
   */
  refresh(): void;
  readonly disposed: boolean;
  dispose(): void;
}
