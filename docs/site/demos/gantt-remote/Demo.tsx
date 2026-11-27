'use client';

import { useMemo, useRef, useState } from 'react';
import { createControlledDataSource } from '@salmonui/data';
import { Gantt, type GanttApi, type GanttProps } from '@salmonui/gantt';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';

type Task = { id: number; title: string; parentId: number | null; start?: string; duration?: number; progress?: number; predecessors?: string; hasChildren?: boolean };

const SERVER: Task[] = [
  { id: 1, title: 'Data center migration', parentId: null },
  { id: 2, title: 'Inventory', parentId: 1, start: '2027-09-06', duration: 3, progress: 100 },
  { id: 3, title: 'Network cutover', parentId: 1, duration: 2, predecessors: '2FS' },
  { id: 4, title: 'Wave 1', parentId: null, start: '2027-09-13', duration: 5 },
];
const WAVE: Task[] = [
  { id: 41, title: 'Web servers', parentId: 4, start: '2027-09-13', duration: 2 },
  { id: 42, title: 'Databases', parentId: 4, duration: 3, predecessors: '41FS' },
];

// A local array whose wave loads its children on expand (hasChildrenField / loadChildren).
const LOCAL: Task[] = [
  { id: 100, title: 'Local plan', parentId: null },
  { id: 101, title: 'Offline task', parentId: 100, start: '2027-09-06', duration: 4 },
  { id: 4, title: 'Wave 1 (loads on expand)', parentId: null, start: '2027-09-13', duration: 5, hasChildren: true },
];

const wait = (ms: number, signal?: { addEventListener(type: 'abort', listener: () => void): void }) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    });
  });


const COLUMNS: NonNullable<GanttProps<Task>['columns']> = ['title', 'start', 'end', 'duration'];
/** A controlled data source with a slow first read and skeleton rows, children loaded on expand, writes that may be rejected, data replacement, onViewChange and the loading spinner. */
export default function GanttRemoteDemo() {
  const apiRef = useRef<GanttApi<Task>>(null);
  const reject = useRef(false);
  const [rejecting, setRejecting] = useState(false);
  const [local, setLocal] = useState(false);
  const [localRows, setLocalRows] = useState<readonly Task[]>(LOCAL);
  const [log, setLog] = useState<string[]>([]);
  const add = (line: string) => setLog((l) => [line, ...l].slice(0, 8));
  const source = useMemo(
    () =>
      createControlledDataSource<Task>({
        onQueryChange: async (request) => {
          await wait(900, request.signal);
          return { version: request.version, rows: SERVER.map((r) => ({ ...r })), totalRowCount: SERVER.length };
        },
        onDataChange: async (request) => {
          await wait(600, request.signal);
          if (reject.current) return { version: request.version, status: 'rejected' as const };
          add(`write: ${request.changed.length} changed, ${request.added.length} added, ${request.deleted.length} deleted`);
          return { version: request.version, status: 'applied' as const, changed: request.changed.map((c) => ({ rowId: c.rowId, row: c.row })) };
        },
      }),
    [],
  );
  return (
    <div>
      <div className="demo-toolbar">
        <Checkbox
          checked={rejecting}
          onCheckedChange={(checked) => {
            reject.current = checked;
            setRejecting(checked);
          }}
        >
          Server rejects writes
        </Checkbox>
        <Button variant="outline" type="button" onClick={() => setLocal((l) => !l)}>
          {local ? 'Back to the server source' : 'Switch to a local array'}
        </Button>
        {local ? (
          <Button variant="outline" type="button" onClick={() => setLocalRows((rows) => [...rows, { id: 200 + rows.length, title: `Added task ${rows.length - 2}`, parentId: 100, start: '2027-09-08', duration: 2 }])}>
            Replace the array (one more task)
          </Button>
        ) : null}
        <Button variant="outline" type="button" onClick={() => apiRef.current?.refresh()}>
          Reload (refresh)
        </Button>
        <Button variant="outline"
          type="button"
          onClick={() => {
            apiRef.current?.setLoading(true);
            setTimeout(() => apiRef.current?.setLoading(false), 1200);
          }}
        >
          setLoading for 1.2 s
        </Button>
      </div>
      <Gantt<Task>
        // A source and an array are different data modes: switching remounts; a new array is reactive.
        key={local ? 'local' : 'remote'}
        ref={apiRef}
        aria-label="Data center migration from a server"
        data={local ? localRows : source}
        onDataChange={(rows) => local && setLocalRows(rows)}
        taskFields={{ parentId: 'parentId' }}
        columns={COLUMNS}
        hasChildrenField="hasChildren"
        loadChildren={async ({ rowId, signal }) => {
          add(`loadChildren(${String(rowId)})`);
          await wait(700, signal);
          return WAVE.map((r) => ({ ...r }));
        }}
        loadingIndicator="skeleton"
        timeZone="UTC"
        locale="en-GB"
        height={360}
        onViewChange={() => add('onViewChange')}
        onError={(e) => add(`onError(${e.action}) for [${e.taskIds.join(', ')}]: reverted`)}
      />
      <div className="demo-log" aria-live="polite">
        <ol>{log.length ? log.map((line, i) => <li key={`${i}-${line}`}>{line}</li>) : <li>Loading from the server…</li>}</ol>
      </div>
    </div>
  );
}
