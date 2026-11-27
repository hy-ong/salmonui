// Pointer drag and drop for TagGroup, imported on the
// first press of a draggable tag, so the initial chunk has no drag code.
// One window listener set per drag, a drop indicator on the tag before the
// insertion point, one `drag` callback per frame, Escape cancels.

import { pastThreshold } from '@salmonui/core/internal/dnd';
import type { TagDragSession, TagDropTarget } from './types.js';

type Lookup = (node: Element) => TagDropTarget | undefined;

const ROW = '[data-salmon-tag]';

function rowsOf(grid: Element): HTMLElement[] {
  return [...grid.querySelectorAll<HTMLElement>(ROW)].filter((row) => row.closest('.salmon-tag-group') === grid);
}

/** Insertion index for a pointer at (x, y) among wrapped tags in reading order. */
export function insertionIndex(rects: readonly DOMRectReadOnly[], x: number, y: number, rtl: boolean): number {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i] as DOMRectReadOnly;
    if (y < r.top) return i;
    if (y < r.bottom && (rtl ? x > r.left + r.width / 2 : x < r.left + r.width / 2)) return i;
  }
  return rects.length;
}

function hit(doc: Document, x: number, y: number, from: TagDropTarget, lookup: Lookup): { grid: HTMLElement; target: TagDropTarget } | null {
  for (let node = doc.elementFromPoint(x, y); node; node = node.parentElement) {
    const target = lookup(node);
    if (!target) continue;
    const ok = target === from ? from.reorderable : from.group !== null && target.group === from.group;
    return ok ? { grid: node as HTMLElement, target } : null;
  }
  return null;
}

/** Arms a drag from `origin` (a tag row); returns a function that cancels it. */
export function armDrag(origin: HTMLElement, from: TagDropTarget, lookup: Lookup, session: TagDragSession): () => void {
  const doc = origin.ownerDocument;
  const view = doc.defaultView ?? globalThis.window;
  let finish: ((drop: boolean) => void) | null = null;
  const disarm = (): void => {
    view.removeEventListener('pointermove', onArm);
    view.removeEventListener('pointerup', onAbort);
    view.removeEventListener('pointercancel', onAbort);
  };
  const onAbort = (): void => disarm();
  const onArm = (event: PointerEvent): void => {
    if (event.pointerId !== session.pointerId || !pastThreshold(event.clientX - session.x, event.clientY - session.y)) return;
    disarm();
    let prevented = false;
    session.start(
      Object.freeze({
        values: session.values,
        source: session.source,
        preventDefault: () => {
          prevented = true;
        },
        get defaultPrevented() {
          return prevented;
        },
      }),
    );
    if (!prevented) finish = start(event.clientX, event.clientY);
  };

  const start = (x0: number, y0: number): ((drop: boolean) => void) => {
    const ghost = doc.createElement('div');
    ghost.className = 'salmon-tag-group-ghost';
    ghost.setAttribute('aria-hidden', 'true');
    ghost.textContent = (origin.textContent ?? '') + (session.values.length > 1 ? ` +${session.values.length - 1}` : '');
    doc.body.appendChild(ghost);
    origin.setAttribute('data-dragging', '');
    let marked: HTMLElement | null = null;
    let over: { grid: HTMLElement; target: TagDropTarget } | null = null;
    let toIndex: number | null = null;
    let frame = 0;
    let x = x0;
    let y = y0;
    const place = (): void => {
      frame = 0;
      ghost.style.transform = `translate(${x + 12}px,${y + 8}px)`;
      over = hit(doc, x, y, from, lookup);
      marked?.removeAttribute('data-drop');
      marked = null;
      toIndex = null;
      if (over) {
        const rows = rowsOf(over.grid);
        toIndex = insertionIndex(
          rows.map((row) => row.getBoundingClientRect()),
          x,
          y,
          getComputedStyle(over.grid).direction === 'rtl',
        );
        marked = rows[toIndex] ?? rows[rows.length - 1] ?? null;
        marked?.setAttribute('data-drop', toIndex < rows.length ? 'before' : 'after');
      }
      session.drag(Object.freeze({ values: session.values, clientX: x, clientY: y, toIndex, overGroup: over ? over.target.group : null }));
    };
    const onMove = (event: PointerEvent): void => {
      if (event.pointerId !== session.pointerId) return;
      event.preventDefault();
      x = event.clientX;
      y = event.clientY;
      if (!frame) frame = view.requestAnimationFrame(place);
    };
    const onUp = (event: PointerEvent): void => {
      if (event.pointerId !== session.pointerId) return;
      x = event.clientX;
      y = event.clientY;
      place();
      end(true);
    };
    const onCancel = (): void => end(false);
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      end(false);
    };
    let ended = false;
    const end = (drop: boolean): void => {
      if (ended) return;
      ended = true;
      if (frame) view.cancelAnimationFrame(frame);
      view.removeEventListener('pointermove', onMove);
      view.removeEventListener('pointerup', onUp);
      view.removeEventListener('pointercancel', onCancel);
      view.removeEventListener('keydown', onKey, true);
      ghost.remove();
      marked?.removeAttribute('data-drop');
      origin.removeAttribute('data-dragging');
      const dropped = drop && over !== null && toIndex !== null;
      if (dropped && over && toIndex !== null) {
        if (over.target === from) from.reorder(session.values, toIndex);
        else over.target.receive(session.values, from.id, toIndex);
      }
      session.end(dropped);
    };
    view.addEventListener('pointermove', onMove, { passive: false });
    view.addEventListener('pointerup', onUp);
    view.addEventListener('pointercancel', onCancel);
    view.addEventListener('keydown', onKey, true);
    place();
    return end;
  };

  view.addEventListener('pointermove', onArm);
  view.addEventListener('pointerup', onAbort);
  view.addEventListener('pointercancel', onAbort);
  return () => {
    disarm();
    finish?.(false);
  };
}
