// Kanban drag and drop, a lazy chunk loaded when a
// board enables card drag, column reorder, a drag group or drop targets.
// Everything here is a DOM transient: the ghost follows the pointer through
// `transform`, drop indicators are `data-drop` attributes, dragged cards
// carry `data-dragging`; React state changes only on the drop, through the
// board's controller. Drop and threshold math come from internal/dnd.

import { dropPosition, edgeScrollStep, pastThreshold } from '@salmonui/core/internal/dnd';
import type { KanbanLocaleText } from './locale.js';
import type { CardPlace } from './model.js';
import type { KanbanCellRef, KanbanDropTarget, KanbanEventSource } from './types.js';

/** What the drag chunk asks of a board (built by Kanban.tsx each render). */
export interface KanbanDragController {
  readonly boardId: string;
  readonly group: string | undefined;
  readonly text: KanbanLocaleText;
  readonly cardsDraggable: boolean;
  readonly columnsReorderable: boolean;
  rtl(): boolean;
  laneCount(): number;
  colCount(): number;
  collapsed(col: number): boolean;
  /** Keys a drag of `key` moves (the selection when `key` is selected), or null when its column is not draggable. */
  dragKeys(key: string): string[] | null;
  cards(keys: readonly string[]): readonly unknown[];
  place(key: string): CardPlace | undefined;
  placeRef(key: string): KanbanCellRef;
  cellKeys(lane: number, col: number): readonly string[];
  canDrop(keys: readonly string[], lane: number, col: number, foreign: boolean): boolean;
  drop(keys: readonly string[], lane: number, col: number, index: number, source: KanbanEventSource, from?: KanbanDragController): boolean;
  /** Called on the source board by a receiving board; false keeps the cards. */
  release(keys: readonly string[], to: KanbanCellRef, index: number, source: KanbanEventSource): boolean;
  targets(): readonly KanbanDropTarget<never>[];
  externalDrop(target: number, keys: readonly string[], hit: Element, x: number, y: number): void;
  describe(lane: number, col: number, index: number, count: number): string;
  label(key: string): string;
  announce(text: string): void;
  reveal(lane: number, col: number, index: number): void;
  focus(key: string): void;
  moveColumn(from: number, to: number, source: KanbanEventSource): void;
}

export interface KeyboardDrag {
  /** Handles a key while a card is lifted; true when consumed. */
  key(event: KeyboardEvent): boolean;
  cancel(announce: boolean): void;
}

export interface KanbanDragModule {
  attachKanbanDrag: typeof attachKanbanDrag;
  startKeyboardDrag: typeof startKeyboardDrag;
}

/** Every attached board (module state of this chunk, not render state). */
const boards = new Map<Element, () => KanbanDragController>();

const NO_DRAG = 'button, a, input, textarea, select, [contenteditable], [data-no-drag]';
const fmt = (template: string, params: Readonly<Record<string, string | number>>): string => template.replace(/\{(\w+)\}/g, (all, k: string) => (k in params ? String(params[k]) : all));
const cardsOf = (cell: Element): HTMLElement[] => [...cell.querySelectorAll<HTMLElement>(':scope > [data-card]')];

interface CardTarget {
  readonly kind: 'cell';
  readonly board: Element;
  readonly lane: number;
  readonly col: number;
  readonly index: number;
  readonly marker: HTMLElement;
  readonly position: 'before' | 'after' | 'end';
}
interface ExternalTarget {
  readonly kind: 'external';
  readonly index: number;
  readonly marker: Element;
  readonly hit: Element;
}

/** The marker of insertion `index` among `others` (cell keys without the moving ones) in a cell element. */
function markerFor(cell: HTMLElement, others: readonly string[], index: number): { marker: HTMLElement; position: 'before' | 'after' | 'end' } {
  const find = (k: string | undefined): HTMLElement | null => (k ? cell.querySelector<HTMLElement>(`:scope > [data-card="${CSS.escape(k)}"]`) : null);
  const before = find(others[index]);
  if (before) return { marker: before, position: 'before' };
  const after = index > 0 ? find(others[index - 1]) : null;
  if (after) return { marker: after, position: 'after' };
  return { marker: cell, position: 'end' };
}

