'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/calendars/calendar`: Calendar and RangeCalendar,
// plus the value types and helpers of the internal date module,
// re-exported by every calendar subpath. CSS: `@salmonui/calendars/calendar/styles.css`.

export { Calendar, RangeCalendar } from './calendar/Calendar.js';
export type {
  CalendarBaseProps,
  CalendarChangeDetails,
  CalendarDayContext,
  CalendarDayProps,
  CalendarGranularity,
  CalendarLocaleText,
  CalendarMultipleProps,
  CalendarProps,
  CalendarSingleProps,
  CalendarView,
  RangeCalendarProps,
} from './calendar/types.js';
export { getRangeDays, toDate, toPlainDate, toPlainDateTime, toPlainTime } from '@salmonui/core/dates';
export type { DateInput, DateRange, DateTimeInput, PlainDate, PlainDateLike, PlainDateTime, PlainDateTimeLike, PlainTime, PlainTimeLike, TimeInput, WeekRule, WeekdayFormat } from '@salmonui/core/dates';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/calendars/calendar', 'salmon-calendar');
