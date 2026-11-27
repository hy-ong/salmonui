// Pre-extracted, dictionary-encoded column keys shared by the sort, filter,
// search, and facet code paths. Keys are built once per (data identity,
// column accessor, column type) and reused by every query that reads the
// column, so typing into a filter or switching sort direction never calls
// accessors again. The data identity starts as the source rows array and
// moves to the next array when the engine reports an incremental change
// (`advanceColumnKeys`): only the changed rows are re-encoded, new distinct
// values are appended to the dictionary, and sort ranks are repaired in
// place.

import { toDate } from '@salmonui/core/format';
import { dirtyRows, mappedIndexes } from './row-delta.js';
import type { ColumnType, CompiledColumn, RowDelta } from './types.js';

/** Blank classification per dictionary code. */
export const Blank = Object.freeze({ None: 0, Null: 1, Undefined: 2, Empty: 3 } as const);

export interface SortRanks {
  /** Rank per dictionary code (length >= the dictionary size); 0 is reserved for null/undefined/NaN. */
  byCode: Int32Array;
  /** Number of distinct ranks (including rank 0). */
  count: number;
  /** Rank -> comparison key of the values holding it (index 0 unused). */
  readonly reps: (number | string)[];
  /** Rank per source row, built on first use (`getRowRanks`). */
  byRow: Int32Array | null;
  /**
   * Codes below this have ranks. Codes appended by incremental changes are
   * ranked in one batch on the next `getSortRanks` call, so data patches never
   * pay for rank maintenance.
   */
  rankedSize: number;
}

/**
 * Dictionary encoding of one column over one source array: every source row
 * maps to a code; per-code arrays hold the representative value and derived
 * keys. Predicates and comparisons run once per distinct value, then per row
 * as a typed-array lookup. Typed arrays may be longer than the live size:
 * `rowCount` bounds per-row arrays and `values.length` bounds per-code arrays.
 */
export interface ColumnKeys {
  readonly type: ColumnType;
  rowCount: number;
  /** Source index -> code. */
  codes: Int32Array;
  /** Code -> first raw value seen. */
  readonly values: unknown[];
  /** Code -> a row object holding the value (formatter context for labels). */
  readonly sample: unknown[];
  /** Code -> blank classification. */
  blank: Uint8Array;
  /** Code -> numeric key (number value, epoch ms, boolean 0/1); NaN when absent. Null for string columns. */
  nums: Float64Array | null;
  /** Incremented on every incremental change. */
  version: number;
  /** @internal value key -> code */
  readonly dict: Map<unknown, number>;
  /** @internal */
  readonly read: (row: unknown) => unknown;
  /** @internal top-level field read with one keyed load, or null */
  readonly field: string | null;
  /** @internal lazy caches */
  readonly lazy: {
    ranks: Map<string, SortRanks>;
    folded: Map<number, (string | null)[]>;
    days: Map<string, Float64Array>;
    labels: WeakMap<object, (string | undefined)[]>;
    rawRows: readonly unknown[] | null;
  };
}

type Accessor = (row: never) => unknown;
type KeySet = Map<unknown, Map<ColumnType, ColumnKeys>>;

const cache = new WeakMap<readonly unknown[], KeySet>();

function isDateType(type: ColumnType): boolean {
  return type === 'date' || type === 'datetime';
}

/** Accessor identity that survives recompiles of an unchanged definition. */
function accessorToken<Row>(column: CompiledColumn<Row>): unknown {
  return column.def.valueGetter ?? (column.field !== null ? `f:${column.field}` : column.accessor);
}

export function parseBoolean(value: unknown): number {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value == null || value === '') return Number.NaN;
  if (typeof value === 'number') return value === 0 ? 0 : 1;
  const s = String(value).trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return 1;
  if (s === 'false' || s === '0' || s === 'no') return 0;
  return Number.NaN;
}

/** Numeric key of a value for a column type (number, epoch ms, boolean 0/1); NaN when absent. */
export function numericKey(value: unknown, type: ColumnType): number {
  if (value == null || value === '') return Number.NaN;
  switch (type) {
    case 'number':
      return typeof value === 'number' ? value : Number(value);
    case 'date':
    case 'datetime':
      return toDate(value)?.getTime() ?? Number.NaN;
    case 'boolean':
    case 'selection':
      return parseBoolean(value);
    default:
      return Number.NaN;
  }
}

function normalizeKey(v: unknown, dates: boolean): unknown {
  if (v instanceof Date) return v.getTime();
  if (dates && typeof v === 'string' && v !== '') {
    const d = toDate(v);
    if (d) return d.getTime();
  }
  return v;
}

