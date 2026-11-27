// Clipboard controller of one DataGrid, in the lazy
// editing chunk (`edit-chunk.ts`):
// copy (Mod+C, Ctrl+Shift+H, the `copy` toolbar and context-menu items,
// `api.copy()`), paste (Mod+V, `api.paste()`), fill (the fill handle,
// `api.fillSelection()`), their before-events, and the fallbacks used when
// the async Clipboard API is missing or refused (insecure context).
//
// The core `clipboard` module serializes and applies the values; this file
// only moves text between it and the browser:
//
// - Copy writes with `navigator.clipboard.writeText` in a secure context,
//   else with a hidden textarea and `document.execCommand('copy')`; when
//   both fail it opens a dialog whose selected textarea the user copies
//   with Ctrl/Cmd+C.
// - Keyboard paste never needs the Clipboard API: the Mod+V keydown moves
//   focus to a hidden textarea, the browser's own paste lands there, and
//   its `paste` event hands over the text (no permission prompt). `paste()`
//   without text reads `navigator.clipboard.readText()`, else opens a paste
//   dialog.

import type { CellRange, ClipboardCopy, ColumnId, CommandResult, RowId, SelectionState } from '@salmonui/data-grid/engine';
import { gridEvent, lazyField, type DataGridEventSource } from '@salmonui/core/internal/events';
import type { DataGridInstance } from '../instance.js';
import { treeCopyHooks } from '../tree-hooks.js';
import type { DataGridBeforeCopyEvent, DataGridBeforeFillEvent, DataGridBeforePasteEvent, DataGridClipboardCell } from './clipboard-types.js';

type CopyFacade = { copy(options?: { includeHeaders?: boolean; copyFormatted?: boolean; getValue?: (rowId: RowId, columnId: ColumnId) => unknown }): ClipboardCopy };
type EditReads = { getValue(rowId: RowId, columnId: ColumnId): unknown; isCellEditable?(rowId: RowId, columnId: ColumnId): boolean };

const rejected = (reason: string): CommandResult => Object.freeze({ status: 'rejected', reason });
const APPLIED: CommandResult = Object.freeze({ status: 'applied' });

/** `Ctrl+C` / `⌘C` for the fallback dialog text. */
function shortcut(doc: Document, key: string): string {
  const nav = doc.defaultView?.navigator as (Navigator & { userAgentData?: { platform?: string } }) | undefined;
  const platform = nav?.userAgentData?.platform ?? nav?.platform ?? '';
  return /mac|iphone|ipad/i.test(platform) ? `⌘${key}` : `Ctrl+${key}`;
}

/** The async Clipboard API is usable: present and in a secure context. */
function asyncClipboard(doc: Document | undefined): Clipboard | null {
  const win = doc?.defaultView;
  if (!win || win.isSecureContext === false) return null;
  const clipboard = win.navigator.clipboard as Clipboard | undefined;
  return clipboard && typeof clipboard.writeText === 'function' ? clipboard : null;
}

/**
 * Adds the assignable `data` field of the before-copy / before-paste events
 * as an accessor, so it stays writable when development builds freeze the
 * event object.
 */
function writableData<T extends object>(fields: T, initial: string): T & { data: string } {
  let data = initial;
  Object.defineProperty(fields, 'data', {
    get: () => data,
    set: (value: string) => {
      data = value;
    },
    enumerable: true,
  });
  return fields as T & { data: string };
}

export class DataGridClipboardController<Row> {
  private readonly instance: DataGridInstance<Row>;
  /** Hidden textarea (execCommand copy, keyboard paste capture); created on first use. */
  private input: HTMLTextAreaElement | null = null;
  private dialog: HTMLDialogElement | null = null;
  /** Ends a pending keyboard paste capture (restores focus). */
  private endCapture: (() => void) | null = null;

  constructor(instance: DataGridInstance<Row>) {
    this.instance = instance;
  }

