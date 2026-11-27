// Edit module. All edit modes share
// one draft store keyed by `rowId` then `columnId`; the mode only decides
// which drafts commit together: `cell` commits one draft, `row` / `dialog`
// commit a row, `batch` commits everything on `edit.saveBatch`.
//
// Cost model: the slice is `inSnapshot: false`. A keystroke
// (`edit.setValue`) parses the input, runs the column's compiled built-in
// rules, updates one draft in place, and notifies one cell plus the `edit`
// module channel; it never replaces the grid snapshot. Draft, added-row and
// deleted-row stores are owned by the module and updated in place between
// versions (like the selection id set): read them through the methods.
//
// Commit builds one `WriteRequest` and calls `dataSource.write`. A local
// source applies it synchronously as one `patch` event, so sort, filter,
// group, and aggregates update through the incremental RowDelta path. Drafts
// of rows the source did not apply synchronously stay `pending` until the
// write settles; failed rows and cells keep their drafts with the server
// errors mapped in.
//
// Undo is opt-in (`undo: true`); off, no history code runs. On,
// batch mode captures the first-seen draft of each key an action touches
// (one copy per key, not per keystroke) and every write records its changed
// cells, added rows, and deleted rows as one entry; undo and redo of a write
// go through `submit` like any commit.

import { createAbortController, isPromiseLike } from './abort.js';
import { defineDataGridModule } from './engine.js';
import { BLANK_ROW_ID_PREFIX, createInitialEditState, EDIT_COMMANDS, EDIT_DELETED, EDIT_DIRTY, EDIT_EDITABLE, EDIT_EDITING, EDIT_INVALID, EDIT_LOCKED, EDIT_NEW, EDIT_PENDING, EDIT_ROW_EDITING, EMPTY_CELLS, EMPTY_IDS, NO_CHANGE, resolveOptions, showsNewRow } from './edit-state.js';
import { spanResolverOf, type CellSpanResolver } from './cell-spans.js';
import { spanAnchorOf, visibleColumnIndex } from './focus.js';
import { GROUP_FOOTER_ID_PREFIX, GROUP_ID_PREFIX } from './group-tree.js';
import { treeOf } from './tree-of.js';
import { compileValidationRules, DEFAULT_VALIDATION_MESSAGES, NO_ERRORS, type CompiledValidator, type ValidationMessages } from '@salmonui/core/validation';
import type {
  CellRef,
  ColumnId,
  CommandRejection,
  CommandResult,
  CompiledColumn,
  DataSource,
  DataGridEngine,
  DataGridModule,
  DataGridOptions,
  Json,
  JsonObject,
  ModuleContext,
  NotificationScope,
  RowId,
  WriteRequest,
  WriteResult,
} from './types.js';

export type EditMode = 'row' | 'dialog' | 'batch' | 'cell';

/** Context of `isCellEditable` (`canEditCell` policy). */
export interface EditCellContext<Row> {
  readonly row: Row;
  readonly rowId: RowId;
  readonly columnId: ColumnId;
  readonly column: CompiledColumn<Row>;
  readonly isNew: boolean;
}

export interface RowValidationContext {
  readonly rowId: RowId;
  readonly isNew: boolean;
  /** Columns with a changed value (all editable columns for a new row). */
  readonly changedColumnIds: readonly ColumnId[];
}

export type RowValidator<Row> = (
  row: Row,
  ctx: RowValidationContext,
) => string | readonly string[] | null | undefined | PromiseLike<string | readonly string[] | null | undefined>;

export interface EditOptions<Row = unknown> {
  /** Default true. */
  readonly enabled?: boolean;
  /** Existing rows can be edited. Default true. */
  readonly edit?: boolean;
  /** Rows can be added. Default true. */
  readonly add?: boolean;
  /** Rows can be deleted. Default true. */
  readonly delete?: boolean;
  /** `row` is inline row editing. Default `row`. */
  readonly mode?: EditMode;
  /**
   * Where added rows appear. Default `top`. Tree mode: `above` /
   * `below` the focused row as its sibling, or as its last `child`; the added
   * row carries its `parentId` in `WriteRequest.added`.
   */
  readonly newRowPosition?: NewRowPosition;
  /**
   * An always-visible blank add row at `newRowPosition`; row mode
   * only. Saving it writes the record and shows a
   * fresh blank row. Default false.
   */
  readonly showNewRow?: boolean;
  /** Tab from the last editable cell continues in the next row. Default true in batch and cell mode, false otherwise. */
  readonly tabToNextRow?: boolean;
  /** Extra per-cell policy (`canEditCell`); column and row rules apply first. */
  readonly isCellEditable?: (ctx: EditCellContext<Row>) => boolean;
  /** Row-level validation before a row (or batch) commits; may be async. */
  readonly validateRow?: RowValidator<Row>;
  /** Validation and save / conflict message overrides (`EditMessages`). */
  readonly messages?: Partial<EditMessageTable>;
  /** Initial values of an added row, merged over the columns' `defaultValue`. */
  readonly newRow?: () => Partial<Row>;
  /** Records an undo history. Default false: nothing is recorded. */
  readonly undo?: boolean;
  /** Maximum undo entries kept (oldest dropped first). Default 10. */
  readonly undoLimit?: number;
  /**
   * `getRowId` is the application's own key (a renderer passes true when
   * the app set `getRowId`), so rows are addressable without a `primaryKey`
   * column and `edit-no-primary-key` is not reported. Default false.
   */
  readonly keyedRows?: boolean;
}

/** Save and conflict texts of the edit module (localizable through `EditOptions.messages`). */
export interface EditMessages {
  /** A write failed without a message (also a write that never settled). */
  readonly saveFailed: string;
  /** The data source rejected the whole write without row or cell errors. */
  readonly saveRejected: string;
  /** Some rows of a write failed (`lastError`). */
  readonly partialSave: string;
  /** Row error of a write conflict. */
  readonly conflict: string;
}

/** Every message key the edit module reads (`EditOptions.messages`). */
export type EditMessageTable = ValidationMessages & EditMessages;

export const DEFAULT_EDIT_MESSAGES: EditMessages = Object.freeze({
  saveFailed: 'Save failed',
  saveRejected: 'Save rejected',
  partialSave: 'Some changes were not saved',
  conflict: 'Conflict: the row was changed on the server.',
});

export interface ResolvedEditOptions {
  readonly enabled: boolean;
  readonly edit: boolean;
  readonly add: boolean;
  readonly delete: boolean;
  readonly mode: EditMode;
  /** Render edge of added rows (a tree position maps to `top` for `above`, else `bottom`). */
  readonly newRowPosition: 'top' | 'bottom';
  /** Tree mode `newRowPosition` (`above` / `below` / `child`), when one is set. */
  readonly treeRowPosition?: 'above' | 'below' | 'child';
  readonly showNewRow: boolean;
  readonly tabToNextRow: boolean;
  readonly undo: boolean;
  readonly undoLimit: number;
  readonly keyedRows: boolean;
}

/** The row (row and dialog modes) or cell (batch and cell modes) being edited. */
export interface EditTarget {
  readonly rowId: RowId;
  /** The edited cell; in row and dialog mode the cell that has the editor focus. */
  readonly columnId: ColumnId | null;
  readonly isNew: boolean;
}

export type EditStatus = 'idle' | 'editing' | 'validating' | 'submitting' | 'error';

export interface EditChange {
  readonly rows: readonly RowId[];
  readonly cells: readonly CellRef[];
  /** Too many targets: every subscribed row is notified. */
  readonly all: boolean;
}

export interface EditState {
  readonly options: ResolvedEditOptions;
  readonly version: number;
  /**
   * The always-visible add row (`showNewRow`), or null. It is not in
   * `addedRowIds` and counts as an unsaved change only once it has a changed
   * value; a fresh id follows every save or cancel of it.
   */
  readonly newRowId: RowId | null;
  readonly active: EditTarget | null;
  readonly status: EditStatus;
  readonly dirtyCellCount: number;
  /** Added, unsaved rows in display order (identity changes only when the list changes). */
  readonly addedRowIds: readonly RowId[];
  /** Rows marked for deletion in batch mode. */
  readonly deletedRowIds: readonly RowId[];
  readonly pendingWrites: number;
  /** Message of the last failed write, cleared by the next successful one. */
  readonly lastError: string | null;
  /** Outcome of the last `edit.setValues` (paste, fill): cells requested and cells that took a value. */
  readonly lastBulk: { readonly requested: number; readonly applied: number } | null;
  /** An `edit.undo` would apply (always false with `undo: false`). */
  readonly canUndo: boolean;
  /** Tree mode: where each added row goes (`above` / `below` / `child` of an anchor row); absent when none. */
  readonly addedTreePlacements?: Readonly<Record<RowId, AddedTreePlacement>>;
  /** An `edit.redo` would apply. */
  readonly canRedo: boolean;
  readonly change: EditChange;
}

/** `edit.getSnapshot()`. */
export interface EditSnapshot {
  readonly activeRowId: RowId | null;
  readonly activeCell: CellRef | null;
  readonly addedRows: readonly RowId[];
  readonly deletedRows: readonly RowId[];
  readonly changedRows: readonly RowId[];
  readonly dirtyCellCount: number;
  readonly cellErrors: Readonly<Record<string, readonly string[]>>;
  readonly rowErrors: Readonly<Record<RowId, readonly string[]>>;
  readonly status: EditStatus;
}

/** One draft value (read-only view). */
export interface EditDraft {
  readonly rowId: RowId;
  readonly columnId: ColumnId;
  readonly initialValue: unknown;
  readonly value: unknown;
  readonly dirty: boolean;
  readonly errors: readonly string[];
  readonly pending: boolean;
}

/** Display value of a draft-backed cell; identity is stable until the draft changes. */
export interface EditDisplay {
  readonly value: unknown;
  readonly formattedValue: string;
}

export interface EditPreviewCell {
  readonly rowId: RowId;
  readonly columnId: ColumnId;
  readonly previous: unknown;
  readonly value: unknown;
  readonly errors: readonly string[];
}

/** `edit.getBatchPreview()`: non-mutating diff for a save-review UI. */
export interface EditPreview {
  readonly cells: readonly EditPreviewCell[];
  readonly addedRowIds: readonly RowId[];
  readonly deletedRowIds: readonly RowId[];
  readonly dirtyCellCount: number;
  readonly invalidCellCount: number;
}

/** `getBatchChanges()`: rows with the drafts applied. */
export interface EditBatchChanges<Row> {
  readonly addedRecords: readonly Row[];
  readonly changedRecords: readonly Row[];
  readonly deletedRecords: readonly Row[];
}

/** Outcome of the last write (`edit.getLastWrite()`). */
export interface EditWriteOutcome<Row> {
  readonly token: number;
  readonly mode: EditMode;
  readonly request: WriteRequest<Row>;
  readonly result: WriteResult<Row> | null;
  readonly error: unknown;
  readonly failedRowIds: readonly RowId[];
}

export {
  createInitialEditState,
  EDIT_COMMANDS,
  EDIT_DELETED,
  EDIT_DIRTY,
  EDIT_EDITABLE,
  EDIT_EDITING,
  EDIT_INVALID,
  EDIT_LOCKED,
  EDIT_NEW,
  EDIT_PENDING,
  EDIT_ROW_EDITING,
  BLANK_ROW_ID_PREFIX,
  showsNewRow,
} from './edit-state.js';

export const NEW_ROW_ID_PREFIX = '__new:';

export type EditStartCommand = { type: 'edit.start'; rowId: RowId; columnId?: ColumnId };
/** `value` is the editor input; the column parser converts it (dates as ISO strings). */
export type EditSetValueCommand = { type: 'edit.setValue'; rowId: RowId; columnId: ColumnId; value: Json };
/**
 * Paste, autofill, and bulk updates: drafts for many cells; `commit` writes
 * them at once (any mode but batch). A cell takes `value`, or the current
 * value (draft included) of the `from` cell (autofill).
 */
export type EditSetValuesCommand = {
  type: 'edit.setValues';
  cells: { rowId: RowId; columnId: ColumnId; value?: Json; from?: { rowId: RowId; columnId: ColumnId } }[];
  commit?: boolean;
};
export type EditCommitCommand = { type: 'edit.commit' };
export type EditCancelCommand = { type: 'edit.cancel' };
export type EditCommitAndMoveCommand = { type: 'edit.commitAndMove'; direction: 'next' | 'previous' | 'down' | 'up' };
/** `relativeTo` (tree positions): the anchor row; default the focused row. */
export type EditAddRecordCommand = { type: 'edit.addRecord'; values?: JsonObject; position?: NewRowPosition; relativeTo?: RowId };

/** `newRowPosition` values; `above`, `below` and `child` are tree mode positions relative to a row. */
export type NewRowPosition = 'top' | 'bottom' | 'above' | 'below' | 'child';

/** Where a tree-mode added row goes (`getAddedTreePlacement`). */
export interface AddedTreePlacement {
  readonly position: 'above' | 'below' | 'child';
  /** The row the position is relative to. */
  readonly anchorId: RowId;
  /** The parent the added row joins (null: a root). */
  readonly parentId: RowId | null;
}
export type EditDeleteRecordsCommand = { type: 'edit.deleteRecords'; rowIds: RowId[] };
/** `updateRow()`: writes the values (by column id) at once, validated. */
export type EditUpdateRowCommand = { type: 'edit.updateRow'; rowId: RowId; values: JsonObject };
/** `updateCell()`: batch mode keeps a draft; other modes write at once. */
export type EditUpdateCellCommand = { type: 'edit.updateCell'; rowId: RowId; columnId: ColumnId; value: Json };
export type EditSaveBatchCommand = { type: 'edit.saveBatch' };
export type EditCancelBatchCommand = { type: 'edit.cancelBatch' };
/** Restores rows marked deleted in batch mode. */
export type EditRestoreRecordsCommand = { type: 'edit.restoreRecords'; rowIds: RowId[] };
/** `messages` (merged over the defaults) replaces the message overrides at runtime (locale text changes). */
export type EditSetOptionsCommand = {
  type: 'edit.setOptions';
  options: { [K in keyof ResolvedEditOptions]?: ResolvedEditOptions[K] } & { messages?: { [K in keyof EditMessageTable]?: string } };
};
/**
 * Validates every pending change without writing: built-in rules on
 * every draft and every editable cell of added rows, custom validators and
 * `validateRow` of every dirty or added row. Rejects `invalid` when errors
 * exist, `validating` while async validators run.
 */
export type EditValidateBatchCommand = { type: 'edit.validateBatch' };
/** Reverts the last history entry (needs `undo: true`). */
export type EditUndoCommand = { type: 'edit.undo' };
/** Re-applies the last undone entry. */
export type EditRedoCommand = { type: 'edit.redo' };
/** Internal: a write or async validation settled. */
export type EditSettleCommand = { type: 'edit.settle'; token: number };

export type EditCommand =
  | EditStartCommand
  | EditSetValueCommand
  | EditSetValuesCommand
  | EditCommitCommand
  | EditCancelCommand
  | EditCommitAndMoveCommand
  | EditAddRecordCommand
  | EditDeleteRecordsCommand
  | EditUpdateRowCommand
  | EditUpdateCellCommand
  | EditSaveBatchCommand
  | EditCancelBatchCommand
  | EditRestoreRecordsCommand
  | EditSetOptionsCommand
  | EditValidateBatchCommand
  | EditUndoCommand
  | EditRedoCommand
  | EditSettleCommand;

