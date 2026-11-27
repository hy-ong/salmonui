import { createAbortController, isPromiseLike, type AbortControllerLike } from './abort.js';
import {
  buildColumnSnapshot,
  compileColumns,
  createColumnsModule,
  isColumnVisible,
  resolveColumnWidth,
  resolvePendingType,
  type ColumnsCommand,
  type ColumnsState,
  type CompiledColumns,
} from './columns.js';
import { createWarner, DEFAULT_DEV } from './dev.js';
import type { FormatEnvironment } from '@salmonui/core/format';
import { freezeJsonCopy, isJsonValue, shallowEqualArrays } from '@salmonui/core/data';
import { advanceColumnKeys, forgetColumnKeys } from './keys.js';
import { createLocalDataSource, localMoveOf, type LocalRowMove } from './local-data-source.js';
import { ALL_PERFORMED, collectStages, getSourceIndex, type RegisteredStage } from './pipeline.js';
import { activeQueryParts, createDataGridQuery, serializeDataGridQuery } from './query.js';
import { acceptsMappedDeltas, composeDeltas, createMoveDelta, createRowDelta, isMappedDelta } from './row-delta.js';
import { movedCopy, RowIndex } from './row-index.js';
import type {
  BeforeCommandEvent,
  CellSnapshot,
  ColumnDef,
  ColumnId,
  ColumnSnapshot,
  CommandEvent,
  CommandRejection,
  CommandResult,
  CompiledColumn,
  DataSourceEvent,
  DataSourceRequest,
  DataSourceResult,
  DataStatusSnapshot,
  DataGridCommand,
  DataSource,
  LocalDataSource,
  WriteRequest,
  DataGridEngine,
  DataGridInstrumentation,
  DataGridModule,
  DataGridOptions,
  DataQuery,
  DataGridSnapshot,
  HeaderSnapshot,
  ModuleContext,
  ModuleMethods,
  PerformedStage,
  PipelineStageName,
  RowDelta,
  RowId,
  RowModelSnapshot,
  RowSnapshot,
  ViewportSnapshot,
} from './types.js';

// ---------------------------------------------------------------------------
// Façade typing: one method per declared command, typed from the module union
// ---------------------------------------------------------------------------

type ActionOf<T, N extends string> = T extends `${N}.${infer A}` ? A : never;
type PayloadOf<C> = { [K in keyof C as K extends 'type' ? never : K]: C[K] };
type FacadeMethod<C> = {} extends PayloadOf<C>
  ? (payload?: PayloadOf<C>) => CommandResult
  : (payload: PayloadOf<C>) => CommandResult;

type MethodFacade<Ms> = {
  readonly [K in keyof Ms]: Ms[K] extends (ctx: never, ...args: infer A) => infer R ? (...args: A) => R : never;
};

/**
 * Imperative façade of one module: `engine.<module>.<action>(payload)`
 * dispatches `<module>.<action>`; `engine.<module>.<method>(...args)` calls a
 * read-only module method.
 */
export type ModuleFacade<M> =
  M extends DataGridModule<infer _Row, infer _State, infer C, infer N, infer Ms>
    ? string extends N
      ? never
      : {
          readonly [K in N]: { readonly [T in C['type'] as ActionOf<T, N>]: FacadeMethod<Extract<C, { type: T }>> } & MethodFacade<Ms>;
        }
    : never;

type UnionToIntersection<U> = (U extends unknown ? (x: U) => void : never) extends (x: infer I) => void ? I : never;

export type ColumnsModule<Row = unknown> = DataGridModule<Row, ColumnsState, ColumnsCommand, 'columns'>;

/** Engine plus the generated command façade of the built-in `columns` module and every registered module. */
export type DataGridEngineWithModules<Row, Modules extends readonly unknown[]> = DataGridEngine<Row> &
  UnionToIntersection<ModuleFacade<ColumnsModule<Row>> | ModuleFacade<Modules[number]>>;

