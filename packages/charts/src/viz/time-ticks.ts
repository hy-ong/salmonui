// Calendar-aware time ticks:
// ticks fall on wall-clock boundaries (midnight, the first of a month, ...)
// of a time zone resolved through `Intl`, so a daily axis in
// `America/New_York` ticks at local midnight across DST changes. Without a
// zone the axis is UTC (server and first client render agree; SSR rule).

export type TimeUnit = 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

export interface TimeInterval {
  readonly unit: TimeUnit;
  readonly step: number;
}

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Nominal duration of one unit in ms (months and years averaged). */
export const UNIT_MS: Readonly<Record<TimeUnit, number>> = {
  millisecond: 1,
  second: SEC,
  minute: MIN,
  hour: HOUR,
  day: DAY,
  week: 7 * DAY,
  month: 30.436875 * DAY,
  year: 365.2425 * DAY,
};

// Pure, so bundles that import this module without `timeInterval` drop the table.
const CANDIDATES: readonly TimeInterval[] = /* @__PURE__ */ ((): TimeInterval[] => [
  ...[1, 2, 5, 10, 20, 50, 100, 200, 500].map((step) => ({ unit: 'millisecond' as const, step })),
  ...[1, 2, 5, 10, 15, 30].map((step) => ({ unit: 'second' as const, step })),
  ...[1, 2, 5, 10, 15, 30].map((step) => ({ unit: 'minute' as const, step })),
  ...[1, 2, 3, 6, 12].map((step) => ({ unit: 'hour' as const, step })),
  ...[1, 2].map((step) => ({ unit: 'day' as const, step })),
  { unit: 'week', step: 1 },
  ...[1, 2, 3, 6].map((step) => ({ unit: 'month' as const, step })),
])();

/** The calendar interval that gives about `count` ticks over [start, end] ms. */
export function timeInterval(start: number, end: number, count = 6): TimeInterval {
  const target = Math.abs(end - start) / Math.max(1, count);
  for (const c of CANDIDATES) if (UNIT_MS[c.unit] * c.step >= target) return c;
  const years = target / UNIT_MS.year;
  const power = 10 ** Math.floor(Math.log10(Math.max(years, 1)));
  const e = years / power;
  const step = (e <= 1 ? 1 : e <= 2 ? 2 : e <= 5 ? 5 : 10) * power;
  return { unit: 'year', step };
}

// --- zone math -------------------------------------------------------------

export interface WallTime {
  readonly year: number;
  readonly month: number; // 1..12
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
}

// Pure memo: one formatter per zone, never render state.
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(zone: string): Intl.DateTimeFormat {
  let f = formatters.get(zone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    });
    if (formatters.size > 32) formatters.clear();
    formatters.set(zone, f);
  }
  return f;
}

const isUtc = (zone: string | undefined): boolean => !zone || zone === 'UTC' || zone === 'Etc/UTC' || zone === 'GMT';

/** Wall-clock fields of `epoch` in `zone` (UTC when omitted). */
export function wallTime(epoch: number, zone?: string): WallTime {
  if (isUtc(zone)) {
    const d = new Date(epoch);
    return {
      year: d.getUTCFullYear(),
      month: d.getUTCMonth() + 1,
      day: d.getUTCDate(),
      hour: d.getUTCHours(),
      minute: d.getUTCMinutes(),
      second: d.getUTCSeconds(),
      millisecond: d.getUTCMilliseconds(),
    };
  }
  const parts = formatterFor(zone as string).formatToParts(epoch);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
    millisecond: ((epoch % 1000) + 1000) % 1000,
  };
}

function utcOf(w: WallTime): number {
  const d = new Date(0);
  d.setUTCFullYear(w.year, w.month - 1, w.day);
  d.setUTCHours(w.hour, w.minute, w.second, w.millisecond);
  return d.getTime();
}

/** Zone offset (ms, wall minus UTC) at `epoch`. */
export function zoneOffset(epoch: number, zone?: string): number {
  if (isUtc(zone)) return 0;
  return utcOf(wallTime(epoch, zone)) - epoch;
}

/** Epoch of a wall-clock time in `zone`; a time inside a DST gap moves forward. */
export function fromWallTime(w: WallTime, zone?: string): number {
  const guess = utcOf(w);
  if (isUtc(zone)) return guess;
  let epoch = guess - zoneOffset(guess, zone);
  const second = guess - zoneOffset(epoch, zone);
  if (second !== epoch) epoch = Math.max(epoch, second);
  return epoch;
}

