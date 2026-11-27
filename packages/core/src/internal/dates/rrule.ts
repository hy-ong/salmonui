// RRULE engine: the RFC 5545 subset the Scheduler
// supports (`FREQ`, `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` with
// ordinals, `BYMONTHDAY`, `BYMONTH`, `BYSETPOS`, `WKST`). Parsing never
// throws; expansion iterates in wall time (day numbers plus the start time)
// and converts each occurrence with the zone module, so occurrences keep
// their wall time across DST transitions (gaps resolve as Temporal
// `'compatible'`). No React, no DOM globals, no dependencies.
//
// Semantics (documented on /docs/calendars/recurrence-editor):
// - The start (DTSTART) is an occurrence only when it matches the rule
//   (the rrule.js behaviour), and nothing before it is.
// - `COUNT` counts generated occurrences before exceptions are removed
//   (RFC 5545 EXDATE semantics).
// - `UNTIL` is inclusive. A date-only `UNTIL` compares by date; a UTC
//   `UNTIL` (`...Z`) compares instants; a floating one compares wall time.
// - Without a time zone, wall times map to instants through UTC (floating).

import { fromDays, isValidDate, plainDate, plainDateTime, toDays, toPlainDateTime, utc, type DateTimeInput, type PlainDate, type PlainDateTime } from './plain.js';
import { toEpoch, wallAt } from './zone.js';
import { formatMessage, type LocaleMessage } from './text.js';

const DAY_MS = 86_400_000;

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

/** A `BYDAY` entry: `weekday` 0 Sunday ... 6 Saturday, `ordinal` 1..53 or -1..-53 (`2MO`, `-1FR`). */
export interface RecurrenceWeekday {
  readonly weekday: number;
  readonly ordinal?: number;
}

/** The end of a rule (`UNTIL`): a date, or a date-time that is floating or UTC. */
export interface RecurrenceUntil {
  readonly date: PlainDate;
  /** Wall time of the bound; absent for a date-only `UNTIL`. */
  readonly time?: { readonly hour: number; readonly minute: number; readonly second: number };
  /** True for the RFC 5545 UTC form (`20261231T235959Z`). */
  readonly utc?: boolean;
}

/** A parsed recurrence rule. Frozen when produced by `parseRecurrenceRule`. */
export interface RecurrenceRule {
  readonly frequency: RecurrenceFrequency;
  /** `INTERVAL`, at least 1. */
  readonly interval: number;
  readonly count?: number;
  readonly until?: RecurrenceUntil;
  readonly byDay?: readonly RecurrenceWeekday[];
  readonly byMonthDay?: readonly number[];
  readonly byMonth?: readonly number[];
  readonly bySetPos?: readonly number[];
  /** `WKST`, 0 Sunday ... 6 Saturday; RFC 5545 default Monday (1). */
  readonly weekStart?: number;
}

export type RecurrenceParseResult = { readonly ok: true; readonly rule: RecurrenceRule } | { readonly ok: false; readonly error: string };

const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const FREQS: Readonly<Record<string, RecurrenceFrequency>> = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' };

function intList(value: string, min: number, max: number, allowNegative: boolean): number[] | null {
  const out: number[] = [];
  for (const part of value.split(',')) {
    if (!/^[+-]?\d+$/.test(part)) return null;
    const n = Number(part);
    const a = Math.abs(n);
    if (a < min || a > max || (n < 0 && !allowNegative) || n === 0) return null;
    out.push(n);
  }
  return out;
}

function parseUntil(value: string): RecurrenceUntil | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/i.exec(value) ?? /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?(Z)?)?$/i.exec(value);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!isValidDate(y, mo, d)) return null;
  if (m[4] === undefined) return Object.freeze({ date: plainDate(y, mo, d) });
  const time = { hour: Number(m[4]), minute: Number(m[5]), second: Number(m[6] ?? 0) };
  if (time.hour > 23 || time.minute > 59 || time.second > 60) return null;
  return Object.freeze({ date: plainDate(y, mo, d), time: Object.freeze(time), ...(m[7] ? { utc: true } : {}) });
}

/**
 * Parses an RRULE string (`FREQ=WEEKLY;BYDAY=MO,WE`, optionally prefixed
 * `RRULE:`). Unsupported or invalid parts give an error result; it never
 * throws.
 */
