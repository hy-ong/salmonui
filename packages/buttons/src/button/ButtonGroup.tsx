'use client';

import type { HTMLAttributes, ReactElement, ReactNode, Ref } from 'react';
import { ButtonGroupContext, type ButtonSize, type ButtonTone, type ButtonVariant } from './context.js';

export interface ButtonGroupProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  /** Layout direction. Default `'horizontal'`. */
  orientation?: 'horizontal' | 'vertical' | undefined;
  /** Joined borders and shared corners. Default `true`; `false` spaces the buttons. */
  attached?: boolean | undefined;
  /** Default `variant` of the buttons inside; a button's own prop wins. */
  variant?: ButtonVariant | undefined;
  /** Default `tone` of the buttons inside; a button's own prop wins. */
  tone?: ButtonTone | undefined;
  /** Default `size` of the buttons inside; a button's own prop wins. */
  size?: ButtonSize | undefined;
  /** Disables every button inside; a button's own `disabled` wins. */
  disabled?: boolean | undefined;
  ref?: Ref<HTMLDivElement> | undefined;
}

/**
 * A visual group of buttons: `role="group"`, named by `aria-label` or
 * `aria-labelledby`. It adds no keyboard model: every button
 * stays a tab stop. `.salmon-button-group` with
 * `data-orientation` and `data-attached`.
 */
export function ButtonGroup({ children, orientation = 'horizontal', attached = true, variant, tone, size, disabled, className, ...rest }: ButtonGroupProps): ReactElement {
  return (
    <div
      role="group"
      {...rest}
      className={className ? `salmon-button-group ${className}` : 'salmon-button-group'}
      data-orientation={orientation}
      data-attached={attached ? '' : undefined}
    >
      <ButtonGroupContext value={{ variant, tone, size, disabled }}>{children}</ButtonGroupContext>
    </div>
  );
}
