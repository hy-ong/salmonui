// Public types of `DataGrid` editing.
// `DataGridProps`, `DataGridColumn`, `DataGridApi`, and `DataGridLocaleText` extend the
// interfaces here; the engine side is the core `edit` module
// (`@salmonui/data-grid/engine/edit`).

import type {
  CommandResult,
  CompiledColumn,
  EditBatchChanges,
  EditCellContext,
  EditDataChanges,
  EditMode,
  EditPreview,
  EditSnapshot,
  RowId,
  RowValidator,
  ValidationMessages,
  WriteResult,
} from '@salmonui/data-grid/engine';
import type { CSSProperties, ReactNode } from 'react';
import type { DataGridColumnInfo } from '../feature-types.js';
import type { DataGridEvent } from '@salmonui/core/internal/events';
import type { DataGridClipboardApi, DataGridClipboardProps } from './clipboard-types.js';

/** Built-in editors; HTML input vocabulary. */
export type DataGridEditorType = 'text' | 'number' | 'select' | 'checkbox' | 'date' | 'datetime';

/** One option of the `select` editor (`editorProps.options`). */
export interface DataGridEditorOption {
  readonly value: unknown;
  readonly label: string;
}

/** Props of the built-in editors (column `editorProps`). Unknown keys are ignored. */
export interface DataGridEditorProps {
  /** `select`: options; values are primitives or `{ value, label }`. Lookup columns default to their local lookup rows. */
  readonly options?: readonly (string | number | boolean | DataGridEditorOption)[];
  /** `select`: label of an empty first option (clears the value). */
  readonly placeholder?: string;
  /**
   * `number`: the smallest and largest value: ArrowUp /
   * ArrowDown stop there, and a typed plain number outside the range is clamped when the editor
   * commits (Enter, Tab) or loses focus; also `aria-valuemin` / `aria-valuemax`.
   * `date` / `datetime`: the earliest and latest day the date picker offers (days outside are
   * disabled; typed text is not clamped). The `text` editor has no value range: use `minLength` /
   * `maxLength`.
   */
  readonly min?: string | number;
  readonly max?: string | number;
  /** `number`: the ArrowUp / ArrowDown increment (default 1). */
  readonly step?: string | number;
  /** `text`: native `minlength` / `maxlength` of the input or textarea. */
  readonly minLength?: number;
  readonly maxLength?: number;
  readonly autoComplete?: string;
  readonly spellCheck?: boolean;
  /** `text`: `<textarea>` instead of `<input>`. */
  readonly multiline?: boolean;
  /** `date` / `datetime`: first day of the calendar week, `0` Sunday ... `6` Saturday. Default: from `locale`. */
  readonly firstDayOfWeek?: number;
  /** `date` / `datetime`: `Intl` calendar of the picker labels (`'japanese'`, `'buddhist'`, `'islamic-umalqura'`, ...). Default: the `locale` calendar. */
  readonly calendar?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Custom editors read their own keys. */
  readonly [key: string]: unknown;
}

/** Attributes the editor element must carry (ids, ARIA wiring, keyboard). Spread onto the focusable input. */
export interface DataGridEditorInputProps {
  id: string;
  'aria-label': string;
  'aria-invalid': boolean | undefined;
  'aria-describedby': string | undefined;
  'aria-required': boolean | undefined;
  /** The editor that takes DOM focus when it mounts. */
  autoFocus: boolean;
  /** The always-visible add row while another row edits. */
  disabled?: boolean | undefined;
}

/** Context of column `renderEditor`. */
export interface DataGridEditorContext<Row> {
  /** The current draft value. */
  readonly value: unknown;
  /** Sets the draft (the column parser converts strings; dates as ISO strings or `Date`). */
  setValue(value: unknown): void;
  /** Commits like Enter (row: the row; batch and cell: the cell). */
  save(): void;
  cancel(): void;
  /** The row with its drafts applied. */
  readonly row: Row;
  readonly rowId: RowId;
  readonly field: string;
  readonly column: DataGridColumnInfo<Row>;
  readonly errors: readonly string[];
  readonly isNew: boolean;
  /** Where the editor renders. */
  readonly placement: 'cell' | 'dialog';
  readonly editorProps: DataGridEditorProps;
  /** Spread onto the focusable element: id, aria-invalid / aria-describedby / aria-required, autofocus. The editing keys are handled by the editor wrapper. */
  readonly inputProps: DataGridEditorInputProps;
}

