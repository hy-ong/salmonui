import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { DatePicker } from '@salmonui/calendars/date-picker';
import { DateRangePicker, getRangeDays } from '@salmonui/calendars/date-range-picker';
import { TimePicker } from '@salmonui/calendars/time-picker';
import { isoOf } from '../dist/date-picker/DatePicker.js';
import { offsetAt, toEpoch } from '../../core/dist/internal/dates/zone.js';
import { wallOf } from '../../core/dist/internal/dates/plain.js';
import { splitRangeText } from '../dist/date-range-picker/DateRangePicker.js';
import { nearestOption, stepOption, timeListKey, timeOptions, VIRTUAL_THRESHOLD } from '../dist/internal/time-list.js';

// Calendar pickers: pure helpers and server rendering.

const render = (el: Parameters<typeof renderToString>[0]): string => renderToString(el);
const segmentsOf = (html: string): string[] => [...html.matchAll(/role="spinbutton"[^>]*>([^<]*)</g)].map((m) => m[1] as string);

describe('picker helpers', () => {
  it('getRangeDays counts both ends', () => {
    assert.equal(getRangeDays({ start: { year: 2026, month: 11, day: 2 }, end: { year: 2026, month: 11, day: 6 } }), 5);
    assert.equal(getRangeDays({ start: { year: 2026, month: 12, day: 31 }, end: { year: 2027, month: 1, day: 1 } }), 2);
    assert.equal(getRangeDays(null), 0);
  });

  it('the zoned ISO value of a wall time in a DST gap is the wall time of its instant', () => {
    // DatePicker and DateField print `isoOf(wallOf(epoch, zone), ..., offsetAt(epoch, zone))`.
    const gap = { year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0, millisecond: 0 };
    const epoch = toEpoch(gap, 'America/New_York')!;
    assert.equal(epoch, Date.UTC(2026, 2, 8, 7, 30));
    const iso = isoOf(wallOf(epoch, 'America/New_York') as never, 'minute', offsetAt(epoch, 'America/New_York') ?? undefined);
    assert.equal(iso, '2026-03-08T03:30-04:00');
    assert.equal(new Date(iso).getTime(), epoch);
    // Outside a gap the wall time is unchanged.
    const before = toEpoch({ ...gap, hour: 1 }, 'America/New_York')!;
    assert.equal(isoOf(wallOf(before, 'America/New_York') as never, 'minute', offsetAt(before, 'America/New_York') ?? undefined), '2026-03-08T01:30-05:00');
  });

  it('ISO form values per granularity, with an offset for zoned date-times', () => {
    const v = { year: 2026, month: 3, day: 7, hour: 9, minute: 5, second: 4 } as never;
    assert.equal(isoOf(v, 'day'), '2026-03-07');
    assert.equal(isoOf(v, 'month'), '2026-03');
    assert.equal(isoOf(v, 'year'), '2026');
    assert.equal(isoOf(v, 'minute'), '2026-03-07T09:05');
    assert.equal(isoOf(v, 'second'), '2026-03-07T09:05:04');
    assert.equal(isoOf(v, 'minute', 60), '2026-03-07T09:05+01:00');
    assert.equal(isoOf(v, 'minute', -330), '2026-03-07T09:05-05:30');
    assert.equal(isoOf(v, 'minute', 0), '2026-03-07T09:05Z');
    assert.equal(isoOf(null, 'day'), '');
  });

  it('pasted range text splits on the separator, an en dash, a slash or " to "', () => {
    assert.deepEqual(splitRangeText('2026-11-03 – 2026-11-09'), ['2026-11-03', '2026-11-09']);
    assert.deepEqual(splitRangeText('2026-11-03/2026-11-09'), ['2026-11-03', '2026-11-09']);
    assert.deepEqual(splitRangeText('2026-11-03 to 2026-11-09'), ['2026-11-03', '2026-11-09']);
    assert.deepEqual(splitRangeText('2026-11-03 - 2026-11-09'), ['2026-11-03', '2026-11-09']);
    assert.deepEqual(splitRangeText('3.11.2026 bis 9.11.2026', ' bis '), ['3.11.2026', '9.11.2026']);
    assert.equal(splitRangeText('2026-11-03'), null);
  });

  it('options at step between min and max; 1,440 per day at step 1', () => {
    const opts = timeOptions(30, { hour: 8, minute: 0 }, { hour: 18, minute: 0 });
    assert.equal(opts.length, 21);
    assert.equal(String(opts[0]), '08:00:00');
    assert.equal(String(opts.at(-1)), '18:00:00');
    assert.equal(timeOptions(1).length, 1440);
    assert.ok(timeOptions(1).length > VIRTUAL_THRESHOLD);
    assert.equal(timeOptions(30).length, 48);
    assert.equal(String(timeOptions(45, { hour: 9, minute: 0 }, { hour: 11, minute: 0 }).at(-1)), '10:30:00');
  });

  it('nearest option and disabled skipping', () => {
    const opts = timeOptions(30);
    assert.equal(nearestOption(opts, { hour: 14, minute: 0 }), 28);
    assert.equal(nearestOption(opts, { hour: 14, minute: 10 }), 29);
    assert.equal(nearestOption(opts, null), -1);
    const disabled = (i: number) => i === 3 || i === 4;
    assert.equal(stepOption(10, 2, 1, disabled), 5);
    assert.equal(stepOption(10, 5, -1, disabled), 2);
    assert.equal(stepOption(10, 9, 1, disabled), 9);
    assert.equal(timeListKey('Home', 10, 5, (i) => i === 0), 1);
    assert.equal(timeListKey('End', 10, 5, (i) => i === 9), 8);
    assert.equal(timeListKey('Enter', 10, 5, () => false), 'select');
    assert.equal(timeListKey('a', 10, 5, () => false), null);
  });
});

