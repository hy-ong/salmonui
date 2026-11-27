'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/inputs/masked-field`: a text input with
// an input mask and the pure mask helpers. CSS: `@salmonui/inputs/masked-field/styles.css`.
export { MaskedField } from './masked-field/MaskedField.js';
export type { MaskedChangeDetails, MaskedFieldLocaleText, MaskedFieldProps } from './masked-field/MaskedField.js';
export { formatMasked, parseMask } from './masked-field/mask.js';
export type { Mask, MaskSlot, MaskTokens } from './masked-field/mask.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/inputs/masked-field', 'salmon-input');
