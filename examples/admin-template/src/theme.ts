import type { SalmonThemeInput } from '@salmonui/core/theme';

/**
 * The template's theme: the five semantic seeds, compact density, the Inter
 * stack, a neutral ramp tinted toward the primary teal, a near-black sidebar,
 * a white app bar and a primary-colored table header.
 */
export const appTheme: SalmonThemeInput = {
  colors: { primary: '#0e4d5c', success: '#0c8f54', warning: '#d4690b', danger: '#d62f23', info: '#0e4d5c' },
  colorScheme: 'light',
  density: 'compact',
  fontFamily: 'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  neutral: { chroma: 0.032 },
  surfaces: { sidebar: '#192225', appBar: '#ffffff', tableHeader: 'primary' },
};
