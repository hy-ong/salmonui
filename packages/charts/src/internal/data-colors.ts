// Development-only data-color contrast check: hex colors a visualization draws are data colors, used as given;
// in development builds the colors that fail 3:1 against the plot surface
// (`--salmon-surface-base` as resolved at the root) log one warning per
// family and color set. Every call site sits behind an inline
// `process.env.NODE_ENV !== 'production'` test, so production bundles drop
// this module (internal/dev.ts). Not under `internal/viz/`, so
// `/sparkline` (which never reaches that folder) can call it too.

import { dataColorContrastOk } from '../viz/color.js';
import { warnOnce } from '@salmonui/core/internal/dev';

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/** `rgb(r, g, b)` (a computed color) as `#rrggbb`, or null. */
function hexOf(css: string): string | null {
  const m = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(css);
  return m ? `#${[m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('')}` : null;
}

/** The literal (hex or `rgb()`) data colors drawn under `root` (`fill` / `stroke` attributes and inline styles), as hex. */
export function dataColorsOf(root: Element): string[] {
  const out = new Set<string>();
  for (const el of root.querySelectorAll('[fill], [stroke], [style]')) {
    const style = (el as HTMLElement | SVGElement).style;
    for (const v of [el.getAttribute('fill'), el.getAttribute('stroke'), style?.fill, style?.stroke, style?.backgroundColor]) {
      // Inline styles read back as `rgb()` (CSSOM serialization); `var(--salmon-*)` roles are not data colors.
      const hex = v && (HEX.test(v.trim()) ? v.trim().toLowerCase() : hexOf(v));
      if (hex) out.add(hex);
    }
  }
  return [...out];
}

/**
 * Warns (development only, one message per family and color set) about the
 * literal data colors under `root` (the component root) that fail 3:1
 * against the plot surface.
 * Call from an effect or a ref callback, behind an inline
 * `process.env.NODE_ENV !== 'production'` test.
 */
export function warnLowContrastDataColors(root: Element | null | undefined): void {
  if (!root?.isConnected) return;
  const view = root.ownerDocument.defaultView;
  if (!view) return;
  // The family class names the component in the message (`salmon-heat-map`, `salmon-sparkline`).
  const family = [...root.classList].find((c) => c !== 'salmon-viz' && c.startsWith('salmon-')) ?? 'salmon-viz';
  let surface = '#ffffff';
  const host = root instanceof view.HTMLElement ? root : root.parentElement;
  if (host && view.getComputedStyle(host).getPropertyValue('--salmon-surface-base').trim()) {
    const probe = root.ownerDocument.createElement('span');
    probe.style.color = 'var(--salmon-surface-base)';
    host.appendChild(probe);
    surface = hexOf(view.getComputedStyle(probe).color) ?? surface;
    probe.remove();
  }
  const low = dataColorsOf(root).filter((color) => !dataColorContrastOk(color, surface));
  if (low.length) {
    const list = low.join(', ');
    warnOnce(`data-color:${family}:${list}`, `${family}: the data colors ${list} have less than 3:1 contrast against the plot surface (${surface}); data colors are used as given.`);
  }
}