export function parseRecurrenceRule(text: string): RecurrenceParseResult {
  if (typeof text !== 'string') return { ok: false, error: 'The rule is not a string.' };
  const body = text.trim().replace(/^RRULE:/i, '');
  if (!body) return { ok: false, error: 'The rule is empty.' };
  const parts = new Map<string, string>();
  for (const seg of body.split(';')) {
    if (!seg) continue;
    const eq = seg.indexOf('=');
    if (eq <= 0) return { ok: false, error: `Invalid rule part "${seg}".` };
    const key = seg.slice(0, eq).trim().toUpperCase();
    if (parts.has(key)) return { ok: false, error: `Duplicate rule part "${key}".` };
    parts.set(key, seg.slice(eq + 1).trim().toUpperCase());
  }
  const freq = FREQS[parts.get('FREQ') ?? ''];
  if (!freq) return { ok: false, error: parts.has('FREQ') ? `Unsupported FREQ "${parts.get('FREQ')}".` : 'FREQ is required.' };
  const rule: { -readonly [K in keyof RecurrenceRule]: RecurrenceRule[K] } = { frequency: freq, interval: 1 };
  for (const [key, value] of parts) {
    switch (key) {
      case 'FREQ':
        break;
      case 'INTERVAL': {
        const n = /^\d+$/.test(value) ? Number(value) : NaN;
        if (!(n >= 1)) return { ok: false, error: `Invalid INTERVAL "${value}".` };
        rule.interval = n;
        break;
      }
      case 'COUNT': {
        const n = /^\d+$/.test(value) ? Number(value) : NaN;
        if (!(n >= 1)) return { ok: false, error: `Invalid COUNT "${value}".` };
        rule.count = n;
        break;
      }
      case 'UNTIL': {
        const u = parseUntil(value);
        if (!u) return { ok: false, error: `Invalid UNTIL "${value}".` };
        rule.until = u;
        break;
      }
      case 'BYDAY': {
        const days: RecurrenceWeekday[] = [];
        for (const part of value.split(',')) {
          const m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(part);
          if (!m) return { ok: false, error: `Invalid BYDAY "${part}".` };
          const weekday = DAYS.indexOf(m[2] as (typeof DAYS)[number]);
          if (m[1] === undefined) days.push(Object.freeze({ weekday }));
          else {
            const ordinal = Number(m[1]);
            if (ordinal === 0 || Math.abs(ordinal) > 53) return { ok: false, error: `Invalid BYDAY ordinal "${part}".` };
            days.push(Object.freeze({ weekday, ordinal }));
          }
        }
        rule.byDay = Object.freeze(days);
        break;
      }
      case 'BYMONTHDAY': {
        const l = intList(value, 1, 31, true);
        if (!l) return { ok: false, error: `Invalid BYMONTHDAY "${value}".` };
        rule.byMonthDay = Object.freeze(l);
        break;
      }
      case 'BYMONTH': {
        const l = intList(value, 1, 12, false);
        if (!l) return { ok: false, error: `Invalid BYMONTH "${value}".` };
        rule.byMonth = Object.freeze(l);
        break;
      }
      case 'BYSETPOS': {
        const l = intList(value, 1, 366, true);
        if (!l) return { ok: false, error: `Invalid BYSETPOS "${value}".` };
        rule.bySetPos = Object.freeze(l);
        break;
      }
      case 'WKST': {
        const i = DAYS.indexOf(value as (typeof DAYS)[number]);
        if (i < 0) return { ok: false, error: `Invalid WKST "${value}".` };
        rule.weekStart = i;
        break;
      }
      default:
        return { ok: false, error: `Unsupported rule part "${key}".` };
    }
  }
  if (rule.count !== undefined && rule.until !== undefined) return { ok: false, error: 'COUNT and UNTIL cannot both be set.' };
  if (rule.byDay?.some((d) => d.ordinal !== undefined) && (freq === 'daily' || freq === 'weekly')) return { ok: false, error: 'BYDAY ordinals need FREQ=MONTHLY or FREQ=YEARLY.' };
  if (rule.byMonthDay && freq === 'weekly') return { ok: false, error: 'BYMONTHDAY is not allowed with FREQ=WEEKLY.' };
  return { ok: true, rule: Object.freeze(rule) };
}

