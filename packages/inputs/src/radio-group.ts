'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/inputs/radio-group`:
// native radios grouped in a fieldset. CSS: `@salmonui/inputs/radio-group/styles.css`.
export { Radio, RadioGroup } from './radio-group/RadioGroup.js';
export type { LabelPlacement, RadioChangeDetails, RadioGroupProps, RadioProps } from './radio-group/RadioGroup.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/inputs/radio-group', 'salmon-toggle-radio');
