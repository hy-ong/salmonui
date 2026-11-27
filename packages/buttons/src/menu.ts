'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/buttons/menu`: the Menu family, MenuButton and SplitButton.
// Render-safe: browser APIs only in
// effects and event handlers; closed popups render no markup.
export { Menu, MenuItem, MenuCheckboxItem, MenuRadioGroup, MenuRadioItem, MenuGroup, MenuSeparator, Submenu } from './menu/Menu.js';
export type {
  MenuProps,
  MenuItemProps,
  MenuItemRenderProps,
  MenuCheckboxItemProps,
  MenuRadioGroupProps,
  MenuRadioItemProps,
  MenuGroupProps,
  MenuSeparatorProps,
  SubmenuProps,
} from './menu/Menu.js';
export { MenuButton } from './menu/MenuButton.js';
export type { MenuButtonProps, MenuButtonMenuProps, MenuButtonPart } from './menu/MenuButton.js';
export { SplitButton } from './menu/SplitButton.js';
export type { SplitButtonProps, SplitButtonPart } from './menu/SplitButton.js';
export type { MenuActionEvent, MenuChangeEvent, MenuItemData, MenuOpenChangeEvent, MenuOpenChangeReason, MenuPlacement, MenuSource, MenuSubmenuOpen } from './menu/types.js';
// ContextMenu and Menubar: separate modules, tree-shaken
// away for a MenuButton-only consumer.
export { ContextMenu, CONTEXT_MENU_DEFAULT_LOCALE_TEXT } from './menu/ContextMenu.js';
export type { ContextMenuProps, ContextMenuPoint, ContextMenuSource, ContextMenuBeforeOpenEvent, ContextMenuBeforeCloseEvent, ContextMenuLocaleText, ContextMenuPart } from './menu/ContextMenu.js';
export { Menubar, MenubarMenu, MenubarItem, MENUBAR_DEFAULT_LOCALE_TEXT } from './menu/Menubar.js';
export type { MenubarProps, MenubarMenuProps, MenubarItemProps, MenubarValueChangeEvent, MenubarValueChangeReason, MenubarBeforeValueChangeEvent, MenubarLocaleText } from './menu/Menubar.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/buttons/menu', 'salmon-menu');
