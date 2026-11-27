// Search module. One pass over the searchable columns: each column's
// operator runs once per distinct value on cached folded strings (keys.ts),
// then rows are matched by typed-array lookups. Typing that only extends the
// previous text re-filters the previous result instead of the stage input.

import { defineDataGridModule } from './engine.js';
import { compilePattern } from '@salmonui/core/data';
import { freezeJsonCopy } from '@salmonui/core/data';
import { ensureColumnKeys, foldText, getColumnKeys, getFoldedStrings, getLabel, peekColumnKeys, plainField, type ColumnKeys } from './keys.js';
import { createRowModel, requestFirstPage } from './pipeline.js';
import { acceptMappedDeltas, isAscendingModel, markAscending, updateSubset } from './row-delta.js';
import { resolveLeaf } from './sort.js';
import type {
  ColumnId,
  ColumnSnapshot,
  CompiledColumn,
  DataGridModule,
  DataGridOptions,
  RowModelSnapshot,
  SearchDescriptor,
  SearchOperator,
} from './types.js';

export interface SearchOptions {
  /** Default true. When false, `search.set` is rejected. */
  readonly enabled?: boolean;
  /** Searched columns. Default `'all'`: every leaf with `allowSearching` except date/datetime columns. */
  readonly fields?: readonly ColumnId[] | 'all';
  /** Default `'contains'`. */
  readonly operator?: SearchOperator;
  /** Default true. */
  readonly ignoreCase?: boolean;
  /** Default false. */
  readonly ignoreAccent?: boolean;
  /** Initial search text (`defaultQuery.search` wins when present). */
  readonly key?: string;
}

export interface SearchState {
  readonly text: string;
  readonly columnIds: readonly ColumnId[] | 'all';
  readonly operator: SearchOperator;
  readonly ignoreCase: boolean;
  readonly ignoreAccent: boolean;
  readonly enabled: boolean;
  /** The query descriptor (null when `text` is empty). */
  readonly descriptor: SearchDescriptor | null;
}

/** `search(text)`; omitted settings keep their current values. */
export type SearchSetCommand = {
  type: 'search.set';
  text: string;
  columnIds?: ColumnId[] | 'all';
  operator?: SearchOperator;
  ignoreCase?: boolean;
  ignoreAccent?: boolean;
};
export type SearchClearCommand = { type: 'search.clear' };
export type SearchCommand = SearchSetCommand | SearchClearCommand;

export type SearchModule<Row> = DataGridModule<Row, SearchState, SearchCommand, 'search', {}>;

const OPERATORS: readonly SearchOperator[] = ['contains', 'startsWith', 'endsWith', 'equal', 'notEqual', 'wildcard', 'like'];
const NUMERIC_TEXT = /^[0-9.eE+-]*$/;
const PATTERN_CHARS = /[*?%]/g;

/**
 * Whether number columns can match: a finite number prints only digits, '.',
 * 'e', '+', '-', so other text cannot match it (except with `notEqual`, where
 * every number differs; pattern characters of `wildcard` / `like` are ignored).
 */
function searchesNumbers(operator: SearchOperator, needle: string): boolean {
  if (operator === 'notEqual') return true;
  return NUMERIC_TEXT.test(operator === 'wildcard' || operator === 'like' ? needle.replace(PATTERN_CHARS, '') : needle);
}

/** Columns a search descriptor reads, in leaf order. */
export function searchColumns<Row>(columnIds: readonly ColumnId[] | 'all', columns: ColumnSnapshot<Row>): CompiledColumn<Row>[] {
  if (columnIds === 'all') {
    return columns.leaves.filter((c) => c.flags.allowSearching && c.type !== 'date' && c.type !== 'datetime');
  }
  const out: CompiledColumn<Row>[] = [];
  const seen = new Set<ColumnId>();
  for (const key of columnIds) {
    const c = resolveLeaf(columns, key);
    if (c && c.flags.allowSearching && !seen.has(c.columnId)) {
      seen.add(c.columnId);
      out.push(c);
    }
  }
  return out;
}

function matcher(operator: SearchOperator, needle: string): (s: string) => boolean {
  switch (operator) {
    case 'startsWith':
      return (s) => s.startsWith(needle);
    case 'endsWith':
      return (s) => s.endsWith(needle);
    case 'equal':
      return (s) => s === needle;
    case 'notEqual':
      // Per cell, like the other operators: a row matches when any searched value differs.
      return (s) => s !== needle;
    case 'wildcard':
    case 'like': {
      const re = compilePattern(needle, operator);
      return (s) => re.test(s);
    }
    default:
      return (s) => s.includes(needle);
  }
}