/** Identity helper that keeps the module name, command union, and methods as literal types for the façade. */
export function defineDataGridModule<Row, State, Command extends DataGridCommand, const Name extends string, Methods extends ModuleMethods<Row> = {}>(
  module: DataGridModule<Row, State, Command, Name, Methods>,
): DataGridModule<Row, State, Command, Name, Methods> {
  return module;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Bounded two-generation cache: hot entries survive rotation, memory stays bounded while scrolling. */
class GenerationalCache<K, V> {
  private young = new Map<K, V>();
  private old = new Map<K, V>();
  private readonly limit: number;
  constructor(limit: number) {
    this.limit = limit;
  }
  get(key: K): V | undefined {
    const hit = this.young.get(key);
    if (hit !== undefined) return hit;
    const aged = this.old.get(key);
    if (aged !== undefined) {
      this.old.delete(key);
      this.set(key, aged);
    }
    return aged;
  }
  set(key: K, value: V): void {
    this.young.set(key, value);
    if (this.young.size >= this.limit) {
      this.old = this.young;
      this.young = new Map();
    }
  }
  clear(): void {
    this.young.clear();
    this.old.clear();
  }
}

interface RowEntry<Row> {
  readonly snap: RowSnapshot<Row>;
  readonly row: Row;
  readonly index: number;
  /** Row model view the depth/parent were read from. */
  readonly view?: unknown;
}
interface CellEntry<Row> {
  readonly snap: CellSnapshot;
  readonly row: Row;
  readonly column: CompiledColumn<Row>;
}
interface HeaderEntry<Row> {
  readonly snap: HeaderSnapshot;
  readonly column: CompiledColumn<Row>;
  readonly visible: boolean;
  readonly freeze: 'left' | 'right' | null;
}
interface SelectorSubscription<Row> {
  readonly selector: (snapshot: DataGridSnapshot<Row>) => unknown;
  readonly listener: (value: unknown) => void;
  readonly isEqual: (a: unknown, b: unknown) => boolean;
  value: unknown;
}
interface InFlight {
  readonly version: number;
  readonly key: string;
  readonly controller: AbortControllerLike;
  readonly promise: Promise<void>;
}
interface Counters {
  columnCompiles: number;
  columnDefCompiles: number;
  columnTypeResolves: number;
  snapshots: number;
  pipelineRuns: number;
  stageRuns: Record<string, number>;
  stageUpdates: Record<string, number>;
  notifications: number;
  selectorEvaluations: number;
  cellSnapshots: number;
  rowSnapshots: number;
  dataReads: number;
  staleResults: number;
  commands: number;
}

const APPLIED: CommandResult = Object.freeze({ status: 'applied' });
const EMPTY_ROWS: readonly never[] = Object.freeze([]);
const EMPTY_PERFORMED: readonly PerformedStage[] = Object.freeze([]);
const ROW_CACHE_LIMIT = 4096;
const CELL_ROW_CACHE_LIMIT = 512;

function rejected(reason: string): CommandResult {
  return Object.freeze({ status: 'rejected', reason });
}

function noop(): void {}

/** Rows of a local source with a pure `getRows()` snapshot (`createLocalDataSource`), else null. */
function snapshotRowsOf<Row>(source: DataSource<Row>): readonly Row[] | null {
  const getRows = (source as Partial<LocalDataSource<Row>>).getRows;
  return source.mode === 'local' && typeof getRows === 'function' ? getRows.call(source) : null;
}

function isDataSource<Row>(value: readonly Row[] | DataSource<Row>): value is DataSource<Row> {
  return !Array.isArray(value);
}

/** Dependency order, then registration order. Throws on duplicates, missing dependencies, and cycles. */
export function orderModules<M extends { readonly name: string; readonly dependencies?: readonly string[] }>(modules: readonly M[]): M[] {
  const names = new Set<string>();
  for (const m of modules) {
    if (typeof m.name !== 'string' || m.name === '' || m.name.includes('.')) {
      throw new Error(`Invalid module name "${String(m.name)}": names are non-empty and contain no ".".`);
    }
    if (names.has(m.name)) throw new Error(`Duplicate grid module "${m.name}".`);
    names.add(m.name);
  }
  for (const m of modules) {
    for (const dep of m.dependencies ?? []) {
      if (!names.has(dep)) throw new Error(`DataGrid module "${m.name}" depends on "${dep}", which is not registered.`);
    }
  }
  const ordered: M[] = [];
  const placed = new Set<string>();
  const remaining = [...modules];
  while (remaining.length) {
    const index = remaining.findIndex((m) => (m.dependencies ?? []).every((d) => placed.has(d)));
    if (index < 0) throw new Error(`DataGrid module dependency cycle among: ${remaining.map((m) => m.name).join(', ')}.`);
    const [next] = remaining.splice(index, 1) as [M];
    ordered.push(next);
    placed.add(next.name);
  }
  return ordered;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

type AnyModule<Row> = DataGridModule<Row, unknown, never>;

/**
 * Creates a framework-agnostic DataGrid engine. Features are modules; without
 * modules the engine compiles columns, holds rows, and runs an empty pipeline.
 */
export function createDataGridEngine<Row, const Modules extends readonly DataGridModule<Row>[] = readonly []>(
  options: DataGridOptions<Row> & { readonly modules?: Modules },
): DataGridEngineWithModules<Row, Modules> {
  if (typeof options.getRowId !== 'function') {
    throw new TypeError('createDataGridEngine: options.getRowId is required (index-based ids are never generated).');
  }
  const gridId = options.id ?? 'grid';
  const dev = options.dev ?? DEFAULT_DEV;
  const warn = createWarner(dev, gridId, options.onWarning);
  const getRowId = options.getRowId;
  // Mutable through `engine.setLocale`: a change recompiles
  // the column formatters once; nothing else reads these between commands.
  let locale = options.locale ?? 'en-US';
  let direction: 'ltr' | 'rtl' = options.direction ?? 'ltr';
  const counters: Counters | null = options.instrument
    ? {
        columnCompiles: 0,
        columnDefCompiles: 0,
        columnTypeResolves: 0,
        snapshots: 0,
        pipelineRuns: 0,
        stageRuns: {},
        stageUpdates: {},
        notifications: 0,
        selectorEvaluations: 0,
        cellSnapshots: 0,
        rowSnapshots: 0,
        dataReads: 0,
        staleResults: 0,
        commands: 0,
      }
    : null;

  // --- modules ------------------------------------------------------------
  const columnsModule = createColumnsModule<Row>() as unknown as AnyModule<Row>;
  const userModules = (options.modules ?? []) as readonly AnyModule<Row>[];
  const modules = orderModules<AnyModule<Row>>([columnsModule, ...userModules]);
  const commandIndex = new Map<string, AnyModule<Row>>();
  for (const module of modules) {
    for (const type of module.commands as readonly string[]) {
      if (!type.startsWith(`${module.name}.`) || type.length === module.name.length + 1) {
        throw new Error(`DataGrid module "${module.name}" declares command "${type}"; command types must be "${module.name}.<action>".`);
      }
      const owner = commandIndex.get(type);
      if (owner) throw new Error(`Command type "${type}" is declared by both "${owner.name}" and "${module.name}".`);
      commandIndex.set(type, module);
    }
  }
  const stages: RegisteredStage<Row>[] = collectStages(modules);
  const stageNames = new Set<PipelineStageName>(stages.map((s) => s.stage.name));
  const stageModules = new Set(stages.map((s) => s.module.name));
  const queryModules = modules.filter((m) => typeof m.extendQuery === 'function');
  const columnModules = modules.filter((m) => typeof m.extendColumns === 'function');
  const hidingModules = modules.filter((m) => typeof m.hiddenColumns === 'function');
  const readModules = modules.filter((m) => typeof m.interceptRead === 'function');
  const queryObservers = modules.filter((m) => typeof m.onQueryChange === 'function');
  const eventModules = modules.filter((m) => typeof m.onSourceEvent === 'function');
  const moduleStates = new Map<string, unknown>();
  for (const module of modules) moduleStates.set(module.name, module.initialState(options));

  // --- data source --------------------------------------------------------
  const source: DataSource<Row> = isDataSource(options.dataSource)
    ? options.dataSource
    : createLocalDataSource(options.dataSource, { getRowId });
  const remote = source.mode === 'remote';

  let sourceRows: readonly Row[] = EMPTY_ROWS;
  let sourceIds: readonly RowId[] = EMPTY_ROWS;
  let idIndex = new RowIndex();
  let baseModel: RowModelSnapshot<Row> = Object.freeze({ source: sourceRows, sourceIds, order: null, count: 0 });
  let model: RowModelSnapshot<Row> = baseModel;
  let inverseOrder: Int32Array | null = null;
  let inverseFor: RowModelSnapshot<Row> | null = null;
  // Row model entering each stage during the last pipeline run (skipped stages included).
  const stageInputs = new Map<PipelineStageName, RowModelSnapshot<Row>>();
  // Incremental data changes: `pendingDelta` leads from `deltaFrom` (the base
  // model of the last pipeline run) to the current base model. Null when the
  // data was replaced wholesale since that run.
  let deltaFrom: RowModelSnapshot<Row> | null = null;
  let pendingDelta: RowDelta | null = null;
  const stageBases = new Map<RegisteredStage<Row>, RowModelSnapshot<Row>>();
  // Remote: nothing to compute before the first response.
  let performed: readonly PerformedStage[] = remote ? ALL_PERFORMED : EMPTY_PERFORMED;
  let data: DataStatusSnapshot = Object.freeze({
    status: 'idle',
    error: null,
    totalRowCount: 0,
    version: 0,
    mode: source.mode,
    performed: EMPTY_PERFORMED,
    aggregates: null,
  });
  let requestVersion = 0;
  let inFlight: InFlight | null = null;
  let lastRequestKey: string | null = null;
  // `deferDataSource`: no source side effect (read, subscribe) until `connect()`.
  const deferred = options.deferDataSource === true;
  let connected = !deferred;
  /** A local read was skipped while disconnected; `connect()` issues it. */
  let readPending = false;
  let unsubscribeSource: (() => void) | undefined;
  // Remote and live reads issued while disconnected wait for `connect()`: the
  // request state (loading, lazy group roots) is the same as when connected,
  // but the source itself is not called before the renderer commits.
  const gatedReads: (() => void)[] = [];
  function readSource(request: DataSourceRequest): DataSourceResult<Row> | Promise<DataSourceResult<Row>> {
    if (connected) return source.read(request);
    return new Promise<DataSourceResult<Row>>((resolve, reject) => {
      gatedReads.push(() => {
        if (request.signal.aborted) return; // superseded before connect: never issued
        try {
          Promise.resolve(source.read(request)).then(resolve, reject);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
  /** The source as modules see it: remote and live reads (lazy group loads) go through the gate. */
  const moduleSource: DataSource<Row> = deferred && (remote || source.mode === 'live')
    ? Object.freeze({
        mode: source.mode,
        ...(source.capabilities ? { capabilities: source.capabilities } : {}),
        read: readSource,
        ...(source.write ? { write: (request: WriteRequest<Row>) => (source.write as NonNullable<typeof source.write>).call(source, request) } : {}),
      })
    : source;

  // --- dirty flags and caches ---------------------------------------------
  let snapshotDirty = true;
  let rowsDirty = true;
  let columnsDirty = true;
  let modulesDirty = true;
  let viewportDirty = true;
  let disposed = false;
  let batchDepth = 0;
  let flushing = false;
  let flushAgain = false;

  const formatEnv: { -readonly [K in keyof FormatEnvironment]: FormatEnvironment[K] } = {
    getLocale: () => locale,
    timeZone: options.timeZone,
    currency: options.currency ?? 'USD',
    cache: new Map(),
    warn,
  };

  // --- columns ------------------------------------------------------------
  let columnDefs: readonly ColumnDef<Row>[] = options.columns;
  let compiled: CompiledColumns<Row> | null = null;
  let extended: Pick<CompiledColumns<Row>, 'tree' | 'leaves' | 'byId' | 'headerRowCount'> | null = null;
  let columnSnapshot: ColumnSnapshot<Row> | null = null;
  let columnSnapshotState: unknown = null;

  // --- listeners ----------------------------------------------------------
  const listeners = new Set<() => void>();
  const selectorSubs = new Set<SelectorSubscription<Row>>();
  const rowListeners = new Map<RowId, Set<() => void>>();
  const cellListeners = new Map<RowId, Map<ColumnId, Set<() => void>>>();
  const headerListeners = new Map<ColumnId, Set<() => void>>();
  const moduleListeners = new Map<string, Set<() => void>>();
  const beforeCommandListeners = new Set<(event: BeforeCommandEvent) => boolean | string | void>();
  const commandListeners = new Set<(event: CommandEvent) => void>();
  const pendingRows = new Set<RowId>();
  const pendingCells = new Map<RowId, Set<ColumnId> | true>();
  const pendingHeaders = new Set<ColumnId>();
  const pendingModules = new Set<string>();
  const rowCache = new GenerationalCache<RowId, RowEntry<Row>>(ROW_CACHE_LIMIT);
  const cellCache = new GenerationalCache<RowId, Map<ColumnId, CellEntry<Row>>>(CELL_ROW_CACHE_LIMIT);
  const headerCache = new Map<ColumnId, HeaderEntry<Row>>();
  const commandLog: DataGridCommand[] | null = options.recordCommands ? [] : null;
  const rejections = new WeakSet<object>();

  // --- query --------------------------------------------------------------
  const baseQuery = createDataGridQuery(options.defaultQuery);
  let query: DataQuery = baseQuery;
  const queryMemo = new Map<string, { input: DataQuery; state: unknown; output: DataQuery }>();

  let snapshot: DataGridSnapshot<Row> | null = null;
  let viewport: ViewportSnapshot | null = null;
  let modulesRecord: Readonly<Record<string, unknown>> = Object.freeze({});

  // ------------------------------------------------------------------------
  // Rows
  // ------------------------------------------------------------------------

  function computeIds(rows: readonly Row[]): void {
    const ids: RowId[] = [];
    const map = new RowIndex(rows.length);
    let duplicates = 0;
    let firstDuplicate: RowId | null = null;
    let invalid = 0;
    for (let i = 0; i < rows.length; i++) {
      let id = getRowId(rows[i] as Row, i);
      if (typeof id !== 'string') {
        invalid++;
        id = String(id);
      }
      ids.push(id);
      if (!map.append(id)) {
        duplicates++;
        firstDuplicate ??= id;
      }
    }
    if (invalid) warn('row-id-invalid', `getRowId returned a non-string id for ${invalid} row(s); ids are coerced with String(). Return stable string ids.`);
    if (duplicates) {
      warn(
        'row-id-duplicate',
        `getRowId returned ${duplicates} duplicate id(s) (first: "${firstDuplicate}"). Row ids must be unique; lookups by id resolve to the first row.`,
      );
    }
    sourceRows = rows;
    sourceIds = Object.freeze(ids);
    idIndex = map;
  }

  function setBaseModel(): void {
    baseModel = Object.freeze({ source: sourceRows, sourceIds, order: null, count: sourceRows.length });
    rowsDirty = true;
    snapshotDirty = true;
  }

  function runRows(): void {
    if (!rowsDirty) return;
    rowsDirty = false;
    let next = baseModel;
    if (stages.length) {
      if (counters) counters.pipelineRuns++;
      const columns = getColumnSnapshot();
      next = runPipelineStages(columns);
      deltaFrom = baseModel;
      pendingDelta = null;
    }
    if (next !== model) {
      model = next;
      viewportDirty = true;
      snapshotDirty = true;
    }
  }

  function runPipelineStages(columns: ColumnSnapshot<Row>): RowModelSnapshot<Row> {
    let current = baseModel;
    // The delta applies to a stage only while every earlier stage changed its
    // output for the delta's rows alone (incremental update or pass-through).
    let delta = pendingDelta !== null && deltaFrom !== null ? pendingDelta : null;
    const sourceChange = delta !== null && deltaFrom !== null ? { from: deltaFrom.source, delta } : null;
    for (const entry of stages) {
      const name = entry.stage.name;
      stageInputs.set(name, current);
      if (remote && performedSkips(name)) {
        delta = null;
        continue;
      }
      const state = moduleStates.get(entry.module.name);
      const key = entry.stage.key(query, state);
      const memo = entry.memo;
      if (memo && memo.input === current && memo.leaves === columns.leaves && shallowEqualArrays(memo.key, key)) {
        stageBases.set(entry, baseModel);
        current = memo.output;
        continue;
      }
      if (counters) counters.stageRuns[name] = (counters.stageRuns[name] ?? 0) + 1;
      const stageCtx = { query, columns, state, locale, timeZone: formatEnv.timeZone, sourceIndexOf, sourceChange };
      let output: RowModelSnapshot<Row> | undefined;
      if (
        delta !== null &&
        entry.stage.update &&
        // Mapped deltas (reorders) only reach stages that handle them.
        (!isMappedDelta(delta) || acceptsMappedDeltas(entry.stage)) &&
        memo &&
        stageBases.get(entry) === deltaFrom &&
        memo.leaves === columns.leaves &&
        shallowEqualArrays(memo.key, key)
      ) {
        output = entry.stage.update(current, { input: memo.input, output: memo.output }, delta, stageCtx);
        if (output !== undefined && counters) counters.stageUpdates[name] = (counters.stageUpdates[name] ?? 0) + 1;
      }
      if (output === undefined) {
        output = entry.stage.run(current, stageCtx);
        // A full run may change membership of any row; only a pass-through that was one before keeps the delta valid.
        if (!(output === current && memo !== null && memo.output === memo.input)) delta = null;
      }
      stageBases.set(entry, baseModel);
      if (dev && output !== current) {
        const where = `Pipeline stage "${name}" of module "${entry.module.name}"`;
        if (output.order !== null && output.order === current.order && output.view === current.view && output.groups === current.groups && output.aggregates === current.aggregates) {
          warn('pipeline-mutated-input', `${where} returned a new model that reuses the input order array; stages must not mutate their input.`);
        }
        if (output.source !== current.source || output.sourceIds !== current.sourceIds) {
          warn('pipeline-source-replaced', `${where} replaced the source rows; stages reorder or subset rows through "order" only.`);
        }
      }
      entry.memo = { input: current, leaves: columns.leaves, key, output };
      current = output;
    }
    return current;
  }

  function sourceIndexOf(rowId: RowId): number {
    return idIndex.get(rowId) ?? -1;
  }

  function performedSkips(name: PipelineStageName): boolean {
    switch (name) {
      case 'search':
      case 'filter':
      case 'sort':
      case 'group':
      case 'page':
        return performed.includes(name);
      // Group aggregates are computed over the received rows; server totals come from `data.aggregates`.
      default:
        return false;
    }
  }

  function visibleIndexOfSource(sourceIndex: number): number {
    runRows();
    if (model.view) return model.view.indexOfSource(sourceIndex);
    if (model.order === null) return sourceIndex < model.count ? sourceIndex : -1;
    if (inverseFor !== model) {
      const inv = new Int32Array(model.source.length).fill(-1);
      const order = model.order;
      for (let v = 0; v < model.count; v++) inv[order[v] as number] = v;
      inverseOrder = inv;
      inverseFor = model;
    }
    return (inverseOrder as Int32Array)[sourceIndex] ?? -1;
  }

  // ------------------------------------------------------------------------
  // Columns
  // ------------------------------------------------------------------------

  function compileDefs(defs: readonly ColumnDef<Row>[], reuse = true): boolean {
    const result = compileColumns(defs, {
      format: formatEnv,
      warn,
      sample: sourceRows,
      previous: reuse ? (compiled?.cache ?? null) : null,
      onDefCompiled: () => {
        if (counters) counters.columnDefCompiles++;
      },
    });
    if (compiled && shallowEqualArrays(result.tree, compiled.tree)) return false;
    if (counters) counters.columnCompiles++;
    compiled = result;
    applyColumnExtensions();
    return true;
  }

  function applyColumnExtensions(): void {
    const base = compiled as CompiledColumns<Row>;
    let leaves = base.leaves;
    for (const module of columnModules) leaves = module.extendColumns?.(leaves, ctx) ?? leaves;
    if (leaves === base.leaves) {
      extended = base;
    } else {
      const byId = new Map<ColumnId, CompiledColumn<Row>>(base.byId);
      for (const col of leaves) byId.set(col.columnId, col);
      extended = {
        tree: Object.freeze(base.tree.map((c) => byId.get(c.columnId) ?? c)),
        leaves: Object.freeze([...leaves]),
        byId,
        headerRowCount: base.headerRowCount,
      };
    }
    columnsDirty = true;
    snapshotDirty = true;
    rowsDirty = true;
  }

  function resolvePendingTypes(): void {
    const base = compiled;
    if (!base?.pendingTypes || sourceRows.length === 0) return;
    if (counters) counters.columnTypeResolves++;
    const replaced = new Map<ColumnId, CompiledColumn<Row>>();
    let pending = false;
    for (const col of base.leaves) {
      if (col.typeSource !== 'pending') continue;
      const next = resolvePendingType(col, sourceRows, formatEnv, warn);
      if (next.typeSource === 'pending') pending = true;
      replaced.set(col.columnId, next);
    }
    const byId = new Map<ColumnId, CompiledColumn<Row>>();
    const cache = new WeakMap<ColumnDef<Row>, CompiledColumn<Row>>();
    const tree = base.tree.map((c) => replaced.get(c.columnId) ?? c);
    for (const c of tree) {
      byId.set(c.columnId, c);
      cache.set(c.def, c);
    }
    compiled = {
      tree: Object.freeze(tree),
      leaves: Object.freeze(base.leaves.map((c) => replaced.get(c.columnId) ?? c)),
      byId,
      headerRowCount: base.headerRowCount,
      pendingTypes: pending,
      cache,
    };
    applyColumnExtensions();
  }

  let hiddenKey = '';
  let hiddenStates: unknown[] = [];
  /** Columns hidden by modules (grouped columns); recomputed only when a hiding module's state changes. */
  function hiddenByModules(): string {
    let changed = false;
    for (let i = 0; i < hidingModules.length; i++) if (hiddenStates[i] !== moduleStates.get((hidingModules[i] as AnyModule<Row>).name)) changed = true;
    if (!changed) return hiddenKey;
    hiddenStates = hidingModules.map((m) => moduleStates.get(m.name));
    const ids: ColumnId[] = [];
    for (const m of hidingModules) for (const id of m.hiddenColumns?.(moduleStates.get(m.name) as never) ?? []) ids.push(id);
    hiddenKey = ids.length ? JSON.stringify(ids) : '';
    return hiddenKey;
  }
  let columnSnapshotHidden = '';
  function getColumnSnapshot(): ColumnSnapshot<Row> {
    const state = moduleStates.get('columns');
    const hidden = hidingModules.length ? hiddenByModules() : '';
    if (!columnsDirty && columnSnapshot && columnSnapshotState === state && columnSnapshotHidden === hidden) return columnSnapshot;
    columnsDirty = false;
    columnSnapshotState = state;
    columnSnapshotHidden = hidden;
    let effective = state as ColumnsState;
    if (hidden !== '') {
      const off: Record<ColumnId, boolean> = {};
      for (const id of JSON.parse(hidden) as ColumnId[]) off[id] = false;
      effective = { ...effective, visibility: { ...effective.visibility, ...off } };
    }
    columnSnapshot = buildColumnSnapshot(extended as NonNullable<typeof extended>, effective);
    viewportDirty = true;
    snapshotDirty = true;
    return columnSnapshot;
  }

  // ------------------------------------------------------------------------
  // Query
  // ------------------------------------------------------------------------

  function updateQuery(): void {
    let q = baseQuery;
    for (const module of queryModules) {
      const state = moduleStates.get(module.name);
      const memo = queryMemo.get(module.name);
      if (memo && memo.input === q && memo.state === state) {
        q = memo.output;
        continue;
      }
      const output = module.extendQuery?.(q, state) ?? q;
      queryMemo.set(module.name, { input: q, state, output });
      q = output;
    }
    if (q === query) return;
    const previousQuery = query;
    query = q;
    rowsDirty = true;
    snapshotDirty = true;
    onQueryChanged();
    for (const module of queryObservers) module.onQueryChange?.(previousQuery, q, ctx);
  }

  function onQueryChanged(): void {
    if (remote) {
      requestData();
      return;
    }
    if (!dev) return;
    for (const part of activeQueryParts(query)) {
      if (!stageNames.has(part)) {
        warn('query-unhandled', `Query sets "${part}" but no registered module provides a "${part}" pipeline stage; it has no effect on local data.`);
      }
    }
  }

  // ------------------------------------------------------------------------
  // Data
  // ------------------------------------------------------------------------

  function setData(next: Partial<DataStatusSnapshot>): void {
    data = Object.freeze({ ...data, ...next });
    snapshotDirty = true;
  }

  function applyResult(result: DataSourceResult<Row>, version: number): void {
    if (dev && result.version !== version) {
      warn('data-version-mismatch', `Data source returned version ${result.version} for request ${version}; results must echo request.version.`);
    }
    computeIds(result.rows);
    deltaFrom = null;
    pendingDelta = null;
    performed = remote ? Object.freeze([...(result.performed ?? ALL_PERFORMED)]) : EMPTY_PERFORMED;
    setBaseModel();
    resolvePendingTypes();
    setData({
      status: 'ready',
      error: null,
      totalRowCount: result.totalRowCount ?? result.rows.length,
      version,
      performed,
      aggregates: result.aggregates ?? null,
    });
  }

  function requestData(): void {
    if (!connected && !remote && source.mode !== 'live') {
      readPending = true;
      return;
    }
    // Expansion is view state: expanding a group never re-reads the source.
    const key = remote ? serializeDataGridQuery(query.expansion === baseQuery.expansion ? query : Object.freeze({ ...query, expansion: baseQuery.expansion })) : '';
    if (inFlight && inFlight.key === key) return; // identical request already in flight
    if (!inFlight && remote && lastRequestKey === key) return;
    inFlight?.controller.abort();
    inFlight = null;
    const version = ++requestVersion;
    if (remote) {
      for (const module of readModules) {
        if (!module.interceptRead?.(query, moduleStates.get(module.name) as never, ctx)) continue;
        lastRequestKey = key;
        applyResult({ version, rows: EMPTY_ROWS, totalRowCount: 0, performed: ALL_PERFORMED }, version);
        return;
      }
    }
    const controller = createAbortController();
    lastRequestKey = key;
    if (counters) counters.dataReads++;
    let result: DataSourceResult<Row> | Promise<DataSourceResult<Row>>;
    try {
      result = readSource({ version, query, signal: controller.signal });
    } catch (error) {
      setData({ status: 'error', error });
      return;
    }
    if (!isPromiseLike<DataSourceResult<Row>>(result)) {
      applyResult(result, version);
      return;
    }
    setData({ status: 'loading', error: null });
    const promise = Promise.resolve(result).then(
      (value) => {
        if (version !== requestVersion || controller.signal.aborted || disposed) {
          if (counters) counters.staleResults++;
          return;
        }
        inFlight = null;
        applyResult(value, version);
        flush();
      },
      (error: unknown) => {
        if (version !== requestVersion || controller.signal.aborted || disposed) {
          if (counters) counters.staleResults++;
          return;
        }
        inFlight = null;
        lastRequestKey = null;
        setData({ status: 'error', error });
        flush();
      },
    );
    inFlight = { version, key, controller, promise };
  }

  function onSourceEvent(event: DataSourceEvent<Row>): void {
    if (disposed) return;
    for (const module of eventModules) if (module.onSourceEvent?.(event, moduleStates.get(module.name) as never, ctx)) return;
    const previousRows = sourceRows;
    const move = event.type === 'reset' ? localMoveOf(event) : undefined;
    const delta =
      move !== undefined && move.from === sourceRows ? applyMove(event.rows, move) : event.type === 'reset' ? applyReset(event.rows) : applyPatch(event);
    if (delta) {
      advanceColumnKeys(previousRows, sourceRows, delta);
      if (deltaFrom !== null) pendingDelta = pendingDelta ? composeDeltas(pendingDelta, delta) : delta;
      if (pendingDelta === null) deltaFrom = null;
    } else {
      deltaFrom = null;
      pendingDelta = null;
    }
    setBaseModel();
    resolvePendingTypes();
    setData({ status: 'ready', error: null, totalRowCount: event.totalRowCount ?? event.rows.length });
    flush();
  }

  /** Largest change (rows touched) still applied incrementally; beyond it a full recompute is cheaper. */
  function deltaLimit(count: number): number {
    return Math.max(64, count >> 3);
  }

  /** Full id recompute; returns null (no delta). */
  function resetIds(rows: readonly Row[]): null {
    computeIds(rows);
    return null;
  }

  /**
   * Applies a structural change (removals, then appends) to the id array and
   * index. `removed` are ascending previous positions.
   */
  function applyIds(rows: readonly Row[], removed: readonly number[], appendFrom: number): void {
    let ids: RowId[] | null = null;
    if (removed.length) {
      ids = [...sourceIds]; // spread: slice() of a frozen array takes a slow generic path
      const removedIds = removed.map((p) => sourceIds[p] as RowId);
      for (let i = removed.length - 1; i >= 0; i--) ids.splice(removed[i] as number, 1);
      idIndex.remove(removed, removedIds);
      for (const id of removedIds) pendingRows.add(id);
    }
    if (appendFrom < rows.length) {
      ids ??= [...sourceIds];
      for (let i = appendFrom; i < rows.length; i++) {
        let id = getRowId(rows[i] as Row, i);
        if (typeof id !== 'string') id = String(id);
        if (!idIndex.append(id)) warn('row-id-duplicate', `Appended row id "${id}" already exists; lookups resolve to the first row.`);
        ids.push(id);
      }
    }
    if (ids) sourceIds = Object.freeze(ids);
    sourceRows = rows;
  }

  function markUpdated(id: RowId): void {
    pendingRows.add(id);
    pendingCells.set(id, true);
  }

  function applyPatch(event: Extract<DataSourceEvent<Row>, { type: 'patch' }>): RowDelta | null {
    const rows = event.rows;
    const oldCount = sourceRows.length;
    const removedSet = new Set<number>();
    for (const id of event.removed) {
      const at = idIndex.get(id);
      if (at === undefined) return resetIds(rows);
      removedSet.add(at);
    }
    const removed = [...removedSet].sort((a, b) => a - b);
    const appendFrom = oldCount - removed.length;
    if (rows.length !== appendFrom + event.added.length) return resetIds(rows);
    if (removed.length && idIndex.duplicates) return resetIds(rows);
    const updatedSet = new Set<number>();
    for (const id of event.updated) {
      const at = idIndex.get(id);
      if (at === undefined || removedSet.has(at)) return resetIds(rows);
      updatedSet.add(at);
    }
    const updated = [...updatedSet].sort((a, b) => a - b);
    if (removed.length + updated.length + event.added.length > deltaLimit(oldCount)) return resetIds(rows);
    if (dev) {
      // Contract check: updated rows keep their id at their (shifted) position.
      let ri = 0;
      for (const old of updated) {
        while (ri < removed.length && (removed[ri] as number) < old) ri++;
        const at = old - ri;
        if (getRowId(rows[at] as Row, at) !== sourceIds[old]) return resetIds(rows);
      }
    }
    applyIds(rows, removed, appendFrom);
    for (const id of event.updated) markUpdated(id);
    return createRowDelta(oldCount, rows.length, Int32Array.from(removed), Int32Array.from(updated));
  }

  /**
   * A local source's row reorder (after the write's own added, changed, and
   * deleted rows, applied as a patch first). The id array and index are
   * rewritten in the window between the first and the last touched position
   * only (plus one native copy of the id array), with no `getRowId` call
   * outside dev mode. The stages get a mapped delta (previous -> new index
   * map): the built-in incremental stages carry their previous result
   * through the map (one typed-array pass) and re-place only the moved
   * rows; other stages run in full.
   */
  function applyMove(rows: readonly Row[], move: LocalRowMove<Row>): RowDelta | null {
    let first: RowDelta | null = null;
    if (move.patched !== null && move.patch !== null) {
      const { updated, added, removed } = move.patch;
      first = applyPatch(Object.freeze({ type: 'patch' as const, rows: move.patched, updated, added, removed }));
    }
    const mid = sourceRows;
    const n = mid.length;
    const { positions, insertAt } = move;
    const k = positions.length;
    if (rows.length !== n || k === 0 || insertAt < 0 || insertAt + k > n) return resetIds(rows);
    if (new Set(positions).size < k || positions.some((p) => p < 0 || p >= n)) return resetIds(rows);
    // Consistency check (the source is ours, so one row): the first moved row landed where the move says.
    if (rows[insertAt] !== mid[positions[0] as number]) return resetIds(rows);
    const ids = movedCopy(sourceIds, positions, insertAt);
    idIndex.move(positions, insertAt);
    sourceIds = Object.freeze(ids);
    sourceRows = rows;
    if (stages.length === 0 || (move.patch !== null && first === null)) return null;
    const second = createMoveDelta(n, positions, insertAt);
    return first ? composeDeltas(first, second) : second;
  }

  /**
   * `setRows` with a new array: when it differs from the current one in a few
   * rows only (same-length replacements with unchanged ids, an appended tail,
   * or one removed block), the change is applied as a delta.
   */
  function applyReset(rows: readonly Row[]): RowDelta | null {
    const old = sourceRows;
    const n = old.length;
    const m = rows.length;
    if (n === 0 || stages.length === 0) return resetIds(rows);
    const limit = deltaLimit(n);
    const lim = Math.min(n, m);
    let p = 0;
    while (p < lim && rows[p] === old[p]) p++;
    const empty = new Int32Array(0);
    if (m === n) {
      const updated: number[] = [];
      for (let i = p; i < n; i++) {
        if (rows[i] === old[i]) continue;
        if (updated.length >= limit) return resetIds(rows);
        if (getRowId(rows[i] as Row, i) !== sourceIds[i]) return resetIds(rows);
        updated.push(i);
      }
      sourceRows = rows;
      for (const i of updated) markUpdated(sourceIds[i] as RowId);
      return createRowDelta(n, m, empty, Int32Array.from(updated));
    }
    if (m > n) {
      if (p !== n || m - n > limit) return resetIds(rows);
      applyIds(rows, [], n);
      return createRowDelta(n, m, empty, empty);
    }
    // m < n: one removed block [p, p + n - m) when the tails match.
    const k = n - m;
    if (k > limit || idIndex.duplicates) return resetIds(rows);
    for (let i = p; i < m; i++) if (rows[i] !== old[i + k]) return resetIds(rows);
    const removed: number[] = [];
    for (let i = p; i < p + k; i++) removed.push(i);
    applyIds(rows, removed, m);
    return createRowDelta(n, m, Int32Array.from(removed), empty);
  }

  // ------------------------------------------------------------------------
  // Snapshot
  // ------------------------------------------------------------------------

  const rowHeight = typeof options.rowHeight === 'number' ? options.rowHeight : (options.estimatedRowHeight ?? 36);
  const initialRows = Math.max(0, options.initialRows ?? 20);
  const initialColumns = Math.max(0, options.initialColumns ?? 20);
  const defaultColumnWidth = options.defaultColumnWidth ?? 160;

  function buildViewport(columns: ColumnSnapshot<Row>): ViewportSnapshot {
    const end = Math.min(model.count, initialRows);
    let totalWidth = 0;
    for (const col of columns.center) totalWidth += resolveColumnWidth(col.width) ?? defaultColumnWidth;
    return Object.freeze({
      scrollTop: 0,
      scrollLeft: 0,
      width: 0,
      height: 0,
      rows: Object.freeze({ start: 0, end, overscanStart: 0, overscanEnd: end, offsetTop: 0, totalHeight: model.count * rowHeight }),
      columns: Object.freeze({ start: 0, end: Math.min(columns.center.length, initialColumns), offsetLeft: 0, totalWidth }),
      segment: null,
    });
  }

  function getSnapshot(): DataGridSnapshot<Row> {
    if (!snapshotDirty && snapshot) return snapshot;
    snapshotDirty = false;
    const columns = getColumnSnapshot();
    runRows();
    if (modulesDirty) {
      modulesDirty = false;
      const record: Record<string, unknown> = {};
      for (const module of modules) if (module.inSnapshot !== false) record[module.name] = moduleStates.get(module.name);
      const prev = modulesRecord;
      const keys = Object.keys(record);
      const same = keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === record[k]);
      if (!same) modulesRecord = Object.freeze(record);
    }
    if (viewportDirty || !viewport) {
      viewportDirty = false;
      viewport = buildViewport(columns);
    }
    const prev = snapshot;
    if (
      prev &&
      prev.columns === columns &&
      prev.rows === model &&
      prev.data === data &&
      prev.query === query &&
      prev.modules === modulesRecord &&
      prev.direction === direction &&
      prev.locale === locale &&
      prev.viewport.rows.end === viewport.rows.end &&
      prev.viewport.rows.totalHeight === viewport.rows.totalHeight &&
      prev.viewport.columns.end === viewport.columns.end &&
      prev.viewport.columns.totalWidth === viewport.columns.totalWidth
    ) {
      viewport = prev.viewport;
      return prev;
    }
    if (counters) counters.snapshots++;
    snapshot = Object.freeze({
      version: (prev?.version ?? 0) + 1,
      columns,
      rows: model,
      viewport,
      data,
      query,
      direction,
      locale,
      modules: modulesRecord,
    });
    return snapshot;
  }

  // ------------------------------------------------------------------------
  // Fine-grained snapshots
  // ------------------------------------------------------------------------

  // Synthetic rows (group captions and footers) and view-owned rows (lazy group children).
  const viewRowCache = new Map<RowId, { snap: RowSnapshot<Row>; view: unknown }>();
  function getViewRowSnapshot(rowId: RowId): RowSnapshot<Row> | undefined {
    runRows();
    const view = model.view;
    const info = view?.resolve(rowId);
    if (!info) return undefined;
    const cached = viewRowCache.get(rowId);
    if (
      cached &&
      (cached.view === view ||
        (cached.snap.index === info.index && cached.snap.kind === info.kind && cached.snap.depth === info.depth && cached.snap.parentId === info.parentId && cached.snap.row === info.row))
    ) {
      cached.view = view;
      return cached.snap;
    }
    if (counters) counters.rowSnapshots++;
    const snap: RowSnapshot<Row> = Object.freeze({ id: rowId, kind: info.kind, row: (info.row ?? null) as Row | null, index: info.index, depth: info.depth, parentId: info.parentId });
    if (viewRowCache.size > ROW_CACHE_LIMIT) viewRowCache.clear();
    viewRowCache.set(rowId, { snap, view });
    return snap;
  }

  /** Row object by id: source rows first, then rows owned by the view (lazy groups). */
  function rowById(rowId: RowId): Row | undefined {
    const at = idIndex.get(rowId);
    if (at !== undefined) return sourceRows[at];
    if (!model.view) return undefined;
    runRows();
    const info = model.view?.resolve(rowId);
    return info && info.kind === 'data' ? (info.row as Row) : undefined;
  }

  function getRowSnapshot(rowId: RowId): RowSnapshot<Row> | undefined {
    const sourceIndex = idIndex.get(rowId);
    if (sourceIndex === undefined) return getViewRowSnapshot(rowId);
    const row = sourceRows[sourceIndex] as Row;
    const index = visibleIndexOfSource(sourceIndex);
    const cached = rowCache.get(rowId);
    const view = model.view;
    if (cached && cached.row === row && cached.index === index && (!view || cached.view === view)) return cached.snap;
    const depth = view && index >= 0 ? view.depthAt(index) : 0;
    const parentId = view ? view.parentOfSource(sourceIndex) : null;
    if (cached && cached.row === row && cached.index === index && cached.snap.depth === depth && cached.snap.parentId === parentId) {
      rowCache.set(rowId, { ...cached, view });
      return cached.snap;
    }
    if (counters) counters.rowSnapshots++;
    const snap: RowSnapshot<Row> = Object.freeze({ id: rowId, kind: 'data', row, index, depth, parentId });
    rowCache.set(rowId, { snap, row, index, view });
    return snap;
  }

  function getCellSnapshot(rowId: RowId, columnId: ColumnId): CellSnapshot | undefined {
    const row = rowById(rowId);
    if (row === undefined) return undefined;
    const column = getColumnSnapshot().byId.get(columnId);
    if (!column?.leaf) return undefined;
    let rowCells = cellCache.get(rowId);
    const cached = rowCells?.get(columnId);
    if (cached && cached.column === column) {
      if (cached.row === row) return cached.snap;
      // The row object was replaced (an edit commit, a patch): a cell whose
      // value and text did not change keeps its snapshot, so committing one
      // cell re-renders that cell only.
      const next = column.accessor(row);
      const prev = cached.snap.value;
      if (Object.is(next, prev) || (next instanceof Date && prev instanceof Date && next.getTime() === prev.getTime())) {
        if (column.formatter(next, row) === cached.snap.formattedValue) {
          (rowCells as Map<ColumnId, CellEntry<Row>>).set(columnId, { snap: cached.snap, row, column });
          return cached.snap;
        }
      }
    }
    if (counters) counters.cellSnapshots++;
    const value = column.accessor(row);
    const snap: CellSnapshot = Object.freeze({ rowId, columnId, value, formattedValue: column.formatter(value, row) });
    if (!rowCells) {
      rowCells = new Map();
      cellCache.set(rowId, rowCells);
    }
    rowCells.set(columnId, { snap, row, column });
    return snap;
  }

  /** Runtime freeze of a header: its zone for a visible leaf, else the definition `pinned` zone. */
  function headerFreeze(columns: ColumnSnapshot<Row>, column: CompiledColumn<Row>): 'left' | 'right' | null {
    const zone = column.leaf ? columns.zones.get(column.columnId) : undefined;
    return zone === 'left' || zone === 'right' ? zone : zone === undefined && column.freeze !== 'fixed' ? column.freeze : null;
  }

  function getHeaderSnapshot(columnId: ColumnId): HeaderSnapshot | undefined {
    const columns = getColumnSnapshot();
    const column = columns.byId.get(columnId);
    if (!column) return undefined;
    const state = moduleStates.get('columns') as ColumnsState;
    const visible = column.leaf ? isColumnVisible(column, state) : true;
    const cached = headerCache.get(columnId);
    const freeze = headerFreeze(columns, column);
    if (cached && cached.column === column && cached.visible === visible && cached.freeze === freeze) return cached.snap;
    const snap: HeaderSnapshot = Object.freeze({
      columnId,
      headerText: column.headerText,
      leaf: column.leaf,
      depth: column.depth,
      visible,
      freeze,
      flags: column.flags,
    });
    headerCache.set(columnId, { snap, column, visible, freeze });
    return snap;
  }

  // ------------------------------------------------------------------------
  // Notification
  // ------------------------------------------------------------------------

  function collectStructuralChanges(prev: DataGridSnapshot<Row> | null, next: DataGridSnapshot<Row>): void {
    const rowsChanged = !prev || prev.rows !== next.rows;
    const columnsChanged = !prev || prev.columns !== next.columns;
    if (rowsChanged) {
      for (const id of rowListeners.keys()) {
        if (pendingRows.has(id)) continue;
        const cached = rowCache.get(id);
        const at = idIndex.get(id);
        const row = at === undefined ? undefined : sourceRows[at];
        if (!cached || cached.row !== row || cached.index !== (at === undefined ? -2 : visibleIndexOfSource(at))) pendingRows.add(id);
      }
    }
    if (rowsChanged || columnsChanged) {
      for (const [id, cols] of cellListeners) {
        if (pendingCells.get(id) === true) continue;
        const at = idIndex.get(id);
        const row = at === undefined ? undefined : sourceRows[at];
        const rowCells = cellCache.get(id);
        for (const columnId of cols.keys()) {
          const cached = rowCells?.get(columnId);
          if (!cached || cached.row !== row || cached.column !== next.columns.byId.get(columnId)) {
            let set = pendingCells.get(id);
            if (set === undefined) {
              set = new Set();
              pendingCells.set(id, set);
            }
            if (set !== true) set.add(columnId);
          }
        }
      }
    }
    if (columnsChanged) {
      const state = moduleStates.get('columns') as ColumnsState;
      for (const id of headerListeners.keys()) {
        const cached = headerCache.get(id);
        const column = next.columns.byId.get(id);
        // Zone changes (pin/unpin, `frozenColumns` counts) re-notify too: `HeaderSnapshot.freeze` follows the zone.
        if (
          !cached ||
          cached.column !== column ||
          (column !== undefined && column.leaf && cached.visible !== isColumnVisible(column, state)) ||
          (column !== undefined && cached.freeze !== headerFreeze(next.columns, column))
        ) {
          pendingHeaders.add(id);
        }
      }
    }
  }

  function call(listener: () => void): void {
    if (counters) counters.notifications++;
    listener();
  }

  let lastNotified: DataGridSnapshot<Row> | null = null;

  function flush(): void {
    if (batchDepth > 0 || disposed) return;
    if (flushing) {
      flushAgain = true;
      return;
    }
    flushing = true;
    try {
      do {
        flushAgain = false;
        const snap = getSnapshot();
        if (snap !== lastNotified) {
          const prev = lastNotified;
          lastNotified = snap;
          collectStructuralChanges(prev, snap);
          for (const listener of listeners) call(listener);
          for (const sub of selectorSubs) {
            if (counters) counters.selectorEvaluations++;
            const value = sub.selector(snap);
            if (!sub.isEqual(sub.value, value)) {
              sub.value = value;
              if (counters) counters.notifications++;
              sub.listener(value);
            }
          }
        }
        if (pendingRows.size) {
          const ids = [...pendingRows];
          pendingRows.clear();
          for (const id of ids) rowListeners.get(id)?.forEach(call);
        }
        if (pendingCells.size) {
          const entries = [...pendingCells];
          pendingCells.clear();
          for (const [id, cols] of entries) {
            const byColumn = cellListeners.get(id);
            if (!byColumn) continue;
            if (cols === true) byColumn.forEach((set) => set.forEach(call));
            else for (const columnId of cols) byColumn.get(columnId)?.forEach(call);
          }
        }
        if (pendingHeaders.size) {
          const ids = [...pendingHeaders];
          pendingHeaders.clear();
          for (const id of ids) headerListeners.get(id)?.forEach(call);
        }
        if (pendingModules.size) {
          const names = [...pendingModules];
          pendingModules.clear();
          for (const name of names) moduleListeners.get(name)?.forEach(call);
        }
      } while (flushAgain || snapshotDirty);
    } finally {
      flushing = false;
    }
  }

  function addKeyed<K>(map: Map<K, Set<() => void>>, key: K, listener: () => void): () => void {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(listener);
    return () => {
      const current = map.get(key);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) map.delete(key);
    };
  }

  // ------------------------------------------------------------------------
  // Commands
  // ------------------------------------------------------------------------

  const ctx: ModuleContext<Row> = Object.freeze({
    getSnapshot,
    getModuleState: <T>(name: string) => moduleStates.get(name) as T | undefined,
    dispatch: (command: DataGridCommand) => dispatch(command),
    getColumns: getColumnSnapshot,
    getRows: () => {
      runRows();
      return model;
    },
    getStageInput: (name: PipelineStageName) => {
      if (!stageNames.has(name)) return undefined;
      getColumnSnapshot();
      runRows();
      return stageInputs.get(name);
    },
    getDataSource: () => moduleSource,
    isConnected: () => connected,
    getRow: (rowId: RowId) => rowById(rowId),
    // View-aware: group captions and footers are rows of the visible order (focus walks them).
    getRowIndex: (rowId: RowId) => engine.getRowIndex(rowId),
    getRowIdAt: (index: number) => engine.getRowIdAt(index),
    get timeZone() {
      return formatEnv.timeZone;
    },
    reject: (reason: string, state?: unknown): CommandRejection => {
      const r = Object.freeze(state === undefined ? { rejected: true as const, reason } : { rejected: true as const, reason, state });
      rejections.add(r);
      return r;
    },
    warn,
  });

  function applyModuleChange(module: AnyModule<Row>, previous: unknown, next: unknown): void {
    moduleStates.set(module.name, next);
    const scope = module.notify?.(previous as never, next as never, ctx);
    if (module.inSnapshot !== false) {
      modulesDirty = true;
      snapshotDirty = true;
    }
    if (module === columnsModule) {
      columnsDirty = true;
      snapshotDirty = true;
    }
    if (stageModules.has(module.name)) {
      rowsDirty = true;
      snapshotDirty = true;
    }
    if (scope) {
      if (scope.grid) snapshotDirty = true;
      for (const id of scope.rows ?? []) pendingRows.add(id);
      for (const id of scope.headers ?? []) pendingHeaders.add(id);
      if (scope.allRows) for (const id of rowListeners.keys()) pendingRows.add(id);
      if (scope.allHeaders) for (const id of headerListeners.keys()) pendingHeaders.add(id);
      for (const cell of scope.cells ?? []) {
        let set = pendingCells.get(cell.rowId);
        if (set === undefined) {
          set = new Set();
          pendingCells.set(cell.rowId, set);
        }
        if (set !== true) set.add(cell.columnId);
      }
    }
    pendingModules.add(module.name);
    if (queryModules.includes(module)) updateQuery();
    if (compiled && columnModules.includes(module)) reextendColumns();
  }

  /** A column-extending module's state changed: re-apply extensions (no recompile); keep the snapshot when nothing changed. */
  function reextendColumns(): void {
    const base = compiled as CompiledColumns<Row>;
    let leaves = base.leaves;
    for (const module of columnModules) leaves = module.extendColumns?.(leaves, ctx) ?? leaves;
    if (extended && shallowEqualArrays(leaves, extended.leaves)) return;
    applyColumnExtensions();
  }

  function dispatch(command: DataGridCommand): CommandResult {
    if (disposed) return rejected('disposed');
    if (typeof command !== 'object' || command === null || typeof command.type !== 'string' || !command.type.includes('.')) {
      warn('command-invalid', 'dispatch() received a value that is not a command ({ type: "<module>.<action>", ... }).');
      return rejected('invalidCommand');
    }
    const module = commandIndex.get(command.type);
    if (!module) {
      warn('command-unknown', `Unknown command "${command.type}"; no registered module declares it.`);
      return rejected('unknownCommand');
    }
    if (dev && !isJsonValue(command)) {
      warn('command-not-serializable', `Command "${command.type}" has a payload that is not JSON-serializable; pass ids and plain values only.`);
      return rejected('notSerializable');
    }
    if (counters) counters.commands++;
    let frozen: DataGridCommand | null = null;
    const frozenCommand = (): DataGridCommand => (frozen ??= freezeJsonCopy(command));
    if (beforeCommandListeners.size) {
      const event: BeforeCommandEvent = Object.freeze({ command: frozenCommand() });
      for (const listener of beforeCommandListeners) {
        const verdict = listener(event);
        if (verdict === false || typeof verdict === 'string') {
          const result = rejected(typeof verdict === 'string' ? verdict : 'cancelled');
          emitCommand(frozenCommand(), result);
          return result;
        }
      }
    }
    let result: CommandResult = APPLIED;
    batchDepth++;
    try {
      const previous = moduleStates.get(module.name);
      const next = module.reduce ? module.reduce(previous, command as never, ctx) : previous;
      if (typeof next === 'object' && next !== null && rejections.has(next)) {
        result = rejected((next as CommandRejection).reason);
        const partial = (next as CommandRejection).state;
        if (partial !== undefined && partial !== previous) applyModuleChange(module, previous, partial);
      } else if (next !== previous) {
        applyModuleChange(module, previous, next);
      }
    } finally {
      batchDepth--;
    }
    if (result === APPLIED && commandLog) commandLog.push(frozenCommand());
    flush();
    emitCommand(commandListeners.size ? frozenCommand() : command, result);
    return result;
  }

  function emitCommand(command: DataGridCommand, result: CommandResult): void {
    if (!commandListeners.size) return;
    const event: CommandEvent = Object.freeze({ command, result, version: getSnapshot().version });
    for (const listener of commandListeners) listener(event);
  }

  // ------------------------------------------------------------------------
  // Public object
  // ------------------------------------------------------------------------

  const engine: DataGridEngine<Row> = {
    id: gridId,
    getSnapshot,
    getServerSnapshot: () => serverSnapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    select: (selector) => selector(getSnapshot()),
    subscribeSelector<T>(
      selector: (snapshot: DataGridSnapshot<Row>) => T,
      listener: (value: T) => void,
      isEqual: (a: T, b: T) => boolean = Object.is,
    ) {
      if (counters) counters.selectorEvaluations++;
      const sub: SelectorSubscription<Row> = {
        selector,
        listener: listener as (value: unknown) => void,
        isEqual: isEqual as (a: unknown, b: unknown) => boolean,
        value: selector(getSnapshot()),
      };
      selectorSubs.add(sub);
      return () => {
        selectorSubs.delete(sub);
      };
    },
    subscribeCell(rowId, columnId, listener) {
      let byColumn = cellListeners.get(rowId);
      if (!byColumn) {
        byColumn = new Map();
        cellListeners.set(rowId, byColumn);
      }
      const unsubscribe = addKeyed(byColumn, columnId, listener);
      return () => {
        unsubscribe();
        if (cellListeners.get(rowId)?.size === 0) cellListeners.delete(rowId);
      };
    },
    subscribeRow: (rowId, listener) => addKeyed(rowListeners, rowId, listener),
    subscribeHeader: (columnId, listener) => addKeyed(headerListeners, columnId, listener),
    subscribeModule: (name, listener) => addKeyed(moduleListeners, name, listener),
    getCellSnapshot,
    getRowSnapshot,
    getHeaderSnapshot,
    getModuleState: <T>(name: string) => moduleStates.get(name) as T | undefined,
    getSelector: (moduleName, selectorName) => modules.find((m) => m.name === moduleName)?.selectors?.[selectorName],
    getRow: rowById,
    getRowIndex(rowId) {
      const at = idIndex.get(rowId);
      if (at === undefined) return getViewRowSnapshot(rowId)?.index ?? -1;
      return visibleIndexOfSource(at);
    },
    getRowAt(index) {
      runRows();
      if (model.view) {
        const at = model.view.sourceIndexAt(index);
        if (at >= 0) return model.source[at];
        const id = model.view.idAt(index);
        return id === undefined ? undefined : rowById(id);
      }
      const at = getSourceIndex(model, index);
      return at < 0 ? undefined : model.source[at];
    },
    getRowIdAt(index) {
      runRows();
      if (model.view) return model.view.idAt(index);
      const at = getSourceIndex(model, index);
      return at < 0 ? undefined : model.sourceIds[at];
    },
    getCellValue(rowId, columnId) {
      const row = rowById(rowId);
      const column = getColumnSnapshot().byId.get(columnId);
      if (row === undefined || !column) return undefined;
      return column.lookup ? column.lookup.rawValue(row) : column.accessor(row);
    },
    getDataSource: () => source,
    setColumns(columns) {
      if (disposed || columns === columnDefs) return;
      columnDefs = columns;
      if (compileDefs(columns)) flush();
    },
    setLocale(next) {
      if (disposed) return false;
      const nextLocale = next.locale ?? locale;
      const nextCurrency = next.currency ?? formatEnv.currency;
      const nextTimeZone = 'timeZone' in next ? next.timeZone : formatEnv.timeZone;
      const nextDirection = next.direction === 'rtl' || next.direction === 'ltr' ? next.direction : direction;
      const formatChanged = nextLocale !== locale || nextCurrency !== formatEnv.currency || nextTimeZone !== formatEnv.timeZone;
      if (!formatChanged && nextDirection === direction) return false;
      batchDepth++;
      try {
        if (nextDirection !== direction) {
          direction = nextDirection;
          snapshotDirty = true;
          if (commandIndex.has('focus.setDirection')) dispatch({ type: 'focus.setDirection', direction } as DataGridCommand);
        }
        if (formatChanged) {
          locale = nextLocale;
          formatEnv.currency = nextCurrency;
          formatEnv.timeZone = nextTimeZone;
          // Formatters and collators are compiled per locale: drop them and
          // recompile every definition once (the rows are not re-read; the
          // pipeline re-runs because the compiled leaves changed).
          formatEnv.cache.clear();
          compileDefs(columnDefs, false);
          snapshotDirty = true;
        }
      } finally {
        batchDepth--;
      }
      flush();
      return true;
    },
    dispatch,
    hasCommand: (type: string) => commandIndex.has(type),
    batch(run) {
      batchDepth++;
      try {
        run();
      } finally {
        batchDepth--;
        if (batchDepth === 0) flush();
      }
    },
    onBeforeCommand(listener) {
      beforeCommandListeners.add(listener);
      return () => {
        beforeCommandListeners.delete(listener);
      };
    },
    onCommand(listener) {
      commandListeners.add(listener);
      return () => {
        commandListeners.delete(listener);
      };
    },
    getCommandLog: () => Object.freeze(commandLog ? commandLog.slice() : []),
    getInstrumentation() {
      if (!counters) return null;
      return Object.freeze({
        ...counters,
        stageRuns: Object.freeze({ ...counters.stageRuns }),
        stageUpdates: Object.freeze({ ...counters.stageUpdates }),
      }) as DataGridInstrumentation;
    },
    connect() {
      if (disposed || connected) return noop;
      connected = true;
      unsubscribeSource = source.subscribe?.(onSourceEvent);
      for (const issue of gatedReads.splice(0)) issue();
      for (const module of modules) module.onConnect?.(ctx);
      const rows = snapshotRowsOf(source);
      if (readPending) {
        readPending = false;
        requestData();
        flush();
      } else if (rows && rows !== sourceRows) {
        // Changed while disconnected: catch up as one reset.
        onSourceEvent(Object.freeze({ type: 'reset' as const, rows }));
      }
      return () => {
        if (!connected || disposed) return;
        connected = false;
        unsubscribeSource?.();
        unsubscribeSource = undefined;
        if (inFlight) {
          // Aborted requests are re-issued on the next connect.
          inFlight.controller.abort();
          inFlight = null;
          lastRequestKey = null;
          readPending = true;
        }
      };
    },
    reload() {
      // Retry after a data error: re-issues the read even when the query is unchanged.
      if (disposed) return;
      lastRequestKey = null;
      requestData();
      flush();
    },
    refresh() {
      // re-read with the current query, keep every module state.
      if (disposed) return;
      // Rows mutated in place keep their identity: drop the snapshot caches so every rendered cell re-reads.
      rowCache.clear();
      cellCache.clear();
      // Sort, filter, and search keys are cached by the rows array identity.
      forgetColumnKeys(sourceRows);
      source.invalidate?.('all');
      // An identical read in flight is re-issued (it may predate the change being refreshed).
      if (inFlight) {
        inFlight.controller.abort();
        inFlight = null;
      }
      lastRequestKey = null;
      requestData();
      snapshotDirty = true;
      flush();
    },
    get disposed() {
      return disposed;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      inFlight?.controller.abort();
      inFlight = null;
      unsubscribeSource?.();
      for (let i = modules.length - 1; i >= 0; i--) modules[i]?.dispose?.();
      listeners.clear();
      selectorSubs.clear();
      rowListeners.clear();
      cellListeners.clear();
      headerListeners.clear();
      moduleListeners.clear();
      beforeCommandListeners.clear();
      commandListeners.clear();
      rowCache.clear();
      cellCache.clear();
      headerCache.clear();
    },
  };

  // Reserved names: a module may not shadow an engine member.
  for (const module of modules) {
    if (module.name in engine) throw new Error(`DataGrid module name "${module.name}" collides with an engine member.`);
  }
  const facade: Record<string, Record<string, (...args: any[]) => unknown>> = {};
  for (const module of modules) {
    const methods: Record<string, (...args: any[]) => unknown> = {};
    for (const type of module.commands as readonly string[]) {
      const action = type.slice(module.name.length + 1);
      methods[action] = (payload?: Record<string, unknown>) => dispatch({ ...payload, type } as DataGridCommand);
    }
    const reads = (module.methods ?? {}) as ModuleMethods<Row>;
    for (const name of Object.keys(reads)) {
      if (name in methods) throw new Error(`DataGrid module "${module.name}" declares method "${name}", which collides with the command "${module.name}.${name}".`);
      const read = reads[name] as (ctx: ModuleContext<Row>, ...args: unknown[]) => unknown;
      methods[name] = (...args: unknown[]) => read(ctx, ...args);
    }
    facade[module.name] = Object.freeze(methods);
  }
  Object.assign(engine, facade);

  // --- initial load -------------------------------------------------------
  updateQueryInitial();
  if (connected) {
    unsubscribeSource = source.subscribe?.(onSourceEvent);
    requestData();
  } else {
    // Deferred: a pure local snapshot is read now, so the server and the first
    // client render show its rows. Remote and live reads are requested through
    // the gate (loading state, lazy group roots) and reach the source on
    // connect; other local sources (offline loads) are read on connect.
    const rows = snapshotRowsOf(source);
    if (rows) {
      const version = ++requestVersion;
      applyResult({ version, rows, totalRowCount: rows.length }, version);
    } else {
      requestData();
    }
  }
  compileDefs(columnDefs);
  if (!remote && dev && activeQueryParts(query).length) onQueryChanged();
  const serverSnapshot = getSnapshot();
  lastNotified = serverSnapshot;

  function updateQueryInitial(): void {
    let q = baseQuery;
    for (const module of queryModules) {
      const state = moduleStates.get(module.name);
      const output = module.extendQuery?.(q, state) ?? q;
      queryMemo.set(module.name, { input: q, state, output });
      q = output;
    }
    query = q;
  }

  return Object.freeze(engine) as DataGridEngineWithModules<Row, Modules>;
}
