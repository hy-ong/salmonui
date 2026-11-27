import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addMonths,
  calendarLabels,
  calendarSystem,
  compare,
  decadeGrid,
  fieldFormat,
  formatMessage,
  fromDays,
  getRangeDays,
  isInstant,
  localeDigits,
  localeFirstDay,
  localeMinimalDays,
  localeWeekRule,
  monthGrid,
  offsetAt,
  parseFieldText,
  parseIso,
  plainDate,
  resolveCalendar,
  segmentText,
  skeletonOptions,
  toDate,
  toDays,
  toEpoch,
  toPlainDate,
  toPlainDateTime,
  toPlainTime,
  tokenizePattern,
  typeDigit,
  wallAt,
  weekNumber,
  yearGrid,
} from '../dist/internal/dates/index.js';

// Internal date module: values, normalization, ISO, time zones with DST, week rules,
// calendar systems, Intl labels, segments and parsing.

const iso = (n: number) => String(fromDays(n));
const day = (s: string) => toDays(toPlainDate(s)!);

describe('plain values', () => {
  it('PlainDate, PlainTime and PlainDateTime are frozen with ISO toString / toJSON', () => {
    const d = toPlainDate('2026-11-23')!;
    assert.deepEqual({ ...d }, { year: 2026, month: 11, day: 23 });
    assert.ok(Object.isFrozen(d));
    assert.equal(String(d), '2026-11-23');
    assert.equal(JSON.stringify({ d }), '{"d":"2026-11-23"}');
    const t = toPlainTime('14:30:05.250')!;
    assert.deepEqual({ ...t }, { hour: 14, minute: 30, second: 5, millisecond: 250 });
    assert.equal(String(t), '14:30:05.250');
    const dt = toPlainDateTime('2026-11-23T09:05')!;
    assert.equal(String(dt), '2026-11-23T09:05:00');
    assert.equal(JSON.stringify(dt), '"2026-11-23T09:05:00"');
    assert.ok(Object.isFrozen(dt));
  });

  it('*Like inputs accept Temporal-shaped objects as they are', () => {
    // Temporal.PlainDate / PlainTime / PlainDateTime expose the same field names.
    const temporalLike = { year: 2026, month: 2, day: 28, calendarId: 'iso8601', toString: () => '2026-02-28' };
    assert.equal(String(toPlainDate(temporalLike)), '2026-02-28');
    assert.equal(String(toPlainTime({ hour: 7, minute: 5, second: 0, millisecond: 0, microsecond: 0 })), '07:05:00');
    assert.equal(String(toPlainDateTime({ year: 2026, month: 1, day: 2, hour: 3, minute: 4 })), '2026-01-02T03:04:00');
    // Outputs are accepted back as inputs (and returned as is).
    const d = plainDate(2026, 5, 6);
    assert.equal(toPlainDate(d), d);
  });

  it('date math on day numbers: add months clamps, compare, range days', () => {
    assert.equal(String(addMonths({ year: 2026, month: 1, day: 31 }, 1)), '2026-02-28');
    assert.equal(String(addMonths({ year: 2024, month: 1, day: 31 }, 1)), '2024-02-29');
    assert.equal(String(addMonths({ year: 2026, month: 3, day: 31 }, -13)), '2025-02-28');
    assert.ok(compare(toPlainDate('2026-01-01')!, toPlainDate('2026-01-02')!) < 0);
    assert.ok(compare(toPlainDateTime('2026-01-01T10:00')!, toPlainDateTime('2026-01-01T09:00')!) > 0);
    assert.equal(getRangeDays({ start: toPlainDate('2026-11-03')!, end: toPlainDate('2026-11-09')! }), 7);
    assert.equal(getRangeDays(null), 0);
    assert.equal(iso(day('0050-06-15')), '0050-06-15');
  });
});

