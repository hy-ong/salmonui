'use client';

// Lazy chunk of `overflow="menu"`: the ellipsis as a Buttons
// `MenuButton` (public `@salmonui/buttons/menu` entry, a composition edge)
// whose menu lists the hidden items as link items. Breadcrumbs mounts it on
// the first activation of its stand-in button, so it mounts open; later it
// behaves as any MenuButton (focus returns to it on close).

import { useRef, useState, type ReactElement, type ReactNode } from 'react';
import { MenuButton, MenuItem, type MenuItemRenderProps } from '@salmonui/buttons/menu';
import type { PressSource } from '@salmonui/core/internal/press';
import type { BreadcrumbItemProps, BreadcrumbItemRenderProps } from './Breadcrumbs.js';

export interface BreadcrumbsMenuEntry {
  readonly index: number;
  readonly props: BreadcrumbItemProps;
}

export interface BreadcrumbsMenuProps {
  readonly label: string;
  readonly icon: ReactNode;
  readonly disabled: boolean;
  readonly entries: readonly BreadcrumbsMenuEntry[];
  /** Fires `onItemClick`; true when it was prevented (no navigation). */
  readonly onPick: (index: number, item: BreadcrumbItemProps, source: PressSource) => boolean;
}

export default function BreadcrumbsMenu(props: BreadcrumbsMenuProps): ReactElement {
  const { label, icon, disabled, entries, onPick } = props;
  const [open, setOpen] = useState(true);
  const trigger = useRef<HTMLButtonElement | null>(null);
  return (
    <MenuButton
      ref={trigger}
      className="salmon-breadcrumbs-ellipsis"
      variant="ghost"
      size="sm"
      iconOnly
      aria-label={label}
      iconStart={icon}
      indicator={false}
      disabled={disabled}
      open={open}
      onOpenChange={setOpen}
      onAction={(event) => {
        const entry = entries.find((e) => String(e.index) === event.id);
        if (!entry || !onPick(entry.index, entry.props, event.source as PressSource)) return;
        // Prevented: no navigation; close the menu and return focus anyway.
        event.preventDefault();
        setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }}
      // Built only while open: a closed menu creates no entries.
      menu={open ? entries.map(({ index, props: item }) => {
        const render = item.render;
        return (
          <MenuItem
            key={index}
            id={String(index)}
            href={item.href}
            target={item.target}
            disabled={item.disabled}
            icon={item.icon}
            title={item.title}
            {...(render && item.href !== undefined ? { render: (p: MenuItemRenderProps) => render(p as unknown as BreadcrumbItemRenderProps) } : {})}
          >
            {item.children}
          </MenuItem>
        );
      }) : null}
    />
  );
}
