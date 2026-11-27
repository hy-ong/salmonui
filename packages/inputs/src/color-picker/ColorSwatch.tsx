import type { CSSProperties, ReactNode } from 'react';
import { cx } from '../internal/field/field.js';
import { colorName, toColor, type Color, type ColorInput } from './color.js';

export interface ColorSwatchProps {
  /** The color; `null` draws the "no color" swatch. */
  readonly color: ColorInput | null;
  /** Accessible name; default the color's description (`'dark vibrant green'`) or `'No color'`. Pass `''` to make it decorative. */
  readonly 'aria-label'?: string | undefined;
  /** Replaces the English description when no `aria-label` is given. */
  readonly colorName?: ((color: Color) => string) | undefined;
  readonly id?: string | undefined;
  readonly className?: string | undefined;
  readonly style?: CSSProperties | undefined;
}

/**
 * A color preview: `role="img"` named by the color, the
 * color over a checkerboard so alpha shows, or a struck-through box for no
 * color. Pure markup, server rendered.
 */
export function ColorSwatch(props: ColorSwatchProps): ReactNode {
  const color = toColor(props.color);
  const label = props['aria-label'] ?? (color ? (props.colorName ?? colorName)(color) : 'No color');
  return (
    <span
      id={props.id}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      className={cx('salmon-color-swatch', props.className)}
      data-empty={color ? undefined : ''}
      style={color ? ({ '--salmon-color-swatch-color': color.toString('rgb'), ...props.style } as CSSProperties) : props.style}
    />
  );
}