export type EditMethods<Row> = {
  getDraft(ctx: ModuleContext<Row>, rowId: RowId, columnId: ColumnId): EditDraft | undefined;
  /** `EDIT_*` bits of a cell. */
  cellFlags(ctx: ModuleContext<Row>, rowId: RowId, columnId: ColumnId): number;
  /** `EDIT_NEW | EDIT_DELETED | EDIT_ROW_EDITING | EDIT_DIRTY | EDIT_INVALID` of a row. */
  rowFlags(ctx: ModuleContext<Row>, rowId: RowId): number;
  /** Draft value, else the row value (added rows included). */
  getValue(ctx: ModuleContext<Row>, rowId: RowId, columnId: ColumnId): unknown;
  /** Value and text of a draft-backed cell (dirty cells, added rows); stable identity. */
  getDisplay(ctx: ModuleContext<Row>, rowId: RowId, columnId: ColumnId): EditDisplay | undefined;
  /** The row with its drafts applied (added rows included), or undefined. */
  getEditedRow(ctx: ModuleContext<Row>, rowId: RowId): Row | undefined;
  getErrors(ctx: ModuleContext<Row>, rowId: RowId, columnId: ColumnId): readonly string[];
  getRowErrors(ctx: ModuleContext<Row>, rowId: RowId): readonly string[];
  isCellEditable(ctx: ModuleContext<Row>, rowId: RowId, columnId: ColumnId): boolean;
  /** Visible editable columns of a row, in display order. */
  getEditableColumnIds(ctx: ModuleContext<Row>, rowId: RowId): readonly ColumnId[];
  /**
   * Edge an added row renders at: the `position` of its `edit.addRecord`
   * (`addRow` index 0 is `'top'`, an index at or past the end `'bottom'`),
   * else `newRowPosition`; undefined for other rows.
   */
  getAddedRowPosition(ctx: ModuleContext<Row>, rowId: RowId): 'top' | 'bottom' | undefined;
  /** Next editable cell for Tab / Shift+Tab / Enter / Shift+Enter, or null. */
  nextEditableCell(ctx: ModuleContext<Row>, rowId: RowId, columnId: ColumnId, direction: 'next' | 'previous' | 'down' | 'up'): CellRef | null;
  isRequired(ctx: ModuleContext<Row>, rowId: RowId, columnId: ColumnId): boolean;
  getBatchChanges(ctx: ModuleContext<Row>): EditBatchChanges<Row>;
  getBatchPreview(ctx: ModuleContext<Row>): EditPreview;
  /** Rows the next `edit.commit` / `edit.saveBatch` would write (no validation). */
  previewWrite(ctx: ModuleContext<Row>, scope: 'active' | 'batch'): { added: readonly RowId[]; changed: readonly { rowId: RowId; columnIds: readonly ColumnId[] }[]; deleted: readonly RowId[] };
  hasUnsavedChanges(ctx: ModuleContext<Row>): boolean;
  getSnapshot(ctx: ModuleContext<Row>): EditSnapshot;
  /** Resolves when no write or async validation is pending. */
  whenSettled(ctx: ModuleContext<Row>): Promise<void>;
  getLastWrite(ctx: ModuleContext<Row>): EditWriteOutcome<Row> | null;
  /** Token of the last write sent to the source (0 before the first); `getLastWrite().token` matches it once that write settled. */
  getSubmittedWrite(ctx: ModuleContext<Row>): number;
};

export type EditModule<Row = unknown> = DataGridModule<Row, EditState, EditCommand, 'edit', EditMethods<Row>>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const LIST_LIMIT = 512;

interface Draft {
  value: unknown;
  initial: unknown;
  dirty: boolean;
  errors: readonly string[];
  /** Errors from the server or row validation, kept until the value changes. */
  external: readonly string[];
  pending: boolean;
  /** Custom (possibly async) validator result for `asyncFor`. */
  asyncFor: unknown;
  asyncError: string | null;
  asyncChecked: boolean;
  display: EditDisplay | null;
  view: EditDraft | null;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  const ea = a === null || a === undefined || a === '';
  const eb = b === null || b === undefined || b === '';
  return ea && eb;
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return fallback;
}

function mergeMessages(overrides: Partial<EditMessageTable> | undefined): EditMessageTable {
  return Object.freeze({ ...DEFAULT_VALIDATION_MESSAGES, ...DEFAULT_EDIT_MESSAGES, ...overrides });
}

/** Stored value of a cell: the key of a lookup column (its accessor returns the display value). */
function rawOf<Row>(column: CompiledColumn<Row>, row: Row): unknown {
  return column.lookup ? column.lookup.rawValue(row) : column.accessor(row);
}

function rowErrorsOf(out: string | readonly string[] | null | undefined): readonly string[] {
  if (out === null || out === undefined || out === '') return NO_ERRORS;
  if (typeof out === 'string') return Object.freeze([out]);
  return out.length ? Object.freeze([...out]) : NO_ERRORS;
}

interface Collector {
  rows: Set<RowId>;
  cells: CellRef[];
}

interface TokenItem<Row> {
  readonly kind: 'changed' | 'added' | 'deleted';
  readonly rowId: RowId;
  readonly row: Row;
  /** Submitted drafts, restored on failure. */
  readonly cells: readonly { columnId: ColumnId; value: unknown; initial: unknown }[];
  /** Base of an added row. */
  readonly base?: Row;
  /** Stored row of a changed item (undo history). */
  readonly previous?: Row;
  applied: boolean;
}

interface Token<Row> {
  readonly id: number;
  readonly mode: EditMode;
  readonly request: WriteRequest<Row>;
  readonly items: TokenItem<Row>[];
  outcome: { result: WriteResult<Row> | null; error: unknown } | null;
  /** Resolves once the settle command ran (`whenSettled`). */
  done: Promise<unknown> | null;
  /** Undo entry the write records into (`undo: true`, user writes only). */
  entry: WriteEntry<Row> | null;
}

// --- undo history ---------------------------------------------------

/** One cell of a draft entry: the draft (null: none) and value before and after the action. */
interface CellSnap {
  readonly rowId: RowId;
  readonly columnId: ColumnId;
  readonly before: Draft | null;
  readonly after: Draft | null;
}

/** Batch mode: one draft-level user action (editor session, bulk set, add, delete mark). */
interface DraftEntry<Row> {
  readonly kind: 'drafts';
  readonly cells: readonly CellSnap[];
  /** Added rows whose presence changed; index -1 is absent. */
  readonly added: readonly { readonly rowId: RowId; readonly base: Row; readonly before: number; readonly after: number }[];
  readonly deleted: readonly { readonly rowId: RowId; readonly before: boolean; readonly after: boolean }[];
}

/** A committed write (any mode); undo and redo issue the inverse or the same write. */
interface WriteEntry<Row> {
  readonly kind: 'write';
  readonly changed: { readonly rowId: RowId; readonly cells: readonly { readonly columnId: ColumnId; readonly before: unknown; readonly after: unknown }[] }[];
  /** Rows the write added, by their stored id. */
  readonly added: { readonly rowId: RowId; readonly row: Row }[];
  readonly deleted: { readonly rowId: RowId; readonly row: Row }[];
  pushed: boolean;
}

type HistoryEntry<Row> = DraftEntry<Row> | WriteEntry<Row>;

/** Commands whose draft changes batch mode records (one entry per action). */
const DRAFT_HISTORY_COMMANDS = new Set<string>([
  'edit.start',
  'edit.setValue',
  'edit.setValues',
  'edit.commit',
  'edit.cancel',
  'edit.commitAndMove',
  'edit.addRecord',
  'edit.deleteRecords',
  'edit.restoreRecords',
  'edit.updateCell',
  'edit.updateRow',
]);
/** Commands that are one action on their own: an open editor session is recorded before them. */
const DISCRETE_COMMANDS = new Set<string>(['edit.setValues', 'edit.addRecord', 'edit.deleteRecords', 'edit.restoreRecords', 'edit.updateCell', 'edit.updateRow']);

// ---------------------------------------------------------------------------
// Module
// ---------------------------------------------------------------------------

/**
 * Creates the `edit` module. Options are read from `options.edit`
 * (`EditOptions`).
 */
