// DataGrid state API: persist the user's column layout, sorting,
// filters, grouping, page, search, and selection; restore it in one step. State is read
// from module state and restored through commands inside one batch, so a
// restore never recompiles columns. Nothing here touches globals (SSR-safe).
// This is the synchronous state API every grid instance carries; the storage
// binding (`createDataGridPersistence`) lives in `persistence-binding.ts`, and
// `./persistence` re-exports both.
//
// Public names defined here: `DataGridState` (and its fields), `DataGridStatePart`,
// `getDataGridState`, `restoreDataGridState`, `serializeDataGridState`,
// `deserializeDataGridState`, `normalizeDataGridState`, `createDataGridStateApi`.

import { orderLeaves, type ColumnsState } from './columns.js';
import { stableStringify } from '@salmonui/core/data';
import type { RowPinningState } from './row-pinning.js';
import type { SerializedSelection } from './selection.js';
import type { ColumnId, ColumnSnapshot, CommandResult, CompiledColumn, FilterEntry, FilterOperator, FilterSource, DataGridCommand, DataGridEngine, Json, RowId, SearchOperator } from './types.js';

export const DATA_GRID_STATE_VERSION = 1;

/**
 * Persisted parts. `tree` is read and restored by the tree entry's
 * wrappers (`withTreeState`, `withTreePersistence` in
 * `./tree.js`), so grids without tree mode carry none of
 * it; it is not in `DATA_GRID_STATE_PARTS`.
 */
export type DataGridStatePart = 'columns' | 'pinning' | 'sorting' | 'filters' | 'grouping' | 'paging' | 'search' | 'pinnedRows' | 'tree' | 'selection' | 'scroll';

export const DATA_GRID_STATE_PARTS: readonly DataGridStatePart[] = Object.freeze(['columns', 'pinning', 'sorting', 'filters', 'grouping', 'paging', 'search', 'pinnedRows', 'selection', 'scroll']);

/**
 * Runtime pin state (the `pinnedColumns` counts and per-column pins made at
 * runtime, `pinColumn`). Columns are referenced by field (id when there is
 * none); `null` unpins a column that declares `pinned`.
 */
export type PersistedPinning = {
  /** Count of leading visible columns pinned to the start. */
  readonly start: number;
  /** Count of trailing visible columns pinned to the end. */
  readonly end: number;
  readonly columns: Readonly<Record<string, 'start' | 'end' | 'center' | null>>;
};

/** A column in runtime order. */
export type PersistedColumn = {
  /** Stable column id. */
  readonly id: ColumnId;
  readonly field: string | null;
  readonly hidden: boolean;
  /** Runtime width in px; absent when the definition width applies. */
  readonly width?: number;
};

export type PersistedFilterCondition = {
  readonly field: string;
  readonly operator: FilterOperator | (string & {});
  readonly value: Json;
  /** Combination with the previous condition. */
  readonly logic: 'and' | 'or';
  readonly matchCase?: boolean;
  readonly ignoreAccents?: boolean;
};

export type PersistedFilterGroup = {
  readonly kind: 'group';
  readonly logic: 'and' | 'or';
  /** Negates the group. */
  readonly not?: boolean;
  readonly filters: readonly PersistedFilter[];
};

export type PersistedFilter = PersistedFilterCondition | PersistedFilterGroup;

/**
 * Versioned, JSON-serializable grid state. Columns are referenced by `field`
 * (falling back to the column id when a column has no field). Every part is
 * optional on input: a partial state restores what it has.
 */
