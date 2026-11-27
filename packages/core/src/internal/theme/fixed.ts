// The color-independent theme tokens (spacing, radius, typography, motion,
// focus ring geometry). They are the same for
// every theme, so `@salmonui/core/styles.css` sets them once on `:root` and a
// scope's CSS carries only `--salmon-font-sans` when its theme sets
// `fontFamily`. A separate module so the scope CSS (`@salmonui/core/server`)
// does not carry them; the standalone SVG renderer and the stylesheet
// generator import them.

import type { ResolvedTheme, ThemeTokens } from './derive.js';

export const FIXED_TOKENS: ThemeTokens = Object.freeze({
  '--salmon-state-focus-ring-width': '2px',
  '--salmon-state-focus-ring-offset': '2px',
  '--salmon-space-0': '0',
  '--salmon-space-1': '2px',
  '--salmon-space-2': '4px',
  '--salmon-space-3': '8px',
  '--salmon-space-4': '12px',
  '--salmon-space-5': '16px',
  '--salmon-space-6': '24px',
  '--salmon-space-7': '32px',
  '--salmon-space-8': '48px',
  '--salmon-radius-sm': '4px',
  '--salmon-radius-md': '6px',
  '--salmon-radius-lg': '10px',
  '--salmon-radius-full': '9999px',
  '--salmon-font-sans': 'system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans TC", sans-serif',
  '--salmon-font-mono': 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  '--salmon-font-size-sm': '12px',
  '--salmon-font-size-md': '14px',
  '--salmon-font-size-lg': '16px',
  '--salmon-line-height-tight': '1.25',
  '--salmon-line-height-normal': '1.5',
  '--salmon-font-weight-regular': '400',
  '--salmon-font-weight-medium': '500',
  '--salmon-font-weight-semibold': '600',
  '--salmon-motion-duration-fast': '120ms',
  '--salmon-motion-duration-normal': '200ms',
  '--salmon-motion-easing': 'cubic-bezier(0.2, 0, 0, 1)',
});

/** The fixed tokens of a theme: the system values with its font family, if it sets one. */
export function fixedTokens(theme: Pick<ResolvedTheme, 'font'>): ThemeTokens {
  return theme.font ? { ...FIXED_TOKENS, '--salmon-font-sans': theme.font } : FIXED_TOKENS;
}