/** Top-level field read with one keyed load instead of a closure call per row, or null. */
export function plainField<Row>(column: CompiledColumn<Row>): string | null {
  return column.def.valueGetter === undefined && column.field !== null && !column.field.includes('.') ? column.field : null;
}

function blankOf(v: unknown): number {
  return v === null ? Blank.Null : v === undefined ? Blank.Undefined : v === '' ? Blank.Empty : Blank.None;
}

// Hot loop kept flat (no method calls besides the accessor): measured ~1.5x
// faster than routing every value through a shared encode function.
function build<Row>(rows: readonly unknown[], column: CompiledColumn<Row>): ColumnKeys {
  const n = rows.length;
  const codes = new Int32Array(n);
  const map = new Map<unknown, number>();
  const values: unknown[] = [];
  const sample: unknown[] = [];
  const type = column.type;
  const dates = isDateType(type);
  const field = plainField(column);
  const read = column.accessor as (row: unknown) => unknown;
  for (let i = 0; i < n; i++) {
    let v: unknown;
    const row = rows[i];
    if (field !== null) {
      v = row == null ? undefined : (row as Record<string, unknown>)[field];
    } else {
      v = read(row);
    }
    const k = (typeof v === 'object' ? v !== null : dates) ? normalizeKey(v, dates) : v;
    let c = map.get(k);
    if (c === undefined) {
      c = values.length;
      map.set(k, c);
      values.push(v);
      sample.push(row);
    }
    codes[i] = c;
  }
  return finish(type, n, codes, values, sample, map, read, field);
}

function finish(
  type: ColumnType,
  n: number,
  codes: Int32Array,
  values: unknown[],
  sample: unknown[],
  dict: Map<unknown, number>,
  read: (row: unknown) => unknown,
  field: string | null,
): ColumnKeys {
  const size = values.length;
  const blank = new Uint8Array(size);
  const nums = type === 'string' ? null : new Float64Array(size);
  for (let c = 0; c < size; c++) {
    const v = values[c];
    blank[c] = blankOf(v);
    if (nums) nums[c] = numericKey(v, type);
  }
  return {
    type,
    rowCount: n,
    codes,
    values,
    sample,
    blank,
    nums,
    version: 0,
    dict,
    read,
    field,
    lazy: { ranks: new Map(), folded: new Map(), days: new Map(), labels: new WeakMap(), rawRows: null },
  };
}

function slot<Row>(rows: readonly Row[], column: CompiledColumn<Row>, create: boolean): Map<ColumnType, ColumnKeys> | undefined {
  let byAccessor = cache.get(rows);
  if (!byAccessor) {
    if (!create) return undefined;
    byAccessor = new Map();
    cache.set(rows, byAccessor);
  }
  const token = accessorToken(column);
  let byType = byAccessor.get(token);
  if (!byType && create) {
    byType = new Map();
    byAccessor.set(token, byType);
  }
  return byType;
}

/** Dictionary-encoded keys of `column` over `rows`, built once and cached by data identity. */
export function getColumnKeys<Row>(rows: readonly Row[], column: CompiledColumn<Row>): ColumnKeys {
  const byType = slot(rows, column, true) as Map<ColumnType, ColumnKeys>;
  let keys = byType.get(column.type);
  if (!keys) {
    keys = build(rows, column);
    byType.set(column.type, keys);
  }
  return keys;
}

/** Cached keys without building them. */
export function peekColumnKeys<Row>(rows: readonly Row[], column: CompiledColumn<Row>): ColumnKeys | undefined {
  return slot(rows, column, false)?.get(column.type);
}

// Per-row numeric values (numbers, epoch ms, booleans 0/1; NaN when absent),
// cached per data identity and accessor like the keys. Aggregated number
// columns usually have near-unique values, so they skip dictionary encoding
// (a Map insert per row) and read straight into a typed array.
interface NumericValues {
  vals: Float64Array;
  readonly type: ColumnType;
  readonly read: (row: unknown) => unknown;
  readonly field: string | null;
}

const numericCache = new WeakMap<readonly unknown[], Map<unknown, NumericValues>>();

function numericToken<Row>(column: CompiledColumn<Row>): unknown {
  return column.def.valueGetter ?? `${column.type}|${column.field ?? column.columnId}`;
}

function readNumber(v: unknown, type: ColumnType): number {
  if (type === 'number') return typeof v === 'number' ? v : v == null || v === '' ? Number.NaN : Number(v);
  return numericKey(v, type);
}