export function attachKanbanDrag(root: HTMLElement, controller: () => KanbanDragController, held: readonly Event[] = []): () => void {
  boards.set(root, controller);
  const doc = root.ownerDocument;
  type Press = { x: number; y: number; pointerId: number; el: HTMLElement; key: string | null; column: number; source: KanbanEventSource };
  let press: Press | null = null;
  let keys: string[] | null = null;
  let columnDrag = false;
  let ghost: HTMLElement | null = null;
  let offset = { x: 0, y: 0 };
  let target: CardTarget | ExternalTarget | null = null;
  let denied: Element | null = null;
  let last = { x: 0, y: 0 };
  let frame = 0;
  let suppressClick = false;

  const clearTarget = (): void => {
    target?.marker.removeAttribute(target.kind === 'external' ? 'data-drop-target' : 'data-drop');
    target = null;
    denied?.removeAttribute('data-drop-denied');
    denied = null;
  };
  const end = (): void => {
    clearTarget();
    for (const b of boards.keys()) for (const el of b.querySelectorAll('[data-dragging]')) el.removeAttribute('data-dragging');
    root.removeAttribute('data-drag-active');
    ghost?.remove();
    ghost = null;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    if (press && root.hasPointerCapture?.(press.pointerId)) root.releasePointerCapture(press.pointerId);
    press = null;
    keys = null;
    columnDrag = false;
    doc.removeEventListener('keydown', onKey, true);
  };

  const locateCard = (x: number, y: number): CardTarget | ExternalTarget | null => {
    if (!keys) return null;
    const source = controller();
    const el = doc.elementFromPoint(x, y);
    if (!el) return null;
    const ts = source.targets();
    for (let i = 0; i < ts.length; i++) {
      const t = ts[i]!.ref.current;
      if (t && t.contains(el)) return (ts[i]!.accept?.(source.cards(keys) as never[]) ?? true) ? { kind: 'external', index: i, marker: t, hit: el } : null;
    }
    const board = el.closest('.salmon-kanban');
    const get = board ? boards.get(board) : undefined;
    if (!board || !get) return null;
    const dest = get();
    const same = board === root;
    if (!same && (source.group === undefined || source.group !== dest.group)) return null;
    let cell = el.closest<HTMLElement>('.salmon-kanban-cell');
    if (!cell) {
      // A column header targets the column's first cell.
      const header = el.closest<HTMLElement>('.salmon-kanban-column-header');
      cell = header ? board.querySelector<HTMLElement>(`.salmon-kanban-cell[data-li="0"][data-ci="${header.dataset['ci']}"]`) : null;
    }
    if (!cell || !board.contains(cell)) return null;
    const lane = Number(cell.dataset['li']);
    const col = Number(cell.dataset['ci']);
    if (!dest.canDrop(keys, lane, col, !same)) {
      denied = cell;
      return null;
    }
    const moving = new Set(same ? keys : []);
    const others = dest.cellKeys(lane, col).filter((k) => !moving.has(k));
    let index = others.length;
    for (const c of cardsOf(cell)) {
      const k = c.dataset['card'] as string;
      if (moving.has(k)) continue;
      const r = c.getBoundingClientRect();
      if (dropPosition(r.height > 0 ? (y - r.top) / r.height : 0.5, false) === 'before') {
        index = others.indexOf(k);
        break;
      }
      index = others.indexOf(k) + 1;
    }
    return { kind: 'cell', board, lane, col, index, ...markerFor(cell, others, index) };
  };

  const locateColumn = (x: number, y: number): CardTarget | null => {
    const el = doc.elementFromPoint(x, y)?.closest<HTMLElement>('.salmon-kanban-column-header');
    if (!el || !root.contains(el) || !press) return null;
    const col = Number(el.dataset['ci']);
    if (col === press.column) return null;
    const r = el.getBoundingClientRect();
    let fraction = r.width > 0 ? (x - r.left) / r.width : 0.5;
    if (controller().rtl()) fraction = 1 - fraction;
    const position = fraction < 0.5 ? 'before' : 'after';
    return { kind: 'cell', board: root, lane: 0, col, index: position === 'before' ? col : col + 1, marker: el, position };
  };

  const update = (): void => {
    const next = columnDrag ? locateColumn(last.x, last.y) : locateCard(last.x, last.y);
    const prevDenied = denied;
    if (next?.marker !== target?.marker || (next?.kind === 'cell' && target?.kind === 'cell' && next.position !== target.position) || next?.kind !== target?.kind) {
      const keepDenied = denied;
      clearTarget();
      denied = keepDenied;
      target = next;
      if (target?.kind === 'external') target.marker.setAttribute('data-drop-target', '');
      else if (target) target.marker.setAttribute('data-drop', target.position);
    }
    if (prevDenied !== denied) prevDenied?.removeAttribute('data-drop-denied');
    denied?.setAttribute('data-drop-denied', '');
  };

  const autoScroll = (): void => {
    frame = 0;
    if (!keys && !columnDrag) return;
    const scroller = root.querySelector<HTMLElement>('.salmon-kanban-scroller');
    let moved = false;
    const cell = doc.elementFromPoint(last.x, last.y)?.closest<HTMLElement>('.salmon-kanban-cell');
    const vertical = cell && cell.scrollHeight > cell.clientHeight ? cell : scroller;
    if (vertical) {
      const r = vertical.getBoundingClientRect();
      const step = edgeScrollStep(last.y, r.top, r.bottom);
      if (step) {
        vertical.scrollTop += step;
        moved = true;
      }
    }
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      const step = edgeScrollStep(last.x, r.left, r.right);
      if (step) {
        scroller.scrollLeft += step;
        moved = true;
      }
    }
    if (moved) {
      update();
      frame = requestAnimationFrame(autoScroll);
    }
  };

  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    end();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const c = controller();
    const t = event.target as HTMLElement;
    const header = t.closest<HTMLElement>('.salmon-kanban-column-header');
    const source: KanbanEventSource = event.pointerType === 'touch' ? 'touch' : 'pointer';
    if (header && root.contains(header)) {
      if (!c.columnsReorderable || t.closest('.salmon-kanban-toggle')) return;
      press = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, el: header, key: null, column: Number(header.dataset['ci']), source };
      return;
    }
    const card = t.closest<HTMLElement>('[data-card]');
    if (!card || !root.contains(card) || !c.cardsDraggable) return;
    const inner = t.closest(NO_DRAG);
    if (inner && card.contains(inner) && inner !== card) return;
    press = { x: event.clientX, y: event.clientY, pointerId: event.pointerId, el: card, key: card.dataset['card'] as string, column: -1, source };
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!press || event.pointerId !== press.pointerId) return;
    if (!keys && !columnDrag) {
      if (!pastThreshold(event.clientX - press.x, event.clientY - press.y)) return;
      const c = controller();
      if (press.key === null) columnDrag = true;
      else {
        keys = c.dragKeys(press.key);
        if (!keys) {
          press = null;
          return;
        }
      }
      // A held press replayed after a touch release has no pointer left to capture.
      try {
        root.setPointerCapture?.(press.pointerId);
      } catch {}
      root.setAttribute('data-drag-active', '');
      doc.addEventListener('keydown', onKey, true);
      const r = press.el.getBoundingClientRect();
      offset = { x: press.x - r.left, y: press.y - r.top };
      ghost = press.el.cloneNode(true) as HTMLElement;
      ghost.removeAttribute('id');
      ghost.removeAttribute('data-card');
      ghost.removeAttribute('role');
      ghost.setAttribute('aria-hidden', 'true');
      ghost.classList.add('salmon-kanban-ghost');
      ghost.style.left = '0px';
      ghost.style.top = '0px';
      ghost.style.inlineSize = `${r.width}px`;
      ghost.style.blockSize = `${r.height}px`;
      if (keys && keys.length > 1) ghost.setAttribute('data-count', String(keys.length));
      root.appendChild(ghost);
      if (keys) {
        const set = new Set(keys);
        for (const el of root.querySelectorAll<HTMLElement>('[data-card]')) if (set.has(el.dataset['card'] as string)) el.setAttribute('data-dragging', '');
      } else press.el.setAttribute('data-dragging', '');
    }
    event.preventDefault();
    last = { x: event.clientX, y: event.clientY };
    if (ghost) ghost.style.transform = `translate3d(${last.x - offset.x}px, ${last.y - offset.y}px, 0)`;
    update();
    if (!frame) frame = requestAnimationFrame(autoScroll);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (!press || event.pointerId !== press.pointerId) return;
    const t = target;
    const moved = keys;
    const p = press;
    const wasDrag = moved !== null || columnDrag;
    const wasColumn = columnDrag;
    end();
    if (!wasDrag) return;
    suppressClick = true;
    setTimeout(() => {
      suppressClick = false;
    }, 0);
    const c = controller();
    if (wasColumn) {
      if (t?.kind === 'cell') c.moveColumn(p.column, t.index > p.column ? t.index - 1 : t.index, p.source);
      return;
    }
    if (!moved || !t) return;
    if (t.kind === 'external') c.externalDrop(t.index, moved, t.hit, event.clientX, event.clientY);
    else {
      const dest = boards.get(t.board)?.();
      dest?.drop(moved, t.lane, t.col, t.index, p.source, t.board === root ? undefined : c);
    }
  };
  const onClickCapture = (event: MouseEvent): void => {
    // The click that ends a drag neither selects nor toggles.
    if (suppressClick) {
      event.stopPropagation();
      event.preventDefault();
    }
  };
  const onCancel = (): void => end();

  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onCancel);
  root.addEventListener('click', onClickCapture, true);
  // A press that started before this chunk loaded (held by the component) continues here.
  const on: Record<string, (event: PointerEvent) => void> = { pointerdown: onPointerDown, pointermove: onPointerMove, pointerup: onPointerUp, pointercancel: onCancel };
  for (const event of held) on[event.type]?.(event as PointerEvent);
  return () => {
    end();
    boards.delete(root);
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', onCancel);
    root.removeEventListener('click', onClickCapture, true);
  };
}

