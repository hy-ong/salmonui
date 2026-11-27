'use client';

// Popup overlay of Select and Combobox on the shared overlay primitives
// (`useTopLayer`, `useOverlayPosition`, `useDismiss` from internal/): a portal
// into the theme scope (rendered only after a user action, never on the
// server), top layer, `bottom-start` placement with flip and shift measured in
// one layout effect, repositioned at most once per frame on scroll / resize
// while open, and outside-press dismissal through the shared dismiss stack.
// Focus stays on the trigger or input, so Escape is handled there. A closed
// dropdown renders none of this, so it has no listeners.
// `mode="sheet"` is the full-screen dialog of the adaptive popup:
// CSS fills the screen and overrides the placement transform.

import { useLayoutEffect, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { useDismiss } from '@salmonui/core/internal/dismiss';
import { useOverlayPosition, useTopLayer } from '@salmonui/core/internal/overlay';

import type { PopupContext } from './core.js';

export interface PopupProps {
  readonly anchorRef: RefObject<HTMLElement | null>;
  readonly context: PopupContext;
  readonly className: string;
  readonly style?: CSSProperties | undefined;
  readonly onOutsidePress: () => void;
  readonly children: ReactNode;
  readonly role?: 'dialog' | undefined;
  readonly 'aria-label'?: string | undefined;
}

const BOX: CSSProperties = Object.freeze({ position: 'fixed', top: 0, left: 0, right: 'auto', bottom: 'auto', margin: 0 });

export function Popup(props: PopupProps) {
  const { context, anchorRef } = props;
  const sheet = context.mode === 'sheet';
  const ref = useRef<HTMLDivElement | null>(null);
  // Order matters: top layer (makes the box measurable), then placement.
  useTopLayer(ref);
  const place = useOverlayPosition(ref, anchorRef, { placement: 'bottom-start', offset: 2, rtl: context.rtl, autoUpdate: !sheet });
  // Content that changes size after the first placement (a lazy grid popup, remote rows, a search
  // narrowing the list) is placed again, at most once per resize notification.
  useLayoutEffect(() => {
    const el = ref.current;
    const RO = el?.ownerDocument.defaultView?.ResizeObserver;
    if (!el || !RO || sheet) return;
    const observer = new RO(() => place());
    observer.observe(el);
    return () => observer.disconnect();
  }, [place, sheet]);
  useDismiss(ref, {
    onDismiss: (reason) => {
      if (reason === 'outside') props.onOutsidePress();
    },
    insideRefs: [anchorRef],
    escape: false,
  });
  return createPortal(
    <div
      ref={ref}
      className={props.className}
      style={props.style ? { ...BOX, ...props.style } : BOX}
      data-mode={context.mode}
      role={props.role}
      aria-modal={props.role === 'dialog' ? true : undefined}
      aria-label={props['aria-label']}
      dir={context.rtl ? 'rtl' : undefined}
    >
      {props.children}
    </div>,
    context.container,
  );
}
