'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/calendars/date-picker`: `DatePicker`
// (with the DateTimePicker fold) and the segmented `DateField`, their types,
// and the date value types and helpers.
// CSS: `@salmonui/calendars/date-picker/styles.css`.

export { DatePicker, DATE_PICKER_DEFAULT_LOCALE_TEXT } from './date-picker/DatePicker.js';
export type { DatePickerCalendarProps, DatePickerGranularity, DatePickerLocaleText, DatePickerProps, DatePickerValueChangeDetails } from './date-picker/DatePicker.js';
export { DateField } from './date-field/DateField.js';
export type { DateFieldDateProps, DateFieldDateTimeProps, DateFieldProps } from './date-field/DateField.js';
export type { FieldBaseProps, FieldChangeDetails, FieldLocaleText } from './date-field/types.js';
export type { CalendarDayContext, CalendarDayProps, CalendarView } from './calendar/types.js';
export type { TimeOptionContext } from './internal/time-list.js';
export type { ChangeSource, PickerHandle, PickerOpenChangeDetails, PickerMessage, PopupMode } from './internal/picker.js';
export { getRangeDays, toDate, toPlainDate, toPlainDateTime, toPlainTime } from '@salmonui/core/dates';
export type { DateInput, DateRange, DateTimeInput, PlainDate, PlainDateLike, PlainDateTime, PlainDateTimeLike, PlainTime, PlainTimeLike, TimeInput, WeekRule, WeekdayFormat } from '@salmonui/core/dates';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/calendars/date-picker', 'salmon-date-picker');
