import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement as h } from 'react';
import { renderToString } from 'react-dom/server';
import { Calendar, RangeCalendar, type CalendarDayContext } from '@salmonui/calendars/calendar';
import { DateField } from '@salmonui/calendars/date-picker';
import { TimeField } from '@salmonui/calendars/time-picker';

// Server rendering of the calendar components:
// deterministic markup from props only,
// no host locale, zone or today in server HTML, the Calendar grid
// structure, and the segmented fields. Interaction is covered by
// tests/browser/calendars.spec.ts.

const render = (el: Parameters<typeof renderToString>[0]) => renderToString(el);
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;
const attr = (html: string, day: string, name: string) => new RegExp(`<td[^>]*data-day="${day}"[^>]*>`).exec(html)?.[0].match(new RegExp(`${name}="([^"]*)"`))?.[1];

describe('Calendar server render', () => {
  it('renders the APG grid labelled by the heading with the selected day focusable', () => {
    const html = render(h(Calendar, { defaultValue: '2026-11-23', locale: 'en-US' }));
    assert.match(html, /<button[^>]*id="([^"]+)"[^>]*class="salmon-calendar__heading"[^>]*>November 2026<\/button>/);
    const heading = /id="([^"]+)" class="salmon-calendar__heading"/.exec(html)?.[1];
    assert.match(html, new RegExp(`<table role="grid" class="salmon-calendar__grid" aria-labelledby="${heading}"`));
    assert.equal(attr(html, '2026-11-23', 'aria-selected'), 'true');
    assert.equal(attr(html, '2026-11-23', 'tabindex'), '0');
    assert.equal(attr(html, '2026-11-24', 'tabindex'), '-1');
    assert.equal(attr(html, '2026-11-23', 'aria-label'), 'Monday, November 23, 2026');
    assert.equal(count(html, /tabindex="0"/g), 1);
    assert.match(html, /<th scope="col" abbr="Sunday" class="salmon-calendar__weekday">Sun<\/th>/);
    assert.match(html, /aria-label="Previous month"/);
    assert.match(html, /aria-label="Next month"/);
  });

  it('className, style and DOM props reach the root; values are deterministic', () => {
    const html = render(h(Calendar, { defaultValue: '2026-11-23', className: 'mine', style: { width: 300 }, id: 'cal', 'data-x': '1' } as never));
    assert.match(html, /^<div style="width:300px" id="cal" data-x="1" class="salmon-calendar mine"/);
    assert.equal(render(h(Calendar, { defaultValue: '2026-11-23' })), render(h(Calendar, { defaultValue: '2026-11-23' })));
  });
});

describe('Calendar SSR rules', () => {
  it('server HTML never marks today and never reads the host zone', () => {
    const html = render(h(Calendar, { defaultValue: new Date().toISOString().slice(0, 10) }));
    assert.doesNotMatch(html, /aria-current/);
    assert.doesNotMatch(html, /data-today/);
    // A Date (an instant) without timeZone is deferred: nothing is selected on the server.
    const instant = render(h(Calendar, { defaultValue: new Date('2026-11-23T12:00:00Z'), defaultFocusedValue: '2026-11-01' }));
    assert.doesNotMatch(instant, /aria-selected="true"/);
    // With an explicit timeZone the instant renders on the server.
    const zoned = render(h(Calendar, { defaultValue: new Date('2026-11-23T23:30:00Z'), timeZone: 'Asia/Tokyo' }));
    assert.equal(attr(zoned, '2026-11-24', 'aria-selected'), 'true');
  });

  it('a calendar with no date to show renders a sized frame with aria-busy', () => {
    const html = render(h(Calendar, {}));
    assert.match(html, /<div class="salmon-calendar" data-view="month" aria-busy="true">/);
    assert.equal(count(html, /<td class="salmon-calendar__day" data-empty=""><\/td>/g), 42);
    assert.doesNotMatch(html, /data-day=/);
    const focused = render(h(Calendar, { defaultFocusedValue: '2026-02-10' }));
    assert.doesNotMatch(focused, /aria-busy/);
    assert.match(focused, />February 2026</);
  });
});

