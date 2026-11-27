// The `editing` render feature's host (`features/feature-editing.ts`). Everything a grid
// with `editing` needs before the user edits: the `editing` prop helpers,
// the engine options, stand-ins for the core `edit` / `clipboard` modules,
// the pure render reads (`cellBits`, `rowBits`, `cellRead`), the confirm
// prompt store, the editing methods of the instance API, and the key / UI
// command bindings. The editing behavior (core modules, controller, editors,
// dialog, added rows) is the lazy `edit-chunk.ts`, warmed in parallel with
// the feature and installed in mount. Without `editing` the instance holds
// the inert host of `features/inert.ts`.
//
// Server render and hydration use the stand-ins: the at-rest edit state
// renders the same markup as the loaded module (asserted by the SSR tests).
// Input that starts an edit before the chunk arrives (F2, Insert, Delete,
// double click, command buttons, toolbar items) is replayed once it loads,
// and `onReady` fires after it loads.

import type { CellSnapshot, ColumnId, CommandResult, CompiledColumn, EditApi, EditDisplay, EditDraft, EditMethods, EditMode, EditOptions, EditState, DataGridModule, RowId } from '@salmonui/data-grid/engine';
import type { ClipboardMethods } from '@salmonui/data-grid/engine';
import { CLIPBOARD_COMMANDS, createInitialEditState, EDIT_COMMANDS, INITIAL_CLIPBOARD_STATE } from '@salmonui/data-grid/engine/edit-state';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { deferModule, type DeferredModule } from '../deferred-module.js';
import type { DataGridEventSource } from '@salmonui/core/internal/events';
import type { DataGridInstance } from '../instance.js';
import type { DataGridKeyHandler, DataGridProps } from '../types.js';
import { propsText, type DataGridText } from '../locale-text.js';
import type { DataGridCommandItem, DataGridEditApi, DataGridEditing } from './edit-types.js';
import type { DataGridEditController } from './edit-ui.js';
import type { DataGridClipboardController } from './clipboard-ui.js';
import type { DataGridFillHandle } from './fill-handle.js';

/** The lazy editing chunk. */
export type EditChunk = typeof import('./edit-chunk.js');

export type Facade<Row> = { [K in keyof EditMethods<Row>]: EditMethods<Row>[K] extends (ctx: never, ...args: infer A) => infer R ? (...args: A) => R : never };
type Listener = () => void;

/** Edit flag bits are folded above the 8 interaction UI bits of a cell or row snapshot. */
export const EDIT_SHIFT = 8;
/** Command column cell: its row has the active editor (any mode). A raw flag above the core `EDIT_*` bits. */
export const EDIT_ROW_ACTIVE = 1 << 10;
/** The cell at the bottom-right of the selected range shows the fill handle. A raw flag above the core `EDIT_*` bits. */
export const EDIT_FILL_CORNER = 1 << 11;

export const rejected = (reason: string): CommandResult => Object.freeze({ status: 'rejected', reason });

/** `editing` prop as settings (`true`: defaults; absent or `false`: null). */
export function editingOf<Row>(props: DataGridProps<Row>): DataGridEditing<Row> | null {
  const value = props.editing;
  if (!value) return null;
  return value === true ? {} : value;
}

// ---------------------------------------------------------------------------
// The lazy chunk (one per page; a load cache, not render state)
// ---------------------------------------------------------------------------

let chunkLoad: Promise<EditChunk> | null = null;
let loadedChunk: EditChunk | null = null;

/** Starts (once) and returns the editing chunk load. */
export function loadEditChunk(): Promise<EditChunk> {
  return (chunkLoad ??= import('./edit-chunk.js').then((chunk) => (loadedChunk = chunk)));
}

const NO_ERRORS: readonly string[] = Object.freeze([]);
const NO_IDS: readonly string[] = Object.freeze([]);
const NO_CHANGES = Object.freeze({ addedRecords: NO_IDS, changedRecords: NO_IDS, deletedRecords: NO_IDS });
const NO_WRITE = Object.freeze({ added: NO_IDS, changed: NO_IDS, deleted: NO_IDS });

