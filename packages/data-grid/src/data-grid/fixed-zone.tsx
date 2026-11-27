// Fixed zone (column `pinned: 'center'`).
//
// A fixed column stays in the center zone: its slot, `visible` order,
// keyboard order and `aria-colindex` are unchanged, and at scroll start the
// center columns before and after it scroll on both sides. Its cells are
// wrapped in a sticky box with both inline insets set: the start inset is the
// start zone plus the fixed columns before it, the end inset the end zone plus
// the fixed columns after it. The column therefore never leaves the viewport:
// it scrolls with its slot, then stays at the start edge (stacked after the
// start zone and earlier fixed columns) or at the end edge, and the slot it
// left is always under the box or the start / end zone, so no gap shows.
//
// Nothing here runs without a fixed column: `ColumnView.fixed` is unset and
// `centerZone` renders the plain center div.
//
// Column virtualization: a fixed slot outside the rendered center slice
// still renders. Before the slice (`data-lead`) it is first in the center div
// with zero flow width; its natural position is never right of its start
// inset because the slice starts at or before the scroll offset, so the
// sticky start inset holds it. After the slice (`data-trail`) it is last with
// zero flow width; its natural position is never left of its end edge because
// the slice ends at or after the viewport end, so the end inset holds it.

import type { ReactElement, ReactNode } from 'react';
import type { ColumnId, ColumnMetrics, ColumnSnapshot, CompiledColumn } from '@salmonui/data-grid/engine';
import type { DataGridColumnPin } from './chrome-types.js';

type Slot<Row> = { readonly column: CompiledColumn<Row>; readonly index: number };

/** Fixed columns of a column view (absent when no column is fixed). */
export interface FixedView<Row> {
  /** Fixed columns before the rendered slice, with their index in the full center zone. */
  readonly lead: readonly Slot<Row>[];
  /** Fixed columns after the rendered slice. */
  readonly trail: readonly Slot<Row>[];
  readonly ids: ReadonlySet<ColumnId>;
}

/** Sticky start / end insets of a fixed leaf, written by the column layout. */
export const fixedStartVar = (leafIndex: number): string => `--salmon-data-grid-fx-${leafIndex}`;
export const fixedEndVar = (leafIndex: number): string => `--salmon-data-grid-fe-${leafIndex}`;

/** The fixed part of a column view for the rendered center slice `[start, end)`. */
export function fixedView<Row>(columns: ColumnSnapshot<Row>, start: number, end: number): FixedView<Row> {
  const ids = new Set<ColumnId>();
  const lead: Slot<Row>[] = [];
  const trail: Slot<Row>[] = [];
  const center = columns.center;
  for (const column of columns.fixed) {
    ids.add(column.columnId);
    const index = center.indexOf(column);
    if (index < start) lead.push({ column, index });
    else if (index >= end) trail.push({ column, index });
  }
  return Object.freeze({ lead: Object.freeze(lead), trail: Object.freeze(trail), ids });
}

/**
 * CSS variables of the fixed leaves: start inset = indent + start zone +
 * widths of the earlier fixed columns; end inset = end zone + widths of the
 * later fixed columns.
 */
export function fixedVars<Row>(
  columns: ColumnSnapshot<Row>,
  widths: ReadonlyMap<ColumnId, number>,
  startInset: number,
  endInset: number,
  cssVars: Record<string, string>,
): void {
  const fixed = columns.fixed;
  let start = startInset;
  for (const column of fixed) {
    cssVars[fixedStartVar(column.leafIndex)] = `${start}px`;
    start += widths.get(column.columnId) ?? 0;
  }
  let end = endInset;
  for (let i = fixed.length - 1; i >= 0; i--) {
    const column = fixed[i] as CompiledColumn<Row>;
    cssVars[fixedEndVar(column.leafIndex)] = `${end}px`;
    end += widths.get(column.columnId) ?? 0;
  }
}

type Place = 'slot' | 'lead' | 'trail';
const styles = new WeakMap<object, Record<Place, object>>();

