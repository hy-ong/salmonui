// Menu item actions of the column menu and the context menu: the item click event (cancellable), then the built-in behavior.
// Only a rendered menu chooses an item, so this module is part of the lazy
// overlays chunk (overlays.tsx), not of the static `DataGridChrome`.

import type { ColumnId, CompiledColumn, RowId } from '@salmonui/data-grid/engine';
import type { DataGridColumnMenuItemClickEvent, DataGridContextMenuItemClickEvent, DataGridContextMenuTarget, DataGridMenuItem } from './chrome-types.js';
import { ITEM_COMMANDS, type DataGridChrome } from './chrome.js';
import { columnInfo } from './column-info.js';
import { gridEvent, lazyField, type DataGridEventSource } from '@salmonui/core/internal/events';

type Source = DataGridEventSource;

/** Rows a context-menu target acts on: the target row, or the selection when the target row is selected. */
function targetRowIds<Row>(chrome: DataGridChrome<Row>, target: DataGridContextMenuTarget): readonly RowId[] {
  if (!('rowId' in target) || target.kind === 'groupCaption') return [];
  const selected = chrome.selectedRowIds();
  return selected.includes(target.rowId) ? selected : [target.rowId];
}

/** Raises the item click event; false when the handler prevented the built-in action. */
function itemClick<Row>(chrome: DataGridChrome<Row>, item: DataGridMenuItem, column: CompiledColumn<Row> | null, target: DataGridContextMenuTarget | null, source: Source): boolean {
  const p = chrome.instance.props;
  if (target) {
    const handler = p.onContextMenuItemClick;
    if (!handler) return true;
    const engine = chrome.instance.engine;
    const fields = lazyField({ item, target } as { item: DataGridMenuItem; target: DataGridContextMenuTarget }, 'rowIds', () => targetRowIds(chrome, target));
    const event = gridEvent<DataGridContextMenuItemClickEvent<Row>>('contextMenuItemClick', source, Object.assign(fields, {
      rows(this: { rowIds: readonly RowId[] }): readonly Row[] {
        const rows: Row[] = [];
        for (const id of this.rowIds) {
          const row = engine.getRow(id);
          if (row !== undefined) rows.push(row as Row);
        }
        return rows;
      },
    }));
    handler(event);
    return !event.defaultPrevented;
  }
  const handler = p.onColumnMenuItemClick;
  if (!handler || !column) return true;
  const event = gridEvent<DataGridColumnMenuItemClickEvent<Row>>('columnMenuItemClick', source, { item, field: column.columnId, column: columnInfo(column) });
  handler(event);
  return !event.defaultPrevented;
}

/** A menu item was chosen: the click event (cancellable), then the built-in behavior. Returns false when prevented. */
export function menuAction<Row>(chrome: DataGridChrome<Row>, item: DataGridMenuItem, columnId: ColumnId | null, target: DataGridContextMenuTarget | null, source: Source = 'pointer'): boolean {
  const instance = chrome.instance;
  const column = chrome.column(columnId) ?? null;
  if (!itemClick(chrome, item, column, target, source)) {
    chrome.close(true, source);
    return false;
  }
  const anchorEl = columnId !== null ? chrome.headerElement(columnId) : null;
  const id = item.id;
  const cid = column?.columnId;
  // Overlays that replace the menu keep the original focus invoker.
  if ((id === 'filter' && cid) || id === 'columnChooser') {
    if (!chrome.allowClose(source)) return true;
    const previous = chrome.overlay;
    chrome.overlay = null;
    chrome.replacing = true;
    const opened = id === 'filter' && cid ? chrome.openFilterMenu(cid, source, anchorEl) : chrome.openColumnChooser(previous?.anchor ?? null, null, source);
    if (!opened) {
      // The menu closes (its before-close event already allowed it); focus returns to the invoker.
      chrome.replacing = false;
      chrome.emit();
      const { el, columnId: focusColumn } = chrome.returnFocus;
      chrome.returnFocus = { el: null, columnId: null };
      if (el && el.isConnected && el instanceof HTMLElement) el.focus({ preventScroll: true });
      else if (focusColumn !== null) instance.api.focusHeader(focusColumn);
    }
    return true;
  }
  chrome.close(true, source);
  switch (id) {
    case 'autoSize':
      if (cid) instance.autoSizeColumns([cid], source);
      return true;
    case 'autoSizeAll':
      instance.autoSizeColumns(undefined, source);
      return true;
    case 'group':
      if (cid) instance.dispatchFrom(source, { type: 'grouping.groupBy', columnId: cid });
      return true;
    case 'ungroup':
      if (cid) instance.dispatchFrom(source, { type: 'grouping.ungroup', columnId: cid });
      return true;
    case 'sortAscending':
    case 'sortDescending':
      if (cid) instance.dispatchFrom(source, { type: 'sort.column', columnId: cid, direction: id === 'sortAscending' ? 'asc' : 'desc', multi: false });
      return true;
    case 'clearSort':
      if (cid) instance.dispatchFrom(source, { type: 'sort.remove', columnId: cid });
      return true;
    case 'pinStart':
    case 'pinEnd':
    case 'unpin':
      if (cid) chrome.pin(cid, id === 'pinStart' ? 'start' : id === 'pinEnd' ? 'end' : null, source);
      return true;
    case 'firstPage':
    case 'previousPage':
    case 'nextPage':
    case 'lastPage':
      instance.dispatchFrom(source, { type: id === 'firstPage' ? 'paging.first' : id === 'previousPage' ? 'paging.previous' : id === 'nextPage' ? 'paging.next' : 'paging.last' });
      return true;
    default: {
      const command = ITEM_COMMANDS[id];
      if (command) chrome.runCommand(command, chrome.commandPayload(command, target), source);
      return true;
    }
  }
}
