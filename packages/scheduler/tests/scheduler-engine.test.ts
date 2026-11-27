import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { addEvents, deleteEvent, saveEvent } from '../dist/internal/scheduler/crud.js';
import { normalizeEvent, resolveFields, writeRow } from '../dist/internal/scheduler/fields.js';
import { layoutDays, layoutMonth, stackLanes } from '../dist/internal/scheduler/layout.js';
import { deletedOccurrences, indexEvents, occurrencesIn } from '../dist/internal/scheduler/occurrences.js';
import { collisions, isSlotAvailable, validateFields, validateOccurrenceMove, validateSeries } from '../dist/internal/scheduler/rules.js';
import { createSchedulerStore } from '../dist/internal/scheduler/store.js';
import { createZoneConverter, DAY_MS } from '../dist/internal/scheduler/time.js';
import { monthWeeks, navigateDay, pageOf, visibleDays } from '../dist/internal/scheduler/views.js';

// The framework-agnostic Scheduler engine: views and ranges, field mapping, occurrences,
// layout, availability, validation and the recurrence edit scopes.

type Row = Record<string, unknown>;
const day = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const iso = (d: number): string => new Date(d * DAY_MS).toISOString().slice(0, 10);
const baseView = { type: 'week' as const, interval: 1, agendaDayCount: 7, firstDayOfWeek: 0, workDays: [1, 2, 3, 4, 5], showWeekend: true, monthCount: 12, firstMonthOfYear: 1 };
const ny = createZoneConverter('America/New_York');
const utc = createZoneConverter('UTC');
const zones = new Map<string, ReturnType<typeof createZoneConverter>>();
const zoneFor = (n: string) => zones.get(n) ?? (zones.set(n, createZoneConverter(n)), zones.get(n)!);
const ctxFor = (zone = ny) => ({ fields: resolveFields(undefined), zone, zoneFor, resources: [] as { field: string; multiple: boolean }[] });
const records = (rows: Row[], zone = ny) => rows.map((r) => normalizeEvent(r, ctxFor(zone))!).filter(Boolean);
const crud = (rows: Row[], zone = ny) => ({ ...ctxFor(zone), resourceInfo: [], idOf: (r: Row) => r['id'] as number, createId: () => Math.max(0, ...rows.map((r) => Number(r['id']))) + 100 });