export type DataGridState = {
  readonly version: 1;
  readonly columns?: readonly PersistedColumn[];
  readonly pinning?: PersistedPinning;
  readonly sorting?: readonly { readonly field: string; readonly direction: 'asc' | 'desc' }[];
  readonly filters?: readonly PersistedFilter[];
  readonly grouping?: readonly string[];
  readonly paging?: { readonly page: number; readonly pageSize: number };
  readonly search?: {
    readonly text: string;
    /** Empty: every searchable column. */
    readonly fields: readonly string[];
    readonly operator: SearchOperator;
    readonly matchCase: boolean;
    readonly ignoreAccents: boolean;
  } | null;
  /**
   * Pinned rows (`rowPinning` module): rows pinned explicitly and
   * rows unpinned although `isRowPinned` matches them. Rows the predicate
   * pins are not listed (the predicate pins them again).
   */
  readonly pinnedRows?: { readonly rowIds: readonly RowId[]; readonly unpinnedRowIds: readonly RowId[] };
  /**
   * Tree mode expansion (`tree` module): per-row overrides over the
   * default (`true`, `false`, or a depth n: rows of depth < n expanded).
   * Present only through the tree entry's state wrappers.
   */
  readonly tree?: { readonly expandedRows: Readonly<Record<RowId, boolean>>; readonly defaultExpanded: boolean | number };
  readonly selection?: SerializedSelection;
  /** Scroll offset in px, applied by the renderer. */
  readonly scroll?: { readonly top: number; readonly left: number };
};

export interface DataGridStateOptions {
  /** Parts left out of reads and restores. */
  readonly exclude?: readonly DataGridStatePart[];
}

export interface RestoreResult {
  readonly status: 'applied' | 'partial';
  /** Fields or ids in the state that match no column (dropped). */
  readonly ignoredColumns: readonly string[];
  /** Commands the engine rejected. */
  readonly rejected: readonly { readonly type: string; readonly reason: string }[];
  /** Parts that could not be restored because their module is not registered. */
  readonly skipped: readonly DataGridStatePart[];
  /** Scroll offset for the renderer to apply (scroll is renderer state). */
  readonly scroll: { readonly top: number; readonly left: number } | null;
}

/** @internal Parts kept after `exclude` (shared with `persistence-binding.ts`). */
export function partSet(exclude: readonly DataGridStatePart[] | undefined): ReadonlySet<DataGridStatePart> {
  const off = new Set(exclude ?? []);
  return new Set(DATA_GRID_STATE_PARTS.filter((p) => !off.has(p)));
}

function has(engine: DataGridEngine<unknown>, module: string): boolean {
  return engine.getModuleState(module) !== undefined;
}

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    for (const v of Object.values(value)) deepFreeze(v);
    Object.freeze(value);
  }
  return value;
}

function fieldOf<Row>(columns: ColumnSnapshot<Row>, columnId: ColumnId): string {
  return columns.byId.get(columnId)?.field ?? columnId;
}

function toPersisted<Row>(entries: readonly FilterEntry[], columns: ColumnSnapshot<Row>): PersistedFilter[] {
  return entries.map((entry) => {
    if (entry.kind === 'group') return { kind: 'group', logic: entry.predicate, ...(entry.not ? { not: true } : {}), filters: toPersisted(entry.filters, columns) };
    const out: Record<string, unknown> = { field: fieldOf(columns, entry.columnId), operator: entry.operator, value: entry.value, logic: entry.predicate };
    if (entry.matchCase) out['matchCase'] = true;
    if (entry.ignoreAccent) out['ignoreAccents'] = true;
    return out as PersistedFilterCondition;
  });
}

type SearchModuleState = { text: string; columnIds: readonly ColumnId[] | 'all'; operator: SearchOperator; ignoreCase: boolean; ignoreAccent: boolean };

