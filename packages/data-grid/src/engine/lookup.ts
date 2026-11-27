// Lookup (foreign-key) columns. A lookup column holds a value; the grid
// shows, sorts, filters, searches, and groups by the display value found in
// a lookup table. The module rewrites each lookup column at
// `extendColumns` time so that its accessor returns the display value: every
// query path then works on display values through the shared dictionary-
// encoded column keys (keys.ts), so the lookup runs once per row while keys
// are built for a data identity and never on a sort, filter keystroke, or
// group change. Remote lookups are requested by key, batched per microtask;
// when rows arrive the table version changes, the module state changes, and
// the engine re-applies `extendColumns` (a new accessor identity rebuilds
// only that column's keys).

import { createAbortController, isPromiseLike, type AbortControllerLike } from './abort.js';
import { createFieldAccessor } from './columns.js';
import { defineDataGridModule } from './engine.js';
import type { AbortSignalLike, ColumnId, ColumnType, CompiledColumn, DataGridModule, Json, ModuleContext } from './types.js';

export interface LookupRequest {
  /** Keys the grid needs (deduplicated, never already requested). A lookup may return more rows. */
  readonly keys: readonly Json[];
  readonly keyField: string;
  readonly displayField: string;
  readonly signal: AbortSignalLike;
}

/** Remote (or computed) lookup. `@salmonui/data` ships cached implementations (`createLookup`, `createJsonLookup`). */
export interface LookupSource {
  load(request: LookupRequest): readonly unknown[] | Promise<readonly unknown[]>;
}

/**
 * `column.lookup`: the cell holds a value matched against `keyField` of the
 * lookup rows; the grid shows, sorts, filters, searches, and groups by
 * `displayField`.
 */
export interface ColumnLookup {
  /** Lookup rows, or a source that loads them by value (`@salmonui/data` `createLookup`, `createJsonLookup`). */
  readonly data: readonly unknown[] | LookupSource;
  /** Field of the lookup rows matched against the cell value. Default: the column `field`. Dot paths allowed. */
  readonly keyField?: string;
  /** Field of the lookup rows displayed. Dot paths allowed. */
  readonly displayField: string;
}

/** `column.lookup` with defaults applied (`columnLookup`). */
export interface ResolvedLookup {
  readonly data: readonly unknown[] | LookupSource;
  readonly keyField: string;
  readonly displayField: string;
}

export type LookupStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface ColumnLookupStatus {
  readonly status: LookupStatus;
  /** Error message of the last failed load, or null. */
  readonly error: string | null;
  /** Keys resolved so far. */
  readonly size: number;
}

/** `CompiledColumn.lookup` of a lookup column (filled by the `lookup` module). */
export interface CompiledLookup {
  readonly keyField: string;
  readonly displayField: string;
  /** Display value type: inferred from local lookup rows, `'string'` for remote lookups. */
  readonly type: ColumnType;
  readonly data: readonly unknown[] | LookupSource;
  /** Raw key of a row (the column's original accessor). `engine.getCellValue` returns this. */
  rawValue(row: unknown): unknown;
  /** Display value of a key, or null when unknown (remote: may queue a load). */
  display(key: unknown): unknown;
}

export interface LookupState {
  /** Bumped whenever a lookup table or status changes. */
  readonly version: number;
  readonly columns: Readonly<Record<ColumnId, ColumnLookupStatus>>;
}

export type LookupReloadCommand = { type: 'lookup.reload'; columnId?: ColumnId };
/** A lookup load settled (dispatched by the engine; part of the public command union). */
export type LookupLoadedCommand = { type: 'lookup.loaded'; version: number; columns: Record<ColumnId, { status: LookupStatus; error: string | null; size: number }> };
export type LookupCommand = LookupReloadCommand | LookupLoadedCommand;

