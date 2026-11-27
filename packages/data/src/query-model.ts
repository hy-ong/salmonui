// Mapping layer between the Data Grid engine's DataQuery and the wire query. This is the
// only module that knows the Data Grid engine filter/sort/search/paging descriptor
// shapes; if they change, only this file changes.

import { stableStringify } from './canonical.js';
import type { WirePage, WirePredicate, WireQuery } from './protocol.js';
import type { ColumnId, FilterDescriptor, FilterEntry, FilterGroupDescriptor, FilterOperator, DataQuery } from './types.js';

const BUILT_IN: readonly FilterOperator[] = [
  'equal', 'notEqual', 'contains', 'doesNotContain', 'startsWith', 'doesNotStartWith', 'endsWith', 'doesNotEndWith',
  'isEmpty', 'isNotEmpty', 'isNull', 'isNotNull', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual',
  'between', 'in', 'notIn', 'like', 'wildcard',
];

const ALIASES: ReadonlyMap<string, FilterOperator> = new Map<string, FilterOperator>([
  ...BUILT_IN.map((op) => [op.toLowerCase(), op] as const),
  ['eq', 'equal'], ['neq', 'notEqual'], ['ne', 'notEqual'], ['notcontains', 'doesNotContain'],
  ['gt', 'greaterThan'], ['gte', 'greaterThanOrEqual'], ['ge', 'greaterThanOrEqual'],
  ['lt', 'lessThan'], ['lte', 'lessThanOrEqual'], ['le', 'lessThanOrEqual'],
]);

/** Canonical built-in operator name, or null for a custom operator (sent verbatim). */
export function normalizeFilterOperator(name: string): FilterOperator | null {
  return ALIASES.get(name.toLowerCase()) ?? null;
}

/** Deterministic query serialization; identical to `serializeDataGridQuery` of `@salmonui/data-grid/engine`. */
export function serializeDataGridQuery(query: DataQuery): string {
  return stableStringify(query);
}

/** Query identity without paging and expansion: cursor chains and infinite blocks are cached under it. */
export function structuralQueryKey(query: DataQuery): string {
  return stableStringify({ ...query, paging: null, expansion: null });
}

export interface WireQueryOptions {
  /** Maps a columnId to the server field name. Default identity. */
  readonly fieldOf?: (columnId: ColumnId) => string;
  readonly page?: WirePage;
  readonly select?: readonly string[];
}

const identity = (id: string): string => id;

function isGroup(entry: FilterEntry): entry is FilterGroupDescriptor {
  return (entry as FilterGroupDescriptor).kind === 'group';
}

function condition(d: FilterDescriptor, fieldOf: (id: string) => string): WirePredicate {
  const op = normalizeFilterOperator(d.operator) ?? d.operator;
  const out: { field: string; op: string; value?: unknown; matchCase?: boolean; ignoreAccent?: boolean } = { field: fieldOf(d.columnId), op };
  if (op !== 'isNull' && op !== 'isNotNull' && op !== 'isEmpty' && op !== 'isNotEmpty') out.value = d.value;
  if (d.matchCase) out.matchCase = true;
  if (d.ignoreAccent) out.ignoreAccent = true;
  return out as WirePredicate;
}

/** Left fold `acc <op> next`, flattening runs of the same operator. */
function combine(acc: WirePredicate | null, op: 'and' | 'or', next: WirePredicate): WirePredicate {
  if (acc === null) return next;
  const list = (acc as { and?: WirePredicate[]; or?: WirePredicate[] })[op];
  if (list && Object.keys(acc).length === 1) return (op === 'and' ? { and: [...list, next] } : { or: [...list, next] });
  return op === 'and' ? { and: [acc, next] } : { or: [acc, next] };
}

/** A group combines its members with its own `predicate`; member predicates are ignored inside groups. */
function groupPredicate(group: FilterGroupDescriptor, fieldOf: (id: string) => string): WirePredicate | null {
  const op = group.predicate === 'or' ? 'or' : 'and';
  let acc: WirePredicate | null = null;
  for (const entry of group.filters) {
    const next = isGroup(entry) ? groupPredicate(entry, fieldOf) : condition(entry, fieldOf);
    if (next) acc = combine(acc, op, next);
  }
  return acc !== null && group.not === true ? { not: acc } : acc;
}

/**
 * Top level: conditions on the same column fold left to right by their
 * `predicate`; columns and groups are ANDed (Data Grid engine filter semantics).
 */
export function toWherePredicate(filters: readonly FilterEntry[], fieldOf: (id: string) => string = identity): WirePredicate | undefined {
  if (filters.length === 0) return undefined;
  const parts: (WirePredicate | null)[] = [];
  const byColumn = new Map<ColumnId, number>();
  for (const entry of filters) {
    if (isGroup(entry)) {
      parts.push(groupPredicate(entry, fieldOf));
      continue;
    }
    const at = byColumn.get(entry.columnId);
    const next = condition(entry, fieldOf);
    if (at === undefined) {
      byColumn.set(entry.columnId, parts.length);
      parts.push(next);
    } else {
      parts[at] = combine(parts[at] ?? null, entry.predicate, next);
    }
  }
  const list: WirePredicate[] = [];
  for (const p of parts) {
    if (p === null) continue;
    if ('and' in p) list.push(...p.and);
    else list.push(p);
  }
  if (list.length === 0) return undefined;
  return list.length === 1 ? list[0] : { and: list };
}

/** DataQuery to wire query. Paging is supplied by the caller (offset, cursor, or block). */
export function toWireQuery(query: DataQuery, options: WireQueryOptions = {}): WireQuery {
  const fieldOf = options.fieldOf ?? identity;
  const out: {
    -readonly [K in keyof WireQuery]: WireQuery[K];
  } = {};
  const where = toWherePredicate(query.filters, fieldOf);
  if (where) out.where = where;
  if (query.sorting.length) out.sort = query.sorting.map((s) => ({ field: fieldOf(s.columnId), dir: s.direction }));
  const s = query.search;
  if (s && s.text !== '') {
    out.search = {
      text: s.text,
      fields: s.columnIds === 'all' ? '*' : s.columnIds.map(fieldOf),
      op: s.operator,
      ...(s.ignoreCase ? { ignoreCase: true } : {}),
      ...(s.ignoreAccent ? { ignoreAccent: true } : {}),
    };
  }
  if (query.grouping.length) out.group = query.grouping.map((g) => (g.format ? { field: fieldOf(g.columnId), format: g.format } : { field: fieldOf(g.columnId) }));
  const aggregates = query.aggregates.filter((a) => a.type !== 'custom');
  if (aggregates.length) out.aggregates = aggregates.map((a) => ({ field: fieldOf(a.columnId), type: a.type }));
  if (options.page) out.page = options.page;
  else if (query.paging) out.page = { offset: (query.paging.page - 1) * query.paging.pageSize, limit: query.paging.pageSize };
  if (options.select) out.select = options.select;
  return out;
}

/** Stages a JSON-protocol server performs for a query (everything it was asked, except custom aggregates). */
export function performedFor(query: DataQuery, paged: boolean): ('search' | 'filter' | 'sort' | 'group' | 'aggregate' | 'page')[] {
  const out: ('search' | 'filter' | 'sort' | 'group' | 'aggregate' | 'page')[] = ['search', 'filter', 'sort'];
  if (!query.aggregates.some((a) => a.type === 'custom')) out.push('aggregate');
  if (paged) out.push('page');
  return out;
}
