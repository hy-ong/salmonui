'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Scheduler, type SchedulerApi } from '@salmonui/scheduler';

// Your own property names, mapped to the Scheduler roles through eventFields.
type Row = { Id: number; Subject: string; StartTime: string; EndTime: string; Room?: string; Locked?: boolean; Blocked?: boolean };

const initial: Row[] = [
  { Id: 1, Subject: 'Client workshop', StartTime: '2026-11-23T10:00', EndTime: '2026-11-23T12:00', Room: 'Atrium' },
  { Id: 2, Subject: 'Board meeting (locked)', StartTime: '2026-11-24T09:00', EndTime: '2026-11-24T11:00', Room: 'Boardroom', Locked: true },
  { Id: 3, Subject: 'Maintenance window', StartTime: '2026-11-25T12:00', EndTime: '2026-11-25T14:00', Blocked: true },
  { Id: 4, Subject: 'Team lunch', StartTime: '2026-11-26T12:30', EndTime: '2026-11-26T13:30', Room: 'Cafe' },
];

/** Editing permissions, mapped and validated fields, quick info popups and the editor dialog, overlap rules, blocked and read-only events, inline editing, click events and the CRUD methods. */
export default function SchedulerEditingDemo() {
  const apiRef = useRef<SchedulerApi<Row>>(null);
  const [rows, setRows] = useState<readonly Row[]>(initial);
  const [perm, setPerm] = useState({ add: true, edit: true, delete: true });
  const [overlap, setOverlap] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [inline, setInline] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((lines) => [line, ...lines].slice(0, 10));
  const toggle = (key: keyof typeof perm) => setPerm((p) => ({ ...p, [key]: !p[key] }));
  return (
    <div>
      <div className="demo-toolbar">
        {(['add', 'edit', 'delete'] as const).map((key) => (
          <Checkbox key={key} checked={perm[key]} onCheckedChange={() => toggle(key)}>
            editing.{key}
          </Checkbox>
        ))}
        <Checkbox checked={!overlap} onCheckedChange={(checked) => setOverlap(!checked)}>
          Prevent overlaps
        </Checkbox>
        <Checkbox checked={readOnly} onCheckedChange={(checked) => setReadOnly(checked)}>
          readOnly
        </Checkbox>
        <Checkbox checked={inline} onCheckedChange={(checked) => setInline(checked)}>
          Inline editing
        </Checkbox>
      </div>
      <div className="demo-toolbar">
        <Button variant="outline" type="button" onClick={() => add(`addEvents: ${apiRef.current?.addEvents([{ Id: 0, Subject: 'Added from code', StartTime: '2026-11-27T15:00', EndTime: '2026-11-27T16:00', Room: 'Atrium' }]).status}`)}>
          addEvents
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            const row = rows.find((r) => r.Id === 4);
            if (row) add(`saveEvent: ${apiRef.current?.saveEvent({ ...row, StartTime: '2026-11-26T13:00', EndTime: '2026-11-26T14:00' }).status}`);
          }}
        >
          saveEvent (lunch to 13:00)
        </Button>
        <Button variant="outline" type="button" onClick={() => add(`deleteEvents: ${apiRef.current?.deleteEvents([1]).status}`)}>
          deleteEvents([1])
        </Button>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.openEditor({ start: '2026-11-27T09:00', end: '2026-11-27T10:00' })}>
          openEditor (new)
        </Button>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.openQuickInfo(4)}>
          openQuickInfo(4)
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            const free = apiRef.current?.isSlotAvailable(new Date(Date.UTC(2026, 10, 23, 10, 30)), new Date(Date.UTC(2026, 10, 23, 11, 0)));
            add(`isSlotAvailable(Mon 10:30-11:00): ${String(free)}`);
          }}
        >
          isSlotAvailable(Mon 10:30)
        </Button>
      </div>
      <Scheduler<Row>
        ref={apiRef}
        data={rows}
        eventFields={{
          id: 'Id',
          title: { field: 'Subject', label: 'Subject', validation: { required: 'A subject is required.', minLength: 3 } },
          start: 'StartTime',
          end: 'EndTime',
          location: { field: 'Room', label: 'Room', defaultValue: 'Atrium', validation: { validate: (v) => (v === 'Basement' ? 'The basement is closed.' : null) } },
          readOnly: 'Locked',
          block: 'Blocked',
        }}
        editing={{ ...perm, inline }}
        readOnly={readOnly}
        overlap={overlap}
        onOverlap={(e) => add(`onOverlap: ${e.row.Subject} collides with ${e.conflicts.map((c) => c.Subject).join(', ')}`)}
        view="week"
        views={['day', 'week', 'month']}
        date="2026-11-23"
        timeZone="UTC"
        height={540}
        scrollTime="08:00"
        onCellClick={(e) => add(`onCellClick ${e.start.toISOString().slice(5, 16)}${e.allDay ? ' (all day)' : ''}`)}
        onCellDoubleClick={() => add('onCellDoubleClick')}
        onEventClick={(e) => add(`onEventClick ${e.row.Subject}`)}
        onEventDoubleClick={(e) => add(`onEventDoubleClick ${e.row.Subject}`)}
        onBeforePopupOpen={(e) => add(`onBeforePopupOpen(${e.popup})`)}
        onPopupClose={(e) => add(`onPopupClose(${e.popup})`)}
        onAdd={(e) => {
          setRows(e.data);
          add(`onAdd: ${e.rows.map((r) => r.Subject).join(', ')}`);
        }}
        onSave={(e) => {
          setRows(e.data);
          add(`onSave: ${e.changed.map((r) => r.Subject).join(', ')}`);
        }}
        onDelete={(e) => {
          setRows(e.data);
          add(`onDelete: ${e.deleted.map((r) => r.Subject).join(', ')}`);
        }}
      />
      <div className="demo-log" aria-live="polite">
        <ol>{log.length ? log.map((line, i) => <li key={`${i}-${line}`}>{line}</li>) : <li>Click a cell or an event</li>}</ol>
      </div>
    </div>
  );
}
