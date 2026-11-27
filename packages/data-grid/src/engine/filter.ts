// Filter module. Filter state compiles into per-column pass tables over the
// dictionary codes from keys.ts: every operator runs once per distinct value,
// then each row is a typed-array lookup. The result is an Int32Array of
// passing source indexes. When a filter change only narrows the previous one
// (appended characters on `contains`, a smaller `in` list, an added
// condition), the previous result is filtered instead of the stage input.

import { compilePattern, normalizeFilterOperator } from '@salmonui/core/data';
import { defineDataGridModule } from './engine.js';
import { toDate } from '@salmonui/core/format';
import { freezeJsonCopy, stableStringify } from '@salmonui/core/data';
import {
  Blank,
  dayKey,
  ensureColumnKeys,
  foldText,
  getColumnKeys,
  getDayKeys,
  getFoldedStrings,
  getLabel,
  getSortRanks,
  parseBoolean,
  type ColumnKeys,
} from './keys.js';
import { createRowModel, requestFirstPage } from './pipeline.js';
import { acceptMappedDeltas, isAscendingModel, markAscending, updateSubset } from './row-delta.js';
import { resolveLeaf } from './sort.js';
import type {
  ColumnId,
  ColumnSnapshot,
  CommandRejection,
  CompiledColumn,
  FilterDescriptor,
  FilterEntry,
  FilterGroupDescriptor,
  FilterOperator,
  FilterSource,
  DataGridModule,
  DataGridOptions,
  Json,
  PipelineStageName,
  ModuleContext,
  RowModelSnapshot,
} from './types.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface FilterOptions {
  /** Enables filtering. When false, filter commands other than `filter.clear` are rejected. Default true. */
  readonly enabled?: boolean;
  /** Default `matchCase` for conditions that omit it. Default false. */
  readonly caseSensitive?: boolean;
  /** Default `ignoreAccent` (NFD diacritic strip). Default false. */
  readonly ignoreAccent?: boolean;
}

export interface FilterState {
  readonly filters: readonly FilterEntry[];
  readonly enabled: boolean;
  readonly caseSensitive: boolean;
  readonly ignoreAccent: boolean;
}

export interface CustomOperatorContext<Row = unknown> {
  readonly column: CompiledColumn<Row>;
  readonly matchCase: boolean;
  readonly ignoreAccent: boolean;
}

/**
 * Custom operator: a pure function of one cell value. It runs once per
 * distinct value of the column, not once per row, so it must not depend on
 * other fields of the row.
 */
export type CustomFilterOperator<Row = unknown> = (value: unknown, filterValue: Json, ctx: CustomOperatorContext<Row>) => boolean;

export interface FilterModuleConfig<Row = unknown> {
  readonly operators?: Readonly<Record<string, CustomFilterOperator<Row>>>;
}

/** JSON form of a filter condition in command payloads; omitted fields take defaults (`predicate: 'and'`, `source: 'api'`). */
export type FilterConditionInput = {
  kind?: 'condition';
  columnId: ColumnId;
  operator: string;
  value?: Json;
  predicate?: 'and' | 'or';
  matchCase?: boolean;
  ignoreAccent?: boolean;
  source?: FilterSource;
};
export type FilterGroupInput = { kind: 'group'; predicate?: 'and' | 'or'; not?: boolean; filters: FilterEntryInput[]; source?: FilterSource };
export type FilterEntryInput = FilterConditionInput | FilterGroupInput;

export type FilterSetCommand = { type: 'filter.set'; filters: FilterEntryInput[] };
/**
 * `filterByColumn(columnId, operator, value)`: replaces the column's top-level
 * conditions. An array `value` with an operator other than `in`, `notIn`, or
 * `between` becomes one condition per value combined with `or`.
 */
export type FilterByColumnCommand = {
  type: 'filter.byColumn';
  columnId: ColumnId;
  operator: string;
  value?: Json;
  predicate?: 'and' | 'or';
  matchCase?: boolean;
  ignoreAccent?: boolean;
  source?: FilterSource;
};
export type FilterAddCommand = { type: 'filter.add'; filters: FilterEntryInput[] };
/** Removes the filters of one column. */
export type FilterRemoveCommand = { type: 'filter.remove'; columnId: ColumnId };
/** `clearFiltering(columnIds?)`. */
export type FilterClearCommand = { type: 'filter.clear'; columnIds?: ColumnId[] };
/** Changes `enabled` / `caseSensitive` / `ignoreAccent` at runtime (reactive settings props). */
export type FilterSetOptionsCommand = { type: 'filter.setOptions'; enabled?: boolean; caseSensitive?: boolean; ignoreAccent?: boolean };
export type FilterCommand = FilterSetCommand | FilterByColumnCommand | FilterAddCommand | FilterRemoveCommand | FilterClearCommand | FilterSetOptionsCommand;

/** Stable key shared by null, undefined, and empty-string values in facets. */
export const BLANK_FACET_KEY = '__salmon_ui_blank__';

export interface FacetValue {
  /** Stable key: `BLANK_FACET_KEY`, or a type-tagged value (`s:`, `n:`, `d:`, `b:`). */
  readonly key: string;
  /** Filter value for `in` / `equal` (dates as ISO strings); null for blanks. */
  readonly value: Json;
  /** Formatted display value ('' for blanks; the renderer localizes the blank label). */
  readonly label: string;
  readonly count: number;
  readonly blank: boolean;
  /** Whether the column's current filter keeps this value (all true when the column is unfiltered). */
  readonly selected: boolean;
}

export interface ColumnFacet {
  readonly columnId: ColumnId;
  /** `unavailable`: the remote source performed filtering; facets must come from the data source. */
  readonly status: 'ready' | 'unavailable';
  readonly values: readonly FacetValue[];
  /** Distinct values matching `search`, before `offset`/`limit`. */
  readonly distinctCount: number;
  /** Of `distinctCount`, the values the column's current filter keeps (`selected`); lets a paged checklist count its checked values. */
  readonly selectedCount: number;
  /** Rows passing every other column's filter. */
  readonly rowCount: number;
  readonly truncated: boolean;
  readonly stale: boolean;
  readonly error: null;
}

