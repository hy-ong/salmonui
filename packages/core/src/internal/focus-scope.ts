// Focus scope: focusable lookup, Tab
// containment or a Tab-leaves policy, initial focus and focus restore.
// Extracted from `FOCUSABLE` / `trapTab` in `data-grid/popover.tsx`.

import { useLayoutEffect, useRef, type RefObject } from 'react';

import { FOCUSABLE, focusableIn } from './focusable.js';

export { FOCUSABLE, focusableIn };

/** Focuses the first tabbable descendant, or `root` itself (made programmatically focusable). Returns the focused element. */
export function focusFirst(root: HTMLElement): HTMLElement {
  const target = focusableIn(root)[0] ?? root;
  if (target === root && !root.hasAttribute('tabindex')) root.tabIndex = -1;
  target.focus({ preventScroll: true });
  return target;
}

/** The minimum of a keyboard event that `trapTab` needs (DOM or React). */
export interface TabKeyEvent {
  readonly key: string;
  readonly shiftKey: boolean;
  preventDefault(): void;
}

/**
 * Keeps Tab / Shift+Tab inside `root`: wraps from the last tabbable to the
 * first and back. Returns true when it moved focus.
 */
export function trapTab(event: TabKeyEvent, root: Element): boolean {
  if (event.key !== 'Tab') return false;
  const list = focusableIn(root);
  const active = root.ownerDocument.activeElement;
  if (!list.length) {
    // Nothing tabbable: focus stays on the scope.
    event.preventDefault();
    return false;
  }
  const first = list[0] as HTMLElement;
  const last = list[list.length - 1] as HTMLElement;
  if (event.shiftKey && (active === first || !root.contains(active))) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && (active === last || !root.contains(active))) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

export interface FocusScopeOptions {
  /** Default true; false makes the hook inert. */
  readonly enabled?: boolean | undefined;
  /** Initial focus on mount: the first tabbable (or the scope), the scope itself, or none. Default `'first'`. */
  readonly autoFocus?: 'first' | 'container' | false | undefined;
  /** Tab policy: `'contain'` wraps inside (modal dialogs), `'leave'` lets Tab move on. Default `'leave'`. */
  readonly tab?: 'contain' | 'leave' | undefined;
  /** Called on Tab inside the scope before the policy runs (menus close on Tab); `preventDefault()` skips the policy. */
  readonly onTab?: ((event: KeyboardEvent) => void) | undefined;
  /**
   * Focus restore on unmount: true returns focus to the element that had it
   * on mount, an element ref returns it there, false never. Focus is only
   * moved when it is inside the scope or lost (on `<body>`), so a press
   * elsewhere keeps its focus. Default true.
   */
  readonly restoreFocus?: boolean | RefObject<HTMLElement | null> | undefined;
}

/** Binds a focus scope to the element in `ref` while mounted and enabled. */
export function useFocusScope(ref: RefObject<HTMLElement | null>, options: FocusScopeOptions = {}): void {
  const latest = useRef(options);
  useLayoutEffect(() => {
    latest.current = options;
  });
  const enabled = options.enabled !== false;
  useLayoutEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    const doc = root.ownerDocument;
    const previous = doc.activeElement as HTMLElement | null;
    const auto = latest.current.autoFocus ?? 'first';
    if (auto === 'first') focusFirst(root);
    else if (auto === 'container') {
      if (!root.hasAttribute('tabindex')) root.tabIndex = -1;
      root.focus({ preventScroll: true });
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Tab') return;
      latest.current.onTab?.(event);
      if (event.defaultPrevented) return;
      if (latest.current.tab === 'contain') trapTab(event, root);
    };
    root.addEventListener('keydown', onKeyDown);
    return () => {
      root.removeEventListener('keydown', onKeyDown);
      const restore = latest.current.restoreFocus ?? true;
      if (restore === false) return;
      const target = restore === true ? previous : restore.current;
      const active = doc.activeElement;
      const lost = !active || active === doc.body || root.contains(active);
      if (lost && target && target !== root && target.isConnected) target.focus({ preventScroll: true });
    };
  }, [ref, enabled]);
}
