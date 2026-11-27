// Theme derivation: five semantic seeds plus a
// color scheme produce tonal scales in OKLCH, a neutral ramp tinted toward
// the primary hue (or the `neutral` tint), and per-scheme role assignments
// that satisfy the documented contrast guarantees. Density and surfaces are
// scope settings resolved by `scope.ts`, so consumers of the color tokens
// alone (the chart server renderer) do not carry them. Pure, deterministic,
// cached by input hash.

import { contrastRatio, gamutMap, parseHex, rgbToOklch, toHex, type Rgb } from './color.js';

export type SalmonColorScheme = 'light' | 'dark' | 'auto';

/** Opaque CSS hex color: `#rgb` or `#rrggbb`. */
export type SalmonHexColor = `#${string}`;

/** Control and row metrics. */
export type SalmonDensity = 'default' | 'compact';

/** A surface seed: a hex color, or `'primary'` for the resolved primary seed. */
export type SalmonSurfaceColor = SalmonHexColor | 'primary';

export interface SalmonThemeInput {
  colors?: {
    primary?: SalmonHexColor;
    success?: SalmonHexColor;
    warning?: SalmonHexColor;
    danger?: SalmonHexColor;
    info?: SalmonHexColor;
  };
  /** `inherit` follows a `data-salmon-color-scheme` attribute set by the host on an ancestor. */
  colorScheme?: SalmonColorScheme | 'inherit';
  /** Control and row metrics. Unset: inherited from the enclosing scope (`'default'` at the root). */
  density?: SalmonDensity;
  /** CSS `font-family` list for `--salmon-font-sans`. Unset: inherited (the system stack at the root). */
  fontFamily?: string;
  /** Tint of the neutral ramp: OKLCH hue in degrees (default: the primary hue) and chroma (clamped to [0, 0.04]). */
  neutral?: { hue?: number; chroma?: number };
  /** Region surfaces (`[data-salmon-surface]`). Unset: inherited from the enclosing scope. */
  surfaces?: { sidebar?: SalmonSurfaceColor; appBar?: SalmonSurfaceColor; tableHeader?: SalmonSurfaceColor };
}

export type SurfaceName = keyof NonNullable<SalmonThemeInput['surfaces']>;

export const SEMANTIC_COLORS = ['primary', 'success', 'warning', 'danger', 'info'] as const;
export type SemanticColor = (typeof SEMANTIC_COLORS)[number];

export const defaultSalmonTheme: {
  readonly colors: Readonly<Record<SemanticColor, SalmonHexColor>>;
  readonly colorScheme: SalmonColorScheme;
} = Object.freeze({
  colors: Object.freeze({
    primary: '#2563eb',
    success: '#16a34a',
    warning: '#d97706',
    danger: '#dc2626',
    info: '#0891b2',
  }),
  colorScheme: 'auto',
});

export type ThemeTokens = Readonly<Record<`--salmon-${string}`, string>>;

export interface ResolvedTheme {
  /** Stable hash of the normalized seeds; the value of `data-salmon-theme`. */
  readonly hash: string;
  readonly colors: Readonly<Record<SemanticColor, string>>;
  readonly colorScheme: SalmonColorScheme | 'inherit';
  /** The valid `fontFamily` of the input, if any (`fixed.ts` turns it into `--salmon-font-sans`). */
  readonly font: string | undefined;
  readonly light: ThemeTokens;
  readonly dark: ThemeTokens;
  readonly lightContrast: ThemeTokens;
  readonly darkContrast: ThemeTokens;
  /** Seeds and `fontFamily` that were rejected (development warning). */
  readonly invalid: readonly string[];
}

// ---------------------------------------------------------------------------
// Scales
// ---------------------------------------------------------------------------

export const SCALE_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
const SCALE_LIGHTNESS = [0.975, 0.94, 0.885, 0.81, 0.72, 0.635, 0.55, 0.47, 0.395, 0.32, 0.255];
const SCALE_CHROMA = [0.12, 0.26, 0.5, 0.75, 0.92, 1, 1, 0.94, 0.84, 0.72, 0.6];

