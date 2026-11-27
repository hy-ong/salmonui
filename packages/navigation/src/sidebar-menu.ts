'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/navigation/sidebar-menu`: SidebarMenu.
// Vertical application navigation: links, submenus, group headings, router
// links through `renderLink`, and an icon rail with flyout submenus.
export { SidebarMenu } from './sidebar-menu/SidebarMenu.js';
export type { SidebarMenuExpandedChangeEvent, SidebarMenuLinkProps, SidebarMenuProps, SidebarMenuSelectedChangeEvent, SidebarMenuSource } from './sidebar-menu/SidebarMenu.js';
export type { SidebarMenuEntry, SidebarMenuGroup, SidebarMenuItem } from './sidebar-menu/model.js';
export { SIDEBAR_MENU_DEFAULT_LOCALE_TEXT } from './sidebar-menu/locale.js';
export type { SidebarMenuLocaleText } from './sidebar-menu/locale.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/navigation/sidebar-menu', 'salmon-sidebar-menu');
