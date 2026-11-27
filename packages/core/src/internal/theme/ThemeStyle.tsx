import { createThemeCss } from './css.js';
import type { SalmonThemeInput } from './derive.js';
import { resolveScope } from './scope.js';

export interface ThemeStyleProps {
  theme?: SalmonThemeInput;
  /** CSP nonce forwarded to the `<style>` element. */
  nonce?: string;
}

/**
 * Server-safe theme stylesheet: no hooks, effects, or browser globals. Renders
 * one React 19 hoistable `<style>` (`data-href="salmonui-theme-<hash>"`), which
 * React deduplicates per document and hoists into `<head>`, on the server and
 * on the client alike.
 */
export function ThemeStyle({ theme, nonce }: ThemeStyleProps) {
  const resolved = resolveScope(theme);
  return (
    <style href={`salmonui-theme-${resolved.hash}`} precedence="salmonui" nonce={nonce}>
      {createThemeCss(resolved)}
    </style>
  );
}
