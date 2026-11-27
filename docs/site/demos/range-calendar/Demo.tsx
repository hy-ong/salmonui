'use client';

import { useState } from 'react';
import { getRangeDays, RangeCalendar, toPlainDate, type DateRange, type PlainDate } from '@salmonui/calendars/calendar';

const TRIP: DateRange = { start: toPlainDate('2026-11-09') as PlainDate, end: toPlainDate('2026-11-13') as PlainDate };

/** A two-month RangeCalendar with a 3 to 14 day span and a blocked holiday. */
export default function RangeCalendarDemo() {
  const [range, setRange] = useState<DateRange | null>(TRIP);
  return (
    <div className="demo-stack">
      <RangeCalendar
        aria-label="Trip dates"
        locale="en-US"
        visibleMonths={2}
        defaultValue={TRIP}
        minDays={3}
        maxDays={14}
        isDateDisabled={(date) => String(date) === '2026-11-26'}
        rangeOverDisabled="block"
        onValueChange={setRange}
      />
      <p className="demo-status" aria-live="polite">
        {range ? (
          <>
            <code>
              {String(range.start)}/{String(range.end)}
            </code>{' '}
            · {getRangeDays(range)} days
          </>
        ) : (
          'Choose a start date, then an end date.'
        )}
      </p>
    </div>
  );
}