export interface FacetOptions {
  /** Case- and accent-insensitive substring match on the label (Excel checklist search box). */
  readonly search?: string;
  readonly offset?: number;
  /** Default 1000 (`facetLimit`). */
  readonly limit?: number;
}

export type FilterMethods<Row> = {
  /**
   * Distinct values of a column with counts over the rows that pass search
   * and every other column's filter. Computed lazily and cached per
   * (stage input, filter state, column, options).
   */
  getFacet(ctx: ModuleContext<Row>, columnId: ColumnId, options?: FacetOptions): ColumnFacet | undefined;
  /**
   * Rows passing search and every filter, in sort order, across every page;
   * grouping, expansion, and paging do not
   * apply. Raw references, cached per row model. With a remote source that
   * filtered, the loaded rows.
   */
  getFilteredRows(ctx: ModuleContext<Row>): readonly Row[];
};

/** Stages after sorting: the first registered one's input is the searched, filtered, sorted model. */
const AFTER_SORT: readonly PipelineStageName[] = ['group', 'aggregate', 'groupExpansion', 'treeExpansion', 'detailExpansion', 'page', 'frozenSplit'];

export type FilterModule<Row> = DataGridModule<Row, FilterState, FilterCommand, 'filter', FilterMethods<Row>>;

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

const EMPTY: readonly never[] = Object.freeze([]);

