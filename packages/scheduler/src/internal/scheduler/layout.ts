// Event layout: column packing of
// overlapping timed events per day column (day, week and work week views),
// and lane stacking of spanning segments (all-day row, month weeks, and the
// timeline rows later), with continuation flags and "+N more" counts. Pure
// and linear-ish: one sort per column or row, then a sweep.

import { DAY_MS, MINUTE_MS, type ZoneConverter } from './time.js';
import type { Occurrence } from './types.js';

export type EventOrder<Row> = (a: Occurrence<Row>, b: Occurrence<Row>) => number;

export interface TimedPart<Row = unknown> {
  readonly occurrence: Occurrence<Row>;
  /** Visible column index. */
  readonly column: number;
  /** Minutes after the visible start of the day (`startHour`), clipped. */
  readonly top: number;
  readonly bottom: number;
  /** Sub-column inside the overlap cluster, and the cluster's sub-column count. */
  readonly lane: number;
  readonly lanes: number;
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
}

export interface SpanPart<Row = unknown> {
  readonly occurrence: Occurrence<Row>;
  /** Row (week) index for month layouts, 0 for the all-day row. */
  readonly row: number;
  /** First visible column and the exclusive end column. */
  readonly startColumn: number;
  readonly endColumn: number;
  readonly lane: number;
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
  /** Hidden by `maxLanes` (counted in `more`). */
  readonly hidden: boolean;
}

export interface DayLayoutOptions<Row> {
  readonly zone: ZoneConverter;
  /** Visible day numbers, one per column. */
  readonly days: readonly number[];
  /** Visible minutes of a day: [startMinute, endMinute). */
  readonly startMinute: number;
  readonly endMinute: number;
  /** Events shorter than this render this tall (minutes; `minimumDuration`). */
  readonly minimumDuration?: number;
  /** Where timed events that cross midnight go (`spannedPlacement`). Default `'allDayRow'`. */
  readonly spannedPlacement?: 'allDayRow' | 'timeSlot';
  readonly order?: EventOrder<Row> | undefined;
  /** Lanes shown in the all-day row before "+N more" (null: all). */
  readonly allDayMaxLanes?: number | null;
}

export interface DayLayout<Row> {
  readonly timed: readonly TimedPart<Row>[][];
  readonly allDay: readonly SpanPart<Row>[];
  readonly allDayLanes: number;
  /** Hidden all-day parts per column. */
  readonly allDayMore: readonly number[];
}

const defaultOrder = <Row>(a: Occurrence<Row>, b: Occurrence<Row>): number => a.start - b.start || b.end - b.start - (a.end - a.start) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

/** Assigns lanes so that overlapping intervals never share one; `starts` / `ends` are in any common unit. Returns the lane of each item. */
export function stackLanes(starts: readonly number[], ends: readonly number[]): number[] {
  const laneEnd: number[] = [];
  const out: number[] = [];
  for (let i = 0; i < starts.length; i++) {
    let lane = 0;
    while (lane < laneEnd.length && (laneEnd[lane] as number) > (starts[i] as number)) lane++;
    laneEnd[lane] = Math.max(ends[i] as number, (starts[i] as number) + 1e-9);
    out.push(lane);
  }
  return out;
}

/** Column index of the first visible day >= `day` (or `days.length`). */
function columnAtOrAfter(days: readonly number[], day: number): number {
  let lo = 0;
  let hi = days.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((days[mid] as number) < day) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Lays out spanning occurrences over visible columns (one row). */
export function layoutSpans<Row>(occs: readonly Occurrence<Row>[], days: readonly number[], zone: ZoneConverter, row: number, maxLanes: number | null, order: EventOrder<Row> | undefined): { parts: SpanPart<Row>[]; lanes: number; more: number[] } {
  const items: { occ: Occurrence<Row>; s: number; e: number; cb: boolean; ca: boolean }[] = [];
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) return { parts: [], lanes: 0, more: [] };
  for (const o of occs) {
    const sd = zone.day(o.start);
    const ed = zone.day(Math.max(o.start, o.end - 1));
    if (ed < first || sd > last) continue;
    const s = columnAtOrAfter(days, sd);
    const e = columnAtOrAfter(days, ed + 1);
    if (e <= s) continue;
    items.push({ occ: o, s, e, cb: sd < first, ca: ed > last });
  }
  const ord = order ?? defaultOrder;
  items.sort((a, b) => a.s - b.s || b.e - b.s - (a.e - a.s) || ord(a.occ, b.occ));
  const lanes = stackLanes(
    items.map((i) => i.s),
    items.map((i) => i.e),
  );
  const more = new Array<number>(days.length).fill(0);
  let laneCount = 0;
  const parts: SpanPart<Row>[] = items.map((it, i) => {
    const lane = lanes[i] as number;
    const hidden = maxLanes !== null && lane >= maxLanes;
    if (hidden) for (let c = it.s; c < it.e; c++) more[c] = (more[c] as number) + 1;
    else laneCount = Math.max(laneCount, lane + 1);
    return { occurrence: it.occ, row, startColumn: it.s, endColumn: it.e, lane, continuesBefore: it.cb, continuesAfter: it.ca, hidden };
  });
  return { parts, lanes: maxLanes === null ? laneCount : Math.min(laneCount, maxLanes), more };
}

