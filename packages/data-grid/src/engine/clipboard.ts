// Clipboard and autofill. Copy is a read-only method that serializes TSV from the cell
// range, else the selected rows, else the focused cell. Paste and fill are
// commands that turn text (or a source range) into edit drafts through
// `edit.setValues`, so read-only cells are skipped, values are parsed and
// validated by the edit module, and batch mode keeps them as drafts.
// Everything is id-based: ranges work across virtualized rows and columns.

import { defineDataGridModule } from './engine.js';
import { CLIPBOARD_COMMANDS, INITIAL_CLIPBOARD_STATE } from './edit-state.js';
import type { EditState } from './edit.js';
import { visibleColumnIndex } from './focus.js';
import { GROUP_FOOTER_ID_PREFIX, GROUP_ID_PREFIX } from './group-tree.js';
import type { CellKey, CellRange, SelectionState } from './selection.js';
import type { FocusState } from './focus.js';
import type { ColumnId, CommandResult, CompiledColumn, DataGridModule, DataGridOptions, Json, ModuleContext, RowId } from './types.js';

export interface ClipboardOptions {
  /** Copy formatted text (default) or raw values. `column.clipboardFormatter` always wins. */
  readonly copyFormatted?: boolean;
  /** Maximum cells in one copy (guards accidental copies of huge selections). Default 1,000,000. */
  readonly maxCells?: number;
}

export interface CopyOptions {
  readonly includeHeaders?: boolean;
  /** Formatted text or raw values for this copy; default the `clipboard.copyFormatted` option. `column.clipboardFormatter` always wins. */
  readonly copyFormatted?: boolean;
  /** Value of a cell (default: the engine value); the renderer passes draft values. */
  readonly getValue?: (rowId: RowId, columnId: ColumnId) => unknown;
}

export interface ClipboardCopy {
  readonly text: string;
  /** Copied cells (data cells, headers excluded). */
  readonly cells: number;
  readonly rows: readonly RowId[];
  readonly columns: readonly ColumnId[];
  readonly source: 'range' | 'rows' | 'cell' | 'none';
}

export interface PasteResult {
  /** Rows x columns of the parsed text. */
  readonly rows: number;
  readonly columns: number;
  /** Target cells that received a value (also while async validation of the write is pending). */
  readonly applied: number;
  /** Target cells skipped (read-only, outside the grid). */
  readonly skipped: number;
  /** True when the text was cut to fit the selected range or the grid edge. */
  readonly clipped: boolean;
  /** Top-left target cell and the covered range. */
  readonly target: CellRange | null;
}

/**
 * Cells an `edit.setValues` dispatch wrote. A write waiting on async
 * validation (`rejected: 'validating'`) has written its drafts and replays
 * once validation settles, so its cells count as applied too.
 */
function bulkApplied<Row>(result: CommandResult, ctx: ModuleContext<Row>, requested: number): number {
  const written = result.status === 'applied' || (result.status === 'rejected' && result.reason === 'validating');
  return written ? ((ctx.getModuleState<EditState>('edit') as EditState).lastBulk?.applied ?? requested) : 0;
}

export interface ClipboardState {
  readonly version: number;
  readonly lastPaste: PasteResult | null;
}

export type ClipboardPasteCommand = { type: 'clipboard.paste'; text: string };
/** Autofill: extends the current range (or `source`) to `target`, tiling the source values. */
export type ClipboardFillCommand = { type: 'clipboard.fill'; target: CellKey; source?: CellRange };
export type ClipboardCommand = ClipboardPasteCommand | ClipboardFillCommand;

export type ClipboardMethods<Row> = {
  copy(ctx: ModuleContext<Row>, options?: CopyOptions): ClipboardCopy;
  /** Parses TSV (quoted fields, CRLF) into rows of cells. */
  parse(ctx: ModuleContext<Row>, text: string): string[][];
};

export { CLIPBOARD_COMMANDS, INITIAL_CLIPBOARD_STATE } from './edit-state.js';

export type ClipboardModule<Row = unknown> = DataGridModule<Row, ClipboardState, ClipboardCommand, 'clipboard', ClipboardMethods<Row>>;

// ---------------------------------------------------------------------------
// TSV
// ---------------------------------------------------------------------------

