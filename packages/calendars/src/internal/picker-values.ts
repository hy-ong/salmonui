// Values shared by the date pickers:
// the ISO form value, input normalization per granularity,
// and the Calendar props a picker forwards. No React, no DOM.

import { isInstant, plainDate, plainDateTime, plainTime, toPlainDate, toPlainDateTime, type DateInput, type PlainDate, type PlainDateTime, type PlainTime, type WeekRule, type WeekdayFormat } from '@salmonui/core/internal/dates/index';
import type { CalendarBaseProps, CalendarView } from '../calendar.js';

export type PickerGranularity = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second';

const TIME_GRANULARITIES = new Set<PickerGranularity>(['hour', 'minute', 'second']);

/** The `Calendar` props a picker forwards to its popup. */
export interface PickerCalendarProps {
  readonly firstDayOfWeek?: number | undefined;
  readonly showWeekNumbers?: boolean | undefined;
  readonly weekRule?: WeekRule | undefined;
  readonly weekdayFormat?: WeekdayFormat | undefined;
  /** `Intl` calendar id (`'gregory'`, `'islamic-umalqura'`, `'japanese'`, ...). */
  readonly calendar?: string | undefined;
  readonly showTodayButton?: boolean | undefined;
  readonly showOutsideDays?: boolean | undefined;
  readonly isDateDisabled?: ((date: PlainDate) => boolean) | undefined;
  readonly renderDay?: CalendarBaseProps['renderDay'] | undefined;
  readonly getDayProps?: CalendarBaseProps['getDayProps'] | undefined;
  readonly view?: CalendarView | undefined;
  readonly defaultView?: CalendarView | undefined;
  readonly onViewChange?: ((view: CalendarView) => void) | undefined;
  readonly focusedValue?: DateInput | undefined;
  readonly defaultFocusedValue?: DateInput | undefined;
  readonly onFocusedValueChange?: ((date: PlainDate) => void) | undefined;
}

const p2 = (n: number): string => String(n).padStart(2, '0');
const yearText = (y: number): string => (y < 0 || y > 9999 ? `${y < 0 ? '-' : '+'}${String(Math.abs(y)).padStart(6, '0')}` : String(y).padStart(4, '0'));

/** The ISO form value of a picker value. */
export function isoOf(value: (PlainDate & Partial<PlainTime>) | null, granularity: PickerGranularity, offsetMinutes?: number): string {
  if (!value) return '';
  const y = yearText(value.year);
  if (granularity === 'year') return y;
  if (granularity === 'month') return `${y}-${p2(value.month)}`;
  const date = `${y}-${p2(value.month)}-${p2(value.day)}`;
  if (!TIME_GRANULARITIES.has(granularity)) return date;
  let time = `${p2(value.hour ?? 0)}:${p2(value.minute ?? 0)}`;
  if (granularity === 'second') time += `:${p2(value.second ?? 0)}`;
  if (offsetMinutes === undefined) return `${date}T${time}`;
  const sign = offsetMinutes < 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  return `${date}T${time}${offsetMinutes === 0 ? 'Z' : `${sign}${p2(Math.floor(abs / 60))}:${p2(abs % 60)}`}`;
}

/** Normalizes an input to the value shape of `granularity`. */
export function valueOf(input: unknown, granularity: PickerGranularity, zone: string | null): PlainDate | PlainDateTime | null {
  // An instant waits for the zone (server render without `timeZone`: empty).
  if (input === null || input === undefined || (isInstant(input) && !zone)) return null;
  const w = toPlainDateTime(input, zone ?? undefined);
  if (!w) return null;
  if (granularity === 'year') return plainDate(w.year, 1, 1);
  if (granularity === 'month') return plainDate(w.year, w.month, 1);
  if (granularity === 'day') return toPlainDate(w);
  const t = granularity === 'hour' ? plainTime(w.hour, 0) : granularity === 'minute' ? plainTime(w.hour, w.minute) : plainTime(w.hour, w.minute, w.second);
  return plainDateTime(w, t);
}
