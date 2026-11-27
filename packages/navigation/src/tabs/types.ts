import type { ReactNode } from 'react';

/** Input that caused a change. */
export type TabsSource = 'pointer' | 'keyboard' | 'touch' | 'api';

/** Side of the panels the tab list sits on; `start` / `end` are logical and imply a vertical list. */
export type TabsPlacement = 'top' | 'bottom' | 'start' | 'end';

/** `automatic`: a tab is selected when it receives focus (APG default); `manual`: Enter / Space selects. */
export type TabsActivation = 'automatic' | 'manual';

/** `lazy`: a panel mounts on its first selection and stays; `active`: only the selected panel; `eager`: every panel, also on the server. */
export type TabsPanelMount = 'lazy' | 'active' | 'eager';

/** `scroll`: the list scrolls with scroll buttons; `menu`: tabs that do not fit move into a "More tabs" menu. */
export type TabsOverflow = 'scroll' | 'menu';

/** Second argument of `onValueChange` (frozen in development). */
export interface TabsValueChangeEvent {
  readonly value: string;
  readonly previousValue: string | undefined;
  readonly source: TabsSource;
}

/** `onBeforeValueChange`: `preventDefault()` keeps the current tab. */
export interface TabsBeforeValueChangeEvent extends TabsValueChangeEvent {
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** `onReorder`: the application moves the tab from `fromIndex` to `toIndex` (indices among the `Tab` elements). */
export interface TabsReorderEvent {
  readonly value: string;
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly source: TabsSource;
}

/** `onBeforeReorder`: `preventDefault()` cancels the move. */
export interface TabsBeforeReorderEvent extends TabsReorderEvent {
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

/** `Tab onClose`: the close button was pressed or Delete was pressed on the focused tab. */
export interface TabCloseEvent {
  readonly value: string;
  readonly source: TabsSource;
}

/** Static texts (`TABS_DEFAULT_LOCALE_TEXT`). */
export interface TabsLocaleText {
  readonly scrollBackward: string;
  readonly scrollForward: string;
  readonly moreTabs: string;
  readonly close: string;
}

/** Where a `Tab` icon sits relative to the label. */
export type TabIconPlacement = 'start' | 'end' | 'top' | 'bottom';

/** A tab moved into the overflow menu (read from the DOM when the menu opens). */
export interface TabsOverflowEntry {
  readonly value: string;
  readonly label: ReactNode;
  readonly disabled: boolean;
}
