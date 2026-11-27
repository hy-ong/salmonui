// Paging module. The page stage is a zero-copy window over the order
// array (`subarray`); totals come from the stage input. With a remote source
// that performed paging, the stage is skipped and totals come from
// `DataSourceResult.totalRowCount`.

import { defineDataGridModule } from './engine.js';
import { createRowModel, dataRowCount } from './pipeline.js';
import type { DataGridModule, DataGridOptions, ModuleContext, RowModelSnapshot } from './types.js';

export interface PagingOptions {
  /** Enables paging. Default true when the module is registered. */
  readonly enabled?: boolean;
  /** Default 12. */
  readonly pageSize?: number;
  /** Initial 1-based page (`defaultQuery.paging.page` wins when present). */
  readonly page?: number;
  /**
   * Total row count of a source that pages remotely (`performed` includes
   * `page`). Wins over the total the source reports; use it when the source
   * cannot report one. Ignored when the page stage runs locally.
   */
  readonly totalRowCount?: number | null;
}

export interface PagingState {
  readonly enabled: boolean;
  /** Requested 1-based page; the effective page is clamped to the page count. */
  readonly page: number;
  readonly pageSize: number;
  /** `PagingOptions.totalRowCount`; null uses the source total. */
  readonly totalRowCount: number | null;
}

export interface PageInfo {
  readonly enabled: boolean;
  /** Effective 1-based page (clamped). */
  readonly page: number;
  readonly pageSize: number;
  readonly pageCount: number;
  /** Rows across all pages. */
  readonly totalRowCount: number;
  /** First and one-past-last row index of the page within `totalRowCount`. */
  readonly start: number;
  readonly end: number;
}

export type PagingGoToPageCommand = { type: 'paging.goToPage'; page: number };
/** Keeps the first row of the current page visible, then clamps. */
export type PagingSetPageSizeCommand = { type: 'paging.setPageSize'; pageSize: number };
export type PagingSetEnabledCommand = { type: 'paging.setEnabled'; enabled: boolean };
/** Sets or clears (`null`) the remote total override (`PagingOptions.totalRowCount`). */
export type PagingSetTotalRowCountCommand = { type: 'paging.setTotalRowCount'; totalRowCount: number | null };
export type PagingNextCommand = { type: 'paging.next' };
export type PagingPreviousCommand = { type: 'paging.previous' };
export type PagingFirstCommand = { type: 'paging.first' };
export type PagingLastCommand = { type: 'paging.last' };
export type PagingCommand =
  | PagingGoToPageCommand
  | PagingSetPageSizeCommand
  | PagingSetEnabledCommand
  | PagingSetTotalRowCountCommand
  | PagingNextCommand
  | PagingPreviousCommand
  | PagingFirstCommand
  | PagingLastCommand;

export type PagingMethods<Row> = {
  /** Pager model: effective page, page count, totals. Identity is stable while nothing changes. */
  getInfo(ctx: ModuleContext<Row>): PageInfo;
};

export type PagingModule<Row> = DataGridModule<Row, PagingState, PagingCommand, 'paging', PagingMethods<Row>>;

const DEFAULT_PAGE_SIZE = 12;

function validInt(n: unknown, min: number): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= min;
}

function totalRows<Row>(ctx: ModuleContext<Row>): number {
  const snapshot = ctx.getSnapshot();
  if (snapshot.data.performed.includes('page')) {
    const override = (ctx.getModuleState<PagingState>('paging') as PagingState | undefined)?.totalRowCount ?? null;
    if (override !== null) return override;
    // Lazy load grouping: the root level request pages top-level groups.
    if (snapshot.rows.view?.kind === 'lazyGrouped') {
      const lazyTotal = (ctx.getModuleState<{ readonly lazyTotal?: number | null }>('grouping'))?.lazyTotal;
      if (lazyTotal !== undefined && lazyTotal !== null) return lazyTotal;
    }
    return snapshot.data.totalRowCount;
  }
  const input = ctx.getStageInput('page');
  return input ? dataRowCount(input) : dataRowCount(snapshot.rows);
}

function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

function withPage(state: PagingState, page: number, pageSize = state.pageSize): PagingState {
  return page === state.page && pageSize === state.pageSize ? state : Object.freeze({ ...state, page, pageSize });
}

/**
 * Creates the `paging` module. Options are read from `options.paging`
 * (`PagingOptions`); `options.defaultQuery.paging` sets the initial page.
 */
