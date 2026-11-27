import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseICalendar, writeICalendar } from '@salmonui/export/ics';
import { exportXlsx, writeXlsx } from '@salmonui/export/xlsx';
import { buildExportTable, fromICalendarEvents, schedulerExportModel, toICalendarEvents, writeSchedulerCsv, zonedIso } from '../dist/internal/scheduler/export.js';
import { normalizeEvent, resolveFields } from '../dist/internal/scheduler/fields.js';
import { occurrencesIn } from '../dist/internal/scheduler/occurrences.js';
import { createZoneConverter, DAY_MS } from '../dist/internal/scheduler/time.js';

// Scheduler export and import:
// the export table, CSV, the XLSX export model, and the iCalendar mapping.

type Row = Record<string, unknown>;
const day = (iso: string): number => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);
const ny = createZoneConverter('America/New_York');
const zones = new Map<string, ReturnType<typeof createZoneConverter>>();
const zoneFor = (n: string) => zones.get(n) ?? (zones.set(n, createZoneConverter(n)), zones.get(n)!);
const ctxFor = (fields = resolveFields(undefined), zone = ny) => ({ fields, zone, zoneFor, resources: [{ field: 'roomId', multiple: false }] });
const records = (rows: Row[], ctx = ctxFor()) => rows.map((r) => normalizeEvent(r, ctx)!).filter(Boolean);
const week = { start: ny.dayStart(day('2026-11-22')), end: ny.dayStart(day('2026-11-29')) };

const rows: Row[] = [
  { id: 1, title: 'Daily', start: '2026-11-23T09:00', end: '2026-11-23T09:30', recurrenceRule: 'FREQ=DAILY;COUNT=5', recurrenceExceptions: '20261124T140000Z,20261125T140000Z', roomId: 'A' },
  { id: 2, title: 'Moved', start: '2026-11-25T11:00', end: '2026-11-25T11:30', recurrenceId: 1, roomId: 'A' },
  { id: 3, title: 'Plain, "quoted"', start: '2026-11-26T12:00', end: '2026-11-26T13:00', location: '=HYPERLINK("x")', startTimeZone: 'Europe/Berlin' },
  { id: 4, title: 'Holiday', start: '2026-11-27', end: '2026-11-28', allDay: true, description: 'Line 1\nLine 2' },
];

describe('export table', () => {
  it('defaults to the roles present in the rows, then resource fields, one row per stored event', () => {
    const t = buildExportTable(records(rows), ctxFor());
    assert.deepEqual(t.columns.map((c) => c.key), ['id', 'title', 'start', 'end', 'allDay', 'location', 'description', 'startTimeZone', 'recurrenceRule', 'recurrenceId', 'recurrenceExceptions', 'roomId']);
    assert.deepEqual(t.columns.map((c) => c.type).slice(0, 5), ['string', 'string', 'datetime', 'datetime', 'boolean']);
    assert.equal(t.rows.length, 4);
    assert.deepEqual(t.rows[0]?.slice(0, 2), [1, 'Daily']);
    assert.equal((t.rows[0]?.[2] as Date).toISOString(), '2026-11-23T14:00:00.000Z');
    assert.equal(t.rows[0]?.[10], '20261124T140000Z,20261125T140000Z');
    assert.equal(t.rows[1]?.[9], 1);
    assert.equal(t.rows[2]?.[9], null);
    assert.equal(t.rows[3]?.[4], true);
  });

  it('picks fields by role, mapped property or row property, with header texts and widths', () => {
    const fields = resolveFields({ title: 'Subject', start: 'StartTime' });
    const mapped = rows.map(({ title, start, ...r }) => ({ ...r, Subject: title, StartTime: start, Priority: 2 }));
    const t = buildExportTable(records(mapped, ctxFor(fields)), ctxFor(fields), { fields: ['Subject', { field: 'start', headerText: 'Begins', width: 180 }, 'Priority', 'missing'], headerTexts: { title: 'Title' } });
    assert.deepEqual(t.columns.map((c) => [c.key, c.role, c.field, c.headerText, c.type]), [
      ['Subject', 'title', 'Subject', 'Title', 'string'],
      ['start', 'start', 'StartTime', 'Begins', 'datetime'],
      ['Priority', null, 'Priority', 'Priority', 'number'],
      ['missing', null, 'missing', 'missing', 'string'],
    ]);
    assert.equal(t.columns[1]?.width, 180);
    assert.deepEqual(t.rows[0]?.slice(2), [2, null]);
  });

  it('includeOccurrences expands series in the range; edited occurrences stay in place', () => {
    const t = buildExportTable(records(rows), ctxFor(), { fields: ['title', 'start'], includeOccurrences: true, range: week });
    assert.deepEqual(
      t.rows.map((r) => `${r[0]}@${new Date(ny.wall((r[1] as Date).getTime())).toISOString().slice(5, 16)}`),
      ['Daily@11-23T09:00', 'Moved@11-25T11:00', 'Plain, "quoted"@11-26T06:00', 'Daily@11-26T09:00', 'Holiday@11-27T00:00', 'Daily@11-27T09:00'],
    );
    assert.throws(() => buildExportTable(records(rows), ctxFor(), { includeOccurrences: true }), /needs a range/);
  });

  it('rows override: custom rows in order, unnormalizable rows as raw values', () => {
    const t = buildExportTable(records(rows), ctxFor(), { rows: [{ id: 9, title: 'Custom', start: '2026-11-24T08:00' }, { title: 'No id', note: 'x' }], fields: ['id', 'title', 'note'] });
    assert.deepEqual(t.rows, [
      [9, 'Custom', null],
      [null, 'No id', 'x'],
    ]);
  });
});

