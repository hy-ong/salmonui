'use client';

import { useState } from 'react';
import { Calendar, type CalendarView, type PlainDate } from '@salmonui/calendars/calendar';

/** Single selection with week numbers, the today button and controlled view and focus events. */
export default function CalendarBasicDemo() {
  const [value, setValue] = useState<PlainDate | null>(null);
  const [view, setView] = useState<CalendarView>('month');
  const [focused, setFocused] = useState('2026-11-23');
  return (
    <div className="demo-stack">
      <Calendar
        aria-label="Delivery date"
        locale="en-US"
        defaultValue="2026-11-23"
        defaultFocusedValue="2026-11-23"
        showWeekNumbers
        showTodayButton
        onValueChange={(next, details) => setValue(next ?? null) /* details.iso is the ISO form value */}
        onViewChange={setView}
        onFocusedValueChange={(date) => setFocused(String(date))}
      />
      <p className="demo-status" aria-live="polite">
        Selected: <code>{value ? String(value) : '2026-11-23 (default)'}</code> · view <code>{view}</code> · focused <code>{focused}</code>
      </p>
    </div>
  );
}
