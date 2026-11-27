// A theme scope: the color theme of `derive.ts`
// plus the scope settings that only the scope CSS and `ThemeProvider` need,
// density and surfaces. Unset settings keep the color theme's hash, so the
// default scope hash is unchanged. Pure and deterministic.

import { parseHex, toHex } from './color.js';
import { hashString, resolveTheme, type ResolvedTheme, type SalmonDensity, type SalmonThemeInput, type SurfaceName } from './derive.js';

export interface ScopeTheme extends ResolvedTheme {
  /** The density the scope sets; `undefined` inherits. */
  readonly density: SalmonDensity | undefined;
  /** Normalized surface seeds (`#rrggbb`) the scope sets. */
  readonly surfaces: Readonly<Partial<Record<SurfaceName, string>>>;
}

export const SURFACES: readonly SurfaceName[] = ['sidebar', 'appBar', 'tableHeader'];

// Pure memo cache keyed by input value (same input, same output), bounded.
const cache = new Map<string, ScopeTheme>();

/** Resolves a theme input into its scope: the color theme plus density and surfaces; equal inputs, identical result. */
export function resolveScope(input?: SalmonThemeInput): ScopeTheme {
  const base = resolveTheme(input);
  const d = input?.density;
  const density = d === 'compact' || d === 'default' ? d : undefined;
  const raw = input?.surfaces;
  const key = `${base.hash}|${base.colorScheme}|${base.invalid}|${density}|${raw && SURFACES.map((name) => raw[name])}`;
  let scope = cache.get(key);
  if (!scope) {
    const surfaces: Partial<Record<SurfaceName, string>> = {};
    const invalid = [...base.invalid];
    let suffix = density ?? '';
    for (const name of SURFACES) {
      const value = raw?.[name];
      if (value === undefined) continue;
      const rgb = parseHex(value === 'primary' ? base.colors.primary : value);
      if (rgb) suffix += name + (surfaces[name] = toHex(rgb));
      else invalid.push(`surfaces.${name}`);
    }
    if (cache.size >= 64) cache.clear();
    cache.set(key, (scope = { ...base, hash: suffix ? `${base.hash}-${hashString(suffix)}` : base.hash, density, surfaces, invalid }));
  }
  return scope;
}
