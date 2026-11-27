// Column chrome controller for one DataGrid: the overlay store (one open
// overlay at a time: column menu, filter menu, column chooser, context menu,
// toolbar overflow), built-in menu items (their actions are menu-action.ts,
// in the lazy overlays chunk), pin/unpin, the
// UI command registry for optional modules (editing, export, print), toolbar
// item enablement, and the keyboard handlers of the header and context-menu
// bindings. Overlay state is renderer-local (never React state, never in the
// engine snapshot); React reads it through useSyncExternalStore.

import { columnZone, getColumnFilters, type ColumnId, type CommandResult, type CompiledColumn, type DataGridCommand, type RowId } from '@salmonui/data-grid/engine';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import type {
  DataGridChromeColumn,
  DataGridColumnChooserOpenEvent,
  DataGridColumnMenuCloseEvent,
  DataGridColumnMenuItemId,
  DataGridColumnMenuOpenEvent,
  DataGridColumnPin,
  DataGridColumnPinChangeEvent,
  DataGridCommandHandler,
  DataGridContextMenuCloseEvent,
  DataGridContextMenuItemId,
  DataGridContextMenuOpenEvent,
  DataGridContextMenuTarget,
  DataGridMenuItem,
  DataGridToolbarItem,
  DataGridToolbarItemClickEvent,
  DataGridToolbarItemId,
} from './chrome-types.js';
import { columnInfo, columnInfos } from './column-info.js';
import { pinOfColumn } from './fixed-zone.js';
import { gridEvent, lazyField, type DataGridEventSource } from '@salmonui/core/internal/events';
import { canGroupColumn } from './group-static.js';
import type { DataGridInstance } from './instance.js';
import { DEFAULT_GRID_TEXT, type DataGridLocaleTextKey, type DataGridText } from './locale-text.js';
import { pointRect, rectOf, type AnchorRect } from './anchor.js';
import type { DataGridColumn, DataGridProps } from './types.js';
import { filteringOf, gridFilters } from './query-config.js';
import type { DataGridFilterBuilderOpenEvent } from './filter-builder-types.js';
import type { DataGridFilterMenuOpenEvent, DataGridFilterUi } from './query-types.js';
import { portalScopeOf } from '@salmonui/core/internal/modal-host';

export type OverlayState =
  | { readonly kind: 'columnMenu'; readonly columnId: ColumnId; readonly anchor: AnchorRect; readonly container: Element; readonly items: readonly DataGridMenuItem[] }
  | { readonly kind: 'filterMenu'; readonly columnId: ColumnId; readonly anchor: AnchorRect; readonly container: Element; readonly source: DataGridEventSource }
  | { readonly kind: 'contextMenu'; readonly target: DataGridContextMenuTarget; readonly anchor: AnchorRect; readonly container: Element; readonly items: readonly DataGridMenuItem[] }
  | { readonly kind: 'columnChooser'; readonly anchor: AnchorRect; readonly container: Element }
  | { readonly kind: 'filterBuilder'; readonly anchor: AnchorRect; readonly container: Element }
  | { readonly kind: 'toolbarOverflow'; readonly anchor: AnchorRect; readonly container: Element; readonly items: readonly DataGridMenuItem[] };

type Source = DataGridEventSource;

/** A resolved toolbar item: `builtIn` is set for built-in ids (internal; not part of the public item type). */
export type ResolvedToolbarItem = DataGridToolbarItem & { readonly builtIn?: DataGridToolbarItemId };

/**
 * Props the chrome reads while rendering. Renders pass the current props
 * (from `DataGridRenderOptions`), because `instance.props` is only synced in a
 * layout effect after the render; event handlers use `instance.props`.
 */
export interface ChromeSettings {
  readonly columnMenu?: DataGridProps<unknown>['columnMenu'] | undefined;
  readonly filtering?: DataGridProps<unknown>['filtering'] | undefined;
  readonly toolbar?: DataGridProps<unknown>['toolbar'] | undefined;
  readonly columnChooser?: DataGridProps<unknown>['columnChooser'] | undefined;
}

const COLUMN_MENU_DEFAULT: readonly (DataGridColumnMenuItemId | 'separator')[] = [
  'autoSizeAll', 'autoSize', 'separator', 'group', 'ungroup', 'separator', 'sortAscending', 'sortDescending', 'clearSort',
  'separator', 'filter', 'columnChooser', 'separator', 'pinStart', 'pinEnd', 'unpin',
];
const CONTEXT_HEADER_DEFAULT: readonly (DataGridContextMenuItemId | 'separator')[] = [
  'autoSizeAll', 'autoSize', 'separator', 'group', 'ungroup', 'separator', 'sortAscending', 'sortDescending', 'separator', 'pinStart', 'pinEnd', 'unpin',
];
const CONTEXT_CELL_DEFAULT: readonly (DataGridContextMenuItemId | 'separator')[] = [
  'edit', 'delete', 'save', 'cancel', 'separator', 'copy', 'separator', 'exportExcel', 'exportPdf', 'exportCsv',
];
const CONTEXT_PAGER_DEFAULT: readonly (DataGridContextMenuItemId | 'separator')[] = ['firstPage', 'previousPage', 'nextPage', 'lastPage'];

/**
 * Area of a built-in context-menu id (header, content or pager). A listed id renders only on its
 * area, so a `contextMenu` array mixing header, row and pager items shows each
 * on its own target.
 */
const HEADER_ITEMS: ReadonlySet<string> = new Set(['autoSize', 'autoSizeAll', 'group', 'ungroup', 'sortAscending', 'sortDescending', 'clearSort', 'filter', 'columnChooser', 'pinStart', 'pinEnd', 'unpin']);
const PAGER_ITEMS: ReadonlySet<string> = new Set(['firstPage', 'previousPage', 'nextPage', 'lastPage']);

