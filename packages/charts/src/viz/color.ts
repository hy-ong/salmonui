// Visualization colors: CSS references to
// the `--salmon-chart-*` roles that `styles/viz.css` derives (the JS
// formula lives in `palette.ts`) and the data-color contrast check. Marks carry `var(...)` strings so SVG takes colors from CSS and
// the canvas layer resolves them once per theme change.

import { contrastRatio, parseHex, type Rgb } from '@salmonui/core/internal/theme/color';


export const PALETTE_SIZE = 10;

/** `var(--salmon-chart-N)` for a zero-based slot (wraps after ten). */
export function paletteColor(slot: number): string {
  return `var(--salmon-chart-${(((slot % PALETTE_SIZE) + PALETTE_SIZE) % PALETTE_SIZE) + 1})`;
}

/** A color from a custom `palette` of data colors, else the derived palette. */
export function seriesColor(slot: number, palette?: readonly string[] | undefined): string {
  if (palette && palette.length > 0) return palette[slot % palette.length] as string;
  return paletteColor(slot);
}

/** `var(--salmon-chart-sequential-N)` for t in [0, 1]. */
export function sequentialColor(t: number): string {
  const i = Math.round(Math.min(1, Math.max(0, t)) * 8) + 1;
  return `var(--salmon-chart-sequential-${i})`;
}

/** `var(--salmon-chart-diverging-N)` for t in [-1, 1]. */
export function divergingColor(t: number): string {
  const i = Math.round((Math.min(1, Math.max(-1, t)) + 1) * 5) + 1;
  return `var(--salmon-chart-diverging-${i})`;
}

/** Semantic encodings (candles, waterfall, sparkline highs and lows, chrome). */
export const SEMANTIC = {
  up: 'var(--salmon-color-success)',
  down: 'var(--salmon-color-danger)',
  accent: 'var(--salmon-color-primary)',
  neutral: 'var(--salmon-text-secondary)',
  grid: 'var(--salmon-border-subtle)',
  axis: 'var(--salmon-border-default)',
  text: 'var(--salmon-text-secondary)',
  surface: 'var(--salmon-surface-base)',
} as const;

/**
 * Development check for a data color: false when the hex fails 3:1
 * against the surface hex. Non-hex values (CSS variables, names) pass.
 */
export function dataColorContrastOk(color: string, surfaceHex: string): boolean {
  const c = parseHex(color);
  const s = parseHex(surfaceHex);
  if (!c || !s) return true;
  return contrastRatio(c as Rgb, s as Rgb) >= 3;
}

/** Linear interpolation between two hex colors (color scales of data colors). */
export function mixHex(a: string, b: string, t: number): string {
  const p = parseHex(a);
  const q = parseHex(b);
  if (!p || !q) return t < 0.5 ? a : b;
  const k = Math.min(1, Math.max(0, t));
  const ch = (i: 0 | 1 | 2) =>
    Math.round(((p[i] as number) + ((q[i] as number) - (p[i] as number)) * k) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${ch(0)}${ch(1)}${ch(2)}`;
}

/** Color of `value` on a multi-stop scale of data colors. */
export function colorScale(stops: readonly { readonly value: number; readonly color: string }[], value: number): string {
  if (stops.length === 0) return paletteColor(0);
  const sorted = [...stops].sort((x, y) => x.value - y.value);
  const first = sorted[0] as { value: number; color: string };
  if (value <= first.value) return first.color;
  for (let i = 1; i < sorted.length; i++) {
    const hi = sorted[i] as { value: number; color: string };
    const lo = sorted[i - 1] as { value: number; color: string };
    if (value <= hi.value) return mixHex(lo.color, hi.color, (value - lo.value) / (hi.value - lo.value || 1));
  }
  return (sorted[sorted.length - 1] as { color: string }).color;
}
