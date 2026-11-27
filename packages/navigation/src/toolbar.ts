'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/navigation/toolbar`: Toolbar.
// Render-safe: browser APIs only in effects and event handlers; the overflow
// menu (Menu family) is a lazy chunk. The `.salmon-app-bar` recipe CSS ships
// in /toolbar/styles.css.
export { Toolbar, ToolbarItem, ToolbarGroup, ToolbarSpacer, ToolbarSeparator, TOOLBAR_DEFAULT_LOCALE_TEXT } from './toolbar/Toolbar.js';
export type { ToolbarProps, ToolbarItemProps, ToolbarGroupProps, ToolbarSpacerProps, ToolbarSeparatorProps, ToolbarLocaleText, ToolbarOverflow, ToolbarOrientation, ToolbarItemSize } from './toolbar/Toolbar.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/navigation/toolbar', 'salmon-toolbar');