/** At-rest results of every `edit` method (no drafts, nothing editable until the module loads). */
const EDIT_AT_REST: { readonly [K in keyof EditMethods<unknown>]: () => unknown } = {
  getDraft: () => undefined,
  cellFlags: () => 0,
  rowFlags: () => 0,
  getValue: () => undefined,
  getDisplay: () => undefined,
  getEditedRow: () => undefined,
  getErrors: () => NO_ERRORS,
  getRowErrors: () => NO_ERRORS,
  isCellEditable: () => false,
  getEditableColumnIds: () => NO_IDS,
  getAddedRowPosition: () => undefined,
  nextEditableCell: () => null,
  isRequired: () => false,
  getBatchChanges: () => NO_CHANGES,
  getBatchPreview: () => undefined,
  previewWrite: () => NO_WRITE,
  hasUnsavedChanges: () => false,
  getSnapshot: () => undefined,
  whenSettled: () => Promise.resolve(),
  getLastWrite: () => null,
  getSubmittedWrite: () => 0,
};

const CLIPBOARD_AT_REST: { readonly [K in keyof ClipboardMethods<unknown>]: () => unknown } = {
  copy: () => Object.freeze({ text: '', cells: 0, rows: NO_IDS, columns: NO_IDS }),
  parse: () => [],
};

/**
 * The `edit` and `clipboard` modules `editing` adds (none the app already
 * passes): the real modules once the chunk is loaded, else stand-ins
 * collected in `deferred` and resolved by `DataGridEditUi` when it arrives.
 */
export function editModules<Row>(
  props: DataGridProps<Row>,
  modules: readonly DataGridModule<Row, never, never>[],
  deferred: DeferredModule<Row>[],
): readonly DataGridModule<Row, never, never>[] {
  if (!editingOf(props)) return [];
  const names = new Set(modules.map((m) => m.name));
  const extra: DataGridModule<Row, never, never>[] = [];
  const chunk = loadedChunk;
  const add = (module: object): void => {
    extra.push(module as DataGridModule<Row, never, never>);
  };
  if (!names.has('edit')) {
    if (chunk) add(chunk.createEditModule<Row>());
    else {
      const d = deferModule<Row>({ name: 'edit', inSnapshot: false, commands: EDIT_COMMANDS, initialState: createInitialEditState<Row>, methods: EDIT_AT_REST, notify: true });
      deferred.push(d);
      add(d.module);
    }
  }
  // Copy, paste and the fill handle come with every editing grid.
  if (!names.has('clipboard')) {
    if (chunk) add(chunk.createClipboardModule<Row>());
    else {
      const d = deferModule<Row>({ name: 'clipboard', inSnapshot: false, commands: CLIPBOARD_COMMANDS, initialState: () => INITIAL_CLIPBOARD_STATE, methods: CLIPBOARD_AT_REST });
      deferred.push(d);
      add(d.module);
    }
  }
  return extra;
}

function defined<T extends object>(value: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = v;
  return out as T;
}

/** The scalar engine options of `editing` (compared on prop sync). */
export function scalarOptions(editing: DataGridEditing<unknown> | null): Record<string, unknown> {
  if (!editing) return { enabled: false };
  return defined({
    enabled: true,
    edit: editing.edit,
    add: editing.add,
    delete: editing.delete,
    newRowPosition: editing.newRowPosition,
    showNewRow: editing.showNewRow,
    tabToNextRow: editing.tabToNextRow,
    undo: editing.undo,
    undoLimit: editing.undoLimit,
  });
}

const VALIDATION_RULES = ['required', 'min', 'max', 'range', 'minLength', 'maxLength', 'rangeLength', 'number', 'digits', 'email', 'url', 'date', 'dateIso', 'creditcard', 'tel', 'pattern', 'validate'] as const;

/** Validation and save messages for the edit module, from the catalog (`validation<Rule>` keys). */
export function messagesOf(text: DataGridText): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of VALIDATION_RULES) {
    const key = `validation${rule.charAt(0).toUpperCase()}${rule.slice(1)}`;
    const message = text.catalog[key];
    if (typeof message === 'string') out[rule] = message;
  }
  out['saveFailed'] = text('saveFailed');
  out['saveRejected'] = text('saveRejected');
  out['partialSave'] = text('partialSave');
  out['conflict'] = text('conflict');
  return out;
}

