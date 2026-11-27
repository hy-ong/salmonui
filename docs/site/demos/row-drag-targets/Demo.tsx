'use client';

import { useState } from 'react';
import { createLocalDataSource, type DataSource } from '@salmonui/data-grid/engine';
import { type WriteRequest } from '@salmonui/core/data';
import { DataGrid, type DataGridColumn, type DataGridSorting } from '@salmonui/data-grid';
import { EventLog, useDemoStore, useEventLog } from '../../components/demo-kit';

interface Task {
  readonly id: string;
  readonly title: string;
  readonly rank: number;
}

const TITLES = ['Write release notes', 'Fix the login redirect', 'Review the pricing page', 'Book the team offsite', 'Answer support mail', 'Update the onboarding guide', 'Plan the next milestone', 'Clean up the shared drive'];

const columns: DataGridColumn<Task>[] = [
  { field: 'id', header: 'Task', primaryKey: true, width: 90 },
  { field: 'title', header: 'Title', width: 230 },
  { field: 'rank', header: 'Rank', type: 'number', align: 'end', width: 90 },
];

// Sorted ascending by the order field: drops stay valid.
const byRank: DataGridSorting = { sortBy: [{ field: 'rank', direction: 'asc' }] };

/** A "server" that persists the rank values a drop writes. */
function createRankedSource(push: (entry: string) => void): DataSource<Task> {
  const store = createLocalDataSource<Task>(
    TITLES.map((title, i) => ({ id: `T-${i + 1}`, title, rank: (i + 1) * 10 })),
    { getRowId: (row) => row.id },
  );
  return {
    mode: 'local',
    read: (request) => store.read(request),
    subscribe: (listener) => store.subscribe(listener),
    capabilities: { write: true },
    write(request: WriteRequest<Task>) {
      const ranks = request.changed.map((c) => `${c.rowId}.rank=${c.row.rank}`).join(', ');
      push(`write: moved ${request.moved?.rowIds.join(', ') ?? '-'}; changed ${ranks || '-'}`);
      return store.write(request);
    },
  };
}

export default function RowDragTargetsDemo() {
  const [log, push] = useEventLog();
  const [source] = useState(() => createRankedSource(push));
  const [inbox, inboxStore] = useDemoStore<readonly Task[]>(TITLES.slice(0, 5).map((title, i) => ({ id: `M-${i + 1}`, title: `Mail: ${title}`, rank: i })));
  const [archived, archivedStore] = useDemoStore<readonly string[]>([]);
  return (
    <>
      <div className="demo-columns">
        <DataGrid<Task>
          aria-label="Ranked tasks"
          data={source}
          columns={columns}
          sorting={byRank}
          height={320}
          locale="en-US"
          rowDrag={{ orderField: 'rank' }}
          onRowDrop={(e) => push(`ranked drop: ${e.rowIds.join(', ')} at ${e.toIndex}`)}
        />
        <div>
          <DataGrid<Task>
            aria-label="Inbox"
            data={inbox}
            columns={columns.slice(0, 2)}
            height={240}
            locale="en-US"
            rowDrag={{ targetId: 'row-drag-archive' }}
            onRowDrop={(e) => {
              // A custom element target: the grid moves nothing; the app decides.
              if (e.targetGridId !== null || e.target?.closest('#row-drag-archive') == null) return;
              const ids = new Set(e.rowIds);
              inboxStore.set((rows) => rows.filter((row) => !ids.has(row.id)));
              archivedStore.set((list) => [...list, ...e.rowIds]);
              push(`archived ${e.rowIds.join(', ')} (dropped on #row-drag-archive)`);
            }}
          />
          <div id="row-drag-archive" className="demo-drop-zone" aria-label="Archive drop zone">
            Archive: drop inbox rows here {archived.length ? `(${archived.join(', ')})` : ''}
          </div>
        </div>
      </div>
      <EventLog entries={log} />
    </>
  );
}