/** Cached per-row numeric values of a non-string column without building them. */
export function peekNumericValues<Row>(rows: readonly Row[], column: CompiledColumn<Row>): Float64Array | undefined {
  return numericCache.get(rows)?.get(numericToken(column))?.vals;
}

/** Per-row numeric values of a column (see `NumericValues`), built once per data identity. */
export function getNumericValues<Row>(rows: readonly Row[], column: CompiledColumn<Row>): Float64Array {
  const hit = peekNumericValues(rows, column);
  if (hit) return hit;
  ensureColumnKeys(rows, [], [column]);
  return peekNumericValues(rows, column) as Float64Array;
}

/**
 * Builds the missing keys of several columns (and the missing per-row
 * numeric values of `numeric`) in one row-major pass. Reading many fields of
 * a row while it is in cache is several times faster than one full pass per
 * column on wide rows.
 */
export function ensureColumnKeys<Row>(rows: readonly Row[], columns: readonly CompiledColumn<Row>[], numeric: readonly CompiledColumn<Row>[] = []): void {
  const missing: CompiledColumn<Row>[] = [];
  const seen = new Set<unknown>();
  for (const column of columns) {
    const token = accessorToken(column);
    if (seen.has(token) || peekColumnKeys(rows, column)) continue;
    seen.add(token);
    missing.push(column);
  }
  const numericMissing: CompiledColumn<Row>[] = [];
  const seenNumeric = new Set<unknown>();
  for (const column of numeric) {
    if (column.type === 'string') continue;
    const token = numericToken(column);
    if (seenNumeric.has(token) || peekNumericValues(rows, column)) continue;
    seenNumeric.add(token);
    numericMissing.push(column);
  }
  if (missing.length + numericMissing.length === 0) return;
  if (missing.length === 1 && numericMissing.length === 0) {
    getColumnKeys(rows, missing[0] as CompiledColumn<Row>);
    return;
  }
  const n = rows.length;
  // Phase 1: one row-major pass reads every field. Plain fields go through
  // fixed-arity readers (one load site per field, so each site keeps seeing
  // one property name) into raw value arrays and typed arrays; encoding runs
  // afterwards on the gathered values, off the cache-missing loop.
  const sinks: Sink[] = [];
  const keyRaw = new Map<CompiledColumn<Row>, unknown[]>();
  const getterKeys: CompiledColumn<Row>[] = [];
  for (const column of missing) {
    const field = plainField(column);
    if (field === null) {
      getterKeys.push(column);
      continue;
    }
    const raw = new Array<unknown>(n);
    keyRaw.set(column, raw);
    sinks.push({ field, raw, num: null, type: column.type });
  }
  const numOut = new Map<CompiledColumn<Row>, Float64Array>();
  const getterNumeric: CompiledColumn<Row>[] = [];
  for (const column of numericMissing) {
    const out = new Float64Array(n);
    numOut.set(column, out);
    const field = plainField(column);
    if (field === null) getterNumeric.push(column);
    else sinks.push({ field, raw: null, num: out, type: column.type });
  }
  for (let s = 0; s < sinks.length; s += 4) readFields(rows as readonly unknown[], sinks[s] as Sink, sinks[s + 1], sinks[s + 2], sinks[s + 3]);
  if (getterKeys.length || getterNumeric.length) {
    const kReads = getterKeys.map((c) => c.accessor as (row: unknown) => unknown);
    const kRaw = getterKeys.map(() => new Array<unknown>(n));
    getterKeys.forEach((c, j) => keyRaw.set(c, kRaw[j] as unknown[]));
    const nReads = getterNumeric.map((c) => c.accessor as (row: unknown) => unknown);
    const nTypes = getterNumeric.map((c) => c.type);
    const nOuts = getterNumeric.map((c) => numOut.get(c) as Float64Array);
    for (let i = 0; i < n; i++) {
      const row = rows[i];
      for (let j = 0; j < kReads.length; j++) (kRaw[j] as unknown[])[i] = (kReads[j] as (row: unknown) => unknown)(row);
      for (let j = 0; j < nReads.length; j++) (nOuts[j] as Float64Array)[i] = readNumber((nReads[j] as (row: unknown) => unknown)(row), nTypes[j] as ColumnType);
    }
  }
  // Phase 2: dictionary-encode the key columns.
  for (const column of missing) {
    const raw = keyRaw.get(column) as unknown[];
    const codes = new Int32Array(n);
    const map = new Map<unknown, number>();
    const values: unknown[] = [];
    const samples: unknown[] = [];
    const isDate = isDateType(column.type);
    for (let i = 0; i < n; i++) {
      const v = raw[i];
      const key = (typeof v === 'object' ? v !== null : isDate) ? normalizeKey(v, isDate) : v;
      let c = map.get(key);
      if (c === undefined) {
        c = values.length;
        map.set(key, c);
        values.push(v);
        samples.push(rows[i]);
      }
      codes[i] = c;
    }
    const keys = finish(column.type, n, codes, values, samples, map, column.accessor as (row: unknown) => unknown, plainField(column));
    (slot(rows, column, true) as Map<ColumnType, ColumnKeys>).set(column.type, keys);
  }
  if (numericMissing.length) {
    let map = numericCache.get(rows);
    if (!map) {
      map = new Map();
      numericCache.set(rows, map);
    }
    for (const column of numericMissing) {
      map.set(numericToken(column), { vals: numOut.get(column) as Float64Array, type: column.type, read: column.accessor as (row: unknown) => unknown, field: plainField(column) });
    }
  }
}