export interface ConfirmPrompt {
  readonly id: number;
  readonly message: string;
  readonly kind: 'delete' | 'discard' | 'save';
  resolve(ok: boolean): void;
}

/** Inputs of the editor element ids (deterministic per cell; SSR never renders editors). */
function idPart(value: string): string {
  return value.replace(/[^\w-]/g, (ch) => `_${ch.charCodeAt(0).toString(36)}`);
}

/** Key commands bound by editing; the ones that start an edit are replayed when pressed before the chunk loads. */
const KEY_COMMANDS = ['edit.begin', 'edit.add', 'edit.delete', 'edit.save', 'edit.saveUp', 'edit.saveInPlace', 'edit.next', 'edit.previous', 'edit.cancel', 'edit.undo', 'edit.redo'] as const;
/** UI commands handled by editing. */
const UI_COMMANDS = ['edit.add', 'edit.begin', 'edit.delete', 'edit.save', 'edit.cancel'] as const;
/** At rest (nothing edited yet) only these do anything, so only these are replayed. */
const STARTS = new Set<string>(['edit.begin', 'edit.add', 'edit.delete']);

export type EditKeyCommand = (typeof KEY_COMMANDS)[number];
export type EditUiCommand = (typeof UI_COMMANDS)[number];

export class DataGridEditUi<Row> {
  private readonly instance: DataGridInstance<Row>;
  /** The `edit` module is registered. */
  readonly active: boolean;
  /** Editing text: the grid catalog in the grid locale. */
  get text(): DataGridText {
    return this.instance.text;
  }
  private readonly listeners = new Set<Listener>();
  private prompt: ConfirmPrompt | null = null;
  private promptSeq = 0;
  private coreApi: EditApi<Row> | null = null;
  /** The loaded chunk and the controller built from it. */
  private chunk: EditChunk | null = null;
  private controller: DataGridEditController<Row> | null = null;
  /** Copy, paste and fill (`clipboard` module registered), built with the controller. */
  private clipboard: DataGridClipboardController<Row> | null = null;
  /** The fill handle drag of the mounted grid. */
  private fill: DataGridFillHandle<Row> | null = null;
  private readonly deferred: readonly DeferredModule<Row>[];
  /** Props the engine options were built from (synced into the module when it loads). */
  private readonly initialProps: DataGridProps<Row>;
  private mounted = false;
  /** Work waiting for the chunk and the mount (early input, `onReady`). */
  private queue: (() => void)[] = [];
  private readonly loadListeners = new Set<Listener>();

  constructor(instance: DataGridInstance<Row>, deferred: readonly DeferredModule<Row>[] = []) {
    this.instance = instance;
    this.active = instance.engine.getModuleState('edit') !== undefined;
    this.deferred = deferred.filter((d) => d.module.name === 'edit' || d.module.name === 'clipboard');
    this.initialProps = instance.props;
    if (!this.active) return;
    this.registerKeys();
    this.registerUiCommands();
    if (loadedChunk && this.deferred.length === 0) this.attach(loadedChunk);
    // Warm the chunk on the client as early as possible (a cached import; the server renders the stand-ins).
    else if (typeof window !== 'undefined') void loadEditChunk().catch(() => undefined);
  }

  /** Engine options for `editing` (initial). Function options are wrappers that read the latest props. */
  static engineOptions<Row>(props: DataGridProps<Row>, latest: () => DataGridProps<Row>): Record<string, unknown> {
    const editing = editingOf(props);
    if (!editing) return {};
    const read = (): DataGridEditing<Row> | null => editingOf(latest());
    const options: EditOptions<Row> = {
      ...(scalarOptions(editing as DataGridEditing<unknown>) as EditOptions<Row>),
      mode: editing.mode ?? 'row',
      // An app `getRowId` (Gantt, TreeGrid hosts and apps keyed by it) addresses rows without a primaryKey column.
      keyedRows: props.getRowId !== undefined,
      messages: messagesOf(propsText(props)) as NonNullable<EditOptions<Row>['messages']>,
      ...(editing.isCellEditable ? { isCellEditable: (ctx) => read()?.isCellEditable?.(ctx) !== false } : {}),
      ...(editing.validateRow ? { validateRow: (row, ctx) => read()?.validateRow?.(row, ctx) ?? null } : {}),
      ...(editing.newRow ? { newRow: () => read()?.newRow?.() ?? {} } : {}),
    };
    return { edit: options };
  }