/**
 * Keyboard drag: Space lifts, Up / Down move within the cell,
 * Left / Right to the next droppable column (mirrored in RTL), PageUp /
 * PageDown to the next droppable swimlane, Space or Enter drops, Escape
 * cancels. Every step is announced through the board's live region.
 */
export function startKeyboardDrag(root: HTMLElement, controller: () => KanbanDragController, key: string, onEnd: () => void): KeyboardDrag {
  const c0 = controller();
  const keys = c0.dragKeys(key);
  const origin = c0.place(key);
  const noop: KeyboardDrag = { key: () => false, cancel: () => {} };
  if (!keys || !origin) {
    onEnd();
    return noop;
  }
  const moving = new Set(keys);
  const others = (lane: number, col: number): string[] => controller().cellKeys(lane, col).filter((k) => !moving.has(k));
  let lane = origin.lane;
  let col = origin.col;
  let index = controller()
    .cellKeys(lane, col)
    .slice(0, origin.index)
    .filter((k) => !moving.has(k)).length;
  let marker: Element | null = null;
  const mark = (on: boolean): void => {
    for (const el of root.querySelectorAll<HTMLElement>('[data-card]')) {
      if (on && moving.has(el.dataset['card'] as string)) el.setAttribute('data-lifted', '');
      else el.removeAttribute('data-lifted');
    }
  };
  const label = c0.label(key) + (keys.length > 1 ? ` (+${keys.length - 1})` : '');
  const position = (): string => controller().describe(lane, col, index, others(lane, col).length + 1);
  const show = (): void => {
    marker?.removeAttribute('data-drop');
    marker = null;
    const c = controller();
    const list = others(lane, col);
    c.reveal(lane, col, Math.min(index, Math.max(0, list.length - 1)));
    const cell = root.querySelector<HTMLElement>(`.salmon-kanban-cell[data-li="${lane}"][data-ci="${col}"]`);
    if (cell) {
      const m = markerFor(cell, list, index);
      marker = m.marker;
      marker.setAttribute('data-drop', m.position);
    }
    mark(true);
  };
  const finish = (): void => {
    marker?.removeAttribute('data-drop');
    marker = null;
    mark(false);
    root.removeAttribute('data-keyboard-drag');
    onEnd();
  };
  root.setAttribute('data-keyboard-drag', '');
  show();
  c0.announce(fmt(c0.text.lifted, { card: label, position: position() }));

  const stepColumn = (d: number): boolean => {
    const c = controller();
    for (let x = col + d; x >= 0 && x < c.colCount(); x += d) {
      if (c.collapsed(x) || !c.canDrop(keys, lane, x, false)) continue;
      col = x;
      index = Math.min(index, others(lane, col).length);
      return true;
    }
    return false;
  };
  const stepLane = (d: number): boolean => {
    const c = controller();
    for (let l = lane + d; l >= 0 && l < c.laneCount(); l += d) {
      if (!c.canDrop(keys, l, col, false)) continue;
      lane = l;
      index = Math.min(index, others(lane, col).length);
      return true;
    }
    return false;
  };

  return {
    key(event) {
      const c = controller();
      let moved = false;
      switch (event.key) {
        case 'ArrowUp':
          moved = index > 0;
          if (moved) index--;
          break;
        case 'ArrowDown':
          moved = index < others(lane, col).length;
          if (moved) index++;
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
          moved = stepColumn((event.key === 'ArrowRight') !== c.rtl() ? 1 : -1);
          break;
        case 'PageUp':
        case 'PageDown':
          moved = stepLane(event.key === 'PageDown' ? 1 : -1);
          break;
        case ' ':
        case 'Enter': {
          const at = position();
          finish();
          if (c.drop(keys, lane, col, index, 'keyboard')) c.announce(fmt(c.text.dropped, { card: label, position: at }));
          c.focus(key);
          return true;
        }
        case 'Escape':
          finish();
          c.announce(fmt(c.text.cancelled, { card: label }));
          c.focus(key);
          return true;
        case 'Tab':
          finish();
          c.announce(fmt(c.text.cancelled, { card: label }));
          return false;
        default:
          return event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End';
      }
      if (moved) {
        show();
        c.announce(position());
      }
      return true;
    },
    cancel(say) {
      finish();
      if (say) controller().announce(fmt(controller().text.cancelled, { card: label }));
    },
  };
}
