// Row drag and drop controller, in the lazy row drag chunk
// (`row-drag-chunk.ts`): pointer drags
// within a grid, into another grid (`rowDrag.targetId` + a shared
// `createRowDragHandoff` registry) or onto a custom element, auto-scroll,
// the drop indicator and preview, the keyboard moves, `moveRows`, and the
// drag events. The always-loaded part (handle column, layer, preview store,
// bindings that forward here) is `DataGridRowDragUi` in `row-drag.tsx`.
//
// Drag transients (pointer position, hit target, indicator, preview
// position, auto-scroll) live in this controller and the DOM, never in React
// state: pointer moves are coalesced to one animation frame, each frame
// dispatches at most one `rowDragDrop.over` (which never replaces the grid
// snapshot) and raises `onRowDrag` at most once. React renders the preview
// content twice per drag (start and end), never per frame.

import type { PointerEvent as ReactPointerEvent } from 'react';
import type { CommandEvent, DataGridCommand, RowDragDropState, RowDragEventInfo, RowDragHandoff, RowDragSession, RowId } from '@salmonui/data-grid/engine';
import { dataIndexAt, dataRowIdAt } from '@salmonui/data-grid/engine/expansion';
import type { DataGridMoveTarget, DataGridRowDragEvent, DataGridRowDragPreviewContext } from './detail-types.js';
import { gridEvent } from '@salmonui/core/internal/events';
import type { DataGridInstance } from './instance.js';
import { rowDragOf, type DataGridRowDragUi } from './row-drag.js';
import type { DataGridActionResult, DataGridProps } from './types.js';

const DRAG_THRESHOLD = 4;
/** Auto-scroll band at the body edges (px) and the top speed (px per frame). */
const EDGE = 40;
const MAX_SPEED = 24;

/** Mounted grids that accept dropped rows, by grid id (written on mount and unmount only). */
const dropTargets = new Map<string, RowDragController<any>>();

type RowDragFacade<Row> = {
  getSession(): RowDragSession | null;
  getEventArgs(): RowDragEventInfo<Row> | null;
};

interface PointerDrag {
  readonly rowId: RowId;
  readonly pointerId: number;
  readonly handle: HTMLElement;
  readonly startX: number;
  readonly startY: number;
  dragging: boolean;
  x: number;
  y: number;
  frame: number;
  /** Where the last frame resolved the pointer. */
  over: { kind: 'self' } | { kind: 'grid'; target: RowDragController<any> } | { kind: 'element'; element: Element } | { kind: 'none' };
  hit: Element | null;
  /** Last `onRowDrag` payload key (the event fires when the target changes, at most once per frame). */
  lastKey: string;
}

const DROP_COMMANDS = new Set(['rowDragDrop.drop', 'rowDragDrop.moveBy', 'rowDragDrop.reorder', 'rowDragDrop.move']);

export class RowDragController<Row> {
  private readonly instance: DataGridInstance<Row>;
  private readonly ui: DataGridRowDragUi<Row>;
  private drag: PointerDrag | null = null;
  /** Drop event payload captured by the before-listener, raised as `onRowDrop` after the write. */
  private pendingDrop: DataGridRowDragEvent<Row> | null = null;
  private dropTarget: Element | null = null;

  constructor(instance: DataGridInstance<Row>, ui: DataGridRowDragUi<Row>) {
    this.instance = instance;
    this.ui = ui;
  }

  get handoff(): RowDragHandoff | null {
    return this.ui.handoff;
  }

  private get indicator(): HTMLElement | null {
    return this.ui.indicatorElement;
  }

  private get preview(): HTMLElement | null {
    return this.ui.previewElement;
  }

  private setPreview(next: DataGridRowDragPreviewContext<Row> | null): void {
    this.ui.setPreview(next);
  }

  private get engine() {
    return this.instance.engine;
  }

  private facade(): RowDragFacade<Row> {
    return (this.engine as unknown as { rowDragDrop: RowDragFacade<Row> }).rowDragDrop;
  }

  private state(): RowDragDropState | undefined {
    return this.engine.getModuleState<RowDragDropState>('rowDragDrop');
  }

  // ------------------------------------------------------------------------
  // Lifecycle, prop sync, events
  // ------------------------------------------------------------------------