export function createEditModule<Row>(): EditModule<Row> {
  // Cell span resolver of the renderer: covered cells are not edit targets.
  let spans: CellSpanResolver | null = null;
  const covered = (ctx: ModuleContext<Row>, rowId: RowId, columnId: ColumnId): boolean => spans !== null && spanAnchorOf(ctx, spans, rowId, columnId) !== null;
  // Module-owned stores, updated in place between versions.
  const drafts = new Map<RowId, Map<ColumnId, Draft>>();
  const rowErrors = new Map<RowId, readonly string[]>();
  const added = new Map<RowId, Row>();
  const deleted = new Set<RowId>();
  const tokens = new Map<number, Token<Row>>();
  const displayCache = new Map<RowId, Map<ColumnId, EditDisplay>>();
  let validators = new WeakMap<CompiledColumn<Row>, { normal: CompiledValidator; key: CompiledValidator }>();
  const asyncRuns = new Set<Promise<void>>();
  let dirtyCount = 0;
  let tokenSeq = 0;
  let newSeq = 0;
  /** The always-visible add row: its id while shown, and the id sequence. */
  let blankId: RowId | null = null;
  let blankSeq = 1;
  let writeVersion = 0;
  let lastWrite: EditWriteOutcome<Row> | null = null;
  let submittedWrite = 0;
  let getRowId: (row: Row, index: number) => RowId = () => '';
  let userOptions: EditOptions<Row> = {};
  let messages: EditMessageTable = mergeMessages(undefined);
  let messageOverrides: Partial<EditMessageTable> = {};
  /** Draft of the active batch/cell editor before it opened (Escape restores it). */
  let sessionBackup: { rowId: RowId; columnId: ColumnId; draft: Draft | null } | null = null;
  /** Command re-dispatched after async validation finished, while the same row stays active. */
  let queued: { command: EditCommand; activeRowId: RowId | null } | null = null;
  /** Added rows submitted in a write that has not settled (never resubmitted). */
  const inFlightAdded = new Set<RowId>();
  /** Async `validateRow` results by row, valid while the row and its drafts are unchanged. */
  const rowChecks = new Map<RowId, { sig: unknown[]; errors: readonly string[] }>();
  let warnedKey = false;
  // Undo history. Nothing below runs with `undo: false`: `capCtx`
  // stays null and writes carry no entry.
  let undoStack: HistoryEntry<Row>[] = [];
  let redoStack: HistoryEntry<Row>[] = [];
  let undoLimit = 10;
  /** Set while a batch-mode history command reduces: draft mutations are captured. */
  let capCtx: ModuleContext<Row> | null = null;
  /** Writes record an entry (`undo: true`, not an undo or redo write). */
  let recordWrites = false;
  /** Open draft-level action: the first-seen state of every key it touched. */
  let rec: {
    cells: Map<RowId, Map<ColumnId, Draft | null>>;
    added: Map<RowId, { base: Row | undefined; index: number }>;
    deleted: Map<RowId, boolean>;
  } | null = null;

  // --- reads ---------------------------------------------------------------

  const columnOf = (ctx: ModuleContext<Row>, columnId: ColumnId): CompiledColumn<Row> | undefined => {
    const col = ctx.getColumns().byId.get(columnId);
    return col?.leaf ? col : undefined;
  };

  const baseRow = (ctx: ModuleContext<Row>, rowId: RowId): Row | undefined => added.get(rowId) ?? ctx.getRow(rowId);

  const draftOf = (rowId: RowId, columnId: ColumnId): Draft | undefined => drafts.get(rowId)?.get(columnId);

  const validatorOf = (column: CompiledColumn<Row>, isNew: boolean): CompiledValidator => {
    let entry = validators.get(column);
    if (!entry) {
      const rules = column.def.validation;
      const normal = compileValidationRules(rules, messages, false);
      // Primary keys of added rows are required unless the server assigns them.
      const key = column.flags.isPrimaryKey && !column.flags.isIdentity ? compileValidationRules(rules, messages, true) : normal;
      entry = { normal, key };
      validators.set(column, entry);
    }
    return isNew ? entry.key : entry.normal;
  };

  const isSynthetic = (rowId: RowId): boolean => rowId.startsWith(GROUP_ID_PREFIX) || rowId.startsWith(GROUP_FOOTER_ID_PREFIX);

  const editable = (ctx: ModuleContext<Row>, state: EditState, rowId: RowId, columnId: ColumnId): boolean => {
    const o = state.options;
    if (!o.enabled || isSynthetic(rowId) || deleted.has(rowId)) return false;
    const column = columnOf(ctx, columnId);
    if (!column || column.setter === null || (column.def as { commands?: unknown }).commands !== undefined) return false;
    const isNew = added.has(rowId);
    if (isNew ? !o.add : !o.edit) return false;
    const flags = column.flags;
    if (flags.isIdentity) return false;
    // Primary keys identify the stored row: editable only while adding.
    if (flags.isPrimaryKey && !isNew) return false;
    if (!flags.allowEditing && !(isNew && flags.isPrimaryKey && column.def.editable !== false)) return false;
    const row = baseRow(ctx, rowId);
    if (row === undefined) return false;
    const policy = userOptions.isCellEditable;
    return policy ? policy({ row, rowId, columnId, column, isNew }) !== false : true;
  };

  const editableColumns = (ctx: ModuleContext<Row>, state: EditState, rowId: RowId): ColumnId[] => {
    const out: ColumnId[] = [];
    for (const col of ctx.getColumns().visible) if (editable(ctx, state, rowId, col.columnId)) out.push(col.columnId);
    return out;
  };

  const valueOf = (ctx: ModuleContext<Row>, rowId: RowId, columnId: ColumnId): unknown => {
    const d = draftOf(rowId, columnId);
    if (d) return d.value;
    const row = baseRow(ctx, rowId);
    const column = columnOf(ctx, columnId);
    return row === undefined || !column ? undefined : rawOf(column, row);
  };

  /** Applies drafts to a copy of `row` (one copy for plain fields, setters otherwise). */
  const applyDrafts = (ctx: ModuleContext<Row>, row: Row, map: Map<ColumnId, Draft> | undefined, only?: readonly ColumnId[]): Row => {
    if (!map || map.size === 0) return row;
    let copy: Record<string, unknown> | null = null;
    let out = row;
    const columns = ctx.getColumns().byId;
    const apply = (columnId: ColumnId, d: Draft): void => {
      const column = columns.get(columnId);
      if (!column?.setter) return;
      const field = column.field;
      if (field !== null && column.def.valueSetter === undefined && field.indexOf('.') < 0) {
        if (copy === null) {
          copy = { ...(out as Record<string, unknown>) };
          out = copy as Row;
        }
        copy[field] = d.value;
      } else {
        out = column.setter(out, d.value);
        copy = null;
      }
    };
    if (only) for (const id of only) {
      const d = map.get(id);
      if (d) apply(id, d);
    }
    else for (const [id, d] of map) apply(id, d);
    return out;
  };

  const editedRow = (ctx: ModuleContext<Row>, rowId: RowId): Row | undefined => {
    const row = baseRow(ctx, rowId);
    return row === undefined ? undefined : applyDrafts(ctx, row, drafts.get(rowId));
  };

  const invalidateDisplay = (rowId: RowId, columnId?: ColumnId): void => {
    if (columnId === undefined) displayCache.delete(rowId);
    else displayCache.get(rowId)?.delete(columnId);
  };

  const viewOf = (rowId: RowId, columnId: ColumnId, d: Draft): EditDraft =>
    (d.view ??= Object.freeze({ rowId, columnId, initialValue: d.initial, value: d.value, dirty: d.dirty, errors: d.errors, pending: d.pending }));

  // --- draft writes --------------------------------------------------------

  const touch = (c: Collector, rowId: RowId, columnId: ColumnId): void => {
    if (c.cells.length <= LIST_LIMIT) c.cells.push({ rowId, columnId });
  };

  const setDraft = (rowId: RowId, columnId: ColumnId, d: Draft | null): void => {
    if (capCtx !== null) captureCell(rowId, columnId);
    let map = drafts.get(rowId);
    const before = map?.get(columnId);
    if (before?.dirty) dirtyCount--;
    if (d === null) {
      if (map) {
        map.delete(columnId);
        if (map.size === 0) drafts.delete(rowId);
      }
    } else {
      if (!map) {
        map = new Map();
        drafts.set(rowId, map);
      }
      map.set(columnId, d);
      if (d.dirty) dirtyCount++;
    }
    invalidateDisplay(rowId, columnId);
  };

  const newDraft = (initial: unknown, value: unknown): Draft => ({
    value,
    initial,
    dirty: !sameValue(value, initial),
    errors: NO_ERRORS,
    external: NO_ERRORS,
    pending: false,
    asyncFor: undefined,
    asyncError: null,
    asyncChecked: false,
    display: null,
    view: null,
  });

  /** Parses `input`, validates built-in rules, and stores the draft. */
  const writeValue = (ctx: ModuleContext<Row>, rowId: RowId, column: CompiledColumn<Row>, input: unknown, c: Collector): void => {
    const columnId = column.columnId;
    const row = baseRow(ctx, rowId) as Row;
    const prev = draftOf(rowId, columnId);
    const value = column.parser(input, row);
    const initial = prev ? prev.initial : rawOf(column, row);
    const isNew = added.has(rowId);
    const errors = validatorOf(column, isNew).validate(value, row);
    if (prev && sameValue(prev.value, value)) {
      // Server and row-validation errors stay until the value really changes.
      if (prev.external.length) return;
      if (prev.errors !== errors && (prev.errors.length !== errors.length || prev.errors[0] !== errors[0])) {
        prev.errors = errors;
        prev.view = null;
        touch(c, rowId, columnId);
      }
      return;
    }
    const d = newDraft(initial, value);
    d.errors = errors;
    // New rows stay draft-backed for every touched cell (their base is not stored).
    if (!d.dirty && !isNew && errors.length === 0 && !(sessionBackup && sessionBackup.rowId === rowId && sessionBackup.columnId === columnId) && !isActiveRow(rowId)) {
      setDraft(rowId, columnId, null);
    } else setDraft(rowId, columnId, d);
    touch(c, rowId, columnId);
  };

  let activeRowId: RowId | null = null;
  const isActiveRow = (rowId: RowId): boolean => activeRowId === rowId;

  /** Runs built-in rules for cells that a commit covers but that have no draft (required on untouched cells). */
  const validateCells = (ctx: ModuleContext<Row>, rowId: RowId, columnIds: readonly ColumnId[], c: Collector): boolean => {
    let ok = true;
    const isNew = added.has(rowId);
    const row = baseRow(ctx, rowId);
    if (row === undefined) return true;
    for (const columnId of columnIds) {
      const column = columnOf(ctx, columnId);
      if (!column) continue;
      const d = draftOf(rowId, columnId);
      const value = d ? d.value : rawOf(column, row);
      const errors = validatorOf(column, isNew).validate(value, row);
      if (errors.length) {
        ok = false;
        if (d) {
          if (d.errors !== errors) {
            d.errors = errors;
            d.view = null;
          }
        } else {
          const nd = newDraft(value, value);
          nd.errors = errors;
          setDraft(rowId, columnId, nd);
        }
        touch(c, rowId, columnId);
      } else if (d && d.errors.length && d.external.length === 0 && d.asyncError === null) {
        d.errors = NO_ERRORS;
        d.view = null;
        touch(c, rowId, columnId);
      }
      if (d && (d.external.length || d.asyncError !== null)) ok = false;
    }
    return ok;
  };

  // --- async validation ----------------------------------------------------

  /**
   * Runs custom validators of `cells` and `validateRow` of `rows`. Returns
   * true when every result is known (sync); false when at least one is
   * pending (the module re-dispatches `queued` when they settle).
   */
  const runCustom = (ctx: ModuleContext<Row>, cells: readonly CellRef[], rows: readonly RowId[], c: Collector): { done: boolean; ok: boolean } => {
    let done = true;
    let ok = true;
    const promises: Promise<void>[] = [];
    for (const { rowId, columnId } of cells) {
      const column = columnOf(ctx, columnId);
      if (!column) continue;
      const check = validatorOf(column, added.has(rowId)).custom;
      if (!check) continue;
      let d = draftOf(rowId, columnId);
      const value = d ? d.value : valueOf(ctx, rowId, columnId);
      if (d && d.asyncChecked && sameValue(d.asyncFor, value)) {
        if (d.asyncError !== null) ok = false;
        continue;
      }
      const row = editedRow(ctx, rowId) as Row;
      const out = check(value, row, { rowId, columnId, column: column as CompiledColumn<unknown>, isNew: added.has(rowId) });
      if (!d) {
        d = newDraft(value, value);
        setDraft(rowId, columnId, d);
      }
      const target = d;
      const settleCell = (message: string | null): void => {
        target.asyncFor = value;
        target.asyncChecked = true;
        target.asyncError = message;
        target.errors = message === null ? target.external : Object.freeze([message, ...target.external]);
        target.view = null;
        invalidateDisplay(rowId, columnId);
      };
      if (isPromiseLike<string | null>(out)) {
        done = false;
        promises.push(
          Promise.resolve(out).then(
            (m) => settleCell(m ?? null),
            (e: unknown) => settleCell(messageOf(e, messages.saveFailed)),
          ),
        );
      } else {
        settleCell(out);
        if (out !== null) ok = false;
        touch(c, rowId, columnId);
      }
    }
    const validateRow = userOptions.validateRow;
    if (validateRow) {
      for (const rowId of rows) {
        const row = editedRow(ctx, rowId);
        if (row === undefined) continue;
        const map = drafts.get(rowId);
        const sig = rowSignature(ctx, rowId);
        const known = rowChecks.get(rowId);
        if (known && sameSignature(known.sig, sig)) {
          // An async result for exactly this row: do not run (and wait) again.
          setRowErrors(rowId, known.errors);
          c.rows.add(rowId);
          if (known.errors.length) ok = false;
          continue;
        }
        const changedColumnIds = map ? [...map.keys()].filter((k) => map.get(k)?.dirty || added.has(rowId)) : [];
        const out = validateRow(row, { rowId, isNew: added.has(rowId), changedColumnIds });
        if (isPromiseLike<string | readonly string[] | null | undefined>(out)) {
          done = false;
          const settleRow = (errors: readonly string[]): void => {
            rowChecks.set(rowId, { sig, errors });
            setRowErrors(rowId, errors);
          };
          promises.push(
            Promise.resolve(out).then(
              (r) => settleRow(rowErrorsOf(r)),
              (e: unknown) => settleRow(rowErrorsOf(messageOf(e, messages.saveFailed))),
            ),
          );
        } else {
          const errs = rowErrorsOf(out);
          setRowErrors(rowId, errs);
          c.rows.add(rowId);
          if (errs.length) ok = false;
        }
      }
    }
    if (!done) {
      const token = ++tokenSeq;
      const all = Promise.all(promises).then(() => {
        asyncRuns.delete(all);
        const again = queued;
        queued = null;
        pendingAsync.add(token);
        ctx.dispatch({ type: 'edit.settle', token });
        // Replay only while the row that asked is still the active one.
        if (again && ((ctx.getModuleState<EditState>('edit')?.active?.rowId ?? null) === again.activeRowId)) ctx.dispatch(again.command);
      });
      asyncRuns.add(all);
      pendingCells.set(token, { cells: [...cells], rows: [...rows] });
    }
    return { done, ok };
  };
  const pendingAsync = new Set<number>();
  const pendingCells = new Map<number, { cells: CellRef[]; rows: RowId[] }>();

  /** Base row identity plus draft values: changes whenever the validated row would. */
  const rowSignature = (ctx: ModuleContext<Row>, rowId: RowId): unknown[] => {
    const out: unknown[] = [baseRow(ctx, rowId)];
    const map = drafts.get(rowId);
    if (map) for (const [columnId, d] of map) out.push(columnId, d.value);
    return out;
  };
  const sameSignature = (a: readonly unknown[], b: readonly unknown[]): boolean => a.length === b.length && a.every((v, i) => sameValue(v, b[i]));

  const setRowErrors = (rowId: RowId, errors: readonly string[]): void => {
    if (errors.length) rowErrors.set(rowId, errors);
    else rowErrors.delete(rowId);
  };

  // --- writes --------------------------------------------------------------

  /**
   * Next identity value for added rows of local sources (max + 1). `maxima`
   * holds the running max per column for one submit, so the source is
   * scanned once per write, not once per added row.
   */
  const identityFill = (ctx: ModuleContext<Row>, row: Row, maxima: Map<ColumnId, number>): Row => {
    const source = ctx.getDataSource();
    if (source.mode !== 'local') return row;
    let out = row;
    for (const column of ctx.getColumns().leaves) {
      if (!column.flags.isIdentity || !column.flags.isPrimaryKey || !column.setter) continue;
      const current = column.accessor(out);
      if (current !== null && current !== undefined && current !== '') continue;
      let max = maxima.get(column.columnId);
      if (max === undefined) {
        max = 0;
        const model = ctx.getRows();
        for (let i = 0; i < model.source.length; i++) {
          const v = column.accessor(model.source[i] as Row);
          if (typeof v === 'number' && v > max) max = v;
        }
        for (const r of added.values()) {
          const v = column.accessor(r);
          if (typeof v === 'number' && v > max) max = v;
        }
      }
      maxima.set(column.columnId, max + 1);
      out = column.setter(out, max + 1);
    }
    return out;
  };

  interface Plan {
    changed: Map<RowId, readonly ColumnId[] | null>;
    added: RowId[];
    deleted: RowId[];
  }

  const submit = (ctx: ModuleContext<Row>, state: EditState, plan: Plan, c: Collector): Token<Row> | string | null => {
    const source: DataSource<Row> = ctx.getDataSource();
    const items: TokenItem<Row>[] = [];
    const requestAdded: { tempId: RowId; row: Row; parentId?: RowId | null }[] = [];
    const requestChanged: { rowId: RowId; row: Row; previous: Row; changedColumnIds: ColumnId[] }[] = [];
    const requestDeleted: { rowId: RowId; row: Row }[] = [];
    const maxima = new Map<ColumnId, number>();
    const treeMoves: { row: Row; placement: AddedTreePlacement }[] = [];
    for (const rowId of plan.added) {
      const base = added.get(rowId);
      // A row already in flight is never sent twice (double save).
      if (base === undefined || inFlightAdded.has(rowId)) continue;
      const map = drafts.get(rowId);
      let row = identityFill(ctx, applyDrafts(ctx, base, map), maxima);
      const cells = map ? [...map].map(([columnId, d]) => ({ columnId, value: d.value, initial: d.initial })) : [];
      const placed = addedTree.get(rowId);
      if (placed) {
        // Tree mode: the row joins its parent (flat data: `parentIdField` set) and lands next to its anchor.
        const tree = treeOf(ctx.getRows());
        const withParent = tree ? (tree.withParent(row, placed.parentId) as Row | null) : null;
        if (withParent !== null) row = withParent;
        // Nested data cannot carry the parent: the tree module keeps it by the saved row's id (`tree.setParents`).
        else if (tree?.nested) ctx.dispatch({ type: 'tree.setParents', parents: { [getRowId(row, 0)]: placed.parentId } });
        requestAdded.push({ tempId: rowId, row, parentId: placed.parentId });
        if (placed.position !== 'child') treeMoves.push({ row, placement: placed });
      } else requestAdded.push({ tempId: rowId, row });
      items.push({ kind: 'added', rowId, row, cells, base, applied: false });
    }
    for (const [rowId, only] of plan.changed) {
      if (added.has(rowId) || deleted.has(rowId)) continue;
      const previous = ctx.getRow(rowId);
      const map = drafts.get(rowId);
      if (previous === undefined || !map) continue;
      const columnIds: ColumnId[] = [];
      // Pending drafts ride on a write in flight; a value typed since then is a new, non-pending draft.
      for (const [columnId, d] of map) if (d.dirty && !d.pending && (only === null || only.includes(columnId))) columnIds.push(columnId);
      if (columnIds.length === 0) continue;
      const row = applyDrafts(ctx, previous, map, columnIds);
      const cells = columnIds.map((columnId) => {
        const d = map.get(columnId) as Draft;
        return { columnId, value: d.value, initial: d.initial };
      });
      requestChanged.push({ rowId, row, previous, changedColumnIds: columnIds });
      items.push({ kind: 'changed', rowId, row, cells, previous, applied: false });
    }
    for (const rowId of plan.deleted) {
      const row = ctx.getRow(rowId);
      if (row === undefined) continue;
      requestDeleted.push({ rowId, row });
      items.push({ kind: 'deleted', rowId, row, cells: [], applied: false });
    }
    if (items.length === 0) return null;
    if (typeof source.write !== 'function') return 'readOnlySource';
    const controller = createAbortController();
    const request: WriteRequest<Row> = Object.freeze({
      version: ++writeVersion,
      added: Object.freeze(requestAdded),
      changed: Object.freeze(requestChanged),
      deleted: Object.freeze(requestDeleted),
      mode: state.options.mode,
      signal: controller.signal,
      // One tree-placed added row lands next to its anchor (`above` / `below`); `child` rows append (last child).
      ...(treeMoves.length === 1
        ? {
            moved: Object.freeze({
              rowIds: Object.freeze([getRowId((treeMoves[0] as { row: Row }).row, 0)]),
              targetRowId: (treeMoves[0] as { placement: AddedTreePlacement }).placement.anchorId,
              position: (treeMoves[0] as { placement: AddedTreePlacement }).placement.position === 'above' ? ('before' as const) : ('after' as const),
              parentId: (treeMoves[0] as { placement: AddedTreePlacement }).placement.parentId,
            }),
          }
        : {}),
    });
    const entry: WriteEntry<Row> | null = recordWrites ? { kind: 'write', changed: [], added: [], deleted: [], pushed: false } : null;
    const token: Token<Row> = { id: ++tokenSeq, mode: state.options.mode, request, items, outcome: null, done: null, entry };
    submittedWrite = token.id;
    for (const item of items) if (item.kind === 'added') inFlightAdded.add(item.rowId);
    // Mark pending before the call: a synchronous source emits its patch inside write().
    for (const item of items) {
      const map = drafts.get(item.rowId);
      if (map) for (const cell of item.cells) {
        const d = map.get(cell.columnId);
        if (!d) continue;
        d.pending = true;
        d.view = null;
        d.display = null;
      }
      c.rows.add(item.rowId);
    }
    let promise: Promise<WriteResult<Row>>;
    try {
      promise = Promise.resolve(source.write(request));
    } catch (error) {
      promise = Promise.reject(error);
    }
    tokens.set(token.id, token);
    // Rows a synchronous source already applied leave the draft store now.
    for (const item of items) {
      if (item.kind === 'changed') {
        if (ctx.getRow(item.rowId) === item.row) {
          item.applied = true;
          for (const cell of item.cells) setDraft(item.rowId, cell.columnId, null);
          if (!drafts.get(item.rowId)?.size) rowErrors.delete(item.rowId);
        }
      } else if (item.kind === 'added') {
        const id = getRowId(item.row, -1);
        if (ctx.getRow(id) === item.row) {
          item.applied = true;
          removeAdded(item.rowId);
          c.rows.add(id);
        }
      } else if (ctx.getRow(item.rowId) === undefined) {
        item.applied = true;
        deleted.delete(item.rowId);
        drafts.delete(item.rowId);
        rowErrors.delete(item.rowId);
      }
      if (item.applied && entry !== null) recordItem(ctx, token, item);
    }
    token.done = promise.then(
      (result) => {
        token.outcome = { result, error: null };
        ctx.dispatch({ type: 'edit.settle', token: token.id });
      },
      (error: unknown) => {
        token.outcome = { result: null, error };
        ctx.dispatch({ type: 'edit.settle', token: token.id });
      },
    );
    return token;
  };

  const removeAdded = (rowId: RowId): void => {
    if (capCtx !== null) {
      captureAdded(rowId);
      const cells = drafts.get(rowId);
      if (cells) for (const columnId of cells.keys()) captureCell(rowId, columnId);
    }
    added.delete(rowId);
    inFlightAdded.delete(rowId);
    rowChecks.delete(rowId);
    const map = drafts.get(rowId);
    if (map) for (const d of map.values()) if (d.dirty) dirtyCount--;
    drafts.delete(rowId);
    rowErrors.delete(rowId);
    invalidateDisplay(rowId);
  };

  // --- always-visible add row ------------------------------------

  /** A new row's base: the columns' `defaultValue`, then `newRow()`. */
  const blankRow = (ctx: ModuleContext<Row>): Row => {
    let row = {} as Row;
    for (const column of ctx.getColumns().leaves) {
      if (!column.setter) continue;
      const def = column.def.defaultValue;
      if (def !== undefined) row = column.setter(row, typeof def === 'function' ? (def as () => unknown)() : def);
    }
    const extra = userOptions.newRow?.();
    if (extra) row = { ...(row as object), ...(extra as object) } as Row;
    return row;
  };

  /** The add row's base is built on first use (it needs the compiled columns). */
  const ensureBlank = (ctx: ModuleContext<Row>): void => {
    if (blankId !== null && !added.has(blankId)) added.set(blankId, blankRow(ctx));
  };

  /** The add row has no changed value (leaving it writes nothing). */
  const blankUntouched = (): boolean => {
    const map = blankId === null ? undefined : drafts.get(blankId);
    if (map) for (const d of map.values()) if (d.dirty) return false;
    return true;
  };

  /**
   * Clears the add row (drafts, errors). `rotate` gives it a fresh id, which
   * remounts its editors empty (after a save, the saved row keeps the old id
   * until its write settles; after a cancel, typed text is dropped).
   */
  const resetBlank = (c: Collector, rotate: boolean): void => {
    const id = blankId;
    if (id === null) return;
    c.rows.add(id);
    if (added.has(id) && !inFlightAdded.has(id)) removeAdded(id);
    if (rotate) {
      blankSeq++;
      blankId = `${BLANK_ROW_ID_PREFIX}${blankSeq}`;
      c.rows.add(blankId);
    }
  };

  // --- undo history --------------------------------------------------------

  const snap = (d: Draft | undefined | null): Draft | null => (d ? { ...d, view: null, display: null } : null);

  const openRec = (): NonNullable<typeof rec> => (rec ??= { cells: new Map(), added: new Map(), deleted: new Map() });

  /** Keeps the first-seen draft of a key for the open action. */
  const captureCell = (rowId: RowId, columnId: ColumnId): void => {
    const r = openRec();
    let byRow = r.cells.get(rowId);
    if (!byRow) {
      byRow = new Map();
      r.cells.set(rowId, byRow);
    }
    if (!byRow.has(columnId)) byRow.set(columnId, snap(draftOf(rowId, columnId)));
  };

  const captureAdded = (rowId: RowId): void => {
    const r = openRec();
    if (!r.added.has(rowId)) r.added.set(rowId, { base: added.get(rowId), index: added.has(rowId) ? Math.max(0, addedOrder.indexOf(rowId)) : -1 });
  };

  const captureDeleted = (rowId: RowId): void => {
    const r = openRec();
    if (!r.deleted.has(rowId)) r.deleted.set(rowId, deleted.has(rowId));
  };

  const pushEntry = (entry: HistoryEntry<Row>): void => {
    if (undoLimit === 0) return;
    undoStack.push(entry);
    if (undoStack.length > undoLimit) undoStack.splice(0, undoStack.length - undoLimit);
    redoStack.length = 0;
  };

  /** Closes the open draft-level action: an entry when a value, an added row, or a delete mark changed. */
  const flushHistory = (ctx: ModuleContext<Row>): void => {
    const r = rec;
    if (r === null) return;
    rec = null;
    const cells: CellSnap[] = [];
    const cellValue = (rowId: RowId, columnId: ColumnId, d: Draft | null, row: Row | undefined): unknown => {
      if (d) return d.value;
      const column = columnOf(ctx, columnId);
      return row === undefined || !column ? undefined : rawOf(column, row);
    };
    for (const [rowId, byRow] of r.cells) {
      const known = r.added.get(rowId);
      // A row that did not exist before the action has no stored base.
      const beforeRow = known ? known.base : baseRow(ctx, rowId);
      const afterRow = baseRow(ctx, rowId);
      for (const [columnId, before] of byRow) {
        const after = snap(draftOf(rowId, columnId));
        const changed = !sameValue(cellValue(rowId, columnId, before, beforeRow), cellValue(rowId, columnId, after, afterRow)) || (before?.dirty ?? false) !== (after?.dirty ?? false);
        if (changed) cells.push({ rowId, columnId, before, after });
      }
    }
    const addedRows: { rowId: RowId; base: Row; before: number; after: number }[] = [];
    for (const [rowId, { base, index }] of r.added) {
      const now = added.has(rowId) ? Math.max(0, addedOrder.indexOf(rowId)) : -1;
      const row = base ?? added.get(rowId);
      if ((index < 0) !== (now < 0) && row !== undefined) addedRows.push({ rowId, base: row, before: index, after: now });
    }
    const deletedRows: { rowId: RowId; before: boolean; after: boolean }[] = [];
    for (const [rowId, before] of r.deleted) if (before !== deleted.has(rowId)) deletedRows.push({ rowId, before, after: !before });
    if (cells.length || addedRows.length || deletedRows.length) pushEntry({ kind: 'drafts', cells, added: addedRows, deleted: deletedRows });
  };

  /** Drops draft-level entries (their drafts were saved or discarded); write entries stay. */
  const dropDraftHistory = (): void => {
    rec = null;
    if (undoStack.some((e) => e.kind === 'drafts')) undoStack = undoStack.filter((e) => e.kind === 'write');
    if (redoStack.some((e) => e.kind === 'drafts')) redoStack = redoStack.filter((e) => e.kind === 'write');
  };

  const clearHistory = (): void => {
    rec = null;
    undoStack = [];
    redoStack = [];
  };

  /** Adds a settled item of a user write to its entry (pushed with the first item). */
  const recordItem = (ctx: ModuleContext<Row>, token: Token<Row>, item: TokenItem<Row>, stored?: Row): void => {
    const entry = token.entry;
    if (entry === null) return;
    if (item.kind === 'changed') {
      const previous = item.previous as Row;
      const cells = item.cells.map((cell) => {
        const column = columnOf(ctx, cell.columnId);
        return { columnId: cell.columnId, before: column ? rawOf(column, previous) : cell.initial, after: cell.value };
      });
      entry.changed.push({ rowId: item.rowId, cells });
    } else if (item.kind === 'added') {
      const row = stored ?? item.row;
      entry.added.push({ rowId: getRowId(row, -1), row });
    } else entry.deleted.push({ rowId: item.rowId, row: item.row });
    if (!entry.pushed) {
      entry.pushed = true;
      pushEntry(entry);
    }
  };

  /** Batch mode: restores the drafts, added rows, and delete marks of one side of an entry. */
  const applyDraftEntry = (entry: DraftEntry<Row>, undo: boolean, c: Collector): void => {
    for (const a of entry.added) {
      const index = undo ? a.before : a.after;
      if (index >= 0 && !added.has(a.rowId)) {
        added.set(a.rowId, a.base);
        addedOrder.splice(Math.min(index, addedOrder.length), 0, a.rowId);
      } else if (index < 0 && added.has(a.rowId)) removeAdded(a.rowId);
      c.rows.add(a.rowId);
    }
    for (const d of entry.deleted) {
      if (undo ? d.before : d.after) deleted.add(d.rowId);
      else deleted.delete(d.rowId);
      c.rows.add(d.rowId);
    }
    for (const cell of entry.cells) {
      const target = undo ? cell.before : cell.after;
      const exists = added.has(cell.rowId) || !deleted.has(cell.rowId);
      let d: Draft | null = target && exists ? { ...target, view: null, display: null, pending: false } : null;
      // A clean draft of a stored row is an editor leftover: no draft at all.
      if (d && !d.dirty && !added.has(cell.rowId) && d.errors.length === 0) d = null;
      setDraft(cell.rowId, cell.columnId, d);
      touch(c, cell.rowId, cell.columnId);
      c.rows.add(cell.rowId);
    }
    sessionBackup = null;
  };

  /** Issues the inverse (undo) or the same (redo) write of an entry through `submit`. */
  const applyWriteEntry = (ctx: ModuleContext<Row>, state: EditState, entry: WriteEntry<Row>, undo: boolean, c: Collector): string | null => {
    for (const ch of entry.changed) if (drafts.has(ch.rowId) && ctx.getRow(ch.rowId) !== undefined) return 'unsavedChanges';
    const plan: Plan = { changed: new Map(), added: [], deleted: [] };
    const created: { rowId: RowId; columnId: ColumnId }[] = [];
    const tempIds: RowId[] = [];
    for (const ch of entry.changed) {
      const row = ctx.getRow(ch.rowId);
      if (row === undefined) continue;
      const cols: ColumnId[] = [];
      for (const cell of ch.cells) {
        const column = columnOf(ctx, cell.columnId);
        if (!column?.setter) continue;
        const current = rawOf(column, row);
        const target = undo ? cell.before : cell.after;
        if (sameValue(current, target)) continue;
        setDraft(ch.rowId, cell.columnId, newDraft(current, target));
        created.push({ rowId: ch.rowId, columnId: cell.columnId });
        cols.push(cell.columnId);
      }
      if (cols.length) plan.changed.set(ch.rowId, cols);
    }
    const readd = (row: Row): void => {
      if (ctx.getRow(getRowId(row, -1)) !== undefined) return;
      const tempId = `${NEW_ROW_ID_PREFIX}${++newSeq}`;
      added.set(tempId, row);
      tempIds.push(tempId);
      plan.added.push(tempId);
    };
    const remove = (rowId: RowId): void => {
      if (ctx.getRow(rowId) !== undefined) plan.deleted.push(rowId);
    };
    for (const a of entry.added) {
      if (undo) remove(a.rowId);
      else readd(a.row);
    }
    for (const d of entry.deleted) {
      if (undo) readd(d.row);
      else remove(d.rowId);
    }
    const token = submit(ctx, state, plan, c);
    if (typeof token === 'string') {
      for (const cell of created) setDraft(cell.rowId, cell.columnId, null);
      for (const id of tempIds) removeAdded(id);
      return token;
    }
    return null;
  };

  const restoreItem = (item: TokenItem<Row>, errors: Map<ColumnId, readonly string[]>, rowErr: readonly string[]): void => {
    if (item.kind === 'added' && item.base !== undefined && !added.has(item.rowId)) added.set(item.rowId, item.base);
    if (item.kind === 'deleted') deleted.add(item.rowId);
    for (const cell of item.cells) {
      const existing = draftOf(item.rowId, cell.columnId);
      const d = existing && !sameValue(existing.value, cell.value) ? existing : newDraft(cell.initial, cell.value);
      if (item.kind === 'added') d.dirty = true;
      const external = errors.get(cell.columnId) ?? NO_ERRORS;
      d.external = external;
      d.errors = external.length ? external : d.errors;
      d.pending = false;
      d.view = null;
      setDraft(item.rowId, cell.columnId, d);
    }
    for (const [columnId, external] of errors) {
      if (draftOf(item.rowId, columnId)) continue;
      const d = newDraft(undefined, undefined);
      d.external = external;
      d.errors = external;
      setDraft(item.rowId, columnId, d);
    }
    if (rowErr.length) rowErrors.set(item.rowId, rowErr);
  };

  const settleWrite = (ctx: ModuleContext<Row>, state: EditState, token: Token<Row>, c: Collector): EditState => {
    tokens.delete(token.id);
    const outcome = token.outcome ?? { result: null, error: new Error(messages.saveFailed) };
    const result = outcome.result;
    const failed = new Set<RowId>();
    const cellErr = new Map<RowId, Map<ColumnId, readonly string[]>>();
    let lastError: string | null = null;
    if (outcome.error !== null && outcome.error !== undefined) {
      lastError = messageOf(outcome.error, messages.saveFailed);
      for (const item of token.items) failed.add(item.rowId);
    } else if (result) {
      for (const id of Object.keys(result.rowErrors ?? {})) failed.add(id);
      for (const conflict of result.conflicts ?? []) failed.add(conflict.rowId);
      for (const [key, errs] of Object.entries(result.cellErrors ?? {})) {
        const at = key.lastIndexOf(':');
        const rowId = key.slice(0, at);
        failed.add(rowId);
        let m = cellErr.get(rowId);
        if (!m) {
          m = new Map();
          cellErr.set(rowId, m);
        }
        m.set(key.slice(at + 1), Object.freeze([...errs]));
      }
      if (result.status === 'rejected' && failed.size === 0) {
        for (const item of token.items) failed.add(item.rowId);
        lastError = messages.saveRejected;
      }
    }
    // The echo of added rows (server ids) replaces their temp ids.
    const echoed = new Map<RowId, Row>();
    for (const a of result?.added ?? []) echoed.set(a.tempId, a.row);
    for (const item of token.items) {
      c.rows.add(item.rowId);
      if (item.kind === 'added') inFlightAdded.delete(item.rowId);
      if (failed.has(item.rowId)) {
        const rowErr = outcome.error ? Object.freeze([lastError as string]) : Object.freeze([...(result?.rowErrors?.[item.rowId] ?? [])]);
        const conflict = result?.conflicts?.some((x) => x.rowId === item.rowId);
        restoreItem(item, cellErr.get(item.rowId) ?? new Map(), rowErr.length ? rowErr : conflict ? Object.freeze([messages.conflict]) : NO_ERRORS);
        for (const cell of item.cells) touch(c, item.rowId, cell.columnId);
        continue;
      }
      if (item.applied) continue;
      if (item.kind === 'changed') {
        const map = drafts.get(item.rowId);
        for (const cell of item.cells) {
          const d = map?.get(cell.columnId);
          // Keep a draft the user changed again while the write was in flight.
          if (d && d.pending && sameValue(d.value, cell.value)) setDraft(item.rowId, cell.columnId, null);
          else if (d) {
            d.pending = false;
            d.view = null;
          }
          touch(c, item.rowId, cell.columnId);
        }
        if (!drafts.get(item.rowId)?.size) rowErrors.delete(item.rowId);
      } else if (item.kind === 'added') {
        removeAdded(item.rowId);
        const server = echoed.get(item.rowId);
        if (server !== undefined) c.rows.add(getRowId(server, -1));
      } else {
        deleted.delete(item.rowId);
        drafts.delete(item.rowId);
        rowErrors.delete(item.rowId);
      }
      if (token.entry !== null) recordItem(ctx, token, item, echoed.get(item.rowId));
    }
    lastWrite = Object.freeze({
      token: token.id,
      mode: token.mode,
      request: token.request,
      result,
      error: outcome.error,
      failedRowIds: Object.freeze([...failed]),
    });
    const failedAny = failed.size > 0;
    return next(ctx, state, c, failedAny ? { lastError: lastError ?? messages.partialSave, status: 'error' } : { lastError: null });
  };

  // --- state transitions ---------------------------------------------------

  const listOf = (set: Iterable<RowId>): readonly RowId[] => Object.freeze([...set]);

  let addedList: readonly RowId[] = EMPTY_IDS;
  let addedOrder: RowId[] = [];
  /** Render edge of each added row (its addRecord position); pruned with the row (an undo re-add uses `newRowPosition`). */
  const addedEdge = new Map<RowId, 'top' | 'bottom'>();
  /** Tree placement of added rows. */
  const addedTree = new Map<RowId, AddedTreePlacement>();
  let placements: { size: number; first: AddedTreePlacement | undefined; record: Readonly<Record<RowId, AddedTreePlacement>> } | null = null;
  const placementsRecord = (): Readonly<Record<RowId, AddedTreePlacement>> => {
    const first = addedTree.values().next().value;
    if (!placements || placements.size !== addedTree.size || placements.first !== first) placements = { size: addedTree.size, first, record: Object.freeze(Object.fromEntries(addedTree)) };
    return placements.record;
  };
  let deletedList: readonly RowId[] = EMPTY_IDS;

  const next = (
    _ctx: ModuleContext<Row>,
    state: EditState,
    c: Collector,
    patch: { active?: EditTarget | null; lastError?: string | null; status?: EditStatus; options?: ResolvedEditOptions; lastBulk?: EditState['lastBulk'] } = {},
  ): EditState => {
    addedOrder = addedOrder.filter((id) => id !== blankId && added.has(id));
    for (const id of added.keys()) if (id !== blankId && !addedOrder.includes(id)) addedOrder.push(id);
    if (addedEdge.size > added.size) for (const id of addedEdge.keys()) if (!added.has(id)) addedEdge.delete(id);
    if (addedTree.size > added.size) for (const id of addedTree.keys()) if (!added.has(id)) addedTree.delete(id);
    if (addedOrder.length !== addedList.length || addedOrder.some((id, i) => addedList[i] !== id)) addedList = Object.freeze([...addedOrder]);
    if (deleted.size !== deletedList.length || deletedList.some((id) => !deleted.has(id))) deletedList = listOf(deleted);
    const active = patch.active !== undefined ? patch.active : state.active;
    activeRowId = active?.rowId ?? null;
    let pendingWrites = 0;
    for (const t of tokens.values()) if (t.items.some((item) => !item.applied)) pendingWrites++;
    const validating = asyncRuns.size > 0;
    let status: EditStatus = patch.status ?? (pendingWrites > 0 ? 'submitting' : validating ? 'validating' : active ? 'editing' : 'idle');
    if (patch.status === undefined && state.status === 'error' && patch.lastError === undefined && !active && pendingWrites === 0) status = 'error';
    const all = c.cells.length > LIST_LIMIT || c.rows.size > LIST_LIMIT;
    return Object.freeze({
      options: patch.options ?? state.options,
      version: state.version + 1,
      newRowId: blankId,
      active,
      status,
      dirtyCellCount: dirtyCount,
      addedRowIds: addedList,
      deletedRowIds: deletedList,
      pendingWrites,
      lastError: patch.lastError !== undefined ? patch.lastError : state.lastError,
      lastBulk: patch.lastBulk !== undefined ? patch.lastBulk : state.lastBulk,
      canUndo: undoStack.length > 0,
      canRedo: redoStack.length > 0,
      ...(addedTree.size ? { addedTreePlacements: placementsRecord() } : {}),
      change: Object.freeze({ rows: all ? EMPTY_IDS : Object.freeze([...c.rows]), cells: all ? EMPTY_CELLS : Object.freeze([...c.cells]), all }),
    });
  };

  const collector = (): Collector => ({ rows: new Set(), cells: [] });

  /** Opens an editor: batch/cell mode one cell, row/dialog mode a row. */
  const start = (ctx: ModuleContext<Row>, state: EditState, rowId: RowId, columnId: ColumnId | undefined, c: Collector): EditState | string => {
    // A new edit supersedes a command waiting on async validation.
    queued = null;
    const o = state.options;
    if (!o.enabled) return 'editDisabled';
    const isNew = added.has(rowId);
    if (!isNew && !o.edit) return 'editDisabled';
    if (baseRow(ctx, rowId) === undefined || isSynthetic(rowId)) return 'unknownRow';
    if (deleted.has(rowId)) return 'rowDeleted';
    if (!warnedKey && !o.keyedRows && !ctx.getColumns().leaves.some((col) => col.flags.isPrimaryKey)) {
      warnedKey = true;
      ctx.warn('edit-no-primary-key', 'Editing without a primaryKey column: set primaryKey on the key column (or getRowId) so writes can address rows.');
    }
    const cellMode = o.mode === 'batch' || o.mode === 'cell';
    if (cellMode) {
      if (columnId === undefined) {
        const first = editableColumns(ctx, state, rowId)[0];
        if (first === undefined) return 'notEditable';
        columnId = first;
      }
      if (!editable(ctx, state, rowId, columnId)) return 'notEditable';
      const active = state.active;
      if (active && active.rowId === rowId && active.columnId === columnId) return 'alreadyEditing';
      let s = state;
      if (active) {
        const closed = closeCell(ctx, s, c);
        if (typeof closed === 'string') return closed;
        s = closed;
        // The closed editor session is one history entry; the next one starts here.
        if (capCtx !== null) flushHistory(ctx);
      }
      const prev = draftOf(rowId, columnId);
      sessionBackup = { rowId, columnId, draft: prev ? { ...prev } : null };
      if (!prev) {
        const v = valueOf(ctx, rowId, columnId);
        setDraft(rowId, columnId, newDraft(v, v));
      }
      touch(c, rowId, columnId);
      return next(ctx, s, c, { active: Object.freeze({ rowId, columnId, isNew }) });
    }
    // Row and dialog modes.
    const columns = editableColumns(ctx, state, rowId);
    if (columns.length === 0) return 'notEditable';
    const focus = columnId !== undefined && columns.includes(columnId) ? columnId : (columns[0] as ColumnId);
    const active = state.active;
    if (active && active.rowId === rowId) {
      if (active.columnId === focus) return 'alreadyEditing';
      return next(ctx, state, c, { active: Object.freeze({ rowId, columnId: focus, isNew }) });
    }
    let s = state;
    if (active) {
      const committed = commitRow(ctx, s, c);
      if (typeof committed === 'string') return committed;
      s = committed;
    }
    c.rows.add(rowId);
    return next(ctx, s, c, { active: Object.freeze({ rowId, columnId: focus, isNew }) });
  };

  /** Batch: closes the cell editor (drafts stay). Cell: writes the cell. */
  const closeCell = (ctx: ModuleContext<Row>, state: EditState, c: Collector): EditState | string => {
    const active = state.active;
    if (!active || active.columnId === null) return state;
    const { rowId, columnId } = active;
    const d = draftOf(rowId, columnId);
    if (d && d.errors.length && d.external.length === 0) return 'invalid';
    if (d) {
      // Cell mode writes the row now, so `validateRow` runs too; batch mode runs it on save.
      const r = runCustom(ctx, [{ rowId, columnId }], state.options.mode === 'cell' && d.dirty ? [rowId] : EMPTY_IDS, c);
      if (!r.done) return 'validating';
      if (!r.ok) return 'invalid';
    }
    sessionBackup = null;
    touch(c, rowId, columnId);
    if (d && !d.dirty && !active.isNew && d.errors.length === 0 && !d.pending) setDraft(rowId, columnId, null);
    if (state.options.mode === 'cell') {
      const token = active.isNew
        ? submitAddedIfValid(ctx, state, rowId, c)
        : submit(ctx, state, { changed: new Map([[rowId, [columnId]]]), added: [], deleted: [] }, c);
      if (typeof token === 'string') return token;
    }
    return next(ctx, state, c, { active: null });
  };

  /**
   * Cell mode: an added row is written once every editable cell passes its
   * rules (built-in, custom, and `validateRow`). Until then it stays an
   * added draft row without error markers on cells the user has not visited.
   */
  const submitAddedIfValid = (ctx: ModuleContext<Row>, state: EditState, rowId: RowId, c: Collector): Token<Row> | string | null => {
    const row = added.get(rowId);
    if (row === undefined || inFlightAdded.has(rowId)) return null;
    const columns = editableColumns(ctx, state, rowId);
    for (const columnId of columns) {
      const column = columnOf(ctx, columnId) as CompiledColumn<Row>;
      const d = draftOf(rowId, columnId);
      if (d?.errors.length) return null;
      if (validatorOf(column, true).validate(d ? d.value : rawOf(column, row), row).length) return null;
    }
    const r = runCustom(ctx, columns.map((columnId) => ({ rowId, columnId })), [rowId], c);
    // Async results are cached; the next commit on the row submits it.
    if (!r.done || !r.ok) return null;
    for (const columnId of columns) {
      if (!draftOf(rowId, columnId)) {
        const v = valueOf(ctx, rowId, columnId);
        setDraft(rowId, columnId, newDraft(v, v));
      }
    }
    return submit(ctx, state, { changed: new Map(), added: [rowId], deleted: [] }, c);
  };

  /** Row and dialog: validates and writes the active row. */
  const commitRow = (ctx: ModuleContext<Row>, state: EditState, c: Collector): EditState | string => {
    const active = state.active;
    if (!active) return state;
    const { rowId, isNew } = active;
    const isBlank = rowId === blankId;
    if (isBlank && blankUntouched()) {
      // Leaving (or saving) the add row without a changed value writes nothing and clears its errors.
      resetBlank(c, false);
      return next(ctx, state, c, { active: null });
    }
    const columns = editableColumns(ctx, state, rowId);
    const map = drafts.get(rowId);
    const touchedCols = map ? [...map.keys()] : [];
    let ok = validateCells(ctx, rowId, isNew ? columns : touchedCols, c);
    const changedCells = (isNew ? columns : touchedCols).map((columnId) => ({ rowId, columnId }));
    const dirtyRow = isNew || touchedCols.some((id) => draftOf(rowId, id)?.dirty);
    if (ok) {
      const r = runCustom(ctx, changedCells, dirtyRow ? [rowId] : EMPTY_IDS, c);
      if (!r.done) return 'validating';
      ok = r.ok;
    }
    c.rows.add(rowId);
    if (!ok) return 'invalid';
    if (isNew) {
      // Every editable cell of a new row is part of the record.
      for (const columnId of columns) {
        if (!draftOf(rowId, columnId)) {
          const v = valueOf(ctx, rowId, columnId);
          const d = newDraft(v, v);
          setDraft(rowId, columnId, d);
        }
      }
      const token = submit(ctx, state, { changed: new Map(), added: [rowId], deleted: [] }, c);
      if (typeof token === 'string') return token;
      // The saved add row becomes an ordinary added row until its write settles; a fresh blank row follows.
      if (isBlank) resetBlank(c, true);
    } else if (dirtyRow) {
      const token = submit(ctx, state, { changed: new Map([[rowId, null]]), added: [], deleted: [] }, c);
      if (typeof token === 'string') return token;
    } else {
      drafts.delete(rowId);
      rowErrors.delete(rowId);
      invalidateDisplay(rowId);
    }
    // Non-dirty leftovers of an unchanged row.
    const leftovers = drafts.get(rowId);
    if (leftovers && !isNew) for (const [id, d] of [...leftovers]) if (!d.dirty && !d.pending) setDraft(rowId, id, null);
    return next(ctx, state, c, { active: null });
  };

  const cancel = (ctx: ModuleContext<Row>, state: EditState, c: Collector): EditState | string => {
    queued = null;
    const active = state.active;
    if (!active) return 'notEditing';
    const { rowId } = active;
    c.rows.add(rowId);
    if (state.options.mode === 'batch' || state.options.mode === 'cell') {
      const columnId = active.columnId as ColumnId;
      const backup = sessionBackup;
      sessionBackup = null;
      if (backup && backup.rowId === rowId && backup.columnId === columnId && backup.draft) {
        const restored = { ...backup.draft, view: null, display: null };
        setDraft(rowId, columnId, restored);
      } else if (!active.isNew) setDraft(rowId, columnId, null);
      touch(c, rowId, columnId);
      return next(ctx, state, c, { active: null });
    }
    if (rowId === blankId) resetBlank(c, true);
    else if (active.isNew) removeAdded(rowId);
    else {
      const map = drafts.get(rowId);
      if (map) for (const columnId of [...map.keys()]) setDraft(rowId, columnId, null);
      rowErrors.delete(rowId);
    }
    return next(ctx, state, c, { active: null });
  };

  const addRecord = (ctx: ModuleContext<Row>, state: EditState, values: JsonObject | undefined, position: NewRowPosition | undefined, c: Collector, relativeTo?: RowId): EditState | string => {
    const o = state.options;
    if (!o.enabled || !o.add) return 'addDisabled';
    let s = state;
    if (blankId !== null) return addToBlank(ctx, s, values, c);
    if (s.active) {
      const closed = o.mode === 'batch' || o.mode === 'cell' ? closeCell(ctx, s, c) : commitRow(ctx, s, c);
      if (typeof closed === 'string') return closed;
      s = closed;
    }
    const row = blankRow(ctx);
    const rowId = `${NEW_ROW_ID_PREFIX}${++newSeq}`;
    if (capCtx !== null) captureAdded(rowId);
    added.set(rowId, row);
    const requested = position ?? o.treeRowPosition ?? o.newRowPosition;
    let pos: 'top' | 'bottom' = requested === 'above' || requested === 'top' ? 'top' : 'bottom';
    if (requested === 'above' || requested === 'below' || requested === 'child') {
      // Tree positions: relative to the anchor (default the focused row); without a tree or an anchor, the edge.
      const tree = treeOf(ctx.getRows());
      const focus = ctx.getModuleState<{ target: { kind: string; rowId?: RowId } | null }>('focus')?.target;
      const anchorId = relativeTo ?? (focus && focus.kind === 'cell' ? (focus.rowId ?? null) : null);
      const s = tree && anchorId !== null ? tree.sourceIndexOf(anchorId) : -1;
      if (tree && anchorId !== null && s >= 0) {
        const p = tree.index.parent[s] as number;
        const parentId = requested === 'child' ? anchorId : p < 0 ? null : (tree.sourceIds[p] as RowId);
        addedTree.set(rowId, Object.freeze({ position: requested, anchorId, parentId }));
      } else if (requested === 'child' || requested === 'below') pos = 'bottom';
      else pos = 'top';
    }
    addedEdge.set(rowId, pos);
    addedOrder = pos === 'top' ? [rowId, ...addedOrder.filter((id) => id !== rowId)] : [...addedOrder.filter((id) => id !== rowId), rowId];
    if (values) {
      for (const [columnId, input] of Object.entries(values)) {
        const column = columnOf(ctx, columnId);
        if (column?.setter) writeValue(ctx, rowId, column, input, c);
      }
    }
    // Added rows are draft-backed and dirty as a whole.
    c.rows.add(rowId);
    const first = editableColumns(ctx, s, rowId)[0] ?? null;
    if (o.mode === 'batch' || o.mode === 'cell') {
      if (first === null) return next(ctx, s, c, { active: null });
      sessionBackup = { rowId, columnId: first, draft: draftOf(rowId, first) ?? null };
      if (!draftOf(rowId, first)) {
        const v = valueOf(ctx, rowId, first);
        setDraft(rowId, first, newDraft(v, v));
      }
      return next(ctx, s, c, { active: Object.freeze({ rowId, columnId: first, isNew: true }) });
    }
    return next(ctx, s, c, { active: Object.freeze({ rowId, columnId: first, isNew: true }) });
  };

  /** `showNewRow`: adding edits the always-visible add row (values go into it) instead of opening another one. */
  const addToBlank = (ctx: ModuleContext<Row>, state: EditState, values: JsonObject | undefined, c: Collector): EditState | string => {
    let s = state;
    if (s.active && s.active.rowId !== blankId) {
      const closed = commitRow(ctx, s, c);
      if (typeof closed === 'string') return closed;
      s = closed;
    }
    ensureBlank(ctx);
    const rowId = blankId as RowId;
    if (values) {
      for (const [columnId, input] of Object.entries(values)) {
        const column = columnOf(ctx, columnId);
        if (column?.setter && editable(ctx, s, rowId, columnId)) writeValue(ctx, rowId, column, input, c);
      }
    }
    c.rows.add(rowId);
    const current = s.active?.rowId === rowId ? s.active.columnId : null;
    const first = current ?? editableColumns(ctx, s, rowId)[0] ?? null;
    return next(ctx, s, c, { active: Object.freeze({ rowId, columnId: first, isNew: true }) });
  };

  const deleteRecords = (ctx: ModuleContext<Row>, state: EditState, rowIds: readonly RowId[], c: Collector): EditState | string => {
    const o = state.options;
    if (!o.enabled || !o.delete) return 'deleteDisabled';
    // Tree mode: deleting a parent deletes its subtree (every descendant, filtered or not).
    const tree = treeOf(ctx.getRows());
    if (tree) {
      const all = new Set(rowIds);
      for (const id of rowIds) {
        const s = tree.sourceIndexOf(id);
        const a = s < 0 ? -1 : (tree.index.slot[s] as number);
        if (a < 0) continue;
        const end = tree.index.next[a] as number;
        for (let x = a + 1; x < end; x++) all.add(tree.sourceIds[tree.index.order[x] as number] as RowId);
      }
      if (all.size !== rowIds.length) rowIds = [...all];
    }
    // The always-visible add row is not deletable (Escape clears it).
    const ids = rowIds.filter((id) => id !== blankId && !isSynthetic(id) && (added.has(id) || ctx.getRow(id) !== undefined));
    if (ids.length === 0) return 'noRows';
    let active = state.active;
    for (const id of ids) {
      c.rows.add(id);
      if (active?.rowId === id) {
        active = null;
        sessionBackup = null;
      }
    }
    if (o.mode === 'batch') {
      for (const id of ids) {
        if (added.has(id)) removeAdded(id);
        else {
          if (capCtx !== null) captureDeleted(id);
          deleted.add(id);
          const map = drafts.get(id);
          if (map) for (const columnId of [...map.keys()]) setDraft(id, columnId, null);
        }
      }
      return next(ctx, state, c, { active });
    }
    const existing: RowId[] = [];
    for (const id of ids) {
      if (added.has(id)) removeAdded(id);
      else existing.push(id);
    }
    if (existing.length) {
      const token = submit(ctx, state, { changed: new Map(), added: [], deleted: existing }, c);
      if (typeof token === 'string') return token;
    }
    return next(ctx, state, c, { active });
  };

  const saveBatch = (ctx: ModuleContext<Row>, state: EditState, c: Collector): EditState | string => {
    let s = state;
    if (s.active) {
      const closed = closeCell(ctx, s, c);
      if (typeof closed === 'string') return closed;
      s = closed;
    }
    // Built-in rules (required on untouched cells of added rows), then custom and row validators.
    let ok = true;
    const cells: CellRef[] = [];
    const rows: RowId[] = [];
    for (const rowId of addedOrder) {
      if (!added.has(rowId)) continue;
      const columns = editableColumns(ctx, s, rowId);
      if (!validateCells(ctx, rowId, columns, c)) ok = false;
      for (const columnId of columns) cells.push({ rowId, columnId });
      rows.push(rowId);
    }
    for (const [rowId, map] of drafts) {
      if (added.has(rowId) || deleted.has(rowId)) continue;
      let dirtyRow = false;
      for (const [columnId, d] of map) {
        if (!d.dirty) continue;
        dirtyRow = true;
        if (d.errors.length) ok = false;
        cells.push({ rowId, columnId });
      }
      if (dirtyRow) rows.push(rowId);
    }
    if (ok) {
      const r = runCustom(ctx, cells, rows, c);
      if (!r.done) return 'validating';
      ok = r.ok;
    }
    if (!ok) return 'invalid';
    // Saved drafts leave the draft history; the save itself becomes one write entry.
    dropDraftHistory();
    const changed = new Map<RowId, readonly ColumnId[] | null>();
    for (const rowId of drafts.keys()) if (!added.has(rowId) && !deleted.has(rowId)) changed.set(rowId, null);
    const token = submit(ctx, s, { changed, added: addedOrder.filter((id) => added.has(id)), deleted: [...deleted] }, c);
    if (typeof token === 'string') return token;
    if (token === null) return next(ctx, s, c);
    if (token.items.length > LIST_LIMIT) c.cells.length = LIST_LIMIT + 1;
    return next(ctx, s, c);
  };

  const cancelBatch = (ctx: ModuleContext<Row>, state: EditState, c: Collector): EditState => {
    for (const [rowId, map] of [...drafts]) {
      for (const [columnId, d] of [...map]) {
        if (d.pending) continue;
        setDraft(rowId, columnId, null);
        touch(c, rowId, columnId);
      }
      c.rows.add(rowId);
    }
    for (const id of [...added.keys()]) {
      removeAdded(id);
      c.rows.add(id);
    }
    for (const id of deleted) c.rows.add(id);
    deleted.clear();
    rowErrors.clear();
    rowChecks.clear();
    sessionBackup = null;
    dropDraftHistory();
    return next(ctx, state, c, { active: null });
  };

  /** runs every rule over the pending changes and publishes the errors; writes nothing. */
  const validateBatch = (ctx: ModuleContext<Row>, state: EditState, c: Collector): EditState | string => {
    let ok = true;
    const cells: CellRef[] = [];
    const rows: RowId[] = [];
    // Custom rules run on cells whose built-in rules pass (their result would hide the built-in errors).
    const pushCustom = (rowId: RowId, columnId: ColumnId): void => {
      const d = draftOf(rowId, columnId);
      if (d && d.errors.length && d.external.length === 0 && d.asyncError === null) return;
      cells.push({ rowId, columnId });
    };
    for (const rowId of addedOrder) {
      if (!added.has(rowId)) continue;
      const columns = editableColumns(ctx, state, rowId);
      if (!validateCells(ctx, rowId, columns, c)) ok = false;
      for (const columnId of columns) pushCustom(rowId, columnId);
      rows.push(rowId);
    }
    for (const [rowId, map] of [...drafts]) {
      if (added.has(rowId) || deleted.has(rowId)) continue;
      const dirtyIds: ColumnId[] = [];
      for (const [columnId, d] of map) if (d.dirty) dirtyIds.push(columnId);
      if (dirtyIds.length === 0) continue;
      if (!validateCells(ctx, rowId, dirtyIds, c)) ok = false;
      for (const columnId of dirtyIds) pushCustom(rowId, columnId);
      rows.push(rowId);
    }
    const r = runCustom(ctx, cells, rows, c);
    if (!r.done) return 'validating';
    if (!ok || !r.ok) return 'invalid';
    return next(ctx, state, c);
  };

  // --- module --------------------------------------------------------------

  const methods: EditMethods<Row> = {
    getDraft(_ctx, rowId, columnId) {
      const d = draftOf(rowId, columnId);
      return d ? viewOf(rowId, columnId, d) : undefined;
    },
    cellFlags(ctx, rowId, columnId) {
      const state = ctx.getModuleState<EditState>('edit') as EditState;
      let bits = 0;
      const active = state.active;
      if (active && active.rowId === rowId) {
        const mode = state.options.mode;
        if (mode === 'batch' || mode === 'cell') {
          if (active.columnId === columnId) bits |= EDIT_EDITING;
        } else {
          bits |= EDIT_ROW_EDITING;
          if (mode === 'row' && editable(ctx, state, rowId, columnId)) bits |= EDIT_EDITING;
        }
      } else if (rowId === blankId) {
        // The add row always shows its editors; disabled while another row edits.
        bits |= EDIT_ROW_EDITING;
        if (editable(ctx, state, rowId, columnId)) bits |= EDIT_EDITING;
        if (active) bits |= EDIT_LOCKED;
      }
      if (added.size && added.has(rowId)) bits |= EDIT_NEW;
      if (deleted.size && deleted.has(rowId)) bits |= EDIT_DELETED;
      if (drafts.size === 0) return bits;
      const d = drafts.get(rowId)?.get(columnId);
      if (d) {
        if (d.dirty) bits |= EDIT_DIRTY;
        if (d.errors.length) bits |= EDIT_INVALID;
        if (d.pending) bits |= EDIT_PENDING;
      }
      return bits;
    },
    rowFlags(ctx, rowId) {
      const state = ctx.getModuleState<EditState>('edit') as EditState;
      let bits = 0;
      if (state.active?.rowId === rowId && (state.options.mode === 'row' || state.options.mode === 'dialog')) bits |= EDIT_ROW_EDITING;
      else if (rowId === blankId) bits |= state.active ? EDIT_ROW_EDITING | EDIT_LOCKED : EDIT_ROW_EDITING;
      if (added.size && added.has(rowId)) bits |= EDIT_NEW;
      if (deleted.size && deleted.has(rowId)) bits |= EDIT_DELETED;
      const map = drafts.get(rowId);
      if (map) for (const d of map.values()) {
        if (d.dirty) bits |= EDIT_DIRTY;
        if (d.errors.length) bits |= EDIT_INVALID;
      }
      if (rowErrors.has(rowId)) bits |= EDIT_INVALID;
      return bits;
    },
    getValue: (ctx, rowId, columnId) => valueOf(ctx, rowId, columnId),
    getDisplay(ctx, rowId, columnId) {
      const d = draftOf(rowId, columnId);
      if (!d && !added.has(rowId)) return undefined;
      if (d?.display) return d.display;
      let byRow = displayCache.get(rowId);
      const cached = byRow?.get(columnId);
      if (cached) return cached;
      const column = columnOf(ctx, columnId);
      const row = baseRow(ctx, rowId);
      if (!column || row === undefined) return undefined;
      const value = d ? d.value : rawOf(column, row);
      let formattedValue: string;
      if (column.lookup) {
        // A lookup draft holds the key: show its display value (the key text when unknown).
        const shown = column.lookup.display(value);
        formattedValue = shown === null || shown === undefined ? (value === null || value === undefined ? '' : String(value)) : column.formatter(shown, row);
      } else formattedValue = value === undefined ? '' : column.formatter(value, row);
      const display: EditDisplay = Object.freeze({ value, formattedValue });
      if (d) d.display = display;
      if (!byRow) {
        byRow = new Map();
        displayCache.set(rowId, byRow);
      }
      byRow.set(columnId, display);
      return display;
    },
    getEditedRow: (ctx, rowId) => editedRow(ctx, rowId),
    getErrors: (_ctx, rowId, columnId) => draftOf(rowId, columnId)?.errors ?? NO_ERRORS,
    getRowErrors: (_ctx, rowId) => rowErrors.get(rowId) ?? NO_ERRORS,
    isCellEditable: (ctx, rowId, columnId) => editable(ctx, ctx.getModuleState<EditState>('edit') as EditState, rowId, columnId),
    getAddedRowPosition: (ctx, rowId) => {
      if (!added.has(rowId)) return undefined;
      const fallback = (ctx.getModuleState<EditState>('edit') as EditState).options.newRowPosition;
      return addedEdge.get(rowId) ?? fallback;
    },
    getEditableColumnIds: (ctx, rowId) => Object.freeze(editableColumns(ctx, ctx.getModuleState<EditState>('edit') as EditState, rowId)),
    nextEditableCell(ctx, rowId, columnId, direction) {
      const state = ctx.getModuleState<EditState>('edit') as EditState;
      const visible = ctx.getColumns().visible;
      const rowAt = (id: RowId, step: 1 | -1): RowId | null => {
        // Added rows (band) first, then the visible rows.
        const list = state.addedRowIds;
        const ai = list.indexOf(id);
        if (ai >= 0) {
          const n = list[ai + step];
          if (n !== undefined) return n;
          if (step === -1) return null;
          const first = ctx.getRowIdAt(0);
          return first ?? null;
        }
        let index = ctx.getRowIndex(id);
        if (index < 0) return null;
        for (;;) {
          index += step;
          const nid = ctx.getRowIdAt(index);
          if (nid === undefined) return null;
          if (!isSynthetic(nid)) return nid;
        }
      };
      if (direction === 'down' || direction === 'up') {
        let r: RowId | null = rowId;
        for (let guard = 0; guard < 1000; guard++) {
          r = rowAt(r, direction === 'down' ? 1 : -1);
          if (r === null) return null;
          if (editable(ctx, state, r, columnId) && !covered(ctx, r, columnId)) return { rowId: r, columnId };
        }
        return null;
      }
      const step = direction === 'next' ? 1 : -1;
      let c = visibleColumnIndex(ctx.getColumns(), columnId);
      let r: RowId | null = rowId;
      for (let guard = 0; guard < visible.length * 2 + 2000; guard++) {
        c += step;
        if (c < 0 || c >= visible.length) {
          if (!state.options.tabToNextRow) return null;
          r = rowAt(r as RowId, step);
          if (r === null) return null;
          c = step === 1 ? 0 : visible.length - 1;
        }
        const id = (visible[c] as CompiledColumn<Row>).columnId;
        if (editable(ctx, state, r as RowId, id) && !covered(ctx, r as RowId, id)) return { rowId: r as RowId, columnId: id };
      }
      return null;
    },
    isRequired(ctx, rowId, columnId) {
      const column = columnOf(ctx, columnId);
      return column ? validatorOf(column, added.has(rowId)).required : false;
    },
    getBatchChanges(ctx) {
      const addedRecords: Row[] = [];
      for (const id of addedOrder) {
        const r = editedRow(ctx, id);
        if (r !== undefined && added.has(id)) addedRecords.push(r);
      }
      const changedRecords: Row[] = [];
      for (const [rowId, map] of drafts) {
        if (added.has(rowId) || deleted.has(rowId)) continue;
        let dirty = false;
        for (const d of map.values()) if (d.dirty) dirty = true;
        const base = ctx.getRow(rowId);
        if (dirty && base !== undefined) changedRecords.push(applyDrafts(ctx, base, map));
      }
      const deletedRecords: Row[] = [];
      for (const id of deleted) {
        const r = ctx.getRow(id);
        if (r !== undefined) deletedRecords.push(r);
      }
      return Object.freeze({ addedRecords: Object.freeze(addedRecords), changedRecords: Object.freeze(changedRecords), deletedRecords: Object.freeze(deletedRecords) });
    },
    getBatchPreview(_ctx) {
      const cells: EditPreviewCell[] = [];
      let invalid = 0;
      for (const [rowId, map] of drafts) {
        if (deleted.has(rowId)) continue;
        for (const [columnId, d] of map) {
          if (!d.dirty && !added.has(rowId)) continue;
          if (d.errors.length) invalid++;
          cells.push({ rowId, columnId, previous: d.initial, value: d.value, errors: d.errors });
        }
      }
      return Object.freeze({ cells: Object.freeze(cells), addedRowIds: addedList, deletedRowIds: deletedList, dirtyCellCount: dirtyCount, invalidCellCount: invalid });
    },
    previewWrite(ctx, scope) {
      const state = ctx.getModuleState<EditState>('edit') as EditState;
      const changed: { rowId: RowId; columnIds: readonly ColumnId[] }[] = [];
      const pick = (rowId: RowId, only: ColumnId | null): void => {
        const map = drafts.get(rowId);
        if (!map || added.has(rowId) || deleted.has(rowId)) return;
        const ids: ColumnId[] = [];
        for (const [id, d] of map) if (d.dirty && (only === null || id === only)) ids.push(id);
        if (ids.length) changed.push({ rowId, columnIds: Object.freeze(ids) });
      };
      if (scope === 'active') {
        const a = state.active;
        if (!a) return { added: EMPTY_IDS, changed, deleted: EMPTY_IDS };
        // An untouched always-visible add row writes nothing.
        if (a.isNew) return a.rowId === blankId && blankUntouched() ? { added: EMPTY_IDS, changed, deleted: EMPTY_IDS } : { added: Object.freeze([a.rowId]), changed, deleted: EMPTY_IDS };
        pick(a.rowId, state.options.mode === 'cell' ? a.columnId : null);
        return { added: EMPTY_IDS, changed, deleted: EMPTY_IDS };
      }
      for (const rowId of drafts.keys()) pick(rowId, null);
      return { added: addedList, changed, deleted: deletedList };
    },
    hasUnsavedChanges: () => dirtyCount > 0 || added.size > (blankId !== null && added.has(blankId) ? 1 : 0) || deleted.size > 0,
    getSnapshot(ctx) {
      const state = ctx.getModuleState<EditState>('edit') as EditState;
      const cellErrors: Record<string, readonly string[]> = {};
      const changedRows: RowId[] = [];
      for (const [rowId, map] of drafts) {
        let dirty = false;
        for (const [columnId, d] of map) {
          if (d.errors.length) cellErrors[`${rowId}:${columnId}`] = d.errors;
          if (d.dirty) dirty = true;
        }
        if (dirty && !added.has(rowId)) changedRows.push(rowId);
      }
      const active = state.active;
      const mode = state.options.mode;
      return Object.freeze({
        activeRowId: active?.rowId ?? null,
        activeCell: active && active.columnId !== null && (mode === 'batch' || mode === 'cell') ? { rowId: active.rowId, columnId: active.columnId } : null,
        addedRows: addedList,
        deletedRows: deletedList,
        changedRows: Object.freeze(changedRows),
        dirtyCellCount: dirtyCount,
        cellErrors: Object.freeze(cellErrors),
        rowErrors: Object.freeze(Object.fromEntries(rowErrors)),
        status: state.status,
      });
    },
    async whenSettled() {
      // Awaits the actual promises (no polling): async runs resolve after their
      // replay ran, write tokens after their settle command. A promise seen
      // once is not awaited again, so a token that can never settle (a
      // disposed engine) ends the wait instead of spinning.
      const seen = new Set<Promise<unknown>>();
      for (;;) {
        const waits: Promise<unknown>[] = [];
        for (const p of asyncRuns) if (!seen.has(p)) waits.push(p);
        for (const t of tokens.values()) if (t.done !== null && !seen.has(t.done)) waits.push(t.done);
        if (waits.length === 0) return;
        for (const p of waits) seen.add(p);
        await Promise.allSettled(waits);
      }
    },
    getLastWrite: () => lastWrite,
    getSubmittedWrite: () => submittedWrite,
  };
  // Reads see the add row before any command built it: one comparison per call,
  // fixed arity (no rest array on the per-cell `cellFlags` path; no method takes more than three arguments).
  type Read = (ctx: ModuleContext<Row>, a?: unknown, b?: unknown, c?: unknown) => unknown;
  const reads = methods as unknown as Record<string, Read>;
  for (const name of Object.keys(reads)) {
    const read = reads[name] as Read;
    reads[name] = (ctx, a, b, c) => {
      if (blankId !== null && !added.has(blankId)) ensureBlank(ctx);
      return read(ctx, a, b, c);
    };
  }

  return defineDataGridModule<Row, EditState, EditCommand, 'edit', EditMethods<Row>>({
    name: 'edit',
    inSnapshot: false,
    commands: EDIT_COMMANDS,
    methods,
    initialState(options: DataGridOptions<Row>): EditState {
      userOptions = (options['edit'] ?? {}) as EditOptions<Row>;
      messageOverrides = userOptions.messages ?? {};
      messages = mergeMessages(messageOverrides);
      getRowId = options.getRowId;
      spans = spanResolverOf(options);
      const state = createInitialEditState(options);
      undoLimit = state.options.undoLimit;
      blankSeq = 1;
      blankId = state.newRowId;
      return state;
    },
    reduce(state, command, ctx) {
      ensureBlank(ctx);
      const c = collector();
      let bulk: EditState['lastBulk'] | undefined;
      recordWrites = state.options.undo;
      // Batch mode records draft changes per user action.
      const capture = state.options.undo && state.options.mode === 'batch' && DRAFT_HISTORY_COMMANDS.has(command.type);
      if (capture) {
        if (DISCRETE_COMMANDS.has(command.type)) flushHistory(ctx);
        capCtx = ctx;
      }
      let result: EditState | string | CommandRejection;
      try {
        result = run();
      } finally {
        capCtx = null;
      }
      if (capture) {
        // The action ends when no editor stays open, or the editor moved to another cell.
        const before = state.active;
        const after = typeof result === 'object' && result !== null && 'active' in result ? result.active : before;
        if (after === null || DISCRETE_COMMANDS.has(command.type) || (before !== null && (before.rowId !== after.rowId || before.columnId !== after.columnId))) {
          flushHistory(ctx);
          if (typeof result === 'object' && result !== null && 'active' in result && (result.canUndo !== undoStack.length > 0 || result.canRedo !== redoStack.length > 0)) {
            result = Object.freeze({ ...result, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0 });
          }
        }
      }
      if (typeof result === 'string') {
        if (result === 'validating') {
          // The state published below keeps `state.active`; replay is bound to that row.
          // validateBatch is not replayed: `validateBatch()` re-runs it on the cached results.
          if (command.type !== 'edit.validateBatch') queued = { command, activeRowId: state.active?.rowId ?? null };
          // Show the validating status and any errors found so far; the caller learns the command waits.
          return ctx.reject('validating', next(ctx, state, c, bulk ? { status: 'validating', lastBulk: bulk } : { status: 'validating' }));
        }
        // Rejected; validation results that changed (errors to show) are still published.
        if (c.cells.length || c.rows.size) return ctx.reject(result, next(ctx, state, c));
        return ctx.reject(result);
      }
      return result;

      function run(): EditState | string | CommandRejection {
        switch (command.type) {
          case 'edit.start': {
            if (typeof command.rowId !== 'string') return 'invalidCommand';
            const columnId = typeof command.columnId === 'string' ? command.columnId : undefined;
            // A cell covered by a span edits the span's anchor cell.
            const anchor = columnId === undefined ? null : spanAnchorOf(ctx, spans, command.rowId, columnId);
            return anchor ? start(ctx, state, anchor.rowId, anchor.columnId, c) : start(ctx, state, command.rowId, columnId, c);
          }
          case 'edit.setValue': {
            const { rowId, columnId } = command;
            if (!editable(ctx, state, rowId, columnId)) return 'notEditable';
            writeValue(ctx, rowId, columnOf(ctx, columnId) as CompiledColumn<Row>, command.value, c);
            return next(ctx, state, c);
          }
          case 'edit.setValues': {
            if (!Array.isArray(command.cells)) return 'invalidCommand';
            const touchedRows = new Map<RowId, ColumnId[]>();
            let applied = 0;
            for (const cell of command.cells) {
              if (!editable(ctx, state, cell.rowId, cell.columnId)) continue;
              // `from` (autofill) reads the source's current value, drafts included.
              const input = cell.from ? toEditInput(valueOf(ctx, cell.from.rowId, cell.from.columnId)) : (cell.value ?? null);
              writeValue(ctx, cell.rowId, columnOf(ctx, cell.columnId) as CompiledColumn<Row>, input, c);
              let list = touchedRows.get(cell.rowId);
              if (!list) {
                list = [];
                touchedRows.set(cell.rowId, list);
              }
              list.push(cell.columnId);
              applied++;
            }
            const lastBulk = Object.freeze({ requested: command.cells.length, applied });
            if (applied === 0) return ctx.reject('notEditable', next(ctx, state, c, { lastBulk }));
            if (command.cells.length > LIST_LIMIT) c.cells.length = LIST_LIMIT + 1;
            if (command.commit && state.options.mode !== 'batch') {
              const hasErrors = (rowId: RowId, cols: readonly ColumnId[]): boolean => cols.some((id) => (draftOf(rowId, id)?.errors.length ?? 0) > 0);
              const changed = new Map<RowId, readonly ColumnId[] | null>();
              const checkCells: CellRef[] = [];
              for (const [rowId, cols] of touchedRows) {
                if (added.has(rowId) || hasErrors(rowId, cols)) continue;
                changed.set(rowId, cols);
                for (const columnId of cols) checkCells.push({ rowId, columnId });
              }
              if (changed.size) {
                // Custom validators and `validateRow` gate the write like a commit does.
                const r = runCustom(ctx, checkCells, [...changed.keys()], c);
                if (!r.done) {
                  bulk = lastBulk;
                  return 'validating';
                }
                for (const [rowId, cols] of [...changed]) {
                  if (hasErrors(rowId, cols as ColumnId[]) || (rowErrors.get(rowId)?.length ?? 0) > 0) changed.delete(rowId);
                }
              }
              const token = submit(ctx, state, { changed, added: [], deleted: [] }, c);
              if (typeof token === 'string') return token;
            }
            return next(ctx, state, c, { lastBulk });
          }
          case 'edit.commit': {
            if (!state.active) return 'notEditing';
            const mode = state.options.mode;
            return mode === 'batch' || mode === 'cell' ? closeCell(ctx, state, c) : commitRow(ctx, state, c);
          }
          case 'edit.cancel':
            return cancel(ctx, state, c);
          case 'edit.commitAndMove': {
            const active = state.active;
            if (!active) return 'notEditing';
            const dir = command.direction;
            if (dir !== 'next' && dir !== 'previous' && dir !== 'down' && dir !== 'up') return 'invalidDirection';
            const mode = state.options.mode;
            const from = active.columnId ?? (editableColumns(ctx, state, active.rowId)[0] as ColumnId);
            if (mode === 'row' || mode === 'dialog') {
              // Row modes: Tab past the last editable cell commits and edits the next row.
              const target = methods.nextEditableCell(ctx, active.rowId, from, dir);
              if (target && target.rowId === active.rowId) return next(ctx, state, c, { active: Object.freeze({ ...active, columnId: target.columnId }) });
              const committed = commitRow(ctx, state, c);
              if (typeof committed === 'string') return committed;
              if (!target || (dir !== 'down' && dir !== 'up' && !state.options.tabToNextRow)) return committed;
              const r = start(ctx, committed, target.rowId, target.columnId, c);
              return typeof r === 'string' ? committed : r;
            }
            const target = methods.nextEditableCell(ctx, active.rowId, from, dir);
            const closed = closeCell(ctx, state, c);
            if (typeof closed === 'string') return closed;
            if (!target) return closed;
            const r = start(ctx, closed, target.rowId, target.columnId, c);
            return typeof r === 'string' ? closed : r;
          }
          case 'edit.addRecord':
            return addRecord(
              ctx,
              state,
              command.values,
              command.position === 'bottom' || command.position === 'top' || command.position === 'above' || command.position === 'below' || command.position === 'child' ? command.position : undefined,
              c,
              typeof command.relativeTo === 'string' ? command.relativeTo : undefined,
            );
          case 'edit.deleteRecords':
            if (!Array.isArray(command.rowIds)) return 'invalidCommand';
            return deleteRecords(ctx, state, command.rowIds, c);
          case 'edit.restoreRecords': {
            if (!Array.isArray(command.rowIds)) return 'invalidCommand';
            let any = false;
            for (const id of command.rowIds) if (deleted.has(id)) {
              if (capCtx !== null) captureDeleted(id);
              deleted.delete(id);
              any = true;
              c.rows.add(id);
            }
            return any ? next(ctx, state, c) : state;
          }
          case 'edit.updateRow':
          case 'edit.updateCell': {
            const rowId = command.rowId;
            const values: Record<string, Json> = command.type === 'edit.updateRow' ? { ...(command.values as Record<string, Json>) } : { [command.columnId]: command.value };
            if (typeof rowId !== 'string') return 'invalidCommand';
            if (baseRow(ctx, rowId) === undefined) return 'unknownRow';
            const cols: ColumnId[] = [];
            for (const [columnId, input] of Object.entries(values)) {
              // Same gates as interactive editing (enabled, edit, read-only columns, isCellEditable).
              if (!editable(ctx, state, rowId, columnId)) continue;
              writeValue(ctx, rowId, columnOf(ctx, columnId) as CompiledColumn<Row>, input, c);
              cols.push(columnId);
            }
            if (cols.length === 0) return 'notEditable';
            if (cols.some((id) => (draftOf(rowId, id)?.errors.length ?? 0) > 0)) return 'invalid';
            if (state.options.mode === 'batch' && command.type === 'edit.updateCell') return next(ctx, state, c);
            if (!added.has(rowId)) {
              const r = runCustom(ctx, cols.map((columnId) => ({ rowId, columnId })), [rowId], c);
              if (!r.done) return 'validating';
              if (!r.ok) return 'invalid';
              const token = submit(ctx, state, { changed: new Map([[rowId, cols]]), added: [], deleted: [] }, c);
              if (typeof token === 'string') return token;
            }
            return next(ctx, state, c);
          }
          case 'edit.saveBatch':
            return saveBatch(ctx, state, c);
          case 'edit.cancelBatch':
            return cancelBatch(ctx, state, c);
          case 'edit.setOptions': {
            if (typeof command.options !== 'object' || command.options === null) return 'invalidOptions';
            const incoming = command.options.messages;
            if (incoming !== undefined && incoming !== null && typeof incoming === 'object') {
              const keys = new Set([...Object.keys(incoming), ...Object.keys(messageOverrides)]);
              const differs = [...keys].some((k) => (incoming as Record<string, unknown>)[k] !== (messageOverrides as Record<string, unknown>)[k]);
              if (differs) {
                messageOverrides = { ...(incoming as Partial<EditMessageTable>) };
                messages = mergeMessages(messageOverrides);
                // Rules recompile with the new texts on their next run.
                validators = new WeakMap();
              }
            }
            const options = resolveOptions(command.options as EditOptions, state.options);
            const same = (Object.keys(options) as (keyof ResolvedEditOptions)[]).every((k) => options[k] === state.options[k]);
            if (same) return state;
            let s = state;
            if (options.mode !== state.options.mode && s.active) {
              const r = cancel(ctx, s, c);
              if (typeof r !== 'string') s = r;
            }
            if (showsNewRow(options) !== (blankId !== null)) {
              // `showNewRow` (or what it depends on) changed: show or drop the add row.
              if (s.active?.rowId === blankId) {
                const r = cancel(ctx, s, c);
                if (typeof r !== 'string') s = r;
              }
              if (blankId !== null) {
                resetBlank(c, false);
                blankId = null;
              } else {
                blankId = `${BLANK_ROW_ID_PREFIX}${blankSeq}`;
                c.rows.add(blankId);
              }
            }
            undoLimit = options.undoLimit;
            if (!options.undo || options.mode !== state.options.mode) clearHistory();
            else {
              if (undoStack.length > undoLimit) undoStack.splice(0, undoStack.length - undoLimit);
              if (redoStack.length > undoLimit) redoStack.splice(0, redoStack.length - undoLimit);
            }
            return next(ctx, s, c, { options });
          }
          case 'edit.validateBatch':
            return validateBatch(ctx, state, c);
          case 'edit.undo':
          case 'edit.redo': {
            const undo = command.type === 'edit.undo';
            if (!state.options.undo) return 'undoDisabled';
            if (state.active) return 'editing';
            const from = undo ? undoStack : redoStack;
            const entry = from[from.length - 1];
            if (entry === undefined) return undo ? 'nothingToUndo' : 'nothingToRedo';
            if (entry.kind === 'drafts') applyDraftEntry(entry, undo, c);
            else {
              // The undo or redo write is not a new action: it records nothing.
              recordWrites = false;
              const failed = applyWriteEntry(ctx, state, entry, undo, c);
              if (failed !== null) return failed;
            }
            from.pop();
            (undo ? redoStack : undoStack).push(entry);
            return next(ctx, state, c);
          }
          case 'edit.settle': {
            const token = tokens.get(command.token);
            if (token) return settleWrite(ctx, state, token, c);
            if (pendingAsync.delete(command.token)) {
              const info = pendingCells.get(command.token);
              pendingCells.delete(command.token);
              for (const cell of info?.cells ?? []) touch(c, cell.rowId, cell.columnId);
              for (const id of info?.rows ?? []) c.rows.add(id);
              return next(ctx, state, c);
            }
            return state;
          }
          default:
            return state;
        }
      }
    },
    notify(previous, next): NotificationScope {
      if (previous.version === next.version) return {};
      const change = next.change;
      if (change.all) return { allRows: true };
      const rows = [...change.rows];
      if (previous.active && previous.active !== next.active) rows.push(previous.active.rowId);
      if (next.active && previous.active !== next.active) rows.push(next.active.rowId);
      // The add row locks and unlocks with the active row.
      if (next.newRowId !== null && (previous.active?.rowId ?? null) !== (next.active?.rowId ?? null)) rows.push(next.newRowId);
      if (previous.options.mode !== next.options.mode) return { allRows: true };
      return { rows, cells: change.cells };
    },
  });
}

