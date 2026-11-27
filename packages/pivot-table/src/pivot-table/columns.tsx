'use client';

// Data Grid column definitions for a pivot result: pinned row header column(s) and stacked value columns
// from the column header tree. Cells read the result through the row stub;
// the definitions depend on the column tree shape only.

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefCallback } from 'react';
import { measureId, type PivotCell, type PivotHeaderNode, type PivotResult } from '@salmonui/pivot-table/engine';
import type { DataGridCellContext, DataGridColumn, DataGridHeaderContext } from '@salmonui/data-grid';
import type { PivotController } from './controller.js';
import { conditionalStyle, memberLabel, ROW_FIELD_PREFIX, ROW_HEADER_ID, safeId, startsBlock, type PivotRowStub, type PivotView } from './grid-model.js';
import type { PivotText } from './locale.js';
import type { PivotCellContext, PivotEventSource, PivotHeaderContext, PivotTableLayout, PivotTooltipContext } from './types.js';
import { usePivotState } from './usePivot.js';

export interface ColumnOptions<Row> {
  readonly pivot: PivotController<Row>;
  readonly layout: PivotTableLayout;
  readonly text: PivotText;
  readonly rowFieldCaptions: readonly string[];
  readonly columnWidth: number;
  readonly rowHeaderWidth: number | undefined;
  readonly emptyCellText: string;
  readonly drillThrough: boolean;
  /** Value sort buttons on the leaf column headers; null = off. */
  readonly valueSorting: { readonly multipleAxis: boolean } | null;
  /** Column leaf positions shown (column paging); null = every column. */
  readonly columnRange: readonly [number, number] | null;
  readonly renderCell: ((ctx: PivotCellContext) => ReactNode) | undefined;
  readonly renderHeader: ((ctx: PivotHeaderContext) => ReactNode) | undefined;
  readonly renderTooltip: ((ctx: PivotTooltipContext) => ReactNode) | undefined;
  readonly getCellClassName: ((ctx: PivotCellContext) => string | undefined) | undefined;
}