  sync(prev: DataGridProps<Row>, props: DataGridProps<Row>): void {
    const a = rowDragOf(prev);
    const b = rowDragOf(props);
    const state = this.state();
    if (!state) return;
    if ((b !== null) !== state.enabled) this.instance.syncDispatch({ type: 'rowDragDrop.setEnabled', enabled: b !== null });
    if (b && ((a?.acrossGroups ?? false) !== (b.acrossGroups ?? false) || (a?.orderField ?? null) !== (b.orderField ?? null))) {
      this.instance.syncDispatch({ type: 'rowDragDrop.setOptions', allowGroupChange: b.acrossGroups ?? false, orderField: b.orderField ?? null });
    }
  }

  mount(): () => void {
    const id = this.instance.gridId;
    dropTargets.set(id, this);
    const offBefore = this.engine.onBeforeCommand((event) => this.beforeCommand(event.command));
    const offAfter = this.engine.onCommand((event) => this.afterCommand(event));
    return () => {
      offBefore();
      offAfter();
      this.endPointer();
      if (dropTargets.get(id) === this) dropTargets.delete(id);
    };
  }

  private payload(info: RowDragEventInfo<Row> | null, fields: Partial<DataGridRowDragEvent<Row>> & { readonly rowIds: readonly RowId[] }): Omit<DataGridRowDragEvent<Row>, 'type' | 'source' | 'defaultPrevented' | 'preventDefault'> {
    const rows = (): readonly Row[] => info?.data ?? fields.rowIds.map((rid) => this.engine.getRow(rid)).filter((r): r is Row => r !== undefined);
    return {
      rowIds: fields.rowIds,
      rows,
      fromIndex: fields.fromIndex ?? info?.fromIndex ?? -1,
      toIndex: fields.toIndex ?? info?.dropIndex ?? -1,
      targetRowId: fields.targetRowId ?? null,
      position: fields.position ?? null,
      valid: fields.valid ?? info?.valid ?? false,
      reason: fields.reason !== undefined ? fields.reason : (info?.reason ?? null),
      targetGridId: fields.targetGridId !== undefined ? fields.targetGridId : this.instance.gridId,
      target: fields.target ?? null,
      // Tree mode: the parent the rows join.
      ...(fields.parentId !== undefined ? { parentId: fields.parentId } : {}),
    };
  }

  /** Tree mode: `{ parentId }` of a drop at `over` (`into`: the target; else the target's parent); `{}` outside tree mode. */
  private parentOf(over: { readonly rowId: RowId | null; readonly position: string; readonly parentId?: RowId | null } | null): { parentId?: RowId | null } {
    const tree = (this.engine as unknown as { tree?: { getTreeRow(rowId: RowId): { parentId: RowId | null } | null } }).tree;
    if (!tree || !over) return {};
    if (over.parentId !== undefined) return { parentId: over.parentId };
    if (over.rowId === null) return { parentId: null };
    return { parentId: over.position === 'into' ? over.rowId : (tree.getTreeRow(over.rowId)?.parentId ?? null) };
  }

  /** Data index of a row, or -1. */
  private dataIndexOf(rowId: RowId): number {
    const index = this.engine.getRowIndex(rowId);
    return index < 0 ? -1 : dataIndexAt(this.engine.getSnapshot().rows, index);
  }

  /** Rows a drag or a keyboard move of `rowId` carries: the selection when the row is selected. */
  private draggedIds(rowId: RowId): RowId[] {
    const selection = (this.engine as unknown as { selection?: { isRowSelected(id: RowId): boolean; getSelectedRowIds(): readonly RowId[] } }).selection;
    if (selection?.isRowSelected(rowId)) {
      const ids = selection.getSelectedRowIds().filter((id) => this.engine.getRowIndex(id) >= 0);
      ids.sort((a, b) => this.engine.getRowIndex(a) - this.engine.getRowIndex(b));
      if (ids.includes(rowId)) return ids;
    }
    return [rowId];
  }