function columnPass<Row>(
  column: CompiledColumn<Row>,
  keys: ColumnKeys,
  rows: readonly Row[],
  d: SearchDescriptor,
  needle: string,
): Uint8Array | null {
  if (column.type === 'number' && !searchesNumbers(d.operator, needle)) return null;
  const test = matcher(d.operator, needle);
  const size = keys.values.length;
  const pass = new Uint8Array(size);
  let any = false;
  if (column.type === 'date' || column.type === 'datetime') {
    for (let c = 0; c < size; c++) {
      if (keys.values[c] == null) continue;
      if (test(foldText(getLabel(keys, column, rows, c), d.ignoreCase, d.ignoreAccent))) {
        pass[c] = 1;
        any = true;
      }
    }
  } else {
    const folded = getFoldedStrings(keys, d.ignoreCase, d.ignoreAccent);
    for (let c = 0; c < size; c++) {
      const s = folded[c];
      if (s != null && test(s)) {
        pass[c] = 1;
        any = true;
      }
    }
  }
  return any ? pass : null;
}

// Searches without cached keys per rows array. The first search over a data
// version scans values directly (memoized per distinct value, early exit per
// row); the second builds the column keys in one row-major pass, after which
// searches are table lookups.
const keylessScans = new WeakMap<readonly unknown[], number>();
/** Rows scanned between column reorderings in the keyless search scan. */
const SCAN_BLOCK = 1024;

/**
 * One block of the keyless scan. A separate small function so it is optimized
 * as a whole after a few blocks instead of through on-stack replacement on
 * every cold search. Returns the new write position in `out`.
 */
function scanBlock(
  rows: readonly unknown[],
  start: number,
  end: number,
  names: readonly string[],
  memo: Map<unknown, boolean>,
  verdict: (v: unknown) => boolean,
  out: Int32Array,
  w: number,
  slot: Int32Array,
  firstHits: Float64Array,
): number {
  const k = names.length;
  for (let r = start; r < end; r++) {
    const row = rows[r] as Record<string, unknown> | null | undefined;
    if (row == null) continue;
    for (let j = 0; j < k; j++) {
      const v = row[names[j] as string];
      let hit = memo.get(v);
      if (hit === undefined) {
        hit = verdict(v);
        memo.set(v, hit);
      }
      if (hit) {
        out[w++] = r;
        firstHits[slot[j] as number]!++;
        break;
      }
    }
  }
  return w;
}

function scanRowOrder<Row>(
  rows: readonly Row[],
  base: Int32Array | null,
  d: SearchDescriptor,
  searched: readonly CompiledColumn<Row>[],
  needle: string,
): Int32Array {
  const numeric = searchesNumbers(d.operator, needle);
  const used = searched.filter((c) => numeric || c.type !== 'number');
  const len = base ? base.length : rows.length;
  if (used.length === 0) return new Int32Array(0);
  const test = matcher(d.operator, needle);
  const ignoreCase = d.ignoreCase;
  const ignoreAccent = d.ignoreAccent;
  const fold = ignoreCase || ignoreAccent;
  // One verdict per distinct value; null and undefined are memoized as misses.
  const memo = new Map<unknown, boolean>();
  const verdict = (v: unknown): boolean => {
    if (v == null) return false;
    const s = typeof v === 'string' ? v : String(v);
    return test(fold ? foldText(s, ignoreCase, ignoreAccent) : s);
  };
  const out = new Int32Array(len);
  const k = used.length;
  let w = 0;
  const fields = used.map(plainField);
  if (base === null && fields.every((f) => f !== null)) {
    // Hot path (plain top-level fields over the whole array): one keyed load
    // and one memo probe per cell read, no closure calls, early exit per row.
    // The scan is bound by property reads on (often dictionary-mode) row
    // objects, so the column order adapts per block: columns that ended the
    // most rows so far are read first, which cuts reads per row without
    // changing the result (a row matches when any column matches).
    const fieldNames = fields as string[];
    const names = fieldNames.slice();
    const slot = new Int32Array(k);
    for (let j = 0; j < k; j++) slot[j] = j;
    const firstHits = new Float64Array(k);
    for (let start = 0; start < len; start += SCAN_BLOCK) {
      const end = start + SCAN_BLOCK < len ? start + SCAN_BLOCK : len;
      w = scanBlock(rows as readonly unknown[], start, end, names, memo, verdict, out, w, slot, firstHits);
      // Insertion sort by first hits (descending, ties by declared order); k is small.
      for (let a = 1; a < k; a++) {
        const x = slot[a] as number;
        const hx = firstHits[x] as number;
        let b = a - 1;
        while (b >= 0) {
          const y = slot[b] as number;
          const hy = firstHits[y] as number;
          if (hy > hx || (hy === hx && y < x)) break;
          slot[b + 1] = y;
          b--;
        }
        slot[b + 1] = x;
      }
      for (let j = 0; j < k; j++) names[j] = fieldNames[slot[j] as number] as string;
    }
    return w === len ? out : out.slice(0, w);
  }
  const accessors = used.map((c) => c.accessor);
  for (let i = 0; i < len; i++) {
    const r = base ? (base[i] as number) : i;
    const row = rows[r] as Row;
    if (row == null) continue;
    for (let j = 0; j < k; j++) {
      const field = fields[j];
      const v = field != null ? (row as Record<string, unknown>)[field] : (accessors[j] as (row: Row) => unknown)(row);
      let hit = memo.get(v);
      if (hit === undefined) {
        hit = verdict(v);
        memo.set(v, hit);
      }
      if (hit) {
        out[w++] = r;
        break;
      }
    }
  }
  return w === len ? out : out.slice(0, w);
}

