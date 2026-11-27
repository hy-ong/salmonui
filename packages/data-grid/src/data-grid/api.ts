import { createDataGridApi, createSelectionApi, type CellKey, type ColumnId, type RowId, type SelectionState } from '@salmonui/data-grid/engine';
import { columnInfo } from './column-info.js';
import { revealPastFixed } from './fixed-zone.js';
import { isAdaptiveActive } from './adaptive-view.js';
import { rowPinningApi } from './row-pinning-api.js';
import { createViewApi } from './view-api.js';
import type { DataGridDetailApi } from './detail-types.js';
import type { DataGridTreeApi } from './tree-types.js';
import type { DataGridInstance } from './instance.js';
import type { DataGridApi, DataGridCellKey, DataGridPart, DataGridRowInfo, DataGridScrollOptions } from './types.js';

function isElement(value: unknown): value is Element {
  return typeof value === 'object' && value !== null && (value as Node).nodeType === 1;
}

function alignOffset(start: number, size: number, current: number, extent: number, align: DataGridScrollOptions['align']): number | null {
  switch (align ?? 'nearest') {
    case 'start':
      return start;
    case 'end':
      return start + size - extent;
    case 'center':
      return start - (extent - size) / 2;
    default:
      if (start < current) return start;
      if (start + size > current + extent) return start + size - extent;
      return null;
  }
}

/** Selector of each part inside the grid root (`root`, `toolbar`, `pager` and the overlays are resolved separately). */
const PART_SELECTORS: Readonly<Record<string, string>> = {
  header: '.salmon-data-grid-header',
  headerCell: '.salmon-data-grid-header-cell',
  body: '.salmon-data-grid-rows',
  row: '.salmon-data-grid-row',
  cell: '.salmon-data-grid-cell',
  footer: '.salmon-data-grid-footer',
  groupCaption: '.salmon-data-grid-group-caption',
  detailRow: '.salmon-data-grid-detail-row',
  editor: '.salmon-data-grid-editor',
  empty: '.salmon-data-grid-empty__cell',
  loading: '.salmon-data-grid-loading',
};

const OVERLAY_PARTS: Readonly<Record<string, { kind: string; selector: string }>> = {
  columnMenu: { kind: 'columnMenu', selector: '.salmon-data-grid-column-menu' },
  contextMenu: { kind: 'contextMenu', selector: '.salmon-data-grid-context-menu' },
  filterMenu: { kind: 'filterMenu', selector: '.salmon-data-grid-filter-menu' },
};

/** `api.getPartElement`: the first rendered element of a part, or null. */
function partElement<Row>(instance: DataGridInstance<Row>, part: DataGridPart): HTMLElement | null {
  const root = instance.root;
  if (!root) return null;
  if (part === 'root') return root;
  if (part === 'pager') {
    // The pager is the next sibling of the grid root.
    const next = root.nextElementSibling;
    return next instanceof HTMLElement && next.classList.contains('salmon-data-grid-pager') ? next : null;
  }
  // The group drop area is a sibling before the grid root.
  if (part === 'groupDropArea') return instance.groupPanel;
  if (part === 'toolbar') {
    // The toolbar is the previous sibling of the grid root (a `renderToolbar` template may wrap it);
    // the adaptive bar and the group drop area sit between them.
    let prev = root.previousElementSibling;
    while (prev instanceof HTMLElement && (prev === instance.groupPanel || prev.classList.contains('salmon-data-grid-adaptive-bar'))) prev = prev.previousElementSibling;
    if (!(prev instanceof HTMLElement)) return null;
    return prev.classList.contains('salmon-data-grid-toolbar') ? prev : prev.querySelector<HTMLElement>('.salmon-data-grid-toolbar');
  }
  const overlayPart = OVERLAY_PARTS[part];
  if (overlayPart) {
    // Overlays are portaled; only this grid's open overlay counts.
    const overlay = instance.chrome.getOverlay();
    if (overlay?.kind !== overlayPart.kind) return null;
    const found = overlay.container.querySelectorAll<HTMLElement>(overlayPart.selector);
    return found.length ? (found[found.length - 1] as HTMLElement) : null;
  }
  const selector = PART_SELECTORS[part];
  return selector ? root.querySelector<HTMLElement>(selector) : null;
}

