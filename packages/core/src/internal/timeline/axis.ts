// Timeline time axis: the columns of a horizontal
// time axis (time slots of visible hours per day, or whole days), the
// fractional position of a time on that axis (gaps such as hidden hours or
// weekends snap to the next column), and the header tiers (year, month,
// week, date, hour) that merge consecutive columns of one unit. Times are
// wall-clock milliseconds (floating: a UTC epoch of the wall time), so the
// axis never needs a zone. Shared by the Scheduler timeline views and the
// Gantt chart. Pure: no React, no DOM globals, zero dependencies.

export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

/** One axis column: [start, end) in wall ms. */
export interface AxisColumn {
  readonly start: number;
  readonly end: number;
}

/** Time-slot columns: per visible day, slots of `slotMinutes` from `startMinute` to `endMinute`. */
export function slotColumns(days: readonly number[], startMinute: number, endMinute: number, slotMinutes: number): AxisColumn[] {
  const out: AxisColumn[] = [];
  const step = Math.max(1, slotMinutes);
  for (const d of days) for (let m = startMinute; m < endMinute; m += step) out.push({ start: d * DAY + m * MINUTE, end: d * DAY + Math.min(m + step, endMinute) * MINUTE });
  return out;
}

/** One column per day number. */
export const dayColumns = (days: readonly number[]): AxisColumn[] => days.map((d) => ({ start: d * DAY, end: (d + 1) * DAY }));

/** Index of the last column whose start is <= `wall` (-1 before the first). */
function columnAt(columns: readonly AxisColumn[], wall: number): number {
  let lo = 0;
  let hi = columns.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if ((columns[mid] as AxisColumn).start <= wall) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/**
 * Position of a wall time in column units: the column index plus the fraction
 * inside it. Before the first column 0, after the last `columns.length`; a
 * time in a gap between columns takes the start of the next one.
 */
export function positionOf(columns: readonly AxisColumn[], wall: number): number {
  const i = columnAt(columns, wall);
  if (i < 0) return 0;
  const c = columns[i] as AxisColumn;
  if (wall >= c.end) return i + 1;
  return i + (wall - c.start) / (c.end - c.start);
}

export type TimeUnit = 'year' | 'month' | 'week' | 'date' | 'hour';

/** The key of a wall time in a unit (equal keys share a header cell). */
export function unitKey(unit: TimeUnit, wall: number, firstDayOfWeek = 0): number {
  if (unit === 'hour') return Math.floor(wall / HOUR);
  const day = Math.floor(wall / DAY);
  if (unit === 'date') return day;
  // Day 0 (1970-01-01) is a Thursday (weekday 4).
  if (unit === 'week') return day - ((((day + 4 - firstDayOfWeek) % 7) + 7) % 7);
  const d = new Date(day * DAY);
  return unit === 'year' ? d.getUTCFullYear() : d.getUTCFullYear() * 12 + d.getUTCMonth();
}

/** A header cell: `span` consecutive columns from `first` that share `key`; `start` is the wall time of the first column. */
export interface TierCell {
  readonly key: number;
  readonly first: number;
  readonly span: number;
  readonly start: number;
}

export interface Tier {
  readonly unit: TimeUnit;
  readonly cells: readonly TierCell[];
}

/** Header tiers (`headerRows`): one row per unit, top to bottom as given. */
export function tiersOf(columns: readonly AxisColumn[], units: readonly TimeUnit[], firstDayOfWeek = 0): Tier[] {
  return units.map((unit) => {
    const cells: TierCell[] = [];
    columns.forEach((c, i) => {
      const key = unitKey(unit, c.start, firstDayOfWeek);
      const last = cells[cells.length - 1];
      if (last && last.key === key) cells[cells.length - 1] = { ...last, span: last.span + 1 };
      else cells.push({ key, first: i, span: 1, start: c.start });
    });
    return { unit, cells };
  });
}