interface Sink {
  readonly field: string;
  /** Raw values (key columns). */
  readonly raw: unknown[] | null;
  /** Numeric values (aggregated columns). */
  readonly num: Float64Array | null;
  readonly type: ColumnType;
}

/** Reads up to four plain fields per row; each field has its own load site and everything the loop reads is a local. */
function readFields(rows: readonly unknown[], a: Sink, b: Sink | undefined, c: Sink | undefined, d: Sink | undefined): void {
  const n = rows.length;
  const k = d ? 4 : c ? 3 : b ? 2 : 1;
  const fa = a.field;
  const fb = b ? b.field : fa;
  const fc = c ? c.field : fa;
  const fd = d ? d.field : fa;
  // Raw sinks (key columns) and number sinks (aggregated number columns); other types fix up below.
  const ra = a.raw;
  const rb = b ? b.raw : null;
  const rc = c ? c.raw : null;
  const rd = d ? d.raw : null;
  const na = a.num ?? EMPTY_F64;
  const nb = b?.num ?? EMPTY_F64;
  const nc = c?.num ?? EMPTY_F64;
  const nd = d?.num ?? EMPTY_F64;
  let fix = false;
  for (let i = 0; i < n; i++) {
    const row = rows[i] as Record<string, unknown> | null | undefined;
    if (row == null) {
      fix = true;
      continue;
    }
    const va = row[fa];
    if (ra !== null) ra[i] = va;
    else if (typeof va === 'number') na[i] = va;
    else fix = true;
    if (k === 1) continue;
    const vb = row[fb];
    if (rb !== null) rb[i] = vb;
    else if (typeof vb === 'number') nb[i] = vb;
    else fix = true;
    if (k === 2) continue;
    const vc = row[fc];
    if (rc !== null) rc[i] = vc;
    else if (typeof vc === 'number') nc[i] = vc;
    else fix = true;
    if (k === 3) continue;
    const vd = row[fd];
    if (rd !== null) rd[i] = vd;
    else if (typeof vd === 'number') nd[i] = vd;
    else fix = true;
  }
  if (!fix) {
    for (const sink of [a, b, c, d]) if (sink && sink.num && sink.type !== 'number') fixNumeric(rows, sink);
    return;
  }
  // Rare path: non-number values in number sinks, other numeric types, or missing rows.
  for (const sink of [a, b, c, d]) if (sink && sink.num) fixNumeric(rows, sink);
}

const EMPTY_F64 = new Float64Array(0);

function fixNumeric(rows: readonly unknown[], sink: Sink): void {
  const out = sink.num as Float64Array;
  const field = sink.field;
  const type = sink.type;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, unknown> | null | undefined;
    const v = row == null ? undefined : row[field];
    out[i] = typeof v === 'number' && type === 'number' ? v : readNumber(v, type);
  }
}

