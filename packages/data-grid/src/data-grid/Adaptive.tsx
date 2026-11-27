'use client';

// Adaptive UI parts of the `adaptive` render feature
// (features/feature-adaptive.tsx; the mode hook is static, adaptive-view.ts): vertical card rows,
// the adaptive action bar (sort, filter, touch multi-select), and the slot
// of the adaptive sort and filter-column sheets (the sheets
// are `AdaptiveSheets.tsx` in the lazy adaptive chunk). Cards are a
// projection of the same row window as horizontal rows: Body renders them
// for the same virtualized index range, keyed by row id. The parts import
// the static graph directly.

import type { CompiledColumn, RowId, RowSnapshot } from '@salmonui/data-grid/engine';
import { memo, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react';
import type { DataGridAdaptiveController } from './adaptive-controller.js';
import { DataGridCell } from './Cell.js';
import { useDataGridInstance, useDataGridRender, useDataGridText, useEngineSelector, useRenderRecord } from './context.js';
import { UI_ROW_SELECTED } from './interaction.js';
import type { AdaptiveView } from './adaptive-view.js';
import type { DataGridRowElementProps } from './types.js';

// ---------------------------------------------------------------------------
// Vertical card rows
// ---------------------------------------------------------------------------

export interface DataGridCardRowProps<Row> {
  rowId: RowId;
  rowIndex: number;
  /** Visible leaf columns in display order (left, center, right). */
  columns: readonly CompiledColumn<Row>[];
  /** Render version of render-only column fields (see `DataGridRowRenderer`). */
  columnRender?: number;
}

function DataGridCardRowImpl<Row>({ rowId, rowIndex, columns }: DataGridCardRowProps<Row>) {
  const instance = useDataGridInstance<Row>();
  const render = useDataGridRender<Row>();
  const engine = instance.engine;
  const interaction = instance.interaction;
  const read = (): RowSnapshot<Row> | undefined => engine.getRowSnapshot(rowId);
  const readServer = (): RowSnapshot<Row> | undefined => instance.serverRead(`r\u0000${rowId}`, read);
  const snapshot = useSyncExternalStore((onChange) => engine.subscribeRow(rowId, onChange), read, readServer);
  const readUi = (): number => interaction.rowUi(rowId);
  const readUiServer = (): number => instance.serverRead(`ru\u0000${rowId}`, readUi);
  const ui = useSyncExternalStore((onChange) => engine.subscribeRow(rowId, onChange), readUi, readUiServer);
  // Tree mode: the same row ARIA and attributes as a horizontal row.
  const treeRow = instance.features.selectors.treeRow;
  const readTree = () => (treeRow ? treeRow(instance as never, rowId) : null);
  const tree = useSyncExternalStore((onChange) => engine.subscribe(onChange), readTree, () => instance.serverRead(`t\u0000${rowId}`, readTree));
  useRenderRecord(instance, 'row', rowId);
  const selected = (ui & UI_ROW_SELECTED) !== 0;
  const row = (snapshot?.row ?? null) as Row;
  const extra = render.getRowProps?.(row, rowIndex, tree ? tree.ctx : {});
  const { className: extraClass, style: extraStyle, ...extraRest } = extra ?? {};
  const partStyle = render.styles?.row;
  const style: CSSProperties | undefined = partStyle || extraStyle ? { ...partStyle, ...extraStyle } : undefined;
  const rowProps: DataGridRowElementProps = {
    ...extraRest,
    role: 'row',
    'aria-rowindex': render.headerRows + rowIndex + 1,
    className: ['salmon-data-grid-row salmon-data-grid-card', render.classNames?.row, render.rowClassName?.(row, rowIndex), extraClass].filter(Boolean).join(' '),
    'data-row-id': rowId,
    'data-row-index': rowIndex,
  };
  if (interaction.rowSelectionMode()) rowProps['aria-selected'] = selected;
  if (tree) Object.assign(rowProps, tree.attrs);
  if (selected) rowProps['data-selected'] = '';
  if (style) rowProps.style = style;
  if (rowIndex % 2 === 1) rowProps['data-alt'] = '';
  if (instance.layout.config.measureRows) rowProps.ref = instance.measureRow;
  const fields: ReactNode[] = [];
  for (let i = 0; i < columns.length; i++) {
    const column = columns[i] as CompiledColumn<Row>;
    // role="none" wrappers are transparent: the row still owns its gridcells (same tree as desktop).
    fields.push(
      <div key={column.columnId} className="salmon-data-grid-card__field" role="none">
        <span className="salmon-data-grid-card__label" aria-hidden="true">
          {interaction.isSelectionColumn(column) ? '' : column.headerText}
        </span>
        <DataGridCell<Row> rowId={rowId} column={column} rowIndex={rowIndex} colIndex={i + 1} renderKey={instance.renderKeyOf(column.columnId)} />
      </div>,
    );
  }
  return <div {...rowProps}>{fields}</div>;
}

/** Vertical (card) row: one label/value field per visible column; keyed by row id like a horizontal row. */
export const DataGridCardRow = memo(DataGridCardRowImpl) as <Row>(props: DataGridCardRowProps<Row>) => ReactNode;

// ---------------------------------------------------------------------------
// Adaptive bar
// ---------------------------------------------------------------------------

function DataGridAdaptiveBarImpl({ view }: { view: AdaptiveView }) {
  const instance = useDataGridInstance<unknown>();
  // The `adaptive` feature that renders these parts sets the controller at creation.
  const adaptive = instance.adaptive as DataGridAdaptiveController<unknown>;
  const chrome = instance.chrome;
  const text = useDataGridText();
  const touchSelected = useSyncExternalStore(adaptive.subscribe, adaptive.getTouchSelected, adaptive.getServerTouchSelected);
  const sortCount = useEngineSelector(instance, (s) => s.query.sorting.length);
  const filterCount = useEngineSelector(instance, (s) => s.query.filters.length);
  // Selection module channel (selection changes do not replace the grid snapshot).
  const subscribeSelection = (onChange: () => void) => instance.engine.subscribeModule('selection', onChange);
  const multiOn = useSyncExternalStore(subscribeSelection, () => adaptive.multiSelectOn(), () => instance.serverRead('adaptive\u0000multi', () => adaptive.multiSelectOn()));
  const readCount = (): number => {
    const rows = instance.interaction.selectionState()?.rows;
    return rows?.scope === 'explicit' ? rows.ids.size : -1;
  };
  const selectedCount = useSyncExternalStore(subscribeSelection, readCount, () => instance.serverRead('adaptive\u0000count', readCount));
  const showSort = view.vertical && instance.sortable;
  const showFilter = view.vertical && chrome.filteringUi();
  const showMulti = adaptive.multiSelectAvailable() && (touchSelected || multiOn);
  if (!showSort && !showFilter && !showMulti) return null;
  return (
    <div
      role="toolbar"
      aria-label={text('adaptiveBarLabel')}
      className="salmon-data-grid-adaptive-bar"
      // F6 / Shift+F6 move to the next grid region.
      onKeyDown={(event) => {
        if (instance.interaction.regionKey(event.nativeEvent)) event.preventDefault();
      }}
    >
      {showSort ? (
        <button type="button" className="salmon-data-grid-toolbar__item salmon-data-grid-adaptive-bar__sort" onClick={(e) => adaptive.openSortDialog('pointer', e.currentTarget)}>
          {text('sortDialogTitle')}
          {sortCount > 0 ? <span className="salmon-data-grid-adaptive-bar__badge">{sortCount}</span> : null}
        </button>
      ) : null}
      {showFilter ? (
        <button type="button" className="salmon-data-grid-toolbar__item salmon-data-grid-adaptive-bar__filter" onClick={(e) => adaptive.openFilterDialog(undefined, 'pointer', e.currentTarget)}>
          {text('filterDialogTitle')}
          {filterCount > 0 ? <span className="salmon-data-grid-adaptive-bar__badge">{filterCount}</span> : null}
        </button>
      ) : null}
      {showMulti ? (
        <button
          type="button"
          className="salmon-data-grid-toolbar__item salmon-data-grid-adaptive-bar__multi"
          aria-pressed={multiOn}
          onClick={() => adaptive.setMultiSelect(!multiOn, 'touch')}
        >
          {text('multiSelect')}
          {multiOn && selectedCount >= 0 ? <span className="salmon-data-grid-adaptive-bar__badge">{text('selectedCount', { count: selectedCount })}</span> : null}
        </button>
      ) : null}
    </div>
  );
}

/** Adaptive action bar: sort and filter sheets (vertical rows) and the touch multi-select toggle. */
export const DataGridAdaptiveBar = memo(DataGridAdaptiveBarImpl);

// ---------------------------------------------------------------------------
// Adaptive sheets: sort and the filter column list
// ---------------------------------------------------------------------------

/** Renders the open adaptive dialog (nothing on the server or while closed); the sheets are in the lazy adaptive chunk. */
export function DataGridAdaptiveOverlays() {
  const instance = useDataGridInstance<unknown>();
  // The `adaptive` feature that renders these parts sets the controller at creation.
  const adaptive = instance.adaptive as DataGridAdaptiveController<unknown>;
  const dialog = useSyncExternalStore(adaptive.subscribe, adaptive.getDialog, adaptive.getServerDialog);
  const chunk = useSyncExternalStore(adaptive.subscribe, adaptive.getChunk, adaptive.getServerChunk);
  if (!dialog || !chunk) return null;
  return dialog.kind === 'sort' ? <chunk.SortSheet instance={instance} dialog={dialog} /> : <chunk.FilterColumnsSheet instance={instance} dialog={dialog} />;
}
