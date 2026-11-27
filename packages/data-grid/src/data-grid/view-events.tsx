'use client';

// `onViewChange` and the data error row
// (`renderError`).
//
// `onViewChange` fires once per committed change of the displayed rows:
// `DataGridViewEvents` is mounted only while the handler is bound (no cost on the
// default path), selects a view epoch from the engine snapshot, and calls the
// handler from a layout effect, after the commit that rendered the new rows.
// The epoch moves when the query parts that change the row set (sort,
// filters and the filter options matchCase / ignoreAccents, search with its
// options, grouping, page) or the data (data version, source rows)
// change, and never for scroll, focus, selection, or expansion. A loading
// remote source fires when its result arrives; a failed load does not fire.

import { useLayoutEffect, useState, type ReactNode } from 'react';
import { dataRowCountOf } from '@salmonui/data-grid/engine/expansion';
import type { DataGridSnapshot } from '@salmonui/data-grid/engine';
import { useEngineSelector, useDataGridInstance, useDataGridRender } from './context.js';
import { gridEvent, type DataGridEventSource } from '@salmonui/core/internal/events';
import type { DataGridDataErrorContext, DataGridViewChangeEvent, DataGridViewChangeReason } from './feature-types.js';
import type { DataGridInstance } from './instance.js';

interface ViewMark {
  readonly sorting: unknown;
  readonly filters: unknown;
  /** Filter options that re-run the filter (`matchCase`, `ignoreAccents`, enabled); '' without filters. */
  readonly filterOptions: string;
  readonly search: unknown;
  readonly grouping: unknown;
  readonly paging: unknown;
  readonly version: number;
  readonly source: unknown;
}

type FilterOptionsState = { readonly enabled?: boolean; readonly caseSensitive?: boolean; readonly ignoreAccent?: boolean } | undefined;

function filterOptionsOf(s: DataGridSnapshot<unknown>): string {
  if (s.query.filters.length === 0) return '';
  const f = s.modules['filter'] as FilterOptionsState;
  return f ? `${f.enabled !== false ? 1 : 0}${f.caseSensitive ? 1 : 0}${f.ignoreAccent ? 1 : 0}` : '';
}

function markOf(s: DataGridSnapshot<unknown>): ViewMark {
  const q = s.query;
  return { sorting: q.sorting, filters: q.filters, filterOptions: filterOptionsOf(s), search: q.search, grouping: q.grouping, paging: q.paging, version: s.data.version, source: s.rows.source };
}

function reasonOf(a: ViewMark, b: ViewMark): DataGridViewChangeReason | null {
  if (a.sorting !== b.sorting) return 'sort';
  if (a.filters !== b.filters || a.filterOptions !== b.filterOptions) return 'filter';
  if (a.search !== b.search) return 'search';
  if (a.grouping !== b.grouping) return 'group';
  if (a.paging !== b.paging) return 'page';
  if (a.version !== b.version || a.source !== b.source) return 'data';
  return null;
}

/**
 * View epochs of one grid. `epochOf` is a pure function of the snapshot
 * sequence (memoized per snapshot), so `useSyncExternalStore` may call it
 * repeatedly. A change seen while the source is loading is held until the
 * data is ready, then reported with the reason of the first change.
 */
export class ViewTracker {
  epoch = 0;
  /** Last epoch reported (Strict Mode re-runs effects; each epoch fires once). */
  fired = 0;
  reason: DataGridViewChangeReason = 'data';
  source: DataGridEventSource = 'api';
  private last: DataGridSnapshot<unknown> | null = null;
  private mark: ViewMark | null = null;
  private pending: DataGridViewChangeReason | null = null;

  /** `refresh()` calls seen (data-ui.tsx): the next data change after one is reported as `refresh`. */
  private seenRefresh: number;

  constructor(private readonly instance: DataGridInstance<unknown>) {
    this.seenRefresh = instance.dataUi.refreshCount;
  }

  epochOf(s: DataGridSnapshot<unknown>): number {
    if (s === this.last) return this.epoch;
    this.last = s;
    const next = markOf(s);
    const prev = this.mark;
    this.mark = next;
    if (prev === null) {
      // First read: the initial view is reported once it is ready.
      this.pending = 'data';
    } else {
      let reason = reasonOf(prev, next);
      const refreshes = this.instance.dataUi.refreshCount;
      if (reason === 'data' && refreshes !== this.seenRefresh) reason = 'refresh';
      if (reason !== null) this.seenRefresh = refreshes;
      if (reason !== null && this.pending === null) {
        this.pending = reason;
        this.source = this.instance.currentSource();
      }
    }
    if (this.pending !== null && s.data.status === 'ready') {
      this.reason = this.pending;
      this.pending = null;
      this.epoch++;
    }
    return this.epoch;
  }
}

/** Calls `onViewChange` after each committed view change. Render it only while the handler is bound. */
export function DataGridViewEvents() {
  const instance = useDataGridInstance<unknown>();
  const [t] = useState(() => new ViewTracker(instance));
  const epoch = useEngineSelector(instance, (s) => t.epochOf(s));
  useLayoutEffect(() => {
    if (epoch === 0 || t.fired === epoch) return;
    t.fired = epoch;
    const handler = instance.props.onViewChange;
    if (!handler) return;
    const snapshot = instance.engine.getSnapshot();
    const rowCount = dataRowCountOf(snapshot.rows);
    const totalRowCount = instance.query.pageInfo()?.totalRowCount ?? rowCount;
    handler(gridEvent<DataGridViewChangeEvent>('viewChange', t.source, { rowCount, totalRowCount, reason: t.reason }));
    t.source = 'api';
  }, [instance, epoch, t]);
  return null;
}

/** Error text of a data error. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? 'Error');
}

/**
 * The data error row (`data.status === 'error'`): `renderError` content, or
 * the default message with a Retry button. Retry re-reads the source.
 */
export function DataGridDataErrorRow({ instance, columnCount }: { instance: DataGridInstance<unknown>; columnCount: number }) {
  const render = useDataGridRender<unknown>();
  const error = useEngineSelector(instance, (s) => s.data.error);
  const text = render.text;
  const retry = (): void => instance.engine.reload();
  const ctx: DataGridDataErrorContext = { error, message: errorMessage(error), retry };
  const content: ReactNode = instance.props.renderError ? (
    instance.props.renderError(ctx)
  ) : (
    <>
      <span className="salmon-data-grid-error__title">{text('dataErrorTitle')}</span>
      <span className="salmon-data-grid-error__message">{ctx.message}</span>
      <button type="button" className="salmon-data-grid-button" onClick={retry}>
        {text('retry')}
      </button>
    </>
  );
  return (
    <div role="row" aria-rowindex={render.headerRows + 1} className="salmon-data-grid-row salmon-data-grid-empty salmon-data-grid-error" data-error="">
      <div role="gridcell" aria-colindex={1} aria-colspan={Math.max(1, columnCount)} className="salmon-data-grid-empty__cell salmon-data-grid-error__cell">
        {content}
      </div>
    </div>
  );
}