/** Reads the persistable state. Parts of unregistered modules are omitted. */
export function getDataGridState<Row>(engine: DataGridEngine<Row>, options: DataGridStateOptions = {}): DataGridState {
  const parts = partSet(options.exclude);
  const e = engine as DataGridEngine<unknown>;
  const snapshot = engine.getSnapshot();
  const q = snapshot.query;
  const cols = snapshot.columns;
  const out: Record<string, unknown> = { version: DATA_GRID_STATE_VERSION };
  if (parts.has('columns')) {
    const state = engine.getModuleState<ColumnsState>('columns') as ColumnsState;
    out['columns'] = orderLeaves(cols.leaves, state.order).map((c) => {
      const entry: Record<string, unknown> = { id: c.columnId, field: c.field, hidden: !(state.visibility[c.columnId] ?? !(c.def.hidden ?? false)) };
      const width = state.widths[c.columnId];
      if (width !== undefined) entry['width'] = width;
      return entry;
    });
  }
  if (parts.has('pinning')) {
    const state = engine.getModuleState<ColumnsState>('columns') as ColumnsState;
    const columns: Record<string, 'start' | 'end' | 'center' | null> = {};
    for (const [id, f] of Object.entries(state.freeze)) if (cols.byId.get(id)?.leaf) columns[fieldOf(cols, id)] = f === 'left' ? 'start' : f === 'right' ? 'end' : f === 'fixed' ? 'center' : null;
    out['pinning'] = { start: state.frozenCount.left, end: state.frozenCount.right, columns };
  }
  if (parts.has('sorting') && has(e, 'sort')) out['sorting'] = q.sorting.map((s) => ({ field: fieldOf(cols, s.columnId), direction: s.direction }));
  if (parts.has('filters') && has(e, 'filter')) out['filters'] = toPersisted(q.filters, cols);
  if (parts.has('grouping') && has(e, 'grouping')) out['grouping'] = q.grouping.map((g) => fieldOf(cols, g.columnId));
  if (parts.has('paging') && has(e, 'paging')) {
    const paging = engine.getModuleState<{ page: number; pageSize: number }>('paging') as { page: number; pageSize: number };
    out['paging'] = { page: paging.page, pageSize: paging.pageSize };
  }
  if (parts.has('search') && has(e, 'search')) {
    const s = engine.getModuleState<SearchModuleState>('search') as SearchModuleState;
    out['search'] = s.text === '' ? null : { text: s.text, fields: s.columnIds === 'all' ? [] : s.columnIds.map((id) => fieldOf(cols, id)), operator: s.operator, matchCase: !s.ignoreCase, ignoreAccents: s.ignoreAccent };
  }
  if (parts.has('pinnedRows') && has(e, 'rowPinning')) {
    const pins = engine.getModuleState<RowPinningState>('rowPinning') as RowPinningState;
    out['pinnedRows'] = { rowIds: pins.pinned, unpinnedRowIds: pins.unpinned };
  }
  if (parts.has('selection')) {
    const facade = (engine as unknown as { selection?: { serialize?: () => SerializedSelection } }).selection;
    if (typeof facade?.serialize === 'function') out['selection'] = facade.serialize();
  }
  if (parts.has('scroll')) out['scroll'] = { top: snapshot.viewport.scrollTop, left: snapshot.viewport.scrollLeft };
  return deepFreeze(plain(out) as DataGridState);
}

