'use client';

// Lazy behaviors of SidebarLayout, loaded after mount only when a layout uses
// them (`collapseBelow`, `closeOnOutsidePress`), so the initial chunk stays
// within its budget. Before this chunk runs, the per-instance container or
// media query rule in the server markup already shows the right
// presentation, so loading it late never changes what the user sees.

import { useLayoutEffect, useRef, type RefObject } from 'react';
import { useDismiss } from '@salmonui/core/internal/dismiss';
// Type-only import: a runtime import of the static chunk would make Vite wrap this chunk's `import()` in its preload helper.
import type { SidebarOpenChangeReason, SidebarSource } from './SidebarLayout.js';

/** @internal */
export interface SidebarAdaptiveProps {
  readonly rootRef: RefObject<HTMLDivElement | null>;
  readonly panelRef: RefObject<HTMLElement | null>;
  readonly panelId: string;
  /** Measured breakpoint (a media query arrives cleaned); `undefined` turns measurement off. */
  readonly collapseBelow: number | string | undefined;
  /** Push presentation `closeOnOutsidePress` is active (panel open). */
  readonly outside: boolean;
  readonly open: boolean;
  readonly onNarrow: (narrow: boolean | null) => void;
  readonly requestOpen: (open: boolean, reason: SidebarOpenChangeReason, source: SidebarSource) => void;
  /** The presses held while this chunk loaded (taken on mount). */
  readonly held: RefObject<Event[]>;
}

/** @internal Measures the layout (one ResizeObserver or one media query list) and handles outside presses. */
export function SidebarAdaptive(props: SidebarAdaptiveProps): null {
  const { rootRef, panelRef, panelId, collapseBelow, outside, requestOpen } = props;
  const latest = useRef(props);
  useLayoutEffect(() => {
    latest.current = props;
  });
  // Breakpoint switches: narrow closes (the overlay starts closed), wide restores the last wide state.
  const narrowRef = useRef<boolean | null>(null);
  const wideOpen = useRef(props.open);
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (collapseBelow === undefined || !root) return;
    const apply = (narrow: boolean): void => {
      const previous = narrowRef.current;
      if (previous === narrow) return;
      narrowRef.current = narrow;
      const l = latest.current;
      l.onNarrow(narrow);
      if (narrow) {
        wideOpen.current = l.open;
        l.requestOpen(false, 'breakpoint', 'api');
      } else if (previous === true) l.requestOpen(wideOpen.current, 'breakpoint', 'api');
    };
    let stop: () => void;
    if (typeof collapseBelow === 'string') {
      const mql = root.ownerDocument.defaultView!.matchMedia(collapseBelow);
      const update = (): void => apply(mql.matches);
      update();
      mql.addEventListener('change', update);
      stop = () => mql.removeEventListener('change', update);
    } else {
      // Read phase only; a commit happens only when the narrow flag flips.
      apply(root.getBoundingClientRect().width < collapseBelow);
      const observer = new ResizeObserver((entries) => {
        const entry = entries[entries.length - 1];
        if (entry) apply(entry.contentRect.width < collapseBelow);
      });
      observer.observe(root);
      stop = () => observer.disconnect();
    }
    return () => {
      stop();
      narrowRef.current = null;
      latest.current.onNarrow(null);
    };
  }, [rootRef, collapseBelow]);
  const notTrigger = (event: Event): boolean => !(event.target as Element | null)?.closest?.(`[aria-controls="${panelId}"]`);
  const dismiss = (event: Event): void => requestOpen(false, 'outside', (event as PointerEvent).pointerType === 'touch' ? 'touch' : 'pointer');
  useDismiss(panelRef, { enabled: outside, escape: false, outsidePress: notTrigger, onDismiss: (_reason, event) => dismiss(event) });
  // A press outside while this chunk loaded closes the panel now.
  useLayoutEffect(() => {
    const press = props.held.current.splice(0).find((event) => outside && !panelRef.current?.contains(event.target as Node) && notTrigger(event));
    if (press) dismiss(press);
    // Once, when the chunk mounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
