// Focus, keyboard, selection, and announcements for one DataGrid.
// Logical focus and selection live in the
// core `focus` and `selection` modules; this class projects them onto the
// DOM: a roving tabindex (the focus target cell renders with the
// `targetRef`), DOM focus restoration when a virtualized target remounts,
// scroll-into-view from layout metrics (no DOM reads), and two live
// regions written imperatively (never through React state).

import { flushSync } from 'react-dom';
import {
  createKeymap,
  type ColumnId,
  type CompiledColumn,
  type FocusDirection,
  type FocusState,
  type FocusTarget,
  type CommandEvent,
  type DataGridCommand,
  type Keymap,
  type KeyContext,
  type RowId,
  type SelectionPreview,
  type SelectionState,
  type SelectionSummary,
} from '@salmonui/data-grid/engine';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, FocusEvent as ReactFocusEvent } from 'react';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';
import type { DataGridText } from './locale-text.js';
import type { DataGridInstance } from './instance.js';
import { gridEvent, type DataGridEventSource } from '@salmonui/core/internal/events';
import { revealPastFixed } from './fixed-zone.js';
import type { DataGridCellKey, DataGridFocusedCell, DataGridKeyContext, DataGridKeyDownContext, DataGridKeyHandler, DataGridSelectionChangeEvent } from './types.js';

/** Cell UI bits (one primitive per cell for useSyncExternalStore). */
export const UI_TABSTOP = 1;
export const UI_SELECTED = 2;
export const UI_CHECKED = 4;
export const UI_ROW_SELECTED = 8;
/** Range outline edges of a selected cell (`selection.cellRange: 'boxWithBorder'`); logical sides. */
export const UI_EDGE_TOP = 16;
export const UI_EDGE_BOTTOM = 32;
export const UI_EDGE_START = 64;
export const UI_EDGE_END = 128;

const EDGE_NAMES: readonly string[] = (() => {
  const out: string[] = [];
  for (let m = 0; m < 16; m++) {
    const parts: string[] = [];
    if (m & 1) parts.push('top');
    if (m & 2) parts.push('bottom');
    if (m & 4) parts.push('start');
    if (m & 8) parts.push('end');
    out.push(parts.join(' '));
  }
  return out;
})();

/** `data-range-edge` value of the cell UI bits (`"top start"`; empty inside a range). */
export function rangeEdgeAttribute(ui: number): string {
  return EDGE_NAMES[(ui >> 4) & 15] as string;
}

/** Default id of the `type: "selection"` checkbox column. */
export const SELECTION_COLUMN_ID = '__salmon_select';


const ANNOUNCE_DEBOUNCE = 150;
const LOADING_DELAY = 400;

interface HandlerEntry {
  readonly handler: DataGridKeyHandler;
  readonly priority: number;
}

type SelectionFacade = {
  isRowSelected(rowId: RowId): boolean;
  isCellSelected(rowId: RowId, columnId: ColumnId): boolean;
  isColumnSelected(columnId: ColumnId): boolean;
  getSummary(): SelectionSummary;
  preview(command: DataGridCommand): SelectionPreview | null;
  getSelectedRowIds(): readonly RowId[];
};
type FocusFacade = {
  getDefaultTarget(): FocusTarget | null;
};

/** The grid that most recently held focus answers the document-level Alt+J / Alt+W. */
let lastFocusedGrid: object | null = null;

function isEditable(el: Element): boolean {
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return (el as HTMLElement).isContentEditable === true;
}

/** Keys whose default action scrolls the viewport (arrows, Home / End, PageUp / PageDown, with any modifier). */
const NATIVE_SCROLL_KEY = /^(Arrow(Up|Down|Left|Right)|Home|End|Page(Up|Down))$/;

function detectPlatform(): 'mac' | 'other' {
  const nav = (globalThis as { navigator?: { platform?: string; userAgentData?: { platform?: string } } }).navigator;
  const platform = nav?.userAgentData?.platform ?? nav?.platform ?? '';
  return /mac|iphone|ipad|ipod/i.test(platform) ? 'mac' : 'other';
}

/** Group captions and footers (`__g:`, `__gf:`) and detail rows (`__detail:`) take focus but are never selected. */
function sameBindings(a: Readonly<Record<string, readonly string[]>> | undefined, b: Readonly<Record<string, readonly string[]>> | undefined): boolean {
  if (a === b) return true;
  const ka = Object.keys(a ?? {});
  if (ka.length !== Object.keys(b ?? {}).length) return false;
  return ka.every((k) => {
    const x = a?.[k];
    const y = b?.[k];
    if (!Array.isArray(x) || !Array.isArray(y)) return x === y;
    return x.length === y.length && x.every((v, i) => v === y[i]);
  });
}

/** F6 regions, in DOM order. */
type DataGridRegion = 'toolbar' | 'adaptiveBar' | 'groupPanel' | 'header' | 'body' | 'footer' | 'pager';
const REGION_ORDER: readonly DataGridRegion[] = ['toolbar', 'adaptiveBar', 'groupPanel', 'header', 'body', 'footer', 'pager'];

export function isSyntheticRow(rowId: RowId): boolean {
  return rowId.startsWith('__g') || rowId.startsWith('__detail:') || rowId.startsWith('__loading:');
}

function sameTarget(a: FocusTarget | null, b: FocusTarget | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind || a.columnId !== b.columnId) return false;
  return a.kind === 'cell' ? a.rowId === (b as typeof a).rowId : true;
}

export class DataGridInteraction<Row> {
  private readonly instance: DataGridInstance<Row>;
  keymap: Keymap;
  private readonly handlers = new Map<string, HandlerEntry[]>();
  /** The mounted element of the logical focus target (cell or header), if any. */
  private targetEl: HTMLElement | null = null;
  /** Focus the target as soon as it mounts, even if DOM focus is outside the grid (api.focusCell). */
  private pendingDomFocus = false;
  private live: HTMLElement | null = null;
  private alert: HTMLElement | null = null;
  private announceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPriority = -1;
  private loadingTimer: ReturnType<typeof setTimeout> | null = null;
  private announcedLoading = false;
  private lastSelectedCount = -1;
  private defaultFor: { rows: unknown; columns: unknown; target: FocusTarget | null } | null = null;
  /** Text in the current catalog and locale (announcements, event-time labels). */
  get text(): DataGridText {
    return this.instance.text;
  }
  /** The tab stop the server rendered (engine construction state); hydration reads it, never the live target. */
  readonly serverFocusTarget: FocusTarget | null;

  constructor(instance: DataGridInstance<Row>) {
    this.instance = instance;
    this.keymap = this.buildKeymap('other');
    this.registerBuiltIns();
    this.serverFocusTarget = this.focusTarget();
  }

  private buildKeymap(platform: 'mac' | 'other'): Keymap {
    const gridId = this.instance.gridId;
    return createKeymap({
      platform,
      bindings: this.instance.props.keyBindings ?? {},
      warn: (code, message) => warnOnce(`${gridId}:${code}:${message}`, `DataGrid "${gridId}": ${message}`),
    });
  }

  /** `keyBindings` is reactive: a changed value (compared by value, not identity) rebuilds the keymap. */
  syncKeyBindings(prev: Readonly<Record<string, readonly string[]>> | undefined, next: Readonly<Record<string, readonly string[]>> | undefined): void {
    if (sameBindings(prev, next)) return;
    this.keymap = this.buildKeymap(this.keymap.platform);
  }

