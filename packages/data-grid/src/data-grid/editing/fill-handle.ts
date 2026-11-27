// Fill handle drag, in the lazy editing chunk
// (`edit-chunk.ts`). The handle itself is a span the cell at the
// bottom-right of the selected range renders (`editCellView`, a cell edit
// bit from `DataGridEditUi.cellBits`); this controller owns the drag:
//
// - pointerdown on the handle starts it; pointer moves are coalesced to one
//   animation frame that hit-tests the cell under the pointer (clamped into
//   the body), constrains the target to one axis like a spreadsheet
//   autofill (down / up / left / right of the range), auto-scrolls at the
//   viewport edges, and draws a dashed preview rectangle;
// - release raises `onBeforeFill` and dispatches `clipboard.fill`, which
//   tiles the source range (drafts included) by row id over the full row
//   model, so targets outside the rendered window fill too;
// - Escape (or pointercancel) cancels.
//
// Every drag transient (pointer position, target, preview geometry,
// auto-scroll) lives in this object and in DOM writes, never in React state:
// a drag renders nothing until the fill is applied.

import type { CellRange, ColumnId, CompiledColumn, RowId, SelectionState } from '@salmonui/data-grid/engine';
import type { DataGridInstance } from '../instance.js';
import type { DataGridClipboardController } from './clipboard-ui.js';

/** Auto-scroll band at the body edges (px) and the top speed (px per frame). */
const EDGE = 32;
const MAX_SPEED = 24;

/** View-index rectangle of a range. */
export interface FillRect {
  readonly r0: number;
  readonly r1: number;
  readonly c0: number;
  readonly c1: number;
}

export type FillDirection = 'up' | 'down' | 'left' | 'right';

/**
 * The fill target for the cell under the pointer at view row `r`, visible
 * column `c`: constrained to the axis on which the pointer is farther
 * outside the range (rows win ties), or null inside the range.
 */
export function constrainFill(rect: FillRect, r: number, c: number): { readonly r: number; readonly c: number; readonly direction: FillDirection } | null {
  const dr = r < rect.r0 ? rect.r0 - r : r > rect.r1 ? r - rect.r1 : 0;
  const dc = c < rect.c0 ? rect.c0 - c : c > rect.c1 ? c - rect.c1 : 0;
  if (dr === 0 && dc === 0) return null;
  if (dr >= dc) return { r, c: rect.c1, direction: r < rect.r0 ? 'up' : 'down' };
  return { r: rect.r1, c, direction: c < rect.c0 ? 'left' : 'right' };
}

/** The range extended to a constrained target. */
export function fillUnion(rect: FillRect, target: { r: number; c: number }): FillRect {
  return { r0: Math.min(rect.r0, target.r), r1: Math.max(rect.r1, target.r), c0: Math.min(rect.c0, target.c), c1: Math.max(rect.c1, target.c) };
}

interface Drag {
  readonly pointerId: number;
  readonly range: CellRange;
  readonly rect: FillRect;
  readonly startX: number;
  readonly startY: number;
  /** The pointer left the start point (auto-scroll waits for it: the handle may sit at an edge). */
  moved: boolean;
  x: number;
  y: number;
  frame: number;
  target: { r: number; c: number; rowId: RowId; columnId: ColumnId; vertical: boolean } | null;
  preview: HTMLElement;
}

export class DataGridFillHandle<Row> {
  private readonly instance: DataGridInstance<Row>;
  private readonly clipboard: DataGridClipboardController<Row>;
  private drag: Drag | null = null;

  constructor(instance: DataGridInstance<Row>, clipboard: DataGridClipboardController<Row>) {
    this.instance = instance;
    this.clipboard = clipboard;
  }

  private get engine() {
    return this.instance.engine;
  }

  private visible(): readonly CompiledColumn<Row>[] {
    return this.engine.getSnapshot().columns.visible;
  }

