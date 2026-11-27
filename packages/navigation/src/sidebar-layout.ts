'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/navigation/sidebar-layout`: SidebarLayout, SidebarPanel, SidebarMain,
// SidebarTrigger.
// Render-safe: width and focus are read only in effects and handlers; the
// overlay presentation is a lazy chunk (sidebar-layout/overlay.tsx).
export { SidebarLayout, SIDEBAR_LAYOUT_DEFAULT_LOCALE_TEXT } from './sidebar-layout/SidebarLayout.js';
export type {
  SidebarLayoutProps,
  SidebarLayoutLocaleText,
  SidebarOpenChangeEvent,
  SidebarBeforeOpenChangeEvent,
  SidebarCollapsedChangeEvent,
  SidebarOpenChangeReason,
  SidebarPresentation,
  SidebarSource,
} from './sidebar-layout/SidebarLayout.js';
export { SidebarPanel, SidebarMain, SidebarTrigger } from './sidebar-layout/parts.js';
export type { SidebarPanelProps, SidebarMainProps, SidebarTriggerProps, SidebarRenderProps } from './sidebar-layout/parts.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/navigation/sidebar-layout', 'salmon-sidebar');