  private get engine() {
    return this.instance.engine;
  }

  private facade(): CopyFacade | undefined {
    return (this.engine as unknown as { clipboard?: CopyFacade }).clipboard;
  }

  private edit(): EditReads | undefined {
    return (this.engine as unknown as { edit?: EditReads }).edit;
  }

  // ------------------------------------------------------------------------
  // Copy
  // ------------------------------------------------------------------------

  /** Serializes the selection (drafts included), raises `onBeforeCopy`, and writes the text. */
  copy(includeHeaders: boolean, source: DataGridEventSource, copyFormatted?: boolean): CommandResult {
    const text = this.copyText(includeHeaders, source, copyFormatted);
    if (typeof text !== 'string') return text;
    this.write(text);
    return APPLIED;
  }

  /** A row copy over `rowIds` (tree pre-order): the copied lines, plus lines for the added rows. */
  private widenRows(copied: ClipboardCopy, rowIds: readonly RowId[], includeHeaders: boolean, formatted: boolean, getValue: ((rowId: RowId, columnId: ColumnId) => unknown) | null): ClipboardCopy {
    if (rowIds.length === copied.rows.length) return copied;
    const lines = copied.text.split('\n');
    const head = includeHeaders ? lines.shift() : undefined;
    const byId = new Map(copied.rows.map((id, i) => [id, lines[i] as string]));
    const quote = (text: string): string => (/[\t\n\r"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);
    const engine = this.engine;
    const line = (rowId: RowId): string =>
      copied.columns
        .map((c) => {
          if (formatted && !getValue) return quote(engine.getCellSnapshot(rowId, c)?.formattedValue ?? '');
          const value = getValue ? getValue(rowId, c) : engine.getCellValue(rowId, c);
          return quote(value == null ? '' : String(value));
        })
        .join('\t');
    const out = rowIds.map((id) => byId.get(id) ?? line(id));
    return Object.freeze({ ...copied, text: (head !== undefined ? [head, ...out] : out).join('\n'), rows: Object.freeze([...rowIds]), cells: rowIds.length * copied.columns.length });
  }

  /** The text a copy writes after `onBeforeCopy`, or the rejection. */
  copyText(includeHeaders: boolean, source: DataGridEventSource, copyFormatted?: boolean): string | CommandResult {
    const facade = this.facade();
    if (!facade) return rejected('clipboardUnavailable');
    const edit = this.edit();
    // Draft values; lookup columns copy the display value of the (draft) key, like the engine accessor.
    const byId = this.engine.getSnapshot().columns.byId;
    const getValue = (rowId: RowId, columnId: ColumnId): unknown => {
      const value = (edit as EditReads).getValue(rowId, columnId);
      const lookup = byId.get(columnId)?.lookup;
      return lookup ? lookup.display(value) : value;
    };
    let copied = facade.copy({ includeHeaders, ...(copyFormatted === undefined ? {} : { copyFormatted }), ...(edit ? { getValue } : {}) });
    if (copied.cells === 0 || copied.source === 'none') return rejected('nothingToCopy');
    // Tree mode `copyMode`: selected rows copy with their ancestors and/or descendants.
    const widen = copied.source === 'rows' ? treeCopyHooks.get(this.engine) : undefined;
    if (widen) copied = this.widenRows(copied, widen(copied.rows), includeHeaders, copyFormatted !== false, edit ? getValue : null);
    const handler = this.instance.props.onBeforeCopy;
    if (!handler) return copied.text;
    const fields = writableData({ includeHeaders, copied: copied.source, cells: copied.cells }, copied.text);
    lazyField(fields, 'rowIds', () => copied.rows);
    lazyField(fields, 'fields', () => copied.columns);
    const event = gridEvent<DataGridBeforeCopyEvent>('beforeCopy', source, fields as never);
    handler(event);
    if (event.defaultPrevented) return rejected('cancelled');
    return typeof event.data === 'string' ? event.data : String(event.data ?? '');
  }

  /** Clipboard API, else execCommand on a hidden textarea, else the copy dialog. */
  private write(text: string): void {
    const doc = this.instance.root?.ownerDocument;
    if (!doc) return;
    const clipboard = asyncClipboard(doc);
    if (clipboard) {
      clipboard.writeText(text).catch(() => {
        if (!this.execCopy(text)) this.openDialog('copy', text);
      });
      return;
    }
    if (!this.execCopy(text)) this.openDialog('copy', text);
  }

  private execCopy(text: string): boolean {
    const doc = this.instance.root?.ownerDocument;
    const input = this.hiddenInput();
    if (!doc || !input) return false;
    const previous = doc.activeElement as HTMLElement | null;
    input.value = text;
    input.focus({ preventScroll: true });
    input.select();
    let ok = false;
    try {
      ok = typeof doc.execCommand === 'function' && doc.execCommand('copy');
    } catch {
      ok = false;
    }
    input.value = '';
    this.restoreFocus(previous);
    return ok;
  }

  // ------------------------------------------------------------------------
  // Paste
  // ------------------------------------------------------------------------

  /** The paste target the core uses: the last range's top-left cell, else the focused cell. */
  pasteTarget(): DataGridClipboardCell | null {
    const engine = this.engine;
    const selection = engine.getModuleState<SelectionState>('selection');
    const range = selection?.cells.ranges[selection.cells.ranges.length - 1];
    if (range) {
      const visible = engine.getSnapshot().columns.visible;
      const index = (columnId: ColumnId): number => visible.findIndex((c) => c.columnId === columnId);
      const top = engine.getRowIndex(range.anchor.rowId) <= engine.getRowIndex(range.focus.rowId) ? range.anchor.rowId : range.focus.rowId;
      const start = index(range.anchor.columnId) <= index(range.focus.columnId) ? range.anchor.columnId : range.focus.columnId;
      return { rowId: top, field: start };
    }
    const target = engine.getModuleState<{ target: { kind: string; rowId?: RowId; columnId: ColumnId } | null }>('focus')?.target;
    return target && target.kind === 'cell' && target.rowId !== undefined ? { rowId: target.rowId, field: target.columnId } : null;
  }

  /** Raises `onBeforePaste`, then pastes the (possibly changed) text through the core. */
  paste(text: string, source: DataGridEventSource): CommandResult {
    if (!this.engine.hasCommand('clipboard.paste')) return rejected('clipboardUnavailable');
    let data = text;
    const handler = this.instance.props.onBeforePaste;
    if (handler) {
      const event = gridEvent<DataGridBeforePasteEvent>('beforePaste', source, writableData({ target: this.pasteTarget() }, text) as never);
      handler(event);
      if (event.defaultPrevented) return rejected('cancelled');
      data = typeof event.data === 'string' ? event.data : String(event.data ?? '');
    }
    return this.instance.dispatchFrom(source, { type: 'clipboard.paste', text: data });
  }

  /** `paste()` without text: the Clipboard API, else the paste dialog. Resolves when pasted or dismissed. */
  pasteFromClipboard(source: DataGridEventSource): CommandResult {
    const doc = this.instance.root?.ownerDocument;
    if (!doc) return rejected('notMounted');
    const clipboard = asyncClipboard(doc);
    if (clipboard && typeof clipboard.readText === 'function') {
      const promise = clipboard.readText().then(
        (text) => void this.paste(text, source),
        () => this.dialogPaste(source),
      );
      return Object.freeze({ status: 'async', promise });
    }
    return Object.freeze({ status: 'async', promise: this.dialogPaste(source) });
  }

  private dialogPaste(source: DataGridEventSource): Promise<void> {
    return new Promise((resolve) => this.openDialog('paste', '', (text) => {
      if (text !== null) this.paste(text, source);
      resolve();
    }));
  }

  /**
   * Mod+V: moves focus to the hidden textarea so the browser pastes there;
   * its `paste` event carries the text. Returns false so the keydown keeps
   * its default action (the native paste).
   */
  capturePaste(): boolean {
    const doc = this.instance.root?.ownerDocument;
    const input = this.hiddenInput();
    const options = this.engine.getModuleState<{ options: { enabled: boolean; edit: boolean } }>('edit')?.options;
    if (!doc || !input || !options?.enabled || !options.edit || this.pasteTarget() === null) return false;
    this.endCapture?.();
    const previous = doc.activeElement as HTMLElement | null;
    let done = false;
    const end = (): void => {
      if (done) return;
      done = true;
      input.removeEventListener('paste', onPaste);
      input.removeEventListener('blur', end);
      doc.removeEventListener('keyup', onKeyUp, true);
      clearTimeout(timer);
      if (this.endCapture === end) this.endCapture = null;
      input.value = '';
      if (doc.activeElement === input) this.restoreFocus(previous);
    };
    const onPaste = (event: ClipboardEvent): void => {
      event.preventDefault();
      const text = event.clipboardData?.getData('text/plain') ?? '';
      end();
      if (text !== '') this.paste(text, 'keyboard');
    };
    // The paste event follows the keydown; without one (empty clipboard, blocked), focus returns on keyup.
    const onKeyUp = (): void => {
      setTimeout(end, 0);
    };
    const timer = setTimeout(end, 1000);
    input.value = '';
    input.addEventListener('paste', onPaste);
    input.addEventListener('blur', end);
    doc.addEventListener('keyup', onKeyUp, true);
    this.endCapture = end;
    input.focus({ preventScroll: true });
    return false;
  }

  // ------------------------------------------------------------------------
  // Fill
  // ------------------------------------------------------------------------

  /** Raises `onBeforeFill`, then tiles the last range over the range extended to `target`. */
  fill(target: DataGridClipboardCell, source: DataGridEventSource, range?: CellRange): CommandResult {
    if (!this.engine.hasCommand('clipboard.fill')) return rejected('fillUnavailable');
    const selection = this.engine.getModuleState<SelectionState>('selection');
    const from = range ?? selection?.cells.ranges[selection.cells.ranges.length - 1];
    if (!from) return rejected('noRange');
    const handler = this.instance.props.onBeforeFill;
    if (handler) {
      const event = gridEvent<DataGridBeforeFillEvent>('beforeFill', source, {
        range: { anchor: { rowId: from.anchor.rowId, field: from.anchor.columnId }, focus: { rowId: from.focus.rowId, field: from.focus.columnId } },
        target,
      });
      handler(event);
      if (event.defaultPrevented) return rejected('cancelled');
    }
    return this.instance.dispatchFrom(source, { type: 'clipboard.fill', target: { rowId: target.rowId, columnId: target.field }, ...(range ? { source: range } : {}) });
  }

  // ------------------------------------------------------------------------
  // Keys, DOM helpers, lifecycle
  // ------------------------------------------------------------------------

  /** `clipboard.copy`, `clipboard.copyWithHeaders`, `clipboard.paste` key bindings. */
  key(command: string): boolean {
    if (command === 'clipboard.paste') return this.capturePaste();
    if (command === 'clipboard.copy' || command === 'clipboard.copyWithHeaders') return this.copy(command === 'clipboard.copyWithHeaders', 'keyboard').status !== 'rejected';
    return false;
  }

  private hiddenInput(): HTMLTextAreaElement | null {
    const root = this.instance.root;
    if (!root) return null;
    if (this.input && this.input.isConnected) return this.input;
    const input = root.ownerDocument.createElement('textarea');
    input.className = 'salmon-data-grid-clipboard-input';
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    input.setAttribute('autocomplete', 'off');
    // Outside the cells: focus moves here only for the instant of a copy or paste.
    root.appendChild(input);
    this.input = input;
    return input;
  }

  private restoreFocus(previous: HTMLElement | null): void {
    if (previous && previous.isConnected && previous !== this.input) previous.focus({ preventScroll: true });
    else this.instance.interaction.focusContent();
  }

  /**
   * Fallback dialog: `copy` shows the text selected for Ctrl/Cmd+C
   * and closes after the copy; `paste` waits for a paste into its textarea.
   */
  private openDialog(kind: 'copy' | 'paste', text: string, done?: (text: string | null) => void): void {
    const root = this.instance.root;
    if (!root) {
      done?.(null);
      return;
    }
    this.dialog?.close();
    const doc = root.ownerDocument;
    const t = this.instance.text;
    const previous = doc.activeElement as HTMLElement | null;
    const id = `${this.instance.gridId}-clipboard`;
    const dialog = doc.createElement('dialog');
    dialog.className = 'salmon-data-grid-confirm salmon-data-grid-clipboard-dialog';
    dialog.dataset['clipboard'] = kind;
    dialog.setAttribute('aria-labelledby', `${id}-title`);
    dialog.setAttribute('aria-describedby', `${id}-hint`);
    const title = doc.createElement('h2');
    title.id = `${id}-title`;
    title.className = 'salmon-data-grid-edit-dialog__title';
    title.textContent = t(kind);
    const hint = doc.createElement('p');
    hint.id = `${id}-hint`;
    hint.className = 'salmon-data-grid-confirm__message';
    hint.textContent = t(kind === 'copy' ? 'clipboardCopyHint' : 'clipboardPasteHint', { shortcut: shortcut(doc, kind === 'copy' ? 'C' : 'V') });
    const area = doc.createElement('textarea');
    area.className = 'salmon-data-grid-clipboard-dialog__text';
    area.setAttribute('aria-label', t('clipboardText'));
    area.rows = 6;
    area.spellcheck = false;
    if (kind === 'copy') {
      area.readOnly = true;
      area.value = text;
    }
    const footer = doc.createElement('div');
    footer.className = 'salmon-data-grid-dialog__actions';
    const close = doc.createElement('button');
    close.type = 'button';
    close.className = 'salmon-data-grid-button';
    close.textContent = t('closeDialog');
    footer.appendChild(close);
    dialog.append(title, hint, area, footer);
    let result: string | null = null;
    let finished = false;
    const finish = (): void => {
      if (finished) return;
      finished = true;
      if (dialog.open) dialog.close();
      dialog.remove();
      if (this.dialog === dialog) this.dialog = null;
      this.restoreFocus(previous);
      done?.(result);
    };
    close.addEventListener('click', finish);
    dialog.addEventListener('close', finish);
    if (kind === 'copy') area.addEventListener('copy', () => setTimeout(finish, 0));
    else {
      area.addEventListener('paste', (event: ClipboardEvent) => {
        event.preventDefault();
        result = event.clipboardData?.getData('text/plain') ?? '';
        finish();
      });
    }
    root.appendChild(dialog);
    this.dialog = dialog;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    area.focus();
    if (kind === 'copy') area.select();
  }

  /**
   * Mod+C, Ctrl+Shift+H and Mod+V, and the `copy` toolbar and context-menu
   * items (instead of the chrome.ts built-in, which has no events or
   * fallbacks). Keys pressed before the chunk loads are not replayed: a
   * late copy or paste would surprise.
   */
  mount(): () => void {
    const interaction = this.instance.interaction;
    const off = ['clipboard.copy', 'clipboard.copyWithHeaders', 'clipboard.paste'].map((command) => interaction.registerKeyHandler(command, () => this.key(command), 10));
    off.push(this.instance.chrome.registerCommandHandler('clipboard.copy', () => this.copy(false, 'pointer').status !== 'rejected'));
    return () => {
      for (const f of off) f();
      this.endCapture?.();
      this.dialog?.close();
      this.dialog?.remove();
      this.dialog = null;
      this.input?.remove();
      this.input = null;
    };
  }
}
