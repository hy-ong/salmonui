// Views and visible date ranges: every view resolves to a list of visible day numbers
// (columns or month cells) from the anchor date, `firstDayOfWeek`,
// `workDays`, `showWeekend` and the view `interval`; navigation moves the
// anchor by one view span. Pure, over day numbers.

import { weekdayOfDay } from './time.js';
import type { SchedulerViewType } from './types.js';

export interface ResolvedView {
  readonly type: SchedulerViewType;
  /** Days, weeks, months or years per page (custom intervals). */
  readonly interval: number;
  /** Visible days per page for `agenda`. */
  readonly agendaDayCount: number;
  readonly firstDayOfWeek: number;
  readonly workDays: readonly number[];
  readonly showWeekend: boolean;
  /** Months per page of the year views. */
  readonly monthCount: number;
  /** First month of the year views, 1-12. */
  readonly firstMonthOfYear: number;
}

/** The kind of layout a view uses. */
export const isDayView = (t: SchedulerViewType): boolean => t === 'day' || t === 'week' || t === 'workWeek';
export const isTimelineView = (t: SchedulerViewType): boolean => t.startsWith('timeline');
export const isMonthView = (t: SchedulerViewType): boolean => t === 'month' || t === 'monthAgenda';

const monthIndex = (day: number): number => {
  const d = new Date(day * 86_400_000);
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
};
const firstOfMonthIndex = (mi: number): number => Math.floor(Date.UTC(Math.floor(mi / 12), mi % 12, 1) / 86_400_000);
const weekStartOf = (day: number, first: number): number => day - ((weekdayOfDay(day) - first + 7) % 7);

function visibleWeekday(view: ResolvedView, wd: number): boolean {
  if (view.type === 'workWeek' || view.type === 'timelineWorkWeek') return view.workDays.includes(wd);
  return view.showWeekend || view.workDays.includes(wd);
}

/** The page of `anchor`: the first and last (inclusive) day numbers before weekday filtering. */
export function pageOf(view: ResolvedView, anchor: number): { readonly first: number; readonly last: number } {
  const iv = Math.max(1, view.interval);
  switch (view.type) {
    case 'day':
    case 'timelineDay':
      return { first: anchor, last: anchor + iv - 1 };
    case 'week':
    case 'workWeek':
    case 'timelineWeek':
    case 'timelineWorkWeek': {
      const s = weekStartOf(anchor, view.firstDayOfWeek);
      return { first: s, last: s + 7 * iv - 1 };
    }
    case 'month':
    case 'monthAgenda': {
      const mi = monthIndex(anchor);
      const s = weekStartOf(firstOfMonthIndex(mi), view.firstDayOfWeek);
      const endMonth = firstOfMonthIndex(mi + iv) - 1;
      const e = weekStartOf(endMonth, view.firstDayOfWeek) + 6;
      return { first: s, last: e };
    }
    case 'timelineMonth': {
      const mi = monthIndex(anchor);
      return { first: firstOfMonthIndex(mi), last: firstOfMonthIndex(mi + iv) - 1 };
    }
    case 'agenda':
      return { first: anchor, last: anchor + view.agendaDayCount * iv - 1 };
    case 'year':
    case 'timelineYear': {
      const d = new Date(anchor * 86_400_000);
      const y = d.getUTCFullYear();
      let mi = y * 12 + view.firstMonthOfYear - 1;
      if (monthIndex(anchor) < mi) mi -= 12;
      return { first: firstOfMonthIndex(mi), last: firstOfMonthIndex(mi + view.monthCount * iv) - 1 };
    }
  }
}

/** Visible day numbers of a page (weekday filtering applied for day, week, month and timeline views). */
export function visibleDays(view: ResolvedView, anchor: number): number[] {
  const { first, last } = pageOf(view, anchor);
  const out: number[] = [];
  const filter = view.type !== 'agenda' && view.type !== 'year' && view.type !== 'timelineYear' && view.type !== 'day' && view.type !== 'timelineDay';
  for (let d = first; d <= last; d++) if (!filter || visibleWeekday(view, weekdayOfDay(d))) out.push(d);
  return out;
}

/** Weeks of a month page (`month`, `monthAgenda`): rows of visible day numbers. */
export function monthWeeks(view: ResolvedView, anchor: number): number[][] {
  const { first, last } = pageOf(view, anchor);
  const rows: number[][] = [];
  for (let s = first; s <= last; s += 7) {
    const row: number[] = [];
    for (let d = s; d < s + 7; d++) if (visibleWeekday(view, weekdayOfDay(d))) row.push(d);
    rows.push(row);
  }
  return rows;
}

export type NavigateAction = 'previous' | 'next' | 'today';

/** The anchor day after moving one page. */
export function navigateDay(view: ResolvedView, anchor: number, direction: -1 | 1): number {
  const iv = Math.max(1, view.interval);
  switch (view.type) {
    case 'day':
    case 'timelineDay':
      return anchor + direction * iv;
    case 'week':
    case 'workWeek':
    case 'timelineWeek':
    case 'timelineWorkWeek':
      return anchor + direction * 7 * iv;
    case 'agenda':
      return anchor + direction * view.agendaDayCount * iv;
    case 'month':
    case 'monthAgenda':
    case 'timelineMonth':
      return addMonthsDay(anchor, direction * iv);
    case 'year':
    case 'timelineYear':
      return addMonthsDay(anchor, direction * view.monthCount * iv);
  }
}

/** Adds months to a day number, clamping the day of month. */
export function addMonthsDay(day: number, months: number): number {
  const d = new Date(day * 86_400_000);
  const mi = d.getUTCFullYear() * 12 + d.getUTCMonth() + months;
  const y = Math.floor(mi / 12);
  const m = mi - y * 12;
  const len = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Math.floor(Date.UTC(y, m, Math.min(d.getUTCDate(), len)) / 86_400_000);
}

/** Clamps a day number into [min, max] (inclusive; either may be null). */
export const clampDay = (day: number, min: number | null, max: number | null): number => (min !== null && day < min ? min : max !== null && day > max ? max : day);
