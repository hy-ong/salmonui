'use client';

import { useState } from 'react';
import { Gantt, type GanttProps } from '@salmonui/gantt';
import { Button } from '@salmonui/buttons/button';
import { Select } from '@salmonui/dropdowns/select';

type Task = { id: number; title: string; parentId: number | null; start?: string; duration?: number; progress?: number; predecessors?: string; team?: string; priority?: 'Low' | 'Normal' | 'High' };

const tasks: Task[] = [
  { id: 1, title: 'Payments platform', parentId: null, team: 'Platform' },
  { id: 2, title: 'API design', parentId: 1, start: '2027-02-01', duration: 4, progress: 100, team: 'Platform', priority: 'High' },
  { id: 3, title: 'Card processing', parentId: 1, duration: 8, progress: 50, predecessors: '2FS', team: 'Payments', priority: 'High' },
  { id: 4, title: 'Refunds', parentId: 1, duration: 5, progress: 10, predecessors: '3SS+2d', team: 'Payments', priority: 'Normal' },
  { id: 5, title: 'Mobile', parentId: null, team: 'Apps' },
  { id: 6, title: 'Checkout screen', parentId: 5, start: '2027-02-08', duration: 6, progress: 30, team: 'Apps', priority: 'Normal' },
  { id: 7, title: 'Wallet integration', parentId: 5, duration: 4, predecessors: '6FS', team: 'Apps', priority: 'Low' },
  { id: 8, title: 'Saved cards', parentId: 5, duration: 3, predecessors: '7FS', team: 'Apps', priority: 'Low' },
];

const columns: NonNullable<GanttProps<Task>['columns']> = [
  { field: 'id', header: 'ID', width: 84, pinned: 'start' },
  'title',
  { field: 'team', header: 'Team', width: 110 },
  {
    field: 'priority',
    header: 'Priority',
    width: 100,
    renderCell: ({ value }) => (value ? <span className="demo-badge" data-tone={value === 'High' ? undefined : 'info'}>{String(value)}</span> : null),
  },
  'start',
  'end',
  'duration',
  { field: 'progress', header: 'Done', width: 80, hidden: true },
];

/** The task pane is a Data Grid: sorting, filtering, search, selection, column menu, reorder, resize, a pinned column, a column chooser, templates, grid lines, tree expansion, the tree column, row drag and the empty view. */
export default function GanttGridPaneDemo() {
  const [data, setData] = useState<readonly Task[]>(tasks);
  const [lines, setLines] = useState<'both' | 'horizontal' | 'none'>('both');
  const [treeColumn, setTreeColumn] = useState<'title' | 'team'>('title');
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((l) => [line, ...l].slice(0, 6));
  return (
    <div>
      <div className="demo-toolbar">
        <label>
          Grid lines
          <Select aria-label="Grid lines" data={[{ value: 'both', label: 'both' }, { value: 'horizontal', label: 'horizontal' }, { value: 'none', label: 'none' }]} value={lines} onValueChange={(value) => value != null && setLines(value as 'both' | 'horizontal' | 'none')} />
        </label>
        <label>
          Tree column
          <Select aria-label="Tree column" data={[{ value: 'title', label: 'title' }, { value: 'team', label: 'team' }]} value={treeColumn} onValueChange={(value) => value != null && setTreeColumn(value as 'title' | 'team')} />
        </label>
        <Button variant="outline" type="button" onClick={() => setData([])}>
          Remove every task
        </Button>
        <Button variant="outline" type="button" onClick={() => setData(tasks)}>
          Restore tasks
        </Button>
      </div>
      <Gantt<Task>
        aria-label="Payments roadmap"
        data={data}
        taskFields={{ parentId: 'parentId' }}
        columns={columns}
        treeColumn={treeColumn}
        treeFilterMode="ancestors"
        defaultExpanded="all"
        timeZone="UTC"
        locale="en-GB"
        height={440}
        sorting
        filtering
        search
        toolbar={['search', 'expandAll', 'collapseAll']}
        selection={{ multiple: true }}
        columnMenu
        reorderable
        resizable
        columnChooser
        gridLines={lines}
        highlightOnHover
        getRowProps={(row) => (row.priority === 'High' ? { className: 'demo-row--flagged' } : undefined)}
        rowDrag
        renderEmpty={() => <p style={{ padding: 16 }}>No tasks yet. Press “Restore tasks”.</p>}
        onSortChange={(e) => add(`onSortChange ${e.sortBy.map((s) => `${s.field} ${s.direction}`).join(', ') || 'none'}`)}
        onFilterChange={() => add('onFilterChange')}
        onSearchChange={(e) => add(`onSearchChange "${e.text}"`)}
        onSelectionChange={(e) => add(`onSelectionChange [${e.rowIds.join(', ')}]`)}
        onColumnReorder={() => add('onColumnReorder')}
        onColumnResizeEnd={() => add('onColumnResizeEnd')}
        onColumnVisibilityChange={() => add('onColumnVisibilityChange')}
        onTreeToggle={(e) => add(`onTreeToggle ${String(e.rowId)} ${e.expanded ? 'expanded' : 'collapsed'}`)}
        onRowDrop={() => add('onRowDrop')}
        onDataChange={(rows) => setData(rows)}
      />
      <div className="demo-log" aria-live="polite">
        <ol>{log.length ? log.map((line, i) => <li key={`${i}-${line}`}>{line}</li>) : <li>Sort, filter, search or drag a row</li>}</ol>
      </div>
    </div>
  );
}