  private beforeCommand(command: DataGridCommand): boolean | void {
    if (this.instance.isSyncing()) return;
    const p = this.instance.props;
    const source = this.instance.currentSource();
    if (command.type === 'rowDragDrop.start') {
      if (!p.onRowDragStart) return;
      const rowId = String(command['rowId'] ?? '');
      const rowIds = Array.isArray(command['rowIds']) && (command['rowIds'] as RowId[]).length ? (command['rowIds'] as RowId[]) : this.draggedIds(rowId);
      const e = gridEvent<DataGridRowDragEvent<Row>>('rowDragStart', source, this.payload(null, { rowIds, fromIndex: this.dataIndexOf(rowIds[0] as RowId), toIndex: -1, valid: false, target: this.drag?.handle ?? null }));
      p.onRowDragStart(e);
      return e.defaultPrevented ? false : undefined;
    }
    if (!DROP_COMMANDS.has(command.type)) return;
    this.pendingDrop = null;
    if (!p.onBeforeRowDrop && !p.onRowDrop) return;
    let fields: Partial<DataGridRowDragEvent<Row>> & { rowIds: readonly RowId[] };
    let info: RowDragEventInfo<Row> | null = null;
    if (command.type === 'rowDragDrop.drop') {
      info = this.facade().getEventArgs();
      const over = this.facade().getSession()?.over ?? null;
      fields = { rowIds: info?.rowIds ?? [], targetRowId: over?.rowId ?? null, position: over?.position ?? null, target: this.dropTarget, ...this.parentOf(over) };
    } else if (command.type === 'rowDragDrop.moveBy') {
      const rowIds = (command['rowIds'] as RowId[] | undefined) ?? [];
      const from = this.dataIndexOf(rowIds[0] as RowId);
      fields = { rowIds, fromIndex: from, toIndex: Math.max(0, from + Number(command['offset'] ?? 0)), valid: true };
    } else if (command.type === 'rowDragDrop.reorder') {
      const fromIndexes = (command['fromIndexes'] as number[] | undefined) ?? [];
      const model = this.engine.getSnapshot().rows;
      const rowIds = fromIndexes.map((i) => dataRowIdAt(model, i)).filter((id): id is RowId => id !== undefined);
      fields = { rowIds, fromIndex: fromIndexes[0] ?? -1, toIndex: Number(command['toIndex'] ?? -1), valid: true };
    } else {
      const rowIds = (command['rowIds'] as RowId[] | undefined) ?? [];
      const position = command['position'] as 'before' | 'after' | 'into';
      const targetRowId = (command['targetRowId'] as RowId | null) ?? null;
      fields = { rowIds, fromIndex: this.dataIndexOf(rowIds[0] as RowId), targetRowId, position, valid: true, ...this.parentOf({ rowId: targetRowId, position }) };
    }
    if (p.onBeforeRowDrop) {
      const e = gridEvent<DataGridRowDragEvent<Row>>('beforeRowDrop', source, this.payload(info, fields));
      p.onBeforeRowDrop(e);
      if (e.defaultPrevented) return false;
    }
    this.pendingDrop = gridEvent<DataGridRowDragEvent<Row>>('rowDrop', source, this.payload(info, fields));
  }

  private afterCommand(event: CommandEvent): void {
    if (!DROP_COMMANDS.has(event.command.type)) return;
    const drop = this.pendingDrop;
    this.pendingDrop = null;
    if (!drop || event.result.status !== 'applied') return;
    const last = this.state()?.lastDrop;
    if (last && last.status === 'invalid') return;
    this.instance.props.onRowDrop?.(drop);
    if (event.command.type !== 'rowDragDrop.drop') {
      const index = this.dataIndexOf(drop.rowIds[0] as RowId);
      if (index >= 0) this.instance.interaction.announce(this.instance.interaction.text('rowMoved', { position: index + 1 }));
    }
  }

  // ------------------------------------------------------------------------
  // API and keyboard
  // ------------------------------------------------------------------------

  moveRows(rowIds: RowId | readonly RowId[], toIndex: number | DataGridMoveTarget): DataGridActionResult {
    const ids = typeof rowIds === 'string' ? [rowIds] : [...rowIds];
    // `{ targetRowId, position }`: next to or into a row, by id.
    if (typeof toIndex === 'object') return this.instance.dispatchFrom('api', { type: 'rowDragDrop.move', rowIds: ids, targetRowId: toIndex.targetRowId, position: toIndex.position });
    const fromIndexes = ids.map((id) => this.dataIndexOf(id));
    if (!ids.length || fromIndexes.some((i) => i < 0)) return { status: 'rejected', reason: 'rows are not in the current view' };
    return this.instance.dispatchFrom('api', { type: 'rowDragDrop.reorder', fromIndexes, toIndex });
  }