  private columnIndex(columnId: ColumnId): number {
    const visible = this.visible();
    for (let i = 0; i < visible.length; i++) if ((visible[i] as CompiledColumn<Row>).columnId === columnId) return i;
    return -1;
  }

  /**
   * Render read (`DataGridEditUi.cellBits`): with `fillHandle` and editing on,
   * the cell is the bottom-right cell of the only selected range. Cached per
   * selection state and snapshot, so a cell pays two reference compares.
   */
  isCorner(rowId: RowId, columnId: ColumnId): boolean {
    const props = this.instance.props.editing;
    if (typeof props !== 'object' || !props.fillHandle) return false;
    const engine = this.engine;
    const options = engine.getModuleState<{ options: { enabled: boolean; edit: boolean } }>('edit')?.options;
    if (!options?.enabled || !options.edit) return false;
    const selection = engine.getModuleState<SelectionState>('selection');
    const snapshot = engine.getSnapshot();
    const c = this.corner;
    if (c.selection !== selection || c.snapshot !== snapshot) {
      c.selection = selection;
      c.snapshot = snapshot;
      c.rowId = null;
      c.columnId = null;
      const ranges = selection?.cells.ranges;
      const range = ranges?.length === 1 ? ranges[0] : undefined;
      if (range) {
        const a = engine.getRowIndex(range.anchor.rowId);
        const b = engine.getRowIndex(range.focus.rowId);
        const ca = this.columnIndex(range.anchor.columnId);
        const cb = this.columnIndex(range.focus.columnId);
        if (a >= 0 && b >= 0 && ca >= 0 && cb >= 0) {
          c.rowId = a >= b ? range.anchor.rowId : range.focus.rowId;
          c.columnId = ca >= cb ? range.anchor.columnId : range.focus.columnId;
        }
      }
    }
    return c.rowId === rowId && c.columnId === columnId;
  }

  private readonly corner: { selection: unknown; snapshot: unknown; rowId: RowId | null; columnId: ColumnId | null } = { selection: null, snapshot: null, rowId: null, columnId: null };

