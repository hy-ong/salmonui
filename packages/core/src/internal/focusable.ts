// Tabbable lookup, split from
// `focus-scope.ts` so a component that only lists tabbables (Toolbar roving)
// does not ship the focus scope hook. `focus-scope.ts` re-exports it.

/** Elements that take focus from Tab. */
export const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, summary, [contenteditable]:not([contenteditable="false"]), [tabindex]:not([tabindex="-1"])';

/** Tabbable descendants of `root` in DOM order (hidden and `display: none` ones excluded). */
export function focusableIn(root: Element): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => !el.hidden && el.tabIndex >= 0 && el.getClientRects().length > 0);
}
