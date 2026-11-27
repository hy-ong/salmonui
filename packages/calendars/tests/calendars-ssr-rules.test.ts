import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Calendar, RangeCalendar } from '@salmonui/calendars/calendar';
import { DateField, DatePicker } from '@salmonui/calendars/date-picker';
import { DateRangePicker } from '@salmonui/calendars/date-range-picker';
import { TimeField, TimePicker } from '@salmonui/calendars/time-picker';

// SSR and hydration rules of the calendar components:
// server HTML depends on props only (never the host
// zone, the clock or browser globals), popups and preset functions never
// run on the server, renders are pure, and the built-in icons are CSS on
// labelled buttons. Hydration is covered by tests/browser/ssr-pickers.spec.ts
// and tests/ssr/next-calendars.spec.ts.

const src = new URL('../src/', import.meta.url);
const dist = new URL('../dist/', import.meta.url);

/** One of every calendar component with a plain value (the common, fully server-rendered case). */
const everything = (): ReactElement[] => [
  h(Calendar, { defaultValue: '2026-11-23', showWeekNumbers: true }),
  h(RangeCalendar, { defaultValue: { start: '2026-11-02', end: '2026-11-06' }, visibleMonths: 2 }),
  h(DateField, { label: 'Day', defaultValue: '2026-11-23' }),
  h(TimeField, { label: 'Time', defaultValue: '07:30' }),
  h(DatePicker, { label: 'Date', defaultValue: '2026-11-23', clearable: true, name: 'date' }),
  h(DatePicker, { label: 'Meeting', granularity: 'minute', defaultValue: '2026-11-23T14:30', timeZone: 'Europe/Berlin' }),
  h(DateRangePicker, { label: 'Stay', defaultValue: { start: '2026-11-02', end: '2026-11-06' }, clearable: true }),
  h(TimePicker, { label: 'Alarm', defaultValue: '07:30', clearable: true }),
];
const renderAll = (): string[] => everything().map((el) => renderToString(el));

/** Runs `fn` with `process.env.TZ` set to `zone` (Node re-reads the zone on assignment). */
function inZone<T>(zone: string, fn: () => T): T {
  const before = process.env['TZ'];
  process.env['TZ'] = zone;
  try {
    return fn();
  } finally {
    if (before === undefined) delete process.env['TZ'];
    else process.env['TZ'] = before;
  }
}

