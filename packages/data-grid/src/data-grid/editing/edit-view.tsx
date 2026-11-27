'use client';

// Editing markup of the default DataGrid bundle: the command column
// buttons, which render on the server, the edit marks of cells and
// rows, and the slots where the lazy editing chunk renders the
// added rows and the dialogs once it is loaded. Server render and hydration render the slots empty.

import { useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import type { CompiledColumn, EditState, RowId } from '@salmonui/data-grid/engine';
import { EDIT_DIRTY, EDIT_EDITING, EDIT_INVALID, EDIT_PENDING } from '@salmonui/data-grid/engine/edit-state';
import { columnWidthStyle } from '../Cell.js';
import { centerZone } from '../fixed-zone.js';
import { useDataGridInstance, useDataGridRender, useDataGridText } from '../context.js';
import type { DataGridInstance } from '../instance.js';
import { EDIT_FILL_CORNER, EDIT_ROW_ACTIVE, EDIT_SHIFT } from './edit-host.js';
import type { DataGridCommandItem } from './edit-types.js';

/** Row marks from the row UI snapshot (edit flags above `EDIT_SHIFT`). */
export function editRowAttrs(bits: number): Record<string, string> | null {
  const flags = bits >>> EDIT_SHIFT;
  if (flags === 0) return null;
  const out: Record<string, string> = {};
  if (flags & 8) out['data-new'] = '';
  if (flags & 16) out['data-deleted'] = '';
  if (flags & 2) out['data-dirty'] = '';
  if (flags & 4) out['data-invalid'] = '';
  if (flags & 64) out['data-editing'] = '';
  return out;
}

export interface DataGridCommandCellProps<Row> {
  readonly rowId: RowId;
  readonly items: readonly DataGridCommandItem<Row>[];
  /** The row has the active editor. */
  readonly rowActive: boolean;
  readonly deleted: boolean;
}

/** Command column buttons: Edit and Delete while idle, Save and Cancel while the row edits. */
export function DataGridCommandCell<Row>({ rowId, items, rowActive, deleted }: DataGridCommandCellProps<Row>) {
  const instance = useDataGridInstance<Row>();
  const edit = instance.editing;
  const text = useDataGridText();
  const labels: Record<string, string> = { edit: text('edit'), delete: text('delete'), save: text('save'), cancel: text('cancel') };
  const buttons: ReactNode[] = [];
  items.forEach((item, i) => {
    const editing = item.type === 'save' || item.type === 'cancel';
    if (item.type !== 'custom' && editing !== rowActive) return;
    const label = item.label ?? labels[item.type] ?? '';
    buttons.push(
      <button
        key={i}
        type="button"
        tabIndex={-1}
        className="salmon-data-grid-button salmon-data-grid-command__button"
        data-command={item.type}
        title={item.title}
        aria-label={label ? undefined : item.title}
        disabled={deleted && (item.type === 'edit' || item.type === 'delete')}
        onClick={(e) => {
          e.stopPropagation();
          edit.runCommandItem(item, rowId, (e.nativeEvent as PointerEvent).pointerType === 'touch' ? 'touch' : 'pointer');
        }}
      >
        {item.icon}
        {label}
      </button>,
    );
  });
  return (
    <div className="salmon-data-grid-command" onKeyDown={(e) => commandKeys(e, instance.rtl)}>
      {buttons}
    </div>
  );
}

/**
 * Keys inside a command cell (entered with Enter on the cell): ArrowLeft /
 * ArrowRight (mirrored in RTL), Home and End move between the buttons,
 * Escape returns focus to the cell, Enter and Space press the button. None
 * reach the grid keymap while a button has focus.
 */
function commandKeys(event: ReactKeyboardEvent<HTMLDivElement>, rtl: boolean): void {
  const target = event.target as HTMLElement;
  if (!target.classList.contains('salmon-data-grid-command__button')) return;
  const cell = target.closest<HTMLElement>('.salmon-data-grid-cell');
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.salmon-data-grid-command__button:not(:disabled)')];
  const at = buttons.indexOf(target as HTMLButtonElement);
  const forward = rtl ? 'ArrowLeft' : 'ArrowRight';
  const back = rtl ? 'ArrowRight' : 'ArrowLeft';
  let next: HTMLElement | null | undefined = null;
  switch (event.key) {
    case forward:
      next = buttons[Math.min(buttons.length - 1, at + 1)];
      break;
    case back:
      next = buttons[Math.max(0, at - 1)];
      break;
    case 'Home':
      next = buttons[0];
      break;
    case 'End':
      next = buttons[buttons.length - 1];
      break;
    case 'Escape':
      next = cell;
      break;
    case 'Enter':
    case ' ':
      // The button's own click; the grid must not also move or toggle.
      event.stopPropagation();
      return;
    default:
      return;
  }
  event.preventDefault();
  event.stopPropagation();
  next?.focus({ preventScroll: true });
}

/** Edit marks of a body cell and the content that replaces the display value. */
export interface EditCellView {
  readonly content: ReactNode | null;
  readonly attrs: Record<string, string | boolean | undefined>;
  /** Hidden error text of an invalid cell without an open editor (target of `aria-describedby`). */
  readonly message: ReactNode | null;
}

const NO_VIEW: EditCellView = Object.freeze({ content: null, attrs: Object.freeze({}), message: null });

/** `bits`: the cell UI snapshot (edit flags above `EDIT_SHIFT`). */
export function editCellView<Row>(instance: DataGridInstance<Row>, rowId: RowId, column: CompiledColumn<Row>, bits: number): EditCellView {
  const edit = instance.editing;
  const flags = bits >>> EDIT_SHIFT;
  const commands = edit.commandsOf(column);
  if (flags === 0 && !commands) return NO_VIEW;
  const attrs: Record<string, string | boolean | undefined> = {};
  let content: ReactNode | null = null;
  let message: ReactNode | null = null;
  if (commands) {
    content = <DataGridCommandCell<Row> rowId={rowId} items={commands} rowActive={(flags & EDIT_ROW_ACTIVE) !== 0} deleted={(flags & 16) !== 0} />;
  } else if ((flags & EDIT_EDITING) !== 0 && edit.mode() !== 'dialog') {
    attrs['data-editing'] = '';
    // Editors exist once the chunk is loaded (only the loaded module sets EDIT_EDITING).
    const Editor = edit.getChunk()?.DataGridCellEditor;
    content = Editor ? <Editor<Row> rowId={rowId} column={column} placement="cell" /> : null;
  }
  if (flags & EDIT_DIRTY) attrs['data-dirty'] = '';
  if (flags & EDIT_PENDING) attrs['data-pending'] = '';
  if (flags & EDIT_INVALID) {
    attrs['data-invalid'] = '';
    attrs['aria-invalid'] = true;
    if (content === null || commands) {
      const id = edit.errorId(rowId, column.columnId);
      attrs['aria-describedby'] = id;
      message = (
        <span id={id} className="salmon-data-grid-visually-hidden">
          {edit.errors(rowId, column.columnId).join(' ')}
        </span>
      );
    }
  }
  // Fill handle: a square at the range's bottom-right corner; fill-handle.ts owns the drag.
  if ((flags & EDIT_FILL_CORNER) !== 0 && (flags & EDIT_EDITING) === 0) {
    attrs['data-fill-corner'] = '';
    const handle = <span className="salmon-data-grid-fill-handle" aria-hidden="true" />;
    message = message ? (
      <>
        {message}
        {handle}
      </>
    ) : (
      handle
    );
  }
  return { content, attrs, message };
}

/** Row attributes of the always-visible add row, shared by the at-rest and the loaded row. */
export function newRowAttrs(rowId: RowId, label: string, rowIndex: number): Record<string, string | number> {
  return { role: 'row', 'aria-rowindex': rowIndex, 'aria-label': label, 'data-row-id': rowId, 'data-new': '', 'data-new-row': '' };
}

/**
 * The always-visible add row before the editing chunk loads: the
 * same row with empty cells, from the at-rest edit state (`newRowId` of
 * `./edit-state`). Server render and hydration render this; the chunk's row
 * with editors replaces it on the client.
 */
function DataGridNewRowAtRest({ position }: { position: 'top' | 'bottom' }) {
  const instance = useDataGridInstance<unknown>();
  const render = useDataGridRender<unknown>();
  const { engine, layout } = instance;
  const read = (): string | null => {
    const s = engine.getModuleState<EditState>('edit');
    return s?.newRowId != null && s.options.newRowPosition === position ? s.newRowId : null;
  };
  const rowId = useSyncExternalStore((onChange) => engine.subscribeModule('edit', onChange), read, read);
  const view = useSyncExternalStore(layout.subscribe, layout.getColumnView, layout.getServerColumnView);
  if (rowId === null) return null;
  // Same zones and `aria-colindex` as `renderRowCells` (Row.tsx), without cell content.
  const cells = (list: readonly CompiledColumn<unknown>[], base: number) =>
    list.map((column, i) => <div key={column.columnId} role="gridcell" aria-colindex={base + i} className="salmon-data-grid-cell" style={columnWidthStyle(column)} data-column-id={column.columnId} />);
  const left = cells(view.left, 1);
  const center = cells(view.center, view.left.length + view.centerStart + 1);
  const right = cells(view.right, view.left.length + view.centerCount + 1);
  return (
    <div role="rowgroup" className={`salmon-data-grid-added-rows salmon-data-grid-added-rows--${position}`}>
      <div {...newRowAttrs(rowId, render.text('newRowLabel'), render.headerRows + 1)} className="salmon-data-grid-row salmon-data-grid-added-row salmon-data-grid-new-row">
        {view.indent > 0 ? <div className="salmon-data-grid-indent" aria-hidden="true" /> : null}
        {left.length ? <div className="salmon-data-grid-pin salmon-data-grid-pin--left" data-frozen-edge="start">{left}</div> : null}
        {centerZone(view, center, view.center, (column, colIndex) => cells([column], colIndex))}
        {right.length ? <div className="salmon-data-grid-pin salmon-data-grid-pin--right" data-frozen-edge="end">{right}</div> : null}
      </div>
    </div>
  );
}

/**
 * Added rows (`top` / `bottom`) or the dialogs (`overlays`) of the loaded
 * editing chunk; before it loads, the at-rest add row.
 */
export function DataGridEditSlot({ part }: { part: 'top' | 'bottom' | 'overlays' }) {
  const edit = useDataGridInstance<unknown>().editing;
  const chunk = useSyncExternalStore(edit.subscribeChunk, edit.getChunk, edit.getServerChunk);
  if (!chunk) return part === 'overlays' ? null : <DataGridNewRowAtRest position={part} />;
  return part === 'overlays' ? <chunk.DataGridEditOverlays /> : <chunk.DataGridAddedRows position={part} />;
}
