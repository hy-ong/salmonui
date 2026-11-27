'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/inputs/checkbox`:
// a native checkbox and a group of them as one string[] value. CSS: `@salmonui/inputs/checkbox/styles.css`.
export { Checkbox, CheckboxGroup } from './checkbox/Checkbox.js';
export type { CheckboxGroupChangeDetails, CheckboxGroupProps, CheckboxProps, CheckedChangeDetails, LabelPlacement } from './checkbox/Checkbox.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/inputs/checkbox', 'salmon-toggle-checkbox');
