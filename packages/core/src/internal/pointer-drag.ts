// Pointer drag primitive, one module for every drag in the component
// packages. Drag transients live in closures and refs, never React state.
// Generalized from the Data Grid column resize
// (`setPointerCapture` on the resize handle) and `row-drag-controller.ts`.
// Call the starters from event handlers only.
//
// Two entry points share one session loop (pointer capture, window
// listeners, one callback per animation frame, a flush before the end):
//
//   startPointerDrag(event, handle, { onMove(delta, event), onEnd?(delta, cancelled), threshold? })
//     => (() => void) | null     (Layout: Splitter, Dialog drag)
//     Cumulative `{ dx, dy }` deltas from the press, a movement threshold,
//     Escape cancels. Returns the cancel function, or null when the event does
//     not start a drag.
//
//   startPointerSession(target, event, handlers, options?) => PointerSession | null
//     (Inputs: Slider, SignaturePad, ColorArea, ColorSlider; usually through usePointerDrag)
//     - Ignores non-primary pointers and mouse buttons other than 0.
//     - Measures `options.rect ?? options.measure?.() ?? target.getBoundingClientRect()`
//       ONCE, at pointerdown; every callback gets that rect.
//     - `handlers.onStart(event, rect)` runs synchronously; `false` aborts.
//     - `handlers.onMove(event, rect, points)` at most once per animation frame
//       with every sample since the previous frame (`getCoalescedEvents()`
//       included, `options.coalesced`, default true); the array is reused, copy
//       what you keep. `options.frame: 'sync'` calls it per `pointermove`.
//     - `handlers.onEnd(event, rect, canceled)` after the last `onMove`;
//       `canceled` for `pointercancel`, lost capture without `pointerup`,
//       Escape (`options.escape`) and `session.cancel()`.
//     - `options.threshold`: px the pointer travels before the first `onMove`.
//
//   usePointerDrag() => { start(event, handlers, options?), cancel() }
//     React wrapper of startPointerSession: one session at a time, canceled on unmount.
//
// Helpers: fraction1D, fraction2D (0 at the inline start / bottom, RTL
// mirrors the horizontal axis only), keyMove (APG slider keys, RTL-mirrored
// horizontally), arrowDelta (physical arrow-key nudges), valueFromFraction,
// snapToStep, clamp.

import { useEffect, useRef, useState } from 'react';

/** The rect fields the helpers read (a `DOMRect` fits). */
export interface DragRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface PointerSessionHandlers {
  /** Synchronously at pointerdown; return `false` to ignore the press. */
  readonly onStart?: ((event: PointerEvent, rect: DragRect) => void | boolean) | undefined;
  /** Once per frame (or per move with `frame: 'sync'`) with every sample since the last call. */
  readonly onMove?: ((event: PointerEvent, rect: DragRect, points: readonly PointerEvent[]) => void) | undefined;
  /** Once, after the last `onMove`. */
  readonly onEnd?: ((event: PointerEvent, rect: DragRect, canceled: boolean) => void) | undefined;
}

export interface PointerSessionOptions {
  /** A rect to use instead of measuring. */
  readonly rect?: DragRect | undefined;
  /** Measures the rect at pointerdown (e.g. the track rather than the target). */
  readonly measure?: (() => DragRect) | undefined;
  /** `'raf'` (default) coalesces moves to one per animation frame; `'sync'` calls `onMove` per event. */
  readonly frame?: 'raf' | 'sync' | undefined;
  /** Collect `getCoalescedEvents()` samples into `points`. Default true. */
  readonly coalesced?: boolean | undefined;
  /** Pixels the pointer must travel before the first `onMove`. Default 0. */
  readonly threshold?: number | undefined;
  /** Escape cancels the drag. Default false. */
  readonly escape?: boolean | undefined;
}

export interface PointerSession {
  readonly pointerId: number;
  readonly rect: DragRect;
  /** Ends the drag now with `canceled: true`. */
  cancel(): void;
}

type Target = Pick<HTMLElement, 'addEventListener' | 'removeEventListener' | 'setPointerCapture' | 'releasePointerCapture' | 'hasPointerCapture' | 'getBoundingClientRect'>;

const raf = (cb: () => void): number => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(cb) : (setTimeout(cb, 16) as unknown as number));
const caf = (id: number): void => {
  if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
  else clearTimeout(id);
};

