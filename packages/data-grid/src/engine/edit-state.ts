// The at-rest part of editing, published on `./edit-state`: the cell
// flag bits, the command types of the `edit` and `clipboard` modules, the
// option resolution, and the initial states. Small and pure, so a renderer
// that loads `./edit` and `./clipboard` lazily can register stand-ins and
// render the at-rest markup without them. `./edit` and `./clipboard` re-export everything here.

import type { ClipboardCommand, ClipboardState } from './clipboard.js';
import type { EditChange, EditCommand, EditMode, EditOptions, EditState, ResolvedEditOptions } from './edit.js';
import type { CellRef, DataGridOptions, RowId } from './types.js';

/** Cell flag bits (`edit.cellFlags`). */
export const EDIT_EDITING = 1;
export const EDIT_DIRTY = 2;
export const EDIT_INVALID = 4;
export const EDIT_NEW = 8;
export const EDIT_DELETED = 16;
export const EDIT_PENDING = 32;
/** The cell's row is in row / dialog edit. */
export const EDIT_ROW_EDITING = 64;
export const EDIT_EDITABLE = 128;
/** The always-visible add row while another row edits: its editors are shown disabled. */
export const EDIT_LOCKED = 256;

/** Ids of the always-visible add row (`showNewRow`): this prefix plus a sequence starting at 1. */
export const BLANK_ROW_ID_PREFIX = '__new:blank-';

/** `showNewRow` takes effect: enabled, adding allowed, row mode. */
export function showsNewRow(o: ResolvedEditOptions): boolean {
  return o.showNewRow && o.enabled && o.add && o.mode === 'row';
}

export const EMPTY_IDS: readonly RowId[] = Object.freeze([]);
export const EMPTY_CELLS: readonly CellRef[] = Object.freeze([]);
export const NO_CHANGE: EditChange = Object.freeze({ rows: EMPTY_IDS, cells: EMPTY_CELLS, all: false });

/** `newRowPosition` as a render edge plus the tree position. */
function rowPositions(p: string | undefined, prev: ResolvedEditOptions | undefined): Pick<ResolvedEditOptions, 'newRowPosition' | 'treeRowPosition'> {
  if (p === 'above' || p === 'below' || p === 'child') return { newRowPosition: p === 'above' ? 'top' : 'bottom', treeRowPosition: p };
  if (p === 'top' || p === 'bottom') return { newRowPosition: p };
  return prev ? { newRowPosition: prev.newRowPosition, ...(prev.treeRowPosition ? { treeRowPosition: prev.treeRowPosition } : {}) } : { newRowPosition: 'top' };
}

export function resolveOptions<Row>(o: EditOptions<Row> | undefined, prev?: ResolvedEditOptions): ResolvedEditOptions {
  const raw = o?.mode as string | undefined;
  const mode: EditMode = raw === 'row' || raw === 'dialog' || raw === 'batch' || raw === 'cell' ? raw : (prev?.mode ?? 'row');
  return Object.freeze({
    enabled: o?.enabled ?? prev?.enabled ?? true,
    edit: o?.edit ?? prev?.edit ?? true,
    add: o?.add ?? prev?.add ?? true,
    delete: o?.delete ?? prev?.delete ?? true,
    mode,
    ...rowPositions(o?.newRowPosition, prev),
    showNewRow: o?.showNewRow ?? prev?.showNewRow ?? false,
    tabToNextRow: o?.tabToNextRow ?? (prev && raw === undefined ? prev.tabToNextRow : mode === 'batch' || mode === 'cell'),
    undo: o?.undo ?? prev?.undo ?? false,
    undoLimit: typeof o?.undoLimit === 'number' && o.undoLimit >= 0 ? Math.floor(o.undoLimit) : (prev?.undoLimit ?? 10),
    keyedRows: o?.keyedRows ?? prev?.keyedRows ?? false,
  });
}

/** Command types of the `edit` module (a renderer that registers the module lazily declares them up front). */
export const EDIT_COMMANDS: readonly EditCommand['type'][] = Object.freeze([
  'edit.start',
  'edit.setValue',
  'edit.setValues',
  'edit.commit',
  'edit.cancel',
  'edit.commitAndMove',
  'edit.addRecord',
  'edit.deleteRecords',
  'edit.updateRow',
  'edit.updateCell',
  'edit.saveBatch',
  'edit.cancelBatch',
  'edit.restoreRecords',
  'edit.setOptions',
  'edit.validateBatch',
  'edit.undo',
  'edit.redo',
  'edit.settle',
]);

/**
 * The state `createEditModule().initialState(options)` returns: no drafts, no
 * active editor, version 0. Pure; a renderer that loads the module lazily
 * renders this at-rest state until the module is loaded.
 */
export function createInitialEditState<Row>(options: DataGridOptions<Row>): EditState {
  const resolved = resolveOptions((options['edit'] ?? {}) as EditOptions<Row>);
  return Object.freeze({
    options: resolved,
    version: 0,
    newRowId: showsNewRow(resolved) ? `${BLANK_ROW_ID_PREFIX}1` : null,
    active: null,
    status: 'idle',
    dirtyCellCount: 0,
    addedRowIds: EMPTY_IDS,
    deletedRowIds: EMPTY_IDS,
    pendingWrites: 0,
    lastError: null,
    lastBulk: null,
    canUndo: false,
    canRedo: false,
    change: NO_CHANGE,
  });
}

/** Command types of the `clipboard` module (a renderer that registers the module lazily declares them up front). */
export const CLIPBOARD_COMMANDS: readonly ClipboardCommand['type'][] = Object.freeze(['clipboard.paste', 'clipboard.fill']);

/** The state `createClipboardModule().initialState()` returns. */
export const INITIAL_CLIPBOARD_STATE: ClipboardState = Object.freeze({ version: 0, lastPaste: null });
