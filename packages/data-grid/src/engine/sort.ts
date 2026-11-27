// Sort module.
// Produces an Int32Array order over source indexes. Built-in comparers run as
// stable LSD counting sorts over precomputed per-row ranks; custom
// `sortComparator` columns fall back to a comparison sort over pre-extracted
// raw values. Rows are never copied or wrapped.

import { defineDataGridModule } from './engine.js';
import { freezeJsonCopy, stableStringify } from '@salmonui/core/data';
import { collatorFor, ensureColumnKeys, getColumnKeys, getRawRowValues, getRowRanks, getSortRanks, peekSortRanks } from './keys.js';
import { aggregatedNumericColumns } from './aggregate-need.js';
import { createRowModel } from './pipeline.js';
import { acceptMappedDeltas, deltaSize, dirtyRows, inAscendingModel, isAscendingModel, remapAndMerge } from './row-delta.js';
import type {
  ColumnId,
  ColumnSnapshot,
  CommandRejection,
  CompiledColumn,
  DataGridModule,
  DataGridOptions,
  DataQuery,
  ModuleContext,
  RowDelta,
  RowModelSnapshot,
  SortDescriptor,
} from './types.js';

export type SortMode = 'single' | 'multiple';

export interface SortOptions {
  /** Enables sorting. When false, interactive sort commands are rejected. Default true. */
  readonly enabled?: boolean;
  /** Single or multi-column sorting. Default `'multiple'`. */
  readonly mode?: SortMode;
  /** The third toggle click clears the column. Default true. */
  readonly allowUnsort?: boolean;
}

export interface SortState {
  readonly sorting: readonly SortDescriptor[];
  readonly enabled: boolean;
  readonly mode: SortMode;
  readonly allowUnsort: boolean;
}

/** JSON form of a `SortDescriptor` in command payloads. */
export type SortDescriptorInput = { columnId: ColumnId; direction: 'asc' | 'desc' };
export type SortSetCommand = { type: 'sort.set'; sorting: SortDescriptorInput[] };
/** Header click: none -> asc -> desc -> none (or asc when `allowUnsort` is false). `multi` is Ctrl/Meta+click. */
export type SortToggleCommand = { type: 'sort.toggle'; columnId: ColumnId; multi?: boolean };
/** Sorts one column; `multi` keeps the other sorted columns. */
export type SortColumnCommand = { type: 'sort.column'; columnId: ColumnId; direction: 'asc' | 'desc'; multi?: boolean };
export type SortRemoveCommand = { type: 'sort.remove'; columnId: ColumnId };
export type SortClearCommand = { type: 'sort.clear' };
/** Changes `enabled` / `mode` / `allowUnsort` at runtime (reactive settings props). */
export type SortSetOptionsCommand = { type: 'sort.setOptions'; enabled?: boolean; mode?: SortMode; allowUnsort?: boolean };
export type SortCommand = SortSetCommand | SortToggleCommand | SortColumnCommand | SortRemoveCommand | SortClearCommand | SortSetOptionsCommand;

const EMPTY: readonly never[] = Object.freeze([]);

/** Resolves a column key (columnId, then field) to a leaf column. */
export function resolveLeaf<Row>(columns: ColumnSnapshot<Row>, key: string): CompiledColumn<Row> | undefined {
  const byId = columns.byId.get(key);
  if (byId?.leaf) return byId;
  return columns.leaves.find((c) => c.field === key);
}

function sortable<Row>(ctx: ModuleContext<Row>, key: string): CompiledColumn<Row> | CommandRejection {
  const column = resolveLeaf(ctx.getColumns(), key);
  if (!column) {
    ctx.warn('column-unknown', `sort: no column matches "${key}".`);
    return ctx.reject('unknownColumn');
  }
  if (!column.flags.allowSorting) return ctx.reject('columnNotSortable');
  return column;
}