const CHEVRON = (
  <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
    <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** The drill toggle of a member header: a button with `aria-expanded` (not a tab stop; Enter / Space on the cell drill too). */
export function DrillToggle<Row>({ node, pivot, text, label }: { node: PivotHeaderNode; pivot: PivotController<Row>; text: PivotText; label: string }) {
  return (
    <button
      type="button"
      className="salmon-pivot-table-toggle"
      tabIndex={-1}
      aria-expanded={node.expanded}
      aria-label={text(node.expanded ? 'collapse' : 'expand', { label })}
      onClick={(event) => {
        event.stopPropagation();
        pivot.toggle(node, { source: event.detail === 0 ? 'keyboard' : 'pointer' });
      }}
    >
      {CHEVRON}
    </button>
  );
}

/** Text of a row header node: grand total and subtotal captions come from the catalog. */
export function rowLabel(view: PivotView, node: PivotHeaderNode, text: PivotText): string {
  if (node.kind === 'grandTotal') return text('grandTotal');
  if (node.kind === 'subtotal') return text('subtotal', { label: node.path.length ? memberLabel(view, node.path, node.path.length - 1) : node.label });
  return node.label;
}

/** Column header text: grand total columns from the catalog. */
export function columnLabel(node: PivotHeaderNode, text: PivotText): string {
  if (node.kind === 'grandTotal') return text('grandTotal');
  if (node.kind === 'subtotal') return text('subtotal', { label: node.label });
  return node.label;
}

/**
 * Patches the row header cell after mount (client only, so server markup stays
 * a valid `grid`): `role="rowheader"` on the cell and, in the compact layout,
 * `aria-level` / `aria-expanded` on the row (the root is `treegrid`). The Data
 * Grid renderer has no per-cell role or row ARIA hook; this keeps its bytes
 * unchanged.
 */
function ariaRef(level: number | null, expanded: boolean | null, header = true): RefCallback<HTMLElement> {
  return (el) => {
    const cell = el?.closest('.salmon-data-grid-cell');
    if (!cell) return;
    // An empty row field cell (an outer level's subtotal row, the grand total span) is not a header (axe empty-table-header).
    cell.setAttribute('role', header ? 'rowheader' : 'gridcell');
    if (level === null) return;
    const row = cell.closest('[role="row"]');
    if (!row) return;
    row.setAttribute('aria-level', String(level));
    if (expanded === null) row.removeAttribute('aria-expanded');
    else row.setAttribute('aria-expanded', String(expanded));
  };
}

function CompactRowHeader<Row>({ stub, options }: { stub: PivotRowStub; options: ColumnOptions<Row> }) {
  const { pivot, text, renderHeader } = options;
  const node = stub.v.result.memberAt('rows', stub.i);
  const label = rowLabel(stub.v, node, text);
  const depth = node.kind === 'grandTotal' ? 0 : Math.max(0, node.depth);
  const content = (
    <span className="salmon-pivot-table-row-header" style={{ '--salmon-pivot-level': depth } as CSSProperties} ref={ariaRef(depth + 1, node.expandable ? node.expanded : null)}>
      {node.expandable ? <DrillToggle node={node} pivot={pivot} text={text} label={label} /> : <span className="salmon-pivot-table-toggle-space" aria-hidden="true" />}
      <span className="salmon-pivot-table-member">{label}</span>
    </span>
  );
  return renderHeader ? <>{renderHeader({ header: node, axis: 'rows', defaultContent: content })}</> : content;
}

function TabularRowHeader<Row>({ stub, level, options }: { stub: PivotRowStub; level: number; options: ColumnOptions<Row> }) {
  const { pivot, text, renderHeader } = options;
  const view = stub.v;
  const node = view.result.memberAt('rows', stub.i);
  const own = node.kind === 'grandTotal' ? 0 : node.path.length - 1;
  if (node.kind === 'grandTotal' && level > 0) return <span ref={ariaRef(null, null, false)} />;
  if (level > own) return <span ref={ariaRef(null, null, false)} />;
  if (level < own) {
    // Ancestor label: shown on the first row of the member's block, kept for assistive tech on the others.
    const repeat = !startsBlock(view, stub.i, level);
    return (
      <span className="salmon-pivot-table-member" data-repeat={repeat ? '' : undefined} ref={ariaRef(null, null)}>
        {memberLabel(view, node.path, level)}
      </span>
    );
  }
  const label = rowLabel(view, node, text);
  const content = (
    <span className="salmon-pivot-table-row-header" ref={ariaRef(null, null)}>
      {node.expandable ? <DrillToggle node={node} pivot={pivot} text={text} label={label} /> : null}
      <span className="salmon-pivot-table-member">{label}</span>
    </span>
  );
  return renderHeader ? <>{renderHeader({ header: node, axis: 'rows', defaultContent: content })}</> : content;
}

/** Sort key of a leaf column: its header key and measure (the first value field when measures are not on the columns). */
function valueSortTarget<Row>(pivot: PivotController<Row>, node: PivotHeaderNode): { columnKey: string; measure: string } | null {
  const values = pivot.model.values;
  const measure = node.measure ?? (values.length ? measureId(values, 0) : null);
  return measure === null ? null : { columnKey: node.key, measure };
}

/** Header click or key: ascending, then descending, then no value sort. */
export function cycleValueSort<Row>(pivot: PivotController<Row>, node: PivotHeaderNode, multipleAxis: boolean, source: PivotEventSource): boolean {
  const target = valueSortTarget(pivot, node);
  if (!target) return false;
  const current = pivot.model.valueSort;
  const same = current?.columnKey === target.columnKey && current.measure === target.measure;
  if (same && current.direction === 'desc') return pivot.setValueSort(null, { source });
  return pivot.setValueSort({ ...target, direction: same ? 'desc' : 'asc', multipleAxis }, { source });
}

function ValueSortButton<Row>({ node, options, label, multipleAxis }: { node: PivotHeaderNode; options: ColumnOptions<Row>; label: string; multipleAxis: boolean }) {
  const { pivot, text } = options;
  const sort = usePivotState(pivot as PivotController<unknown>, (s) => s.model.valueSort);
  const target = valueSortTarget(pivot, node);
  const direction = sort && target && sort.columnKey === target.columnKey && sort.measure === target.measure ? sort.direction : null;
  const ref = useRef<HTMLButtonElement>(null);
  // The Data Grid owns the columnheader element and sets `aria-sort` only for its own sort.
  useLayoutEffect(() => {
    ref.current?.closest('[role="columnheader"]')?.setAttribute('aria-sort', direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none');
  }, [direction]);
  return (
    <button
      ref={ref}
      type="button"
      className="salmon-pivot-table-toggle salmon-pivot-table-value-sort"
      tabIndex={-1}
      data-direction={direction ?? undefined}
      aria-label={text('sortByValue', { label })}
      onClick={(event) => {
        event.stopPropagation();
        cycleValueSort(pivot, node, multipleAxis, event.detail === 0 ? 'keyboard' : 'pointer');
      }}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
        <path d="M8 13V3M4 7l4-4 4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function ColumnHeader<Row>({ node, options }: { node: PivotHeaderNode; options: ColumnOptions<Row> }) {
  const { pivot, text, renderHeader } = options;
  const label = columnLabel(node, text);
  const content = (
    <span className="salmon-pivot-table-column-header">
      {node.expandable && node.kind === 'member' ? <DrillToggle node={node} pivot={pivot} text={text} label={label} /> : null}
      <span className="salmon-pivot-table-member">{label}</span>
      {options.valueSorting && !node.children?.length ? <ValueSortButton node={node} options={options} label={label} multipleAxis={options.valueSorting.multipleAxis} /> : null}
    </span>
  );
  return renderHeader ? <>{renderHeader({ header: node, axis: 'columns', defaultContent: content })}</> : content;
}

/** The pivot cell behind a Data Grid cell (memoized per view for the rendered window). */
export function cellOf(stub: PivotRowStub, columnId: string): PivotCell | null {
  const c = stub.v.columnIndex.get(columnId);
  if (c === undefined) return null;
  return stub.v.result.cellAt(stub.i, c);
}

function ValueCell<Row>({ ctx, node, options }: { ctx: DataGridCellContext<PivotRowStub>; node: PivotHeaderNode; options: ColumnOptions<Row> }) {
  const cell = cellOf(ctx.row, ctx.field);
  if (!cell) return null;
  const empty = cell.value === null && cell.formattedValue === '';
  const defaultContent: ReactNode = empty ? options.emptyCellText : cell.formattedValue;
  const rowHeader = ctx.row.v.result.memberAt('rows', ctx.row.i);
  const content = options.renderCell ? options.renderCell({ cell, rowHeader, columnHeader: node, selected: ctx.selected, defaultContent }) : defaultContent;
  if (!options.renderTooltip) return <>{content}</>;
  return (
    <span className="salmon-pivot-table-value" data-tooltip="">
      {content}
      <span className="salmon-pivot-table-tooltip" role="tooltip">
        {options.renderTooltip({ cell, rowHeader, columnHeader: node })}
      </span>
    </span>
  );
}

const KIND_CLASS: Readonly<Record<string, string>> = {
  subtotal: 'salmon-pivot-table-subtotal',
  grandTotal: 'salmon-pivot-table-grand-total',
};

function valueColumn<Row>(node: PivotHeaderNode, options: ColumnOptions<Row>): DataGridColumn<PivotRowStub> {
  const id = safeId(node.key);
  return {
    id,
    header: columnLabel(node, options.text),
    width: options.columnWidth,
    align: 'end',
    headerAlign: 'end',
    type: 'number',
    sortable: false,
    filterable: false,
    groupable: false,
    editable: false,
    hideable: false,
    valueGetter: (stub) => {
      const c = stub.v.columnIndex.get(id);
      return c === undefined ? null : stub.v.result.valueAt(stub.i, c);
    },
    valueFormatter: (_value, ctx) => cellOf(ctx.row, ctx.column.columnId)?.formattedValue ?? '',
    ...(options.renderHeader || node.expandable || options.valueSorting ? { renderHeader: () => <ColumnHeader node={node} options={options} /> } : {}),
    renderCell: (ctx) => <ValueCell ctx={ctx} node={node} options={options} />,
    cellClassName: (ctx) => {
      const cell = cellOf(ctx.row, ctx.field);
      if (!cell) return undefined;
      const rowNode = ctx.row.v.result.memberAt('rows', ctx.row.i);
      const kind = cell.kind !== 'value' ? cell.kind : rowNode.kind === 'subtotal' || rowNode.kind === 'grandTotal' ? rowNode.kind : 'value';
      const classes = [KIND_CLASS[kind], conditionalStyle(ctx.row.v.result.model, cell).className];
      if (options.drillThrough && cell.rowCount > 0) classes.push('salmon-pivot-table-drillable');
      if (options.getCellClassName) classes.push(options.getCellClassName({ cell, rowHeader: rowNode, columnHeader: node, selected: ctx.selected, defaultContent: cell.formattedValue }));
      const out = classes.filter(Boolean).join(' ');
      return out || undefined;
    },
    cellProps: (ctx) => {
      const cell = cellOf(ctx.row, ctx.field);
      const style = cell ? conditionalStyle(ctx.row.v.result.model, cell).style : undefined;
      return style ? { style: style as CSSProperties } : undefined;
    },
  };
}

function groupColumn<Row>(node: PivotHeaderNode, children: DataGridColumn<PivotRowStub>[], options: ColumnOptions<Row>): DataGridColumn<PivotRowStub> {
  return {
    id: safeId(node.key, 'g'),
    header: columnLabel(node, options.text),
    headerAlign: 'center',
    renderHeader: (_ctx: DataGridHeaderContext<PivotRowStub>) => <ColumnHeader node={node} options={options} />,
    columns: children,
  };
}

/** Value columns of the column tree, limited to `range` (leaf positions) for column paging. */
function treeColumns<Row>(nodes: readonly PivotHeaderNode[], options: ColumnOptions<Row>): DataGridColumn<PivotRowStub>[] {
  const out: DataGridColumn<PivotRowStub>[] = [];
  const range = options.columnRange;
  for (const node of nodes) {
    if (range && (node.position + node.span <= range[0] || node.position >= range[1])) continue;
    if (node.children?.length) {
      const children = treeColumns(node.children, options);
      if (children.length) out.push(groupColumn(node, children, options));
    } else out.push(valueColumn(node, options));
  }
  return out;
}

// The Data Grid re-renders a cell when its value changes, so the row header
// value carries the drill state (and the tabular label repeat) after a
// separator; the formatter drops it from the displayed and copied text.
const STATE_SEP = '\u0000';
const drillState = (node: PivotHeaderNode): string => (node.expandable ? `${STATE_SEP}${node.expanded ? 'e' : 'c'}` : '');
const displayLabel = (value: unknown): string => String(value ?? '').split(STATE_SEP)[0] ?? '';

/** Every Data Grid column of a result: the row header column(s), pinned at the start, then the value columns. */
export function buildColumns<Row>(result: PivotResult, options: ColumnOptions<Row>): DataGridColumn<PivotRowStub>[] {
  const { text } = options;
  const columns: DataGridColumn<PivotRowStub>[] = [];
  const base = { pinned: 'start' as const, sortable: false, filterable: false, groupable: false, editable: false, hideable: false, reorderable: false, lockPosition: true };
  if (options.layout === 'compact' || options.rowFieldCaptions.length === 0) {
    columns.push({
      ...base,
      id: ROW_HEADER_ID,
      header: options.rowFieldCaptions.length ? options.rowFieldCaptions.join(' / ') : text('rowLabels'),
      width: options.rowHeaderWidth ?? 220,
      valueGetter: (stub) => {
        const node = stub.v.result.memberAt('rows', stub.i);
        return rowLabel(stub.v, node, text) + drillState(node);
      },
      valueFormatter: displayLabel,
      renderCell: (ctx) => <CompactRowHeader stub={ctx.row} options={options} />,
      cellClassName: (ctx) => KIND_CLASS[ctx.row.v.result.memberAt('rows', ctx.row.i).kind],
    });
  } else {
    const count = options.rowFieldCaptions.length;
    options.rowFieldCaptions.forEach((caption, level) => {
      columns.push({
        ...base,
        id: `${ROW_FIELD_PREFIX}${level}`,
        header: caption,
        width: options.rowHeaderWidth ?? 150,
        valueGetter: (stub) => {
          const node = stub.v.result.memberAt('rows', stub.i);
          if (node.kind === 'grandTotal') return level === 0 ? text('grandTotal') : '';
          const own = node.path.length - 1;
          return level < own ? memberLabel(stub.v, node.path, level) + (startsBlock(stub.v, stub.i, level) ? '' : `${STATE_SEP}r`) : level === own ? rowLabel(stub.v, node, text) + drillState(node) : '';
        },
        valueFormatter: displayLabel,
        renderCell: (ctx) => <TabularRowHeader stub={ctx.row} level={level} options={options} />,
        cellClassName: (ctx) => KIND_CLASS[ctx.row.v.result.memberAt('rows', ctx.row.i).kind],
        // The grand total row header spans every row field column.
        ...(level === 0 && count > 1 ? { colSpan: (ctx: { row: PivotRowStub }) => (ctx.row.v.result.memberAt('rows', ctx.row.i).kind === 'grandTotal' ? count : 1) } : {}),
      });
    });
  }
  columns.push(...treeColumns(result.columnTree, options));
  return columns;
}

/** Sets the root role after hydration: `treegrid` for the compact layout, `grid` otherwise. */
export function useGridRole(element: () => HTMLElement | null | undefined, layout: PivotTableLayout, ready: boolean): void {
  useLayoutEffect(() => {
    const el = element();
    if (!el) return;
    el.setAttribute('role', layout === 'compact' ? 'treegrid' : 'grid');
  });
  void ready;
}
