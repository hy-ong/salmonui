// Time zone helpers:
// pure functions over the zone module. An instant is a `Date`, epoch
// milliseconds or an ISO string with an offset; a wall time is a plain
// date-time (or its ISO string without an offset).

import { plainDateTime, toDate, toPlainDateTime, type DateTimeInput, type PlainDateTime } from './plain.js';
import { offsetAt, wallAt } from './zone.js';

/** An instant: a `Date`, epoch milliseconds, or an ISO 8601 string with `Z` or an offset. */
export type InstantInput = Date | number | string;

function epochOf(instant: InstantInput): number {
  if (typeof instant === 'number') return instant;
  if (instant instanceof Date) return instant.getTime();
  return typeof instant === 'string' ? Date.parse(instant) : NaN;
}

/** Offset of `zone` from UTC at `instant` in minutes (`60` for Europe/Berlin in winter, `-300` for New York); null for an unknown zone or invalid instant. */
export function getTimeZoneOffset(instant: InstantInput, zone: string): number | null {
  const t = epochOf(instant);
  return Number.isFinite(t) ? offsetAt(t, zone) : null;
}

/** Wall time of `instant` in `zone` as a `PlainDateTime`; null for an unknown zone or invalid instant. */
export function toZonedDateTime(instant: InstantInput, zone: string): PlainDateTime | null {
  const t = epochOf(instant);
  if (!Number.isFinite(t)) return null;
  const w = wallAt(t, zone);
  return w ? plainDateTime(w, w) : null;
}

/** The instant (`Date`) of wall time `wallTime` in `zone`; DST gaps move forward and overlaps take the earlier instant (Temporal `'compatible'`). An invalid input gives an invalid `Date`. */
export function fromZonedDateTime(wallTime: DateTimeInput, zone: string): Date {
  const w = wallTime instanceof Date ? null : toPlainDateTime(wallTime, zone);
  return w ? toDate(w, zone) : new Date(NaN);
}