/** Carries numeric values to `next`: removed rows compacted out, changed and appended rows re-read. */
function advanceNumeric(previous: readonly unknown[], next: readonly unknown[], delta: RowDelta, dirty: Int32Array): void {
  const set = numericCache.get(previous);
  if (!set || numericCache.has(next)) return;
  numericCache.delete(previous);
  numericCache.set(next, set);
  const removed = delta.removed;
  const map = mappedIndexes(delta);
  for (const entry of set.values()) {
    const prev = entry.vals;
    if (prev.length !== delta.previousCount) {
      entry.vals = new Float64Array(0);
      continue;
    }
    const out = new Float64Array(delta.count);
    if (map) {
      // Reorder: carried rows take their value to the new index.
      for (let i = 0; i < map.length; i++) {
        const m = map[i] as number;
        if (m >= 0) out[m] = prev[i] as number;
      }
    } else if (removed.length === 0) out.set(prev.subarray(0, Math.min(prev.length, delta.count)));
    else {
      let w = 0;
      let from = 0;
      for (let i = 0; i < removed.length; i++) {
        const r = removed[i] as number;
        if (r > from) out.set(prev.subarray(from, r), w);
        w += r - from;
        from = r + 1;
      }
      if (from < delta.previousCount) out.set(prev.subarray(from, delta.previousCount), w);
    }
    const { field, read, type } = entry;
    for (let i = 0; i < dirty.length; i++) {
      const r = dirty[i] as number;
      const row = next[r];
      out[r] = readNumber(field !== null ? (row == null ? undefined : (row as Record<string, unknown>)[field]) : read(row), type);
    }
    entry.vals = out;
  }
  for (const [token, entry] of set) if (entry.vals.length !== delta.count) set.delete(token);
}

// ---------------------------------------------------------------------------
// Incremental maintenance
// ---------------------------------------------------------------------------

function growInt32(a: Int32Array, need: number): Int32Array {
  if (a.length >= need) return a;
  const b = new Int32Array(Math.max(need, a.length + (a.length >> 3) + 16));
  b.set(a);
  return b;
}

function growUint8(a: Uint8Array, need: number): Uint8Array {
  if (a.length >= need) return a;
  const b = new Uint8Array(Math.max(need, a.length * 2 + 16));
  b.set(a);
  return b;
}

function growFloat64(a: Float64Array, need: number): Float64Array {
  if (a.length >= need) return a;
  const b = new Float64Array(Math.max(need, a.length * 2 + 16));
  b.set(a);
  return b;
}

/** Removes ascending `removed` positions from the first `length` entries, in place. */
function compactInPlace(a: Int32Array, length: number, removed: Int32Array): void {
  let w = removed[0] as number;
  for (let i = 0; i < removed.length; i++) {
    const from = (removed[i] as number) + 1;
    const to = i + 1 < removed.length ? (removed[i + 1] as number) : length;
    if (to > from) a.copyWithin(w, from, to);
    w += to - from;
  }
}

/** `a` with its first `map.length` entries carried through a previous -> new index map (reorders); capacity `need`. */
function permuteInt32(a: Int32Array, map: Int32Array, need: number): Int32Array {
  const out = new Int32Array(Math.max(need, a.length));
  for (let i = 0; i < map.length; i++) {
    const m = map[i] as number;
    if (m >= 0) out[m] = a[i] as number;
  }
  return out;
}

/** Code of `v`, appending a dictionary entry for a new distinct value (ranks are repaired per batch by `repairRanks`). */
function encode(keys: ColumnKeys, v: unknown, row: unknown): number {
  const dates = isDateType(keys.type);
  const k = (typeof v === 'object' ? v !== null : dates) ? normalizeKey(v, dates) : v;
  let c = keys.dict.get(k);
  if (c !== undefined) return c;
  c = keys.values.length;
  keys.dict.set(k, c);
  keys.values.push(v);
  keys.sample.push(row);
  keys.blank = growUint8(keys.blank, c + 1);
  keys.blank[c] = blankOf(v);
  if (keys.nums) {
    keys.nums = growFloat64(keys.nums, c + 1);
    keys.nums[c] = numericKey(v, keys.type);
  }
  return c;
}

/**
 * Assigns ranks to the codes appended since `ranks.rankedSize` in one batch:
 * the new comparison keys are sorted, located in the sorted distinct list by
 * binary search, and merged in. When new distinct ranks were inserted before
 * existing ones, existing code ranks are remapped in one O(distinct) pass and
 * the per-row ranks are dropped (rebuilt from codes on demand, never from the
 * rows). Cost: O(distinct + m log m) for m new codes, independent of row count.
 */
