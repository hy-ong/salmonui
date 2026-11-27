'use client';

import { useRef, useState, type SyntheticEvent } from 'react';
import { Calendar } from '@salmonui/calendars/calendar';
import { DatePicker } from '@salmonui/calendars/date-picker';
import { DateRangePicker } from '@salmonui/calendars/date-range-picker';
import { TimePicker } from '@salmonui/calendars/time-picker';
import { ThemeProvider, type SalmonColorScheme } from '@salmonui/core/theme';
import { Select } from '@salmonui/dropdowns/select';

// The local calendar day (toISOString would give the UTC day).
const isoDay = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Runs when the popup opens, never on the server or during render.
const lastSevenDays = () => {
  const end = new Date();
  return { start: isoDay(new Date(end.getFullYear(), end.getMonth(), end.getDate() - 6)), end: isoDay(end) };
};

type Timing = { what: string; ms: number };

/** Server-rendered pickers without host locale or zone, today marked after hydration, a color scheme switch and input-to-paint timings. */
export default function CalendarPickersPlatformDemo() {
  const [scheme, setScheme] = useState<SalmonColorScheme>('auto');
  const [timings, setTimings] = useState<Timing[]>([]);
  const pending = useRef(false);
  // Input to the next painted frame: the measurement starts in the capture phase, before the component handles the event.
  const measure = (event: SyntheticEvent) => {
    if (pending.current) return;
    pending.current = true;
    const t0 = performance.now();
    const what = 'key' in event ? `${String((event as { key?: unknown }).key)} key` : 'pointer press';
    requestAnimationFrame(() =>
      setTimeout(() => {
        pending.current = false;
        setTimings((list) => [{ what, ms: performance.now() - t0 }, ...list].slice(0, 6));
      }, 0),
    );
  };
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="demo-toolbar">
        <label>
          Color scheme
          <Select aria-label="Color scheme" data={[{ value: 'auto', label: 'auto (follow the system)' }, { value: 'light', label: 'light' }, { value: 'dark', label: 'dark' }]} value={scheme} onValueChange={(value) => value != null && setScheme(value as SalmonColorScheme)} />
        </label>
      </div>
      <ThemeProvider theme={{ colorScheme: scheme }}>
        <div onKeyDownCapture={measure} onPointerDownCapture={measure} style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start', padding: 12, background: 'var(--salmon-surface-default)', color: 'var(--salmon-text-primary)', borderRadius: 'var(--salmon-radius-lg)' }}>
          <Calendar aria-label="This month (today after hydration)" />
          <div style={{ display: 'grid', gap: 16 }}>
            <DatePicker label="Ship date" defaultValue="2026-11-23" clearable />
            <DateRangePicker label="Report period" presets={[{ label: 'Last 7 days', value: lastSevenDays }]} defaultValue={{ start: '2026-11-02', end: '2026-11-08' }} />
            <TimePicker label="Any minute (1,440 options)" step={1} defaultValue="12:00" />
            <DatePicker label="Local time of an instant" granularity="minute" defaultValue="2026-11-23T14:00:00Z" description="No timeZone prop: the server renders an empty field, the browser fills in your zone." />
          </div>
        </div>
      </ThemeProvider>
      <div className="demo-log" aria-live="polite">
        <ol>{timings.length ? timings.map((t, i) => <li key={i}>{`${t.what}: ${t.ms.toFixed(1)} ms to the next frame`}</li>) : <li>Press keys or open a popup to time it</li>}</ol>
      </div>
    </div>
  );
}
