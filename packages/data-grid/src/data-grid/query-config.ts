// Sorting, filtering, searching, and paging wiring between `DataGridProps` and
// the engine: module registration from the `sorting`,
// `filtering`, `search`, and `paging` props; engine options; the initial
// query; reactive options (compared structurally with the previous prop
// value, never with engine state); the before / after events
// (`onBeforeSortChange` ... `onPageChange`, cancel with `preventDefault()`;
// event objects are allocated only when a handler is bound); `onError`; the
// header sort click cycle (`sorting.order`). Paging registration, its
// reactive options and the pager keys belong to the `paging` render feature
// (paging-ui.ts); search registration and the engine options of an enabled
// search belong to the `search` render feature (search-ui.ts). The page
// events and the search events and reactive options stay here (they need no
// paging or search code). No rendering here.

import {
  createFilterModule,
  createSortModule,
  normalizeFilterOperator,
  type ColumnId,
  type ColumnSnapshot,
  type CommandEvent,
  type FilterEntry,
  type FilterState,
  type DataGridCommand,
  type DataGridModule,
  type DataGridQueryInit,
  type Json,
  type PageInfo,
  type PagingState,
  type SearchState,
  type SortDescriptor,
  type SortState,
} from '@salmonui/data-grid/engine';
import { gridEvent, lazyField, type DataGridEvent, type DataGridEventSource } from '@salmonui/core/internal/events';
import type { DataGridInstance } from './instance.js';
import type {
  DataGridErrorEvent,
  DataGridFilter,
  DataGridFilterChangeEvent,
  DataGridFilterCondition,
  DataGridFiltering,
  DataGridPageChangeEvent,
  DataGridPaging,
  DataGridSearch,
  DataGridSearchChangeEvent,
  DataGridSortChangeEvent,
  DataGridSortDirection,
  DataGridSorting,
  DataGridSortItem,
} from './query-types.js';
import type { DataGridProps } from './types.js';

type Feature = 'sort' | 'filter' | 'search' | 'page';

const COMMANDS: Readonly<Record<string, Feature>> = Object.freeze({
  'sort.set': 'sort',
  'sort.toggle': 'sort',
  'sort.column': 'sort',
  'sort.remove': 'sort',
  'sort.clear': 'sort',
  'filter.set': 'filter',
  'filter.byColumn': 'filter',
  'filter.add': 'filter',
  'filter.remove': 'filter',
  'filter.clear': 'filter',
  'search.set': 'search',
  'search.clear': 'search',
  'paging.goToPage': 'page',
  'paging.setPageSize': 'page',
  'paging.next': 'page',
  'paging.previous': 'page',
  'paging.first': 'page',
  'paging.last': 'page',
});

/** `paging.pageSizeOptions: true`. */
export const DEFAULT_PAGE_SIZE_OPTIONS: readonly (number | 'all')[] = Object.freeze(['all', 5, 10, 12, 20]);
export const DEFAULT_PAGE_BUTTON_COUNT = 8;
export const DEFAULT_FILTER_DEBOUNCE = 1500;

/** `true` -> `{}`, objects as given, `false` / absent -> undefined (off). */
function settings<T extends object>(value: boolean | T | undefined): T | undefined {
  if (value === undefined || value === false) return undefined;
  return value === true ? ({} as T) : value;
}

export function sortingOf(p: { readonly sorting?: boolean | DataGridSorting | undefined }): DataGridSorting | undefined {
  return settings(p.sorting);
}
export function filteringOf(p: { readonly filtering?: boolean | DataGridFiltering | undefined }): DataGridFiltering | undefined {
  return settings(p.filtering);
}
/** True when the default pager shows the filter status: the filter row UI and `showStatus` not false. */
export function filterStatusEnabled(filtering: boolean | DataGridFiltering | undefined): boolean {
  const s = filteringOf({ filtering });
  return s !== undefined && (s.ui ?? 'row') === 'row' && s.showStatus !== false;
}
export function searchOf(p: { readonly search?: boolean | DataGridSearch | undefined }): DataGridSearch | undefined {
  return settings(p.search);
}
export function pagingOf(p: { readonly paging?: boolean | DataGridPaging | undefined }): DataGridPaging | undefined {
  return settings(p.paging);
}