function repairRanks(keys: ColumnKeys, ranks: SortRanks, locale: string): void {
  const from = ranks.rankedSize;
  const size = keys.values.length;
  ranks.rankedSize = size;
  ranks.byCode = growInt32(ranks.byCode, size);
  const byCode = ranks.byCode;
  const nums = keys.nums;
  const collator = nums ? null : collatorFor(locale).compare;
  const compare = (a: number | string, b: number | string): number =>
    collator ? collator(a as string, b as string) : (a as number) - (b as number);
  const fresh: { key: number | string; code: number }[] = [];
  for (let c = from; c < size; c++) {
    let key: number | string;
    if (nums) {
      const v = nums[c] as number;
      if (Number.isNaN(v)) {
        byCode[c] = 0;
        continue;
      }
      key = v;
    } else {
      const v = keys.values[c];
      if (v == null) {
        byCode[c] = 0;
        continue;
      }
      key = typeof v === 'string' ? v : String(v);
    }
    fresh.push({ key, code: c });
  }
  if (fresh.length === 0) return;
  fresh.sort((a, b) => compare(a.key, b.key));
  const reps = ranks.reps;
  const count = ranks.count;
  // Per fresh entry: the old rank it equals (> 0), or the insertion point among old ranks (encoded as -(lo) - 1).
  const at = new Int32Array(fresh.length);
  // Distinct new keys: their insertion points (ascending) and keys.
  const insertAt: number[] = [];
  const insertKeys: (number | string)[] = [];
  let lo = 1;
  for (let i = 0; i < fresh.length; i++) {
    const key = (fresh[i] as { key: number | string }).key;
    if (i > 0 && compare((fresh[i - 1] as { key: number | string }).key, key) === 0) {
      at[i] = at[i - 1] as number;
      continue;
    }
    // Keys are ascending, so the search window starts where the previous one ended.
    let hi = count;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (compare(reps[mid] as number | string, key) < 0) lo = mid + 1;
      else hi = mid;
    }
    if (lo < count && compare(reps[lo] as number | string, key) === 0) {
      at[i] = lo;
    } else {
      at[i] = -(insertKeys.length + 1);
      insertAt.push(lo);
      insertKeys.push(key);
    }
  }
  const m = insertKeys.length;
  if (m === 0) {
    for (let i = 0; i < fresh.length; i++) byCode[(fresh[i] as { code: number }).code] = at[i] as number;
    return;
  }
  // Old rank r moves up by the number of new distinct keys inserted at or before it.
  const shifted = (insertAt[0] as number) < count;
  let shift: Int32Array | null = null;
  if (shifted) {
    shift = new Int32Array(count);
    let q = 0;
    for (let r = 0; r < count; r++) {
      while (q < m && (insertAt[q] as number) <= r) q++;
      shift[r] = r + (r === 0 ? 0 : q);
    }
    for (let c = 0; c < from; c++) byCode[c] = shift[byCode[c] as number] as number;
    ranks.byRow = null;
  }
  // Merge the new keys into the sorted representative list.
  const merged: (number | string)[] = new Array(count + m);
  let w = 0;
  let q = 0;
  for (let r = 0; r < count; r++) {
    while (q < m && (insertAt[q] as number) === r) merged[w++] = insertKeys[q++] as number | string;
    merged[w++] = reps[r] as number | string;
  }
  while (q < m) merged[w++] = insertKeys[q++] as number | string;
  reps.length = 0;
  for (let i = 0; i < merged.length; i++) reps.push(merged[i] as number | string);
  ranks.count = count + m;
  for (let i = 0; i < fresh.length; i++) {
    const a = at[i] as number;
    const code = (fresh[i] as { code: number }).code;
    if (a > 0) byCode[code] = shift ? (shift[a] as number) : a;
    else {
      const j = -a - 1;
      byCode[code] = (insertAt[j] as number) + j;
    }
  }
}

/**
 * Drops every cached key set and numeric column of `rows` (`engine.refresh()`:
 * rows mutated in place keep the array identity the caches are keyed by).
 */
export function forgetColumnKeys(rows: readonly unknown[]): void {
  cache.delete(rows);
  numericCache.delete(rows);
}

/**
 * Moves every cached key set of `previous` to `next` and applies `delta` in
 * place: removed rows are compacted out of the per-row arrays, and only the
 * updated and appended rows are read and re-encoded. Keys of other arrays are
 * untouched; when `next` already has keys (another engine advanced them) the
 * call does nothing.
 */
