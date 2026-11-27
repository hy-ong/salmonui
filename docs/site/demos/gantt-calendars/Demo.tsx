'use client';

import { useMemo, useRef, useState } from 'react';
import { Gantt, type GanttApi, type GanttProps, type GanttCalendar, type GanttTaskType, type GanttWorkingTime } from '@salmonui/gantt';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';

type Task = { id: number; title: string; parentId: number | null; start?: string; duration?: number; durationUnit?: string; work?: number; taskType?: GanttTaskType; resources?: { id: string; unit: number }[]; calendar?: string };

const tasks: Task[] = [
  { id: 1, title: 'Plant upgrade', parentId: null },
  { id: 2, title: 'Order parts (office hours)', parentId: 1, start: '2027-12-20T09:00', duration: 3 },
  { id: 3, title: 'Night shift install (night calendar)', parentId: 1, start: '2027-12-21T20:00', duration: 2, calendar: 'night' },
  { id: 4, title: 'Commissioning (16 h of work, 2 people)', parentId: 1, start: '2027-12-27T09:00', work: 16, taskType: 'fixedWork', resources: [{ id: 'ana', unit: 100 }, { id: 'ben', unit: 100 }] },
  { id: 5, title: 'Weekend test run (7-day calendar)', parentId: 1, start: '2027-12-25T08:00', duration: 2, calendar: 'sevenDay' },
  { id: 6, title: 'Handover meeting (3 hours)', parentId: 1, start: '2028-01-03T10:00', duration: 3, durationUnit: 'hour' },
];

const people = [
  { id: 'ana', name: 'Ana' },
  { id: 'ben', name: 'Ben' },
];

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
const HOLIDAYS = [
  { start: '2027-12-24', end: '2027-12-26', label: 'Christmas' },
  { start: '2028-01-01', label: 'New Year' },
];

const calendars: GanttCalendar[] = [
  { id: 'night', workingTime: { dayRanges: [{ from: 20, to: 24 }], workDays: [1, 2, 3, 4, 5] } },
  { id: 'sevenDay', workingTime: { includeWeekend: true }, exceptions: [{ start: '2027-12-31', ranges: [{ from: 8, to: 12 }] }] },
];


// Days over six-hour cells: the whole plan, its weekends and holidays fit in view, the working hours still show.
const TIMELINE: NonNullable<GanttProps<Task>['timeline']> = { topTier: { unit: 'day', format: { weekday: 'short', day: 'numeric', month: 'short' } }, bottomTier: { unit: 'hour', count: 6, format: { hour: '2-digit' } }, unitWidth: 24 };
const COLUMNS: NonNullable<GanttProps<Task>['columns']> = ['title', 'start', 'end', 'duration', 'work', 'taskType', 'resources'];
/** Working time with lunch breaks and a short Friday, holidays, weekend shading, named calendars per task, a time zone, hour-based durations and work-driven task types. */
export default function GanttCalendarsDemo() {
  const apiRef = useRef<GanttApi<Task>>(null);
  const [data, setData] = useState<readonly Task[]>(tasks);
  const [zone, setZone] = useState('Europe/Berlin');
  const [shortFriday, setShortFriday] = useState(true);
  const [type, setType] = useState<GanttTaskType>('fixedUnit');
  const [status, setStatus] = useState('');
  const workingTime: GanttWorkingTime = useMemo(
    () => ({
      dayRanges: [
        { from: 9, to: 12.5 },
        { from: 13.5, to: 18 },
      ],
      ...(shortFriday ? { week: { 5: [{ from: 9, to: 13 }] } } : {}),
      workDays: [1, 2, 3, 4, 5],
      hoursPerDay: 8,
    }),
    [shortFriday],
  );
  return (
    <div>
      <div className="demo-toolbar">
        <label>
          Time zone
          <Select aria-label="Time zone" data={[{ value: 'Europe/Berlin', label: 'Europe/Berlin' }, { value: 'America/Chicago', label: 'America/Chicago' }, { value: 'UTC', label: 'UTC' }]} value={zone} onValueChange={(value) => value != null && setZone(String(value))} />
        </label>
        <Checkbox checked={shortFriday} onCheckedChange={(checked) => setShortFriday(checked)}>
          Friday ends at 13:00
        </Checkbox>
        <label>
          Default task type
          <Select aria-label="Default task type" data={[{ value: 'fixedUnit', label: 'fixedUnit' }, { value: 'fixedWork', label: 'fixedWork' }, { value: 'fixedDuration', label: 'fixedDuration' }]} value={type} onValueChange={(value) => value != null && setType(value as GanttTaskType)} />
        </label>
        <Button variant="outline" type="button" onClick={() => setStatus(`Commissioning: ${apiRef.current?.formatDuration('4')}, ${apiRef.current?.formatWork('4')}; handover: ${apiRef.current?.formatDuration('6')}`)}>
          formatDuration / formatWork
        </Button>
      </div>
      <Gantt<Task>
        ref={apiRef}
        aria-label="Plant upgrade with calendars"
        data={data}
        taskFields={{ parentId: 'parentId' }}
        columns={COLUMNS}
        resources={people}
        timeZone={zone}
        locale="en-GB"
        workingTime={workingTime}
        holidays={HOLIDAYS}
        highlightWeekends
        calendars={calendars}
        workUnit="hour"
        taskType={type}
        timeline={TIMELINE}
        dateFormat={DATE_FORMAT}
        height={420}
        onDataChange={(rows) => setData(rows)}
      />
      <p className="demo-status" aria-live="polite">
        {status || 'Change a resource unit or the work of Commissioning to see the task type at work'}
      </p>
    </div>
  );
}