  mount(): () => void {
    const root = this.instance.root;
    if (!root) return () => {};
    root.addEventListener('pointerdown', this.onPointerDown, true);
    return () => {
      root.removeEventListener('pointerdown', this.onPointerDown, true);
      this.end();
    };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.drag) return;
    const handle = (event.target as Element | null)?.closest?.('.salmon-data-grid-fill-handle');
    const root = this.instance.root;
    if (!handle || !root || handle.closest('.salmon-data-grid') !== root) return;
    // The handle is not a cell click: no focus move, selection, or text selection.
    event.preventDefault();
    event.stopPropagation();
    const selection = this.engine.getModuleState<SelectionState>('selection');
    const range = selection?.cells.ranges[selection.cells.ranges.length - 1];
    if (!range) return;
    const ra = this.engine.getRowIndex(range.anchor.rowId);
    const rf = this.engine.getRowIndex(range.focus.rowId);
    const ca = this.columnIndex(range.anchor.columnId);
    const cf = this.columnIndex(range.focus.columnId);
    if (ra < 0 || rf < 0 || ca < 0 || cf < 0) return;
    const doc = root.ownerDocument;
    const preview = doc.createElement('div');
    preview.className = 'salmon-data-grid-fill-preview';
    preview.setAttribute('aria-hidden', 'true');
    root.appendChild(preview);
    root.dataset['filling'] = '';
    this.drag = {
      pointerId: event.pointerId,
      range,
      rect: { r0: Math.min(ra, rf), r1: Math.max(ra, rf), c0: Math.min(ca, cf), c1: Math.max(ca, cf) },
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      x: event.clientX,
      y: event.clientY,
      frame: 0,
      target: null,
      preview,
    };
    // Document listeners: the handle's cell may unmount while auto-scroll moves the window.
    doc.addEventListener('pointermove', this.onPointerMove, true);
    doc.addEventListener('pointerup', this.onPointerUp, true);
    doc.addEventListener('pointercancel', this.onPointerCancel, true);
    doc.addEventListener('keydown', this.onKeyDown, true);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.moved && Math.abs(drag.x - drag.startX) + Math.abs(drag.y - drag.startY) >= 8) drag.moved = true;
    this.schedule();
  };

  private schedule(): void {
    const drag = this.drag;
    if (drag && drag.frame === 0) drag.frame = requestAnimationFrame(this.frame);
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const drag = this.drag;
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    this.update(false);
    const target = drag.target;
    const range = drag.range;
    this.end();
    this.swallowClick();
    if (target) this.clipboard.fill({ rowId: target.rowId, field: target.columnId }, event.pointerType === 'touch' ? 'touch' : 'pointer', range);
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.drag && event.pointerId === this.drag.pointerId) this.end();
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.drag || event.key !== 'Escape') return;
    // Escape cancels the drag only (it does not also clear the selection).
    event.preventDefault();
    event.stopPropagation();
    this.end();
  };

  /** The click that follows the release is not a cell click (it would select the cell under it). */
  private swallowClick(): void {
    const root = this.instance.root;
    if (!root) return;
    const swallow = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    root.addEventListener('click', swallow, { capture: true, once: true });
    setTimeout(() => root.removeEventListener('click', swallow, { capture: true }), 0);
  }

  private end(): void {
    const drag = this.drag;
    if (!drag) return;
    this.drag = null;
    if (drag.frame) cancelAnimationFrame(drag.frame);
    drag.preview.remove();
    const root = this.instance.root;
    if (root) delete root.dataset['filling'];
    const doc = root?.ownerDocument ?? drag.preview.ownerDocument;
    doc.removeEventListener('pointermove', this.onPointerMove, true);
    doc.removeEventListener('pointerup', this.onPointerUp, true);
    doc.removeEventListener('pointercancel', this.onPointerCancel, true);
    doc.removeEventListener('keydown', this.onKeyDown, true);
  }

  private readonly frame = (): void => {
    const drag = this.drag;
    if (!drag) return;
    drag.frame = 0;
    this.update(true);
  };

  /** Body area of the viewport (below the header rows), in client coordinates. */
  private bodyRect(viewport: HTMLElement): { top: number; bottom: number; left: number; right: number } {
    const vp = viewport.getBoundingClientRect();
    const header = viewport.querySelector('.salmon-data-grid-header');
    const top = header ? Math.max(vp.top, header.getBoundingClientRect().bottom) : vp.top;
    // The client area excludes scrollbars.
    const right = vp.left + viewport.clientLeft + viewport.clientWidth;
    const bottom = vp.top + viewport.clientTop + viewport.clientHeight;
    return { top, bottom, left: vp.left + viewport.clientLeft, right };
  }

  /** One frame: auto-scroll, hit test, constrain, preview. Reads first, then writes. */
  private update(scroll: boolean): void {
    const drag = this.drag;
    const root = this.instance.root;
    const viewport = this.instance.getViewport();
    if (!drag || !root || !viewport) return;
    const body = this.bodyRect(viewport);
    const x = Math.min(Math.max(drag.x, body.left + 1), body.right - 2);
    const y = Math.min(Math.max(drag.y, body.top + 1), body.bottom - 2);
    const hit = root.ownerDocument.elementFromPoint(x, y);
    const cell = hit?.closest<HTMLElement>('.salmon-data-grid-cell') ?? null;
    if (cell && cell.closest('.salmon-data-grid') === root) {
      const rowEl = cell.closest<HTMLElement>('[data-row-id]');
      const rowId = rowEl?.dataset['rowId'];
      const columnId = cell.dataset['columnId'];
      const r = rowId === undefined ? -1 : this.engine.getRowIndex(rowId);
      const c = columnId === undefined ? -1 : this.columnIndex(columnId);
      if (r >= 0 && c >= 0) {
        const t = constrainFill(drag.rect, r, c);
        if (!t) drag.target = null;
        else {
          const targetRow = t.r === r ? (rowId as RowId) : this.engine.getRowIdAt(t.r);
          const targetCol = (this.visible()[t.c] as CompiledColumn<Row> | undefined)?.columnId;
          drag.target = targetRow !== undefined && targetCol !== undefined ? { r: t.r, c: t.c, rowId: targetRow, columnId: targetCol, vertical: t.direction === 'up' || t.direction === 'down' } : null;
        }
        this.drawPreview(drag, root, body, rowEl as HTMLElement, r, c);
      }
    }
    if (!scroll || !drag.moved) return;
    // Scroll along the fill axis only (both before the axis is known).
    const dy = drag.target?.vertical === false ? 0 : edgeDelta(drag.y, body.top, body.bottom);
    const dx = drag.target?.vertical === true ? 0 : edgeDelta(drag.x, body.left, body.right);
    if (dy !== 0 || dx !== 0) {
      if (dy !== 0) viewport.scrollTop += dy;
      if (dx !== 0) viewport.scrollLeft += dx;
      this.schedule();
    }
  }

  /**
   * Dashed rectangle over the extended range, clipped to the body. Rows and
   * columns outside the rendered window clamp to the body edge on their side
   * of the hit row / column (the rendered window is contiguous around it).
   */
  private drawPreview(drag: Drag, root: HTMLElement, body: { top: number; bottom: number; left: number; right: number }, hitRow: HTMLElement, hitR: number, hitC: number): void {
    const preview = drag.preview;
    if (!drag.target) {
      delete preview.dataset['visible'];
      return;
    }
    const u = fillUnion(drag.rect, drag.target);
    const rows = this.instance.getRowsElement();
    const rowEdge = (index: number, side: 'top' | 'bottom'): number => {
      const el = rows?.querySelector<HTMLElement>(`:scope > [data-row-index="${index}"]`);
      if (el) {
        const rect = el.getBoundingClientRect();
        return side === 'top' ? rect.top : rect.bottom;
      }
      return index < hitR ? body.top : body.bottom;
    };
    const visible = this.visible();
    const rtl = this.instance.rtl;
    const colEdge = (index: number, side: 'start' | 'end'): number => {
      const id = (visible[index] as CompiledColumn<Row> | undefined)?.columnId;
      const el = id === undefined ? null : hitRow.querySelector<HTMLElement>(`.salmon-data-grid-cell[data-column-id="${CSS.escape(id)}"]`);
      const left = side === 'start' ? !rtl : rtl;
      if (el) {
        const rect = el.getBoundingClientRect();
        return left ? rect.left : rect.right;
      }
      const before = index < hitC;
      return before !== rtl ? body.left : body.right;
    };
    const top = Math.max(body.top, rowEdge(u.r0, 'top'));
    const bottom = Math.min(body.bottom, rowEdge(u.r1, 'bottom'));
    const a = colEdge(u.c0, 'start');
    const b = colEdge(u.c1, 'end');
    const left = Math.max(body.left, Math.min(a, b));
    const right = Math.min(body.right, Math.max(a, b));
    if (bottom <= top || right <= left) {
      delete preview.dataset['visible'];
      return;
    }
    const origin = root.getBoundingClientRect();
    preview.style.transform = `translate(${left - origin.left}px, ${top - origin.top}px)`;
    preview.style.width = `${right - left}px`;
    preview.style.height = `${bottom - top}px`;
    preview.dataset['visible'] = '';
  }
}

/** Auto-scroll speed for a pointer coordinate near (or past) an edge of the body. */
function edgeDelta(p: number, start: number, end: number): number {
  if (p < start + EDGE) return -Math.ceil((Math.min(EDGE, start + EDGE - p) / EDGE) * MAX_SPEED);
  if (p > end - EDGE) return Math.ceil((Math.min(EDGE, p - (end - EDGE)) / EDGE) * MAX_SPEED);
  return 0;
}
