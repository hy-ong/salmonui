'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Select } from '@salmonui/dropdowns/select';
import { TextField } from '@salmonui/inputs/text-field';
import { RecurrenceEditor, Scheduler } from '@salmonui/scheduler';

type Row = { id: number; title: string; start: string; end: string; kind: 'meeting' | 'focus' | 'travel'; recurrenceRule?: string };

const initial: Row[] = [
  { id: 1, title: 'Planning', start: '2026-11-23T09:00', end: '2026-11-23T10:30', kind: 'meeting', recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO' },
  { id: 2, title: 'Deep work', start: '2026-11-24T13:00', end: '2026-11-24T16:00', kind: 'focus' },
  { id: 3, title: 'Train to Munich', start: '2026-11-25T07:00', end: '2026-11-25T11:00', kind: 'travel' },
  { id: 4, title: 'Customer demo', start: '2026-11-26T15:00', end: '2026-11-26T16:00', kind: 'meeting' },
];

const ICON: Record<Row['kind'], string> = { meeting: '👥', focus: '🎯', travel: '🚆' };
const HOLIDAY = '2026-11-27';
const KINDS = [
  { value: 'meeting', label: 'Meeting' },
  { value: 'focus', label: 'Focus' },
  { value: 'travel', label: 'Travel' },
];

/** Event, cell, header and date range templates, render hooks, custom quick info content and a custom editor dialog that embeds RecurrenceEditor. */
export default function SchedulerTemplatesDemo() {
  const [rows, setRows] = useState<readonly Row[]>(initial);
  return (
    <Scheduler<Row>
      data={rows}
      view="week"
      views={['week', { type: 'month', renderEvent: ({ row }) => <span>{`${ICON[row.kind]} ${row.title}`}</span> }]}
      date="2026-11-23"
      timeZone="UTC"
      locale="en-GB"
      height={560}
      scrollTime="07:00"
      renderEvent={({ row, timeText, recurring }) => (
        <span style={{ display: 'grid' }}>
          <strong>
            <span aria-hidden="true">{ICON[row.kind]} </span>
            {row.title}
            {recurring ? ' (repeats)' : ''}
          </strong>
          <small>{timeText}</small>
        </span>
      )}
      getEventProps={({ row }) => ({ className: `demo-event demo-event--${row.kind}`, 'data-kind': row.kind, ...(row.kind === 'travel' ? { style: { fontStyle: 'italic' } } : {}) })}
      getCellProps={({ part, date }) => (date.toString() === HOLIDAY && (part === 'workCell' || part === 'dateHeader' || part === 'allDayCell') ? { title: 'Company holiday', 'data-holiday': true, style: { background: 'var(--salmon-color-warning-subtle)' } } : undefined)}
      renderDateHeader={({ date }) => (
        <span>
          {date.day}/{date.month}
          {date.toString() === HOLIDAY ? ' 🎉' : ''}
        </span>
      )}
      renderCellHeader={({ date }) => <span>{date.day === 1 ? `1 ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.month - 1]}` : date.day}</span>}
      renderCell={({ part, date }) => (part === 'monthCell' && date.toString() === HOLIDAY ? <small style={{ opacity: 0.7 }}>Holiday</small> : null)}
      renderHeaderIndent={() => <small>UTC</small>}
      renderDateRange={({ text }) => <span>📅 {text}</span>}
      renderToolbar={({ items, dateRangeText }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {items}
          <span className="demo-status" style={{ margin: 0 }}>
            Showing {dateRangeText}
          </span>
        </div>
      )}
      quickInfo={{
        renderHeader: (ctx) => <strong>{ctx.kind === 'event' && ctx.row ? `${ICON[ctx.row.kind]} ${ctx.row.title}` : 'New entry'}</strong>,
        renderContent: (ctx) => <p style={{ margin: 0 }}>{`${ctx.start.toISOString().slice(11, 16)} to ${ctx.end.toISOString().slice(11, 16)} UTC`}</p>,
        renderFooter: (ctx) => (
          <Button variant="outline" type="button" onClick={ctx.close}>
            Got it
          </Button>
        ),
      }}
      editing={{
        renderDialogHeader: ({ isNew }) => <span>{isNew ? 'Plan something' : 'Change the plan'}</span>,
        renderDialog: ({ values, setValue, errors }) => (
          <div style={{ display: 'grid', gap: 12 }}>
            <TextField label="Title" value={String(values['title'] ?? '')} onValueChange={(value) => setValue('title', value)} invalid={Boolean(errors['title'])} />
            <label style={{ display: 'grid', gap: 4 }}>
              Kind
              <Select aria-label="Kind" data={KINDS} value={String(values['kind'] ?? 'meeting')} onValueChange={(value) => value != null && setValue('kind', String(value))} />
            </label>
            <RecurrenceEditor value={(values['recurrenceRule'] as string | null | undefined) ?? null} onValueChange={(rule) => setValue('recurrenceRule', rule)} start={values['start'] instanceof Date ? values['start'] : undefined} />
          </div>
        ),
        renderDialogFooter: ({ save, cancel, delete: remove, isNew }) => (
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {isNew ? null : (
              <Button variant="outline" tone="danger" type="button" onClick={remove}>
                Delete
              </Button>
            )}
            <Button variant="outline" type="button" onClick={cancel}>
              Cancel
            </Button>
            <Button tone="primary" type="button" onClick={save}>
              Save plan
            </Button>
          </div>
        ),
      }}
      onAdd={(e) => setRows(e.data)}
      onSave={(e) => setRows(e.data)}
      onDelete={(e) => setRows(e.data)}
    />
  );
}
