// Static grouping and aggregate helpers every grid uses: prop reads, the column grouping check, the header group toggle
// and the footer row count for `aria-rowcount`. Tiny and pure: no core
// grouping or aggregates code, no rendering. The `grouping` and
// `aggregates` render features own the rest (group-config.ts,
// aggregate-config.ts, Group.tsx, aggregate-rows.tsx).

import type { CompiledColumn } from '@salmonui/data-grid/engine';
import type { DataGridEventSource } from '@salmonui/core/internal/events';
import type { DataGridInstance } from './instance.js';
import type { DataGridAggregate, DataGridAggregateRow, DataGridGrouping } from './types.js';

export type AggregatePlacement = 'footer' | 'groupFooter' | 'groupCaption';

/** `grouping` prop as an object (`true`: defaults; `false` and absent: null). */
export function groupingOf<Row>(props: { readonly grouping?: boolean | DataGridGrouping<Row> | undefined }): DataGridGrouping<Row> | null {
  const g = props.grouping;
  if (!g) return null;
  return g === true ? {} : g;
}

/** Whether an aggregate renders at `placement`: where a template is given, else the footer only. */
export function placed<Row>(column: DataGridAggregate<Row>, placement: AggregatePlacement): boolean {
  const templated = column.renderFooter || column.renderGroupFooter || column.renderGroupCaption || column.renderChildFooter;
  if (!templated) return placement === 'footer';
  return placement === 'footer' ? !!column.renderFooter : placement === 'groupFooter' ? !!column.renderGroupFooter : !!column.renderGroupCaption;
}

/** Aggregate rows with at least one aggregate at `placement`. */
export function aggregateRowsAt<Row>(aggregates: readonly DataGridAggregateRow<Row>[] | undefined, placement: AggregatePlacement): DataGridAggregateRow<Row>[] {
  return (aggregates ?? []).filter((r) => r.columns.some((c) => placed(c, placement)));
}

/** Footer rows rendered for `aggregates` (for `aria-rowcount`). */
export function footerRowCount<Row>(aggregates: readonly DataGridAggregateRow<Row>[] | undefined): number {
  return aggregateRowsAt(aggregates, 'footer').length;
}

/** Columns that can be dragged or keyed into the group panel. Pure: reads the grouping module state only. */
export function canGroupColumn<Row>(instance: DataGridInstance<Row>, column: CompiledColumn<Row>): boolean {
  const state = instance.engine.getModuleState<{ readonly enabled: boolean }>('grouping');
  return state !== undefined && state.enabled && column.flags.allowGrouping;
}

/** Groups by a column, or ungroups it when grouped (header group toggle, `header.group` key). Returns false when the column cannot be grouped. */
export function toggleColumnGrouping<Row>(instance: DataGridInstance<Row>, column: CompiledColumn<Row>, source: DataGridEventSource): boolean {
  if (!column.leaf || !canGroupColumn(instance, column)) return false;
  const isGrouped = instance.engine.getSnapshot().query.grouping.some((g) => g.columnId === column.columnId);
  instance.dispatchFrom(source, isGrouped ? { type: 'grouping.ungroup', columnId: column.columnId } : { type: 'grouping.groupBy', columnId: column.columnId });
  return true;
}
