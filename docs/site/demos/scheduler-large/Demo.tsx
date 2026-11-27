'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { NumberField } from '@salmonui/inputs/number-field';
import { Select } from '@salmonui/dropdowns/select';
import { Scheduler, type SchedulerApi, type SchedulerDataSource, type SchedulerResource } from '@salmonui/scheduler';

type Row = { id: number; title: string; start: string; end: string; personId: number };

const PEOPLE = 1000;
const pad = (n: number) => String(n).padStart(2, '0');

/** 10 events per person in November 2026, deterministic (no random numbers, no clock). */
function makeEvents(people: number): Row[] {
  const out: Row[] = [];
  for (let p = 1; p <= people; p++) {
    for (let k = 0; k < 10; k++) {
      const day = 1 + ((p * 7 + k * 3) % 28);
      const hour = 8 + ((p + k) % 9);
      out.push({ id: p * 100 + k, title: `Shift ${k + 1}`, start: `2026-11-${pad(day)}T${pad(hour)}:00`, end: `2026-11-${pad(day)}T${pad(hour + 2)}:00`, personId: p });
    }
  }
  return out;
}

const people: SchedulerResource = {
  field: 'personId',
  name: 'people',
  label: 'Person',
  data: Array.from({ length: PEOPLE }, (_, i) => ({ id: i + 1, text: `Person ${i + 1}`, color: ['#d9480f', '#1971c2', '#2f9e44', '#9c36b5'][i % 4] })),
};

type Mode = 'timeline' | 'lazy' | 'week' | 'agenda';

const MODES = [
  { value: 'timeline', label: 'Timeline month, 10,000 events' },
  { value: 'lazy', label: 'Timeline month, lazy loading' },
  { value: 'week', label: 'Week, 1,000 events' },
  { value: 'agenda', label: 'Agenda, virtual scrolling' },
];

/** A Timeline Month of 1,000 people and 10,000 events with virtual scrolling, lazy loading per rendered person, scrolling to a person, a week of 1,000 events and an agenda that loads days as it scrolls. */
export default function SchedulerLargeDemo() {
  const events = useMemo(() => makeEvents(PEOPLE), []);
  const weekEvents = useMemo(() => events.filter((e) => e.start >= '2026-11-23' && e.start < '2026-11-30').slice(0, 1000), [events]);
  const apiRef = useRef<SchedulerApi<Row>>(null);
  const [mode, setMode] = useState<Mode>('timeline');
  const [target, setTarget] = useState(750);
  const [status, setStatus] = useState('');
  // The lazy source answers with the events of the rendered people only.
  const source = useMemo<SchedulerDataSource<Row>>(
    () => ({
      read: ({ resourceIds }) => {
        const ids = new Set(resourceIds ?? []);
        const rows = events.filter((e) => ids.has(e.personId));
        setStatus(`read: ${ids.size} rendered people, ${rows.length} events`);
        return new Promise((resolve) => setTimeout(() => resolve({ rows }), 150));
      },
    }),
    [events],
  );
  return (
    <div>
      <div className="demo-toolbar">
        <label>
          Scenario
          <Select
            aria-label="Scenario"
            data={MODES}
            value={mode}
            onValueChange={(value) => {
              if (value == null) return;
              setMode(value as Mode);
              setStatus('');
            }}
          />
        </label>
        {mode === 'timeline' || mode === 'lazy' ? (
          <>
            <label>
              Person
              <NumberField aria-label="Person" min={1} max={PEOPLE} value={target} onValueChange={(value) => value != null && setTarget(value)} style={{ inlineSize: 120 }} />
            </label>
            <Button variant="outline" type="button" onClick={() => apiRef.current?.scrollToResource(target)}>
              scrollToResource
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                const r = apiRef.current?.getRenderedRange();
                setStatus(r ? `getRenderedRange(): rows ${r.start} to ${r.end - 1} of ${PEOPLE}` : '');
              }}
            >
              getRenderedRange()
            </Button>
          </>
        ) : null}
      </div>
      {mode === 'timeline' ? (
        <Scheduler<Row> key="timeline" ref={apiRef} data={events} resources={[people]} grouping={{ resources: ['people'] }} view="timelineMonth" views={['timelineMonth']} virtualScroll={{ overscan: 4 }} date="2026-11-01" timeZone="UTC" height={520} />
      ) : null}
      {mode === 'lazy' ? (
        <Scheduler<Row> key="lazy" ref={apiRef} data={source} resources={[people]} grouping={{ resources: ['people'] }} view="timelineMonth" views={['timelineMonth']} virtualScroll={{ lazyLoad: true, overscan: 2 }} date="2026-11-01" timeZone="UTC" height={520} />
      ) : null}
      {mode === 'week' ? <Scheduler<Row> key="week" data={weekEvents} view="week" views={['week', 'month']} date="2026-11-23" timeZone="UTC" height={520} scrollTime="08:00" /> : null}
      {mode === 'agenda' ? (
        <Scheduler<Row> key="agenda" data={events.slice(0, 600)} view="agenda" views={[{ type: 'agenda', virtualScroll: true, agendaDayCount: 7 }]} date="2026-11-01" timeZone="UTC" height={520} />
      ) : null}
      <p className="demo-status" aria-live="polite">
        {status || `${events.length.toLocaleString('en-US')} events in memory`}
      </p>
    </div>
  );
}
