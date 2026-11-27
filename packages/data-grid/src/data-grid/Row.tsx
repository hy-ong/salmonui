'use client';

import { memo, useLayoutEffect, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type { CompiledColumn, RowId, RowSnapshot } from '@salmonui/data-grid/engine';
import { columnWidthStyle, DataGridCell, joinClass } from './Cell.js';
import { centerZone } from './fixed-zone.js';
import { parseRowSpanKey, type PlannedCell } from './spans.js';
import { DEV } from '@salmonui/core/internal/dev';
import { useDataGridInstance, useDataGridRender, useRenderRecord } from './context.js';
import { UI_ROW_SELECTED } from './interaction.js';
import type { ColumnView } from './layout.js';
import type { DataGridRowElementProps } from './types.js';

const noopSubscribe = (): (() => void) => () => {};
const readNull = (): null => null;
const NO_ROW_CTX = {};

/** Header rows above the data rows (stacked headers add more). */
export const HEADER_ROW_COUNT = 1;


/** Span plans of a row's zones (null: the zone renders one cell per column). */
export interface RowSpanPlans<Row> {
  readonly left: readonly PlannedCell<Row>[] | null;
  readonly center: readonly PlannedCell<Row>[] | null;
  readonly right: readonly PlannedCell<Row>[] | null;
  /** Columns whose span was clamped at a pin edge or the last column (dev warning after commit). */
  readonly clamped?: readonly string[];
}

function useSpanEdgeWarningDev(instance: { warnSpanEdges(clamped: readonly string[]): void }, clamped: readonly string[] | undefined): void {
  const key = clamped?.join('\u0000');
  useLayoutEffect(() => {
    if (key) instance.warnSpanEdges(key.split('\u0000'));
  }, [instance, key]);
}

/** Development only (a module constant, so the hook order never changes). */
const useSpanEdgeWarning: (instance: { warnSpanEdges(clamped: readonly string[]): void }, clamped: readonly string[] | undefined) => void = DEV ? useSpanEdgeWarningDev : () => {};

const noRenderKey = (): undefined => undefined;

/** Cells of one row for a column view: left frozen zone, rendered center slice, right frozen zone. */
export function renderRowCells<Row>(
  rowId: RowId,
  rowIndex: number,
  view: ColumnView<Row>,
  plans?: RowSpanPlans<Row> | null,
  renderKey: (columnId: string) => number | undefined = noRenderKey,
): ReactNode {
  const cell = (column: CompiledColumn<Row>, colIndex: number) => (
    <DataGridCell<Row> key={column.columnId} rowId={rowId} column={column} rowIndex={rowIndex} colIndex={colIndex} renderKey={renderKey(column.columnId)} />
  );
  const planned = (p: PlannedCell<Row>, base: number) =>
    p.colSpan === 0 ? (
      <div key={p.column.columnId} className="salmon-data-grid-cell-spacer" style={columnWidthStyle(p.column as CompiledColumn<unknown>)} aria-hidden="true" />
    ) : (
      <DataGridCell<Row>
        key={p.column.columnId}
        rowId={p.anchorRowId ?? rowId}
        column={p.column}
        rowIndex={p.anchorRowIndex ?? rowIndex}
        colIndex={base + p.index}
        colSpan={p.colSpan}
        rowSpan={p.rowSpan}
        spanStyle={p.style}
        spanAnchor={p.anchorRowId !== undefined}
        renderKey={renderKey(p.column.columnId)}
      />
    );
  const leftCount = view.left.length;
  const centerBase = leftCount + view.centerStart + 1;
  const rightBase = leftCount + view.centerCount + 1;
  const zone = (list: readonly CompiledColumn<Row>[], plan: readonly PlannedCell<Row>[] | null | undefined, base: number, planBase: number) =>
    plan ? plan.map((p) => planned(p, planBase)) : list.map((c, i) => cell(c, base + i));
  return (
    <>
      {view.indent > 0 ? <div className="salmon-data-grid-indent" aria-hidden="true" /> : null}
      {leftCount > 0 ? <div className="salmon-data-grid-pin salmon-data-grid-pin--left" data-frozen-edge="start">{zone(view.left, plans?.left, 1, 1)}</div> : null}
      {view.fixed
        ? centerZone(view, zone(view.center, plans?.center, centerBase, leftCount + 1), plans?.center ? plans.center.map((p) => p.column) : view.center, cell)
        : <div className="salmon-data-grid-center">{zone(view.center, plans?.center, centerBase, leftCount + 1)}</div>}
      {view.right.length > 0 ? <div className="salmon-data-grid-pin salmon-data-grid-pin--right" data-frozen-edge="end">{zone(view.right, plans?.right, rightBase, rightBase)}</div> : null}
    </>
  );
}

export interface DataGridRowProps extends Omit<DataGridRowElementProps, 'role' | 'aria-rowindex' | 'className' | 'data-row-id' | 'data-row-index'> {
  'aria-rowindex': number;
  'data-row-id': RowId;
  'data-row-index'?: number;
  className?: string;
  children?: ReactNode;
}

/** `role="row"` part for row templates: spread `rowProps` and place `cells` inside. */
export function DataGridRow({ className, children, ...rest }: DataGridRowProps) {
  return (
    <div {...rest} role="row" className={className?.includes('salmon-data-grid-row') ? className : joinClass('salmon-data-grid-row', className)}>
      {children}
    </div>
  );
}

interface RowRendererProps<Row> {
  rowId: RowId;
  rowIndex: number;
  view: ColumnView<Row>;
  /** Serialized row span facts of this row (`computeRowSpans`); a string so unchanged rows keep equal props. */
  rowSpans?: string | undefined;
  /** DataGrid-level render version of render-only column fields (instance `getColumnRenderVersion`); re-renders the row so changed columns' cells re-render. */
  columnRender?: number;
  /** A pinned row in the top zone; `last` draws the line below the pinned rows. */
  pinned?: 'pinned' | 'last' | undefined;
}

function DataGridRowRendererImpl<Row>({ rowId, rowIndex, view, rowSpans, pinned }: RowRendererProps<Row>) {
  const instance = useDataGridInstance<Row>();
  const render = useDataGridRender<Row>();
  const engine = instance.engine;
  const read = (): RowSnapshot<Row> | undefined => engine.getRowSnapshot(rowId);
  // Server snapshots return what the server rendered, never the live state (hydration).
  const readServer = (): RowSnapshot<Row> | undefined => instance.serverRead(`r\u0000${rowId}`, read);
  const snapshot = useSyncExternalStore((onChange) => engine.subscribeRow(rowId, onChange), read, readServer);
  const interaction = instance.interaction;
  const edit = instance.editing.active ? instance.editing : null;
  const readUi = edit ? (): number => interaction.rowUi(rowId) | edit.rowBits(rowId) : (): number => interaction.rowUi(rowId);
  const readUiServer = (): number => instance.serverRead(`ru\u0000${rowId}`, readUi);
  const ui = useSyncExternalStore((onChange) => engine.subscribeRow(rowId, onChange), readUi, readUiServer);
  // Always called: the `detail` feature's selector, or a constant null without it.
  const detailExpanded = instance.features.selectors.detailExpanded;
  const readExpanded = detailExpanded ? (): boolean | null => detailExpanded(instance as never, rowId) : readNull;
  const expanded = useSyncExternalStore(
    detailExpanded ? (onChange) => engine.subscribeRow(rowId, onChange) : noopSubscribe,
    readExpanded,
    detailExpanded ? () => instance.serverRead(`de\u0000${rowId}`, readExpanded) : readNull,
  );
  // Always called: the `tree` feature's row view (row ARIA, data attributes, `ctx.tree`), or a constant null.
  const treeRow = instance.features.selectors.treeRow;
  const readTree = treeRow ? () => treeRow(instance as never, rowId) : readNull;
  const tree = useSyncExternalStore(treeRow ? (onChange) => engine.subscribe(onChange) : noopSubscribe, readTree, treeRow ? () => instance.serverRead(`t\u0000${rowId}`, readTree) : readNull);
  useRenderRecord(instance, 'row', rowId);
  const selected = (ui & UI_ROW_SELECTED) !== 0;
  const row = (snapshot?.row ?? null) as Row;
  const getRowHeight = instance.layout.config.getRowHeight;
  const extra = render.getRowProps?.(row, rowIndex, tree ? tree.ctx : NO_ROW_CTX);
  const { className: extraClass, style: extraStyle, ...extraRest } = extra ?? {};
  const partStyle = render.styles?.row;
  let style: CSSProperties | undefined = partStyle || extraStyle ? { ...partStyle, ...extraStyle } : undefined;
  if (getRowHeight && !instance.layout.config.measureRows) style = { ...style, height: getRowHeight(row) };
  const rowProps: DataGridRowElementProps = {
    ...extraRest,
    role: 'row',
    'aria-rowindex': render.headerRows + rowIndex + 1,
    className: joinClass('salmon-data-grid-row', render.classNames?.row, render.rowClassName?.(row, rowIndex), extraClass),
    'data-row-id': rowId,
    'data-row-index': rowIndex,
  };
  if (interaction.rowSelectionMode()) rowProps['aria-selected'] = selected;
  // aria-expanded is valid on treegrid rows only (axe aria-conditional-attr); the toggle
  // button carries it, the row exposes the state to styles and templates as data-expanded.
  if (expanded !== null) rowProps['data-expanded'] = expanded ? 'true' : 'false';
  if (tree) Object.assign(rowProps, tree.attrs);
  if (selected) rowProps['data-selected'] = '';
  if (pinned) rowProps['data-pinned'] = pinned === 'last' ? 'last' : '';
  if (style) rowProps.style = style;
  if (rowIndex % 2 === 1) rowProps['data-alt'] = '';
  // The `editing` feature's row marks (the inert selector returns null).
  if (edit) Object.assign(rowProps, instance.features.selectors.editRowAttrs(ui));
  if (instance.layout.config.measureRows) rowProps.ref = instance.measureRow;
  const plans = instance.spanPlans(row, rowId, rowIndex, view, parseRowSpanKey(rowSpans), render.mergeCells);
  useSpanEdgeWarning(instance, plans?.clamped);
  const cells = renderRowCells(rowId, rowIndex, view, plans, instance.renderKeyOf);
  const defaultRow = <div {...rowProps}>{cells}</div>;
  if (render.renderRow) return <>{render.renderRow({ row, rowId, rowIndex, rowProps, cells, defaultRow })}</>;
  return defaultRow;
}

/**
 * Body row keyed by row id. Re-renders only when its row snapshot, index, or
 * the column view changes; a row-window change mounts entering rows and
 * unmounts leaving rows without touching retained ones.
 */
export const DataGridRowRenderer = memo(DataGridRowRendererImpl) as <Row>(props: RowRendererProps<Row>) => ReactNode;
