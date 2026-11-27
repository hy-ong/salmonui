'use client';

import { useState } from 'react';
import { Calendar, type WeekRule } from '@salmonui/calendars/calendar';
import { DatePicker, type DatePickerValueChangeDetails, type PlainDate, type PlainDateTime } from '@salmonui/calendars/date-picker';
import { DateRangePicker, type DateRange } from '@salmonui/calendars/date-range-picker';
import { TimePicker } from '@salmonui/calendars/time-picker';
import { Select } from '@salmonui/dropdowns/select';

// A fixed instant: 2026-11-23 14:00 UTC (a `Date` value, read in the picker's zone).
const MEETING = new Date(Date.UTC(2026, 10, 23, 14, 0));

type Change = { field: string; text: string; json: string; iso: string };

/** Display formats, typed and pasted input formats, locales and localeText, Date and ISO values, seconds, 12-hour time and a DST day. */
export default function CalendarPickerFormatsDemo() {
  const [last, setLast] = useState<Change | null>(null);
  const [rule, setRule] = useState<WeekRule>('firstFourDayWeek');
  const report = (field: string) => (value: PlainDate | PlainDateTime | null, details: DatePickerValueChangeDetails) =>
    setLast({ field, text: String(value), json: JSON.stringify(value), iso: details.iso });
  const reportRange = (value: DateRange | null) => setLast({ field: 'Trip', text: value ? `${String(value.start)} / ${String(value.end)}` : 'null', json: JSON.stringify(value), iso: value ? `${String(value.start)}/${String(value.end)}` : '' });
  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <DatePicker
          label="Invoice date (dd/MM/yyyy)"
          description="Also accepts 23.11.2026 and 20261123 typed over the field or pasted."
          format="dd/MM/yyyy"
          inputFormats={['d.M.yyyy', 'yyyyMMdd']}
          defaultValue="2026-11-23"
          locale="en-GB"
          onValueChange={report('Invoice date')}
        />
        <DatePicker
          label="Lieferdatum (de-DE)"
          locale="de-DE"
          format={{ day: '2-digit', month: 'long', year: 'numeric' }}
          defaultValue="2026-12-07"
          clearable
          localeText={{ chooseDate: 'Datum wählen', clear: 'Löschen', close: 'Schließen' }}
          onValueChange={report('Lieferdatum')}
        />
        <DatePicker
          label="Call in Tokyo (a Date value)"
          description="value is a Date instant; the field shows it in Asia/Tokyo."
          granularity="minute"
          defaultValue={MEETING}
          timeZone="Asia/Tokyo"
          locale="en-US"
          onValueChange={report('Call in Tokyo')}
        />
        <DatePicker
          label="Deploy at (seconds, 12-hour)"
          granularity="second"
          hourCycle="h12"
          defaultValue="2026-11-23T21:15:30"
          inputFormats={['yyyy-MM-dd HH:mm:ss']}
          strict
          clearable
          min="2026-11-01T00:00:00"
          locale="en-US"
          onValueChange={report('Deploy at')}
        />
        <DatePicker
          label="Clocks change (America/New_York)"
          description="8 March 2026: 02:00 to 02:59 does not exist. Set the hour to 2 and watch the offset."
          granularity="minute"
          defaultValue="2026-03-08T01:30"
          timeZone="America/New_York"
          hourCycle="h23"
          locale="en-US"
          onValueChange={report('Clocks change')}
        />
        <TimePicker
          label="Opening time (h23)"
          format={{ hour: '2-digit', minute: '2-digit' }}
          hourCycle="h23"
          defaultValue="08:30"
          locale="en-GB"
          onValueChange={(value, details) => setLast({ field: 'Opening time', text: String(value), json: JSON.stringify(value), iso: details.iso })}
        />
        <DateRangePicker label="Trip (dd MMM yyyy)" format="dd MMM yyyy" locale="en-GB" defaultValue={{ start: '2026-12-21', end: '2026-12-27' }} onValueChange={reportRange} />
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div>
          <label className="demo-toolbar">
            Week rule
            <Select aria-label="Week rule" data={[{ value: 'firstDay', label: 'firstDay (US)' }, { value: 'firstFourDayWeek', label: 'firstFourDayWeek (ISO 8601)' }, { value: 'firstFullWeek', label: 'firstFullWeek' }]} value={rule} onValueChange={(value) => value != null && setRule(value as WeekRule)} />
          </label>
          <Calendar aria-label="January 2027 with week numbers" defaultFocusedValue="2027-01-01" showWeekNumbers weekRule={rule} firstDayOfWeek={1} locale="en-GB" />
        </div>
        <div className="demo-log" style={{ flex: '1 1 320px' }} aria-live="polite">
          {last ? (
            <>
              <div>field: {last.field}</div>
              <div>String(value): {last.text}</div>
              <div>JSON.stringify(value): {last.json}</div>
              <div>details.iso: {last.iso || "''"}</div>
            </>
          ) : (
            'Change a field to see its value'
          )}
        </div>
      </div>
    </div>
  );
}
