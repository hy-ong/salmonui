'use client';

import { useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { Scheduler } from '@salmonui/scheduler';

type Row = { id: number; title: string; start: string; end: string; allDay?: boolean };

const pad = (n: number) => String(n).padStart(2, '0');
// A busy week: all-day items, a timed event across midnight, short tasks and a crowded Wednesday.
const rows: Row[] = [
  { id: 1, title: 'Conference', start: '2026-11-23', end: '2026-11-26', allDay: true },
  { id: 2, title: 'On call', start: '2026-11-24', end: '2026-11-29', allDay: true },
  { id: 3, title: 'Offsite prep', start: '2026-11-25', end: '2026-11-26', allDay: true },
  { id: 4, title: 'Budget due', start: '2026-11-25', end: '2026-11-26', allDay: true },
  { id: 5, title: 'Night migration', start: '2026-11-24T22:00', end: '2026-11-25T04:00' },
  { id: 6, title: 'Quick check', start: '2026-11-23T10:00', end: '2026-11-23T10:05' },
  ...Array.from({ length: 7 }, (_, i) => ({ id: 10 + i, title: `Interview ${i + 1}`, start: `2026-11-25T${pad(9 + i)}:00`, end: `2026-11-25T${pad(9 + i)}:45` })),
  ...Array.from({ length: 6 }, (_, i) => ({ id: 20 + i, title: `Call ${i + 1}`, start: `2026-11-26T${pad(9 + i)}:00`, end: `2026-11-26T${pad(10 + i)}:00` })),
];

const PLACEMENTS = [
  { value: 'allDayRow', label: 'in the all-day row' },
  { value: 'timeSlot', label: 'split into the time slots' },
];
const LANES = [1, 2, 3].map((n) => ({ value: n, label: String(n) }));

/** All-day row expand and scroll, events across midnight, minimum height, lanes and "+N more", the more popover or navigation, and auto row height. */
export default function SchedulerEventLayoutDemo() {
  const [placement, setPlacement] = useState<'allDayRow' | 'timeSlot'>('allDayRow');
  const [maxHeight, setMaxHeight] = useState(2);
  const [autoRowHeight, setAutoRowHeight] = useState(false);
  const [navigateOnMore, setNavigateOnMore] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState('');
  return (
    <div>
      <div className="demo-toolbar">
        <label>
          Events across midnight
          <Select aria-label="Events across midnight" data={PLACEMENTS} value={placement} onValueChange={(value) => value != null && setPlacement(value as 'allDayRow' | 'timeSlot')} />
        </label>
        <label>
          Lanes before +N more
          <Select aria-label="Lanes before +N more" data={LANES} value={maxHeight} onValueChange={(value) => value != null && setMaxHeight(Number(value))} />
        </label>
        <Checkbox checked={autoRowHeight} onCheckedChange={(checked) => setAutoRowHeight(checked)}>
          Auto row height (no +N more)
        </Checkbox>
        <Checkbox checked={navigateOnMore} onCheckedChange={(checked) => setNavigateOnMore(checked)}>
          +N more opens the day view
        </Checkbox>
      </div>
      <Scheduler<Row>
        data={rows}
        view="week"
        views={['week', 'month', 'timelineWeek']}
        date="2026-11-23"
        timeZone="UTC"
        locale="en-GB"
        height={560}
        scrollTime="08:00"
        eventLayout={{ spannedPlacement: placement, maxHeight, moreIndicator: true, minimumDuration: 20, ignoreWhitespace: true }}
        autoRowHeight={autoRowHeight}
        allDayRowExpanded={expanded}
        onAllDayRowExpandedChange={(next) => {
          setExpanded(next);
          setStatus(`onAllDayRowExpandedChange(${String(next)})`);
        }}
        allDayRowScroll
        onMoreEventsClick={(e) => {
          setStatus(`onMoreEventsClick: ${e.rows.length} events on ${String(e.date)}`);
          if (navigateOnMore) e.navigate('day');
        }}
      />
      <p className="demo-status" aria-live="polite">
        {status || 'Expand the all-day row or click +N more'}
      </p>
    </div>
  );
}