/** Whether a context-menu item applies to `target` (built-in area, or the custom item's `targets`). */
function itemOnTarget(raw: string | DataGridMenuItem, target: DataGridContextMenuTarget): boolean {
  if (typeof raw !== 'string') return raw.targets === undefined || raw.targets.includes(target.kind);
  if (raw === 'separator') return true;
  if (HEADER_ITEMS.has(raw)) return target.kind === 'header';
  if (PAGER_ITEMS.has(raw)) return target.kind === 'pager';
  // Content items: edit, delete, save, cancel, copy, exports.
  return target.kind !== 'header' && target.kind !== 'pager';
}

const TOOLBAR_IDS: ReadonlySet<string> = new Set<DataGridToolbarItemId>([
  'add', 'edit', 'save', 'delete', 'cancel', 'search', 'print', 'columnChooser', 'exportExcel', 'exportPdf', 'exportCsv', 'expandAll', 'collapseAll', 'copy', 'filterBuilder', 'indent', 'outdent',
]);

/** Built-in UI commands of toolbar and context-menu items. */
export const ITEM_COMMANDS: Readonly<Record<string, string>> = {
  add: 'edit.add',
  edit: 'edit.begin',
  delete: 'edit.delete',
  save: 'edit.save',
  cancel: 'edit.cancel',
  copy: 'clipboard.copy',
  exportExcel: 'export.excel',
  exportPdf: 'export.pdf',
  exportCsv: 'export.csv',
  print: 'grid.print',
  indent: 'tree.indent',
  outdent: 'tree.outdent',
};

/** `localeText` key of the feature named in "... is not available". */
const FEATURE_OF: Readonly<Record<string, DataGridLocaleTextKey>> = {
  'edit.add': 'featureEditing',
  'edit.begin': 'featureEditing',
  'edit.delete': 'featureEditing',
  'edit.save': 'featureEditing',
  'edit.cancel': 'featureEditing',
  'clipboard.copy': 'featureClipboard',
  'export.excel': 'featureExcelExport',
  'export.pdf': 'featurePdfExport',
  'export.csv': 'featureCsvExport',
  'grid.print': 'featurePrint',
};

/** Export and print UI commands and their `DataGridOutput` format. */
const OUTPUT_OF: Readonly<Record<string, string>> = { 'export.excel': 'excel', 'export.pdf': 'pdf', 'export.csv': 'csv', 'grid.print': 'print' };


type Listener = () => void;

/** Open touch multi-sort popup: the header it sits by and the toggle state. */
export interface TouchSortState {
  readonly columnId: ColumnId;
  readonly multi: boolean;
}

export class DataGridChrome<Row> {
  /** @internal */
  readonly instance: DataGridInstance<Row>;
  /** @internal */
  overlay: OverlayState | null = null;
  /** @internal */
  returnFocus: { el: Element | null; columnId: ColumnId | null } = { el: null, columnId: null };
  private readonly listeners = new Set<Listener>();
  private readonly commandHandlers = new Map<string, DataGridCommandHandler[]>();
  private toolbarVersion = 0;
  /** @internal */
  replacing = false;
  private readonly toolbarListeners = new Set<Listener>();

  constructor(instance: DataGridInstance<Row>) {
    this.instance = instance;
    this.registerKeys();
  }

  private get engine() {
    return this.instance.engine;
  }

  private get text() {
    return this.instance.interaction.text;
  }

  // ------------------------------------------------------------------------
  // Overlay store
  // ------------------------------------------------------------------------

  readonly subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  readonly getOverlay = (): OverlayState | null => this.overlay;
  readonly getServerOverlay = (): OverlayState | null => null;

  /** Touch multi-sort popup (`touch-sort-popup.tsx`): its header and toggle; null while hidden. */
  touchSort: TouchSortState | null = null;
  readonly getTouchSort = (): TouchSortState | null => this.touchSort;
  /** Shows, moves or toggles the popup; null hides it and turns the toggle off. */
  readonly setTouchSort = (next: TouchSortState | null): void => {
    this.touchSort = next;
    this.emit();
  };

  /** @internal */
  emit(): void {
    for (const l of this.listeners) l();
  }

  private container(): Element | null {
    // The open modal dialog around the grid (everything outside it is inert), else the theme scope.
    const root = this.instance.root;
    return root ? portalScopeOf(root) : null;
  }

  private show(next: OverlayState, returnTo: Element | null, columnId: ColumnId | null): void {
    // Keep the original invoker when one overlay replaces another (column menu -> filter menu).
    if (!this.overlay && !this.replacing) this.returnFocus = { el: returnTo, columnId };
    this.replacing = false;
    this.overlay = next;
    this.emit();
  }

  /** `onBeforeColumnMenuClose` / `onBeforeContextMenuClose`; false when the handler keeps the menu open. */
  allowClose(source: Source): boolean {
    const overlay = this.overlay;
    const p = this.instance.props;
    if (overlay?.kind === 'columnMenu' && p.onBeforeColumnMenuClose) {
      const column = this.column(overlay.columnId);
      if (!column) return true;
      const event = gridEvent<DataGridColumnMenuCloseEvent<Row>>('beforeColumnMenuClose', source, { field: overlay.columnId, column: columnInfo(column) });
      p.onBeforeColumnMenuClose(event);
      return !event.defaultPrevented;
    }
    if (overlay?.kind === 'contextMenu' && p.onBeforeContextMenuClose) {
      const event = gridEvent<DataGridContextMenuCloseEvent>('beforeContextMenuClose', source, { target: overlay.target });
      p.onBeforeContextMenuClose(event);
      return !event.defaultPrevented;
    }
    return true;
  }