function isRejection(value: unknown): value is CommandRejection {
  return typeof value === 'object' && value !== null && (value as { rejected?: unknown }).rejected === true;
}

function withSorting(state: SortState, sorting: readonly SortDescriptor[]): SortState {
  if (stableStringify(sorting) === stableStringify(state.sorting)) return state;
  return Object.freeze({ ...state, sorting: sorting.length ? freezeJsonCopy([...sorting]) : EMPTY });
}

// ---------------------------------------------------------------------------
// Sorting kernel
// ---------------------------------------------------------------------------

export interface SortKey<Row> {
  readonly column: CompiledColumn<Row>;
  readonly desc: boolean;
}

/**
 * Effective sort keys: grouped columns first (direction from the
 * sort list, else the group descriptor, else ascending), then the remaining
 * sort descriptors. Unknown columns are ignored.
 */
export function effectiveSortKeys<Row>(query: DataQuery, columns: ColumnSnapshot<Row>): SortKey<Row>[] {
  const keys: SortKey<Row>[] = [];
  const seen = new Set<ColumnId>();
  const direction = new Map<ColumnId, 'asc' | 'desc'>();
  for (const s of query.sorting) direction.set(s.columnId, s.direction);
  for (const g of query.grouping) {
    const column = columns.byId.get(g.columnId);
    if (!column?.leaf || seen.has(column.columnId)) continue;
    seen.add(column.columnId);
    keys.push({ column, desc: (direction.get(g.columnId) ?? g.direction ?? 'asc') === 'desc' });
  }
  for (const s of query.sorting) {
    const column = columns.byId.get(s.columnId);
    if (!column?.leaf || seen.has(column.columnId)) continue;
    seen.add(column.columnId);
    keys.push({ column, desc: s.direction === 'desc' });
  }
  return keys;
}

function identity(n: number): Int32Array {
  const out = new Int32Array(n);
  for (let i = 0; i < n; i++) out[i] = i;
  return out;
}

/** One stable counting-sort pass by per-row rank. */
function countingPass(src: Int32Array, dst: Int32Array, ranks: Int32Array, count: number, desc: boolean): void {
  const m = src.length;
  const buckets = new Int32Array(count + 1);
  if (desc) {
    const top = count - 1;
    for (let i = 0; i < m; i++) buckets[top - (ranks[src[i] as number] as number) + 1]!++;
    for (let k = 1; k <= count; k++) buckets[k]! += buckets[k - 1] as number;
    for (let i = 0; i < m; i++) {
      const r = src[i] as number;
      dst[buckets[top - (ranks[r] as number)]!++] = r;
    }
  } else {
    for (let i = 0; i < m; i++) buckets[(ranks[src[i] as number] as number) + 1]!++;
    for (let k = 1; k <= count; k++) buckets[k]! += buckets[k - 1] as number;
    for (let i = 0; i < m; i++) {
      const r = src[i] as number;
      dst[buckets[ranks[r] as number]!++] = r;
    }
  }
}

/**
 * Stable multi-key sort of `order` (source indexes; null = identity over
 * `rows`). Returns a new array; the input is never written.
 */
