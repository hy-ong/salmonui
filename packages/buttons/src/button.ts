'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/buttons/button`: Button,
// ToggleButton, ButtonGroup, ToggleButtonGroup. Never imports menu, overlay
// or positioning code.
export { Button } from './button/Button.js';
export type { ButtonAccessibleName, ButtonBaseProps, ButtonFloatingPosition, ButtonProps, ButtonRenderProps } from './button/Button.js';
export type { ButtonRepeatEvent, ButtonRepeatOptions } from './button/context.js';
export type { ButtonSize, ButtonTone, ButtonVariant } from './button/context.js';
export type { ChangeSource as ButtonChangeSource } from './button/context.js';
export { ToggleButton } from './button/ToggleButton.js';
export type { ToggleButtonBaseProps, ToggleButtonProps, ToggleChangeEvent } from './button/ToggleButton.js';
export { ButtonGroup } from './button/ButtonGroup.js';
export type { ButtonGroupProps } from './button/ButtonGroup.js';
export { ToggleButtonGroup } from './button/ToggleButtonGroup.js';
export type { ToggleButtonGroupBaseProps, ToggleButtonGroupMultipleProps, ToggleButtonGroupProps, ToggleButtonGroupSingleProps } from './button/ToggleButtonGroup.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/buttons/button', 'salmon-button');