describe('Calendar options', () => {
  it('firstDayOfWeek and the locale default', () => {
    const weekdays = (html: string) => [...html.matchAll(/abbr="([^"]+)" class="salmon-calendar__weekday"/g)].map((m) => m[1]);
    assert.equal(weekdays(render(h(Calendar, { defaultValue: '2026-11-23' })))[0], 'Sunday');
    assert.equal(weekdays(render(h(Calendar, { defaultValue: '2026-11-23', locale: 'de-DE' })))[0], 'Montag');
    assert.equal(weekdays(render(h(Calendar, { defaultValue: '2026-11-23', firstDayOfWeek: 3 })))[0], 'Wednesday');
  });

  it('week numbers are labelled row headers that follow the week rule', () => {
    const iso = render(h(Calendar, { defaultValue: '2026-01-15', showWeekNumbers: true, firstDayOfWeek: 1, weekRule: 'firstFourDayWeek' }));
    assert.match(iso, /<th scope="col" class="salmon-calendar__week-header"[^>]*>Wk<\/th>/);
    assert.match(iso, /<th scope="row" class="salmon-calendar__week-number" aria-label="Week 1">1<\/th>/);
    const de = render(h(Calendar, { defaultValue: '2027-01-15', showWeekNumbers: true, locale: 'de-DE' }));
    // 2026-12-28..2027-01-03 is ISO week 53 (de-DE: Monday, minimal days 4).
    assert.match(de, /aria-label="Woche 53"|aria-label="Week 53"/);
  });


  it('weekdayFormat narrow, short and long', () => {
    const first = (f: 'narrow' | 'short' | 'long') => /class="salmon-calendar__weekday">([^<]+)</.exec(render(h(Calendar, { defaultValue: '2026-11-23', weekdayFormat: f })))?.[1];
    assert.deepEqual([first('narrow'), first('short'), first('long')], ['S', 'Sun', 'Sunday']);
  });

  it('locale digits, names and calendar systems; values stay ISO', () => {
    const ar = render(h(Calendar, { defaultValue: '2026-11-23', locale: 'ar-EG' }));
    assert.match(ar, /data-day="2026-11-23"[^>]*>٢٣</);
    const isl = render(h(Calendar, { defaultValue: '2026-11-23', locale: 'en-US', calendar: 'islamic-umalqura' }));
    assert.match(isl, /class="salmon-calendar__heading"[^>]*>Jumada II 1448 AH</);
    // The Islamic month starts on 2026-11-11 (day 1) and the selected ISO day shows its Islamic day number.
    assert.match(isl, /data-day="2026-11-11"[^>]*>1</);
    assert.match(isl, /data-day="2026-11-23"[^>]*>13</);
    assert.doesNotMatch(isl, /data-day="2026-11-10"[^>]*>\d/);
    const jp = render(h(Calendar, { defaultValue: '2026-11-23', locale: 'ja-JP-u-ca-japanese' }));
    assert.match(jp, />令和8年11月</);
  });

  it('outside days are empty by default and rendered with showOutsideDays', () => {
    const hidden = render(h(Calendar, { defaultValue: '2026-11-23' }));
    assert.doesNotMatch(hidden, /data-day="2026-12-01"/);
    const shown = render(h(Calendar, { defaultValue: '2026-11-23', showOutsideDays: true }));
    assert.match(shown, /data-day="2026-12-01"[^>]*data-outside="true"|data-outside="true"[^>]*data-day="2026-12-01"/);
  });

  it('renderDay and getDayProps run for rendered cells only', () => {
    const seen: string[] = [];
    const html = render(
      h(Calendar, {
        defaultValue: '2026-11-23',
        renderDay: (ctx: CalendarDayContext) => (ctx.date.day === 25 ? h('b', null, 'X') : String(ctx.date.day)),
        getDayProps: (ctx: CalendarDayContext) => {
          seen.push(String(ctx.date));
          return ctx.date.day === 25 ? { className: 'holiday', title: 'Holiday', 'data-kind': 'holiday' } : undefined;
        },
      }),
    );
    assert.equal(seen.length, 30);
    assert.match(html, /<td[^>]*class="salmon-calendar__day holiday"[^>]*title="Holiday"|<td[^>]*title="Holiday"[^>]*class="salmon-calendar__day holiday"/);
    assert.match(html, /data-kind="holiday"/);
    assert.match(html, /<b>X<\/b>/);
  });

  it('year and decade views', () => {
    const year = render(h(Calendar, { defaultValue: '2026-11-23', defaultView: 'year' }));
    assert.match(year, /data-view="year"/);
    assert.equal(count(year, /class="salmon-calendar__cell"/g), 12);
    assert.match(year, /data-salmon-focus="">Nov</);
    const decade = render(h(Calendar, { defaultValue: '2026-11-23', defaultView: 'decade' }));
    assert.match(decade, />2020 – 2029</);
    assert.equal(count(decade, /class="salmon-calendar__cell"/g), 12);
    // maxView limits the heading; minView / granularity limit the deepest view.
    assert.match(render(h(Calendar, { defaultValue: '2026-11-23', maxView: 'month' })), /class="salmon-calendar__heading" aria-live="polite" aria-disabled="true"/);
    assert.match(render(h(Calendar, { defaultValue: '2026-11-23', granularity: 'month' })), /data-view="year"/);
  });
});

