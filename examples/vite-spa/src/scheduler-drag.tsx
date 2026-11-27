// Drag scenarios (scheduler.html?set=drag; tests/browser/scheduler-drag.spec.ts):
// drag and drop in week, month and timeline views, resize,
// multi-drag, external drops and drag out, resources and
// Schedulers of one drag group, swipe navigation, RTL
// and the drag frame gate with 1,000 events (React commits counted
// by a Profiler).
import { Profiler, useRef, useState, type ReactNode } from 'react';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { Scheduler, type SchedulerApi, type SchedulerProps, type SchedulerResource } from '@salmonui/scheduler';
// The Data Grid row drag scenario needs the grid stylesheet only: the whole catalog stylesheet would slow
// style recalculation for every scenario of this page (the render-to-paint gates).
import '@salmonui/data-grid/styles.css';
import '@salmonui/scheduler/styles.css';

type Row = Record<string, unknown>;
type Log = (id: string, type: string) => (value: unknown, details?: unknown) => void;

declare global {
  interface Window {
    __dragCommits: number;
    __dragFlags: { cancelStart?: boolean; cancelDrop?: boolean };
  }
}
window.__dragCommits = 0;
window.__dragFlags = {};

const WEEK: Row[] = [
  { id: 1, title: 'Move me', start: '2026-11-24T09:00', end: '2026-11-24T10:00' },
  { id: 2, title: 'Trip', start: '2026-11-25', end: '2026-11-26', allDay: true },
  { id: 3, title: 'Daily', start: '2026-11-23T14:00', end: '2026-11-23T15:00', recurrenceRule: 'FREQ=DAILY;COUNT=5' },
  { id: 4, title: 'Busy', start: '2026-11-26T09:00', end: '2026-11-26T10:00' },
  { id: 5, title: 'Fixed', start: '2026-11-27T09:00', end: '2026-11-27T10:00', readOnly: true },
  { id: 6, title: 'Lunch', start: '2026-11-26T12:00', end: '2026-11-26T13:00', block: true },
];

const ROOMS: SchedulerResource = { field: 'roomId', name: 'rooms', data: [{ id: 1, text: 'Room A' }, { id: 2, text: 'Room B' }] };
const TL: Row[] = [
  { id: 1, title: 'Planning', start: '2026-11-24T09:00', end: '2026-11-24T10:00', roomId: 1 },
  { id: 2, title: 'Review', start: '2026-11-24T13:00', end: '2026-11-24T14:00', roomId: 2 },
];

/** 1,000 events in the week of 2026-11-23 (the drag frame gate). */
const MANY: Row[] = Array.from({ length: 1000 }, (_, i) => {
  const day = 22 + (i % 7);
  const hour = 6 + (Math.floor(i / 7) % 12);
  const minute = (i % 2) * 30;
  const pad = (n: number) => String(n).padStart(2, '0');
  return { id: i + 1, title: `Event ${i + 1}`, start: `2026-11-${day}T${pad(hour)}:${pad(minute)}`, end: `2026-11-${day}T${pad(hour + 1)}:${pad(minute)}` };
});

const iso = (d: Date) => d.toISOString();

interface Task {
  readonly id: string;
  readonly title: string;
}
const TASKS: Task[] = [
  { id: 't1', title: 'Grid task' },
  { id: 't2', title: 'Second task' },
];
const TASK_COLUMNS: DataGridColumn<Task>[] = [
  { field: 'id', header: 'Id', primaryKey: true, width: 70 },
  { field: 'title', header: 'Title', width: 160 },
];

/**
 * Data Grid row drag into a Scheduler: `rowDrag.targetId` names the Scheduler; the drop's
 * `target` is that zone, so the app hit-tests the last pointer position and `getCellInfo` gives the slot.
 */
