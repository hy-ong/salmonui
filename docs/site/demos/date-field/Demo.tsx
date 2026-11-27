'use client';

import { useState } from 'react';
import { DateField, type FieldChangeDetails } from '@salmonui/calendars/date-picker';

/** Segmented date fields in three locales, a pattern format, a strict bounded field and a date-time field. */
export default function DateFieldDemo() {
  const [iso, setIso] = useState('2026-11-23');
  const onChange = (_value: unknown, details: FieldChangeDetails) => setIso(details.iso);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <DateField label="Start date (en-US)" locale="en-US" defaultValue="2026-11-23" name="start" onValueChange={onChange} />
      <DateField label="Startdatum (de-DE)" locale="de-DE" defaultValue="2026-11-23" />
      <DateField label="تاريخ البدء (ar-EG)" locale="ar-EG" defaultValue="2026-11-23" dir="rtl" />
      <DateField label="Pattern dd MMM yyyy" locale="en-GB" format="dd MMM yyyy" defaultValue="2026-11-23" inputFormats={['d MMM yyyy', 'yyyyMMdd']} />
      <DateField
        label="Within November (strict)"
        description="Out-of-range input moves to the nearest bound on blur."
        errorMessage="Choose a day in November 2026."
        locale="en-US"
        min="2026-11-01"
        max="2026-11-30"
        strict
        placeholderValue="2026-11-15"
      />
      <DateField label="Meeting (date and time)" locale="en-US" granularity="minute" defaultValue="2026-11-23T14:30" timeZone="Europe/Berlin" />
      <p className="demo-status" aria-live="polite" style={{ flexBasis: '100%' }}>
        Form value of the first field: <code>{iso || '(empty)'}</code>
      </p>
    </div>
  );
}
