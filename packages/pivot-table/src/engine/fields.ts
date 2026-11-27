// Field index and group transform stages of the pivot pipeline:
// per field a dictionary-encoded
// member id per row in a typed array, cached per rows identity; groupings
// (number ranges, date parts, custom groups) are member remap tables, never
// row copies.
import type { Json, PivotDatePart, PivotFieldDefinition, PivotFieldType, PivotFormat, PivotGrouping, PivotMemberSort } from './types.js';

export const BLANK_LABEL = '(Blank)';
const OUT_OF_RANGE = '(Out of Range)';

export type Getter = (row: unknown) => unknown;

/** Dictionary encoding of one source field over the rows. */
export interface FieldIndex {
  readonly field: string;
  readonly type: PivotFieldType;
  readonly get: Getter;
  ids: Int32Array;
  /** Member id -> JSON key (`null` = blank, dates as ISO strings). */
  readonly keys: Json[];
  readonly counts: number[];
  /** Normalized raw value -> member id. */
  readonly map: Map<unknown, number>;
}

export const getterOf = (def: PivotFieldDefinition<unknown> | undefined, field: string): Getter =>
  def?.valueGetter ?? ((row) => (row as Record<string, unknown> | null)?.[field]);

/** `[mapKey, jsonKey]` of a raw value; `undefined` mapKey = blank. */
function normalize(v: unknown, type: PivotFieldType): [unknown, Json] {
  if (v === null || v === undefined || v === '') return [undefined, null];
  if (type === 'date') {
    const t = v instanceof Date ? v.getTime() : typeof v === 'number' ? v : Date.parse(String(v));
    return Number.isNaN(t) ? [undefined, null] : [t, new Date(t).toISOString()];
  }
  if (type === 'number') {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isNaN(n) ? [undefined, null] : [n, n];
  }
  if (type === 'boolean') {
    const b = typeof v === 'boolean' ? v : v === 'true' || v === 1;
    return [b, b];
  }
  const s = typeof v === 'string' ? v : v instanceof Date ? v.toISOString() : String(v);
  return [s, s];
}

export function inferType(rows: readonly unknown[], get: Getter): PivotFieldType {
  for (let i = 0; i < rows.length && i < 200; i++) {
    const v = get(rows[i]);
    if (v === null || v === undefined || v === '') continue;
    return typeof v === 'number' ? 'number' : typeof v === 'boolean' ? 'boolean' : v instanceof Date ? 'date' : 'string';
  }
  return 'string';
}

/** Adds (or replaces) the member of row `i`; returns its id. */
export function encodeRow(index: FieldIndex, rows: readonly unknown[], i: number): number {
  const v = index.get(rows[i]);
  const fast = typeof v === 'string' && v !== '' && index.type === 'string' ? v : typeof v === 'number' && index.type === 'number' && v === v ? v : undefined;
  let id = fast === undefined ? undefined : index.map.get(fast);
  if (id === undefined) {
    const [mk, key] = fast === undefined ? normalize(v, index.type) : [fast, fast as Json];
    id = index.map.get(mk);
    if (id === undefined) {
      id = index.keys.length;
      index.map.set(mk, id);
      index.keys.push(key);
      index.counts.push(0);
    }
  }
  index.counts[id]!++;
  return id;
}

export function* buildFieldIndex(rows: readonly unknown[], field: string, type: PivotFieldType, get: Getter): Generator<number, FieldIndex> {
  const index: FieldIndex = { field, type, get, ids: new Int32Array(rows.length), keys: [], counts: [], map: new Map() };
  const ids = index.ids;
  for (let i = 0; i < rows.length; i++) {
    ids[i] = encodeRow(index, rows, i);
    if ((i & 0x3ffff) === 0x3ffff) yield i;
  }
  return index;
}

/** Numeric value per row (NaN when not numeric) for numeric aggregates. */
export function numbersOf(rows: readonly unknown[], get: Getter, out: Float64Array<ArrayBufferLike> = new Float64Array(rows.length), from = 0): Float64Array<ArrayBufferLike> {
  for (let i = from; i < rows.length; i++) {
    const v = get(rows[i]);
    out[i] = typeof v === 'number' ? v : v === null || v === undefined || v === '' || typeof v === 'boolean' ? NaN : v instanceof Date ? v.getTime() : Number(v);
  }
  return out;
}