export type LookupMethods<Row> = {
  /** Lookup columns (instance `getLookupColumns()`), in definition order. */
  getColumns(ctx: ModuleContext<Row>): readonly CompiledColumn<Row>[];
  /** Load status of a lookup column. */
  getStatus(ctx: ModuleContext<Row>, columnId: ColumnId): ColumnLookupStatus | undefined;
  /** Display value of a key in a column's lookup (null when unknown). */
  getDisplayValue(ctx: ModuleContext<Row>, columnId: ColumnId, key: unknown): unknown;
  /** Lookup rows loaded for a column (dropdown editor options). */
  getLookupRows(ctx: ModuleContext<Row>, columnId: ColumnId): readonly unknown[];
};

export type LookupModule<Row> = DataGridModule<Row, LookupState, LookupCommand, 'lookup', LookupMethods<Row>>;

interface Table {
  readonly source: readonly unknown[] | LookupSource;
  readonly keyField: string;
  readonly displayField: string;
  readonly remote: boolean;
  readonly readKey: (row: unknown) => unknown;
  readonly readValue: (row: unknown) => unknown;
  map: Map<unknown, unknown>;
  strMap: Map<string, unknown>;
  rows: unknown[];
  version: number;
  status: LookupStatus;
  error: string | null;
  requested: Set<unknown>;
  pending: unknown[];
  scheduled: boolean;
  inFlight: number;
  controllers: Set<AbortControllerLike>;
}

const EMPTY: readonly never[] = Object.freeze([]);

function normalizeKey(key: unknown): unknown {
  return key instanceof Date ? key.getTime() : key;
}

