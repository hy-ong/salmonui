'use client';

import { memo, useLayoutEffect, useSyncExternalStore, type ReactNode } from 'react';
import { getSourceIndex, type RowId, type RowModelSnapshot } from '@salmonui/data-grid/engine';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { useAdaptive } from './adaptive-view.js';
import { useEngineSelector, useDataGridInstance, useDataGridRender } from './context.js';
import { footerRowCount } from './group-static.js';
import { ROW_SPAN_LOOKBACK } from './spans.js';
import type { DataGridInstance } from './instance.js';
import type { ColumnView } from './layout.js';
import { DataGridRowRenderer } from './Row.js';
import { DataGridDataErrorRow } from './view-events.js';

function useRowTemplateCheckDev(instance: DataGridInstance<unknown>, enabled: boolean): void {
  // Row templates must keep the ARIA row structure.
  useLayoutEffect(() => {
    const rows = instance.getRowsElement();
    if (!rows || !enabled) return;
    for (const child of rows.children) {
      if (child.getAttribute('role') !== 'row' || !child.hasAttribute('data-row-id')) {
        warnOnce(
          `${instance.gridId}:rowTemplate`,
          `DataGrid "${instance.gridId}": renderRow must return an element with the provided rowProps (role="row", data-row-id) or render defaultRow.`,
        );
        break;
      }
    }
  });
}

const useRowTemplateCheck: (instance: DataGridInstance<unknown>, enabled: boolean) => void = DEV ? useRowTemplateCheckDev : () => {};