export const NEUTRAL_STEPS = [0, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950, 1000] as const;
const NEUTRAL_LIGHTNESS = [1, 0.985, 0.968, 0.922, 0.87, 0.708, 0.556, 0.45, 0.371, 0.269, 0.205, 0.165, 0.11];
const NEUTRAL_MAX_CHROMA = 0.005;

interface Swatch {
  readonly hex: string;
  readonly rgb: Rgb;
}

function swatch(rgb: Rgb): Swatch {
  const hex = toHex(rgb);
  return { hex, rgb: parseHex(hex) as Rgb };
}

interface Scale {
  readonly steps: readonly Swatch[];
  /** Index of the step the seed snapped to. */
  readonly seedIndex: number;
}

function buildScale(seedHex: string): Scale {
  const seedRgb = parseHex(seedHex) as Rgb;
  const seed = rgbToOklch(seedRgb);
  let seedIndex = 0;
  for (let i = 1; i < SCALE_LIGHTNESS.length; i++) {
    if (Math.abs((SCALE_LIGHTNESS[i] as number) - seed.l) < Math.abs((SCALE_LIGHTNESS[seedIndex] as number) - seed.l)) seedIndex = i;
  }
  const steps = SCALE_LIGHTNESS.map((l, i) =>
    i === seedIndex ? swatch(seedRgb) : swatch(gamutMap({ l, c: seed.c * (SCALE_CHROMA[i] as number), h: seed.h })),
  );
  return { steps, seedIndex };
}

/**
 * The neutral ramp. Untinted: chroma 0.005 toward the primary hue except at
 * the white and black ends. Tinted: `chroma * 4L(1 - L)` per step, peaking
 * in the mid tones; the white end stays white.
 */
function buildNeutral(primaryHex: string, tint: { readonly hue: number | undefined; readonly chroma: number } | null): readonly Swatch[] {
  const hue = tint?.hue ?? rgbToOklch(parseHex(primaryHex) as Rgb).h;
  return NEUTRAL_LIGHTNESS.map((l, i) => {
    const c = tint ? (i ? tint.chroma * 4 * l * (1 - l) : 0) : i === 0 || i === NEUTRAL_LIGHTNESS.length - 1 ? 0 : NEUTRAL_MAX_CHROMA;
    return swatch(gamutMap({ l, c, h: hue }));
  });
}

/** `neutral` as a tint (chroma clamped to [0, 0.04]), or null for the untinted ramp. */
function neutralTint(input: SalmonThemeInput['neutral']): { hue: number | undefined; chroma: number } | null {
  const hue = input?.hue;
  const chroma = input?.chroma;
  if (!Number.isFinite(hue) && !Number.isFinite(chroma)) return null;
  return { hue: Number.isFinite(hue) ? (((hue as number) % 360) + 360) % 360 : undefined, chroma: Number.isFinite(chroma) ? Math.min(0.04, Math.max(0, chroma as number)) : NEUTRAL_MAX_CHROMA };
}

// ---------------------------------------------------------------------------
// Role pickers
// ---------------------------------------------------------------------------

const minContrast = (color: Swatch, backgrounds: readonly Swatch[]): number =>
  backgrounds.reduce((min, bg) => Math.min(min, contrastRatio(color.rgb, bg.rgb)), Number.POSITIVE_INFINITY);

/** First swatch in `order` meeting `ratio` against every background; the best one otherwise. */
function pick(candidates: readonly Swatch[], order: readonly number[], backgrounds: readonly Swatch[], ratio: number): Swatch {
  let best = candidates[order[0] as number] as Swatch;
  let bestRatio = 0;
  for (const i of order) {
    const c = candidates[i] as Swatch;
    const r = minContrast(c, backgrounds);
    if (r >= ratio) return c;
    if (r > bestRatio) {
      best = c;
      bestRatio = r;
    }
  }
  return best;
}

const range = (from: number, to: number): number[] => {
  const out: number[] = [];
  const step = from <= to ? 1 : -1;
  for (let i = from; step > 0 ? i <= to : i >= to; i += step) out.push(i);
  return out;
};

