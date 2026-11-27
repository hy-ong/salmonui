// Region surfaces: one seed per region derives its
// foreground, muted text, hover, selected and border colors with the WCAG
// guarantees of the theme, plus the role remap of `[data-salmon-surface]`.
// Only the scope CSS (`css.ts`) imports this module, so the color-token
// consumers of `derive.ts` do not carry it. Pure and deterministic.

import { contrastRatio, gamutMap, parseHex, rgbToOklch, toHex, type Rgb } from './color.js';
import type { ResolvedTheme } from './derive.js';

type Tokens = Record<`--salmon-${string}`, string>;

export interface DerivedSurface {
  readonly dark: boolean;
  readonly bg: string;
  readonly fg: string;
  readonly muted: string;
  readonly disabled: string;
  readonly hover: string;
  readonly selected: string;
  readonly selectedHover: string;
  readonly border: string;
  readonly borderStrong: string;
  readonly focus: string;
  /** Primary accents replaced by `fg` (they have under 3:1 against `bg` in a scheme). */
  readonly replacePrimary: boolean;
  readonly link: string;
}

const rgbOf = (hex: string): Rgb => parseHex(hex) as Rgb;
const ratio = (a: string, b: string): number => contrastRatio(rgbOf(a), rgbOf(b));
const passes = (color: string, against: readonly string[], min: number): boolean => against.every((bg) => ratio(color, bg) >= min);

/** Derives the colors of one surface from its seed (`#rrggbb`) and the scope's resolved tokens. */
export function deriveSurface(bg: string, theme: Pick<ResolvedTheme, 'light' | 'dark'>): DerivedSurface {
  const { light, dark: darkTokens } = theme;
  const seed = rgbToOklch(rgbOf(bg));
  const l = seed.l;
  // An achromatic seed (white, gray) takes the hue and a little of the chroma of the scope's tinted neutrals.
  const neutral = rgbToOklch(rgbOf(light['--salmon-text-secondary'] as string));
  const gray = seed.c < 0.005;
  const c = gray ? Math.min(neutral.c / 4, 0.01) : seed.c;
  const h = gray ? neutral.h : seed.h;
  const at = (lightness: number, chroma = c): string => toHex(gamutMap({ l: Math.min(1, Math.max(0, lightness)), c: chroma, h }));
  const dark = ratio(bg, '#ffffff') >= ratio(bg, '#000000');
  // Lightness steps [hover, selected, selected-hover], away from the foreground (darker on a dark seed) unless
  // the last step would pass 0.15 (dark) or 0.98 (light); a dark seed moving toward its foreground takes larger steps.
  const away = dark ? l - 0.13 >= 0.15 : l + 0.11 <= 0.98;
  const steps = dark ? (away ? [0.06, 0.1, 0.13] : [0.06, 0.15, 0.19]) : [0.04, 0.08, 0.11];
  const sign = dark === away ? -1 : 1;
  const [hover, selected, selectedHover] = steps.map((d) => at(l + sign * d)) as [string, string, string];
  // Foreground candidates from the extreme toward the seed, at a low chroma; the last passing one is kept.
  const fc = Math.min(Math.max(c, neutral.c), 0.02);
  const ramp = Array.from({ length: 41 }, (_, i) => at(dark ? 0.995 - (i / 40) * (0.995 - l) : 0.13 + (i / 40) * (l - 0.13), fc));
  const last = (candidates: readonly string[], ok: (color: string) => boolean, fallback: string): string => candidates.reduce((kept, color) => (ok(color) ? color : kept), fallback);
  const fgOk = (color: string): boolean => ratio(color, bg) >= 7 && passes(color, [hover, selected, selectedHover], 4.5);
  const mutedOk = (color: string): boolean => passes(color, [bg, hover], 4.5);
  // A light surface keeps the scope's own text colors when they pass on it.
  const text = light['--salmon-text-primary'] as string;
  const secondary = light['--salmon-text-secondary'] as string;
  const fg = !dark && fgOk(text) ? text : last(ramp.slice(0, 5), fgOk, dark ? '#ffffff' : '#000000');
  const muted = !dark && mutedOk(secondary) ? secondary : last(ramp, mutedOk, fg);
  const bothSchemes = (token: `--salmon-${string}`, against: readonly string[], min: number): boolean =>
    passes(light[token] as string, against, min) && passes(darkTokens[token] as string, against, min);
  return {
    dark,
    bg,
    fg,
    muted,
    // Disabled text sits a third of the way from the seed to the foreground (no contrast requirement).
    disabled: at(l + (dark ? 0.3 : -0.3), fc),
    hover,
    selected,
    selectedHover,
    // Dividers move toward the foreground, so they read as lines on either side of the seed.
    border: at(l + (dark ? 0.1 : -0.1)),
    // The 3:1 boundary roles take the muted text color (4.5:1 against the seed).
    borderStrong: muted,
    focus: bothSchemes('--salmon-state-focus-ring', [bg], 3) ? (light['--salmon-state-focus-ring'] as string) : fg,
    replacePrimary: !bothSchemes('--salmon-color-primary', [bg], 3),
    link: bothSchemes('--salmon-text-link', [bg, hover], 4.5) ? (light['--salmon-text-link'] as string) : fg,
  };
}

/** The documented `--salmon-surface-<name>-*` variables (`name` the attribute value), set on the scope root. */
export function surfaceVariables(name: string, s: DerivedSurface): Tokens {
  const p = `--salmon-surface-${name}` as const;
  return { [`${p}-bg`]: s.bg, [`${p}-fg`]: s.fg, [`${p}-muted`]: s.muted, [`${p}-hover`]: s.hover, [`${p}-selected-bg`]: s.selected, [`${p}-selected-fg`]: s.fg, [`${p}-border`]: s.border };
}

/** The role remap of one `[data-salmon-surface]` subtree. */
export function surfaceRoles(s: DerivedSurface): Tokens {
  const roles: Tokens = {};
  const set = (names: string, value: string): void => {
    for (const name of names.split(' ')) roles[`--salmon-${name}`] = value;
  };
  set('surface-base surface-raised surface-header', s.bg);
  set('surface-sunken surface-hover surface-disabled', s.hover);
  set('surface-selected', s.selected);
  set('surface-selected-hover', s.selectedHover);
  set('text-primary', s.fg);
  set('text-secondary text-placeholder', s.muted);
  set('text-disabled', s.disabled);
  set('text-link', s.link);
  set('border-default border-strong', s.borderStrong);
  set('border-subtle', s.border);
  set('border-selected state-focus-ring', s.focus);
  if (s.replacePrimary) {
    set('color-primary color-primary-hover color-primary-border color-primary-text', s.fg);
    set('color-primary-active', s.muted);
    set('color-primary-on', s.bg);
    set('color-primary-subtle', s.selected);
    set('color-primary-subtle-hover', s.selectedHover);
  }
  return roles;
}
