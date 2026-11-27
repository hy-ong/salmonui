// Server-safe entry: no hooks, effects, browser globals, react-dom/client, or
// CSS imports anywhere in its import graph (tests/server-boundary.test.ts).
import { createThemeCss as createCss } from './internal/theme/css.js';
import type { SalmonThemeInput } from './internal/theme/derive.js';
import { resolveScope } from './internal/theme/scope.js';

export { ThemeStyle } from './internal/theme/ThemeStyle.js';
export type { ThemeStyleProps } from './internal/theme/ThemeStyle.js';
export type { SalmonColorScheme, SalmonDensity, SalmonHexColor, SalmonSurfaceColor, SalmonThemeInput } from './internal/theme/derive.js';

/** Deterministic CSS text for one theme scope (both schemes and `prefers-contrast` overrides). */
export function createThemeCss(theme?: SalmonThemeInput): string {
  return createCss(resolveScope(theme));
}

/** The `data-salmon-theme` hash of a theme; equal seeds always produce the same hash. */
export function getThemeHash(theme?: SalmonThemeInput): string {
  return resolveScope(theme).hash;
}