/** Day, week and work week layout: the all-day row and the packed time columns. */
export function layoutDays<Row>(occs: readonly Occurrence<Row>[], options: DayLayoutOptions<Row>): DayLayout<Row> {
  const { zone, days, startMinute, endMinute } = options;
  const minDur = options.minimumDuration ?? 0;
  const spanned = options.spannedPlacement ?? 'allDayRow';
  const spans: Occurrence<Row>[] = [];
  const perColumn: { occ: Occurrence<Row>; top: number; bottom: number; cb: boolean; ca: boolean }[][] = days.map(() => []);
  const firstDay = days[0] ?? 0;
  const lastDay = days[days.length - 1] ?? -1;
  for (const o of occs) {
    const ws = zone.wall(o.start);
    const we = zone.wall(o.end);
    const sd = Math.floor(ws / DAY_MS);
    const ed = Math.floor((Math.max(ws, we - 1)) / DAY_MS);
    if (o.allDay || (sd !== ed && spanned === 'allDayRow')) {
      spans.push(o);
      continue;
    }
    for (let d = Math.max(sd, firstDay); d <= Math.min(ed, lastDay); d++) {
      const c = columnAtOrAfter(days, d);
      if (days[c] !== d) continue;
      const dayStart = d * DAY_MS;
      let top = Math.max(0, (ws - dayStart) / MINUTE_MS) - startMinute;
      let bottom = Math.min(1440, (we - dayStart) / MINUTE_MS) - startMinute;
      const cb = d > sd || top < 0;
      const ca = d < ed || bottom > endMinute - startMinute;
      top = Math.max(0, top);
      bottom = Math.min(endMinute - startMinute, bottom);
      if (bottom < top + minDur) bottom = Math.min(endMinute - startMinute, top + minDur);
      if (bottom <= top && !(top === bottom && top < endMinute - startMinute)) continue;
      (perColumn[c] as typeof perColumn[number]).push({ occ: o, top, bottom: Math.max(bottom, top), cb, ca });
    }
  }
  const ord = options.order ?? defaultOrder;
  const timed = perColumn.map((items, column) => {
    items.sort((a, b) => a.top - b.top || b.bottom - b.top - (a.bottom - a.top) || ord(a.occ, b.occ));
    const out: TimedPart<Row>[] = [];
    // Overlap clusters: a cluster ends when the next item starts at or after every end so far.
    let i = 0;
    while (i < items.length) {
      let j = i;
      let clusterEnd = -Infinity;
      while (j < items.length && (j === i || (items[j] as (typeof items)[number]).top < clusterEnd)) {
        const it = items[j] as (typeof items)[number];
        clusterEnd = Math.max(clusterEnd, it.bottom, it.top + 1e-6);
        j++;
      }
      const cluster = items.slice(i, j);
      const lanes = stackLanes(
        cluster.map((c) => c.top),
        cluster.map((c) => Math.max(c.bottom, c.top + 1e-6)),
      );
      const count = Math.max(...lanes) + 1;
      cluster.forEach((c, k) => out.push({ occurrence: c.occ, column, top: c.top, bottom: c.bottom, lane: lanes[k] as number, lanes: count, continuesBefore: c.cb, continuesAfter: c.ca }));
      i = j;
    }
    return out;
  });
  const all = layoutSpans(spans, days, zone, 0, options.allDayMaxLanes ?? null, options.order);
  return { timed, allDay: all.parts, allDayLanes: all.lanes, allDayMore: all.more };
}

export interface MonthLayout<Row> {
  readonly rows: readonly { readonly parts: readonly SpanPart<Row>[]; readonly lanes: number; readonly more: readonly number[] }[];
}

/** Month layout: one stacked row per week; `maxLanes` lanes before "+N more" (null with `autoRowHeight`). */
export function layoutMonth<Row>(occs: readonly Occurrence<Row>[], weeks: readonly (readonly number[])[], zone: ZoneConverter, maxLanes: number | null, order?: EventOrder<Row>): MonthLayout<Row> {
  // Bucket occurrences per week first, so each week sorts only its own events.
  const buckets: Occurrence<Row>[][] = weeks.map(() => []);
  const weekStarts = weeks.map((w) => w[0] ?? Infinity);
  const weekEnds = weeks.map((w) => w[w.length - 1] ?? -Infinity);
  for (const o of occs) {
    const sd = zone.day(o.start);
    const ed = zone.day(Math.max(o.start, o.end - 1));
    for (let r = 0; r < weeks.length; r++) if (ed >= (weekStarts[r] as number) && sd <= (weekEnds[r] as number)) (buckets[r] as Occurrence<Row>[]).push(o);
  }
  return { rows: weeks.map((days, r) => layoutSpans(buckets[r] as Occurrence<Row>[], days, zone, r, maxLanes, order)) };
}
