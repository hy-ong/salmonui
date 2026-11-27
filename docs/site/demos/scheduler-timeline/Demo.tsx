'use client';

import { useState } from 'react';
import { Scheduler, type SchedulerResource } from '@salmonui/scheduler';

type Row = { id: number; title: string; start: string; end: string; allDay?: boolean; roomId?: number; ownerIds?: number[] };

const rooms: SchedulerResource = {
  field: 'roomId',
  name: 'rooms',
  label: 'Room',
  data: [
    { id: 1, text: 'Studio', color: '#d9480f', startHour: '08:00', endHour: '14:00' },
    { id: 2, text: 'Lab', color: '#1971c2' },
  ],
};
const owners: SchedulerResource = {
  field: 'ownerIds',
  name: 'owners',
  label: 'Owners',
  multiple: true,
  data: [
    { id: 10, text: 'Ana', parentId: 1 },
    { id: 11, text: 'Ben', parentId: 1 },
    { id: 12, text: 'Chen', parentId: 2 },
  ],
};

const initial: Row[] = [
  { id: 1, title: 'Shoot', start: '2026-11-24T09:00', end: '2026-11-24T12:00', roomId: 1, ownerIds: [10, 11] },
  { id: 2, title: 'Edit', start: '2026-11-24T13:00', end: '2026-11-24T16:00', roomId: 1, ownerIds: [11] },
  { id: 3, title: 'Prototype', start: '2026-11-25', end: '2026-11-27', allDay: true, roomId: 2, ownerIds: [12] },
  { id: 4, title: 'Review', start: '2026-11-26T10:00', end: '2026-11-26T11:00', roomId: 2, ownerIds: [12] },
];

/** Rooms and their people as timeline rows, with the timeline, year and agenda views; edits update the rows. */
export default function SchedulerTimelineDemo() {
  const [rows, setRows] = useState<readonly Row[]>(initial);
  return (
    <div className="demo-stack">
      <Scheduler
        data={rows}
        resources={[rooms, owners]}
        grouping={{ resources: ['rooms', 'owners'] }}
        view="timelineWeek"
        views={['timelineDay', 'timelineWeek', 'timelineMonth', { type: 'timelineYear', orientation: 'vertical' }, 'year', 'agenda', 'monthAgenda']}
        timeScale={{ interval: 60, slotCount: 1 }}
        date="2026-11-24"
        timeZone="UTC"
        height={560}
        onAdd={(e) => setRows(e.data)}
        onSave={(e) => setRows(e.data)}
        onDelete={(e) => setRows(e.data)}
      />
      <p className="demo-status" aria-live="polite">
        {rows.length} rows
      </p>
    </div>
  );
}
