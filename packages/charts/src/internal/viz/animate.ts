// Entrance and update transitions of the visualization families
// without their own animation code: an attribute the CSS keys on.

import { useEffect, type RefObject } from 'react';

/**
 * Entrance and update transitions: `data-animate` is set on the root
 * after hydration only (never in server markup), and switches to `update`
 * once the entrance is over, so the first measured relayout does not slide.
 * The transitions themselves are CSS (`@salmonui/charts/viz-animations.css`),
 * off under `prefers-reduced-motion`.
 */
export function useAnimateAttribute(ref: RefObject<Element | null>, animated: boolean | undefined): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || animated === false) return el?.removeAttribute('data-animate');
    el.setAttribute('data-animate', '');
    const t = setTimeout(() => el.setAttribute('data-animate', 'update'), 700);
    return () => clearTimeout(t);
  }, [ref, animated]);
}