describe('Date and string inputs', () => {
  it('a Date is an instant converted to wall time in the time zone', () => {
    const instant = new Date('2026-11-23T23:30:00Z');
    assert.equal(String(toPlainDate(instant, 'UTC')), '2026-11-23');
    assert.equal(String(toPlainDate(instant, 'Asia/Tokyo')), '2026-11-24');
    assert.equal(String(toPlainDateTime(instant, 'America/Los_Angeles')), '2026-11-23T15:30:00');
    assert.equal(String(toPlainTime(instant, 'Europe/Berlin')), '00:30:00');
    assert.equal(isInstant(instant), true);
  });

  it('ISO 8601 date, time and date-time strings; an offset or Z makes an instant', () => {
    assert.equal(String(toPlainDate('2026-11-23')), '2026-11-23');
    assert.equal(String(toPlainDate('2026-11')), '2026-11-01');
    assert.equal(String(toPlainTime('14:30')), '14:30:00');
    assert.equal(String(toPlainDateTime('2026-11-23T14:30:05')), '2026-11-23T14:30:05');
    assert.equal(isInstant('2026-11-23T14:30'), false);
    assert.equal(isInstant('2026-11-23T14:30Z'), true);
    assert.equal(String(toPlainDateTime('2026-11-23T14:30+09:00', 'UTC')), '2026-11-23T05:30:00');
    assert.deepEqual(parseIso('2026-11-23T14:30-05:30')?.offset, -330);
  });

  it('invalid inputs are empty and never throw', () => {
    for (const bad of ['2026-02-30', '2026-13-01', '23/11/2026', 'tomorrow', '', '25:00']) {
      assert.equal(toPlainDate(bad), null, bad);
      assert.equal(toPlainDateTime(bad), null, bad);
    }
    assert.equal(toPlainTime('24:00'), null);
    assert.equal(toPlainDate(new Date(Number.NaN)), null);
    assert.equal(toPlainDate({ year: 2026, month: 2, day: 30 }), null);
    assert.equal(toPlainDate(null), null);
    assert.equal(toPlainDate(42 as unknown as string), null);
  });
});

describe('IANA time zones with DST', () => {
  it('offsets from Intl formatToParts follow DST', () => {
    assert.equal(offsetAt(Date.UTC(2026, 0, 15), 'Europe/Berlin'), 60);
    assert.equal(offsetAt(Date.UTC(2026, 6, 15), 'Europe/Berlin'), 120);
    assert.equal(offsetAt(Date.UTC(2026, 6, 15), 'America/New_York'), -240);
    assert.equal(offsetAt(Date.UTC(2026, 6, 15), 'Asia/Kolkata'), 330);
    assert.equal(offsetAt(0, 'Not/AZone'), null);
    assert.deepEqual(wallAt(Date.UTC(2026, 10, 23, 23, 30), 'Asia/Tokyo'), { year: 2026, month: 11, day: 24, hour: 8, minute: 30, second: 0, millisecond: 0 });
  });

  it("wall time to instant resolves gaps and overlaps like Temporal 'compatible'", () => {
    const w = (month: number, d: number, hour: number, minute = 30) => ({ year: 2026, month, day: d, hour, minute, second: 0, millisecond: 0 });
    // Spring forward 2026-03-08 02:00 -> 03:00 in New York: 02:30 does not exist and moves forward to 03:30 EDT.
    assert.equal(new Date(toEpoch(w(3, 8, 2), 'America/New_York')!).toISOString(), '2026-03-08T07:30:00.000Z');
    // Fall back 2026-11-01 02:00 -> 01:00: 01:30 happens twice; the earlier (EDT) instant wins.
    assert.equal(new Date(toEpoch(w(11, 1, 1), 'America/New_York')!).toISOString(), '2026-11-01T05:30:00.000Z');
    // Ordinary times round-trip.
    assert.equal(new Date(toEpoch(w(7, 1, 12, 0), 'Europe/Berlin')!).toISOString(), '2026-07-01T10:00:00.000Z');
    assert.equal(toDate({ year: 2026, month: 3, day: 29, hour: 2, minute: 30 }, 'Europe/Berlin').toISOString(), '2026-03-29T01:30:00.000Z');
  });
});

describe('week rules', () => {
  it('first day of week from Intl.Locale week info', () => {
    assert.equal(localeFirstDay('en-US'), 0);
    assert.equal(localeFirstDay('de-DE'), 1);
    assert.equal(localeFirstDay('ar-EG'), 6);
    assert.equal(localeFirstDay('en-US-u-fw-mon'), 1);
  });

  it('minimal days and the default week rule from the locale', () => {
    assert.equal(localeMinimalDays('de-DE'), 4);
    assert.equal(localeMinimalDays('en-US'), 1);
    assert.equal(localeWeekRule('fr-FR'), 'firstFourDayWeek');
    assert.equal(localeWeekRule('en-US'), 'firstDay');
  });

  it('week numbers for firstDay, firstFourDayWeek and firstFullWeek', () => {
    // ISO weeks (Monday, four days): 2027-01-01 is a Friday in week 53 of 2026.
    assert.equal(weekNumber(day('2026-01-01'), 1, 'firstFourDayWeek'), 1);
    assert.equal(weekNumber(day('2027-01-01'), 1, 'firstFourDayWeek'), 53);
    assert.equal(weekNumber(day('2026-12-31'), 1, 'firstFourDayWeek'), 53);
    assert.equal(weekNumber(day('2021-01-03'), 1, 'firstFourDayWeek'), 53);
    // US weeks (Sunday, the week of January 1).
    assert.equal(weekNumber(day('2026-01-01'), 0, 'firstDay'), 1);
    assert.equal(weekNumber(day('2026-11-23'), 0, 'firstDay'), 48);
    assert.equal(weekNumber(day('2026-12-26'), 0, 'firstDay'), 52);
    // The week of January 1 is week 1 of the new year.
    assert.equal(weekNumber(day('2026-12-31'), 0, 'firstDay'), 1);
    // First full week: 2026-01-01..03 (Thu-Sat) belong to the last week of 2025.
    assert.equal(weekNumber(day('2026-01-01'), 0, 'firstFullWeek'), 52);
    assert.equal(weekNumber(day('2026-01-04'), 0, 'firstFullWeek'), 1);
  });
});

