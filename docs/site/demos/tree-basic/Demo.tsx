'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridAggregateRow, type DataGridApi, type DataGridColumn, type DataGridTreeToggleEvent } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';

interface Task {
  readonly id: string;
  readonly name: string;
  readonly owner: string;
  readonly hours: number;
  readonly children?: readonly Task[];
}

// Nested rows (`tree: true` reads the `children` field); rows are kept by reference.
const plan: Task[] = [
  {
    id: 'plan',
    name: 'Planning',
    owner: 'Ana',
    hours: 2,
    children: [
      { id: 'scope', name: 'Scope', owner: 'Ana', hours: 4, children: [{ id: 'interviews', name: 'Interviews', owner: 'Ben', hours: 6 }, { id: 'brief', name: 'Brief', owner: 'Ana', hours: 3 }] },
      { id: 'budget', name: 'Budget', owner: 'Chen', hours: 3 },
    ],
  },
  {
    id: 'build',
    name: 'Build',
    owner: 'Dev',
    hours: 1,
    children: [
      { id: 'backend', name: 'Backend', owner: 'Eli', hours: 20, children: [{ id: 'api', name: 'API', owner: 'Eli', hours: 12 }, { id: 'db', name: 'Database', owner: 'Fay', hours: 8 }] },
      { id: 'frontend', name: 'Frontend', owner: 'Gus', hours: 18 },
      { id: 'tests', name: 'Tests', owner: 'Hal', hours: 9 },
    ],
  },
  { id: 'launch', name: 'Launch', owner: 'Ivy', hours: 2, children: [{ id: 'notes', name: 'Release notes', owner: 'Ivy', hours: 2 }] },
];

const columns: DataGridColumn<Task>[] = [
  { field: 'name', header: 'Task', width: 260 },
  { field: 'id', header: 'ID', primaryKey: true, width: 110 },
  { field: 'owner', header: 'Owner', width: 120 },
  { field: 'hours', header: 'Hours', type: 'number', align: 'end', width: 130 },
];

// A child summary row under each expanded parent.
const aggregates: DataGridAggregateRow<Task>[] = [
  { columns: [{ field: 'hours', type: 'sum', renderChildFooter: ({ formatted }) => <>Subtotal {formatted['sum']}</> }] },
];

export default function TreeBasicDemo() {
  const api = useRef<DataGridApi<Task> | null>(null);
  const [log, push] = useEventLog();
  const [summaries, setSummaries] = useState(true);
  const [lockBuild, setLockBuild] = useState(false);
  const onBefore = (event: DataGridTreeToggleEvent<Task>) => {
    if (lockBuild && event.rowId === 'build' && !event.expanded) {
      event.preventDefault();
      push('collapse of Build cancelled');
    }
  };
  const onToggle = (event: DataGridTreeToggleEvent<Task>) => push(`${event.row?.name ?? event.rowId} ${event.expanded ? 'expanded' : 'collapsed'} (depth ${event.depth}, ${event.source})`);
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" type="button" onClick={() => api.current?.expandAllTreeRows()}>
          Expand all
        </Button>
        <Button variant="outline" type="button" onClick={() => api.current?.collapseAllTreeRows()}>
          Collapse all
        </Button>
        <Button variant="outline" type="button" onClick={() => api.current?.expandTreeLevel(0)}>
          Expand level 0
        </Button>
        <Button variant="outline" type="button" onClick={() => api.current?.collapseTreeLevel(1)}>
          Collapse level 1
        </Button>
        <Button variant="outline" type="button" onClick={() => api.current?.toggleTreeRow('backend')}>
          Toggle Backend
        </Button>
      </div>
      <div className="demo-toolbar">
        <Checkbox checked={summaries} onCheckedChange={(checked) => setSummaries(checked)}>
          Child summaries
        </Checkbox>
        <Checkbox checked={lockBuild} onCheckedChange={(checked) => setLockBuild(checked)}>
          Cancel collapsing Build
        </Checkbox>
      </div>
      <DataGrid<Task>
        ref={api}
        aria-label="Project plan"
        data={plan}
        columns={columns}
        tree
        sorting
        height={420}
        {...(summaries ? { aggregates } : {})}
        onBeforeTreeToggle={onBefore}
        onTreeToggle={onToggle}
      />
      <p className="demo-status">
        Click a chevron, or focus a Task cell and press ArrowRight / ArrowLeft, Ctrl+Shift+ArrowDown / ArrowUp (this row) or Ctrl+ArrowDown / ArrowUp (all rows). Sorting orders siblings inside each parent.
      </p>
      <EventLog entries={log} />
    </>
  );
}