  /**
   * Closes the overlay; focus returns to the invoker (or its header cell
   * after a remount). Menus raise their before-close event first.
   */
  readonly close = (restore = true, source: Source = 'pointer'): void => {
    if (!this.overlay) return;
    if (!this.allowClose(source)) return;
    this.overlay = null;
    const { el, columnId } = this.returnFocus;
    this.returnFocus = { el: null, columnId: null };
    this.emit();
    if (!restore) return;
    if (el && el.isConnected && el instanceof HTMLElement) el.focus({ preventScroll: true });
    else if (columnId !== null) this.instance.api.focusHeader(columnId);
    else this.instance.interaction.focusContent();
  };

  isOpen(): boolean {
    return this.overlay !== null;
  }

  // ------------------------------------------------------------------------
  // Feature checks
  // ------------------------------------------------------------------------

  column(columnId: ColumnId | null | undefined): CompiledColumn<Row> | undefined {
    if (columnId == null) return undefined;
    const col = this.engine.getSnapshot().columns.byId.get(columnId);
    return col?.leaf ? col : undefined;
  }

  /** Leaf column of a public key: the column id first, then the first leaf with that `field`. */
  resolve(field: string): CompiledColumn<Row> | undefined {
    const columns = this.engine.getSnapshot().columns;
    const byId = columns.byId.get(field);
    if (byId) return byId.leaf ? byId : undefined;
    return columns.leaves.find((c) => c.field === field);
  }

  columnMenuEnabled(column: CompiledColumn<Row>, p: ChromeSettings = this.instance.props): boolean {
    const prop = p.columnMenu;
    if (!prop) return false;
    if (this.instance.interaction.isSelectionColumn(column)) return false;
    return (column.def as DataGridChromeColumn<Row>).menu !== false;
  }

  /** Filter UI shows for the grid: the `filtering` prop and an enabled filter module. */
  filteringUi(p: ChromeSettings = this.instance.props): boolean {
    return filteringOf(p) !== undefined && this.engine.getModuleState<{ enabled: boolean }>('filter')?.enabled === true;
  }

  filterable(column: CompiledColumn<Row>, p: ChromeSettings = this.instance.props): boolean {
    return this.filteringUi(p) && column.flags.allowFiltering && !this.instance.interaction.isSelectionColumn(column);
  }

  /** `column.filter.ui`, else `filtering.ui` (default `row`). */
  filterUi(column: CompiledColumn<Row>, p: ChromeSettings = this.instance.props): DataGridFilterUi {
    return (column.def as DataGridColumn<Row>).filter?.ui ?? filteringOf(p)?.ui ?? 'row';
  }

  filterButtonEnabled(column: CompiledColumn<Row>, p: ChromeSettings = this.instance.props): boolean {
    if (!this.filterable(column, p)) return false;
    if (filteringOf(p)?.headerButton === false) return false;
    return this.filterUi(column, p) !== 'row';
  }

  filterBarEnabled(p: ChromeSettings = this.instance.props): boolean {
    return this.filteringUi(p) && (filteringOf(p)?.ui ?? 'row') === 'row';
  }

  chooserEnabled(): boolean {
    if (this.chooserDisabled()) return false;
    return this.instance.props.columnChooser !== undefined
      ? true
      : (this.instance.props.toolbar ?? []).some((i) => (typeof i === 'string' ? i : i.id) === 'columnChooser');
  }

  /** `columnChooser={false}` turns the chooser off everywhere: the menu item, the toolbar item, and `api.openColumnChooser()`. */
  chooserDisabled(p: ChromeSettings = this.instance.props): boolean {
    return p.columnChooser === false;
  }

  private sortable(column: CompiledColumn<Row>): boolean {
    return this.instance.sortable && column.flags.allowSorting;
  }

  private sortDirection(columnId: ColumnId): 'asc' | 'desc' | null {
    return this.engine.getSnapshot().query.sorting.find((s) => s.columnId === columnId)?.direction ?? null;
  }

  private grouped(columnId: ColumnId): boolean {
    return this.engine.getSnapshot().query.grouping.some((g) => g.columnId === columnId);
  }

  private zone(columnId: ColumnId): 'left' | 'center' | 'right' {
    return columnZone(this.engine.getSnapshot().columns, columnId);
  }

  // ------------------------------------------------------------------------
  // UI commands (editing, clipboard, export, print)
  // ------------------------------------------------------------------------

  registerCommandHandler(command: string, handler: DataGridCommandHandler): () => void {
    const list = this.commandHandlers.get(command) ?? [];
    this.commandHandlers.set(command, [...list, handler]);
    this.bumpToolbar();
    return () => {
      const current = this.commandHandlers.get(command);
      if (current) this.commandHandlers.set(command, current.filter((h) => h !== handler));
      this.bumpToolbar();
    };
  }

  commandAvailable(command: string): boolean {
    return (this.commandHandlers.get(command)?.length ?? 0) > 0 || this.builtInAvailable(command) || this.engine.hasCommand(command);
  }

  /** UI commands backed by the core `edit` / `clipboard` modules when they are registered. */
  private builtInAvailable(command: string): boolean {
    const e = this.engine;
    switch (command) {
      case 'edit.add':
        return e.hasCommand('edit.addRecord');
      case 'edit.begin':
        return e.hasCommand('edit.start');
      case 'edit.delete':
        return e.hasCommand('edit.deleteRecords');
      case 'edit.save':
        return e.hasCommand('edit.commit');
      case 'edit.cancel':
        return e.hasCommand('edit.cancel');
      case 'clipboard.copy':
        return this.clipboardFacade() !== undefined;
      case 'export.excel':
      case 'export.pdf':
      case 'export.csv':
      case 'grid.print':
        return this.instance.output.available(OUTPUT_OF[command] as 'excel' | 'pdf' | 'csv' | 'print');
      default:
        return false;
    }
  }

  private clipboardFacade(): { copy(options?: { getValue?: (rowId: string, columnId: ColumnId) => unknown }): { text: string; cells: number } } | undefined {
    return this.engine.getModuleState('clipboard') !== undefined ? (this.engine as unknown as { clipboard?: never }).clipboard : undefined;
  }

