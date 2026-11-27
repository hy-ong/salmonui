// Hierarchy grid model. A child grid is a separate engine
// rendered inside its parent's detail row; this module describes it: the
// relation, the scoped child data source, and complete child options
// (nested levels included). Descriptors are created on demand, so expanding
// every parent creates only the descriptors the renderer asks for.

import { visibleRowOf } from './expansion.js';
import { defineDataGridModule } from './engine.js';
import { createLocalDataSource } from './local-data-source.js';
import type {
  ColumnDef,
  DataSourceEvent,
  DataSourceRequest,
  DataSourceResult,
  FilterDescriptor,
  DataSource,
  DataGridModule,
  DataGridOptions,
  Json,
  ModuleContext,
  RowId,
  WriteRequest,
} from './types.js';

/** The parent row a child grid belongs to. */
export interface ChildGridParent<Row = unknown> {
  readonly rowId: RowId;
  readonly row: Row;
  readonly depth: number;
}

/**
 * One child grid level. `Child` is the child row type, `Parent` the row type
 * of the grid it nests in, and `Nested` the row type of the next level
 * (`childGrid`).
 */
export interface ChildGridConfig<Child = unknown, Parent = unknown, Nested = unknown> {
  /** Field present in both parent and child rows. */
  readonly relationField?: string;
  /** Parent field whose value selects the children. Default `relationField`. */
  readonly parentField?: string;
  /** Child field compared with the parent value. Default `relationField`. */
  readonly childField?: string;
  /**
   * Child rows: one array shared by every parent (indexed once by relation
   * key), a data source (local sources are indexed, remote and live sources
   * receive the relation filter), or a factory per parent.
   */
  readonly data: readonly Child[] | DataSource<Child> | ((parent: ChildGridParent<Parent>) => readonly Child[] | DataSource<Child>);
  /** Default: the value of the child column marked `primaryKey`, as a string. */
  readonly getRowId?: (row: Child, index: number) => RowId;
  readonly columns?: readonly ColumnDef<Child>[];
  /** Further child grid options (modules are the renderer's). */
  readonly options?: Partial<DataGridOptions<Child>>;
  /** Next nesting level. */
  readonly childGrid?: ChildGridConfig<Nested, Child>;
}

/** `options.hierarchy`: `Child` is the first-level child row type, `Row` the grid's row type. */
export interface HierarchyOptions<Child = unknown, Row = unknown, Nested = unknown> {
  readonly childGrid?: ChildGridConfig<Child, Row, Nested>;
  /** Nesting depth of this grid (0 for the root). Set on child options. */
  readonly depth?: number;
}

export interface ChildRelation {
  readonly parentField: string;
  readonly childField: string;
  /** Parent value (raw). */
  readonly value: unknown;
}

export interface ChildGridDescriptor<Child = unknown> {
  /** `<parent grid id>/<parent row id>`. */
  readonly id: string;
  readonly parentRowId: RowId;
  /** Depth of the child grid (1 for children of the root). */
  readonly depth: number;
  readonly relation: ChildRelation;
  /** The relation condition the scoped source applies. */
  readonly filter: FilterDescriptor;
  readonly dataSource: DataSource<Child>;
  /** Complete options for the child engine, without modules. */
  readonly options: DataGridOptions<Child>;
}

export interface HierarchyState {
  readonly enabled: boolean;
  readonly depth: number;
}

export type HierarchyMethods<Row> = {
  /** Child grid of a visible parent row; stable identity while the parent row object is unchanged. */
  getChildGrid(ctx: ModuleContext<Row>, parentRowId: RowId): ChildGridDescriptor | undefined;
  /**
   * Child grid of any parent row, visible or not (export and print of every
   * page, `hierarchy: 'all'`). Not cached: the caller owns the descriptor.
   */
  describeChildGrid(ctx: ModuleContext<Row>, parentRowId: RowId, row: Row): ChildGridDescriptor | undefined;
};

