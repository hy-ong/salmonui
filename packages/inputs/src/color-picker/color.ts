// Color math of `@salmonui/inputs/color-picker`. Pure, no DOM: parsing of hex, rgb and
// hsl strings, conversion between HSV (the components' working model, so a
// gray keeps its hue while dragging), RGB and HSL, serialization in the four
// value formats and an English color description for `aria-valuetext`.

/** Serialization formats of a color value. */
export type ColorFormat = 'hex' | 'hexa' | 'rgb' | 'hsl';

/** An immutable color. Channels: hue 0-360, saturation / brightness / lightness 0-100, alpha 0-1, rgb 0-255. */
export interface Color {
  /** HSV hue, 0-360. */
  readonly hue: number;
  /** HSV saturation, 0-100. */
  readonly saturation: number;
  /** HSV brightness (value), 0-100. */
  readonly brightness: number;
  /** Alpha, 0-1. */
  readonly alpha: number;
  toRgb(): { readonly r: number; readonly g: number; readonly b: number; readonly a: number };
  toHsl(): { readonly h: number; readonly s: number; readonly l: number; readonly a: number };
  toHsv(): { readonly h: number; readonly s: number; readonly v: number; readonly a: number };
  /** `'hex'` `#rrggbb`, `'hexa'` `#rrggbbaa` (default), `'rgb'` `rgb()` / `rgba()`, `'hsl'` `hsl()` / `hsla()`. */
  toString(format?: ColorFormat): string;
  /** A copy with some HSV channels or alpha replaced. */
  with(channels: { readonly hue?: number; readonly saturation?: number; readonly brightness?: number; readonly alpha?: number }): Color;
  /** True when both serialize to the same `format` (default `'hexa'`). */
  equals(other: Color | null | undefined, format?: ColorFormat): boolean;
}

const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);
const fixed = (n: number, digits: number): number => Number(n.toFixed(digits));
const byte = (n: number): string => Math.round(n).toString(16).padStart(2, '0');

class HsvColor implements Color {
  readonly hue: number;
  readonly saturation: number;
  readonly brightness: number;
  readonly alpha: number;
  constructor(h: number, s: number, v: number, a: number) {
    this.hue = ((h % 360) + 360) % 360 || 0;
    this.saturation = clamp(s, 0, 100) || 0;
    this.brightness = clamp(v, 0, 100) || 0;
    this.alpha = clamp(a, 0, 1);
    if (Number.isNaN(this.alpha)) this.alpha = 1;
  }
  toRgb() {
    const s = this.saturation / 100;
    const v = this.brightness / 100;
    const f = (n: number): number => {
      const k = (n + this.hue / 60) % 6;
      return Math.round((v - v * s * Math.max(0, Math.min(k, 4 - k, 1))) * 255);
    };
    return { r: f(5), g: f(3), b: f(1), a: this.alpha };
  }
  toHsl() {
    const s = this.saturation / 100;
    const v = this.brightness / 100;
    const l = v * (1 - s / 2);
    const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
    return { h: this.hue, s: sl * 100, l: l * 100, a: this.alpha };
  }
  toHsv() {
    return { h: this.hue, s: this.saturation, v: this.brightness, a: this.alpha };
  }
  toString(format: ColorFormat = 'hexa'): string {
    const a = fixed(this.alpha, 3);
    if (format === 'hsl') {
      const { h, s, l } = this.toHsl();
      const body = `${fixed(h, 1)}, ${fixed(s, 1)}%, ${fixed(l, 1)}%`;
      return a < 1 ? `hsla(${body}, ${a})` : `hsl(${body})`;
    }
    const { r, g, b } = this.toRgb();
    if (format === 'rgb') return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
    return `#${byte(r)}${byte(g)}${byte(b)}${format === 'hex' ? '' : byte(this.alpha * 255)}`;
  }
  with(c: { readonly hue?: number; readonly saturation?: number; readonly brightness?: number; readonly alpha?: number }): Color {
    return new HsvColor(c.hue ?? this.hue, c.saturation ?? this.saturation, c.brightness ?? this.brightness, c.alpha ?? this.alpha);
  }
  equals(other: Color | null | undefined, format: ColorFormat = 'hexa'): boolean {
    return !!other && (other === this || other.toString(format) === this.toString(format));
  }
}

/** A color from RGB (0-255) and alpha (0-1). */
export function rgbColor(r: number, g: number, b: number, a = 1): Color {
  r = clamp(r, 0, 255) / 255;
  g = clamp(g, 0, 255) / 255;
  b = clamp(b, 0, 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = 60 * (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4);
  return new HsvColor(h, max ? (d / max) * 100 : 0, max * 100, a);
}

/** A color from HSL (hue 0-360, saturation and lightness 0-100) and alpha. */
export function hslColor(h: number, s: number, l: number, a = 1): Color {
  s = clamp(s, 0, 100) / 100;
  l = clamp(l, 0, 100) / 100;
  const v = l + s * Math.min(l, 1 - l);
  return new HsvColor(h, v ? 2 * (1 - l / v) * 100 : 0, v * 100, a);
}

/** A color from HSV (hue 0-360, saturation and brightness 0-100) and alpha. */
export function hsvColor(h: number, s: number, v: number, a = 1): Color {
  return new HsvColor(h, s, v, a);
}

const HEX = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNC = /^(rgba?|hsla?)\(\s*([^)]*)\)$/i;