export function createPagingModule<Row>(): PagingModule<Row> {
  const infos = new WeakMap<object, { state: PagingState; total: number; info: PageInfo }>();
  const methods: PagingMethods<Row> = {
    getInfo(ctx) {
      const state = ctx.getModuleState<PagingState>('paging') as PagingState;
      const total = totalRows(ctx);
      const snapshot = ctx.getSnapshot();
      const hit = infos.get(snapshot);
      if (hit && hit.state === state && hit.total === total) return hit.info;
      const pageCount = pageCountOf(total, state.pageSize);
      const page = state.enabled ? Math.min(Math.max(1, state.page), pageCount) : 1;
      const start = state.enabled ? Math.min(total, (page - 1) * state.pageSize) : 0;
      const end = state.enabled ? Math.min(total, start + state.pageSize) : total;
      const info: PageInfo = Object.freeze({ enabled: state.enabled, page, pageSize: state.pageSize, pageCount, totalRowCount: total, start, end });
      infos.set(snapshot, { state, total, info });
      return info;
    },
  };
  return defineDataGridModule<Row, PagingState, PagingCommand, 'paging', PagingMethods<Row>>({
    name: 'paging',
    commands: ['paging.goToPage', 'paging.setPageSize', 'paging.setEnabled', 'paging.setTotalRowCount', 'paging.next', 'paging.previous', 'paging.first', 'paging.last'],
    initialState(options: DataGridOptions<Row>): PagingState {
      const o = (options['paging'] ?? {}) as PagingOptions;
      const d = options.defaultQuery?.paging ?? null;
      const pageSize = d?.pageSize ?? o.pageSize ?? DEFAULT_PAGE_SIZE;
      const page = d?.page ?? o.page ?? 1;
      return Object.freeze({
        enabled: o.enabled ?? true,
        page: validInt(page, 1) ? page : 1,
        pageSize: validInt(pageSize, 1) ? pageSize : DEFAULT_PAGE_SIZE,
        totalRowCount: validInt(o.totalRowCount, 0) ? o.totalRowCount : null,
      });
    },
    reduce(state, command, ctx) {
      switch (command.type) {
        case 'paging.setEnabled':
          if (typeof command.enabled !== 'boolean') return ctx.reject('invalidEnabled');
          return command.enabled === state.enabled ? state : Object.freeze({ ...state, enabled: command.enabled, page: 1 });
        case 'paging.setPageSize': {
          if (!validInt(command.pageSize, 1)) return ctx.reject('invalidPageSize');
          const firstRow = (state.page - 1) * state.pageSize;
          const total = totalRows(ctx);
          const page = Math.min(Math.floor(firstRow / command.pageSize) + 1, pageCountOf(total, command.pageSize));
          return withPage(state, page, command.pageSize);
        }
        case 'paging.first':
          return withPage(state, 1);
        case 'paging.setTotalRowCount': {
          const total = command.totalRowCount;
          if (total !== null && !validInt(total, 0)) return ctx.reject('invalidTotalRowCount');
          return total === state.totalRowCount ? state : Object.freeze({ ...state, totalRowCount: total });
        }
        default:
          break;
      }
      if (!state.enabled) return ctx.reject('pagingDisabled');
      if (command.type === 'paging.goToPage') {
        if (!validInt(command.page, 1)) return ctx.reject('invalidPage');
        if (command.page === 1) return withPage(state, 1);
        // Out-of-range pages are rejected.
        if (command.page > pageCountOf(totalRows(ctx), state.pageSize)) return ctx.reject('pageOutOfRange');
        return withPage(state, command.page);
      }
      const pageCount = pageCountOf(totalRows(ctx), state.pageSize);
      const current = Math.min(state.page, pageCount);
      switch (command.type) {
        case 'paging.next':
          return current >= pageCount ? ctx.reject('pageOutOfRange') : withPage(state, current + 1);
        case 'paging.previous':
          return current <= 1 ? ctx.reject('pageOutOfRange') : withPage(state, current - 1);
        case 'paging.last':
          return withPage(state, pageCount);
        default:
          return state;
      }
    },
    extendQuery(query, state) {
      const paging = query.paging;
      if (!state.enabled) return paging === null ? query : Object.freeze({ ...query, paging: null });
      if (paging && paging.page === state.page && paging.pageSize === state.pageSize) return query;
      return Object.freeze({ ...query, paging: Object.freeze({ page: state.page, pageSize: state.pageSize }) });
    },
    methods,
    pipeline: [
      {
        name: 'page',
        key: (_query, state) => [state.enabled, state.page, state.pageSize],
        run(input: RowModelSnapshot<Row>, ctx) {
          const state = ctx.state;
          if (!state.enabled) return input;
          const view = input.view;
          if (view) {
            // Group-aware paging: pages count data rows; captions and footers of the page's groups come along.
            if (!view.page) return input;
            const total = view.dataCount;
            const page = Math.min(Math.max(1, state.page), pageCountOf(total, state.pageSize));
            const start = Math.min(total, (page - 1) * state.pageSize);
            const end = Math.min(total, start + state.pageSize);
            if (start === 0 && end === total) return input;
            const paged = view.page(start, end);
            return Object.freeze({ ...input, count: paged.count, view: paged });
          }
          const total = input.count;
          const page = Math.min(Math.max(1, state.page), pageCountOf(total, state.pageSize));
          const start = Math.min(total, (page - 1) * state.pageSize);
          const end = Math.min(total, start + state.pageSize);
          if (start === 0 && end === total) return input;
          let order: Int32Array;
          if (input.order) {
            order = input.order.subarray(start, end);
          } else {
            order = new Int32Array(end - start);
            for (let i = start; i < end; i++) order[i - start] = i;
          }
          return createRowModel(input, order);
        },
      },
    ],
  });
}
