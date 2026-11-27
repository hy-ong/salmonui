// Week rules:
// first day of week and minimal days in the first week from
// `Intl.Locale#getWeekInfo()` (or the older `weekInfo` getter), else the
// CLDR region tables, with the `-u-fw-` extension honored; week numbers for
// the three week rules (`WeekRule`). Promoted from the Data Grid date editor
// (`data-grid/editing/calendar.ts`); the editor keeps its copy for now
// instead of building on the public DatePicker, so its lazy chunk does not change.

/** 0 Sunday ... 6 Saturday of a day number (days since 1970-01-01). */
export const weekday = (n: number): number => (((n + 4) % 7) + 7) % 7;

/** First day of the week containing day number `n`. */
export const weekStart = (n: number, firstDay: number): number => n - ((weekday(n) - firstDay + 7) % 7);

// CLDR `weekData.firstDay` (regions not listed start on Monday).
const SUNDAY = 'AG AS BD BR BS BT BW BZ CA CN CO DM DO ET GT GU HK HN ID IL IN JM JP KE KH KR LA MH MM MO MT MX MZ NI NP PA PE PH PK PR PT PY SA SG SV TH TT TW UM US VE VI WS YE ZA ZW';
const SATURDAY = 'AE AF BH DJ DZ EG IQ IR JO KW LY OM QA SD SY';
// CLDR `weekData.minDays` 4 (ISO weeks); other regions use 1.
const MIN_DAYS_4 = 'AD AN AT AX BE BG CH CZ DE DK EE ES FI FJ FO FR GB GF GG GI GP GR HU IE IM IS IT JE LI LT LU MC MQ NL NO PL PT RE RU SE SJ SK SM VA';

interface WeekInfo {
  readonly firstDay: number;
  readonly minimalDays?: number;
}
type WeekInfoLocale = Intl.Locale & { getWeekInfo?: () => WeekInfo; weekInfo?: WeekInfo };

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

/** Minimal days in the first week of the year for `locale` (1 or 4 in CLDR). */
export function localeMinimalDays(locale: string): number {
  try {
    const loc = new Intl.Locale(locale) as WeekInfoLocale;
    const min = (typeof loc.getWeekInfo === 'function' ? loc.getWeekInfo() : loc.weekInfo)?.minimalDays;
    if (min && min >= 1 && min <= 7) return min;
    const region = loc.maximize().region;
    return region && MIN_DAYS_4.includes(region) ? 4 : 1;
  } catch {
    return 1;
  }
}

/** Which week of January is week 1. */
export type WeekRule = 'firstDay' | 'firstFullWeek' | 'firstFourDayWeek';

/** Minimal days of a week rule (1, 7, 4). */
export const ruleDays = (rule: WeekRule): number => (rule === 'firstFullWeek' ? 7 : rule === 'firstFourDayWeek' ? 4 : 1);

/** The week rule of a locale's minimal days (1 → firstDay, 4 → firstFourDayWeek, 7 → firstFullWeek). */
export const localeWeekRule = (locale: string): WeekRule => {
  const d = localeMinimalDays(locale);
  return d >= 7 ? 'firstFullWeek' : d >= 4 ? 'firstFourDayWeek' : 'firstDay';
};

/** Day number of the first day of week 1 of `year`. */
function week1(year: number, firstDay: number, minDays: number): number {
  const jan1 = Math.floor(Date.UTC(year, 0, 1) / 86_400_000);
  const start = weekStart(jan1, firstDay);
  return 7 - (jan1 - start) >= minDays ? start : start + 7;
}

/**
 * Week number of day number `n` (1-53) for a first day of week and a week
 * rule. Days before week 1 belong to the last week of the previous year.
 */
export function weekNumber(n: number, firstDay: number, rule: WeekRule): number {
  const min = ruleDays(rule);
  const year = new Date(n * 86_400_000).getUTCFullYear();
  let start = week1(year + 1, firstDay, min);
  if (n >= start) return 1;
  start = week1(year, firstDay, min);
  if (n < start) start = week1(year - 1, firstDay, min);
  return Math.floor((weekStart(n, firstDay) - start) / 7) + 1;
}