  // ------------------------------------------------------------------------
  // State reads (pure; used as useSyncExternalStore snapshots)
  // ------------------------------------------------------------------------

  private get engine() {
    return this.instance.engine;
  }

  private selectionFacade(): SelectionFacade | undefined {
    return (this.engine as unknown as { selection?: SelectionFacade }).selection;
  }

  selectionState(): SelectionState | undefined {
    return this.engine.getModuleState<SelectionState>('selection');
  }

  focusState(): FocusState | undefined {
    return this.engine.getModuleState<FocusState>('focus');
  }

  /** Logical focus target, or the default tab stop (first body cell, else first header cell). */
  focusTarget(): FocusTarget | null {
    const state = this.focusState();
    if (state?.target) return state.target;
    const snap = this.engine.getSnapshot();
    const cached = this.defaultFor;
    if (cached && cached.rows === snap.rows && cached.columns === snap.columns.visible) return cached.target;
    const target = (this.engine as unknown as { focus?: FocusFacade }).focus?.getDefaultTarget() ?? null;
    this.defaultFor = { rows: snap.rows, columns: snap.columns.visible, target };
    return target;
  }

  get selectionEnabled(): boolean {
    return this.selectionState()?.options.enabled === true;
  }

  isSelectionColumn(column: CompiledColumn<Row>): boolean {
    return column.columnId === SELECTION_COLUMN_ID || (column.type === 'selection' && column.field === null && column.def.valueGetter === undefined);
  }

  /** Whether row selection state belongs on `role="row"` (row and both modes). */
  rowSelectionMode(): boolean {
    const o = this.selectionState()?.options;
    return o !== undefined && o.enabled && o.mode !== 'cell';
  }

  /** Whether `aria-selected` belongs on cells (cell and both modes, or column selection). */
  cellSelectionMode(): boolean {
    const o = this.selectionState()?.options;
    return o !== undefined && o.enabled && (o.mode !== 'row' || o.columns);
  }

  /**
   * `server`: the tab stop the server rendered (hydration), not the live
   * focus target. `edges`: add the outline edges of selected cells
   * (`cellRange: 'boxWithBorder'`): four neighbor lookups per selected cell.
   */
  cellUi(rowId: RowId, columnId: ColumnId, selectionColumn: boolean, wantsRowSelected: boolean, server = false, edges = false): number {
    const bits = this.cellUiBits(rowId, columnId, selectionColumn, wantsRowSelected, server);
    return edges && (bits & UI_SELECTED) !== 0 ? bits | this.rangeEdges(rowId, columnId) : bits;
  }

  /** Edge bits of a selected cell: a side has an edge when the neighbor across it is not selected. */
  private rangeEdges(rowId: RowId, columnId: ColumnId): number {
    const facade = this.selectionFacade() as SelectionFacade;
    const engine = this.engine;
    const selected = (r: RowId | undefined, c: ColumnId | undefined): boolean => r !== undefined && c !== undefined && facade.isCellSelected(r, c);
    const r = engine.getRowIndex(rowId);
    const visible = engine.getSnapshot().columns.visible;
    let c = -1;
    for (let i = 0; i < visible.length; i++) {
      if ((visible[i] as CompiledColumn<Row>).columnId === columnId) {
        c = i;
        break;
      }
    }
    let bits = 0;
    if (!selected(r > 0 ? engine.getRowIdAt(r - 1) : undefined, columnId)) bits |= UI_EDGE_TOP;
    if (!selected(r >= 0 ? engine.getRowIdAt(r + 1) : undefined, columnId)) bits |= UI_EDGE_BOTTOM;
    if (!selected(rowId, c > 0 ? visible[c - 1]?.columnId : undefined)) bits |= UI_EDGE_START;
    if (!selected(rowId, c >= 0 ? visible[c + 1]?.columnId : undefined)) bits |= UI_EDGE_END;
    return bits;
  }

  private cellUiBits(rowId: RowId, columnId: ColumnId, selectionColumn: boolean, wantsRowSelected: boolean, server: boolean): number {
    let bits = 0;
    const t = server ? this.serverFocusTarget : this.focusTarget();
    if (t !== null && t.kind === 'cell' && t.rowId === rowId && t.columnId === columnId) bits |= UI_TABSTOP;
    const state = this.selectionState();
    if (!state || !state.options.enabled) return bits;
    const facade = this.selectionFacade() as SelectionFacade;
    if (selectionColumn || wantsRowSelected) {
      if (state.options.mode !== 'cell' && facade.isRowSelected(rowId)) bits |= selectionColumn ? UI_CHECKED | UI_ROW_SELECTED : UI_ROW_SELECTED;
    }
    if (!selectionColumn && (state.cells.ranges.length > 0 || state.columns.length > 0) && facade.isCellSelected(rowId, columnId)) bits |= UI_SELECTED;
    return bits;
  }

  rowUi(rowId: RowId): number {
    const state = this.selectionState();
    if (!state || !state.options.enabled || state.options.mode === 'cell') return 0;
    return (this.selectionFacade() as SelectionFacade).isRowSelected(rowId) ? UI_ROW_SELECTED : 0;
  }

  headerUi(columnId: ColumnId, server = false): number {
    let bits = 0;
    const t = server ? this.serverFocusTarget : this.focusTarget();
    if (t !== null && t.kind === 'header' && t.columnId === columnId) bits |= UI_TABSTOP;
    const state = this.selectionState();
    if (state && state.columns.length && state.columns.includes(columnId)) bits |= UI_SELECTED;
    return bits;
  }

  /** Header select-all checkbox: 0 none, 1 some (mixed), 2 all. */
  readonly selectAllUi = (): number => {
    const state = this.selectionState();
    if (!state || !state.options.enabled || state.options.type !== 'multiple') return 0;
    const header = (this.selectionFacade() as SelectionFacade).getSummary().header;
    return header === 'all' ? 2 : header === 'some' ? 1 : 0;
  };

  readonly subscribeSelectAll = (listener: () => void): (() => void) => {
    const a = this.engine.subscribeModule('selection', listener);
    const b = this.engine.subscribe(listener);
    return () => {
      a();
      b();
    };
  };

  // ------------------------------------------------------------------------
  // Roving tabindex and DOM focus
  // ------------------------------------------------------------------------

  private doc(): Document | null {
    return this.instance.root?.ownerDocument ?? null;
  }

  private focusWithin(): boolean {
    const root = this.instance.root;
    const active = root?.ownerDocument.activeElement;
    return !!root && !!active && root.contains(active);
  }

  private elementMatchesTarget(el: HTMLElement, target: FocusTarget | null): boolean {
    if (!target || el.dataset['columnId'] !== target.columnId) return false;
    if (target.kind === 'header') return el.classList.contains('salmon-data-grid-header-cell');
    return (el.closest('[data-row-id]') as HTMLElement | null)?.dataset['rowId'] === target.rowId;
  }

