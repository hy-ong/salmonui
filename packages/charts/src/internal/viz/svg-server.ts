// Server-side SVG of a visualization (`@salmonui/core/server`):
// the drawing of a visualization's server-rendered HTML as standalone SVG
// markup, without a DOM. The markup is the same SVG the component renders
// from its model (and that `api.toSVGString()` returns in the browser); here
// the theme colors are resolved from the theme seeds in JS (the
// `--salmon-*` tokens of `theme/derive.ts`, the `--salmon-chart-*` roles of
// `viz/palette.ts` and the `color-mix()` ramps of `styles/viz.css`) and the
// class-styled chrome (text, grid, axis lines, ticks) gets the stylesheet's
// presentation attributes, so the file renders, prints and converts to PDF
// (`@salmonui/export/graphics`) on its own.

import { gamutMap, parseHex, rgbToOklch, toHex } from '@salmonui/core/internal/theme/color';
import { resolveTheme, type SalmonThemeInput } from '@salmonui/core/internal/theme/derive';
import { fixedTokens } from '@salmonui/core/internal/theme/fixed';
import { categoricalPalette } from '../../viz/palette.js';

export interface VisualizationSvgOptions {
  /** Theme seeds (as `ThemeProvider` / `createThemeCss`). Default: the default theme. */
  readonly theme?: SalmonThemeInput | undefined;
  /** Default `light`. */
  readonly colorScheme?: 'light' | 'dark' | undefined;
}

/** `color-mix(in oklch, a p, b)` of two hex colors. */
function mix(a: string, b: string, p: number): string {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) return a;
  const x = rgbToOklch(ra);
  const y = rgbToOklch(rb);
  // An achromatic end takes the other end's hue (CSS "missing" hue).
  const hx = x.c < 1e-4 ? y.h : x.h;
  const hy = y.c < 1e-4 ? x.h : y.h;
  let d = hy - hx;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return toHex(gamutMap({ l: x.l * p + y.l * (1 - p), c: x.c * p + y.c * (1 - p), h: (((hx + d * (1 - p)) % 360) + 360) % 360 }));
}

function tokensOf(options: VisualizationSvgOptions): Record<string, string> {
  const theme = resolveTheme(options.theme);
  const dark = options.colorScheme === 'dark';
  const t: Record<string, string> = { ...fixedTokens(theme), ...(dark ? theme.dark : theme.light) };
  const at = (name: string): string => t[name] ?? '#000000';
  categoricalPalette(theme.colors, dark).forEach((c, i) => (t[`--salmon-chart-${i + 1}`] = c));
  const primary = theme.colors.primary;
  const danger = theme.colors.danger;
  const base = at('--salmon-surface-base');
  const sunken = at('--salmon-surface-sunken');
  [12, 23, 34, 45, 56, 67, 78, 89, 100].forEach((p, i) => (t[`--salmon-chart-sequential-${i + 1}`] = mix(primary, base, p / 100)));
  [100, 80, 60, 40, 20].forEach((p, i) => (t[`--salmon-chart-diverging-${i + 1}`] = mix(danger, sunken, p / 100)));
  t['--salmon-chart-diverging-6'] = sunken;
  [20, 40, 60, 80, 100].forEach((p, i) => (t[`--salmon-chart-diverging-${i + 7}`] = mix(primary, sunken, p / 100)));
  return t;
}

/** Presentation attributes of the class-styled SVG chrome (`styles/viz.css` "SVG chrome"). */
const CHROME: readonly [RegExp, readonly (readonly [string, string])[]][] = [
  [/(^|\s)salmon-viz-title(\s|$)/, [['fill', 'var(--salmon-text-primary)'], ['font-size', 'var(--salmon-font-size-lg)'], ['font-weight', 'var(--salmon-font-weight-semibold)']]],
  [/(^|\s)salmon-viz-(axis|legend)-title(\s|$)/, [['fill', 'var(--salmon-text-primary)'], ['font-weight', 'var(--salmon-font-weight-medium)']]],
  [/(^|\s)salmon-viz-grid(\s|$)/, [['stroke', 'var(--salmon-border-subtle)'], ['stroke-width', '1'], ['fill', 'none']]],
  [/(^|\s)salmon-viz-(axis-line|tick)(\s|$)/, [['stroke', 'var(--salmon-border-default)'], ['stroke-width', '1'], ['fill', 'none']]],
];

/** The end index (exclusive) of the `<svg>` element starting at `start`, nested `<svg>`s balanced. */
function svgEnd(html: string, start: number): number {
  const re = /<svg[\s>]|<\/svg>/g;
  re.lastIndex = start;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0] === '</svg>' ? -1 : 1;
    if (depth === 0) return m.index + 6;
  }
  return -1;
}

/**
 * Standalone SVG markup of the first visualization in server-rendered HTML
 * (`renderToStaticMarkup(<Chart ... />)`): the drawing of the plot surface
 * (or the root `<svg>` of `Sparkline`, `Barcode` and `QRCode`), with `xmlns`,
 * theme colors resolved and the chrome styled. Empty when there is no SVG.
 */
export function visualizationSvg(html: string, options: VisualizationSvgOptions = {}): string {
  const surface = html.indexOf('salmon-viz-surface');
  const start = html.indexOf('<svg', surface < 0 ? 0 : surface);
  const end = start < 0 ? -1 : svgEnd(html, start);
  if (end < 0) return '';
  let svg = html.slice(start, end);
  const tokens = tokensOf(options);
  // Root text defaults (`.salmon-viz text`), then the chrome classes per element.
  svg = svg.replace(/^<svg/, '<svg font-family="var(--salmon-font-sans)" font-size="var(--salmon-font-size-sm)" fill="var(--salmon-text-secondary)"');
  if (!/^<svg[^>]*\sxmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
  svg = svg.replace(/<(path|line|text|g|rect)(\s[^>]*?)?(\/?)>/g, (tag, name: string, attrs: string | undefined, close: string) => {
    const a = attrs ?? '';
    const cls = /\sclass="([^"]*)"/.exec(a)?.[1];
    if (!cls) return tag;
    let extra = '';
    for (const [re, props] of CHROME) if (re.test(cls)) for (const [k, v] of props) if (!new RegExp(`\\s${k}=|[";]${k}:`).test(a + extra)) extra += ` ${k}="${v}"`;
    return extra ? `<${name}${a}${extra}${close}>` : tag;
  });
  // `var(--salmon-*)` references, nested values and fallbacks resolved from the theme.
  const resolve = (text: string): string => text.replace(/var\(\s*(--salmon-[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (m, name: string, fallback: string | undefined) => (tokens[name] ?? fallback?.trim() ?? m).replace(/"/g, "'"));
  for (let i = 0; i < 4 && svg.includes('var(--salmon-'); i++) svg = resolve(svg);
  return svg;
}
