'use client';

// Overflow menu of `Toolbar` (lazy chunk, loaded on first hover or open):
// the Menu family's standalone `Menu` (public entry, composed by design) in
// a collision-aware internal overlay anchored to the toolbar's
// "more" button. Entries are read from the hidden slots when the menu opens;
// choosing one clicks the overflowed control, which stays hidden in the bar,
// so one `onClick` serves both places.

import { useLayoutEffect, useState, type ReactElement, type ReactNode, type RefObject } from 'react';
import { Menu, type MenuItemData } from '@salmonui/buttons/menu';
import { Overlay } from '@salmonui/core/internal/overlay';
import type { Placement } from '@salmonui/core/internal/position';

export interface ToolbarItemMeta {
  label: string | undefined;
  icon: ReactNode;
}

export interface ToolbarOverflowMenuProps {
  readonly id: string;
  readonly anchor: RefObject<HTMLElement | null>;
  /** The toolbar's measured content element (`data-overflow-root`). */
  readonly content: RefObject<HTMLElement | null>;
  /** `ToolbarItem` `label` / `icon` by slot key. */
  readonly meta: ReadonlyMap<string, ToolbarItemMeta>;
  readonly disabled: boolean;
  readonly placement: Placement;
  readonly label: string;
  readonly onClose: () => void;
}

const CONTROL = 'button, a[href], input, select, textarea, [role="button"], [tabindex]';

function hiddenSlots(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>('[data-overflow-item]')].filter((slot) => slot.hidden && slot.parentElement?.closest('[data-overflow-root]') === el);
}

/**
 * Menu entries of the overflowed slots in DOM order; separators never lead,
 * trail or double. Slots of a labelled `ToolbarGroup` form a `Menu` group
 * headed by the group's label (group overflow popups).
 */
function entriesOf(el: HTMLElement | null, meta: ReadonlyMap<string, ToolbarItemMeta>, disabled: boolean): MenuItemData[] {
  const top: MenuItemData[] = [];
  if (!el) return top;
  let entries = top;
  let group: Element | null = null;
  for (const slot of hiddenSlots(el)) {
    const id = slot.dataset['overflowItem'] as string;
    const owner = slot.closest('[data-labelled]');
    if (owner !== group) {
      if (entries[entries.length - 1]?.type === 'separator') entries.pop();
      group = owner;
      entries = top;
      if (owner) {
        entries = [];
        top.push({
          type: 'group',
          id: `${id}-group`,
          label: owner.querySelector('.salmon-toolbar-group-label > span')?.textContent ?? '',
          items: entries,
        });
      }
    }
    if (slot.dataset['overflowSeparator'] !== undefined) {
      if (entries.length && entries[entries.length - 1]?.type !== 'separator') entries.push({ type: 'separator', id });
      continue;
    }
    const control = slot.querySelector<HTMLElement>(CONTROL);
    const info = meta.get(id);
    const label = info?.label || control?.getAttribute('aria-label') || control?.title || (control ?? slot).textContent?.trim() || id;
    entries.push({
      id,
      label,
      icon: info?.icon,
      disabled: disabled || !control || (control as HTMLButtonElement).disabled === true || control.getAttribute('aria-disabled') === 'true',
    });
  }
  if (entries[entries.length - 1]?.type === 'separator') entries.pop();
  return top;
}

export default function ToolbarOverflowMenu(props: ToolbarOverflowMenuProps): ReactElement | null {
  const { id, anchor, content, meta, disabled, placement, label, onClose } = props;
  // Read once after the menu mounts (the hidden slots do not change while it is open).
  const [items, setItems] = useState<MenuItemData[] | null>(null);
  useLayoutEffect(() => setItems(entriesOf(content.current, meta, disabled)), [content, meta, disabled]);
  if (!items) return null;
  return (
    <Overlay
      anchor={anchor}
      placement={placement}
      offset={4}
      className="salmon-toolbar-menu"
      insideRefs={[anchor]}
      onDismiss={onClose}
      focus={{
        autoFocus: 'first',
        onTab: (event) => {
          event.preventDefault();
          onClose();
        },
      }}
    >
      <Menu
        // The standalone Menu does not forward `id` to its role="menu" element (MenuList overrides it); set it for aria-controls.
        ref={(el) => {
          if (el) el.id = id;
        }}
        aria-label={label}
        items={items}
        onAction={(event) => {
          onClose();
          const el = content.current;
          const slot = el ? hiddenSlots(el).find((s) => s.dataset['overflowItem'] === event.id) : undefined;
          slot?.querySelector<HTMLElement>(CONTROL)?.click();
        }}
      />
    </Overlay>
  );
}
