'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/inputs/color-picker`: the picker and its
// parts, each usable alone, and the color math. CSS:
// `@salmonui/inputs/color-picker/styles.css`.
export { ColorPicker } from './color-picker/ColorPicker.js';
export type {
  ColorPickerBeforeModeChangeEvent,
  ColorPickerBeforeOpenChangeEvent,
  ColorPickerCancelableEvent,
  ColorPickerChangeDetails,
  ColorPickerLocaleText,
  ColorPickerMode,
  ColorPickerOpenChangeDetails,
  ColorPickerProps,
} from './color-picker/ColorPicker.js';
export { ColorArea } from './color-picker/ColorArea.js';
export type { ColorAreaProps } from './color-picker/ColorArea.js';
export { ColorSlider } from './color-picker/ColorSlider.js';
export type { ColorSliderProps } from './color-picker/ColorSlider.js';
export { ColorField } from './color-picker/ColorField.js';
export type { ColorFieldChangeDetails, ColorFieldProps } from './color-picker/ColorField.js';
export { ColorSwatch } from './color-picker/ColorSwatch.js';
export type { ColorSwatchProps } from './color-picker/ColorSwatch.js';
export { ColorSwatchPicker } from './color-picker/ColorSwatchPicker.js';
export type { ColorSwatchGroup, ColorSwatchItem, ColorSwatchPickerProps, SwatchChangeDetails, SwatchRenderContext } from './color-picker/ColorSwatchPicker.js';
export { colorName, hslColor, hsvColor, parseColor, rgbColor } from './color-picker/color.js';
export type { Color, ColorFormat, ColorInput } from './color-picker/color.js';
export type { ColorChangeDetails, ColorChangeSource, ColorPartLocaleText, ColorPartProps } from './color-picker/control.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/inputs/color-picker', 'salmon-color-picker');