describe('CSV', () => {
  const table = buildExportTable(records(rows), ctxFor(), { fields: ['id', 'title', 'start', 'allDay', 'location', 'description'] });

  it('RFC 4180 quoting, zoned ISO dates, header labels and a custom separator', () => {
    const csv = writeSchedulerCsv(table, ny);
    const lines = csv.split('\r\n');
    assert.equal(lines[0], 'id,title,start,allDay,location,description');
    assert.equal(lines[1], '1,Daily,2026-11-23T09:00:00-05:00,false,,');
    assert.equal(lines[3], '3,"Plain, ""quoted""",2026-11-26T06:00:00-05:00,false,"\'=HYPERLINK(""x"")",');
    assert.ok(csv.includes('4,Holiday,2026-11-27T00:00:00-05:00,true,,"Line 1\nLine 2"\r\n'));
    assert.ok(csv.endsWith('\r\n'));
    const semi = writeSchedulerCsv(table, ny, { separator: ';', includeHeaders: false, bom: true });
    assert.ok(semi.startsWith('﻿1;Daily;'));
    assert.ok(semi.includes('3;"Plain, ""quoted""";'));
    assert.equal(writeSchedulerCsv({ columns: table.columns.slice(0, 1), rows: [['a,b'], ['a;b']] }, ny, { separator: ';', includeHeaders: false }), 'a,b\r\n"a;b"\r\n');
    assert.throws(() => writeSchedulerCsv(table, ny, { separator: '"' }), /separator/);
  });

  it('escapeFormulas neutralizes formula prefixes in text cells only', () => {
    const csv = writeSchedulerCsv(table, ny, { escapeFormulas: true });
    assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
    const neg = writeSchedulerCsv({ columns: [{ key: 'n', role: null, field: 'n', headerText: 'n', type: 'number', width: 1 }], rows: [[-5], ['-5']] }, ny, { escapeFormulas: true, includeHeaders: false });
    assert.equal(neg, "-5\r\n'-5\r\n");
  });

  it('zonedIso writes the offset of the zone at that instant', () => {
    assert.equal(zonedIso(Date.UTC(2026, 6, 1, 13), ny), '2026-07-01T09:00:00-04:00');
    assert.equal(zonedIso(Date.UTC(2026, 6, 1, 13), createZoneConverter('UTC')), '2026-07-01T13:00:00Z');
    assert.equal(zonedIso(Date.UTC(2026, 6, 1, 13), createZoneConverter('Asia/Kolkata')), '2026-07-01T18:30:00+05:30');
  });
});