const DETAIL_OFF = Object.freeze({ status: 'rejected', reason: 'detail rows are off (set renderDetail or childGrid)' } as const);
const detailOff = () => DETAIL_OFF;

/** Detail API of a grid without the `detail` render feature. */
const INERT_DETAIL_API: Omit<DataGridDetailApi, 'moveRows'> = Object.freeze({
  expandDetail: detailOff,
  collapseDetail: detailOff,
  toggleDetail: detailOff,
  expandAllDetails: detailOff,
  collapseAllDetails: detailOff,
  isDetailExpanded: () => false,
  getChildGrid: () => null,
});

const TREE_OFF = Object.freeze({ status: 'rejected', reason: 'tree is off' } as const);
const INERT_TREE_API: Record<string, () => unknown> = { getTreeRow: () => null, getChildRows: () => [] };
for (const name of 'expandAllTreeRows collapseAllTreeRows expandTreeLevel collapseTreeLevel expandTreeRows collapseTreeRows toggleTreeRow indentRows outdentRows reloadTreeChildren'.split(' ')) INERT_TREE_API[name] = () => TREE_OFF;

/**
 * Builds the React `DataGridApi`: the core API plus DOM-aware methods, then
 * the API sections of the render feature controllers (`sections`), which
 * replace the inert methods of the same names.
 */
