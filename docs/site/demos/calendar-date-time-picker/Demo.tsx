'use client';

import { useState } from 'react';
import { DatePicker } from '@salmonui/calendars/date-picker';

export default function CalendarDateTimePickerDemo() {
  const [iso, setIso] = useState('2026-11-23T10:30+01:00');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
      <DatePicker
        label="Appointment"
        granularity="minute"
        defaultValue="2026-11-23T10:30"
        timeStep={15}
        minTime="09:00"
        maxTime="17:00"
        min="2026-11-10T10:30"
        timeZone="Europe/Berlin"
        onValueChange={(_, details) => setIso(details.iso)}
      />
      <output>details.iso: {iso || "''"}</output>
    </div>
  );
}
