'use client';

import type { ReactNode } from 'react';
import { ToggleField, type ToggleFieldProps } from '../internal/toggle-field.js';

export type { CheckedChangeDetails } from '../internal/toggle-field.js';
export type { LabelPlacement } from '../internal/toggle-input.js';

export interface SwitchProps extends ToggleFieldProps {
  /** Icon drawn inside the thumb; decorative. */
  readonly thumbIcon?: ReactNode;
}

/**
 * Switch: a native
 * `<input type="checkbox" role="switch">` drawn as a track and thumb,
 * labelled by its children. Space toggles; the checked state is the
 * native one. `ref` is the input; unknown props go to the input,
 * `className` / `style` to the root.
 */
export function Switch(props: SwitchProps): ReactNode {
  const icon = props.thumbIcon;
  return <ToggleField {...props} kind="switch" extra={icon === undefined || icon === null || icon === false ? undefined : <span className="salmon-switch-thumb-icon">{icon}</span>} />;
}
