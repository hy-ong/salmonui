'use client';

import { useRef, useState } from 'react';
import { Gantt, type GanttApi, type GanttProps } from '@salmonui/gantt';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';
import { TextField } from '@salmonui/inputs/text-field';

type Task = { id: number; title: string; parentId: number | null; start?: string; duration?: number; progress?: number; predecessors?: string; notes?: string; milestone?: boolean; owner?: string };

const initial: Task[] = [
  { id: 1, title: 'Website relaunch', parentId: null },
  { id: 2, title: 'Discovery', parentId: 1 },
  { id: 3, title: 'Stakeholder interviews', parentId: 2, start: '2027-03-01', duration: 3, progress: 100, notes: 'Eight interviews, notes in the wiki.' },
  { id: 4, title: 'Content audit', parentId: 2, duration: 2, progress: 60, predecessors: '3FS' },
  { id: 5, title: 'Design', parentId: 1 },
  { id: 6, title: 'Wireframes', parentId: 5, duration: 4, progress: 30, predecessors: '4FS' },
  { id: 7, title: 'Visual design', parentId: 5, duration: 5, predecessors: '6FS' },
  { id: 8, title: 'Design sign-off', parentId: 5, duration: 0, predecessors: '7FS' },
  { id: 9, title: 'Build', parentId: 1 },
  { id: 10, title: 'Templates', parentId: 9, duration: 6, predecessors: '8FS' },
  { id: 11, title: 'Content migration', parentId: 9, duration: 4, predecessors: '10SS+2d' },
  { id: 12, title: 'Launch', parentId: 1, duration: 0, predecessors: '10FS,11FS' },
];


const COLUMNS: NonNullable<GanttProps<Task>['columns']> = ['id', 'title', 'start', 'end', 'duration', 'progress', 'predecessors', 'notes'];
/** Grid and dialog editing with custom tabs, taskbar move, resize, progress and link drags, add, delete, indent, milestones, undo and redo, the toolbar, read-only mode and the chart events. */
export default function GanttEditingDemo() {
  const apiRef = useRef<GanttApi<Task>>(null);
  const [tasks, setTasks] = useState<readonly Task[]>(initial);
  const [readOnly, setReadOnly] = useState(false);
  const [mode, setMode] = useState<'auto' | 'dialog'>('auto');
  const [pointer, setPointer] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((lines) => [line, ...lines].slice(0, 10));
  const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : '-');
  const selectedId = (): string | undefined => apiRef.current?.getSelectedRowIds()[0];
  return (
    <div>
      <div className="demo-toolbar">
        <Checkbox checked={readOnly} onCheckedChange={(checked) => setReadOnly(checked)}>
          readOnly
        </Checkbox>
        <label>
          Edit mode
          <Select aria-label="Edit mode" data={[{ value: 'auto', label: 'auto (cells and dialog)' }, { value: 'dialog', label: 'dialog' }]} value={mode} onValueChange={(value) => value != null && setMode(value as 'auto' | 'dialog')} />
        </label>
        <Button variant="outline" type="button" onClick={() => add(`addTask child of Build: ${apiRef.current?.addTask({ title: 'QA pass', duration: 2 }, { position: 'child', targetId: '9' }).status}`)}>
          addTask (child of Build)
        </Button>
        <Button variant="outline" type="button" onClick={() => add(`updateTask(4): ${apiRef.current?.updateTask('4', { title: 'Content audit (v2)', progress: 80 }).status}`)}>
          updateTask(4)
        </Button>
        <Button variant="outline" type="button" onClick={() => add(`convertToMilestone(7): ${apiRef.current?.convertToMilestone('7').status}`)}>
          convertToMilestone(7)
        </Button>
        <Button variant="outline" type="button" onClick={() => add(`addDependency(12, '6FS+1d'): ${apiRef.current?.addDependency('12', '6FS+1d').status}`)}>
          addDependency
        </Button>
        <Button variant="outline" type="button" onClick={() => add(`changeTaskId(11 to 110): ${apiRef.current?.changeTaskId('11', '110').status}`)}>
          changeTaskId(11, 110)
        </Button>
        <Button variant="outline"
          type="button"
          onClick={() => {
            const id = selectedId();
            if (id !== undefined) apiRef.current?.openEditDialog(id);
            else add('Select a row first');
          }}
        >
          openEditDialog(selected)
        </Button>
        <Button variant="outline" type="button" onClick={() => add(`undo stack: ${apiRef.current?.getUndoActions().join(', ') || 'empty'}`)}>
          getUndoActions()
        </Button>
      </div>
      <Gantt<Task>
        ref={apiRef}
        aria-label="Website relaunch plan"
        data={tasks}
        taskFields={{ parentId: 'parentId' }}
        columns={COLUMNS}
        timeZone="UTC"
        locale="en-GB"
        projectStart="2027-03-01"
        height={520}
        readOnly={readOnly}
        undo={{ limit: 50 }}
        inlineNotes
        editing={{
          mode,
          confirmDelete: true,
          newRowPosition: 'below',
          dialogTabs: [
            { type: 'general' },
            { type: 'dependency' },
            { type: 'notes' },
            {
              type: 'custom',
              label: 'Owner',
              render: ({ values, setValue }) => (
                <TextField label="Owner" value={String(values['owner'] ?? '')} onValueChange={(value) => setValue('owner', value)} />
              ),
            },
          ],
        }}
        toolbar={['add', 'edit', 'update', 'delete', 'cancel', 'indent', 'outdent', 'expandAll', 'collapseAll', 'undo', 'redo']}
        onTaskbarEditStart={(e) => add(`onTaskbarEditStart ${e.action} #${String(e.taskId)}`)}
        onBeforeTaskbarEditEnd={(e) => {
          if (e.action === 'progress' && e.progress > 100) e.preventDefault();
        }}
        onTaskbarEditEnd={(e) => add(`onTaskbarEditEnd ${e.action} #${String(e.taskId)}: ${day(e.start)} to ${day(e.end)}, ${Math.round(e.progress)}%`)}
        onDependencyChange={(e) => add(`onDependencyChange ${e.action} on #${String(e.taskId)}`)}
        onTaskChange={(e) => add(`onTaskChange ${e.action} [${e.taskIds.join(', ')}]`)}
        onTaskbarClick={(e) => add(`onTaskbarClick #${String(e.taskId)} (${e.target})`)}
        onRowDoubleClick={() => add('onRowDoubleClick')}
        onChartPointerMove={(e) => setPointer(`${day(e.date)}${e.task ? ` over ${e.task.title}` : ''}`)}
        onBeforeDialogOpen={(e) => add(`onBeforeDialogOpen ${e.mode}`)}
        onDataChange={(rows) => setTasks(rows)}
      />
      <p className="demo-status">Pointer: {pointer || 'move over the chart'}</p>
      <div className="demo-log" aria-live="polite">
        <ol>{log.length ? log.map((line, i) => <li key={`${i}-${line}`}>{line}</li>) : <li>Drag a taskbar or edit a cell</li>}</ol>
      </div>
    </div>
  );
}
