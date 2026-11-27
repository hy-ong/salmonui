'use client';

import { useState } from 'react';
import { DatePicker, type DatePickerValueChangeDetails, type PlainDate } from '@salmonui/calendars/date-picker';

const weekend = (d: PlainDate): boolean => {
  const day = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
  return day === 0 || day === 6;
};

export default function CalendarDatePickerDemo() {
  const [last, setLast] = useState<string>('');
  const report = (value: PlainDate | null, details: DatePickerValueChangeDetails) => setLast(`${String(value)} (${details.reason}, iso ${details.iso || "''"})`);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <DatePicker label="Arrival" defaultValue="2026-11-23" min="2026-11-02" max="2026-12-23" isDateDisabled={weekend} errorMessage="Choose a weekday" showTodayButton clearable onValueChange={report} />
      <DatePicker label="Billing month" granularity="month" defaultValue="2026-11-01" onValueChange={report} />
      <DatePicker label="Pick only" editable={false} placeholder="Choose a date" onValueChange={report} />
      <output style={{ flexBasis: '100%' }}>Last change: {last || 'none'}</output>
    </div>
  );
}
