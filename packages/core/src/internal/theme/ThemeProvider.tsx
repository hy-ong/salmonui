'use client';

import { createContext, use, useEffect, type CSSProperties, type ReactNode, type Ref } from 'react';
import { DEV, warnOnce } from '../dev.js';
import { CompactDensityContext } from './density.js';
import type { SalmonThemeInput } from './derive.js';
import { resolveScope, type ScopeTheme } from './scope.js';

const ThemeContext = createContext<ScopeTheme>(resolveScope());

export interface ThemeProviderProps {
  theme?: SalmonThemeInput;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  ref?: Ref<HTMLDivElement>;
}

/**
 * Theme scope root: `<div class="salmon-theme-scope" data-salmon-theme="<hash>">`.
 * Renders no styles itself; the CSS comes from `ThemeStyle` or from the
 * precompiled default stylesheet. No browser APIs during render. A theme
 * that sets `density` also provides it to components with JavaScript
 * metrics (the Data Grid row height); unset inherits the enclosing scope's.
 */
export function ThemeProvider({ theme, children, className, style, ref }: ThemeProviderProps) {
  const resolved = resolveScope(theme);
  const scheme = resolved.colorScheme === 'light' || resolved.colorScheme === 'dark' ? resolved.colorScheme : undefined;
  useEffect(() => {
    if (DEV && resolved.invalid.length) {
      warnOnce(
        `theme-seed:${resolved.invalid.join(',')}`,
        `ThemeProvider: invalid theme value(s) ${resolved.invalid.join(', ')}; color seeds must be opaque #rgb or #rrggbb (surfaces also 'primary'), fontFamily a font-family list. The default is used.`,
      );
    }
  }, [resolved]);
  const scope = (
    <div
      ref={ref}
      className={className ? `salmon-theme-scope ${className}` : 'salmon-theme-scope'}
      style={style}
      data-salmon-theme={resolved.hash}
      data-salmon-color-scheme={scheme}
    >
      {children}
    </div>
  );
  return (
    <ThemeContext value={resolved}>
      {resolved.density ? <CompactDensityContext value={resolved.density === 'compact'}>{scope}</CompactDensityContext> : scope}
    </ThemeContext>
  );
}

/** The resolved theme of the nearest `ThemeProvider` (the default theme outside one). */
export function useTheme(): ScopeTheme {
  return use(ThemeContext);
}
