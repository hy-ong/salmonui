'use client';

// The public Select: the bare control (`Select.tsx`) inside the field parts
// (`label`, `description`, `errorMessage`, `invalid`).

import type { ComponentType, ReactNode } from 'react';
import { FieldParts } from '../dropdown/field.js';
import { Select as SelectControl, type SelectProps } from './Select.js';

/**
 * Select: the APG select-only combobox. `label`, `description` and
 * `errorMessage` (shown while `invalid`) render around the trigger like on
 * `TextField` and are wired through `aria-labelledby` / `aria-describedby`.
 */
export function Select<Item = unknown>(props: SelectProps<Item>): ReactNode {
  return <FieldParts {...props} control={SelectControl as ComponentType<SelectProps<Item>>} />;
}