/** One button of a command column. */
export interface DataGridCommandItem<Row = unknown> {
  readonly type: 'edit' | 'delete' | 'save' | 'cancel' | 'custom';
  /** Visible text. Default: the localized command name. */
  readonly label?: string;
  /** Icon content rendered before the label. */
  readonly icon?: ReactNode;
  /** `title` tooltip (also the accessible name when `label` is empty). */
  readonly title?: string;
  /** `custom` commands: called on click (after `onCommandClick`). */
  readonly onClick?: (ctx: { readonly rowId: RowId; readonly row: Row }) => void;
}

/** Editing fields of `DataGridColumn`. */
export interface DataGridEditColumn<Row> {
  /** Built-in editor. Default: from `type` (`number`, `boolean` -> `checkbox`, `date`, `datetime`, lookups -> `select`, else `text`). */
  readonly editor?: DataGridEditorType | (string & {});
  /** Props of the built-in editor. */
  readonly editorProps?: DataGridEditorProps;
  /** Custom editor. */
  readonly renderEditor?: (ctx: DataGridEditorContext<Row>) => ReactNode;
  /** Command column buttons. A column with `commands` is never edited itself. */
  readonly commands?: readonly DataGridCommandItem<Row>[];
}

/** One field of the dialog form (`editing.renderDialog`). */
export interface DataGridDialogField<Row> {
  readonly field: string;
  readonly column: DataGridColumnInfo<Row>;
  readonly label: string;
  readonly value: unknown;
  readonly errors: readonly string[];
  setValue(value: unknown): void;
  /** The built-in (or `renderEditor`) editor with its label and messages. */
  readonly editor: ReactNode;
}

/** Context of `editing.renderDialog`, `renderDialogHeader`, `renderDialogFooter`. */
export interface DataGridDialogContext<Row> {
  readonly row: Row;
  readonly rowId: RowId;
  readonly isNew: boolean;
  readonly fields: readonly DataGridDialogField<Row>[];
  /** Row-level errors (`validateRow`, server errors). */
  readonly errors: readonly string[];
  save(): void;
  cancel(): void;
}

/** Built-in dialog settings (`editing.dialogProps`). */
export interface DataGridDialogProps {
  /** Header text. Default: the localized add / edit title. */
  readonly title?: string;
  /** CSS width. Default 480px (capped by the viewport). */
  readonly width?: number | string;
  readonly className?: string;
  readonly style?: CSSProperties;
  /** Close button in the header. Default true. */
  readonly showCloseButton?: boolean;
}

/** Query actions the unsaved-changes guard intercepts. */
export type DataGridGuardedAction = 'sort' | 'filter' | 'search' | 'page' | 'group';