describe('XLSX export model', () => {
  const table = buildExportTable(records(rows), ctxFor(), { fields: ['id', 'title', 'start', 'allDay'], headerTexts: { title: 'Subject' } });
  const model = schedulerExportModel(table, { zone: ny });

  it('is a one-header-row model of typed cells', () => {
    assert.equal(model.rowCount, 4);
    assert.equal(model.timeZone, 'America/New_York');
    assert.deepEqual(model.headerRows[0]?.map((h) => h.text), ['id', 'Subject', 'start', 'allDay']);
    const row = model.getRow(0);
    assert.equal(row.kind, 'data');
    assert.deepEqual([...model.rows()].length, 4);
    if (row.kind !== 'data') return;
    assert.deepEqual(model.cell(row, model.columns[1]!), { value: 'Daily', text: 'Daily', type: 'string' });
    assert.equal(model.columns[2]!.text(row.row), '2026-11-23T09:00:00-05:00');
  });

  it('writeXlsx / exportXlsx accept it; dates are Excel serials of the zone wall time', async () => {
    const bytes = await writeXlsx(model, { compress: false, sheetName: 'Events' });
    const text = Buffer.from(bytes).toString('utf8');
    assert.ok(text.includes('name="Events"'));
    // 2026-11-23 09:00 wall time = serial 46349.375.
    assert.ok(text.includes('<v>46349.375</v>'), 'start as a date-time serial');
    assert.ok(/<c r="D2"[^>]*t="b"><v>0<\/v>/.test(text), 'allDay as a boolean');
    assert.ok(text.includes('Subject'));
    const file = await exportXlsx(model, { fileName: 'events', compress: false });
    assert.equal(file?.fileName, 'events.xlsx');
  });
});

