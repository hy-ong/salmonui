// Scheduler render-to-paint scenarios (scheduler.html?set=perf;
// tests/browser/scheduler-perf.spec.ts).
// `window.__schedPerf(kind)` mounts one Scheduler (or unmounts with null) and
// `window.__schedPerfMs` is set once the frame after the commit is painted.
import { useLayoutEffect, useState } from 'react';
import { Scheduler } from '@salmonui/scheduler';
import '@salmonui/scheduler/styles.css';

type Row = Record<string, unknown>;
export type PerfKind = 'week' | 'month' | 'timeline';

declare global {
  interface Window {
    __schedPerf?: (kind: PerfKind | null) => void;
    __schedPerfMs?: number | null;
    __schedPerfT0?: number;
  }
}

const iso = (ms: number): string => new Date(ms).toISOString();
const DAY = 864e5;
const BASE = Date.UTC(2026, 10, 22);

/** `count` timed events spread over `days` days from Sunday 2026-11-22 (UTC), 30 to 120 minutes long, between 07:00 and 19:00. */
function events(count: number, days: number, resources = 0): Row[] {
  const out: Row[] = [];
  for (let i = 0; i < count; i++) {
    const day = i % days;
    const minute = 7 * 60 + ((i * 37) % (12 * 60));
    const start = BASE + day * DAY + minute * 6e4;
    out.push({ id: i + 1, title: `Event ${i + 1}`, start: iso(start), end: iso(start + (30 + ((i * 13) % 4) * 30) * 6e4), ...(resources ? { roomId: (i % resources) + 1 } : {}) });
  }
  return out;
}

const WEEK = events(1000, 7);
const MONTH = events(5000, 35);
const ROOMS = Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, text: `Room ${i + 1}` }));
const TIMELINE = events(10000, 30, 1000).map((r) => ({ ...r, start: String(r['start']).replace(/T\d\d/, 'T09'), end: String(r['end']).replace(/T\d\d/, 'T10') }));

export function SchedulerPerfScenario() {
  // A new object per call, so a repeated kind (or null) still commits and reports.
  const [state, setState] = useState<{ kind: PerfKind | null }>({ kind: null });
  const kind = state.kind;
  useLayoutEffect(() => {
    window.__schedPerf = (k) => {
      window.__schedPerfMs = null;
      window.__schedPerfT0 = performance.now();
      setState({ kind: k });
    };
  }, []);
  useLayoutEffect(() => {
    // The frame after this commit: rAF runs before its paint, the task after it runs once painted.
    requestAnimationFrame(() => setTimeout(() => (window.__schedPerfMs = performance.now() - (window.__schedPerfT0 ?? 0))));
  }, [state]);
  const common = { date: '2026-11-23', timeZone: 'UTC', height: 640, quickInfo: false } as const;
  return (
    <div data-scenario="sched-perf">
      {kind === 'week' ? <Scheduler data={WEEK} view="week" {...common} /> : null}
      {kind === 'month' ? <Scheduler data={MONTH} view="month" {...common} /> : null}
      {kind === 'timeline' ? <Scheduler data={TIMELINE} view="timelineMonth" views={['timelineMonth']} {...common} date="2026-11-01" resources={[{ field: 'roomId', name: 'rooms', data: ROOMS }]} grouping={{ resources: ['rooms'] }} virtualScroll /> : null}
    </div>
  );
}
