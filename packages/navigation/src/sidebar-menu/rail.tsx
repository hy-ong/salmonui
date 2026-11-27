'use client';

// SidebarMenu rail popups: the flyout of a
// collapsed submenu and the label tooltip of a collapsed link. A lazy chunk:
// a menu that is never collapsed does not load the positioning and dismiss
// code. Both render inside the item's `<li>` and show in the top layer.

import { useEffect, useRef, type CSSProperties, type ReactElement, type ReactNode, type RefObject } from 'react';
import { useDismiss, type DismissReason } from '@salmonui/core/internal/dismiss';
import { useOverlayPosition, useTopLayer } from '@salmonui/core/internal/overlay';

// Only the box geometry is inline (the top layer, or position: fixed where the Popover API is missing).
const FLOATING: CSSProperties = { position: 'fixed', top: 0, left: 0, right: 'auto', bottom: 'auto', margin: 0 };

export interface FlyoutPanelProps {
  readonly id: string;
  readonly anchor: RefObject<HTMLLIElement | null>;
  readonly trigger: RefObject<HTMLButtonElement | null>;
  readonly title: ReactNode;
  /** Move focus to the first enabled link after opening (opened from the keyboard). */
  readonly focus: boolean;
  readonly onDismiss: () => void;
  /** The submenu list. */
  readonly children: ReactNode;
}

export function FlyoutPanel(props: FlyoutPanelProps): ReactElement {
  const { trigger, onDismiss } = props;
  const ref = useRef<HTMLDivElement>(null);
  useTopLayer(ref);
  useOverlayPosition(ref, props.anchor, { placement: 'end-start', offset: 4 });
  useDismiss(ref, {
    insideRefs: [trigger],
    focusOutside: true,
    onDismiss: (reason: DismissReason) => {
      onDismiss();
      if (reason === 'escape') trigger.current?.focus();
    },
  });
  const focusFirst = props.focus;
  useEffect(() => {
    if (focusFirst) ref.current?.querySelector<HTMLElement>('.salmon-sidebar-menu-link:not(:disabled):not([aria-disabled="true"])')?.focus();
  }, [focusFirst]);
  return (
    <div ref={ref} id={props.id} className="salmon-sidebar-menu-flyout" style={FLOATING}>
      <div className="salmon-sidebar-menu-flyout-title" aria-hidden="true">
        {props.title}
      </div>
      {props.children}
    </div>
  );
}

export function Tip(props: { readonly anchor: RefObject<HTMLLIElement | null>; readonly children: ReactNode }): ReactElement {
  const ref = useRef<HTMLSpanElement>(null);
  useTopLayer(ref, true, 'hint');
  useOverlayPosition(ref, props.anchor, { placement: 'end', offset: 6 });
  // Decorative: the link's own (visually hidden) label already names it.
  return (
    <span ref={ref} className="salmon-sidebar-menu-tooltip" aria-hidden="true" style={FLOATING}>
      {props.children}
    </span>
  );
}