const p2 = (n: number): string => String(n).padStart(2, '0');

/** Prints a rule in canonical part order (`FREQ`, `INTERVAL`, `BYDAY`, `BYMONTHDAY`, `BYMONTH`, `BYSETPOS`, `WKST`, `COUNT`, `UNTIL`); `parseRecurrenceRule` reads it back. */
export function formatRecurrenceRule(rule: RecurrenceRule): string {
  const out = [`FREQ=${rule.frequency.toUpperCase()}`];
  if (rule.interval > 1) out.push(`INTERVAL=${rule.interval}`);
  if (rule.byDay?.length) out.push(`BYDAY=${rule.byDay.map((d) => `${d.ordinal ?? ''}${DAYS[d.weekday]}`).join(',')}`);
  if (rule.byMonthDay?.length) out.push(`BYMONTHDAY=${rule.byMonthDay.join(',')}`);
  if (rule.byMonth?.length) out.push(`BYMONTH=${rule.byMonth.join(',')}`);
  if (rule.bySetPos?.length) out.push(`BYSETPOS=${rule.bySetPos.join(',')}`);
  if (rule.weekStart !== undefined && rule.weekStart !== 1) out.push(`WKST=${DAYS[rule.weekStart]}`);
  if (rule.count !== undefined) out.push(`COUNT=${rule.count}`);
  if (rule.until) {
    const u = rule.until;
    const d = `${String(u.date.year).padStart(4, '0')}${p2(u.date.month)}${p2(u.date.day)}`;
    out.push(`UNTIL=${u.time ? `${d}T${p2(u.time.hour)}${p2(u.time.minute)}${p2(u.time.second)}${u.utc ? 'Z' : ''}` : d}`);
  }
  return out.join(';');
}

function resolveRule(rule: RecurrenceRule | string): RecurrenceRule | null {
  if (typeof rule !== 'string') return rule;
  const r = parseRecurrenceRule(rule);
  return r.ok ? r.rule : null;
}

// ---------------------------------------------------------------------------
// Expansion
// ---------------------------------------------------------------------------

const weekdayOf = (n: number): number => (((n + 4) % 7) + 7) % 7;
/** Day number of the first day of a month (month index counted from year 0, month 0). */
const monthStart = (mi: number): number => Math.floor(utc(Math.floor(mi / 12), (mi % 12) + 1, 1) / DAY_MS);
const monthLength = (mi: number): number => monthStart(mi + 1) - monthStart(mi);

/** Sorted, de-duplicated day numbers of a period after `BYSETPOS`. */
function setPos(days: number[], pos: readonly number[] | undefined): number[] {
  days.sort((a, b) => a - b);
  const uniq: number[] = [];
  for (const d of days) if (uniq[uniq.length - 1] !== d) uniq.push(d);
  if (!pos?.length) return uniq;
  const out: number[] = [];
  for (const p of pos) {
    const d = uniq[p > 0 ? p - 1 : uniq.length + p];
    if (d !== undefined) out.push(d);
  }
  return out.sort((a, b) => a - b).filter((d, i, a) => a[i - 1] !== d);
}

/** Weekday matches in [first, first + length): every one, or the nth (negative from the end). */
function weekdaysIn(first: number, length: number, byDay: readonly RecurrenceWeekday[], out: number[]): void {
  for (const { weekday, ordinal } of byDay) {
    const firstMatch = first + ((weekday - weekdayOf(first) + 7) % 7);
    if (ordinal === undefined) for (let d = firstMatch; d < first + length; d += 7) out.push(d);
    else if (ordinal > 0) {
      const d = firstMatch + (ordinal - 1) * 7;
      if (d < first + length) out.push(d);
    } else {
      const last = first + length - 1;
      const lastMatch = last - ((weekdayOf(last) - weekday + 7) % 7);
      const d = lastMatch + (ordinal + 1) * 7;
      if (d >= first) out.push(d);
    }
  }
}

