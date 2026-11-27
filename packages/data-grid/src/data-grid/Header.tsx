'use client';

import { memo, useLayoutEffect, useMemo, useRef, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import { getColumnFilters, type ColumnId, type CompiledColumn, type DataGridSnapshot, type HeaderSnapshot } from '@salmonui/data-grid/engine';
import { warnOnce } from '@salmonui/core/internal/dev';
import { alignOf, clipOf, columnWidthStyle, joinClass } from './Cell.js';
import { centerZone } from './fixed-zone.js';
import { columnInfo } from './column-info.js';
import { useEngineSelector, useDataGridInstance, useDataGridRender, useRenderRecord } from './context.js';
import { lookupStatusOf } from './lookup-status.js';
import { DataGridFilterBar } from './FilterBar.js';
import { customIcon, useDataGridIcons } from './icons.js';
import { UI_SELECTED, UI_TABSTOP } from './interaction.js';
import { widthVar, type ColumnView } from './layout.js';
import type { DataGridColumn, DataGridHeaderContext } from './types.js';


/** `'asc:0:1'`-style key (direction, priority, multi-sort flag) so the selector returns a primitive. */
function sortKey<Row>(snapshot: DataGridSnapshot<Row>, columnId: string): string {
  const sorting = snapshot.query.sorting;
  for (let i = 0; i < sorting.length; i++) {
    const s = sorting[i];
    if (s && s.columnId === columnId) return `${s.direction}:${i}:${sorting.length > 1 ? 1 : 0}`;
  }
  return '';
}

/** Width of several leaves (`leafIndex` list `"3,4,5"`): the sum of their width variables, so resize previews update it for free. */
function spanWidthStyle(leafIndexes: string): CSSProperties {
  return { width: `calc(${leafIndexes.split(',').map((i) => `var(${widthVar(Number(i))})`).join(' + ')})` };
}

interface HeaderCellProps<Row> {
  column: CompiledColumn<Row>;
  colIndex: number;
  /** Header rows the leaf spans (stacked headers above a shallow leaf). */
  rowSpan: number;
  /** Render key of the column's render-only fields (`renderHeader`, `headerProps`); see `DataGridCellProps.renderKey`. */
  renderKey?: number | undefined;
}

function DataGridHeaderCellImpl<Row>({ column, colIndex, rowSpan }: HeaderCellProps<Row>) {
  const instance = useDataGridInstance<Row>();
  const render = useDataGridRender<Row>();
  const icons = useDataGridIcons();
  const engine = instance.engine;
  const columnId = column.columnId;
  const read = (): HeaderSnapshot | undefined => engine.getHeaderSnapshot(columnId);
  // Server snapshots return what the server rendered, never the live state (hydration).
  const readServer = (): HeaderSnapshot | undefined => instance.serverRead(`h\u0000${columnId}`, read);
  const header = useSyncExternalStore((onChange) => engine.subscribeHeader(columnId, onChange), read, readServer);
  // Sort/filter/group state is read from the query, so query modules (sort,
  // filter, group) light up indicators and aria-sort without renderer changes.
  const sort = useEngineSelector(instance, (s) => sortKey(s, columnId));
  const isFiltered = useEngineSelector(instance, (s) => getColumnFilters(s.query.filters, columnId).length > 0);
  const isGrouped = useEngineSelector(instance, (s) => s.query.grouping.some((g) => g.columnId === columnId));
  // Remote lookup columns show their load status; null for every other column.
  const lookupStatus = useEngineSelector(instance, (s) => lookupStatusOf(s as never, columnId));
  const interaction = instance.interaction;
  const chrome = instance.chrome;
  const readUi = (): number => interaction.headerUi(columnId);
  const readUiServer = (): number => instance.serverRead(`hu\u0000${columnId}`, () => interaction.headerUi(columnId, true));
  const ui = useSyncExternalStore((onChange) => engine.subscribeHeader(columnId, onChange), readUi, readUiServer);
  const selectionColumn = interaction.isSelectionColumn(column);
  useRenderRecord(instance, 'header', columnId);
  const tabStop = (ui & UI_TABSTOP) !== 0;
  const def = column.def as DataGridColumn<Row>;
  const [direction, index, multi] = sort ? (sort.split(':') as ['asc' | 'desc', string, string]) : [null, '-1', '0'];
  const sortIndex = Number(index);
  const sortable = instance.sortable && column.flags.allowSorting;
  const resizable = render.resizable && column.flags.allowResizing;
  const reorderable = render.reorderable && column.flags.allowReordering && !column.flags.lockColumn;
  const headerText = header?.headerText ?? column.headerText;
  const content: ReactNode = selectionColumn ? (
    <SelectAllCheckbox label={render.text('selectAllRows')} fallback={headerText} />
  ) : def.renderHeader ? (
    def.renderHeader({ column: columnInfo(column), sortDirection: direction, sortIndex, filtered: isFiltered, grouped: isGrouped } satisfies DataGridHeaderContext<Row>)
  ) : (
    <span className="salmon-data-grid-header-cell__text">{headerText}</span>
  );
  const menuButton = chrome.columnMenuEnabled(column as never, render);
  const filterButton = chrome.filterButtonEnabled(column as never, render);
  // Header group toggle (grouping.showHeaderToggle): groups or ungroups by the column.
  const groupButton = render.headerGroupToggle && !selectionColumn && column.flags.allowGrouping && instance.groupable;
  const extra = def.headerProps;
  const { className: extraClass, style: extraStyle, ...extraRest } = extra ?? {};
  const partStyle = render.styles?.headerCell;
  const base = columnWidthStyle(column as CompiledColumn<unknown>);
  let style = partStyle || extraStyle ? { ...partStyle, ...extraStyle, ...base } : base;
  if (rowSpan > 1) style = { ...style, height: `calc(var(--salmon-data-grid-header-height) * ${rowSpan})` };
  // The accessible name comes from the label content (and the lookup status) only: without
  // aria-labelledby, name-from-content would append the filter, group, menu and resize
  // controls' labels ("Text 1 Resize Text 1"), repeated on every column move.
  const nameId = headerNameId(instance.gridId, columnId);
  return (
    <div
      {...extraRest}
      role="columnheader"
      aria-colindex={colIndex}
      aria-rowspan={rowSpan > 1 ? rowSpan : undefined}
      aria-sort={sortable ? (direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none') : undefined}
      aria-labelledby={lookupStatus ? `${nameId} ${nameId}-status` : nameId}
      className={joinClass('salmon-data-grid-header-cell', render.classNames?.headerCell, extraClass)}
      style={style}
      aria-selected={(ui & UI_SELECTED) !== 0 ? true : undefined}
      tabIndex={tabStop ? 0 : -1}
      ref={tabStop ? interaction.targetRef : undefined}
      data-column-id={columnId}
      data-selection-column={selectionColumn ? '' : undefined}
      data-align={alignOf(def.headerAlign ?? def.align)}
      data-clip={clipOf(column as CompiledColumn<unknown>, render.overflow)}
      data-sortable={sortable ? '' : undefined}
      data-sorted={direction ?? undefined}
      data-filtered={isFiltered ? '' : undefined}
      data-reorderable={reorderable ? '' : undefined}
      data-rowspan={rowSpan > 1 ? rowSpan : undefined}
      data-frozen={header?.freeze ?? undefined}
      data-lookup-status={lookupStatus ?? undefined}
      aria-busy={lookupStatus === 'loading' ? true : undefined}
    >
      <div className="salmon-data-grid-header-cell__content" id={nameId}>
        {content}
      </div>
      {lookupStatus ? (
        <span
          id={`${nameId}-status`}
          className="salmon-data-grid-lookup-status"
          data-status={lookupStatus}
          role="img"
          aria-label={render.text(lookupStatus === 'loading' ? 'lookupLoading' : 'lookupError', { column: headerText })}
          title={render.text(lookupStatus === 'loading' ? 'lookupLoading' : 'lookupError', { column: headerText })}
        />
      ) : null}
      {direction || (sortable && render.sortIndicators) ? (
        <span
          className="salmon-data-grid-sort-indicator"
          data-direction={direction ?? 'none'}
          data-pair={render.sortIndicators && sortable ? '' : undefined}
          aria-hidden="true"
          data-custom-icon={direction ? customIcon(icons, direction === 'asc' ? 'sortAscending' : 'sortDescending') : undefined}
        >
          {direction ? icons?.[direction === 'asc' ? 'sortAscending' : 'sortDescending'] : null}
          {multi === '1' ? <span className="salmon-data-grid-sort-indicator__order">{sortIndex + 1}</span> : null}
        </span>
      ) : null}
      {isFiltered && !filterButton ? (
        <span className="salmon-data-grid-filter-indicator" aria-hidden="true" data-custom-icon={customIcon(icons, 'filtered')}>
          {icons?.filtered}
        </span>
      ) : null}
      {filterButton ? (
        <button
          type="button"
          tabIndex={-1}
          className="salmon-data-grid-header-button salmon-data-grid-filter-button"
          data-kind="filter"
          data-active={isFiltered ? '' : undefined}
          aria-haspopup="dialog"
          aria-label={render.text('filterButton', { column: headerText })}
          data-custom-icon={customIcon(icons, 'filter')}
        >
          {icons?.filter}
        </button>
      ) : null}
      {groupButton ? (
        <button
          type="button"
          tabIndex={-1}
          className="salmon-data-grid-header-button salmon-data-grid-group-toggle-button"
          data-kind="group"
          data-active={isGrouped ? '' : undefined}
          aria-pressed={isGrouped}
          aria-label={render.text(isGrouped ? 'ungroupByColumn' : 'groupByColumn', { column: headerText })}
          data-custom-icon={customIcon(icons, 'groupByColumn')}
        >
          {icons?.groupByColumn}
        </button>
      ) : null}
      {menuButton ? (
        <button
          type="button"
          tabIndex={-1}
          className="salmon-data-grid-header-button salmon-data-grid-column-menu-button"
          data-kind="menu"
          aria-haspopup="menu"
          aria-label={render.text('columnMenuButton', { column: headerText })}
          data-custom-icon={customIcon(icons, 'columnMenu')}
        >
          {icons?.columnMenu}
        </button>
      ) : null}
      {resizable ? (
        <span className="salmon-data-grid-resize-handle" role="button" tabIndex={-1} aria-roledescription={render.text('columnResizer')} aria-label={render.text('resizeColumn', { column: headerText })} />
      ) : null}
    </div>
  );
}

/** DOM id of a leaf header's label content; whitespace is replaced so the id is one aria-labelledby token. */
function headerNameId(gridId: string, columnId: string): string {
  return `${gridId}-header-${columnId.replace(/\s/g, '_')}`;
}

const DataGridHeaderCell = memo(DataGridHeaderCellImpl) as <Row>(props: HeaderCellProps<Row>) => ReactNode;

/** Stacked header group cell: spans its rendered leaves; not a focus stop. */
function DataGridHeaderGroupCell({ group, leaves, colIndex }: { group: CompiledColumn<unknown>; leaves: readonly CompiledColumn<unknown>[]; colIndex: number }) {
  const render = useDataGridRender<unknown>();
  const def = group.def as DataGridColumn<unknown>;
  const { className: extraClass, style: extraStyle, ...extraRest } = def.headerProps ?? {};
  const leafKey = leaves.map((c) => c.leafIndex).join(',');
  const spanned = useMemo(() => spanWidthStyle(leafKey), [leafKey]);
  const base = leaves.length === 1 ? columnWidthStyle(leaves[0] as CompiledColumn<unknown>) : spanned;
  const style = extraStyle ? { ...extraStyle, ...base } : base;
  const content = def.renderHeader ? (
    def.renderHeader({ column: columnInfo(group), sortDirection: null, sortIndex: -1, filtered: false, grouped: false })
  ) : (
    <span className="salmon-data-grid-header-cell__text">{group.headerText}</span>
  );
  return (
    <div
      {...extraRest}
      role="columnheader"
      aria-colindex={colIndex}
      aria-colspan={leaves.length > 1 ? leaves.length : undefined}
      className={joinClass('salmon-data-grid-header-cell', 'salmon-data-grid-header-group', render.classNames?.headerCell, extraClass)}
      style={style}
      data-group-id={group.columnId}
      data-align={alignOf(def.headerAlign ?? def.align) ?? 'center'}
    >
      <div className="salmon-data-grid-header-cell__content">{content}</div>
    </div>
  );
}

/** Header select-all: checked, mixed, or unchecked from the selection summary. */
function SelectAllCheckbox({ label, fallback }: { label: string; fallback: string }) {
  const instance = useDataGridInstance<unknown>();
  const interaction = instance.interaction;
  const readServer = (): number => instance.serverRead('selectAll', interaction.selectAllUi);
  const state = useSyncExternalStore(interaction.subscribeSelectAll, interaction.selectAllUi, readServer);
  if (interaction.selectionState()?.options.type !== 'multiple') return <span className="salmon-data-grid-visually-hidden">{fallback}</span>;
  return (
    <span
      className="salmon-data-grid-checkbox salmon-data-grid-select-checkbox"
      role="checkbox"
      aria-checked={state === 2 ? true : state === 1 ? 'mixed' : false}
      aria-label={label}
      data-checked={state === 2 ? '' : undefined}
      data-indeterminate={state === 1 ? '' : undefined}
    />
  );
}

/**
 * Cells of header row `level` for one zone's rendered leaves: the leaf cell
 * at its own depth (spanning the rows below it), a group cell per run of
 * leaves sharing the ancestor at `level`, and spacers under shallow leaves.
 */
function zoneCells(
  leaves: readonly CompiledColumn<unknown>[],
  base: number,
  level: number,
  depth: number,
  byId: ReadonlyMap<ColumnId, CompiledColumn<unknown>>,
  renderKey: (columnId: ColumnId) => number | undefined,
  owners?: (CompiledColumn<unknown> | null)[],
): ReactNode[] {
  const out: ReactNode[] = [];
  let i = 0;
  while (i < leaves.length) {
    const leaf = leaves[i] as CompiledColumn<unknown>;
    if (leaf.depth === level) {
      out.push(<DataGridHeaderCell key={leaf.columnId} column={leaf} colIndex={base + i} rowSpan={depth - level} renderKey={renderKey(leaf.columnId)} />);
      owners?.push(leaf);
      i++;
    } else if (leaf.depth < level) {
      out.push(<div key={`s:${leaf.columnId}`} className="salmon-data-grid-header-spacer" style={columnWidthStyle(leaf)} aria-hidden="true" />);
      owners?.push(leaf);
      i++;
    } else {
      const groupId = leaf.path[level] as ColumnId;
      let j = i + 1;
      while (j < leaves.length && (leaves[j] as CompiledColumn<unknown>).depth > level && (leaves[j] as CompiledColumn<unknown>).path[level] === groupId) j++;
      const group = byId.get(groupId) as CompiledColumn<unknown>;
      // Keyed by the run's first leaf, not its window position, so horizontal scrolling does not remount group cells.
      out.push(<DataGridHeaderGroupCell key={`g:${groupId}:${leaf.columnId}`} group={group} leaves={leaves.slice(i, j)} colIndex={base + i} />);
      owners?.push(j === i + 1 ? leaf : null);
      i = j;
    }
  }
  return out;
}

/** Center header cells with fixed columns: a fixed leaf's cells are sticky; one left of the slice renders alone. */
function fixedHeaderCenter(
  view: ColumnView<unknown>,
  centerBase: number,
  level: number,
  depth: number,
  byId: ReadonlyMap<ColumnId, CompiledColumn<unknown>>,
  renderKey: (columnId: ColumnId) => number | undefined,
): ReactNode {
  const owners: (CompiledColumn<unknown> | null)[] = [];
  const nodes = zoneCells(view.center, centerBase, level, depth, byId, renderKey, owners);
  return centerZone(view, nodes, owners, (column, colIndex) => zoneCells([column], colIndex, level, depth, byId, renderKey));
}

function headerRow(
  view: ColumnView<unknown>,
  level: number,
  depth: number,
  byId: ReadonlyMap<ColumnId, CompiledColumn<unknown>>,
  renderKey: (columnId: ColumnId) => number | undefined,
): ReactNode {
  const leftCount = view.left.length;
  const centerBase = leftCount + view.centerStart + 1;
  const rightBase = leftCount + view.centerCount + 1;
  return (
    <>
      {view.indent > 0 ? <div className="salmon-data-grid-indent" aria-hidden="true" /> : null}
      {leftCount > 0 ? (
        <div className="salmon-data-grid-pin salmon-data-grid-pin--left" data-frozen-edge="start">
          {zoneCells(view.left, 1, level, depth, byId, renderKey)}
        </div>
      ) : null}
      {view.fixed ? fixedHeaderCenter(view, centerBase, level, depth, byId, renderKey) : <div className="salmon-data-grid-center">{zoneCells(view.center, centerBase, level, depth, byId, renderKey)}</div>}
      {view.right.length > 0 ? (
        <div className="salmon-data-grid-pin salmon-data-grid-pin--right" data-frozen-edge="end">
          {zoneCells(view.right, rightBase, level, depth, byId, renderKey)}
        </div>
      ) : null}
    </>
  );
}

function DataGridHeaderImpl() {
  const instance = useDataGridInstance<unknown>();
  const render = useDataGridRender<unknown>();
  const layout = instance.layout;
  const view = useSyncExternalStore(layout.subscribe, layout.getColumnView, layout.getServerColumnView);
  const depth = useEngineSelector(instance, (s) => Math.max(1, s.columns.headerRowCount));
  const byId = useEngineSelector(instance, (s) => s.columns.byId);
  // Render-only column field changes re-render the header and the changed columns' header and filter cells.
  const columnRender = useSyncExternalStore(instance.subscribeColumnRender, instance.getColumnRenderVersion, instance.getColumnRenderVersion);
  useLayoutEffect(() => {
    instance.restoreHeaderFocus();
  });
  useSplitGroupWarning(instance.gridId, view, depth);
  const handlers = {
    onPointerDownCapture: instance.onHeaderPointerDownCapture,
    onPointerDown: instance.onHeaderPointerDown,
    onClickCapture: instance.onHeaderClickCapture,
    onClick: instance.onHeaderClick,
    onDoubleClick: instance.onHeaderDoubleClick,
  };
  const rows: ReactNode[] = [];
  for (let level = 0; level < depth; level++) {
    rows.push(
      <div key={level} role="row" aria-rowindex={level + 1} className="salmon-data-grid-header-row" data-level={depth > 1 ? level : undefined} {...handlers}>
        {headerRow(view, level, depth, byId, instance.renderKeyOf)}
      </div>,
    );
  }
  // `data-salmon-surface`: a theme's `surfaces.tableHeader` repaints this subtree (every header row, the frozen
  // header cells and the filter bar); popups are portaled outside it.
  return (
    <div role="rowgroup" className={joinClass('salmon-data-grid-header', render.classNames?.header)} style={render.styles?.header} data-stacked={depth > 1 ? '' : undefined} data-salmon-surface="table-header">
      {rows}
      {render.filterBar ? <DataGridFilterBar view={view} rowIndex={depth + 1} columnRender={columnRender} /> : null}
    </div>
  );
}

/** a group whose leaves sit in two freeze zones renders split at the edge (dev warning). */
function useSplitGroupWarning(gridId: string, view: ColumnView<unknown>, depth: number): void {
  useLayoutEffect(() => {
    if (depth < 2) return;
    const zoneOf = new Map<ColumnId, string>();
    const zones: [string, readonly CompiledColumn<unknown>[]][] = [
      ['left', view.left],
      ['center', view.center],
      ['right', view.right],
    ];
    for (const [zone, leaves] of zones) {
      for (const leaf of leaves) {
        for (let d = 0; d < leaf.path.length - 1; d++) {
          const id = leaf.path[d] as ColumnId;
          const seen = zoneOf.get(id);
          if (seen !== undefined && seen !== zone) {
            warnOnce(`${gridId}:split-group:${id}`, `DataGrid "${gridId}": stacked header "${id}" spans two freeze zones and is split at the frozen edge. Freeze whole groups.`);
          }
          zoneOf.set(id, zone);
        }
      }
    }
  }, [gridId, view, depth]);
}


/** Sticky header rowgroup. `memo`: the root re-renders on width changes; the header follows the column view only. */
export const DataGridHeader = memo(DataGridHeaderImpl);