describe('no host locale or zone in render', () => {
  it('server HTML is the same in any host zone; locale and timeZone come from props', () => {
    const kiritimati = inZone('Pacific/Kiritimati', () => [new Date(Date.UTC(2026, 10, 23, 12)).getTimezoneOffset(), ...renderAll()]);
    const honolulu = inZone('Pacific/Honolulu', () => [new Date(Date.UTC(2026, 10, 23, 12)).getTimezoneOffset(), ...renderAll()]);
    // The host zones really differ (+14 h and -10 h), the markup does not.
    assert.notEqual(kiritimati[0], honolulu[0]);
    assert.deepEqual(kiritimati.slice(1), honolulu.slice(1));
    // Without a locale prop the components use 'en-US', never the host locale.
    assert.match(renderToString(h(Calendar, { defaultValue: '2026-11-23' })), />November 2026</);
    assert.match(renderToString(h(Calendar, { defaultValue: '2026-11-23', locale: 'de-DE' })), />November 2026</);
    assert.match(renderToString(h(Calendar, { defaultValue: '2026-11-23', locale: 'fr-FR' })), />novembre 2026</);
  });

  it('server HTML does not depend on how the engine spaces Intl output (rule 7)', () => {
    // V8 13 (Node 24) returns U+202F before AM/PM from formatToParts and
    // formatRange (its format() already prints a space), newer V8 and
    // Chromium a plain space: simulate the older engine and require the
    // same markup, under two host zones.
    const proto = Intl.DateTimeFormat.prototype;
    const { formatToParts, formatRange } = proto;
    const narrow = (s: string) => s.replace(/ /g, ' ');
    const plain = inZone('UTC', renderAll);
    proto.formatToParts = function (this: Intl.DateTimeFormat, d?: number | Date) {
      return formatToParts.call(this, d).map((p) => (p.type === 'literal' ? { ...p, value: narrow(p.value) } : p));
    };
    proto.formatRange = function (this: Intl.DateTimeFormat, a: number | Date, b: number | Date) {
      return narrow(formatRange.call(this, a, b));
    };
    try {
      const narrowUtc = inZone('UTC', renderAll);
      const narrowTaipei = inZone('Asia/Taipei', renderAll);
      assert.deepEqual(narrowUtc, plain);
      assert.deepEqual(narrowTaipei, plain);
    } finally {
      Object.assign(proto, { formatToParts, formatRange });
    }
    assert.ok(plain.every((html) => !/[   ]/.test(html)), 'no engine-specific spaces in server HTML');
  });

  it('zone-dependent text defers with sized placeholders: an instant without timeZone renders empty segments', () => {
    const instant = new Date(Date.UTC(2026, 10, 23, 15, 0));
    const html = inZone('Asia/Tokyo', () => renderToString(h(DateField, { 'aria-label': 'When', granularity: 'minute', defaultValue: instant })));
    assert.match(html, /role="group"[^>]*data-salmon-deferred="true"/);
    const texts = [...html.matchAll(/role="spinbutton"[^>]*>([^<]*)</g)].map((m) => m[1]);
    assert.equal(texts.length, 6, 'month, day, year, hour, minute, day period');
    assert.ok(texts.every((t) => t === ''), texts.join(','));
    // With timeZone the same instant renders on the server.
    const zoned = renderToString(h(DateField, { 'aria-label': 'When', granularity: 'minute', defaultValue: instant, timeZone: 'Asia/Tokyo' }));
    assert.doesNotMatch(zoned, /data-salmon-deferred/);
    // The placeholder keeps its size: the same segment elements and literals as the rendered value.
    const shape = (x: string) => [(x.match(/role="spinbutton"/g) ?? []).length, (x.match(/salmon-date-field__literal/g) ?? []).length];
    assert.deepEqual(shape(html), shape(zoned));
    assert.match(zoned, /aria-valuenow="24"/);
  });
});

describe('no popup or preset evaluation on the server', () => {
  it('defaultOpen pickers render a closed trigger and never call preset functions', () => {
    let calls = 0;
    const preset = () => {
      calls++;
      return { start: '2026-11-24', end: '2026-11-26' };
    };
    const html = [
      renderToString(h(DatePicker, { 'aria-label': 'Date', defaultValue: '2026-11-23', defaultOpen: true })),
      renderToString(h(DatePicker, { 'aria-label': 'When', granularity: 'minute', defaultValue: '2026-11-23T10:00', defaultOpen: true })),
      renderToString(h(DateRangePicker, { 'aria-label': 'Stay', defaultOpen: true, presets: [{ label: 'Next 3 days', value: preset }] })),
      renderToString(h(TimePicker, { 'aria-label': 'Alarm', defaultValue: '07:30', defaultOpen: true, step: 1 })),
    ].join('\n');
    assert.equal(calls, 0);
    assert.doesNotMatch(html, /salmon-picker__popup|role="dialog"|role="listbox"|role="option"|role="grid"|Next 3 days/);
    assert.equal((html.match(/aria-expanded="false"/g) ?? []).length, 4);
  });
});