function floorWall(w: WallTime, interval: TimeInterval): WallTime {
  const { unit, step } = interval;
  const fl = (v: number, base = 0) => Math.floor((v - base) / step) * step + base;
  switch (unit) {
    case 'millisecond':
      return { ...w, millisecond: fl(w.millisecond) };
    case 'second':
      return { ...w, second: fl(w.second), millisecond: 0 };
    case 'minute':
      return { ...w, minute: fl(w.minute), second: 0, millisecond: 0 };
    case 'hour':
      return { ...w, hour: fl(w.hour), minute: 0, second: 0, millisecond: 0 };
    case 'day':
      return { ...w, day: fl(w.day, 1), hour: 0, minute: 0, second: 0, millisecond: 0 };
    case 'week': {
      // ISO weeks start on Monday.
      const dow = (new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay() + 6) % 7;
      const d = new Date(Date.UTC(w.year, w.month - 1, w.day - dow));
      return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: 0, minute: 0, second: 0, millisecond: 0 };
    }
    case 'month':
      return { ...w, month: fl(w.month, 1), day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 };
    case 'year':
      return { year: fl(w.year), month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 };
  }
}

function addWall(w: WallTime, interval: TimeInterval, times: number): WallTime {
  const n = interval.step * times;
  // Normalization through Date.UTC handles overflow (month 13, day 32, hour 25).
  const base = { ...w };
  switch (interval.unit) {
    case 'millisecond':
      base.millisecond = w.millisecond + n;
      break;
    case 'second':
      base.second = w.second + n;
      break;
    case 'minute':
      base.minute = w.minute + n;
      break;
    case 'hour':
      base.hour = w.hour + n;
      break;
    case 'day':
      base.day = w.day + n;
      break;
    case 'week':
      base.day = w.day + 7 * n;
      break;
    case 'month':
    case 'year': {
      // Calendar months clamp the day (Mar 31 minus one month is Feb 29), as financial periods expect.
      const total = w.year * 12 + (w.month - 1) + (interval.unit === 'month' ? n : n * 12);
      base.year = Math.floor(total / 12);
      base.month = total - base.year * 12 + 1;
      const last = new Date(Date.UTC(base.year, base.month, 0)).getUTCDate();
      base.day = Math.min(w.day, last);
      break;
    }
  }
  const d = new Date(0);
  d.setUTCFullYear(base.year, base.month - 1, base.day);
  d.setUTCHours(base.hour, base.minute, base.second, base.millisecond);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    millisecond: d.getUTCMilliseconds(),
  };
}

/** Floors `epoch` to the interval boundary in `zone`. */
export function floorTime(epoch: number, interval: TimeInterval, zone?: string): number {
  return fromWallTime(floorWall(wallTime(epoch, zone), interval), zone);
}

/** Adds `times` intervals in wall-clock terms. */
export function offsetTime(epoch: number, interval: TimeInterval, times: number, zone?: string): number {
  return fromWallTime(addWall(wallTime(epoch, zone), interval, times), zone);
}

export interface TimeTicks {
  readonly values: number[];
  readonly interval: TimeInterval;
}

/**
 * Ticks on calendar boundaries inside [start, end]. Sub-hour steps on a
 * day-or-larger boundary skip the zone math (fixed durations).
 */
export function timeTicks(start: number, end: number, options: { count?: number; interval?: TimeInterval; timeZone?: string } = {}): TimeTicks {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  const interval = options.interval ?? timeInterval(lo, hi, options.count ?? 6);
  const values: number[] = [];
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return { values, interval };
  const zone = options.timeZone;
  const fixed = UNIT_MS[interval.unit] <= HOUR;
  if (fixed && (isUtc(zone) || interval.unit !== 'hour')) {
    const size = UNIT_MS[interval.unit] * interval.step;
    // Align fixed steps to the zone's wall clock (a 15-minute grid in +05:45 still lands on :00).
    const off = isUtc(zone) ? 0 : zoneOffset(lo, zone);
    let t = Math.ceil((lo + off) / size) * size - off;
    for (let i = 0; t <= hi && i < 10_000; i++, t += size) values.push(t);
    return { values, interval };
  }
  let t = floorTime(lo, interval, zone);
  let w = floorWall(wallTime(lo, zone), interval);
  for (let i = 0; i < 10_000 && t <= hi; i++) {
    if (t >= lo) values.push(t);
    w = addWall(w, interval, 1);
    t = fromWallTime(w, zone);
  }
  return { values, interval };
}

/** The `Intl.DateTimeFormatOptions` that label a tick of `unit` without noise. */
export function timeLabelOptions(unit: TimeUnit): Intl.DateTimeFormatOptions {
  switch (unit) {
    case 'millisecond':
      return { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23' };
    case 'second':
      return { hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' };
    case 'minute':
    case 'hour':
      return { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' };
    case 'day':
    case 'week':
      return { month: 'short', day: 'numeric' };
    case 'month':
      return { year: 'numeric', month: 'short' };
    case 'year':
      return { year: 'numeric' };
  }
}
