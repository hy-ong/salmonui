'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/inputs/otp-field`: one native input drawn as cells.
// CSS: `@salmonui/inputs/otp-field/styles.css`.
export { normalizeOtp, OtpField } from './otp-field/OtpField.js';
export type { OtpChangeDetails, OtpFieldLocaleText, OtpFieldProps } from './otp-field/OtpField.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/inputs/otp-field', 'salmon-otp');
