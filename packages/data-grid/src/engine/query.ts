import { freezeJsonCopy, isJsonValue, stableStringify } from '@salmonui/core/data';
import type {
  AggregateDescriptor,
  ExpansionDescriptor,
  DataQuery,
  DataGridQueryInit,
} from './types.js';

const EMPTY: readonly never[] = Object.freeze([]);
const EMPTY_RECORD: Readonly<Record<string, boolean>> = Object.freeze({});

const EMPTY_EXPANSION: ExpansionDescriptor = Object.freeze({
  groups: EMPTY_RECORD,
  tree: EMPTY_RECORD,
  detail: EMPTY_RECORD,
  defaultGroupExpanded: true,
});

/** The empty query: no search, filters, sorting, grouping, aggregates, or paging. */
export const EMPTY_GRID_QUERY: DataQuery = Object.freeze({
  search: null,
  filters: EMPTY,
  sorting: EMPTY,
  grouping: EMPTY,
  aggregates: EMPTY,
  paging: null,
  expansion: EMPTY_EXPANSION,
});

function freezeAggregates(list: readonly AggregateDescriptor[]): readonly AggregateDescriptor[] {
  if (list.length === 0) return EMPTY;
  return Object.freeze(
    list.map((a) => {
      const { custom, ...rest } = a;
      const copy = freezeJsonCopy(rest as unknown) as Omit<AggregateDescriptor, 'custom'>;
      return Object.freeze(custom ? { ...copy, custom } : { ...copy });
    }),
  );
}

/** Builds a complete, deeply frozen `DataQuery` from a partial one. */
export function createDataGridQuery(init?: DataGridQueryInit | null): DataQuery {
  if (!init) return EMPTY_GRID_QUERY;
  const expansion = init.expansion
    ? (freezeJsonCopy({ ...EMPTY_EXPANSION, ...init.expansion }) as ExpansionDescriptor)
    : EMPTY_EXPANSION;
  return Object.freeze({
    search: init.search ? freezeJsonCopy(init.search) : null,
    filters: init.filters?.length ? freezeJsonCopy(init.filters) : EMPTY,
    sorting: init.sorting?.length ? freezeJsonCopy(init.sorting) : EMPTY,
    grouping: init.grouping?.length ? freezeJsonCopy(init.grouping) : EMPTY,
    aggregates: init.aggregates?.length ? freezeAggregates(init.aggregates) : EMPTY,
    paging: init.paging ? freezeJsonCopy(init.paging) : null,
    expansion,
  });
}

/**
 * Deterministic serialization of a query: sorted object keys, array order
 * preserved, local-only `custom` aggregate functions dropped. Equal queries
 * produce equal strings, so the result is usable as a cache key.
 */
export function serializeDataGridQuery(query: DataQuery): string {
  return stableStringify(query);
}

/** Inverse of `serializeDataGridQuery`. Throws on malformed input. */
export function deserializeDataGridQuery(text: string): DataQuery {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed) || !isJsonValue(parsed)) {
    throw new TypeError('deserializeDataGridQuery: expected a JSON object');
  }
  const q = parsed as Record<string, unknown>;
  for (const key of ['filters', 'sorting', 'grouping', 'aggregates'] as const) {
    if (q[key] !== undefined && !Array.isArray(q[key])) {
      throw new TypeError(`deserializeDataGridQuery: "${key}" must be an array`);
    }
  }
  return createDataGridQuery(q as DataGridQueryInit);
}

/** Names of query parts that are set, for "no stage handles this" checks. */
export function activeQueryParts(query: DataQuery): ('search' | 'filter' | 'sort' | 'group' | 'aggregate' | 'page')[] {
  const parts: ('search' | 'filter' | 'sort' | 'group' | 'aggregate' | 'page')[] = [];
  if (query.search && query.search.text !== '') parts.push('search');
  if (query.filters.length) parts.push('filter');
  if (query.sorting.length) parts.push('sort');
  if (query.grouping.length) parts.push('group');
  if (query.aggregates.length) parts.push('aggregate');
  if (query.paging) parts.push('page');
  return parts;
}
