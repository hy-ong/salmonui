'use client';

// Data-state UI and delegated row events:
//
// - Loading indicator: shown while the data source loads
//   (`data.status === 'loading'`) or after `api.setLoading(true)`. The
//   overlay is presentational (`aria-hidden`); the root carries `aria-busy`
//   and the polite live region announces loading after 400 ms (the data
//   status announcements live in interaction.ts, the manual flag's here).
// - `refresh()`: `engine.refresh()`, reported by
//   `onViewChange` with `reason: 'refresh'` (view-events.tsx reads
//   `refreshCount`).
// - Row and cell clicks: one delegated listener per event type on
//   the body, attached only while a handler is bound; event objects are
//   allocated only for bound handlers. They run before the built-in pointer
//   handling (React listens at the root container), so `preventDefault()`
//   cancels the selection (click) or the edit start (double click).
// - `setCellValue` / `setRowData` without `editing`:
//   a silent row replacement in a local source.

import { memo, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type { ColumnId, CommandResult, CompiledColumn, DataGridSnapshot, RowId } from '@salmonui/data-grid/engine';
import { columnInfo } from './column-info.js';
import { useEngineSelector, useDataGridInstance } from './context.js';
import { gridEvent, type DataGridEventSource } from '@salmonui/core/internal/events';
import type { DataGridInstance } from './instance.js';
import { isSyntheticRow } from './interaction.js';
import type { DataGridCellClickEvent, DataGridDataUiProps, DataGridLoadingPhase, DataGridRowClickEvent } from './data-ui-types.js';

/** Same delay as the data status announcement. */
const LOADING_ANNOUNCE_DELAY = 400;
const APPLIED: CommandResult = Object.freeze({ status: 'applied' });
const rejected = (reason: string): CommandResult => Object.freeze({ status: 'rejected', reason });

type PatchableSource<Row> = { readonly mode: string; patch?(patch: { readonly upsert?: readonly Row[] }): void };

function pageKey(s: DataGridSnapshot<unknown>): string {
  const paging = s.query.paging;
  return paging ? `${paging.page}:${paging.pageSize}` : '';
}

export class DataGridDataUi<Row> {
  private manual = false;
  private readonly listeners = new Set<() => void>();
  /** Incremented by `refresh()`; the view tracker reports the next view change as `refresh`. */
  refreshCount = 0;
  private readyPage = '';
  private lastSnapshot: unknown = null;
  private lastPhase: DataGridLoadingPhase | null = null;
  private announceTimer: ReturnType<typeof setTimeout> | null = null;
  private announced = false;
  private body: HTMLElement | null = null;
  private attached = false;

  constructor(private readonly instance: DataGridInstance<Row>) {}

  // ------------------------------------------------------------------------
  // Loading
  // ------------------------------------------------------------------------

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly isManual = (): boolean => this.manual;
  readonly serverManual = (): boolean => false;

  setLoading(loading: boolean): void {
    if (loading === this.manual) return;
    this.manual = loading;
    for (const listener of [...this.listeners]) listener();
    if (this.announceTimer !== null) clearTimeout(this.announceTimer);
    this.announceTimer = null;
    const interaction = this.instance.interaction;
    if (loading) {
      this.announceTimer = setTimeout(() => {
        this.announceTimer = null;
        this.announced = true;
        interaction.announce(this.instance.text('loading'));
      }, LOADING_ANNOUNCE_DELAY);
    } else if (this.announced) {
      this.announced = false;
      interaction.announce(this.instance.text('loaded', { count: this.instance.engine.getSnapshot().rows.count }));
    }
  }

  /**
   * Phase of a data load in a snapshot, or null when the source is not
   * loading. A pure function of the snapshot sequence (memoized per snapshot):
   * `page` when the page differs from the last ready view.
   */
  phaseOf(s: DataGridSnapshot<unknown>): DataGridLoadingPhase | null {
    if (s === this.lastSnapshot) return this.lastPhase;
    this.lastSnapshot = s;
    const status = s.data.status;
    if (status !== 'loading') {
      if (status === 'ready') this.readyPage = pageKey(s);
      return (this.lastPhase = null);
    }
    return (this.lastPhase = s.data.version === 0 ? 'initial' : pageKey(s) !== this.readyPage ? 'page' : 'refresh');
  }

  refresh(): void {
    this.refreshCount++;
    this.instance.engine.refresh();
  }

  // ------------------------------------------------------------------------
  // Silent data updates
  // ------------------------------------------------------------------------

  private column(field: string): CompiledColumn<Row> | undefined {
    const columns = this.instance.engine.getSnapshot().columns;
    const byId = columns.byId.get(field);
    if (byId?.leaf) return byId;
    return columns.leaves.find((c) => c.field === field);
  }

  private replace(row: Row): CommandResult {
    const source = this.instance.engine.getDataSource() as unknown as PatchableSource<Row>;
    if (source.mode !== 'local' || typeof source.patch !== 'function') return rejected('unsupportedSource');
    source.patch({ upsert: [row] });
    return APPLIED;
  }

  /** `api.setCellValue`: replaces the row with the column setter applied; no edit lifecycle. */
  setCellValue(rowId: RowId, field: string, value: unknown): CommandResult {
    const row = this.instance.engine.getRow(rowId);
    if (row === undefined) return rejected('unknownRow');
    const setter = this.column(field)?.setter;
    if (!setter) return rejected('readOnlyColumn');
    return this.replace(setter(row, value));
  }

  /** `api.setRowData`: replaces the row; it must keep its row id. */
  setRowData(rowId: RowId, row: Row): CommandResult {
    if (this.instance.engine.getRow(rowId) === undefined) return rejected('unknownRow');
    return this.replace(row);
  }

  // ------------------------------------------------------------------------
  // Row and cell clicks
  // ------------------------------------------------------------------------

  private bound(props: DataGridDataUiProps<Row> = this.instance.props): boolean {
    return props.onRowClick !== undefined || props.onRowDoubleClick !== undefined || props.onCellClick !== undefined || props.onCellDoubleClick !== undefined;
  }

  /** Attaches or detaches the delegated listeners after mount and on prop changes. */
  sync(): void {
    const body = this.body;
    const want = body !== null && this.bound();
    if (want === this.attached) return;
    if (want) {
      body.addEventListener('click', this.onClick);
      body.addEventListener('dblclick', this.onDoubleClick);
    } else if (this.body) {
      this.body.removeEventListener('click', this.onClick);
      this.body.removeEventListener('dblclick', this.onDoubleClick);
    }
    this.attached = want;
  }

  mount(body: HTMLElement | null): () => void {
    this.body = body;
    this.sync();
    return () => {
      if (this.attached && this.body) {
        this.body.removeEventListener('click', this.onClick);
        this.body.removeEventListener('dblclick', this.onDoubleClick);
      }
      this.attached = false;
      this.body = null;
      if (this.announceTimer !== null) clearTimeout(this.announceTimer);
      this.announceTimer = null;
    };
  }

  private readonly onClick = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    const p = this.instance.props;
    this.dispatch(event, p.onCellClick, p.onRowClick, 'cellClick', 'rowClick');
  };

  private readonly onDoubleClick = (event: MouseEvent): void => {
    if (event.button !== 0) return;
    const p = this.instance.props;
    this.dispatch(event, p.onCellDoubleClick, p.onRowDoubleClick, 'cellDoubleClick', 'rowDoubleClick');
  };

  private dispatch(
    event: MouseEvent,
    onCell: ((event: DataGridCellClickEvent<Row>) => void) | undefined,
    onRow: ((event: DataGridRowClickEvent<Row>) => void) | undefined,
    cellType: string,
    rowType: string,
  ): void {
    if (!onCell && !onRow) return;
    const target = event.target as Element | null;
    const rowEl = target?.closest?.<HTMLElement>('[data-row-id]');
    if (!rowEl || !this.body?.contains(rowEl)) return;
    const rowId = rowEl.dataset['rowId'] as RowId;
    if (isSyntheticRow(rowId)) return;
    const engine = this.instance.engine;
    const snap = engine.getRowSnapshot(rowId);
    if (!snap || snap.kind !== 'data') return;
    const row = snap.row as Row;
    const cellEl = (target as Element).closest<HTMLElement>('[data-column-id]');
    const cell = cellEl && rowEl.contains(cellEl) ? cellEl : null;
    const columnId: ColumnId | null = cell?.dataset['columnId'] ?? null;
    const compiled = columnId === null ? undefined : engine.getSnapshot().columns.byId.get(columnId);
    const column = compiled ? columnInfo(compiled) : null;
    const source: DataGridEventSource = (event as PointerEvent).pointerType === 'touch' ? 'touch' : 'pointer';
    let prevented = false;
    if (onCell && cell && columnId !== null) {
      const cellEvent = gridEvent<DataGridCellClickEvent<Row>>(cellType, source, {
        rowId,
        row,
        rowIndex: snap.index,
        field: columnId,
        column,
        value: compiled ? compiled.accessor(row) : undefined,
        element: cell,
        nativeEvent: event,
      });
      onCell(cellEvent);
      prevented = cellEvent.defaultPrevented;
    }
    if (onRow) {
      const rowEvent = gridEvent<DataGridRowClickEvent<Row>>(rowType, source, { rowId, row, rowIndex: snap.index, field: columnId, column, element: rowEl, nativeEvent: event });
      onRow(rowEvent);
      prevented ||= rowEvent.defaultPrevented;
    }
    // The built-in handlers (selection, edit start) skip default-prevented events.
    if (prevented) event.preventDefault();
  }
}

