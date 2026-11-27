// Toast queue store (`toast-queue`). Framework-agnostic: no React
// at runtime (type-only imports) and no DOM globals at module level. Timers
// go through injected clock functions so Node tests drive time. The same
// `subscribe` / `getSnapshot` pattern as the Data Grid engine store; the
// `Toaster` reads it with `useSyncExternalStore` and narrow selectors.
//
// Rules:
// - The first `max` toasts (insertion order) are visible; the rest wait and
//   start counting down only when they become visible.
// - `duration` defaults to 5000 ms; a toast with actions does not
//   auto-dismiss unless `duration` is set (WCAG 2.2.1); `Infinity` (or any
//   non-positive value) keeps the toast.
// - `pause()` / `resume()` nest; resuming restarts each visible timer with
//   its remaining time.
// - A closing toast stays in `visible` with `closing: true` for the exit
//   transition (`EXIT_MS`), then leaves and frees its slot.
// - On the server `add()` is a no-op (and a development warning): one module
//   instance would otherwise serve every request.
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { DEV, warnOnce } from '@salmonui/core/internal/dev';

/** Color role: the neutral scale plus the five theme seeds. */
export type ToastTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger';

/** Why a toast closed. */
export type ToastCloseReason = 'timeout' | 'dismiss' | 'action' | 'programmatic';

/** A button in the toast. */
export interface ToastAction {
  /** The visible button label. */
  label: ReactNode;
  /**
   * Keyboard hint announced with the toast, for example "Undo with F6 then
   * Enter". Required: the toast may be gone before a pointer reaches it.
   */
  altText: string;
  /** Runs on press; the toast then closes with reason `'action'` unless `event.preventDefault()` is called. */
  onAction?: ((event: MouseEvent<HTMLButtonElement>) => void) | undefined;
}

