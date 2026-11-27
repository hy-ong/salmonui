'use client';

// Aggregate rows of the `aggregates` render feature (feature-aggregates.ts):
// the sticky grid footer, group footer rows (they exist only with
// `groupFooter` aggregates) and the aggregates of a group caption. Reached
// only through the feature (and the public `DataGridFooter` /
// `DataGridGroupFooterRow` / `DataGridGroupIndent` exports), so a grid
// without `aggregates` never loads it.

import { memo, useLayoutEffect, useSyncExternalStore, type ReactNode } from 'react';
import type { AggregateType, AggregateValues, CompiledColumn, GroupRowSnapshot, RowId } from '@salmonui/data-grid/engine';
import { columnWidthStyle } from './Cell.js';
import { centerZone } from './fixed-zone.js';
import { columnInfo } from './column-info.js';
import { useEngineSelector, useDataGridInstance, useDataGridRender } from './context.js';
import type { DataGridGroupRowProps } from './features/types.js';
import { aggregateRowsAt, placed } from './group-static.js';
import type { DataGridInstance } from './instance.js';
import type { DataGridText } from './locale-text.js';
import type { ColumnView } from './layout.js';
import type { DataGridAggregate, DataGridAggregateContext, DataGridAggregateRow, DataGridProps } from './types.js';

type GroupingFacade<Row> = {
  getGroup(rowId: RowId): GroupRowSnapshot | undefined;
  getGroupRows(rowId: RowId): readonly Row[];
};
type AggregatesFacade = {
  getFooter(): AggregateValues;
  format(columnId: string, type: string, value: unknown): string;
};

function groupingOf<Row>(instance: DataGridInstance<Row>): GroupingFacade<Row> {
  return (instance.engine as unknown as { grouping: GroupingFacade<Row> }).grouping;
}

function aggregatesOf<Row>(instance: DataGridInstance<Row>): AggregatesFacade | undefined {
  return (instance.engine as unknown as { aggregates?: AggregatesFacade }).aggregates;
}

/** Frozen group indent block (`levels` x indent width); presentational, outside the accessibility tree. */
export function DataGridGroupIndent({ levels }: { levels: number }) {
  if (levels <= 0) return null;
  return <div className="salmon-data-grid-indent" aria-hidden="true" />;
}

/** Aggregate types of a column (`type` is one type or a list). */
export function typesOf<Row>(column: DataGridAggregate<Row>): readonly AggregateType[] {
  return typeof column.type === 'string' ? [column.type] : column.type;
}

function aggregateContext<Row>(
  instance: DataGridInstance<Row>,
  column: DataGridAggregate<Row>,
  aggregates: AggregateValues,
  group: GroupRowSnapshot | null,
  count: number,
): DataGridAggregateContext<Row> {
  const values = aggregates[column.field] ?? {};
  const compiledColumn = instance.engine.getSnapshot().columns.byId.get(column.field) as CompiledColumn<Row> | undefined;
  const formatted: Record<string, string> = {};
  const facade = aggregatesOf(instance);
  for (const t of typesOf(column)) formatted[t] = facade ? facade.format(column.field, t, values[t]) : String(values[t] ?? '');
  return {
    field: column.field,
    column: compiledColumn ? columnInfo(compiledColumn) : undefined,
    values,
    formatted,
    group,
    key: group ? group.key : null,
    count,
    aggregates,
    rows: () => (group ? groupingOf(instance).getGroupRows(group.id) : instance.api.getViewRows()),
  };
}

/** Default aggregate content: `Sum: 1,234` per type (every aggregate type has a `localeText` label keyed by the type). */
function defaultAggregate(ctx: DataGridAggregateContext<unknown>, types: readonly string[], text: DataGridText): ReactNode {
  return types.map((t, i) => (
    <span key={t} className="salmon-data-grid-aggregate__value" data-type={t}>
      {i > 0 ? ' ' : null}
      {text.optional(t)}: {ctx.formatted[t]}
    </span>
  ));
}

