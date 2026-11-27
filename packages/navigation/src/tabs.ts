'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';
// `@salmonui/navigation/tabs`: Tabs.
// Render-safe: browser APIs only in effects and event handlers. The overflow
// menu (`@salmonui/buttons/menu`) and drag reordering are lazy chunks.
export { Tabs, TabList, Tab, TabPanel, TABS_DEFAULT_LOCALE_TEXT } from './tabs/Tabs.js';
export type { TabsProps, TabListProps, TabProps, TabRenderProps, TabPanelProps } from './tabs/Tabs.js';
export type {
  TabCloseEvent,
  TabIconPlacement,
  TabsActivation,
  TabsBeforeReorderEvent,
  TabsBeforeValueChangeEvent,
  TabsLocaleText,
  TabsOverflow,
  TabsPanelMount,
  TabsPlacement,
  TabsReorderEvent,
  TabsSource,
  TabsValueChangeEvent,
} from './tabs/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/navigation/tabs', 'salmon-tabs');
