// `@salmonui/export/ics`: an RFC 5545 iCalendar writer and parser
// for the Scheduler. Zero dependencies and no DOM: the only platform
// API is `Intl.DateTimeFormat`, read to generate VTIMEZONE components.
//
// Event shape (`ICalendarEvent`), plain and framework-agnostic:
//
//   { uid, summary?, location?, description?, start, end?, rrule?,
//     exdates?, recurrenceId?, dtstamp?, extra? }
//
// Times (`ICalendarTime`) take one of three forms, which map 1:1 to the
// three RFC 5545 DATE-TIME / DATE forms:
//
//   { epochMs }                  UTC instant      DTSTART:20261124T140000Z
//   { date: 'YYYY-MM-DD' }       all-day date     DTSTART;VALUE=DATE:20261124
//   { wall: 'YYYY-MM-DDTHH:mm:ss', timeZone }
//                                zoned wall time  DTSTART;TZID=Europe/Berlin:20261124T090000
//   { wall: 'YYYY-MM-DDTHH:mm:ss' }
//                                floating time    DTSTART:20261124T090000
//
// All-day ends are exclusive (the day after the last day), as RFC 5545
// DTEND. `rrule` is the RRULE value without the `RRULE:` prefix and is passed
// through unchanged. `exdates` are written grouped by form (one EXDATE line
// per zone / form, comma separated). An edited occurrence of a series is a
// separate VEVENT with the series' `uid` and `recurrenceId` set to the
// original start of the occurrence. `extra` holds additional properties
// (`X-...` names, or any IANA name) as TEXT values; the parser puts every
// property it does not model into `extra` (the value unescaped, parameters
// dropped, the first occurrence kept). TZID values are returned as written
// (normally IANA names; Windows names such as `Eastern Standard Time` are not
// mapped); VTIMEZONE components are not parsed.

/** An instant, an all-day date, or a wall time (zoned with `timeZone`, floating without). */
export type ICalendarTime =
  | { readonly epochMs: number }
  | { readonly date: string }
  | { readonly wall: string; readonly timeZone?: string | undefined };

/** One VEVENT. */
export interface ICalendarEvent {
  /** UID; a series and its edited occurrences share it. The parser returns `''` when the VEVENT has none. */
  readonly uid: string;
  readonly summary?: string | undefined;
  readonly location?: string | undefined;
  readonly description?: string | undefined;
  readonly start: ICalendarTime;
  /** Exclusive end; omitted means zero duration (date-time) or one day (date). */
  readonly end?: ICalendarTime | undefined;
  /** RRULE value without the `RRULE:` prefix (`FREQ=WEEKLY;BYDAY=MO`). */
  readonly rrule?: string | undefined;
  /** EXDATE values (excluded occurrence starts). */
  readonly exdates?: readonly ICalendarTime[] | undefined;
  /** RECURRENCE-ID: the original start of the occurrence this VEVENT replaces. */
  readonly recurrenceId?: ICalendarTime | undefined;
  /** DTSTAMP (epoch ms); defaults to the writer's `dtstamp`. */
  readonly dtstamp?: number | undefined;
  /** Further properties by name (`X-SALMON-ROOM`), written and read as TEXT. */
  readonly extra?: Readonly<Record<string, string>> | undefined;
}

export interface ICalendarWriteOptions {
  /** PRODID. Default `-//Salmon UI//Scheduler//EN`. */
  readonly prodId?: string | undefined;
  /** METHOD (`PUBLISH`, `REQUEST`); omitted by default. */
  readonly method?: string | undefined;
  /** X-WR-CALNAME. */
  readonly calendarName?: string | undefined;
  /** X-WR-TIMEZONE (the calendar's default zone, informational). */
  readonly timeZone?: string | undefined;
  /** DTSTAMP of events without their own (epoch ms). Default `Date.now()`. */
  readonly dtstamp?: number | undefined;
  /** VTIMEZONE components for every TZID used, from the platform zone data. Default true. */
  readonly vtimezone?: boolean | undefined;
  /** Further calendar-level properties (TEXT values). */
  readonly properties?: Readonly<Record<string, string>> | undefined;
}

export interface ICalendarExportOptions extends ICalendarWriteOptions {
  /** File name; `.ics` is appended when missing. Default `calendar.ics`. */
  readonly fileName?: string | undefined;
}