function sameJson(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

/** Resolves a persisted column reference: id first, then field. */
function leafFor<Row>(columns: ColumnSnapshot<Row>, ref: string): CompiledColumn<Row> | undefined {
  const byId = columns.byId.get(ref);
  if (byId?.leaf) return byId;
  return columns.leaves.find((c) => c.field === ref);
}

/**
 * Restores a state in one batch, through commands: columns, sorting,
 * filters, search, grouping, paging, pinned rows, then selection (query changes may
 * clear a selection that does not persist). Parts whose current form
 * already equals the state are not re-applied. Never recompiles columns.
 */
export function restoreDataGridState<Row>(engine: DataGridEngine<Row>, input: DataGridState | string, options: DataGridStateOptions & DeserializeDataGridStateOptions = {}): RestoreResult {
  const state = typeof input === 'string' ? deserializeDataGridState(input, options) : normalizeDataGridState(input, options);
  const parts = partSet(options.exclude);
  const e = engine as DataGridEngine<unknown>;
  const cols = engine.getSnapshot().columns;
  const ignored = new Set<string>();
  const resolve = (ref: string): ColumnId | null => {
    const leaf = leafFor(cols, ref);
    if (leaf) return leaf.columnId;
    ignored.add(ref);
    return null;
  };
  const rejected: { type: string; reason: string }[] = [];
  const skipped: DataGridStatePart[] = [];
  const run = (command: DataGridCommand): void => {
    const result: CommandResult = engine.dispatch(command);
    if (result.status === 'rejected') rejected.push({ type: command.type, reason: result.reason });
  };
  const wants = (part: DataGridStatePart, module: string | null): boolean => {
    if (!parts.has(part) || state[part] === undefined) return false;
    if (module !== null && !has(e, module)) {
      skipped.push(part);
      return false;
    }
    return !sameJson(getDataGridState(engine, { exclude: DATA_GRID_STATE_PARTS.filter((p) => p !== part) })[part], state[part]);
  };

  const filtersOf = (list: readonly PersistedFilter[]): FilterEntry[] =>
    list.flatMap((f): FilterEntry[] => {
      if ('kind' in f && f.kind === 'group') {
        const filters = filtersOf(f.filters);
        return filters.length ? [{ kind: 'group', predicate: f.logic, ...(f.not ? { not: true } : {}), filters }] : [];
      }
      const c = f as PersistedFilterCondition;
      const id = resolve(c.field);
      if (id === null) return [];
      return [{ columnId: id, operator: c.operator, value: c.value, predicate: c.logic, ...(c.matchCase ? { matchCase: true } : {}), ...(c.ignoreAccents ? { ignoreAccent: true } : {}), source: 'api' as FilterSource }];
    });

  engine.batch(() => {
    if (wants('columns', null) && state.columns) {
      const current = engine.getModuleState<ColumnsState>('columns') as ColumnsState;
      const entries = state.columns.flatMap((c) => {
        const id = resolve(c.id) ?? (c.field !== null && c.field !== c.id ? resolve(c.field) : null);
        if (id !== null) ignored.delete(c.id);
        return id === null ? [] : [{ c, id }];
      });
      const order = orderLeaves(cols.leaves, entries.map((x) => x.id)).map((c) => c.columnId);
      if (!sameJson(order, orderLeaves(cols.leaves, current.order).map((c) => c.columnId))) run({ type: 'columns.setOrder', order });
      const persisted = new Map(entries.map((x) => [x.id, x.c]));
      const visibility: Record<ColumnId, boolean> = {};
      let differs = false;
      for (const column of cols.leaves) {
        const id = column.columnId;
        const now = current.visibility[id] ?? !(column.def.hidden ?? false);
        const saved = persisted.get(id);
        const next = saved ? !saved.hidden : now;
        visibility[id] = next;
        if (next !== now) differs = true;
      }
      if (differs) run({ type: 'columns.setVisibility', visibility });
      const widths: Record<ColumnId, number> = {};
      for (const [id, c] of persisted) if (typeof c.width === 'number') widths[id] = c.width;
      if (!sameJson(widths, current.widths)) run({ type: 'columns.setWidths', widths, replace: true });
    }
    if (wants('pinning', null) && state.pinning) {
      const freeze: Record<ColumnId, 'left' | 'right' | 'fixed' | null> = {};
      for (const [ref, pinned] of Object.entries(state.pinning.columns)) {
        const id = resolve(ref);
        if (id !== null) freeze[id] = pinned === 'start' ? 'left' : pinned === 'end' ? 'right' : pinned === 'center' ? 'fixed' : null;
      }
      run({ type: 'columns.setPinning', freeze, frozenCount: { left: state.pinning.start, right: state.pinning.end } });
    }
    if (wants('sorting', 'sort') && state.sorting) {
      const sorting = state.sorting.flatMap((s) => {
        const id = resolve(s.field);
        return id === null ? [] : [{ columnId: id, direction: s.direction }];
      });
      run({ type: 'sort.set', sorting });
    }
    if (wants('filters', 'filter') && state.filters) run({ type: 'filter.set', filters: plain(filtersOf(state.filters)) as unknown as Json });
    if (wants('search', 'search') && state.search !== undefined) {
      const s = state.search;
      if (s === null) {
        run({ type: 'search.clear' });
      } else {
        const ids = s.fields.flatMap((f) => {
          const id = resolve(f);
          return id === null ? [] : [id];
        });
        run({ type: 'search.set', text: s.text, columnIds: ids.length ? ids : 'all', operator: s.operator, ignoreCase: !s.matchCase, ignoreAccent: s.ignoreAccents });
      }
    }
    if (wants('grouping', 'grouping') && state.grouping) {
      run({
        type: 'grouping.set',
        grouping: state.grouping.flatMap((f) => {
          const id = resolve(f);
          return id === null ? [] : [{ columnId: id }];
        }),
      });
    }
    if (wants('paging', 'paging') && state.paging) {
      const now = () => engine.getModuleState<{ page: number; pageSize: number }>('paging') as { page: number; pageSize: number };
      if (now().pageSize !== state.paging.pageSize) run({ type: 'paging.setPageSize', pageSize: state.paging.pageSize });
      if (now().page !== state.paging.page) run({ type: 'paging.goToPage', page: state.paging.page });
    }
    if (wants('pinnedRows', 'rowPinning') && state.pinnedRows) {
      run({ type: 'rowPinning.set', pinned: [...state.pinnedRows.rowIds], unpinned: [...state.pinnedRows.unpinnedRowIds] });
    }
    if (wants('selection', 'selection') && state.selection) {
      const s = state.selection;
      const known = (id: ColumnId): boolean => cols.byId.get(id)?.leaf === true;
      run({
        type: 'selection.restore',
        selection: plain({ ...s, cellRanges: s.cellRanges.filter((r) => known(r.anchor.columnId) && known(r.focus.columnId)), columnIds: s.columnIds.filter(known) }) as unknown as Json,
      });
    }
  });

  return Object.freeze({
    status: ignored.size || rejected.length || skipped.length ? 'partial' : 'applied',
    ignoredColumns: Object.freeze([...ignored]),
    rejected: Object.freeze(rejected),
    skipped: Object.freeze([...new Set(skipped)]),
    scroll: parts.has('scroll') ? (state.scroll ?? null) : null,
  });
}

// ---------------------------------------------------------------------------
// URL-safe serialization
// ---------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const B64_INDEX: Record<string, number> = Object.fromEntries([...B64].map((c, i) => [c, i]));

function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of text) {
    const cp = ch.codePointAt(0) as number;
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 63));
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 63), 0x80 | ((cp >> 6) & 63), 0x80 | (cp & 63));
  }
  return out;
}

