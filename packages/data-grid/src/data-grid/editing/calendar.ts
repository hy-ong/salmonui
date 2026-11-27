// Pure date math and `Intl` labels of the date picker: week start from `Intl.Locale` week info, the Gregorian
// month grid, the locale's numeric field order for the text input, and
// calendar-aware labels. Days are UTC day numbers (days since 1970-01-01), so
// nothing depends on the host time zone. In the lazy editing chunk.

const DAY = 86_400_000;

/** A calendar day: Gregorian year, month 1-12, day 1-31. */
export interface CalendarDay {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

export const dayNumber = (year: number, month: number, day: number): number => Math.floor(Date.UTC(year, month - 1, day) / DAY);

export function dayOf(n: number): CalendarDay {
  const d = new Date(n * DAY);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** 0 Sunday ... 6 Saturday. */
export const weekday = (n: number): number => (((n + 4) % 7) + 7) % 7;

export const daysInMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** The same day `months` later, clamped to the length of the target month (PageUp / PageDown). */
export function addMonths(n: number, months: number): number {
  const { year, month, day } = dayOf(n);
  const index = year * 12 + month - 1 + months;
  const y = Math.floor(index / 12);
  const m = index - y * 12 + 1;
  return dayNumber(y, m, Math.min(day, daysInMonth(y, m)));
}

/** First day of the week containing `n`. */
export const weekStart = (n: number, firstDay: number): number => n - ((weekday(n) - firstDay + 7) % 7);

/** The 42 days (6 weeks) shown for the month of `n`, starting on `firstDay`. */
export function monthGrid(n: number, firstDay: number): number[] {
  const { year, month } = dayOf(n);
  const start = weekStart(dayNumber(year, month, 1), firstDay);
  return Array.from({ length: 42 }, (_, i) => start + i);
}

// CLDR `weekData.firstDay` (regions not listed start on Monday).
const SUNDAY = 'AG AS BD BR BS BT BW BZ CA CN CO DM DO ET GT GU HK HN ID IL IN JM JP KE KH KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW';
const SATURDAY = 'AE AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY';

type WeekInfoLocale = Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };

/** Week start of a region from the CLDR table: 0 Sunday, 5 Friday, 6 Saturday, else 1 Monday. */
export function regionFirstDay(region: string | undefined): number {
  if (!region) return 1;
  if (SUNDAY.includes(region)) return 0;
  if (SATURDAY.includes(region)) return 6;
  return region === 'MV' ? 5 : 1;
}

/**
 * First day of the week of `locale` (0 Sunday ... 6 Saturday):
 * `Intl.Locale#getWeekInfo()` (or the older `weekInfo` getter), else the
 * CLDR region table of the maximized locale. An `-u-fw-` extension is honored
 * by both.
 */
export function localeFirstDay(locale: string): number {
  let loc: WeekInfoLocale;
  try {
    loc = new Intl.Locale(locale) as WeekInfoLocale;
  } catch {
    return 1;
  }
  try {
    const info = typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo;
    if (info && info.firstDay >= 1 && info.firstDay <= 7) return info.firstDay % 7;
  } catch {
    // Fall through to the table.
  }
  const fw = /-u(?:-\w+)*?-fw-(sun|mon|tue|wed|thu|fri|sat)/.exec(locale.toLowerCase());
  if (fw) return ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(fw[1] as string);
  return regionFirstDay(loc.maximize().region);
}

/** `editorProps.firstDayOfWeek` when it is 0-6, else the locale's. */
export function resolveFirstDay(locale: string, override: unknown): number {
  return typeof override === 'number' && Number.isInteger(override) && override >= 0 && override <= 6 ? override : localeFirstDay(locale);
}

/** Calendars whose months are the Gregorian months (only era and year differ). */
const GREGORIAN_MONTHS = new Set(['gregory', 'iso8601', 'buddhist', 'japanese', 'roc']);

/** Field order of the numeric date of `locale` (`'dmy'`, `'mdy'`, `'ymd'`) and its separator. */
export interface DateTextFormat {
  readonly order: string;
  readonly separator: string;
}

// A pure memo of an `Intl` lookup per locale (not render state).
const textFormats = new Map<string, DateTextFormat>();

export function dateTextFormat(locale: string): DateTextFormat {
  const cached = textFormats.get(locale);
  if (cached) return cached;
  const parts = new Intl.DateTimeFormat(locale, { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'UTC', calendar: 'gregory', numberingSystem: 'latn' }).formatToParts(0);
  let order = '';
  let separator = '';
  for (const p of parts) {
    if (p.type === 'year' || p.type === 'month' || p.type === 'day') order += p.type[0];
    else if (p.type === 'literal' && !separator && order) separator = p.value.trim() || p.value;
  }
  const format = { order: order.length === 3 ? order : 'ymd', separator: separator || '-' };
  if (textFormats.size > 32) textFormats.clear();
  textFormats.set(locale, format);
  return format;
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

/** Text of a day in the input: the locale's numeric order and separator, Latin digits. */
export function formatDayText(day: CalendarDay, format: DateTextFormat): string {
  const fields: Record<string, string> = { y: pad(day.year, 4), m: pad(day.month), d: pad(day.day) };
  return [...format.order].map((f) => fields[f]).join(format.separator);
}

/** Placeholder of the input (`dd.mm.yyyy`, `mm/dd/yyyy`, ...). */
export function placeholderOf(format: DateTextFormat, withTime: boolean): string {
  const fields: Record<string, string> = { y: 'yyyy', m: 'mm', d: 'dd' };
  const date = [...format.order].map((f) => fields[f]).join(format.separator);
  return withTime ? `${date} hh:mm` : date;
}

/** A parsed input: the day and, for date-time text, minutes since midnight (null without a time). */
export interface ParsedDateText {
  readonly day: CalendarDay;
  readonly minutes: number | null;
}

/**
 * Parses input text: ISO `yyyy-mm-dd` (with `Thh:mm`), else the digit groups
 * in the locale's field order (any separators), then an optional `hh:mm`
 * with `am` / `pm`. Two-digit years are 20xx. Returns null for invalid text.
 */
export function parseDateText(text: string, format: DateTextFormat): ParsedDateText | null {
  const t = text.trim();
  if (!t) return null;
  const groups = t.match(/\d+/g) ?? [];
  if (groups.length < 3 || groups.length > 5) return null;
  const iso = /^\d{4}-\d{1,2}-\d{1,2}(?:$|[T\s])/.test(t);
  const order = iso ? 'ymd' : format.order;
  const field: Record<string, number> = {};
  for (let i = 0; i < 3; i++) field[order[i] as string] = Number(groups[i]);
  let year = field['y'] as number;
  const month = field['m'] as number;
  const day = field['d'] as number;
  if ((groups[order.indexOf('y')] as string).length <= 2) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  let minutes: number | null = null;
  if (groups.length > 3) {
    let hour = Number(groups[3]);
    const minute = groups.length > 4 ? Number(groups[4]) : 0;
    const pm = /p\.?\s*m/i.test(t);
    if (pm || /a\.?\s*m/i.test(t)) {
      if (hour < 1 || hour > 12) return null;
      hour = (hour % 12) + (pm ? 12 : 0);
    }
    if (hour > 23 || minute > 59) return null;
    minutes = hour * 60 + minute;
  }
  return { day: { year, month, day }, minutes };
}

export const timeText = (minutes: number): string => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

/** Labels of the picker for one locale and calendar (built once per open picker). */
export interface CalendarLabels {
  /** Weekday names from `firstDay`: short (column header) and long (`abbr`). */
  readonly weekdays: readonly { readonly short: string; readonly long: string }[];
  /** Month heading of the month of a day ("November 2026", "พฤศจิกายน 2569"). */
  month(n: number): string;
  /** Day number in the cell (the locale's digits). */
  dayText(n: number): string;
  /** Accessible name of a day: the full date, in the locale's calendar. */
  dayLabel(n: number): string;
}

/** The calendar used for labels: `override`, else the locale's resolved calendar. */
export function resolveCalendar(locale: string, override: unknown): string {
  if (typeof override === 'string' && override) return override;
  try {
    return new Intl.DateTimeFormat(locale).resolvedOptions().calendar;
  } catch {
    return 'gregory';
  }
}

export function calendarLabels(locale: string, calendar: string, firstDay: number): CalendarLabels {
  const base = { timeZone: 'UTC' } as const;
  // The grid is Gregorian; a calendar with other months keeps the Gregorian heading.
  const heading = GREGORIAN_MONTHS.has(calendar) ? calendar : 'gregory';
  const make = (options: Intl.DateTimeFormatOptions, cal: string): Intl.DateTimeFormat => {
    try {
      return new Intl.DateTimeFormat(locale, { ...base, ...options, calendar: cal });
    } catch {
      return new Intl.DateTimeFormat(locale, { ...base, ...options });
    }
  };
  const short = make({ weekday: 'short' }, 'gregory');
  const long = make({ weekday: 'long' }, 'gregory');
  const month = make({ month: 'long', year: 'numeric' }, heading);
  let digits: Intl.NumberFormat;
  try {
    digits = new Intl.NumberFormat(locale, { useGrouping: false });
  } catch {
    digits = new Intl.NumberFormat('en-US', { useGrouping: false });
  }
  const full = make({ dateStyle: 'full' }, calendar);
  const date = (n: number): Date => new Date(n * DAY);
  // 1970-01-04 (day 3) is a Sunday.
  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const d = date(3 + ((firstDay + i) % 7));
    return { short: short.format(d), long: long.format(d) };
  });
  return {
    weekdays,
    month: (n) => month.format(date(n)),
    dayText: (n) => digits.format(dayOf(n).day),
    dayLabel: (n) => full.format(date(n)),
  };
}
