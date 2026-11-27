// Calendar pickers browser page (tests/browser/pickers.spec.ts,
// tests/browser/pickers-perf.spec.ts, tests/browser/a11y.spec.ts): one
// DatePicker / DateRangePicker / TimePicker per scenario, each in a
// `section[data-case]`. Every `onValueChange`, `onOpenChange`,
// `onRangeSelect`, `onClear`, `onFocus` and `onBlur` call is appended to
// `window.__pickerLog` as `{ case, type, value, details }`.
//
//   ?only=<case>   renders one scenario (perf runs)
//   ?dir=rtl       sets dir="rtl" on the page
//   ?grid          adds the Data Grid `datePickerEditor` scenario
import { StrictMode, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@salmonui/core/styles.css';
import '@salmonui/calendars/date-picker/styles.css';
import '@salmonui/calendars/date-range-picker/styles.css';
import '@salmonui/calendars/time-picker/styles.css';
import '@salmonui/data-grid/styles.css';
import './app.css';
import { DateField, DatePicker, type PickerHandle } from '@salmonui/calendars/date-picker';
import { DateRangePicker } from '@salmonui/calendars/date-range-picker';
import { TimeField, TimePicker } from '@salmonui/calendars/time-picker';
import { DataGrid, type DataGridColumn } from '@salmonui/data-grid';
import { datePickerEditor } from '@salmonui/calendars/date-picker/data-grid';

interface LogEntry {
  readonly case: string;
  readonly type: string;
  readonly value: unknown;
  readonly details?: unknown;
}

const win = window as unknown as { __pickerLog: LogEntry[]; __pickerRefs: Record<string, PickerHandle | null>; __formData?: Record<string, string> };
win.__pickerLog = [];
win.__pickerRefs = {};

const params = new URLSearchParams(location.search);
const only = params.get('only');
if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';

const log = (c: string, type: string) => (value?: unknown, details?: unknown) => {
  win.__pickerLog.push({ case: c, type, value: value === undefined ? null : JSON.parse(JSON.stringify(value)), details: details === undefined ? undefined : JSON.parse(JSON.stringify(details)) });
};
const events = (c: string) => ({
  onValueChange: log(c, 'value'),
  onOpenChange: log(c, 'open'),
  onClear: () => log(c, 'clear')(),
  onFocus: () => log(c, 'focus')(),
  onBlur: () => log(c, 'blur')(),
  ref: (h: PickerHandle | null) => {
    win.__pickerRefs[c] = h;
  },
});

const weekend = (d: { year: number; month: number; day: number }): boolean => {
  const w = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
  return w === 0 || w === 6;
};

interface Task {
  readonly id: number;
  readonly due: Date;
  readonly at: Date;
}

const tasks: Task[] = [{ id: 1, due: new Date(Date.UTC(2026, 10, 16)), at: new Date(Date.UTC(2026, 10, 16, 9, 30)) }];
// column `editorProps` reach the public DatePicker through `datePickerEditor`.
const taskColumns: DataGridColumn<Task>[] = [
  { field: 'id', header: 'Task', primaryKey: true, width: 80 },
  { field: 'due', header: 'Due', type: 'date', format: 'yyyy-MM-dd', width: 260, renderEditor: datePickerEditor(), editorProps: { min: '2026-11-05', max: '2026-11-27', firstDayOfWeek: 1, calendar: 'japanese', showWeekNumbers: true } },
  { field: 'at', header: 'At', type: 'datetime', format: 'yyyy-MM-dd HH:mm', width: 300, renderEditor: datePickerEditor({ granularity: 'minute', timeZone: 'UTC', hourCycle: 'h23' }), editorProps: { timeStep: 15 } },
];

function TaskGrid() {
  return <DataGrid<Task> aria-label="Tasks" data={tasks} columns={taskColumns} timeZone="UTC" height={160} editing={{ mode: 'cell' }} />;
}

function Case(props: { id: string; title: string; children: ReactNode }) {
  if (only && only !== props.id) return null;
  return (
    <section data-case={props.id} style={{ marginBlockEnd: 16 }}>
      <h2 style={{ fontSize: 14, margin: '0 0 4px' }}>{props.title}</h2>
      {props.children}
    </section>
  );
}

function Controlled() {
  const [value, setValue] = useState<string | null>('2026-11-23');
  const [open, setOpen] = useState(false);
  return (
    <>
      <DatePicker
        {...events('dp-controlled')}
        label="Controlled"
        value={value}
        open={open}
        onOpenChange={(o, d) => {
          log('dp-controlled', 'open')(o, d);
          setOpen(o);
        }}
        onValueChange={(v, d) => {
          log('dp-controlled', 'value')(v, d);
          setValue(v ? v.toString() : null);
        }}
        clearable
      />
      <button type="button" id="set-controlled" onClick={() => setValue('2026-01-15')}>
        Set 2026-01-15
      </button>
      <output id="controlled-value">{value ?? ''}</output>
    </>
  );
}

function VetoOpen() {
  // Controlled `open` that ignores proposals: the popup never opens.
  return <DatePicker {...events('dp-veto')} label="Veto" open={false} defaultValue="2026-11-23" />;
}

function Forms() {
  const form = useRef<HTMLFormElement | null>(null);
  return (
    <form
      id="picker-form"
      ref={form}
      onSubmit={(e) => {
        e.preventDefault();
        win.__formData = Object.fromEntries([...new FormData(e.currentTarget).entries()].map(([k, v]) => [k, String(v)]));
      }}
    >
      <DatePicker {...events('form-date')} label="Due" name="due" required defaultValue="2026-11-23" min="2026-11-01" max="2026-11-30" />
      <DatePicker {...events('form-empty')} label="Required" name="needed" required onInvalid={() => log('form-empty', 'invalid')()} />
      <DatePicker {...events('form-dt')} label="Meeting" name="meeting" granularity="minute" defaultValue="2026-11-23T14:30" timeZone="Europe/Berlin" />
      <DateRangePicker {...events('form-range')} label="Stay" name="stay" defaultValue={{ start: '2026-11-02', end: '2026-11-06' }} />
      <DateRangePicker {...events('form-range2')} label="Trip" startName="from" endName="to" defaultValue={{ start: '2026-12-01', end: '2026-12-03' }} />
      <TimePicker {...events('form-time')} label="Alarm" name="alarm" defaultValue="07:30" />
      <button type="submit" id="submit">
        Submit
      </button>
      <button type="reset" id="reset">
        Reset
      </button>
    </form>
  );
}

function App() {
  return (
    <main style={{ padding: 16 }}>
      <Case id="dp-basic" title="DatePicker">
        <DatePicker {...events('dp-basic')} label="Arrival" description="Check-in day" defaultValue="2026-11-23" min="2026-11-05" max="2026-12-20" showTodayButton />
      </Case>
      <Case id="dp-controlled" title="Controlled">
        <Controlled />
      </Case>
      <Case id="dp-veto" title="Veto open">
        <VetoOpen />
      </Case>
      <Case id="dp-disabled-days" title="Weekends disabled, custom days">
        <DatePicker
          {...events('dp-disabled-days')}
          label="Workday"
          defaultValue="2026-11-23"
          isDateDisabled={weekend}
          getDayProps={(ctx) => (ctx.date.day === 25 ? { className: 'holiday', title: 'Holiday' } : {})}
          renderDay={(ctx) => (ctx.date.day === 1 ? <b>{ctx.date.day}</b> : ctx.date.day)}
          errorMessage="Pick a weekday"
        />
      </Case>
      <Case id="dp-format" title="Pattern format, input formats, popup view events">
        <DatePicker {...events('dp-format')} label="Due" format="dd/MM/yyyy" inputFormats={['d.M.yyyy']} defaultValue="2026-11-23" onViewChange={log('dp-format', 'view')} onFocusedValueChange={(d) => log('dp-format', 'focused')(d)} />
        <DateRangePicker {...events('drp-format')} label="Period" format="dd/MM/yyyy" defaultValue={{ start: '2026-11-02', end: '2026-11-06' }} />
      </Case>
      <Case id="dp-month" title="Month picker">
        <DatePicker {...events('dp-month')} label="Month" granularity="month" defaultValue="2026-11-01" name="month" />
      </Case>
      <Case id="dp-year" title="Year picker">
        <DatePicker {...events('dp-year')} label="Year" granularity="year" defaultValue="2026-01-01" name="year" />
      </Case>
      <Case id="dtp" title="Date and time">
        <DatePicker {...events('dtp')} label="Appointment" granularity="minute" defaultValue="2026-11-23T10:30" timeStep={15} minTime="09:00" maxTime="17:00" min="2026-11-10T10:30" max="2026-12-31T16:00" name="appointment" />
      </Case>
      <Case id="dtp-empty" title="Date and time, empty with placeholderValue">
        <DatePicker {...events('dtp-empty')} label="Start" granularity="minute" placeholderValue="2026-11-20T13:00" />
      </Case>
      <Case id="dtp-second" title="Seconds">
        <DatePicker {...events('dtp-second')} label="Stamp" granularity="second" hourCycle="h23" defaultValue="2026-11-23T10:30:15" name="stamp" />
      </Case>
      <Case id="dp-zone" title="Instant in a time zone">
        <DatePicker {...events('dp-zone')} label="Tokyo" granularity="minute" defaultValue={new Date(Date.UTC(2026, 10, 23, 15, 0))} timeZone="Asia/Tokyo" name="tokyo" />
      </Case>
      <Case id="dp-readonly" title="Read-only">
        <DatePicker {...events('dp-readonly')} label="Read-only" defaultValue="2026-11-23" readOnly />
      </Case>
      <Case id="dp-disabled" title="Disabled">
        <DatePicker {...events('dp-disabled')} label="Disabled" defaultValue="2026-11-23" disabled />
      </Case>
      <Case id="dp-noedit" title="Not editable">
        <DatePicker {...events('dp-noedit')} label="Pick only" defaultValue="2026-11-23" editable={false} />
      </Case>
      <Case id="dp-openonfocus" title="Open on focus">
        <DatePicker {...events('dp-openonfocus')} label="Focus opens" defaultValue="2026-11-23" openOnFocus />
      </Case>
      <Case id="dp-placeholder" title="Placeholder">
        <DatePicker {...events('dp-placeholder')} label="Empty" placeholder="Choose a date" className="custom-class" style={{ minInlineSize: 240 }} data-extra="x" />
      </Case>
      <Case id="dp-strict" title="Strict">
        <DatePicker {...events('dp-strict')} label="Strict" defaultValue="2026-11-23" min="2026-11-10" max="2026-11-30" strict />
      </Case>
      <Case id="dp-modal" title="Modal">
        <DatePicker {...events('dp-modal')} label="Sheet" defaultValue="2026-11-23" popupMode="modal" />
      </Case>
      <Case id="dp-auto" title="Auto popup mode">
        <DatePicker {...events('dp-auto')} label="Auto" defaultValue="2026-11-23" />
      </Case>
      <Case id="dp-default-open" title="Default open">
        {params.has('defaultOpen') ? <DatePicker {...events('dp-default-open')} label="Opened" defaultValue="2026-11-23" defaultOpen /> : null}
      </Case>
      <Case id="drp" title="DateRangePicker">
        <DateRangePicker
          {...events('drp')}
          onRangeSelect={log('drp', 'rangeSelect')}
          label="Stay"
          defaultValue={{ start: '2026-11-10', end: '2026-11-14' }}
          minDays={2}
          maxDays={14}
          clearable
          presets={[
            { label: 'First week of December', value: { start: '2026-12-01', end: '2026-12-07' } },
            { label: 'Next 3 days', value: () => ({ start: '2026-11-24', end: '2026-11-26' }) },
          ]}
        />
      </Case>
      <Case id="drp-noconfirm" title="Commit on second click">
        <DateRangePicker {...events('drp-noconfirm')} onRangeSelect={log('drp-noconfirm', 'rangeSelect')} label="Quick" confirm={false} defaultValue={{ start: '2026-11-10', end: '2026-11-12' }} separator=" to " />
      </Case>
      <Case id="drp-bounds" title="Bounds and disabled days">
        <DateRangePicker {...events('drp-bounds')} label="Bounded" min="2026-11-05" max="2026-11-25" isDateDisabled={weekend} rangeOverDisabled="block" strict defaultValue={{ start: '2026-11-10', end: '2026-11-12' }} />
      </Case>
      <Case id="drp-month" title="Month range">
        <DateRangePicker {...events('drp-month')} label="Months" granularity="month" defaultValue={{ start: '2026-03-01', end: '2026-06-01' }} name="months" />
      </Case>
      <Case id="tp" title="TimePicker">
        <TimePicker {...events('tp')} label="Start time" defaultValue="09:30" min="08:00" max="18:00" isTimeDisabled={(t) => t.hour === 12} clearable />
      </Case>
      <Case id="tp-1440" title="Every minute">
        <TimePicker {...events('tp-1440')} label="Minute list" step={1} defaultValue="13:37" />
      </Case>
      <Case id="tp-render" title="Custom options">
        <TimePicker {...events('tp-render')} label="Slots" step={60} renderOption={(ctx) => <span className="slot">{`${ctx.text} slot`}</span>} hourCycle="h23" />
      </Case>
      <Case id="tp-placeholder" title="Placeholder value">
        <TimePicker {...events('tp-placeholder')} label="Later" placeholderValue="14:00" />
      </Case>
      <Case id="tp-strict" title="Strict time">
        <TimePicker {...events('tp-strict')} label="Office hours" min="09:00" max="17:00" strict defaultValue="10:00" />
      </Case>
      {only === 'sizes' ? (
        <Case id="sizes" title="Sizes">
          {(['sm', 'md', 'lg'] as const).map((size) => (
            <div key={size} data-size-row={size} style={{ display: 'flex', gap: 8, alignItems: 'end', marginBlockEnd: 8 }}>
              <DatePicker label={`Date ${size}`} size={size} defaultValue="2026-11-23" clearable />
              <DatePicker label={`Date and time ${size}`} size={size} granularity="minute" defaultValue="2026-11-23T10:30" />
              <DateRangePicker label={`Range ${size}`} size={size} defaultValue={{ start: '2026-11-23', end: '2026-11-27' }} />
              <TimePicker label={`Time ${size}`} size={size} defaultValue="10:30" />
              <DateField label={`Field ${size}`} size={size} defaultValue="2026-11-23" />
              <TimeField label={`Time field ${size}`} size={size} defaultValue="10:30" />
            </div>
          ))}
        </Case>
      ) : null}
      {params.has('grid') ? (
        <Case id="grid" title="Data Grid date editors">
          <TaskGrid />
        </Case>
      ) : null}
      <Case id="form" title="Forms">
        <Forms />
      </Case>
      <div id="outside" style={{ blockSize: 40 }}>
        Outside
      </div>
    </main>
  );
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