  /**
   * Values for the built-in copy with `editing` on: draft values (and added
   * rows) from the edit module, lookup keys mapped to their display text, so
   * the copy matches Ctrl+C and export; other cells read the column
   * accessor (the lookup module's display value).
   */
  private copyValues(): { getValue?: (rowId: string, columnId: ColumnId) => unknown } {
    const engine = this.engine as unknown as {
      edit?: { getValue(rowId: string, columnId: ColumnId): unknown; getDraft(rowId: string, columnId: ColumnId): unknown };
      lookup?: { getDisplayValue(columnId: ColumnId, key: unknown): unknown };
    };
    const edit = engine.edit;
    if (!edit) return {};
    const lookup = engine.lookup;
    return {
      getValue: (rowId, columnId) => {
        const column = this.engine.getSnapshot().columns.byId.get(columnId);
        const row = this.engine.getRow(rowId);
        if (column && row !== undefined && edit.getDraft(rowId, columnId) === undefined) return column.accessor(row);
        const value = edit.getValue(rowId, columnId);
        if (!column?.def.lookup || !lookup || value === null || value === undefined) return value;
        return lookup.getDisplayValue(columnId, value) ?? value;
      },
    };
  }

  private editMode(): string | undefined {
    return this.engine.getModuleState<{ options: { mode: string } }>('edit')?.options.mode;
  }

  /** Runs a built-in UI command against the core modules; null when the command has no built-in. */
  private runBuiltIn(command: string, payload: Readonly<Record<string, unknown>>, source: Source): boolean | null {
    if (!this.builtInAvailable(command)) return null;
    const dispatch = (cmd: DataGridCommand): boolean => this.instance.dispatchFrom(source, cmd).status !== 'rejected';
    switch (command) {
      case 'edit.add':
        return dispatch({ type: 'edit.addRecord' });
      case 'edit.begin': {
        const rowId = payload['rowId'];
        if (typeof rowId !== 'string') return false;
        const columnId = payload['columnId'];
        return dispatch({ type: 'edit.start', rowId, ...(typeof columnId === 'string' ? { columnId } : {}) });
      }
      case 'edit.delete': {
        const rowIds = Array.isArray(payload['rowIds']) ? (payload['rowIds'] as unknown[]).filter((id): id is string => typeof id === 'string') : [];
        return rowIds.length > 0 && dispatch({ type: 'edit.deleteRecords', rowIds });
      }
      case 'edit.save':
        return dispatch({ type: this.editMode() === 'batch' && this.engine.hasCommand('edit.saveBatch') ? 'edit.saveBatch' : 'edit.commit' });
      case 'edit.cancel':
        return dispatch({ type: this.editMode() === 'batch' && this.engine.hasCommand('edit.cancelBatch') ? 'edit.cancelBatch' : 'edit.cancel' });
      case 'clipboard.copy': {
        const clipboard = this.clipboardFacade();
        if (!clipboard) return false;
        const copied = clipboard.copy(this.copyValues());
        if (copied.cells === 0) return false;
        const nav = this.instance.root?.ownerDocument.defaultView?.navigator;
        void nav?.clipboard?.writeText(copied.text).catch(() => undefined);
        return true;
      }
      case 'export.excel':
      case 'export.pdf':
      case 'export.csv':
      case 'grid.print':
        return this.instance.output.runCommand(OUTPUT_OF[command] as 'excel' | 'pdf' | 'csv' | 'print', source);
      default:
        return null;
    }
  }

  /** Handler first (latest registration wins), then a built-in or module command, else a dev warning. */
  runCommand(command: string, payload: Readonly<Record<string, unknown>> = {}, source: Source = 'api'): boolean {
    const handlers = this.commandHandlers.get(command);
    if (handlers?.length) {
      for (let i = handlers.length - 1; i >= 0; i--) if ((handlers[i] as DataGridCommandHandler)(payload) !== false) return true;
      return false;
    }
    const builtIn = this.runBuiltIn(command, payload, source);
    if (builtIn !== null) return builtIn;
    if (this.engine.hasCommand(command)) {
      const result = this.instance.dispatchFrom(source, { ...(payload as object), type: command } as DataGridCommand);
      return result.status !== 'rejected';
    }
    if (DEV) {
      const key = FEATURE_OF[command];
      const feature = key ? DEFAULT_GRID_TEXT(key) : command;
      warnOnce(
        `${this.instance.gridId}:ui-command:${command}`,
        `DataGrid "${this.instance.gridId}": "${command}" has no handler (${feature}); register a module that declares it or api.registerCommandHandler("${command}", ...). The action is ignored.`,
      );
    }
    return false;
  }

  /** @internal */
  selectedRowIds(): readonly RowId[] {
    return (this.engine as unknown as { selection?: { getSelectedRowIds(): readonly string[] } }).selection?.getSelectedRowIds() ?? [];
  }

  /** @internal */
  commandPayload(command: string, target: DataGridContextMenuTarget | null): Record<string, unknown> {
    const focus = this.instance.interaction.focusTarget();
    const rowId = target && 'rowId' in target ? target.rowId : focus?.kind === 'cell' ? focus.rowId : null;
    const columnId = target && 'field' in target ? target.field : (focus?.columnId ?? null);
    switch (command) {
      case 'edit.begin':
        return { rowId, ...(columnId !== null ? { columnId } : {}) };
      case 'edit.delete': {
        const selected = this.selectedRowIds();
        return { rowIds: rowId !== null && !selected.includes(rowId) && target ? [rowId] : [...selected] };
      }
      default:
        return {};
    }
  }

  // ------------------------------------------------------------------------
  // Toolbar
  // ------------------------------------------------------------------------

  /** Toolbar enablement changes from handler registrations; `DataGridToolbarItem.disabled` is read from the prop on render. */
  readonly subscribeToolbar = (listener: Listener): (() => void) => {
    this.toolbarListeners.add(listener);
    return () => {
      this.toolbarListeners.delete(listener);
    };
  };

