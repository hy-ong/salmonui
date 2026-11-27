'use client';

import { Calendar, type CalendarDayContext, type PlainDate } from '@salmonui/calendars/calendar';

const HOLIDAYS = new Set(['2026-12-24', '2026-12-25', '2026-12-26', '2026-12-31']);
const PAYDAYS = new Set(['2026-12-15', '2026-12-30']);

const isWeekend = (date: PlainDate): boolean => {
  const day = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  return day === 0 || day === 6;
};

/** Weekends and holidays disabled with `isDateDisabled`; paydays marked through `renderDay` and `getDayProps`. */
export default function CalendarDisabledDaysDemo() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <Calendar
        aria-label="Working day"
        locale="en-US"
        defaultFocusedValue="2026-12-01"
        isDateDisabled={(date) => isWeekend(date) || HOLIDAYS.has(String(date))}
        getDayProps={({ date }: CalendarDayContext) => (PAYDAYS.has(String(date)) ? { className: 'demo-payday', title: 'Payday', 'data-payday': true } : undefined)}
        renderDay={({ date }: CalendarDayContext) => (
          // The payday dot sits under the number, so the number stays centred in its cell.
          <span style={{ position: 'relative' }}>
            {date.day}
            {PAYDAYS.has(String(date)) ? (
              <span aria-hidden="true" style={{ position: 'absolute', insetInline: 0, insetBlockStart: '0.9em', textAlign: 'center', lineHeight: 1 }}>
                •
              </span>
            ) : null}
          </span>
        )}
      />
      <Calendar aria-label="Month of report" locale="en-US" granularity="month" defaultValue="2026-11-01" />
      <Calendar aria-label="Buddhist calendar" locale="th-TH" calendar="buddhist" defaultValue="2026-11-23" weekdayFormat="narrow" />
      <Calendar aria-label="Islamic calendar" locale="ar-SA" calendar="islamic-umalqura" defaultValue="2026-11-23" weekdayFormat="narrow" dir="rtl" />
    </div>
  );
}
