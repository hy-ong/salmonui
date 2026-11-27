// Keyboard, clipboard and adaptive Scheduler scenarios (scheduler.html?set=keys;
// tests/browser/scheduler-keys.spec.ts): arrow roving between cells and
// events, keyBindings, the clipboard and the
// adaptive layout.
import { useState } from 'react';
import { Scheduler, type SchedulerApi } from '@salmonui/scheduler';
import { WEEK_DATA } from './scheduler-scenarios.tsx';
import '@salmonui/scheduler/styles.css';

type Row = Record<string, unknown>;
type Log = (id: string, type: string) => (value: unknown, details?: unknown) => void;

const ROOMS = [
  { id: 1, text: 'Room A', color: '#2f7d6d' },
  { id: 2, text: 'Room B', color: '#9a4ab0' },
];
const ROOM_DATA: Row[] = [
  { id: 1, title: 'Planning', start: '2026-11-24T09:00', end: '2026-11-24T10:00', roomId: 1 },
  { id: 2, title: 'Retro', start: '2026-11-24T11:00', end: '2026-11-24T12:00', roomId: 2 },
];

/** `adaptive={{ breakpoint: 700 }}` in a container that a button widens. */
function AdaptiveWidth({ log }: { log: Log }) {
  const [wide, setWide] = useState(false);
  return (
    <>
      <button type="button" data-testid="widen" onClick={() => setWide((w) => !w)}>
        Toggle width
      </button>
      <div style={{ inlineSize: wide ? 1000 : 420 }}>
        <Scheduler
          data={ROOM_DATA}
          view="week"
          views={['day', 'week', 'month']}
          date="2026-11-24"
          timeZone="UTC"
          height={480}
          quickInfo={false}
          adaptive={{ breakpoint: 700 }}
          resources={[{ field: 'roomId', name: 'rooms', data: ROOMS }]}
          grouping={{ resources: ['rooms'] }}
          onSelectedResourceChange={(id, e) => log('sched-adaptive', 'resource')(id, { source: e.source })}
          onViewChange={(v) => log('sched-adaptive', 'view')(v)}
        />
      </div>
    </>
  );
}

export function SchedulerKeyScenarios({ log, Block }: { log: Log; Block: (p: { id: string; children: React.ReactNode }) => React.ReactElement }) {
  const api = (id: string) => (a: SchedulerApi<Row> | null) => {
    if (a) window.__schedApi[id] = a;
  };
  const writes = (id: string) => ({
    onAdd: (e: { rows: readonly Row[] }) => log(id, 'add')(e.rows),
    onSave: (e: { changed: readonly Row[]; scope: string }) => log(id, 'save')(e.changed, { scope: e.scope }),
    onDelete: (e: { deleted: readonly Row[] }) => log(id, 'delete')(e.deleted),
    onDateChange: (d: unknown) => log(id, 'date')(String(d)),
  });
  const common = { date: '2026-11-23', timeZone: 'UTC', height: 520, quickInfo: false } as const;
  return (
    <>
      <h1 style={{ fontSize: 14 }}>Scheduler keyboard and clipboard</h1>
      <Block id="sched-keys">
        <Scheduler ref={api('sched-keys')} data={WEEK_DATA} view="week" {...common} clipboard onBeforePaste={(e) => log('sched-keys', 'beforePaste')(e.data, { cut: e.cut, start: e.start.toISOString() })} {...writes('sched-keys')} />
      </Block>
      <Block id="sched-keys-month">
        <Scheduler ref={api('sched-keys-month')} data={WEEK_DATA} view="month" {...common} clipboard {...writes('sched-keys-month')} />
      </Block>
      <Block id="sched-keys-rtl">
        <Scheduler data={WEEK_DATA} view="week" dir="rtl" {...common} />
      </Block>
      <Block id="sched-keys-bind">
        <Scheduler data={WEEK_DATA} view="week" {...common} keyBindings={{ 'navigation.next': ['Alt+PageDown'], 'event.delete': [] }} {...writes('sched-keys-bind')} />
      </Block>
      <Block id="sched-adaptive">
        <AdaptiveWidth log={log} />
      </Block>
      <Block id="sched-keys-group">
        <Scheduler
          ref={api('sched-keys-group')}
          data={ROOM_DATA}
          view="day"
          {...common}
          date="2026-11-24"
          clipboard
          resources={[{ field: 'roomId', name: 'rooms', data: ROOMS }]}
          grouping={{ resources: ['rooms'] }}
          onBeforePaste={(e) => {
            log('sched-keys-group', 'beforePaste')(e.data, { cut: e.cut });
            if (e.data.some((r) => r['title'] === 'Retro')) e.data = e.data.map((r) => ({ ...r, title: 'Retro (copy)' }));
          }}
          {...writes('sched-keys-group')}
        />
      </Block>
    </>
  );
}