export function startPointerSession(target: Target, event: PointerEvent, handlers: PointerSessionHandlers, options: PointerSessionOptions = {}): PointerSession | null {
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return null;
  const win = (target as unknown as Element).ownerDocument?.defaultView;
  if (!win) return null;
  const rect = options.rect ?? options.measure?.() ?? target.getBoundingClientRect();
  const pointerId = event.pointerId;
  const sync = options.frame === 'sync';
  const collect = options.coalesced !== false;
  const threshold = options.threshold ?? 0;
  const x0 = event.clientX;
  const y0 = event.clientY;
  const points: PointerEvent[] = [];
  let started = threshold === 0;
  let last: PointerEvent | null = null;
  let frame = 0;
  let done = false;

  const flush = (): void => {
    frame = 0;
    if (!last) return;
    const e = last;
    last = null;
    handlers.onMove?.(e, rect, points);
    points.length = 0;
  };
  const onMove = (e: PointerEvent): void => {
    if (e.pointerId !== pointerId || done) return;
    if (!started) {
      if (Math.hypot(e.clientX - x0, e.clientY - y0) < threshold) return;
      started = true;
    }
    const samples = collect && typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : null;
    if (samples && samples.length > 0) for (const s of samples) points.push(s);
    else points.push(e);
    last = e;
    if (sync) flush();
    else if (frame === 0) frame = win.requestAnimationFrame(flush);
  };
  const finish = (e: PointerEvent, canceled: boolean): void => {
    if (done) return;
    if (frame !== 0) win.cancelAnimationFrame(frame);
    flush();
    done = true;
    win.removeEventListener('pointermove', onMove);
    win.removeEventListener('pointerup', onUp);
    win.removeEventListener('pointercancel', onCancel);
    win.removeEventListener('keydown', onKey, true);
    target.removeEventListener('lostpointercapture', onLost);
    try {
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
    } catch {
      // The element may be detached.
    }
    handlers.onEnd?.(e, rect, canceled);
  };
  const onUp = (e: PointerEvent): void => {
    if (e.pointerId === pointerId) finish(e, false);
  };
  const onCancel = (e: PointerEvent): void => {
    if (e.pointerId === pointerId) finish(e, true);
  };
  // `lostpointercapture` follows `pointerup`; on its own it means the capture was taken away.
  const onLost = (e: PointerEvent): void => {
    if (e.pointerId === pointerId) finish(e, true);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    finish(event, true);
  };

  if (handlers.onStart?.(event, rect) === false) return null;
  try {
    target.setPointerCapture(pointerId);
  } catch {
    // Synthetic events without an active pointer cannot be captured; the window listeners still work.
  }
  // Window listeners: captured events bubble there, and synthetic test events work without capture.
  win.addEventListener('pointermove', onMove);
  win.addEventListener('pointerup', onUp);
  win.addEventListener('pointercancel', onCancel);
  if (options.escape) win.addEventListener('keydown', onKey, true);
  target.addEventListener('lostpointercapture', onLost);
  return { pointerId, rect, cancel: () => finish(event, true) };
}

/** React wrapper: one session at a time, canceled on unmount. */
export function usePointerDrag(): {
  start: (event: PointerEvent | { readonly nativeEvent: PointerEvent; readonly currentTarget: EventTarget }, handlers: PointerSessionHandlers, options?: PointerSessionOptions) => PointerSession | null;
  cancel: () => void;
} {
  const session = useRef<PointerSession | null>(null);
  useEffect(() => () => session.current?.cancel(), []);
  // Created once (lazy state, not a ref read during render: React Compiler safe).
  const [api] = useState<ReturnType<typeof usePointerDrag>>(() => ({
    start(event, handlers, options) {
      session.current?.cancel();
      const native = 'nativeEvent' in event ? event.nativeEvent : event;
      const target = ('currentTarget' in event ? event.currentTarget : null) as Target | null;
      if (!target) return null;
      const onEnd = handlers.onEnd;
      const s = startPointerSession(target, native, {
        ...handlers,
        onEnd(e, rect, canceled) {
          session.current = null;
          onEnd?.(e, rect, canceled);
        },
      }, options);
      session.current = s;
      return s;
    },
    cancel() {
      session.current?.cancel();
    },
  }));
  return api;
}

export const clamp = (value: number, min: number, max: number): number => (value < min ? min : value > max ? max : value);

/** Decimal places of a step (`0.25` -> 2), for removing floating point noise. */
function decimals(n: number): number {
  if (!Number.isFinite(n) || Math.floor(n) === n) return 0;
  const s = String(n);
  const e = s.indexOf('e-');
  if (e >= 0) return Number(s.slice(e + 2));
  const dot = s.indexOf('.');
  return dot < 0 ? 0 : s.length - dot - 1;
}

export function snapToStep(value: number, min: number, max: number, step: number): number {
  if (!(step > 0)) return clamp(value, min, max);
  let v = min + Math.round((value - min) / step) * step;
  // The last step may overshoot `max` when the range is not a multiple of the step.
  if (v > max) v -= step;
  const places = Math.max(decimals(step), decimals(min));
  if (places > 0) v = Number(v.toFixed(places));
  return clamp(v, min, max);
}

export function valueFromFraction(fraction: number, min: number, max: number, step: number): number {
  return snapToStep(min + clamp(fraction, 0, 1) * (max - min), min, max, step);
}