function fromUtf8(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i] as number;
    const at = (k: number): number => (bytes[i + k] as number) & 63;
    let cp: number;
    if (b < 0x80) {
      cp = b;
      i += 1;
    } else if (b < 0xe0) {
      cp = ((b & 31) << 6) | at(1);
      i += 2;
    } else if (b < 0xf0) {
      cp = ((b & 15) << 12) | (at(1) << 6) | at(2);
      i += 3;
    } else {
      cp = ((b & 7) << 18) | (at(1) << 12) | (at(2) << 6) | at(3);
      i += 4;
    }
    out += String.fromCodePoint(cp);
  }
  return out;
}

function toBase64Url(bytes: readonly number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    const n = ((bytes[i] as number) << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += (B64[(n >> 18) & 63] as string) + (B64[(n >> 12) & 63] as string);
    if (b !== undefined) out += B64[(n >> 6) & 63] as string;
    if (c !== undefined) out += B64[n & 63] as string;
  }
  return out;
}

function fromBase64Url(text: string): number[] {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of text) {
    const v = B64_INDEX[ch];
    if (v === undefined) throw new TypeError('deserializeDataGridState: invalid base64url input');
    buffer = ((buffer << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 255);
    }
  }
  return out;
}

/** Deterministic (sorted keys), URL-safe (base64url of UTF-8 JSON) form of a state. */
export function serializeDataGridState(state: DataGridState): string {
  return toBase64Url(utf8(stableStringify(state)));
}

export interface DeserializeDataGridStateOptions {
  /** Upgrades a state of another version; return null to reject it. */
  readonly migrate?: (state: Record<string, unknown>, version: number) => DataGridState | null;
}