  /**
   * Ref of the element that is the logical focus target (only that one
   * element carries it). Attaching restores DOM focus when focus is inside the
   * grid (or was requested); detaching while still the target (scrolled out,
   * filtered out) parks DOM focus on the grid root, which becomes the tab stop.
   */
  readonly targetRef = (el: HTMLElement | null): (() => void) | void => {
    if (!el) return;
    this.targetEl = el;
    const root = this.instance.root;
    if (root) root.tabIndex = -1;
    const active = el.ownerDocument.activeElement;
    if ((this.pendingDomFocus || this.focusWithin()) && active !== el && !(active && el.contains(active))) {
      this.pendingDomFocus = false;
      el.focus({ preventScroll: true });
    } else if (active === el) {
      this.pendingDomFocus = false;
    }
    return () => {
      if (this.targetEl === el) this.targetEl = null;
      if (!this.elementMatchesTarget(el, this.focusTarget())) return;
      // Still the target, so the element is unmounting: the root is the tab stop now.
      const r = this.instance.root;
      if (!r) return;
      r.tabIndex = 0;
      const now = el.ownerDocument.activeElement;
      if (now === el || (now && el.contains(now))) r.focus({ preventScroll: true });
    };
  };

  /** After a focus change: focus the mounted target, or park on the root until it mounts. */
  private syncDomFocus(force: boolean): void {
    const root = this.instance.root;
    if (!root) return;
    if (!force && !this.focusWithin()) return;
    const el = this.targetEl;
    if (el && el.isConnected && this.elementMatchesTarget(el, this.focusTarget())) {
      const active = el.ownerDocument.activeElement;
      // Focus already inside the cell (a button or input of a template) stays there.
      if (active !== el && !(active && el.contains(active))) el.focus({ preventScroll: true });
      this.pendingDomFocus = false;
      root.tabIndex = -1;
      return;
    }
    this.pendingDomFocus = true;
    root.tabIndex = 0;
    if (root.ownerDocument.activeElement !== root) root.focus({ preventScroll: true });
  }

  setLiveRegion = (el: HTMLElement | null): void => {
    this.live = el;
  };

  setAlertRegion = (el: HTMLElement | null): void => {
    this.alert = el;
  };

  // ------------------------------------------------------------------------
  // Scroll into view (layout metrics only: no DOM reads, no layout thrash)
  // ------------------------------------------------------------------------

  /** Updates the layout store to show the target and returns the scroll to write, or null. */
  private reveal(target: FocusTarget | null): { top: number; left: number } | null {
    const viewport = this.instance.getViewport();
    if (!target || !viewport) return null;
    const layout = this.instance.layout;
    // The viewport may have scrolled since the last `scroll` event reached the
    // layout (a pointer press right after `scrollIntoView`): reveal from the
    // live offsets, or a stale scroll moves the pressed cell away (and a
    // double click lands on its neighbor).
    const liveLeft = this.instance.rtl ? -viewport.scrollLeft : viewport.scrollLeft;
    const known = layout.getScroll();
    if (known.top !== viewport.scrollTop || known.left !== liveLeft) layout.setScroll(viewport.scrollTop, liveLeft);
    const scroll = layout.getScroll();
    let top = scroll.top;
    let left = scroll.left;
    if (target.kind === 'cell') {
      const index = this.engine.getRowIndex(target.rowId);
      const metrics = layout.getRowMetrics();
      if (index >= 0 && index < metrics.count) {
        const mapping = layout.getScrollMapping();
        const extent = layout.bodyExtent();
        const current = mapping.toVirtual(top);
        const offset = metrics.offsetOf(index);
        const size = metrics.heightOf(index);
        // Frozen rows cover the start and end of the body; they are always in view themselves.
        const p = this.instance.props;
        // Pinned rows head the model and stay in the top zone with the sticky rows.
        const pinnedCount = this.engine.getSnapshot().rows.pinned?.length ?? 0;
        const topCount = Math.min(Math.max(0, Math.floor(p.stickyRows ?? 0)) + pinnedCount, metrics.count);
        const bottomCount = Math.min(Math.max(0, Math.floor(p.stickyBottomRows ?? 0)), metrics.count - topCount);
        const insetTop = topCount ? metrics.offsetOf(topCount) : 0;
        const insetBottom = bottomCount ? metrics.totalHeight - metrics.offsetOf(metrics.count - bottomCount) : 0;
        const pinned = index < topCount || index >= metrics.count - bottomCount;
        let next = current;
        if (pinned) next = current;
        else if (offset < current + insetTop) next = offset - insetTop;
        else if (offset + size > current + extent - insetBottom) next = offset + size - extent + insetBottom;
        if (next !== current) top = mapping.toPhysical(Math.max(0, Math.min(next, Math.max(0, metrics.totalHeight - extent))));
      }
    }
    const center = this.engine.getSnapshot().columns.center;
    const ci = center.findIndex((c) => c.columnId === target.columnId);
    if (ci >= 0) {
      const metrics = layout.getCenterMetrics();
      const extent = layout.centerExtent();
      const offset = metrics.offsetOf(ci);
      const size = metrics.widthOf(ci);
      if (offset < left) left = offset;
      else if (offset + size > left + extent) left = Math.max(0, offset + size - extent);
      left = revealPastFixed(this.engine.getSnapshot().columns, metrics, ci, left, scroll.left, extent);
    }
    if (top === scroll.top && left === scroll.left) return null;
    layout.setScroll(top, left);
    return { top, left };
  }

  private writeScroll(scroll: { top: number; left: number } | null): void {
    const viewport = this.instance.getViewport();
    if (!scroll || !viewport) return;
    viewport.scrollTop = scroll.top;
    viewport.scrollLeft = this.instance.rtl ? -scroll.left : scroll.left;
  }

  private pageRows(): number {
    const layout = this.instance.layout;
    return Math.max(1, Math.floor(layout.bodyExtent() / layout.config.rowHeight));
  }

  // ------------------------------------------------------------------------
  // Focus and selection actions
  // ------------------------------------------------------------------------

  private dispatch(source: DataGridEventSource, command: DataGridCommand): void {
    this.instance.dispatchFrom(source, command);
  }

  /**
   * One user action: commands in one engine batch and one synchronous React
   * commit (the newly focused cell, and rows that enter after a scroll, are in
   * the DOM before the frame paints), then the scroll write and DOM focus.
   */
  private act(source: DataGridEventSource, run: () => void, domFocus: boolean): void {
    let scroll: { top: number; left: number } | null = null;
    flushSync(() => {
      this.engine.batch(() => {
        this.instance.pendingSource = source;
        try {
          run();
        } finally {
          this.instance.pendingSource = null;
        }
      });
      scroll = this.reveal(this.focusTarget());
    });
    this.writeScroll(scroll);
    if (domFocus) this.syncDomFocus(true);
  }

  private followsFocus(): boolean {
    const o = this.selectionState()?.options;
    return o !== undefined && o.enabled && !o.checkbox && !o.checkboxOnly;
  }

  private moveFocus(direction: FocusDirection, extend: boolean, source: DataGridEventSource = 'keyboard'): boolean {
    const before = this.focusTarget();
    if (!before) return false;
    this.act(
      source,
      () => {
        this.engine.dispatch({ type: 'focus.move', direction, pageSize: this.pageRows() });
        const after = this.focusTarget();
        if (!after || after.kind !== 'cell' || sameTarget(before, after)) return;
        if (extend) this.extendTo(before, after);
        else if (this.followsFocus()) this.selectTarget(after);
      },
      true,
    );
    return true;
  }