function DataGridBodyImpl() {
  const instance = useDataGridInstance<unknown>();
  const render = useDataGridRender<unknown>();
  const { engine, layout } = instance;
  const rowWindow = useSyncExternalStore(layout.subscribe, layout.getRowWindow, layout.getServerRowWindow);
  const view = useSyncExternalStore(layout.subscribe, layout.getColumnView, layout.getServerColumnView);
  const columnCount = useEngineSelector(instance, (s) => s.columns.visible.length);
  // Render-only column field changes (children.ts `renderChanged`): rows re-render and pass each column's key to its cells.
  const columnRender = useSyncExternalStore(instance.subscribeColumnRender, instance.getColumnRenderVersion, instance.getColumnRenderVersion);
  // The `spans` feature's planner (a late enable installs it and bumps the column render version).
  const spanPlanner = useSyncExternalStore(instance.subscribeColumnRender, instance.getSpanPlanner, instance.getServerSpanPlanner);
  const failed = useEngineSelector(instance, (s) => s.data.status === 'error');
  const emptyReason = useEngineSelector(instance, (s) =>
    // While loading, the loading indicator stands in for the empty state.
    s.rows.count > 0 || s.data.status === 'error' || s.data.status === 'loading' ? null : s.data.totalRowCount > 0 || s.query.filters.length > 0 || s.query.search !== null ? 'noMatch' : 'noData',
  );

  useLayoutEffect(() => {
    layout.commitRows(rowWindow);
    instance.updateWheelListener();
  }, [layout, instance, rowWindow]);
  useLayoutEffect(() => {
    layout.commitColumns(view);
  }, [layout, view]);
  useRowTemplateCheck(instance, render.renderRow !== undefined);

  // Grouped models mix caption and footer rows into the visible order.
  const model = rowWindow.model as RowModelSnapshot<unknown> | null;
  const modelView = model?.view ?? null;
  // Frozen rows render in sticky rowgroups; the scrolling window skips them.
  // Pinned rows head the model and join the top rowgroup, before the sticky rows.
  const count = rowWindow.count;
  const pinned = model?.pinned?.length ?? 0;
  const top = Math.min(render.frozenTop + pinned, count);
  const bottom = Math.min(render.frozenBottom, count - top);
  const first = Math.max(rowWindow.start, top);
  const last = Math.min(rowWindow.end, count - bottom);
  // Row spans per rendered section; the scrolling window also reads the rows above it
  // (merges from a short lookback, explicit spans from the anchor index at any distance).
  const spanColumns = engine.getSnapshot().columns;
  // Adaptive vertical rows: the same window rendered as cards.
  // The `adaptive` render feature owns the card row part (inert `null` without it).
  const CardRow = useAdaptive()?.vertical === true ? instance.features.parts.CardRow : null;
  const LoadingRow = instance.features.parts.LoadingRow;
  const rowSpans = spanPlanner?.rowSpans(
    engine,
    [
      { start: 0, end: top, scanFrom: 0 },
      { start: first, end: last, scanFrom: Math.max(top, first - ROW_SPAN_LOOKBACK), group: [top, count - bottom] },
      { start: count - bottom, end: count, scanFrom: count - bottom },
    ],
    [spanColumns.left, spanColumns.center, spanColumns.right],
    render.mergeCells,
  );
  // Group rows are parts of the `grouping` (captions) and `aggregates` (group footers) features; detail rows
  // (`__detail:`) occur only with the `detail` render feature, which owns the part.
  const { GroupCaptionRow, GroupFooterRow, DetailRow } = instance.features.parts;
  const rowAt = (i: number): ReactNode => {
    // Ids come from the window's own row model (the server model while hydrating), never a newer live one.
    const rowId = (model ? (modelView ? modelView.idAt(i) : model.sourceIds[getSourceIndex(model, i)]) : engine.getRowIdAt(i)) as RowId;
    const kind = modelView ? modelView.kindAt(i) : 'data';
    if (kind === 'group') return GroupCaptionRow ? <GroupCaptionRow key={rowId} rowId={rowId} rowIndex={i} view={view as ColumnView<unknown>} /> : null;
    if (kind === 'groupFooter') return GroupFooterRow ? <GroupFooterRow key={rowId} rowId={rowId} rowIndex={i} view={view as ColumnView<unknown>} /> : null;
    if (kind === 'detail') return DetailRow ? <DetailRow key={rowId} rowId={rowId} rowIndex={i} view={view as ColumnView<unknown>} /> : null;
    // The `infiniteScroll` render feature owns the loading row part; only its stand-in yields loading rows.
    if (kind === 'loading' && LoadingRow) return <LoadingRow key={rowId} rowId={rowId} rowIndex={i} />;
    if (CardRow) return <CardRow key={rowId} rowId={rowId} rowIndex={i} columns={spanColumns.visible} columnRender={columnRender} />;
    return <DataGridRowRenderer key={rowId} rowId={rowId} rowIndex={i} view={view} rowSpans={rowSpans?.get(i)} columnRender={columnRender} pinned={i < pinned ? (i === pinned - 1 ? 'last' : 'pinned') : undefined} />;
  };
  const rows: ReactNode[] = [];
  if (top > 0 && rowWindow.start < first) {
    const metrics = layout.getRowMetrics();
    rows.push(<div key="__frozen-gap" className="salmon-data-grid-row-gap" aria-hidden="true" style={{ height: metrics.offsetOf(first) - metrics.offsetOf(rowWindow.start) }} />);
  }
  for (let i = first; i < last; i++) rows.push(rowAt(i));
  const topRows: ReactNode[] = [];
  for (let i = 0; i < top; i++) topRows.push(rowAt(i));
  const bottomRows: ReactNode[] = [];
  for (let i = count - bottom; i < count; i++) bottomRows.push(rowAt(i));
  return (
    <div className="salmon-data-grid-body" ref={instance.setBody} style={{ height: instance.initialBodyHeight }} data-frozen-rows={top || bottom ? '' : undefined}>
      {top > 0 ? (
        <div role="rowgroup" className="salmon-data-grid-frozen-rows salmon-data-grid-frozen-rows--top">
          {topRows}
        </div>
      ) : null}
      <div role="rowgroup" className={render.classNames?.body ? `salmon-data-grid-rows ${render.classNames.body}` : 'salmon-data-grid-rows'} style={render.styles?.body} ref={instance.setRows}>
        {/* A failed load replaces the (stale) rows with the error row. */}
        {failed ? <DataGridDataErrorRow instance={instance} columnCount={columnCount} /> : rows}
        {emptyReason ? (
          <div role="row" aria-rowindex={render.headerRows + 1} className="salmon-data-grid-row salmon-data-grid-empty">
            <div role="gridcell" aria-colindex={1} aria-colspan={Math.max(1, columnCount)} className={render.classNames?.empty ? `salmon-data-grid-empty__cell ${render.classNames.empty}` : 'salmon-data-grid-empty__cell'} style={render.styles?.empty}>
              {render.renderEmpty ? render.renderEmpty({ reason: emptyReason }) : render.text('noRows')}
            </div>
          </div>
        ) : null}
      </div>
      {bottom > 0 ? (
        <div role="rowgroup" className="salmon-data-grid-frozen-rows salmon-data-grid-frozen-rows--bottom" style={{ insetBlockEnd: footerRowCount(instance.props.aggregates) * layout.config.rowHeight }}>
          {bottomRows}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Body rowgroup. Re-renders only when the rendered row window or column view
 * changes (never per scroll frame otherwise); rows are keyed by row id, so
 * only entering rows mount and leaving rows unmount.
 */
export const DataGridBody = memo(DataGridBodyImpl);
