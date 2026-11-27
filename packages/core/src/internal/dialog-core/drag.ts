// Dialog drag and resize: the lazy chunk of
// `@salmonui/overlays/dialog`, imported the first time `draggable` or
// `resizable` is true. No React: pointer moves write the dialog's
// `--salmon-dialog-x` / `--salmon-dialog-y` variables or its size once per
// frame (internal/pointer-drag.ts); callbacks with React state run on
// release. Arrow keys on the drag handle and the resize handles move and
// resize too, announced through a polite live region. Horizontal deltas
// follow `dir` (read at interaction time).

import { arrowDelta, startPointerDrag, type DragDelta } from '../pointer-drag.js';
import type { DialogLocaleText, DialogPosition, DialogProps, DialogResizeEdge, DialogSize } from './Dialog.js';

export interface DragOptions {
  /** The dialog's props (`draggable`, `dragHandle`, `resizable`, the move / resize callbacks, `localeText`). */
  readonly props: DialogProps;
  /** Current position. */
  readonly position: DialogPosition;
  /** Commits a finished move (position state, `onPositionChange`, `onMoveEnd`). */
  readonly commit: (position: DialogPosition) => void;
}

interface Resolved {
  readonly draggable: boolean;
  readonly handle: string;
  readonly edges: readonly DialogResizeEdge[];
  readonly position: DialogPosition;
  readonly localeText?: DialogLocaleText | undefined;
  readonly onMoveStart?: (() => void) | undefined;
  readonly onMove?: ((position: DialogPosition) => void) | undefined;
  readonly onMoveEnd: (position: DialogPosition) => void;
  readonly onResizeStart?: (() => void) | undefined;
  readonly onResize?: ((size: DialogSize) => void) | undefined;
  readonly onResizeEnd?: ((size: DialogSize) => void) | undefined;
}

function resolve({ props: p, position, commit }: DragOptions): Resolved {
  return {
    draggable: p.draggable === true,
    handle: p.dragHandle ?? '.salmon-dialog-title',
    edges: p.resizable === true ? ['bottomEnd'] : p.resizable || [],
    position,
    localeText: p.localeText,
    onMoveStart: p.onMoveStart,
    onMove: p.onMove,
    onMoveEnd: commit,
    onResizeStart: p.onResizeStart,
    onResize: p.onResize,
    onResizeEnd: p.onResizeEnd,
  };
}

export interface DragController {
  update(options: DragOptions): void;
  destroy(): void;
}

const MIN = 120;

const rtlOf = (el: Element): boolean => el.ownerDocument.defaultView?.getComputedStyle(el).direction === 'rtl';

