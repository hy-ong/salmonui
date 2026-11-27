// IANA time zones: offsets come from
// `Intl.DateTimeFormat#formatToParts` through one cached formatter per zone;
// wall time to instant resolves DST gaps and overlaps like Temporal's
// `disambiguation: 'compatible'` (later offset in a gap, earlier in an
// overlap). No tables, no dependencies.

/** Wall-clock fields of an instant in a zone. */
export interface WallFields {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly millisecond: number;
}

// A pure memo of `Intl` objects per zone (not render state).
const formatters = new Map<string, Intl.DateTimeFormat | null>();

function formatter(zone: string): Intl.DateTimeFormat | null {
  let f = formatters.get(zone);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat('en-US', { timeZone: zone, calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hourCycle: 'h23' });
    } catch {
      f = null;
    }
    if (formatters.size > 64) formatters.clear();
    formatters.set(zone, f);
  }
  return f;
}

/** True when `zone` is an IANA zone (or offset id) that `Intl` knows. */
export const isValidTimeZone = (zone: string): boolean => formatter(zone) !== null;

/** Wall fields of `epochMs` in `zone`; null for an unknown zone. */
export function wallAt(epochMs: number, zone: string): WallFields | null {
  const f = formatter(zone);
  if (!f) return null;
  // Years are AD (1-9999), the range of the date fields.
  const v: Record<string, number> = {};
  for (const p of f.formatToParts(epochMs)) v[p.type] = Number(p.value);
  return { year: v['year'] as number, month: v['month'] as number, day: v['day'] as number, hour: (v['hour'] as number) % 24, minute: v['minute'] as number, second: v['second'] as number, millisecond: ((epochMs % 1000) + 1000) % 1000 };
}

function wallMs(w: WallFields): number {
  const d = new Date(0);
  d.setUTCFullYear(w.year, w.month - 1, w.day);
  return d.setUTCHours(w.hour, w.minute, w.second, w.millisecond);
}

/** Offset of `zone` from UTC at an instant, in minutes (`+60` for Europe/Berlin in winter); null for an unknown zone. */
export function offsetAt(epochMs: number, zone: string): number | null {
  const w = wallAt(epochMs, zone);
  return w ? Math.round((wallMs(w) - epochMs) / 60_000) : null;
}

/**
 * The instant of wall time `wall` in `zone` (Temporal `'compatible'`): a
 * wall time that does not exist (spring-forward gap) moves forward by the
 * gap; an ambiguous one (fall-back overlap) takes the earlier instant.
 * Null for an unknown zone.
 */
export function toEpoch(wall: WallFields, zone: string): number | null {
  const local = wallMs(wall);
  const before = offsetAt(local - 86_400_000, zone);
  const after = offsetAt(local + 86_400_000, zone);
  if (before === null || after === null) return null;
  const candidates: number[] = [];
  for (const off of before === after ? [before] : [before, after]) {
    const t = local - off * 60_000;
    if (offsetAt(t, zone) === off) candidates.push(t);
  }
  // Overlap: both offsets match; earlier instant first.
  if (candidates.length) return Math.min(...candidates);
  // Gap: interpret with the offset before the transition (moves the wall time forward).
  return local - before * 60_000;
}