describe('React Compiler compatible renders', () => {
  it('renders without browser globals, without reading the clock, and identically twice', () => {
    assert.equal(typeof window, 'undefined');
    assert.equal(typeof document, 'undefined');
    const RealDate = Date;
    const reads: string[] = [];
    class TrappedDate extends RealDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) reads.push('new Date()');
        super(...(args as [number]));
      }
      static override now(): number {
        reads.push('Date.now()');
        return RealDate.now();
      }
    }
    globalThis.Date = TrappedDate as DateConstructor;
    let first: string[];
    let second: string[];
    try {
      first = renderAll();
      second = renderAll();
      // A calendar with no date renders its busy frame without asking for today.
      renderToString(h(Calendar, {}));
    } finally {
      globalThis.Date = RealDate;
    }
    assert.deepEqual(reads, []);
    assert.deepEqual(first, second);
  });

  it('component modules have no module-level mutable state and no forwardRef, cloneElement or Children', () => {
    const dirs = ['calendar', 'date-field', 'date-picker', 'date-range-picker', 'time-picker'];
    const files = [
      ...dirs.flatMap((d) => readdirSync(new URL(`${d}/`, src)).filter((f) => /\.tsx?$/.test(f)).map((f) => `${d}/${f}`)),
      'internal/picker.tsx',
      'internal/picker-popup.tsx',
      'internal/picker-values.ts',
      'internal/time-list.ts',
      'internal/TimeList.tsx',
    ];
    assert.ok(files.length >= 14, files.join(', '));
    for (const file of files) {
      const code = readFileSync(new URL(file, src), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      assert.doesNotMatch(code, /^(export\s+)?(let|var)\s/m, `${file}: module-level let / var`);
      assert.doesNotMatch(code, /\bforwardRef\b|\bcloneElement\b|\bChildren\./, `${file}: forwardRef / cloneElement / Children`);
      // Browser globals only inside handlers and effects: never at module level.
      assert.doesNotMatch(code, /^(export\s+)?const\s+\w+\s*=\s*(window|document|navigator|matchMedia|localStorage)\b/m, `${file}: module-level browser global`);
    }
  });
});

describe('built-in icons', () => {
  it('trigger and clear buttons are labelled and carry a CSS icon, with no icon markup', () => {
    const html = renderAll().join('\n');
    const triggers = [...html.matchAll(/<button[^>]*class="salmon-picker__trigger"[^>]*>/g)].map((m) => m[0]);
    assert.equal(triggers.length, 4);
    assert.deepEqual(
      triggers.map((t) => /data-icon="(\w+)"/.exec(t)?.[1]),
      ['calendar', 'calendar', 'calendar', 'time'],
    );
    for (const t of triggers) assert.match(t, /aria-label="[^"]+"/);
    const clears = [...html.matchAll(/<button[^>]*class="salmon-picker__clear"[^>]*>/g)].map((m) => m[0]);
    assert.equal(clears.length, 3);
    for (const c of clears) assert.match(c, /aria-label="Clear"/);
    assert.doesNotMatch(html, /<svg|<img/);
    // The icons are drawn by the shared picker shell (styles/picker.css) with currentColor (and
    // system colors in forced colors); every picker stylesheet carries it, the core theme does not.
    const shell = readFileSync(new URL('../styles/picker.css', import.meta.url), 'utf8');
    assert.match(shell, /\.salmon-picker__trigger\[data-icon=['"]?calendar['"]?\]::before/);
    assert.match(shell, /\.salmon-picker__trigger\[data-icon=['"]?time['"]?\]::before/);
    assert.match(shell, /\.salmon-picker__clear::before/);
    assert.match(shell, /@media \(forced-colors: active\)[\s\S]*\.salmon-picker__clear::before/);
    for (const css of ['date-picker.css', 'date-range-picker.css', 'time-picker.css']) {
      assert.ok(readFileSync(new URL(css, dist), 'utf8').includes(shell), css);
    }
    assert.doesNotMatch(readFileSync(new URL('calendar.css', dist), 'utf8'), /\.salmon-picker/);
    assert.doesNotMatch(readFileSync(new URL(import.meta.resolve('@salmonui/core/styles.css')), 'utf8'), /\.salmon-picker/);
  });
});
