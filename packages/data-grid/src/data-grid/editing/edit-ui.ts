// Editing controller of one DataGrid, in the lazy editing chunk
// (`edit-chunk.ts`): keyboard handlers
// for the `edit.*` bindings, toolbar / menu UI command handlers, the edit
// events, the unsaved-changes guard, confirm prompts and
// announcements. The always-loaded part (render reads, the prompt store, the
// instance methods, the bindings that forward here) is `DataGridEditUi` in
// `edit-host.ts`.
//
// Every edit state lives in the core module (drafts, flags, errors, active
// target); nothing here runs during render.

import type { ColumnId, CommandEvent, CommandResult, EditBatchChanges, EditMode, EditState, DataGridCommand, RowId } from '@salmonui/data-grid/engine';
import type { DataGridErrorEvent } from '../query-types.js';
import { toEditInput } from '@salmonui/data-grid/engine/edit';
import { EDIT_DIRTY } from '@salmonui/data-grid/engine/edit-state';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import { gridEvent, lazyField, type DataGridEventSource } from '@salmonui/core/internal/events';
import type { DataGridInstance } from '../instance.js';
import type { DataGridKeyHandler, DataGridProps } from '../types.js';
import type { DataGridText } from '../locale-text.js';
import { editingOf, messagesOf, requestAnimationFrameSafe, scalarOptions, type EditKeyCommand, type EditUiCommand, type Facade, type DataGridEditUi } from './edit-host.js';
import type {
  DataGridAddEvent,
  DataGridCellValueChangeEvent,
  DataGridCommandClickEvent,
  DataGridCommandItem,
  DataGridDeleteEvent,
  DataGridEditCancelEvent,
  DataGridEditing,
  DataGridEditStartEvent,
  DataGridGuardedAction,
  DataGridSaveEvent,
  DataGridSaveStatus,
} from './edit-types.js';

const NO_ROW_IDS: readonly RowId[] = Object.freeze([]);

const GUARDED: Readonly<Record<DataGridGuardedAction, readonly string[]>> = {
  sort: ['sort.clear', 'sort.column', 'sort.remove', 'sort.set', 'sort.toggle'],
  filter: ['filter.add', 'filter.byColumn', 'filter.clear', 'filter.remove', 'filter.set'],
  search: ['search.clear', 'search.set'],
  page: ['paging.first', 'paging.goToPage', 'paging.last', 'paging.next', 'paging.previous', 'paging.setPageSize'],
  group: ['grouping.clear', 'grouping.groupBy', 'grouping.move', 'grouping.set', 'grouping.setDirection', 'grouping.ungroup'],
};

function sameRecord(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => Object.is(a[k], b[k]));
}

export class DataGridEditController<Row> {
  private readonly instance: DataGridInstance<Row>;
  private readonly ui: DataGridEditUi<Row>;
  /** A guarded command re-dispatched after its confirm (skips the guard). */
  private bypass = 0;
  /** After-event payloads of before-events that passed. */
  private pendingSave: { event: DataGridSaveEvent<Row>; type: string; before: number } | null = null;
  /** Save events by the write token they sent; `onSave` fires when that write settles. */
  private readonly savesInFlight = new Map<number, DataGridSaveEvent<Row>>();
  /** Token of the last settled write reported (`onSave`, `onError`). */
  private reportedWrite = 0;
  private pendingAdd: DataGridAddEvent<Row> | null = null;
  private pendingDelete: DataGridDeleteEvent<Row> | null = null;
  private pendingStart: DataGridEditStartEvent<Row> | null = null;
  private pendingCancel: DataGridEditCancelEvent | null = null;
  private pendingValue: { previous: unknown } | null = null;
  /** Text the edit module messages were last built from. */
  private messagesText: DataGridText | null = null;
  /** Row of the active editor before the last `edit.start` (announce only when the row changes). */
  private startFrom: RowId | null = null;
  /** Set while focus leaving the untouched add row ends its edit: nothing to announce. */
  private quiet = false;

  constructor(instance: DataGridInstance<Row>, ui: DataGridEditUi<Row>) {
    this.instance = instance;
    this.ui = ui;
    const editing = editingOf(instance.props);
    if (DEV && editing?.showNewRow && (editing.mode ?? 'row') !== 'row') {
      warnOnce(`${instance.gridId}:show-new-row`, `DataGrid "${instance.gridId}": editing.showNewRow works in row mode only; it is ignored in ${editing.mode} mode.`);
    }
  }

  // Reads of the always-loaded part.
  private get engine() {
    return this.instance.engine;
  }

  private get text() {
    return this.ui.text;
  }

  private facade(): Facade<Row> | undefined {
    return this.ui.facade();
  }