export function createReactDataGridApi<Row>(instance: DataGridInstance<Row>, sections: readonly (object | undefined)[] = []): DataGridApi<Row> {
  const { engine, layout } = instance;
  const core = createDataGridApi(engine);
  const selection = createSelectionApi(engine);
  const interaction = instance.interaction;

  /** Column id of a field or column id (id first, then the first leaf with that field). */
  const idOf = (field: string): ColumnId => core.getColumn(field)?.columnId ?? field;
  const cellKey = (c: DataGridCellKey): CellKey => ({ rowId: c.rowId, columnId: idOf(c.field) });

  const rowElement = (rowId: RowId): HTMLElement | null =>
    instance.getRowsElement()?.querySelector<HTMLElement>(`[role="row"][data-row-id="${CSS.escape(rowId)}"]`) ?? null;

  const getRowInfo = (target: RowId | Element | EventTarget | null): DataGridRowInfo<Row> | undefined => {
    let rowId: RowId | undefined;
    let columnId: ColumnId | null = null;
    let element: HTMLElement | null = null;
    let cellElement: HTMLElement | null = null;
    if (typeof target === 'string') {
      rowId = target;
      element = rowElement(target);
    } else if (isElement(target)) {
      const root = instance.root;
      const rowEl = target.closest<HTMLElement>('[data-row-id]');
      if (!rowEl || (root && !root.contains(rowEl))) return undefined;
      element = rowEl;
      rowId = rowEl.dataset['rowId'];
      const cellEl = target.closest<HTMLElement>('[data-column-id]');
      if (cellEl && rowEl.contains(cellEl)) {
        cellElement = cellEl;
        columnId = cellEl.dataset['columnId'] ?? null;
      }
    }
    if (rowId === undefined) return undefined;
    const snap = engine.getRowSnapshot(rowId);
    if (!snap) return undefined;
    const compiled = columnId === null ? undefined : engine.getSnapshot().columns.byId.get(columnId);
    const column = compiled ? columnInfo(compiled) : null;
    return Object.freeze({ rowId: snap.id, row: snap.row, rowIndex: snap.index, field: columnId, column, element, cellElement });
  };

  const scrollToRow = (rowId: RowId, options?: DataGridScrollOptions): void => {
    const viewport = instance.getViewport();
    if (!viewport) return;
    const index = engine.getRowIndex(rowId);
    const metrics = layout.getRowMetrics();
    if (index < 0 || index >= metrics.count) return;
    const mapping = layout.getScrollMapping();
    const extent = layout.bodyExtent();
    const current = mapping.toVirtual(viewport.scrollTop);
    const top = alignOffset(metrics.offsetOf(index), metrics.heightOf(index), current, extent, options?.align);
    if (top === null) return;
    const max = Math.max(0, metrics.totalHeight - extent);
    viewport.scrollTop = mapping.toPhysical(Math.min(max, Math.max(0, top)));
  };

  const scrollToColumn = (field: string, options?: DataGridScrollOptions): void => {
    const viewport = instance.getViewport();
    if (!viewport) return;
    const columnId = idOf(field);
    const center = engine.getSnapshot().columns.center;
    const index = center.findIndex((c) => c.columnId === columnId);
    if (index < 0) return; // pinned columns are always in view
    const metrics = layout.getCenterMetrics();
    const extent = layout.centerExtent();
    const current = Math.abs(viewport.scrollLeft);
    const aligned = alignOffset(metrics.offsetOf(index), metrics.widthOf(index), current, extent, options?.align);
    if (aligned === null) return;
    const value = revealPastFixed(engine.getSnapshot().columns, metrics, index, Math.max(0, aligned), current, extent);
    viewport.scrollLeft = instance.rtl ? -value : value;
  };

  /**
   * Scrolls a column into view, then runs `open` once its header cell is
   * rendered (a column outside the rendered window mounts a frame later), so
   * an overlay anchors to the header instead of the grid corner.
   */
  const revealHeader = (field: string, open: (columnId: string) => unknown): void => {
    const column = instance.chrome.resolve(field);
    if (!column) return;
    const id = column.columnId;
    scrollToColumn(id);
    let frames = 0;
    const run = (): unknown => (!instance.root || instance.chrome.headerElement(id) || frames++ > 9 ? open(id) : requestAnimationFrame(run));
    run();
  };

  const list = (ids: string | readonly string[]): string[] => (typeof ids === 'string' ? [ids] : [...ids]);
  const selectionState = (): SelectionState | undefined => engine.getModuleState<SelectionState>('selection');

  const api: DataGridApi<Row> = {
    ...core,
    ...instance.persistence.methods(),
    get element() {
      return instance.root;
    },
    // Selection (ids and fields).
    selectRows: (rowIds, options) => selection.selectRows(rowIds, options?.mode ? { mode: options.mode } : undefined),
    selectRowRange: (fromRowId, toRowId, options) => selection.selectRowRange(fromRowId, toRowId, options),
    selectAll: (options) => (options?.scope === 'page' ? selection.selectAll() : selection.selectAllFiltered()),
    clearSelection: (parts) => selection.clearSelection(parts),
    selectCells: (cells, options) => selection.selectCells(cells.map(cellKey), options),
    selectCellRange: (anchor, focus, options) => selection.selectCellRange(cellKey(anchor), cellKey(focus), options),
    selectColumns: (fields, options) => selection.selectColumns(list(fields).map(idOf), options),
    isRowSelected: (rowId) => selection.isRowSelected(rowId),
    getSelectedRowIds: () => selection.getSelectedRowIds(),
    getSelectedRows: () => selection.getSelectedRows(),
    getSelectedCells() {
      const out: DataGridCellKey[] = [];
      for (const range of selectionState()?.cells.ranges ?? []) {
        out.push({ rowId: range.anchor.rowId, field: range.anchor.columnId });
        if (range.focus.rowId !== range.anchor.rowId || range.focus.columnId !== range.anchor.columnId) out.push({ rowId: range.focus.rowId, field: range.focus.columnId });
      }
      return Object.freeze(out);
    },
    getSelectedColumns: () => selectionState()?.columns ?? [],
    getSelection: () => selection.getSelection(),
    setSelection: (state) => selection.setSelection(state),
    getSelectionSummary: () => selection.getSelectionSummary(),
    // Focus, rows, cells, scrolling.
    focus: () => interaction.focusBody(),
    focusCell: (rowId, field) => interaction.focusTargetFrom({ kind: 'cell', rowId, columnId: idOf(field) }, 'api'),
    focusHeader: (field) => interaction.focusTargetFrom({ kind: 'header', columnId: idOf(field), level: 0 }, 'api'),
    getFocusedCell: () => interaction.getFocusedCell(),
    registerKeyHandler: (command, handler, options) => interaction.registerKeyHandler(command, handler, options?.priority ?? 0),
    getRowInfo,
    getRowElement: rowElement,
    getCellElement: (rowId, field) => rowElement(rowId)?.querySelector<HTMLElement>(`[data-column-id="${CSS.escape(idOf(field))}"]`) ?? null,
    scrollToRow,
    scrollToColumn,
    // scrollTo, getPageSizeForHeight.
    ...createViewApi(instance),
    autoSizeColumns(fields) {
      instance.autoSizeColumns(fields === undefined ? undefined : list(fields).map(idOf), 'api');
    },
    setColumnWidth: (field, width) => engine.dispatch({ type: 'columns.setWidth', columnId: idOf(field), width }),
    moveColumn: (field, toIndex) => engine.dispatch({ type: 'columns.move', columnId: idOf(field), toIndex }),
    getRenderedRange() {
      const ranges = layout.getRanges();
      return Object.freeze({ rows: ranges.rows, columns: ranges.columns });
    },
    pinColumn(field, pinned) {
      const column = instance.chrome.resolve(field);
      return column ? instance.chrome.pin(column.columnId, pinned, 'api') : { status: 'rejected', reason: `unknown column "${field}"` };
    },
    openColumnChooser(position) {
      instance.chrome.openColumnChooser(position ? { left: position.x, top: position.y, width: 0, height: 0 } : null, null, 'api');
    },
    openColumnMenu(field) {
      revealHeader(field, (id) => instance.chrome.openColumnMenu(id, 'api'));
    },
    openFilterMenu(field) {
      revealHeader(field, (id) => instance.chrome.openFilterMenu(id, 'api'));
    },
    closeOverlays: () => instance.chrome.close(true, 'api'),
    // Filter builder.
    openFilterBuilder() {
      instance.chrome.openFilterBuilder(null, 'api');
    },
    closeFilterBuilder() {
      if (instance.chrome.getOverlay()?.kind === 'filterBuilder') instance.chrome.close(true, 'api');
    },
    // Adaptive sheets.
    openSortDialog() {
      instance.adaptive?.openSortDialog('api');
    },
    openFilterDialog(field) {
      instance.adaptive?.openFilterDialog(field, 'api');
    },
    isAdaptive: () => isAdaptiveActive(instance),
    registerCommandHandler: (command, handler) => instance.chrome.registerCommandHandler(command, handler),
    runCommand: (command, payload) => instance.chrome.runCommand(command, payload ?? {}, 'api'),
    getHeaderElement(field) {
      const column = instance.chrome.resolve(field);
      return column ? instance.chrome.headerElement(column.columnId) : null;
    },
    getPartElement: (part) => partElement(instance, part),
    // Detail rows, child grids, row moves.
    // The `detail` render feature replaces these inert methods (feature-detail.tsx).
    ...INERT_DETAIL_API,
    moveRows: (rowIds, toIndex) => instance.rowDragUi.moveRows(rowIds, toIndex),
    // Tree mode: rejected without the `tree` render feature, which replaces them.
    ...(INERT_TREE_API as unknown as DataGridTreeApi<Row>),
    getVisibleRows: core.getViewRows,
    // Row pinning.
    ...rowPinningApi(instance),
    // Editing.
    ...instance.editing.api(),
    // Export and print (output.ts).
    ...instance.output.api,
    // Data state (data-ui.tsx): refresh, loading, silent updates that need no `editing`.
    refresh: () => instance.dataUi.refresh(),
    setLoading: (loading) => instance.dataUi.setLoading(loading),
    setCellValue: (rowId, field, value) => instance.dataUi.setCellValue(rowId, field, value),
    setRowData: (rowId, row) => instance.dataUi.setRowData(rowId, row),
  };
  for (const section of sections) if (section) Object.assign(api, section);
  return Object.freeze(api);
}