/** One level of an axis: a field, or one part of a date grouping, after the group transform. */
export interface Level {
  /** Name used in `filterBy`, `sort`, member paths and header nodes. */
  readonly name: string;
  readonly base: FieldIndex;
  /** Base member id -> level member id; null when the level is the field itself. */
  remap: Int32Array | null;
  ids: Int32Array;
  readonly keys: Json[];
  readonly labels: string[];
  /** Comparable per member: number, string (collated) or null (blank). */
  readonly sortKeys: (number | string | null)[];
  readonly byKey: Map<Json, number>;
  /** Base member id -> level member id for base members added later (incremental data). */
  readonly of: (baseId: number) => number;
  readonly signature: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function datePart(t: number, part: PivotDatePart): number {
  const d = new Date(t);
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  switch (part) {
    case 'years':
      return y;
    case 'quarters':
      return q;
    case 'quarterYear':
      return y * 10 + q;
    case 'months':
      return d.getUTCMonth() + 1;
    case 'days':
      return d.getUTCDate();
    case 'hours':
      return d.getUTCHours();
    case 'minutes':
      return d.getUTCMinutes();
    default:
      return d.getUTCSeconds();
  }
}

export interface LabelEnv {
  readonly locale: string;
  readonly formats: Readonly<Record<string, PivotFormat>>;
  readonly cache: Map<string, Intl.NumberFormat | Intl.DateTimeFormat>;
}

export function numberFormat(env: LabelEnv, options: Intl.NumberFormatOptions | undefined, locale = env.locale): Intl.NumberFormat {
  const k = `n${locale}${JSON.stringify(options ?? {})}`;
  let f = env.cache.get(k) as Intl.NumberFormat | undefined;
  if (!f) env.cache.set(k, (f = new Intl.NumberFormat(locale, options)));
  return f;
}

function dateFormat(env: LabelEnv, options: Intl.DateTimeFormatOptions, locale = env.locale): Intl.DateTimeFormat {
  const k = `d${locale}${JSON.stringify(options)}`;
  let f = env.cache.get(k) as Intl.DateTimeFormat | undefined;
  if (!f) env.cache.set(k, (f = new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options })));
  return f;
}

function partLabel(env: LabelEnv, part: PivotDatePart, v: number): string {
  switch (part) {
    case 'quarters':
      return `Q${v}`;
    case 'quarterYear':
      return `Q${v % 10} ${Math.floor(v / 10)}`;
    case 'months':
      return dateFormat(env, { month: 'short' }).format(Date.UTC(2000, v - 1, 1));
    case 'hours':
    case 'minutes':
    case 'seconds':
      return pad(v);
    default:
      return String(v);
  }
}

function memberLabel(env: LabelEnv, index: FieldIndex, key: Json): string {
  if (key === null) return BLANK_LABEL;
  const f = env.formats[index.field];
  if (index.type === 'date' && typeof key === 'string') return dateFormat(env, f?.date ?? { year: 'numeric', month: 'short', day: 'numeric' }, f?.locale).format(Date.parse(key));
  if (typeof key === 'number' && f?.number) return numberFormat(env, f.number, f.locale).format(key);
  return String(key);
}

/** Names of the axis levels a field expands to (a date grouping with several parts adds one level per part). */
export function levelNames(field: string, grouping: PivotGrouping | undefined): string[] {
  if (grouping?.kind === 'date' && grouping.parts.length > 1) return grouping.parts.map((p) => `${field}_${p}`);
  return [field];
}

function sortKeyOf(key: Json): number | string | null {
  return key === null ? null : typeof key === 'number' ? key : typeof key === 'boolean' ? (key ? 1 : 0) : String(key);
}