// ---------------------------------------------------------------------------
// Imperative façade
// ---------------------------------------------------------------------------

type EditFacade<Row> = { readonly edit?: { [K in keyof EditMethods<Row>]: EditMethods<Row>[K] extends (ctx: any, ...args: infer A) => infer R ? (...args: A) => R : never } };

/** Converts a value to a command input: Dates become ISO strings, other non-JSON values are stringified. */
export function toEditInput(value: unknown): Json {
  if (value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  try {
    return JSON.parse(JSON.stringify(value)) as Json;
  } catch {
    return String(value);
  }
}

/** Rows to apply with `applyChanges()`. */
export interface EditDataChanges<Row> {
  readonly added?: readonly Row[];
  /** Replacement rows, matched by row id. */
  readonly changed?: readonly Row[];
  readonly deleted?: readonly RowId[];
}

/**
 * Edit methods. Columns are named by `field` or column id (the column id
 * wins); value maps (`addRow`, `updateRow`) are keyed the same way.
 */
export interface EditApi<Row> {
  /** Row and dialog mode edit the row, batch and cell mode the cell (default: first editable). Without a row id, the first selected row. */
  startEdit(rowId?: RowId, field?: string): CommandResult;
  /** Saves the edit: commits the active row or cell; in batch mode saves every pending change. */
  save(): CommandResult;
  /** Commits the active editor only: the row in row and dialog mode, the cell in batch and cell mode (batch mode keeps the change pending). */
  saveCell(): CommandResult;
  /** Discards the active editor; in batch mode without an open editor, every pending change. */
  cancelEdit(): CommandResult;
  /** Sets the draft of the active editor (or of any editable cell). */
  setEditValue(rowId: RowId, field: string, value: unknown): CommandResult;
  /**
   * Adds a row (and edits it). `index` 0 adds at the top, an index at or past
   * the end at the bottom; other positions are rejected (`unsupportedIndex`).
   * Without an index the row goes to `newRowPosition`.
   */
  addRow(row?: Readonly<Record<string, unknown>>, index?: number): CommandResult;
  /** Batch mode marks the rows; other modes write at once. Without ids, the selected rows. */
  deleteRows(rowIds?: RowId | readonly RowId[]): CommandResult;
  /** Validates and writes the values. */
  updateRow(rowId: RowId, row: Readonly<Record<string, unknown>>): CommandResult;
  /** Edits a cell as a user would: batch mode keeps a draft; other modes write at once. */
  updateCell(rowId: RowId, field: string, value: unknown): CommandResult;
  /** Silent data update of one cell (no edit lifecycle or validation). Local data sources only. */
  setCellValue(rowId: RowId, field: string, value: unknown): CommandResult;
  /** Silent replacement of a row (no edit lifecycle or validation). Local data sources only. */
  setRowData(rowId: RowId, row: Row): CommandResult;
  /** Silent bulk data update (no edit lifecycle or validation). Local data sources only. */
  applyChanges(changes: EditDataChanges<Row>): CommandResult;
  /** Added, changed, and deleted rows not saved yet. */
  getPendingChanges(): EditBatchChanges<Row>;
  getBatchPreview(): EditPreview | undefined;
  getEditSnapshot(): EditSnapshot | undefined;
  hasUnsavedChanges(): boolean;
  /** Resolves when pending writes and async validators settled. */
  whenEditSettled(): Promise<void>;
  /**
   * Validates every pending change without saving and publishes the
   * errors; resolves true when everything is valid once async validators settled.
   */
  validateBatch(): Promise<boolean>;
  /** Reverts the last edit action (needs `undo: true`). */
  undo(): CommandResult;
  /** Re-applies the last undone action. */
  redo(): CommandResult;
  canUndo(): boolean;
  canRedo(): boolean;
}

const EMPTY_CHANGES: EditBatchChanges<never> = Object.freeze({ addedRecords: Object.freeze([]), changedRecords: Object.freeze([]), deletedRecords: Object.freeze([]) });
const APPLIED: CommandResult = Object.freeze({ status: 'applied' });
const rejected = (reason: string): CommandResult => Object.freeze({ status: 'rejected', reason });

type SelectionFacade = { readonly selection?: { getSelectedRowIds(): readonly RowId[] } };
type PatchableSource<Row> = { readonly mode: string; patch?(patch: { append?: readonly Row[]; upsert?: readonly Row[]; remove?: readonly RowId[] }): void };

/** Edit methods over an engine with the `edit` module (spread into the DataGrid API). */
export function createEditApi<Row>(engine: DataGridEngine<Row>): EditApi<Row> {
  const facade = () => (engine as unknown as EditFacade<Row>).edit;
  const idOf = (fieldOrId: string): ColumnId => {
    const columns = engine.getSnapshot().columns;
    if (columns.byId.get(fieldOrId)?.leaf) return fieldOrId;
    return columns.leaves.find((c) => c.field === fieldOrId)?.columnId ?? fieldOrId;
  };
  const inputs = (values: Readonly<Record<string, unknown>>): Record<string, Json> => {
    const out: Record<string, Json> = {};
    for (const [k, v] of Object.entries(values)) out[idOf(k)] = toEditInput(v);
    return out;
  };
  const mode = (): EditMode | undefined => engine.getModuleState<EditState>('edit')?.options.mode;
  const selected = (): readonly RowId[] => (engine as unknown as SelectionFacade).selection?.getSelectedRowIds() ?? EMPTY_IDS;
  const patch = (run: (source: Required<PatchableSource<Row>>) => void): CommandResult => {
    const source = engine.getDataSource() as unknown as PatchableSource<Row>;
    if (source.mode !== 'local' || typeof source.patch !== 'function') return rejected('unsupportedSource');
    run(source as Required<PatchableSource<Row>>);
    return APPLIED;
  };
  const settled = (): Promise<void> => facade()?.whenSettled() ?? Promise.resolve();
  /** A command waiting on async validation is replayed when it settles: report it as async. */
  const later = (result: CommandResult): CommandResult =>
    result.status === 'rejected' && result.reason === 'validating' ? Object.freeze({ status: 'async', promise: settled() }) : result;
  const editState = () => engine.getModuleState<EditState>('edit');
  return Object.freeze({
    startEdit: (rowId, field) => {
      const id = rowId ?? selected()[0];
      if (id === undefined) return rejected('noRow');
      return later(engine.dispatch(field === undefined ? { type: 'edit.start', rowId: id } : { type: 'edit.start', rowId: id, columnId: idOf(field) }));
    },
    save: () => later(engine.dispatch(mode() === 'batch' ? { type: 'edit.saveBatch' } : { type: 'edit.commit' })),
    saveCell: () => later(engine.dispatch({ type: 'edit.commit' })),
    cancelEdit: () => {
      const state = engine.getModuleState<EditState>('edit');
      return engine.dispatch(state?.options.mode === 'batch' && !state.active ? { type: 'edit.cancelBatch' } : { type: 'edit.cancel' });
    },
    setEditValue: (rowId, field, value) => engine.dispatch({ type: 'edit.setValue', rowId, columnId: idOf(field), value: toEditInput(value) }),
    addRow: (row, index) => {
      const command: Record<string, Json> = { type: 'edit.addRecord' };
      if (row) command['values'] = inputs(row);
      if (index !== undefined) {
        if (index === 0) command['position'] = 'top';
        else if (index >= engine.getSnapshot().rows.count) command['position'] = 'bottom';
        else return rejected('unsupportedIndex');
      }
      return engine.dispatch(command as EditAddRecordCommand);
    },
    deleteRows: (rowIds) => {
      const ids = rowIds === undefined ? selected() : typeof rowIds === 'string' ? [rowIds] : rowIds;
      if (ids.length === 0) return rejected('noRow');
      return engine.dispatch({ type: 'edit.deleteRecords', rowIds: [...ids] });
    },
    updateRow: (rowId, row) => later(engine.dispatch({ type: 'edit.updateRow', rowId, values: inputs(row) })),
    updateCell: (rowId, field, value) => later(engine.dispatch({ type: 'edit.updateCell', rowId, columnId: idOf(field), value: toEditInput(value) })),
    setCellValue: (rowId, field, value) => {
      const row = engine.getRow(rowId);
      const column = engine.getSnapshot().columns.byId.get(idOf(field));
      if (row === undefined) return rejected('unknownRow');
      if (!column?.setter) return rejected('readOnlyColumn');
      const setter = column.setter;
      return patch((source) => source.patch({ upsert: [setter(row, value)] }));
    },
    setRowData: (rowId, row) => (engine.getRow(rowId) === undefined ? rejected('unknownRow') : patch((source) => source.patch({ upsert: [row] }))),
    applyChanges: (changes) =>
      patch((source) => {
        const p: { append?: readonly Row[]; upsert?: readonly Row[]; remove?: readonly RowId[] } = {};
        if (changes.added?.length) p.append = changes.added;
        if (changes.changed?.length) p.upsert = changes.changed;
        if (changes.deleted?.length) p.remove = changes.deleted;
        source.patch(p);
      }),
    getPendingChanges: () => facade()?.getBatchChanges() ?? (EMPTY_CHANGES as EditBatchChanges<Row>),
    getBatchPreview: () => facade()?.getBatchPreview(),
    getEditSnapshot: () => facade()?.getSnapshot(),
    hasUnsavedChanges: () => facade()?.hasUnsavedChanges() ?? false,
    whenEditSettled: settled,
    validateBatch: async () => {
      if (!editState()) return true;
      let result = engine.dispatch({ type: 'edit.validateBatch' });
      // Async results are cached per value, so each round settles more of them.
      while (result.status === 'rejected' && result.reason === 'validating') {
        await settled();
        result = engine.dispatch({ type: 'edit.validateBatch' });
      }
      return result.status === 'applied';
    },
    undo: () => engine.dispatch({ type: 'edit.undo' }),
    redo: () => engine.dispatch({ type: 'edit.redo' }),
    canUndo: () => editState()?.canUndo ?? false,
    canRedo: () => editState()?.canRedo ?? false,
  } satisfies EditApi<Row>);
}
