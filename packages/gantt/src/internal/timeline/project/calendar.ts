// Working calendars of the project engine: working hours per weekday, working weekdays, exceptions
// (holidays as non-working ranges, working exceptions with their own hours)
// and the working-time math every schedule uses: snapping to working time,
// adding signed working ms, and the working ms between two times. Days are
// cached in a dense window with a prefix sum of working ms, so `addWork` and
// `workBetween` are a binary search plus a walk inside one day. Times are
// floating wall ms. Pure: no React, no DOM globals, zero dependencies.

import { DAY, HOUR, MINUTE } from '@salmonui/core/internal/timeline/axis';

/** Hours of the day, decimals allowed (`{ from: 8, to: 17.5 }`). */
export interface HourRange {
  readonly from: number;
  readonly to: number;
}

export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface WorkingTimeInput {
  /** Working hours of a working day (default 08:00-17:00). */
  readonly dayRanges?: readonly HourRange[];
  /** Hours per weekday (0 = Sunday); a listed weekday is working with these hours. */
  readonly week?: Partial<Record<Weekday, readonly HourRange[]>>;
  /** Working weekdays (default Monday to Friday). */
  readonly workDays?: readonly number[];
  /** Every day is a working day. */
  readonly includeWeekend?: boolean;
  /** Working hours of one duration day (default: the sum of `dayRanges`). */
  readonly hoursPerDay?: number;
  readonly daysPerWeek?: number;
  readonly daysPerMonth?: number;
}

/** [start, end) in wall ms; without `ranges` non-working (a holiday), with `ranges` working with those hours. */
export interface CalendarException {
  readonly start: number;
  readonly end: number;
  readonly ranges?: readonly HourRange[] | null;
  readonly label?: string;
}

export type CalendarUnit = 'minute' | 'hour' | 'day' | 'week' | 'month';

export interface WorkCalendar {
  readonly hoursPerDay: number;
  readonly daysPerWeek: number;
  readonly daysPerMonth: number;
  isWorkingDay(day: number): boolean;
  /** Working intervals of a day number as flat wall ms pairs `[s0, e0, s1, e1, ...]` (cached; do not mutate). */
  rangesOf(day: number): readonly number[];
  isWorking(t: number): boolean;
  /** `t` when working (or at a range start), else the next range start. */
  nextWorkingStart(t: number): number;
  /** `t` when inside or at the end of a range, else the previous range end. */
  prevWorkingEnd(t: number): number;
  /** `t` plus signed working ms: forward ends at a range end, backward at a range start. */
  addWork(t: number, workMs: number): number;
  /** Signed working ms from `a` to `b`. */
  workBetween(a: number, b: number): number;
  unitMs(unit: CalendarUnit): number;
  toWorkMs(value: number, unit: CalendarUnit): number;
  fromWorkMs(ms: number, unit: CalendarUnit): number;
}

const DEFAULT_RANGES: readonly HourRange[] = [{ from: 8, to: 17 }];
const DEFAULT_DAYS: readonly number[] = [1, 2, 3, 4, 5];
/** Search cap for working time (about 10 years of days). */
const SEARCH_DAYS = 3660;
/** Hard cap of the cached window. */
const MAX_WINDOW = 80_000;

/** Sorted, merged ms offsets inside a day of hour ranges. */
function offsets(ranges: readonly HourRange[]): number[] {
  const pairs = ranges
    .map((r) => [Math.max(0, Math.min(24, r.from)) * HOUR, Math.max(0, Math.min(24, r.to)) * HOUR] as const)
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  const out: number[] = [];
  for (const [a, b] of pairs) {
    const last = out.length - 1;
    if (last > 0 && a <= (out[last] as number)) out[last] = Math.max(out[last] as number, b);
    else out.push(a, b);
  }
  return out.map((v) => Math.round(v));
}

/** Flat intervals minus [a, b). */
function subtract(r: number[], a: number, b: number): number[] {
  const out: number[] = [];
  for (let k = 0; k < r.length; k += 2) {
    const s = r[k] as number;
    const e = r[k + 1] as number;
    if (e <= a || s >= b) out.push(s, e);
    else {
      if (s < a) out.push(s, a);
      if (e > b) out.push(b, e);
    }
  }
  return out;
}

/** Union of two flat interval lists. */
function union(r: number[], add: number[]): number[] {
  const all: [number, number][] = [];
  for (let k = 0; k < r.length; k += 2) all.push([r[k] as number, r[k + 1] as number]);
  for (let k = 0; k < add.length; k += 2) all.push([add[k] as number, add[k + 1] as number]);
  all.sort((x, y) => x[0] - y[0]);
  const out: number[] = [];
  for (const [a, b] of all) {
    const last = out.length - 1;
    if (last > 0 && a <= (out[last] as number)) out[last] = Math.max(out[last] as number, b);
    else out.push(a, b);
  }
  return out;
}

