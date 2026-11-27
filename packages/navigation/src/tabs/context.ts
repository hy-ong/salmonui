import { createContext } from 'react';
import type { TabsActivation, TabsLocaleText, TabsOverflow, TabsPanelMount, TabsSource } from './types.js';

// The two DOM reads below are the one-liners of internal/position.ts `isRtl` and
// internal/press.ts `pressSource`. Importing those modules would pull their
// shared chunks (used by the lazy Menu) into the Tabs initial JS.

/** Writing direction read at event time. */
export const rtlOf = (el: Element): boolean => el.ownerDocument.defaultView?.getComputedStyle(el).direction === 'rtl';

/** Source of a click: keyboard-synthesized clicks have `detail === 0`. */
export const clickSource = (event: { readonly detail: number; readonly nativeEvent: Event }): TabsSource =>
  event.detail === 0 ? 'keyboard' : (event.nativeEvent as PointerEvent).pointerType === 'touch' ? 'touch' : 'pointer';

/** Stable commands of one `Tabs` (they read the latest props from a ref). */
export interface TabsActions {
  select(value: string, source: TabsSource): void;
  /** A closable tab is about to call `onClose`: remember where focus and selection go if it unmounts. */
  closing(value: string, el: HTMLElement): void;
  /** A `Tab` unmounted. */
  removed(value: string): void;
  /** Fires the reorder events; false when cancelled or unhandled. */
  reorder(value: string, fromIndex: number, toIndex: number, source: TabsSource): boolean;
  /** No `value` / `defaultValue`: the first enabled tab becomes the initial value. */
  initial(value: string): void;
}

export interface TabsContextValue {
  readonly base: string;
  readonly value: string | undefined;
  readonly vertical: boolean;
  readonly activation: TabsActivation;
  readonly panelMount: TabsPanelMount;
  readonly overflow: TabsOverflow;
  readonly scrollStep: number;
  readonly reorderable: boolean;
  readonly disabled: boolean;
  readonly text: TabsLocaleText;
  readonly actions: TabsActions;
}

export const TabsContext = createContext<TabsContextValue | null>(null);

/** DOM id part for a tab value (ids may not contain spaces). */
export function idPart(value: string): string {
  return value.replace(/[^\w-]/g, (c) => `_${c.charCodeAt(0).toString(36)}`);
}

export const tabId = (base: string, value: string): string => `${base}t${idPart(value)}`;
export const panelId = (base: string, value: string): string => `${base}p${idPart(value)}`;

export const TAB = '[role="tab"]';

/** The tabs of a tab list in DOM order. */
export function tabsOf(list: Element): HTMLElement[] {
  return Array.from(list.querySelectorAll<HTMLElement>(TAB));
}

/** A tab reachable by arrow keys: shown (not hidden, not moved into the overflow menu) and enabled. */
export function navigable(el: HTMLElement): boolean {
  return !el.hidden && el.getAttribute('aria-disabled') !== 'true';
}

const NONE: ReadonlySet<string> = new Set();

/** Values of the tabs that `overflow="menu"` moved into the menu (from `TabList`). */
export const TabListContext = createContext<ReadonlySet<string>>(NONE);
