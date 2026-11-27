// `overflow="menu"`: the shared measurer
// (internal/overflow.ts `watchOverflow`) over the `.salmon-tab-list`
// wrapper, with the selected tab pinned so it always stays in the visible
// strip. Both the measurer and the menu (./overflow-menu.tsx) are lazy
// chunks, loaded only when `overflow="menu"` is used, so the default Tabs
// initial JS stays in budget. The server and the first client render show
// every tab; the fit is applied after the chunk arrives (attributes only).

import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import type { UseOverflowOptions } from '../internal/overflow.js';
import type { TabsOverflowEntry } from './types.js';

export interface TabsOverflowMenu {
  readonly hidden: ReadonlySet<string>;
  readonly open: boolean;
  readonly triggerRef: RefObject<HTMLButtonElement | null>;
  toggle(): void;
  close(): void;
  /** The overflowed tabs, read from the DOM (in tab order). */
  entries(): TabsOverflowEntry[];
}

const NONE: ReadonlySet<string> = new Set();

export function useTabsOverflow(
  wrap: RefObject<HTMLElement | null>,
  strip: RefObject<HTMLElement | null>,
  enabled: boolean,
  vertical: boolean,
  value: string | undefined,
): TabsOverflowMenu | null {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(NONE);
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const watcher = useRef<{ readonly measure: () => void; readonly stop: () => void } | null>(null);
  const options = useRef<UseOverflowOptions>({});
  useLayoutEffect(() => {
    options.current = { orientation: vertical ? 'vertical' : 'horizontal', pinned: value ?? null };
    watcher.current?.measure();
  });
  useLayoutEffect(() => {
    const el = wrap.current;
    if (!enabled || !el) return;
    let live = true;
    void import('../internal/overflow.js').then((m) => {
      if (live) watcher.current = m.watchOverflow(el, () => options.current, setHidden);
    });
    return () => {
      live = false;
      watcher.current?.stop();
      watcher.current = null;
    };
  }, [enabled, wrap]);
  if (!enabled) return null;
  return {
    hidden,
    open,
    triggerRef,
    toggle: () => setOpen((o) => !o),
    close: () => setOpen(false),
    entries: () =>
      Array.from(strip.current?.querySelectorAll<HTMLElement>('[role="tab"][data-overflow-hidden]') ?? [], (el) => ({
        value: el.dataset['value']!,
        label: el.querySelector('.salmon-tab-label')?.textContent ?? '',
        disabled: el.getAttribute('aria-disabled') === 'true',
      })),
  };
}
