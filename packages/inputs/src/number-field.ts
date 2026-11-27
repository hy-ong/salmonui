'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/inputs/number-field`: a locale-aware
// numeric spin button. CSS: `@salmonui/inputs/number-field/styles.css`.
export { NumberField } from './number-field/NumberField.js';
export type { NumberChangeDetails, NumberFieldLocaleText, NumberFieldProps } from './number-field/NumberField.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/inputs/number-field', 'salmon-number-field');