/** Inverse of `serializeDataGridState`; also accepts plain JSON. Throws on malformed input or an unsupported version. */
export function deserializeDataGridState(text: string, options: DeserializeDataGridStateOptions = {}): DataGridState {
  const trimmed = text.trim();
  let raw: unknown;
  try {
    raw = JSON.parse(trimmed.startsWith('{') ? trimmed : fromUtf8(fromBase64Url(trimmed)));
  } catch (error) {
    if (error instanceof TypeError && error.message.startsWith('deserializeDataGridState')) throw error;
    throw new TypeError('deserializeDataGridState: input is not a serialized grid state');
  }
  return normalizeDataGridState(raw, options);
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const str = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const strings = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : []);
const finite = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
const SEARCH_OPERATORS = new Set(['contains', 'startsWith', 'endsWith', 'equal', 'notEqual']);

function normalizeFilters(value: unknown): PersistedFilter[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).flatMap((f): PersistedFilter[] => {
    const logic = f['logic'] === 'or' ? 'or' : 'and';
    if (f['kind'] === 'group') return [{ kind: 'group', logic, ...(f['not'] === true ? { not: true } : {}), filters: normalizeFilters(f['filters']) }];
    const field = str(f['field']);
    const operator = str(f['operator']);
    if (field === undefined || operator === undefined) return [];
    return [{ field, operator, value: (f['value'] ?? null) as Json, logic, ...(f['matchCase'] === true ? { matchCase: true } : {}), ...(f['ignoreAccents'] === true ? { ignoreAccents: true } : {}) }];
  });
}

/**
 * Validates and normalizes a state. Throws on a non-object or an unsupported
 * `version` unless `migrate` upgrades it. Invalid entries are dropped.
 */
export function normalizeDataGridState(raw: unknown, options: DeserializeDataGridStateOptions = {}): DataGridState {
  if (!isRecord(raw)) throw new TypeError('DataGrid state must be an object');
  let src: Record<string, unknown> = raw;
  const version = raw['version'];
  if (version !== DATA_GRID_STATE_VERSION) {
    const migrated: unknown = typeof version === 'number' && options.migrate ? options.migrate(raw, version) : null;
    if (!isRecord(migrated) || migrated['version'] !== DATA_GRID_STATE_VERSION) {
      throw new TypeError(`Unsupported grid state version ${JSON.stringify(version)}; expected ${DATA_GRID_STATE_VERSION} (pass migrate to upgrade).`);
    }
    src = migrated;
  }
  const out: Record<string, unknown> = { version: DATA_GRID_STATE_VERSION };
  if (Array.isArray(src['columns'])) {
    out['columns'] = src['columns'].filter(isRecord).flatMap((c) => {
      const id = str(c['id']) ?? str(c['field']);
      if (id === undefined) return [];
      const entry: Record<string, unknown> = { id, field: str(c['field']) ?? null, hidden: c['hidden'] === true };
      const width = finite(c['width']);
      if (width !== undefined && width > 0) entry['width'] = width;
      return [entry];
    });
  }
  const pinning = src['pinning'];
  if (isRecord(pinning)) {
    const columns: Record<string, 'start' | 'end' | 'center' | null> = {};
    if (isRecord(pinning['columns'])) for (const [ref, p] of Object.entries(pinning['columns'])) columns[ref] = p === 'start' || p === 'end' || p === 'center' ? p : null;
    const count = (v: unknown): number => {
      const n = finite(v);
      return n !== undefined && n > 0 ? Math.floor(n) : 0;
    };
    out['pinning'] = { start: count(pinning['start']), end: count(pinning['end']), columns };
  }
  if (Array.isArray(src['sorting'])) {
    out['sorting'] = src['sorting'].filter(isRecord).flatMap((s) => {
      const field = str(s['field']);
      return field === undefined ? [] : [{ field, direction: s['direction'] === 'desc' ? 'desc' : 'asc' }];
    });
  }
  if (src['filters'] !== undefined) out['filters'] = normalizeFilters(src['filters']);
  if (src['grouping'] !== undefined) out['grouping'] = strings(src['grouping']);
  const paging = src['paging'];
  if (isRecord(paging)) {
    const page = finite(paging['page']);
    const pageSize = finite(paging['pageSize']);
    if (page !== undefined && pageSize !== undefined) out['paging'] = { page, pageSize };
  }
  const search = src['search'];
  if (search === null) out['search'] = null;
  else if (isRecord(search) && typeof search['text'] === 'string') {
    out['search'] = {
      text: search['text'],
      fields: strings(search['fields']),
      operator: SEARCH_OPERATORS.has(String(search['operator'])) ? search['operator'] : 'contains',
      matchCase: search['matchCase'] === true,
      ignoreAccents: search['ignoreAccents'] === true,
    };
  }
  const pins = src['pinnedRows'];
  if (isRecord(pins)) out['pinnedRows'] = { rowIds: strings(pins['rowIds']), unpinnedRowIds: strings(pins['unpinnedRowIds']) };
  const sel = src['selection'];
  if (isRecord(sel)) {
    out['selection'] = {
      scope: sel['scope'] === 'allFiltered' ? 'allFiltered' : 'explicit',
      rowIds: strings(sel['rowIds']),
      excludedRowIds: strings(sel['excludedRowIds']),
      anchorRowId: str(sel['anchorRowId']) ?? null,
      cellRanges: Array.isArray(sel['cellRanges']) ? sel['cellRanges'].filter((r) => isRecord(r) && isRecord(r['anchor']) && isRecord(r['focus'])) : [],
      columnIds: strings(sel['columnIds']),
    };
  }
  const scroll = src['scroll'];
  if (isRecord(scroll)) out['scroll'] = { top: finite(scroll['top']) ?? 0, left: finite(scroll['left']) ?? 0 };
  return deepFreeze(plain(out) as DataGridState);
}

