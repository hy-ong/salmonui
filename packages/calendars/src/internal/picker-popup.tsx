'use client';

// Popup layer of the calendar pickers, in their lazy popup chunks:
// the top-layer popover or `<dialog>` sheet on the shared overlay
// primitives, and the `aria-activedescendant` bridge of the time lists.

import { useEffect, useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { useDismiss } from '@salmonui/core/internal/dismiss';
import { useFocusScope } from '@salmonui/core/internal/focus-scope';
import { useOverlayPosition, useTopLayer } from '@salmonui/core/internal/overlay';

export interface PickerPopupProps {
  readonly mode: 'popover' | 'modal';
  readonly anchorRef: RefObject<HTMLElement | null>;
  /** Elements that count as inside (the field root). */
  readonly insideRef: RefObject<HTMLElement | null>;
  readonly id?: string | undefined;
  readonly role?: 'dialog' | undefined;
  readonly 'aria-label'?: string | undefined;
  readonly 'aria-labelledby'?: string | undefined;
  readonly className: string;
  readonly style?: CSSProperties | undefined;
  readonly children: ReactNode;
  readonly onDismiss: (reason: 'escape' | 'outside' | 'tab') => void;
}

// The geometry the shared overlay positioning expects (internal/overlay.tsx).
const POPOVER_BOX: CSSProperties = Object.freeze({ position: 'fixed', top: 0, left: 0, right: 'auto', bottom: 'auto', margin: 0 });

/**
 * The popup, on the shared overlay primitives.
 * Mounted only while open (never in server HTML) and rendered
 * inside the picker root, so focus moving into it stays inside the field
 * group. Popover mode: top layer (`useTopLayer`), placed below the field
 * with flip and shift (`useOverlayPosition`, re-placed when the content
 * changes size), dismissed by an outside press or focus leaving
 * (`useDismiss`); Tab leaves (`useFocusScope`). Modal mode: a `<dialog>`
 * shown with `showModal()` as a bottom sheet; Tab is contained and a press on
 * the backdrop dismisses.
 */
export function PickerPopup(props: PickerPopupProps) {
  const ref = useRef<HTMLElement | null>(null);
  const { mode, anchorRef, insideRef } = props;
  const popover = mode === 'popover';
  const dismiss = useRef(props.onDismiss);
  useLayoutEffect(() => {
    dismiss.current = props.onDismiss;
  });
  useTopLayer(ref, popover);
  const place = useOverlayPosition(ref, () => (popover ? anchorRef.current : null), { placement: 'bottom-start', offset: 4, margin: 4, autoUpdate: popover });
  // Escape is handled by the picker's own key handlers (they also cover focus in the field).
  useDismiss(ref, { onDismiss: (reason) => dismiss.current(reason === 'outside' ? 'outside' : 'tab'), insideRefs: [insideRef], escape: false, outsidePress: popover, focusOutside: popover });
  useFocusScope(ref, { autoFocus: false, tab: popover ? 'leave' : 'contain', restoreFocus: false });
  useLayoutEffect(() => {
    const popup = ref.current;
    if (!popup) return;
    if (!popover) {
      const dialog = popup as HTMLDialogElement;
      if (typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
      return;
    }
    // Content that renders after the first placement (today, the time list) changes the size: place again.
    if (typeof ResizeObserver !== 'function') return;
    const observer = new ResizeObserver(() => place());
    observer.observe(popup);
    return () => observer.disconnect();
  }, [popover, place]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>): void => {
    if (e.key === 'Escape' || (e.altKey && e.key === 'ArrowUp')) {
      e.preventDefault();
      e.stopPropagation();
      dismiss.current('escape');
    }
  };
  const common = {
    id: props.id,
    role: props.role,
    'aria-label': props['aria-label'],
    'aria-labelledby': props['aria-labelledby'],
    'aria-modal': props.role === 'dialog' && !popover ? true : undefined,
    className: props.className,
    'data-mode': mode,
    onKeyDown,
  };
  if (!popover) {
    return (
      <dialog
        {...common}
        style={props.style}
        ref={(el) => {
          ref.current = el;
        }}
        onCancel={(e) => {
          e.preventDefault();
          dismiss.current('escape');
        }}
        onClick={(e) => {
          // A press on the backdrop targets the dialog itself, outside its box.
          if (e.target !== e.currentTarget) return;
          const r = e.currentTarget.getBoundingClientRect();
          if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dismiss.current('outside');
        }}
      >
        {props.children}
      </dialog>
    );
  }
  return (
    <div
      {...common}
      style={props.style ? { ...POPOVER_BOX, ...props.style } : POPOVER_BOX}
      ref={(el) => {
        ref.current = el;
      }}
    >
      {props.children}
    </div>
  );
}

/**
 * Keeps `aria-activedescendant` / `aria-controls` on the focused element of
 * the field while a listbox popup is open (focus stays in the field). Attributes are written to the DOM, never through React state.
 */
export function useActiveDescendant(open: boolean, controlRef: RefObject<HTMLElement | null>, listId: string, activeId: string | null): void {
  useEffect(() => {
    const control = controlRef.current;
    if (!control) return;
    const doc = control.ownerDocument;
    const clear = (): void => {
      for (const el of control.querySelectorAll('[aria-activedescendant]')) {
        el.removeAttribute('aria-activedescendant');
        el.removeAttribute('aria-controls');
      }
    };
    const apply = (): void => {
      clear();
      const el = doc.activeElement;
      if (!open || !activeId || !el || !control.contains(el) || el.tagName === 'BUTTON') return;
      el.setAttribute('aria-activedescendant', activeId);
      el.setAttribute('aria-controls', listId);
    };
    apply();
    control.addEventListener('focusin', apply);
    return () => {
      control.removeEventListener('focusin', apply);
      clear();
    };
  }, [open, controlRef, listId, activeId]);
}

