import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeEvent, resolveFields } from '../dist/internal/scheduler/fields.js';
import { occurrencesIn } from '../dist/internal/scheduler/occurrences.js';
import { belongsTo, bucketByNode, buildGroupModel, expandedIdsOf, groupColumns, layoutGroupedDays, layoutGroupedMonth, monthCells, resourceItems, visibleNodes } from '../dist/internal/scheduler/resources.js';
import { createZoneConverter, DAY_MS } from '../dist/internal/scheduler/time.js';
import { layoutTimelineRow } from '../dist/internal/scheduler/timeline.js';
import { monthWeeks, navigateDay, pageOf, visibleDays } from '../dist/internal/scheduler/views.js';
import { dayColumns, positionOf, slotColumns, tiersOf, unitKey } from '../../core/dist/internal/timeline/axis.js';
import { indexAt, offsetWindow, prefixOffsets, uniformWindow } from '../dist/internal/timeline/virtual.js';

// Timeline core (`internal/timeline`: axis, header tiers, windowing) and the
// Scheduler resources, grouping and timeline layout.

type Row = Record<string, unknown>;
const day = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const iso = (d: number): string => new Date(d * DAY_MS).toISOString().slice(0, 10);
const utc = createZoneConverter('UTC');
const ROOMS = { field: 'roomId', name: 'rooms', data: [{ id: 1, text: 'Room A', color: '#f00', startHour: '08:00', endHour: '12:00', workDays: [1, 2, 3] }, { id: 2, text: 'Room B', expanded: false }] };
const OWNERS = { field: 'ownerIds', name: 'owners', multiple: true, data: [{ id: 10, text: 'Ann', parentId: 1, color: '#0f0' }, { id: 11, text: 'Bob', parentId: 2 }, { id: 12, text: 'Cid', parentId: 1 }] };
const WORK = { days: [1, 2, 3, 4, 5], start: 540, end: 1080 };
const ctx = { fields: resolveFields(undefined), zone: utc, zoneFor: () => utc, resources: [{ field: 'roomId', multiple: false }, { field: 'ownerIds', multiple: true }] };
const recs = (rows: Row[]) => rows.map((r) => normalizeEvent(r, ctx)!);
const occs = (rows: Row[], from: string, to: string) => occurrencesIn(recs(rows), { start: Date.parse(`${from}T00:00:00Z`), end: Date.parse(`${to}T00:00:00Z`) }, { zone: utc, zoneFor: () => utc });

describe('timeline axis', () => {
  it('slot and day columns; positions snap gaps to the next column', () => {
    const days = [day('2026-11-23'), day('2026-11-24')];
    const cols = slotColumns(days, 8 * 60, 10 * 60, 30);
    assert.equal(cols.length, 8);
    const w = (t: string) => Date.parse(`${t}Z`);
    assert.equal(positionOf(cols, w('2026-11-23T08:45')), 1.5);
    // 11:00 on the 23rd is after the visible hours: the next column is 08:00 on the 24th.
    assert.equal(positionOf(cols, w('2026-11-23T11:00')), 4);
    assert.equal(positionOf(cols, w('2026-11-22T00:00')), 0);
    assert.equal(positionOf(cols, w('2026-11-25T00:00')), 8);
    assert.equal(dayColumns(days)[1]!.start, days[1]! * DAY_MS);
  });

  it('header tiers merge consecutive columns of one unit', () => {
    const days = Array.from({ length: 40 }, (_, i) => day('2026-11-20') + i);
    const tiers = tiersOf(dayColumns(days), ['year', 'month', 'week', 'date'], 1);
    assert.deepEqual(tiers[0]!.cells.map((c) => c.span), [40]);
    assert.deepEqual(tiers[1]!.cells.map((c) => [iso(c.start / DAY_MS), c.span]), [['2026-11-20', 11], ['2026-12-01', 29]]);
    // Weeks start on Monday (firstDayOfWeek 1): Nov 20 is a Friday.
    assert.equal(tiers[2]!.cells[0]!.span, 3);
    assert.equal(tiers[2]!.cells[1]!.span, 7);
    assert.equal(tiers[3]!.cells.length, 40);
    const hours = tiersOf(slotColumns([day('2026-11-23')], 0, 120, 30), ['hour']);
    assert.deepEqual(hours[0]!.cells.map((c) => c.span), [2, 2]);
    assert.equal(unitKey('week', day('2026-11-23') * DAY_MS, 0), day('2026-11-22'));
  });
});

describe('windowing', () => {
  it('offset and uniform windows with overscan', () => {
    const offsets = prefixOffsets([10, 20, 30, 40, 50]);
    assert.deepEqual([...offsets], [0, 10, 30, 60, 100, 150]);
    assert.equal(indexAt(offsets, 29), 1);
    assert.equal(indexAt(offsets, 30), 2);
    assert.deepEqual(offsetWindow(offsets, 30, 40, 0), { start: 2, end: 4 });
    assert.deepEqual(offsetWindow(offsets, 30, 40, 1), { start: 1, end: 5 });
    assert.deepEqual(offsetWindow(offsets, 1000, 40, 2), { start: 2, end: 5 });
    assert.deepEqual(uniformWindow(1000, 48, 4800, 480, 2), { start: 98, end: 112 });
    assert.deepEqual(uniformWindow(0, 48, 0, 480, 2), { start: 0, end: 0 });
  });
});

