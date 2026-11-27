'use client';

// Overlay presentation seam of SidebarLayout.
// Loaded lazily by `SidebarPanel` the first time a layout is in the overlay
// presentation, so push-only pages never download it. It renders the panel
// in the shared dialog core as a drawer (`kind="drawer"`, the host `Drawer`
// of `@salmonui/overlays` renders: native `<dialog>` `showModal()`, backdrop,
// focus containment, inert background, Escape, focus return to the
// invoker), so Navigation needs no Overlays dependency. The drawer stays
// mounted while closed (`keepMounted`), so the panel element and its ref
// persist. Stylesheet: the dialog core and drawer rules are not carried by
// the sidebar-layout stylesheet (its budget); import
// `@salmonui/overlays/drawer/styles.css` with the overlay presentation.

import type { CSSProperties, ReactElement, RefObject } from 'react';
import { DialogRoot } from '@salmonui/core/internal/dialog-core/Dialog';
import type { SidebarSource } from './SidebarLayout.js';

/** @internal The seam contract. */
export interface SidebarOverlayProps {
  readonly open: boolean;
  readonly side: 'start' | 'end';
  /** The `<aside>` / `<nav>` element to present. */
  readonly panel: ReactElement;
  readonly panelRef: RefObject<HTMLElement | null>;
  readonly panelId: string;
  /** Asks the layout to close (it runs `onBeforeOpenChange` / `onOpenChange`). */
  readonly onDismiss: (reason: 'escape' | 'outside', source: SidebarSource) => void;
}

/** @internal */
export function SidebarOverlay(props: SidebarOverlayProps): ReactElement {
  const { open, side, panel, onDismiss } = props;
  const named = panel.props as { readonly 'aria-label'?: string; readonly 'aria-labelledby'?: string };
  return (
    <DialogRoot
      open={open}
      kind="drawer"
      side={side}
      dismissible
      style={{ '--salmon-drawer-size': 'var(--salmon-sidebar-size)' } as CSSProperties}
      keepMounted
      className="salmon-sidebar-drawer"
      aria-label={named['aria-labelledby'] ? undefined : named['aria-label']}
      aria-labelledby={named['aria-labelledby']}
      onOpenChange={(next, event) => {
        if (next) return;
        const reason = event.reason === 'outside' ? 'outside' : 'escape';
        onDismiss(reason, event.source === 'api' ? 'keyboard' : event.source);
      }}
    >
      {panel}
    </DialogRoot>
  );
}