/** Attaches drag and resize handling to a dialog element. */
export function attachDrag(dialog: HTMLDialogElement, initial: DragOptions): DragController {
  let o = resolve(initial);
  const doc = dialog.ownerDocument;
  const live = doc.createElement('span');
  live.className = 'salmon-dialog-live';
  live.setAttribute('aria-live', 'polite');
  dialog.append(live);
  const handles: HTMLElement[] = [];
  const announce = (text: string): void => {
    live.textContent = text;
  };
  const setPos = (p: DialogPosition): void => {
    dialog.style.setProperty('--salmon-dialog-x', `${p.x}px`);
    dialog.style.setProperty('--salmon-dialog-y', `${p.y}px`);
  };
  // Logical inline delta: positive moves toward the inline end.
  const logical = (d: DragDelta): DialogPosition => ({ x: rtlOf(dialog) ? -d.dx : d.dx, y: d.dy });
  const moveBy = (start: DialogPosition, d: DragDelta): DialogPosition => {
    const l = logical(d);
    return { x: Math.round(start.x + l.x), y: Math.round(start.y + l.y) };
  };

  const handleOf = (target: EventTarget | null): HTMLElement | null => {
    const h = (target as Element | null)?.closest?.(o.handle) as HTMLElement | null;
    return h && dialog.contains(h) ? h : null;
  };
  const onPointerDown = (event: PointerEvent): void => {
    if (!o.draggable || (event.target as Element).closest('button, input, select, textarea, a, [data-edge]')) return;
    const handle = handleOf(event.target);
    if (!handle) return;
    const start = o.position;
    let last = start;
    const started = startPointerDrag(event, handle, {
      threshold: 3,
      onMove: (d) => {
        if (last === start) o.onMoveStart?.();
        last = moveBy(start, d);
        setPos(last);
        o.onMove?.(last);
      },
      onEnd: (d, cancelled) => {
        if (cancelled) setPos(start);
        else if (d.dx || d.dy) o.onMoveEnd(moveBy(start, d));
      },
    });
    if (started) event.preventDefault();
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement;
    const edge = target.dataset?.['edge'] as DialogResizeEdge | undefined;
    const d = arrowDelta(event);
    if (!d) return;
    if (edge && dialog.contains(target)) {
      event.preventDefault();
      const size = resizeBy(edge, { dx: d.dx, dy: d.dy }, sizeOf());
      o.onResizeStart?.();
      applySize(size);
      o.onResizeEnd?.(size);
      announce(o.localeText?.resized?.(size) ?? `Resized to ${size.width} by ${size.height}`);
      return;
    }
    if (!o.draggable || !handleOf(target) || target !== handleOf(target)) return;
    event.preventDefault();
    const next = moveBy(o.position, d);
    o.onMoveStart?.();
    setPos(next);
    o.onMoveEnd(next);
    announce(o.localeText?.moved?.(next) ?? `Moved to ${next.x}, ${next.y}`);
  };

  // Resize.
  const sizeOf = (): DialogSize => ({ width: Math.round(dialog.offsetWidth), height: Math.round(dialog.offsetHeight) });
  const applySize = (s: DialogSize): void => {
    dialog.style.width = `${s.width}px`;
    dialog.style.height = `${s.height}px`;
  };
  const resizeBy = (edge: DialogResizeEdge, d: DragDelta, start: DialogSize): DialogSize => {
    const l = logical(d);
    const inline = /start/i.test(edge) ? -l.x : /end/i.test(edge) ? l.x : 0;
    const block = /^top/.test(edge) ? -l.y : /^bottom/.test(edge) ? l.y : 0;
    return { width: Math.max(MIN, Math.round(start.width + inline)), height: Math.max(MIN, Math.round(start.height + block)) };
  };
  const syncHandles = (): void => {
    for (const h of handles.splice(0)) h.remove();
    for (const edge of o.edges) {
      const h = doc.createElement('span');
      h.className = 'salmon-dialog-resize-handle';
      h.dataset['edge'] = edge;
      h.tabIndex = 0;
      h.setAttribute('role', 'button');
      h.setAttribute('aria-label', o.localeText?.resizeEdge?.(edge) ?? `${o.localeText?.resize ?? 'Resize'} (${edge.replace(/[A-Z]/, (c) => ` ${c.toLowerCase()}`)})`);
      h.addEventListener('pointerdown', (event) => {
        const start = sizeOf();
        let size = start;
        let begun = false;
        const s = startPointerDrag(event, h, {
          onMove: (d) => {
            if (!begun) o.onResizeStart?.();
            begun = true;
            size = resizeBy(edge, d, start);
            applySize(size);
            o.onResize?.(size);
          },
          onEnd: (_d, cancelled) => {
            if (cancelled) applySize(start);
            else if (begun) o.onResizeEnd?.(size);
          },
        });
        if (s) event.preventDefault();
      });
      dialog.append(h);
      handles.push(h);
    }
  };
  syncHandles();
  let edgesKey = o.edges.join();
  dialog.addEventListener('pointerdown', onPointerDown);
  dialog.addEventListener('keydown', onKeyDown);
  // The handle takes keyboard focus for arrow-key moves.
  const markHandle = (): void => {
    const h = dialog.querySelector<HTMLElement>(o.handle);
    if (o.draggable) {
      dialog.dataset['draggable'] = '';
      if (h && !h.hasAttribute('tabindex')) h.tabIndex = 0;
    } else delete dialog.dataset['draggable'];
  };
  markHandle();
  return {
    update(next) {
      o = resolve(next);
      markHandle();
      if (o.edges.join() !== edgesKey) {
        edgesKey = o.edges.join();
        syncHandles();
      }
    },
    destroy() {
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('keydown', onKeyDown);
      for (const h of handles.splice(0)) h.remove();
      live.remove();
      delete dialog.dataset['draggable'];
    },
  };
}
