// Scheduler scenarios of examples/vite-spa/src/scheduler.tsx.
import { useRef, useState } from 'react';
import { Scheduler, type SchedulerApi, type SchedulerDataSource } from '@salmonui/scheduler';
import '@salmonui/scheduler/styles.css';

type Row = Record<string, unknown>;

declare global {
  interface Window {
    __schedApi: Record<string, SchedulerApi<Row>>;
    __remote: { reads: { start: string; end: string }[]; rejectNext: boolean; resolveRead: (() => void) | null };
  }
}
window.__schedApi = {};
window.__remote = { reads: [], rejectNext: false, resolveRead: null };

export const WEEK_DATA: Row[] = [
  { id: 1, title: 'Standup', start: '2026-11-23T09:00', end: '2026-11-23T09:30', recurrenceRule: 'FREQ=DAILY;COUNT=5', recurrenceExceptions: '20261125T140000Z', location: 'Room 1' },
  { id: 2, title: 'Design review', start: '2026-11-24T10:00', end: '2026-11-24T11:30' },
  { id: 3, title: 'Overlap A', start: '2026-11-24T10:30', end: '2026-11-24T12:00' },
  { id: 4, title: 'Offsite', start: '2026-11-20', end: '2026-11-25', allDay: true },
  { id: 5, title: 'Late call', start: '2026-11-26T22:00', end: '2026-11-27T01:00' },
  { id: 6, title: 'Lunch block', start: '2026-11-27T12:00', end: '2026-11-27T13:00', block: true },
  { id: 7, title: 'Locked', start: '2026-11-27T15:00', end: '2026-11-27T16:00', readOnly: true },
  { id: 8, title: 'UTC call', start: '2026-11-25T20:00:00Z', end: '2026-11-25T20:30:00Z' },
];

const monthData = (): Row[] => {
  const out: Row[] = [];
  for (let i = 0; i < 6; i++) out.push({ id: 100 + i, title: `Busy ${i + 1}`, start: `2026-11-18T${String(8 + i).padStart(2, '0')}:00`, end: `2026-11-18T${String(9 + i).padStart(2, '0')}:00` });
  out.push({ id: 200, title: 'Conference', start: '2026-11-09', end: '2026-11-13', allDay: true });
  out.push({ id: 201, title: 'Release', start: '2026-11-27T14:00', end: '2026-11-27T15:00' });
  return out;
};