function useGroupSnapshot<Row>(instance: DataGridInstance<Row>, rowId: RowId): GroupRowSnapshot | undefined {
  const engine = instance.engine;
  const read = (): GroupRowSnapshot | undefined => groupingOf(instance).getGroup(rowId);
  // Server snapshot: what the server rendered, never the live state (hydration).
  const readServer = (): GroupRowSnapshot | undefined => instance.serverRead(`g\u0000${rowId}`, read);
  return useSyncExternalStore((onChange) => engine.subscribeRow(rowId, onChange), read, readServer);
}

/** Aggregates in a group caption (`renderGroupCaption` placements); the `aggregates` feature part. */
export function DataGridGroupCaptionAggregates({ group }: { readonly group: GroupRowSnapshot }) {
  const instance = useDataGridInstance<unknown>();
  const text = useDataGridRender<unknown>().text;
  const aggregateRows = (instance.props as DataGridProps<unknown>).aggregates;
  const parts: ReactNode[] = [];
  for (const row of aggregateRows ?? []) {
    for (const column of row.columns) {
      if (!placed(column, 'groupCaption')) continue;
      const ctx = aggregateContext(instance, column, group.aggregates, group, group.count);
      const header = ctx.column?.header ?? column.field;
      parts.push(
        <span key={parts.length} className="salmon-data-grid-group-caption__aggregate" data-column-id={column.field}>
          {column.renderGroupCaption ? column.renderGroupCaption(ctx) : (
            <>
              {header} {defaultAggregate(ctx as DataGridAggregateContext<unknown>, typesOf(column), text)}
            </>
          )}
        </span>,
      );
    }
  }
  return parts;
}



// ---------------------------------------------------------------------------
// Aggregate rows (group footers and the grid footer)
// ---------------------------------------------------------------------------

interface AggregateCellsProps<Row> {
  instance: DataGridInstance<Row>;
  text: DataGridText;
  view: ColumnView<Row>;
  row: DataGridAggregateRow<Row>;
  placement: 'footer' | 'groupFooter';
  aggregates: AggregateValues;
  group: GroupRowSnapshot | null;
  count: number;
}

function aggregateCells<Row>({ instance, text, view, row, placement, aggregates, group, count }: AggregateCellsProps<Row>): ReactNode {
  const byColumn = new Map<string, DataGridAggregate<Row>[]>();
  for (const column of row.columns) {
    if (!placed(column, placement)) continue;
    const at = column.displayField ?? column.field;
    const list = byColumn.get(at) ?? [];
    list.push(column);
    byColumn.set(at, list);
  }
  const cell = (column: CompiledColumn<Row>, colIndex: number): ReactNode => {
    const defs = byColumn.get(column.columnId);
    let content: ReactNode = null;
    if (defs) {
      content = defs.map((def, i) => {
        const ctx = aggregateContext(instance, def, aggregates, group, count);
        const template = placement === 'footer' ? def.renderFooter : def.renderGroupFooter;
        return <span key={i}>{template ? template(ctx) : defaultAggregate(ctx as DataGridAggregateContext<unknown>, typesOf(def), text)}</span>;
      });
    }
    return (
      <div
        key={column.columnId}
        role="gridcell"
        aria-colindex={colIndex}
        // Footer cells are the F6 footer region's focus target (programmatic focus only).
        tabIndex={placement === 'footer' ? -1 : undefined}
        className="salmon-data-grid-cell salmon-data-grid-aggregate-cell"
        style={columnWidthStyle(column as CompiledColumn<unknown>)}
        data-column-id={column.columnId}
        data-align={column.def.align === 'end' || column.def.align === 'center' ? column.def.align : undefined}
      >
        {content}
      </div>
    );
  };
  const leftCount = view.left.length;
  const centerBase = leftCount + view.centerStart + 1;
  const rightBase = leftCount + view.centerCount + 1;
  return (
    <>
      {view.indent > 0 ? <div className="salmon-data-grid-indent" aria-hidden="true" /> : null}
      {leftCount > 0 ? <div className="salmon-data-grid-pin salmon-data-grid-pin--left" data-frozen-edge="start">{view.left.map((c, i) => cell(c, i + 1))}</div> : null}
      {centerZone(view, view.center.map((c, j) => cell(c, centerBase + j)), view.center, cell)}
      {view.right.length > 0 ? <div className="salmon-data-grid-pin salmon-data-grid-pin--right" data-frozen-edge="end">{view.right.map((c, k) => cell(c, rightBase + k))}</div> : null}
    </>
  );
}

