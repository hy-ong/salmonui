// `Intl` labels and the pattern grammar. Month and weekday names,
// digits, era and day period come from `Intl.DateTimeFormat`; numbering
// systems follow `-u-nu-`. Pattern strings use the Data Grid pattern grammar
// (`yyyy`, `MM`, `MMM`, `dd`, `HH`, `hh`, `mm`, `ss`, `a`, quoted
// literals) and CLDR skeletons (`yMMMd`) as `@salmonui/data-grid/engine`
// does. Formatters are cached per locale and options (a pure memo of `Intl`
// objects, not render state).

import type { CalendarSystem } from './calendars.js';

const DAY = 86_400_000;
const cache = new Map<string, Intl.DateTimeFormat | Intl.NumberFormat>();

function cached<T extends Intl.DateTimeFormat | Intl.NumberFormat>(key: string, make: () => T): T {
  let f = cache.get(key) as T | undefined;
  if (!f) {
    if (cache.size > 256) cache.clear();
    f = make();
    cache.set(key, f);
  }
  return f;
}

/** A cached `Intl.DateTimeFormat` in UTC (values are wall fields as UTC instants); an invalid locale or calendar falls back. */
export function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return cached(`d${locale}${JSON.stringify(options)}`, () => {
    const o = { timeZone: 'UTC', ...options };
    try {
      return new Intl.DateTimeFormat(locale, o);
    } catch {
      return new Intl.DateTimeFormat('en-US', { ...o, calendar: 'gregory' });
    }
  });
}

/** A cached integer formatter in the locale's numbering system. */
export function numberFormat(locale: string, minDigits = 1): Intl.NumberFormat {
  return cached(`n${locale}${minDigits}`, () => {
    try {
      return new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: minDigits });
    } catch {
      return new Intl.NumberFormat('en-US', { useGrouping: false, minimumIntegerDigits: minDigits });
    }
  });
}

/**
 * `Intl` text with its no-break, thin and narrow no-break spaces as plain
 * spaces. Engines disagree on
 * them: V8 13 (Node 24) keeps U+202F before AM/PM in `formatToParts`
 * literals and `formatRange` while newer V8 (Node 26, current Chromium)
 * prints a space (`format()` prints a space in both), so a server and a
 * browser on different engines would render different text and fail
 * hydration. Part values (digits, names, day periods) carry no spaces.
 * `\s` covers all three (Intl output has no tabs or line breaks).
 */
export const intlSpaces = (text: string): string => text.replace(/\s/g, ' ');

/** One part of a formatted day number. */
export function partOf(f: Intl.DateTimeFormat, n: number, type: Intl.DateTimeFormatPartTypes): string {
  for (const p of f.formatToParts(n * DAY)) if (p.type === type) return p.value;
  return '';
}

/** Locale digit characters (`'٠١٢٣٤٥٦٧٨٩'` for `ar-EG`) mapped to their values, for typing and paste. */
export function localeDigits(locale: string): ReadonlyMap<string, number> {
  const f = numberFormat(locale);
  const map = new Map<string, number>();
  for (let i = 0; i < 10; i++) {
    map.set(String(i), i);
    map.set(f.format(i), i);
  }
  return map;
}

/** Text with locale digits replaced by Latin digits. */
export const latinDigits = (text: string, digits: ReadonlyMap<string, number>): string => text.replace(/\p{Nd}/gu, (c) => String(digits.get(c) ?? c));

export type WeekdayFormat = 'narrow' | 'short' | 'long';

/** Labels of a calendar for one locale, calendar system and first day of week. */
export interface CalendarLabels {
  /** Weekday column headers from the first day of week: the display text and the long name (`abbr`). */
  readonly weekdays: readonly { readonly text: string; readonly long: string }[];
  /** "November 2026" in the calendar. */
  month(n: number): string;
  /** "2026" in the calendar (year view heading, decade cells). */
  year(n: number): string;
  /** Short month name in the calendar (year view cells). */
  monthName(n: number): string;
  /** Day of month in the calendar and the locale's digits. */
  day(n: number): string;
  /** Full date: the accessible name of a day cell. */
  full(n: number): string;
  /** Integer in the locale's digits (week numbers). */
  number(value: number): string;
}