function addRows(table: Table, rows: readonly unknown[]): void {
  for (const row of rows) {
    if (row == null) continue;
    const key = normalizeKey(table.readKey(row));
    if (key == null || table.map.has(key)) continue;
    const value = table.readValue(row);
    const display = value === undefined ? null : value;
    table.map.set(key, display);
    const text = String(key);
    if (!table.strMap.has(text)) table.strMap.set(text, display);
    table.rows.push(row);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Lookup columns (`column.lookup`). Display values come from the
 * lookup; sort, filter, search, facets, and grouping use them. Remote
 * lookups load by key, batched per microtask.
 */
export function createLookupModule<Row>(): LookupModule<Row> {
  // Tables per lookup source and field pair; shared by columns using the same lookup.
  const tables = new Map<readonly unknown[] | LookupSource, Map<string, Table>>();
  const byColumn = new Map<ColumnId, Table>();
  const extendedCache = new WeakMap<CompiledColumn<Row>, { readonly version: number; readonly table: Table; readonly column: CompiledColumn<Row> }>();
  let host: ModuleContext<Row> | null = null;
  let version = 0;
  let notifyQueued = false;
  let disposed = false;

  function statuses(): Record<ColumnId, { status: LookupStatus; error: string | null; size: number }> {
    const out: Record<ColumnId, { status: LookupStatus; error: string | null; size: number }> = {};
    for (const [columnId, table] of byColumn) out[columnId] = { status: table.status, error: table.error, size: table.map.size };
    return out;
  }

  function changed(): void {
    version++;
    if (notifyQueued || disposed) return;
    notifyQueued = true;
    void Promise.resolve().then(() => {
      notifyQueued = false;
      if (disposed || !host) return;
      host.dispatch({ type: 'lookup.loaded', version, columns: statuses() });
    });
  }

  function tableFor(settings: ResolvedLookup): Table {
    const source = settings.data;
    let byFields = tables.get(source);
    if (!byFields) {
      byFields = new Map();
      tables.set(source, byFields);
    }
    const fieldsKey = `${settings.keyField}\u0000${settings.displayField}`;
    let table = byFields.get(fieldsKey);
    if (!table) {
      const remote = !Array.isArray(source);
      table = {
        source,
        keyField: settings.keyField,
        displayField: settings.displayField,
        remote,
        readKey: createFieldAccessor<unknown>(settings.keyField),
        readValue: createFieldAccessor<unknown>(settings.displayField),
        map: new Map(),
        strMap: new Map(),
        rows: [],
        version: 0,
        status: remote ? 'idle' : 'ready',
        error: null,
        requested: new Set(),
        pending: [],
        scheduled: false,
        inFlight: 0,
        controllers: new Set(),
      };
      if (!remote) addRows(table, source as readonly unknown[]);
      byFields.set(fieldsKey, table);
    }
    return table;
  }

  /** Tables with keys queued while the engine was not connected (render-time reads never start loads). */
  const held = new Set<Table>();

  function schedule(table: Table): void {
    if (table.scheduled) return;
    if (host?.isConnected?.() === false) {
      held.add(table);
      return;
    }
    table.scheduled = true;
    void Promise.resolve().then(() => flush(table));
  }

  function request(table: Table, key: unknown): void {
    if (table.requested.has(key) || disposed) return;
    table.requested.add(key);
    table.pending.push(key);
    schedule(table);
  }

  function settle(table: Table, controller: AbortControllerLike, keys: readonly unknown[], rows: readonly unknown[] | null, error: unknown): void {
    table.controllers.delete(controller);
    table.inFlight--;
    if (disposed || controller.signal.aborted) return;
    if (rows) {
      addRows(table, rows);
      // Keys the lookup did not return stay blank without being requested again.
      for (const key of keys) {
        if (!table.map.has(key) && !table.strMap.has(String(key))) table.map.set(key, null);
      }
      if (table.inFlight === 0 && table.status !== 'error') table.status = 'ready';
      table.version++;
    } else {
      for (const key of keys) table.requested.delete(key);
      table.status = 'error';
      table.error = errorMessage(error);
    }
    changed();
  }

  function flush(table: Table): void {
    table.scheduled = false;
    if (disposed || table.pending.length === 0) return;
    if (host?.isConnected?.() === false) {
      held.add(table);
      return;
    }
    const keys = table.pending;
    table.pending = [];
    const controller = createAbortController();
    table.controllers.add(controller);
    table.inFlight++;
    table.status = 'loading';
    table.error = null;
    changed();
    let result: readonly unknown[] | Promise<readonly unknown[]>;
    try {
      result = (table.source as LookupSource).load({ keys: keys as Json[], keyField: table.keyField, displayField: table.displayField, signal: controller.signal });
    } catch (error) {
      settle(table, controller, keys, null, error);
      return;
    }
    if (isPromiseLike<readonly unknown[]>(result)) {
      result.then(
        (rows) => settle(table, controller, keys, Array.isArray(rows) ? rows : [], null),
        (error: unknown) => settle(table, controller, keys, null, error),
      );
    } else {
      settle(table, controller, keys, Array.isArray(result) ? result : [], null);
    }
  }

  function resolve(table: Table, raw: unknown): unknown {
    const key = normalizeKey(raw);
    if (key == null) return null;
    const hit = table.map.get(key);
    if (hit !== undefined) return hit;
    const text = table.strMap.get(String(key));
    if (text !== undefined) return text;
    if (table.remote) request(table, key);
    return null;
  }

  function extend(base: CompiledColumn<Row>): CompiledColumn<Row> {
    const settings = columnLookup(base) as ResolvedLookup;
    const table = tableFor(settings);
    byColumn.set(base.columnId, table);
    const memo = extendedCache.get(base);
    if (memo && memo.table === table && memo.version === table.version) return memo.column;
    const raw = base.accessor as (row: unknown) => unknown;
    const type = displayType(table);
    // A new accessor identity per table version: column keys are cached by
    // accessor, so a grown table rebuilds exactly this column's keys.
    const accessor = (row: Row): unknown => resolve(table, raw(row));
    const sameType = type === base.type;
    const plain = (value: unknown): string => (value == null ? '' : value instanceof Date ? value.toISOString() : String(value));
    const lookup: CompiledLookup = Object.freeze({
      keyField: settings.keyField,
      displayField: settings.displayField,
      type,
      data: settings.data,
      rawValue: raw,
      display: (key: unknown) => resolve(table, key),
    });
    const column: CompiledColumn<Row> = Object.freeze({
      ...base,
      def: Object.freeze({ ...base.def, valueGetter: accessor }),
      accessor,
      type,
      typeSource: 'definition' as const,
      format: sameType ? base.format : null,
      formatter: sameType || base.def.valueFormatter ? base.formatter : plain,
      clipboardFormatter: sameType || base.def.clipboardFormatter || base.def.valueFormatter ? base.clipboardFormatter : plain,
      comparer: sameType ? base.comparer : compareDisplay,
      lookup,
    });
    extendedCache.set(base, { version: table.version, table, column });
    return column;
  }

  const methods: LookupMethods<Row> = {
    getColumns(ctx) {
      const out = ctx.getColumns().leaves.filter((c) => c.lookup);
      return out.length ? Object.freeze(out) : EMPTY;
    },
    getStatus(_ctx, columnId) {
      const table = byColumn.get(columnId);
      return table ? Object.freeze({ status: table.status, error: table.error, size: table.map.size }) : undefined;
    },
    getDisplayValue(_ctx, columnId, key) {
      const table = byColumn.get(columnId);
      return table ? resolve(table, key) : undefined;
    },
    getLookupRows(_ctx, columnId) {
      const table = byColumn.get(columnId);
      return table ? Object.freeze(table.rows.slice()) : EMPTY;
    },
  };

  return defineDataGridModule<Row, LookupState, LookupCommand, 'lookup', LookupMethods<Row>>({
    name: 'lookup',
    commands: ['lookup.reload', 'lookup.loaded'],
    initialState: () => Object.freeze({ version: 0, columns: Object.freeze({}) }),
    onConnect() {
      const tables = [...held];
      held.clear();
      for (const table of tables) schedule(table);
    },
    extendColumns(columns, ctx) {
      host = ctx;
      let out: CompiledColumn<Row>[] | null = null;
      for (let i = 0; i < columns.length; i++) {
        const column = columns[i] as CompiledColumn<Row>;
        if (!columnLookup(column)) continue;
        out ??= columns.slice();
        out[i] = extend(column);
      }
      return out ?? columns;
    },
    reduce(state, command, ctx) {
      switch (command.type) {
        case 'lookup.loaded': {
          if (command.version === state.version) return state;
          return Object.freeze({ version: command.version, columns: Object.freeze({ ...command.columns }) });
        }
        case 'lookup.reload': {
          const targets = new Set<Table>();
          if (command.columnId !== undefined) {
            const table = byColumn.get(command.columnId);
            if (!table) return ctx.reject('unknownColumn');
            targets.add(table);
          } else {
            for (const table of byColumn.values()) targets.add(table);
          }
          let touched = false;
          for (const table of targets) {
            if (!table.remote) continue;
            for (const controller of table.controllers) controller.abort();
            table.controllers.clear();
            table.inFlight = 0;
            table.map = new Map();
            table.strMap = new Map();
            table.rows = [];
            table.requested = new Set();
            table.pending = [];
            table.status = 'idle';
            table.error = null;
            table.version++;
            touched = true;
          }
          if (!touched) return state;
          version++;
          return Object.freeze({ version, columns: Object.freeze(statuses()) });
        }
        default:
          return state;
      }
    },
    notify: () => ({ grid: true, allRows: true }),
    methods,
    dispose() {
      disposed = true;
      for (const byFields of tables.values()) {
        for (const table of byFields.values()) {
          for (const controller of table.controllers) controller.abort();
          table.controllers.clear();
        }
      }
    },
  });
}

/** `column.lookup` with defaults applied, or null for a plain column. */
export function columnLookup<Row>(column: CompiledColumn<Row>): ResolvedLookup | null {
  const lookup = column.def.lookup;
  if (!lookup || lookup.data == null || typeof lookup.displayField !== 'string') return null;
  const keyField = lookup.keyField ?? column.field;
  if (!keyField) return null;
  return { data: lookup.data, keyField, displayField: lookup.displayField };
}

function displayType(table: Table): ColumnType {
  if (table.remote) return 'string';
  for (const value of table.map.values()) {
    if (value == null) continue;
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    if (value instanceof Date) return 'date';
    return 'string';
  }
  return 'string';
}

/** Display comparer: null/undefined first, numbers numerically, then strings by code point (sort ranks use the locale collator). */
function compareDisplay(a: unknown, b: unknown): number {
  if (a == null) return b == null ? 0 : -1;
  if (b == null) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const x = String(a);
  const y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
}