// ---------------------------------------------------------------------------
// Conversions (public `field` <-> engine `columnId`)
// ---------------------------------------------------------------------------

/** Column id of a column key: by id first, then the first leaf with that `field`. */
export function columnIdOf<Row>(columns: ColumnSnapshot<Row>, key: string): ColumnId {
  return columns.byId.has(key) ? key : (columns.leaves.find((c) => c.field === key)?.columnId ?? key);
}

export function sortItems(sorting: readonly { readonly columnId: ColumnId; readonly direction: DataGridSortDirection }[]): DataGridSortItem[] {
  return sorting.map((s) => ({ field: s.columnId, direction: s.direction }));
}

function sortDescriptors(items: readonly DataGridSortItem[] | undefined): { columnId: string; direction: DataGridSortDirection }[] {
  return (items ?? []).map((c) => ({ columnId: c.field, direction: c.direction === 'desc' ? 'desc' : 'asc' }));
}

type EntryLike = {
  readonly kind?: string;
  readonly columnId?: ColumnId;
  readonly operator?: string;
  readonly value?: Json | undefined;
  readonly predicate?: 'and' | 'or' | undefined;
  readonly not?: boolean | undefined;
  readonly matchCase?: boolean | undefined;
  readonly ignoreAccent?: boolean | undefined;
  readonly filters?: readonly EntryLike[];
};

/** Engine filter entries (or command inputs) to public filters. */
export function gridFilters(entries: readonly EntryLike[]): DataGridFilter[] {
  return entries.map((e): DataGridFilter => {
    if (e.kind === 'group') return { logic: e.predicate === 'or' ? 'or' : 'and', ...(e.not ? { not: true } : {}), filters: gridFilters(e.filters ?? []) };
    const out: DataGridFilterCondition = {
      field: e.columnId as string,
      operator: normalizeFilterOperator(e.operator ?? '') ?? (e.operator as string),
      value: e.value ?? null,
      logic: e.predicate === 'or' ? 'or' : 'and',
    };
    if (e.matchCase !== undefined) out.matchCase = e.matchCase;
    if (e.ignoreAccent !== undefined) out.ignoreAccents = e.ignoreAccent;
    return out;
  });
}

function isGroup(f: DataGridFilter): f is Extract<DataGridFilter, { filters: readonly DataGridFilter[] }> {
  return Array.isArray((f as { filters?: unknown }).filters) && (f as { field?: unknown }).field === undefined;
}

/** Public filters to `filter.set` entries (groups become `{ kind: 'group', predicate, filters }`). */
export function filterEntries(filters: readonly DataGridFilter[] | undefined): Record<string, unknown>[] {
  return (filters ?? []).map((f): Record<string, unknown> => {
    if (isGroup(f)) return { kind: 'group', predicate: f.logic === 'or' ? 'or' : 'and', ...(f.not ? { not: true } : {}), filters: filterEntries(f.filters), source: 'api' };
    const c = f as DataGridFilterCondition;
    const entry: Record<string, unknown> = {
      columnId: c.field,
      operator: normalizeFilterOperator(c.operator) ?? c.operator,
      value: c.value ?? null,
      predicate: c.logic === 'or' ? 'or' : 'and',
      source: 'api',
    };
    if (c.matchCase !== undefined) entry['matchCase'] = c.matchCase;
    if (c.ignoreAccents !== undefined) entry['ignoreAccent'] = c.ignoreAccents;
    return entry;
  });
}