describe('Calendar state attributes', () => {
  it('min, max and isDateDisabled mark cells aria-disabled and data-disabled', () => {
    const html = render(h(Calendar, { defaultValue: '2026-11-23', min: '2026-11-05', max: '2026-11-25', isDateDisabled: (d) => d.day === 10 }));
    assert.equal(attr(html, '2026-11-04', 'aria-disabled'), 'true');
    assert.equal(attr(html, '2026-11-26', 'aria-disabled'), 'true');
    assert.equal(attr(html, '2026-11-10', 'data-disabled'), 'true');
    assert.equal(attr(html, '2026-11-11', 'aria-disabled'), undefined);
    // Both bounds are inside November: previous and next are disabled.
    assert.match(html, /aria-label="Previous month" disabled=""/);
    assert.match(html, /aria-label="Next month" disabled=""/);
  });

  it('RangeCalendar marks the range ends and the days between', () => {
    const html = render(h(RangeCalendar, { defaultValue: { start: '2026-11-03', end: '2026-11-09' }, visibleMonths: 2 }));
    assert.equal(count(html, /role="grid"/g), 2);
    assert.match(html, />November 2026<span> – December 2026<\/span></);
    assert.equal(attr(html, '2026-11-03', 'data-range-start'), 'true');
    assert.equal(attr(html, '2026-11-09', 'data-range-end'), 'true');
    assert.equal(attr(html, '2026-11-05', 'data-in-range'), 'true');
    assert.equal(attr(html, '2026-11-05', 'aria-selected'), 'true');
    assert.equal(attr(html, '2026-11-10', 'aria-selected'), 'false');
    assert.match(html, /role="status" aria-live="polite"/);
  });
});

