'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Scheduler, type SchedulerApi, type SchedulerExportWriters } from '@salmonui/scheduler';

type Row = { id: number | string; title: string; start: string | Date; end: string | Date; location?: string; recurrenceRule?: string; recurrenceExceptions?: string };

const initial: Row[] = [
  { id: 1, title: 'Standup', start: '2026-11-23T09:00', end: '2026-11-23T09:15', recurrenceRule: 'FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR', recurrenceExceptions: '20261125T090000Z', location: 'Room 1' },
  { id: 2, title: 'Budget review', start: '2026-11-24T14:00', end: '2026-11-24T15:30', location: 'Boardroom' },
  { id: 3, title: '=HYPERLINK("x") formula-looking title', start: '2026-11-26T11:00', end: '2026-11-26T12:00' },
];

// Writers load on first use: dynamic imports of @salmonui/export subpaths.
const writers: SchedulerExportWriters = {
  excel: () => import('@salmonui/export/xlsx'),
  ics: () => import('@salmonui/export/ics'),
};

const SAMPLE_ICS = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Demo//EN', 'BEGIN:VEVENT', 'UID:imported-1@demo', 'DTSTAMP:20261120T000000Z', 'DTSTART:20261127T130000Z', 'DTEND:20261127T140000Z', 'SUMMARY:Imported workshop', 'LOCATION:Online', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');

/** Excel, CSV and iCalendar export through lazily loaded writers, iCalendar import from a file or text, and printing the rendered view. */
export default function SchedulerExportPrintDemo() {
  const apiRef = useRef<SchedulerApi<Row>>(null);
  const [rows, setRows] = useState<readonly Row[]>(initial);
  const [preview, setPreview] = useState('');
  const [status, setStatus] = useState('');
  const download = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div>
      <div className="demo-toolbar">
        <Checkbox
          defaultChecked
          onCheckedChange={(checked) => {
            download.current = checked;
          }}
        >
          Download files
        </Checkbox>
        <Button
          variant="outline"
          type="button"
          onClick={() =>
            void apiRef.current?.exportToExcel({ fields: ['title', 'start', 'end', 'location'], headerTexts: { title: 'Subject' }, fileName: 'week', sheetName: 'Week 48', download: download.current }).then((f) => setStatus(f ? `${f.fileName}: ${f.data.byteLength} bytes (${f.mimeType})` : 'cancelled'))
          }
        >
          Export Excel
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={() =>
            void apiRef.current?.exportToCsv({ includeOccurrences: true, separator: ';', fileName: 'week', download: download.current }).then((f) => {
              setStatus(f ? `${f.fileName} (${f.mimeType})` : 'cancelled');
              setPreview(f?.data ?? '');
            })
          }
        >
          Export CSV (occurrences)
        </Button>
        <Button
          variant="outline"
          type="button"
          onClick={() =>
            void apiRef.current?.exportToICalendar({ calendarName: 'Team week', fileName: 'team', download: download.current }).then((f) => {
              setStatus(f ? `${f.fileName} (${f.mimeType})` : 'cancelled');
              setPreview(f?.data ?? '');
            })
          }
        >
          Export iCalendar
        </Button>
        <Button variant="outline" type="button" onClick={() => void apiRef.current?.importICalendar(SAMPLE_ICS).then((r) => setStatus(`importICalendar: ${r.status}, ${r.rows.length} event(s)`))}>
          Import sample .ics
        </Button>
        <Button variant="outline" type="button" onClick={() => fileInput.current?.click()}>
          Import a .ics file…
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept=".ics,text/calendar"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void apiRef.current?.importICalendar(file).then((r) => setStatus(`importICalendar(${file.name}): ${r.status}, ${r.rows.length} event(s)`));
          }}
        />
        <Button variant="outline" type="button" onClick={() => void apiRef.current?.print({ width: '27cm' }).then((ok) => setStatus(`print(): ${String(ok)}`))}>
          Print
        </Button>
      </div>
      <Scheduler<Row>
        ref={apiRef}
        data={rows}
        view="week"
        views={['week', 'month']}
        date="2026-11-23"
        timeZone="Europe/Berlin"
        locale="en-GB"
        height={480}
        scrollTime="08:00"
        exportWriters={writers}
        onExport={(e) => setStatus(`onExport(${e.format}): ${e.file.fileName}`)}
        onBeforePrint={() => setStatus('onBeforePrint')}
        onAfterPrint={() => setStatus('onAfterPrint: the print dialog closed')}
        onAdd={(e) => setRows(e.data)}
        onSave={(e) => setRows(e.data)}
        onDelete={(e) => setRows(e.data)}
      />
      <p className="demo-status" aria-live="polite">
        {status || 'Export, import or print'}
      </p>
      {preview ? <pre className="demo-log" style={{ maxBlockSize: 200, whiteSpace: 'pre-wrap' }}>{preview}</pre> : null}
    </div>
  );
}
