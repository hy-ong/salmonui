// Visualization color roles. The
// `--salmon-chart-*` variables are derived in CSS (`styles/viz.css`) from the
// theme's semantic colors with relative color syntax, so the theme API stays
// five seeds plus `colorScheme`, no theme input is added, and no byte enters
// the theme or Data Grid bundles. This module is the same formula in JS:
// unit tests prove its guarantees for every hue, and code that needs a
// concrete color (data-color checks, docs) uses it.
//
// - Categorical slots 1..5 take the hues of primary, warning, info, danger
//   and success; slots 6..10 the OKLCH midpoints of consecutive slots
//   (`color-mix(in oklch, a, b)`). Lightness alternates between two fixed
//   values per scheme (odd and even slots), chroma is fixed: every slot meets
//   3:1 against the plot surface for any hue, and adjacent slots differ in
//   lightness, which keeps them apart under protanopia, deuteranopia and
//   tritanopia (lightness survives every simulated deficiency).
// - Sequential 1..9: primary mixed into the surface (12 % .. 100 %).
// - Diverging 1..11: danger, mixed toward the neutral midpoint, then primary.

import { contrastRatio, gamutMap, parseHex, rgbToOklch, toHex, type Rgb } from '@salmonui/core/internal/theme/color';

export interface ChartSeeds {
  readonly primary: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly info: string;
}

/** Fixed OKLCH lightness of odd and even slots, and the chroma, per scheme (mirrors viz.css). */
export const PALETTE_LIGHTNESS = {
  light: { odd: 0.47, even: 0.64, chroma: 0.15 },
  dark: { odd: 0.82, even: 0.62, chroma: 0.13 },
} as const;

/** Slot order of the seed hues (adjacent slots far apart in hue). */
export const PALETTE_SEEDS = ['primary', 'warning', 'info', 'danger', 'success'] as const;

const hueOf = (hex: string): number => rgbToOklch(parseHex(hex) as Rgb).h;

/** Hue of `color-mix(in oklch, a, b)` (shorter arc, as CSS interpolates hues). */
export function midHue(a: number, b: number): number {
  let d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return (((a + d / 2) % 360) + 360) % 360;
}

/** The ten hues of the categorical palette. */
export function paletteHues(seeds: ChartSeeds): number[] {
  const base = PALETTE_SEEDS.map((name) => hueOf(seeds[name]));
  const mids = base.map((h, i) => midHue(h, base[(i + 1) % base.length] as number));
  return [...base, ...mids];
}

/** The ten categorical colors of one scheme as hex (sRGB gamut mapped by chroma reduction). */
export function categoricalPalette(seeds: ChartSeeds, dark: boolean): string[] {
  const spec = dark ? PALETTE_LIGHTNESS.dark : PALETTE_LIGHTNESS.light;
  return paletteHues(seeds).map((h, i) => toHex(gamutMap({ l: i % 2 === 0 ? spec.odd : spec.even, c: spec.chroma, h })));
}

// --- color vision deficiency (Machado et al. 2009, severity 1) -------------

const CVD: readonly (readonly number[])[] = [
  [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
  [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881],
  [1.255528, -0.076749, -0.178779, -0.078411, 0.930809, 0.147602, 0.004733, 0.691367, 0.3039],
];

const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const unlin = (c: number): number => {
  const v = Math.min(1, Math.max(0, c));
  return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
};

/** Simulates protanopia (0), deuteranopia (1) or tritanopia (2). */
export function simulateCvd(rgb: Rgb, kind: 0 | 1 | 2): Rgb {
  const m = CVD[kind] as readonly number[];
  const r = lin(rgb[0]);
  const g = lin(rgb[1]);
  const b = lin(rgb[2]);
  const at = (i: number) => m[i] as number;
  return [unlin(at(0) * r + at(1) * g + at(2) * b), unlin(at(3) * r + at(4) * g + at(5) * b), unlin(at(6) * r + at(7) * g + at(8) * b)];
}

/** Euclidean OKLab distance. */
export function oklabDistance(a: Rgb, b: Rgb): number {
  const p = rgbToOklch(a);
  const q = rgbToOklch(b);
  const rad = Math.PI / 180;
  return Math.hypot(p.l - q.l, p.c * Math.cos(p.h * rad) - q.c * Math.cos(q.h * rad), p.c * Math.sin(p.h * rad) - q.c * Math.sin(q.h * rad));
}

/** Smallest OKLab distance across normal vision and the three simulations. */
export function cvdDistance(a: Rgb, b: Rgb): number {
  let d = oklabDistance(a, b);
  for (const k of [0, 1, 2] as const) d = Math.min(d, oklabDistance(simulateCvd(a, k), simulateCvd(b, k)));
  return d;
}

/** Minimum distance the palette keeps between adjacent slots. */
export const MIN_CVD_DISTANCE = 0.06;

/** Contrast of a hex color against a surface hex (data-color checks). */
export function contrastOf(color: string, surface: string): number {
  const c = parseHex(color);
  const s = parseHex(surface);
  return c && s ? contrastRatio(c, s) : Number.POSITIVE_INFINITY;
}
