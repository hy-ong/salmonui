// Finetune and filter presets as CSS filter operations:
// pure, no DOM. The same op list drives Canvas 2D `ctx.filter` and the pixel
// fallback (`pixels.ts`) where `ctx.filter` is missing.

import type { ImageEditorAdjustments, ImageEditorFilter } from './types.js';

export type FilterFn = 'brightness' | 'contrast' | 'saturate' | 'hue-rotate' | 'sepia' | 'grayscale' | 'invert' | 'opacity' | 'blur';
export interface FilterOp {
  readonly fn: FilterFn;
  /** Amount as CSS takes it: a factor, degrees for `hue-rotate`, pixels for `blur`. */
  readonly v: number;
}

export const IMAGE_EDITOR_FILTERS: readonly ImageEditorFilter[] = ['default', 'chrome', 'cold', 'warm', 'grayscale', 'sepia', 'invert'];

/** Preset definitions (CSS filter functions, applied before the finetune values). */
export const FILTER_PRESETS: Readonly<Record<ImageEditorFilter, readonly FilterOp[]>> = {
  default: [],
  chrome: [
    { fn: 'contrast', v: 1.2 },
    { fn: 'saturate', v: 1.4 },
  ],
  cold: [
    { fn: 'sepia', v: 0.25 },
    { fn: 'hue-rotate', v: 170 },
    { fn: 'saturate', v: 1.2 },
  ],
  warm: [
    { fn: 'sepia', v: 0.35 },
    { fn: 'saturate', v: 1.3 },
    { fn: 'brightness', v: 1.05 },
  ],
  grayscale: [{ fn: 'grayscale', v: 1 }],
  sepia: [{ fn: 'sepia', v: 1 }],
  invert: [{ fn: 'invert', v: 1 }],
};

const clamp = (v: number, min: number, max: number): number => (v < min ? min : v > max ? max : v);

/** The op list of a preset plus the finetune values; neutral values add nothing. Blur comes last. */
export function filterOps(adjustments: ImageEditorAdjustments, filter: ImageEditorFilter, blurScale = 1): FilterOp[] {
  const ops: FilterOp[] = [...(FILTER_PRESETS[filter] ?? [])];
  const a = adjustments;
  const add = (fn: FilterFn, v: number, neutral: number): void => {
    if (Number.isFinite(v) && Math.abs(v - neutral) > 1e-6) ops.push({ fn, v });
  };
  add('brightness', 1 + clamp(a.brightness ?? 0, -100, 100) / 100, 1);
  add('brightness', Math.pow(2, clamp(a.exposure ?? 0, -100, 100) / 100), 1);
  add('contrast', 1 + clamp(a.contrast ?? 0, -100, 100) / 100, 1);
  add('saturate', 1 + clamp(a.saturation ?? 0, -100, 100) / 100, 1);
  add('hue-rotate', clamp(a.hue ?? 0, -180, 180), 0);
  add('opacity', clamp(a.opacity ?? 100, 0, 100) / 100, 1);
  add('blur', clamp(a.blur ?? 0, 0, 20) * blurScale, 0);
  return ops;
}

const UNIT: Readonly<Partial<Record<FilterFn, string>>> = { 'hue-rotate': 'deg', blur: 'px' };

/** The `ctx.filter` string of an op list (`'none'` when empty). */
export function cssFilter(ops: readonly FilterOp[]): string {
  if (!ops.length) return 'none';
  return ops.map((o) => `${o.fn}(${Math.round(o.v * 1000) / 1000}${UNIT[o.fn] ?? ''})`).join(' ');
}

/** True when every value is neutral. */
export const isNeutral = (adjustments: ImageEditorAdjustments, filter: ImageEditorFilter): boolean => filterOps(adjustments, filter).length === 0;