/** `editing` prop. */
export interface DataGridEditing<Row = unknown> {
  /** Existing rows can be edited. Default true. */
  readonly edit?: boolean;
  /** Rows can be added. Default true. */
  readonly add?: boolean;
  /** Rows can be deleted. Default true. */
  readonly delete?: boolean;
  /** `row` (inline row form), `dialog`, `batch`, or `cell` (Salmon: one-cell commits). Default `row`. Initial only. */
  readonly mode?: EditMode;
  /** Where added rows appear. Default `top`. Tree mode adds `above`, `below` and `child`, relative to the focused row. */
  readonly newRowPosition?: 'top' | 'bottom' | 'above' | 'below' | 'child';
  /**
   * An always-visible blank add row at `newRowPosition`. Enter (or Save) writes it and a fresh blank row
   * follows; Escape clears it; its editors are disabled while another row
   * edits. Row mode only. Default false.
   */
  readonly showNewRow?: boolean;
  /** Double click starts editing. Default true. */
  readonly editOnDoubleClick?: boolean;
  /**
   * Ask before saving a batch from the toolbar or a menu.
   * `api.save()`
   * never asks. Default true.
   */
  readonly confirmSave?: boolean;
  /** Ask before discarding unsaved batch changes (batch cancel, guarded actions). Default true. */
  readonly confirmDiscard?: boolean;
  /** Ask before deleting rows from the keyboard, toolbar, menus, or command buttons. Default false. */
  readonly confirmDelete?: boolean;
  /** Tab from the last editable cell continues in the next row. Default: true in batch and cell mode. */
  readonly tabToNextRow?: boolean;
  /** Undo and redo of edits (Mod+Z, Mod+Y). Default false. */
  readonly undo?: boolean;
  /** Undo history depth. Default 10. */
  readonly undoLimit?: number;
  /**
   * Spreadsheet fill handle: a square at the bottom-right of the
   * selected cell range; dragging it down, up, left or right tiles the range
   * over the extended range (`onBeforeFill`). Default false. Needs
   * `selection.mode` `cell` or `both`.
   */
  readonly fillHandle?: boolean;
  /**
   * Intercept query actions while there are unsaved changes:
   * `true` guards sorting, filtering, searching, paging, and grouping; a list
   * guards those actions only. The action runs after the changes are
   * discarded (with a `confirmDiscard` prompt). Also warns on page unload.
   * Default: true in batch mode.
   */
  readonly guardUnsaved?: boolean | readonly DataGridGuardedAction[];
  /** Extra per-cell edit policy. */
  readonly isCellEditable?: (ctx: EditCellContext<Row>) => boolean;
  /** Row-level validation before a row (or batch) saves; may be async. */
  readonly validateRow?: RowValidator<Row>;
  /** Values of an added row, merged over the columns' `defaultValue`. */
  readonly newRow?: () => Partial<Row>;
  /** Built-in dialog settings. */
  readonly dialogProps?: DataGridDialogProps;
  /** Replaces the dialog form body. */
  readonly renderDialog?: (ctx: DataGridDialogContext<Row>) => ReactNode;
  readonly renderDialogHeader?: (ctx: DataGridDialogContext<Row>) => ReactNode;
  readonly renderDialogFooter?: (ctx: DataGridDialogContext<Row>) => ReactNode;
}

/** `onBeforeEditStart` / `onEditStart`. */
export interface DataGridEditStartEvent<Row> extends DataGridEvent {
  readonly rowId: RowId;
  /** The row (the draft base for added rows). */
  readonly row: Row | undefined;
  /** The cell in batch and cell mode (and the focused editor in row mode); null otherwise. */
  readonly field: string | null;
  readonly mode: EditMode;
  readonly isNew: boolean;
}

/** `onBeforeCellValueChange` / `onCellValueChange`. */
export interface DataGridCellValueChangeEvent extends DataGridEvent {
  readonly rowId: RowId;
  readonly field: string;
  /** Editor input (before parsing) in the before-event; the parsed draft value after. */
  readonly value: unknown;
  readonly previousValue: unknown;
}

/** Outcome of a save: `pending` in `onBeforeSave`; in `onSave`, how the write settled. */
export type DataGridSaveStatus = 'pending' | 'applied' | 'partial' | 'rejected' | 'error';

/**
 * `onBeforeSave` (before the write is sent; cancellable) / `onSave` (after
 * the write settled). Lists are computed on first read.
 */
export interface DataGridSaveEvent<Row> extends DataGridEvent {
  readonly mode: EditMode;
  readonly added: readonly RowId[];
  readonly changed: readonly { readonly rowId: RowId; readonly fields: readonly string[] }[];
  readonly deleted: readonly RowId[];
  /** The rows with drafts applied (before-event); the rows written, with the source's echo where it sent one (after-event). */
  rows(): EditBatchChanges<Row>;
  /** `pending` before the write; `applied`, `partial` (some rows failed), `rejected`, or `error` (the write threw) after. */
  readonly status: DataGridSaveStatus;
  /** The data source's write result (after-event), else null. */
  readonly result: WriteResult<Row> | null;
  /** The error a failed write threw (status `error`), else null. */
  readonly error: Error | null;
  /** Rows the write did not apply (row or cell errors, conflicts, rejection); they keep their drafts. */
  readonly failedRowIds: readonly RowId[];
}

/** `onBeforeAdd` / `onAdd`. */
export interface DataGridAddEvent<Row> extends DataGridEvent {
  /** Initial values passed to `addRow` (by column id). */
  readonly row: Readonly<Record<string, unknown>> | undefined;
  readonly position: 'top' | 'bottom';
  /** Temporary id of the added row (after-event only). */
  readonly rowId: RowId | null;
  readonly isNew: true;
  /** Type witness. */
  readonly _row?: Row;
}