  private selectTarget(target: FocusTarget): void {
    const state = this.selectionState();
    if (!state || !state.options.enabled || target.kind !== 'cell' || isSyntheticRow(target.rowId)) return;
    const mode = state.options.mode;
    if (mode !== 'cell') this.engine.dispatch({ type: 'selection.selectRows', rowIds: [target.rowId] });
    if (mode !== 'row') this.engine.dispatch({ type: 'selection.selectCells', cells: [{ rowId: target.rowId, columnId: target.columnId }] });
  }

  private extendTo(before: FocusTarget, after: FocusTarget & { kind: 'cell' }): void {
    const state = this.selectionState();
    if (!state || !state.options.enabled) return;
    if (state.options.type === 'single') return this.selectTarget(after);
    const mode = state.options.mode;
    if (mode !== 'cell') {
      const fromId = state.rows.anchorId ?? (before.kind === 'cell' ? before.rowId : after.rowId);
      this.engine.dispatch({ type: 'selection.selectRange', fromId, toId: after.rowId });
    }
    if (mode !== 'row') {
      if (!state.cells.anchor && before.kind === 'cell') this.engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: before.rowId, columnId: before.columnId }, focus: { rowId: before.rowId, columnId: before.columnId } });
      this.engine.dispatch({ type: 'selection.extendCellSelection', focus: { rowId: after.rowId, columnId: after.columnId } });
    }
  }

  focusTargetFrom(target: FocusTarget, source: DataGridEventSource, options: { force?: boolean } = {}): void {
    this.act(source, () => this.engine.dispatch({ type: 'focus.set', target }), options.force !== false);
  }

  /** `api.focus()` / Alt+W: the logical target (scrolled into view) or the first cell. */
  focusContent(): void {
    const target = this.focusTarget();
    if (!target) return;
    this.focusTargetFrom(target, 'api');
  }

  /**
   * The body cell to return to: the current target when it is a body cell, else the last focused body
   * cell (core `lastCell`) when it is still in the view, else the first body cell; null without body rows.
   */
  bodyTarget(): FocusTarget | null {
    const target = this.focusTarget();
    if (target?.kind === 'cell') return target;
    const last = this.focusState()?.lastCell ?? null;
    const columns = this.engine.getSnapshot().columns;
    if (last && this.engine.getRowIndex(last.rowId) >= 0 && columns.visible.some((c) => c.columnId === last.columnId)) return { kind: 'cell', rowId: last.rowId, columnId: last.columnId };
    const rowId = this.engine.getRowIdAt(0);
    const first = columns.visible[0];
    return rowId !== undefined && first ? { kind: 'cell', rowId, columnId: first.columnId } : null;
  }

  /** `api.focus()` / Alt+W: the grid content, from the header too. */
  focusBody(): void {
    const target = this.bodyTarget() ?? this.focusTarget();
    if (!target) return;
    this.focusTargetFrom(target, 'api');
  }

  getFocusedCell(): DataGridFocusedCell | null {
    const t = this.focusState()?.target ?? null;
    if (!t) return null;
    return t.kind === 'cell' ? { rowId: t.rowId, field: t.columnId, region: 'body' } : { rowId: null, field: t.columnId, region: 'header' };
  }

  // ------------------------------------------------------------------------
  // Keymap registry
  // ------------------------------------------------------------------------

  registerKeyHandler(command: string, handler: DataGridKeyHandler, priority = 0): () => void {
    const list = this.handlers.get(command) ?? [];
    const entry: HandlerEntry = { handler, priority };
    const next = [...list, entry].sort((a, b) => b.priority - a.priority);
    this.handlers.set(command, next);
    return () => {
      const current = this.handlers.get(command);
      if (current) this.handlers.set(command, current.filter((e) => e !== entry));
    };
  }

  /**
   * Keys of a context that the root handler does not see (cell editors stop
   * propagation): the `onKeyDown` hook, then the bound command's handlers.
   */
  handleKey(event: KeyboardEvent, context: DataGridKeyContext): boolean {
    const command = this.keymap.resolve(event, context);
    if (this.instance.props.onKeyDown && this.keyDownHook(event, command, context)) return false;
    return command !== null && this.run(command, event, context);
  }

  /**
   * Calls `onKeyDown` (bound) with its context; true when the hook called
   * `preventDefault()`. the context is frozen in development like
   * every `gridEvent` object; production skips the freeze.
   */
  private keyDownHook(nativeEvent: KeyboardEvent, command: string | null, context: DataGridKeyContext): boolean {
    const hook = this.instance.props.onKeyDown;
    if (!hook) return false;
    let prevented = false;
    const focused = this.focusTarget();
    const ctx: DataGridKeyDownContext = {
      nativeEvent,
      command,
      context,
      rowId: focused?.kind === 'cell' ? focused.rowId : null,
      field: focused?.columnId ?? null,
      preventDefault: () => {
        prevented = true;
      },
    };
    hook(DEV ? Object.freeze(ctx) : ctx);
    return prevented;
  }

  private run(command: string, event: KeyboardEvent, context: DataGridKeyContext): boolean {
    const list = this.handlers.get(command);
    if (!list) return false;
    for (const entry of list) if (entry.handler({ nativeEvent: event, context, command })) return true;
    return false;
  }

  private registerBuiltIns(): void {
    const focusMoves: [string, FocusDirection][] = [
      ['focus.up', 'up'],
      ['focus.down', 'down'],
      ['focus.left', 'left'],
      ['focus.right', 'right'],
      ['focus.home', 'home'],
      ['focus.end', 'end'],
      ['focus.pageUp', 'pageUp'],
      ['focus.pageDown', 'pageDown'],
      ['focus.firstCell', 'firstCell'],
      ['focus.lastCell', 'lastCell'],
    ];
    for (const [command, direction] of focusMoves) this.registerKeyHandler(command, () => this.moveFocus(direction, false));
    // F6 / Shift+F6 cycle the rendered regions, replacing the core header/body toggle.
    this.registerKeyHandler('focus.nextRegion', (ctx) => this.cycleRegion(ctx.nativeEvent, true));
    this.registerKeyHandler('focus.previousRegion', (ctx) => this.cycleRegion(ctx.nativeEvent, false));
    const extends_: [string, FocusDirection][] = [
      ['selection.extendUp', 'up'],
      ['selection.extendDown', 'down'],
      ['selection.extendLeft', 'left'],
      ['selection.extendRight', 'right'],
    ];
    for (const [command, direction] of extends_) {
      this.registerKeyHandler(command, () => (this.selectionEnabled ? this.moveFocus(direction, true) : this.moveFocus(direction, false)));
    }
    this.registerKeyHandler('selection.enterDown', () => this.enterMove('down'));
    this.registerKeyHandler('selection.enterUp', () => this.enterMove('up'));
    this.registerKeyHandler('selection.toggle', () => this.toggleFocused());
    this.registerKeyHandler('selection.selectRow', () => this.selectFocusedRow());
    this.registerKeyHandler('selection.selectColumn', () => this.selectFocusedColumn());
    this.registerKeyHandler('selection.selectAll', () => this.selectAll(false));
    this.registerKeyHandler('selection.selectAllFiltered', () => this.selectAll(true));
    this.registerKeyHandler('selection.clear', () => this.clearSelection());
    this.registerKeyHandler('grid.focusRoot', () => {
      const root = this.instance.root;
      if (!root) return false;
      root.focus({ preventScroll: true });
      return true;
    });
    this.registerKeyHandler('grid.focusContent', () => {
      this.focusBody();
      return true;
    });
    this.registerKeyHandler('header.activate', () => this.activateHeader(false));
    this.registerKeyHandler('header.sort', () => this.activateHeader(false) || this.instance.headerCommand('sort', this.headerColumnId()));
    this.registerKeyHandler('header.sortMulti', () => this.instance.headerCommand('sortMulti', this.headerColumnId()));
    this.registerKeyHandler('header.removeSort', () => this.instance.headerCommand('removeSort', this.headerColumnId()));
    this.registerKeyHandler('header.moveLeft', () => this.instance.headerCommand('moveLeft', this.headerColumnId()));
    this.registerKeyHandler('header.moveRight', () => this.instance.headerCommand('moveRight', this.headerColumnId()));
    this.registerKeyHandler('header.resizeNarrower', () => this.instance.headerCommand('resizeNarrower', this.headerColumnId()));
    this.registerKeyHandler('header.resizeWider', () => this.instance.headerCommand('resizeWider', this.headerColumnId()));
    this.registerKeyHandler('header.autoSize', () => this.instance.headerCommand('autoSize', this.headerColumnId()));
  }

  private headerColumnId(): ColumnId | null {
    const t = this.focusTarget();
    return t?.kind === 'header' ? t.columnId : null;
  }

  private focusedCell(): (FocusTarget & { kind: 'cell' }) | null {
    const t = this.focusTarget();
    return t?.kind === 'cell' && this.engine.getRowIndex(t.rowId) >= 0 ? t : null;
  }

  private enterMove(direction: 'down' | 'up'): boolean {
    const state = this.selectionState();
    if (!state || !state.options.enabled || !state.options.enterMoves) return false;
    const before = this.focusedCell();
    if (!before) return false;
    this.act(
      'keyboard',
      () => {
        this.engine.dispatch({ type: 'focus.move', direction });
        const after = this.focusTarget();
        if (after && after.kind === 'cell') this.selectTarget(after);
      },
      true,
    );
    return true;
  }

  private toggleFocused(): boolean {
    const state = this.selectionState();
    const cell = this.focusedCell();
    if (!state || !state.options.enabled || !cell) return false;
    this.act(
      'keyboard',
      () => {
        if (state.options.mode !== 'cell') this.engine.dispatch({ type: 'selection.toggleRow', rowId: cell.rowId });
        if (state.options.mode !== 'row') this.engine.dispatch({ type: 'selection.selectCells', cells: [{ rowId: cell.rowId, columnId: cell.columnId }], mode: state.options.type === 'multiple' ? 'toggle' : 'replace' });
      },
      false,
    );
    return true;
  }

  private selectFocusedRow(): boolean {
    const state = this.selectionState();
    const cell = this.focusedCell();
    if (!state || !state.options.enabled || !cell) return false;
    const visible = this.engine.getSnapshot().columns.visible;
    const first = visible[0];
    const last = visible[visible.length - 1];
    this.act(
      'keyboard',
      () => {
        if (state.options.mode !== 'cell') this.engine.dispatch({ type: 'selection.selectRows', rowIds: [cell.rowId], mode: state.options.type === 'multiple' ? 'add' : 'replace' });
        if (state.options.mode !== 'row' && first && last) {
          this.engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: cell.rowId, columnId: first.columnId }, focus: { rowId: cell.rowId, columnId: last.columnId } });
        }
      },
      false,
    );
    return true;
  }

  private selectFocusedColumn(): boolean {
    const state = this.selectionState();
    const cell = this.focusedCell();
    if (!state || !state.options.enabled || !state.options.columns || !cell) return false;
    this.act('keyboard', () => this.engine.dispatch({ type: 'selection.selectColumns', columnIds: [cell.columnId], mode: 'toggle' }), false);
    return true;
  }

  private selectAll(filtered: boolean): boolean {
    const state = this.selectionState();
    if (!state || !state.options.enabled || state.options.type !== 'multiple') return false;
    this.act(
      'keyboard',
      () => {
        if (state.options.mode !== 'cell') this.engine.dispatch({ type: filtered ? 'selection.selectAllFiltered' : 'selection.selectAllVisible' });
        else {
          const visible = this.engine.getSnapshot().columns.visible;
          const count = this.engine.getSnapshot().rows.count;
          const firstRow = this.engine.getRowIdAt(0);
          const lastRow = this.engine.getRowIdAt(count - 1);
          const first = visible[0];
          const last = visible[visible.length - 1];
          if (firstRow !== undefined && lastRow !== undefined && first && last) {
            this.engine.dispatch({ type: 'selection.setCellRange', anchor: { rowId: firstRow, columnId: first.columnId }, focus: { rowId: lastRow, columnId: last.columnId } });
          }
        }
      },
      false,
    );
    return true;
  }

  private clearSelection(): boolean {
    const state = this.selectionState();
    if (!state) return false;
    const empty = state.rows.scope === 'explicit' && state.rows.ids.size === 0 && state.cells.ranges.length === 0 && state.columns.length === 0;
    if (empty) return false; // Escape resolution rule 5: not consumed
    this.act('keyboard', () => this.engine.dispatch({ type: 'selection.clear' }), false);
    return true;
  }

  /** Enter or Space on the selection column header toggles select-all. */
  private activateHeader(_multi: boolean): boolean {
    const id = this.headerColumnId();
    if (id !== SELECTION_COLUMN_ID && !(id && this.isSelectionColumnId(id))) return false;
    this.toggleAll('keyboard');
    return true;
  }

  isSelectionColumnId(columnId: ColumnId): boolean {
    const column = this.engine.getSnapshot().columns.byId.get(columnId);
    return column !== undefined && column.leaf && this.isSelectionColumn(column);
  }

  toggleAll(source: DataGridEventSource): void {
    const state = this.selectionState();
    if (!state || !state.options.enabled || state.options.type !== 'multiple') return;
    this.act(source, () => this.engine.dispatch({ type: 'selection.toggleAll' }), false);
  }

  // ------------------------------------------------------------------------
  // DOM events (delegated on the root)
  // ------------------------------------------------------------------------

  // ------------------------------------------------------------------------
  // F6 regions: toolbar → adaptive bar → group panel → header → body → footer → pager
  // ------------------------------------------------------------------------

  private regionOf(target: Element | null): DataGridRegion | null {
    const root = this.instance.root;
    if (!root || !target) return null;
    if (root.contains(target)) {
      if (target.closest('.salmon-data-grid-header')) return 'header';
      if (target.closest('.salmon-data-grid-footer')) return 'footer';
      return 'body';
    }
    for (const region of ['toolbar', 'adaptiveBar', 'groupPanel', 'pager'] as const) if (this.regionElement(region)?.contains(target)) return region;
    return null;
  }

  /** The element of a region outside the root (siblings of the root: toolbar, adaptive bar, group panel, pager). */
  private regionElement(region: 'toolbar' | 'adaptiveBar' | 'groupPanel' | 'pager'): HTMLElement | null {
    const root = this.instance.root;
    if (!root) return null;
    if (region === 'groupPanel') return this.instance.groupPanel;
    if (region === 'toolbar') return this.instance.api.getPartElement('toolbar');
    if (region === 'pager') return this.instance.api.getPartElement('pager');
    for (let el = root.previousElementSibling; el; el = el.previousElementSibling) if (el.classList.contains('salmon-data-grid-adaptive-bar')) return el as HTMLElement;
    return null;
  }

  /** Moves DOM focus into a region; false when the region is not rendered or has nothing to focus. */
  private enterRegion(region: DataGridRegion): boolean {
    const root = this.instance.root;
    if (!root) return false;
    const focusEl = (el: Element | null | undefined): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      el.focus({ preventScroll: true });
      return el.ownerDocument.activeElement === el;
    };
    switch (region) {
      case 'toolbar':
      case 'adaptiveBar': {
        const bar = this.regionElement(region);
        return focusEl(bar?.querySelector('[tabindex="0"]:not([disabled])') ?? bar?.querySelector('button:not([disabled]):not([tabindex="-1"]), input:not([disabled])'));
      }
      case 'groupPanel':
        return focusEl(this.instance.groupPanel?.querySelector('.salmon-data-grid-group-chip__label'));
      case 'pager': {
        const pager = this.regionElement('pager');
        return focusEl(pager?.querySelector('[aria-current="page"]') ?? pager?.querySelector('button:not([disabled]), select:not([disabled]), input:not([disabled])'));
      }
      case 'footer':
        return focusEl(root.querySelector('.salmon-data-grid-footer .salmon-data-grid-cell'));
      case 'header': {
        const visible = this.engine.getSnapshot().columns.visible;
        if (!visible.length || !root.querySelector('.salmon-data-grid-header-cell')) return false;
        const t = this.focusTarget();
        const last = this.focusState()?.lastCell ?? null;
        const columnId = t?.kind === 'header' ? t.columnId : t?.kind === 'cell' ? t.columnId : (last?.columnId ?? (visible[0] as { columnId: ColumnId }).columnId);
        const column = visible.some((c) => c.columnId === columnId) ? columnId : (visible[0] as { columnId: ColumnId }).columnId;
        this.focusTargetFrom({ kind: 'header', columnId: column, level: t?.kind === 'header' ? t.level : 0 }, 'keyboard');
        return true;
      }
      case 'body': {
        const target = this.bodyTarget();
        if (!target) return false;
        this.focusTargetFrom(target, 'keyboard');
        return true;
      }
    }
  }

  /**
   * F6 / Shift+F6: the next / previous rendered region in DOM order, wrapping.
   * The body region restores the last focused body cell.
   */
  cycleRegion(event: KeyboardEvent, forward: boolean): boolean {
    const from = this.regionOf(event.target as Element | null) ?? 'body';
    const at = REGION_ORDER.indexOf(from);
    const n = REGION_ORDER.length;
    for (let step = 1; step < n; step++) {
      const region = REGION_ORDER[(at + (forward ? step : -step) + n) % n] as DataGridRegion;
      if (this.enterRegion(region)) return true;
    }
    // The only region: the key is still consumed (focus stays).
    return true;
  }

  /** F6 / Shift+F6 from a region whose keys do not reach the grid keymap (toolbar, adaptive bar). */
  regionKey(event: KeyboardEvent): boolean {
    const command = this.keymap.resolve(event, 'body');
    if (command !== 'focus.nextRegion' && command !== 'focus.previousRegion') return false;
    return this.run(command, event, 'body');
  }

  private contextOf(target: Element): KeyContext {
    if (target.closest('.salmon-data-grid-pager')) return 'pager';
    if (target.closest('.salmon-data-grid-header')) return 'header';
    if (target.closest('.salmon-data-grid-group-chip')) return 'groupChip';
    if (target.closest('.salmon-data-grid-group-caption')) return 'groupCaption';
    return 'body';
  }

  readonly onKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    const target = event.target as HTMLElement;
    const root = this.instance.root;
    if (!root) return;
    // Keys typed into editors or inputs inside cell templates belong to them.
    if (target !== root && isEditable(target)) return;
    const context = this.contextOf(target);
    const native = event.nativeEvent;
    const command = this.keymap.resolve(native, context);
    // Footer (aggregate) cells are an F6 stop only; every other key belongs to the page.
    if (command !== 'focus.nextRegion' && command !== 'focus.previousRegion' && target.closest('.salmon-data-grid-footer')) return;
    if (this.instance.props.onKeyDown && this.keyDownHook(native, command, context)) return;
    if (command !== null && this.run(command, native, context)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // Group caption rows are body rows for every key the caption does not consume.
    const fallback = context === 'groupCaption' ? this.keymap.resolve(native, 'body') : null;
    if (fallback !== null && this.run(fallback, native, 'body')) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    // An unbound scroll key (Ctrl+End on macOS) on the grid itself would start a browser
    // smooth scroll of the viewport that later scroll writes do not stop, carrying the
    // focused cell out of the rendered window. The grid owns its scroll position.
    if (command === null && fallback === null && NATIVE_SCROLL_KEY.test(native.key) && (target === root || target.matches('.salmon-data-grid-cell, .salmon-data-grid-header-cell'))) event.preventDefault();
  };

  /** Document-level Alt+J / Alt+W (one listener per grid; the last focused grid answers). */
  private readonly onDocumentKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented || !event.altKey) return;
    const command = this.keymap.resolve(event, 'global');
    if (command === null) return;
    const root = this.instance.root;
    if (!root) return;
    const first = root.ownerDocument.querySelector('.salmon-data-grid');
    if (lastFocusedGrid !== this && !(lastFocusedGrid === null && first === root)) return;
    if (this.run(command, event, 'global')) event.preventDefault();
  };

  /** focusin: pointer and programmatic focus set the logical focus too. */
  readonly onFocus = (event: ReactFocusEvent<HTMLElement>): void => {
    lastFocusedGrid = this;
    const target = event.target as HTMLElement;
    const root = this.instance.root;
    if (!root || target === root) return;
    const cell = target.closest<HTMLElement>('.salmon-data-grid-cell, .salmon-data-grid-header-cell');
    if (!cell || !root.contains(cell)) return;
    const columnId = cell.dataset['columnId'];
    if (columnId === undefined) return;
    let next: FocusTarget;
    if (cell.classList.contains('salmon-data-grid-header-cell')) next = { kind: 'header', columnId, level: 0 };
    else {
      const rowId = cell.closest<HTMLElement>('[data-row-id]')?.dataset['rowId'];
      if (rowId === undefined) return;
      next = { kind: 'cell', rowId, columnId };
    }
    if (sameTarget(this.focusState()?.target ?? null, next)) return;
    this.dispatch('pointer', { type: 'focus.set', target: next });
  };

  /** Shift+mousedown would start a native text selection; the click selects a range instead. */
  readonly onMouseDown = (event: ReactMouseEvent<HTMLElement>): void => {
    if (!event.shiftKey || event.button !== 0) return;
    const target = event.target as Element;
    if (target.closest('.salmon-data-grid-rows [data-row-id]') && !isEditable(target)) {
      event.preventDefault();
      const cell = target.closest<HTMLElement>('.salmon-data-grid-cell');
      cell?.focus({ preventScroll: true });
    }
  };

  /** Body click: selection by modifiers. */
  readonly onClick = (event: ReactMouseEvent<HTMLElement>): void => {
    if (event.defaultPrevented || event.button !== 0) return;
    const target = event.target as Element;
    const rowEl = target.closest<HTMLElement>('.salmon-data-grid-rows [data-row-id]');
    const root = this.instance.root;
    if (!rowEl || !root || !root.contains(rowEl)) return;
    const rowId = rowEl.dataset['rowId'] as RowId;
    if (isSyntheticRow(rowId)) return;
    const cellEl = target.closest<HTMLElement>('.salmon-data-grid-cell');
    const columnId = cellEl?.dataset['columnId'];
    const state = this.selectionState();
    if (!state || !state.options.enabled || isEditable(target)) return;
    const source: DataGridEventSource = (event.nativeEvent as PointerEvent).pointerType === 'touch' ? 'touch' : 'pointer';
    const o = state.options;
    const multi = o.type === 'multiple';
    const mod = event.ctrlKey || event.metaKey;
    const checkbox = columnId !== undefined && this.isSelectionColumnId(columnId);
    const facade = this.selectionFacade() as SelectionFacade;
    this.inputContext = { ctrlKey: mod, shiftKey: event.shiftKey, target: checkbox ? 'checkbox' : o.mode === 'cell' ? 'cell' : 'row' };
    try {
    this.act(
      source,
      () => {
        if (columnId !== undefined && !sameTarget(this.focusState()?.target ?? null, { kind: 'cell', rowId, columnId })) {
          this.engine.dispatch({ type: 'focus.set', target: { kind: 'cell', rowId, columnId } });
        }
        if (o.mode !== 'cell') {
          if (checkbox) {
            this.engine.dispatch({ type: 'selection.toggleRow', rowId });
          } else if (o.checkboxOnly) {
            // Only the checkbox selects.
          } else if (event.shiftKey && multi) {
            this.engine.dispatch(mod ? { type: 'selection.selectRange', toId: rowId, mode: 'add' } : { type: 'selection.selectRange', toId: rowId });
          } else if (mod && multi) {
            this.engine.dispatch({ type: 'selection.toggleRow', rowId });
          } else if (multi && ((o.checkbox && o.checkboxMode === 'default') || o.simpleMultiRow)) {
            this.engine.dispatch({ type: 'selection.toggleRow', rowId });
          } else {
            const only = facade.isRowSelected(rowId) && facade.getSummary().count === 1 && state.rows.scope === 'explicit' && state.rows.ids.size === 1;
            this.engine.dispatch(only && o.toggle ? { type: 'selection.clear', rows: true } : { type: 'selection.selectRows', rowIds: [rowId] });
          }
        }
        if (o.mode !== 'row' && columnId !== undefined && !checkbox) {
          const cell = { rowId, columnId };
          if (event.shiftKey && multi) this.engine.dispatch({ type: 'selection.extendCellSelection', focus: cell });
          else if (mod && multi) this.engine.dispatch({ type: 'selection.selectCells', cells: [cell], mode: 'toggle' });
          else {
            const only = state.cells.ranges.length === 1 && state.cells.ranges[0]?.anchor.rowId === rowId && state.cells.ranges[0]?.anchor.columnId === columnId && state.cells.ranges[0]?.focus.rowId === rowId && state.cells.ranges[0]?.focus.columnId === columnId;
            this.engine.dispatch(only && o.toggle ? { type: 'selection.clear', cells: true } : { type: 'selection.selectCells', cells: [cell] });
          }
        }
      },
      true,
    );
    } finally {
      this.inputContext = null;
    }
  };

  // ------------------------------------------------------------------------
  // Selection events
  // ------------------------------------------------------------------------

  /** Modifiers and target of the pointer input being handled (selection events report them). */
  private inputContext: { ctrlKey: boolean; shiftKey: boolean; target: DataGridSelectionChangeEvent<Row>['target'] } | null = null;
  /** After-event of a command whose before-event passed, awaiting the commit. */
  private pendingSelection: DataGridSelectionChangeEvent<Row> | null = null;

  private selectionEvent(type: string, source: DataGridEventSource, command: DataGridCommand): DataGridSelectionChangeEvent<Row> | null {
    const preview = this.selectionFacade()?.preview(command);
    if (!preview) return null;
    const engine = this.engine;
    const input = this.inputContext;
    const t = command.type;
    const changes = preview.changes;
    // The part this command selects: a click in
    // `mode: 'both'` dispatches a row command and a cell command, each with its own event.
    const part: DataGridSelectionChangeEvent<Row>['target'] =
      t === 'selection.selectColumns' ? 'column'
      : t === 'selection.selectCells' || t === 'selection.setCellRange' || t === 'selection.extendCellSelection' ? 'cell'
      : changes.rows ? 'row'
      : changes.cells ? 'cell'
      : changes.columns ? 'column'
      : 'row';
    const target = input?.target === 'checkbox' ? 'checkbox' : part;
    const cellKeys = (list: readonly { readonly rowId: RowId; readonly columnId: string }[]): readonly DataGridCellKey[] => list.map((c) => ({ rowId: c.rowId, field: c.columnId }));
    const fields: Record<string, unknown> = {
      scope: preview.scope,
      ctrlKey: input?.ctrlKey ?? false,
      shiftKey: input?.shiftKey ?? false,
      target,
      rows: (): readonly Row[] => {
        const out: Row[] = [];
        for (const id of preview.selectedRowIds) {
          const row = engine.getRow(id);
          if (row !== undefined) out.push(row);
        }
        return out;
      },
    };
    // Large fields are materialized on first read (the preview computes them lazily).
    for (const key of ['added', 'removed', 'excludedRowIds'] as const) Object.defineProperty(fields, key, { get: () => preview[key], enumerable: true });
    Object.defineProperty(fields, 'rowIds', { get: () => preview.selectedRowIds, enumerable: true });
    Object.defineProperty(fields, 'cells', {
      get: (): readonly DataGridCellKey[] => {
        const out: DataGridCellKey[] = [];
        for (const range of preview.cellRanges) {
          out.push({ rowId: range.anchor.rowId, field: range.anchor.columnId });
          if (range.focus.rowId !== range.anchor.rowId || range.focus.columnId !== range.anchor.columnId) out.push({ rowId: range.focus.rowId, field: range.focus.columnId });
        }
        return out;
      },
      enumerable: true,
    });
    Object.defineProperty(fields, 'columns', { get: () => preview.columnIds, enumerable: true });
    Object.defineProperty(fields, 'addedCells', { get: () => cellKeys(preview.addedCells), enumerable: true });
    Object.defineProperty(fields, 'removedCells', { get: () => cellKeys(preview.removedCells), enumerable: true });
    Object.defineProperty(fields, 'addedColumns', { get: () => preview.addedColumns, enumerable: true });
    Object.defineProperty(fields, 'removedColumns', { get: () => preview.removedColumns, enumerable: true });
    return gridEvent<DataGridSelectionChangeEvent<Row>>(type, source, fields as never);
  }

  /** onBeforeCommand: `onBeforeSelectionChange` (cancellable). Events are built only when a handler is bound. */
  beforeSelectionCommand(command: DataGridCommand, source: DataGridEventSource): boolean | void {
    const p = this.instance.props;
    this.pendingSelection = null;
    if (p.onBeforeSelectionChange) {
      const event = this.selectionEvent('beforeSelectionChange', source, command);
      if (!event) return;
      p.onBeforeSelectionChange(event);
      if (event.defaultPrevented) return false;
    }
    if (p.onSelectionChange) this.pendingSelection = this.selectionEvent('selectionChange', source, command);
  }

  /** onCommand: `onSelectionChange` after the commit. */
  afterSelectionCommand(event: CommandEvent): void {
    const pending = this.pendingSelection;
    this.pendingSelection = null;
    if (!pending || event.result.status !== 'applied') return;
    this.instance.props.onSelectionChange?.(pending);
  }

  // ------------------------------------------------------------------------
  // Announcements (two live regions, debounced, written to the DOM directly)
  // ------------------------------------------------------------------------

  /**
   * Polite announcements are debounced to one per 150 ms. Within a window the
   * latest message wins, except that a data-operation message (sort, filter,
   * page, loading; priority 1) is not replaced by a selection message
   * (priority 0) caused by the same operation.
   */
  announce(message: string, assertive = false, priority = 1): void {
    if (assertive) {
      if (this.alert) this.alert.textContent = message;
      return;
    }
    if (this.announceTimer !== null) {
      if (priority < this.pendingPriority) return;
      clearTimeout(this.announceTimer);
    }
    this.pendingPriority = priority;
    this.announceTimer = setTimeout(() => {
      this.announceTimer = null;
      this.pendingPriority = -1;
      const el = this.live;
      if (!el) return;
      // Re-announce identical text: screen readers ignore unchanged content.
      el.textContent = el.textContent === message ? `${message} ` : message;
    }, ANNOUNCE_DEBOUNCE);
  }

  private onSelectionModuleChange = (): void => {
    const state = this.selectionState();
    const facade = this.selectionFacade();
    if (!state || !facade || state.options.mode === 'cell') return;
    const summary = facade.getSummary();
    if (summary.count === this.lastSelectedCount) return;
    const previous = this.lastSelectedCount;
    this.lastSelectedCount = summary.count;
    if (previous < 0) return;
    if (summary.count === 0) this.announce(this.text('selectionCleared'), false, 0);
    else if (summary.header === 'all' && summary.count > 1) this.announce(this.text('allRowsSelected', { count: summary.count }), false, 0);
    else this.announce(this.text('rowsSelected', { count: summary.count }), false, 0);
  };

  /** Client-only: subscriptions, document listener, direction detection. Returns the teardown. */
  mount(): () => void {
    const engine = this.engine;
    const root = this.instance.root;
    const doc = this.doc();
    const platform = detectPlatform();
    if (platform !== this.keymap.platform) this.keymap = this.buildKeymap(platform);
    if (root) {
      // Resolved direction: the `dir` prop, or inherited `dir`.
      const dir = this.instance.resolvedDir(this.instance.props) ?? (root.ownerDocument.defaultView?.getComputedStyle(root).direction === 'rtl' ? 'rtl' : 'ltr');
      this.instance.setDirection(dir);
      // Pin the default tab stop so later row changes notify it exactly.
      if (this.focusState() && this.focusState()?.target === null) {
        const target = this.focusTarget();
        if (target) engine.dispatch({ type: 'focus.set', target });
      }
      if (!this.targetEl) root.tabIndex = 0;
      else root.tabIndex = -1;
    }
    const summary = this.selectionFacade()?.getSummary();
    this.lastSelectedCount = summary ? summary.count : -1;
    const offs: (() => void)[] = [];
    offs.push(engine.subscribeModule('selection', this.onSelectionModuleChange));
    offs.push(
      engine.subscribeSelector(
        (s) => s.query.sorting,
        (sorting) => {
          const first = sorting[0];
          if (!first) return this.announce(this.text('sortCleared'));
          const header = engine.getSnapshot().columns.byId.get(first.columnId)?.headerText ?? first.columnId;
          this.announce(this.text('sortedBy', { column: header, direction: this.text(first.direction === 'asc' ? 'ascending' : 'descending') }));
        },
      ),
    );
    let lastFilter = { filters: engine.getSnapshot().query.filters, search: engine.getSnapshot().query.search };
    offs.push(
      engine.subscribeSelector(
        (s) => s.rows,
        () => {
          const snap = engine.getSnapshot();
          const q = snap.query;
          if (q.filters === lastFilter.filters && q.search === lastFilter.search) return;
          const searchChanged = q.search !== lastFilter.search;
          lastFilter = { filters: q.filters, search: q.search };
          const shown = this.filteredCount();
          if (searchChanged && q.search && q.search.text) this.announce(this.text('searchMatches', { count: shown }));
          else this.announce(this.text('filtered', { filters: q.filters.length, shown, total: snap.data.totalRowCount }));
        },
      ),
    );
    offs.push(
      engine.subscribeSelector(
        (s) => s.query.paging?.page ?? 0,
        (page) => {
          const info = (engine as unknown as { paging?: { getInfo(): { page: number; pageCount: number } } }).paging?.getInfo();
          if (info && page) this.announce(this.text('pageOf', { page: info.page, pageCount: info.pageCount }));
        },
      ),
    );
    offs.push(
      engine.subscribeSelector(
        (s) => s.data.status,
        (status) => {
          if (this.loadingTimer !== null) clearTimeout(this.loadingTimer);
          this.loadingTimer = null;
          if (status === 'loading') {
            this.loadingTimer = setTimeout(() => {
              this.loadingTimer = null;
              this.announcedLoading = true;
              this.announce(this.text('loading'));
            }, LOADING_DELAY);
          } else if (status === 'ready' && this.announcedLoading) {
            this.announcedLoading = false;
            this.announce(this.text('loaded', { count: engine.getSnapshot().rows.count }));
          } else if (status === 'error') {
            const error = engine.getSnapshot().data.error;
            this.announce(this.text('dataError', { message: error instanceof Error ? error.message : error == null ? this.text('error') : String(error) }), true);
          }
        },
      ),
    );
    doc?.addEventListener('keydown', this.onDocumentKeyDown);
    if (DEV && this.instance.props.keyBindings) {
      // Development only (dropped from production builds with its message): binding names the keymap does not know.
      const known = new Set(this.keymap.bindings.map((b) => b.command));
      for (const command of Object.keys(this.instance.props.keyBindings)) {
        if (!known.has(command)) warnOnce(`${this.instance.gridId}:keyBindings:${command}`, `DataGrid "${this.instance.gridId}": keyBindings names unknown command "${command}".`);
      }
    }
    return () => {
      for (const off of offs) off();
      doc?.removeEventListener('keydown', this.onDocumentKeyDown);
      if (this.announceTimer !== null) clearTimeout(this.announceTimer);
      if (this.loadingTimer !== null) clearTimeout(this.loadingTimer);
      this.announceTimer = null;
      this.loadingTimer = null;
      if (lastFocusedGrid === this) lastFocusedGrid = null;
    };
  }

  private filteredCount(): number {
    const info = (this.engine as unknown as { paging?: { getInfo(): { totalRowCount: number } } }).paging?.getInfo();
    return info ? info.totalRowCount : this.engine.getSnapshot().rows.count;
  }
}
