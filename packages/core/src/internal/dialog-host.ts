// Dialog host:
// a native <dialog> opened with showModal() or show(), initial focus
// (`initialFocus`, then `[data-autofocus]`, else the platform default), focus
// return to the invoker, Escape through the `cancel` event (modal) or a
// keydown on the element (modeless), backdrop presses, and
// `<form method="dialog">` submissions reported with their return value
// instead of closing natively (so a controlled parent can veto). Generalized
// from `openModal` / `DataGridConfirmDialog` in
// `data-grid/editing/EditOverlays.tsx`. React never owns the `open`
// attribute; the host calls showModal() / show() / close() in a layout effect.
//
// Popups inside a dialog:
// popups anchored inside a modal dialog portal into it, a backdrop press while a
// dismiss layer inside the dialog is open only dismisses that layer, and
// Escape reaches the popup first (its keydown `preventDefault()` suppresses
// the modal `cancel`; the modeless Escape listener runs at the document after
// the content's handlers and skips presses a layer inside handled).

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { dismissLayers } from './dismiss.js';

export type DialogHostReason = 'escape' | 'outside' | 'submit';

export interface DialogHostOptions {
  readonly open: boolean;
  /** showModal() (top layer, inert background, focus containment) or show(). */
  readonly modal: boolean;
  /** A close request from the platform or the user; the caller decides. */
  readonly onRequestClose: (reason: DialogHostReason, event: Event, returnValue?: string) => void;
  /** Press on the backdrop (modal) — always reported, before the request. */
  readonly onOverlayPress?: ((event: PointerEvent) => void) | undefined;
  readonly escape: boolean;
  readonly outside: boolean;
  /** Element to focus on open; `false` leaves focus on the dialog's default. */
  readonly initialFocus?: RefObject<HTMLElement | null> | false | undefined;
  /** Return focus to the element focused before opening. Default true. */
  readonly returnFocus?: boolean | undefined;
  /** Called once the open transition finished (or at once without one). */
  readonly onAfterOpen?: (() => void) | undefined;
}

const outsideRect = (el: Element, e: PointerEvent): boolean => {
  const r = el.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
};

/** Binds the host behavior to the `<dialog>` in `ref` while it is mounted. */
export function useDialogHost(ref: RefObject<HTMLDialogElement | null>, options: DialogHostOptions): void {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const { open, modal } = options;
  // Open / close with focus handling.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !open) return;
    const doc = el.ownerDocument;
    const previous = doc.activeElement as HTMLElement | null;
    if (!el.open) {
      if (modal && typeof el.showModal === 'function') el.showModal();
      else if (typeof el.show === 'function') el.show();
      else el.setAttribute('open', '');
    }
    const o = latest.current;
    const target = o.initialFocus === false ? null : (o.initialFocus?.current ?? el.querySelector<HTMLElement>('[data-autofocus]'));
    target?.focus({ preventScroll: true });
    let cancelled = false;
    const animations = typeof el.getAnimations === 'function' ? el.getAnimations() : [];
    void Promise.all(animations.map((a) => a.finished)).then(
      () => cancelled || latest.current.onAfterOpen?.(),
      () => undefined,
    );
    return () => {
      cancelled = true;
      if (el.open) el.close();
      const active = doc.activeElement;
      if (latest.current.returnFocus !== false && previous?.isConnected && (!active || active === doc.body || el.contains(active))) previous.focus({ preventScroll: true });
    };
  }, [ref, open, modal]);
  // Platform events, bound once per element.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const doc = el.ownerDocument;
    let downOutside = false;
    // A popup (dismiss layer) open inside the dialog: the press or key is its own.
    // Data Grid popovers (`data-salmon-popover`) keep their own dismissal outside the stack.
    const layerInside = (): boolean => dismissLayers(doc).some((l) => l !== el && el.contains(l)) || !!el.querySelector('[data-salmon-popover]');
    const onCancel = (event: Event): void => {
      // Escape on a modal dialog: never close natively.
      event.preventDefault();
      if (latest.current.escape) latest.current.onRequestClose('escape', event);
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      // Modeless dialogs get no `cancel` event. At the document (bubble), so content handlers
      // inside (React's root listener included) can `preventDefault()` first.
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || latest.current.modal) return;
      if (!el.contains(event.target as Node | null) || layerInside()) return;
      event.preventDefault();
      if (latest.current.escape) latest.current.onRequestClose('escape', event);
    };
    // At the document in the capture phase, bound when the dialog mounts: it runs before the
    // capture listeners of popups opened later, so a layer that the press dismisses still counts.
    const onPointerDown = (event: PointerEvent): void => {
      downOutside = event.target === el && outsideRect(el, event) && !layerInside();
    };
    const onClick = (event: MouseEvent): void => {
      const pe = event as PointerEvent;
      if (!downOutside || event.target !== el || !outsideRect(el, pe)) return;
      downOutside = false;
      latest.current.onOverlayPress?.(pe);
      if (latest.current.outside) latest.current.onRequestClose('outside', event);
    };
    const onSubmit = (event: SubmitEvent): void => {
      const form = event.target as HTMLFormElement;
      if (form.method !== 'dialog' || event.defaultPrevented) return;
      event.preventDefault();
      const submitter = event.submitter as HTMLButtonElement | null;
      latest.current.onRequestClose('submit', event, submitter?.value ?? '');
    };
    el.addEventListener('cancel', onCancel);
    doc.addEventListener('keydown', onKeyDown);
    doc.addEventListener('pointerdown', onPointerDown, true);
    el.addEventListener('click', onClick);
    el.addEventListener('submit', onSubmit);
    return () => {
      el.removeEventListener('cancel', onCancel);
      doc.removeEventListener('keydown', onKeyDown);
      doc.removeEventListener('pointerdown', onPointerDown, true);
      el.removeEventListener('click', onClick);
      el.removeEventListener('submit', onSubmit);
    };
  }, [ref]);
}