export type HierarchyModule<Row> = DataGridModule<Row, HierarchyState, never, 'hierarchy', HierarchyMethods<Row>>;

// ---------------------------------------------------------------------------
// Values and keys
// ---------------------------------------------------------------------------

/** Reads a dot path (`customer.id`). */
export function readField(row: unknown, path: string): unknown {
  if (row === null || typeof row !== 'object') return undefined;
  if (!path.includes('.')) return (row as Record<string, unknown>)[path];
  let v: unknown = row;
  for (const part of path.split('.')) {
    if (v === null || typeof v !== 'object') return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}

function writeField<T>(row: T, path: string, value: unknown): T {
  const parts = path.split('.');
  const set = (obj: unknown, i: number): unknown => {
    const base = obj !== null && typeof obj === 'object' ? (obj as Record<string, unknown>) : {};
    const key = parts[i] as string;
    return { ...base, [key]: i === parts.length - 1 ? value : set(base[key], i + 1) };
  };
  return set(row, 0) as T;
}

/** Index key of a relation value (dates by instant, numbers and strings distinct). */
function relationKey(value: unknown): string {
  if (value instanceof Date) return `d:${value.getTime()}`;
  if (value === null || value === undefined) return 'n:';
  return `${typeof value}:${String(value)}`;
}

/** JSON form of a relation value for the filter descriptor. */
function relationJson(value: unknown): Json {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return String(value);
}

/** Primitive values key the map directly (Map keeps 1 and '1' apart); dates key a separate map by instant. */
interface ChildIndex {
  readonly values: Map<unknown, unknown[]>;
  readonly dates: Map<number, unknown[]>;
}

const buckets = new WeakMap<object, Map<string, ChildIndex>>();
const EMPTY_ROWS: readonly never[] = Object.freeze([]);

function bucketOf(index: ChildIndex, value: unknown): unknown[] | undefined {
  if (value instanceof Date) return index.dates.get(value.getTime());
  return index.values.get(value === undefined ? null : value);
}

/** Children of one relation value, from an index built once per (rows identity, field). */
export function childRowsOf<Child>(rows: readonly Child[], childField: string, value: unknown): readonly Child[] {
  let byField = buckets.get(rows);
  if (!byField) {
    byField = new Map();
    buckets.set(rows, byField);
  }
  let index = byField.get(childField);
  if (!index) {
    const values = new Map<unknown, unknown[]>();
    const dates = new Map<number, unknown[]>();
    const nested = childField.includes('.');
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Child;
      let v = nested ? readField(row, childField) : (row as Record<string, unknown>)[childField];
      let map: Map<unknown, unknown[]> = values;
      if (v instanceof Date) {
        map = dates as Map<unknown, unknown[]>;
        v = v.getTime();
      } else if (v === undefined) v = null;
      const list = map.get(v);
      if (list) list.push(row);
      else map.set(v, [row]);
    }
    index = { values, dates };
    byField.set(childField, index);
  }
  return (bucketOf(index, value) as Child[] | undefined) ?? EMPTY_ROWS;
}

// ---------------------------------------------------------------------------
// Scoped child data source
// ---------------------------------------------------------------------------

export interface ChildScope {
  readonly childField: string;
  readonly value: unknown;
  /** Required for array sources that are written to. */
  readonly getRowId?: (row: never, index: number) => RowId;
}

/** The relation condition (`childField equal value`). */
export function childRelationFilter(scope: ChildScope): FilterDescriptor {
  return Object.freeze({ columnId: scope.childField, operator: 'equal', value: relationJson(scope.value), predicate: 'and', source: 'api' });
}

const arraySources = new WeakMap<object, Map<string, DataSource<unknown>>>();

/**
 * Data source of one child grid. Arrays and local sources are indexed by
 * relation key once per rows identity and read in O(1) per child grid;
 * remote and live sources receive the relation filter ANDed before the
 * child grid's own filters. Added rows get the relation value when missing.
 */