function monthDays(mi: number, rule: RecurrenceRule, startDay: number, out: number[]): void {
  const first = monthStart(mi);
  const len = monthLength(mi);
  if (rule.byMonthDay?.length) {
    const days: number[] = [];
    for (const md of rule.byMonthDay) {
      const d = md > 0 ? md : len + md + 1;
      if (d >= 1 && d <= len) days.push(first + d - 1);
    }
    if (rule.byDay?.length) {
      const wd = new Set(rule.byDay.map((x) => x.weekday));
      for (const d of days) if (wd.has(weekdayOf(d))) out.push(d);
    } else out.push(...days);
  } else if (rule.byDay?.length) weekdaysIn(first, len, rule.byDay, out);
  else if (startDay <= len) out.push(first + startDay - 1);
}

/** Candidate day numbers of period `k` (before `BYSETPOS` and range filters). */
function periodDays(rule: RecurrenceRule, k: number, n0: number, start: { y: number; m: number; d: number }): number[] {
  const out: number[] = [];
  const iv = rule.interval;
  switch (rule.frequency) {
    case 'daily': {
      const d = n0 + k * iv;
      out.push(d);
      break;
    }
    case 'weekly': {
      const wkst = rule.weekStart ?? 1;
      const ws = n0 - ((weekdayOf(n0) - wkst + 7) % 7) + k * iv * 7;
      const wds = rule.byDay?.length ? rule.byDay.map((x) => x.weekday) : [weekdayOf(n0)];
      for (const wd of wds) out.push(ws + ((wd - wkst + 7) % 7));
      break;
    }
    case 'monthly':
      monthDays(start.y * 12 + start.m - 1 + k * iv, rule, start.d, out);
      break;
    case 'yearly': {
      const y = start.y + k * iv;
      if (rule.byDay?.length && !rule.byMonth?.length) {
        const first = Math.floor(utc(y, 1, 1) / DAY_MS);
        const len = Math.floor(utc(y + 1, 1, 1) / DAY_MS) - first;
        const days: number[] = [];
        weekdaysIn(first, len, rule.byDay, days);
        if (rule.byMonthDay?.length) {
          const md: number[] = [];
          const plain: RecurrenceRule = { frequency: rule.frequency, interval: rule.interval, byMonthDay: rule.byMonthDay };
          for (let mo = 0; mo < 12; mo++) monthDays(y * 12 + mo, plain, start.d, md);
          const mdSet = new Set(md);
          for (const d of days) if (mdSet.has(d)) out.push(d);
        } else out.push(...days);
      } else {
        const months = rule.byMonth?.length ? rule.byMonth : rule.byMonthDay?.length ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [start.m];
        for (const mo of months) monthDays(y * 12 + mo - 1, rule, start.d, out);
      }
      break;
    }
  }
  let days = out;
  if (rule.byMonth?.length && rule.frequency !== 'yearly') {
    const months = new Set(rule.byMonth);
    days = days.filter((d) => months.has(new Date(d * DAY_MS).getUTCMonth() + 1));
  }
  if (rule.byMonthDay?.length && rule.frequency === 'daily') {
    days = days.filter((d) => {
      const dt = new Date(d * DAY_MS);
      const len = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
      return rule.byMonthDay!.some((md) => (md > 0 ? md : len + md + 1) === dt.getUTCDate());
    });
  }
  if (rule.byDay?.length && rule.frequency === 'daily') {
    const wd = new Set(rule.byDay.map((x) => x.weekday));
    days = days.filter((d) => wd.has(weekdayOf(d)));
  }
  return setPos(days, rule.bySetPos);
}

/** First period index whose days can reach day `n` (a safe lower bound). */
function periodFor(rule: RecurrenceRule, n0: number, start: { y: number; m: number }, n: number): number {
  if (n <= n0) return 0;
  const iv = rule.interval;
  let k: number;
  switch (rule.frequency) {
    case 'daily':
      k = Math.floor((n - n0) / iv);
      break;
    case 'weekly':
      k = Math.floor((n - n0) / (7 * iv));
      break;
    case 'monthly': {
      const dt = new Date(n * DAY_MS);
      k = Math.floor((dt.getUTCFullYear() * 12 + dt.getUTCMonth() - (start.y * 12 + start.m - 1)) / iv);
      break;
    }
    default:
      k = Math.floor((new Date(n * DAY_MS).getUTCFullYear() - start.y) / iv);
  }
  return Math.max(0, k - 1);
}