  private state(): EditState | undefined {
    return this.ui.state();
  }

  private mode(): EditMode {
    return this.ui.mode();
  }

  private settings(): DataGridEditing<Row> | null {
    return this.ui.settings();
  }

  private editedRow(rowId: RowId): Row | undefined {
    return this.ui.editedRow(rowId);
  }

  private confirm(kind: 'delete' | 'discard' | 'save', message: string, run: () => void): void {
    this.ui.confirm(kind, message, run);
  }

  private focusEditorElement(rowId: RowId, columnId: ColumnId): void {
    this.ui.focusEditorElement(rowId, columnId);
  }

  // ------------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------------

  private dispatch(source: DataGridEventSource, command: DataGridCommand): CommandResult {
    return this.instance.dispatchFrom(source, command);
  }

  private header(columnId: ColumnId | null): string {
    if (columnId === null) return '';
    return this.engine.getSnapshot().columns.byId.get(columnId)?.headerText ?? columnId;
  }

  /** Focuses the logical cell (scrolls it into view) and, when an editor is open there, the editor. */
  private focusAfter(rowId: RowId | null, columnId: ColumnId | null): void {
    const interaction = this.instance.interaction;
    const active = this.state()?.active ?? null;
    const target = active ?? (rowId !== null && columnId !== null ? { rowId, columnId } : null);
    if (!target || target.columnId === null) return;
    const real = this.resolveRowId(target.rowId);
    if (this.engine.getRowIndex(real) >= 0) interaction.focusTargetFrom({ kind: 'cell', rowId: real, columnId: target.columnId }, 'keyboard');
    if (active && active.columnId !== null && this.mode() !== 'dialog') this.focusEditorElement(active.rowId, active.columnId);
  }

  /** An added row that was written keeps its temp id only until the write applied: map it to the stored id. */
  private resolveRowId(rowId: RowId): RowId {
    if (this.engine.getRowIndex(rowId) >= 0) return rowId;
    const write = this.facade()?.getLastWrite();
    const hit = write?.request.added.find((a) => a.tempId === rowId);
    return hit ? this.instance.getRowId(hit.row) : rowId;
  }

  /** F2, double click, toolbar Edit, command Edit. */
  begin(rowId: RowId, columnId: ColumnId | null, source: DataGridEventSource): boolean {
    const result = this.dispatch(source, columnId === null ? { type: 'edit.start', rowId } : { type: 'edit.start', rowId, columnId });
    if (result.status === 'rejected' && result.reason !== 'alreadyEditing') return false;
    this.focusAfter(rowId, columnId);
    return true;
  }

  /** Insert, toolbar Add. */
  add(source: DataGridEventSource): boolean {
    const result = this.dispatch(source, { type: 'edit.addRecord' });
    if (result.status === 'rejected') return false;
    const a = this.state()?.active;
    if (a?.columnId) requestAnimationFrameSafe(() => this.focusEditorElement(a.rowId, a.columnId as ColumnId));
    return true;
  }

  /** Delete, toolbar Delete, command Delete: with `confirmDelete` after a prompt. */
  requestDelete(rowIds: readonly RowId[], source: DataGridEventSource): boolean {
    if (rowIds.length === 0) return false;
    const o = this.state()?.options;
    if (!o?.enabled || !o.delete) return false;
    const run = (): void => {
      this.dispatch(source, { type: 'edit.deleteRecords', rowIds: [...rowIds] });
    };
    if (this.settings()?.confirmDelete) this.confirm('delete', this.text('confirmDelete', { count: rowIds.length }), run);
    else run();
    return true;
  }

  /** Enter / Save: commits the active editor; in batch mode with no editor open, saves the batch. */
  save(source: DataGridEventSource, scope: 'editor' | 'all' = 'all'): boolean {
    const state = this.state();
    const active = state?.active ?? null;
    const batch = this.mode() === 'batch';
    const command: DataGridCommand = batch && scope === 'all' ? { type: 'edit.saveBatch' } : { type: 'edit.commit' };
    if (!active && !(batch && scope === 'all')) return false;
    const blank = active !== null && active.rowId === state?.newRowId;
    const run = (): void => {
      const result = this.dispatch(source, command);
      if (result.status === 'applied') {
        if (blank) this.continueNewRow(active, source);
        else this.focusAfter(active?.rowId ?? null, active?.columnId ?? null);
      }
    };
    // a batch save from the toolbar or a menu asks first (`api.save()` does not come here).
    if (batch && scope === 'all' && this.settings()?.confirmSave !== false && (active !== null || this.facade()?.hasUnsavedChanges())) {
      this.confirm('save', this.text('confirmSave'), run);
    } else run();
    return true;
  }