/** Builds the level for `name` (the field itself, a grouped field, or one date part). */
export function buildLevel(env: LabelEnv, name: string, index: FieldIndex, grouping: PivotGrouping | undefined, part: PivotDatePart | undefined): Level {
  const keys: Json[] = [];
  const labels: string[] = [];
  const sortKeys: (number | string | null)[] = [];
  const byKey = new Map<Json, number>();
  const add = (key: Json, label: string, sortKey: number | string | null): number => {
    let id = byKey.get(key);
    if (id === undefined) {
      id = keys.length;
      byKey.set(key, id);
      keys.push(key);
      labels.push(label);
      sortKeys.push(sortKey);
    }
    return id;
  };
  let transform: ((baseKey: Json) => number) | null = null;
  if (grouping?.kind === 'number') {
    let start = grouping.start;
    if (start === undefined) {
      start = Infinity;
      for (const k of index.keys) if (typeof k === 'number' && k < start) start = k;
      if (start === Infinity) start = 0;
    }
    const s = start;
    const step = grouping.interval > 0 ? grouping.interval : 1;
    const end = grouping.end;
    const ints = Number.isInteger(s) && Number.isInteger(step);
    transform = (k) => {
      if (typeof k !== 'number') return add(null, BLANK_LABEL, null);
      if (k < s) return add(`<${s}`, `< ${s}`, -Infinity);
      if (end !== undefined && k > end) return add(`>${end}`, `> ${end}`, Infinity);
      const b = s + Math.floor((k - s) / step) * step;
      return add(b, `${b}-${ints ? b + step - 1 : b + step}`, b);
    };
  } else if (grouping?.kind === 'date') {
    const p = part ?? grouping.parts[0] ?? 'years';
    const lo = grouping.start === undefined ? -Infinity : Date.parse(grouping.start);
    const hi = grouping.end === undefined ? Infinity : Date.parse(grouping.end);
    transform = (k) => {
      if (typeof k !== 'string') return add(null, BLANK_LABEL, null);
      const t = Date.parse(k);
      if (t < lo || t > hi) return add(OUT_OF_RANGE, OUT_OF_RANGE, Infinity);
      const v = datePart(t, p);
      return add(v, partLabel(env, p, v), v);
    };
  } else if (grouping?.kind === 'custom') {
    const caption = new Map<string, string>();
    for (const g of grouping.groups) for (const m of g.members) caption.set(JSON.stringify(m), g.caption);
    transform = (k) => {
      const c = caption.get(JSON.stringify(k));
      return c === undefined ? add(k, memberLabel(env, index, k), sortKeyOf(k)) : add(c, c, c);
    };
  }
  let remap: Int32Array | null = null;
  let ids = index.ids;
  if (transform) {
    remap = new Int32Array(index.keys.length);
    for (let b = 0; b < index.keys.length; b++) remap[b] = transform(index.keys[b]!);
    ids = new Int32Array(index.ids.length);
    const src = index.ids;
    for (let i = 0; i < src.length; i++) ids[i] = remap[src[i]!]!;
  } else for (const k of index.keys) add(k, memberLabel(env, index, k), sortKeyOf(k));
  const level: Level = {
    name,
    base: index,
    remap,
    ids,
    keys,
    labels,
    sortKeys,
    byKey,
    signature: `${name}\u0000${index.type}\u0000${JSON.stringify(grouping ?? null)}\u0000${part ?? ''}`,
    of: (b) => {
      if (!transform) {
        // Ungrouped: level members mirror the base dictionary.
        while (keys.length < index.keys.length) {
          const k = index.keys[keys.length]!;
          add(k, memberLabel(env, index, k), sortKeyOf(k));
        }
        return b;
      }
      if (b >= level.remap!.length) {
        const next = new Int32Array(Math.max(index.keys.length, b + 1));
        next.set(level.remap!);
        for (let x = level.remap!.length; x < next.length; x++) next[x] = transform(index.keys[x]!);
        level.remap = next;
      }
      return level.remap![b]!;
    },
  };
  return level;
}

/** Display rank per member (lower first) for a member sort spec; `collator` compares strings. */
export function memberRanks(level: Level, sort: PivotMemberSort | undefined, collator: Intl.Collator): Int32Array {
  const n = level.keys.length;
  const order = Array.from({ length: n }, (_, i) => i);
  if (sort !== 'none') {
    const sk = level.sortKeys;
    const cmp = (a: number, b: number) => {
      const x = sk[a]!;
      const y = sk[b]!;
      if (x === y) return a - b;
      if (x === null) return -1;
      if (y === null) return 1;
      if (typeof x === 'number' && typeof y === 'number') return x - y;
      if (typeof x === 'number') return -1;
      if (typeof y === 'number') return 1;
      return collator.compare(x, y) || a - b;
    };
    if (typeof sort === 'object') {
      const pos = new Map<string, number>();
      sort.order.forEach((k, i) => pos.set(JSON.stringify(k), i));
      const p = level.keys.map((k) => pos.get(JSON.stringify(k)) ?? Infinity);
      order.sort((a, b) => (p[a] !== p[b] ? (p[a]! < p[b]! ? -1 : 1) : cmp(a, b)));
    } else {
      order.sort(cmp);
      if (sort === 'desc') order.reverse();
    }
  }
  const ranks = new Int32Array(n);
  order.forEach((m, r) => (ranks[m] = r));
  return ranks;
}

export { normalize as normalizeMember, partLabel, memberLabel };
