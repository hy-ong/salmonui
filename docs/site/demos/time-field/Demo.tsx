'use client';

import { useState } from 'react';
import { TimeField, type PlainTime } from '@salmonui/calendars/time-picker';

/** Time fields on a 12-hour and a 24-hour clock, with seconds, bounds and disabled times. */
export default function TimeFieldDemo() {
  const [time, setTime] = useState<PlainTime | null>(null);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <TimeField label="Start (12-hour)" locale="en-US" defaultValue="14:30" onValueChange={setTime} />
      <TimeField label="Beginn (24-hour)" locale="de-DE" defaultValue="14:30" />
      <TimeField label="Lap time" locale="en-GB" granularity="second" hourCycle="h23" defaultValue="00:04:05" />
      <TimeField
        label="Office hours"
        errorMessage="Choose a time between 09:00 and 17:00, not over lunch."
        locale="en-US"
        min="09:00"
        max="17:00"
        isTimeDisabled={(t) => t.hour === 12}
        placeholderValue="09:00"
      />
      <p className="demo-status" aria-live="polite" style={{ flexBasis: '100%' }}>
        First field: <code>{time ? String(time) : '14:30:00 (default)'}</code>
      </p>
    </div>
  );
}
