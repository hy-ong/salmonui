'use client';

// Field parts of Select and Combobox (`DropdownFieldProps`): the public `Select` / `Combobox` render the bare
// control through `FieldParts`, so packages that import the bare control
// (`@salmonui/dropdowns/internal/select`, `.../internal/combobox`) and label it
// themselves carry none of this code.

import { useId, type ComponentType, type MouseEvent, type ReactNode } from 'react';
import type { DropdownFieldProps } from './types.js';

/** ARIA the control receives; explicit `aria-*` props spread after it win. */
export interface FieldAria {
  readonly 'aria-labelledby'?: string | undefined;
  readonly 'aria-describedby'?: string | undefined;
  readonly 'aria-invalid'?: true | undefined;
}

// Pressing the label focuses the control, as a native <label for> does; the popup listbox lives in a portal.
const focusControl = (event: MouseEvent<HTMLElement>): void => event.currentTarget.parentElement?.querySelector<HTMLElement>('[role="combobox"]')?.focus();

/**
 * Renders `control` (the field ARIA, then every other prop) inside
 * `.salmon-dropdown-field` with the label, description and error parts, or
 * alone when none of them is set.
 */
export function FieldParts<P extends object>(props: DropdownFieldProps & P & { readonly control: ComponentType<P> }): ReactNode {
  const { label, description, errorMessage, invalid, control: Control, ...rest } = props;
  const base = useId();
  const error = invalid && errorMessage != null;
  const control = (
    <Control
      aria-labelledby={label != null ? `${base}l` : undefined}
      aria-describedby={[description != null && `${base}d`, error && `${base}e`].filter(Boolean).join(' ') || undefined}
      aria-invalid={invalid || undefined}
      {...(rest as unknown as P)}
    />
  );
  if (label == null && description == null && !error) return control;
  return (
    <div className="salmon-dropdown-field">
      {label != null && (
        <label className="salmon-dropdown-field-label" id={`${base}l`} onClick={focusControl}>
          {label}
        </label>
      )}
      {control}
      {description != null && (
        <div className="salmon-dropdown-field-description" id={`${base}d`}>
          {description}
        </div>
      )}
      {error && (
        <div className="salmon-dropdown-field-error" id={`${base}e`}>
          {errorMessage}
        </div>
      )}
    </div>
  );
}
