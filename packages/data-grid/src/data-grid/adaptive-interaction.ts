// Adaptive UI interaction, in the lazy adaptive chunk
// (`adaptive-chunk.ts`): opening the sort and filter sheets and the touch long-press. The always-loaded part
// (mode store, measurement, card rows, the adaptive bar, the open dialog
// state) is `DataGridAdaptiveController` in `adaptive-controller.ts`, which
// forwards here once the chunk is loaded. Long-press timers exist only while
// a finger is down (no idle timers).

import type { ColumnId, RowId } from '@salmonui/data-grid/engine';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { AdaptiveDialog, DataGridAdaptiveController } from './adaptive-controller.js';
import type { DataGridAdaptiveDialogKind, DataGridAdaptiveDialogOpenEvent } from './adaptive-types.js';
import { gridEvent, type DataGridEventSource } from '@salmonui/core/internal/events';
import type { DataGridInstance } from './instance.js';
import { rectOf } from './anchor.js';
import { portalScopeOf } from '@salmonui/core/internal/modal-host';

/** Long-press delay and the movement that cancels it (touch). */
export const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

export class DataGridAdaptiveInteraction<Row> {
  private readonly instance: DataGridInstance<Row>;
  private readonly host: DataGridAdaptiveController<Row>;
  // Long-press transient (pointer state never reaches React).
  private press: { id: number; x: number; y: number; target: Element; timer: ReturnType<typeof setTimeout> } | null = null;
  private suppressClickUntil = 0;
  private lastLongPressAt = 0;

  constructor(instance: DataGridInstance<Row>, host: DataGridAdaptiveController<Row>) {
    this.instance = instance;
    this.host = host;
  }

  // ------------------------------------------------------------------------
  // Dialogs
  // ------------------------------------------------------------------------

  private container(): Element | null {
    // The open modal dialog around the grid (everything outside it is inert), else the theme scope.
    const root = this.instance.root;
    return root ? portalScopeOf(root) : null;
  }

  private allowOpen(kind: DataGridAdaptiveDialogKind, field: string | undefined, source: DataGridEventSource): boolean {
    const handler = this.instance.props.onBeforeAdaptiveDialogOpen;
    if (!handler) return true;
    const event = gridEvent<DataGridAdaptiveDialogOpenEvent>('beforeAdaptiveDialogOpen', source, { kind, field });
    handler(event);
    return !event.defaultPrevented;
  }

  openSortDialog(source: DataGridEventSource, invoker: Element | null = null): boolean {
    if (!this.instance.sortable) return false;
    return this.show('sort', source, invoker);
  }

  openFilterDialog(field: string | undefined, source: DataGridEventSource, invoker: Element | null = null): boolean {
    const chrome = this.instance.chrome;
    if (!chrome.filteringUi()) return false;
    if (field !== undefined) {
      const column = chrome.resolve(field);
      if (!column || !chrome.filterable(column)) return false;
      if (!this.allowOpen('filter', field, source)) return false;
      this.host.close(false);
      return chrome.openFilterMenu(column.columnId, source, invoker);
    }
    return this.show('filterColumns', source, invoker);
  }

  private show(kind: AdaptiveDialog['kind'], source: DataGridEventSource, invoker: Element | null): boolean {
    const root = this.instance.root;
    const container = this.container();
    if (!root || !container) return false;
    if (!this.allowOpen(kind === 'sort' ? 'sort' : 'filter', undefined, source)) return false;
    const chrome = this.instance.chrome;
    if (chrome.isOpen()) chrome.close(false, source);
    this.host.setDialog({ kind, anchor: rectOf(root), container }, invoker ?? root.ownerDocument.activeElement);
    return true;
  }

  /** Filter column list: closes the list and opens that column's filter sheet. */
  pickFilterColumn(columnId: ColumnId): void {
    const invoker = this.host.returnFocusElement();
    this.host.close(true);
    this.instance.chrome.openFilterMenu(columnId, 'pointer', invoker);
  }

  // ------------------------------------------------------------------------
  // Touch long-press
  // ------------------------------------------------------------------------

  cancelPress(): void {
    if (!this.press) return;
    clearTimeout(this.press.timer);
    this.press = null;
  }

  /** `at`: when the press happened (a press queued while this chunk loaded runs later). */
  onPointerDown(event: ReactPointerEvent<HTMLElement>, at = performance.now()): void {
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    this.cancelPress();
    const target = event.target as Element;
    const { clientX, clientY, pointerId } = event;
    const timer = setTimeout(() => this.longPress(target, clientX, clientY), LONG_PRESS_MS - (performance.now() - at));
    this.press = { id: pointerId, x: clientX, y: clientY, target, timer };
  }

  onPointerMove(event: ReactPointerEvent<HTMLElement>): void {
    const press = this.press;
    if (!press || event.pointerId !== press.id) return;
    if (Math.abs(event.clientX - press.x) > LONG_PRESS_SLOP || Math.abs(event.clientY - press.y) > LONG_PRESS_SLOP) this.cancelPress();
  }

  onPointerEnd(event: ReactPointerEvent<HTMLElement>): void {
    if (this.press && event.pointerId === this.press.id) this.cancelPress();
  }

  /** Swallows the click that ends a long-press; true when it did. */
  consumeClick(event: ReactMouseEvent<HTMLElement>): boolean {
    if (this.suppressClickUntil === 0 || performance.now() > this.suppressClickUntil) return false;
    this.suppressClickUntil = 0;
    event.preventDefault();
    event.stopPropagation();
    return true;
  }

  /** A native long-press `contextmenu` (Android) while our long-press already ran is a duplicate. */
  onContextMenuCapture(event: ReactMouseEvent<HTMLElement>): void {
    if (!event.nativeEvent.isTrusted) return;
    if (this.press) {
      // The platform recognized the long-press first: let its event through, drop ours.
      this.cancelPress();
      this.lastLongPressAt = performance.now();
      return;
    }
    if (performance.now() - this.lastLongPressAt < 1000) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  private longPress(target: Element, x: number, y: number): void {
    this.press = null;
    if (!target.isConnected) return;
    this.lastLongPressAt = performance.now();
    // The click that follows the lifted finger must not also select or sort.
    this.suppressClickUntil = performance.now() + 800;
    const props = this.instance.props;
    const chrome = this.instance.chrome;
    const header = target.closest<HTMLElement>('.salmon-data-grid-header-cell');
    if (header) {
      const column = chrome.column(header.dataset['columnId']);
      if (column && chrome.columnMenuEnabled(column)) {
        chrome.openColumnMenu(column.columnId, 'touch', header);
        return;
      }
    }
    if (props.contextMenu) {
      // Same path as a right click: chrome.onContextMenu resolves the target.
      target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 2 }));
      return;
    }
    const rowEl = target.closest<HTMLElement>('.salmon-data-grid-rows [data-row-id]');
    if (rowEl && this.host.multiSelectAvailable()) {
      const rowId = rowEl.dataset['rowId'] as RowId;
      if (!this.host.multiSelectOn()) this.host.setMultiSelect(true, 'touch');
      this.instance.dispatchFrom('touch', { type: 'selection.toggleRow', rowId } as never);
      this.host.markTouchSelected();
    }
  }
}
