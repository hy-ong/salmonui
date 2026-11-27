// Pointer drag and drop for Listbox, loaded on the first drag
// (`import()` from Listbox.tsx), so the initial `@salmonui/dropdowns/listbox`
// chunk carries no drag code. Pointer events only: one window listener set
// for the duration of a drag, a drop indicator in the list under the
// pointer, edge auto-scroll, Escape cancels.

import { dropTargets, type ListboxDragSession, type ListboxDropTarget } from './drag-types.js';
import type { ListboxKey } from './types.js';

const EDGE = 24;
const THRESHOLD = 4;

function targetAt(doc: Document, x: number, y: number, from: ListboxDropTarget): { el: HTMLElement; target: ListboxDropTarget } | null {
  let node: Element | null = doc.elementFromPoint(x, y);
  while (node) {
    const target = dropTargets.get(node);
    if (target) {
      const same = target === from;
      if ((same && from.reorderable) || (!same && from.group !== null && target.group === from.group)) return { el: node as HTMLElement, target };
      return null;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * Arms a drag after a press on a draggable option: the drag starts
 * once the pointer moves past the threshold and `onItemDragStart` was not
 * cancelled. Returns a function that cancels it.
 */
export function armDrag(origin: HTMLElement, from: ListboxDropTarget, session: ListboxDragSession): () => void {
  const view = origin.ownerDocument.defaultView ?? globalThis.window;
  let cancel: (() => void) | null = null;
  const disarm = (): void => {
    view.removeEventListener('pointermove', onMove);
    view.removeEventListener('pointerup', onAbort);
    view.removeEventListener('pointercancel', onAbort);
  };
  const onAbort = (): void => {
    disarm();
    if (!cancel) session.onEnd();
  };
  const onMove = (event: PointerEvent): void => {
    if (event.pointerId !== session.pointerId || Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < THRESHOLD) return;
    disarm();
    let prevented = false;
    session.onDragStart(
      Object.freeze({
        values: session.values,
        items: session.items,
        source: session.pointerType === 'touch' ? ('touch' as const) : ('pointer' as const),
        preventDefault: () => {
          prevented = true;
        },
        get defaultPrevented() {
          return prevented;
        },
      }),
    );
    if (prevented) return session.onEnd();
    session.onStart();
    cancel = startDrag(origin, from, session, event.clientX, event.clientY);
  };
  view.addEventListener('pointermove', onMove);
  view.addEventListener('pointerup', onAbort);
  view.addEventListener('pointercancel', onAbort);
  return () => {
    disarm();
    cancel?.();
  };
}

function startDrag(origin: HTMLElement, from: ListboxDropTarget, session: ListboxDragSession, x0: number, y0: number): () => void {
  const doc = origin.ownerDocument;
  const view = doc.defaultView ?? globalThis.window;
  const ghost = doc.createElement('div');
  ghost.className = 'salmon-listbox-drag-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = session.values.length > 1 ? `${session.label} +${session.values.length - 1}` : session.label;
  doc.body.appendChild(ghost);
  const indicator = doc.createElement('div');
  indicator.className = 'salmon-listbox-drop-indicator';
  indicator.setAttribute('aria-hidden', 'true');
  let over: { el: HTMLElement; target: ListboxDropTarget } | null = null;
  let toIndex: number | null = null;
  let frame = 0;
  let last = { x: x0, y: y0 };
  let ended = false;
  origin.setAttribute('data-dragging', '');

  const place = (): void => {
    frame = 0;
    const { x, y } = last;
    ghost.style.transform = `translate(${x + 12}px, ${y + 8}px)`;
    const hit = targetAt(doc, x, y, from);
    if (hit?.el !== over?.el) {
      over?.el.removeAttribute('data-drop-target');
      hit?.el.setAttribute('data-drop-target', '');
    }
    over = hit;
    if (hit) {
      const rect = hit.el.getBoundingClientRect();
      // Auto-scroll near the edges.
      if (y < rect.top + EDGE) hit.el.scrollTop -= EDGE / 2;
      else if (y > rect.bottom - EDGE) hit.el.scrollTop += EDGE / 2;
      const at = hit.target.dropAt(y);
      toIndex = at.index;
      const sizer = hit.el.querySelector('.salmon-listbox-sizer, .salmon-listbox-items') ?? hit.el;
      if (indicator.parentElement !== sizer) sizer.appendChild(indicator);
      indicator.style.insetBlockStart = `${at.offset}px`;
    } else {
      toIndex = null;
      indicator.remove();
    }
    session.onDrag({ values: session.values, clientX: x, clientY: y, overGroup: hit ? hit.target.group : null, toIndex });
  };

  const onMove = (event: PointerEvent): void => {
    if (event.pointerId !== session.pointerId) return;
    event.preventDefault();
    last = { x: event.clientX, y: event.clientY };
    if (!frame) frame = view.requestAnimationFrame(place);
  };
  const finish = (drop: boolean): void => {
    if (ended) return;
    ended = true;
    if (frame) view.cancelAnimationFrame(frame);
    view.removeEventListener('pointermove', onMove);
    view.removeEventListener('pointerup', onUp);
    view.removeEventListener('pointercancel', onCancel);
    view.removeEventListener('keydown', onKey, true);
    ghost.remove();
    indicator.remove();
    over?.el.removeAttribute('data-drop-target');
    origin.removeAttribute('data-dragging');
    if (drop && over && toIndex !== null) {
      if (over.target === from) from.reorder(session.values, toIndex);
      else over.target.receive(session.values, session.items, from.id, toIndex);
    }
    session.onEnd();
  };
  const onUp = (event: PointerEvent): void => {
    if (event.pointerId !== session.pointerId) return;
    last = { x: event.clientX, y: event.clientY };
    place();
    finish(true);
  };
  const onCancel = (): void => finish(false);
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finish(false);
    }
  };
  view.addEventListener('pointermove', onMove, { passive: false });
  view.addEventListener('pointerup', onUp);
  view.addEventListener('pointercancel', onCancel);
  view.addEventListener('keydown', onKey, true);
  place();
  return () => finish(false);
}

/** What a registered drop target reads from its Listbox at drop time (the Listbox's latest render). */
export interface DropTargetSource {
  readonly current: {
    readonly itemHeight: number;
    readonly count: number;
    readonly view: { dataIndexAt(entry: number): number };
    readonly collection: { readonly items: readonly unknown[]; indexOf(value: ListboxKey): number };
    readonly props: {
      readonly onReorder?: ((event: never) => void) | undefined;
      readonly onItemDrop?: ((event: never) => void) | undefined;
    };
  };
}

/**
 * Registers a list as a drop target. Loaded after mount by a
 * `reorderable` or `dragGroup` Listbox, so the initial chunk carries none of
 * it. Returns the unregister function.
 */
export function registerDropTarget(list: HTMLElement, id: string, group: string | null, reorderable: boolean, latest: DropTargetSource): () => void {
  const target: ListboxDropTarget = {
    id,
    group,
    reorderable,
    dropAt: (clientY) => {
      const l = latest.current;
      const container = list.querySelector('.salmon-listbox-sizer, .salmon-listbox-items') as HTMLElement | null;
      const rect = (container ?? list).getBoundingClientRect();
      const h = l.itemHeight;
      const entry = Math.max(0, Math.min(l.count, Math.round((clientY - rect.top) / h)));
      return { index: l.view.dataIndexAt(entry), offset: entry * h };
    },
    reorder: (moving, toIndex) => {
      const l = latest.current;
      const c = l.collection;
      (l.props.onReorder as ((event: unknown) => void) | undefined)?.({ values: moving, items: moving.map((v) => c.items[c.indexOf(v)]), toIndex, delta: null, source: 'pointer' });
    },
    receive: (moving, items, fromList, toIndex) => {
      (latest.current.props.onItemDrop as ((event: unknown) => void) | undefined)?.({ values: moving, items, fromList, dragGroup: group ?? '', toIndex, source: 'pointer' });
    },
  };
  dropTargets.set(list, target);
  return () => {
    dropTargets.delete(list);
  };
}