// ---------------------------------------------------------------------------
// Instance state API
// ---------------------------------------------------------------------------

/** The `getState` / `restoreState` / `resetState` instance methods. */
export interface DataGridStateApi {
  /** Persistable state (columns, pinning, sorting, filters, grouping, paging, search, selection, scroll). */
  getState(options?: DataGridStateOptions): DataGridState;
  /** Restores a state (object or serialized) in one batch without recompiling columns. */
  restoreState(state: DataGridState | string, options?: DataGridStateOptions & DeserializeDataGridStateOptions): RestoreResult;
  /** Restores the state captured when this API was created. */
  resetState(): RestoreResult;
  /** The state captured when this API was created (what `resetState` restores). */
  readonly initialState: DataGridState;
}

/**
 * Builds the state methods of a grid instance. Lives on the
 * `./persistence.js` subpath (not in `createDataGridApi`) so the
 * root entry does not carry the persistence code; renderers compose it into
 * their instance API.
 */
export function createDataGridStateApi<Row>(engine: DataGridEngine<Row>): DataGridStateApi {
  const initialState = getDataGridState(engine);
  return Object.freeze({
    initialState,
    getState: (options?: DataGridStateOptions) => getDataGridState(engine, options),
    restoreState: (state: DataGridState | string, options?: DataGridStateOptions & DeserializeDataGridStateOptions) => restoreDataGridState(engine, state, options),
    resetState: () => restoreDataGridState(engine, initialState),
  } satisfies DataGridStateApi);
}

/** Not for apps: the state API functions the storage binding uses (`bindDataGridPersistence`, `persistence-binder.ts`). */
export interface DataGridPersistenceFns {
  readonly getDataGridState: typeof getDataGridState;
  readonly restoreDataGridState: typeof restoreDataGridState;
  readonly deserializeDataGridState: typeof deserializeDataGridState;
  readonly normalizeDataGridState: typeof normalizeDataGridState;
  readonly partSet: (exclude: readonly DataGridStatePart[] | undefined) => ReadonlySet<DataGridStatePart>;
  readonly stableStringify: typeof stableStringify;
}

/** Not for apps: passed to `bindDataGridPersistence` by `createDataGridPersistence` and by renderers that load the binding lazily. */
export const DATA_GRID_PERSISTENCE_FNS: DataGridPersistenceFns = Object.freeze({ getDataGridState, restoreDataGridState, deserializeDataGridState, normalizeDataGridState, partSet, stableStringify });