  // ------------------------------------------------------------------------
  // Always-visible add row
  // ------------------------------------------------------------------------

  /** The add row has a changed value. */
  private newRowTouched(rowId: RowId): boolean {
    return ((this.facade()?.rowFlags(rowId) ?? 0) & EDIT_DIRTY) !== 0;
  }

  /**
   * After the add row was saved (or left untouched): edit the add row again,
   * the fresh one from its first cell, so entry continues row after row.
   */
  private continueNewRow(previous: { rowId: RowId; columnId: ColumnId | null }, source: DataGridEventSource): void {
    const id = this.state()?.newRowId;
    if (!id) return;
    const columnId = id === previous.rowId ? previous.columnId : (this.facade()?.getEditableColumnIds(id)[0] ?? null);
    if (columnId === null) return;
    if (this.dispatch(source, { type: 'edit.start', rowId: id, columnId }).status === 'rejected') return;
    requestAnimationFrameSafe(() => this.focusEditorElement(id, columnId));
  }

  /** Focus entered an add row editor: the add row becomes the active row (the cell that has focus). */
  private onFocusIn(event: FocusEvent): void {
    const target = event.target as Element | null;
    const row = target?.closest?.<HTMLElement>('[data-new-row]');
    if (!row || !target?.closest('.salmon-data-grid-editor')) return;
    const state = this.state();
    const rowId = row.dataset['rowId'];
    const columnId = target.closest<HTMLElement>('.salmon-data-grid-cell')?.dataset['columnId'];
    if (!state || rowId === undefined || rowId !== state.newRowId || columnId === undefined) return;
    const active = state.active;
    // Locked while another row edits; nothing to do when the cell already is the active one.
    if (active && (active.rowId !== rowId || active.columnId === columnId)) return;
    this.dispatch(this.instance.currentSource(), { type: 'edit.start', rowId, columnId });
  }

  /** Focus left the untouched add row: it stops being the active row (a touched one stays open). */
  private onFocusOut(event: FocusEvent): void {
    const state = this.state();
    const id = state?.newRowId;
    if (!id || state.active?.rowId !== id) return;
    const from = (event.target as Element | null)?.closest?.<HTMLElement>('[data-new-row]');
    if (!from || from.dataset['rowId'] !== id) return;
    const to = event.relatedTarget as Element | null;
    if (to?.closest?.('[data-new-row]') === from || this.newRowTouched(id)) return;
    this.quiet = true;
    try {
      this.dispatch(this.instance.currentSource(), { type: 'edit.commit' });
    } finally {
      this.quiet = false;
    }
  }

  /** Escape / Cancel: discards the active editor; in batch mode without one, every pending change (confirmed). */
  cancel(source: DataGridEventSource): boolean {
    const active = this.state()?.active ?? null;
    if (active) {
      const blank = active.rowId === this.state()?.newRowId;
      const result = this.dispatch(source, { type: 'edit.cancel' });
      // The cleared add row remounts empty: focus returns to the grid's focused cell.
      if (result.status === 'applied') {
        if (blank) this.instance.interaction.focusContent();
        else this.focusAfter(active.rowId, active.columnId);
      }
      return true;
    }
    if (this.mode() !== 'batch' || !this.facade()?.hasUnsavedChanges()) return false;
    const run = (): void => {
      this.dispatch(source, { type: 'edit.cancelBatch' });
    };
    if (this.settings()?.confirmDiscard !== false) this.confirm('discard', this.text('confirmDiscard'), run);
    else run();
    return true;
  }

  /** Tab / Shift+Tab / Enter / Shift+Enter inside an editor. */
  commitAndMove(direction: 'next' | 'previous' | 'down' | 'up', source: DataGridEventSource): boolean {
    const active = this.state()?.active ?? null;
    if (!active) return false;
    const blank = active.rowId === this.state()?.newRowId;
    // Tab out of the untouched add row: the browser moves focus on (focus out ends its edit).
    if (blank && !this.newRowTouched(active.rowId) && this.moveWrites(direction)) return false;
    const result = this.dispatch(source, { type: 'edit.commitAndMove', direction });
    // Invalid or validating: the editor stays open and keeps the key.
    if (result.status === 'applied') {
      if (blank && this.state()?.active == null) this.continueNewRow(active, source);
      else this.focusAfter(active.rowId, active.columnId);
    }
    return true;
  }

  setValue(rowId: RowId, columnId: ColumnId, input: unknown, source: DataGridEventSource = 'keyboard'): void {
    this.dispatch(source, { type: 'edit.setValue', rowId, columnId, value: toEditInput(input) });
  }

