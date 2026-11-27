// Timeline, resource, year and agenda scenarios (scheduler.html?set=views;
// tests/browser/scheduler-views.spec.ts): timeline
// views and header rows, resources and grouping, virtual scrolling with lazy
// loading, auto row height, Year, Timeline Year, Agenda and Month Agenda.
// `?set=views&ssr=1` renders the hydration block with renderToString (after
// the view chunks loaded) and hydrates it.
import { useRef, useState, type ReactNode } from 'react';
import { Scheduler, type SchedulerApi, type SchedulerDataSource, type SchedulerResource } from '@salmonui/scheduler';
import '@salmonui/scheduler/styles.css';

type Row = Record<string, unknown>;
type Log = (id: string, type: string) => (value: unknown, details?: unknown) => void;

export const ROOMS: SchedulerResource = {
  field: 'roomId',
  name: 'rooms',
  label: 'Room',
  data: [
    { id: 1, text: 'Room A', color: '#d9480f', startHour: '08:00', endHour: '12:00', workDays: [1, 2, 3] },
    { id: 2, text: 'Room B', color: '#1971c2', className: 'room-b' },
  ],
};
export const OWNERS: SchedulerResource = {
  field: 'ownerIds',
  name: 'owners',
  label: 'Owners',
  multiple: true,
  data: [
    { id: 10, text: 'Ann', parentId: 1, color: '#2f9e44' },
    { id: 11, text: 'Bob', parentId: 2 },
    { id: 12, text: 'Cid', parentId: 1 },
  ],
};

export const RES_DATA: Row[] = [
  { id: 1, title: 'Planning', start: '2026-11-24T09:00', end: '2026-11-24T10:30', roomId: 1, ownerIds: [10, 12] },
  { id: 2, title: 'Review', start: '2026-11-24T10:00', end: '2026-11-24T11:00', roomId: 2, ownerIds: [11] },
  { id: 3, title: 'Workshop', start: '2026-11-25', end: '2026-11-27', allDay: true, roomId: 2, ownerIds: [11] },
  { id: 4, title: 'Sync', start: '2026-11-26T14:00', end: '2026-11-26T15:00', roomId: 1, ownerIds: [10] },
];

const STACK: Row[] = Array.from({ length: 5 }, (_, i) => ({ id: 50 + i, title: `Stack ${i + 1}`, start: '2026-11-24T09:00', end: '2026-11-24T12:00', roomId: 1 }));

/** 1,000 resources with two events each (virtual scrolling). */
const MANY: SchedulerResource = { field: 'resId', name: 'people', data: Array.from({ length: 1000 }, (_, i) => ({ id: i + 1, text: `Person ${i + 1}` })) };
const MANY_DATA: Row[] = Array.from({ length: 2000 }, (_, i) => ({ id: i + 1, title: `Task ${i + 1}`, start: `2026-11-${String(2 + (i % 25)).padStart(2, '0')}`, end: `2026-11-${String(4 + (i % 25)).padStart(2, '0')}`, allDay: true, resId: (i % 1000) + 1 }));

const YEAR_DATA: Row[] = [
  { id: 1, title: 'Kickoff', start: '2026-01-05T09:00', end: '2026-01-05T10:00' },
  { id: 2, title: 'Holiday', start: '2026-03-02', end: '2026-03-05', allDay: true },
  { id: 3, title: 'Board', start: '2026-11-24T13:00', end: '2026-11-24T14:00' },
  { id: 4, title: 'Review', start: '2026-11-24T15:00', end: '2026-11-24T16:00' },
  { id: 5, title: 'Party', start: '2026-12-18T18:00', end: '2026-12-18T22:00' },
];