function fixedStyle(column: CompiledColumn<unknown>, place: Place): object {
  let entry = styles.get(column);
  if (!entry) {
    const insets = { insetInlineStart: `var(${fixedStartVar(column.leafIndex)})`, insetInlineEnd: `var(${fixedEndVar(column.leafIndex)})` };
    const collapse = `calc(-1 * var(--salmon-data-grid-cw-${column.leafIndex}))`;
    entry = {
      slot: Object.freeze(insets),
      lead: Object.freeze({ ...insets, marginInlineEnd: collapse }),
      trail: Object.freeze({ ...insets, marginInlineStart: collapse }),
    };
    styles.set(column, entry);
  }
  return entry[place];
}

function wrap(column: CompiledColumn<unknown>, node: ReactNode, place: Place): ReactElement {
  return (
    <div
      key={`fx:${column.columnId}`}
      className="salmon-data-grid-fixed"
      style={fixedStyle(column, place)}
      data-lead={place === 'lead' ? '' : undefined}
      data-trail={place === 'trail' ? '' : undefined}
      data-frozen-edge="fixed"
    >
      {node}
    </div>
  );
}

/**
 * The center zone div of a header, filter, aggregate or data row. `nodes[i]`
 * belongs to `owners[i]` (null: a node no single leaf owns, such as a stacked
 * group cell); `outside` renders a fixed column outside the rendered slice.
 */
export function centerZone<Row>(
  view: { readonly fixed?: FixedView<Row> | undefined; readonly left: readonly unknown[] },
  nodes: readonly ReactNode[],
  owners: readonly (CompiledColumn<Row> | null)[],
  outside?: (column: CompiledColumn<Row>, colIndex: number) => ReactNode,
): ReactElement {
  const fixed = view.fixed;
  if (!fixed) return <div className="salmon-data-grid-center">{nodes}</div>;
  const base = view.left.length + 1;
  const out: ReactNode[] = [];
  if (outside) for (const { column, index } of fixed.lead) out.push(wrap(column as CompiledColumn<unknown>, outside(column, base + index), 'lead'));
  for (let i = 0; i < nodes.length; i++) {
    const owner = owners[i];
    out.push(owner && fixed.ids.has(owner.columnId) ? wrap(owner as CompiledColumn<unknown>, nodes[i], 'slot') : nodes[i]);
  }
  if (outside) for (const { column, index } of fixed.trail) out.push(wrap(column as CompiledColumn<unknown>, outside(column, base + index), 'trail'));
  return (
    <div className="salmon-data-grid-center" data-fixed="">
      {out}
    </div>
  );
}

/** Public pin side of a visible leaf: its zone, or `center` for a fixed column. */
export function pinOfColumn<Row>(columns: ColumnSnapshot<Row>, columnId: ColumnId): DataGridColumnPin | null {
  const zone = columns.zones.get(columnId);
  if (zone === 'left') return 'start';
  if (zone === 'right') return 'end';
  return columns.fixed.length && columns.fixed.some((c) => c.columnId === columnId) ? 'center' : null;
}

/**
 * Horizontal scroll that reveals center column `ci` (keyboard focus,
 * `scrollToColumn`) when fixed boxes can cover part of the center: a fixed
 * column is always in view and needs no scroll; any other column must start
 * right of the fixed columns before it (they may be stacked at the start
 * edge) and end left of the fixed columns after it (stacked at the end edge).
 * `left` is the scroll a plain reveal computed; returned unchanged without
 * fixed columns.
 */
export function revealPastFixed<Row>(columns: ColumnSnapshot<Row>, metrics: ColumnMetrics, ci: number, left: number, current: number, extent: number): number {
  if (!columns.fixed.length) return left;
  const center = columns.center;
  const target = center[ci];
  if (!target) return left;
  if (columns.fixed.includes(target)) return current;
  let before = 0;
  let after = 0;
  for (const column of columns.fixed) {
    const index = center.indexOf(column);
    if (index < ci) before += metrics.widthOf(index);
    else after += metrics.widthOf(index);
  }
  const offset = metrics.offsetOf(ci);
  let next = left;
  if (offset + metrics.widthOf(ci) - next > extent - after) next = offset + metrics.widthOf(ci) - (extent - after);
  if (offset - next < before) next = offset - before;
  return Math.max(0, next);
}