  readonly getToolbarVersion = (): number => this.toolbarVersion;

  private bumpToolbar(): void {
    this.toolbarVersion++;
    for (const l of this.toolbarListeners) l();
  }

  /**
   * Disabled state and reason of a toolbar item. `editDisabled` is
   * the edit-state rule of the toolbar feature (`toolbar-edit-state.ts`,
   * over the toolbar's selected bits); without it the edit state decides
   * nothing.
   */
  toolbarItemState(
    item: ResolvedToolbarItem,
    p: ChromeSettings = this.instance.props,
    editDisabled?: (builtIn: DataGridToolbarItemId) => boolean | null,
  ): { disabled: boolean; reason: string | undefined } {
    if (item.disabled) return { disabled: true, reason: undefined };
    const builtIn = item.builtIn;
    if (!builtIn) return { disabled: false, reason: undefined };
    if (builtIn === 'columnChooser' && this.chooserDisabled(p)) return { disabled: true, reason: undefined };
    if (builtIn === 'filterBuilder' && !this.builderEnabled(p)) return { disabled: true, reason: undefined };
    const command = ITEM_COMMANDS[builtIn];
    if (command && !this.commandAvailable(command)) return { disabled: true, reason: this.unavailable(command) };
    if (editDisabled?.(builtIn)) return { disabled: true, reason: undefined };
    if ((builtIn === 'expandAll' || builtIn === 'collapseAll') && !this.instance.groupable) return { disabled: true, reason: this.text('unavailable', { feature: this.text('featureGrouping') }) };
    if (builtIn === 'search' && this.engine.getModuleState('search') === undefined) return { disabled: true, reason: this.text('unavailable', { feature: this.text('featureSearch') }) };
    return { disabled: false, reason: undefined };
  }

  /** "<feature> is not available" for a command without a handler. */
  private unavailable(command: string): string {
    const feature = FEATURE_OF[command];
    return this.text('unavailable', { feature: feature ? this.text(feature) : command });
  }

  toolbarItems(toolbar: ChromeSettings['toolbar'] = this.instance.props.toolbar, text: DataGridText = this.text): ResolvedToolbarItem[] {
    const out: ResolvedToolbarItem[] = [];
    for (const raw of toolbar ?? []) {
      const id = typeof raw === 'string' ? raw : raw.id;
      if (!TOOLBAR_IDS.has(id)) {
        if (typeof raw !== 'string') out.push(raw);
        continue;
      }
      const builtIn = id as DataGridToolbarItemId;
      const defaults = { id, label: text.optional(id), builtIn, align: builtIn === 'search' ? 'end' : 'start' } as const;
      out.push(typeof raw === 'string' ? defaults : { ...defaults, ...raw, label: raw.label ?? defaults.label, align: raw.align ?? defaults.align, builtIn });
    }
    return out;
  }

  /** `onToolbarItemClick`; false when the handler prevented the built-in action. */
  toolbarItemClick(item: DataGridToolbarItem, source: Source): boolean {
    const handler = this.instance.props.onToolbarItemClick;
    if (!handler) return true;
    const { builtIn: _builtIn, ...publicItem } = item as ResolvedToolbarItem;
    const event = gridEvent<DataGridToolbarItemClickEvent>('toolbarItemClick', source, { item: publicItem });
    handler(event);
    return !event.defaultPrevented;
  }

  /** Runs a toolbar item: `onToolbarItemClick` (cancellable), then the built-in behavior. */
  runToolbarItem(item: ResolvedToolbarItem, anchorEl: Element | null, source: Source): void {
    if (!this.toolbarItemClick(item, source) || !item.builtIn) return;
    const builtIn = item.builtIn;
    if (builtIn === 'columnChooser' || builtIn === 'filterBuilder') {
      if (builtIn === 'columnChooser') this.openColumnChooser(anchorEl ? rectOf(anchorEl) : null, anchorEl, source);
      else this.openFilterBuilder(anchorEl, source);
      return;
    }
    if (builtIn === 'expandAll' || builtIn === 'collapseAll') {
      if (this.instance.groupable) this.instance.dispatchFrom(source, { type: builtIn === 'expandAll' ? 'grouping.expandAll' : 'grouping.collapseAll' });
      return;
    }
    const command = ITEM_COMMANDS[builtIn];
    if (command) this.runCommand(command, this.commandPayload(command, null), source);
  }

  // ------------------------------------------------------------------------
  // Menu items
  // ------------------------------------------------------------------------

