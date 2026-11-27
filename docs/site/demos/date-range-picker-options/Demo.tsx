'use client';

import { useState } from 'react';
import { DateRangePicker, getRangeDays, type DateRange, type PlainDate } from '@salmonui/calendars/date-range-picker';
import { Checkbox } from '@salmonui/inputs/checkbox';

const HOLIDAYS = new Set(['2026-12-24', '2026-12-25', '2026-12-26', '2026-12-31', '2027-01-01']);
const isWeekendOrHoliday = (d: PlainDate): boolean => {
  const day = new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay();
  return day === 0 || day === 6 || HOLIDAYS.has(d.toString());
};

/** Separator and paste, onRangeSelect before Apply, the day count, month ranges, strict bounds and ranges over disabled days. */
export default function DateRangePickerOptionsDemo() {
  const [allowOverDisabled, setAllowOverDisabled] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((lines) => [line, ...lines].slice(0, 6));
  const describe = (range: DateRange | null) => (range ? `${String(range.start)} to ${String(range.end)} (${getRangeDays(range)} days)` : 'null');
  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div className="demo-toolbar">
        <Checkbox checked={allowOverDisabled} onCheckedChange={(checked) => setAllowOverDisabled(checked)}>
          Allow ranges over weekends and holidays (<code>rangeOverDisabled=&quot;allow&quot;</code>)
        </Checkbox>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <DateRangePicker
          label="Sprint"
          description="Paste 2026-12-01 → 2026-12-11 into either field."
          separator=" → "
          defaultValue={{ start: '2026-11-23', end: '2026-12-04' }}
          onRangeSelect={(range) => add(`onRangeSelect: ${describe(range)} (not applied yet)`)}
          onValueChange={(range) => add(`onValueChange: ${describe(range)}`)}
        />
        <DateRangePicker
          label="Working days off"
          description="Weekends and holidays are disabled."
          isDateDisabled={isWeekendOrHoliday}
          rangeOverDisabled={allowOverDisabled ? 'allow' : 'block'}
          getDayProps={(ctx) => (HOLIDAYS.has(ctx.date.toString()) ? { title: 'Public holiday', 'data-holiday': true } : undefined)}
          defaultValue={{ start: '2026-12-21', end: '2026-12-23' }}
          onValueChange={(range) => add(`days off: ${describe(range)}`)}
        />
        <DateRangePicker label="Reporting months" granularity="month" defaultValue={{ start: '2026-01-01', end: '2026-06-01' }} onValueChange={(range) => add(`months: ${range ? `${String(range.start)} to ${String(range.end)}` : 'null'}`)} />
        <DateRangePicker
          label="Within Q1 2027 (strict)"
          description="Typed dates outside Q1 move to the nearest bound on blur."
          min="2027-01-01"
          max="2027-03-31"
          strict
          defaultValue={{ start: '2027-02-01', end: '2027-02-14' }}
          onValueChange={(range) => add(`Q1: ${describe(range)}`)}
        />
      </div>
      <div className="demo-log" aria-live="polite">
        <ol>{log.length ? log.map((line, i) => <li key={`${i}-${line}`}>{line}</li>) : <li>Choose or paste a range</li>}</ol>
      </div>
    </div>
  );
}