function isGroup(entry: FilterEntry): entry is FilterGroupDescriptor {
  return (entry as FilterGroupDescriptor).kind === 'group';
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

function filterDayKey(value: unknown, timeZone: string | undefined): number {
  if (typeof value === 'string') {
    const m = DATE_ONLY.exec(value);
    if (m) return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
  }
  const d = toDate(value);
  return d ? dayKey(d.getTime(), timeZone) : Number.NaN;
}

interface EvalEnv<Row> {
  readonly rows: readonly Row[];
  readonly columns: ColumnSnapshot<Row>;
  readonly state: FilterState;
  readonly timeZone: string | undefined;
  readonly custom: Readonly<Record<string, CustomFilterOperator<Row>>>;
}

type Domain = 'string' | 'number' | 'day';

/** Pass table (per dictionary code) for one condition. */
function conditionPass<Row>(cond: FilterDescriptor, keys: ColumnKeys, column: CompiledColumn<Row>, env: EvalEnv<Row>): Uint8Array {
  const size = keys.values.length;
  const out = new Uint8Array(size);
  const blank = keys.blank;
  const matchCase = cond.matchCase ?? env.state.caseSensitive;
  const ignoreAccent = cond.ignoreAccent ?? env.state.ignoreAccent;
  const op = normalizeFilterOperator(cond.operator);
  if (op === null) {
    const test = env.custom[cond.operator];
    if (!test) return out.fill(1); // validated at command time; unknown operators never drop rows
    const ctx: CustomOperatorContext<Row> = { column, matchCase, ignoreAccent };
    for (let c = 0; c < size; c++) out[c] = test(keys.values[c], cond.value, ctx) ? 1 : 0;
    return out;
  }
  const comparator = column.def.filterComparator;
  if (comparator !== undefined) {
    // one verdict per distinct raw value; matchCase / ignoreAccent are the comparator's concern.
    for (let c = 0; c < size; c++) out[c] = comparator(keys.values[c], cond.value, op) ? 1 : 0;
    return out;
  }
  switch (op) {
    case 'isNull':
    case 'isNotNull': {
      const want = op === 'isNull' ? 1 : 0;
      for (let c = 0; c < size; c++) out[c] = (blank[c] === Blank.Null || blank[c] === Blank.Undefined ? 1 : 0) === want ? 1 : 0;
      return out;
    }
    case 'isEmpty':
    case 'isNotEmpty': {
      // Undefined or '' is empty; null is not.
      const want = op === 'isEmpty' ? 1 : 0;
      for (let c = 0; c < size; c++) out[c] = (blank[c] === Blank.Undefined || blank[c] === Blank.Empty ? 1 : 0) === want ? 1 : 0;
      return out;
    }
    case 'contains':
    case 'doesNotContain':
    case 'startsWith':
    case 'doesNotStartWith':
    case 'endsWith':
    case 'doesNotEndWith':
    case 'like':
    case 'wildcard': {
      const folded = getFoldedStrings(keys, !matchCase, ignoreAccent);
      const needle = foldText(cond.value == null ? '' : String(cond.value), !matchCase, ignoreAccent);
      if (op === 'like' || op === 'wildcard') {
        const re = compilePattern(needle, op);
        for (let c = 0; c < size; c++) {
          const s = folded[c];
          out[c] = s != null && re.test(s) ? 1 : 0;
        }
        return out;
      }
      const negate = op.startsWith('doesNot') ? 1 : 0;
      const kind = op === 'contains' || op === 'doesNotContain' ? 0 : op === 'startsWith' || op === 'doesNotStartWith' ? 1 : 2;
      for (let c = 0; c < size; c++) {
        const s = folded[c];
        // Null cells match neither the operator nor its negation.
        if (s == null) continue;
        const hit = kind === 0 ? s.includes(needle) : kind === 1 ? s.startsWith(needle) : s.endsWith(needle);
        out[c] = (hit ? 1 : 0) ^ negate;
      }
      return out;
    }
    default:
      return comparisonPass(op, cond, keys, column, env, matchCase, ignoreAccent, out);
  }
}

function comparisonPass<Row>(
  op: FilterOperator,
  cond: FilterDescriptor,
  keys: ColumnKeys,
  column: CompiledColumn<Row>,
  env: EvalEnv<Row>,
  matchCase: boolean,
  ignoreAccent: boolean,
  out: Uint8Array,
): Uint8Array {
  const size = keys.values.length;
  const blank = keys.blank;
  const type = column.type;
  const domain: Domain = keys.nums === null ? 'string' : type === 'date' ? 'day' : 'number';
  const strings = domain === 'string' ? getFoldedStrings(keys, !matchCase, ignoreAccent) : null;
  const nums = domain === 'day' ? getDayKeys(keys, env.timeZone) : domain === 'number' ? (keys.nums as Float64Array) : null;
  const toKey = (v: unknown): string | number | null => {
    if (v == null) return null;
    if (domain === 'string') return foldText(String(v), !matchCase, ignoreAccent);
    if (domain === 'day') return filterDayKey(v, env.timeZone);
    if (type === 'boolean' || type === 'selection') return parseBoolean(v);
    if (type === 'date' || type === 'datetime') return toDate(v)?.getTime() ?? Number.NaN;
    return typeof v === 'number' ? v : v === '' ? Number.NaN : Number(v);
  };
  const isNullCell = (c: number): boolean => blank[c] === Blank.Null || blank[c] === Blank.Undefined;
  switch (op) {
    case 'equal':
    case 'notEqual': {
      const target = toKey(cond.value);
      const negate = op === 'notEqual' ? 1 : 0;
      for (let c = 0; c < size; c++) {
        let hit: boolean;
        if (target === null) hit = isNullCell(c);
        else if (strings) hit = strings[c] === target;
        else hit = (nums as Float64Array)[c] === target;
        out[c] = (hit ? 1 : 0) ^ negate;
      }
      return out;
    }
    case 'in':
    case 'notIn': {
      const list = Array.isArray(cond.value) ? cond.value : [cond.value];
      const set = new Set<string | number>();
      let blanks = false;
      for (const v of list) {
        const k = toKey(v);
        if (k === null || k === '') blanks = true;
        if (k !== null) set.add(k);
      }
      const negate = op === 'notIn' ? 1 : 0;
      for (let c = 0; c < size; c++) {
        const hit = blank[c] !== Blank.None ? blanks : strings ? set.has(strings[c] as string) : set.has((nums as Float64Array)[c] as number);
        out[c] = (hit ? 1 : 0) ^ negate;
      }
      return out;
    }
    case 'between': {
      const pair = Array.isArray(cond.value) ? cond.value : [];
      const lo = toKey(pair[0]);
      const hi = toKey(pair[1]);
      for (let c = 0; c < size; c++) {
        if (isNullCell(c)) continue;
        const v = strings ? strings[c] : (nums as Float64Array)[c];
        if (v == null || (typeof v === 'number' && Number.isNaN(v))) continue;
        out[c] = (lo === null || v >= lo) && (hi === null || v <= hi) ? 1 : 0;
      }
      return out;
    }
    default: {
      const target = toKey(cond.value);
      if (target === null || (typeof target === 'number' && Number.isNaN(target))) return out;
      for (let c = 0; c < size; c++) {
        if (isNullCell(c)) continue;
        const v = strings ? strings[c] : (nums as Float64Array)[c];
        if (v == null || (typeof v === 'number' && Number.isNaN(v))) continue;
        let hit: boolean;
        switch (op) {
          case 'greaterThan':
            hit = v > target;
            break;
          case 'greaterThanOrEqual':
            hit = v >= target;
            break;
          case 'lessThan':
            hit = v < target;
            break;
          default:
            hit = v <= target;
        }
        out[c] = hit ? 1 : 0;
      }
      return out;
    }
  }
}

// ---------------------------------------------------------------------------
// Compilation and evaluation
// ---------------------------------------------------------------------------

/** A pass table over one column's codes, or a row test for cross-column groups. */
type Term =
  | { readonly kind: 'codes'; readonly columnId: ColumnId; readonly codes: Int32Array; readonly pass: Uint8Array; readonly ratio: number }
  | { readonly kind: 'row'; readonly test: (row: number) => boolean };

function combine(target: Uint8Array, next: Uint8Array, predicate: 'and' | 'or'): void {
  if (predicate === 'or') for (let c = 0; c < target.length; c++) target[c] = (target[c] as number) | (next[c] as number);
  else for (let c = 0; c < target.length; c++) target[c] = (target[c] as number) & (next[c] as number);
}

function codesTerm(columnId: ColumnId, keys: ColumnKeys, pass: Uint8Array): Term {
  let ones = 0;
  for (let c = 0; c < pass.length; c++) ones += pass[c] as number;
  return { kind: 'codes', columnId, codes: keys.codes, pass, ratio: pass.length ? ones / pass.length : 1 };
}

/** Folds conditions on one column (left to right by predicate) into one pass table. */
function columnTerm<Row>(columnId: ColumnId, conditions: readonly FilterDescriptor[], env: EvalEnv<Row>): Term | null {
  const column = env.columns.byId.get(columnId);
  if (!column?.leaf) return null; // unknown columns never drop rows
  const keys = getColumnKeys(env.rows, column);
  let pass: Uint8Array | null = null;
  for (const cond of conditions) {
    const next = conditionPass(cond, keys, column, env);
    if (pass === null) pass = next;
    else combine(pass, next, cond.predicate);
  }
  return pass ? codesTerm(columnId, keys, pass) : null;
}

function termTest(term: Term): (row: number) => boolean {
  if (term.kind === 'row') return term.test;
  const { codes, pass } = term;
  return (r) => pass[codes[r] as number] === 1;
}

/** Whether one source row passes every term. */
function rowTest(terms: readonly Term[]): (row: number) => boolean {
  const tests = terms.map(termTest);
  if (tests.length === 1) return tests[0] as (row: number) => boolean;
  return (r) => {
    for (let i = 0; i < tests.length; i++) if (!(tests[i] as (row: number) => boolean)(r)) return false;
    return true;
  };
}

/**
 * A group combines its members with its own `predicate` (`{ predicate: 'or',
 * filters: [A, B] }` is A OR B); member
 * predicates are ignored inside groups.
 */
function groupTerm<Row>(group: FilterGroupDescriptor, env: EvalEnv<Row>): Term | null {
  const term = combinedTerm(group, env);
  if (!term || !group.not) return term;
  // NOT: the inverted row test (a negated group leaves the folded pass-table path).
  const test = termTest(term);
  return { kind: 'row', test: (r) => !test(r) };
}

function combinedTerm<Row>(group: FilterGroupDescriptor, env: EvalEnv<Row>): Term | null {
  const op = group.predicate === 'or' ? 'or' : 'and';
  const children: Term[] = [];
  for (const child of group.filters) {
    const term = isGroup(child) ? groupTerm(child, env) : columnTerm(child.columnId, [child], env);
    if (term) children.push(term);
  }
  if (children.length === 0) return null;
  const first = children[0] as Term;
  if (children.length === 1) return first;
  // Single-column group: fold the pass tables.
  if (children.every((c) => c.kind === 'codes' && c.columnId === (first as { columnId?: string }).columnId)) {
    const head = first as Extract<Term, { kind: 'codes' }>;
    const pass = head.pass.slice();
    for (let i = 1; i < children.length; i++) combine(pass, (children[i] as Extract<Term, { kind: 'codes' }>).pass, op);
    const column = env.columns.byId.get(head.columnId) as CompiledColumn<Row>;
    return codesTerm(head.columnId, getColumnKeys(env.rows, column), pass);
  }
  const tests = children.map(termTest);
  const n = tests.length;
  return {
    kind: 'row',
    test:
      op === 'or'
        ? (r) => {
            for (let i = 0; i < n; i++) if ((tests[i] as (r: number) => boolean)(r)) return true;
            return false;
          }
        : (r) => {
            for (let i = 0; i < n; i++) if (!(tests[i] as (r: number) => boolean)(r)) return false;
            return true;
          },
  };
}

/** Top-level structure: conditions grouped by column (first-appearance order), plus groups. */
function partition(filters: readonly FilterEntry[]): { byColumn: Map<ColumnId, FilterDescriptor[]>; groups: FilterGroupDescriptor[] } {
  const byColumn = new Map<ColumnId, FilterDescriptor[]>();
  const groups: FilterGroupDescriptor[] = [];
  for (const entry of filters) {
    if (isGroup(entry)) {
      groups.push(entry);
      continue;
    }
    let list = byColumn.get(entry.columnId);
    if (!list) {
      list = [];
      byColumn.set(entry.columnId, list);
    }
    list.push(entry);
  }
  return { byColumn, groups };
}

function groupColumns(group: FilterGroupDescriptor, out: Set<ColumnId>): Set<ColumnId> {
  for (const child of group.filters) {
    if (isGroup(child)) groupColumns(child, out);
    else out.add(child.columnId);
  }
  return out;
}

function compileTerms<Row>(filters: readonly FilterEntry[], env: EvalEnv<Row>, excludeColumn: ColumnId | null): Term[] {
  const { byColumn, groups } = partition(filters);
  const used = new Set<ColumnId>(byColumn.keys());
  for (const g of groups) groupColumns(g, used);
  if (used.size > 1) {
    const cols: CompiledColumn<Row>[] = [];
    for (const id of used) {
      const col = env.columns.byId.get(id);
      if (col?.leaf) cols.push(col);
    }
    ensureColumnKeys(env.rows, cols);
  }
  const terms: Term[] = [];
  for (const [columnId, conditions] of byColumn) {
    if (columnId === excludeColumn) continue;
    const term = columnTerm(columnId, conditions, env);
    if (term && !(term.kind === 'codes' && term.ratio === 1)) terms.push(term);
  }
  for (const group of groups) {
    if (excludeColumn !== null) {
      const cols = groupColumns(group, new Set());
      if (cols.size === 1 && cols.has(excludeColumn)) continue;
    }
    const term = groupTerm(group, env);
    if (term && !(term.kind === 'codes' && term.ratio === 1)) terms.push(term);
  }
  // Most selective pass tables first; row tests last.
  terms.sort((a, b) => (a.kind === 'codes' ? a.ratio : 2) - (b.kind === 'codes' ? b.ratio : 2));
  return terms;
}

/** Applies terms to `base` (null = identity over `n` rows). Returns null when no term applies. */
function evaluate(terms: readonly Term[], base: Int32Array | null, n: number): Int32Array | null {
  if (terms.length === 0) return null;
  const len = base ? base.length : n;
  const out = new Int32Array(len);
  let w = 0;
  const first = terms[0] as Term;
  if (first.kind === 'codes') {
    const { codes, pass } = first;
    if (base) {
      for (let i = 0; i < len; i++) {
        const r = base[i] as number;
        if (pass[codes[r] as number] === 1) out[w++] = r;
      }
    } else {
      for (let r = 0; r < len; r++) if (pass[codes[r] as number] === 1) out[w++] = r;
    }
  } else {
    const test = first.test;
    for (let i = 0; i < len; i++) {
      const r = base ? (base[i] as number) : i;
      if (test(r)) out[w++] = r;
    }
  }
  // Later terms compact in place (the write index never passes the read index).
  for (let t = 1; t < terms.length && w > 0; t++) {
    const term = terms[t] as Term;
    const m = w;
    w = 0;
    if (term.kind === 'codes') {
      const { codes, pass } = term;
      for (let i = 0; i < m; i++) {
        const r = out[i] as number;
        if (pass[codes[r] as number] === 1) out[w++] = r;
      }
    } else {
      for (let i = 0; i < m; i++) {
        const r = out[i] as number;
        if (term.test(r)) out[w++] = r;
      }
    }
  }
  return w === len ? out : out.slice(0, w);
}

// ---------------------------------------------------------------------------
// Narrowing
// ---------------------------------------------------------------------------

function conditionNarrows(prev: FilterDescriptor, next: FilterDescriptor, state: FilterState): boolean {
  if (prev.columnId !== next.columnId || prev.operator !== next.operator) return false;
  if ((prev.matchCase ?? state.caseSensitive) !== (next.matchCase ?? state.caseSensitive)) return false;
  if ((prev.ignoreAccent ?? state.ignoreAccent) !== (next.ignoreAccent ?? state.ignoreAccent)) return false;
  const op = normalizeFilterOperator(next.operator);
  if (op === 'in' || op === 'notIn') {
    if (!Array.isArray(prev.value) || !Array.isArray(next.value)) return false;
    const a = new Set(prev.value.map((v) => stableStringify(v)));
    const b = new Set(next.value.map((v) => stableStringify(v)));
    const [small, large] = op === 'in' ? [b, a] : [a, b];
    for (const v of small) if (!large.has(v)) return false;
    return true;
  }
  if (typeof prev.value !== 'string' || typeof next.value !== 'string') return false;
  const ignoreCase = !(next.matchCase ?? state.caseSensitive);
  const ignoreAccent = next.ignoreAccent ?? state.ignoreAccent;
  const p = foldText(prev.value, ignoreCase, ignoreAccent);
  const n = foldText(next.value, ignoreCase, ignoreAccent);
  switch (op) {
    case 'contains':
      return n.includes(p);
    case 'startsWith':
      return n.startsWith(p);
    case 'endsWith':
      return n.endsWith(p);
    case 'doesNotContain':
      return p.includes(n);
    case 'doesNotStartWith':
      return p.startsWith(n);
    case 'doesNotEndWith':
      return p.endsWith(n);
    default:
      return false;
  }
}

/** True when every row passing `next` also passes `prev`, so `next` can run over the previous result. */
export function filtersNarrow<Row>(
  prev: readonly FilterEntry[],
  next: readonly FilterEntry[],
  state: FilterState,
  columns?: ColumnSnapshot<Row>,
): boolean {
  if (prev.length === 0) return true;
  const a = partition(prev);
  const b = partition(next);
  for (const [columnId, conditions] of a.byColumn) {
    const other = b.byColumn.get(columnId);
    if (!other) return false;
    if (stableStringify(conditions) === stableStringify(other)) continue;
    if (conditions.length !== 1 || other.length !== 1) return false;
    // A filterComparator is opaque: a longer needle need not narrow.
    if (columns?.byId.get(columnId)?.def.filterComparator !== undefined) return false;
    if (!conditionNarrows(conditions[0] as FilterDescriptor, other[0] as FilterDescriptor, state)) return false;
  }
  if (a.groups.length) {
    const groups = new Set(b.groups.map((g) => stableStringify(g)));
    for (const g of a.groups) if (!groups.has(stableStringify(g))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Normalization (command validation)
// ---------------------------------------------------------------------------

function normalizeEntries<Row>(
  entries: unknown,
  ctx: ModuleContext<Row>,
  custom: Readonly<Record<string, CustomFilterOperator<Row>>>,
): FilterEntry[] | CommandRejection {
  if (!Array.isArray(entries)) return ctx.reject('invalidFilters');
  const out: FilterEntry[] = [];
  for (const raw of entries as unknown[]) {
    if (typeof raw !== 'object' || raw === null) return ctx.reject('invalidFilters');
    const entry = raw as Omit<Partial<FilterConditionInput>, 'kind'> & { kind?: string; filters?: unknown };
    if (entry.kind === 'group') {
      const children = normalizeEntries(entry.filters, ctx, custom);
      if (!Array.isArray(children)) return children;
      out.push({ kind: 'group', predicate: entry.predicate === 'or' ? 'or' : 'and', ...((entry as { not?: unknown }).not === true ? { not: true } : {}), filters: children, ...(entry.source ? { source: entry.source } : {}) });
      continue;
    }
    const cond = normalizeCondition(entry as Partial<FilterConditionInput>, ctx, custom);
    if (!('columnId' in cond)) return cond;
    out.push(cond);
  }
  return out;
}

function normalizeCondition<Row>(
  entry: Partial<FilterConditionInput>,
  ctx: ModuleContext<Row>,
  custom: Readonly<Record<string, CustomFilterOperator<Row>>>,
): FilterDescriptor | CommandRejection {
  if (typeof entry.columnId !== 'string' || typeof entry.operator !== 'string') return ctx.reject('invalidFilters');
  const column = resolveLeaf(ctx.getColumns(), entry.columnId);
  if (!column) {
    ctx.warn('column-unknown', `filter: no column matches "${entry.columnId}".`);
    return ctx.reject('unknownColumn');
  }
  if (!column.flags.allowFiltering) return ctx.reject('columnNotFilterable');
  const operator = normalizeFilterOperator(entry.operator) ?? (Object.prototype.hasOwnProperty.call(custom, entry.operator) ? entry.operator : null);
  if (operator === null) {
    ctx.warn('filter-operator-unknown', `filter: unknown operator "${entry.operator}"; register custom operators with createFilterModule({ operators }).`);
    return ctx.reject('unknownOperator');
  }
  const cond: { -readonly [K in keyof FilterDescriptor]: FilterDescriptor[K] } = {
    columnId: column.columnId,
    operator,
    value: entry.value === undefined ? null : entry.value,
    predicate: entry.predicate === 'or' ? 'or' : 'and',
    source: entry.source ?? 'api',
  };
  if (entry.matchCase !== undefined) cond.matchCase = entry.matchCase;
  if (entry.ignoreAccent !== undefined) cond.ignoreAccent = entry.ignoreAccent;
  return cond;
}

function entryColumns(entry: FilterEntry): Set<ColumnId> {
  return isGroup(entry) ? groupColumns(entry, new Set()) : new Set([entry.columnId]);
}

function withFilters<Row>(state: FilterState, filters: readonly FilterEntry[], ctx: ModuleContext<Row>): FilterState {
  if (stableStringify(filters) === stableStringify(state.filters)) return state;
  requestFirstPage(ctx);
  return Object.freeze({ ...state, filters: filters.length ? freezeJsonCopy([...filters]) : EMPTY });
}

function isRejection(value: unknown): value is CommandRejection {
  return typeof value === 'object' && value !== null && (value as { rejected?: unknown }).rejected === true;
}

// ---------------------------------------------------------------------------
// Facets
// ---------------------------------------------------------------------------

interface FacetBase {
  readonly filters: readonly FilterEntry[];
  readonly column: object;
  readonly counts: Int32Array;
  readonly own: Uint8Array | null;
  readonly rowCount: number;
  readonly results: Map<string, ColumnFacet>;
}

const DEFAULT_FACET_LIMIT = 1000;

function facetValue(keys: ColumnKeys, code: number, type: string): { key: string; value: Json } {
  const v = keys.values[code];
  if (keys.nums) {
    const n = keys.nums[code] as number;
    if (type === 'date' || type === 'datetime') {
      return Number.isNaN(n) ? { key: `s:${String(v)}`, value: String(v) } : { key: `d:${n}`, value: new Date(n).toISOString() };
    }
    if (type === 'boolean' || type === 'selection') return { key: `b:${n === 1}`, value: Number.isNaN(n) ? String(v) : n === 1 };
    return Number.isFinite(n) ? { key: `n:${n}`, value: n } : { key: `s:${String(v)}`, value: String(v) };
  }
  return { key: `s:${String(v)}`, value: typeof v === 'string' ? v : String(v) };
}

function computeFacet<Row>(
  input: RowModelSnapshot<Row>,
  column: CompiledColumn<Row>,
  state: FilterState,
  env: EvalEnv<Row>,
): FacetBase {
  const keys = getColumnKeys(input.source, column);
  const terms = compileTerms(state.filters, env, column.columnId);
  const candidates = evaluate(terms, input.order, input.count) ?? input.order;
  const counts = new Int32Array(keys.values.length);
  const codes = keys.codes;
  let rowCount: number;
  if (candidates) {
    rowCount = candidates.length;
    for (let i = 0; i < candidates.length; i++) counts[codes[candidates[i] as number] as number]!++;
  } else {
    rowCount = input.count;
    for (let r = 0; r < input.count; r++) counts[codes[r] as number]!++;
  }
  const own = partition(state.filters).byColumn.get(column.columnId);
  const ownTerm = own ? columnTerm(column.columnId, own, env) : null;
  return {
    filters: state.filters,
    column,
    counts,
    own: ownTerm?.kind === 'codes' ? ownTerm.pass : null,
    rowCount,
    results: new Map(),
  };
}

/** Folded facet labels per (column keys, compiled column, accent mode): checklist search folds each label once. */
const foldedLabels = new WeakMap<object, Map<unknown, string[]>>();

function foldedLabel<Row>(keys: ColumnKeys, column: CompiledColumn<Row>, rows: readonly Row[], code: number, ignoreAccent: boolean): string {
  let byColumn = foldedLabels.get(keys);
  if (!byColumn) {
    byColumn = new Map();
    foldedLabels.set(keys, byColumn);
  }
  const slot = ignoreAccent ? `a:${column.columnId}` : column.columnId;
  let list = byColumn.get(slot);
  if (!list || (list as unknown as { column?: unknown }).column !== column) {
    list = new Array<string>(keys.values.length);
    (list as unknown as { column?: unknown }).column = column;
    byColumn.set(slot, list);
  }
  let folded = list[code];
  if (folded === undefined) {
    folded = foldText(getLabel(keys, column, rows, code), true, ignoreAccent);
    list[code] = folded;
  }
  return folded;
}

function buildFacet<Row>(
  base: FacetBase,
  keys: ColumnKeys,
  column: CompiledColumn<Row>,
  rows: readonly Row[],
  locale: string,
  options: FacetOptions,
  ignoreAccent: boolean,
  timeZone: string | undefined,
): ColumnFacet {
  const ranks = getSortRanks(keys, locale).byCode;
  const { counts, own } = base;
  const search = options.search ? foldText(options.search, true, ignoreAccent) : '';
  const codes: number[] = [];
  let blankCount = 0;
  let blankSelected = own === null;
  for (let c = 0; c < counts.length; c++) {
    if ((counts[c] as number) === 0) continue;
    if (keys.blank[c] !== Blank.None) {
      blankCount += counts[c] as number;
      if (own && own[c] === 1) blankSelected = true;
      continue;
    }
    if (search && !foldedLabel(keys, column, rows, c, ignoreAccent).includes(search)) continue;
    codes.push(c);
  }
  codes.sort((a, b) => (ranks[a] as number) - (ranks[b] as number) || a - b);
  // Date columns bucket by calendar day (filters on them compare days too).
  interface Group {
    readonly code: number;
    count: number;
    selected: boolean;
    readonly day: number;
  }
  const groups: Group[] = [];
  const days = column.type === 'date' ? getDayKeys(keys, timeZone) : null;
  const byDay = new Map<number, Group>();
  for (const c of codes) {
    const selected = own === null || own[c] === 1;
    const day = days ? (days[c] as number) : Number.NaN;
    const hit = days ? byDay.get(day) : undefined;
    if (hit) {
      hit.count += counts[c] as number;
      hit.selected ||= selected;
      continue;
    }
    const g: Group = { code: c, count: counts[c] as number, selected, day };
    if (days) byDay.set(day, g);
    groups.push(g);
  }
  const values: FacetValue[] = [];
  if (blankCount > 0 && !search) {
    values.push(Object.freeze({ key: BLANK_FACET_KEY, value: null, label: '', count: blankCount, blank: true, selected: blankSelected }));
  }
  const distinctCount = values.length + groups.length;
  let selectedCount = values.length && blankSelected ? 1 : 0;
  for (const g of groups) if (g.selected) selectedCount++;
  const offset = Math.max(0, options.offset ?? 0);
  const limit = Math.max(0, options.limit ?? DEFAULT_FACET_LIMIT);
  const page: FacetValue[] = [];
  for (let i = offset; i < distinctCount && page.length < limit; i++) {
    if (i < values.length) {
      page.push(values[i] as FacetValue);
      continue;
    }
    const g = groups[i - values.length] as Group;
    let { key, value } = facetValue(keys, g.code, column.type);
    if (days && !Number.isNaN(g.day)) {
      const iso = `${String(Math.floor(g.day / 10000)).padStart(4, '0')}-${String(Math.floor(g.day / 100) % 100).padStart(2, '0')}-${String(g.day % 100).padStart(2, '0')}`;
      key = `d:${iso}`;
      value = iso;
    }
    page.push(
      Object.freeze({
        key,
        value,
        label: getLabel(keys, column, rows, g.code),
        count: g.count,
        blank: false,
        selected: g.selected,
      }),
    );
  }
  return Object.freeze({
    columnId: column.columnId,
    status: 'ready',
    values: Object.freeze(page),
    distinctCount,
    selectedCount,
    rowCount: base.rowCount,
    truncated: offset + page.length < distinctCount,
    stale: false,
    error: null,
  });
}

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

/**
 * Creates the `filter` module. Options are read from `options.filter`
 * (`FilterOptions`); initial filters from `options.defaultQuery.filters`.
 * Create one module instance per engine (custom operators are per instance).
 */
export function createFilterModule<Row>(config: FilterModuleConfig<Row> = {}): FilterModule<Row> {
  const custom: Readonly<Record<string, CustomFilterOperator<Row>>> = Object.freeze({ ...(config.operators ?? {}) });
  // Previous result per stage input, for narrowing. Keyed by row model identity, so it is per engine.
  const previous = new WeakMap<RowModelSnapshot<Row>, { filters: readonly FilterEntry[]; state: FilterState; order: Int32Array | null }>();
  const facets = new WeakMap<RowModelSnapshot<Row>, Map<ColumnId, FacetBase>>();

  const filteredRows = new WeakMap<RowModelSnapshot<Row>, readonly Row[]>();
  const methods: FilterMethods<Row> = {
    getFilteredRows(ctx) {
      let model: RowModelSnapshot<Row> | undefined;
      for (const name of AFTER_SORT) {
        model = ctx.getStageInput(name);
        if (model) break;
      }
      model ??= ctx.getRows();
      let rows = filteredRows.get(model);
      if (!rows) {
        const out: Row[] = [];
        const { source, order, view } = model;
        // With a view, `order` is the data order the view windows into.
        if (order) for (let i = 0, n = view ? order.length : model.count; i < n; i++) out.push(source[order[i] as number] as Row);
        else if (view) {
          for (let i = 0; i < view.count; i++) {
            const at = view.sourceIndexAt(i);
            if (at >= 0) out.push(source[at] as Row);
          }
        } else for (let i = 0; i < model.count; i++) out.push(source[i] as Row);
        rows = Object.freeze(out);
        filteredRows.set(model, rows);
      }
      return rows;
    },
    getFacet(ctx, columnKey, options = {}) {
      const column = resolveLeaf(ctx.getColumns(), columnKey);
      const input = ctx.getStageInput('filter');
      const state = ctx.getModuleState<FilterState>('filter');
      if (!column || !input || !state) return undefined;
      const snapshot = ctx.getSnapshot();
      if (snapshot.data.performed.includes('filter')) {
        return Object.freeze({
          columnId: column.columnId,
          status: 'unavailable',
          values: EMPTY,
          distinctCount: 0,
          selectedCount: 0,
          rowCount: 0,
          truncated: false,
          stale: false,
          error: null,
        });
      }
      let byColumn = facets.get(input);
      if (!byColumn) {
        byColumn = new Map();
        facets.set(input, byColumn);
      }
      let base = byColumn.get(column.columnId);
      if (!base || base.filters !== state.filters || base.column !== column) {
        const env: EvalEnv<Row> = { rows: input.source, columns: ctx.getColumns(), state, timeZone: ctx.timeZone, custom };
        base = computeFacet(input, column, state, env);
        byColumn.set(column.columnId, base);
      }
      const optionsKey = `${options.search ?? ''}\u0000${options.offset ?? 0}\u0000${options.limit ?? DEFAULT_FACET_LIMIT}\u0000${snapshot.locale}`;
      let result = base.results.get(optionsKey);
      if (!result) {
        result = buildFacet(base, getColumnKeys(input.source, column), column, input.source, snapshot.locale, options, state.ignoreAccent, ctx.timeZone);
        base.results.set(optionsKey, result);
      }
      return result;
    },
  };

  return defineDataGridModule<Row, FilterState, FilterCommand, 'filter', FilterMethods<Row>>({
    name: 'filter',
    commands: ['filter.set', 'filter.byColumn', 'filter.add', 'filter.remove', 'filter.clear', 'filter.setOptions'],
    initialState(options: DataGridOptions<Row>): FilterState {
      const o = (options['filter'] ?? {}) as FilterOptions;
      const filters = options.defaultQuery?.filters ?? EMPTY;
      return Object.freeze({
        filters: filters.length ? freezeJsonCopy([...filters]) : EMPTY,
        enabled: o.enabled ?? true,
        caseSensitive: o.caseSensitive ?? false,
        ignoreAccent: o.ignoreAccent ?? false,
      });
    },
    reduce(state, command, ctx) {
      if (command.type === 'filter.setOptions') {
        for (const key of ['enabled', 'caseSensitive', 'ignoreAccent'] as const) {
          if (command[key] !== undefined && typeof command[key] !== 'boolean') return ctx.reject('invalidOption');
        }
        const next = {
          enabled: command.enabled ?? state.enabled,
          caseSensitive: command.caseSensitive ?? state.caseSensitive,
          ignoreAccent: command.ignoreAccent ?? state.ignoreAccent,
        };
        if (next.enabled === state.enabled && next.caseSensitive === state.caseSensitive && next.ignoreAccent === state.ignoreAccent) return state;
        return Object.freeze({ ...state, ...next });
      }
      if (command.type === 'filter.clear') {
        if (!command.columnIds) return withFilters(state, EMPTY, ctx);
        const ids = new Set(command.columnIds.map((k) => resolveLeaf(ctx.getColumns(), k)?.columnId ?? k));
        return withFilters(
          state,
          state.filters.filter((e) => ![...entryColumns(e)].some((id) => ids.has(id))),
          ctx,
        );
      }
      if (command.type === 'filter.remove') {
        const id = resolveLeaf(ctx.getColumns(), command.columnId)?.columnId ?? command.columnId;
        return withFilters(
          state,
          state.filters.filter((e) => {
            const cols = entryColumns(e);
            return !(cols.size === 1 && cols.has(id));
          }),
          ctx,
        );
      }
      if (!state.enabled) return ctx.reject('filteringDisabled');
      switch (command.type) {
        case 'filter.set':
        case 'filter.add': {
          const entries = normalizeEntries(command.filters, ctx, custom);
          if (isRejection(entries)) return entries;
          return withFilters(state, command.type === 'filter.set' ? entries : [...state.filters, ...entries], ctx);
        }
        case 'filter.byColumn': {
          const operator = normalizeFilterOperator(command.operator);
          const values =
            Array.isArray(command.value) && operator !== 'in' && operator !== 'notIn' && operator !== 'between'
              ? command.value
              : [command.value ?? null];
          const conditions: FilterDescriptor[] = [];
          for (let i = 0; i < values.length; i++) {
            const cond = normalizeCondition(
              {
                columnId: command.columnId,
                operator: command.operator,
                value: values[i] as Json,
                predicate: i === 0 ? (command.predicate ?? 'and') : 'or',
                source: command.source ?? 'api',
                ...(command.matchCase !== undefined ? { matchCase: command.matchCase } : {}),
                ...(command.ignoreAccent !== undefined ? { ignoreAccent: command.ignoreAccent } : {}),
              },
              ctx,
              custom,
            );
            if (isRejection(cond)) return cond;
            conditions.push(cond);
          }
          const id = (conditions[0] as FilterDescriptor).columnId;
          const kept = state.filters.filter((e) => isGroup(e) || e.columnId !== id);
          // Keep the column's position among top-level entries.
          const at = state.filters.findIndex((e) => !isGroup(e) && e.columnId === id);
          const next = [...kept];
          next.splice(at < 0 ? next.length : Math.min(at, next.length), 0, ...conditions);
          return withFilters(state, next, ctx);
        }
        default:
          return state;
      }
    },
    extendQuery(query, state) {
      return query.filters === state.filters ? query : Object.freeze({ ...query, filters: state.filters });
    },
    notify(prev, next) {
      const headers = new Set<ColumnId>();
      for (const e of prev.filters) for (const id of entryColumns(e)) headers.add(id);
      for (const e of next.filters) for (const id of entryColumns(e)) headers.add(id);
      return { grid: true, headers: [...headers] };
    },
    selectors: {
      filters: (snapshot) => snapshot.query.filters,
    },
    methods,
    pipeline: [
      acceptMappedDeltas({
        name: 'filter',
        key: (query, state) => [query.filters, state.caseSensitive, state.ignoreAccent],
        run(input: RowModelSnapshot<Row>, ctx) {
          const filters = ctx.query.filters;
          if (filters.length === 0) return input;
          const state = ctx.state;
          const env: EvalEnv<Row> = { rows: input.source, columns: ctx.columns, state, timeZone: ctx.timeZone, custom };
          const prev = previous.get(input);
          const narrow =
            prev !== undefined &&
            prev.state.caseSensitive === state.caseSensitive &&
            prev.state.ignoreAccent === state.ignoreAccent &&
            filtersNarrow(prev.filters, filters, state, ctx.columns);
          const terms = compileTerms(filters, env, null);
          let order: Int32Array | null;
          if (narrow) {
            const base = prev.order;
            order = evaluate(terms, base, input.count) ?? base;
          } else {
            order = evaluate(terms, input.order, input.count) ?? input.order;
          }
          previous.set(input, { filters, state, order });
          if (order === input.order) return input;
          if (order === null) return input;
          if (isAscendingModel(input)) markAscending(order);
          // A narrowing pass that kept everything may return the previous array; copy-free reuse is fine
          // because orders are never written after creation.
          return createRowModel(input, order);
        },
        update(input: RowModelSnapshot<Row>, prior, delta, ctx) {
          const filters = ctx.query.filters;
          if (filters.length === 0) return input;
          const state = ctx.state;
          const env: EvalEnv<Row> = { rows: input.source, columns: ctx.columns, state, timeZone: ctx.timeZone, custom };
          // Pass tables are per distinct value: recompiling picks up new dictionary entries for a few microseconds.
          const terms = compileTerms(filters, env, null);
          if (terms.length === 0) {
            previous.set(input, { filters, state, order: input.order });
            return input;
          }
          const order = updateSubset(input, prior.output, delta, rowTest(terms));
          if (!order) return undefined;
          previous.set(input, { filters, state, order });
          return createRowModel(input, order);
        },
      }),
    ],
  });
}

/** Top-level conditions on one column (filter bar / menu state for renderers). */
export function getColumnFilters(filters: readonly FilterEntry[], columnId: ColumnId): readonly FilterDescriptor[] {
  return filters.filter((e): e is FilterDescriptor => !isGroup(e) && e.columnId === columnId);
}