describe('grids and calendar systems', () => {
  it('month, year and decade grids', () => {
    const g = calendarSystem('gregory');
    const cells = monthGrid(g, day('2026-11-23'), 0);
    assert.equal(cells.length, 42);
    assert.equal(iso(cells[0]!), '2026-11-01');
    assert.equal(iso(monthGrid(g, day('2026-11-23'), 1)[0]!), '2026-10-26');
    assert.deepEqual(yearGrid(g, day('2026-11-23')).map(iso).slice(0, 2), ['2026-01-01', '2026-02-01']);
    const decade = decadeGrid(g, day('2026-11-23')).map(iso);
    assert.equal(decade.length, 12);
    assert.equal(decade[0], '2019-01-01');
    assert.equal(decade[11], '2030-01-01');
  });

  it('islamic-umalqura months are derived from Intl, values stay ISO', () => {
    const sys = calendarSystem('islamic-umalqura');
    assert.equal(sys.gregorian, false);
    const f = sys.fields(day('2026-11-23'));
    assert.deepEqual(f, { year: 1448, month: 6, day: 13 });
    const start = sys.start(1448, 6);
    assert.equal(iso(start), '2026-11-11');
    assert.equal(sys.fields(start).day, 1);
    assert.equal(sys.fields(start - 1).month, 5);
    // Next month starts 29 or 30 days later.
    const len = sys.start(1448, 7) - start;
    assert.ok(len === 29 || len === 30);
    assert.equal(calendarSystem('islamic-civil').gregorian, false);
  });

  it('calendar ids: the -u-ca- extension, else Gregorian', () => {
    assert.equal(resolveCalendar('en-US'), 'gregory');
    assert.equal(resolveCalendar('ja-JP-u-ca-japanese'), 'japanese');
    assert.equal(resolveCalendar('en-US', 'buddhist'), 'buddhist');
    assert.equal(calendarSystem('nonsense').id, 'gregory');
  });

  it('era and year labels for Japanese, Buddhist and ROC calendars', () => {
    const n = day('2026-11-23');
    assert.equal(calendarLabels('ja-JP', calendarSystem('japanese'), 0).month(n), '令和8年11月');
    assert.match(calendarLabels('th-TH', calendarSystem('buddhist'), 0).month(n), /2569/);
    assert.match(calendarLabels('zh-TW', calendarSystem('roc'), 0).month(n), /115/);
    assert.match(calendarLabels('ja-JP', calendarSystem('japanese'), 0).full(n), /令和8年11月23日/);
  });
});

describe('locale, digits and localeText', () => {
  it('month and weekday names, digits and order come from Intl', () => {
    const n = day('2026-11-23');
    const de = calendarLabels('de-DE', calendarSystem('gregory'), 1, 'long');
    assert.equal(de.month(n), 'November 2026');
    assert.equal(de.weekdays[0]?.text, 'Montag');
    const ar = calendarLabels('ar-EG', calendarSystem('gregory'), 6);
    assert.equal(ar.day(n), '٢٣');
    assert.equal(ar.number(48), '٤٨');
    assert.equal(calendarLabels('en-US', calendarSystem('gregory'), 0, 'narrow').weekdays.map((w) => w.text).join(''), 'SMTWTFS');
  });

  it('locale digits are accepted next to Latin digits', () => {
    const digits = localeDigits('ar-EG');
    assert.equal(digits.get('٧'), 7);
    assert.equal(digits.get('7'), 7);
    const field = fieldFormat('ar-EG', 'day');
    assert.deepEqual(parseFieldText('٢٣/١١/٢٠٢٦', { locale: 'ar-EG', field }), { day: 23, month: 11, year: 2026 });
    assert.equal(segmentText('ar-EG', { type: 'day', style: '2-digit' }, { day: 5 }, false), '٠٥');
  });

  it('localeText messages: params and plural forms', () => {
    const msg = { one: '{count} day', other: '{count} days' };
    assert.equal(formatMessage(msg, { count: 1 }), '1 day');
    assert.equal(formatMessage(msg, { count: 7 }), '7 days');
    assert.equal(formatMessage('Week {week}', { week: 4 }), 'Week 4');
    assert.equal(formatMessage({ zero: 'none', other: '{count}' }, { count: 0 }), 'none');
  });
});

