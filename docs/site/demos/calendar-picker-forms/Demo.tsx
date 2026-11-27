'use client';

import { useState } from 'react';
import { DatePicker } from '@salmonui/calendars/date-picker';
import { DateRangePicker } from '@salmonui/calendars/date-range-picker';
import { TimePicker } from '@salmonui/calendars/time-picker';
import { Button } from '@salmonui/buttons/button';

export default function CalendarPickerFormsDemo() {
  const [posted, setPosted] = useState('');
  return (
    <form
      style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end' }}
      onSubmit={(e) => {
        e.preventDefault();
        setPosted(JSON.stringify(Object.fromEntries(new FormData(e.currentTarget).entries()), null, 2));
      }}
    >
      <DatePicker label="Due" name="due" required clearable defaultValue="2026-11-23" min="2026-11-01" max="2026-11-30" locale="de-DE" />
      <DatePicker label="Meeting" name="meeting" granularity="minute" defaultValue="2026-11-23T14:30" />
      <DateRangePicker label="Stay" name="stay" defaultValue={{ start: '2026-11-02', end: '2026-11-06' }} />
      <TimePicker label="Alarm" name="alarm" defaultValue="07:30" />
      <DatePicker label="Sheet" name="sheet" popupMode="modal" />
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="outline" type="submit">Submit</Button>
        <Button variant="outline" type="reset">Reset</Button>
      </div>
      <pre style={{ flexBasis: '100%', margin: 0 }}>{posted || 'Nothing posted yet'}</pre>
    </form>
  );
}
