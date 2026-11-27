'use client';

// The public Combobox: the bare control (`Combobox.tsx`) inside the field
// parts (`label`, `description`, `errorMessage`, `invalid`).

import type { ComponentType, ReactNode } from 'react';
import { FieldParts } from '../dropdown/field.js';
import { Combobox as ComboboxControl, type ComboboxProps } from './Combobox.js';

/**
 * Combobox: the APG editable combobox. `label`, `description` and
 * `errorMessage` (shown while `invalid`) render around the input like on
 * `TextField` and are wired through `aria-labelledby` / `aria-describedby`.
 */
export function Combobox<Item = unknown>(props: ComboboxProps<Item>): ReactNode {
  return <FieldParts {...props} control={ComboboxControl as ComponentType<ComboboxProps<Item>>} />;
}