  // ------------------------------------------------------------------------
  // Chunk
  // ------------------------------------------------------------------------

  /** Resolves the stand-in modules and builds the controller. */
  private attach(chunk: EditChunk): void {
    if (this.controller) return;
    this.chunk = chunk;
    for (const d of this.deferred) {
      d.resolve(d.module.name === 'edit' ? chunk.createEditModule<Row>() : chunk.createClipboardModule<Row>());
    }
    this.controller = new chunk.DataGridEditController<Row>(this.instance, this);
    if (this.engine.getModuleState('clipboard') !== undefined) this.clipboard = new chunk.DataGridClipboardController<Row>(this.instance);
    // Settings changed while the chunk loaded (also records the text the module messages came from).
    this.controller.sync(this.initialProps, this.instance.props);
    for (const l of this.loadListeners) l();
  }

  /** The loaded chunk (editors, dialog, added rows), or null before it loads. */
  readonly getChunk = (): EditChunk | null => this.chunk;
  readonly getServerChunk = (): EditChunk | null => null;
  readonly subscribeChunk = (listener: Listener): (() => void) => {
    this.loadListeners.add(listener);
    return () => {
      this.loadListeners.delete(listener);
    };
  };

  /** Runs `work` with the controller now, or once the chunk is loaded and the grid mounted. */
  private run(work: (controller: DataGridEditController<Row>) => void): void {
    const controller = this.controller;
    if (controller && this.mounted) work(controller);
    else this.queue.push(() => {
      if (this.controller) work(this.controller);
    });
  }

  /** Runs `work` once editing is ready (at once without editing). Returns the cancel. */
  whenReady(work: () => void): () => void {
    if (!this.active || (this.controller && this.mounted)) {
      work();
      return () => {};
    }
    let live = true;
    this.queue.push(() => {
      if (live) work();
    });
    return () => {
      live = false;
    };
  }

  private flush(): void {
    const queue = this.queue;
    this.queue = [];
    for (const work of queue) work();
  }

  // ------------------------------------------------------------------------
  // Reads (pure; render-time snapshots)
  // ------------------------------------------------------------------------

  private get engine() {
    return this.instance.engine;
  }

  facade(): Facade<Row> | undefined {
    return (this.engine as unknown as { edit?: Facade<Row> }).edit;
  }

  state(): EditState | undefined {
    return this.engine.getModuleState<EditState>('edit');
  }

  mode(): EditMode {
    return this.state()?.options.mode ?? 'row';
  }

  settings(): DataGridEditing<Row> | null {
    return editingOf(this.instance.props);
  }

  /** Edit flag bits of a cell, shifted above the interaction bits. */
  cellBits(rowId: RowId, columnId: ColumnId, commandColumn: boolean): number {
    const f = this.facade();
    if (!f) return 0;
    let bits = f.cellFlags(rowId, columnId);
    if (commandColumn) {
      // The always-visible add row offers Save and Cancel like an edited row.
      const s = this.state();
      if (s?.active?.rowId === rowId || s?.newRowId === rowId) bits |= EDIT_ROW_ACTIVE;
    } else if (this.fill?.isCorner(rowId, columnId)) bits |= EDIT_FILL_CORNER;
    return bits << EDIT_SHIFT;
  }

  rowBits(rowId: RowId): number {
    const f = this.facade();
    return f ? f.rowFlags(rowId) << EDIT_SHIFT : 0;
  }

  /** Draft-backed display (dirty cells, added rows), else the engine cell snapshot. */
  cellRead(rowId: RowId, columnId: ColumnId): CellSnapshot | EditDisplay | undefined {
    return this.facade()?.getDisplay(rowId, columnId) ?? this.engine.getCellSnapshot(rowId, columnId);
  }

  editedRow(rowId: RowId): Row | undefined {
    return this.facade()?.getEditedRow(rowId);
  }

  draft(rowId: RowId, columnId: ColumnId): EditDraft | undefined {
    return this.facade()?.getDraft(rowId, columnId);
  }

