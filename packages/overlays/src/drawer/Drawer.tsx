'use client';

// Drawer:
// a modal (or modeless) dialog docked to a logical edge, on the shared dialog
// core (`dialog-core/`, the native <dialog> host). Escape and a backdrop press
// close it by default. The Navigation category's SidebarLayout overlay mode
// renders it.

import type { CSSProperties, ReactElement } from 'react';
import { css, DialogRoot, PARTS, type DialogParts, type DialogProps } from '@salmonui/core/internal/dialog-core/Dialog';
import { useLocaleText } from '@salmonui/core/internal/locale';

export interface DrawerProps extends Omit<DialogProps, 'placement' | 'position' | 'defaultPosition' | 'onPositionChange' | 'draggable' | 'dragHandle' | 'onMoveStart' | 'onMove' | 'onMoveEnd' | 'resizable' | 'onResizeStart' | 'onResize' | 'onResizeEnd' | 'fullScreen'> {
  /** Edge the panel slides from: logical `'start'` (default) / `'end'`, or `'top'` / `'bottom'`. */
  readonly side?: 'start' | 'end' | 'top' | 'bottom' | undefined;
  /** Inline size (start / end) or block size (top / bottom), number px or CSS length. Default 320 px. */
  readonly size?: number | string | undefined;
}

/**
 * Drawer (`.salmon-drawer`): a modal (or modeless) dialog docked to an edge,
 * on the same dialog host. Escape and a backdrop press close it by default.
 * The Navigation category's Sidebar overlay mode renders it.
 */
// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace Drawer {
  export const Trigger: DialogParts['Trigger'];
  export const Close: DialogParts['Close'];
  export const Title: DialogParts['Title'];
  export const Description: DialogParts['Description'];
  export const Body: DialogParts['Body'];
  export const Footer: DialogParts['Footer'];
}
export function Drawer(props: DrawerProps): ReactElement {
  const { side = 'start', size, style, dismissible = true, ...rest } = props;
  const localeText = useLocaleText('dialog', props.localeText);
  return <DialogRoot {...rest} localeText={localeText} dismissible={dismissible} kind="drawer" side={side} style={size === undefined ? style : { ...style, '--salmon-drawer-size': css(size) } as CSSProperties} />;
}

Object.assign(Drawer, PARTS);