export function SchedulerScenarios({ log, Block }: { log: (id: string, type: string) => (value: unknown, details?: unknown) => void; Block: (p: { id: string; children: React.ReactNode }) => React.ReactElement }) {
  const [view, setView] = useState('week');
  const [date, setDate] = useState('2026-11-23');
  const [data, setData] = useState<Row[]>(WEEK_DATA);
  const remote = useRef<SchedulerDataSource<Row>>({
    read(req) {
      window.__remote.reads.push({ start: req.range.start.toISOString(), end: req.range.end.toISOString() });
      return new Promise((resolve) => {
        const done = () => resolve({ rows: [{ id: 1, title: 'Remote', start: '2026-11-24T10:00:00Z', end: '2026-11-24T11:00:00Z' }] });
        window.__remote.resolveRead = done;
        setTimeout(done, 400);
      });
    },
    write() {
      const reject = window.__remote.rejectNext;
      window.__remote.rejectNext = false;
      return new Promise((resolve, rejectP) => setTimeout(() => (reject ? rejectP(new Error('server says no')) : resolve({ status: 'applied' })), 150));
    },
  });
  const api = (id: string) => (a: SchedulerApi<Row> | null) => {
    if (a) window.__schedApi[id] = a;
  };
  const handlers = (id: string) => ({
    onViewChange: log(id, 'view'),
    onDateChange: (d: unknown) => log(id, 'date')(String(d)),
    onAdd: (e: { rows: readonly Row[]; data: readonly Row[] }) => log(id, 'add')(e.rows, { count: e.data.length }),
    onSave: (e: { added: readonly Row[]; changed: readonly Row[]; deleted: readonly Row[]; scope: string }) => log(id, 'save')({ added: e.added, changed: e.changed, deleted: e.deleted }, { scope: e.scope }),
    onDelete: (e: { deleted: readonly Row[]; changed: readonly Row[]; scope: string }) => log(id, 'delete')({ deleted: e.deleted, changed: e.changed }, { scope: e.scope }),
    onPopupClose: (e: { popup: string }) => log(id, 'popupClose')(e.popup),
    onCellClick: (e: { start: Date }) => log(id, 'cellClick')(e.start.toISOString()),
    onEventClick: (e: { row: Row }) => log(id, 'eventClick')(e.row['id']),
    onError: (e: { error: unknown; action: string }) => log(id, 'error')(String((e.error as Error)?.message ?? e.error), { action: e.action }),
  });
  return (
    <>
      <Block id="sched-week">
        <Scheduler ref={api('sched-week')} data={WEEK_DATA} view="week" date="2026-11-23" timeZone="America/New_York" height={640} editing={{ following: true }} {...handlers('sched-week')} />
      </Block>
      <Block id="sched-month">
        <Scheduler ref={api('sched-month')} data={monthData()} views={['week', 'month']} view="month" date="2026-11-15" timeZone="UTC" height={600} showWeekNumbers {...handlers('sched-month')} />
      </Block>
      <Block id="sched-controlled">
        <Scheduler
          ref={api('sched-controlled')}
          data={data}
          view={view}
          date={date}
          timeZone="Europe/Berlin"
          height={480}
          onViewChange={(v) => {
            log('sched-controlled', 'view')(v);
            setView(v);
          }}
          onDateChange={(d) => {
            log('sched-controlled', 'date')(String(d));
            setDate(String(d));
          }}
          onSave={(e) => setData([...e.data])}
          onBeforeNavigate={(e) => {
            if (String(e.date) === '2027-01-04') e.preventDefault();
          }}
        />
        <button type="button" data-testid="ext-month" onClick={() => setView('month')}>
          Month
        </button>
        <button type="button" data-testid="ext-date" onClick={() => setDate('2026-12-28')}>
          Dec 28
        </button>
      </Block>
      <Block id="sched-overlap">
        <Scheduler ref={api('sched-overlap')} data={WEEK_DATA} view="week" date="2026-11-23" timeZone="America/New_York" height={480} overlap={false} {...handlers('sched-overlap')} onOverlap={(e) => log('sched-overlap', 'overlap')(e.conflicts.map((r) => r['id']))} />
      </Block>
      <Block id="sched-custom">
        <Scheduler
          ref={api('sched-custom')}
          data={WEEK_DATA}
          views={[{ type: 'day', name: 'threeDays', label: '3 days', interval: 3, startHour: '08:00', endHour: '18:00', timeScale: { interval: 30, slotCount: 3 } }, 'week']}
          view="threeDays"
          date="2026-11-24"
          timeZone="America/New_York"
          firstDayOfWeek={1}
          workHours={{ start: '10:00', end: '16:00' }}
          min="2026-11-01"
          max="2026-12-31"
          toolbar={['previous', 'next', 'today', 'dateRange', 'newEvent', 'views', { id: 'custom', label: 'Custom', align: 'end' }]}
          renderEvent={(ctx) => <span data-testid={`custom-${String(ctx.id)}`}>★ {ctx.title}</span>}
          getEventProps={(ctx) => (ctx.id === 3 ? { className: 'is-overlap', 'data-kind': 'review' } : ctx.id === 7 ? { hidden: true } : undefined)}
          getCellProps={(ctx) => (ctx.part === 'workCell' && ctx.start.getUTCHours() === 17 ? { className: 'is-five', title: 'five' } : undefined)}
          renderDateRange={(ctx) => <span data-testid="range">{`${String(ctx.start)}..${String(ctx.end)}`}</span>}
          eventFields={{ title: { field: 'title', label: 'Summary', validation: { required: true, minLength: 3 } } }}
          localeText={{ today: 'Heute' }}
          {...handlers('sched-custom')}
        />
      </Block>
      <Block id="sched-remote">
        <Scheduler ref={api('sched-remote')} data={remote.current} view="day" views={['day', 'week']} date="2026-11-24" timeZone="UTC" height={420} {...handlers('sched-remote')} onDataLoad={(e) => log('sched-remote', 'load')(e.rows.length)} />
      </Block>
      <Block id="sched-readonly">
        <Scheduler data={WEEK_DATA} view="month" views={['month']} date="2026-11-23" timeZone="America/New_York" readOnly height={420} {...handlers('sched-readonly')} />
      </Block>
    </>
  );
}