describe('segments, patterns and parsing', () => {
  it('segments follow the locale order, options and patterns', () => {
    const types = (f: ReturnType<typeof fieldFormat>) => f.segments.map((s) => (s.type === 'literal' ? s.text : s.type)).join('|');
    assert.equal(types(fieldFormat('en-US', 'day')), 'month|/|day|/|year');
    assert.equal(types(fieldFormat('de-DE', 'day')), 'day|.|month|.|year');
    assert.equal(types(fieldFormat('ja-JP', 'day')), 'year|/|month|/|day');
    assert.equal(types(fieldFormat('en-US', 'month')), 'month|/|year');
    assert.equal(types(fieldFormat('en-US', 'year')), 'year');
    assert.equal(types(fieldFormat('en-US', 'day', { format: 'yyyy-MM-dd' })), 'year|-|month|-|day');
    assert.equal(types(fieldFormat('en-US', 'day', { format: "dd 'de' MMM yyyy" })), 'day| de |month| |year');
    assert.equal(types(fieldFormat('en-US', 'day', { format: { dateStyle: 'medium' } })), 'month| |day|, |year');
    assert.equal(tokenizePattern("hh 'o''clock' a").length, 5);
    assert.deepEqual(skeletonOptions('yMMMd'), { year: 'numeric', month: 'short', day: 'numeric' });
  });

  it('12- and 24-hour cycles: locale default, hourCycle override, day period segment', () => {
    const us = fieldFormat('en-US', 'minute', { time: true });
    assert.equal(us.h12, true);
    assert.deepEqual(us.segments.filter((s) => s.type !== 'literal').map((s) => s.type), ['hour', 'minute', 'dayPeriod']);
    assert.equal(fieldFormat('de-DE', 'minute', { time: true }).h12, false);
    assert.equal(fieldFormat('en-US', 'minute', { time: true, hourCycle: 'h23' }).h12, false);
    assert.equal(fieldFormat('de-DE', 'minute', { time: true, hourCycle: 'h12' }).h12, true);
    assert.equal(fieldFormat('en-US', 'second', { time: true, format: 'HH:mm:ss' }).h12, false);
    assert.equal(segmentText('en-US', { type: 'dayPeriod', style: 'short' }, { dayPeriod: 1 }, true), 'PM');
  });

  it('paste parsing: ISO, the field order, month names, day periods, inputFormats, parse', () => {
    const us = fieldFormat('en-US', 'day');
    const p = (text: string, field = us, extra: object = {}) => parseFieldText(text, { locale: 'en-US', field, ...extra });
    assert.deepEqual(p('2026-11-23'), { month: 11, day: 23, year: 2026 });
    assert.deepEqual(p('11/23/2026'), { month: 11, day: 23, year: 2026 });
    assert.deepEqual(p('Nov 23, 2026'), { month: 11, day: 23, year: 2026 });
    assert.deepEqual(p('11/23/26'), { month: 11, day: 23, year: 2026 });
    assert.equal(p('2/30/2026'), null);
    assert.equal(p('23.11.2026'), null);
    assert.deepEqual(p('23.11.2026', us, { inputFormats: ['dd.MM.yyyy'] }), { month: 11, day: 23, year: 2026 });
    assert.deepEqual(p('20261123', us, { inputFormats: ['yyyyMMdd'] }), { month: 11, day: 23, year: 2026 });
    assert.deepEqual(p('next tuesday', us, { parse: () => ({ year: 2026, month: 12, day: 1 }) }), { month: 12, day: 1, year: 2026 });
    const time = fieldFormat('en-US', 'minute', { time: true });
    assert.deepEqual(p('1:30 pm', time), { hour: 13, minute: 30, dayPeriod: 1 });
    assert.deepEqual(p('12:05 AM', time), { hour: 0, minute: 5, dayPeriod: 0 });
    assert.deepEqual(p('14:30', time), { hour: 14, minute: 30, dayPeriod: 1 });
    assert.equal(p('13:30 pm', time), null);
    const de = fieldFormat('de-DE', 'day');
    assert.deepEqual(parseFieldText('23. November 2026', { locale: 'de-DE', field: de }), { day: 23, month: 11, year: 2026 });
  });

  it('digit entry auto-advances when no further digit fits', () => {
    assert.deepEqual(typeDigit('', 1, 12, 2), { value: 1, text: '1', done: false });
    assert.deepEqual(typeDigit('1', 2, 12, 2), { value: 12, text: '12', done: true });
    assert.deepEqual(typeDigit('', 4, 12, 2), { value: 4, text: '4', done: true });
    assert.deepEqual(typeDigit('1', 5, 12, 2), { value: 5, text: '5', done: true });
    assert.deepEqual(typeDigit('202', 6, 9999, 4), { value: 2026, text: '2026', done: true });
  });
});
