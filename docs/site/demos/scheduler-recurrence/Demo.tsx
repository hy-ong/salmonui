'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { Scheduler, type EditScope, type SchedulerApi } from '@salmonui/scheduler';

type Row = { id: number; title: string; start: string; end: string; recurrenceRule?: string; recurrenceExceptions?: string; recurrenceId?: number; followingId?: number };

const initial: Row[] = [
  // Daily standup; 25 November is skipped (an exception) and 26 November was moved to 10:00 (an edited occurrence).
  { id: 1, title: 'Standup', start: '2026-11-23T09:00', end: '2026-11-23T09:15', recurrenceRule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;COUNT=20', recurrenceExceptions: '20261125T090000Z,20261126T090000Z' },
  { id: 2, title: 'Standup (moved)', start: '2026-11-26T10:00', end: '2026-11-26T10:15', recurrenceId: 1 },
  { id: 3, title: 'Weekly 1:1', start: '2026-11-24T14:00', end: '2026-11-24T14:30', recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU' },
];

const SCOPES = (['occurrence', 'following', 'series'] as const).map((s) => ({ value: s, label: s }));

/** Recurring series with exceptions and an edited occurrence, the scope prompt with "following", a scope chosen in code, recurrence validation and the occurrence methods. */
export default function SchedulerRecurrenceDemo() {
  const apiRef = useRef<SchedulerApi<Row>>(null);
  const [rows, setRows] = useState<readonly Row[]>(initial);
  const [prompt, setPrompt] = useState(true);
  const [scope, setScope] = useState<EditScope>('occurrence');
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((lines) => [line, ...lines].slice(0, 8));
  const day = (d: Date) => d.toISOString().slice(0, 16).replace('T', ' ');
  return (
    <div>
      <div className="demo-toolbar">
        <Checkbox checked={prompt} onCheckedChange={(checked) => setPrompt(checked)}>
          Ask for the scope
        </Checkbox>
        <label>
          Scope without the prompt
          <Select aria-label="Scope without the prompt" data={SCOPES} value={scope} onValueChange={(value) => value != null && setScope(value as EditScope)} disabled={prompt} />
        </label>
        <Button variant="outline" type="button" onClick={() => add(`getOccurrences(1): ${(apiRef.current?.getOccurrences(1) ?? []).slice(0, 6).map((o) => day(o.start)).join(', ')} ...`)}>
          getOccurrences(1)
        </Button>
        <Button variant="outline" type="button" onClick={() => add(`getDeletedOccurrences(1): ${(apiRef.current?.getDeletedOccurrences(1) ?? []).map(day).join(', ') || 'none'}`)}>
          getDeletedOccurrences(1)
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={() => {
            const list = apiRef.current?.getOccurrencesInRange(new Date(Date.UTC(2026, 10, 30)), new Date(Date.UTC(2026, 11, 5))) ?? [];
            add(`getOccurrencesInRange(30 Nov-4 Dec): ${list.length} occurrences`);
          }}
        >
          getOccurrencesInRange
        </Button>
      </div>
      <Scheduler<Row>
        ref={apiRef}
        data={rows}
        view="week"
        views={['week', 'month', 'agenda']}
        date="2026-11-23"
        timeZone="UTC"
        height={480}
        scrollTime="08:00"
        editing={{ following: true, recurrencePrompt: prompt, validateRecurrence: true }}
        onBeforeSave={(e) => {
          if (!prompt && e.occurrenceStart) e.setScope(scope);
        }}
        onBeforeDelete={(e) => {
          if (!prompt && e.occurrenceStart) e.setScope(scope);
        }}
        onBeforePopupOpen={(e) => {
          if (e.popup === 'validationAlert' || e.popup === 'recurrenceAlert') add(`popup: ${e.popup}`);
        }}
        onSave={(e) => {
          setRows(e.data);
          add(`onSave scope ${e.scope}: +${e.added.length} ~${e.changed.length} -${e.deleted.length}`);
        }}
        onDelete={(e) => {
          setRows(e.data);
          add(`onDelete scope ${e.scope}`);
        }}
        onAdd={(e) => setRows(e.data)}
      />
      <div className="demo-log" aria-live="polite">
        <ol>{log.length ? log.map((line, i) => <li key={`${i}-${line}`}>{line}</li>) : <li>Edit or delete an occurrence</li>}</ol>
      </div>
      <details>
        <summary>Rows ({rows.length})</summary>
        <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(rows, null, 1)}</pre>
      </details>
    </div>
  );
}
