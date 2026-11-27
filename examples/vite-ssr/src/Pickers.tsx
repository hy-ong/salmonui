// `?pickers`: the calendar pickers, server rendered and hydrated
// (tests/browser/ssr-pickers.spec.ts). Plain values render on the server; the
// `Date` without `timeZone` defers its segments to hydration.
import { Calendar, RangeCalendar } from '@salmonui/calendars/calendar';
import { DateField, DatePicker } from '@salmonui/calendars/date-picker';
import { DateRangePicker } from '@salmonui/calendars/date-range-picker';
import { TimeField, TimePicker } from '@salmonui/calendars/time-picker';

const instant = new Date(Date.UTC(2026, 10, 23, 15, 0));
const today = () => {
  const iso = new Date().toISOString().slice(0, 10);
  return { start: iso, end: iso };
};

export function Pickers() {
  return (
    // The open popup is at least as wide as its field (`--salmon-overlay-anchor-width`), so the default open
    // picker sits in its own column: its popup must not cover the other pickers' triggers.
    <main style={{ display: 'flex', alignItems: 'flex-start', gap: 32, padding: 16 }}>
      <div style={{ display: 'grid', gap: 16 }}>
        <DatePicker label="Arrival" defaultValue="2026-11-23" name="arrival" clearable />
        <DatePicker label="Meeting" granularity="minute" defaultValue="2026-11-23T14:30" timeZone="Europe/Berlin" />
        <DatePicker label="Instant" granularity="minute" defaultValue={instant} />
        <DatePicker label="Empty" placeholder="Choose a date" />
        <DateRangePicker label="Stay" defaultValue={{ start: '2026-11-02', end: '2026-11-06' }} presets={[{ label: 'Today', value: today }]} />
        <TimePicker label="Alarm" defaultValue="07:30" step={1} />
      </div>
      <DatePicker label="Default open" defaultValue="2026-11-23" defaultOpen />
      {/* Inline calendars and fields: the Calendar without a date is a busy frame until hydration. */}
      <div style={{ display: 'grid', gap: 16 }}>
        <Calendar defaultValue="2026-11-23" showWeekNumbers />
        <RangeCalendar defaultValue={{ start: '2026-11-02', end: '2026-11-06' }} visibleMonths={2} />
        <Calendar aria-label="Today" />
        <DateField label="Field" defaultValue="2026-11-23" />
        <TimeField label="Time field" defaultValue="07:30" />
      </div>
    </main>
  );
}
