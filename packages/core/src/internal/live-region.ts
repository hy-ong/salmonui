// Live-region primitive. Server-safe: no hooks, no browser globals at module level
// or during render. A live region must exist in the DOM before the text it
// announces, so components render the region in their server HTML (empty or
// with static content) and only insert text later; `announce()` writes into
// such a region from effects or event handlers.
//
// The Data Grid keeps its private `OutputStatus` region (the grid switches
// only where its bytes stay equal).

/** `'polite'` waits for the user to be idle; `'assertive'` interrupts. */
export type Politeness = 'polite' | 'assertive';

/** @internal The ARIA attributes of a live region of the given politeness. */
export function liveRegionProps(politeness: Politeness): { role: 'status' | 'alert'; 'aria-live': Politeness; 'aria-atomic': true } {
  return politeness === 'assertive' ? { role: 'alert', 'aria-live': 'assertive', 'aria-atomic': true } : { role: 'status', 'aria-live': 'polite', 'aria-atomic': true };
}

/**
 * @internal Announces `text` through an existing (mounted) live region.
 * Equal consecutive texts are re-announced: the region is cleared first and
 * the text written shortly after, which assistive technology treats as a new
 * insertion. Call from effects or event handlers only.
 */
export function announce(region: HTMLElement | null | undefined, text: string): void {
  if (!region) return;
  if (region.textContent === text) {
    region.textContent = '';
    region.ownerDocument.defaultView?.setTimeout(() => {
      region.textContent = text;
    }, 50);
    return;
  }
  region.textContent = text;
}
