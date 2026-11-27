'use client';

import { useState } from 'react';
import { getRecurrenceDates, RecurrenceEditor } from '@salmonui/scheduler';

/** A controlled RecurrenceEditor with its RRULE string and the next occurrences from the pure helpers. */
export default function CalendarRecurrenceEditorDemo() {
  const [rule, setRule] = useState<string | null>('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=10');
  const next = rule ? getRecurrenceDates(rule, { start: '2026-11-23T09:00', timeZone: 'Europe/Berlin', maxCount: 5 }) : [];
  return (
    <div className="demo-stack">
      <RecurrenceEditor value={rule} onValueChange={setRule} start="2026-11-23T09:00" />
      <p className="demo-status" aria-live="polite">
        Rule: <code>{rule ?? 'null (never)'}</code>
      </p>
      <p className="demo-status">
        Next: <code>{next.map(String).join(', ') || 'none'}</code>
      </p>
    </div>
  );
}