/**
 * Whether one row matches the search, reading its values directly (used for
 * the few rows an incremental update re-evaluates). Same verdicts as the
 * table path: numbers only for numeric text, dates by formatted label.
 */
function rowMatcher<Row>(rows: readonly Row[], d: SearchDescriptor, columns: ColumnSnapshot<Row>): (r: number) => boolean {
  const needle = foldText(d.text, d.ignoreCase, d.ignoreAccent);
  const numeric = searchesNumbers(d.operator, needle);
  const used = searchColumns(d.columnIds, columns).filter((c) => numeric || c.type !== 'number');
  const test = matcher(d.operator, needle);
  const mode = d.ignoreCase || d.ignoreAccent;
  return (r) => {
    const row = rows[r] as Row;
    if (row == null) return false;
    for (const column of used) {
      const v = column.accessor(row);
      if (v == null) continue;
      const s = column.type === 'date' || column.type === 'datetime' ? column.formatter(v, row) : typeof v === 'string' ? v : String(v);
      if (test(mode ? foldText(s, d.ignoreCase, d.ignoreAccent) : s)) return true;
    }
    return false;
  };
}

/** Rows of `base` (null = identity over `rows`) matching the search in any column. */
export function searchRowOrder<Row>(
  rows: readonly Row[],
  base: Int32Array | null,
  d: SearchDescriptor,
  columns: ColumnSnapshot<Row>,
): Int32Array {
  const needle = foldText(d.text, d.ignoreCase, d.ignoreAccent);
  const searched = searchColumns(d.columnIds, columns);
  if (!searched.every((c) => peekColumnKeys(rows, c))) {
    const scans = keylessScans.get(rows) ?? 0;
    if (scans === 0 && searched.every((c) => c.type !== 'date' && c.type !== 'datetime')) {
      keylessScans.set(rows, 1);
      return scanRowOrder(rows, base, d, searched, needle);
    }
    ensureColumnKeys(rows, searched);
  }
  const tables: { codes: Int32Array; pass: Uint8Array }[] = [];
  for (const column of searched) {
    const keys = getColumnKeys(rows, column);
    const pass = columnPass(column, keys, rows, d, needle);
    if (pass) tables.push({ codes: keys.codes, pass });
  }
  const len = base ? base.length : rows.length;
  if (tables.length === 0) return new Int32Array(0);
  const out = new Int32Array(len);
  let w = 0;
  const t = tables.length;
  for (let i = 0; i < len; i++) {
    const r = base ? (base[i] as number) : i;
    for (let k = 0; k < t; k++) {
      const table = tables[k] as { codes: Int32Array; pass: Uint8Array };
      if (table.pass[table.codes[r] as number] === 1) {
        out[w++] = r;
        break;
      }
    }
  }
  return w === len ? out : out.slice(0, w);
}

function narrows(prev: SearchDescriptor, next: SearchDescriptor): boolean {
  if (prev.operator !== next.operator || prev.ignoreCase !== next.ignoreCase || prev.ignoreAccent !== next.ignoreAccent) return false;
  if (prev.columnIds !== next.columnIds && JSON.stringify(prev.columnIds) !== JSON.stringify(next.columnIds)) return false;
  const p = foldText(prev.text, prev.ignoreCase, prev.ignoreAccent);
  const n = foldText(next.text, next.ignoreCase, next.ignoreAccent);
  switch (next.operator) {
    case 'contains':
      return n.includes(p);
    case 'startsWith':
      return n.startsWith(p);
    case 'endsWith':
      return n.endsWith(p);
    case 'notEqual':
      return false;
    default:
      return n === p;
  }
}