interface Exception {
  readonly start: number;
  readonly end: number;
  readonly ranges: number[] | null;
}

export function createWorkCalendar(workingTime?: WorkingTimeInput, exceptions?: readonly CalendarException[]): WorkCalendar {
  const wt = workingTime ?? {};
  const dayRanges = offsets(wt.dayRanges ?? DEFAULT_RANGES);
  const workDays = new Set(wt.includeWeekend ? [0, 1, 2, 3, 4, 5, 6] : (wt.workDays ?? DEFAULT_DAYS));
  const week: number[][] = [];
  for (let d = 0; d < 7; d++) {
    const own = wt.week?.[d as Weekday];
    week.push(own ? offsets(own) : workDays.has(d) ? dayRanges : []);
  }
  // A calendar without any working time falls back to all-day working time (no endless searches).
  if (week.every((r) => r.length === 0)) for (let d = 0; d < 7; d++) week[d] = [0, DAY];
  let sumDay = 0;
  for (let k = 0; k < dayRanges.length; k += 2) sumDay += (dayRanges[k + 1] as number) - (dayRanges[k] as number);
  const hoursPerDay = wt.hoursPerDay !== undefined && wt.hoursPerDay > 0 ? wt.hoursPerDay : sumDay > 0 ? sumDay / HOUR : 24;
  const daysPerWeek = wt.daysPerWeek !== undefined && wt.daysPerWeek > 0 ? wt.daysPerWeek : 5;
  const daysPerMonth = wt.daysPerMonth !== undefined && wt.daysPerMonth > 0 ? wt.daysPerMonth : 20;
  const exc: Exception[] = (exceptions ?? [])
    .filter((e) => Number.isFinite(e.start) && Number.isFinite(e.end) && e.end > e.start)
    .map((e) => ({ start: e.start, end: e.end, ranges: e.ranges ? offsets(e.ranges) : null }))
    .sort((a, b) => a.start - b.start);

  const computeDay = (d: number): number[] => {
    const ds = d * DAY;
    const de = ds + DAY;
    const wd = ((((d + 4) % 7) + 7) % 7) as Weekday; // day 0 is a Thursday
    let r = (week[wd] as number[]).map((v) => v + ds);
    for (const e of exc) {
      if (e.start >= de) break;
      if (e.end <= ds) continue;
      const a = Math.max(ds, e.start);
      const b = Math.min(de, e.end);
      r = subtract(r, a, b);
      if (e.ranges) {
        const add: number[] = [];
        for (let k = 0; k < e.ranges.length; k += 2) {
          const s = Math.max(a, (e.ranges[k] as number) + ds);
          const t = Math.min(b, (e.ranges[k + 1] as number) + ds);
          if (t > s) add.push(s, t);
        }
        r = union(r, add);
      }
    }
    return r;
  };

  // Dense cache window [base, base + len) with prefix sums of working ms.
  let base = 0;
  let len = 0;
  let days: number[][] = [];
  let cum = new Float64Array(1);

  const rebuildCum = (): void => {
    cum = new Float64Array(len + 1);
    let acc = 0;
    for (let i = 0; i < len; i++) {
      cum[i] = acc;
      const r = days[i] as number[];
      for (let k = 0; k < r.length; k += 2) acc += (r[k + 1] as number) - (r[k] as number);
    }
    cum[len] = acc;
  };

  /** Makes `day` part of the window; false when it is beyond the cap. */
  const ensure = (day: number): boolean => {
    if (len === 0) {
      base = day - 64;
      len = 192;
      days = new Array<number[]>(len);
      for (let i = 0; i < len; i++) days[i] = computeDay(base + i);
      rebuildCum();
      return true;
    }
    if (day >= base && day < base + len) return true;
    const pad = Math.max(64, len);
    const nb = day < base ? Math.min(day, base - pad) : base;
    const ne = day >= base + len ? Math.max(day + 1, base + len + pad) : base + len;
    if (ne - nb > MAX_WINDOW) return false;
    const next = new Array<number[]>(ne - nb);
    for (let d = nb; d < ne; d++) next[d - nb] = d >= base && d < base + len ? (days[d - base] as number[]) : computeDay(d);
    base = nb;
    len = ne - nb;
    days = next;
    rebuildCum();
    return true;
  };

  const rangesOf = (day: number): readonly number[] => (ensure(day) ? (days[day - base] as number[]) : computeDay(day));

  /** Working ms from the window base to `t` (window must contain t's day). */
  const workAt = (t: number): number => {
    const i = Math.floor(t / DAY) - base;
    const r = days[i] as number[];
    let acc = cum[i] as number;
    for (let k = 0; k < r.length; k += 2) {
      const s = r[k] as number;
      const e = r[k + 1] as number;
      if (t >= e) acc += e - s;
      else {
        if (t > s) acc += t - s;
        break;
      }
    }
    return acc;
  };

  const isWorking = (t: number): boolean => {
    const r = rangesOf(Math.floor(t / DAY));
    for (let k = 0; k < r.length; k += 2) if (t >= (r[k] as number) && t < (r[k + 1] as number)) return true;
    return false;
  };

  const nextWorkingStart = (t: number): number => {
    if (!Number.isFinite(t)) return t;
    const d0 = Math.floor(t / DAY);
    for (let d = d0; d <= d0 + SEARCH_DAYS; d++) {
      const r = rangesOf(d);
      for (let k = 0; k < r.length; k += 2) if (t < (r[k + 1] as number)) return Math.max(t, r[k] as number);
    }
    return t;
  };

  const prevWorkingEnd = (t: number): number => {
    if (!Number.isFinite(t)) return t;
    const d0 = Math.floor(t / DAY);
    for (let d = d0; d >= d0 - SEARCH_DAYS; d--) {
      const r = rangesOf(d);
      for (let k = r.length - 2; k >= 0; k -= 2) if (t > (r[k] as number)) return Math.min(t, r[k + 1] as number);
    }
    return t;
  };

  const workBetween = (a: number, b: number): number => {
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) return 0;
    if (!ensure(Math.floor(a / DAY)) || !ensure(Math.floor(b / DAY))) return 0;
    return workAt(b) - workAt(a);
  };

  const addWork = (t: number, w: number): number => {
    if (w === 0 || !Number.isFinite(t) || !Number.isFinite(w)) return t;
    const tDay = Math.floor(t / DAY);
    if (!ensure(tDay)) return t;
    let abs = workAt(t) + w;
    if (w > 0) {
      // Grow forward until the window holds the target (offsets shift with the base).
      for (let guard = 0; (cum[len] as number) < abs && guard < 64; guard++) {
        const end = base + len;
        if (!ensure(end + Math.max(64, len) - 1) || base + len === end) break;
        abs = workAt(t) + w;
      }
      if ((cum[len] as number) < abs) return (base + len) * DAY;
      // Smallest i with cum[i + 1] >= abs.
      let lo = tDay - base;
      let hi = len - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if ((cum[mid + 1] as number) >= abs) hi = mid;
        else lo = mid + 1;
      }
      const r = days[lo] as number[];
      let rem = abs - (cum[lo] as number);
      for (let k = 0; k < r.length; k += 2) {
        const s = r[k] as number;
        const span = (r[k + 1] as number) - s;
        if (rem <= span) return s + rem;
        rem -= span;
      }
      return r.length ? (r[r.length - 1] as number) : (base + lo + 1) * DAY;
    }
    for (let guard = 0; (cum[0] as number) > abs && guard < 64; guard++) {
      const start = base;
      if (!ensure(base - Math.max(64, len)) || base === start) break;
      abs = workAt(t) + w;
    }
    if ((cum[0] as number) > abs) return base * DAY;
    // Largest i <= tDay with cum[i] <= abs.
    let lo = 0;
    let hi = tDay - base;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if ((cum[mid] as number) <= abs) lo = mid;
      else hi = mid - 1;
    }
    const r = days[lo] as number[];
    let rem = abs - (cum[lo] as number);
    for (let k = 0; k < r.length; k += 2) {
      const s = r[k] as number;
      const span = (r[k + 1] as number) - s;
      if (rem < span) return s + rem;
      rem -= span;
    }
    return r.length ? (r[r.length - 1] as number) : (base + lo) * DAY;
  };

  const unitMs = (unit: CalendarUnit): number => {
    switch (unit) {
      case 'minute':
        return MINUTE;
      case 'hour':
        return HOUR;
      case 'day':
        return hoursPerDay * HOUR;
      case 'week':
        return hoursPerDay * HOUR * daysPerWeek;
      default:
        return hoursPerDay * HOUR * daysPerMonth;
    }
  };

  return {
    hoursPerDay,
    daysPerWeek,
    daysPerMonth,
    isWorkingDay: (day) => rangesOf(day).length > 0,
    rangesOf,
    isWorking,
    nextWorkingStart,
    prevWorkingEnd,
    addWork,
    workBetween,
    unitMs,
    toWorkMs: (value, unit) => value * unitMs(unit),
    fromWorkMs: (ms, unit) => ms / unitMs(unit),
  };
}
