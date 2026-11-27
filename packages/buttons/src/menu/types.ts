import type { ReactNode } from 'react';

/** Popup side relative to the trigger; `start` / `end` are logical (mirrored under `dir="rtl"`). */
export type MenuPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

/** How submenus open: after a pointer rest (`hoverDelay`) or on click only. Keyboard always works. */
export type MenuSubmenuOpen = 'hover' | 'click';

/** Input that caused a change or an action. */
export type MenuSource = 'pointer' | 'keyboard' | 'touch' | 'api';

/** Why a menu opened or closed. */
export type MenuOpenChangeReason = 'trigger' | 'escape' | 'outside' | 'action' | 'tab';

/** Second argument of `onOpenChange` (frozen). */
export interface MenuOpenChangeEvent {
  readonly source: MenuSource;
  readonly reason: MenuOpenChangeReason;
}

/** Second argument of `onCheckedChange` / `onValueChange` in menus (frozen). */
export interface MenuChangeEvent {
  readonly source: MenuSource;
  readonly reason: 'action';
}

/**
 * Data form of a menu entry (`items` prop). `type` defaults to `'item'`; an
 * item with `items` is a submenu; `'group'` is a labelled group of `items`.
 */
export interface MenuItemData {
  readonly type?: 'item' | 'separator' | 'group';
  /** Stable item key, reported in `onAction` (required for items). */
  readonly id?: string;
  readonly label?: ReactNode;
  /** Typeahead text when `label` is not plain text. */
  readonly textValue?: string;
  readonly icon?: ReactNode;
  readonly disabled?: boolean;
  /** Renders the item as a link (`<a role="menuitem">`). */
  readonly href?: string;
  readonly target?: string;
  readonly title?: string;
  /** Submenu entries (type `'item'`) or group entries (type `'group'`). */
  readonly items?: readonly MenuItemData[];
}

/** `onAction` event: a chosen item. `preventDefault()` keeps the menu open (and stops link navigation). */
export interface MenuActionEvent {
  readonly id: string;
  /** The data entry when the menu was built from `items`. */
  readonly item: MenuItemData | undefined;
  readonly source: MenuSource;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}
