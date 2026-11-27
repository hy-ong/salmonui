// Calendars in the Next App Router: a Server Component page passing plain values to the client
// calendar components. The server renders the grids, the segmented fields
// and the picker triggers, never a popup or "today"; the Calendar without a
// date is a busy frame until hydration. tests/ssr/next-calendars.spec.ts
// asserts the server HTML and hydration (tests/browser/ssr-calendars-check.ts).
import { Calendar, RangeCalendar } from '@salmonui/calendars/calendar';
import { DateField, DatePicker } from '@salmonui/calendars/date-picker';
import { DateRangePicker } from '@salmonui/calendars/date-range-picker';
import { TimeField, TimePicker } from '@salmonui/calendars/time-picker';

export const metadata = { title: 'Salmon UI Calendars · Next.js App Router' };

export default function CalendarsPage() {
  return (
    <main style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: 24, padding: 16 }}>
      <Calendar defaultValue="2026-11-23" showWeekNumbers />
      <RangeCalendar defaultValue={{ start: '2026-11-02', end: '2026-11-06' }} visibleMonths={2} />
      <Calendar aria-label="Today" />
      <div style={{ display: 'grid', gap: 16 }}>
        <DateField label="Field" defaultValue="2026-11-23" />
        <TimeField label="Time field" defaultValue="07:30" />
        <DatePicker label="Arrival" defaultValue="2026-11-23" name="arrival" clearable />
        <DatePicker label="Meeting" granularity="minute" defaultValue="2026-11-23T14:30" timeZone="Europe/Berlin" />
        <DateRangePicker label="Stay" defaultValue={{ start: '2026-11-02', end: '2026-11-06' }} presets={[{ label: 'First week of December', value: { start: '2026-12-01', end: '2026-12-07' } }]} />
        <TimePicker label="Alarm" defaultValue="07:30" step={1} />
      </div>
    </main>
  );
}