  errors(rowId: RowId, columnId: ColumnId): readonly string[] {
    return this.facade()?.getErrors(rowId, columnId) ?? [];
  }

  /** Deterministic id of a cell editor's focusable element. */
  editorId(rowId: RowId, columnId: ColumnId): string {
    return `${this.instance.gridId}-edit-${idPart(rowId)}-${idPart(columnId)}`;
  }

  errorId(rowId: RowId, columnId: ColumnId): string {
    return `${this.editorId(rowId, columnId)}-error`;
  }

  /** The cell whose editor takes DOM focus. */
  isFocusEditor(rowId: RowId, columnId: ColumnId): boolean {
    const a = this.state()?.active;
    return a !== null && a !== undefined && a.rowId === rowId && a.columnId === columnId;
  }

  /** `commands` of a column, or null. */
  commandsOf(column: CompiledColumn<Row>): readonly DataGridCommandItem<Row>[] | null {
    const commands = (column.def as { commands?: readonly DataGridCommandItem<Row>[] }).commands;
    return commands && commands.length ? commands : null;
  }

  focusEditorElement(rowId: RowId, columnId: ColumnId): void {
    const doc = this.instance.root?.ownerDocument;
    const el = doc?.getElementById(this.editorId(rowId, columnId));
    if (el && doc?.activeElement !== el) (el as HTMLElement).focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------------
  // Overlay store (confirm prompts)
  // ------------------------------------------------------------------------

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getPrompt = (): ConfirmPrompt | null => this.prompt;
  readonly getServerPrompt = (): ConfirmPrompt | null => null;

  private emit(): void {
    for (const l of this.listeners) l();
  }

  /** Opens a confirm prompt; `run` executes on OK. A newer prompt cancels an open one. */
  confirm(kind: 'delete' | 'discard' | 'save', message: string, run: () => void, onCancel?: () => void): void {
    this.prompt?.resolve(false);
    const id = ++this.promptSeq;
    this.prompt = {
      id,
      kind,
      message,
      resolve: (ok) => {
        if (this.prompt?.id !== id) return;
        this.prompt = null;
        this.emit();
        if (ok) run();
        else onCancel?.();
      },
    };
    this.emit();
  }

  // ------------------------------------------------------------------------
  // Actions of the editing UI (editors and dialog exist only once the chunk is loaded)
  // ------------------------------------------------------------------------

  setValue(rowId: RowId, columnId: ColumnId, input: unknown, source: DataGridEventSource = 'keyboard'): void {
    this.controller?.setValue(rowId, columnId, input, source);
  }

  save(source: DataGridEventSource, scope: 'editor' | 'all' = 'all'): boolean {
    return this.controller?.save(source, scope) ?? false;
  }

  cancel(source: DataGridEventSource): boolean {
    return this.controller?.cancel(source) ?? false;
  }

  commitAndMove(direction: 'next' | 'previous' | 'down' | 'up', source: DataGridEventSource): boolean {
    return this.controller?.commitAndMove(direction, source) ?? false;
  }

  /** Command column click; replayed when the chunk is still loading. */
  runCommandItem(item: DataGridCommandItem<Row>, rowId: RowId, source: DataGridEventSource): void {
    this.run((c) => c.runCommandItem(item, rowId, source));
  }

  // ------------------------------------------------------------------------
  // Keyboard and UI commands
  // ------------------------------------------------------------------------

  /**
   * Enter on a command column cell moves DOM focus to its first enabled
   * button (the grid pattern's interactive cell); the buttons then rove with
   * the arrow keys and Escape returns to the cell (`DataGridCommandCell`).
   */
  private enterCommandCell(): boolean {
    const t = this.instance.interaction.focusTarget();
    if (t?.kind !== 'cell') return false;
    const column = this.instance.engine.getSnapshot().columns.byId.get(t.columnId);
    if (!column || !this.commandsOf(column)) return false;
    const cell = this.instance.root?.ownerDocument.activeElement?.closest?.(`.salmon-data-grid-cell[data-column-id="${CSS.escape(t.columnId)}"]`);
    const button = cell?.querySelector<HTMLButtonElement>('.salmon-data-grid-command__button:not(:disabled)');
    if (!button) return false;
    button.focus();
    return true;
  }

  private registerKeys(): void {
    const interaction = this.instance.interaction;
    interaction.registerKeyHandler('selection.enterDown', () => this.enterCommandCell(), 20);
    for (const command of KEY_COMMANDS) {
      interaction.registerKeyHandler(
        command,
        (ctx: Parameters<DataGridKeyHandler>[0]) => {
          const controller = this.controller;
          if (controller && this.mounted) return controller.key(command, ctx);
          if (!STARTS.has(command)) return false;
          this.run((c) => c.key(command, ctx));
          return true;
        },
        10,
      );
    }
  }

  private registerUiCommands(): void {
    const chrome = this.instance.chrome;
    for (const command of UI_COMMANDS) {
      chrome.registerCommandHandler(command, (payload) => {
        const controller = this.controller;
        if (controller && this.mounted) return controller.uiCommand(command, payload);
        if (!STARTS.has(command)) return false;
        this.run((c) => c.uiCommand(command, payload));
        return true;
      });
    }
  }

  // ------------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------------

  mount(): () => void {
    if (!this.active) return () => {};
    let live = true;
    let off: (() => void) | null = null;
    const root = this.instance.root;
    // Double click starts an edit; before the chunk loads it is replayed.
    const onDoubleClick = (event: MouseEvent): void => this.run((c) => c.onDoubleClick(event));
    root?.addEventListener('dblclick', onDoubleClick);
    const start = (controller: DataGridEditController<Row>): void => {
      if (!live) return;
      const offController = controller.mount();
      const clipboard = this.clipboard;
      const offClipboard = clipboard?.mount();
      const fill = (this.fill = clipboard && this.chunk ? new this.chunk.DataGridFillHandle<Row>(this.instance, clipboard) : null);
      const offFill = fill?.mount();
      off = () => {
        this.fill = null;
        offFill?.();
        offClipboard?.();
        offController();
      };
      this.mounted = true;
      this.flush();
    };
    if (this.controller) start(this.controller);
    else {
      loadEditChunk().then(
        (chunk) => {
          if (!live) return;
          this.attach(chunk);
          if (this.controller) start(this.controller);
        },
        (error: unknown) => {
          if (DEV) warnOnce(`${this.instance.gridId}:edit-chunk`, `DataGrid "${this.instance.gridId}": the editing code failed to load; editing stays off (${String(error)}).`);
        },
      );
    }
    return () => {
      live = false;
      this.mounted = false;
      root?.removeEventListener('dblclick', onDoubleClick);
      off?.();
      off = null;
      this.prompt = null;
    };
  }

  /** Re-applies changed `editing` settings and editing text. */
  sync(props: DataGridProps<Row>, prev: DataGridProps<Row>): void {
    if (!this.active) return;
    // Before the chunk loads, `attach()` syncs from the initial props.
    this.controller?.sync(prev, props);
  }

  // ------------------------------------------------------------------------
  // Instance methods
  // ------------------------------------------------------------------------

  private core(): EditApi<Row> | null {
    const chunk = this.chunk;
    if (!chunk || !this.controller) return null;
    return (this.coreApi ??= chunk.createEditApi(this.engine));
  }

  /** Resolves once the chunk is loaded and the grid mounted. */
  private ready(): Promise<void> {
    return new Promise((resolve) => this.run(() => resolve()));
  }

  /** `run` now, or (`async`) once the chunk is loaded: calls made before it are replayed in order. */
  private act(run: (core: EditApi<Row>) => CommandResult): CommandResult {
    return this.later(() => this.core(), run);
  }

  /** A clipboard action (copy, paste, fill) like `act`; rejected without the clipboard module. */
  private clip(run: (clipboard: DataGridClipboardController<Row>) => CommandResult): CommandResult {
    return this.active && this.engine.getModuleState('clipboard') !== undefined ? this.later(() => this.clipboard, run) : rejected('clipboardUnavailable');
  }

  private later<T>(get: () => T | null, run: (target: T) => CommandResult): CommandResult {
    const target = get();
    if (target && this.mounted) return run(target);
    const promise = new Promise<void>((resolve) => {
      this.run(() => {
        const t = get();
        const result = t ? run(t) : null;
        if (result?.status === 'async') result.promise.then(resolve, resolve);
        else resolve();
      });
    });
    return Object.freeze({ status: 'async', promise });
  }

  /**
   * Editing methods of `DataGridApi`; without the module every action is
   * rejected. Actions called before the editing chunk loaded return `async`
   * and run, in call order, once it is loaded.
   */
  api(): DataGridEditApi<Row> {
    const off = rejected('editingDisabled');
    const on = <A extends unknown[]>(run: (core: EditApi<Row>, ...args: A) => CommandResult) =>
      (...args: A): CommandResult => (this.active ? this.act((core) => run(core, ...args)) : off);
    type Extra = Partial<{ validateBatch(): Promise<boolean>; undo(): CommandResult; redo(): CommandResult }>;
    const core = (): (EditApi<Row> & Extra) | null => (this.active ? this.core() : null);
    return {
      startEdit: on((c, rowId?: RowId, field?: string) => {
        const r = c.startEdit(rowId, field);
        if (r.status !== 'rejected') {
          const a = this.state()?.active;
          if (a?.columnId) requestAnimationFrameSafe(() => this.focusEditorElement(a.rowId, a.columnId as ColumnId));
        }
        return r;
      }),
      save: on((c) => c.save()),
      saveCell: on((c) => c.saveCell()),
      cancelEdit: on((c) => c.cancelEdit()),
      addRow: on((c, row?: Readonly<Record<string, unknown>>, index?: number) => c.addRow(row, index)),
      deleteRows: on((c, rowIds?: RowId | readonly RowId[]) => c.deleteRows(rowIds)),
      updateRow: on((c, rowId: RowId, row: Readonly<Record<string, unknown>>) => c.updateRow(rowId, row)),
      updateCell: on((c, rowId: RowId, field: string, value: unknown) => c.updateCell(rowId, field, value)),
      setCellValue: on((c, rowId: RowId, field: string, value: unknown) => c.setCellValue(rowId, field, value)),
      setRowData: on((c, rowId: RowId, row: Row) => c.setRowData(rowId, row)),
      applyChanges: on((c, changes: Parameters<EditApi<Row>['applyChanges']>[0]) => c.applyChanges(changes)),
      getPendingChanges: () => core()?.getPendingChanges() ?? Object.freeze({ addedRecords: [], changedRecords: [], deletedRecords: [] }),
      getBatchPreview: () => core()?.getBatchPreview(),
      getEditSnapshot: () => core()?.getEditSnapshot(),
      hasUnsavedChanges: () => core()?.hasUnsavedChanges() ?? false,
      // Before the chunk loads, editing is not settled yet: wait for it.
      whenEditSettled: () => (!this.active ? Promise.resolve() : this.ready().then(() => core()?.whenEditSettled())),
      validateBatch: () => {
        if (!this.active) return Promise.resolve(true);
        return this.ready().then(() => {
          const c = core();
          return c?.validateBatch ? c.validateBatch() : true;
        });
      },
      undo: () => (this.active ? this.act((c) => (c as EditApi<Row> & Extra).undo?.() ?? off) : off),
      redo: () => (this.active ? this.act((c) => (c as EditApi<Row> & Extra).redo?.() ?? off) : off),
      fillSelection: (rowId, field) => this.clip((c) => c.fill({ rowId, field: this.columnIdOf(field) }, 'api')),
      copy: (options) => this.clip((c) => c.copy(options?.includeHeaders === true, 'api', options?.copyFormatted)),
      paste: (text) => this.clip((c) => (typeof text === 'string' ? c.paste(text, 'api') : c.pasteFromClipboard('api'))),
    };
  }

  private columnIdOf(field: string): ColumnId {
    const columns = this.engine.getSnapshot().columns;
    if (columns.byId.get(field)?.leaf) return field;
    return columns.leaves.find((c) => c.field === field)?.columnId ?? field;
  }
}

/** rAF when available (editor focus after the commit that mounts it), else a microtask. */
export function requestAnimationFrameSafe(run: () => void): void {
  const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => number }).requestAnimationFrame;
  if (raf) raf(run);
  else void Promise.resolve().then(run);
}