export interface ExpandRecurrenceOptions {
  /** Wall time of the first occurrence (DTSTART) in `timeZone`. */
  readonly startWall: { readonly year: number; readonly month: number; readonly day: number; readonly hour: number; readonly minute: number; readonly second?: number; readonly millisecond?: number };
  /** IANA zone of the wall times; undefined maps wall times through UTC (floating). */
  readonly timeZone: string | undefined;
  /** Instants: occurrences are returned when `start < rangeEndMs` and `start + durationMs > rangeStartMs` (or `start >= rangeStartMs` with no duration). */
  readonly rangeStartMs: number;
  readonly rangeEndMs: number;
  /** Duration of one occurrence in ms, so occurrences that started before the range but overlap it are kept. */
  readonly durationMs?: number;
  /** Occurrence start instants to skip (EXDATE / edited occurrences). */
  readonly exceptionsMs?: ReadonlySet<number> | readonly number[];
  /** Upper bound of returned occurrences (default 10,000). */
  readonly maxCount?: number;
}

const MAX_PERIODS = 200_000;

function instantOf(day: number, h: number, mi: number, s: number, ms: number, zone: string | undefined): number {
  const local = day * DAY_MS + ((h * 60 + mi) * 60 + s) * 1000 + ms;
  if (!zone) return local;
  const d = new Date(day * DAY_MS);
  return toEpoch({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: h, minute: mi, second: s, millisecond: ms }, zone) ?? local;
}

/**
 * Occurrence start instants (epoch ms, ascending) of `rule` inside a range:
 * the Scheduler's fast path. Iterates in wall time from `startWall`, skips
 * straight to the range for rules without `COUNT`, removes exceptions, and
 * converts each wall time with `timeZone` (DST gaps as `'compatible'`).
 * An invalid rule gives `[]`.
 */
export function expandRecurrence(input: RecurrenceRule | string, options: ExpandRecurrenceOptions): number[] {
  const rule = resolveRule(input);
  if (!rule) return [];
  const sw = options.startWall;
  const zone = options.timeZone;
  const h = sw.hour;
  const mi = sw.minute;
  const s = sw.second ?? 0;
  const ms = sw.millisecond ?? 0;
  const start = { y: sw.year, m: sw.month, d: sw.day };
  const n0 = toDays(sw);
  const dur = Math.max(0, options.durationMs ?? 0);
  const maxCount = options.maxCount ?? 10_000;
  const exc = options.exceptionsMs;
  const excSet = exc ? (exc instanceof Set ? (exc as ReadonlySet<number>) : new Set(exc as readonly number[])) : null;
  // UNTIL bound: by day, by wall time or by instant.
  let untilDay = Infinity;
  let untilWall = Infinity;
  let untilMs = Infinity;
  if (rule.until) {
    const u = rule.until;
    const ud = toDays(u.date);
    if (!u.time) untilDay = ud;
    else if (u.utc) untilMs = utc(u.date.year, u.date.month, u.date.day, u.time.hour, u.time.minute, u.time.second);
    else untilWall = ud * DAY_MS + ((u.time.hour * 60 + u.time.minute) * 60 + u.time.second) * 1000;
  }
  const lastDay = Math.min(untilDay, untilWall === Infinity ? Infinity : Math.floor(untilWall / DAY_MS), untilMs === Infinity ? Infinity : Math.floor(untilMs / DAY_MS) + 1);
  // Range in wall days (one day of slack each side for zone offsets).
  const rangeStartDay = Math.floor((options.rangeStartMs - dur) / DAY_MS) - 1;
  const rangeEndDay = Math.floor(options.rangeEndMs / DAY_MS) + 1;
  const out: number[] = [];
  let generated = 0;
  let k = rule.count === undefined ? periodFor(rule, n0, start, rangeStartDay) : 0;
  const timeMs = ((h * 60 + mi) * 60 + s) * 1000 + ms;
  for (let guard = 0; guard < MAX_PERIODS; guard++, k++) {
    const days = periodDays(rule, k, n0, start);
    let past = false;
    for (const day of days) {
      if (day < n0) continue;
      if (day > lastDay || day * DAY_MS + timeMs > untilWall) {
        past = true;
        break;
      }
      const t = instantOf(day, h, mi, s, ms, zone);
      if (t > untilMs) {
        past = true;
        break;
      }
      generated++;
      if (day > rangeEndDay) {
        past = true;
        break;
      }
      if (t < options.rangeEndMs && (dur > 0 ? t + dur > options.rangeStartMs : t >= options.rangeStartMs) && !excSet?.has(t)) {
        out.push(t);
        if (out.length >= maxCount) return out;
      }
      if (rule.count !== undefined && generated >= rule.count) return out;
    }
    if (past) break;
    // A period entirely after the range ends the loop even when it was empty.
    if (!days.length && periodStartDay(rule, k, n0, start) > Math.min(rangeEndDay, lastDay)) break;
  }
  return out;
}