function DataGridGroupFooterRowImpl({ rowId, rowIndex, view }: DataGridGroupRowProps) {
  const instance = useDataGridInstance<unknown>();
  const render = useDataGridRender<unknown>();
  const group = useGroupSnapshot(instance, rowId);
  const rows = aggregateRowsAt((instance.props as DataGridProps<unknown>).aggregates, 'groupFooter');
  return (
    <div
      role="row"
      aria-rowindex={render.headerRows + rowIndex + 1}
      className={`salmon-data-grid-row salmon-data-grid-group-footer${render.classNames?.footer ? ` ${render.classNames.footer}` : ''}`}
      data-row-id={rowId}
      data-row-index={rowIndex}
      data-depth={group?.depth}
    >
      {group
        ? rows.map((row, i) => (
            <div key={i} className="salmon-data-grid-group-footer__line">
              {aggregateCells({ instance, text: render.text, view, row, placement: 'groupFooter', aggregates: group.aggregates, group, count: group.count })}
            </div>
          ))
        : null}
    </div>
  );
}

/** Group footer row (group-level aggregates). */
export const DataGridGroupFooterRow = memo(DataGridGroupFooterRowImpl);

function DataGridFooterImpl() {
  const instance = useDataGridInstance<unknown>();
  const render = useDataGridRender<unknown>();
  const layout = instance.layout;
  const view = useSyncExternalStore(layout.subscribe, layout.getColumnView, layout.getServerColumnView);
  const props = instance.props as DataGridProps<unknown>;
  const rows = aggregateRowsAt(props.aggregates, 'footer');
  // The footer values change only with the row model or data result.
  const values = useEngineSelector(instance, () => aggregatesOf(instance)?.getFooter() ?? null);
  const rowCount = useEngineSelector(instance, (s) => s.rows.count);
  // `count` follows the aggregate scope like the values: the page's data rows for `aggregateScope: 'page'`,
  // every matching row for 'all' or server aggregates (which cover every matching row). Pinned rows
  // count in the footer totals; a view's dataCount and the paging total leave them out.
  const count = useEngineSelector(instance, (s) => {
    const pinned = s.rows.pinned?.length ?? 0;
    const scope = (s.modules['aggregates'] as { readonly scope?: string } | undefined)?.scope;
    const server = s.data.performed.includes('aggregate') && s.data.aggregates !== undefined && s.data.aggregates !== null;
    const total = scope === 'all' || server ? (instance.query.pageInfo()?.totalRowCount ?? -1) : -1;
    return total >= 0 ? total + pinned : s.rows.view ? s.rows.view.dataCount + pinned : s.rows.count;
  });
  useLayoutEffect(() => {
    layout.setFooterRows(rows.length);
  }, [layout, rows.length]);
  if (!rows.length || !values) return null;
  return (
    <div role="rowgroup" className={`salmon-data-grid-footer${render.classNames?.footer ? ` ${render.classNames.footer}` : ''}`} style={render.styles?.footer}>
      {rows.map((row, i) => (
        <div key={i} role="row" aria-rowindex={render.headerRows + rowCount + i + 1} className="salmon-data-grid-row salmon-data-grid-footer-row">
          {aggregateCells({ instance, text: render.text, view, row, placement: 'footer', aggregates: values, group: null, count })}
        </div>
      ))}
    </div>
  );
}

/** Sticky grid footer with the footer aggregate rows. */
export const DataGridFooter = memo(DataGridFooterImpl);