/** Passed to `onBeforeClose`; `preventDefault()` keeps the toast open. */
export interface ToastBeforeCloseEvent {
  readonly id: string;
  readonly reason: ToastCloseReason;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** Passed to `onClose`. */
export interface ToastCloseEvent {
  readonly id: string;
  readonly reason: ToastCloseReason;
}

/** The object passed to `queue.add()` and `queue.update()`. */
export interface ToastOptions {
  /** Heading line. */
  title?: ReactNode;
  /** Body text under the title. */
  description?: ReactNode;
  /** Replaces the default layout (icon, title, description, actions). */
  content?: ReactNode;
  /** Color role; `'danger'` toasts are `role="alert"`. Default `'neutral'`. */
  tone?: ToastTone | undefined;
  /** Replaces the built-in tone icon; `false` hides it. Always decorative. */
  icon?: ReactNode | false;
  /**
   * Time on screen in ms. Default 5000, or `Infinity` when the toast has
   * actions; `Infinity` keeps it until dismissed. Counts only while visible
   * and not paused.
   */
  duration?: number | undefined;
  /** Shows a close button; Escape on the focused toast also closes it. Default `false`. */
  dismissible?: boolean | undefined;
  /** Shows the countdown bar (a CSS animation paused with the timer). */
  progress?: boolean | undefined;
  /** Buttons in the toast. */
  actions?: readonly ToastAction[] | undefined;
  /** Extra class on the toast element. */
  className?: string | undefined;
  /** Inline style on the toast element, for example a width. */
  style?: CSSProperties | undefined;
  /** Called when the toast enters the visible stack. */
  onOpen?: ((id: string) => void) | undefined;
  /** Called before the toast closes; `event.preventDefault()` keeps it. */
  onBeforeClose?: ((event: ToastBeforeCloseEvent) => void) | undefined;
  /** Called when the toast closes, with the reason. */
  onClose?: ((event: ToastCloseEvent) => void) | undefined;
  /** Called on a click anywhere in the toast. */
  onClick?: ((event: MouseEvent<HTMLElement>) => void) | undefined;
}

/** A toast in the queue: its options plus store state. */
export interface ToastState extends ToastOptions {
  /** Stable id returned by `queue.add()`. */
  readonly id: string;
  /** True during the exit transition. */
  readonly closing: boolean;
  /** Increments when the timer restarts (an update of `duration`), so the countdown bar restarts. */
  readonly run: number;
}

/** What `getSnapshot()` returns; a new object on every change. */
export interface ToastQueueSnapshot {
  /** Every toast, oldest first: the visible ones, then the waiting ones. */
  readonly toasts: readonly ToastState[];
  /** The first `max` toasts; the same array while they do not change. */
  readonly visible: readonly ToastState[];
  /** True while paused (hover, focus, hidden document or `pause()`). */
  readonly paused: boolean;
}

export interface ToastQueueOptions {
  /** Visible toasts; the rest wait. Default 5. */
  max?: number | undefined;
  /** Clock for tests. Default `Date.now`. */
  now?: (() => number) | undefined;
  /** Timer for tests. Default `globalThis.setTimeout`. */
  setTimeout?: ((callback: () => void, ms: number) => unknown) | undefined;
  /** Timer for tests. Default `globalThis.clearTimeout`. */
  clearTimeout?: ((handle: unknown) => void) | undefined;
}

/** A toast queue: create one with `createToastQueue()` or let `Toaster` create it. */
export interface ToastQueue {
  /** Adds a toast and returns its id. A no-op returning `''` on the server. */
  add(options: ToastOptions): string;
  /** Merges options into a toast; a new `duration` restarts its timer. */
  update(id: string, options: ToastOptions): void;
  /**
   * Closes a toast, or every toast without an id (waiting toasts leave
   * silently). `reason` defaults to `'programmatic'`.
   */
  dismiss(id?: string, reason?: ToastCloseReason): void;
  /** Pauses every timer; calls nest, each `pause()` needs a `resume()`. */
  pause(): void;
  /** Undoes one `pause()`; timers continue with their remaining time. */
  resume(): void;
  /** Sets the number of visible toasts. */
  setMax(max: number): void;
  subscribe(listener: () => void): () => void;
  getSnapshot(): ToastQueueSnapshot;
}

/** @internal Exit transition length; a closing toast keeps its slot this long. */
export const EXIT_MS = 200;

/** @internal The effective duration: 5000 ms by default, `Infinity` with actions or a non-positive value. */
export function durationOf(t: ToastOptions): number {
  const d = t.duration ?? (t.actions?.length ? Infinity : 5000);
  return d > 0 ? d : Infinity;
}

interface Timer {
  handle: unknown;
  /** Remaining ms. */
  left: number;
  /** When the running timer started, or -1 while stopped. */
  at: number;
}

/** Creates a toast queue. Call it in a client module or in an effect, never at render time. */
export function createToastQueue(options: ToastQueueOptions = {}): ToastQueue {
  const now = options.now ?? (() => Date.now());
  const set = options.setTimeout ?? ((cb: () => void, ms: number) => globalThis.setTimeout(cb, ms));
  const clear = options.clearTimeout ?? ((h: unknown) => globalThis.clearTimeout(h as number));
  let max = options.max ?? 5;
  let count = 0;
  let paused = 0;
  let toasts: ToastState[] = [];
  let snapshot: ToastQueueSnapshot = { toasts, visible: [], paused: false };
  const timers = new Map<string, Timer>();
  const listeners = new Set<() => void>();

  const start = (id: string, timer: Timer): void => {
    if (paused || timer.at >= 0 || !(timer.left < Infinity)) return;
    timer.at = now();
    timer.handle = set(() => close(id, 'timeout'), timer.left);
  };
  const stop = (timer: Timer): void => {
    if (timer.at < 0) return;
    clear(timer.handle);
    timer.left -= now() - timer.at;
    timer.at = -1;
  };
  const drop = (id: string): void => {
    const timer = timers.get(id);
    if (timer) stop(timer);
    timers.delete(id);
  };

  // Recomputes the snapshot, starts the timers of newly visible toasts and
  // calls their onOpen, then notifies.
  const emit = (): void => {
    const next = toasts.slice(0, max);
    const prev = snapshot.visible;
    const visible = next.length === prev.length && next.every((t, i) => t === prev[i]) ? prev : next;
    snapshot = { toasts, visible, paused: paused > 0 };
    const opened: ToastState[] = [];
    for (const t of visible) {
      if (timers.has(t.id) || t.closing) continue;
      const timer: Timer = { handle: undefined, left: durationOf(t), at: -1 };
      timers.set(t.id, timer);
      start(t.id, timer);
      opened.push(t);
    }
    for (const listener of [...listeners]) listener();
    for (const t of opened) t.onOpen?.(t.id);
  };

  const close = (id: string, reason: ToastCloseReason): void => {
    const t = toasts.find((x) => x.id === id);
    if (!t || t.closing) return;
    if (!snapshot.visible.includes(t)) {
      // A waiting toast never opened: it leaves silently.
      toasts = toasts.filter((x) => x !== t);
      return;
    }
    let prevented = false;
    t.onBeforeClose?.({
      id,
      reason,
      get defaultPrevented() {
        return prevented;
      },
      preventDefault() {
        prevented = true;
      },
    });
    if (prevented) {
      // Kept: a timed-out toast stays until it is dismissed.
      if (reason === 'timeout') timers.set(id, { handle: undefined, left: Infinity, at: -1 });
      return;
    }
    drop(id);
    const closing: ToastState = { ...t, closing: true };
    toasts = toasts.map((x) => (x === t ? closing : x));
    set(() => {
      toasts = toasts.filter((x) => x !== closing);
      emit();
    }, EXIT_MS);
    emit();
    t.onClose?.({ id, reason });
  };

  return {
    add(opts) {
      if (typeof document === 'undefined') {
        if (DEV) warnOnce('toast-server', 'queue.add() was called on the server; toasts are client-only and the call is ignored.');
        return '';
      }
      const id = `t${++count}`;
      toasts = [...toasts, { ...opts, id, closing: false, run: 0 }];
      emit();
      return id;
    },
    update(id, opts) {
      const t = toasts.find((x) => x.id === id);
      if (!t || t.closing) return;
      const restart = 'duration' in opts;
      const next: ToastState = { ...t, ...opts, id, closing: false, run: t.run + (restart ? 1 : 0) };
      toasts = toasts.map((x) => (x === t ? next : x));
      // A visible toast gets a fresh timer from emit().
      if (restart) drop(id);
      emit();
    },
    dismiss(id, reason = 'programmatic') {
      if (id !== undefined) return close(id, reason);
      const waiting = new Set(toasts.slice(max));
      toasts = toasts.filter((t) => !waiting.has(t));
      for (const t of snapshot.visible) close(t.id, reason);
      emit();
    },
    pause() {
      if (paused++ === 0) for (const timer of timers.values()) stop(timer);
      emit();
    },
    resume() {
      if (paused === 0) return;
      if (--paused === 0) for (const [id, timer] of timers) start(id, timer);
      emit();
    },
    setMax(n) {
      if (n === max) return;
      max = n;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot: () => snapshot,
  };
}