  /** Command column click. */
  runCommandItem(item: DataGridCommandItem<Row>, rowId: RowId, source: DataGridEventSource): void {
    const p = this.instance.props;
    if (p.onCommandClick) {
      const event = gridEvent<DataGridCommandClickEvent<Row>>('commandClick', source, { command: item, rowId, row: this.editedRow(rowId) ?? this.engine.getRow(rowId) });
      p.onCommandClick(event);
      if (event.defaultPrevented) return;
    }
    switch (item.type) {
      case 'edit':
        this.begin(rowId, null, source);
        return;
      case 'delete':
        this.requestDelete([rowId], source);
        return;
      case 'save':
        if (this.state()?.active?.rowId === rowId) this.save(source, 'editor');
        return;
      case 'cancel':
        if (this.state()?.active?.rowId === rowId) this.cancel(source);
        return;
      default:
        item.onClick?.({ rowId, row: (this.editedRow(rowId) ?? this.engine.getRow(rowId)) as Row });
    }
  }

  // ------------------------------------------------------------------------
  // Keyboard and UI commands
  // ------------------------------------------------------------------------

  private focusedCell(): { rowId: RowId; columnId: ColumnId } | null {
    const t = this.instance.interaction.focusTarget();
    if (!t || t.kind !== 'cell' || t.rowId.startsWith('__g')) return null;
    return { rowId: t.rowId, columnId: t.columnId };
  }

  private selectedRowIds(): readonly RowId[] {
    return (this.engine as unknown as { selection?: { getSelectedRowIds(): readonly RowId[] } }).selection?.getSelectedRowIds() ?? [];
  }

  /** Rows the Delete key acts on: the selection when the focused row is selected, else the focused row. */
  private deleteTargets(): readonly RowId[] {
    const cell = this.focusedCell();
    const selected = this.selectedRowIds();
    if (!cell) return selected;
    return selected.includes(cell.rowId) ? selected : [cell.rowId];
  }

  private inDialog(event: KeyboardEvent): boolean {
    return (event.target as Element | null)?.closest?.('.salmon-data-grid-edit-dialog') != null;
  }

  /** A key bound to an `edit.*` command; `DataGridEditUi` forwards the bindings. */
  key(command: EditKeyCommand, { nativeEvent }: Parameters<DataGridKeyHandler>[0]): boolean {
    switch (command) {
      case 'edit.begin': {
        const cell = this.focusedCell();
        return cell !== null && this.begin(cell.rowId, cell.columnId, 'keyboard');
      }
      case 'edit.add':
        return this.add('keyboard');
      case 'edit.delete':
        if (this.state()?.active) return false;
        return this.requestDelete(this.deleteTargets(), 'keyboard');
      case 'edit.save': {
        const target = nativeEvent.target as Element | null;
        if (target?.tagName === 'TEXTAREA' && !nativeEvent.ctrlKey && !nativeEvent.metaKey) return false;
        const mode = this.mode();
        if (mode === 'batch' && !this.inDialog(nativeEvent)) return this.commitAndMove('down', 'keyboard');
        return this.save('keyboard', 'editor');
      }
      case 'edit.saveUp':
        if (this.mode() !== 'batch' || this.inDialog(nativeEvent)) return false;
        return this.commitAndMove('up', 'keyboard');
      case 'edit.saveInPlace':
        return this.save('keyboard', 'editor');
      case 'edit.next':
        return !this.inDialog(nativeEvent) && this.commitAndMove('next', 'keyboard');
      case 'edit.previous':
        return !this.inDialog(nativeEvent) && this.commitAndMove('previous', 'keyboard');
      case 'edit.cancel':
        return this.cancel('keyboard');
      case 'edit.undo':
        return this.history('edit.undo');
      case 'edit.redo':
        return this.history('edit.redo');
    }
  }

  private history(type: 'edit.undo' | 'edit.redo'): boolean {
    const state = this.state() as (EditState & { options: { undo?: boolean } }) | undefined;
    if (!state?.options.undo || !this.engine.hasCommand(type) || state.active) return false;
    return this.dispatch('keyboard', { type }).status !== 'rejected';
  }

  private payloadRow(payload: Readonly<Record<string, unknown>>): RowId | null {
    const id = payload['rowId'];
    if (typeof id === 'string') return id;
    return this.focusedCell()?.rowId ?? this.selectedRowIds()[0] ?? null;
  }

