'use client';

import { useState } from 'react';
import { DataGrid, type DataGridColumn, type DataGridRowDragEvent } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useDemoStore, useEventLog } from '../../components/demo-kit';

interface Story {
  readonly id: string;
  readonly title: string;
  readonly points: number;
  readonly children?: readonly Story[];
}

const backlog: Story[] = [
  {
    id: 'b-search',
    title: 'Search',
    points: 8,
    children: [
      { id: 'b-search-filters', title: 'Saved filters', points: 3 },
      { id: 'b-search-typo', title: 'Typo tolerance', points: 5, children: [{ id: 'b-search-typo-de', title: 'German stemming', points: 2 }] },
    ],
  },
  { id: 'b-export', title: 'Export', points: 5, children: [{ id: 'b-export-pdf', title: 'PDF page numbers', points: 2 }] },
  { id: 'b-dark', title: 'Dark mode polish', points: 3 },
];

const storyId = (story: Story) => story.id;

const sprint: Story[] =[{ id: 's-goal', title: 'Sprint 14 goal', points: 0, children: [] }];

const columns: DataGridColumn<Story>[] = [
  { field: 'title', header: 'Story', width: 230 },
  { field: 'points', header: 'Points', type: 'number', align: 'end', width: 80 },
];

type Target = 'tree-drag-sprint' | 'tree-drag-archive';

const DROP_TARGET_OPTIONS = [
  { value: 'tree-drag-sprint', label: 'The sprint tree grid' },
  { value: 'tree-drag-archive', label: 'The archive element' },
];

export default function TreeDragTargetsDemo() {
  const [target, setTarget] = useState<Target>('tree-drag-sprint');
  const [log, push] = useEventLog();
  const [archived, archivedStore] = useDemoStore<readonly string[]>([]);
  const onDrop = (event: DataGridRowDragEvent<Story>) => {
    // `rows()` holds the dragged rows with their subtrees, in tree order.
    const moved = event.rows().map((row) => row.id);
    if (event.targetGridId === 'tree-drag-sprint') push(`${event.rowIds.join(', ')} → sprint grid ${event.position ?? ''} ${event.targetRowId ?? ''} (with ${moved.length - event.rowIds.length} descendants)`);
    else if (event.targetGridId === null && event.target?.closest('#tree-drag-archive')) {
      // A custom element target: the grid moves nothing; the app decides.
      archivedStore.set((list) => [...list, ...moved]);
      push(`archived ${moved.join(', ')}`);
    }
  };
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Drop target
          <Select aria-label="Drop target" data={DROP_TARGET_OPTIONS} value={target} onValueChange={(value) => value != null && setTarget(value as Target)} />
        </label>
      </div>
      <div className="demo-columns">
        <DataGrid<Story>
          id="tree-drag-backlog"
          getRowId={storyId}
          aria-label="Backlog"
          data={backlog}
          columns={columns}
          tree
          rowDrag={{ targetId: target }}
          height={300}
          onRowDrop={onDrop}
        />
        <div>
          <DataGrid<Story> id="tree-drag-sprint" getRowId={storyId}aria-label="Sprint" data={sprint} columns={columns} tree rowDrag height={200} />
          <div id="tree-drag-archive" className="demo-drop-zone" aria-label="Archive drop zone">
            Archive: {archived.length ? archived.join(', ') : 'drop backlog rows here'}
          </div>
        </div>
      </div>
      <p className="demo-status">Drag a parent by its grip: its subtree travels with it, into the sprint grid (before, after or into a row) or onto the archive element.</p>
      <EventLog entries={log} />
    </>
  );
}
