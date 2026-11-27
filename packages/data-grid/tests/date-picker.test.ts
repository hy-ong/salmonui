import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addMonths,
  calendarLabels,
  dateTextFormat,
  dayNumber,
  dayOf,
  formatDayText,
  localeFirstDay,
  monthGrid,
  parseDateText,
  placeholderOf,
  regionFirstDay,
  resolveCalendar,
  resolveFirstDay,
  weekday,
  weekStart,
} from '../dist/data-grid/editing/calendar.js';

// Date picker math and Intl labels: week start from
// Intl.Locale week info and the CLDR fallback table, the Gregorian month
// grid, the locale's numeric date order for the text input, and calendar
// labels. Keyboard and focus are covered by tests/browser/editing.spec.ts.

const day = (y: number, m: number, d: number) => dayNumber(y, m, d);
const ymd = (n: number) => {
  const { year, month, day: d } = dayOf(n);
  return `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

describe('first day of week', () => {
  it('follows Intl.Locale week info of the locale', () => {
    assert.equal(localeFirstDay('en-US'), 0);
    assert.equal(localeFirstDay('de-DE'), 1);
    assert.equal(localeFirstDay('en-GB'), 1);
    assert.equal(localeFirstDay('ar-EG'), 6);
    assert.equal(localeFirstDay('he-IL'), 0);
    assert.equal(localeFirstDay('ja-JP'), 0);
  });

  it('falls back to the CLDR region table (Monday elsewhere)', () => {
    assert.equal(regionFirstDay('US'), 0);
    assert.equal(regionFirstDay('BR'), 0);
    assert.equal(regionFirstDay('DE'), 1);
    assert.equal(regionFirstDay('FR'), 1);
    assert.equal(regionFirstDay('EG'), 6);
    assert.equal(regionFirstDay('IR'), 6);
    assert.equal(regionFirstDay('MV'), 5);
    assert.equal(regionFirstDay('419'), 1);
    assert.equal(regionFirstDay(undefined), 1);
  });

  it('without week info (Firefox) the maximized region and -u-fw- decide', () => {
    const proto = Intl.Locale.prototype as unknown as Record<string, unknown>;
    const saved = ['getWeekInfo', 'weekInfo'].map((k) => [k, Object.getOwnPropertyDescriptor(proto, k)] as const);
    for (const [k] of saved) delete proto[k];
    try {
      assert.equal(localeFirstDay('en-US'), 0);
      assert.equal(localeFirstDay('en'), 0);
      assert.equal(localeFirstDay('de'), 1);
      assert.equal(localeFirstDay('ar-EG'), 6);
      assert.equal(localeFirstDay('pt'), 0);
      assert.equal(localeFirstDay('de-DE-u-fw-sun'), 0);
    } finally {
      for (const [k, d] of saved) if (d) Object.defineProperty(proto, k, d);
    }
    assert.equal(typeof (new Intl.Locale('en') as unknown as { getWeekInfo?: unknown }).getWeekInfo, 'function');
  });

  it('editorProps.firstDayOfWeek overrides the locale when it is 0-6', () => {
    assert.equal(resolveFirstDay('en-US', 1), 1);
    assert.equal(resolveFirstDay('de-DE', 0), 0);
    assert.equal(resolveFirstDay('de-DE', 6), 6);
    assert.equal(resolveFirstDay('de-DE', 7), 1);
    assert.equal(resolveFirstDay('en-US', '1'), 0);
    assert.equal(resolveFirstDay('not a locale!', undefined), 1);
  });
});

describe('Gregorian month grid', () => {
  it('lays out six weeks from the first day of week', () => {
    // 2026-11-01 is a Sunday.
    assert.equal(weekday(day(2026, 11, 1)), 0);
    const sunday = monthGrid(day(2026, 11, 18), 0);
    assert.equal(sunday.length, 42);
    assert.equal(ymd(sunday[0] as number), '2026-11-01');
    assert.equal(ymd(sunday[41] as number), '2026-12-12');
    const monday = monthGrid(day(2026, 11, 18), 1);
    assert.equal(ymd(monday[0] as number), '2026-10-26');
    assert.equal(weekday(monday[0] as number), 1);
    const saturday = monthGrid(day(2026, 2, 10), 6);
    assert.equal(ymd(saturday[0] as number), '2026-01-31');
  });

  it('Home / End and PageUp / PageDown targets', () => {
    const wed = day(2026, 11, 18);
    assert.equal(ymd(weekStart(wed, 0)), '2026-11-15');
    assert.equal(ymd(weekStart(wed, 1)), '2026-11-16');
    assert.equal(ymd(weekStart(day(2026, 11, 15), 1)), '2026-11-09');
    assert.equal(ymd(addMonths(day(2026, 1, 31), 1)), '2026-02-28');
    assert.equal(ymd(addMonths(day(2028, 1, 31), 1)), '2028-02-29');
    assert.equal(ymd(addMonths(day(2026, 1, 15), -1)), '2025-12-15');
    assert.equal(ymd(addMonths(day(2028, 2, 29), 12)), '2029-02-28');
  });
});

describe('date text in the locale order', () => {
  it('derives the numeric field order and separator', () => {
    assert.deepEqual(dateTextFormat('en-US'), { order: 'mdy', separator: '/' });
    assert.deepEqual(dateTextFormat('de-DE'), { order: 'dmy', separator: '.' });
    assert.deepEqual(dateTextFormat('ja-JP'), { order: 'ymd', separator: '/' });
    assert.equal(dateTextFormat('en-GB').order, 'dmy');
    assert.equal(placeholderOf(dateTextFormat('de-DE'), false), 'dd.mm.yyyy');
    assert.equal(placeholderOf(dateTextFormat('en-US'), true), 'mm/dd/yyyy hh:mm');
  });

  it('formats and parses round trip, ISO always accepted', () => {
    const de = dateTextFormat('de-DE');
    const us = dateTextFormat('en-US');
    assert.equal(formatDayText({ year: 2026, month: 12, day: 4 }, de), '04.12.2026');
    assert.equal(formatDayText({ year: 2026, month: 12, day: 4 }, us), '12/04/2026');
    assert.deepEqual(parseDateText('04.12.2026', de), { day: { year: 2026, month: 12, day: 4 }, minutes: null });
    assert.deepEqual(parseDateText('12/04/2026', us)?.day, { year: 2026, month: 12, day: 4 });
    assert.deepEqual(parseDateText('2026-12-04', de)?.day, { year: 2026, month: 12, day: 4 });
    assert.deepEqual(parseDateText('1/2/26', us)?.day, { year: 2026, month: 1, day: 2 });
    assert.equal(parseDateText('31.02.2026', de), null);
    assert.equal(parseDateText('13/01/2026', us), null);
    assert.equal(parseDateText('12.2026', de), null);
    assert.equal(parseDateText('', de), null);
  });

  it('parses a time for datetime editors (24-hour, am / pm)', () => {
    const de = dateTextFormat('de-DE');
    const us = dateTextFormat('en-US');
    assert.equal(parseDateText('24.12.2026 14:30', de)?.minutes, 870);
    assert.equal(parseDateText('12/24/2026 2:30 PM', us)?.minutes, 870);
    assert.equal(parseDateText('12/24/2026 12:05 am', us)?.minutes, 5);
    assert.equal(parseDateText('2026-12-24T09:15', us)?.minutes, 555);
    assert.equal(parseDateText('24.12.2026 25:00', de), null);
  });
});

describe('Intl calendar labels', () => {
  it('weekday headers follow the first day of week', () => {
    const us = calendarLabels('en-US', 'gregory', 0);
    assert.deepEqual(us.weekdays.map((w) => w.short), ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    assert.equal(us.weekdays[0]?.long, 'Sunday');
    const de = calendarLabels('de-DE', 'gregory', 1);
    assert.equal(de.weekdays[0]?.long, 'Montag');
    assert.equal(de.weekdays[6]?.long, 'Sonntag');
    assert.equal(us.month(day(2026, 11, 18)), 'November 2026');
    assert.equal(de.month(day(2026, 3, 1)), 'März 2026');
    assert.equal(us.dayText(day(2026, 11, 8)), '8');
    assert.equal(us.dayLabel(day(2026, 11, 8)), 'Sunday, November 8, 2026');
  });

  it('calendars with Gregorian months relabel the heading; others keep it and label days', () => {
    assert.equal(resolveCalendar('th-TH', undefined), 'buddhist');
    assert.equal(resolveCalendar('ja-JP-u-ca-japanese', undefined), 'japanese');
    assert.equal(resolveCalendar('en-US', 'hebrew'), 'hebrew');
    const nov = day(2026, 11, 18);
    assert.match(calendarLabels('th-TH', 'buddhist', 0).month(nov), /2569/);
    assert.match(calendarLabels('ja-JP-u-ca-japanese', 'japanese', 0).month(nov), /令和/);
    const islamic = calendarLabels('en-US', 'islamic-umalqura', 0);
    assert.equal(islamic.month(nov), 'November 2026');
    assert.match(islamic.dayLabel(nov), /AH/);
    // The locale's digits in the day cells.
    assert.equal(calendarLabels('ar-EG', 'gregory', 6).dayText(day(2026, 11, 8)), '٨');
  });
});
