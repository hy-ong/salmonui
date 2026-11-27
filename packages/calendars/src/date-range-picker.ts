'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/calendars/date-range-picker`:
// `DateRangePicker`, its types, and the date value types and helpers
// (`getRangeDays`). CSS: `@salmonui/calendars/date-range-picker/styles.css`.

export { DateRangePicker, DATE_RANGE_PICKER_DEFAULT_LOCALE_TEXT } from './date-range-picker/DateRangePicker.js';
export type { DateRangePickerLocaleText, DateRangePickerProps, DateRangePickerValueChangeDetails, DateRangePreset } from './date-range-picker/DateRangePicker.js';
export type { CalendarDayContext, CalendarDayProps, CalendarView } from './calendar/types.js';
export type { ChangeSource, PickerHandle, PickerOpenChangeDetails, PickerMessage, PopupMode } from './internal/picker.js';
export { getRangeDays, toDate, toPlainDate, toPlainDateTime, toPlainTime } from '@salmonui/core/dates';
export type { DateInput, DateRange, DateTimeInput, PlainDate, PlainDateLike, PlainDateTime, PlainDateTimeLike, PlainTime, PlainTimeLike, TimeInput, WeekRule, WeekdayFormat } from '@salmonui/core/dates';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/calendars/date-range-picker', 'salmon-date-range');
