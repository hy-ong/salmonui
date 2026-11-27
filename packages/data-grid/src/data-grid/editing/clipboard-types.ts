// Public types of the DataGrid clipboard and fill handle. The engine
// side is the core `clipboard` module (`@salmonui/data-grid/engine/clipboard`); the
// React side lives in the lazy editing chunk (`clipboard-ui.ts`,
// `fill-handle.ts`).

import type { CommandResult, RowId } from '@salmonui/data-grid/engine';
import type { DataGridEvent } from '@salmonui/core/internal/events';

/** A cell by row id and column id (`field`). */
export interface DataGridClipboardCell {
  readonly rowId: RowId;
  readonly field: string;
}

/** `copy(options)`. */
export interface DataGridCopyOptions {
  /** Prepend the header texts as the first TSV line (Ctrl+Shift+H). Default false. */
  readonly includeHeaders?: boolean;
  /**
   * `false` copies raw values instead of the display text (engine
   * `clipboard.copyFormatted`). `column.clipboardFormatter` always wins. Default true.
   */
  readonly copyFormatted?: boolean;
}

/** `onBeforeCopy`: `preventDefault()` cancels, assigning `data` replaces the text. */
export interface DataGridBeforeCopyEvent extends DataGridEvent {
  /** The TSV text about to be written to the clipboard. Assign to replace it. */
  data: string;
  readonly includeHeaders: boolean;
  /** What was copied: the cell range, the selected rows, or the focused cell. */
  readonly copied: 'range' | 'rows' | 'cell';
  /** Copied data cells (headers excluded). */
  readonly cells: number;
  readonly rowIds: readonly RowId[];
  readonly fields: readonly string[];
}

/** `onBeforePaste`: `preventDefault()` cancels, assigning `data` changes the pasted text. */
export interface DataGridBeforePasteEvent extends DataGridEvent {
  /** The clipboard text (TSV). Assign to change what is pasted. */
  data: string;
  /** Top-left target cell: the selected range's top-left cell, else the focused cell; null without a target. */
  readonly target: DataGridClipboardCell | null;
}

/** `onBeforeFill`: `preventDefault()` cancels the fill. */
export interface DataGridBeforeFillEvent extends DataGridEvent {
  /** The source range whose values are tiled. */
  readonly range: { readonly anchor: DataGridClipboardCell; readonly focus: DataGridClipboardCell };
  /** The cell the range is extended to. */
  readonly target: DataGridClipboardCell;
}

/** Clipboard and fill events of `DataGrid` (part of the editing props). */
export interface DataGridClipboardProps {
  onBeforeCopy?: (event: DataGridBeforeCopyEvent) => void;
  onBeforePaste?: (event: DataGridBeforePasteEvent) => void;
  onBeforeFill?: (event: DataGridBeforeFillEvent) => void;
}

/** Clipboard methods of the `DataGrid` instance. Need `editing` (it registers the clipboard module). */
export interface DataGridClipboardApi {
  /**
   * Copies the cell range, else the selected rows, else the focused cell to
   * the system clipboard (drafts included). Falls back to a copy dialog when
   * the browser blocks clipboard access. `rejected` with
   * `nothingToCopy` or `cancelled` (`onBeforeCopy`).
   */
  copy(options?: DataGridCopyOptions): CommandResult;
  /**
   * Pastes TSV `text` at the selected range or focused cell. Without `text`,
   * reads the system clipboard (`async`), or opens a paste dialog when the
   * Clipboard API is unavailable.
   */
  paste(text?: string): CommandResult;
}