  private builtInItem(id: string, column: CompiledColumn<Row> | undefined, target: DataGridContextMenuTarget | null): DataGridMenuItem | null {
    const t = this.text;
    switch (id) {
      case 'autoSize':
        // AutoFit is listed with AutoFitAll whatever the resize setting is (the menu fits by
        // measuring, not through the resize handle), so neither depends on `resizable`.
        return column ? { id, label: t('autoSize') } : null;
      case 'autoSizeAll':
        return { id, label: t('autoSizeAll') };
      case 'group':
        return column && canGroupColumn(this.instance, column) ? { id, label: t('group'), disabled: this.grouped(column.columnId) } : null;
      case 'ungroup':
        return column && this.instance.groupable && column.flags.allowGrouping ? { id, label: t('ungroup'), disabled: !this.grouped(column.columnId) } : null;
      case 'sortAscending':
      case 'sortDescending': {
        if (!column || !this.sortable(column)) return null;
        const dir = this.sortDirection(column.columnId);
        return { id, label: id === 'sortAscending' ? t('sortAscending') : t('sortDescending'), disabled: dir === (id === 'sortAscending' ? 'asc' : 'desc') };
      }
      case 'clearSort':
        return column && this.sortable(column) ? { id, label: t('clearSort'), disabled: this.sortDirection(column.columnId) === null } : null;
      case 'columnChooser':
        return this.chooserDisabled() ? null : { id, label: t('columnChooser') };
      case 'filter':
        return column && this.filterable(column) ? { id, label: t('filter') } : null;
      case 'pinStart':
      case 'pinEnd':
      case 'unpin': {
        if (!column || this.instance.interaction.isSelectionColumn(column)) return null;
        const zone = this.zone(column.columnId);
        const label = id === 'pinStart' ? t('pinStart') : id === 'pinEnd' ? t('pinEnd') : t('unpin');
        const current = id === 'pinStart' ? zone === 'left' : id === 'pinEnd' ? zone === 'right' : pinOfColumn(this.engine.getSnapshot().columns, column.columnId) === null;
        return { id, label, disabled: current };
      }
      case 'firstPage':
      case 'previousPage':
      case 'nextPage':
      case 'lastPage': {
        if (this.engine.getModuleState('paging') === undefined) return null;
        return { id, label: t(id) };
      }
      default: {
        const command = ITEM_COMMANDS[id];
        if (!command) return null;
        if ((id === 'edit' || id === 'delete' || id === 'copy') && target && target.kind !== 'cell' && target.kind !== 'row') return null;
        const label = t.optional(id);
        const available = this.commandAvailable(command);
        return available ? { id, label } : { id, label, disabled: true, disabledReason: this.unavailable(command) };
      }
    }
  }

  private resolveItems(
    spec: readonly (string | DataGridMenuItem)[],
    column: CompiledColumn<Row> | undefined,
    target: DataGridContextMenuTarget | null,
  ): DataGridMenuItem[] {
    const out: DataGridMenuItem[] = [];
    let sep = 0;
    for (const raw of spec) {
      if (target && !itemOnTarget(raw, target)) continue;
      if (typeof raw !== 'string') {
        out.push(raw);
        continue;
      }
      if (raw === 'separator') {
        if (out.length && !out[out.length - 1]?.separator) out.push({ id: `__sep${sep++}`, separator: true });
        continue;
      }
      const item = this.builtInItem(raw, column, target);
      if (item) out.push(item);
    }
    while (out.length && out[out.length - 1]?.separator) out.pop();
    return out;
  }

  columnMenuItems(column: CompiledColumn<Row>): DataGridMenuItem[] {
    const prop = this.instance.props.columnMenu;
    return this.resolveItems(Array.isArray(prop) ? prop : COLUMN_MENU_DEFAULT, column, null);
  }

  contextMenuItems(target: DataGridContextMenuTarget): DataGridMenuItem[] {
    const prop = this.instance.props.contextMenu;
    const column = 'field' in target ? this.column(target.field) : undefined;
    const spec = Array.isArray(prop)
      ? prop
      : target.kind === 'header'
        ? CONTEXT_HEADER_DEFAULT
        : target.kind === 'pager'
          ? CONTEXT_PAGER_DEFAULT
          : CONTEXT_CELL_DEFAULT;
    return this.resolveItems(spec, column, target);
  }

  // ------------------------------------------------------------------------
  // Open
  // ------------------------------------------------------------------------

  /** Rendered header cell of a column; null outside the rendered window. */
  headerElement(columnId: ColumnId): HTMLElement | null {
    return this.instance.root?.querySelector<HTMLElement>(`.salmon-data-grid-header-cell[data-column-id="${CSS.escape(columnId)}"]`) ?? null;
  }

  private anchorFor(columnId: ColumnId, el: Element | null): AnchorRect | null {
    const target = el ?? this.headerElement(columnId);
    if (target) return rectOf(target);
    const root = this.instance.root;
    return root ? rectOf(root) : null;
  }

  openColumnMenu(columnId: ColumnId, source: Source, anchorEl: Element | null = null): boolean {
    const column = this.column(columnId);
    const container = this.container();
    if (!column || !container || !this.columnMenuEnabled(column)) return false;
    let items = this.columnMenuItems(column);
    const handler = this.instance.props.onBeforeColumnMenuOpen;
    if (handler) {
      const event = gridEvent<DataGridColumnMenuOpenEvent<Row>>('beforeColumnMenuOpen', source, { field: columnId, column: columnInfo(column), items });
      handler(event);
      if (event.defaultPrevented) return false;
      items = event.items;
    }
    const anchor = this.anchorFor(columnId, anchorEl?.closest('.salmon-data-grid-header-cell') ?? anchorEl);
    if (!anchor) return false;
    this.show({ kind: 'columnMenu', columnId, anchor, container, items }, this.activeElement(), columnId);
    return true;
  }

  openFilterMenu(columnId: ColumnId, source: Source, anchorEl: Element | null = null): boolean {
    const column = this.column(columnId);
    const container = this.container();
    if (!column || !container || !this.filterable(column)) return false;
    const anchor = this.anchorFor(columnId, anchorEl?.closest('.salmon-data-grid-header-cell') ?? anchorEl);
    if (!anchor) return false;
    if (!this.beforeFilterMenuOpen(columnId, 'menu', source)) return false;
    this.show({ kind: 'filterMenu', columnId, anchor, container, source }, this.activeElement(), columnId);
    return true;
  }

  /** The filter menu's UI: a filter row column opened from the column menu gets the operator menu. */
  filterMenuUi(column: CompiledColumn<Row>): Exclude<DataGridFilterUi, 'row'> {
    const ui = this.filterUi(column);
    return ui === 'row' ? 'menu' : ui;
  }

  /** `onBeforeFilterMenuOpen`; false when prevented. */
  beforeFilterMenuOpen(columnId: ColumnId, dialog: 'menu' | 'custom', source: Source): boolean {
    const handler = this.instance.props.onBeforeFilterMenuOpen;
    const column = this.column(columnId);
    if (!handler || !column) return true;
    const event = gridEvent<DataGridFilterMenuOpenEvent>('beforeFilterMenuOpen', source, { field: columnId, ui: this.filterMenuUi(column), dialog });
    handler(event);
    return !event.defaultPrevented;
  }

