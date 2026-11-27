'use client';

// A menu popup anchored to a trigger (lazy chunk shared by the toolbar
// menus): the Menu family popup with the items and an action handler.

import type { RefObject } from 'react';
import { useMenuPopup } from '@salmonui/buttons/internal/menu-popup';
import type { MenuActionEvent, MenuItemData } from '@salmonui/buttons/menu';

export interface MenuPopupProps {
  readonly items: readonly MenuItemData[];
  readonly triggerRef: RefObject<HTMLElement | null>;
  readonly labelledBy: string;
  readonly onAction: (event: MenuActionEvent) => void;
  readonly onClose: (returnFocus: boolean) => void;
}

export default function MenuPopup(props: MenuPopupProps) {
  const popup = useMenuPopup(
    {
      open: true,
      onOpenChange: (open, event) => {
        if (!open) props.onClose(event.reason !== 'outside' && event.reason !== 'tab');
      },
      items: props.items,
      onAction: props.onAction,
      placement: 'bottom-start',
    },
    props.triggerRef as RefObject<HTMLButtonElement | null>,
    'PivotToolbarMenu',
  );
  return <>{popup.renderPopup(props.labelledBy, 'salmon-menu salmon-pivot-table-menu', undefined)}</>;
}