  /** Alt+Shift+ArrowUp / ArrowDown (`row.moveUp` / `row.moveDown`); `DataGridRowDragUi` forwards the bindings. */
  moveFocused(offset: number): boolean {
    const interaction = this.instance.interaction;
    const t = interaction.focusTarget();
    if (t?.kind !== 'cell' || t.rowId.startsWith('__')) return false;
    const rowIds = this.draggedIds(t.rowId);
    const result = this.instance.dispatchFrom('keyboard', { type: 'rowDragDrop.moveBy', rowIds, offset });
    // Focus follows the moved row (ids are stable); reveal it at its new position.
    if (result.status === 'applied') requestAnimationFrame(() => interaction.focusTargetFrom(t, 'keyboard'));
    return true;
  }

  // ------------------------------------------------------------------------
  // Pointer drag
  // ------------------------------------------------------------------------

  /** Pointer down on a drag handle (delegated from the handle cell). */
  readonly onHandlePointerDown = (event: ReactPointerEvent<HTMLElement>, rowId: RowId): void => {
    if (event.button !== 0 || this.drag || !this.state()?.enabled) return;
    event.preventDefault();
    const handle = event.currentTarget;
    const drag: PointerDrag = {
      rowId,
      pointerId: event.pointerId,
      handle,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      x: event.clientX,
      y: event.clientY,
      frame: 0,
      over: { kind: 'none' },
      hit: null,
      lastKey: '',
    };
    this.drag = drag;
    // Document capture listeners, not handle listeners: under row virtualization the dragged row (and its
    // handle) unmounts when auto-scroll moves it out of the rendered window, which drops the pointer
    // capture; the document still sees every move and the release.
    const doc = handle.ownerDocument;
    doc.addEventListener('pointermove', this.onPointerMove, true);
    doc.addEventListener('pointerup', this.onPointerUp, true);
    doc.addEventListener('pointercancel', this.onPointerCancel, true);
    doc.addEventListener('keydown', this.onKeyDown, true);
    handle.setPointerCapture(event.pointerId);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.dragging) {
      if (Math.abs(drag.x - drag.startX) < DRAG_THRESHOLD && Math.abs(drag.y - drag.startY) < DRAG_THRESHOLD) return;
      if (!this.begin(drag)) return;
    }
    this.schedule();
  };

  private schedule(): void {
    const drag = this.drag;
    if (drag && drag.dragging && drag.frame === 0) drag.frame = requestAnimationFrame(this.frame);
  }

  /** Starts the engine session; false when cancelled (`onRowDragStart` called `preventDefault()`). */
  private begin(drag: PointerDrag): boolean {
    const result = this.instance.dispatchFrom('pointer', { type: 'rowDragDrop.start', rowId: drag.rowId, rowIds: this.draggedIds(drag.rowId) });
    if (result.status !== 'applied' || !this.facade().getSession()) {
      this.endPointer();
      return false;
    }
    drag.dragging = true;
    const root = this.instance.root;
    if (root) root.dataset['rowDragging'] = '';
    const session = this.facade().getSession() as RowDragSession;
    const rows = this.facade().getEventArgs()?.data ?? [];
    this.markDragged(session.rowIds, true);
    this.setPreview({ rowIds: session.rowIds, rows });
    this.instance.interaction.announce(this.instance.interaction.text('rowsGrabbed', { count: session.rowIds.length }));
    return true;
  }

  private markDragged(rowIds: readonly RowId[], on: boolean): void {
    const rows = this.instance.getRowsElement();
    if (!rows) return;
    for (const id of rowIds) rows.querySelector<HTMLElement>(`[data-row-id="${CSS.escape(id)}"]`)?.toggleAttribute('data-dragging', on);
  }

  /** One animation frame: hit test, at most one `over` dispatch, indicator and preview writes, auto-scroll, `onRowDrag`. */
  private readonly frame = (): void => {
    const drag = this.drag;
    if (!drag) return;
    drag.frame = 0;
    const root = this.instance.root;
    const viewport = this.instance.getViewport();
    if (!root || !viewport) return;
    const doc = root.ownerDocument;
    // Read phase.
    const hit = doc.elementFromPoint(drag.x, drag.y);
    drag.hit = hit;
    const rootRect = root.getBoundingClientRect();
    const vpRect = viewport.getBoundingClientRect();
    const scroll = this.autoScrollDelta(drag.y, vpRect);
    const previous = drag.over;
    let next: PointerDrag['over'] = { kind: 'none' };
    const gridEl = hit?.closest<HTMLElement>('.salmon-data-grid') ?? null;
    if (gridEl === root) next = { kind: 'self' };
    else {
      const targetId = rowDragOf(this.instance.props)?.targetId;
      const zone = targetId ? hit?.closest<HTMLElement>(`[id="${CSS.escape(targetId)}"]`) : null;
      if (zone) {
        const target = dropTargets.get(targetId as string);
        next = target && target !== this && target.handoff === this.handoff && (zone === target.instance.root || zone.contains(target.instance.root)) ? { kind: 'grid', target } : { kind: 'element', element: zone };
      }
    }
    if (previous.kind === 'grid' && (next.kind !== 'grid' || next.target !== previous.target)) previous.target.leaveExternal();
    const session = this.facade().getSession();
    // Write phase (dispatches notify only the module channel and the indicator rows).
    if (next.kind === 'self') this.overSelf(hit, drag.y);
    else if (session?.over) this.engine.dispatch({ type: 'rowDragDrop.leave' });
    if (next.kind === 'grid' && session?.token) next.target.overExternal(session.token, hit, drag.y);
    drag.over = next;
    this.dropTarget = next.kind === 'element' ? next.element : next.kind === 'grid' ? hit : null;
    this.drawIndicator(next.kind === 'self');
    if (this.preview) {
      const x = this.instance.rtl ? drag.x - rootRect.right - 12 : drag.x - rootRect.left + 12;
      this.preview.style.transform = `translate(${x}px, ${drag.y - rootRect.top + 8}px)`;
    }
    if (scroll !== 0) {
      viewport.scrollTop += scroll;
      this.schedule();
    }
    this.raiseDrag(drag, next);
  };

  private autoScrollDelta(y: number, vpRect: DOMRect): number {
    const top = vpRect.top + this.instance.layout.config.headerHeight;
    const bottom = vpRect.bottom;
    if (y < top + EDGE && y >= vpRect.top) return -Math.ceil(((top + EDGE - y) / EDGE) * MAX_SPEED);
    if (y > bottom - EDGE && y <= bottom + EDGE) return Math.ceil((Math.min(EDGE, y - (bottom - EDGE)) / EDGE) * MAX_SPEED);
    return 0;
  }

  /** The row element of this grid under the pointer, or null (rows of a nested child grid do not count). */
  private rowUnder(hit: Element | null): HTMLElement | null {
    const root = this.instance.root;
    let el = hit?.closest<HTMLElement>('[data-row-id]') ?? null;
    while (el && el.closest('.salmon-data-grid') !== root) el = el.parentElement?.closest<HTMLElement>('[data-row-id]') ?? null;
    return el && el.dataset['rowIndex'] !== undefined ? el : null;
  }

  private pointTarget(hit: Element | null, y: number): { index: number; fraction: number } | null {
    const row = this.rowUnder(hit);
    if (row) {
      const rect = row.getBoundingClientRect();
      return { index: Number(row.dataset['rowIndex']), fraction: rect.height > 0 ? (y - rect.top) / rect.height : 0.5 };
    }
    const rows = this.instance.getRowsElement();
    const count = this.engine.getSnapshot().rows.count;
    if (!rows) return null;
    const rect = rows.getBoundingClientRect();
    // Below the last rendered row (or an empty grid): after the last row.
    if (count === 0 || y >= rect.bottom) return { index: count, fraction: 1 };
    return null;
  }

  private overSelf(hit: Element | null, y: number): void {
    const point = this.pointTarget(hit, y);
    if (point) this.engine.dispatch({ type: 'rowDragDrop.over', index: point.index, fraction: point.fraction });
    else if (this.facade().getSession()?.over) this.engine.dispatch({ type: 'rowDragDrop.leave' });
  }

  /** Target grid side of a drag from another grid. */
  overExternal(token: string, hit: Element | null, y: number): void {
    const point = this.pointTarget(hit, y) ?? { index: this.engine.getSnapshot().rows.count, fraction: 1 };
    this.engine.dispatch({ type: 'rowDragDrop.overExternal', token, index: point.index, fraction: point.fraction });
    this.drawIndicator(true);
  }

  leaveExternal(): void {
    if (this.facade().getSession()?.external) this.engine.dispatch({ type: 'rowDragDrop.cancel' });
    this.drawIndicator(false);
  }

  /** Drop indicator: a line at the target edge, or the target caption highlighted for `into`. */
  private drawIndicator(show: boolean): void {
    const indicator = this.indicator;
    const root = this.instance.root;
    if (!indicator || !root) return;
    const over = show ? (this.facade().getSession()?.over ?? null) : null;
    const rows = this.instance.getRowsElement();
    rows?.querySelector('[data-drop-into]')?.removeAttribute('data-drop-into');
    if (!over) {
      delete indicator.dataset['visible'];
      return;
    }
    const rowEl = rows?.querySelector<HTMLElement>(`:scope > [data-row-index="${over.index}"]`) ?? null;
    indicator.dataset['invalid'] = over.valid ? 'false' : 'true';
    if (over.position === 'into') {
      rowEl?.setAttribute('data-drop-into', over.valid ? '' : 'invalid');
      delete indicator.dataset['visible'];
      return;
    }
    const rootRect = root.getBoundingClientRect();
    let y: number;
    if (rowEl) {
      const rect = rowEl.getBoundingClientRect();
      y = (over.position === 'before' ? rect.top : rect.bottom) - rootRect.top;
    } else if (rows) {
      const rect = rows.getBoundingClientRect();
      y = (this.engine.getSnapshot().rows.count === 0 ? rect.top : rect.bottom) - rootRect.top;
    } else return;
    indicator.style.transform = `translateY(${Math.round(y - 1)}px)`;
    indicator.dataset['visible'] = '';
  }

  private raiseDrag(drag: PointerDrag, next: PointerDrag['over']): void {
    const handler = this.instance.props.onRowDrag;
    if (!handler) return;
    const own = next.kind === 'self';
    const target = next.kind === 'grid' ? next.target : null;
    const session = own ? this.facade().getSession() : target ? target.facade().getSession() : null;
    const over = session?.over ?? null;
    const key = `${next.kind}|${target?.instance.gridId ?? ''}|${over?.index ?? -1}|${over?.position ?? ''}|${over?.valid ?? ''}`;
    if (key === drag.lastKey) return;
    drag.lastKey = key;
    const info = this.facade().getEventArgs();
    handler(
      gridEvent<DataGridRowDragEvent<Row>>(
        'rowDrag',
        'pointer',
        this.payload(info, {
          rowIds: info?.rowIds ?? [],
          toIndex: over?.dropIndex ?? -1,
          targetRowId: over?.rowId ?? null,
          position: over?.position ?? null,
          valid: over?.valid ?? false,
          reason: over ? over.reason : null,
          targetGridId: own ? this.instance.gridId : target ? target.instance.gridId : null,
          target: drag.hit,
        }),
      ),
    );
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!drag.dragging) {
      this.endPointer();
      return;
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    this.frame();
    const over = drag.over;
    const session = this.facade().getSession();
    this.endPointer();
    this.suppressClick();
    if (!session) return;
    if (over.kind === 'self') {
      const result = this.instance.dispatchFrom('pointer', { type: 'rowDragDrop.drop' });
      if (result.status !== 'applied') this.engine.dispatch({ type: 'rowDragDrop.cancel' });
      else this.instance.interaction.announce(this.instance.interaction.text('rowsDropped'));
    } else if (over.kind === 'grid') this.dropInto(over.target, session, drag.hit);
    else if (over.kind === 'element') this.dropOnElement(session, over.element);
    else this.engine.dispatch({ type: 'rowDragDrop.cancel' });
    this.dropTarget = null;
  };

  /** Drop into another grid: the target writes `added`, the handoff tells this grid to write `deleted`. */
  private dropInto(target: RowDragController<any>, session: RowDragSession, hit: Element | null): void {
    const targetSession = target.facade().getSession();
    const over = targetSession?.over ?? null;
    const info = this.facade().getEventArgs();
    const fields = { rowIds: session.rowIds, toIndex: over?.dropIndex ?? -1, targetRowId: over?.rowId ?? null, position: over?.position ?? null, valid: over?.valid ?? false, reason: over ? over.reason : 'noTarget', targetGridId: target.instance.gridId, target: hit };
    const p = this.instance.props;
    if (p.onBeforeRowDrop) {
      const e = gridEvent<DataGridRowDragEvent<Row>>('beforeRowDrop', 'pointer', this.payload(info, fields));
      p.onBeforeRowDrop(e);
      if (e.defaultPrevented) {
        target.leaveExternal();
        this.engine.dispatch({ type: 'rowDragDrop.cancel' });
        return;
      }
    }
    const drop = gridEvent<DataGridRowDragEvent<Row>>('rowDrop', 'pointer', this.payload(info, fields));
    const result = session.token && over?.valid ? target.instance.dispatchFrom('pointer', { type: 'rowDragDrop.receive', token: session.token }) : null;
    target.drawIndicator(false);
    if (!result || result.status !== 'applied' || target.state()?.lastDrop?.status === 'invalid') {
      target.leaveExternal();
      if (this.facade().getSession()) this.engine.dispatch({ type: 'rowDragDrop.cancel' });
      return;
    }
    // The handoff ended this grid's session with `end { dropped: true }` (rows deleted here).
    if (this.facade().getSession()) this.engine.dispatch({ type: 'rowDragDrop.end', dropped: true, targetGridId: target.instance.gridId });
    p.onRowDrop?.(drop);
    this.instance.interaction.announce(this.instance.interaction.text('rowsDropped'));
  }

  /** Drop onto a custom element: the rows stay; `onRowDrop` carries them and the element. */
  private dropOnElement(session: RowDragSession, element: Element): void {
    const info = this.facade().getEventArgs();
    const fields = { rowIds: session.rowIds, toIndex: -1, valid: true, reason: null, targetGridId: null, target: element };
    const p = this.instance.props;
    let cancelled = false;
    if (p.onBeforeRowDrop) {
      const e = gridEvent<DataGridRowDragEvent<Row>>('beforeRowDrop', 'pointer', this.payload(info, fields));
      p.onBeforeRowDrop(e);
      cancelled = e.defaultPrevented;
    }
    const drop = cancelled ? null : gridEvent<DataGridRowDragEvent<Row>>('rowDrop', 'pointer', this.payload(info, fields));
    this.engine.dispatch({ type: 'rowDragDrop.end', dropped: false });
    if (drop) p.onRowDrop?.(drop);
  }

  private readonly onPointerCancel = (): void => {
    const dragging = this.drag?.dragging === true;
    this.endPointer();
    if (dragging) this.engine.dispatch({ type: 'rowDragDrop.cancel' });
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !this.drag) return;
    event.preventDefault();
    event.stopPropagation();
    const over = this.drag.over;
    const dragging = this.drag.dragging;
    this.endPointer();
    if (over.kind === 'grid') over.target.leaveExternal();
    if (dragging) this.engine.dispatch({ type: 'rowDragDrop.cancel' });
  };

  /** Removes listeners and the drag visuals (idempotent). */
  private endPointer(): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    const handle = drag.handle;
    const doc = handle.ownerDocument;
    doc.removeEventListener('pointermove', this.onPointerMove, true);
    doc.removeEventListener('pointerup', this.onPointerUp, true);
    doc.removeEventListener('pointercancel', this.onPointerCancel, true);
    doc.removeEventListener('keydown', this.onKeyDown, true);
    if (handle.hasPointerCapture(drag.pointerId)) handle.releasePointerCapture(drag.pointerId);
    if (!drag.dragging) return;
    const root = this.instance.root;
    if (root) delete root.dataset['rowDragging'];
    if (drag.over.kind === 'grid') drag.over.target.drawIndicator(false);
    this.drawIndicator(false);
    const session = this.facade().getSession();
    if (session) this.markDragged(session.rowIds, false);
    this.setPreview(null);
  }

  /** The click that ends a pointer drag must not select rows. */
  private suppressClick(): void {
    const root = this.instance.root;
    if (!root) return;
    const stop = (event: Event): void => {
      event.stopPropagation();
      event.preventDefault();
    };
    root.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => root.removeEventListener('click', stop, { capture: true }), 0);
  }
}