const BLACK = swatch([0, 0, 0]);
const WHITE = swatch([1, 1, 1]);

/** Filled background plus its black or white foreground (>= 4.5:1); shifts the step, never the seed. */
function pickFill(scale: Scale, start: number, preferDarker: boolean): { fill: Swatch; on: Swatch; index: number } {
  const n = scale.steps.length;
  const order: number[] = [start];
  for (let d = 1; d < n; d++) {
    const a = preferDarker ? start + d : start - d;
    const b = preferDarker ? start - d : start + d;
    if (a >= 0 && a < n) order.push(a);
    if (b >= 0 && b < n) order.push(b);
  }
  for (const i of order) {
    const fill = scale.steps[i] as Swatch;
    const w = contrastRatio(WHITE.rgb, fill.rgb);
    const k = contrastRatio(BLACK.rgb, fill.rgb);
    if (w >= 4.5 || k >= 4.5) return { fill, on: w >= k ? WHITE : BLACK, index: i };
  }
  const fill = scale.steps[start] as Swatch;
  return { fill, on: contrastRatio(WHITE.rgb, fill.rgb) >= contrastRatio(BLACK.rgb, fill.rgb) ? WHITE : BLACK, index: start };
}

const clampIndex = (i: number): number => Math.min(SCALE_STEPS.length - 1, Math.max(0, i));

interface SchemeSurfaces {
  readonly base: Swatch;
  readonly raised: Swatch;
  readonly overlay: Swatch;
  readonly sunken: Swatch;
  readonly header: Swatch;
  readonly hover: Swatch;
  readonly disabled: Swatch;
}

type Tokens = Record<`--salmon-${string}`, string>;

function semanticTokens(
  name: SemanticColor,
  scale: Scale,
  dark: boolean,
  surfaces: SchemeSurfaces,
  tokens: Tokens,
  contrast: Tokens,
): { selected: Swatch; selectedHover: Swatch; strong: Swatch } {
  const steps = scale.steps;
  const textBackgrounds = [surfaces.base, surfaces.raised, surfaces.overlay, surfaces.header];
  const start = dark ? Math.min(Math.max(scale.seedIndex - 1, 3), 5) : scale.seedIndex;
  const { fill, on, index } = pickFill(scale, start, !dark);
  const hover = steps[clampIndex(dark ? index - 1 : index + 1)] as Swatch;
  const active = steps[clampIndex(dark ? index - 2 : index + 2)] as Swatch;
  const subtle = steps[dark ? 10 : 0] as Swatch;
  const subtleHover = steps[dark ? 9 : 1] as Swatch;
  const boundaryOrder = dark ? range(6, 0) : range(4, 10);
  const border = pick(steps, boundaryOrder, [...textBackgrounds, subtle], 3);
  const textOrder = dark ? range(4, 0) : range(6, 10);
  const text = pick(steps, textOrder, [...textBackgrounds, subtle], 4.5);
  const textMore = pick(steps, textOrder, [...textBackgrounds, subtle], 7);
  const p = `--salmon-color-${name}` as const;
  tokens[p] = fill.hex;
  tokens[`${p}-hover`] = hover.hex;
  tokens[`${p}-active`] = active.hex;
  tokens[`${p}-subtle`] = subtle.hex;
  tokens[`${p}-subtle-hover`] = subtleHover.hex;
  tokens[`${p}-border`] = border.hex;
  tokens[`${p}-text`] = text.hex;
  tokens[`${p}-on`] = on.hex;
  contrast[`${p}-text`] = textMore.hex;
  contrast[`${p}-border`] = text.hex;
  return { selected: subtle, selectedHover: subtleHover, strong: border };
}