const AGENDA_DATA: Row[] = [
  { id: 1, title: 'Standup', start: '2026-11-23T09:00', end: '2026-11-23T09:15', recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO,WE' },
  { id: 2, title: 'Trip', start: '2026-11-26', end: '2026-11-28', allDay: true },
  { id: 3, title: 'Far away', start: '2027-01-20T10:00', end: '2027-01-20T11:00' },
];

export function SchedulerViewScenarios({ log, Block }: { log: Log; Block: (p: { id: string; children: ReactNode }) => React.ReactElement }) {
  const api = (id: string) => (a: SchedulerApi<Row> | null) => {
    if (a) window.__schedApi[id] = a;
  };
  const [rows, setRows] = useState<Row[]>(RES_DATA);
  const [resources, setResources] = useState<SchedulerResource[]>([ROOMS, OWNERS]);
  const remote = useRef<SchedulerDataSource<Row>>({
    read(req) {
      const ids = (req.resourceIds ?? []) as number[];
      window.__lazyReads.push({ start: req.range.start.toISOString(), ids: ids.length, first: ids[0] ?? null, last: ids[ids.length - 1] ?? null });
      return { rows: MANY_DATA.filter((r) => ids.includes(r['resId'] as number)) };
    },
  });
  const common = { date: '2026-11-24', timeZone: 'UTC', height: 420 } as const;
  return (
    <>
      <Block id="tl-day">
        <Scheduler ref={api('tl-day')} data={RES_DATA} view="timelineDay" views={['timelineDay', 'timelineWeek', 'timelineWorkWeek', 'timelineMonth']} {...common} startHour="08:00" endHour="18:00" />
      </Block>
      <Block id="tl-week">
        <Scheduler
          ref={api('tl-week')}
          data={rows}
          resources={resources}
          grouping={{ resources: ['rooms'] }}
          view="timelineWeek"
          views={['timelineWeek', 'week', 'month']}
          {...common}
          timeScale={{ interval: 60, slotCount: 1 }}
          headerRows={[{ unit: 'week' }, { unit: 'date' }, { unit: 'hour', render: (c) => <span data-testid="hour">{c.text}</span> }]}
          onAdd={(e) => setRows([...e.data])}
          onSave={(e) => setRows([...e.data])}
        />
        <button type="button" data-testid="add-room" onClick={() => setResources([{ ...ROOMS, data: [...ROOMS.data, { id: 3, text: 'Room C' }] }, OWNERS])}>
          Add room
        </button>
      </Block>
      <Block id="tl-month">
        <Scheduler
          ref={api('tl-month')}
          data={RES_DATA}
          resources={[ROOMS, OWNERS]}
          grouping={{ resources: ['rooms', 'owners'] }}
          view="timelineMonth"
          views={['timelineMonth']}
          {...common}
          renderResourceHeader={(c) => <span data-testid="res-header">{`${c.resource.text}${c.hasChildren ? ' +' : ''}`}</span>}
          renderResourceTooltip={(c) => `Tip ${c.resource.text}`}
          onExpandedResourcesChange={log('tl-month', 'expanded')}
        />
      </Block>
      <Block id="tl-auto">
        <Scheduler data={STACK} resources={[ROOMS]} grouping={{ resources: ['rooms'] }} view="timelineWeek" views={['timelineWeek']} {...common} autoRowHeight />
      </Block>
      <Block id="tl-more">
        <Scheduler data={STACK} resources={[ROOMS]} grouping={{ resources: ['rooms'] }} view="timelineWeek" views={['timelineWeek']} {...common} />
      </Block>
      <Block id="month-auto">
        <Scheduler data={STACK} view="month" views={['month']} {...common} autoRowHeight />
      </Block>
      <Block id="tl-virtual">
        <Scheduler ref={api('tl-virtual')} data={MANY_DATA} resources={[MANY]} grouping={{ resources: ['people'] }} view="timelineMonth" views={[{ type: 'timelineMonth', virtualScroll: { overscan: 2 } }]} {...common} />
      </Block>
      <Block id="tl-lazy">
        <Scheduler ref={api('tl-lazy')} data={remote.current} resources={[MANY]} grouping={{ resources: ['people'] }} view="timelineMonth" views={['timelineMonth']} virtualScroll={{ lazyLoad: true, overscan: 1 }} {...common} />
      </Block>
      <Block id="tl-year">
        <Scheduler data={YEAR_DATA} view="timelineYear" views={['timelineYear']} date="2026-11-24" timeZone="UTC" height={480} renderMonthHeader={(c) => <span data-testid="month-header">{c.text.slice(0, 3)}</span>} renderDayHeader={(c) => <span data-testid="day-header">{`d${c.day}`}</span>} />
      </Block>
      <Block id="tl-year-v">
        <Scheduler data={YEAR_DATA} view="timelineYear" views={[{ type: 'timelineYear', orientation: 'vertical', firstMonthOfYear: 11, monthCount: 3 }]} date="2026-11-24" timeZone="UTC" height={480} />
      </Block>
      <Block id="grp-week">
        <Scheduler ref={api('grp-week')} data={RES_DATA} resources={[ROOMS, OWNERS]} grouping={{ resources: ['rooms', 'owners'], sharedEvents: true }} view="week" views={['week', 'month', 'day']} {...common} height={520} />
      </Block>
      <Block id="grp-hide">
        <Scheduler data={RES_DATA} resources={[ROOMS]} grouping={{ resources: ['rooms'], hideNonWorkingDays: true }} view="workWeek" views={['workWeek']} {...common} />
      </Block>
      <Block id="grp-bydate">
        <Scheduler data={RES_DATA} resources={[ROOMS]} grouping={{ resources: ['rooms'], byDate: true }} view="week" views={['week', 'month']} {...common} />
      </Block>
      <Block id="grp-flat">
        <Scheduler data={RES_DATA} resources={[ROOMS, OWNERS]} grouping={{ resources: ['rooms', 'owners'], byParent: false }} view="timelineDay" views={['timelineDay']} {...common} />
      </Block>
      <Block id="grp-editor">
        <Scheduler ref={api('grp-editor')} data={rows} resources={[ROOMS, OWNERS]} grouping={{ resources: ['rooms'] }} view="day" views={['day']} {...common} onAdd={(e) => setRows([...e.data])} onSave={(e) => setRows([...e.data])} />
      </Block>
      <Block id="year">
        <Scheduler ref={api('year')} data={YEAR_DATA} view="year" views={['year', 'day']} date="2026-11-24" timeZone="UTC" height={560} renderMonthHeader={(c) => <span data-testid="year-month">{`M:${c.text}`}</span>} />
      </Block>
      <Block id="year-fiscal">
        <Scheduler data={YEAR_DATA} view="year" views={[{ type: 'year', firstMonthOfYear: 4, monthCount: 6 }]} date="2026-11-24" timeZone="UTC" height={420} renderDayHeader={(c) => <span data-testid="wd">{c.text[0]}</span>} />
      </Block>
      <Block id="agenda">
        <Scheduler ref={api('agenda')} data={AGENDA_DATA} view="agenda" views={['agenda', 'day']} date="2026-11-23" timeZone="UTC" height={360} />
      </Block>
      <Block id="agenda-all">
        <Scheduler data={AGENDA_DATA} view="agenda" views={[{ type: 'agenda', agendaDayCount: 3, hideEmptyAgendaDays: false }]} date="2026-11-23" timeZone="UTC" height={360} />
      </Block>
      <Block id="agenda-virtual">
        <Scheduler data={AGENDA_DATA} view="agenda" views={[{ type: 'agenda', virtualScroll: true, hideEmptyAgendaDays: false }]} date="2026-11-23" timeZone="UTC" height={300} />
      </Block>
      <Block id="month-agenda">
        <Scheduler data={AGENDA_DATA} view="monthAgenda" views={['monthAgenda']} date="2026-11-23" timeZone="UTC" height={520} />
      </Block>
    </>
  );
}

/** Server-rendered views for the hydration gate. */
export function SchedulerViewsHydration() {
  return (
    <>
      <Scheduler data={RES_DATA} resources={[ROOMS, OWNERS]} grouping={{ resources: ['rooms', 'owners'] }} view="timelineWeek" views={['timelineWeek']} date="2026-11-24" timeZone="UTC" height={360} />
      <Scheduler data={MANY_DATA} resources={[MANY]} grouping={{ resources: ['people'] }} view="timelineMonth" views={[{ type: 'timelineMonth', virtualScroll: { initialRange: { start: 0, end: 12 } } }]} date="2026-11-24" timeZone="UTC" height={360} />
      <Scheduler data={RES_DATA} resources={[ROOMS]} grouping={{ resources: ['rooms'], byDate: true }} view="week" views={['week']} date="2026-11-24" timeZone="UTC" height={360} />
      <Scheduler data={YEAR_DATA} view="year" views={['year']} date="2026-11-24" timeZone="UTC" height={360} />
      <Scheduler data={AGENDA_DATA} view="agenda" views={['agenda']} date="2026-11-23" timeZone="UTC" height={300} />
      <Scheduler data={AGENDA_DATA} view="monthAgenda" views={['monthAgenda']} date="2026-11-23" timeZone="UTC" height={420} />
      <Scheduler data={YEAR_DATA} view="timelineYear" views={['timelineYear']} date="2026-11-24" timeZone="UTC" height={360} dir="rtl" />
    </>
  );
}

declare global {
  interface Window {
    __lazyReads: { start: string; ids: number; first: number | null; last: number | null }[];
  }
}
window.__lazyReads = [];
