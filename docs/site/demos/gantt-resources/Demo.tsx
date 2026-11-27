'use client';

import { useRef, useState } from 'react';
import { Gantt, type GanttApi, type GanttProps } from '@salmonui/gantt';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';

type Assignment = { id: string; unit: number };
type Task = { id: number; title: string; parentId: number | null; start?: string; duration?: number; progress?: number; resources?: Assignment[]; segments?: { start: string; duration: number }[] };

const tasks: Task[] = [
  { id: 1, title: 'Office move', parentId: null },
  { id: 2, title: 'Pack archive', parentId: 1, start: '2027-06-07', duration: 4, progress: 50, resources: [{ id: 'ana', unit: 100 }] },
  { id: 3, title: 'Network plan', parentId: 1, start: '2027-06-08', duration: 3, resources: [{ id: 'ana', unit: 50 }, { id: 'ben', unit: 100 }] },
  { id: 4, title: 'Furniture order', parentId: 1, start: '2027-06-09', duration: 2, resources: [{ id: 'ben', unit: 100 }] },
  { id: 5, title: 'Cabling (split around the inspection)', parentId: 1, start: '2027-06-14', duration: 4, resources: [{ id: 'chen', unit: 100 }], segments: [{ start: '2027-06-14', duration: 1 }, { start: '2027-06-17', duration: 3 }] },
  { id: 6, title: 'Label boxes', parentId: 1, start: '2027-06-10', duration: 2 },
];

const people = [
  { id: 'ana', name: 'Ana', unit: 100, group: 'Facilities' },
  { id: 'ben', name: 'Ben', unit: 100, group: 'IT' },
  { id: 'chen', name: 'Chen', unit: 100, group: 'IT' },
];


const COLUMNS: NonNullable<GanttProps<Task>['columns']> = ['title', 'start', 'end', 'duration', 'resources'];
/** Resource assignments with units, the resource view with over-allocation, overlapping bars in lanes, multi-taskbar rows, split tasks and taskbar drags between rows. */
export default function GanttResourcesDemo() {
  const apiRef = useRef<GanttApi<Task>>(null);
  const [data, setData] = useState<readonly Task[]>(tasks);
  const [resourceView, setResourceView] = useState(true);
  const [multi, setMulti] = useState(true);
  const [overlap, setOverlap] = useState(false);
  const [status, setStatus] = useState('');
  return (
    <div>
      <div className="demo-toolbar">
        <Checkbox checked={resourceView} onCheckedChange={(checked) => setResourceView(checked)}>
          Resource view
        </Checkbox>
        <Checkbox checked={multi} onCheckedChange={(checked) => setMulti(checked)}>
          Bars in collapsed rows (multiTaskbar)
        </Checkbox>
        <Checkbox checked={!overlap} onCheckedChange={(checked) => setOverlap(!checked)}>
          Stack overlapping bars in lanes
        </Checkbox>
        <Button variant="outline" type="button" onClick={() => setStatus(`splitTask(4, 10 Jun): ${apiRef.current?.splitTask('4', '2027-06-10').status}`)}>
          splitTask(4, 10 Jun)
        </Button>
        <Button variant="outline" type="button" onClick={() => setStatus(`mergeSegments(5, [0, 1]): ${apiRef.current?.mergeSegments('5', [0, 1]).status}`)}>
          mergeSegments(5)
        </Button>
      </div>
      <Gantt<Task>
        ref={apiRef}
        aria-label="Office move resources"
        data={data}
        taskFields={{ parentId: 'parentId' }}
        columns={COLUMNS}
        resources={people}
        resourceFields={{ id: 'id', name: 'name', unit: 'unit', group: 'group' }}
        resourceView={resourceView}
        overAllocation
        multiTaskbar={multi}
        taskbarOverlap={overlap}
        editing={{ taskbarDragBetweenRows: true, dialogTabs: [{ type: 'general' }, { type: 'resources' }, { type: 'segments' }] }}
        contextMenu={['splitTask', 'mergeTask', 'taskInformation']}
        timeZone="UTC"
        locale="en-GB"
        height={440}
        onTaskChange={(e) => setStatus(`onTaskChange ${e.action} [${e.taskIds.join(', ')}]`)}
        onDataChange={(rows) => setData(rows)}
      />
      <p className="demo-status" aria-live="polite">
        {status || 'Drag a bar onto another person, or right-click a bar to split it'}
      </p>
    </div>
  );
}
