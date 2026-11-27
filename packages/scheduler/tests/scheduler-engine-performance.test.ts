import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertBudget } from '../../../tooling/bench/budget.mjs';
import { normalizeEvent, resolveFields } from '../dist/internal/scheduler/fields.js';
import { layoutDays, layoutMonth } from '../dist/internal/scheduler/layout.js';
import { occurrencesIn } from '../dist/internal/scheduler/occurrences.js';
import { createZoneConverter, DAY_MS } from '../dist/internal/scheduler/time.js';
import { monthWeeks, visibleDays } from '../dist/internal/scheduler/views.js';
import { bucketByNode, buildGroupModel, visibleNodes } from '../dist/internal/scheduler/resources.js';
import { layoutTimelineRow } from '../dist/internal/scheduler/timeline.js';
import { dayColumns } from '../../core/dist/internal/timeline/axis.js';
import { offsetWindow, prefixOffsets } from '../dist/internal/timeline/virtual.js';

// Scheduler engine timing (to
// calibrate): normalization, occurrence expansion and layout of a Month page
// with 5,000 events and a Week page with 1,000 events plus 200 recurring
// series, in one zone with DST. The browser budgets (render to painted) are
// gated in tests/browser/scheduler-perf.spec.ts; this file keeps the engine
// share well inside them.

const zone = createZoneConverter('America/New_York');
const zones = new Map<string, ReturnType<typeof createZoneConverter>>();
const ctx = { fields: resolveFields(undefined), zone, zoneFor: (n: string) => zones.get(n) ?? (zones.set(n, createZoneConverter(n)), zones.get(n)!), resources: [] };
const view = { type: 'month' as const, interval: 1, agendaDayCount: 7, firstDayOfWeek: 0, workDays: [1, 2, 3, 4, 5], showWeekend: true, monthCount: 12, firstMonthOfYear: 1 };
const anchor = Math.floor(Date.UTC(2026, 10, 15) / DAY_MS);

function rows(count: number, days: number, recurring: number): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < count; i++) {
    const d = Math.floor(rnd() * days);
    const h = 6 + Math.floor(rnd() * 12);
    const dur = 15 * (1 + Math.floor(rnd() * 8));
    const s = Date.UTC(2026, 10, 1 + d, h + 5, Math.floor(rnd() * 4) * 15);
    out.push({ id: i + 1, title: `Event ${i}`, start: new Date(s), end: new Date(s + dur * 60_000), allDay: rnd() < 0.05 });
  }
  for (let i = 0; i < recurring; i++) out.push({ id: count + i + 1, title: `Series ${i}`, start: new Date(Date.UTC(2026, 0, 5 + (i % 7), 14 + (i % 6))), end: new Date(Date.UTC(2026, 0, 5 + (i % 7), 15 + (i % 6))), recurrenceRule: i % 2 ? 'FREQ=WEEKLY;BYDAY=MO,WE,FR' : 'FREQ=DAILY;INTERVAL=2' });
  return out;
}

const time = (fn: () => void, runs = 5): number => {
  fn();
  const samples: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)] as number;
};

describe('Scheduler engine timing', () => {
  it('Month page, 5,000 events: normalize, expand and stack well under the 150 ms render budget', () => {
    const data = rows(5000, 30, 0);
    const weeks = monthWeeks(view, anchor);
    const range = { start: zone.dayStart(weeks[0]![0]!), end: zone.dayStart(weeks[weeks.length - 1]![6]! + 1) };
    let lanes = 0;
    const ms = time(() => {
      const recs = data.map((r) => normalizeEvent(r, ctx)!);
      const occ = occurrencesIn(recs, range, { zone, zoneFor: ctx.zoneFor });
      lanes = layoutMonth(occ, weeks, zone, 3).rows.length;
    });
    assert.equal(lanes, weeks.length);
    console.log(`month 5,000 events engine: ${ms.toFixed(1)} ms`);
    assertBudget(ms, 75, 'month 5,000 events engine', { strict: true });
  });

  it('Week page, 1,000 events and 200 recurring series: well under the 100 ms render budget', () => {
    const data = rows(1000, 7, 200);
    const days = visibleDays({ ...view, type: 'week' }, Math.floor(Date.UTC(2026, 10, 3) / DAY_MS));
    const range = { start: zone.dayStart(days[0]!), end: zone.dayStart(days[6]! + 1) };
    let parts = 0;
    const ms = time(() => {
      const recs = data.map((r) => normalizeEvent(r, ctx)!);
      const occ = occurrencesIn(recs, range, { zone, zoneFor: ctx.zoneFor });
      parts = layoutDays(occ, { zone, days, startMinute: 0, endMinute: 1440 }).timed.reduce((n, c) => n + c.length, 0);
    });
    assert.ok(parts > 1000);
    console.log(`week 1,000 events + 200 series engine: ${ms.toFixed(1)} ms`);
    assertBudget(ms, 50, 'week 1,000 events + 200 series engine', { strict: true });
  });

  it('Timeline Month, 1,000 resources and 10,000 events: group, lay out every row and window a scroll frame', () => {
    const people = { field: 'p', name: 'people', data: Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, text: `P${i + 1}` })) };
    const data = rows(10_000, 30, 0).map((r, i) => ({ ...r, p: (i % 1000) + 1 }));
    const rctx = { ...ctx, resources: [{ field: 'p', multiple: false }] };
    const days = visibleDays({ ...view, type: 'timelineMonth' }, anchor);
    const columns = dayColumns(days);
    const range = { start: zone.dayStart(days[0]!), end: zone.dayStart(days[days.length - 1]! + 1) };
    let shown = 0;
    let heights: number[] = [];
    // The page: records, occurrences, the group model, buckets and every row's lanes (autoRowHeight needs them all).
    const ms = time(() => {
      const recs = data.map((r) => normalizeEvent(r, rctx)!);
      const occ = occurrencesIn(recs, range, { zone, zoneFor: ctx.zoneFor });
      const model = buildGroupModel([people], { resources: ['people'] }, null, { days: [1, 2, 3, 4, 5], start: 540, end: 1080 });
      const nodes = visibleNodes(model);
      const buckets = bucketByNode(occ, model.leaves);
      const layouts = nodes.map((_, i) => layoutTimelineRow(buckets[i]!, columns, zone, null));
      heights = layouts.map((l) => 24 + Math.max(1, l.lanes) * 26);
      shown = layouts.reduce((n, l) => n + l.parts.length, 0);
    });
    assert.ok(shown >= 9_000, String(shown));
    // A scroll frame: the rendered window from the row offsets (the rows themselves are memoized).
    const offsets = prefixOffsets(heights);
    const steps = Math.ceil(100_000 / 997);
    const frame = time(() => {
      for (let y = 0; y < 100_000; y += 997) offsetWindow(offsets, y, 600, 4);
    }, 9) / steps;
    console.log(`timeline month 1,000 resources, 10,000 events engine: ${ms.toFixed(1)} ms; window per scroll frame: ${(frame * 1000).toFixed(2)} us`);
    assertBudget(ms, 150, 'timeline month 1,000 resources, 10,000 events engine', { strict: true });
    assertBudget(frame, 1, 'timeline month window per scroll frame', { strict: true });
  });
});
