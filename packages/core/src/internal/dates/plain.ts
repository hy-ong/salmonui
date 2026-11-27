// Plain date and time values:
// frozen, calendar-agnostic `{ year, month, day }` / `{ hour, minute, ... }`
// structures with ISO `toString()` / `toJSON()`, Temporal-compatible field
// names, and day numbers (days since 1970-01-01) for all date math. No
// React, no DOM globals, no dependencies (private import `#dates`).

import { toEpoch, wallAt } from './zone.js';

const DAY_MS = 86_400_000;

/** Anything with ISO calendar date fields (`Temporal.PlainDate` included). Month is 1-12. */
export interface PlainDateLike {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** Anything with wall-clock time fields (`Temporal.PlainTime` included). */
export interface PlainTimeLike {
  readonly hour: number;
  readonly minute: number;
  readonly second?: number;
  readonly millisecond?: number;
}

export type PlainDateTimeLike = PlainDateLike & PlainTimeLike;

/** A date value: fields, a `Date` (an instant, read in the time zone) or an ISO 8601 string (`'2026-11-23'`). */
export type DateInput = PlainDateLike | Date | string;
/** A time value: fields, a `Date` or an ISO time string (`'14:30'`, `'14:30:05'`). */
export type TimeInput = PlainTimeLike | Date | string;
/** A date-time value: fields, a `Date` or an ISO date-time string (`'2026-11-23T14:30'`). */
export type DateTimeInput = PlainDateTimeLike | Date | string;

/** A frozen ISO calendar date. `String(date)` and `JSON.stringify` give `YYYY-MM-DD`. */
export interface PlainDate extends PlainDateLike {
  toString(): string;
  toJSON(): string;
}

/** A frozen wall-clock time. `String(time)` gives `HH:mm:ss` (`.sss` when milliseconds are set). */
export interface PlainTime extends Required<PlainTimeLike> {
  toString(): string;
  toJSON(): string;
}

/** A frozen date and wall-clock time. `String(value)` gives `YYYY-MM-DDTHH:mm:ss`. */
export interface PlainDateTime extends PlainDate, Omit<PlainTime, 'toString' | 'toJSON'> {}

/** An inclusive range of two values. */
export interface DateRange<T = PlainDate> {
  readonly start: T;
  readonly end: T;
}

const pad = (n: number, w = 2): string => (n < 0 ? '-' + pad(-n, w) : String(n).padStart(w, '0'));

/** `YYYY-MM-DD` of date fields. */
export const isoDate = (d: PlainDateLike): string => `${pad(d.year, 4)}-${pad(d.month)}-${pad(d.day)}`;

/** `HH:mm:ss` (with `.sss` when milliseconds are not zero) of time fields. */
export const isoTime = (t: PlainTimeLike): string => `${pad(t.hour)}:${pad(t.minute)}:${pad(t.second ?? 0)}${t.millisecond ? '.' + pad(t.millisecond, 3) : ''}`;

function freeze<T extends object>(proto: object, fields: T): T {
  return Object.freeze(Object.assign(Object.create(proto) as T, fields));
}

const iso = (f: (v: never) => string) => ({
  toString(this: never) {
    return f(this);
  },
  toJSON(this: never) {
    return f(this);
  },
});
const DATE_PROTO = /* @__PURE__ */ iso(isoDate);
const TIME_PROTO = /* @__PURE__ */ iso(isoTime);
const DATE_TIME_PROTO = /* @__PURE__ */ iso((v: PlainDateTimeLike) => `${isoDate(v)}T${isoTime(v)}`);

export const daysInMonth = (year: number, month: number): number => new Date(utc(year, month + 1, 0)).getUTCDate();

/** An integer in [0, below). */
const index = (n: number, below: number): boolean => Number.isInteger(n) && n >= 0 && n < below;

export const isValidDate = (y: number, m: number, d: number): boolean => Number.isInteger(y) && index(m - 1, 12) && index(d - 1, daysInMonth(y, m));

export const isValidTime = (h: number, m: number, s = 0, ms = 0): boolean => index(h, 24) && index(m, 60) && index(s, 60) && index(ms, 1000);

/** A `PlainDate` (throws on invalid fields; inputs go through `toPlainDate`). */
export function plainDate(year: number, month: number, day: number): PlainDate {
  if (!isValidDate(year, month, day)) throw new RangeError(`Invalid date ${year}-${month}-${day}`);
  return freeze(DATE_PROTO, { year, month, day }) as PlainDate;
}

export function plainTime(hour: number, minute: number, second = 0, millisecond = 0): PlainTime {
  if (!isValidTime(hour, minute, second, millisecond)) throw new RangeError(`Invalid time ${hour}:${minute}:${second}`);
  return freeze(TIME_PROTO, { hour, minute, second, millisecond }) as PlainTime;
}

export function plainDateTime(d: PlainDateLike, t: PlainTimeLike): PlainDateTime {
  return freeze(DATE_TIME_PROTO, { ...plainDate(d.year, d.month, d.day), ...plainTime(t.hour, t.minute, t.second, t.millisecond) }) as PlainDateTime;
}

// ---------------------------------------------------------------------------
// Day numbers
// ---------------------------------------------------------------------------

/** Days since 1970-01-01 of a date. */
export const toDays = (d: PlainDateLike): number => Math.floor(utc(d.year, d.month, d.day) / DAY_MS);

/** `Date.UTC` that keeps years 0-99 literal (fields overflow like `Date.UTC`). */
export function utc(y: number, m: number, d: number, h = 0, mi = 0, s = 0, ms = 0): number {
  // Defaults also replace explicit `undefined` fields.
  const date = new Date(0);
  date.setUTCFullYear(y, m - 1, d);
  return date.setUTCHours(h, mi, s, ms);
}

/** The `PlainDate` of a day number. */
export function fromDays(n: number): PlainDate {
  const d = new Date(n * DAY_MS);
  return freeze(DATE_PROTO, { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }) as PlainDate;
}

/** Negative, zero or positive as `a` is before, equal to or after `b` (dates, or date-times when both have time fields). */
export function compare(a: PlainDateLike & Partial<PlainTimeLike>, b: PlainDateLike & Partial<PlainTimeLike>): number {
  return toDays(a) - toDays(b) || timeMs(a) - timeMs(b);
}

const timeMs = (t: Partial<PlainTimeLike>): number => (((t.hour ?? 0) * 60 + (t.minute ?? 0)) * 60 + (t.second ?? 0)) * 1000 + (t.millisecond ?? 0);

export const isSameDate = (a: PlainDateLike | null | undefined, b: PlainDateLike | null | undefined): boolean => !!a && !!b && a.year === b.year && a.month === b.month && a.day === b.day;

export const addDays = (d: PlainDateLike, days: number): PlainDate => fromDays(toDays(d) + days);

/** The same day `months` later, clamped to the length of the target month. */
export function addMonths(d: PlainDateLike, months: number): PlainDate {
  const index = d.year * 12 + d.month - 1 + months;
  const y = Math.floor(index / 12);
  const m = index - y * 12 + 1;
  return plainDate(y, m, Math.min(d.day, daysInMonth(y, m)));
}

export const addYears = (d: PlainDateLike, years: number): PlainDate => addMonths(d, years * 12);

/** Inclusive number of days of a range; 0 for null. */
export function getRangeDays(range: DateRange<PlainDateLike> | null | undefined): number {
  return range ? Math.abs(toDays(range.end) - toDays(range.start)) + 1 : 0;
}

/**
 * The `Date` (instant) of a plain date or date-time: its wall time in
 * `timeZone` (DST resolved like Temporal `'compatible'`), else in the host
 * zone. An invalid value or zone gives an invalid `Date`.
 */
export function toDate(value: PlainDateLike & Partial<PlainTimeLike>, timeZone?: string): Date {
  const w = { year: value.year, month: value.month, day: value.day, hour: value.hour ?? 0, minute: value.minute ?? 0, second: value.second ?? 0, millisecond: value.millisecond ?? 0 };
  if (timeZone) return new Date(toEpoch(w, timeZone) ?? NaN);
  const d = new Date(2000, 0, 1);
  d.setFullYear(w.year, w.month - 1, w.day);
  d.setHours(w.hour, w.minute, w.second, w.millisecond);
  return d;
}

// ---------------------------------------------------------------------------
// ISO parsing and input normalization
// ---------------------------------------------------------------------------

const ISO = /^([+-]\d{6}|\d{4})-(\d{2})(?:-(\d{2}))?(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?)?(Z|[+-]\d{2}:?\d{2})?$/i;
const ISO_TIME = /^T?(\d{2}):(\d{2})(?::(\d{2})(?:[.,](\d{1,9}))?)?$/i;

/** Fields of an ISO 8601 string, or null. `offset` (minutes) is set for strings with `Z` or an offset: they are instants. */
export interface IsoFields {
  readonly date: PlainDate | null;
  readonly time: PlainTime | null;
  readonly offset: number | null;
}

export function parseIso(text: string): IsoFields | null {
  const t = text.trim();
  const tm = ISO_TIME.exec(t);
  if (tm) {
    const time = timeOf(tm[1], tm[2], tm[3], tm[4]);
    return time ? { date: null, time, offset: null } : null;
  }
  const m = ISO.exec(t);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = m[3] === undefined ? 1 : Number(m[3]);
  if (!isValidDate(y, mo, d)) return null;
  const time = m[4] === undefined ? null : timeOf(m[4], m[5], m[6], m[7]);
  if (m[4] !== undefined && !time) return null;
  let offset: number | null = null;
  const z = m[8];
  if (z) offset = z.toUpperCase() === 'Z' ? 0 : (z[0] === '-' ? -1 : 1) * (Number(z.slice(1, 3)) * 60 + Number(z.slice(-2)));
  return { date: plainDate(y, mo, d), time, offset };
}

function timeOf(h?: string, mi?: string, s?: string, frac?: string): PlainTime | null {
  const ms = frac ? Math.floor(Number(`0.${frac}`) * 1000) : 0;
  const v = [Number(h), Number(mi), Number(s ?? 0), ms] as const;
  return isValidTime(...v) ? plainTime(...v) : null;
}

/**
 * Wall-clock fields of an instant: in `timeZone` (IANA) when given, else in
 * the host zone. Callers in render pass a zone or defer to
 * the client.
 */
export function wallOf(epochMs: number, timeZone: string | undefined): PlainDateTime | null {
  if (!Number.isFinite(epochMs)) return null;
  if (timeZone) {
    const w = wallAt(epochMs, timeZone);
    return w ? plainDateTime(w, w) : null;
  }
  const d = new Date(epochMs);
  return plainDateTime({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }, { hour: d.getHours(), minute: d.getMinutes(), second: d.getSeconds(), millisecond: d.getMilliseconds() });
}

/** True when an input is an instant (a `Date` or an ISO string with an offset): its wall time depends on the zone. */
export function isInstant(input: unknown): boolean {
  if (input instanceof Date) return true;
  return typeof input === 'string' && (parseIso(input)?.offset ?? null) !== null;
}

function fieldsOf(input: unknown, timeZone: string | undefined): { date: PlainDate | null; time: PlainTime | null } | null {
  if (input instanceof Date) input = wallOf(input.getTime(), timeZone);
  else if (typeof input === 'string') {
    const p = parseIso(input);
    if (!p || p.offset === null || !p.date) return p;
    const t = p.time;
    input = wallOf(utc(p.date.year, p.date.month, p.date.day, t?.hour, t?.minute, t?.second, t?.millisecond) - p.offset * 60_000, timeZone);
  }
  if (!input || typeof input !== 'object') return null;
  const o = input as PlainDateTimeLike;
  const date = o.year === undefined ? null : isValidDate(o.year, o.month, o.day) ? plainDate(o.year, o.month, o.day) : 0;
  const time = o.hour === undefined ? null : isValidTime(o.hour, o.minute, o.second, o.millisecond) ? plainTime(o.hour, o.minute, o.second, o.millisecond) : 0;
  return date === 0 || time === 0 || (!date && !time) ? null : { date, time };
}

/** Normalizes a `DateInput` (an invalid input is null; never throws). */
export function toPlainDate(input: unknown, timeZone?: string): PlainDate | null {
  if (input && typeof input === 'object' && Object.getPrototypeOf(input) === DATE_PROTO) return input as PlainDate;
  return fieldsOf(input, timeZone)?.date ?? null;
}

/** Normalizes a `TimeInput`; a date-time input keeps its time part. */
export function toPlainTime(input: unknown, timeZone?: string): PlainTime | null {
  if (input && typeof input === 'object' && Object.getPrototypeOf(input) === TIME_PROTO) return input as PlainTime;
  return fieldsOf(input, timeZone)?.time ?? null;
}

/** Normalizes a `DateTimeInput`; a date-only input is midnight. */
export function toPlainDateTime(input: unknown, timeZone?: string): PlainDateTime | null {
  if (input && typeof input === 'object' && Object.getPrototypeOf(input) === DATE_TIME_PROTO) return input as PlainDateTime;
  const f = fieldsOf(input, timeZone);
  return f?.date ? plainDateTime(f.date, f.time ?? { hour: 0, minute: 0 }) : null;
}