describe('timeline row layout', () => {
  it('places events in column units, stacks lanes and counts hidden ones per column', () => {
    const days = visibleDays({ type: 'timelineMonth', interval: 1, agendaDayCount: 7, firstDayOfWeek: 0, workDays: [1, 2, 3, 4, 5], showWeekend: true, monthCount: 12, firstMonthOfYear: 1 }, day('2026-11-24'));
    assert.equal(days.length, 30);
    const cols = dayColumns(days);
    const rows: Row[] = [
      { id: 1, title: 'A', start: '2026-11-24T06:00', end: '2026-11-24T18:00' },
      { id: 2, title: 'B', start: '2026-11-24', end: '2026-11-27', allDay: true },
      { id: 3, title: 'C', start: '2026-11-25T00:00', end: '2026-11-25T12:00' },
      { id: 4, title: 'D', start: '2026-10-30', end: '2026-11-02', allDay: true },
    ];
    const o = occs(rows, '2026-10-01', '2027-01-01');
    const lay = layoutTimelineRow(o, cols, utc, 2);
    const b = lay.parts.find((p) => p.occurrence.eventId === 2)!;
    assert.deepEqual([b.column, b.offset, b.span, b.lane], [23, 0, 3, 0]);
    const a = lay.parts.find((p) => p.occurrence.eventId === 1)!;
    assert.deepEqual([a.column, a.offset, a.span, a.lane], [23, 0.25, 0.5, 1]);
    const c = lay.parts.find((p) => p.occurrence.eventId === 3)!;
    assert.equal(c.lane, 1);
    const d = lay.parts.find((p) => p.occurrence.eventId === 4)!;
    assert.deepEqual([d.column, d.span, d.continuesBefore, d.continuesAfter], [0, 1, true, false]);
    assert.equal(lay.more, null);
    const tight = layoutTimelineRow(o, cols, utc, 1);
    assert.equal(tight.lanes, 1);
    assert.equal(tight.more?.[23], 1);
    assert.equal(tight.more?.[24], 1);
    const auto = layoutTimelineRow(o, cols, utc, null);
    assert.equal(auto.lanes, 2);
  });

  it('timeline pages and navigation: day, work week, month and year with orientation-free ranges', () => {
    const v = { interval: 1, agendaDayCount: 7, firstDayOfWeek: 0, workDays: [1, 2, 3, 4, 5], showWeekend: true, monthCount: 12, firstMonthOfYear: 1 };
    assert.deepEqual(visibleDays({ ...v, type: 'timelineWorkWeek' }, day('2026-11-24')).map(iso), ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27']);
    assert.equal(visibleDays({ ...v, type: 'timelineYear' }, day('2026-11-24')).length, 365);
    assert.deepEqual(pageOf({ ...v, type: 'year', firstMonthOfYear: 4, monthCount: 6 }, day('2026-11-24')), { first: day('2026-04-01'), last: day('2026-09-30') });
    assert.equal(iso(navigateDay({ ...v, type: 'timelineYear' }, day('2026-11-24'), 1)), '2027-11-24');
    assert.equal(iso(navigateDay({ ...v, type: 'agenda' }, day('2026-11-24'), -1)), '2026-11-17');
    assert.equal(monthWeeks({ ...v, type: 'monthAgenda' }, day('2026-11-24')).length, 5);
  });
});

describe('resources and grouping', () => {
  const model = (grouping?: object, expanded: unknown[] | null = null) => buildGroupModel([ROOMS, OWNERS], grouping as never, expanded, WORK);

  it('items, colors and per-resource work time', () => {
    assert.deepEqual(
      resourceItems([ROOMS, OWNERS]).map((i) => [i.resource, i.id, i.text, i.color ?? null]),
      [['rooms', 1, 'Room A', '#f00'], ['rooms', 2, 'Room B', null], ['owners', 10, 'Ann', '#0f0'], ['owners', 11, 'Bob', null], ['owners', 12, 'Cid', null]],
    );
    const m = model({ resources: ['rooms', 'owners'] });
    const ann = m.byKey.get('1/10')!;
    // Work time is inherited from the parent unless the item has its own.
    assert.deepEqual(ann.work, { days: [1, 2, 3], start: 480, end: 720 });
    assert.deepEqual(m.byKey.get('2/11')!.work, WORK);
    const [e] = recs([{ id: 1, title: 'x', start: '2026-11-24T09:00', end: '2026-11-24T10:00', roomId: 1, ownerIds: [10, 12] }]);
    // The leaf's color (Ann), else an ancestor's (Room A for Cid); without a leaf the first colored resource.
    assert.equal(m.color(e!, ann), '#0f0');
    assert.equal(m.color(e!, m.byKey.get('1/12')), '#f00');
    assert.equal(model().color(e!, null), '#f00');
  });

  it('the group tree by parent id, flat with byParent false, collapsed rows', () => {
    const m = model({ resources: ['rooms', 'owners'] });
    assert.deepEqual(m.leaves.map((l) => l.key), ['1/10', '1/12', '2/11']);
    // Room B is collapsed by its `expanded: false` item.
    assert.deepEqual(visibleNodes(m).map((n) => n.key), ['1', '1/10', '1/12', '2']);
    assert.deepEqual(expandedIdsOf(m), [1]);
    assert.deepEqual(visibleNodes(model({ resources: ['rooms', 'owners'] }, [1, 2])).map((n) => n.key), ['1', '1/10', '1/12', '2', '2/11']);
    const flat = model({ resources: ['rooms', 'owners'], byParent: false });
    assert.deepEqual(flat.leaves.map((l) => l.key), ['1/10', '1/11', '1/12', '2/10', '2/11', '2/12']);
  });

  it('an event with several ids lands in every matching leaf', () => {
    const m = model({ resources: ['rooms', 'owners'] });
    const o = occs([{ id: 1, title: 'x', start: '2026-11-24T09:00', end: '2026-11-24T10:00', roomId: 1, ownerIds: [10, 12] }, { id: 2, title: 'y', start: '2026-11-24T09:00', end: '2026-11-24T10:00', roomId: 2, ownerIds: [10] }, { id: 3, title: 'z', start: '2026-11-24T09:00', end: '2026-11-24T10:00' }], '2026-11-24', '2026-11-25');
    assert.deepEqual(bucketByNode(o, m.leaves).map((b) => b.map((x) => x.eventId)), [[1], [1], []]);
    assert.equal(belongsTo(o[1]!.event, m.byKey.get('2/11')!), false);
  });

  it('grouped day columns and layouts, by resource or by date', () => {
    const m = model({ resources: ['rooms'] });
    const days = [day('2026-11-23'), day('2026-11-24'), day('2026-11-25')];
    assert.deepEqual(groupColumns(days, m).map((c) => `${c.g!.key}:${iso(c.d)}`), ['1:2026-11-23', '1:2026-11-24', '1:2026-11-25', '2:2026-11-23', '2:2026-11-24', '2:2026-11-25']);
    const byDate = model({ resources: ['rooms'], byDate: true });
    const cols = groupColumns(days, byDate);
    assert.deepEqual(cols.map((c) => `${c.g!.key}:${iso(c.d)}`), ['1:2026-11-23', '2:2026-11-23', '1:2026-11-24', '2:2026-11-24', '1:2026-11-25', '2:2026-11-25']);
    // hideNonWorkingDays: Room A works Mon-Wed, Room B Mon-Fri; Sunday the 22nd is nobody's.
    const hide = model({ resources: ['rooms'], hideNonWorkingDays: true });
    assert.deepEqual(groupColumns([day('2026-11-22'), ...days, day('2026-11-26')], hide).map((c) => `${c.g!.key}:${iso(c.d)}`), ['1:2026-11-23', '1:2026-11-24', '1:2026-11-25', '2:2026-11-23', '2:2026-11-24', '2:2026-11-25', '2:2026-11-26']);
    const o = occs([{ id: 1, title: 'all', start: '2026-11-23', end: '2026-11-25', allDay: true, roomId: 2 }, { id: 2, title: 'meet', start: '2026-11-24T09:00', end: '2026-11-24T10:00', roomId: 1 }], '2026-11-23', '2026-11-26');
    const lay = layoutGroupedDays(o, cols, byDate, { zone: utc, startMinute: 0, endMinute: 1440 });
    // By date, the two-day event of Room B splits into its columns 1 and 3.
    assert.deepEqual(lay.allDay.map((p) => [p.startColumn, p.endColumn, p.continuesBefore, p.continuesAfter]), [[1, 2, false, true], [3, 4, true, false]]);
    assert.equal(lay.timed[2]!.length, 1);
    const flat = layoutGroupedDays(o, groupColumns(days, m), m, { zone: utc, startMinute: 0, endMinute: 1440 });
    assert.deepEqual(flat.allDay.map((p) => [p.startColumn, p.endColumn]), [[3, 5]]);
  });

  it('grouped month weeks put each resource in its own seven columns', () => {
    const m = model({ resources: ['rooms'] });
    const weeks = monthWeeks({ type: 'month', interval: 1, agendaDayCount: 7, firstDayOfWeek: 0, workDays: [1, 2, 3, 4, 5], showWeekend: true, monthCount: 12, firstMonthOfYear: 1 }, day('2026-11-24'));
    assert.equal(monthCells(weeks[0]!, m).length, 14);
    const o = occs([{ id: 1, title: 'b', start: '2026-11-24', end: '2026-11-25', allDay: true, roomId: 2 }], '2026-11-01', '2026-12-06');
    const lay = layoutGroupedMonth(o, weeks, m, utc, 3);
    const part = lay.rows[3]!.parts[0]!;
    // Week of Nov 22, Room B (columns 7..13), Tuesday.
    assert.deepEqual([part.startColumn, part.endColumn], [9, 10]);
  });
});
