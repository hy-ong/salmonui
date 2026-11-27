'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/calendars/time-picker`: `TimePicker` and
// the segmented `TimeField`, their types, and the date value types and
// helpers. CSS: `@salmonui/calendars/time-picker/styles.css`.

export { TimePicker, TIME_PICKER_DEFAULT_LOCALE_TEXT } from './time-picker/TimePicker.js';
export type { TimePickerLocaleText, TimePickerProps, TimePickerValueChangeDetails } from './time-picker/TimePicker.js';
export type { TimeOptionContext } from './internal/time-list.js';
export { TimeField } from './date-field/TimeField.js';
export type { TimeFieldProps } from './date-field/TimeField.js';
export type { FieldBaseProps, FieldChangeDetails, FieldLocaleText } from './date-field/types.js';
export type { ChangeSource, PickerHandle, PickerOpenChangeDetails, PickerMessage, PopupMode } from './internal/picker.js';
export { getRangeDays, toDate, toPlainDate, toPlainDateTime, toPlainTime } from '@salmonui/core/dates';
export type { DateInput, DateRange, DateTimeInput, PlainDate, PlainDateLike, PlainDateTime, PlainDateTimeLike, PlainTime, PlainTimeLike, TimeInput, WeekRule, WeekdayFormat } from '@salmonui/core/dates';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/calendars/time-picker', 'salmon-time-picker');
