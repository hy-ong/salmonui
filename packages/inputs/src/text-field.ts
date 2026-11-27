'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/inputs/text-field`: single and
// multi-line text inputs. CSS: `@salmonui/inputs/text-field/styles.css`.
export { TextArea, TextField } from './text-field/TextField.js';
export type { TextAreaProps, TextChangeDetails, TextFieldLocaleText, TextFieldProps } from './text-field/TextField.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/inputs/text-field', 'salmon-text-field');