/** One numeric component: `50%` scales to `percent`, `deg` / `turn` are angles. */
function num(token: string | undefined, percent: number): number {
  if (token === undefined) return NaN;
  const t = token.toLowerCase();
  if (t.endsWith('%')) return (parseFloat(t) / 100) * percent;
  if (t.endsWith('turn')) return parseFloat(t) * 360;
  if (/[a-z]$/.test(t) && !t.endsWith('deg')) return NaN;
  const n = parseFloat(t);
  return /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?(deg)?$/.test(t) ? n : NaN;
}

/** Parses a color string, or returns null when it is not one. */
export function tryParseColor(value: string): Color | null {
  const text = value.trim();
  if (text.toLowerCase() === 'transparent') return rgbColor(0, 0, 0, 0);
  const hex = HEX.exec(text)?.[1];
  if (hex) {
    const full = hex.length < 5 ? hex.replace(/./g, '$&$&') : hex;
    const n = (i: number): number => parseInt(full.slice(i, i + 2), 16);
    return rgbColor(n(0), n(2), n(4), full.length === 8 ? n(6) / 255 : 1);
  }
  const m = FUNC.exec(text);
  if (!m) return null;
  const parts = (m[2] as string).trim().split(/\s*[\s,/]\s*/);
  if (parts.length < 3 || parts.length > 4) return null;
  const a = parts.length === 4 ? num(parts[3], 1) : 1;
  const rgb = m[1]!.toLowerCase().startsWith('rgb');
  const c = rgb ? [num(parts[0], 255), num(parts[1], 255), num(parts[2], 255)] : [num(parts[0], 360), num(parts[1], 100), num(parts[2], 100)];
  if (c.some(Number.isNaN) || Number.isNaN(a)) return null;
  return rgb ? rgbColor(c[0]!, c[1]!, c[2]!, a) : hslColor(c[0]!, c[1]!, c[2]!, a);
}

/**
 * Parses `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, `rgb()` / `rgba()` and
 * `hsl()` / `hsla()` (comma or space syntax, percentages, `deg`) and
 * `transparent`. Throws a `TypeError` for anything else; use the
 * result's `toString(format)` to convert.
 */
export function parseColor(value: string): Color {
  const color = tryParseColor(value);
  if (!color) throw new TypeError(`Invalid color value: ${value}`);
  return color;
}

/** A value prop of the color components: a color string or a `Color`. */
export type ColorInput = string | Color;

export const isColor = (value: unknown): value is Color => value instanceof HsvColor;

/** `input` as a `Color`, or null when absent or unparseable. */
export function toColor(input: ColorInput | null | undefined): Color | null {
  if (input == null) return null;
  return isColor(input) ? input : tryParseColor(input);
}

const HUES: readonly [number, string][] = [
  [15, 'red'],
  [45, 'orange'],
  [70, 'yellow'],
  [100, 'yellow green'],
  [155, 'green'],
  [190, 'cyan'],
  [250, 'blue'],
  [285, 'purple'],
  [330, 'magenta'],
  [345, 'pink'],
  [361, 'red'],
];

/** The hue's name (`'green'`). */
export function hueName(hue: number): string {
  for (const [end, name] of HUES) if (hue < end) return name;
  return 'red';
}

/**
 * An English description of the color for `aria-valuetext` and swatch names
 * (`'dark vibrant green'`, `'light gray'`, `'transparent'`). Components take
 * `localeText.colorName` to replace it.
 */
export function colorName(color: Color): string {
  if (color.alpha === 0) return 'transparent';
  const { s, l } = color.toHsl();
  const lightness = l < 22 ? 'very dark ' : l < 38 ? 'dark ' : l > 85 ? 'very light ' : l > 65 ? 'light ' : '';
  let name: string;
  if (l < 6) name = 'black';
  else if (l > 97) name = 'white';
  else if (s < 10) name = `${lightness}gray`;
  else {
    const hue = hueName(color.hue);
    const brown = (hue === 'orange' || hue === 'red') && l < 38 && s < 85;
    name = `${lightness}${s < 35 ? 'grayish ' : s > 85 ? 'vibrant ' : ''}${brown ? 'brown' : hue}`;
  }
  return color.alpha < 1 ? `${name}, ${Math.round(color.alpha * 100)}% opaque` : name;
}

/** Writing direction of `el`, read at event time (never during render). */
export const isRtl = (el: Element | null): boolean => !!el && getComputedStyle(el).direction === 'rtl';
