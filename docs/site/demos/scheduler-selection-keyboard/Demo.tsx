'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Scheduler, type EventId, type SchedulerApi } from '@salmonui/scheduler';

type Row = { id: number; title: string; start: string; end: string; location?: string; private?: boolean };

const initial: Row[] = [
  { id: 1, title: 'Design sync', start: '2026-11-23T09:00', end: '2026-11-23T10:00', location: 'Room 2' },
  { id: 2, title: 'Code review', start: '2026-11-23T11:00', end: '2026-11-23T12:00', location: 'Online' },
  { id: 3, title: 'Doctor (private)', start: '2026-11-24T08:00', end: '2026-11-24T09:00', private: true },
  { id: 4, title: 'Release check', start: '2026-11-25T15:00', end: '2026-11-25T16:00', location: 'Room 5' },
];

/** Cell range selection, event selection with Ctrl and Shift, keyboard grid navigation and remapped shortcuts, clipboard copy, cut and paste, a context menu and event tooltips. */
export default function SchedulerSelectionKeyboardDemo() {
  const apiRef = useRef<SchedulerApi<Row>>(null);
  const [rows, setRows] = useState<readonly Row[]>(initial);
  const [selected, setSelected] = useState<readonly EventId[]>([]);
  const [range, setRange] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((lines) => [line, ...lines].slice(0, 8));
  const hhmm = (d: Date) => d.toISOString().slice(5, 16).replace('T', ' ');
  return (
    <div>
      <div className="demo-toolbar">
        <Button variant="outline" type="button" onClick={() => setSelected([1, 2])}>
          Select design sync and code review
        </Button>
        <Button variant="outline" type="button" onClick={() => void apiRef.current?.copy().then((n) => add(`api.copy(): ${n}`))}>
          api.copy()
        </Button>
        <Button variant="outline" type="button" onClick={() => void apiRef.current?.paste({ start: new Date(Date.UTC(2026, 10, 27, 9)) }).then((r) => add(`api.paste(Fri 09:00): ${r.status}`))}>
          api.paste(Fri 09:00)
        </Button>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.closeTooltip()}>
          closeTooltip()
        </Button>
      </div>
      <Scheduler<Row>
        ref={apiRef}
        aria-label="Team calendar"
        data={rows}
        view="week"
        views={['day', 'week', 'workWeek', 'month']}
        date="2026-11-23"
        timeZone="UTC"
        locale="en-GB"
        height={520}
        scrollTime="08:00"
        cellSelection="multiple"
        cellSelectionRows={false}
        onCellSelectionChange={(s) => setRange(`${hhmm(s.start)} to ${hhmm(s.end)}${s.allDay ? ' (all day)' : ''}`)}
        selectedEventIds={selected}
        onEventSelectionChange={(ids, e) => {
          setSelected(ids);
          add(`onEventSelectionChange: [${ids.join(', ')}] via ${e.source}`);
        }}
        keyBindings={{ 'navigation.next': ['Alt+PageDown', 'Mod+ArrowRight'], 'navigation.previous': ['Alt+PageUp', 'Mod+ArrowLeft'] }}
        clipboard
        onBeforePaste={(e) => {
          e.data = e.data.map((r) => ({ ...r, title: e.cut ? r.title : `${r.title} (copy)` }));
          add(`onBeforePaste: ${e.data.length} event(s), cut ${String(e.cut)}`);
        }}
        contextMenu={(ctx) =>
          ctx.kind === 'event'
            ? [{ id: 'edit', label: 'Edit' }, { id: 'duplicate', label: 'Duplicate to next day' }, { type: 'separator' }, { id: 'delete', label: 'Delete' }]
            : [{ id: 'newEvent', label: 'New event' }, { id: 'newRecurringEvent', label: 'New recurring event' }, { id: 'today', label: 'Today' }]
        }
        onContextMenuItemClick={(e) => {
          add(`onContextMenuItemClick: ${e.id} on ${e.context.kind}`);
          if (e.id === 'duplicate' && e.context.kind === 'event') {
            const r = e.context.row;
            const shift = (s: string) => new Date(new Date(`${s}Z`).getTime() + 86_400_000).toISOString().slice(0, 16);
            apiRef.current?.addEvents([{ ...r, id: 0, title: `${r.title} (copy)`, start: shift(r.start), end: shift(r.end) }]);
          }
        }}
        tooltip={{ render: ({ row }) => `${row.title}${row.location ? ` · ${row.location}` : ''}` }}
        onBeforeTooltipOpen={(e) => {
          if (e.row.private) e.preventDefault();
        }}
        onAdd={(e) => setRows(e.data)}
        onSave={(e) => setRows(e.data)}
        onDelete={(e) => setRows(e.data)}
      />
      <p className="demo-status" aria-live="polite">
        Selected events: [{selected.join(', ')}] · Selected cells: {range || 'none'}
      </p>
      <div className="demo-log">
        <ol>{log.length ? log.map((line, i) => <li key={`${i}-${line}`}>{line}</li>) : <li>Select, copy, paste or right-click</li>}</ol>
      </div>
    </div>
  );
}