  /** `onFilterMenuOpen`: the menu (or its custom section) rendered; called from its layout effect. */
  filterMenuOpened(columnId: ColumnId, dialog: 'menu' | 'custom', source: Source = 'pointer'): void {
    const handler = this.instance.props.onFilterMenuOpen;
    const column = this.column(columnId);
    if (handler && column) handler(gridEvent<DataGridFilterMenuOpenEvent>('filterMenuOpen', source, { field: columnId, ui: this.filterMenuUi(column), dialog }));
  }

  openColumnChooser(anchor: AnchorRect | null, returnTo: Element | null, source: Source): boolean {
    const container = this.container();
    const root = this.instance.root;
    if (this.chooserDisabled()) {
      if (DEV && source === 'api') {
        warnOnce(`${this.instance.gridId}:chooser-off`, `DataGrid "${this.instance.gridId}": openColumnChooser() is ignored because columnChooser is false.`);
      }
      return false;
    }
    if (!container || !root) return false;
    const handler = this.instance.props.onBeforeColumnChooserOpen;
    if (handler) {
      const event = gridEvent<DataGridColumnChooserOpenEvent<Row>>('beforeColumnChooserOpen', source, {
        // The columns the chooser lists (`hideable: false` ones, the selection column's default, are left out).
        columns: columnInfos(this.engine.getSnapshot().columns.leaves.filter((c) => c.flags.showInColumnChooser)),
      });
      handler(event);
      if (event.defaultPrevented) return false;
    }
    const at = anchor ?? (() => {
      const r = rectOf(root);
      return this.instance.rtl ? pointRect(r.left + r.width, r.top) : pointRect(r.left, r.top);
    })();
    this.show({ kind: 'columnChooser', anchor: at, container }, returnTo ?? this.activeElement(), null);
    return true;
  }

  /** `filtering.builder` is set and the filter module is enabled. */
  builderEnabled(p: ChromeSettings = this.instance.props): boolean {
    return this.filteringUi(p) && Boolean(filteringOf(p)?.builder);
  }

  /** Opens the filter builder dialog after `onBeforeFilterBuilderOpen`. */
  openFilterBuilder(returnTo: Element | null, source: Source): boolean {
    const container = this.container();
    const root = this.instance.root;
    if (!this.builderEnabled()) {
      if (DEV && source === 'api') warnOnce(`${this.instance.gridId}:builder-off`, `DataGrid "${this.instance.gridId}": openFilterBuilder() is ignored because filtering.builder is not set.`);
      return false;
    }
    if (!container || !root || this.overlay?.kind === 'filterBuilder') return false;
    const handler = this.instance.props.onBeforeFilterBuilderOpen;
    if (handler) {
      const filters = this.engine.getModuleState<{ filters: readonly never[] }>('filter')?.filters ?? [];
      const event = gridEvent<DataGridFilterBuilderOpenEvent>('beforeFilterBuilderOpen', source, lazyField({}, 'filters', () => gridFilters(filters)));
      handler(event);
      if (event.defaultPrevented) return false;
    }
    const r = rectOf(returnTo ?? root);
    const anchor = returnTo ? r : this.instance.rtl ? pointRect(r.left + r.width, r.top) : pointRect(r.left, r.top);
    this.show({ kind: 'filterBuilder', anchor, container }, returnTo ?? this.activeElement(), null);
    return true;
  }

  openContextMenu(target: DataGridContextMenuTarget, anchor: AnchorRect, source: Source): boolean {
    const container = this.container();
    if (!container) return false;
    let items = this.contextMenuItems(target);
    const handler = this.instance.props.onBeforeContextMenuOpen;
    if (handler) {
      const event = gridEvent<DataGridContextMenuOpenEvent>('beforeContextMenuOpen', source, { target, items });
      handler(event);
      if (event.defaultPrevented) return false;
      items = event.items;
    }
    if (items.length === 0) return false;
    const columnId = 'field' in target ? target.field : null;
    this.show({ kind: 'contextMenu', target, anchor, container, items }, this.activeElement(), target.kind === 'header' ? columnId : null);
    return true;
  }

  openToolbarOverflow(anchorEl: Element, items: readonly DataGridMenuItem[]): void {
    const container = this.container();
    if (!container) return;
    this.show({ kind: 'toolbarOverflow', anchor: rectOf(anchorEl), container, items }, anchorEl, null);
  }

  private activeElement(): Element | null {
    return this.instance.root?.ownerDocument.activeElement ?? null;
  }

  // ------------------------------------------------------------------------
  // Actions
  // ------------------------------------------------------------------------

  /**
   * Pins or unpins a column: `onBeforeColumnPinChange`
   * (cancellable), the command, then `onColumnPinChange` and an announcement.
   */
  pin(columnId: ColumnId, pinned: DataGridColumnPin | null, source: Source): CommandResult {
    const previousPinned = pinOfColumn(this.engine.getSnapshot().columns, columnId);
    const p = this.instance.props;
    if (p.onBeforeColumnPinChange && this.column(columnId) && previousPinned !== pinned) {
      const event = gridEvent<DataGridColumnPinChangeEvent>('beforeColumnPinChange', source, { field: columnId, pinned, previousPinned });
      p.onBeforeColumnPinChange(event);
      if (event.defaultPrevented) return { status: 'rejected', reason: 'prevented' };
    }
    const freeze = pinned === 'start' ? 'left' : pinned === 'end' ? 'right' : pinned === 'center' ? 'fixed' : null;
    // The selection checkbox column stays at the start: pinning a column to the start pins it too (it is locked, so it sorts first).
    const out: { result?: CommandResult } = {};
    this.engine.batch(() => {
      if (freeze === 'left') {
        const selection = this.engine.getSnapshot().columns.visible.find((c) => this.instance.interaction.isSelectionColumn(c));
        if (selection && selection.columnId !== columnId && this.zone(selection.columnId) !== 'left') {
          this.instance.dispatchFrom(source, { type: 'columns.setFreeze', columnId: selection.columnId, freeze: 'left' });
        }
      }
      out.result = this.instance.dispatchFrom(source, { type: 'columns.setFreeze', columnId, freeze });
    });
    const result = out.result as CommandResult;
    const applied = pinOfColumn(this.engine.getSnapshot().columns, columnId);
    if (result.status === 'applied' && applied !== previousPinned) {
      if (p.onColumnPinChange) p.onColumnPinChange(gridEvent<DataGridColumnPinChangeEvent>('columnPinChange', source, { field: columnId, pinned: applied, previousPinned }));
      const header = this.column(columnId)?.headerText ?? columnId;
      this.instance.interaction.announce(this.text(applied === 'start' ? 'columnPinnedStart' : applied === 'end' ? 'columnPinnedEnd' : applied === 'center' ? 'columnPinnedCenter' : 'columnUnpinned', { column: header }));
    }
    return result;
  }