describe('picker server rendering', () => {
  it('deterministic markup, segments from the value, no popup', () => {
    const el = createElement(DatePicker, { label: 'Arrival', defaultValue: '2026-11-23', name: 'arrival' });
    const a = render(el);
    assert.equal(a, render(el));
    assert.deepEqual(segmentsOf(a), ['11', '23', '2026']);
    assert.doesNotMatch(a, /salmon-picker__popup|role="dialog"|role="grid"/);
    assert.match(a, /aria-haspopup="dialog"[^>]*aria-expanded="false"|aria-expanded="false"[^>]*aria-haspopup="dialog"/);
    assert.match(a, /<input[^>]*class="salmon-picker__form-value"[^>]*name="arrival"[^>]*value="2026-11-23"/);
  });

  it('defaultOpen renders no popup on the server', () => {
    const html = render(createElement(DatePicker, { defaultValue: '2026-11-23', defaultOpen: true, 'aria-label': 'Date' }));
    assert.doesNotMatch(html, /salmon-picker__popup/);
  });

  it('disabled, placeholder, className, style and DOM props', () => {
    const html = render(createElement(DatePicker, { label: 'D', disabled: true, placeholder: 'Choose a date', className: 'mine', style: { minInlineSize: 240 }, 'data-extra': 'x', title: 'Pick' }));
    assert.match(html, /class="salmon-date-picker salmon-picker mine"[^>]*style="min-inline-size:240px"/);
    assert.match(html, /data-disabled=""/);
    assert.match(html, /<button[^>]*disabled=""[^>]*class="salmon-picker__trigger"|class="salmon-picker__trigger"[^>]*disabled=""/);
    assert.match(html, /class="salmon-picker__placeholder"[^>]*>Choose a date</);
    assert.match(html, /class="salmon-picker__control"[^>]*>|data-extra="x"/);
    assert.match(html, /data-extra="x"[^>]*title="Pick"|title="Pick"[^>]*data-extra="x"/);
  });

  it('an instant without timeZone renders empty segments on the server; with timeZone it renders', () => {
    const instant = new Date(Date.UTC(2026, 10, 23, 15, 0));
    const deferred = render(createElement(DatePicker, { 'aria-label': 'When', granularity: 'minute', defaultValue: instant }));
    assert.ok(segmentsOf(deferred).every((s) => !/\d/.test(s)), segmentsOf(deferred).join(','));
    const zoned = render(createElement(DatePicker, { 'aria-label': 'When', granularity: 'minute', value: instant, timeZone: 'Asia/Tokyo', name: 'when' }));
    assert.deepEqual(segmentsOf(zoned).slice(0, 5), ['11', '24', '2026', '12', '00']);
    assert.match(zoned, /name="when"[^>]*value="2026-11-24T00:00\+09:00"/);
  });

  it('two fields in one labelled group, separator, interval form value', () => {
    const html = render(createElement(DateRangePicker, { label: 'Stay', defaultValue: { start: '2026-11-02', end: '2026-11-06' }, name: 'stay', separator: ' to ' }));
    assert.match(html, /role="group"[^>]*aria-labelledby="[^"]+label"/);
    assert.match(html, /aria-label="Start date"/);
    assert.match(html, /aria-label="End date"/);
    assert.match(html, /class="salmon-date-range-picker__separator" aria-hidden="true"> to </);
    assert.match(html, /name="stay"[^>]*value="2026-11-02\/2026-11-06"/);
    const two = render(createElement(DateRangePicker, { 'aria-label': 'Trip', defaultValue: { start: '2026-12-01', end: '2026-12-03' }, startName: 'from', endName: 'to' }));
    assert.match(two, /name="from"[^>]*value="2026-12-01"/);
    assert.match(two, /name="to"[^>]*value="2026-12-03"/);
  });

  it('time segments, listbox trigger, HH:mm form value', () => {
    const html = render(createElement(TimePicker, { label: 'Alarm', defaultValue: '07:30', name: 'alarm', hourCycle: 'h23' }));
    assert.deepEqual(segmentsOf(html), ['07', '30']);
    assert.match(html, /aria-haspopup="listbox"/);
    assert.match(html, /name="alarm"[^>]*value="07:30"/);
  });

  it('required renders the form value input with required and no type', () => {
    const html = render(createElement(DatePicker, { 'aria-label': 'Due', required: true }));
    const input = /<input[^>]*>/.exec(html)?.[0] ?? '';
    assert.match(input, /required=""/);
    assert.match(input, /tabindex="-1"/);
    assert.match(input, /aria-hidden="true"/);
    assert.doesNotMatch(input, /type=/);
  });
});