describe('DateField and TimeField server render', () => {
  it('one labelled spinbutton per segment in the locale order, literals aria-hidden', () => {
    const html = render(h(DateField, { label: 'Start', defaultValue: '2026-11-23' }));
    const label = /<span id="([^"]+)" class="salmon-date-field__label">Start<\/span>/.exec(html)?.[1];
    assert.ok(label);
    assert.match(html, new RegExp(`role="group" class="salmon-date-field__group" aria-labelledby="${label}"`));
    const segs = [...html.matchAll(/role="spinbutton"[^>]*data-type="(\w+)"[^>]*aria-label="(\w+)"[^>]*aria-valuenow="(\d+)"[^>]*aria-valuemin="(\d+)" aria-valuemax="(\d+)" aria-valuetext="([^"]+)"/g)].map((m) => m.slice(1).join(','));
    assert.deepEqual(segs, ['month,month,11,1,12,11', 'day,day,23,1,30,23', 'year,year,2026,1,9999,2026']);
    assert.equal(count(html, /class="salmon-date-field__literal" aria-hidden="true">\/</g), 2);
    assert.match(html, /inputMode="numeric"|inputmode="numeric"/);
    const de = render(h(DateField, { 'aria-label': 'Datum', locale: 'de-DE', defaultValue: '2026-11-23' }));
    assert.deepEqual([...de.matchAll(/data-type="(\w+)"/g)].map((m) => m[1]), ['day', 'month', 'year']);
  });

  it('empty segments show localeText placeholders and an empty value text', () => {
    const html = render(h(DateField, { 'aria-label': 'Date', localeText: { dayPlaceholder: 'TT' } }));
    assert.match(html, /aria-valuetext="Empty"[^>]*>mm</);
    assert.match(html, />TT</);
    assert.doesNotMatch(html, /aria-valuenow/);
  });

  it('a zoned instant without timeZone is deferred to the client', () => {
    const html = render(h(DateField, { 'aria-label': 'When', defaultValue: new Date('2026-11-23T12:00:00Z') }));
    assert.match(html, /data-salmon-deferred="true"/);
    assert.doesNotMatch(html, /aria-valuenow/);
    const zoned = render(h(DateField, { 'aria-label': 'When', defaultValue: new Date('2026-11-23T23:30:00Z'), timeZone: 'Asia/Tokyo' }));
    assert.match(zoned, /aria-valuenow="24"/);
  });

  it('TimeField: 12-hour clock with a day period, hourCycle override, seconds', () => {
    const us = render(h(TimeField, { 'aria-label': 'Time', defaultValue: '14:30' }));
    assert.deepEqual([...us.matchAll(/data-type="(\w+)"/g)].map((m) => m[1]), ['hour', 'minute', 'dayPeriod']);
    assert.match(us, /data-type="dayPeriod"[^>]*aria-valuetext="PM"/);
    const h23 = render(h(TimeField, { 'aria-label': 'Time', defaultValue: '14:30:15', hourCycle: 'h23', granularity: 'second' }));
    assert.deepEqual([...h23.matchAll(/data-type="(\w+)"[^>]*aria-valuenow="(\d+)"/g)].map((m) => `${m[1]}=${m[2]}`), ['hour=14', 'minute=30', 'second=15']);
  });

  it('a date-time field and the form value input post ISO', () => {
    const html = render(h(DateField, { 'aria-label': 'Meeting', granularity: 'minute', defaultValue: '2026-11-23T09:05', name: 'meeting', hourCycle: 'h23' }));
    assert.deepEqual([...html.matchAll(/data-type="(\w+)"/g)].map((m) => m[1]), ['month', 'day', 'year', 'hour', 'minute']);
    assert.match(html, /<input class="salmon-date-field__input" readOnly="" tabindex="-1" aria-hidden="true" name="meeting" value="2026-11-23T09:05"\/>/);
  });

  it('out-of-range and disabled values are kept and marked aria-invalid (non-strict)', () => {
    const html = render(h(DateField, { 'aria-label': 'Date', defaultValue: '2026-11-23', max: '2026-11-01', errorMessage: 'Too late' }));
    assert.match(html, /data-invalid="true"/);
    assert.match(html, /role="group"[^>]*aria-invalid="true"/);
    assert.match(html, /class="salmon-date-field__error">Too late</);
    const disabled = render(h(DateField, { 'aria-label': 'Date', defaultValue: '2026-11-22', isDateDisabled: (d: { readonly day: number }) => d.day === 22 }));
    assert.match(disabled, /aria-invalid="true"/);
  });
});
