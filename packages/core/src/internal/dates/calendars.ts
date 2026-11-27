// Calendar systems through `Intl`. Values stay ISO dates; a calendar changes how months and years
// are laid out and labelled. Gregorian-month calendars (`gregory`,
// `iso8601`, `buddhist`, `japanese`, `roc`) use the ISO fields and only
// relabel era and year. Other calendars (`islamic-umalqura`,
// `islamic-civil`, ...) read the month and day of each day number from
// `formatToParts` in that calendar and find month starts by stepping, so no
// calendar tables are shipped.

import { daysInMonth, fromDays, utc } from './plain.js';

/** Year, month (1-based) and day of a day number in a calendar system. */
export interface CalendarFields {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

/** A calendar system over day numbers. */
export interface CalendarSystem {
  readonly id: string;
  /** True when months are the ISO months (only era and year labels differ). */
  readonly gregorian: boolean;
  fields(n: number): CalendarFields;
  /** Day number of the first day of `month` of `year`; months outside 1-12 roll into the neighbouring years. */
  start(year: number, month: number): number;
}

const GREGORIAN_MONTHS = new Set(['gregory', 'iso8601', 'buddhist', 'japanese', 'roc']);
const DAY = 86_400_000;

const days = (y: number, m: number, d: number): number => Math.floor(utc(y, m, d) / DAY);

function gregorian(id: string): CalendarSystem {
  return {
    id,
    gregorian: true,
    fields: (n) => fromDays(n),
    start: (y, m) => days(y, m, 1),
  };
}

// A pure memo of calendar systems (Intl formatters) per id.
const systems = new Map<string, CalendarSystem>();

/** The calendar system of an `Intl` calendar id; unknown ids fall back to Gregorian. */
export function calendarSystem(id: string): CalendarSystem {
  let s = systems.get(id);
  if (s) return s;
  if (GREGORIAN_MONTHS.has(id)) s = gregorian(id);
  else {
    let f: Intl.DateTimeFormat | null = null;
    try {
      f = new Intl.DateTimeFormat('en-US', { calendar: id, numberingSystem: 'latn', timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
      if (f.resolvedOptions().calendar !== id) f = null;
    } catch {
      f = null;
    }
    s = f ? intlSystem(id, f) : gregorian('gregory');
  }
  systems.set(id, s);
  return s;
}

function intlSystem(id: string, f: Intl.DateTimeFormat): CalendarSystem {
  const fields = (n: number): CalendarFields => {
    const v: Record<string, number> = {};
    for (const p of f.formatToParts(n * DAY)) if (/^(year|relatedYear|month|day)$/.test(p.type)) v[p.type] = parseInt(p.value, 10);
    return { year: v['year'] ?? v['relatedYear'] ?? 0, month: v['month'] ?? 1, day: v['day'] ?? 1 };
  };
  const start = (year: number, month: number): number => {
    const y = year + Math.floor((month - 1) / 12);
    const m = ((((month - 1) % 12) + 12) % 12) + 1;
    const ref = fields(0);
    let n = Math.round(((y - ref.year) * 12 + (m - ref.month)) * 29.530588) - (ref.day - 1);
    for (let i = 0; i < 8; i++) {
      const c = fields(n);
      const diff = (y - c.year) * 12 + (m - c.month);
      if (diff === 0) return n - (c.day - 1);
      n += Math.round(diff * 29.530588) - (c.day - 15);
    }
    return n;
  };
  return { id, gregorian: false, fields, start };
}

/** Number of days of the month that contains day number `n`. */
export function monthLength(sys: CalendarSystem, n: number): number {
  const f = sys.fields(n);
  return sys.gregorian ? daysInMonth(f.year, f.month) : sys.start(f.year, f.month + 1) - sys.start(f.year, f.month);
}

/** The same day `months` later in the calendar, clamped to the target month length. */
export function addCalendarMonths(sys: CalendarSystem, n: number, months: number): number {
  const f = sys.fields(n);
  const start = sys.start(f.year, f.month + months);
  return start + Math.min(f.day, monthLength(sys, start)) - 1;
}

/** `override`, else the `-u-ca-` extension of `locale`, else `'gregory'`. */
export function resolveCalendar(locale: string, override?: string): string {
  if (override) return override;
  try {
    return new Intl.Locale(locale).calendar ?? 'gregory';
  } catch {
    return 'gregory';
  }
}