/** `onBeforeDelete` / `onDelete`. */
export interface DataGridDeleteEvent<Row> extends DataGridEvent {
  readonly rowIds: readonly RowId[];
  rows(): readonly Row[];
  /** Batch mode only marks the rows until save. */
  readonly mode: EditMode;
}

/** `onBeforeEditCancel` / `onEditCancel`. */
export interface DataGridEditCancelEvent extends DataGridEvent {
  readonly rowId: RowId | null;
  readonly field: string | null;
  /** `batch`: every pending change is discarded. */
  readonly scope: 'editor' | 'batch';
}

/** `onCommandClick`: `preventDefault()` cancels the built-in command. */
export interface DataGridCommandClickEvent<Row> extends DataGridEvent {
  readonly command: DataGridCommandItem<Row>;
  readonly rowId: RowId;
  readonly row: Row | undefined;
}

/** Editing props of `DataGrid`. */
export interface DataGridEditProps<Row> extends DataGridClipboardProps {
  /** Editing. `true` for the defaults (row mode). The module is registered when the initial value is set. */
  editing?: boolean | DataGridEditing<Row>;
  onBeforeEditStart?: (event: DataGridEditStartEvent<Row>) => void;
  onEditStart?: (event: DataGridEditStartEvent<Row>) => void;
  onBeforeCellValueChange?: (event: DataGridCellValueChangeEvent) => void;
  onCellValueChange?: (event: DataGridCellValueChangeEvent) => void;
  onBeforeSave?: (event: DataGridSaveEvent<Row>) => void;
  onSave?: (event: DataGridSaveEvent<Row>) => void;
  onBeforeAdd?: (event: DataGridAddEvent<Row>) => void;
  onAdd?: (event: DataGridAddEvent<Row>) => void;
  onBeforeDelete?: (event: DataGridDeleteEvent<Row>) => void;
  onDelete?: (event: DataGridDeleteEvent<Row>) => void;
  onBeforeEditCancel?: (event: DataGridEditCancelEvent) => void;
  onEditCancel?: (event: DataGridEditCancelEvent) => void;
  onCommandClick?: (event: DataGridCommandClickEvent<Row>) => void;
}

/** Editing methods of the `DataGrid` instance. */
export interface DataGridEditApi<Row> extends DataGridClipboardApi {
  /** Row and dialog mode edit the row, batch and cell mode the cell. Without a row id: the first selected row. */
  startEdit(rowId?: RowId, field?: string): CommandResult;
  /** Saves: the active row or cell; in batch mode every pending change. */
  save(): CommandResult;
  /** Commits the active editor only (batch mode keeps the change pending). */
  saveCell(): CommandResult;
  /** Discards the active editor; in batch mode without an open editor, every pending change. */
  cancelEdit(): CommandResult;
  /** Index 0 adds at the top, at or past the end at the bottom. */
  addRow(row?: Readonly<Record<string, unknown>>, index?: number): CommandResult;
  /** Without ids: the selected rows. Batch mode marks the rows until save. */
  deleteRows(rowIds?: RowId | readonly RowId[]): CommandResult;
  updateRow(rowId: RowId, row: Readonly<Record<string, unknown>>): CommandResult;
  /** Edits a cell as a user would (draft in batch mode). */
  updateCell(rowId: RowId, field: string, value: unknown): CommandResult;
  /** Silent data updates without the edit lifecycle (local sources). */
  setCellValue(rowId: RowId, field: string, value: unknown): CommandResult;
  setRowData(rowId: RowId, row: Row): CommandResult;
  applyChanges(changes: EditDataChanges<Row>): CommandResult;
  getPendingChanges(): EditBatchChanges<Row>;
  getBatchPreview(): EditPreview | undefined;
  getEditSnapshot(): EditSnapshot | undefined;
  hasUnsavedChanges(): boolean;
  whenEditSettled(): Promise<void>;
  /** Validates every pending change without saving; resolves true when valid. */
  validateBatch(): Promise<boolean>;
  /** Undoes the last edit (needs `editing.undo`). */
  undo(): CommandResult;
  redo(): CommandResult;
  /** Fills the selected cell range's content over the range extended to `field` of `rowId` (fill handle). */
  fillSelection(rowId: RowId, field: string): CommandResult;
}

