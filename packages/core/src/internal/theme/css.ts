import type { SalmonThemeInput, ThemeTokens } from './derive.js';
import { SURFACES, resolveScope, type ScopeTheme } from './scope.js';
import { deriveSurface, surfaceRoles, surfaceVariables } from './surfaces.js';

function block(selectors: readonly string[], tokens: ThemeTokens, extra = '', indent = ''): string {
  const body = Object.entries(tokens)
    .map(([name, value]) => `${indent}  ${name}: ${value};`)
    .join('\n');
  return `${indent}${selectors.join(',\n' + indent)} {\n${extra ? `${indent}  ${extra}\n` : ''}${body}\n${indent}}`;
}

/**
 * The density metric sets: variable, `default` px,
 * `compact` px. Component CSS reads these with the `default` values as
 * fallbacks, so only a scope that sets `density` emits them.
 */
const DENSITY: readonly (readonly [string, number, number])[] = [
  ['control-height-sm', 24, 20],
  ['control-height-md', 32, 28],
  ['control-height-lg', 40, 36],
  ['control-padding-sm', 8, 6],
  ['control-padding-md', 12, 10],
  ['control-padding-lg', 16, 14],
  ['font-size-cell', 14, 13],
];

/** `data-salmon-surface` value (and variable infix) per surface. */
const ATTR = { sidebar: 'sidebar', appBar: 'app-bar', tableHeader: 'table-header' } as const;

export interface ThemeCssOptions {
  /** Also apply the theme to `:root` (used by the precompiled default stylesheet). */
  readonly root?: boolean;
  /** Tokens to put first in the light block: the fixed tokens of the precompiled default stylesheet (`fixed.ts`). */
  readonly fixed?: ThemeTokens;
}

/**
 * Deterministic CSS text that sets every `--salmon-*` variable for a theme
 * scope in both schemes, including `prefers-contrast: more` overrides, the
 * density set and the surfaces the scope sets.
 */
export function createThemeCss(input?: SalmonThemeInput | ScopeTheme, options: ThemeCssOptions = {}): string {
  const theme = input && 'hash' in input ? input : resolveScope(input);
  const scope = `[data-salmon-theme="${theme.hash}"]`;
  const bases = options.root ? [':root', scope] : [scope];
  // Explicit dark: on the scope itself, or inherited from a host ancestor when the scope sets no scheme.
  const dark = [
    ...(options.root ? [':root[data-salmon-color-scheme="dark"]'] : []),
    `${scope}[data-salmon-color-scheme="dark"]`,
    `[data-salmon-color-scheme="dark"] ${scope}:not([data-salmon-color-scheme])`,
  ];
  const autoDark = [
    ...(options.root ? [':root:not([data-salmon-color-scheme="light"])'] : []),
    `${scope}:not([data-salmon-color-scheme="light"]):not([data-salmon-color-scheme="light"] *)`,
  ];
  // The fixed tokens come from `:root` (core/styles.css); a scope sets only the font it changes. Font, density
  // and surfaces are scheme-independent: they join the light block (the dark blocks do not reset them) and the
  // surface subtree rules follow the scheme blocks.
  const light: Record<string, string> = { ...options.fixed };
  if (theme.font) light['--salmon-font-sans'] = theme.font;
  if (theme.density) for (const [name, normal, compact] of DENSITY) light[`--salmon-${name}`] = `${theme.density === 'compact' ? compact : normal}px`;
  const rules: string[] = [];
  for (const name of SURFACES) {
    const seed = theme.surfaces[name];
    if (!seed) continue;
    const s = deriveSurface(seed, theme);
    const attr = `[data-salmon-surface="${ATTR[name]}"]`;
    Object.assign(light, surfaceVariables(ATTR[name], s));
    rules.push(block([`${scope}${attr}`, `${scope} ${attr}`], surfaceRoles(s), `color-scheme: ${s.dark ? 'dark' : 'light'};\n  background-color: ${s.bg};\n  color: ${s.fg};`));
  }
  const parts = [
    block(bases, { ...light, ...theme.light }, 'color-scheme: light;'),
    block(dark, theme.dark, 'color-scheme: dark;'),
    `@media (prefers-color-scheme: dark) {\n${block(autoDark, theme.dark, 'color-scheme: dark;', '  ')}\n}`,
    `@media (prefers-contrast: more) {\n${block(bases, theme.lightContrast, '', '  ')}\n${block(dark, theme.darkContrast, '', '  ')}\n}`,
    `@media (prefers-contrast: more) and (prefers-color-scheme: dark) {\n${block(autoDark, theme.darkContrast, '', '  ')}\n}`,
    ...rules,
  ];
  return `${parts.join('\n')}\n`;
}
