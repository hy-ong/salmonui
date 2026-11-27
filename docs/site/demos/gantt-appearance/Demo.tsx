'use client';

import { useState } from 'react';
import { Gantt, type GanttProps } from '@salmonui/gantt';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { Select } from '@salmonui/dropdowns/select';

type Task = {
  id: number;
  title: string;
  parentId: number | null;
  start?: string;
  duration?: number;
  progress?: number;
  predecessors?: string;
  baselineStart?: string;
  baselineEnd?: string;
  owner?: string;
  risk?: 'low' | 'high';
  indicators?: { date: string; label: string; tooltip?: string }[];
};

const tasks: Task[] = [
  { id: 1, title: 'Conference 2027', parentId: null },
  { id: 2, title: 'Venue booking', parentId: 1, start: '2027-05-03', duration: 4, progress: 100, baselineStart: '2027-05-03', baselineEnd: '2027-05-05', owner: 'Ana', risk: 'low' },
  { id: 3, title: 'Speaker lineup', parentId: 1, duration: 8, progress: 60, predecessors: '2FS', baselineStart: '2027-05-06', baselineEnd: '2027-05-13', owner: 'Ben', risk: 'high', indicators: [{ date: '2027-05-12', label: 'Keynote confirmed', tooltip: 'The keynote speaker signed' }] },
  { id: 4, title: 'Ticket sales', parentId: 1, duration: 10, progress: 25, predecessors: '3SS+3d', baselineStart: '2027-05-10', baselineEnd: '2027-05-21', owner: 'Chen', risk: 'low' },
  { id: 5, title: 'Doors open', parentId: 1, duration: 0, predecessors: '3FS,4FS', owner: 'Ana' },
];


const COLUMNS: NonNullable<GanttProps<Task>['columns']> = ['title', 'start', 'end', 'baselineStart', 'baselineEnd', 'progress'];
/** Taskbar and row sizes, baselines with their own template, taskbar, parent and milestone templates, indicators, labels, tooltips, per-task taskbar props and the theme parts. */
export default function GanttAppearanceDemo() {
  const [templates, setTemplates] = useState(true);
  const [rowHeight, setRowHeight] = useState(40);
  const [status, setStatus] = useState('');
  return (
    <div>
      <div className="demo-toolbar">
        <Checkbox checked={templates} onCheckedChange={(checked) => setTemplates(checked)}>
          Custom taskbar templates
        </Checkbox>
        <label>
          Row height
          <Select aria-label="Row height" data={[{ value: 32, label: '32 px' }, { value: 40, label: '40 px' }, { value: 52, label: '52 px' }]} value={rowHeight} onValueChange={(value) => value != null && setRowHeight(Number(value))} />
        </label>
      </div>
      <Gantt<Task>
        aria-label="Conference plan with baselines"
        data={tasks}
        taskFields={{ parentId: 'parentId' }}
        columns={COLUMNS}
        timeZone="UTC"
        locale="en-GB"
        height={360}
        width="100%"
        className="demo-gantt"
        rowHeight={rowHeight}
        taskbarHeight={Math.round(rowHeight * 0.5)}
        baselines
        renderBaseline={({ width }) => <span className="demo-baseline" style={{ display: 'block', inlineSize: width, blockSize: '100%', background: 'var(--salmon-color-info-subtle)' }} />}
        labels={{ start: 'owner', end: ({ progress }) => `${Math.round(progress)}%`, inside: 'title' }}
        tooltip={{
          renderTaskbar: ({ task, start, end, progress }) => `${task.title}: ${start?.toISOString().slice(0, 10)} to ${end?.toISOString().slice(0, 10)}, ${Math.round(progress)}% done, owner ${task.owner ?? 'none'}`,
          renderBaseline: ({ task }) => `Planned: ${task.baselineStart ?? '?'} to ${task.baselineEnd ?? '?'}`,
          renderConnector: ({ from, to, dependency }) => `${from.title} → ${to.title} (${dependency.type.toUpperCase()})`,
        }}
        onBeforeTooltipOpen={(e) => setStatus(`onBeforeTooltipOpen: ${e.kind}${e.task ? ` of ${e.task.title}` : ''}`)}
        getTaskbarProps={({ task, critical }) => ({ 'data-risk': task.risk ?? 'none', ...(task.risk === 'high' ? { style: { outline: '2px solid var(--salmon-color-danger)' } } : {}), ...(critical ? { className: 'demo-critical' } : {}) })}
        {...(templates
          ? {
              renderTaskbar: ({ task, progress, width }) => (
                <span style={{ display: 'flex', alignItems: 'center', boxSizing: 'border-box', blockSize: '100%', inlineSize: width, borderRadius: 'var(--salmon-radius-full)', background: `linear-gradient(90deg, var(--salmon-color-primary) ${progress}%, var(--salmon-color-primary-subtle) ${progress}%)`, color: 'var(--salmon-color-primary-contrast, #fff)', paddingInline: 6, fontSize: 11, overflow: 'hidden' }}>
                  {task.title}
                </span>
              ),
              renderParentTaskbar: ({ width, progress }) => <span style={{ display: 'block', inlineSize: width, blockSize: 6, marginBlockStart: 8, background: 'var(--salmon-text-secondary)', opacity: 0.4 + progress / 200 }} />,
              renderMilestone: () => <span aria-hidden="true" style={{ fontSize: 18 }}>🚩</span>,
            }
          : {})}
      />
      <p className="demo-status" aria-live="polite">
        {status || 'Hover a taskbar, a baseline or a connector'}
      </p>
    </div>
  );
}
