'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/inputs/signature-pad`: a Canvas 2D
// signature pad with a keyboard "type your name" mode.
// CSS: `@salmonui/inputs/signature-pad/styles.css`.
export { SignaturePad } from './signature-pad/SignaturePad.js';
export type { SignatureAction, SignatureChangeDetails, SignatureImageOptions, SignaturePadApi, SignaturePadLocaleText, SignaturePadProps } from './signature-pad/SignaturePad.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/inputs/signature-pad', 'salmon-signature-pad');