export function advanceColumnKeys(previous: readonly unknown[], next: readonly unknown[], delta: RowDelta): void {
  if (previous === next) return;
  advanceNumeric(previous, next, delta, dirtyRows(delta));
  const set = cache.get(previous);
  if (!set || cache.has(next)) return;
  cache.delete(previous);
  cache.set(next, set);
  const dirty = dirtyRows(delta);
  const removed = delta.removed;
  const map = mappedIndexes(delta);
  const n = delta.count;
  for (const byType of set.values()) {
    for (const keys of byType.values()) {
      if (keys.rowCount !== delta.previousCount) {
        byType.delete(keys.type);
        continue;
      }
      const rowRanks: Int32Array[] = [];
      if (map) {
        // Reorder: carry codes and per-row ranks to the new indexes (dirty rows are re-encoded below).
        keys.codes = permuteInt32(keys.codes, map, n);
        for (const ranks of keys.lazy.ranks.values()) if (ranks.byRow) ranks.byRow = permuteInt32(ranks.byRow, map, n);
      } else if (removed.length) {
        compactInPlace(keys.codes, keys.rowCount, removed);
        for (const ranks of keys.lazy.ranks.values()) if (ranks.byRow) compactInPlace(ranks.byRow, keys.rowCount, removed);
      }
      keys.codes = growInt32(keys.codes, n);
      for (const ranks of keys.lazy.ranks.values()) {
        if (ranks.byRow) {
          ranks.byRow = growInt32(ranks.byRow, n);
          rowRanks.push(ranks.byRow);
        }
      }
      keys.rowCount = n;
      const field = keys.field;
      const read = keys.read;
      const distinctBefore = keys.values.length;
      for (let i = 0; i < dirty.length; i++) {
        const r = dirty[i] as number;
        const row = next[r];
        const v = field !== null ? (row == null ? undefined : (row as Record<string, unknown>)[field]) : read(row);
        keys.codes[r] = encode(keys, v, row);
      }
      if (keys.values.length > distinctBefore) {
        // New distinct values: ranks are repaired lazily (next getSortRanks); per-row ranks cannot be patched before that.
        for (const ranks of keys.lazy.ranks.values()) ranks.byRow = null;
        rowRanks.length = 0;
      }
      // Ranks that shifted dropped their per-row array (rebuilt on demand); the others take the new codes.
      if (rowRanks.length) {
        for (const ranks of keys.lazy.ranks.values()) {
          const byRow = ranks.byRow;
          if (!byRow) continue;
          for (let i = 0; i < dirty.length; i++) {
            const r = dirty[i] as number;
            byRow[r] = ranks.byCode[keys.codes[r] as number] as number;
          }
        }
      }
      keys.lazy.rawRows = null;
      keys.version++;
    }
  }
}

/** Raw accessor values per source row (custom comparers receive raw values). */
export function getRawRowValues(keys: ColumnKeys): readonly unknown[] {
  let raw = keys.lazy.rawRows;
  if (!raw) {
    const out = new Array<unknown>(keys.rowCount);
    const { codes, values } = keys;
    for (let i = 0; i < keys.rowCount; i++) out[i] = values[codes[i] as number];
    raw = out;
    keys.lazy.rawRows = raw;
  }
  return raw;
}

const collators = new Map<string, Intl.Collator>();

/** One `Intl.Collator` per locale for the process. */
export function collatorFor(locale: string): Intl.Collator {
  let c = collators.get(locale);
  if (!c) {
    c = new Intl.Collator(locale);
    collators.set(locale, c);
  }
  return c;
}

/**
 * Sort ranks consistent with the built-in column comparer: null/undefined
 * (and NaN numbers / invalid dates) first, then values in ascending order;
 * equal values share a rank. Strings use the locale collator.
 */
export function getSortRanks(keys: ColumnKeys, locale: string): SortRanks {
  const cacheKey = keys.type === 'string' ? locale : '';
  const hit = keys.lazy.ranks.get(cacheKey);
  if (hit) {
    if (hit.rankedSize < keys.values.length) repairRanks(keys, hit, locale);
    return hit;
  }
  const size = keys.values.length;
  const byCode = new Int32Array(size);
  const reps: (number | string)[] = [Number.NaN];
  if (keys.nums) {
    const nums = keys.nums;
    const valid: number[] = [];
    for (let c = 0; c < size; c++) if (!Number.isNaN(nums[c] as number)) valid.push(nums[c] as number);
    const sorted = Float64Array.from(valid).sort();
    // Dedupe in place.
    let u = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (i === 0 || sorted[i] !== sorted[u - 1]) sorted[u++] = sorted[i] as number;
    }
    for (let c = 0; c < size; c++) {
      const v = nums[c] as number;
      if (Number.isNaN(v)) continue;
      let lo = 0;
      let hi = u - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((sorted[mid] as number) < v) lo = mid + 1;
        else hi = mid;
      }
      byCode[c] = lo + 1;
    }
    for (let i = 0; i < u; i++) reps.push(sorted[i] as number);
  } else {
    const collator = collatorFor(locale);
    const strings: string[] = new Array(size);
    const idx: number[] = [];
    for (let c = 0; c < size; c++) {
      const v = keys.values[c];
      if (v == null) continue;
      strings[c] = typeof v === 'string' ? v : String(v);
      idx.push(c);
    }
    const compare = collator.compare;
    idx.sort((a, b) => compare(strings[a] as string, strings[b] as string));
    let rank = 0;
    for (let i = 0; i < idx.length; i++) {
      const c = idx[i] as number;
      if (i === 0 || compare(strings[idx[i - 1] as number] as string, strings[c] as string) !== 0) {
        rank++;
        reps.push(strings[c] as string);
      }
      byCode[c] = rank;
    }
  }
  const ranks: SortRanks = { byCode, count: reps.length, reps, byRow: null, rankedSize: size };
  keys.lazy.ranks.set(cacheKey, ranks);
  return ranks;
}

