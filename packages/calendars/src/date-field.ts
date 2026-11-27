'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/calendars/date-field`: the segmented
// `DateField` and `TimeField` without a popup, and their types. The pickers
// re-export them too.
export { DateField } from './date-field/DateField.js';
export type { DateFieldDateProps, DateFieldDateTimeProps, DateFieldProps } from './date-field/DateField.js';
export { TimeField } from './date-field/TimeField.js';
export type { TimeFieldProps } from './date-field/TimeField.js';
export type { FieldBaseProps, FieldChangeDetails, FieldLocaleText } from './date-field/types.js';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/calendars/date-field', 'salmon-date-field');
