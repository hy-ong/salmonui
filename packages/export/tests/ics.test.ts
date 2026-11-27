// iCalendar writer and parser: RFC 5545 VCALENDAR /
// VEVENT text, line folding, TEXT escaping, the three time forms, RRULE,
// EXDATE, RECURRENCE-ID and VTIMEZONE.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { escapeText, exportICalendar, foldLine, ICS_MIME_TYPE, parseICalendar, unescapeText, vtimezone, writeICalendar, type ICalendarEvent } from '@salmonui/export/ics';

const STAMP = Date.UTC(2026, 10, 24, 8, 0, 0);
const lines = (text: string): string[] => text.split('\r\n');
const unfold = (text: string): string[] => text.replace(/\r\n[ \t]/g, '').split('\r\n');

describe('writeICalendar', () => {
  it('writes a VCALENDAR with CRLF line ends, UID, DTSTAMP and the text properties', () => {
    const text = writeICalendar([{ uid: 'e1@salmon', summary: 'Standup', location: 'Room 1', description: 'Daily', start: { epochMs: Date.UTC(2026, 10, 24, 14) }, end: { epochMs: Date.UTC(2026, 10, 24, 14, 30) } }], { dtstamp: STAMP, calendarName: 'Team', timeZone: 'UTC', method: 'publish' });
    assert.ok(text.endsWith('END:VCALENDAR\r\n'));
    assert.ok(!/[^\r]\n/.test(text), 'every line break is CRLF');
    const l = lines(text);
    assert.deepEqual(l.slice(0, 4), ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Salmon UI//Scheduler//EN', 'CALSCALE:GREGORIAN']);
    for (const want of ['METHOD:PUBLISH', 'X-WR-CALNAME:Team', 'X-WR-TIMEZONE:UTC', 'UID:e1@salmon', 'DTSTAMP:20261124T080000Z', 'DTSTART:20261124T140000Z', 'DTEND:20261124T143000Z', 'SUMMARY:Standup', 'LOCATION:Room 1', 'DESCRIPTION:Daily']) assert.ok(l.includes(want), want);
    assert.ok(!text.includes('VTIMEZONE'), 'no VTIMEZONE without a TZID');
  });

  it('escapes TEXT values (backslash, semicolon, comma, line breaks)', () => {
    assert.equal(escapeText('a\\b;c,d\ne\r\nf'), 'a\\\\b\\;c\\,d\\ne\\nf');
    assert.equal(unescapeText('a\\\\b\\;c\\,d\\ne\\Nf'), 'a\\b;c,d\ne\nf');
    const text = writeICalendar([{ uid: 'x', summary: 'Lunch, team; room\\2\nfloor 3', start: { date: '2026-11-24' } }], { dtstamp: STAMP });
    assert.ok(lines(text).includes('SUMMARY:Lunch\\, team\\; room\\\\2\\nfloor 3'));
    assert.equal(parseICalendar(text).events[0]?.summary, 'Lunch, team; room\\2\nfloor 3');
  });

  it('folds lines at 75 octets without splitting a multi-byte UTF-8 character', () => {
    const summary = `會議${'日本語テキスト😀'.repeat(20)}`;
    const text = writeICalendar([{ uid: 'fold', summary, start: { date: '2026-11-24' } }], { dtstamp: STAMP });
    const physical = lines(text).filter((l) => l.length);
    for (const l of physical) {
      assert.ok(Buffer.byteLength(l, 'utf8') <= 75, `${Buffer.byteLength(l, 'utf8')} octets: ${l}`);
      assert.ok(!/[\uD800-\uDBFF]$/.test(l) && !/^[ ]?[\uDC00-\uDFFF]/.test(l), 'no split surrogate pair');
    }
    assert.ok(physical.filter((l) => l.startsWith(' ')).length > 3, 'the summary is folded');
    assert.ok(unfold(text).includes(`SUMMARY:${summary}`));
    assert.equal(parseICalendar(text).events[0]?.summary, summary);
    // ASCII: the first line holds 75 octets, continuation lines a space plus 74.
    const folded = foldLine('X'.repeat(200)).split('\r\n');
    assert.deepEqual(folded.map((l) => l.length), [75, 75, 52]);
    assert.ok(folded.slice(1).every((l) => l.startsWith(' ')));
  });

  it('writes all-day dates, zoned wall times with VTIMEZONE and floating times', () => {
    const text = writeICalendar(
      [
        { uid: 'a', start: { date: '2026-11-24' }, end: { date: '2026-11-26' } },
        { uid: 'b', start: { wall: '2026-07-01T09:00:00', timeZone: 'Europe/Berlin' }, end: { wall: '2026-07-01T10:30', timeZone: 'Europe/Berlin' } },
        { uid: 'c', start: { wall: '2026-07-01T09:00:00' } },
      ],
      { dtstamp: STAMP },
    );
    const l = lines(text);
    for (const want of ['DTSTART;VALUE=DATE:20261124', 'DTEND;VALUE=DATE:20261126', 'DTSTART;TZID=Europe/Berlin:20260701T090000', 'DTEND;TZID=Europe/Berlin:20260701T103000', 'DTSTART:20260701T090000']) assert.ok(l.includes(want), want);
    const tz = text.slice(text.indexOf('BEGIN:VTIMEZONE'), text.indexOf('END:VTIMEZONE'));
    assert.ok(tz.includes('TZID:Europe/Berlin'));
    assert.ok(tz.includes('BEGIN:DAYLIGHT\r\nDTSTART:20260329T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200'));
    assert.ok(tz.includes('BEGIN:STANDARD\r\nDTSTART:20261025T030000\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100'));
    assert.ok(text.indexOf('END:VTIMEZONE') < text.indexOf('BEGIN:VEVENT'));
    assert.equal(writeICalendar([{ uid: 'b', start: { wall: '2026-07-01T09:00:00', timeZone: 'Europe/Berlin' } }], { dtstamp: STAMP, vtimezone: false }).includes('VTIMEZONE'), false);
  });

  it('VTIMEZONE: southern hemisphere rules, fixed zones, unknown zones', () => {
    const sydney = vtimezone('Australia/Sydney', 2026, 2027)!.join('\n');
    assert.match(sydney, /BEGIN:DAYLIGHT\nDTSTART:20261004T020000\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU\nTZOFFSETFROM:\+1000\nTZOFFSETTO:\+1100/);
    assert.deepEqual(vtimezone('Asia/Tokyo', 2026, 2026), ['BEGIN:VTIMEZONE', 'TZID:Asia/Tokyo', 'BEGIN:STANDARD', 'DTSTART:19700101T000000', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900', 'END:STANDARD', 'END:VTIMEZONE']);
    assert.match(vtimezone('Asia/Kolkata', 2026, 2026)!.join('\n'), /TZOFFSETTO:\+0530/);
    assert.equal(vtimezone('Not/AZone', 2026, 2026), null);
    // An unknown TZID is still written on the properties, without a VTIMEZONE.
    const text = writeICalendar([{ uid: 'w', start: { wall: '2026-07-01T09:00:00', timeZone: 'Eastern Standard Time' } }], { dtstamp: STAMP });
    assert.ok(lines(text).includes('DTSTART;TZID=Eastern Standard Time:20260701T090000'));
    assert.ok(!text.includes('VTIMEZONE'));
  });

  it('passes RRULE through and groups EXDATE values by form', () => {
    const text = writeICalendar(
      [
        {
          uid: 's',
          start: { wall: '2026-11-02T09:00:00', timeZone: 'America/New_York' },
          end: { wall: '2026-11-02T10:00:00', timeZone: 'America/New_York' },
          rrule: 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T235959Z;',
          exdates: [{ wall: '2026-11-04T09:00:00', timeZone: 'America/New_York' }, { wall: '2026-11-09T09:00:00', timeZone: 'America/New_York' }, { epochMs: Date.UTC(2026, 10, 11, 14) }],
        },
      ],
      { dtstamp: STAMP },
    );
    const l = lines(text);
    assert.ok(l.includes('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T235959Z'));
    assert.ok(l.includes('EXDATE;TZID=America/New_York:20261104T090000,20261109T090000'));
    assert.ok(l.includes('EXDATE:20261111T140000Z'));
  });

  it('writes edited occurrences with RECURRENCE-ID, extra properties and quoted parameters', () => {
    const text = writeICalendar(
      [
        { uid: 's', start: { date: '2026-11-02' }, rrule: 'FREQ=DAILY;COUNT=5', extra: { 'X-SALMON-ROOM': 'A, B', categories: 'Work' } },
        { uid: 's', start: { date: '2026-11-04' }, end: { date: '2026-11-05' }, recurrenceId: { date: '2026-11-03' }, summary: 'Moved' },
        { uid: 'q', start: { wall: '2026-11-02T09:00:00', timeZone: 'Custom;Zone' } },
      ],
      { dtstamp: STAMP, vtimezone: false, properties: { 'X-PUBLISHED-TTL': 'PT1H' } },
    );
    const l = lines(text);
    for (const want of ['RECURRENCE-ID;VALUE=DATE:20261103', 'X-SALMON-ROOM:A\\, B', 'CATEGORIES:Work', 'X-PUBLISHED-TTL:PT1H', 'DTSTART;TZID="Custom;Zone":20261102T090000']) assert.ok(l.includes(want), want);
    assert.throws(() => writeICalendar([{ uid: 'x', start: { date: '2026-11-02' }, extra: { 'bad name': 'v' } }]), /invalid property name/);
    assert.throws(() => writeICalendar([{ uid: 'x', start: { date: '2026/11/02' } }]), /invalid date/);
    assert.throws(() => writeICalendar([{ uid: 'x', start: { wall: 'tomorrow' } }]), /invalid wall time/);
  });

  it('exportICalendar returns an export file', () => {
    const file = exportICalendar([{ uid: 'a', start: { date: '2026-11-24' } }], { fileName: 'team', dtstamp: STAMP });
    assert.equal(file.fileName, 'team.ics');
    assert.equal(file.mimeType, ICS_MIME_TYPE);
    assert.ok(file.data.startsWith('BEGIN:VCALENDAR\r\n'));
    assert.equal(exportICalendar([], { fileName: 'x.ICS' }).fileName, 'x.ICS');
    assert.equal(exportICalendar([]).fileName, 'calendar.ics');
  });
});

describe('parseICalendar', () => {
  it('round-trips every modelled field', () => {
    const events: ICalendarEvent[] = [
      {
        uid: 'series-1',
        summary: 'Review, weekly; \\ notes',
        location: 'Room 2',
        description: 'Line 1\nLine 2',
        start: { wall: '2026-11-02T09:00:00', timeZone: 'America/New_York' },
        end: { wall: '2026-11-02T10:00:00', timeZone: 'America/New_York' },
        rrule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=10',
        exdates: [{ wall: '2026-11-16T09:00:00', timeZone: 'America/New_York' }],
        dtstamp: STAMP,
        extra: { 'X-SALMON-ID': '42' },
      },
      { uid: 'series-1', summary: 'Moved', start: { wall: '2026-11-10T11:00:00', timeZone: 'America/New_York' }, end: { wall: '2026-11-10T12:00:00', timeZone: 'America/New_York' }, recurrenceId: { wall: '2026-11-09T09:00:00', timeZone: 'America/New_York' }, dtstamp: STAMP },
      { uid: 'allday', summary: 'Holiday', start: { date: '2026-12-25' }, end: { date: '2026-12-26' }, dtstamp: STAMP },
      { uid: 'utc', summary: 'Call', start: { epochMs: Date.UTC(2026, 10, 24, 14) }, end: { epochMs: Date.UTC(2026, 10, 24, 15) }, dtstamp: STAMP },
      { uid: 'floating', start: { wall: '2026-11-24T08:00:00' }, dtstamp: STAMP },
    ];
    const doc = parseICalendar(writeICalendar(events, { dtstamp: STAMP, calendarName: 'Team; A', timeZone: 'America/New_York', method: 'PUBLISH' }));
    assert.deepEqual(doc.events, events);
    assert.equal(doc.calendarName, 'Team; A');
    assert.equal(doc.timeZone, 'America/New_York');
    assert.equal(doc.method, 'PUBLISH');
    assert.equal(doc.prodId, '-//Salmon UI//Scheduler//EN');
  });

  it('reads foreign files: LF and tab folding, BOM, lowercase names, quoted TZID, DURATION, multiple EXDATE lines, VALARM', () => {
    const text = [
      '﻿BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VTIMEZONE',
      'TZID:Europe/Berlin',
      'BEGIN:STANDARD',
      'DTSTART:19701025T030000',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0100',
      'END:STANDARD',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'uid:abc',
      'DTSTART;TZID="/Europe/Berlin":20261124T090000',
      'DURATION:PT1H30M',
      'SUMMARY:Long sum',
      '\tmary text',
      'EXDATE;TZID=Europe/Berlin:20261201T090000',
      'EXDATE;TZID=Europe/Berlin:20261208T090000,20261215T090000',
      'RRULE:FREQ=WEEKLY',
      'ATTENDEE;CN="Doe, Jane":mailto:jane@example.com',
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Alarm text',
      'TRIGGER:-PT15M',
      'END:VALARM',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:d',
      'DTSTART;VALUE=DATE:20261124',
      'DURATION:P2D',
      'END:VEVENT',
      'BEGIN:VEVENT',
      'UID:no-start',
      'SUMMARY:dropped',
      'END:VEVENT',
      'BEGIN:VTODO',
      'UID:todo',
      'DTSTART:20261124T090000Z',
      'END:VTODO',
      'END:VCALENDAR',
    ].join('\n');
    const { events } = parseICalendar(text);
    assert.equal(events.length, 2);
    const [a, d] = events;
    assert.deepEqual(a, {
      uid: 'abc',
      start: { wall: '2026-11-24T09:00:00', timeZone: 'Europe/Berlin' },
      end: { wall: '2026-11-24T10:30:00', timeZone: 'Europe/Berlin' },
      summary: 'Long summary text',
      rrule: 'FREQ=WEEKLY',
      exdates: [{ wall: '2026-12-01T09:00:00', timeZone: 'Europe/Berlin' }, { wall: '2026-12-08T09:00:00', timeZone: 'Europe/Berlin' }, { wall: '2026-12-15T09:00:00', timeZone: 'Europe/Berlin' }],
      extra: { ATTENDEE: 'mailto:jane@example.com' },
    });
    assert.deepEqual(d, { uid: 'd', start: { date: '2026-11-24' }, end: { date: '2026-11-26' } });
  });

  it('reads UTC and DATE values on RECURRENCE-ID and EXDATE, and an empty UID', () => {
    const text = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART:20261124T090000Z\r\nRECURRENCE-ID:20261123T090000Z\r\nEXDATE;VALUE=DATE:20261201,20261202\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
    const [e] = parseICalendar(text).events;
    assert.equal(e?.uid, '');
    assert.deepEqual(e?.recurrenceId, { epochMs: Date.UTC(2026, 10, 23, 9) });
    assert.deepEqual(e?.exdates, [{ date: '2026-12-01' }, { date: '2026-12-02' }]);
    assert.deepEqual(parseICalendar('').events, []);
  });
});