export function sortRowOrder<Row>(
  rows: readonly Row[],
  order: Int32Array | null,
  keys: readonly SortKey<Row>[],
  locale: string,
  warm: readonly CompiledColumn<Row>[] = [],
): Int32Array {
  const m = order ? order.length : rows.length;
  if (keys.length === 0 || m < 2) return order ? order.slice() : identity(m);
  // One row-major pass for every sort key plus the columns later stages aggregate.
  if (keys.length > 1 || warm.length) ensureColumnKeys(rows, keys.map((k) => k.column), warm);
  const custom = keys.some((k) => k.column.def.sortComparator !== undefined);
  if (!custom) {
    // LSD: least significant key first; each pass is stable.
    let src: Int32Array<ArrayBufferLike> = order ?? identity(m);
    let a: Int32Array<ArrayBufferLike> = new Int32Array(m);
    let b: Int32Array<ArrayBufferLike> | null = null;
    for (let k = keys.length - 1; k >= 0; k--) {
      const key = keys[k] as SortKey<Row>;
      const columnKeys = getColumnKeys(rows, key.column);
      const ranks = getSortRanks(columnKeys, locale);
      countingPass(src, a, getRowRanks(columnKeys, ranks), ranks.count, key.desc);
      const done = a;
      a = src === order ? (b ??= new Int32Array(m)) : src;
      src = done;
    }
    return src;
  }
  // Comparison sort: positions keep input order on ties (stable regardless of engine).
  const base = order ?? identity(m);
  const compare: ((x: number, y: number) => number)[] = keys.map((key) => {
    const columnKeys = getColumnKeys(rows, key.column);
    const sign = key.desc ? -1 : 1;
    const comparer = key.column.def.sortComparator;
    if (comparer) {
      const raw = getRawRowValues(columnKeys);
      return (x, y) => sign * comparer(raw[x], raw[y], rows[x] as Row, rows[y] as Row);
    }
    const ranks = getRowRanks(columnKeys, getSortRanks(columnKeys, locale));
    return (x, y) => sign * ((ranks[x] as number) - (ranks[y] as number));
  });
  const positions = identity(m);
  const single = compare.length === 1 ? (compare[0] as (x: number, y: number) => number) : null;
  positions.sort((p, q) => {
    const x = base[p] as number;
    const y = base[q] as number;
    if (single) return single(x, y) || p - q;
    for (let i = 0; i < compare.length; i++) {
      const d = (compare[i] as (x: number, y: number) => number)(x, y);
      if (d) return d;
    }
    return p - q;
  });
  const out = new Int32Array(m);
  for (let i = 0; i < m; i++) out[i] = base[positions[i] as number] as number;
  return out;
}

/**
 * Comparator equal to the order `sortRowOrder` produces for an ascending
 * input: sort keys, then source index. Reads codes and per-code values (and
 * per-code ranks where they exist) without repairing ranks, so an incremental
 * update never pays for rank maintenance: numeric keys compare directly (NaN
 * first, like rank 0); strings compare by rank when both codes are ranked and
 * by the locale collator otherwise (ranks are collator-consistent).
 */
export function rowComparator<Row>(rows: readonly Row[], keys: readonly SortKey<Row>[], locale: string): (x: number, y: number) => number {
  let collate: ((a: string, b: string) => number) | null = null;
  const parts = keys.map((key) => {
    const columnKeys = getColumnKeys(rows, key.column);
    const comparer = key.column.def.sortComparator;
    const ranks = comparer ? undefined : peekSortRanks(columnKeys, locale);
    return {
      sign: key.desc ? -1 : 1,
      keys: columnKeys,
      byCode: ranks ? ranks.byCode : null,
      ranked: ranks ? ranks.rankedSize : 0,
      comparer,
    };
  });
  return (x, y) => {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i] as (typeof parts)[number];
      const k = p.keys;
      const cx = k.codes[x] as number;
      const cy = k.codes[y] as number;
      let d: number;
      if (p.comparer) {
        // Called even for equal codes: comparers also receive the rows.
        d = p.comparer(k.values[cx], k.values[cy], rows[x] as Row, rows[y] as Row);
      } else if (cx === cy) {
        continue;
      } else if (p.byCode !== null && cx < p.ranked && cy < p.ranked) {
        d = (p.byCode[cx] as number) - (p.byCode[cy] as number);
      } else if (k.nums !== null) {
        const a = k.nums[cx] as number;
        const b = k.nums[cy] as number;
        const na = a !== a;
        const nb = b !== b;
        d = na || nb ? (na === nb ? 0 : na ? -1 : 1) : a === b ? 0 : a < b ? -1 : 1;
      } else {
        const a = k.values[cx];
        const b = k.values[cy];
        const na = a == null;
        const nb = b == null;
        collate ??= collatorFor(locale).compare;
        d = na || nb ? (na === nb ? 0 : na ? -1 : 1) : collate(typeof a === 'string' ? a : String(a), typeof b === 'string' ? b : String(b));
      }
      if (d) return p.sign * d;
    }
    return x - y;
  };
}

