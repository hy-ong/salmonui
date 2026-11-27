'use client';

import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';
import type { SalmonColorScheme } from '@salmonui/core/theme';

/** localStorage key of an explicit scheme choice. */
export const SCHEME_STORAGE_KEY = 'salmonui-site-scheme';

const SchemeContext = createContext<{ scheme: SalmonColorScheme; setScheme: (scheme: SalmonColorScheme) => void }>({
  scheme: 'auto',
  setScheme: () => {},
});

function readStoredScheme(): SalmonColorScheme {
  try {
    const value = window.localStorage.getItem(SCHEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'auto';
  } catch {
    return 'auto';
  }
}

function storeScheme(scheme: SalmonColorScheme): void {
  try {
    if (scheme === 'auto') window.localStorage.removeItem(SCHEME_STORAGE_KEY);
    else window.localStorage.setItem(SCHEME_STORAGE_KEY, scheme);
  } catch {
    // Storage unavailable (private mode, blocked): the choice lasts for this page only.
  }
}

/**
 * Site theme scope: the same `salmon-theme-scope` element `ThemeProvider`
 * renders (`data-salmon-theme` = the site theme's hash, from
 * `getThemeHash` on the server; `data-salmon-color-scheme` only for an
 * explicit light or dark), without shipping `ThemeProvider` and the theme
 * derivation to the browser: the CSS comes from the layout's server
 * `ThemeStyle`, and nothing on the site reads the theme context. The scheme starts at `auto` on the server and in the
 * first client render (no stored preference is read during render), so
 * hydration matches; a stored choice is applied in an effect after
 * hydration. There is no pre-hydration script, so a brief flash from `auto`
 * to the stored scheme on load is accepted.
 */
export function SiteTheme({ themeHash, children }: { themeHash: string; children: ReactNode }) {
  const [scheme, setSchemeState] = useState<SalmonColorScheme>('auto');
  useEffect(() => {
    const stored = readStoredScheme();
    if (stored !== 'auto') setSchemeState(stored);
  }, []);
  const setScheme = useCallback((next: SalmonColorScheme) => {
    setSchemeState(next);
    storeScheme(next);
  }, []);
  return (
    <SchemeContext value={{ scheme, setScheme }}>
      <div className="salmon-theme-scope site" data-salmon-theme={themeHash} data-salmon-color-scheme={scheme === 'auto' ? undefined : scheme}>
        {children}
      </div>
    </SchemeContext>
  );
}

export function SchemeSelect() {
  const { scheme, setScheme } = use(SchemeContext);
  return (
    <label className="site-scheme">
      <span>Color scheme</span>
      <select value={scheme} onChange={(event) => setScheme(event.target.value as SalmonColorScheme)}>
        <option value="auto">Auto</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
