'use client';

import { useState } from 'react';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { datePickerEditor } from '@salmonui/calendars/date-picker/data-grid';

type Milestone = { id: number; name: string; due: string; review: string };

const rows: Milestone[] = [
  { id: 1, name: 'Design freeze', due: '2026-12-04', review: '2026-12-03T10:00:00Z' },
  { id: 2, name: 'Beta', due: '2027-01-15', review: '2027-01-14T14:30:00Z' },
  { id: 3, name: 'Release candidate', due: '2027-02-19', review: '2027-02-18T09:00:00Z' },
  { id: 4, name: 'General availability', due: '2027-03-05', review: '2027-03-04T16:00:00Z' },
];

const weekend = (d: { year: number; month: number; day: number }): boolean => {
  const day = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
  return day === 0 || day === 6;
};

const columns: DataGridColumn<Milestone>[] = [
  { field: 'id', header: 'ID', primaryKey: true, width: 70, editable: false },
  { field: 'name', header: 'Milestone', width: 200 },
  {
    field: 'due',
    header: 'Due (DatePicker editor)',
    type: 'date',
    format: 'yMMMd',
    width: 210,
    renderEditor: datePickerEditor({ locale: 'en-GB' }),
    // Column editorProps reach the DatePicker under the same names as DatePicker props.
    editorProps: { min: '2026-12-01', max: '2027-06-30', firstDayOfWeek: 1, showWeekNumbers: true, isDateDisabled: weekend },
  },
  {
    field: 'review',
    header: 'Review (date and time, UTC)',
    type: 'datetime',
    format: 'yMMMdHm',
    width: 240,
    renderEditor: datePickerEditor({ granularity: 'minute', timeZone: 'UTC', hourCycle: 'h23' }),
    editorProps: { timeStep: 15, minTime: '08:00', maxTime: '18:00' },
  },
];

/** A Data Grid whose date and date-time columns edit with the public DatePicker through datePickerEditor and column editorProps. */
export default function DatePickerDataGridDemo() {
  const [last, setLast] = useState('');
  return (
    <div>
      <DataGrid<Milestone>
        aria-label="Release milestones"
        data={rows}
        columns={columns}
        height={240}
        locale="en-GB"
        timeZone="UTC"
        editing={{ mode: 'cell' }}
        onSave={(e) => setLast(e.rows().changedRecords.map((row) => JSON.stringify(row)).join(', '))}
      />
      <p className="demo-status" aria-live="polite">
        Last save: <code>{last || 'none'}</code>
      </p>
    </div>
  );
}
