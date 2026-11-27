'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { Scheduler, type SchedulerApi } from '@salmonui/scheduler';

type Row = { id: number; title: string; start: string; end: string; allDay?: boolean };

const rows: Row[] = [
  { id: 1, title: 'Sprint planning', start: '2026-11-23T09:30', end: '2026-11-23T11:00' },
  { id: 2, title: 'Early deploy', start: '2026-11-24T07:00', end: '2026-11-24T07:45' },
  { id: 3, title: 'Design review', start: '2026-11-25T14:00', end: '2026-11-25T15:30' },
  { id: 4, title: 'Late support shift', start: '2026-11-26T19:00', end: '2026-11-26T21:00' },
  { id: 5, title: 'Retro', start: '2026-11-27T16:00', end: '2026-11-27T17:00' },
  { id: 6, title: 'Hackathon', start: '2026-11-28', end: '2026-11-30', allDay: true },
  { id: 7, title: 'Quarter close', start: '2026-12-15', end: '2026-12-16', allDay: true },
];

const SLOTS = [15, 30, 60].map((n) => ({ value: n, label: `${n} minutes` }));

/** View types and per-view options, a 3-day view, navigation limits, visible and work hours, time scale, week numbers and the header items. */
export default function SchedulerViewsNavigationDemo() {
  const apiRef = useRef<SchedulerApi<Row>>(null);
  const [view, setView] = useState('week');
  const [date, setDate] = useState('2026-11-23');
  const [showWeekend, setShowWeekend] = useState(true);
  const [slot, setSlot] = useState(30);
  const [blockDecember, setBlockDecember] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((lines) => [line, ...lines].slice(0, 6));
  return (
    <div>
      <div className="demo-toolbar">
        <Checkbox checked={showWeekend} onCheckedChange={(checked) => setShowWeekend(checked)}>
          Show weekend
        </Checkbox>
        <label>
          Slot
          <Select aria-label="Slot" data={SLOTS} value={slot} onValueChange={(value) => value != null && setSlot(Number(value))} />
        </label>
        <Checkbox checked={blockDecember} onCheckedChange={(checked) => setBlockDecember(checked)}>
          Cancel navigation to a week starting in December
        </Checkbox>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.setView('threeDays', '2026-11-25')}>
          setView(&apos;threeDays&apos;, 25 Nov)
        </Button>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.scrollToTime('19:00')}>
          scrollToTime(&apos;19:00&apos;)
        </Button>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.setWorkHours(['2026-11-27'], '12:00', '16:00')}>
          Friday works 12:00 to 16:00
        </Button>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.resetWorkHours()}>
          Reset work hours
        </Button>
        <Button variant="outline" type="button" onClick={() => add(`getDateRangeText(): ${apiRef.current?.getDateRangeText() ?? ''}`)}>
          getDateRangeText()
        </Button>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.refresh()}>
          refresh()
        </Button>
      </div>
      <Scheduler<Row>
        ref={apiRef}
        data={rows}
        view={view}
        date={date}
        timeZone="Europe/Berlin"
        locale="en-GB"
        hourCycle="h23"
        dateFormat={{ weekday: 'short', day: 'numeric', month: 'short' }}
        firstDayOfWeek={1}
        showWeekNumbers
        weekRule="firstFourDayWeek"
        showWeekend={showWeekend}
        workDays={[1, 2, 3, 4, 5]}
        startHour="06:00"
        endHour="22:00"
        workHours={{ highlight: true, start: '08:30', end: '17:30' }}
        scrollTime="08:00"
        timeScale={{ enabled: true, interval: slot * 2, slotCount: 2 }}
        renderMajorSlot={(ctx) => <strong>{ctx.text}</strong>}
        currentTimeIndicator={{ label: true }}
        min="2026-11-01"
        max="2027-01-31"
        views={[
          'day',
          { type: 'week', startHour: '07:00', endHour: '21:00' },
          { type: 'workWeek', label: 'Work week' },
          { type: 'day', name: 'threeDays', label: '3 days', interval: 3 },
          { type: 'month', showWeekend: true, readOnly: true, eventLayout: { maxHeight: 2 } },
        ]}
        toolbar={['previous', 'next', 'today', 'dateRange', 'views', { id: 'next-review', label: 'Next review', align: 'end', onClick: () => apiRef.current?.setDate('2026-11-25') }]}
        onBeforeNavigate={(e) => {
          if (blockDecember && e.kind === 'date' && e.date.month === 12) {
            e.preventDefault();
            add(`onBeforeNavigate cancelled ${String(e.date)}`);
          }
        }}
        onViewChange={(next, e) => {
          setView(next);
          add(`onViewChange(${next}) from ${e.previousView}`);
        }}
        onDateChange={(next, e) => {
          setDate(next.toString());
          add(`onDateChange(${String(next)}) from ${String(e.previousDate)} (${e.source})`);
        }}
        height={560}
        width="100%"
        className="demo-scheduler"
      />
      <p className="demo-status" aria-live="polite">
        view <code>{view}</code>, date <code>{date}</code>
      </p>
      <div className="demo-log">
        <ol>{log.length ? log.map((line, i) => <li key={`${i}-${line}`}>{line}</li>) : <li>Navigate or switch views</li>}</ol>
      </div>
    </div>
  );
}