/** A parsed VCALENDAR. */
export interface ICalendarDocument {
  readonly events: ICalendarEvent[];
  readonly prodId?: string | undefined;
  readonly method?: string | undefined;
  /** X-WR-CALNAME. */
  readonly calendarName?: string | undefined;
  /** X-WR-TIMEZONE. */
  readonly timeZone?: string | undefined;
}

export const ICS_MIME_TYPE = 'text/calendar';

const CRLF = '\r\n';
const NAME = /^[A-Za-z0-9-]+$/;

// ---------------------------------------------------------------------------
// Text, folding, parameters
// ---------------------------------------------------------------------------

/** TEXT escape (RFC 5545 3.3.11): backslash, `;`, `,` and line breaks. */
export function escapeText(text: string): string {
  return text.replace(/[\\;,]|\r\n|\r|\n/g, (c) => (c === '\\' ? '\\\\' : c === ';' ? '\\;' : c === ',' ? '\\,' : '\\n'));
}

/** Reverses `escapeText`. */
export function unescapeText(text: string): string {
  return text.replace(/\\([\\;,nN])/g, (_, c: string) => (c === 'n' || c === 'N' ? '\n' : c));
}

const octets = (cp: number): number => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/** Folds a content line at 75 octets (UTF-8), never inside a character; continuation lines start with a space. */
export function foldLine(line: string): string {
  let out = '';
  let used = 0;
  let limit = 75;
  for (const ch of line) {
    const n = octets(ch.codePointAt(0) as number);
    if (used + n > limit) {
      out += `${CRLF} `;
      used = 1;
      limit = 75;
    }
    out += ch;
    used += n;
  }
  return out;
}

const paramValue = (v: string): string => {
  const clean = v.replace(/["\r\n]/g, '');
  return /[:;,]/.test(clean) ? `"${clean}"` : clean;
};

// ---------------------------------------------------------------------------
// Times
// ---------------------------------------------------------------------------

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

const DATE_RE = /^(\d{4})-?(\d{2})-?(\d{2})$/;
const WALL_RE = /^(\d{4})-?(\d{2})-?(\d{2})T(\d{2}):?(\d{2})(?::?(\d{2}))?(?:\.\d+)?$/;

function utcStamp(epochMs: number): string {
  const d = new Date(epochMs);
  if (!Number.isFinite(d.getTime())) throw new Error(`writeICalendar: invalid instant ${epochMs}.`);
  return `${pad(d.getUTCFullYear(), 4)}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function dateStamp(date: string): string {
  const m = DATE_RE.exec(date);
  if (!m) throw new Error(`writeICalendar: invalid date "${date}" (expected YYYY-MM-DD).`);
  return `${m[1]}${m[2]}${m[3]}`;
}

function wallStamp(wall: string): string {
  const m = WALL_RE.exec(wall);
  if (!m) throw new Error(`writeICalendar: invalid wall time "${wall}" (expected YYYY-MM-DDTHH:mm:ss).`);
  return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6] ?? '00'}`;
}

/** `[params, value]` of a time; `group` keys EXDATE lines. */
function timeParts(t: ICalendarTime): { readonly params: string; readonly value: string; readonly group: string } {
  if ('epochMs' in t) return { params: '', value: utcStamp(t.epochMs), group: 'Z' };
  if ('date' in t) return { params: ';VALUE=DATE', value: dateStamp(t.date), group: 'D' };
  const value = wallStamp(t.wall);
  return t.timeZone ? { params: `;TZID=${paramValue(t.timeZone)}`, value, group: `T${t.timeZone}` } : { params: '', value, group: 'F' };
}

// ---------------------------------------------------------------------------
// VTIMEZONE (from Intl zone data)
// ---------------------------------------------------------------------------

const HOUR = 3_600_000;
const DAY = 86_400_000;

function offsetReader(zone: string): ((t: number) => number) | null {
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
  } catch {
    return null;
  }
  return (t) => {
    const p: Record<string, number> = {};
    for (const part of fmt.formatToParts(t)) if (part.type !== 'literal') p[part.type] = Number(part.value);
    const wall = Date.UTC(p['year'] ?? 1970, (p['month'] ?? 1) - 1, p['day'] ?? 1, (p['hour'] ?? 0) % 24, p['minute'] ?? 0, p['second'] ?? 0);
    return wall - (t - (((t % 1000) + 1000) % 1000));
  };
}

const offsetText = (ms: number): string => {
  const sign = ms < 0 ? '-' : '+';
  const s = Math.round(Math.abs(ms) / 1000);
  const sec = s % 60;
  return `${sign}${pad(Math.floor(s / 3600))}${pad(Math.floor(s / 60) % 60)}${sec ? pad(sec) : ''}`;
};

interface Transition {
  readonly at: number;
  readonly from: number;
  readonly to: number;
}

/** Offset transitions of a zone between two instants (daily scan, then a binary search to the second). */
function transitions(offset: (t: number) => number, start: number, end: number): Transition[] {
  const out: Transition[] = [];
  let t = start;
  let o = offset(t);
  while (t < end) {
    const next = Math.min(t + DAY, end);
    const on = offset(next);
    if (on !== o) {
      let lo = t;
      let hi = next;
      while (hi - lo > 1000) {
        const mid = lo + Math.max(1000, Math.floor((hi - lo) / 2000) * 1000);
        if (offset(mid) === o) lo = mid;
        else hi = mid;
      }
      out.push({ at: hi, from: o, to: on });
      o = on;
    }
    t = next;
  }
  return out;
}

function wallFields(ms: number): { y: number; mo: number; d: number; wd: number; time: string } {
  const d = new Date(ms);
  return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), wd: d.getUTCDay(), time: `${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}` };
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function observance(tr: Transition, rule: string | null): string[] {
  const local = wallFields(tr.at + tr.from);
  return [
    tr.to > tr.from ? 'BEGIN:DAYLIGHT' : 'BEGIN:STANDARD',
    `DTSTART:${pad(local.y, 4)}${pad(local.mo)}${pad(local.d)}T${local.time}`,
    ...(rule ? [`RRULE:${rule}`] : []),
    `TZOFFSETFROM:${offsetText(tr.from)}`,
    `TZOFFSETTO:${offsetText(tr.to)}`,
    tr.to > tr.from ? 'END:DAYLIGHT' : 'END:STANDARD',
  ];
}

