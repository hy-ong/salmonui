import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { expandRecurrence, formatRecurrenceRule, fromZonedDateTime, getRecurrenceDates, getRecurrenceSummary, getTimeZoneOffset, parseRecurrenceRule, toZonedDateTime } from '../dist/internal/dates/index.js';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

const iso = (list: readonly { toString(): string }[]): string[] => list.map(String);
const dates = (rule: string, start: string, extra: Record<string, unknown> = {}): string[] => iso(getRecurrenceDates(rule, { start, maxCount: 20, ...extra }));

describe('RRULE parse and format', () => {
  it('parses every supported part and round-trips through formatRecurrenceRule', () => {
    const text = 'FREQ=MONTHLY;INTERVAL=2;BYDAY=2MO,-1FR;BYMONTH=1,6;BYSETPOS=1,-1;WKST=SU;COUNT=10';
    const r = parseRecurrenceRule(`RRULE:${text}`);
    assert.ok(r.ok);
    assert.equal(r.rule.frequency, 'monthly');
    assert.equal(r.rule.interval, 2);
    assert.deepEqual(r.rule.byDay, [{ weekday: 1, ordinal: 2 }, { weekday: 5, ordinal: -1 }]);
    assert.deepEqual(r.rule.bySetPos, [1, -1]);
    assert.equal(r.rule.weekStart, 0);
    assert.equal(formatRecurrenceRule(r.rule), 'FREQ=MONTHLY;INTERVAL=2;BYDAY=2MO,-1FR;BYMONTH=1,6;BYSETPOS=1,-1;WKST=SU;COUNT=10');
    for (const t of ['FREQ=DAILY', 'FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T235959Z', 'FREQ=YEARLY;BYMONTHDAY=-1;BYMONTH=2;UNTIL=20300101', 'FREQ=DAILY;UNTIL=20261231T100000']) {
      const p = parseRecurrenceRule(t);
      assert.ok(p.ok, t);
      assert.equal(formatRecurrenceRule(p.rule), t);
    }
  });

  it('unsupported or invalid parts give an error result and never throw', () => {
    for (const t of ['', 'FREQ=HOURLY', 'INTERVAL=2', 'FREQ=DAILY;BYHOUR=9', 'FREQ=DAILY;INTERVAL=0', 'FREQ=DAILY;COUNT=2;UNTIL=20260101', 'FREQ=WEEKLY;BYDAY=2MO', 'FREQ=MONTHLY;BYDAY=0MO', 'FREQ=MONTHLY;BYMONTHDAY=32', 'FREQ=DAILY;FREQ=DAILY', 'nonsense', 'FREQ=DAILY;UNTIL=20260230']) {
      const r = parseRecurrenceRule(t);
      assert.equal(r.ok, false, t);
      if (!r.ok) assert.ok(r.error.length > 0);
    }
    assert.equal(parseRecurrenceRule(42 as unknown as string).ok, false);
    assert.deepEqual(getRecurrenceDates('FREQ=NOPE', { start: '2026-01-01T09:00' }), []);
  });
});

