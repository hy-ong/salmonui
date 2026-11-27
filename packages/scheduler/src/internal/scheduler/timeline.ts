// Timeline row layout: the
// occurrences of one row (a resource, or a month of Timeline Year) placed
// on the `internal/timeline` axis in column units and stacked in lanes;
// lanes past `maxLanes` are hidden and counted per column for "+N more"
// (`null` lanes: `autoRowHeight`). Pure.

import { positionOf, type AxisColumn } from '@salmonui/core/internal/timeline/axis';
import { stackLanes, type EventOrder } from './layout.js';
import type { ZoneConverter } from './time.js';
import type { Occurrence } from './types.js';

export interface TimelinePart<Row = unknown> {
  readonly occurrence: Occurrence<Row>;
  /** Column the part starts in, the start fraction inside it and the length in columns. */
  readonly column: number;
  readonly offset: number;
  readonly span: number;
  readonly lane: number;
  readonly continuesBefore: boolean;
  readonly continuesAfter: boolean;
  readonly hidden: boolean;
}

export interface TimelineRow<Row = unknown> {
  readonly parts: readonly TimelinePart<Row>[];
  /** Lanes shown (all lanes with `maxLanes` null). */
  readonly lanes: number;
  /** Hidden parts per column, or null when nothing is hidden. */
  readonly more: readonly number[] | null;
}

/** Minimum length of an event in columns (a zero-length event stays visible). */
const MIN_SPAN = 0.25;

export function layoutTimelineRow<Row>(occs: readonly Occurrence<Row>[], columns: readonly AxisColumn[], zone: ZoneConverter, maxLanes: number | null, order?: EventOrder<Row>): TimelineRow<Row> {
  const n = columns.length;
  const first = columns[0];
  const last = columns[n - 1];
  if (!first || !last) return { parts: [], lanes: 0, more: null };
  const items: { o: Occurrence<Row>; s: number; e: number; cb: boolean; ca: boolean }[] = [];
  for (const o of occs) {
    const ws = zone.wall(o.start);
    const we = zone.wall(o.end);
    if (we < first.start || ws >= last.end || (we === first.start && ws < we)) continue;
    const s = positionOf(columns, ws);
    let e = positionOf(columns, we);
    // An event inside a gap (hidden hours) has no length on the axis.
    if (e <= s && ws < we) continue;
    if (e < s + MIN_SPAN) e = Math.min(n, s + MIN_SPAN);
    if (s >= n) continue;
    items.push({ o, s, e, cb: ws < first.start, ca: we > last.end });
  }
  items.sort((a, b) => a.s - b.s || b.e - b.s - (a.e - a.s) || (order ? order(a.o, b.o) : a.o.key < b.o.key ? -1 : a.o.key > b.o.key ? 1 : 0));
  const lanes = stackLanes(
    items.map((i) => i.s),
    items.map((i) => i.e),
  );
  let more: number[] | null = null;
  let shown = 0;
  const parts = items.map((it, i) => {
    const lane = lanes[i] as number;
    const hidden = maxLanes !== null && lane >= maxLanes;
    const column = Math.min(n - 1, Math.floor(it.s));
    if (hidden) {
      more ??= new Array<number>(n).fill(0);
      for (let c = column; c < Math.min(n, Math.ceil(it.e)); c++) more[c] = (more[c] as number) + 1;
    } else shown = Math.max(shown, lane + 1);
    return { occurrence: it.o, column, offset: it.s - column, span: it.e - it.s, lane, continuesBefore: it.cb, continuesAfter: it.ca, hidden };
  });
  return { parts, lanes: shown, more };
}
