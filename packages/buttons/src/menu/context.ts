import { createContext, use } from 'react';
import type { MenuActionEvent, MenuItemData, MenuOpenChangeReason, MenuSource, MenuSubmenuOpen } from './types.js';

/** One menu tree (a popup menu with its submenus, or a standalone `Menu`). */
export interface MenuRootContextValue {
  /** Marks every popup of the tree (`data-salmon-menu-root`) so outside-press detection treats them as inside. */
  readonly rootId: string;
  /** Runs the action of an item: item handler, then the root `onAction`; closes the tree unless prevented or `keepOpen`. Returns `defaultPrevented`. */
  readonly act: (id: string, item: MenuItemData | undefined, source: MenuSource, own: ((event: MenuActionEvent) => void) | undefined, keepOpen: boolean) => boolean;
  /** Closes the whole tree (popup menus); a no-op for a standalone `Menu`. */
  readonly close: (reason: MenuOpenChangeReason, source: MenuSource) => void;
  /** True when the tree lives in a popup (Tab and Escape close it). */
  readonly popup: boolean;
  readonly container: Element | null | undefined;
  /** Submenus open on hover (after `hoverDelay` ms) or on click only. */
  readonly submenuOpen: MenuSubmenuOpen;
  readonly hoverDelay: number;
  /** The key ('Enter' or ' ') whose synthetic click is being handled; read once by the item. */
  readonly takeKey: () => string | null;
  readonly setKey: (key: string | null) => void;
}

export const MenuRootContext = createContext<MenuRootContextValue | null>(null);

/** Submenu controller, registered by `Submenu` with the list that contains its trigger. */
export interface SubmenuController {
  open(focus: boolean): void;
  close(focusTrigger: boolean): void;
}

export interface MenuListContextValue {
  readonly level: number;
  readonly subs: Map<Element, SubmenuController>;
  /** The open submenu of this list (one at a time). */
  readonly openSub: { current: SubmenuController | null };
  /** Cancels a pending hover-intent open or close of this list (the pointer reached a submenu). */
  readonly cancelHover: () => void;
}

export const MenuListContext = createContext<MenuListContextValue | null>(null);

export function useMenuRoot(component: string): MenuRootContextValue {
  const root = use(MenuRootContext);
  if (!root) throw new Error(`[salmonui] <${component}> must be rendered inside a <Menu>, <MenuButton> or <SplitButton>.`);
  return root;
}

export interface MenuRadioContextValue {
  readonly value: string | null;
  readonly select: (value: string, source: MenuSource) => void;
}

export const MenuRadioContext = createContext<MenuRadioContextValue | null>(null);