export function calendarLabels(locale: string, sys: CalendarSystem, firstDay: number, weekdayFormat: WeekdayFormat = 'short'): CalendarLabels {
  const calendar = sys.id;
  const f = (o: Intl.DateTimeFormatOptions) => dateFormat(locale, { calendar, ...o });
  const wd = f({ weekday: weekdayFormat });
  const wl = f({ weekday: 'long' });
  // 1970-01-04 (day 3) is a Sunday.
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const n = 3 + ((firstDay + i) % 7);
    return { text: partOf(wd, n, 'weekday'), long: partOf(wl, n, 'weekday') };
  });
  const month = f({ year: 'numeric', month: 'long' });
  const year = f({ year: 'numeric' });
  const monthName = f({ month: 'short' });
  const day = f({ day: 'numeric' });
  const full = f({ dateStyle: 'full' });
  const nf = numberFormat(locale);
  return {
    weekdays,
    month: (n) => month.format(n * DAY),
    year: (n) => year.format(n * DAY),
    monthName: (n) => monthName.format(n * DAY),
    day: (n) => partOf(day, n, 'day'),
    full: (n) => full.format(n * DAY),
    number: (v) => nf.format(v),
  };
}

// ---------------------------------------------------------------------------
// Pattern grammar
// ---------------------------------------------------------------------------

/** Tokens of a pattern: quoted literals, then field letters (the Data Grid grammar, `@salmonui/data-grid/engine` format.ts). */
const PATTERN_TOKEN = /'((?:[^']|'')*)'|(G+|y+|M+|L+|d+|E+|c+|h+|H+|m+|s+|f+|a+|z+)/g;
const SKELETON = /^[GyMLdEhHms]+$/;
const STYLES = new Set(['short', 'medium', 'long', 'full']);

/** A token of a date pattern: a literal, or a field letter run (`'yyyy'`, `'MMM'`). */
export type PatternToken = { readonly literal: string } | { readonly field: string };

/** Splits a pattern (`'dd/MM/yyyy HH:mm'`) into literals and field runs. */
export function tokenizePattern(pattern: string): PatternToken[] {
  const out: PatternToken[] = [];
  let last = 0;
  for (const m of pattern.matchAll(PATTERN_TOKEN)) {
    if (m.index > last) out.push({ literal: pattern.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ literal: m[1] === '' ? "'" : m[1].replace(/''/g, "'") });
    else out.push({ field: m[2] as string });
    last = m.index + m[0].length;
  }
  if (last < pattern.length) out.push({ literal: pattern.slice(last) });
  return out;
}

/** True when a format string is a CLDR skeleton (`yMMMd`) or a style (`short`), not a pattern. */
export const isSkeleton = (format: string): boolean => STYLES.has(format) || SKELETON.test(format);

/** `Intl` options of a CLDR skeleton or style (the Data Grid `skeletonToOptions` rules for the field letters; era and weekday are not field segments). */
export function skeletonOptions(skeleton: string): Intl.DateTimeFormatOptions {
  if (STYLES.has(skeleton)) return { dateStyle: skeleton as 'short' };
  const o: Intl.DateTimeFormatOptions = {};
  for (const run of skeleton.match(/(.)\1*/g) ?? []) {
    const n = run.length;
    const num = n === 2 ? '2-digit' : 'numeric';
    switch (run[0]) {
      case 'y':
        o.year = num;
        break;
      case 'M':
      case 'L':
        o.month = n <= 2 ? num : n === 3 ? 'short' : n === 4 ? 'long' : 'narrow';
        break;
      case 'd':
        o.day = num;
        break;
      case 'h':
        o.hour = num;
        o.hourCycle = 'h12';
        break;
      case 'H':
        o.hour = num;
        o.hourCycle = 'h23';
        break;
      case 'm':
        o.minute = num;
        break;
      case 's':
        o.second = num;
        break;
    }
  }
  return o;
}
