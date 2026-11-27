'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Scheduler, type SchedulerApi, type SchedulerResource } from '@salmonui/scheduler';

type Room = { id: number; text: string; color: string };
type Person = { id: number; text: string; parentId: number; workDays: number[]; role: string };
type Row = { id: number; title: string; start: string; end: string; roomId: number; personIds: number[] };

const ROOMS: Room[] = [
  { id: 1, text: 'Studio', color: '#d9480f' },
  { id: 2, text: 'Lab', color: '#1971c2' },
];
const PEOPLE: Person[] = [
  { id: 10, text: 'Ana', parentId: 1, workDays: [1, 2, 3, 4, 5], role: 'Producer' },
  { id: 11, text: 'Ben', parentId: 1, workDays: [1, 2, 3], role: 'Editor (Mon to Wed)' },
  { id: 12, text: 'Chen', parentId: 2, workDays: [2, 3, 4, 5], role: 'Engineer (Tue to Fri)' },
];
const rows: Row[] = [
  { id: 1, title: 'Shoot', start: '2026-11-23T09:00', end: '2026-11-23T12:00', roomId: 1, personIds: [10, 11] },
  { id: 2, title: 'Edit', start: '2026-11-24T13:00', end: '2026-11-24T16:00', roomId: 1, personIds: [11] },
  { id: 3, title: 'Prototype', start: '2026-11-25T10:00', end: '2026-11-25T15:00', roomId: 2, personIds: [12] },
  { id: 4, title: 'All hands', start: '2026-11-26T11:00', end: '2026-11-26T12:00', roomId: 2, personIds: [10, 12] },
];

/** Resource grouping by parent or every combination, dates above resources, shared events, resource header templates and tooltips, reactive resources, per-resource work days, timeline work week, year options and timeline header rows. */
export default function SchedulerResourcesDemo() {
  const apiRef = useRef<SchedulerApi<Row>>(null);
  const [byDate, setByDate] = useState(false);
  const [byParent, setByParent] = useState(true);
  const [shared, setShared] = useState(true);
  const [hideOff, setHideOff] = useState(false);
  const [people, setPeople] = useState<Person[]>(PEOPLE);
  const [status, setStatus] = useState('');
  const rooms: SchedulerResource<Room> = { field: 'roomId', name: 'rooms', label: 'Room', data: ROOMS };
  const staff: SchedulerResource<Person> = { field: 'personIds', name: 'people', label: 'People', multiple: true, data: people };
  return (
    <div>
      <div className="demo-toolbar">
        <Checkbox checked={byDate} onCheckedChange={(checked) => setByDate(checked)}>
          Dates above resources
        </Checkbox>
        <Checkbox checked={!byParent} onCheckedChange={(checked) => setByParent(!checked)}>
          Everyone under every room
        </Checkbox>
        <Checkbox checked={shared} onCheckedChange={(checked) => setShared(checked)}>
          Shared events select together
        </Checkbox>
        <Checkbox checked={hideOff} onCheckedChange={(checked) => setHideOff(checked)}>
          Hide each person&apos;s days off
        </Checkbox>
        <Button variant="outline" type="button" disabled={people.some((p) => p.id === 13)} onClick={() => setPeople((list) => [...list, { id: 13, text: 'Dana', parentId: 2, workDays: [1, 2, 3, 4, 5], role: 'Intern' }])}>
          Add Dana to the Lab
        </Button>
        <Button variant="outline" type="button" disabled={!people.some((p) => p.id === 13)} onClick={() => setPeople((list) => list.filter((p) => p.id !== 13))}>
          Remove Dana
        </Button>
        <Button variant="outline" type="button" onClick={() => setStatus(`getResources(): ${(apiRef.current?.getResources() ?? []).map((r) => `${r.resource}:${r.text}`).join(', ')}`)}>
          getResources()
        </Button>
      </div>
      <Scheduler<Row>
        ref={apiRef}
        data={rows}
        resources={[rooms, staff]}
        grouping={{ resources: ['rooms', 'people'], byDate, byParent, sharedEvents: shared, hideNonWorkingDays: hideOff }}
        renderResourceHeader={({ resource, level }) => (level === 0 ? <strong>{resource.text}</strong> : <span>{resource.text}</span>)}
        renderResourceTooltip={({ resource }) => (resource.data as Partial<Person>).role ?? `Room: ${resource.text}`}
        view="workWeek"
        views={[
          'workWeek',
          { type: 'timelineWorkWeek', headerRows: [{ unit: 'week', render: ({ text }) => <em>{text}</em> }, { unit: 'date' }, { unit: 'hour' }] },
          { type: 'year', firstMonthOfYear: 9, monthCount: 6, renderMonthHeader: ({ text }) => <strong>{text}</strong> },
        ]}
        date="2026-11-23"
        timeZone="UTC"
        locale="en-GB"
        startHour="08:00"
        endHour="18:00"
        height={560}
      />
      <p className="demo-status" aria-live="polite">
        {status || 'Hover a person heading for the tooltip'}
      </p>
    </div>
  );
}
