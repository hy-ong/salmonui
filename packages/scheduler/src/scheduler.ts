'use client';
import { expectStylesheet } from '@salmonui/core/internal/dev';

// `@salmonui/scheduler`:
// `RecurrenceEditor`, the RRULE helpers, the time
// zone helpers, the date value types and `Scheduler`.
// CSS: `@salmonui/scheduler/styles.css`.

export { Scheduler } from './scheduler/Scheduler.js';
export { SCHEDULER_DEFAULT_LOCALE_TEXT } from './scheduler/locale.js';
export type { SchedulerLocaleText } from './scheduler/locale.js';
export type * from './scheduler/types.js';
export { RecurrenceEditor, RECURRENCE_EDITOR_DEFAULT_LOCALE_TEXT } from './recurrence-editor/RecurrenceEditor.js';
export type { RecurrenceEditorChangeDetails, RecurrenceEditorLocaleText, RecurrenceEditorProps, RecurrenceEndType, RecurrenceFrequencyOption } from './recurrence-editor/RecurrenceEditor.js';
export { formatRecurrenceRule, fromZonedDateTime, getRecurrenceDates, getRecurrenceSummary, getTimeZoneOffset, parseRecurrenceRule, RECURRENCE_SUMMARY_DEFAULT_TEXT, toZonedDateTime } from '@salmonui/core/internal/dates/index';
export type { InstantInput, RecurrenceDatesOptions, RecurrenceFrequency, RecurrenceParseResult, RecurrenceRule, RecurrenceSummaryOptions, RecurrenceSummaryText, RecurrenceUntil, RecurrenceWeekday } from '@salmonui/core/internal/dates/index';
export { getRangeDays, toDate, toPlainDate, toPlainDateTime, toPlainTime } from '@salmonui/core/dates';
export type { DateInput, DateRange, DateTimeInput, PlainDate, PlainDateLike, PlainDateTime, PlainDateTimeLike, PlainTime, PlainTimeLike, TimeInput, WeekRule, WeekdayFormat } from '@salmonui/core/dates';

// Development: warns once when this family renders without its stylesheet. A textual
// NODE_ENV test, so production bundles drop the call even across chunks.
declare const process: { readonly env: { readonly NODE_ENV?: string } };
if (process.env.NODE_ENV !== 'production') expectStylesheet('@salmonui/scheduler', 'salmon-scheduler');