/** Default loading content. */
function DefaultLoading({ indicator, rows }: { indicator: 'spinner' | 'skeleton'; rows: number }): ReactNode {
  if (indicator === 'spinner') return <span className="salmon-data-grid-loading__spinner" />;
  const bars: ReactNode[] = [];
  for (let i = 0; i < rows; i++) bars.push(<span key={i} className="salmon-data-grid-loading__bar" />);
  return <span className="salmon-data-grid-loading__skeleton">{bars}</span>;
}

/**
 * The loading overlay over the body. Presentational (`aria-hidden`): the
 * root's `aria-busy` and the live region carry the state to assistive
 * technology. Renders nothing while the grid is not loading.
 */
export const DataGridLoadingOverlay = memo(function DataGridLoadingOverlay({
  indicator,
  renderLoading,
  className,
  style,
}: {
  indicator: DataGridDataUiProps<unknown>['loadingIndicator'];
  renderLoading: DataGridDataUiProps<unknown>['renderLoading'];
  className: string | undefined;
  style: CSSProperties | undefined;
}) {
  const instance = useDataGridInstance<unknown>();
  const ui = instance.dataUi;
  const manual = useSyncExternalStore(ui.subscribe, ui.isManual, ui.serverManual);
  const loadingPhase = useEngineSelector(instance, (s) => ui.phaseOf(s));
  const phase = loadingPhase ?? (manual ? 'refresh' : null);
  if (phase === null) return null;
  const kind = indicator ?? 'spinner';
  return (
    <div className={className ? `salmon-data-grid-loading ${className}` : 'salmon-data-grid-loading'} style={style} data-indicator={kind} data-phase={phase} aria-hidden="true">
      {renderLoading ? renderLoading({ phase }) : <DefaultLoading indicator={kind} rows={instance.layout.config.initialRows} />}
    </div>
  );
});

/** Root `aria-busy`: a data load or `setLoading(true)`. */
export function useDataGridBusy(instance: DataGridInstance<unknown>): boolean {
  const ui = instance.dataUi;
  const manual = useSyncExternalStore(ui.subscribe, ui.isManual, ui.serverManual);
  const loading = useEngineSelector(instance, (s) => s.data.status === 'loading');
  return manual || loading;
}
