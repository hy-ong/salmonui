// Remote checklist and Excel filter values. With a remote source
// the core cannot compute facets (`getColumnFacet` returns `unavailable`), so
// the filter menu asks the data source: `read({ facet: { columnId, search,
// limit } })`, answered with `DataSourceResult.facet`. Requests are debounced
// while typing in the search box, superseded and aborted by the next one (and
// on close), and paged by `filtering.checklistPageSize` (the limit grows as
// the list scrolls to its end). Part of the overlays lazy chunk: nothing here
// runs on the default path.

import {
  BLANK_FACET_KEY,
  getColumnFilters,
  type ColumnFacet,
  type CompiledColumn,
  type DataSourceFacetResult,
  type DataSourceRequest,
  type FacetValue,
  type DataGridEngine,
  type Json,
} from '@salmonui/data-grid/engine';
import { useEffect, useRef, useState } from 'react';

/** Search box debounce of remote facet requests (ms). */
export const REMOTE_FACET_DEBOUNCE = 250;

const EMPTY: readonly never[] = Object.freeze([]);

// Request versions per data source: sources reject answers older than the
// last one applied on a channel, so versions keep growing across menu opens.
const versions = new WeakMap<object, number>();
function nextVersion(source: object): number {
  const v = (versions.get(source) ?? 0) + 1;
  versions.set(source, v);
  return v;
}

/**
 * Whether the checklist values must come from the data source: the source is
 * remote and filters on the server, which is when the core `getColumnFacet`
 * answers `unavailable` (the loaded rows are not every row).
 */
export function isRemoteFacet(engine: DataGridEngine<unknown>): boolean {
  return engine.getDataSource().mode === 'remote' && engine.getSnapshot().data.performed.includes('filter');
}

/** Filter value of a server facet key (the reference handler keys dates by epoch ms). */
function valueOfKey(column: CompiledColumn<unknown>, key: string): Json {
  if (key === BLANK_FACET_KEY) return null;
  switch (column.type) {
    case 'number': {
      const n = Number(key);
      return Number.isFinite(n) ? n : key;
    }
    case 'boolean':
      return key === 'true' ? true : key === 'false' ? false : key;
    case 'date':
    case 'datetime': {
      const n = Number(key);
      return Number.isFinite(n) && key.trim() !== '' ? n : key;
    }
    default:
      return key;
  }
}

function labelOf(column: CompiledColumn<unknown>, value: Json, label: string): string {
  if (value === null) return '';
  if (column.type === 'string' || column.lookup) return label;
  try {
    const v = (column.type === 'date' || column.type === 'datetime') && typeof value === 'number' ? new Date(value) : value;
    return column.formatter(v, undefined as never) || label;
  } catch {
    return label;
  }
}

/** Keys the column's current checklist filter keeps: `in` keeps its values, `notIn` all but its values; null keeps every value. */
function selection(engine: DataGridEngine<unknown>, column: CompiledColumn<unknown>): { readonly op: 'in' | 'notIn'; readonly values: ReadonlySet<string> } | null {
  const own = getColumnFilters(engine.getSnapshot().query.filters, column.columnId);
  if (own.length !== 1) return null;
  const f = own[0]!;
  if ((f.operator !== 'in' && f.operator !== 'notIn') || !Array.isArray(f.value)) return null;
  return { op: f.operator === 'in' ? 'in' : 'notIn', values: new Set(f.value.map((v) => (v === null || v === '' ? BLANK_FACET_KEY : String(v)))) };
}

/** Whether the column has a checklist filter (the draft starts from it). */
export function hasRemoteSelection(engine: DataGridEngine<unknown>, column: CompiledColumn<unknown>): boolean {
  return selection(engine, column) !== null;
}

/** `ColumnFacet` of a facet answer. `distinctCount` is the loaded count; `truncated` says more exist. */
export function facetOf(engine: DataGridEngine<unknown>, column: CompiledColumn<unknown>, payload: DataSourceFacetResult, stale = false): ColumnFacet {
  const sel = selection(engine, column);
  let selectedCount = 0;
  let rowCount = 0;
  const values: FacetValue[] = payload.entries.map((e) => {
    const value = valueOfKey(column, e.key);
    const hit = sel === null ? true : sel.op === 'in' ? sel.values.has(e.key) : !sel.values.has(e.key);
    if (hit) selectedCount++;
    rowCount += e.count;
    return Object.freeze({ key: e.key, value, label: labelOf(column, value, e.label), count: e.count, blank: e.key === BLANK_FACET_KEY, selected: hit });
  });
  return Object.freeze({
    columnId: column.columnId,
    status: 'ready',
    values: Object.freeze(values),
    distinctCount: values.length,
    selectedCount,
    rowCount,
    truncated: !payload.complete,
    stale,
    error: null,
  });
}

function unavailable(column: CompiledColumn<unknown>): ColumnFacet {
  return Object.freeze({ columnId: column.columnId, status: 'unavailable', values: EMPTY, distinctCount: 0, selectedCount: 0, rowCount: 0, truncated: false, stale: false, error: null });
}

/** One facet read through the data source; rejects when the source does not answer facets. */
export async function readRemoteFacet(
  engine: DataGridEngine<unknown>,
  column: CompiledColumn<unknown>,
  options: { readonly search: string; readonly limit: number; readonly signal: AbortSignal },
): Promise<ColumnFacet> {
  const source = engine.getDataSource();
  const request: DataSourceRequest = {
    version: nextVersion(source),
    query: engine.getSnapshot().query,
    facet: { columnId: column.columnId, ...(options.search ? { search: options.search } : {}), limit: options.limit },
    signal: options.signal,
  };
  const result = await source.read(request);
  if (!result.facet) throw new Error('The data source did not answer the facet request.');
  return facetOf(engine, column, result.facet);
}

export interface RemoteFacet {
  /** The last answer (stale while the next one loads), unavailable when the source has no facets, or undefined before the first answer. */
  readonly facet: ColumnFacet | undefined;
  readonly loading: boolean;
  readonly error: unknown;
  retry(): void;
}

/**
 * Facet of `column` from the data source while the filter menu is open. A
 * search change waits `REMOTE_FACET_DEBOUNCE` ms; a limit change (load more)
 * requests at once. Each request aborts the previous one; closing aborts the
 * last.
 */
export function useRemoteFacet(engine: DataGridEngine<unknown>, column: CompiledColumn<unknown>, enabled: boolean, search: string, limit: number): RemoteFacet {
  const supported = enabled && engine.getDataSource().capabilities?.facets === true;
  const [state, setState] = useState<{ facet: ColumnFacet | undefined; loading: boolean; error: unknown }>(() => ({
    facet: enabled && !supported ? unavailable(column) : undefined,
    loading: supported,
    error: null,
  }));
  const [attempt, setAttempt] = useState(0);
  const lastSearch = useRef<string | null>(null);
  useEffect(() => {
    if (!supported) return;
    const controller = new AbortController();
    const delay = lastSearch.current !== null && lastSearch.current !== search ? REMOTE_FACET_DEBOUNCE : 0;
    lastSearch.current = search;
    const timer = setTimeout(() => {
      setState((s) => (s.loading && s.error === null ? s : { facet: s.facet, loading: true, error: null }));
      readRemoteFacet(engine, column, { search, limit, signal: controller.signal }).then(
        (facet) => {
          if (!controller.signal.aborted) setState({ facet, loading: false, error: null });
        },
        (error: unknown) => {
          if (!controller.signal.aborted) setState((s) => ({ facet: s.facet, loading: false, error }));
        },
      );
    }, delay);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [engine, column, supported, search, limit, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