function sameJson(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

export function defined<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** `sorting.order` the engine toggle implements (`['asc', 'desc', null]` or `['asc', 'desc']`). */
function engineOrder(order: readonly (DataGridSortDirection | null)[] | undefined): boolean {
  if (!order) return true;
  return order[0] === 'asc' && order[1] === 'desc' && (order.length === 2 || (order.length === 3 && order[2] === null));
}

function allowUnsortOf(s: DataGridSorting): boolean {
  return s.order ? s.order.includes(null) : true;
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/** Modules plus the query modules the props ask for (a module the app passes is kept). */
export function withQueryModules<Row>(props: DataGridProps<Row>, modules: readonly DataGridModule<Row>[] | undefined): readonly DataGridModule<Row>[] | undefined {
  const names = new Set((modules ?? []).map((m) => m.name));
  const extra: DataGridModule<Row>[] = [];
  if (!names.has('sort') && props.sorting) extra.push(createSortModule<Row>() as unknown as DataGridModule<Row>);
  if (!names.has('filter') && props.filtering) extra.push(createFilterModule<Row>() as unknown as DataGridModule<Row>);
  return extra.length ? [...(modules ?? []), ...extra] : modules;
}

/**
 * Engine options of the query modules. `false` disables a module the app
 * passes; absent keeps its defaults. The `paging` and `search` render
 * features add the options of an enabled paging (paging-ui.ts) and search
 * (search-ui.ts).
 */
export function queryEngineOptions<Row>(props: DataGridProps<Row>): Record<string, unknown> {
  const s = sortingOf(props);
  const f = filteringOf(props);
  const off = (value: unknown): Record<string, unknown> => (value === false ? { enabled: false } : {});
  return {
    sort: s ? { enabled: true, mode: s.multiple ? 'multiple' : 'single', allowUnsort: allowUnsortOf(s) } : off(props.sorting),
    filter: f ? defined({ enabled: true, caseSensitive: f.matchCase, ignoreAccent: f.ignoreAccents }) : off(props.filtering),
    search: off(props.search),
    paging: off(props.paging),
  };
}

/**
 * The engine's `defaultQuery` with the initial sort and filters, so the
 * server snapshot has them. The initial page comes from the paging engine
 * options (paging-ui.ts).
 */
export function queryDefaultQuery<Row>(props: DataGridProps<Row>, base: DataGridQueryInit | undefined): DataGridQueryInit | undefined {
  const sorting = sortingOf(props)?.sortBy;
  const filters = filteringOf(props)?.filters;
  if (!sorting?.length && !filters?.length) return base;
  return {
    ...base,
    ...(sorting?.length ? { sorting: sortDescriptors(sorting) } : {}),
    ...(filters?.length ? { filters: filterEntries(filters) as unknown as FilterEntry[] } : {}),
  };
}

/**
 * Header sort activation (click, Enter): the next command of the
 * `sorting.order` cycle for the column, or null when nothing changes.
 * `multiple` is Ctrl/Cmd (adds to a multi-column sort when `sorting.multiple`).
 */
export function nextSortCommand<Row>(instance: DataGridInstance<Row>, columnId: ColumnId, multiple: boolean): DataGridCommand | null {
  const state = instance.engine.getModuleState<SortState>('sort');
  if (!state) return null;
  const order = sortingOf(instance.props)?.order;
  if (engineOrder(order)) return { type: 'sort.toggle', columnId, multi: multiple };
  const cycle = order as readonly (DataGridSortDirection | null)[];
  if (cycle.length === 0) return null;
  const current = state.sorting.find((s) => s.columnId === columnId)?.direction ?? null;
  const next = cycle[(cycle.indexOf(current) + 1) % cycle.length] ?? null;
  const alone = state.sorting.length <= (current === null ? 0 : 1);
  if (next === current && (multiple || alone)) return null;
  if (next === null) return multiple || alone ? { type: 'sort.remove', columnId } : { type: 'sort.clear' };
  return { type: 'sort.column', columnId, direction: next, multi: multiple };
}

// ---------------------------------------------------------------------------
// Proposed state of a command (before-events)
// ---------------------------------------------------------------------------

type SortList = readonly { readonly columnId: ColumnId; readonly direction: DataGridSortDirection }[];

function applySortColumn(state: SortState, columnId: ColumnId, direction: DataGridSortDirection | null, multi: boolean): SortList {
  if (!(multi && state.mode === 'multiple')) return direction ? [{ columnId, direction }] : [];
  const list = state.sorting.filter((s) => s.columnId !== columnId);
  const at = state.sorting.findIndex((s) => s.columnId === columnId);
  if (direction) {
    if (at >= 0) list.splice(at, 0, { columnId, direction });
    else list.push({ columnId, direction });
  }
  return list;
}

function proposedSort<Row>(state: SortState, command: DataGridCommand, columns: ColumnSnapshot<Row>): SortList {
  const id = typeof command['columnId'] === 'string' ? columnIdOf(columns, command['columnId']) : null;
  switch (command.type) {
    case 'sort.set':
      return ((command['sorting'] ?? []) as unknown as SortDescriptor[]).map((s) => ({ columnId: columnIdOf(columns, s.columnId), direction: s.direction }));
    case 'sort.clear':
      return [];
    case 'sort.remove':
      return state.sorting.filter((s) => s.columnId !== id);
    case 'sort.column':
      return applySortColumn(state, id as ColumnId, command['direction'] === 'desc' ? 'desc' : 'asc', command['multi'] === true);
    case 'sort.toggle': {
      const current = state.sorting.find((s) => s.columnId === id)?.direction;
      const next = current === undefined ? 'asc' : current === 'asc' ? 'desc' : state.allowUnsort ? null : 'asc';
      return applySortColumn(state, id as ColumnId, next, command['multi'] === true);
    }
    default:
      return state.sorting;
  }
}

function entryColumns(e: EntryLike, out = new Set<ColumnId>()): Set<ColumnId> {
  if (e.kind === 'group') for (const c of e.filters ?? []) entryColumns(c, out);
  else if (e.columnId !== undefined) out.add(e.columnId);
  return out;
}

function proposedFilters<Row>(filters: readonly EntryLike[], command: DataGridCommand, columns: ColumnSnapshot<Row>): readonly EntryLike[] {
  const resolve = (k: unknown): ColumnId => columnIdOf(columns, String(k));
  const inputs = (): EntryLike[] => ((command['filters'] ?? []) as unknown as EntryLike[]).map(function map(e): EntryLike {
    return e.kind === 'group' ? { ...e, filters: (e.filters ?? []).map(map) } : { ...e, columnId: resolve(e.columnId) };
  });
  switch (command.type) {
    case 'filter.set':
      return inputs();
    case 'filter.add':
      return [...filters, ...inputs()];
    case 'filter.remove': {
      const id = resolve(command['columnId']);
      return filters.filter((e) => {
        const cols = entryColumns(e);
        return !(cols.size === 1 && cols.has(id));
      });
    }
    case 'filter.clear': {
      const keys = command['columnIds'] as string[] | undefined;
      if (!keys) return [];
      const ids = new Set(keys.map(resolve));
      return filters.filter((e) => ![...entryColumns(e)].some((id) => ids.has(id)));
    }
    case 'filter.byColumn': {
      const id = resolve(command['columnId']);
      const operator = normalizeFilterOperator(String(command['operator'])) ?? String(command['operator']);
      const value = command['value'];
      const values = Array.isArray(value) && operator !== 'in' && operator !== 'notIn' && operator !== 'between' ? value : [value ?? null];
      const conditions: EntryLike[] = values.map((v, i) =>
        defined({
          columnId: id,
          operator,
          value: v as Json,
          predicate: i === 0 ? ((command['predicate'] as 'and' | 'or' | undefined) ?? 'and') : 'or',
          matchCase: command['matchCase'] as boolean | undefined,
          ignoreAccent: command['ignoreAccent'] as boolean | undefined,
        }),
      );
      const own = (e: EntryLike) => e.kind !== 'group' && e.columnId === id;
      const next = filters.filter((e) => !own(e));
      const at = filters.findIndex(own);
      next.splice(at < 0 ? next.length : Math.min(at, next.length), 0, ...conditions);
      return next;
    }
    default:
      return filters;
  }
}

function proposedPage(info: PageInfo, command: DataGridCommand): { page: number; pageSize: number } {
  switch (command.type) {
    case 'paging.goToPage':
      return { page: Number(command['page']), pageSize: info.pageSize };
    case 'paging.next':
      return { page: info.page + 1, pageSize: info.pageSize };
    case 'paging.previous':
      return { page: info.page - 1, pageSize: info.pageSize };
    case 'paging.first':
      return { page: 1, pageSize: info.pageSize };
    case 'paging.last':
      return { page: info.pageCount, pageSize: info.pageSize };
    case 'paging.setPageSize': {
      const pageSize = Number(command['pageSize']);
      return { page: Math.floor(info.start / pageSize) + 1, pageSize };
    }
    default:
      return { page: info.page, pageSize: info.pageSize };
  }
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

/** Engine state of a feature before a command (identity compared after it). */
type Before = SortState['sorting'] | FilterState['filters'] | string | undefined;

interface Pending {
  readonly before: Before;
  readonly wanted: boolean;
}

const EVENT_TYPES: Readonly<Record<Feature, readonly [string, string]>> = Object.freeze({
  sort: ['beforeSortChange', 'sortChange'],
  filter: ['beforeFilterChange', 'filterChange'],
  search: ['beforeSearchChange', 'searchChange'],
  page: ['beforePageChange', 'pageChange'],
});

/**
 * Per-grid query controller: reactive options sync, events, and the
 * renderer state the pager reads. Created once per `DataGridInstance`.
 */
export class DataGridQueryUi<Row> {
  private readonly instance: DataGridInstance<Row>;
  private readonly pending = new Map<Feature, Pending>();
  /** A keyboard page change moves focus to the new current page button. */
  pagerFocusPending = false;

  constructor(instance: DataGridInstance<Row>) {
    this.instance = instance;
  }

  sortState(): SortState | undefined {
    return this.instance.engine.getModuleState<SortState>('sort');
  }
  filterState(): FilterState | undefined {
    return this.instance.engine.getModuleState<FilterState>('filter');
  }
  searchState(): SearchState | undefined {
    return this.instance.engine.getModuleState<SearchState>('search');
  }
  pagingState(): PagingState | undefined {
    return this.instance.engine.getModuleState<PagingState>('paging');
  }
  pageInfo(): PageInfo | undefined {
    return (this.instance.engine as unknown as { paging?: { getInfo(): PageInfo } }).paging?.getInfo();
  }
  filtering(): DataGridFiltering | undefined {
    return filteringOf(this.instance.props);
  }

  /** The pager renders: an enabled paging module is registered. */
  pagerEnabled(): boolean {
    return this.pagingState()?.enabled === true;
  }

  /** `paging.pageSizeOptions` (`'all'` resolves to the row count). */
  pageSizeOptions(): readonly (number | 'all')[] {
    const opt = pagingOf(this.instance.props)?.pageSizeOptions;
    if (!opt) return [];
    return opt === true ? DEFAULT_PAGE_SIZE_OPTIONS : opt;
  }

  // ------------------------------------------------------------------------
  // Events
  // ------------------------------------------------------------------------

  private snapshotOf(feature: Feature): Before {
    switch (feature) {
      case 'sort':
        return this.sortState()?.sorting;
      case 'filter':
        return this.filterState()?.filters;
      case 'search':
        return this.searchState()?.text;
      case 'page': {
        const info = this.pageInfo();
        return info ? `${info.page}:${info.pageSize}` : undefined;
      }
    }
  }

  private handlers(feature: Feature): { before: ((e: never) => void) | undefined; after: ((e: never) => void) | undefined } {
    const p = this.instance.props;
    switch (feature) {
      case 'sort':
        return { before: p.onBeforeSortChange, after: p.onSortChange };
      case 'filter':
        return { before: p.onBeforeFilterChange, after: p.onFilterChange };
      case 'search':
        return { before: p.onBeforeSearchChange, after: p.onSearchChange };
      case 'page':
        return { before: p.onBeforePageChange, after: p.onPageChange };
    }
  }

  /**
   * Event object of a command. Before: `previous` is the current state and
   * the payload the proposed state. After: the payload is the committed
   * state and `previous` the state before the command.
   */
  private eventOf(feature: Feature, command: DataGridCommand, before: Before, after: boolean): DataGridEvent | null {
    const columns = this.instance.engine.getSnapshot().columns;
    const source = this.instance.currentSource() as DataGridEventSource;
    const type = EVENT_TYPES[feature][after ? 1 : 0] as string;
    const key = typeof command['columnId'] === 'string' ? command['columnId'] : null;
    const field = key === null ? null : columnIdOf(columns, key);
    switch (feature) {
      case 'sort': {
        const state = this.sortState();
        if (!state) return null;
        const previous = (after ? before : state.sorting) as SortList;
        const next = after ? state.sorting : proposedSort(state, command, columns);
        const fields = lazyField(
          lazyField({ field } as { field: string | null }, 'sortBy', () => sortItems(next)),
          'previousSortBy',
          () => sortItems(previous),
        );
        return gridEvent<DataGridSortChangeEvent>(type, source, fields);
      }
      case 'filter': {
        const state = this.filterState();
        if (!state) return null;
        const previous = (after ? before : state.filters) as readonly EntryLike[];
        const next = after ? (state.filters as readonly EntryLike[]) : proposedFilters(state.filters as readonly EntryLike[], command, columns);
        const fields = lazyField(
          lazyField({ field } as { field: string | null }, 'filters', () => gridFilters(next)),
          'previousFilters',
          () => gridFilters(previous),
        );
        if (command['ui'] === 'builder') (fields as { ui?: 'builder' }).ui = 'builder';
        return gridEvent<DataGridFilterChangeEvent>(type, source, fields);
      }
      case 'search': {
        const current = this.searchState()?.text ?? '';
        const text = after ? current : command.type === 'search.set' ? String(command['text'] ?? '') : '';
        const previousText = after ? ((before as string | undefined) ?? '') : current;
        return gridEvent<DataGridSearchChangeEvent>(type, source, { text, previousText });
      }
      case 'page': {
        const info = this.pageInfo();
        if (!info) return null;
        if (after) {
          const [previousPage, previousPageSize] = ((before as string | undefined) ?? `${info.page}:${info.pageSize}`).split(':').map(Number) as [number, number];
          return gridEvent<DataGridPageChangeEvent>(type, source, { page: info.page, previousPage, pageSize: info.pageSize, previousPageSize });
        }
        const next = proposedPage(info, command);
        return gridEvent<DataGridPageChangeEvent>(type, source, { page: next.page, previousPage: info.page, pageSize: next.pageSize, previousPageSize: info.pageSize });
      }
    }
  }

  /** Before/after command hooks. Returns the teardown. */
  mount(): () => void {
    const instance = this.instance;
    const engine = instance.engine;
    const offBefore = engine.onBeforeCommand((e) => {
      const feature = COMMANDS[e.command.type];
      if (!feature || instance.isSyncing()) return;
      const { before, after } = this.handlers(feature);
      const snapshot = this.snapshotOf(feature);
      if (before) {
        const ev = this.eventOf(feature, e.command, snapshot, false);
        if (ev) {
          before(ev as never);
          if (ev.defaultPrevented) return false;
        }
      }
      this.pending.set(feature, { before: snapshot, wanted: after !== undefined });
      return undefined;
    });
    const offAfter = engine.onCommand((e: CommandEvent) => {
      const feature = COMMANDS[e.command.type];
      if (!feature) return;
      const pending = this.pending.get(feature);
      this.pending.delete(feature);
      if (!pending || instance.isSyncing()) return;
      if (e.result.status !== 'applied') {
        const onError = instance.props.onError;
        if (onError && e.result.status === 'rejected' && e.result.reason !== 'cancelled') {
          onError(
            gridEvent<DataGridErrorEvent>('error', instance.currentSource() as DataGridEventSource, {
              error: new Error(`${e.command.type}: ${e.result.reason}`),
              action: feature,
            }),
          );
        }
        return;
      }
      if (!pending.wanted || this.snapshotOf(feature) === pending.before) return;
      const ev = this.eventOf(feature, e.command, pending.before, true);
      if (ev) (this.handlers(feature).after as ((e: DataGridEvent) => void) | undefined)?.(ev);
    });
    return () => {
      offBefore();
      offAfter();
    };
  }

  // ------------------------------------------------------------------------
  // Reactive options
  // ------------------------------------------------------------------------

  sync(prev: DataGridProps<Row>, props: DataGridProps<Row>): void {
    const instance = this.instance;
    if (this.sortState()) {
      const s = sortingOf(props);
      const ps = sortingOf(prev);
      const options = (x: DataGridSorting | undefined) => ({ enabled: x !== undefined, mode: x?.multiple ? 'multiple' : 'single', allowUnsort: x ? allowUnsortOf(x) : true });
      const next = options(s);
      if (!sameJson(next, options(ps))) instance.syncDispatch({ type: 'sort.setOptions', ...next });
      if (!sameJson(s?.sortBy, ps?.sortBy) && s) {
        const wanted = sortDescriptors(s.sortBy);
        if (!sameJson(wanted, sortDescriptors(sortItems(this.sortState()?.sorting ?? [])))) instance.syncDispatch({ type: 'sort.set', sorting: wanted });
      }
    }
    const filter = this.filterState();
    if (filter) {
      const f = filteringOf(props);
      const pf = filteringOf(prev);
      if ((f !== undefined) !== (pf !== undefined) || f?.matchCase !== pf?.matchCase || f?.ignoreAccents !== pf?.ignoreAccents) {
        instance.syncDispatch(defined({ type: 'filter.setOptions', enabled: f !== undefined, caseSensitive: f?.matchCase, ignoreAccent: f?.ignoreAccents }) as DataGridCommand);
      }
      if (f && !sameJson(f.filters, pf?.filters)) instance.syncDispatch({ type: 'filter.set', filters: filterEntries(f.filters) as never });
    }
    const search = this.searchState();
    const q = searchOf(props);
    const pq = searchOf(prev);
    if (search && q && !sameJson(q, pq)) {
      const optionsChanged = q.operator !== pq?.operator || q.matchCase !== pq?.matchCase || q.ignoreAccents !== pq?.ignoreAccents || !sameJson(q.fields, pq?.fields);
      const text = q.text !== pq?.text ? (q.text ?? '') : search.text;
      if (optionsChanged || text !== search.text) {
        instance.syncDispatch(
          text === '' && !optionsChanged
            ? { type: 'search.clear' }
            : {
                type: 'search.set',
                text,
                columnIds: q.fields?.length ? [...q.fields] : 'all',
                ...(q.operator ? { operator: q.operator } : {}),
                ...(q.matchCase !== undefined ? { ignoreCase: !q.matchCase } : {}),
                ...(q.ignoreAccents !== undefined ? { ignoreAccent: q.ignoreAccents } : {}),
              },
        );
      }
    }
  }
}