  // ------------------------------------------------------------------------
  // Pointer and keyboard entry points
  // ------------------------------------------------------------------------

  /** Delegated `contextmenu` on the grid root (virtual rows and pinned zones alike). */
  readonly onContextMenu = (event: ReactMouseEvent<HTMLElement>): void => {
    if (!this.instance.props.contextMenu) return;
    const target = event.target as Element;
    const resolved = this.targetOf(target);
    if (!resolved) return;
    // Right-click focuses the target first so focus returns there.
    const cell = target.closest<HTMLElement>('.salmon-data-grid-cell, .salmon-data-grid-header-cell');
    cell?.focus({ preventScroll: true });
    if (this.openContextMenu(resolved, pointRect(event.clientX, event.clientY), event.nativeEvent instanceof PointerEvent && event.nativeEvent.pointerType === 'touch' ? 'touch' : 'pointer')) {
      event.preventDefault();
    }
  };

  private targetOf(target: Element): DataGridContextMenuTarget | null {
    const root = this.instance.root;
    // The pager is the next sibling of the grid root (Pager.tsx).
    const pager = target.closest('.salmon-data-grid-pager');
    if (root && pager && pager.previousElementSibling === root) return { kind: 'pager' };
    if (!root || !root.contains(target)) return null;
    const header = target.closest<HTMLElement>('.salmon-data-grid-header-cell[data-column-id]');
    if (header) return { kind: 'header', field: header.dataset['columnId'] as string };
    const row = target.closest<HTMLElement>('.salmon-data-grid-rows [data-row-id]');
    if (!row) return null;
    const rowId = row.dataset['rowId'] as string;
    if (rowId.startsWith('__g')) return { kind: 'groupCaption', rowId };
    const cell = target.closest<HTMLElement>('.salmon-data-grid-cell[data-column-id]');
    if (cell) return { kind: 'cell', rowId, field: cell.dataset['columnId'] as string };
    return { kind: 'row', rowId };
  }

  private registerKeys(): void {
    const interaction = this.instance.interaction;
    const headerId = (): ColumnId | null => {
      const t = interaction.focusTarget();
      return t?.kind === 'header' ? t.columnId : null;
    };
    interaction.registerKeyHandler('header.openFilterMenu', () => {
      const id = headerId();
      const column = this.column(id);
      if (!column || id === null) return false;
      if (this.filterButtonEnabled(column)) return this.openFilterMenu(id, 'keyboard');
      return this.openColumnMenu(id, 'keyboard');
    });
    interaction.registerKeyHandler('header.openColumnMenu', () => {
      const id = headerId();
      return id !== null && this.openColumnMenu(id, 'keyboard');
    });
    const pinKey = (pinned: DataGridColumnPin | null) => (): boolean => {
      const id = headerId();
      const column = this.column(id);
      if (!column || id === null || interaction.isSelectionColumn(column)) return false;
      this.instance.focusAfterCommit = id;
      this.pin(id, pinned, 'keyboard');
      return true;
    };
    // Key command names are engine keymap ids (keyboard.ts).
    interaction.registerKeyHandler('header.pinStart', pinKey('start'));
    interaction.registerKeyHandler('header.pinEnd', pinKey('end'));
    interaction.registerKeyHandler('header.unpin', pinKey(null));
    interaction.registerKeyHandler('grid.contextMenu', ({ context }) => {
      if (!this.instance.props.contextMenu) return false;
      const root = this.instance.root;
      if (!root) return false;
      const active = root.ownerDocument.activeElement;
      // the pager sits outside the root (Pager.tsx) and routes its keys here.
      if (context === 'pager') {
        if (!(active instanceof HTMLElement) || this.targetOf(active)?.kind !== 'pager') return false;
        const r = active.getBoundingClientRect();
        return this.openContextMenu({ kind: 'pager' }, pointRect(this.instance.rtl ? r.right - 8 : r.left + 8, r.bottom), 'keyboard');
      }
      const t = interaction.focusTarget();
      if (!t) return false;
      const el = active instanceof HTMLElement && root.contains(active) ? active : root;
      const r = el.getBoundingClientRect();
      const anchor = pointRect(this.instance.rtl ? r.right - 8 : r.left + 8, r.bottom);
      const target: DataGridContextMenuTarget =
        t.kind === 'header' ? { kind: 'header', field: t.columnId } : t.rowId.startsWith('__g') ? { kind: 'groupCaption', rowId: t.rowId } : { kind: 'cell', rowId: t.rowId, field: t.columnId };
      return this.openContextMenu(target, anchor, 'keyboard');
    });
  }

  /** Header state for the filter indicator / button label. */
  isFiltered(columnId: ColumnId): boolean {
    return getColumnFilters(this.engine.getSnapshot().query.filters, columnId).length > 0;
  }
}
