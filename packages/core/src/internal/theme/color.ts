// Color math for the theme derivation: hex <-> sRGB <-> OKLab/OKLCH, sRGB
// gamut mapping by chroma reduction, and WCAG 2 contrast. Pure and
// deterministic: the same input yields the same output on server and client.

export type Rgb = readonly [number, number, number];

export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/** Parses `#rgb` or `#rrggbb` into sRGB channels in [0, 1]; null for anything else. */
export function parseHex(value: unknown): Rgb | null {
  if (typeof value !== 'string' || !HEX.test(value)) return null;
  let hex = value.slice(1);
  if (hex.length === 3) hex = hex.replace(/./g, (ch) => ch + ch);
  const n = Number.parseInt(hex, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function toHex(rgb: Rgb): string {
  let out = '#';
  for (const channel of rgb) {
    const v = Math.round(Math.min(1, Math.max(0, channel)) * 255);
    out += v.toString(16).padStart(2, '0');
  }
  return out;
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

export function rgbToOklch(rgb: Rgb): Oklch {
  const r = toLinear(rgb[0]);
  const g = toLinear(rgb[1]);
  const b = toLinear(rgb[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI;
  if (h < 0) h += 360;
  return { l: L, c, h: c < 1e-6 ? 0 : h };
}

/** OKLCH to (possibly out-of-gamut) sRGB. */
export function oklchToRgbUnclamped(color: Oklch): Rgb {
  const hr = (color.h * Math.PI) / 180;
  const A = color.c * Math.cos(hr);
  const B = color.c * Math.sin(hr);
  const l = (color.l + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (color.l - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (color.l - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const EPS = 1e-4;
function inGamut(rgb: Rgb): boolean {
  return rgb.every((c) => c >= -EPS && c <= 1 + EPS);
}

/** Maps an OKLCH color into sRGB by reducing chroma (hue and lightness kept). */
export function gamutMap(color: Oklch): Rgb {
  const direct = oklchToRgbUnclamped(color);
  if (inGamut(direct)) return direct;
  let lo = 0;
  let hi = color.c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgbUnclamped({ ...color, c: mid }))) lo = mid;
    else hi = mid;
  }
  return oklchToRgbUnclamped({ ...color, c: lo });
}

export function relativeLuminance(rgb: Rgb): number {
  return 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);
}

/** WCAG 2.x contrast ratio between two opaque colors. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