describe('iCalendar mapping', () => {
  it('maps series, deleted and edited occurrences, zones and all-day events', () => {
    const ics = toICalendarEvents(records(rows), { zone: ny, zoneFor });
    assert.deepEqual(ics[0], {
      uid: '1',
      summary: 'Daily',
      start: { wall: '2026-11-23T09:00:00', timeZone: 'America/New_York' },
      end: { wall: '2026-11-23T09:30:00', timeZone: 'America/New_York' },
      rrule: 'FREQ=DAILY;COUNT=5',
      exdates: [{ wall: '2026-11-24T09:00:00', timeZone: 'America/New_York' }],
    });
    assert.deepEqual(ics[1], {
      uid: '1',
      summary: 'Moved',
      start: { wall: '2026-11-25T11:00:00', timeZone: 'America/New_York' },
      end: { wall: '2026-11-25T11:30:00', timeZone: 'America/New_York' },
      recurrenceId: { wall: '2026-11-25T09:00:00', timeZone: 'America/New_York' },
    });
    assert.deepEqual(ics[2]?.start, { wall: '2026-11-26T12:00:00', timeZone: 'Europe/Berlin' });
    assert.equal(ics[2]?.location, '=HYPERLINK("x")');
    assert.deepEqual([ics[3]?.start, ics[3]?.end, ics[3]?.description], [{ date: '2026-11-27' }, { date: '2026-11-28' }, 'Line 1\nLine 2']);
    const utc = toICalendarEvents(records(rows), { zone: ny, zoneFor }, { utc: true, uid: (e) => `ev-${e.id}@salmon`, extra: (e) => (e.row as Row)['roomId'] ? { 'X-SALMON-ROOM': String((e.row as Row)['roomId']) } : undefined });
    assert.deepEqual(utc[0]?.start, { epochMs: Date.UTC(2026, 10, 23, 14) });
    assert.equal(utc[1]?.uid, 'ev-1@salmon');
    assert.deepEqual(utc[1]?.extra, { 'X-SALMON-ROOM': 'A' });
    assert.equal(utc[2]?.extra, undefined);
    // An edited occurrence without its series is a plain event.
    const orphan = toICalendarEvents(records([rows[1]!]), { zone: ny, zoneFor });
    assert.deepEqual([orphan[0]?.uid, orphan[0]?.recurrenceId], ['2', undefined]);
  });

  it('imports parsed events as rows through the field map', () => {
    const fields = resolveFields({ title: 'Subject', start: 'StartTime', end: 'EndTime', recurrenceRule: 'RecurrenceRule', recurrenceId: 'RecurrenceID', recurrenceExceptions: 'RecurrenceException' });
    const imported = fromICalendarEvents(
      [
        { uid: 's', summary: 'Series', start: { wall: '2026-11-23T09:00:00', timeZone: 'America/New_York' }, end: { wall: '2026-11-23T09:30:00', timeZone: 'America/New_York' }, rrule: 'FREQ=DAILY;COUNT=5', exdates: [{ wall: '2026-11-24T09:00:00', timeZone: 'America/New_York' }] },
        { uid: 's', summary: 'Moved', start: { wall: '2026-11-25T11:00:00', timeZone: 'America/New_York' }, recurrenceId: { wall: '2026-11-25T09:00:00', timeZone: 'America/New_York' } },
        { uid: 'h', summary: 'Holiday', start: { date: '2026-11-27' } },
        { uid: 'b', start: { wall: '2026-11-26T12:00:00', timeZone: 'Europe/Berlin' }, end: { wall: '2026-11-26T13:00:00', timeZone: 'Europe/Berlin' }, location: 'Berlin' },
        { uid: 'w', start: { wall: '2026-11-26T12:00:00', timeZone: 'Eastern Standard Time' } },
        { uid: 'u', start: { epochMs: Date.UTC(2026, 10, 26, 15) }, end: { epochMs: Date.UTC(2026, 10, 26, 16) } },
        { uid: 'h', summary: 'Same UID', start: { date: '2026-11-28' } },
        { uid: '', start: { date: '2026-11-28' }, recurrenceId: { date: '2026-11-21' } },
      ],
      { fields, zone: ny, zoneFor },
    );
    const [series, moved, holiday, berlin, windows, utc, dup, orphan] = imported as Row[];
    assert.equal(series?.['id'], 's');
    assert.equal(series?.['Subject'], 'Series');
    assert.equal((series?.['StartTime'] as Date).toISOString(), '2026-11-23T14:00:00.000Z');
    assert.equal(series?.['startTimeZone'], 'America/New_York');
    assert.equal(series?.['RecurrenceRule'], 'FREQ=DAILY;COUNT=5');
    assert.equal(series?.['RecurrenceException'], '20261124T140000Z,20261125T140000Z');
    assert.equal(moved?.['id'], 's@20261125T140000Z');
    assert.equal(moved?.['RecurrenceID'], 's');
    assert.equal((moved?.['EndTime'] as Date).getTime(), (moved?.['StartTime'] as Date).getTime());
    assert.equal(holiday?.['allDay'], true);
    assert.equal((holiday?.['StartTime'] as Date).toISOString(), '2026-11-27T05:00:00.000Z');
    assert.equal((holiday?.['EndTime'] as Date).toISOString(), '2026-11-28T05:00:00.000Z');
    assert.equal((berlin?.['StartTime'] as Date).toISOString(), '2026-11-26T11:00:00.000Z');
    assert.equal(berlin?.['location'], 'Berlin');
    assert.equal((windows?.['StartTime'] as Date).toISOString(), '2026-11-26T17:00:00.000Z', 'an unknown TZID is Scheduler wall time');
    assert.equal(windows?.['startTimeZone'], undefined);
    assert.equal(utc?.['startTimeZone'], undefined);
    assert.equal(dup?.['id'], 'h-6');
    assert.equal(orphan?.['id'], 'ics-7');
    assert.equal(orphan?.['RecurrenceID'], undefined);
    const mapped = fromICalendarEvents([{ uid: 'x', start: { date: '2026-11-27' }, extra: { 'X-ROOM': 'B' } }], { fields, zone: ny, zoneFor }, { createId: (_e, i) => 100 + i, map: (r, e): Row => ({ ...r, roomId: e.extra?.['X-ROOM'] }) });
    assert.deepEqual([mapped[0]?.['id'], mapped[0]?.['roomId']], [100, 'B']);
  });

  it('round-trips through the RFC 5545 writer and parser with the same occurrences', () => {
    const ctx = ctxFor();
    const before = records(rows, ctx);
    const text = writeICalendar(toICalendarEvents(before, ctx), { dtstamp: 0 });
    const after = records(fromICalendarEvents(parseICalendar(text).events, ctx) as Row[], ctx);
    const show = (recs: typeof before) => occurrencesIn(recs, week, ctx).map((o) => `${o.event.title}|${new Date(o.start).toISOString()}|${new Date(o.end).toISOString()}|${o.allDay}|${o.seriesId !== undefined}`);
    assert.deepEqual(show(after), show(before));
    assert.equal(after[2]?.startTimeZone, 'Europe/Berlin');
  });
});
