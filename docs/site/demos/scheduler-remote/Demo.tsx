'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Scheduler, type SchedulerApi, type SchedulerDataSource } from '@salmonui/scheduler';

type Row = { id: number; title: string; start: string; end: string };

const pad = (n: number) => String(n).padStart(2, '0');
// The "server": two events per weekday from November 2026 to January 2027.
function serverRows(): Row[] {
  const out: Row[] = [];
  let id = 1;
  for (let t = Date.UTC(2026, 10, 1); t < Date.UTC(2027, 1, 1); t += 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const day = d.toISOString().slice(0, 10);
    out.push({ id: id++, title: 'Standup', start: `${day}T09:00`, end: `${day}T09:15` });
    out.push({ id: id++, title: `Focus block ${pad(d.getUTCDate())}`, start: `${day}T13:00`, end: `${day}T15:00` });
  }
  return out;
}

/** A remote event source read per visible range with latency, writes that the server can reject, the loading indicator and the query methods. */
export default function SchedulerRemoteDemo() {
  const apiRef = useRef<SchedulerApi<Row>>(null);
  const server = useRef<Row[] | null>(null);
  const [reject, setReject] = useState(false);
  const rejectRef = useRef(false);
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((lines) => [line, ...lines].slice(0, 8));
  const source = useMemo<SchedulerDataSource<Row>>(
    () => ({
      read: ({ range, signal }) =>
        new Promise((resolve, rejectRead) => {
          const db = (server.current ??= serverRows());
          const from = range.start.toISOString().slice(0, 10);
          const to = range.end.toISOString().slice(0, 10);
          const timer = setTimeout(() => resolve({ rows: db.filter((r) => r.start >= from && r.start < to) }), 600);
          signal.addEventListener('abort', () => {
            clearTimeout(timer);
            rejectRead(new DOMException('Aborted', 'AbortError'));
          });
        }),
      write: ({ action, added, changed, deleted }) =>
        new Promise((resolve) =>
          setTimeout(() => {
            if (rejectRef.current) return resolve({ status: 'rejected' });
            const db = (server.current ??= serverRows());
            for (const r of deleted) db.splice(db.findIndex((x) => x.id === r.id), 1);
            for (const r of changed) db.splice(db.findIndex((x) => x.id === r.id), 1, r);
            db.push(...added);
            resolve({ status: 'applied' });
            add(`write ${action}: +${added.length} ~${changed.length} -${deleted.length}`);
          }, 500),
        ),
    }),
    [],
  );
  return (
    <div>
      <div className="demo-toolbar">
        <Checkbox
          checked={reject}
          onCheckedChange={(checked) => {
            rejectRef.current = checked;
            setReject(checked);
          }}
        >
          Server rejects writes
        </Checkbox>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.reloadEvents()}>
          reloadEvents()
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            apiRef.current?.setLoading(true);
            setTimeout(() => apiRef.current?.setLoading(false), 1500);
          }}
        >
          setLoading for 1.5 s
        </Button>
        <Button variant="outline" type="button" onClick={() => add(`getViewEvents(): ${apiRef.current?.getViewEvents().length ?? 0} occurrences in view`)}>
          getViewEvents()
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            const list = apiRef.current?.getEvents({ start: new Date(Date.UTC(2026, 10, 25)), end: new Date(Date.UTC(2026, 10, 26)) }) ?? [];
            add(`getEvents(25 Nov): ${list.map((e) => e.row.title).join(', ') || 'none'}`);
          }}
        >
          getEvents(25 Nov)
        </Button>
        <Button variant="outline" type="button" onClick={() => add(`getViewDates(): ${apiRef.current?.getViewDates().map(String).join(', ') ?? ''}`)}>
          getViewDates()
        </Button>
      </div>
      <Scheduler<Row>
        ref={apiRef}
        data={source}
        view="week"
        views={['day', 'week', 'month']}
        date="2026-11-23"
        timeZone="UTC"
        height={520}
        scrollTime="08:00"
        renderLoading={() => <span role="status">Loading events from the server…</span>}
        onDataLoad={(e) => add(`onDataLoad: ${e.rows.length} rows for ${e.range.start.toISOString().slice(0, 10)} to ${e.range.end.toISOString().slice(0, 10)}`)}
        onError={(e) => add(`onError(${e.action}): ${String(e.error)}; the change was reverted`)}
      />
      <div className="demo-log" aria-live="polite">
        <ol>{log.length ? log.map((line, i) => <li key={`${i}-${line}`}>{line}</li>) : <li>Navigate, edit or press a button</li>}</ol>
      </div>
    </div>
  );
}
