'use client';

// Input group:
// the bordered box around a native input with start / end adornments and an
// optional clear button. Used by TextField, TextArea, MaskedField,
// NumberField and ColorField.
//
//   <InputGroup size start={startAdornment} end={endAdornment}
//     clear={clearable && value !== '' ? { label, onClear } : null}>
//     <input className="salmon-input" ... />
//   </InputGroup>
//
// The clear button is not in the tab order (Escape clears from the input,
// `clearOnEscape`), and keeps focus in the input on pointer press.

import type { KeyboardEvent, ReactNode } from 'react';
import type { FieldSize } from '../field/field.js';

export interface InputGroupProps {
  readonly children: ReactNode;
  readonly size?: FieldSize | undefined;
  readonly start?: ReactNode;
  readonly end?: ReactNode;
  /** Shows the clear button when set. */
  readonly clear?: { readonly label: string; readonly onClear: () => void } | null | undefined;
  readonly multiline?: boolean | undefined;
  readonly className?: string | undefined;
}

const present = (node: ReactNode): boolean => node !== undefined && node !== null && node !== false;

export function InputGroup({ children, size, start, end, clear, multiline, className }: InputGroupProps): ReactNode {
  return (
    <div className={className ? `salmon-input-group ${className}` : 'salmon-input-group'} data-size={size ?? 'md'} data-multiline={multiline ? '' : undefined}>
      {present(start) ? <span className="salmon-input-group-adornment" data-position="start">{start}</span> : null}
      {children}
      {clear ? (
        <button
          type="button"
          className="salmon-input-group-clear"
          tabIndex={-1}
          aria-label={clear.label}
          onPointerDown={(event) => event.preventDefault()}
          onClick={clear.onClear}
        >
          <span className="salmon-input-group-clear-icon" aria-hidden="true" />
        </button>
      ) : null}
      {present(end) ? <span className="salmon-input-group-adornment" data-position="end">{end}</span> : null}
    </div>
  );
}

/** Escape clears a clearable field with a value; returns true when it did. */
export function clearOnEscape(event: KeyboardEvent, enabled: boolean, onClear: () => void): boolean {
  if (!enabled || event.key !== 'Escape' || event.defaultPrevented) return false;
  event.preventDefault();
  onClear();
  return true;
}