function schemeTokens(scales: Readonly<Record<SemanticColor, Scale>>, neutral: readonly Swatch[], dark: boolean): { tokens: Tokens; contrast: Tokens } {
  const n = (step: (typeof NEUTRAL_STEPS)[number]) => neutral[NEUTRAL_STEPS.indexOf(step)] as Swatch;
  const surfaces: SchemeSurfaces = dark
    ? { base: n(950), raised: n(900), overlay: n(800), sunken: n(1000), header: n(800), hover: n(800), disabled: n(800) }
    : { base: n(0), raised: n(0), overlay: n(0), sunken: n(100), header: n(50), hover: n(50), disabled: n(100) };
  const tokens: Tokens = {};
  const contrast: Tokens = {};
  const results = {} as Record<SemanticColor, ReturnType<typeof semanticTokens>>;
  for (const name of SEMANTIC_COLORS) results[name] = semanticTokens(name, scales[name], dark, surfaces, tokens, contrast);

  const all = [surfaces.base, surfaces.raised, surfaces.overlay, surfaces.header, surfaces.hover];
  const primary = results.primary;
  const surfaceBackgrounds = [...all, primary.selected, primary.selectedHover];
  // Neutral indices from the surface side toward the text side.
  const towardText = dark ? range(6, 0) : range(5, 12);

  tokens['--salmon-surface-base'] = surfaces.base.hex;
  tokens['--salmon-surface-raised'] = surfaces.raised.hex;
  tokens['--salmon-surface-overlay'] = surfaces.overlay.hex;
  tokens['--salmon-surface-sunken'] = surfaces.sunken.hex;
  tokens['--salmon-surface-header'] = surfaces.header.hex;
  tokens['--salmon-surface-hover'] = surfaces.hover.hex;
  tokens['--salmon-surface-selected'] = primary.selected.hex;
  tokens['--salmon-surface-selected-hover'] = primary.selectedHover.hex;
  tokens['--salmon-surface-disabled'] = surfaces.disabled.hex;
  tokens['--salmon-surface-backdrop'] = dark ? 'rgb(0 0 0 / 0.6)' : 'rgb(0 0 0 / 0.4)';

  const borderDefault = pick(neutral, towardText, all, 3);
  const borderStrong = pick(neutral, towardText, all, 4.5);
  tokens['--salmon-border-default'] = borderDefault.hex;
  tokens['--salmon-border-subtle'] = n(dark ? 700 : 200).hex;
  tokens['--salmon-border-strong'] = borderStrong.hex;
  tokens['--salmon-border-selected'] = primary.strong.hex;

  const textPrimary = pick(neutral, dark ? range(1, 0) : range(10, 12), surfaceBackgrounds, 7);
  tokens['--salmon-text-primary'] = textPrimary.hex;
  tokens['--salmon-text-secondary'] = pick(neutral, towardText, surfaceBackgrounds, 4.5).hex;
  tokens['--salmon-text-placeholder'] = pick(neutral, towardText, all, 4.5).hex;
  tokens['--salmon-text-disabled'] = n(dark ? 600 : 400).hex;
  tokens['--salmon-text-link'] = tokens['--salmon-color-primary-text'] as string;
  tokens['--salmon-text-inverse'] = (dark ? n(950) : n(0)).hex;

  tokens['--salmon-state-focus-ring'] = primary.strong.hex;
  tokens['--salmon-state-invalid'] = tokens['--salmon-color-danger-text'] as string;
  tokens['--salmon-state-drag-indicator'] = primary.strong.hex;

  const shadow = dark ? '0 0 0' : '15 23 42';
  tokens['--salmon-shadow-sm'] = `0 1px 2px rgb(${shadow} / ${dark ? 0.5 : 0.06})`;
  tokens['--salmon-shadow-md'] = `0 4px 12px rgb(${shadow} / ${dark ? 0.55 : 0.1})`;
  tokens['--salmon-shadow-lg'] = `0 12px 32px rgb(${shadow} / ${dark ? 0.6 : 0.16})`;
  tokens['--salmon-shadow-pinned'] = `rgb(${shadow} / ${dark ? 0.55 : 0.14})`;

  contrast['--salmon-text-secondary'] = pick(neutral, towardText, surfaceBackgrounds, 7).hex;
  contrast['--salmon-text-placeholder'] = pick(neutral, towardText, all, 7).hex;
  contrast['--salmon-border-subtle'] = borderDefault.hex;
  contrast['--salmon-border-default'] = borderStrong.hex;
  contrast['--salmon-border-strong'] = textPrimary.hex;
  contrast['--salmon-state-focus-ring-width'] = '3px';
  return { tokens, contrast };
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/** FNV-1a 32-bit, base36. Deterministic across runtimes. */
export function hashString(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/** Normalizes seeds to lowercase `#rrggbb`; invalid seeds fall back to the defaults. */
export function normalizeColors(input: SalmonThemeInput | undefined): { colors: Record<SemanticColor, string>; invalid: SemanticColor[] } {
  const colors = {} as Record<SemanticColor, string>;
  const invalid: SemanticColor[] = [];
  for (const name of SEMANTIC_COLORS) {
    const raw = input?.colors?.[name];
    const rgb = raw === undefined ? null : parseHex(raw);
    if (raw !== undefined && rgb === null) invalid.push(name);
    colors[name] = rgb ? toHex(rgb) : defaultSalmonTheme.colors[name];
  }
  return { colors, invalid };
}

// Pure memo caches keyed by input value (same input, same output), bounded.
const cache = new Map<string, Omit<ResolvedTheme, 'colorScheme' | 'invalid'>>();
const resolvedCache = new Map<string, ResolvedTheme>();
const CACHE_LIMIT = 64;

/**
 * Resolves a theme input into its hash and per-scheme CSS variable records.
 * Equal inputs return the identical frozen object. Only the color inputs,
 * the neutral tint and the font family take part; `scope.ts` adds density
 * and surfaces.
 */
export function resolveTheme(input?: SalmonThemeInput): ResolvedTheme {
  const rawKey = `${SEMANTIC_COLORS.map((name) => String(input?.colors?.[name] ?? '')).join(',')}|${input?.colorScheme ?? 'auto'}|${input?.fontFamily}|${input?.neutral?.hue},${input?.neutral?.chroma}`;
  const hit = resolvedCache.get(rawKey);
  if (hit) return hit;
  const resolved = resolveUncached(input);
  if (resolvedCache.size >= CACHE_LIMIT) resolvedCache.clear();
  resolvedCache.set(rawKey, resolved);
  return resolved;
}

function resolveUncached(input: SalmonThemeInput | undefined): ResolvedTheme {
  const { colors, invalid } = normalizeColors(input) as { colors: Record<SemanticColor, string>; invalid: string[] };
  // A `font-family` list: letters, digits, spaces, commas, quotes, dots, hyphens, underscores.
  const font = input?.fontFamily?.trim();
  const fontValid = !!font && /^[\p{L}\p{N} ,'"._-]+$/u.test(font);
  if (input?.fontFamily !== undefined && !fontValid) invalid.push('fontFamily');
  const tint = neutralTint(input?.neutral);
  // Unset settings add nothing to the key, so the default theme keeps its hash.
  const key = SEMANTIC_COLORS.map((name) => colors[name]).join(',') + (fontValid ? `|f${font}` : '') + (tint ? `|n${tint.hue ?? ''},${tint.chroma}` : '');
  let entry = cache.get(key);
  if (!entry) {
    const scales = {} as Record<SemanticColor, Scale>;
    for (const name of SEMANTIC_COLORS) scales[name] = buildScale(colors[name]);
    const neutral = buildNeutral(colors.primary, tint);
    const light = schemeTokens(scales, neutral, false);
    const dark = schemeTokens(scales, neutral, true);
    entry = Object.freeze({
      hash: `h${hashString(key)}`,
      colors: Object.freeze({ ...colors }),
      font: fontValid ? font : undefined,
      light: Object.freeze(light.tokens),
      dark: Object.freeze(dark.tokens),
      lightContrast: Object.freeze(light.contrast),
      darkContrast: Object.freeze(dark.contrast),
    });
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, entry);
  }
  return Object.freeze({ ...entry, colorScheme: input?.colorScheme ?? 'auto', invalid: Object.freeze(invalid) });
}