export function fraction1D(clientX: number, clientY: number, rect: DragRect, orientation: 'horizontal' | 'vertical', rtl: boolean): number {
  if (orientation === 'vertical') return rect.height > 0 ? clamp((rect.top + rect.height - clientY) / rect.height, 0, 1) : 0;
  if (!(rect.width > 0)) return 0;
  const f = clamp((clientX - rect.left) / rect.width, 0, 1);
  return rtl ? 1 - f : f;
}

export function fraction2D(clientX: number, clientY: number, rect: DragRect, rtl: boolean, out: [number, number] = [0, 0]): [number, number] {
  out[0] = fraction1D(clientX, clientY, rect, 'horizontal', rtl);
  out[1] = fraction1D(clientX, clientY, rect, 'vertical', false);
  return out;
}

export type KeyMove =
  | { readonly type: 'step' | 'page'; readonly direction: 1 | -1 }
  | { readonly type: 'min' | 'max' };

const UP: KeyMove = /* @__PURE__ */ Object.freeze({ type: 'step', direction: 1 });
const DOWN: KeyMove = /* @__PURE__ */ Object.freeze({ type: 'step', direction: -1 });
const PAGE_UP: KeyMove = /* @__PURE__ */ Object.freeze({ type: 'page', direction: 1 });
const PAGE_DOWN: KeyMove = /* @__PURE__ */ Object.freeze({ type: 'page', direction: -1 });
const MIN: KeyMove = /* @__PURE__ */ Object.freeze({ type: 'min' });
const MAX: KeyMove = /* @__PURE__ */ Object.freeze({ type: 'max' });

export function keyMove(key: string, orientation: 'horizontal' | 'vertical', rtl: boolean): KeyMove | null {
  const mirror = rtl && orientation === 'horizontal';
  switch (key) {
    case 'ArrowUp':
      return UP;
    case 'ArrowDown':
      return DOWN;
    case 'ArrowRight':
      return mirror ? DOWN : UP;
    case 'ArrowLeft':
      return mirror ? UP : DOWN;
    case 'PageUp':
      return PAGE_UP;
    case 'PageDown':
      return PAGE_DOWN;
    case 'Home':
      return MIN;
    case 'End':
      return MAX;
    default:
      return null;
  }
}

export interface DragDelta {
  /** Horizontal pointer delta in px since the drag started (physical: positive is rightward). */
  readonly dx: number;
  /** Vertical pointer delta in px since the drag started. */
  readonly dy: number;
}

export interface PointerDragOptions {
  /** Per frame while moving (coalesced to one call per animation frame). */
  readonly onMove: (delta: DragDelta, event: PointerEvent) => void;
  /** Once on release (`cancelled: false`) or on Escape, `pointercancel` or lost capture (`cancelled: true`). */
  readonly onEnd?: ((delta: DragDelta, cancelled: boolean) => void) | undefined;
  /** Pixels the pointer must travel before the first `onMove`. Default 0. */
  readonly threshold?: number | undefined;
}

const NO_RECT: DragRect = /* @__PURE__ */ Object.freeze({ left: 0, top: 0, width: 0, height: 0 });
const ZERO: DragDelta = /* @__PURE__ */ Object.freeze({ dx: 0, dy: 0 });

/**
 * Starts a drag from a `pointerdown` on `handle` (primary button only) with
 * cumulative deltas. Returns a function that cancels the drag, or `null` when
 * the event does not start one.
 */
export function startPointerDrag(event: PointerEvent, handle: Element, options: PointerDragOptions): (() => void) | null {
  const x0 = event.clientX;
  const y0 = event.clientY;
  let delta: DragDelta = ZERO;
  const session = startPointerSession(
    handle as unknown as Target,
    event,
    {
      onMove: (e) => {
        delta = { dx: e.clientX - x0, dy: e.clientY - y0 };
        options.onMove(delta, e);
      },
      onEnd: (_e, _rect, canceled) => options.onEnd?.(delta, canceled),
    },
    { rect: NO_RECT, coalesced: false, threshold: options.threshold, escape: true },
  );
  return session ? session.cancel : null;
}

/**
 * Keyboard nudging: the physical delta of an arrow key,
 * `step` px (`largeStep` with Shift). Returns null for other keys. Callers
 * mirror horizontal deltas for RTL where the axis is logical.
 */
export function arrowDelta(event: { readonly key: string; readonly shiftKey: boolean }, step = 10, largeStep = 50): DragDelta | null {
  const d = event.shiftKey ? largeStep : step;
  switch (event.key) {
    case 'ArrowLeft':
      return { dx: -d, dy: 0 };
    case 'ArrowRight':
      return { dx: d, dy: 0 };
    case 'ArrowUp':
      return { dx: 0, dy: -d };
    case 'ArrowDown':
      return { dx: 0, dy: d };
    default:
      return null;
  }
}