describe('RRULE expansion', () => {
  it('daily, interval and count', () => {
    assert.deepEqual(dates('FREQ=DAILY;COUNT=3', '2026-01-30T09:00'), ['2026-01-30T09:00:00', '2026-01-31T09:00:00', '2026-02-01T09:00:00']);
    assert.deepEqual(dates('FREQ=DAILY;INTERVAL=10;COUNT=3', '2026-01-01T09:00'), ['2026-01-01T09:00:00', '2026-01-11T09:00:00', '2026-01-21T09:00:00']);
  });

  it('weekly with BYDAY and WKST; the start counts only when it matches', () => {
    // 2026-01-01 is a Thursday.
    assert.deepEqual(dates('FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4', '2026-01-01T10:00'), ['2026-01-05T10:00:00', '2026-01-07T10:00:00', '2026-01-12T10:00:00', '2026-01-14T10:00:00']);
    assert.deepEqual(dates('FREQ=WEEKLY;COUNT=2', '2026-01-01T10:00'), ['2026-01-01T10:00:00', '2026-01-08T10:00:00']);
    // RFC 5545 WKST example: biweekly TU,SU from 1997-08-05; MO vs SU week starts differ.
    assert.deepEqual(dates('FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO', '1997-08-05T09:00'), ['1997-08-05T09:00:00', '1997-08-10T09:00:00', '1997-08-19T09:00:00', '1997-08-24T09:00:00']);
    assert.deepEqual(dates('FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU', '1997-08-05T09:00'), ['1997-08-05T09:00:00', '1997-08-17T09:00:00', '1997-08-19T09:00:00', '1997-08-31T09:00:00']);
  });

  it('monthly by day, negative day, ordinal and last weekday, BYSETPOS', () => {
    assert.deepEqual(dates('FREQ=MONTHLY;BYMONTHDAY=31;COUNT=3', '2026-01-31T08:00'), ['2026-01-31T08:00:00', '2026-03-31T08:00:00', '2026-05-31T08:00:00']);
    assert.deepEqual(dates('FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3', '2026-01-01T08:00'), ['2026-01-31T08:00:00', '2026-02-28T08:00:00', '2026-03-31T08:00:00']);
    assert.deepEqual(dates('FREQ=MONTHLY;BYDAY=2TU;COUNT=2', '2026-01-01T08:00'), ['2026-01-13T08:00:00', '2026-02-10T08:00:00']);
    assert.deepEqual(dates('FREQ=MONTHLY;BYDAY=-1FR;COUNT=2', '2026-01-01T08:00'), ['2026-01-30T08:00:00', '2026-02-27T08:00:00']);
    // Last work day of the month.
    assert.deepEqual(dates('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=3', '2026-01-01T08:00'), ['2026-01-30T08:00:00', '2026-02-27T08:00:00', '2026-03-31T08:00:00']);
    // Friday the 13th.
    assert.deepEqual(dates('FREQ=MONTHLY;BYDAY=FR;BYMONTHDAY=13;COUNT=2', '2026-01-01T08:00'), ['2026-02-13T08:00:00', '2026-03-13T08:00:00']);
  });

  it('yearly by month, by month day, ordinal weekday of a month, and of the year', () => {
    assert.deepEqual(dates('FREQ=YEARLY;COUNT=2', '2024-02-29T12:00'), ['2024-02-29T12:00:00', '2028-02-29T12:00:00']);
    assert.deepEqual(dates('FREQ=YEARLY;BYMONTH=11;BYDAY=4TH;COUNT=2', '2026-01-01T12:00'), ['2026-11-26T12:00:00', '2027-11-25T12:00:00']);
    assert.deepEqual(dates('FREQ=YEARLY;BYDAY=1MO;COUNT=2', '2026-01-01T12:00'), ['2026-01-05T12:00:00', '2027-01-04T12:00:00']);
    assert.deepEqual(dates('FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-1;COUNT=2', '2026-01-01T12:00'), ['2026-02-28T12:00:00', '2027-02-28T12:00:00']);
  });

  it('UNTIL is inclusive by date, by wall time and by UTC instant', () => {
    assert.deepEqual(dates('FREQ=DAILY;UNTIL=20260103', '2026-01-01T09:00'), ['2026-01-01T09:00:00', '2026-01-02T09:00:00', '2026-01-03T09:00:00']);
    assert.deepEqual(dates('FREQ=DAILY;UNTIL=20260103T090000', '2026-01-01T09:00'), ['2026-01-01T09:00:00', '2026-01-02T09:00:00', '2026-01-03T09:00:00']);
    assert.deepEqual(dates('FREQ=DAILY;UNTIL=20260103T085959', '2026-01-01T09:00'), ['2026-01-01T09:00:00', '2026-01-02T09:00:00']);
    // 09:00 Berlin is 08:00Z in winter.
    assert.deepEqual(dates('FREQ=DAILY;UNTIL=20260102T080000Z', '2026-01-01T09:00', { timeZone: 'Europe/Berlin' }), ['2026-01-01T09:00:00', '2026-01-02T09:00:00']);
  });

  it('exceptions are skipped after COUNT is applied and ranges window the result', () => {
    assert.deepEqual(dates('FREQ=DAILY;COUNT=4', '2026-01-01T09:00', { exceptions: ['2026-01-02T09:00'] }), ['2026-01-01T09:00:00', '2026-01-03T09:00:00', '2026-01-04T09:00:00']);
    assert.deepEqual(dates('FREQ=WEEKLY;BYDAY=MO', '2026-01-01T09:00', { range: { start: '2026-03-01', end: '2026-03-17' } }), ['2026-03-02T09:00:00', '2026-03-09T09:00:00', '2026-03-16T09:00:00']);
    assert.deepEqual(dates('FREQ=MONTHLY;COUNT=3', '2026-01-15T09:00', { range: { start: '2026-02-01', end: '2027-01-01' } }), ['2026-02-15T09:00:00', '2026-03-15T09:00:00']);
  });

  it('occurrences keep their wall time across DST', () => {
    const ny = getRecurrenceDates('FREQ=DAILY;COUNT=3', { start: '2026-03-07T09:30', timeZone: 'America/New_York' });
    assert.deepEqual(iso(ny), ['2026-03-07T09:30:00', '2026-03-08T09:30:00', '2026-03-09T09:30:00']);
    const ms = expandRecurrence('FREQ=DAILY;COUNT=3', { startWall: { year: 2026, month: 3, day: 7, hour: 9, minute: 30 }, timeZone: 'America/New_York', rangeStartMs: 0, rangeEndMs: Date.UTC(2027, 0, 1) });
    assert.deepEqual(ms.map((t) => new Date(t).toISOString()), ['2026-03-07T14:30:00.000Z', '2026-03-08T13:30:00.000Z', '2026-03-09T13:30:00.000Z']);
    // 02:30 on the spring-forward day does not exist: it moves forward to 03:30 ('compatible').
    const gap = expandRecurrence('FREQ=DAILY;COUNT=2', { startWall: { year: 2026, month: 3, day: 28, hour: 2, minute: 30 }, timeZone: 'Europe/Berlin', rangeStartMs: 0, rangeEndMs: Date.UTC(2027, 0, 1) });
    assert.deepEqual(gap.map((t) => new Date(t).toISOString()), ['2026-03-28T01:30:00.000Z', '2026-03-29T01:30:00.000Z']);
    const fall = getRecurrenceDates('FREQ=WEEKLY;COUNT=2', { start: '2026-10-24T10:00', timeZone: 'Europe/Berlin' });
    assert.deepEqual(iso(fall), ['2026-10-24T10:00:00', '2026-10-31T10:00:00']);
  });

  it('expandRecurrence keeps occurrences that overlap the range through durationMs and honors maxCount', () => {
    const base = { startWall: { year: 2026, month: 1, day: 1, hour: 22, minute: 0 }, timeZone: undefined, rangeStartMs: Date.UTC(2026, 0, 2), rangeEndMs: Date.UTC(2026, 0, 3) };
    assert.deepEqual(expandRecurrence('FREQ=DAILY', base).map((t) => new Date(t).toISOString()), ['2026-01-02T22:00:00.000Z']);
    assert.deepEqual(expandRecurrence('FREQ=DAILY', { ...base, durationMs: 4 * 3_600_000 }).map((t) => new Date(t).toISOString()), ['2026-01-01T22:00:00.000Z', '2026-01-02T22:00:00.000Z']);
    assert.equal(expandRecurrence('FREQ=DAILY', { ...base, rangeEndMs: Date.UTC(2030, 0, 1), maxCount: 5 }).length, 5);
  });

  it('expands one rule into a visible range in about a millisecond @perf', () => {
    const opts = { startWall: { year: 2000, month: 1, day: 3, hour: 9, minute: 0 }, timeZone: 'America/New_York', rangeStartMs: Date.UTC(2026, 10, 29), rangeEndMs: Date.UTC(2027, 0, 10) };
    for (let i = 0; i < 50; i++) expandRecurrence('FREQ=WEEKLY;BYDAY=MO,WE,FR', opts);
    const n = 200;
    const t0 = performance.now();
    for (let i = 0; i < n; i++) expandRecurrence('FREQ=WEEKLY;BYDAY=MO,WE,FR', opts);
    const per = (performance.now() - t0) / n;
    assert.equal(expandRecurrence('FREQ=WEEKLY;BYDAY=MO,WE,FR', opts).length, 18);
    assertBudget(per, 5, 'weekly rule expansion per call', { strict: true });
  });
});

