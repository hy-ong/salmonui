'use client';

import { useRef, useState } from 'react';
import { Gantt, type GanttApi, type GanttProps, type GanttTaskMode } from '@salmonui/gantt';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';

// Your own property names, mapped through taskFields.
type Task = {
  TaskID: number;
  Name: string;
  Parent: number | null;
  Begin?: string;
  Days?: number;
  Done?: number;
  Deps?: string;
  Manual?: boolean;
  Constraint?: string;
  ConstraintOn?: string;
};

const tasks: Task[] = [
  { TaskID: 1, Name: 'Warehouse fit-out', Parent: null },
  { TaskID: 2, Name: 'Permits', Parent: 1, Begin: '2027-04-05', Days: 5, Done: 100 },
  { TaskID: 3, Name: 'Demolition', Parent: 1, Days: 3, Done: 40, Deps: '2FS' },
  { TaskID: 4, Name: 'Electrical', Parent: 1, Days: 6, Deps: '3FS+2d' },
  { TaskID: 5, Name: 'Plumbing', Parent: 1, Days: 4, Deps: '3SS+1d' },
  { TaskID: 6, Name: 'Inspection (start no earlier than 26 Apr)', Parent: 1, Days: 1, Deps: '4FS,5FF', Constraint: 'startNoEarlierThan', ConstraintOn: '2027-04-26' },
  { TaskID: 7, Name: 'Racking (manual dates)', Parent: 1, Begin: '2027-04-19', Days: 3, Manual: true, Deps: '3FS' },
  { TaskID: 8, Name: 'Handover', Parent: 1, Days: 0, Deps: '6FS,7FS' },
  { TaskID: 9, Name: 'Signage (no dates yet)', Parent: 1 },
  { TaskID: 10, Name: 'Opening party (after the whole fit-out)', Parent: null, Days: 1, Deps: '1FS' },
];


const COLUMNS: NonNullable<GanttProps<Task>['columns']> = ['serialNumber', 'wbs', 'title', 'start', 'end', 'duration', 'progress', 'predecessors', 'wbsPredecessors'];
/** Dependency types and lags, the critical path and total float, task modes, auto scheduling, constraints, unscheduled tasks, conflict validation, project dates, durations, WBS and serial numbers on mapped fields. */
export default function GanttSchedulingDemo() {
  const apiRef = useRef<GanttApi<Task>>(null);
  const [data, setData] = useState<readonly Task[]>(tasks);
  const [critical, setCritical] = useState(true);
  const [auto, setAuto] = useState(true);
  const [mode, setMode] = useState<GanttTaskMode>('custom');
  const [validateManual, setValidateManual] = useState(false);
  const [askConflicts, setAskConflicts] = useState(true);
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((lines) => [line, ...lines].slice(0, 8));
  return (
    <div>
      <div className="demo-toolbar">
        <Checkbox checked={critical} onCheckedChange={(checked) => setCritical(checked)}>
          Critical path
        </Checkbox>
        <Checkbox checked={auto} onCheckedChange={(checked) => setAuto(checked)}>
          Auto schedule
        </Checkbox>
        <label>
          Task mode
          <Select aria-label="Task mode" data={[{ value: 'custom', label: 'custom (per-task Manual field)' }, { value: 'auto', label: 'auto' }, { value: 'manual', label: 'manual' }]} value={mode} onValueChange={(value) => value != null && setMode(value as GanttTaskMode)} />
        </label>
        <Checkbox checked={validateManual} onCheckedChange={(checked) => setValidateManual(checked)}>
          Validate manual successors
        </Checkbox>
        <Checkbox checked={askConflicts} onCheckedChange={(checked) => setAskConflicts(checked)}>
          Conflict dialog (else move the task)
        </Checkbox>
      </div>
      <div className="demo-toolbar">
        <Button variant="outline" type="button" onClick={() => add(`getCriticalTasks(): ${(apiRef.current?.getCriticalTasks() ?? []).map((t) => t.Name).join(', ')}`)}>
          getCriticalTasks()
        </Button>
        <Button variant="outline"
          type="button"
          onClick={() => {
            const i = apiRef.current?.getTaskInfo('5');
            add(i ? `getTaskInfo(5): ${i.start?.toISOString().slice(0, 10)} to ${i.end?.toISOString().slice(0, 10)}, float ${i.totalFloat} h, WBS ${i.wbs}, ${apiRef.current?.formatDuration('5')}` : 'no task');
          }}
        >
          getTaskInfo(5)
        </Button>
        <Button variant="outline" type="button" onClick={() => add(`setTaskMode(3, 'manual'): ${apiRef.current?.setTaskMode('3', 'manual').status}`)}>
          setTaskMode(3, manual)
        </Button>
        <Button variant="outline" type="button" onClick={() => apiRef.current?.setProjectDates('2027-03-29', '2027-05-28')}>
          setProjectDates
        </Button>
        <Button variant="outline" type="button" onClick={() => add(`updateTask(2, 8 days): ${apiRef.current?.updateTask('2', { Days: 8 }).status}`)}>
          Permits take 8 days
        </Button>
      </div>
      <Gantt<Task>
        ref={apiRef}
        aria-label="Warehouse fit-out schedule"
        data={data}
        taskFields={{ id: 'TaskID', title: 'Name', parentId: 'Parent', start: 'Begin', duration: 'Days', progress: 'Done', predecessors: 'Deps', manual: 'Manual', constraintType: 'Constraint', constraintDate: 'ConstraintOn' }}
        columns={COLUMNS}
        wbs={{ autoUpdate: true }}
        timeZone="UTC"
        locale="en-GB"
        projectStart="2027-04-05"
        height={500}
        criticalPath={critical}
        autoSchedule={auto}
        taskMode={mode}
        unscheduledTasks
        validateDependencies
        validateManualTasks={validateManual}
        parentDependencies
        dependencyLag={{ normalizeOnLoad: true, updateOnTaskbarEdit: true }}
        connectorWidth={2}
        onScheduleConflict={(e) => {
          add(`onScheduleConflict: ${e.conflicts.map((c) => (c.task ? c.task.Name : '?')).join(', ')}`);
          if (!askConflicts) e.resolve('move');
        }}
        onDataChange={(rows) => setData(rows)}
      />
      <div className="demo-log" aria-live="polite">
        <ol>{log.length ? log.map((line, i) => <li key={`${i}-${line}`}>{line}</li>) : <li>Drag a task before its predecessor or press a button</li>}</ol>
      </div>
    </div>
  );
}
