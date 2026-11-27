'use client';

import { useState } from 'react';
import { Scheduler } from '@salmonui/scheduler';

type Row = { id: number; title: string; start: string; end: string; allDay?: boolean; recurrenceRule?: string; recurrenceExceptions?: string; location?: string; block?: boolean };

const initial: Row[] = [
  { id: 1, title: 'Standup', start: '2026-11-23T09:00', end: '2026-11-23T09:15', recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', location: 'Room 1' },
  { id: 2, title: 'Design review', start: '2026-11-24T10:00', end: '2026-11-24T11:30' },
  { id: 3, title: 'Customer call', start: '2026-11-24T10:30', end: '2026-11-24T11:00' },
  { id: 4, title: 'Team offsite', start: '2026-11-26', end: '2026-11-28', allDay: true },
  { id: 5, title: 'Lunch', start: '2026-11-25T12:00', end: '2026-11-25T13:00', block: true },
];

/** Week, work week, day and month views with a recurring standup, overlapping events, an all-day offsite and a blocked lunch; edits update the rows. */
export default function SchedulerBasicDemo() {
  const [rows, setRows] = useState<readonly Row[]>(initial);
  return (
    <div className="demo-stack">
      <Scheduler
        data={rows}
        view="week"
        date="2026-11-23"
        timeZone="Europe/Berlin"
        height={560}
        editing={{ following: true }}
        onAdd={(e) => setRows(e.data)}
        onSave={(e) => setRows(e.data)}
        onDelete={(e) => setRows(e.data)}
      />
      <p className="demo-status" aria-live="polite">
        {rows.length} rows
      </p>
    </div>
  );
}