/**
 * Incremental sort: the previous sorted order minus changed rows, with the
 * changed rows of the new input inserted by binary search. Requires an
 * ascending input (ties are broken by source index, which is what the stable
 * full sort does for such an input). Null when a full sort is preferable.
 */
export function updateSortedOrder<Row>(
  input: RowModelSnapshot<Row>,
  previousOutput: Int32Array,
  delta: RowDelta,
  keys: readonly SortKey<Row>[],
  locale: string,
): Int32Array | null {
  if (!isAscendingModel(input) || deltaSize(delta) * 8 > input.count) return null;
  const compare = rowComparator(input.source, keys, locale);
  const dirty = dirtyRows(delta);
  const extra: number[] = [];
  for (let i = 0; i < dirty.length; i++) {
    const r = dirty[i] as number;
    if (inAscendingModel(input, r)) extra.push(r);
  }
  extra.sort(compare);
  const order = remapAndMerge(previousOutput, delta, extra, compare);
  // Defensive: the carried rows plus the re-inserted ones must be exactly the input.
  return order.length === input.count ? order : null;
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

function nextToggle(state: SortState, current: 'asc' | 'desc' | undefined): 'asc' | 'desc' | null {
  if (current === undefined) return 'asc';
  if (current === 'asc') return 'desc';
  return state.allowUnsort ? null : 'asc';
}

function applyColumn(state: SortState, columnId: ColumnId, direction: 'asc' | 'desc' | null, multi: boolean): SortState {
  const isMulti = multi && state.mode === 'multiple';
  if (!isMulti) return withSorting(state, direction ? [{ columnId, direction }] : EMPTY);
  const list = state.sorting.filter((s) => s.columnId !== columnId);
  const at = state.sorting.findIndex((s) => s.columnId === columnId);
  if (direction) {
    if (at >= 0) list.splice(at, 0, { columnId, direction });
    else list.push({ columnId, direction });
  }
  return withSorting(state, list);
}

export type SortModule<Row> = DataGridModule<Row, SortState, SortCommand, 'sort', {}>;

/**
 * Creates the `sort` module. Options are read from `options.sort`
 * (`SortOptions`); the initial sort comes from `options.defaultQuery.sorting`.
 */
export function createSortModule<Row>(): SortModule<Row> {
  return defineDataGridModule<Row, SortState, SortCommand, 'sort'>({
    name: 'sort',
    commands: ['sort.set', 'sort.toggle', 'sort.column', 'sort.remove', 'sort.clear', 'sort.setOptions'],
    initialState(options: DataGridOptions<Row>): SortState {
      const o = (options['sort'] ?? {}) as SortOptions;
      const sorting = options.defaultQuery?.sorting ?? EMPTY;
      return Object.freeze({
        sorting: sorting.length ? freezeJsonCopy([...sorting]) : EMPTY,
        enabled: o.enabled ?? true,
        mode: o.mode ?? 'multiple',
        allowUnsort: o.allowUnsort ?? true,
      });
    },
    reduce(state, command, ctx) {
      switch (command.type) {
        case 'sort.set': {
          if (!Array.isArray(command.sorting)) return ctx.reject('invalidSorting');
          const list: SortDescriptor[] = [];
          for (const s of command.sorting) {
            if (s.direction !== 'asc' && s.direction !== 'desc') return ctx.reject('invalidDirection');
            const column = sortable(ctx, s.columnId);
            if (isRejection(column)) return column;
            list.push({ columnId: column.columnId, direction: s.direction });
          }
          return withSorting(state, list);
        }
        case 'sort.clear':
          return withSorting(state, EMPTY);
        case 'sort.setOptions': {
          if (command.enabled !== undefined && typeof command.enabled !== 'boolean') return ctx.reject('invalidEnabled');
          if (command.mode !== undefined && command.mode !== 'single' && command.mode !== 'multiple') return ctx.reject('invalidMode');
          if (command.allowUnsort !== undefined && typeof command.allowUnsort !== 'boolean') return ctx.reject('invalidAllowUnsort');
          const next = { enabled: command.enabled ?? state.enabled, mode: command.mode ?? state.mode, allowUnsort: command.allowUnsort ?? state.allowUnsort };
          if (next.enabled === state.enabled && next.mode === state.mode && next.allowUnsort === state.allowUnsort) return state;
          // Single mode keeps the primary sort only.
          const sorting = next.mode === 'single' && state.sorting.length > 1 ? state.sorting.slice(0, 1) : state.sorting;
          return Object.freeze({ ...state, ...next, sorting });
        }
        case 'sort.remove': {
          const column = resolveLeaf(ctx.getColumns(), command.columnId);
          const id = column?.columnId ?? command.columnId;
          if (!state.sorting.some((s) => s.columnId === id)) return state;
          return withSorting(
            state,
            state.sorting.filter((s) => s.columnId !== id),
          );
        }
        case 'sort.toggle':
        case 'sort.column': {
          if (!state.enabled) return ctx.reject('sortingDisabled');
          const column = sortable(ctx, command.columnId);
          if (isRejection(column)) return column;
          const id = column.columnId;
          if (command.type === 'sort.column') {
            if (command.direction !== 'asc' && command.direction !== 'desc') return ctx.reject('invalidDirection');
            return applyColumn(state, id, command.direction, command.multi ?? false);
          }
          const current = state.sorting.find((s) => s.columnId === id)?.direction;
          return applyColumn(state, id, nextToggle(state, current), command.multi ?? false);
        }
        default:
          return state;
      }
    },
    extendQuery(query, state) {
      return query.sorting === state.sorting ? query : Object.freeze({ ...query, sorting: state.sorting });
    },
    notify(previous, next) {
      const headers = new Set<ColumnId>();
      for (const s of previous.sorting) headers.add(s.columnId);
      for (const s of next.sorting) headers.add(s.columnId);
      return { grid: true, headers: [...headers] };
    },
    selectors: {
      /** Sort descriptors in priority order. */
      sorting: (snapshot) => snapshot.query.sorting,
    },
    pipeline: [
      acceptMappedDeltas({
        name: 'sort',
        key: (query) => [query.sorting, query.grouping],
        run(input: RowModelSnapshot<Row>, ctx) {
          const keys = effectiveSortKeys(ctx.query, ctx.columns);
          if (keys.length === 0 || input.count < 2) return input;
          return createRowModel(input, sortRowOrder(input.source, input.order, keys, ctx.locale, aggregatedNumericColumns(ctx.query, ctx.columns)));
        },
        update(input: RowModelSnapshot<Row>, previous, delta, ctx) {
          const keys = effectiveSortKeys(ctx.query, ctx.columns);
          if (keys.length === 0) return input;
          if (input.count < 2 || previous.output === previous.input || previous.output.order === null) return undefined;
          const order = updateSortedOrder(input, previous.output.order, delta, keys, ctx.locale);
          return order ? createRowModel(input, order) : undefined;
        },
      }),
    ],
  });
}

/** Per-column header state for renderers: direction and 1-based priority, or null. */
export function getSortInfo(query: DataQuery, columnId: ColumnId): { readonly direction: 'asc' | 'desc'; readonly priority: number } | null {
  const at = query.sorting.findIndex((s) => s.columnId === columnId);
  if (at < 0) return null;
  return { direction: (query.sorting[at] as SortDescriptor).direction, priority: at + 1 };
}