/**
 * A VTIMEZONE for `zone` covering the years `[fromYear, toYear]`: yearly
 * RRULE observances when the transitions follow an nth-weekday pattern every
 * year of the span (as most zones do), otherwise one observance per
 * transition. Null when the platform does not know the zone.
 */
export function vtimezone(zone: string, fromYear: number, toYear: number): string[] | null {
  const offset = offsetReader(zone);
  if (!offset) return null;
  const y0 = Math.max(1900, Math.min(fromYear, toYear));
  const y1 = Math.min(Math.max(fromYear, toYear), y0 + 49);
  const list = transitions(offset, Date.UTC(y0, 0, 1) - DAY, Date.UTC(y1 + 1, 0, 1) + DAY);
  const lines = ['BEGIN:VTIMEZONE', `TZID:${zone}`];
  if (!list.length) {
    const o = offset(Date.UTC(y0, 0, 1));
    lines.push(...observance({ at: Date.UTC(1970, 0, 1) - o, from: o, to: o }, null));
  } else {
    // Group by (offsets, month, weekday, ordinal, local time); one group per observance kind.
    const groups = new Map<string, { first: Transition; rule: string; years: Set<number> }>();
    for (const tr of list) {
      const w = wallFields(tr.at + tr.from);
      const days = new Date(Date.UTC(w.y, w.mo, 0)).getUTCDate();
      const ord = w.d + 7 > days ? -1 : Math.ceil(w.d / 7);
      const key = `${tr.from}|${tr.to}|${w.mo}|${w.wd}|${ord}|${w.time}`;
      const g = groups.get(key);
      if (g) g.years.add(w.y);
      else groups.set(key, { first: tr, rule: `FREQ=YEARLY;BYMONTH=${w.mo};BYDAY=${ord}${WEEKDAYS[w.wd]}`, years: new Set([w.y]) });
    }
    const span = new Set(list.map((tr) => wallFields(tr.at + tr.from).y)).size;
    const yearly = groups.size <= 2 && [...groups.values()].every((g) => g.years.size === span && g.years.size === list.filter((tr) => tr.from === g.first.from && tr.to === g.first.to).length);
    if (yearly && span > 1) for (const g of groups.values()) lines.push(...observance(g.first, g.rule));
    else for (const tr of list) lines.push(...observance(tr, null));
  }
  lines.push('END:VTIMEZONE');
  return lines;
}

