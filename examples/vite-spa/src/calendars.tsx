// Calendars browser page (tests/browser/calendars.spec.ts): every Calendar,
// RangeCalendar, DateField and TimeField scenario on one page, each in a `[data-scenario]` block with fixed locales and dates.
// User changes are recorded in `window.__calEvents`.
//
//   ?scheme=dark   dark color scheme
//   ?ssr=1         renderToString in the browser, then hydrateRoot
import { useState, type ReactNode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import '@salmonui/core/styles.css';
import '@salmonui/calendars/calendar/styles.css';
import '@salmonui/calendars/date-picker/styles.css';
import '@salmonui/calendars/time-picker/styles.css';
import './app.css';
import { Calendar, RangeCalendar, type CalendarView, type DateRange, type PlainDate } from '@salmonui/calendars/calendar';
import { DateField } from '@salmonui/calendars/date-picker';
import { TimeField } from '@salmonui/calendars/time-picker';
import { ThemeProvider, type SalmonColorScheme } from '@salmonui/core/theme';

declare global {
  interface Window {
    __calEvents: { id: string; type: string; value: unknown; details?: unknown }[];
    __mountMs?: number;
    __hydrated?: boolean;
    __serverHtml?: string;
  }
}

window.__calEvents = [];
const params = new URLSearchParams(location.search);
const scheme = (params.get('scheme') ?? 'light') as SalmonColorScheme;

const json = (v: unknown): unknown => (v === null || v === undefined ? v : JSON.parse(JSON.stringify(v)));
const log = (id: string, type: string) => (value: unknown, details?: unknown) => {
  window.__calEvents.push({ id, type, value: json(value), details: json(details) });
};
const on = (id: string) => ({ onValueChange: log(id, 'value'), onViewChange: log(id, 'view'), onFocusedValueChange: log(id, 'focus') });
const onField = (id: string) => ({ onValueChange: log(id, 'value') });

const weekend = (d: PlainDate): boolean => {
  const w = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
  return w === 0 || w === 6;
};

function Block({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section data-scenario={id} style={{ display: 'inline-block', margin: 8, verticalAlign: 'top' }}>
      <h2 style={{ fontSize: 12, margin: '0 0 4px' }}>{id}</h2>
      {children}
    </section>
  );
}

function Controlled() {
  const [value, setValue] = useState<string | PlainDate | null>('2026-11-23');
  return (
    <>
      <Calendar
        aria-label="controlled"
        value={value}
        onValueChange={(v, d) => {
          log('controlled', 'value')(v, d);
          setValue(v);
        }}
      />
      <button type="button" id="set-controlled" onClick={() => setValue('2026-12-25')}>
        Set Dec 25
      </button>
    </>
  );
}

function ControlledView() {
  const [view, setView] = useState<CalendarView>('year');
  return (
    <>
      <Calendar
        defaultValue="2026-11-23"
        view={view}
        onViewChange={(v) => {
          log('controlled-view', 'view')(v);
          setView(v);
        }}
      />
      <button type="button" id="set-view-decade" onClick={() => setView('decade')}>
        Decade
      </button>
    </>
  );
}

function ControlledRange() {
  const [value, setValue] = useState<DateRange | null>(null);
  return (
    <>
      <RangeCalendar defaultFocusedValue="2026-11-01" visibleMonths={2} value={value} onValueChange={(v, d) => (log('range', 'value')(v, d), setValue(v))} />
      <output id="range-out">{value ? `${String(value.start)}/${String(value.end)}` : ''}</output>
    </>
  );
}

function Page() {
  return (
    <ThemeProvider theme={{ colorScheme: scheme }} className="app">
      <Block id="single">
        <Calendar defaultValue="2026-11-23" showTodayButton {...on('single')} />
      </Block>
      <Block id="controlled">
        <Controlled />
      </Block>
      <Block id="multiple">
        <Calendar selectionMode="multiple" defaultValue={['2026-11-03']} {...on('multiple')} />
      </Block>
      <Block id="minmax">
        <Calendar defaultFocusedValue="2026-11-15" min="2026-11-05" max="2026-11-25" {...on('minmax')} />
      </Block>
      <Block id="views">
        <Calendar defaultValue="2026-11-23" {...on('views')} />
      </Block>
      <Block id="controlled-view">
        <ControlledView />
      </Block>
      <Block id="month-picker">
        <Calendar granularity="month" defaultFocusedValue="2026-11-23" {...on('month-picker')} />
      </Block>
      <Block id="first-day">
        <Calendar defaultValue="2026-11-23" firstDayOfWeek={1} />
      </Block>
      <Block id="locale-de">
        <Calendar defaultValue="2026-11-23" locale="de-DE" showWeekNumbers />
      </Block>
      <Block id="week-us">
        <Calendar defaultValue="2026-11-23" showWeekNumbers />
      </Block>
      <Block id="narrow">
        <Calendar defaultValue="2026-11-23" weekdayFormat="narrow" />
      </Block>
      <Block id="long">
        <Calendar defaultValue="2026-11-23" weekdayFormat="long" />
      </Block>
      <Block id="islamic">
        <Calendar defaultValue="2026-11-23" calendar="islamic-umalqura" {...on('islamic')} />
      </Block>
      <Block id="weekends">
        <Calendar defaultFocusedValue="2026-11-23" isDateDisabled={weekend} {...on('weekends')} />
      </Block>
      <Block id="render-day">
        <Calendar
          defaultFocusedValue="2026-11-23"
          renderDay={(ctx) => (ctx.date.day === 11 ? <b className="mark">{ctx.date.day}*</b> : ctx.date.day)}
          getDayProps={(ctx) => (ctx.date.day === 25 ? { className: 'holiday', title: 'Holiday', 'data-kind': 'holiday' } : undefined)}
        />
      </Block>
      <Block id="outside">
        <Calendar defaultValue="2026-11-23" showOutsideDays {...on('outside')} />
      </Block>
      <Block id="today">
        <Calendar showTodayButton {...on('today')} />
      </Block>
      <Block id="range">
        <ControlledRange />
      </Block>
      <Block id="range-span">
        <RangeCalendar defaultFocusedValue="2026-11-10" minDays={3} maxDays={7} {...on('range-span')} />
      </Block>
      <Block id="range-block">
        <RangeCalendar defaultFocusedValue="2026-11-10" isDateDisabled={(d) => d.day === 15} {...on('range-block')} />
      </Block>
      <Block id="rtl">
        <div dir="rtl">
          <Calendar defaultValue="2026-11-23" locale="ar-EG" />
          <DateField aria-label="rtl field" locale="en-US" defaultValue="2026-11-23" />
        </div>
      </Block>
      <Block id="field">
        <DateField label="Start" description="Month, day, year" defaultValue="2026-11-23" {...onField('field')} />
      </Block>
      <Block id="field-empty">
        <DateField aria-label="Empty field" inputFormats={['dd.MM.yyyy']} placeholderValue="2030-06-15" {...onField('field-empty')} />
      </Block>
      <Block id="field-names">
        <DateField aria-label="Named month" format="dd MMM yyyy" defaultValue="2026-11-23" {...onField('field-names')} />
      </Block>
      <Block id="field-ar">
        <DateField aria-label="Arabic" locale="ar-EG" defaultValue="2026-11-23" {...onField('field-ar')} />
      </Block>
      <Block id="time">
        <TimeField aria-label="Time" defaultValue="14:30" {...onField('time')} />
      </Block>
      <Block id="time-24">
        <TimeField aria-label="Time 24" hourCycle="h23" granularity="second" defaultValue="14:30:05" {...onField('time-24')} />
      </Block>
      <Block id="strict">
        <DateField aria-label="Strict" strict min="2026-11-05" max="2026-11-25" defaultValue="2026-11-10" {...onField('strict')} />
      </Block>
      <Block id="loose">
        <DateField aria-label="Loose" min="2026-11-05" max="2026-11-25" defaultValue="2026-11-10" errorMessage="Out of range" {...onField('loose')} />
      </Block>
      <button type="button" id="after">
        After
      </button>
    </ThemeProvider>
  );
}

function Hydration() {
  return (
    <ThemeProvider theme={{ colorScheme: scheme }} className="app">
      <Block id="ssr-value">
        <Calendar defaultValue="2026-11-23" />
      </Block>
      <Block id="ssr-empty">
        <Calendar />
      </Block>
      <Block id="ssr-field">
        <DateField aria-label="SSR field" defaultValue="2026-11-23" />
        <DateField aria-label="SSR instant" defaultValue={new Date(Date.UTC(2026, 10, 23, 12))} />
      </Block>
    </ThemeProvider>
  );
}

const container = document.getElementById('root') as HTMLElement;
const t0 = performance.now();
if (params.get('ssr') === '1') {
  const html = renderToString(<Hydration />);
  window.__serverHtml = html;
  container.innerHTML = html;
  hydrateRoot(container, <Hydration />, { onRecoverableError: (e) => console.error('recoverable', e) });
  requestAnimationFrame(() => (window.__hydrated = true));
} else {
  createRoot(container).render(<Page />);
}
requestAnimationFrame(() => (window.__mountMs = performance.now() - t0));
