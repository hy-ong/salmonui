// Collapse: disclosure state of
// one collapsible region. A mounted collapsed panel carries
// `hidden="until-found"`, so the browser's find-in-page can reveal it (the
// `beforematch` event reports that); the open and close transition is pure
// CSS (`block-size` with `interpolate-size: allow-keywords` where supported,
// off under `prefers-reduced-motion`), so nothing is measured.
//
// React 19 treats `hidden` as a boolean attribute (it would write `hidden=""`
// for "until-found"), so the attribute is not a prop: server HTML hides a
// collapsed panel by its `data-state="closed"` CSS, and a layout effect sets
// `hidden="until-found"` after hydration. React never owns the attribute, so
// hydration sees the same props on server and client.

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { flushSync } from 'react-dom';

export interface CollapseOptions {
  /** Keep the content mounted after it was opened once. Default true. */
  readonly keepMounted?: boolean | undefined;
  /** Mount the content even while it was never opened (server HTML, find-in-page). Default false. */
  readonly forceMount?: boolean | undefined;
  /** Find-in-page matched text inside the collapsed panel; open it. */
  readonly onReveal?: (() => void) | undefined;
}

export interface Collapse<E extends HTMLElement> {
  /** Ref for the panel element (the element that carries `hidden="until-found"`). */
  readonly ref: RefObject<E | null>;
  /** Whether the panel's content is mounted. */
  readonly mounted: boolean;
  /** `data-state` value of the panel. */
  readonly state: 'open' | 'closed';
}

/** Whether lazy content is mounted: open, forced, or opened once and kept. */
export function isCollapseMounted(open: boolean, everOpen: boolean, keepMounted = true, forceMount = false): boolean {
  return open || forceMount || (keepMounted && everOpen);
}

/** Disclosure state of a panel whose `open` flag is owned by the caller. */
export function useCollapse<E extends HTMLElement>(open: boolean, options: CollapseOptions = {}): Collapse<E> {
  const ref = useRef<E | null>(null);
  // "Opened once" is derived state: set during render when `open` first turns true.
  const [everOpen, setEverOpen] = useState(open);
  if (open && !everOpen) setEverOpen(true);
  const reveal = useRef(options.onReveal);
  useLayoutEffect(() => {
    reveal.current = options.onReveal;
  });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) el.removeAttribute('hidden');
    else el.setAttribute('hidden', 'until-found');
  }, [open]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Synchronous, so the panel is open before the browser scrolls to the match.
    const onBeforeMatch = (): void => flushSync(() => reveal.current?.());
    el.addEventListener('beforematch', onBeforeMatch);
    return () => el.removeEventListener('beforematch', onBeforeMatch);
  }, []);
  return { ref, mounted: isCollapseMounted(open, everOpen, options.keepMounted, options.forceMount), state: open ? 'open' : 'closed' };
}