export function createChildDataSource<Child>(source: readonly Child[] | DataSource<Child>, scope: ChildScope): DataSource<Child> {
  const getRowId = scope.getRowId as ((row: Child, index: number) => RowId) | undefined;
  if (Array.isArray(source)) {
    const rows = source as readonly Child[];
    let byKey = arraySources.get(rows);
    if (!byKey) arraySources.set(rows, (byKey = new Map()));
    const key = `${scope.childField}\u0000${relationKey(scope.value)}`;
    let hit = byKey.get(key) as DataSource<Child> | undefined;
    if (!hit) {
      hit = createLocalDataSource<Child>(childRowsOf(rows, scope.childField, scope.value), getRowId ? { getRowId } : {});
      byKey.set(key, hit as DataSource<unknown>);
    }
    return hit;
  }
  const inner = source as DataSource<Child>;
  const filter = childRelationFilter(scope);
  const stamp = (row: Child): Child => (readField(row, scope.childField) === undefined ? writeField(row, scope.childField, scope.value) : row);
  const write = inner.write
    ? (request: WriteRequest<Child>) =>
        (inner.write as (r: WriteRequest<Child>) => ReturnType<NonNullable<DataSource<Child>['write']>>)(
          request.added.length ? { ...request, added: request.added.map((a) => ({ tempId: a.tempId, row: stamp(a.row) })) } : request,
        )
    : undefined;
  if (inner.mode === 'remote') {
    const scoped: DataSource<Child> = {
      mode: 'remote',
      ...(inner.capabilities ? { capabilities: inner.capabilities } : {}),
      read(request: DataSourceRequest) {
        const query = request.query;
        return inner.read({ ...request, query: Object.freeze({ ...query, filters: Object.freeze([filter, ...query.filters]) }) });
      },
      ...(write ? { write } : {}),
      ...(inner.subscribe ? { subscribe: inner.subscribe.bind(inner) } : {}),
    };
    return scoped;
  }
  // Local and live: the source holds every row; read the bucket.
  const bucket = (rows: readonly Child[]): readonly Child[] => childRowsOf(rows, scope.childField, scope.value);
  const scoped: DataSource<Child> = {
    mode: inner.mode,
    ...(inner.capabilities ? { capabilities: inner.capabilities } : {}),
    read(request: DataSourceRequest) {
      const result = inner.read(request);
      const map = (r: DataSourceResult<Child>): DataSourceResult<Child> => {
        const rows = bucket(r.rows);
        return { ...r, rows, totalRowCount: rows.length };
      };
      return typeof (result as Promise<unknown>).then === 'function' ? (result as Promise<DataSourceResult<Child>>).then(map) : map(result as DataSourceResult<Child>);
    },
    ...(write ? { write } : {}),
    ...(inner.subscribe
      ? {
          subscribe(listener: (event: DataSourceEvent<Child>) => void) {
            let last: readonly Child[] | null = null;
            return (inner.subscribe as NonNullable<DataSource<Child>['subscribe']>)((event) => {
              const rows = bucket(event.rows);
              if (rows === last) return;
              last = rows;
              listener(Object.freeze({ type: 'reset', rows, totalRowCount: rows.length }));
            });
          },
        }
      : {}),
  };
  return scoped;
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

function relationOf(config: ChildGridConfig): { parentField: string; childField: string } {
  const parentField = config.parentField ?? config.relationField;
  const childField = config.childField ?? config.relationField;
  if (!parentField || !childField) throw new Error('hierarchy.childGrid: set relationField, or parentField and childField.');
  return { parentField, childField };
}

function childRowIdGetter<Child>(config: ChildGridConfig<Child>): (row: Child, index: number) => RowId {
  if (config.getRowId) return config.getRowId;
  const key = (config.columns ?? []).find((c) => c.primaryKey);
  const field = key?.field ?? key?.id;
  if (!field) throw new Error('hierarchy.childGrid: set getRowId or mark a child column primaryKey (index ids are never generated).');
  return (row) => String(readField(row, field));
}

/**
 * Creates the `hierarchy` module (requires `detail`). Options are read from
 * `options.hierarchy` (`HierarchyOptions`).
 */
export function createHierarchyModule<Row>(): HierarchyModule<Row> {
  let config: ChildGridConfig | null = null;
  let relation: { parentField: string; childField: string } | null = null;
  let childRowId: ((row: unknown, index: number) => RowId) | null = null;
  let gridId = 'grid';
  let inherited: Partial<DataGridOptions<unknown>> = {};
  const cache = new Map<RowId, { row: unknown; descriptor: ChildGridDescriptor }>();

  const describe = (ctx: ModuleContext<Row>, parentRowId: RowId, row: Row): ChildGridDescriptor | undefined => {
    const state = ctx.getModuleState<HierarchyState>('hierarchy') as HierarchyState;
    if (!config || !relation || !childRowId || !state.enabled) return undefined;
    const depth = state.depth + 1;
    const value = readField(row, relation.parentField);
    const raw = typeof config.data === 'function' ? config.data({ rowId: parentRowId, row, depth }) : config.data;
    const scope: ChildScope = { childField: relation.childField, value, getRowId: childRowId as (row: never, index: number) => RowId };
    const dataSource = createChildDataSource(raw as readonly unknown[] | DataSource<unknown>, scope);
    const id = `${gridId}/${parentRowId}`;
    const nested = config.childGrid;
    const options: DataGridOptions<unknown> = Object.freeze({
      ...inherited,
      ...(config.options as Partial<DataGridOptions<unknown>> | undefined),
      id,
      getRowId: childRowId,
      columns: (config.columns ?? []) as readonly ColumnDef<unknown>[],
      dataSource,
      ...(nested ? { hierarchy: Object.freeze({ childGrid: nested, depth }) } : {}),
    });
    const descriptor: ChildGridDescriptor = Object.freeze({
      id,
      parentRowId,
      depth,
      relation: Object.freeze({ parentField: relation.parentField, childField: relation.childField, value }),
      filter: childRelationFilter(scope),
      dataSource,
      options,
    });
    return descriptor;
  };

  const methods: HierarchyMethods<Row> = {
    getChildGrid(ctx, parentRowId) {
      const row = visibleRowOf(ctx, parentRowId);
      if (row === undefined) return undefined;
      const hit = cache.get(parentRowId);
      if (hit && hit.row === row) return hit.descriptor;
      const descriptor = describe(ctx, parentRowId, row);
      if (!descriptor) return undefined;
      if (cache.size > 4096) cache.clear();
      cache.set(parentRowId, { row, descriptor });
      return descriptor;
    },
    describeChildGrid: describe,
  };

  return defineDataGridModule<Row, HierarchyState, never, 'hierarchy', HierarchyMethods<Row>>({
    name: 'hierarchy',
    dependencies: ['detail'],
    inSnapshot: false,
    commands: [],
    initialState(options: DataGridOptions<Row>): HierarchyState {
      const o = (options['hierarchy'] ?? {}) as HierarchyOptions;
      config = o.childGrid ?? null;
      relation = config ? relationOf(config) : null;
      childRowId = config ? (childRowIdGetter(config) as (row: unknown, index: number) => RowId) : null;
      gridId = options.id ?? 'grid';
      // Child grids inherit locale, direction, time zone, and currency.
      const pick: Record<string, unknown> = {};
      for (const key of ['locale', 'direction', 'timeZone', 'currency', 'dev', 'onWarning'] as const) if (options[key] !== undefined) pick[key] = options[key];
      inherited = pick as Partial<DataGridOptions<unknown>>;
      return Object.freeze({ enabled: config !== null, depth: typeof o.depth === 'number' && o.depth >= 0 ? Math.floor(o.depth) : 0 });
    },
    methods,
    dispose() {
      cache.clear();
    },
  });
}
