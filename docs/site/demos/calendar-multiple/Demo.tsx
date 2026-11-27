'use client';

import { useState } from 'react';
import { Calendar, type DateInput } from '@salmonui/calendars/calendar';
import { Button } from '@salmonui/buttons/button';

/** Multiple selection with a reactive value array, min / max bounds and Monday-first weeks. */
export default function CalendarMultipleDemo() {
  const [dates, setDates] = useState<readonly DateInput[]>(['2026-11-10', '2026-11-12', '2026-11-19']);
  return (
    <div className="demo-stack">
      <Calendar
        aria-label="Shift days"
        locale="en-GB"
        selectionMode="multiple"
        value={dates}
        onValueChange={(next) => setDates(next)}
        min="2026-11-02"
        max="2026-12-20"
        firstDayOfWeek={1}
        weekdayFormat="narrow"
        showOutsideDays
      />
      <p className="demo-status">
        {dates.length} days: <code>{dates.map(String).join(', ') || 'none'}</code>
      </p>
      <Button variant="outline" type="button" onClick={() => setDates([])}>
        Clear
      </Button>
    </div>
  );
}