function GridToScheduler({ log }: { log: Log }) {
  const ref = useRef<SchedulerApi<Row> | null>(null);
  const point = useRef({ x: 0, y: 0 });
  const [rows, setRows] = useState<Row[]>([]);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }} onPointerMove={(e) => void (point.current = { x: e.clientX, y: e.clientY })}>
      <DataGrid<Task>
        aria-label="Tasks"
        id="drag-dg"
        data={TASKS}
        columns={TASK_COLUMNS}
        height={200}
        width={260}
        locale="en-US"
        rowDrag={{ targetId: 'drag-dg-target' }}
        onRowDrop={(e) => {
          const hit = e.targetGridId === null && e.target ? document.elementFromPoint(point.current.x, point.current.y) : null;
          const cell = hit ? ref.current?.getCellInfo(hit) : null;
          if (cell) ref.current?.addEvents(e.rows().map((r) => ({ title: r.title, start: cell.start, end: cell.end, allDay: cell.allDay })));
        }}
      />
      <div style={{ flex: 1 }}>
        <Scheduler
          ref={(a) => {
            ref.current = a;
          }}
          id="drag-dg-target"
          data={rows}
          view="week"
          date="2026-11-23"
          timeZone="UTC"
          height={480}
          scrollTime="08:00"
          quickInfo={false}
          onAdd={(e) => {
            log('drag-dg', 'add')(e.rows.map((r) => ({ title: r['title'], start: r['start'] instanceof Date ? iso(r['start']) : r['start'] })));
            setRows([...e.data]);
          }}
        />
      </div>
    </div>
  );
}
const drag = (log: Log, id: string): Partial<SchedulerProps<Row>> => ({
  onEventDragStart: (e: { row: Row; preventDefault(): void }) => {
    log(id, 'dragStart')(e.row['id']);
    if (window.__dragFlags.cancelStart) e.preventDefault();
  },
  onEventDrag: (e: { start: Date; resourceIds: unknown }) => log(id, 'drag')(iso(e.start), e.resourceIds),
  onBeforeEventDrop: (e: { start: Date; end: Date; preventDefault(): void }) => {
    log(id, 'beforeDrop')({ start: iso(e.start), end: iso(e.end) });
    if (window.__dragFlags.cancelDrop) e.preventDefault();
  },
  onEventDrop: (e: { row: Row; rows: readonly Row[]; start: Date; end: Date; resourceIds: unknown; result: { status: string } }) => log(id, 'drop')({ id: e.row['id'], start: iso(e.start), end: iso(e.end), status: e.result.status, rows: e.rows.length, resourceIds: e.resourceIds }),
  onEventResizeStart: (e) => log(id, 'resizeStart')(e.row['id'], e.edge),
  onEventResize: (e: { start: Date; end: Date }) => log(id, 'resize')({ start: iso(e.start), end: iso(e.end) }),
  onEventResizeEnd: (e: { row: Row; start: Date; end: Date; result: { status: string } }) => log(id, 'resizeEnd')({ id: e.row['id'], start: iso(e.start), end: iso(e.end), status: e.result.status }),
  onSave: (e) => log(id, 'save')([...e.added, ...e.changed].map((r) => ({ id: r['id'], start: r['start'] instanceof Date ? iso(r['start']) : r['start'], end: r['end'] instanceof Date ? iso(r['end']) : r['end'], roomId: r['roomId'], recurrenceId: r['recurrenceId'] })), e.scope),
});