describe('views and ranges', () => {
  it('week, work week, day with an interval and month pages', () => {
    const anchor = day('2026-11-25'); // Wednesday
    assert.deepEqual(visibleDays(baseView, anchor).map(iso), ['2026-11-22', '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28']);
    assert.deepEqual(visibleDays({ ...baseView, firstDayOfWeek: 1 }, anchor).map(iso)[0], '2026-11-23');
    assert.deepEqual(visibleDays({ ...baseView, type: 'workWeek' }, anchor).map(iso), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']);
    assert.deepEqual(visibleDays({ ...baseView, showWeekend: false }, anchor).length, 5);
    assert.deepEqual(visibleDays({ ...baseView, type: 'day', interval: 3 }, anchor).map(iso), ['2026-11-25', '2026-11-26', '2026-11-27']);
    const weeks = monthWeeks({ ...baseView, type: 'month' }, anchor);
    assert.equal(weeks.length, 5);
    assert.equal(iso(weeks[0]![0]!), '2026-11-01');
    assert.equal(iso(weeks[4]![6]!), '2026-12-05');
    assert.equal(monthWeeks({ ...baseView, type: 'month', interval: 2 }, anchor).length, 9);
    assert.deepEqual(pageOf({ ...baseView, type: 'agenda', agendaDayCount: 3 }, anchor), { first: anchor, last: anchor + 2 });
  });

  it('navigation moves by one page; months clamp the day', () => {
    assert.equal(iso(navigateDay(baseView, day('2026-11-25'), 1)), '2026-12-02');
    assert.equal(iso(navigateDay({ ...baseView, type: 'day', interval: 3 }, day('2026-11-25'), -1)), '2026-11-22');
    assert.equal(iso(navigateDay({ ...baseView, type: 'month' }, day('2026-01-31'), 1)), '2026-02-28');
  });
});

describe('field mapping and time zones', () => {
  it('maps roles, reads Date, ISO and plain values, and keeps the value style on write', () => {
    const fields = resolveFields({ title: 'Subject', start: 'StartTime', end: { field: 'EndTime' } });
    const ctx = { ...ctxFor(), fields };
    const rec = normalizeEvent({ id: 1, Subject: 'Standup', StartTime: '2026-11-23T09:00', EndTime: { year: 2026, month: 11, day: 23, hour: 9, minute: 30 } }, ctx)!;
    assert.equal(rec.title, 'Standup');
    assert.equal(new Date(rec.start).toISOString(), '2026-11-23T14:00:00.000Z');
    assert.equal(rec.end - rec.start, 30 * 60_000);
    const inst = normalizeEvent({ id: 2, title: 'x', start: '2026-11-23T09:00:00Z', end: new Date(Date.UTC(2026, 10, 23, 10)) }, ctxFor())!;
    assert.equal(new Date(inst.start).toISOString(), '2026-11-23T09:00:00.000Z');
    const written = writeRow({ id: 1, Subject: 'a', StartTime: '2026-11-23T09:00', EndTime: new Date(0) }, { start: Date.UTC(2026, 10, 24, 15), end: Date.UTC(2026, 10, 24, 16) }, ctx, []);
    assert.equal(written['StartTime'], '2026-11-24T10:00:00');
    assert.ok(written['EndTime'] instanceof Date);
    assert.equal(normalizeEvent({ title: 'no id', start: '2026-11-23' }, ctxFor()), null);
  });

  it('a custom editor writes row properties outside the roles as given', () => {
    const ctx = ctxFor();
    const written = writeRow<Record<string, unknown>>({ id: 1, title: 'a', start: '2026-11-23T09:00', end: '2026-11-23T10:00', kind: 'meeting' }, { title: 'b', extra: { kind: 'travel', priority: 2 } }, ctx, []);
    assert.equal(written['title'], 'b');
    assert.equal(written['kind'], 'travel');
    assert.equal(written['priority'], 2);
  });

  it('per-event start and end zones and all-day whole days', () => {
    const rec = normalizeEvent({ id: 1, start: '2026-11-23T09:00', end: '2026-11-23T10:00', startTimeZone: 'Europe/Berlin' }, ctxFor())!;
    assert.equal(new Date(rec.start).toISOString(), '2026-11-23T08:00:00.000Z');
    const all = normalizeEvent({ id: 2, start: '2026-11-23', end: '2026-11-24', allDay: true }, ctxFor())!;
    assert.equal(ny.day(all.start), day('2026-11-23'));
    assert.equal(ny.day(all.end), day('2026-11-24'));
    const single = normalizeEvent({ id: 3, start: '2026-11-23', end: '2026-11-23', allDay: true }, ctxFor())!;
    assert.equal(ny.day(single.end) - ny.day(single.start), 1);
  });

  it('the zone converter keeps wall time across DST and caches per hour', () => {
    const w = Date.UTC(2026, 2, 8, 9, 0);
    assert.equal(new Date(ny.instant(w)).toISOString(), '2026-03-08T13:00:00.000Z');
    assert.equal(new Date(ny.instant(Date.UTC(2026, 2, 8, 2, 30))).toISOString(), '2026-03-08T07:30:00.000Z');
    assert.equal(ny.day(Date.UTC(2026, 2, 8, 3, 0)), day('2026-03-07'));
    assert.equal(ny.dayStart(day('2026-11-01')), Date.UTC(2026, 10, 1, 4));
  });
});

describe('occurrences', () => {
  const rows: Row[] = [
    { id: 1, title: 'Daily', start: '2026-11-23T09:00', end: '2026-11-23T09:30', recurrenceRule: 'FREQ=DAILY;COUNT=5', recurrenceExceptions: '20261124T140000Z' },
    { id: 2, title: 'Moved', start: '2026-11-25T11:00', end: '2026-11-25T11:30', recurrenceId: 1 },
    { id: 3, title: 'Plain', start: '2026-11-26T12:00', end: '2026-11-26T13:00' },
  ];
  it('expands series in range, skips exceptions and keeps edited occurrences', () => {
    const recs = records([...rows.slice(0, 1).map((r) => ({ ...r, recurrenceExceptions: '20261124T140000Z,20261125T140000Z' })), ...rows.slice(1)]);
    const occ = occurrencesIn(recs, { start: ny.dayStart(day('2026-11-22')), end: ny.dayStart(day('2026-11-29')) }, { zone: ny, zoneFor });
    assert.deepEqual(occ.map((o) => `${o.event.title}@${new Date(ny.wall(o.start)).toISOString().slice(5, 16)}`), ['Daily@11-23T09:00', 'Daily@11-25T11:00'.replace('Daily', 'Moved'), 'Daily@11-26T09:00', 'Plain@11-26T12:00', 'Daily@11-27T09:00']);
    const { children } = indexEvents(recs);
    assert.deepEqual(deletedOccurrences(recs[0]!, children.get(1) ?? [], ny).map((t) => new Date(t).toISOString()), ['2026-11-24T14:00:00.000Z']);
  });

  it('a weekly series keeps 09:00 wall time across the DST change', () => {
    const recs = records([{ id: 1, start: '2026-10-26T09:00', end: '2026-10-26T10:00', recurrenceRule: 'FREQ=WEEKLY' }]);
    const occ = occurrencesIn(recs, { start: Date.UTC(2026, 9, 25), end: Date.UTC(2026, 10, 10) }, { zone: ny, zoneFor });
    assert.deepEqual(occ.map((o) => new Date(ny.wall(o.start)).toISOString().slice(11, 16)), ['09:00', '09:00', '09:00']);
    assert.deepEqual(occ.map((o) => (o.end - o.start) / 60_000), [60, 60, 60]);
  });
});

describe('layout', () => {
  it('packs overlapping timed events into columns per cluster', () => {
    const recs = records(
      [
        { id: 1, start: '2026-11-23T09:00', end: '2026-11-23T10:00' },
        { id: 2, start: '2026-11-23T09:30', end: '2026-11-23T11:00' },
        { id: 3, start: '2026-11-23T10:00', end: '2026-11-23T10:30' },
        { id: 4, start: '2026-11-23T13:00', end: '2026-11-23T13:05' },
      ],
      utc,
    );
    const days = [day('2026-11-23')];
    const occ = occurrencesIn(recs, { start: utc.dayStart(days[0]!), end: utc.dayStart(days[0]! + 1) }, { zone: utc, zoneFor });
    const l = layoutDays(occ, { zone: utc, days, startMinute: 8 * 60, endMinute: 18 * 60, minimumDuration: 15 });
    const parts = l.timed[0]!;
    const by = (id: number) => parts.find((p) => p.occurrence.eventId === id)!;
    assert.deepEqual([by(1).lane, by(2).lane, by(3).lane], [0, 1, 0]);
    assert.equal(by(1).lanes, 2);
    assert.equal(by(4).lanes, 1);
    assert.equal(by(1).top, 60);
    assert.equal(by(4).bottom - by(4).top, 15);
  });

  it('spanned events go to the all-day row with continuation flags; timeSlot splits them', () => {
    const recs = records(
      [
        { id: 1, start: '2026-11-21', end: '2026-11-25', allDay: true },
        { id: 2, start: '2026-11-23T22:00', end: '2026-11-24T02:00' },
      ],
      utc,
    );
    const days = [day('2026-11-23'), day('2026-11-24'), day('2026-11-25')];
    const occ = occurrencesIn(recs, { start: utc.dayStart(days[0]!), end: utc.dayStart(days[2]! + 1) }, { zone: utc, zoneFor });
    const l = layoutDays(occ, { zone: utc, days, startMinute: 0, endMinute: 1440 });
    const span = l.allDay.find((p) => p.occurrence.eventId === 1)!;
    assert.deepEqual([span.startColumn, span.endColumn, span.continuesBefore, span.continuesAfter], [0, 2, true, false]);
    assert.ok(l.allDay.some((p) => p.occurrence.eventId === 2));
    const split = layoutDays(occ, { zone: utc, days, startMinute: 0, endMinute: 1440, spannedPlacement: 'timeSlot' });
    assert.equal(split.timed[0]!.length, 1);
    assert.equal(split.timed[1]!.length, 1);
    assert.equal(split.timed[0]![0]!.continuesAfter, true);
  });

  it('month rows stack lanes and count hidden events per day', () => {
    const rows: Row[] = [];
    for (let i = 0; i < 5; i++) rows.push({ id: i + 1, start: '2026-11-24T09:00', end: '2026-11-24T10:00' });
    rows.push({ id: 9, start: '2026-11-23', end: '2026-11-26', allDay: true });
    const recs = records(rows, utc);
    const weeks = monthWeeks({ ...baseView, type: 'month' }, day('2026-11-24'));
    const occ = occurrencesIn(recs, { start: utc.dayStart(weeks[0]![0]!), end: utc.dayStart(weeks[4]![6]! + 1) }, { zone: utc, zoneFor });
    const l = layoutMonth(occ, weeks, utc, 3);
    const row = l.rows[3]!;
    assert.equal(row.lanes, 3);
    assert.equal(row.more[2], 3);
    assert.equal(row.parts.find((p) => p.occurrence.eventId === 9)!.lane, 0);
    assert.deepEqual(stackLanes([0, 0, 1, 2], [2, 1, 3, 3]), [0, 1, 1, 0]);
  });
});

describe('availability and validation', () => {
  const recs = records(
    [
      { id: 1, start: '2026-11-23T09:00', end: '2026-11-23T10:00' },
      { id: 2, start: '2026-11-23T12:00', end: '2026-11-23T13:00', block: true },
      { id: 3, start: '2026-11-23T15:00', end: '2026-11-23T16:00', roomId: 'a' },
    ],
    utc,
  );
  const c = { zone: utc, zoneFor };
  it('blocks always reject; events reject only with overlap={false}', () => {
    assert.equal(isSlotAvailable(recs, { start: Date.UTC(2026, 10, 23, 12, 30), end: Date.UTC(2026, 10, 23, 12, 45) }, c, true), false);
    assert.equal(isSlotAvailable(recs, { start: Date.UTC(2026, 10, 23, 9, 30), end: Date.UTC(2026, 10, 23, 9, 45) }, c, true), true);
    assert.equal(isSlotAvailable(recs, { start: Date.UTC(2026, 10, 23, 9, 30), end: Date.UTC(2026, 10, 23, 9, 45) }, c, false), false);
    assert.equal(isSlotAvailable(recs, { start: Date.UTC(2026, 10, 23, 9, 30), end: Date.UTC(2026, 10, 23, 9, 45), excludeId: 1 }, c, false), true);
    assert.equal(collisions(recs, { start: Date.UTC(2026, 10, 23, 10), end: Date.UTC(2026, 10, 23, 11) }, c, true).length, 0);
  });

  it('field rules, series duration and occurrence moves', () => {
    const msg = { required: 'req', minLength: 'min {min}', maxLength: 'max {max}', pattern: 'pat' };
    assert.deepEqual(validateFields({ title: '', location: 'ab' }, { title: { required: true }, location: { minLength: 3 } }, msg), { title: 'req', location: 'min 3' });
    assert.deepEqual(validateFields({ title: 'x' }, { title: { validate: (v) => (v === 'x' ? 'no x' : null) } }, msg), { title: 'no x' });
    assert.equal(validateSeries('FREQ=DAILY', 0, 2 * DAY_MS), 'durationTooLong');
    assert.equal(validateSeries('FREQ=WEEKLY;BYDAY=MO,TU', 0, 2 * DAY_MS), 'durationTooLong');
    assert.equal(validateSeries('FREQ=WEEKLY', 0, 2 * DAY_MS), null);
    const series = records([{ id: 1, start: '2026-11-23T09:00', end: '2026-11-23T10:00', recurrenceRule: 'FREQ=DAILY' }], utc)[0]!;
    const o = Date.UTC(2026, 10, 24, 9);
    assert.equal(validateOccurrenceMove(series, o, Date.UTC(2026, 10, 25, 14), Date.UTC(2026, 10, 25, 15), c), 'sameDay');
    assert.equal(validateOccurrenceMove(series, o, Date.UTC(2026, 10, 24, 14), Date.UTC(2026, 10, 24, 15), c), null);
  });
});

describe('writes and recurrence scopes', () => {
  const base: Row[] = [{ id: 1, title: 'Daily', start: '2026-11-23T09:00', end: '2026-11-23T09:30', recurrenceRule: 'FREQ=DAILY;COUNT=10' }];
  const occStart = Date.UTC(2026, 10, 25, 9);
  const target = () => ({ event: records(base, utc)[0]!, occurrenceStart: occStart });
  it('add assigns an id when missing', () => {
    const set = addEvents(base, [{ title: 'New', start: '2026-11-23T11:00', end: '2026-11-23T12:00' }], crud(base, utc));
    assert.equal(set.rows.length, 2);
    assert.equal(set.added[0]!['id'], 101);
  });

  it("'occurrence' adds an exception and an edited child", () => {
    const set = saveEvent(base, target(), { title: 'Moved', start: occStart + 3_600_000, end: occStart + 5_400_000 }, 'occurrence', [], crud(base, utc));
    assert.equal(set.rows.length, 2);
    assert.equal(set.changed[0]!.row['recurrenceExceptions'], '20261125T090000Z');
    const child = set.added[0]!;
    assert.equal(child['recurrenceId'], 1);
    assert.equal(child['recurrenceRule'], undefined);
    assert.equal(child['title'], 'Moved');
    assert.equal(child['start'], '2026-11-25T10:00:00');
  });

  it("'following' ends the series before the occurrence and links a new series", () => {
    const set = saveEvent(base, target(), { title: 'Later' }, 'following', [], crud(base, utc));
    assert.equal(set.changed[0]!.row['recurrenceRule'], 'FREQ=DAILY;UNTIL=20261125T085959Z');
    const next = set.added[0]!;
    assert.equal(next['followingId'], 1);
    assert.equal(next['recurrenceRule'], 'FREQ=DAILY;COUNT=8');
    assert.equal(next['start'], '2026-11-25T09:00:00');
    assert.equal(next['title'], 'Later');
  });

  it("'series' shifts the series and drops edited occurrences", () => {
    const withChild: Row[] = [...base, { id: 2, title: 'child', start: '2026-11-24T11:00', end: '2026-11-24T11:30', recurrenceId: 1 }];
    const recs = records(withChild, utc);
    const set = saveEvent(withChild, target(), { start: occStart + 3_600_000, end: occStart + 3_600_000 + 1_800_000 }, 'series', [recs[1]!], crud(withChild, utc));
    assert.equal(set.rows.length, 1);
    assert.equal(set.rows[0]!['start'], '2026-11-23T10:00:00');
    assert.equal(set.deleted.length, 1);
  });

  it('delete scopes: occurrence, following and series', () => {
    const c = crud(base, utc);
    assert.equal(deleteEvent(base, target(), 'occurrence', [], undefined, c).rows[0]!['recurrenceExceptions'], '20261125T090000Z');
    assert.equal(deleteEvent(base, target(), 'following', [], undefined, c).rows[0]!['recurrenceRule'], 'FREQ=DAILY;UNTIL=20261125T085959Z');
    assert.equal(deleteEvent(base, target(), 'series', [], undefined, c).rows.length, 0);
    const first = { event: records(base, utc)[0]!, occurrenceStart: Date.UTC(2026, 10, 23, 9) };
    assert.equal(deleteEvent(base, first, 'following', [], undefined, c).rows.length, 0);
  });
});

describe('store', () => {
  it('notifies on change only and freezes snapshots', () => {
    const s = createSchedulerStore({ view: 'week', date: 0, rows: [], rowsVersion: 0, selectedCells: null, selectedEventKeys: [], popup: null, loading: false, pending: [], workHours: [], allDayExpanded: false, expandedResources: null, inline: null });
    let n = 0;
    s.subscribe(() => n++);
    s.set({ view: 'week' });
    assert.equal(n, 0);
    s.set({ view: 'month' });
    assert.equal(n, 1);
    assert.ok(Object.isFrozen(s.getSnapshot()));
  });
});