  /** Toolbar / menu UI command; `DataGridEditUi` forwards the handlers. */
  uiCommand(command: EditUiCommand, payload: Readonly<Record<string, unknown>>): boolean {
    switch (command) {
      case 'edit.add':
        return this.add(this.instance.currentSource());
      case 'edit.begin': {
        const rowId = this.payloadRow(payload);
        if (rowId === null) return false;
        const columnId = typeof payload['columnId'] === 'string' ? (payload['columnId'] as string) : null;
        const mode = this.mode();
        return this.begin(rowId, mode === 'batch' || mode === 'cell' ? (columnId ?? this.focusedCell()?.columnId ?? null) : columnId, this.instance.currentSource());
      }
      case 'edit.delete': {
        const ids = Array.isArray(payload['rowIds']) ? (payload['rowIds'] as unknown[]).filter((id): id is string => typeof id === 'string') : this.deleteTargets();
        return this.requestDelete(ids.length ? ids : this.deleteTargets(), this.instance.currentSource());
      }
      case 'edit.save':
        return this.save(this.instance.currentSource());
      case 'edit.cancel':
        return this.cancel(this.instance.currentSource());
    }
  }

  // ------------------------------------------------------------------------
  // Lifecycle
  // ------------------------------------------------------------------------

  /** Listeners of the mounted grid (`DataGridEditUi.mount` adds double click and the replay of early input). */
  mount(): () => void {
    const engine = this.engine;
    const offBefore = engine.onBeforeCommand((event) => this.beforeCommand(event.command));
    const offAfter = engine.onCommand((event) => this.afterCommand(event));
    const root = this.instance.root;
    const win = root?.ownerDocument.defaultView ?? null;
    const onPointerDown = (event: PointerEvent): void => this.onPointerDown(event);
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      if (this.guardFor(null) && this.facade()?.hasUnsavedChanges()) event.preventDefault();
    };
    const onFocusIn = (event: FocusEvent): void => this.onFocusIn(event);
    const onFocusOut = (event: FocusEvent): void => this.onFocusOut(event);
    root?.addEventListener('pointerdown', onPointerDown, true);
    root?.addEventListener('focusin', onFocusIn);
    root?.addEventListener('focusout', onFocusOut);
    win?.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      offBefore();
      offAfter();
      root?.removeEventListener('pointerdown', onPointerDown, true);
      root?.removeEventListener('focusin', onFocusIn);
      root?.removeEventListener('focusout', onFocusOut);
      win?.removeEventListener('beforeunload', onBeforeUnload);
    };
  }

  /** Re-applies changed `editing` settings and editing text. */
  sync(prev: DataGridProps<Row>, props: DataGridProps<Row>): void {
    const before = scalarOptions(editingOf(prev) as DataGridEditing<unknown> | null);
    const next = scalarOptions(editingOf(props) as DataGridEditing<unknown> | null);
    const mode = editingOf(props)?.mode;
    const prevMode = editingOf(prev)?.mode;
    const options: Record<string, unknown> = { ...next };
    if (mode !== prevMode && mode !== undefined) options['mode'] = mode;
    const text = this.text;
    if (this.messagesText !== null && this.messagesText.catalog !== text.catalog) options['messages'] = messagesOf(text);
    this.messagesText = text;
    if (sameRecord(before, next) && mode === prevMode && options['messages'] === undefined) return;
    this.instance.syncDispatch({ type: 'edit.setOptions', options: options as never });
  }

  onDoubleClick(event: MouseEvent): void {
    if (event.defaultPrevented || event.button !== 0) return;
    if (this.settings()?.editOnDoubleClick === false) return;
    const target = event.target as Element;
    if (target.closest('.salmon-data-grid-editor, .salmon-data-grid-command')) return;
    const cell = target.closest<HTMLElement>('.salmon-data-grid-rows .salmon-data-grid-cell, .salmon-data-grid-added-rows .salmon-data-grid-cell');
    const rowId = cell?.closest<HTMLElement>('[data-row-id]')?.dataset['rowId'];
    const columnId = cell?.dataset['columnId'];
    if (!cell || rowId === undefined || columnId === undefined || rowId.startsWith('__g')) return;
    const source: DataGridEventSource = event instanceof PointerEvent && event.pointerType === 'touch' ? 'touch' : 'pointer';
    if (this.begin(rowId, columnId, source)) event.preventDefault();
  }

  /** Batch and cell mode: pressing another cell closes the open cell editor. */
  private onPointerDown(event: PointerEvent): void {
    const active = this.state()?.active;
    const mode = this.mode();
    if (!active || (mode !== 'batch' && mode !== 'cell') || event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('.salmon-data-grid-editor')) return;
    const cell = target.closest<HTMLElement>('.salmon-data-grid-cell');
    const rowId = cell?.closest<HTMLElement>('[data-row-id]')?.dataset['rowId'];
    if (cell && rowId === active.rowId && cell.dataset['columnId'] === active.columnId) return;
    this.dispatch('pointer', { type: 'edit.commit' });
  }

  // ------------------------------------------------------------------------
  // Unsaved-changes guard
  // ------------------------------------------------------------------------

  /** Whether `command` (or, with null, page unload) is guarded. */
  private guardFor(command: string | null): boolean {
    const editing = this.settings();
    if (!editing) return false;
    const guard = editing.guardUnsaved ?? this.mode() === 'batch';
    if (!guard) return false;
    if (command === null) return true;
    const actions: readonly DataGridGuardedAction[] = guard === true ? ['sort', 'filter', 'search', 'page', 'group'] : guard;
    return actions.some((a) => GUARDED[a].includes(command));
  }

  private discardAll(): void {
    const state = this.state();
    if (!state) return;
    this.instance.engine.batch(() => {
      if (state.active) this.engine.dispatch({ type: 'edit.cancel' });
      if (state.options.mode === 'batch') this.engine.dispatch({ type: 'edit.cancelBatch' });
    });
  }

  private guard(command: DataGridCommand): boolean | void {
    if (this.bypass > 0 || !this.guardFor(command.type) || !this.facade()?.hasUnsavedChanges()) return;
    const replay = (): void => {
      this.discardAll();
      this.bypass++;
      try {
        this.engine.dispatch({ ...(command as object) } as DataGridCommand);
      } finally {
        this.bypass--;
      }
    };
    if (this.settings()?.confirmDiscard === false) {
      this.discardAll();
      return;
    }
    this.confirm('discard', this.text('unsavedChangesLost'), replay);
    return false;
  }

  // ------------------------------------------------------------------------
  // Events and announcements
  // ------------------------------------------------------------------------

  private writePreview(scope: 'active' | 'batch'): { added: readonly RowId[]; changed: readonly { rowId: RowId; fields: readonly string[] }[]; deleted: readonly RowId[] } | null {
    const preview = this.facade()?.previewWrite(scope);
    if (!preview) return null;
    if (!preview.added.length && !preview.changed.length && !preview.deleted.length) return null;
    return { added: preview.added, changed: preview.changed.map((c) => ({ rowId: c.rowId, fields: c.columnIds })), deleted: preview.deleted };
  }

  /** Whether `edit.commitAndMove` leaves the row (row and dialog mode write it then). */
  private moveWrites(direction: 'next' | 'previous' | 'down' | 'up'): boolean {
    const state = this.state();
    const active = state?.active;
    if (!state || !active) return false;
    const mode = state.options.mode;
    if (mode === 'batch') return false;
    if (mode === 'cell') return true;
    const from = active.columnId;
    if (from === null) return true;
    const target = this.facade()?.nextEditableCell(active.rowId, from, direction);
    return !target || target.rowId !== active.rowId;
  }

  private beforeCommand(command: DataGridCommand): boolean | void {
    if (this.instance.isSyncing()) return;
    const type = command.type;
    if (!type.startsWith('edit.')) return this.guard(command);
    const p = this.instance.props;
    const source = this.instance.currentSource();
    const state = this.state();
    if (!state) return;
    const mode = state.options.mode;
    switch (type) {
      case 'edit.start': {
        this.startFrom = state.active?.rowId ?? null;
        if (!p.onBeforeEditStart && !p.onEditStart) return;
        const rowId = command['rowId'] as RowId;
        const columnId = (command['columnId'] as ColumnId | undefined) ?? null;
        const isNew = state.addedRowIds.includes(rowId) || rowId === state.newRowId;
        // `edit: false`: the core refuses the start; no before-event for a disabled action.
        if (!state.options.enabled || (!isNew && !state.options.edit)) return;
        const event = gridEvent<DataGridEditStartEvent<Row>>('beforeEditStart', source, { rowId, row: this.editedRow(rowId) ?? this.engine.getRow(rowId), field: columnId, mode, isNew });
        p.onBeforeEditStart?.(event);
        if (event.defaultPrevented) return false;
        this.pendingStart = event;
        return;
      }
      case 'edit.setValue': {
        if (!p.onBeforeCellValueChange && !p.onCellValueChange) return;
        const rowId = command['rowId'] as RowId;
        const field = command['columnId'] as ColumnId;
        const previousValue = this.facade()?.getValue(rowId, field);
        if (p.onBeforeCellValueChange) {
          const event = gridEvent<DataGridCellValueChangeEvent>('beforeCellValueChange', source, { rowId, field, value: command['value'], previousValue });
          p.onBeforeCellValueChange(event);
          if (event.defaultPrevented) return false;
        }
        this.pendingValue = { previous: previousValue };
        return;
      }
      case 'edit.commit':
      case 'edit.commitAndMove':
      case 'edit.saveBatch': {
        if (!p.onBeforeSave && !p.onSave) return;
        if (type === 'edit.commitAndMove' && !this.moveWrites(command['direction'] as 'next')) return;
        if (type === 'edit.commit' && mode === 'batch') return;
        const preview = this.writePreview(type === 'edit.saveBatch' ? 'batch' : 'active');
        if (!preview) return;
        const facade = this.facade() as Facade<Row>;
        const fields = { mode, ...preview, status: 'pending', result: null, error: null, failedRowIds: NO_ROW_IDS } as Omit<DataGridSaveEvent<Row>, 'type' | 'source' | 'defaultPrevented' | 'preventDefault' | 'rows'>;
        lazyField(fields, 'rows', () => () => facade.getBatchChanges());
        const event = gridEvent<DataGridSaveEvent<Row>>('beforeSave', source, fields as never);
        p.onBeforeSave?.(event);
        if (event.defaultPrevented) return false;
        this.pendingSave = { event, type, before: facade.getSubmittedWrite() };
        return;
      }
      case 'edit.addRecord': {
        if (!p.onBeforeAdd && !p.onAdd) return;
        if (!state.options.enabled || !state.options.add) return;
        const position = (command['position'] as 'top' | 'bottom' | undefined) ?? state.options.newRowPosition;
        const event = gridEvent<DataGridAddEvent<Row>>('beforeAdd', source, { row: command['values'] as Record<string, unknown> | undefined, position, rowId: null, isNew: true });
        p.onBeforeAdd?.(event);
        if (event.defaultPrevented) return false;
        this.pendingAdd = event;
        return;
      }
      case 'edit.deleteRecords': {
        if (!p.onBeforeDelete && !p.onDelete) return;
        if (!state.options.enabled || !state.options.delete) return;
        const rowIds = [...((command['rowIds'] as RowId[] | undefined) ?? [])];
        const fields = { rowIds, mode } as { rowIds: RowId[]; mode: EditMode; rows?: () => readonly Row[] };
        fields.rows = () => rowIds.map((id) => this.editedRow(id) ?? this.engine.getRow(id)).filter((r): r is Row => r !== undefined);
        const event = gridEvent<DataGridDeleteEvent<Row>>('beforeDelete', source, fields as never);
        p.onBeforeDelete?.(event);
        if (event.defaultPrevented) return false;
        this.pendingDelete = event;
        return;
      }
      case 'edit.cancel':
      case 'edit.cancelBatch': {
        if (!p.onBeforeEditCancel && !p.onEditCancel) return;
        const active = state.active;
        if (type === 'edit.cancel' && !active) return;
        const event = gridEvent<DataGridEditCancelEvent>('beforeEditCancel', source, {
          rowId: active?.rowId ?? null,
          field: active?.columnId ?? null,
          scope: type === 'edit.cancelBatch' ? 'batch' : 'editor',
        });
        p.onBeforeEditCancel?.(event);
        if (event.defaultPrevented) return false;
        this.pendingCancel = event;
        return;
      }
      default:
        return;
    }
  }

  /**
   * After a write settled (`edit.settle` of a write token): `onSave` for the
   * save that sent it, and `onError` with `action: 'save'` when the write
   * failed (any save or delete).
   */
  private settled(lastError: string | null): void {
    const outcome = this.facade()?.getLastWrite();
    if (!outcome || outcome.token === this.reportedWrite) return;
    this.reportedWrite = outcome.token;
    const pending = this.savesInFlight.get(outcome.token);
    this.savesInFlight.delete(outcome.token);
    const request = outcome.request;
    const failed = outcome.failedRowIds;
    const touched = request.added.length + request.changed.length + request.deleted.length;
    const thrown = outcome.error !== null && outcome.error !== undefined;
    const status: DataGridSaveStatus = thrown ? 'error' : failed.length === 0 && outcome.result?.status !== 'rejected' ? 'applied' : failed.length >= touched ? 'rejected' : 'partial';
    const error = thrown ? (outcome.error instanceof Error ? outcome.error : new Error(String(outcome.error))) : null;
    const p = this.instance.props;
    if (pending && p.onSave) {
      const e = pending;
      const result = outcome.result;
      const fields = { mode: e.mode, added: e.added, changed: e.changed, deleted: e.deleted, status, result, error, failedRowIds: failed } as Record<string, unknown>;
      fields['rows'] = (): EditBatchChanges<Row> => {
        const addedEcho = new Map((result?.added ?? []).map((a) => [a.tempId, a.row]));
        const changedEcho = new Map((result?.changed ?? []).map((c) => [c.rowId, c.row]));
        return Object.freeze({
          addedRecords: Object.freeze(request.added.map((a) => addedEcho.get(a.tempId) ?? a.row)),
          changedRecords: Object.freeze(request.changed.map((c) => changedEcho.get(c.rowId) ?? c.row)),
          deletedRecords: Object.freeze(request.deleted.map((d) => d.row)),
        });
      };
      p.onSave(gridEvent<DataGridSaveEvent<Row>>('save', e.source, fields as never));
    }
    if (status !== 'applied' && p.onError) {
      const reported = error ?? new Error(lastError ?? this.text('saveFailed'));
      p.onError(gridEvent<DataGridErrorEvent>('error', pending?.source ?? 'api', { error: reported, action: 'save' }));
    }
  }

  private afterCommand(event: CommandEvent): void {
    const type = event.command.type;
    if (!type.startsWith('edit.') || this.quiet) return;
    const ok = event.result.status !== 'rejected';
    const p = this.instance.props;
    const interaction = this.instance.interaction;
    const state = this.state();
    const source = this.instance.currentSource();
    switch (type) {
      case 'edit.start': {
        const pending = this.pendingStart;
        this.pendingStart = null;
        if (!ok) return;
        const a = state?.active;
        const rowMode = state?.options.mode === 'row' || state?.options.mode === 'dialog';
        // Row modes announce entering a row, not every cell of it.
        if (a && !(rowMode && a.rowId === this.startFrom)) interaction.announce(state?.options.mode === 'row' || state?.options.mode === 'dialog' ? this.text('editingRow') : this.text('editingCell', { column: this.header(a.columnId) }));
        if (pending && p.onEditStart) p.onEditStart(gridEvent<DataGridEditStartEvent<Row>>('editStart', pending.source, { rowId: pending.rowId, row: pending.row, field: a?.columnId ?? pending.field, mode: pending.mode, isNew: pending.isNew }));
        return;
      }
      case 'edit.setValue': {
        const pending = this.pendingValue;
        this.pendingValue = null;
        if (!ok || !pending || !p.onCellValueChange) return;
        const rowId = event.command['rowId'] as RowId;
        const field = event.command['columnId'] as ColumnId;
        p.onCellValueChange(gridEvent<DataGridCellValueChangeEvent>('cellValueChange', source, { rowId, field, value: this.facade()?.getValue(rowId, field), previousValue: pending.previous }));
        return;
      }
      case 'edit.commit':
      case 'edit.commitAndMove':
      case 'edit.saveBatch': {
        const pending = this.pendingSave;
        this.pendingSave = null;
        if (!ok) return;
        if (type !== 'edit.commitAndMove' || pending) interaction.announce(this.text('editSaved'));
        // `onSave` fires once the write this command sent settles (edit.settle below).
        if (pending) {
          const token = this.facade()?.getSubmittedWrite() ?? pending.before;
          if (token !== pending.before) this.savesInFlight.set(token, pending.event);
        }
        return;
      }
      case 'edit.addRecord': {
        const pending = this.pendingAdd;
        this.pendingAdd = null;
        if (!ok) return;
        interaction.announce(this.text('rowAdded'));
        const rowId = state?.active?.rowId ?? state?.addedRowIds[state.options.newRowPosition === 'top' ? 0 : state.addedRowIds.length - 1] ?? null;
        if (pending && p.onAdd) p.onAdd(gridEvent<DataGridAddEvent<Row>>('add', pending.source, { row: pending.row, position: pending.position, rowId, isNew: true }));
        return;
      }
      case 'edit.deleteRecords': {
        const pending = this.pendingDelete;
        this.pendingDelete = null;
        if (!ok) return;
        const ids = (event.command['rowIds'] as RowId[] | undefined) ?? [];
        interaction.announce(this.text('rowsDeleted', { count: ids.length }));
        if (pending && p.onDelete) {
          const rows = pending.rows;
          p.onDelete(gridEvent<DataGridDeleteEvent<Row>>('delete', pending.source, { rowIds: pending.rowIds, mode: pending.mode, rows } as never));
        }
        return;
      }
      case 'edit.cancel':
      case 'edit.cancelBatch': {
        const pending = this.pendingCancel;
        this.pendingCancel = null;
        if (!ok) return;
        interaction.announce(this.text('editCancelled'));
        if (pending && p.onEditCancel) p.onEditCancel(gridEvent<DataGridEditCancelEvent>('editCancel', pending.source, { rowId: pending.rowId, field: pending.field, scope: pending.scope }));
        return;
      }
      case 'edit.settle': {
        if (state?.status === 'error' && state.lastError) interaction.announce(state.lastError, true);
        this.settled(state?.lastError ?? null);
        return;
      }
      default:
        return;
    }
  }
}