describe('RRULE summaries', () => {
  it('summarizes each frequency with interval, end and ordinals', () => {
    assert.equal(getRecurrenceSummary('FREQ=DAILY'), 'Every day');
    assert.equal(getRecurrenceSummary('FREQ=DAILY;INTERVAL=3;COUNT=5'), 'Every 3 days, 5 times');
    assert.equal(getRecurrenceSummary('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;UNTIL=20261231'), 'Every 2 weeks on Monday and Wednesday, until Dec 31, 2026');
    assert.equal(getRecurrenceSummary('FREQ=MONTHLY;BYMONTHDAY=15'), 'Every month on day 15');
    assert.equal(getRecurrenceSummary('FREQ=MONTHLY;BYDAY=-1FR'), 'Every month on the last Friday');
    assert.equal(getRecurrenceSummary('FREQ=YEARLY;BYMONTH=11;BYDAY=4TH'), 'Every year on the fourth Thursday of November');
    assert.equal(getRecurrenceSummary('FREQ=YEARLY', { start: '2026-03-03T09:00' }), 'Every year on March 3');
    assert.equal(getRecurrenceSummary(null), 'Never');
    assert.equal(getRecurrenceSummary('FREQ=BAD'), '');
  });

  it('uses the locale and localeText', () => {
    const de = getRecurrenceSummary('FREQ=WEEKLY;BYDAY=MO,FR', { locale: 'de-DE', localeText: { weeklyOn: { one: 'Jede Woche am {days}', other: 'Alle {interval} Wochen am {days}' } } });
    assert.equal(de, 'Jede Woche am Montag und Freitag');
  });
});

describe('time zone helpers', () => {
  it('offset, wall time of an instant and instant of a wall time', () => {
    assert.equal(getTimeZoneOffset('2026-01-15T12:00:00Z', 'Europe/Berlin'), 60);
    assert.equal(getTimeZoneOffset(Date.UTC(2026, 6, 1), 'America/New_York'), -240);
    assert.equal(getTimeZoneOffset(new Date(NaN), 'UTC'), null);
    assert.equal(String(toZonedDateTime('2026-07-01T12:00:00Z', 'Asia/Tokyo')), '2026-07-01T21:00:00');
    assert.equal(toZonedDateTime(0, 'Not/AZone'), null);
    assert.equal(fromZonedDateTime('2026-07-01T21:00', 'Asia/Tokyo').toISOString(), '2026-07-01T12:00:00.000Z');
    assert.equal(fromZonedDateTime({ year: 2026, month: 3, day: 8, hour: 2, minute: 30 }, 'America/New_York').toISOString(), '2026-03-08T07:30:00.000Z');
    assert.ok(Number.isNaN(fromZonedDateTime('garbage', 'UTC').getTime()));
  });
});