function periodStartDay(rule: RecurrenceRule, k: number, n0: number, start: { y: number; m: number }): number {
  switch (rule.frequency) {
    case 'daily':
      return n0 + k * rule.interval;
    case 'weekly':
      return n0 - 7 + k * rule.interval * 7;
    case 'monthly':
      return monthStart(start.y * 12 + start.m - 1 + k * rule.interval);
    default:
      return Math.floor(utc(start.y + k * rule.interval, 1, 1) / DAY_MS);
  }
}

export interface RecurrenceDatesOptions {
  /** First occurrence (DTSTART); an instant is read as wall time in `timeZone`. */
  readonly start: DateTimeInput;
  readonly timeZone?: string;
  /** Occurrences to skip (EXDATE), as wall times or instants. */
  readonly exceptions?: readonly DateTimeInput[];
  /** Optional window; inputs are wall times (or instants) in `timeZone`. Inclusive start, exclusive end. */
  readonly range?: { readonly start: DateTimeInput; readonly end: DateTimeInput };
  /** At most this many dates (default 1,000; a rule without an end needs `range` or `maxCount`). */
  readonly maxCount?: number;
}

function wallToMs(input: DateTimeInput, zone: string | undefined): number | null {
  if (input instanceof Date) return input.getTime();
  const w = toPlainDateTime(input, zone);
  if (!w) return null;
  return instantOf(toDays(w), w.hour, w.minute, w.second, w.millisecond, zone);
}

/**
 * Occurrence wall times of a rule, as
 * `PlainDateTime`s in `timeZone`. Exceptions are skipped; never throws.
 */