export function SchedulerDragScenarios({ log, Block }: { log: Log; Block: (p: { id: string; children: ReactNode }) => React.ReactElement }) {
  const api = (id: string) => (a: SchedulerApi<Row> | null) => {
    if (a) window.__schedApi[id] = a;
  };
  const common = { view: 'week', date: '2026-11-23', timeZone: 'UTC', height: 560, scrollTime: '08:00' } as const;
  const [groupB, setGroupB] = useState<Row[]>([]);
  const [groupA, setGroupA] = useState<Row[]>([{ id: 1, title: 'Hand over', start: '2026-11-24T09:00', end: '2026-11-24T10:00' }]);
  return (
    <>
      <Block id="drag-week">
        <Scheduler ref={api('drag-week')} data={WEEK} {...common} {...drag(log, 'drag-week')} />
      </Block>
      <Block id="drag-month">
        <Scheduler ref={api('drag-month')} data={WEEK} view="month" views={['month']} date="2026-11-23" timeZone="UTC" height={560} quickInfo={false} {...drag(log, 'drag-month')} />
      </Block>
      <Block id="drag-timeline">
        <Scheduler ref={api('drag-timeline')} data={TL} view="timelineDay" views={['timelineDay']} date="2026-11-24" timeZone="UTC" height={320} startHour="08:00" endHour="18:00" resources={[ROOMS]} grouping={{ resources: ['rooms'] }} quickInfo={false} {...drag(log, 'drag-timeline')} />
      </Block>
      <Block id="drag-timeline-rtl">
        <Scheduler ref={api('drag-timeline-rtl')} data={TL} view="timelineDay" views={['timelineDay']} date="2026-11-24" timeZone="UTC" height={320} startHour="08:00" endHour="18:00" resources={[ROOMS]} grouping={{ resources: ['rooms'] }} quickInfo={false} dir="rtl" locale="ar-EG" {...drag(log, 'drag-timeline-rtl')} />
      </Block>
      <Block id="drag-multi">
        <Scheduler ref={api('drag-multi')} data={WEEK} {...common} quickInfo={false} selectedEventIds={[1, 4]} dragOptions={{ multiple: true, snapMinutes: 15 }} {...drag(log, 'drag-multi')} />
      </Block>
      <Block id="drag-external">
        <div style={{ display: 'flex', gap: 8, marginBlockEnd: 8 }}>
          <div
            data-testid="external-item"
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text/plain', 'External task')}
            style={{ padding: 8, border: '1px solid', cursor: 'grab' }}
          >
            External task
          </div>
          <div data-testid="drag-out-area" style={{ padding: 8, border: '1px dashed', inlineSize: 200, blockSize: 60 }}>
            Drop here to remove
          </div>
        </div>
        <Scheduler
          ref={api('drag-external')}
          data={WEEK}
          {...common}
          quickInfo={false}
          dragOptions={{ dragOutArea: '[data-testid="drag-out-area"]' }}
          onExternalDrop={(e) => {
            log('drag-external', 'externalDrop')({ text: e.data?.getData('text/plain') ?? null, start: iso(e.start), end: iso(e.end), allDay: e.allDay });
            return [{ title: e.data?.getData('text/plain') || 'Dropped', start: e.start, end: e.end }];
          }}
          onEventDragOut={(e) => log('drag-external', 'dragOut')(e.row['id'], (e.target as HTMLElement).dataset['testid'])}
          onAdd={(e) => log('drag-external', 'add')(e.rows.map((r) => r['title']))}
        />
      </Block>
      <Block id="drag-dg">
        <GridToScheduler log={log} />
      </Block>
      <Block id="drag-group">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Scheduler
            ref={api('drag-group-a')}
            id="drag-group-a"
            data={groupA}
            {...common}
            height={480}
            quickInfo={false}
            dragOptions={{ group: 'pair' }}
            onDelete={(e) => {
              log('drag-group-a', 'delete')(e.deleted.map((r) => r['id']));
              setGroupA([...e.data]);
            }}
          />
          <Scheduler
            ref={api('drag-group-b')}
            id="drag-group-b"
            data={groupB}
            {...common}
            height={480}
            quickInfo={false}
            dragOptions={{ group: 'pair' }}
            onAdd={(e) => {
              log('drag-group-b', 'add')(e.rows.map((r) => ({ title: r['title'], start: r['start'] instanceof Date ? iso(r['start']) : r['start'] })));
              setGroupB([...e.data]);
            }}
          />
        </div>
      </Block>
      <Block id="drag-edge">
        <Scheduler ref={api('drag-edge')} data={WEEK} {...common} quickInfo={false} dragOptions={{ navigateOnEdge: { delay: 600 } }} onDateChange={(d) => log('drag-edge', 'date')(String(d))} {...drag(log, 'drag-edge')} />
      </Block>
      <Block id="drag-swipe">
        <Scheduler ref={api('drag-swipe')} data={WEEK} {...common} quickInfo={false} swipeNavigation onDateChange={(d, e) => log('drag-swipe', 'date')(String(d), e.source)} />
      </Block>
      <Block id="drag-swipe-rtl">
        <Scheduler ref={api('drag-swipe-rtl')} data={WEEK} {...common} quickInfo={false} swipeNavigation dir="rtl" onDateChange={(d, e) => log('drag-swipe-rtl', 'date')(String(d), e.source)} />
      </Block>
      <Block id="drag-perf">
        <Profiler id="drag-perf" onRender={() => void (window.__dragCommits += 1)}>
          <Scheduler ref={api('drag-perf')} data={MANY} {...common} height={640} quickInfo={false} onEventDrag={() => undefined} />
        </Profiler>
      </Block>
    </>
  );
}
