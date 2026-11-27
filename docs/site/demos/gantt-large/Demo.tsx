'use client';

import { useMemo, useRef, useState } from 'react';
import { Gantt, type GanttApi, type GanttProps } from '@salmonui/gantt';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';

type Task = { id: number; title: string; parentId: number | null; start?: string; duration?: number; progress?: number; predecessors?: string };


const COLUMNS: NonNullable<GanttProps<Task>['columns']> = ['id', 'title', 'start', 'end', 'duration'];
/** 5,000 tasks: 500 phases of 9 chained tasks, each phase linked to the previous one. Deterministic, so server and client agree. */
function bigProject(phases: number): Task[] {
  const out: Task[] = [];
  let id = 1;
  for (let p = 0; p < phases; p++) {
    const parent = id++;
    out.push({ id: parent, title: `Phase ${p + 1}`, parentId: null });
    for (let c = 0; c < 9; c++) {
      const tid = id++;
      const first = p === 0 && c === 0;
      out.push({ id: tid, title: `Task ${tid}`, parentId: parent, duration: 1 + (tid % 3), progress: (tid * 7) % 100, ...(first ? { start: '2027-01-04' } : { predecessors: String(c === 0 ? tid - 2 : tid - 1) }) });
    }
  }
  return out;
}

/** A 5,000-task project with row and timeline virtualization in both panes, server-rendered initial rows and a timed critical path toggle. */
export default function GanttLargeDemo() {
  const tasks = useMemo(() => bigProject(500), []);
  const apiRef = useRef<GanttApi<Task>>(null);
  const [critical, setCritical] = useState(false);
  const [status, setStatus] = useState('');
  const timeIt = (label: string, fn: () => void) => {
    const t0 = performance.now();
    fn();
    requestAnimationFrame(() => setTimeout(() => setStatus(`${label}: ${(performance.now() - t0).toFixed(0)} ms to the next frame`), 0));
  };
  return (
    <div>
      <div className="demo-toolbar">
        <Checkbox checked={critical} onCheckedChange={(checked) => timeIt('Critical path', () => setCritical(checked))}>
          Critical path
        </Checkbox>
        <Button variant="outline" type="button" onClick={() => timeIt('scrollToTask(4999)', () => apiRef.current?.scrollToTask('4999'))}>
          scrollToTask(4999)
        </Button>
        <Button variant="outline" type="button" onClick={() => timeIt('updateTask(2, 5 days)', () => apiRef.current?.updateTask('2', { duration: 5 }))}>
          Lengthen the first task (reschedules 4,999 tasks)
        </Button>
        <Button variant="outline" type="button" onClick={() => setStatus(`DOM rows: ${apiRef.current?.getChartElement()?.querySelectorAll('.salmon-gantt__row').length ?? 0} of ${tasks.length}`)}>
          Count rendered chart rows
        </Button>
      </div>
      <Gantt<Task>
        ref={apiRef}
        aria-label="A project of 5,000 tasks"
        data={tasks}
        taskFields={{ parentId: 'parentId' }}
        columns={COLUMNS}
        criticalPath={critical}
        timeZone="UTC"
        locale="en-GB"
        timeline={{ mode: 'week' }}
        height={480}
        editing
      />
      <p className="demo-status" aria-live="polite">
        {status || `${tasks.length.toLocaleString('en-US')} tasks; scroll both panes`}
      </p>
    </div>
  );
}