function describe(state: Omit<SearchState, 'descriptor'>): SearchState {
  const descriptor: SearchDescriptor | null =
    state.text === ''
      ? null
      : Object.freeze({
          text: state.text,
          columnIds: state.columnIds,
          operator: state.operator,
          ignoreCase: state.ignoreCase,
          ignoreAccent: state.ignoreAccent,
        });
  return Object.freeze({ ...state, descriptor });
}

/**
 * Creates the `search` module. Options are read from `options.search`
 * (`SearchOptions`); `options.defaultQuery.search` sets the initial search.
 */
export function createSearchModule<Row>(): SearchModule<Row> {
  const previous = new WeakMap<RowModelSnapshot<Row>, { descriptor: SearchDescriptor; leaves: unknown; order: Int32Array }>();
  return defineDataGridModule<Row, SearchState, SearchCommand, 'search'>({
    name: 'search',
    commands: ['search.set', 'search.clear'],
    initialState(options: DataGridOptions<Row>): SearchState {
      const o = (options['search'] ?? {}) as SearchOptions;
      const d = options.defaultQuery?.search ?? null;
      return describe({
        text: d?.text ?? o.key ?? '',
        columnIds: d?.columnIds ?? (o.fields === undefined || o.fields === 'all' ? 'all' : freezeJsonCopy([...o.fields])),
        operator: d?.operator ?? o.operator ?? 'contains',
        ignoreCase: d?.ignoreCase ?? o.ignoreCase ?? true,
        ignoreAccent: d?.ignoreAccent ?? o.ignoreAccent ?? false,
        enabled: o.enabled ?? true,
      });
    },
    reduce(state, command, ctx) {
      let next: Omit<SearchState, 'descriptor'>;
      if (command.type === 'search.clear') {
        if (state.text === '') return state;
        next = { ...state, text: '' };
      } else {
        if (!state.enabled) return ctx.reject('searchDisabled');
        if (typeof command.text !== 'string') return ctx.reject('invalidSearch');
        if (command.operator !== undefined && !OPERATORS.includes(command.operator)) return ctx.reject('invalidOperator');
        const columnIds =
          command.columnIds === undefined ? state.columnIds : command.columnIds === 'all' ? 'all' : freezeJsonCopy([...command.columnIds]);
        next = {
          ...state,
          text: command.text,
          columnIds,
          operator: command.operator ?? state.operator,
          ignoreCase: command.ignoreCase ?? state.ignoreCase,
          ignoreAccent: command.ignoreAccent ?? state.ignoreAccent,
        };
        if (
          next.text === state.text &&
          next.operator === state.operator &&
          next.ignoreCase === state.ignoreCase &&
          next.ignoreAccent === state.ignoreAccent &&
          JSON.stringify(next.columnIds) === JSON.stringify(state.columnIds)
        ) {
          return state;
        }
      }
      requestFirstPage(ctx);
      return describe(next);
    },
    extendQuery(query, state) {
      return query.search === state.descriptor ? query : Object.freeze({ ...query, search: state.descriptor });
    },
    selectors: {
      search: (snapshot) => snapshot.query.search,
    },
    pipeline: [
      acceptMappedDeltas({
        name: 'search',
        key: (query) => [query.search],
        run(input: RowModelSnapshot<Row>, ctx) {
          const d = ctx.query.search;
          if (!d || d.text === '') return input;
          const prev = previous.get(input);
          const base = prev && prev.leaves === ctx.columns.leaves && narrows(prev.descriptor, d) ? prev.order : input.order;
          const order = searchRowOrder(input.source, base, d, ctx.columns);
          if (isAscendingModel(input)) markAscending(order);
          previous.set(input, { descriptor: d, leaves: ctx.columns.leaves, order });
          return createRowModel(input, order);
        },
        update(input: RowModelSnapshot<Row>, prior, delta, ctx) {
          const d = ctx.query.search;
          if (!d || d.text === '') return input;
          const order = updateSubset(input, prior.output, delta, rowMatcher(input.source, d, ctx.columns));
          if (!order) return undefined;
          previous.set(input, { descriptor: d, leaves: ctx.columns.leaves, order });
          return createRowModel(input, order);
        },
      }),
    ],
  });
}