/** Cached ranks without repairing codes appended since they were built (see `SortRanks.rankedSize`). */
export function peekSortRanks(keys: ColumnKeys, locale: string): SortRanks | undefined {
  return keys.lazy.ranks.get(keys.type === 'string' ? locale : '');
}

/** Rank per source row (`rowCount` entries are valid), built once and maintained incrementally. */
export function getRowRanks(keys: ColumnKeys, ranks: SortRanks): Int32Array {
  let byRow = ranks.byRow;
  if (!byRow) {
    byRow = new Int32Array(keys.rowCount);
    const { codes } = keys;
    const byCode = ranks.byCode;
    for (let i = 0; i < keys.rowCount; i++) byRow[i] = byCode[codes[i] as number] as number;
    ranks.byRow = byRow;
  }
  return byRow;
}

const COMBINING_MARKS = /[̀-ͯ]/g;

/** Case and accent folding shared by filter and search. */
export function foldText(s: string, ignoreCase: boolean, ignoreAccent: boolean): string {
  let out = s;
  if (ignoreAccent) out = out.normalize('NFD').replace(COMBINING_MARKS, '');
  return ignoreCase ? out.toLowerCase() : out;
}

/** Folded string per code (`String(value)`); null for null/undefined. */
export function getFoldedStrings(keys: ColumnKeys, ignoreCase: boolean, ignoreAccent: boolean): readonly (string | null)[] {
  const mode = (ignoreCase ? 1 : 0) | (ignoreAccent ? 2 : 0);
  const size = keys.values.length;
  let out = keys.lazy.folded.get(mode);
  if (out && out.length === size) return out;
  if (!out) {
    out = [];
    keys.lazy.folded.set(mode, out);
  }
  for (let c = out.length; c < size; c++) {
    const v = keys.values[c];
    out.push(v == null ? null : mode === 0 ? String(v) : foldText(String(v), ignoreCase, ignoreAccent));
  }
  return out;
}

const dayFormats = new Map<string, Intl.DateTimeFormat>();

/** Calendar day key (yyyymmdd) of an epoch in a time zone (undefined: local). */
export function dayKey(epoch: number, timeZone: string | undefined): number {
  if (Number.isNaN(epoch)) return Number.NaN;
  if (timeZone === undefined) {
    const d = new Date(epoch);
    return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  }
  let f = dayFormats.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric', day: 'numeric' });
    dayFormats.set(timeZone, f);
  }
  let y = 0;
  let m = 0;
  let day = 0;
  for (const part of f.formatToParts(epoch)) {
    if (part.type === 'year') y = Number(part.value);
    else if (part.type === 'month') m = Number(part.value);
    else if (part.type === 'day') day = Number(part.value);
  }
  return y * 10000 + m * 100 + day;
}

/** Day key per code for date columns. */
export function getDayKeys(keys: ColumnKeys, timeZone: string | undefined): Float64Array {
  const zone = timeZone ?? '';
  const size = keys.values.length;
  const hit = keys.lazy.days.get(zone);
  if (hit && hit.length === size) return hit;
  const nums = keys.nums as Float64Array;
  const out = new Float64Array(size);
  const from = hit ? hit.length : 0;
  if (hit) out.set(hit);
  for (let c = from; c < size; c++) out[c] = dayKey(nums[c] as number, timeZone);
  keys.lazy.days.set(zone, out);
  return out;
}

/** Display label per code, formatted lazily with the column formatter and cached per compiled column. */
export function getLabel<Row>(keys: ColumnKeys, column: CompiledColumn<Row>, rows: readonly Row[], code: number): string {
  let labels = keys.lazy.labels.get(column);
  if (!labels) {
    labels = new Array(keys.values.length);
    keys.lazy.labels.set(column, labels);
  }
  let label = labels[code];
  if (label === undefined) {
    label = column.formatter(keys.values[code], keys.sample[code] as Row);
    labels[code] = label;
  }
  return label;
}
