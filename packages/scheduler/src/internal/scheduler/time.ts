// Wall time <-> instant conversion for the Scheduler engine: events are instants (epoch ms), views lay them out in the
// wall time of one IANA zone. Offsets come from the `#dates` zone module and
// are cached per UTC hour per zone inside a converter object (owned by one
// Scheduler store, never module state), so laying out thousands of events
// needs one `formatToParts` per distinct hour instead of one per event.

import { offsetAt, toEpoch } from '@salmonui/core/internal/dates/index';

export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;

/** A converter between instants and wall time in one zone (`'UTC'` for floating values). */
export interface ZoneConverter {
  readonly zone: string;
  /** Offset in ms at an instant. */
  offset(epochMs: number): number;
  /** Wall-clock ms (`Date.UTC`-style number) of an instant. */
  wall(epochMs: number): number;
  /** Instant of a wall-clock ms; DST gaps move forward, overlaps take the earlier instant. */
  instant(wallMs: number): number;
  /** Day number (days since 1970-01-01) of an instant's wall date. */
  day(epochMs: number): number;
  /** Instant of a day number's midnight. */
  dayStart(day: number): number;
}

export function createZoneConverter(zone: string): ZoneConverter {
  const cache = new Map<number, number>();
  const utc = zone === 'UTC' || zone === 'Etc/UTC';
  const offset = (t: number): number => {
    if (utc) return 0;
    const h = Math.floor(t / 3_600_000);
    let o = cache.get(h);
    if (o === undefined) {
      o = (offsetAt(h * 3_600_000, zone) ?? 0) * MINUTE_MS;
      if (cache.size > 50_000) cache.clear();
      cache.set(h, o);
    }
    return o;
  };
  const instantCache = new Map<number, number>();
  const instant = (w: number): number => {
    if (utc) return w;
    // Fast path: the offset an hour before and after agree (no transition near).
    const a = offset(w - offset(w));
    const guess = w - a;
    if (offset(guess) === a && offset(guess - 3_600_000) === a && offset(guess + 3_600_000) === a) return guess;
    const key = Math.floor(w / MINUTE_MS);
    let t = instantCache.get(key);
    if (t === undefined) {
      const d = new Date(w);
      t = toEpoch({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes(), second: d.getUTCSeconds(), millisecond: d.getUTCMilliseconds() }, zone) ?? guess;
      if (instantCache.size > 10_000) instantCache.clear();
      instantCache.set(key, t);
    }
    return t;
  };
  const wall = (t: number): number => t + offset(t);
  return {
    zone,
    offset,
    wall,
    instant,
    day: (t) => Math.floor(wall(t) / DAY_MS),
    dayStart: (d) => instant(d * DAY_MS),
  };
}

/** Weekday (0 Sunday) of a day number. */
export const weekdayOfDay = (n: number): number => (((n + 4) % 7) + 7) % 7;

/** Parses `'HH:mm'` (or a `{ hour, minute }` object) to minutes after midnight; `fallback` when invalid. */
export function minutesOf(input: string | { readonly hour: number; readonly minute: number } | undefined | null, fallback: number): number {
  if (input == null) return fallback;
  if (typeof input === 'object') return input.hour * 60 + input.minute;
  const m = /^(\d{1,2}):(\d{2})$/.exec(input.trim());
  if (!m) return fallback;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v >= 0 && v <= 1440 ? v : fallback;
}
