'use client';

import { useState } from 'react';
import { DateRangePicker, getRangeDays, toPlainDate, type DateRange, type PlainDate } from '@salmonui/calendars/date-range-picker';

// The local calendar day (toISOString would give the UTC day).
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const nextDays = (n: number) => () => {
  const start = new Date();
  return { start: iso(start), end: iso(new Date(start.getFullYear(), start.getMonth(), start.getDate() + n - 1)) };
};
const STAY: DateRange = { start: toPlainDate('2026-11-09') as PlainDate, end: toPlainDate('2026-11-13') as PlainDate };

export default function CalendarDateRangePickerDemo() {
  const [range, setRange] = useState<DateRange | null>(STAY);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <DateRangePicker
        label="Stay"
        defaultValue={STAY}
        minDays={2}
        maxDays={14}
        clearable
        presets={[
          { label: 'Next 7 days', value: nextDays(7) },
          { label: 'Christmas week', value: { start: '2026-12-21', end: '2026-12-27' } },
        ]}
        onValueChange={setRange}
      />
      <DateRangePicker label="Quick range" confirm={false} separator=" to " onValueChange={setRange} />
      <output style={{ flexBasis: '100%' }}>{range ? `${String(range.start)} / ${String(range.end)}: ${getRangeDays(range)} days` : 'No range yet'}</output>
    </div>
  );
}