const NEEDS_QUOTE = /[\t\n\r"]/;

function cellText(text: string): string {
  return NEEDS_QUOTE.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Spreadsheet TSV: tabs between cells, newlines between rows, quoted fields may hold tabs and newlines. */
export function parseTsv(text: string): string[][] {
  // Empty text has no cells (an empty copied cell is `''` plus a newline).
  if (text === '') return [];
  let end = text.length;
  // A single trailing newline (spreadsheets add one) does not start an empty row.
  if (text.endsWith('\r\n')) end -= 2;
  else if (text.endsWith('\n') || text.endsWith('\r')) end -= 1;
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  for (;;) {
    let value: string;
    if (i < end && text.charCodeAt(i) === 34 /* " */) {
      value = '';
      i++;
      for (;;) {
        const q = text.indexOf('"', i);
        if (q < 0 || q >= end) {
          value += text.slice(i, end);
          i = end;
          break;
        }
        value += text.slice(i, q);
        if (q + 1 < end && text.charCodeAt(q + 1) === 34) {
          value += '"';
          i = q + 2;
        } else {
          i = q + 1;
          break;
        }
      }
      // Text after a closing quote belongs to the field (lenient, like spreadsheets).
      while (i < end) {
        const ch = text.charCodeAt(i);
        if (ch === 9 || ch === 10 || ch === 13) break;
        value += text[i];
        i++;
      }
    } else {
      let j = i;
      while (j < end) {
        const ch = text.charCodeAt(j);
        if (ch === 9 || ch === 10 || ch === 13) break;
        j++;
      }
      value = text.slice(i, j);
      i = j;
    }
    row.push(value);
    if (i >= end) {
      rows.push(row);
      return rows;
    }
    const ch = text.charCodeAt(i);
    if (ch === 9) {
      i++;
      continue;
    }
    rows.push(row);
    row = [];
    i += ch === 13 && text.charCodeAt(i + 1) === 10 ? 2 : 1;
  }
}

// ---------------------------------------------------------------------------
// Ranges
// ---------------------------------------------------------------------------

interface Rect {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

function rectOf<Row>(range: CellRange, ctx: ModuleContext<Row>): Rect | null {
  const columns = ctx.getColumns();
  const ra = ctx.getRowIndex(range.anchor.rowId);
  const rf = ctx.getRowIndex(range.focus.rowId);
  const ca = visibleColumnIndex(columns, range.anchor.columnId);
  const cf = visibleColumnIndex(columns, range.focus.columnId);
  if (ra < 0 || rf < 0 || ca < 0 || cf < 0) return null;
  return { r0: Math.min(ra, rf), r1: Math.max(ra, rf), c0: Math.min(ca, cf), c1: Math.max(ca, cf) };
}

/** Columns that carry data (not utility columns: selection checkbox, command buttons). */
function isDataColumn<Row>(column: CompiledColumn<Row>): boolean {
  if ((column.def as { commands?: unknown }).commands !== undefined) return false;
  return column.field !== null || column.def.valueGetter !== undefined;
}

function isSynthetic(rowId: RowId): boolean {
  return rowId.startsWith(GROUP_ID_PREFIX) || rowId.startsWith(GROUP_FOOTER_ID_PREFIX);
}

/**
 * Creates the `clipboard` module. Options are read from `options.clipboard`.
 * `clipboard.paste` and `clipboard.fill` need the `edit` module.
 */
export function createClipboardModule<Row>(): ClipboardModule<Row> {
  let copyFormatted = true;
  let maxCells = 1_000_000;

  const textOf = (ctx: ModuleContext<Row>, rowId: RowId, column: CompiledColumn<Row>, getValue: CopyOptions['getValue'], formatted: boolean): string => {
    const row = ctx.getRow(rowId);
    const value = getValue ? getValue(rowId, column.columnId) : row === undefined ? undefined : column.accessor(row);
    if (value === null || value === undefined) return '';
    if (column.def.clipboardFormatter || formatted) return row === undefined ? String(value) : column.clipboardFormatter(value, row);
    return value instanceof Date ? value.toISOString() : String(value);
  };

  const methods: ClipboardMethods<Row> = {
    copy(ctx, options = {}) {
      const columns = ctx.getColumns().visible;
      const selection = ctx.getModuleState<SelectionState>('selection');
      const focus = ctx.getModuleState<FocusState>('focus');
      const getValue = options.getValue;
      const formatted = options.copyFormatted ?? copyFormatted;
      const lines: string[] = [];
      const header = (cols: readonly CompiledColumn<Row>[]): void => {
        if (options.includeHeaders) lines.push(cols.map((c) => cellText(c.headerText)).join('\t'));
      };
      const ranges = selection?.cells.ranges ?? [];
      if (ranges.length) {
        // Bounding box of every range; cells outside a range copy as empty (Ctrl+click selections).
        let box: Rect | null = null;
        const rects: Rect[] = [];
        for (const range of ranges) {
          const r = rectOf(range, ctx);
          if (!r) continue;
          rects.push(r);
          box = box ? { r0: Math.min(box.r0, r.r0), r1: Math.max(box.r1, r.r1), c0: Math.min(box.c0, r.c0), c1: Math.max(box.c1, r.c1) } : { ...r };
        }
        if (box) {
          const cols: CompiledColumn<Row>[] = [];
          const colIdx: number[] = [];
          for (let c = box.c0; c <= box.c1; c++) {
            const col = columns[c] as CompiledColumn<Row>;
            if (!isDataColumn(col)) continue;
            cols.push(col);
            colIdx.push(c);
          }
          if ((box.r1 - box.r0 + 1) * cols.length > maxCells) return Object.freeze({ text: '', cells: 0, rows: [], columns: [], source: 'none' as const });
          header(cols);
          const rows: RowId[] = [];
          const single = rects.length === 1;
          for (let r = box.r0; r <= box.r1; r++) {
            const rowId = ctx.getRowIdAt(r);
            if (rowId === undefined || isSynthetic(rowId)) continue;
            rows.push(rowId);
            const parts: string[] = new Array(cols.length);
            for (let k = 0; k < cols.length; k++) {
              const c = colIdx[k] as number;
              const inside = single || rects.some((x) => r >= x.r0 && r <= x.r1 && c >= x.c0 && c <= x.c1);
              parts[k] = inside ? cellText(textOf(ctx, rowId, cols[k] as CompiledColumn<Row>, getValue, formatted)) : '';
            }
            lines.push(parts.join('\t'));
          }
          return Object.freeze({ text: lines.join('\n'), cells: rows.length * cols.length, rows: Object.freeze(rows), columns: Object.freeze(cols.map((c) => c.columnId)), source: 'range' as const });
        }
      }
      const rowSel = selection?.rows;
      if (rowSel && (rowSel.scope === 'allFiltered' || rowSel.ids.size > 0) && selection?.options.mode !== 'cell') {
        const cols = columns.filter(isDataColumn);
        const model = ctx.getRows();
        const ids: RowId[] = [];
        if (rowSel.scope === 'explicit' && rowSel.ids.size < model.count / 8) {
          const indexed: [number, RowId][] = [];
          for (const id of rowSel.ids) {
            const at = ctx.getRowIndex(id);
            if (at >= 0) indexed.push([at, id]);
          }
          indexed.sort((a, b) => a[0] - b[0]);
          for (const [, id] of indexed) ids.push(id);
        } else {
          for (let i = 0; i < model.count; i++) {
            const id = ctx.getRowIdAt(i);
            if (id === undefined || isSynthetic(id)) continue;
            const inSet = rowSel.ids.has(id);
            if (rowSel.scope === 'explicit' ? inSet : !inSet) ids.push(id);
          }
        }
        if (ids.length * cols.length > maxCells) return Object.freeze({ text: '', cells: 0, rows: [], columns: [], source: 'none' as const });
        header(cols);
        for (const id of ids) lines.push(cols.map((c) => cellText(textOf(ctx, id, c, getValue, formatted))).join('\t'));
        return Object.freeze({ text: lines.join('\n'), cells: ids.length * cols.length, rows: Object.freeze(ids), columns: Object.freeze(cols.map((c) => c.columnId)), source: 'rows' as const });
      }
      const target = focus?.target;
      if (target && target.kind === 'cell' && !isSynthetic(target.rowId)) {
        const col = ctx.getColumns().byId.get(target.columnId);
        if (col?.leaf && isDataColumn(col)) {
          header([col]);
          lines.push(cellText(textOf(ctx, target.rowId, col, getValue, formatted)));
          return Object.freeze({ text: lines.join('\n'), cells: 1, rows: Object.freeze([target.rowId]), columns: Object.freeze([col.columnId]), source: 'cell' as const });
        }
      }
      return Object.freeze({ text: '', cells: 0, rows: Object.freeze([]), columns: Object.freeze([]), source: 'none' as const });
    },
    parse: (_ctx, text) => parseTsv(text),
  };

  /** Target top-left and the clip rectangle: the selected range, else the focused cell to the grid edge. */
  const pasteTarget = (ctx: ModuleContext<Row>): { r: number; c: number; clip: Rect | null } | null => {
    const selection = ctx.getModuleState<SelectionState>('selection');
    const range = selection?.cells.ranges[selection.cells.ranges.length - 1];
    if (range) {
      const rect = rectOf(range, ctx);
      if (rect) return { r: rect.r0, c: rect.c0, clip: rect.r0 === rect.r1 && rect.c0 === rect.c1 ? null : rect };
    }
    const target = ctx.getModuleState<FocusState>('focus')?.target;
    if (target && target.kind === 'cell') {
      const r = ctx.getRowIndex(target.rowId);
      const c = visibleColumnIndex(ctx.getColumns(), target.columnId);
      if (r >= 0 && c >= 0) return { r, c, clip: null };
    }
    return null;
  };

  /** Cell mode writes pasted and filled cells at once; batch, row, and dialog modes keep drafts. */
  const commitFlag = (ctx: ModuleContext<Row>): boolean => ctx.getModuleState<EditState>('edit')?.options.mode === 'cell';

  return defineDataGridModule<Row, ClipboardState, ClipboardCommand, 'clipboard', ClipboardMethods<Row>>({
    name: 'clipboard',
    commands: CLIPBOARD_COMMANDS,
    inSnapshot: false,
    methods,
    initialState(options: DataGridOptions<Row>): ClipboardState {
      const o = (options['clipboard'] ?? {}) as ClipboardOptions;
      copyFormatted = o.copyFormatted ?? true;
      maxCells = o.maxCells ?? 1_000_000;
      return INITIAL_CLIPBOARD_STATE;
    },
    reduce(state, command, ctx) {
      const edit = ctx.getModuleState<EditState>('edit');
      if (!edit) return ctx.reject('editModuleMissing');
      if (!edit.options.enabled || !edit.options.edit) return ctx.reject('editDisabled');
      const columns = ctx.getColumns().visible;
      const rowCount = ctx.getRows().count;
      if (command.type === 'clipboard.paste') {
        if (typeof command.text !== 'string') return ctx.reject('invalidCommand');
        const grid = parseTsv(command.text);
        if (grid.length === 0) return ctx.reject('empty');
        const target = pasteTarget(ctx);
        if (!target) return ctx.reject('noTarget');
        const height = grid.length;
        const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
        const singleValue = height === 1 && width === 1;
        const clip = target.clip;
        // Paste walks the same cells copy emits: data columns and data rows
        // only (utility columns, group captions, and footers are skipped, not
        // consumed), so a copied block lands back where it came from.
        const lastCol = clip ? clip.c1 : columns.length - 1;
        const targetCols: CompiledColumn<Row>[] = [];
        for (let c = target.c; c <= lastCol && (clip || targetCols.length < width); c++) {
          const column = columns[c] as CompiledColumn<Row>;
          if (isDataColumn(column)) targetCols.push(column);
        }
        const lastRow = clip ? clip.r1 : rowCount - 1;
        const targetRows: RowId[] = [];
        for (let r = target.r; r <= lastRow && (clip || targetRows.length < height); r++) {
          const rowId = ctx.getRowIdAt(r);
          if (rowId !== undefined && !isSynthetic(rowId)) targetRows.push(rowId);
        }
        // One value fills the whole selected range; a block is clipped to the range (or the grid edge).
        const rows = singleValue && clip ? targetRows.length : Math.min(height, targetRows.length);
        const cols = singleValue && clip ? targetCols.length : Math.min(width, targetCols.length);
        const clipped = !singleValue && (rows < height || cols < width);
        // Cells of the text that fell outside the grid (a range clip is reported by `clipped` only).
        let skipped = clip ? 0 : height * width - rows * cols;
        const cells: { rowId: RowId; columnId: ColumnId; value: Json }[] = [];
        for (let i = 0; i < rows; i++) {
          const rowId = targetRows[i] as RowId;
          const source = singleValue ? (grid[0] as string[]) : (grid[i] as string[]);
          for (let j = 0; j < cols; j++) {
            const text = singleValue ? (source[0] as string) : (source[j] ?? '');
            cells.push({ rowId, columnId: (targetCols[j] as CompiledColumn<Row>).columnId, value: text });
          }
        }
        let applied = 0;
        if (cells.length) {
          const result = ctx.dispatch({ type: 'edit.setValues', cells, commit: commitFlag(ctx) });
          applied = bulkApplied(result, ctx, cells.length);
        }
        skipped += cells.length - applied;
        const first = targetRows[0];
        const last = targetRows[rows - 1];
        const firstCol = targetCols[0];
        const lastTargetCol = targetCols[cols - 1];
        const covered: CellRange | null =
          rows > 0 && cols > 0 && first !== undefined && last !== undefined && firstCol && lastTargetCol
            ? { anchor: { rowId: first, columnId: firstCol.columnId }, focus: { rowId: last, columnId: lastTargetCol.columnId } }
            : null;
        return Object.freeze({
          version: state.version + 1,
          lastPaste: Object.freeze({ rows: height, columns: width, applied, skipped, clipped, target: covered }),
        });
      }
      if (command.type === 'clipboard.fill') {
        const selection = ctx.getModuleState<SelectionState>('selection');
        const source = command.source ?? selection?.cells.ranges[selection.cells.ranges.length - 1];
        if (!source) return ctx.reject('noRange');
        const rect = rectOf(source, ctx);
        const tr = ctx.getRowIndex(command.target.rowId);
        const tc = visibleColumnIndex(ctx.getColumns(), command.target.columnId);
        if (!rect || tr < 0 || tc < 0) return ctx.reject('invalidRange');
        const union: Rect = { r0: Math.min(rect.r0, tr), r1: Math.max(rect.r1, tr), c0: Math.min(rect.c0, tc), c1: Math.max(rect.c1, tc) };
        const h = rect.r1 - rect.r0 + 1;
        const w = rect.c1 - rect.c0 + 1;
        const cells: { rowId: RowId; columnId: ColumnId; from: { rowId: RowId; columnId: ColumnId } }[] = [];
        const rowIds: (RowId | undefined)[] = [];
        for (let r = union.r0; r <= union.r1; r++) rowIds.push(ctx.getRowIdAt(r));
        for (let r = union.r0; r <= union.r1; r++) {
          const rowId = rowIds[r - union.r0];
          if (rowId === undefined || isSynthetic(rowId)) continue;
          for (let c = union.c0; c <= union.c1; c++) {
            if (r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1) continue;
            const sr = rect.r0 + ((((r - rect.r0) % h) + h) % h);
            const sc = rect.c0 + ((((c - rect.c0) % w) + w) % w);
            const sourceRow = rowIds[sr - union.r0] ?? ctx.getRowIdAt(sr);
            const sourceCol = columns[sc] as CompiledColumn<Row>;
            const column = columns[c] as CompiledColumn<Row>;
            if (sourceRow === undefined) continue;
            // The edit module reads the source value, so a dirty (draft) source fills its draft.
            cells.push({ rowId, columnId: column.columnId, from: { rowId: sourceRow, columnId: sourceCol.columnId } });
          }
        }
        let applied = 0;
        if (cells.length) {
          const result = ctx.dispatch({ type: 'edit.setValues', cells, commit: commitFlag(ctx) });
          applied = bulkApplied(result, ctx, cells.length);
        }
        const anchor = { rowId: ctx.getRowIdAt(union.r0) as RowId, columnId: (columns[union.c0] as CompiledColumn<Row>).columnId };
        const focusCell = { rowId: ctx.getRowIdAt(union.r1) as RowId, columnId: (columns[union.c1] as CompiledColumn<Row>).columnId };
        if (selection) ctx.dispatch({ type: 'selection.setCellRange', anchor, focus: focusCell });
        return Object.freeze({
          version: state.version + 1,
          lastPaste: Object.freeze({ rows: h, columns: w, applied, skipped: cells.length - applied, clipped: false, target: { anchor, focus: focusCell } }),
        });
      }
      return state;
    },
  });
}