const yearOf = (wall: string): number => Number(wall.slice(0, 4));

// ---------------------------------------------------------------------------
// Writer
// ---------------------------------------------------------------------------

function textProp(name: string, value: string | undefined): string | null {
  return value === undefined || value === '' ? null : `${name}:${escapeText(value)}`;
}

function extraLines(extra: Readonly<Record<string, string>> | undefined): string[] {
  const out: string[] = [];
  if (!extra) return out;
  for (const [name, value] of Object.entries(extra)) {
    if (!NAME.test(name)) throw new Error(`writeICalendar: invalid property name "${name}".`);
    out.push(`${name.toUpperCase()}:${escapeText(String(value))}`);
  }
  return out;
}

/** Writes events as an RFC 5545 VCALENDAR (CRLF line ends, lines folded at 75 octets). */
export function writeICalendar(events: readonly ICalendarEvent[], options: ICalendarWriteOptions = {}): string {
  const stamp = options.dtstamp ?? Date.now();
  const lines: string[] = ['BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:${escapeText(options.prodId ?? '-//Salmon UI//Scheduler//EN')}`, 'CALSCALE:GREGORIAN'];
  if (options.method) lines.push(`METHOD:${options.method.toUpperCase()}`);
  const name = textProp('X-WR-CALNAME', options.calendarName);
  if (name) lines.push(name);
  const tz = textProp('X-WR-TIMEZONE', options.timeZone);
  if (tz) lines.push(tz);
  lines.push(...extraLines(options.properties));

  // Years per TZID for VTIMEZONE.
  if (options.vtimezone !== false) {
    const years = new Map<string, [number, number]>();
    const note = (t: ICalendarTime | undefined): void => {
      if (!t || !('wall' in t) || !t.timeZone) return;
      const y = yearOf(t.wall);
      const r = years.get(t.timeZone);
      if (r) years.set(t.timeZone, [Math.min(r[0], y), Math.max(r[1], y)]);
      else years.set(t.timeZone, [y, y]);
    };
    for (const e of events) {
      note(e.start);
      note(e.end);
      note(e.recurrenceId);
      for (const x of e.exdates ?? []) note(x);
    }
    for (const [zone, [a, b]] of years) {
      // At least two years, so a zone with daylight saving time gets yearly rules.
      const block = vtimezone(zone, a, Math.max(b, a + 1));
      if (block) lines.push(...block);
    }
  }

  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${escapeText(e.uid)}`, `DTSTAMP:${utcStamp(e.dtstamp ?? stamp)}`);
    const start = timeParts(e.start);
    lines.push(`DTSTART${start.params}:${start.value}`);
    if (e.end) {
      const end = timeParts(e.end);
      lines.push(`DTEND${end.params}:${end.value}`);
    }
    if (e.recurrenceId) {
      const rid = timeParts(e.recurrenceId);
      lines.push(`RECURRENCE-ID${rid.params}:${rid.value}`);
    }
    if (e.rrule) {
      const rule = e.rrule.replace(/^RRULE:/i, '').replace(/;+$/, '').trim();
      if (rule) lines.push(`RRULE:${rule}`);
    }
    if (e.exdates?.length) {
      const groups = new Map<string, { params: string; values: string[] }>();
      for (const x of e.exdates) {
        const p = timeParts(x);
        const g = groups.get(p.group);
        if (g) g.values.push(p.value);
        else groups.set(p.group, { params: p.params, values: [p.value] });
      }
      for (const g of groups.values()) lines.push(`EXDATE${g.params}:${g.values.join(',')}`);
    }
    for (const [prop, value] of [['SUMMARY', e.summary], ['LOCATION', e.location], ['DESCRIPTION', e.description]] as const) {
      const line = textProp(prop, value);
      if (line) lines.push(line);
    }
    lines.push(...extraLines(e.extra), 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  let out = '';
  for (const line of lines) out += foldLine(line) + CRLF;
  return out;
}

/** `writeICalendar` as an export file (`{ fileName, mimeType: 'text/calendar', data }`). */
export function exportICalendar(events: readonly ICalendarEvent[], options: ICalendarExportOptions = {}): { readonly fileName: string; readonly mimeType: string; readonly data: string } {
  const base = options.fileName?.trim() || 'calendar';
  return { fileName: base.toLowerCase().endsWith('.ics') ? base : `${base}.ics`, mimeType: ICS_MIME_TYPE, data: writeICalendar(events, options) };
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

interface ContentLine {
  readonly name: string;
  readonly params: Readonly<Record<string, string>>;
  readonly value: string;
}

/** Splits `NAME;P=V;P2="a:b":value`; null for a malformed line. */
function contentLine(line: string): ContentLine | null {
  let i = 0;
  while (i < line.length && line[i] !== ';' && line[i] !== ':') i++;
  if (i === line.length) return null;
  const name = line.slice(0, i).toUpperCase();
  const params: Record<string, string> = {};
  while (line[i] === ';') {
    i++;
    const eq = line.indexOf('=', i);
    if (eq < 0) return null;
    const key = line.slice(i, eq).toUpperCase();
    i = eq + 1;
    let value = '';
    // A parameter may hold several comma separated values; the first one is kept.
    let first = true;
    for (;;) {
      let part: string;
      if (line[i] === '"') {
        const close = line.indexOf('"', i + 1);
        if (close < 0) return null;
        part = line.slice(i + 1, close);
        i = close + 1;
      } else {
        const start = i;
        while (i < line.length && line[i] !== ';' && line[i] !== ':' && line[i] !== ',') i++;
        part = line.slice(start, i);
      }
      if (first) value = part;
      first = false;
      if (line[i] !== ',') break;
      i++;
    }
    params[key] = value;
  }
  if (line[i] !== ':') return null;
  return { name, params, value: line.slice(i + 1) };
}

const plainDate = (v: string): string | null => {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
};

/** A DATE / DATE-TIME value with its parameters; null when unreadable. */
function parseTime(value: string, params: Readonly<Record<string, string>>): ICalendarTime | null {
  const v = value.trim();
  const date = plainDate(v);
  if (date && (params['VALUE'] === 'DATE' || v.length === 8)) return { date };
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/.exec(v);
  if (!m) return date ? { date } : null;
  if (m[7]) return { epochMs: Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6])) };
  const wall = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
  const tzid = params['TZID']?.replace(/^\//, '');
  return tzid ? { wall, timeZone: tzid } : { wall };
}

/** DURATION (`P1D`, `PT1H30M`, `-P1W`) in ms; null when unreadable. */
function parseDuration(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(value.trim());
  if (!m || value.trim() === 'P' || value.trim().endsWith('T')) return null;
  const ms = (Number(m[2] ?? 0) * 7 + Number(m[3] ?? 0)) * DAY + Number(m[4] ?? 0) * HOUR + Number(m[5] ?? 0) * 60_000 + Number(m[6] ?? 0) * 1000;
  return m[1] === '-' ? -ms : ms;
}

const isoWall = (ms: number): string => new Date(ms).toISOString().slice(0, 19);

/** `start` moved by a duration in the same form (dates by whole days). */
function addDuration(start: ICalendarTime, ms: number): ICalendarTime {
  if ('epochMs' in start) return { epochMs: start.epochMs + ms };
  if ('date' in start) return { date: isoWall(Date.parse(`${start.date}T00:00:00Z`) + Math.round(ms / DAY) * DAY).slice(0, 10) };
  const t = Date.parse(`${start.wall}Z`) + ms;
  return start.timeZone ? { wall: isoWall(t), timeZone: start.timeZone } : { wall: isoWall(t) };
}

const MODELED = new Set(['UID', 'SUMMARY', 'LOCATION', 'DESCRIPTION', 'DTSTART', 'DTEND', 'DURATION', 'RRULE', 'EXDATE', 'RECURRENCE-ID', 'DTSTAMP']);

/**
 * Parses iCalendar text (RFC 5545): unfolds lines, unescapes TEXT values and
 * reads every VEVENT (nested components such as VALARM are skipped). A
 * VEVENT without a readable DTSTART is dropped. A DURATION without DTEND
 * becomes `end`.
 */
export function parseICalendar(text: string): ICalendarDocument {
  const raw = text.replace(/^﻿/, '').split(/\r\n|\n|\r/);
  const lines: string[] = [];
  for (const l of raw) {
    if ((l.startsWith(' ') || l.startsWith('\t')) && lines.length) lines[lines.length - 1] += l.slice(1);
    else if (l.length) lines.push(l);
  }
  const events: ICalendarEvent[] = [];
  const cal: { prodId?: string; method?: string; calendarName?: string; timeZone?: string } = {};
  const stack: string[] = [];
  let ev: {
    uid: string;
    summary?: string;
    location?: string;
    description?: string;
    start?: ICalendarTime;
    end?: ICalendarTime;
    duration?: number;
    rrule?: string;
    exdates: ICalendarTime[];
    recurrenceId?: ICalendarTime;
    dtstamp?: number;
    extra: Record<string, string>;
  } | null = null;
  for (const line of lines) {
    const cl = contentLine(line);
    if (!cl) continue;
    if (cl.name === 'BEGIN') {
      const comp = cl.value.trim().toUpperCase();
      stack.push(comp);
      if (comp === 'VEVENT' && stack.length === 2 && stack[0] === 'VCALENDAR') ev = { uid: '', exdates: [], extra: {} };
      continue;
    }
    if (cl.name === 'END') {
      const comp = stack.pop();
      if (comp === 'VEVENT' && ev && stack.length === 1) {
        if (ev.start) {
          const end = ev.end ?? (ev.duration !== undefined ? addDuration(ev.start, ev.duration) : undefined);
          const out: Record<string, unknown> = { uid: ev.uid, start: ev.start };
          if (end) out['end'] = end;
          for (const k of ['summary', 'location', 'description', 'rrule', 'recurrenceId', 'dtstamp'] as const) if (ev[k] !== undefined) out[k] = ev[k];
          if (ev.exdates.length) out['exdates'] = ev.exdates;
          if (Object.keys(ev.extra).length) out['extra'] = ev.extra;
          events.push(out as unknown as ICalendarEvent);
        }
        ev = null;
      }
      continue;
    }
    if (stack.length === 1 && stack[0] === 'VCALENDAR') {
      if (cl.name === 'PRODID') cal.prodId = unescapeText(cl.value);
      else if (cl.name === 'METHOD') cal.method = cl.value.trim();
      else if (cl.name === 'X-WR-CALNAME') cal.calendarName = unescapeText(cl.value);
      else if (cl.name === 'X-WR-TIMEZONE') cal.timeZone = unescapeText(cl.value);
      continue;
    }
    if (!ev || stack.length !== 2) continue;
    switch (cl.name) {
      case 'UID':
        ev.uid = unescapeText(cl.value);
        break;
      case 'SUMMARY':
        ev.summary = unescapeText(cl.value);
        break;
      case 'LOCATION':
        ev.location = unescapeText(cl.value);
        break;
      case 'DESCRIPTION':
        ev.description = unescapeText(cl.value);
        break;
      case 'DTSTART':
      case 'DTEND':
      case 'RECURRENCE-ID': {
        const t = parseTime(cl.value, cl.params);
        if (t) {
          if (cl.name === 'DTSTART') ev.start = t;
          else if (cl.name === 'DTEND') ev.end = t;
          else ev.recurrenceId = t;
        }
        break;
      }
      case 'DTSTAMP': {
        const t = parseTime(cl.value, cl.params);
        if (t && 'epochMs' in t) ev.dtstamp = t.epochMs;
        break;
      }
      case 'DURATION': {
        const d = parseDuration(cl.value);
        if (d !== null) ev.duration = d;
        break;
      }
      case 'RRULE':
        ev.rrule = cl.value.trim();
        break;
      case 'EXDATE':
        for (const v of cl.value.split(',')) {
          const t = parseTime(v, cl.params);
          if (t) ev.exdates.push(t);
        }
        break;
      default:
        if (!MODELED.has(cl.name) && !(cl.name in ev.extra)) ev.extra[cl.name] = unescapeText(cl.value);
    }
  }
  const doc: Record<string, unknown> = { events };
  for (const [k, v] of Object.entries(cal)) if (v !== undefined) doc[k] = v;
  return doc as unknown as ICalendarDocument;
}