export function getRecurrenceDates(input: RecurrenceRule | string, options: RecurrenceDatesOptions): PlainDateTime[] {
  const zone = options.timeZone;
  const start = toPlainDateTime(options.start, zone);
  if (!start) return [];
  const exceptions: number[] = [];
  for (const e of options.exceptions ?? []) {
    const t = wallToMs(e, zone);
    if (t !== null) exceptions.push(t);
  }
  const rs = options.range ? wallToMs(options.range.start, zone) : null;
  const re = options.range ? wallToMs(options.range.end, zone) : null;
  const ms = expandRecurrence(input, { startWall: start, timeZone: zone, rangeStartMs: rs ?? -8.64e15, rangeEndMs: re ?? 8.64e15, exceptionsMs: exceptions, maxCount: options.maxCount ?? 1000 });
  const out: PlainDateTime[] = [];
  for (const t of ms) {
    if (zone) {
      const w = wallAt(t, zone);
      if (w) out.push(plainDateTime(w, w));
    } else {
      const d = fromDays(Math.floor(t / DAY_MS));
      const rem = t - Math.floor(t / DAY_MS) * DAY_MS;
      out.push(plainDateTime(d, { hour: Math.floor(rem / 3_600_000), minute: Math.floor(rem / 60_000) % 60, second: Math.floor(rem / 1000) % 60, millisecond: rem % 1000 }));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

/**
 * Messages of `getRecurrenceSummary` (Data Grid message format; `{interval}`, `{days}`, `{day}`, `{ordinal}`,
 * `{weekday}`, `{month}`, `{date}`, `{count}`). The `one` form is used for an interval or count of exactly 1
 * in every locale, also where the plural rules have no `one` category.
 */
export interface RecurrenceSummaryText {
  readonly never: LocaleMessage;
  readonly daily: LocaleMessage;
  readonly weekly: LocaleMessage;
  readonly weeklyOn: LocaleMessage;
  readonly monthly: LocaleMessage;
  readonly monthlyOnDay: LocaleMessage;
  readonly monthlyOnWeekday: LocaleMessage;
  readonly yearly: LocaleMessage;
  readonly yearlyOnDay: LocaleMessage;
  readonly yearlyOnWeekday: LocaleMessage;
  readonly untilSuffix: LocaleMessage;
  readonly countSuffix: LocaleMessage;
  readonly ordinalFirst: LocaleMessage;
  readonly ordinalSecond: LocaleMessage;
  readonly ordinalThird: LocaleMessage;
  readonly ordinalFourth: LocaleMessage;
  readonly ordinalFifth: LocaleMessage;
  readonly ordinalLast: LocaleMessage;
  readonly ordinalOther: LocaleMessage;
  readonly lastDay: LocaleMessage;
}

export const RECURRENCE_SUMMARY_DEFAULT_TEXT: RecurrenceSummaryText = Object.freeze({
  never: 'Never',
  daily: { one: 'Every day', other: 'Every {interval} days' },
  weekly: { one: 'Every week', other: 'Every {interval} weeks' },
  weeklyOn: { one: 'Every week on {days}', other: 'Every {interval} weeks on {days}' },
  monthly: { one: 'Every month', other: 'Every {interval} months' },
  monthlyOnDay: { one: 'Every month on day {day}', other: 'Every {interval} months on day {day}' },
  monthlyOnWeekday: { one: 'Every month on the {ordinal} {weekday}', other: 'Every {interval} months on the {ordinal} {weekday}' },
  yearly: { one: 'Every year', other: 'Every {interval} years' },
  yearlyOnDay: { one: 'Every year on {month} {day}', other: 'Every {interval} years on {month} {day}' },
  yearlyOnWeekday: { one: 'Every year on the {ordinal} {weekday} of {month}', other: 'Every {interval} years on the {ordinal} {weekday} of {month}' },
  untilSuffix: '{summary}, until {date}',
  countSuffix: { one: '{summary}, once', other: '{summary}, {count} times' },
  ordinalFirst: 'first',
  ordinalSecond: 'second',
  ordinalThird: 'third',
  ordinalFourth: 'fourth',
  ordinalFifth: 'fifth',
  ordinalLast: 'last',
  ordinalOther: '#{n}',
  lastDay: 'last day',
});

export interface RecurrenceSummaryOptions {
  readonly locale?: string;
  readonly localeText?: Partial<RecurrenceSummaryText>;
  /** First occurrence: supplies the default weekday, month day and month of rules that do not name them. */
  readonly start?: DateTimeInput;
  /** `Intl` calendar id for the until date and month names (values stay ISO). */
  readonly calendar?: string;
  /** Options for the until date (default `{ dateStyle: 'medium' }`). */
  readonly dateFormat?: Intl.DateTimeFormatOptions;
}

const nameCache = new Map<string, string[]>();
function names(locale: string, kind: 'weekday' | 'month', calendar: string | undefined): string[] {
  const key = `${locale}|${kind}|${calendar ?? ''}`;
  let list = nameCache.get(key);
  if (!list) {
    list = [];
    let f: Intl.DateTimeFormat;
    try {
      f = new Intl.DateTimeFormat(locale, kind === 'weekday' ? { weekday: 'long', timeZone: 'UTC' } : { month: 'long', timeZone: 'UTC', ...(calendar ? { calendar } : {}) });
    } catch {
      f = new Intl.DateTimeFormat('en-US', kind === 'weekday' ? { weekday: 'long', timeZone: 'UTC' } : { month: 'long', timeZone: 'UTC' });
    }
    // 2023-01-01 was a Sunday.
    if (kind === 'weekday') for (let i = 0; i < 7; i++) list.push(f.format(Date.UTC(2023, 0, 1 + i)));
    else for (let i = 0; i < 12; i++) list.push(f.format(Date.UTC(2023, i, 15)));
    if (nameCache.size > 32) nameCache.clear();
    nameCache.set(key, list);
  }
  return list;
}

function listOf(locale: string, items: string[]): string {
  try {
    return new Intl.ListFormat(locale, { type: 'conjunction', style: 'long' }).format(items);
  } catch {
    return items.join(', ');
  }
}

/** Weekday names of the locale, Sunday first (`long` width). */
export const recurrenceWeekdayNames = (locale = 'en-US'): readonly string[] => names(locale, 'weekday', undefined);
/** Month names of the locale, January first (`long` width). */
export const recurrenceMonthNames = (locale = 'en-US', calendar?: string): readonly string[] => names(locale, 'month', calendar);

/**
 * A localized one-line summary of a rule:
 * "Every 2 weeks on Monday and Wednesday, until Dec 31, 2026". `null` or
 * an empty rule reads as `never`; an invalid rule gives `''`.
 */
export function getRecurrenceSummary(input: RecurrenceRule | string | null, options: RecurrenceSummaryOptions = {}): string {
  const locale = options.locale ?? 'en-US';
  const text = { ...RECURRENCE_SUMMARY_DEFAULT_TEXT, ...options.localeText };
  // A `one` form matches an interval or count of exactly 1 in every language, so a language with a single
  // plural category (Chinese) can still word it ("every week", not "every 1 week").
  const t = (key: keyof RecurrenceSummaryText, params: Record<string, string | number>): string => {
    const m = text[key];
    return formatMessage(params['count'] === 1 && typeof m === 'object' && m.one ? m.one : m, params, locale);
  };
  if (input === null || (typeof input === 'string' && !input.trim())) return t('never', {});
  const rule = resolveRule(input);
  if (!rule) return '';
  const start = options.start === undefined ? null : toPlainDateTime(options.start, undefined);
  const weekdays = names(locale, 'weekday', undefined);
  const months = names(locale, 'month', options.calendar);
  const ordinal = (n: number): string => {
    const keys = ['ordinalFirst', 'ordinalSecond', 'ordinalThird', 'ordinalFourth', 'ordinalFifth'] as const;
    if (n === -1) return t('ordinalLast', {});
    const key = keys[n - 1];
    return key ? t(key, {}) : t('ordinalOther', { n });
  };
  const interval = rule.interval;
  const count = interval;
  let summary: string;
  const monthName = rule.byMonth?.length ? listOf(locale, rule.byMonth.map((m) => months[m - 1] ?? '')) : start ? (months[start.month - 1] ?? '') : '';
  const dayOf = (): string => (rule.byMonthDay?.length ? listOf(locale, rule.byMonthDay.map((d) => (d === -1 ? t('lastDay', {}) : String(d)))) : start ? String(start.day) : '');
  const ordinalDay = rule.byDay?.length === 1 && (rule.byDay[0]?.ordinal !== undefined || rule.bySetPos?.length === 1) ? rule.byDay[0] : undefined;
  const ord = ordinalDay ? (ordinalDay.ordinal ?? rule.bySetPos?.[0] ?? 1) : undefined;
  switch (rule.frequency) {
    case 'daily':
      summary = t('daily', { count, interval });
      break;
    case 'weekly': {
      const days = rule.byDay?.length ? rule.byDay.map((d) => d.weekday) : start ? [weekdayOf(toDays(start))] : [];
      summary = days.length ? t('weeklyOn', { count, interval, days: listOf(locale, days.map((d) => weekdays[d] ?? '')) }) : t('weekly', { count, interval });
      break;
    }
    case 'monthly':
      if (ordinalDay && ord !== undefined) summary = t('monthlyOnWeekday', { count, interval, ordinal: ordinal(ord), weekday: weekdays[ordinalDay.weekday] ?? '' });
      else {
        const day = dayOf();
        summary = day ? t('monthlyOnDay', { count, interval, day }) : t('monthly', { count, interval });
      }
      break;
    default:
      if (ordinalDay && ord !== undefined) summary = t('yearlyOnWeekday', { count, interval, ordinal: ordinal(ord), weekday: weekdays[ordinalDay.weekday] ?? '', month: monthName });
      else {
        const day = dayOf();
        summary = day && monthName ? t('yearlyOnDay', { count, interval, day, month: monthName }) : t('yearly', { count, interval });
      }
  }
  if (rule.count !== undefined) summary = t('countSuffix', { summary, count: rule.count });
  else if (rule.until) {
    let f: Intl.DateTimeFormat;
    const fo: Intl.DateTimeFormatOptions = { ...(options.dateFormat ?? { dateStyle: 'medium' }), timeZone: 'UTC', ...(options.calendar ? { calendar: options.calendar } : {}) };
    try {
      f = new Intl.DateTimeFormat(locale, fo);
    } catch {
      f = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
    }
    const u = rule.until.date;
    summary = t('untilSuffix', { summary, date: f.format(utc(u.year, u.month, u.day, 12)) });
  }
  return summary;
}
