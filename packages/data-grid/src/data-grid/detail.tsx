'use client';

// Detail rows and child grids: the expand/collapse
// toggle column, the detail row (one `role="gridcell"` spanning every
// column), async load states, and the child
// `DataGrid` of a hierarchy row. Detail rows are rows of the engine's visible
// model (`__detail:<rowId>`), so they virtualize with the parent rows; the
// renderer measures their height into sparse row metrics (layout.ts).

import {
  createContext,
  memo,
  use,
  useCallback,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from 'react';
import type { FocusTarget, DataSource, RowId, RowSnapshot } from '@salmonui/data-grid/engine';
import { detailParentId, type DetailLoadSnapshot } from '@salmonui/data-grid/engine/expansion';
import { childRowsOf, createChildDataSource, readField } from '@salmonui/data-grid/engine/hierarchy';
import { useEngineSelector, useDataGridInstance, useDataGridRender } from './context.js';
import { childRowIdOf, DETAIL_COLUMN_ID, detailUiOf, type DataGridDetailUi } from './detail-config.js';
import { customIcon, useDataGridIcons } from './icons.js';
import type { DataGridChildGrid, DataGridDetailContext, DataGridDetailStatus } from './detail-types.js';
import { DataGrid } from './DataGrid.js';
import type { DataGridInstance } from './instance.js';
import type { ColumnView } from './layout.js';
import type { DataGridApi, DataGridCellContext, DataGridColumn, DataGridProps } from './types.js';

function joinClass(...parts: (string | undefined | false | null)[]): string {
  let out = '';
  for (const p of parts) if (p) out = out ? `${out} ${p}` : p;
  return out;
}

/** Nesting depth of the enclosing grid (0 for a root grid). */
const DataGridDepthContext = createContext(0);

// ---------------------------------------------------------------------------
// Toggle column
// ---------------------------------------------------------------------------

/** The detail controller of a grid rendered with the `detail` feature (every part below renders only then). */
function uiOf<Row>(instance: DataGridInstance<Row>): DataGridDetailUi<Row> {
  return detailUiOf(instance) as DataGridDetailUi<Row>;
}

/**
 * Expansion of a data row: the toggle's `aria-expanded`, the row's
 * `data-expanded` (null for rows without a detail). The `detailExpanded`
 * selector of the `detail` feature, read by the always-called row hook
 * (Row.tsx) and by the toggle.
 */
export function detailExpanded(instance: DataGridInstance<unknown>, rowId: RowId): boolean | null {
  return detailUiOf(instance)?.ariaExpanded(rowId) ?? null;
}

function useDetailExpanded(instance: DataGridInstance<unknown>, rowId: RowId): boolean | null {
  const read = (): boolean | null => detailExpanded(instance, rowId);
  return useSyncExternalStore((onChange) => instance.engine.subscribeRow(rowId, onChange), read, () => instance.serverRead(`de\u0000${rowId}`, read));
}

function DataGridDetailToggleImpl({ rowId }: { rowId: RowId }) {
  const instance = useDataGridInstance<unknown>();
  const expanded = useDetailExpanded(instance, rowId);
  const icons = useDataGridIcons();
  if (expanded === null) return null;
  const text = instance.interaction.text;
  return (
    <button
      type="button"
      className="salmon-data-grid-detail-toggle"
      aria-expanded={expanded}
      aria-label={expanded ? text('collapseDetail') : text('expandDetail')}
      tabIndex={-1}
      data-expanded={expanded ? '' : undefined}
      data-custom-icon={customIcon(icons, expanded ? 'expanded' : 'collapsed')}
      onClick={(event) => {
        // The toggle does not select the row.
        event.stopPropagation();
        uiOf(instance).toggle(rowId, 'pointer');
      }}
    >
      {icons?.[expanded ? 'expanded' : 'collapsed']}
    </button>
  );
}

/** Expand/collapse button of the detail column; re-renders only when its row's expansion changes. */
export const DataGridDetailToggle = memo(DataGridDetailToggleImpl);

const renderToggleCell = (ctx: DataGridCellContext<unknown>): ReactNode => <DataGridDetailToggle rowId={ctx.rowId} />;

/** Utility column definition of the detail toggle (not sortable, filterable, exported, or movable). */
export function detailToggleColumn(header: string, pinned: boolean): DataGridColumn<unknown> {
  return {
    id: DETAIL_COLUMN_ID,
    header,
    width: 40,
    minWidth: 40,
    align: 'center',
    // No field: a declared type skips value-type inference.
    type: 'string',
    sortable: false,
    filterable: false,
    searchable: false,
    groupable: false,
    editable: false,
    resizable: false,
    reorderable: false,
    lockPosition: true,
    hideable: false,
    // A utility column has no column menu (no ⋮ header button).
    menu: false,
    meta: { utility: true },
    ...(pinned ? { pinned: 'start' as const } : {}),
    renderHeader: () => <span className="salmon-data-grid-visually-hidden">{header}</span>,
    renderCell: renderToggleCell,
  };
}

// ---------------------------------------------------------------------------
// Detail row
// ---------------------------------------------------------------------------

interface DetailRowProps {
  rowId: RowId;
  rowIndex: number;
  view: ColumnView<unknown>;
}

/** Keeps pointer, focus, and key events of the detail content away from the parent grid's delegated handlers. */
const stop = (event: SyntheticEvent): void => event.stopPropagation();

function statusOf(load: DetailLoadSnapshot, hasLoader: boolean): DataGridDetailStatus {
  return hasLoader ? load.status : 'ready';
}

function DataGridDetailRowImpl({ rowId, rowIndex, view }: DetailRowProps) {
  const instance = useDataGridInstance<unknown>();
  const render = useDataGridRender<unknown>();
  const engine = instance.engine;
  const ui = uiOf(instance);
  const parentId = detailParentId(rowId) as RowId;
  const readParent = (): RowSnapshot<unknown> | undefined => engine.getRowSnapshot(parentId);
  const parent = useSyncExternalStore((onChange) => engine.subscribeRow(parentId, onChange), readParent, () => instance.serverRead(`r\u0000${parentId}`, readParent));
  const readLoad = (): DetailLoadSnapshot => ui.getLoad(parentId);
  const load = useSyncExternalStore((onChange) => engine.subscribeRow(rowId, onChange), readLoad, () => instance.serverRead(`dl\u0000${parentId}`, readLoad));
  // Re-render when `renderDetail` or `childGrid` changes identity (the row itself is memoized).
  useSyncExternalStore(ui.subscribeRender, ui.getRenderVersion, ui.getRenderVersion);
  const columnCount = useEngineSelector(instance, (s) => s.columns.visible.length);
  const firstColumn = useEngineSelector(instance, (s) => s.columns.visible[0]?.columnId ?? '');
  // Roving focus: the detail cell is the tab stop when the focus target is on this row (any column).
  const interaction = instance.interaction;
  const focusColumnOf = (t: FocusTarget | null): string | null => (t !== null && t.kind === 'cell' && t.rowId === rowId ? t.columnId : null);
  const focusColumn = useSyncExternalStore(
    (onChange) => engine.subscribeModule('focus', onChange),
    () => focusColumnOf(interaction.focusTarget()),
    () => focusColumnOf(interaction.serverFocusTarget),
  );

  // Rows shown expanded from the start (expand all, SSR) load their content once mounted.
  const status = load.status;
  useEffect(() => {
    if (ui.hasLoader && status === 'idle') engine.dispatch({ type: 'detail.load', rowId: parentId });
  }, [ui, engine, parentId, status]);

  // Focus inside the content: the detail cell becomes the parent grid's tab stop, DOM focus stays put.
  const onContentFocus = useCallback(
    (event: ReactFocusEvent<HTMLElement>) => {
      event.stopPropagation();
      const t = interaction.focusTarget();
      if (t?.kind === 'cell' && t.rowId === rowId) return;
      engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId, columnId: t?.columnId ?? firstColumn } });
    },
    [interaction, engine, rowId, firstColumn],
  );
  // Escape inside the content (not consumed there) returns focus to the detail row.
  const onContentKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      event.stopPropagation();
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const cell = (event.currentTarget as HTMLElement).closest<HTMLElement>('.salmon-data-grid-detail-row__cell');
      if (cell) {
        event.preventDefault();
        cell.focus();
      }
    },
    [],
  );

  const props = instance.props;
  const row = parent?.row;
  let content: ReactNode = null;
  if (row !== undefined) {
    if (props.childGrid) {
      content = <DataGridChildGridHost parentRowId={parentId} row={row} childGrid={props.childGrid as DataGridChildGrid} />;
    } else if (props.renderDetail) {
      const ctx: DataGridDetailContext<unknown> = {
        row,
        rowId: parentId,
        collapse: () => ui.toggle(parentId, 'api', false),
        status: statusOf(load, ui.hasLoader),
        data: load.data,
        error: load.error,
        retry: () => instance.dispatchFrom('api', { type: 'detail.retry', rowId: parentId }),
      };
      content = props.renderDetail(ctx);
    }
  }
  const tabStop = focusColumn !== null;
  return (
    <div
      role="row"
      aria-rowindex={render.headerRows + rowIndex + 1}
      className={joinClass('salmon-data-grid-row', 'salmon-data-grid-detail-row', render.classNames?.detailRow)}
      style={render.styles?.detailRow}
      data-row-id={rowId}
      data-row-index={rowIndex}
      data-status={ui.hasLoader && status !== 'ready' ? status : undefined}
      ref={instance.measureRow}
    >
      {view.indent > 0 ? <div className="salmon-data-grid-indent" aria-hidden="true" /> : null}
      <div
        role="gridcell"
        aria-colindex={1}
        aria-colspan={Math.max(1, columnCount)}
        className="salmon-data-grid-cell salmon-data-grid-detail-row__cell"
        data-column-id={focusColumn ?? firstColumn}
        tabIndex={tabStop ? 0 : -1}
        ref={tabStop ? interaction.targetRef : undefined}
      >
        <div
          className="salmon-data-grid-detail"
          onKeyDown={onContentKeyDown}
          onFocus={onContentFocus}
          onClick={stop}
          onMouseDown={stop}
          onPointerDown={stop}
          onPointerOver={stop}
          onContextMenu={stop}
          onDoubleClick={stop}
        >
          {content}
          {ui.hasLoader && status === 'loading' && props.childGrid ? (
            <div className="salmon-data-grid-detail__status" role="status">
              {instance.interaction.text('detailLoading')}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Detail row keyed by its `__detail:<rowId>` id. Re-renders when its parent
 * row object, its async load state, or the detail render props change.
 */
export const DataGridDetailRow = memo(DataGridDetailRowImpl);

// ---------------------------------------------------------------------------
// Child grid (hierarchy)
// ---------------------------------------------------------------------------

interface ChildHostProps {
  parentRowId: RowId;
  row: unknown;
  childGrid: DataGridChildGrid;
}

function DataGridChildGridHostImpl({ parentRowId, row, childGrid }: ChildHostProps) {
  const instance = useDataGridInstance<unknown>();
  const depth = use(DataGridDepthContext) + 1;
  const { data, joinField, parentField, childField, ...rest } = childGrid;
  const pf = parentField ?? joinField ?? '';
  const cf = childField ?? joinField ?? '';
  const value = readField(row, pf);
  const raw = typeof data === 'function' ? data({ rowId: parentRowId, row, depth }) : data;
  const getRowId = useMemo(() => childRowIdOf(childGrid), [childGrid]);
  // Arrays are indexed once by join value (O(1) per parent); sources are scoped by the relation filter.
  const childData = useMemo(
    () => (Array.isArray(raw) ? childRowsOf(raw as readonly unknown[], cf, value) : createChildDataSource(raw as DataSource<unknown>, { childField: cf, value, getRowId: getRowId as never })),
    [raw, cf, value, getRowId],
  );
  const ui = uiOf(instance);
  const ref = useCallback(
    (api: DataGridApi<unknown> | null) => {
      ui.registerChild(parentRowId, api);
      return () => ui.registerChild(parentRowId, null);
    },
    [ui, parentRowId],
  );
  const parent = instance.props;
  const childProps: DataGridProps<unknown> = {
    height: 'auto',
    ...(rest as Partial<DataGridProps<unknown>>),
    id: `${instance.gridId}/${parentRowId}`,
    data: childData as readonly unknown[] | DataSource<unknown>,
    getRowId,
    ref,
  };
  if (rest['aria-label'] === undefined && rest['aria-labelledby'] === undefined) childProps['aria-label'] = instance.interaction.text('childGridLabel');
  // Locale and direction are inherited; the theme is inherited through CSS.
  if (childProps.locale === undefined && parent.locale !== undefined) childProps.locale = parent.locale;
  if (childProps.timeZone === undefined && parent.timeZone !== undefined) childProps.timeZone = parent.timeZone;
  if (childProps.currency === undefined && parent.currency !== undefined) childProps.currency = parent.currency;
  if (childProps.dir === undefined && (parent.dir !== undefined || instance.rtl)) childProps.dir = parent.dir ?? 'rtl';
  return (
    <DataGridDepthContext value={depth}>
      <div className="salmon-data-grid-child" data-depth={depth}>
        <DataGrid {...childProps} />
      </div>
    </DataGridDepthContext>
  );
}

/** A child `DataGrid` scoped to one parent row; nested `childGrid` props recurse. */
export const DataGridChildGridHost = memo(DataGridChildGridHostImpl);
