// Periods: the range a period button selects, ending at the
// data end. Pure; calendar arithmetic in the given time zone (`#viz`).

import { fromWallTime, offsetTime, wallTime } from '#viz';

export type PeriodUnit = 'millisecond' | 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year' | 'ytd' | 'all';

export interface Period {
  readonly id: string;
  readonly unit: PeriodUnit;
  /** Number of units (ignored by `ytd` and `all`). Default 1. */
  readonly count?: number | undefined;
  readonly label: string;
}

/**
 * The [start, end] a period selects for data ending at `end` and starting at
 * `min` (epoch ms or numbers). `ytd` starts on January 1 of the end's year in
 * `timeZone`; the result never starts before `min`.
 */
export function periodRange(period: Period, end: number, min: number, timeZone?: string): [number, number] {
  if (period.unit === 'all') return [min, end];
  let start: number;
  if (period.unit === 'ytd') {
    const w = wallTime(end, timeZone);
    start = fromWallTime({ year: w.year, month: 1, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }, timeZone);
  } else {
    start = offsetTime(end, { unit: period.unit, step: period.count ?? 1 }, -1, timeZone);
  }
  return [Math.max(min, start), end];
}

/** The period whose range equals `range` (within 1 ms), or null. */
export function matchPeriod(periods: readonly Period[], range: readonly [number, number], end: number, min: number, timeZone?: string): string | null {
  for (const p of periods) {
    const r = periodRange(p, end, min, timeZone);
    if (Math.abs(r[0] - range[0]) <= 1 && Math.abs(r[1] - range[1]) <= 1) return p.id;
  }
  return null;
}
