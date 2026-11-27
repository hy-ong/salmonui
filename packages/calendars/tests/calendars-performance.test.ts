import { describe, it } from 'node:test';
import { createElement as h, type ReactElement } from 'react';
import { renderToString } from 'react-dom/server';
import { Calendar, RangeCalendar } from '@salmonui/calendars/calendar';
import { assertBudget } from '../../../tooling/bench/budget.mjs';

// Server render cost of the inline calendars (budget: server render
// <= 1 ms per calendar on `ref-node`). Median of many `renderToString` calls
// after a warm-up, so formatter caches and JIT are settled as on a running
// server.

function medianMs(el: () => ReactElement, runs = 200): number {
  for (let i = 0; i < 50; i++) renderToString(el());
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    renderToString(el());
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return times[Math.floor(times.length / 2)] as number;
}

describe('calendar server render cost', () => {
  it('a Calendar month renders on the server in <= 1 ms; a two-month RangeCalendar in <= 2 ms', () => {
    const cases: [string, () => ReactElement, number][] = [
      ['Calendar month', () => h(Calendar, { defaultValue: '2026-11-23' }), 1],
      ['Calendar month, week numbers, outside days, de-DE', () => h(Calendar, { defaultValue: '2026-11-23', showWeekNumbers: true, showOutsideDays: true, locale: 'de-DE' }), 1],
      ['Calendar islamic-umalqura', () => h(Calendar, { defaultValue: '2026-11-23', calendar: 'islamic-umalqura', locale: 'ar-SA' }), 1],
      ['Calendar year view', () => h(Calendar, { defaultValue: '2026-11-23', defaultView: 'year' }), 1],
      ['RangeCalendar two months', () => h(RangeCalendar, { defaultValue: { start: '2026-11-10', end: '2026-12-04' }, visibleMonths: 2 }), 2],
    ];
    const report: Record<string, number> = {};
    for (const [name, el, budget] of cases) {
      const ms = medianMs(el);
      report[name] = Number(ms.toFixed(3));
      assertBudget(ms, budget, `calendar renderToString ${name} median`);
    }
    console.log(`[perf] calendar renderToString median ms ${JSON.stringify(report)}`);
  });
});
