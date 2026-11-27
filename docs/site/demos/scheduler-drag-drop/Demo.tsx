'use client';

import { useState } from 'react';
import { Scheduler } from '@salmonui/scheduler';

type Row = { id: number | string; title: string; start: string | Date; end: string | Date; locked?: boolean };

const mine: Row[] = [
  { id: 1, title: 'Write report', start: '2026-11-23T09:00', end: '2026-11-23T11:00' },
  { id: 2, title: 'Review PRs', start: '2026-11-24T10:00', end: '2026-11-24T11:00' },
  { id: 3, title: 'Prepare slides', start: '2026-11-24T14:00', end: '2026-11-24T15:30' },
  { id: 4, title: 'Fixed: audit (no drag)', start: '2026-11-25T09:00', end: '2026-11-25T10:00', locked: true },
];
const teammate: Row[] = [{ id: 101, title: 'Pair session', start: '2026-11-23T13:00', end: '2026-11-23T14:00' }];
const backlog = ['Call supplier', 'Update roadmap', 'Expense report'];
const hhmm = (d: Date) => d.toISOString().slice(11, 16);

/** Drag and resize with snapping and cancellable events, multi-drag of selected events, drops from an external list and onto a remove area, and two Schedulers that exchange events. */
export default function SchedulerDragDropDemo() {
  const [rows, setRows] = useState<readonly Row[]>(mine);
  const [other, setOther] = useState<readonly Row[]>(teammate);
  const [selected, setSelected] = useState<readonly (number | string)[]>([]);
  const [items, setItems] = useState(backlog);
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((lines) => [line, ...lines].slice(0, 8));
  const common = { date: '2026-11-23', timeZone: 'UTC', locale: 'en-GB', scrollTime: '08:00', quickInfo: false, views: ['week' as const, 'month' as const] };
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <ul aria-label="Backlog: drag an item onto a time slot" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
          {items.map((item) => (
            <li key={item} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', item)} style={{ padding: '6px 12px', border: '1px solid var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-md)', whiteSpace: 'nowrap', cursor: 'grab' }}>
              {item}
            </li>
          ))}
        </ul>
        <div data-drag-out="" style={{ padding: '6px 12px', border: '1px dashed var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-md)' }}>
          Drop an event here to unschedule it
        </div>
      </div>
      <Scheduler<Row>
        id="drag-mine"
        aria-label="My week"
        data={rows}
        view="week"
        height={460}
        {...common}
        selectedEventIds={selected}
        onEventSelectionChange={(ids) => setSelected(ids)}
        dragOptions={{ snapMinutes: 15, multiple: true, navigateOnEdge: true, dragOutArea: '[data-drag-out]', group: 'team' }}
        onEventDragStart={(e) => {
          if (e.row.locked) {
            e.preventDefault();
            add(`onEventDragStart cancelled for ${e.row.title}`);
          }
        }}
        onEventDrag={(e) => add(`onEventDrag ${e.rows.length} event(s) to ${hhmm(e.start)}`)}
        onBeforeEventDrop={(e) => {
          if (e.start.getUTCHours() < 8) {
            e.preventDefault();
            add('onBeforeEventDrop cancelled: before 08:00');
          }
        }}
        onEventDrop={(e) => add(`onEventDrop ${e.result.status}: ${e.rows.map((r) => r.title).join(', ')}`)}
        onEventResizeStart={(e) => add(`onEventResizeStart (${e.edge})`)}
        onBeforeEventResizeEnd={(e) => {
          if (e.end.getTime() - e.start.getTime() > 3 * 3_600_000) {
            e.preventDefault();
            add('onBeforeEventResizeEnd cancelled: longer than 3 hours');
          }
        }}
        onEventResizeEnd={(e) => add(`onEventResizeEnd ${e.result.status}: ${hhmm(e.start)} to ${hhmm(e.end)}`)}
        onExternalDrop={(e) => {
          const title = e.data?.getData('text/plain');
          if (!title) return null;
          setItems((list) => list.filter((x) => x !== title));
          add(`onExternalDrop ${title} at ${hhmm(e.start)}`);
          return [{ id: `new-${title}`, title, start: e.start, end: new Date(e.start.getTime() + 3_600_000) }];
        }}
        onEventDragOut={(e) => {
          add(`onEventDragOut ${e.row.title}`);
          setRows((list) => list.filter((r) => r.id !== e.row.id));
          setItems((list) => [...list, e.row.title]);
        }}
        swipeNavigation
        onDateChange={(d, e) => add(`onDateChange ${String(d)} (${e.source})`)}
        onAdd={(e) => setRows(e.data)}
        onSave={(e) => setRows(e.data)}
        onDelete={(e) => setRows(e.data)}
      />
      <Scheduler<Row>
        id="drag-teammate"
        aria-label="Teammate's week"
        data={other}
        view="week"
        height={320}
        {...common}
        dragOptions={{ group: 'team' }}
        onAdd={(e) => {
          setOther(e.data);
          add(`Teammate onAdd: ${e.rows.map((r) => r.title).join(', ')}`);
        }}
        onSave={(e) => setOther(e.data)}
        onDelete={(e) => setOther(e.data)}
      />
      <div className="demo-log" aria-live="polite">
        <ol>{log.length ? log.map((line, i) => <li key={`${i}-${line}`}>{line}</li>) : <li>Drag or resize an event</li>}</ol>
      </div>
    </div>
  );
}
