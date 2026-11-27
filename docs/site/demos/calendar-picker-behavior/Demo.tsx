'use client';

import { useRef, useState } from 'react';
import { DatePicker, type CalendarView, type PickerHandle } from '@salmonui/calendars/date-picker';
import { TimePicker } from '@salmonui/calendars/time-picker';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';

/** Disabled, read-only, placeholder, pick-only and open-on-focus fields; a controlled popup with a veto; ref methods; focus, view and change events; RTL. */
export default function CalendarPickerBehaviorDemo() {
  const pickerRef = useRef<PickerHandle>(null);
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [rtl, setRtl] = useState(false);
  const [view, setView] = useState<CalendarView>('month');
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((lines) => [line, ...lines].slice(0, 8));
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="demo-toolbar">
        <Button variant="outline" type="button" onClick={() => pickerRef.current?.open()}>
          ref.open()
        </Button>
        <Button variant="outline" type="button" onClick={() => pickerRef.current?.close()}>
          ref.close()
        </Button>
        <Button variant="outline" type="button" onClick={() => pickerRef.current?.focus()}>
          ref.focus()
        </Button>
        <Button variant="outline" type="button" onClick={() => pickerRef.current?.blur()}>
          ref.blur()
        </Button>
        <Checkbox checked={locked} onCheckedChange={(checked) => setLocked(checked)}>
          Keep the popup closed (veto)
        </Checkbox>
        <Checkbox checked={rtl} onCheckedChange={(checked) => setRtl(checked)}>
          Right to left
        </Checkbox>
      </div>
      <div dir={rtl ? 'rtl' : 'ltr'} style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <DatePicker
          ref={pickerRef}
          label="Due date (controlled popup)"
          description={`Calendar view: ${view}`}
          defaultValue="2026-11-23"
          clearable
          open={open}
          onOpenChange={(next, details) => {
            add(`onOpenChange(${String(next)}, reason ${details.reason}, source ${details.source})${locked && next ? ': vetoed' : ''}`);
            if (!(locked && next)) setOpen(next);
          }}
          onViewChange={(v) => {
            setView(v);
            add(`onViewChange(${v})`);
          }}
          onFocusedValueChange={(d) => add(`onFocusedValueChange(${String(d)})`)}
          onFocus={() => add('onFocus')}
          onBlur={() => add('onBlur')}
          onValueChange={(value, details) => add(`onValueChange(${String(value)}, source ${details.source}, reason ${details.reason}, iso ${details.iso || "''"})`)}
          className="demo-due-date"
          style={{ inlineSize: 260 }}
          data-testid="due-date"
          title="Due date"
        />
        <DatePicker label="Pick from the calendar only" editable={false} placeholder="Choose a date" onValueChange={(value) => add(`pick only: ${String(value)}`)} />
        <DatePicker label="Opens on focus" openOnFocus placeholder="Tab into me" defaultFocusedValue="2027-01-15" />
        <DatePicker label="Read-only" readOnly defaultValue="2026-12-24" />
        <DatePicker label="Disabled" disabled defaultValue="2026-12-31" />
        <DatePicker label="Meeting (no value yet)" granularity="minute" placeholderValue="2026-11-23T13:00" timeStep={15} description="The time list starts at 13:00." />
        <TimePicker label="Reminder" placeholderValue="18:00" step={15} style={{ inlineSize: 140 }} description="A narrow field; the list is at least as wide." />
      </div>
      <div className="demo-log" aria-live="polite">
        <ol>
          {log.length ? log.map((line, i) => <li key={`${i}-${line}`}>{line}</li>) : <li>Interact with a field</li>}
        </ol>
      </div>
    </div>
  );
}
