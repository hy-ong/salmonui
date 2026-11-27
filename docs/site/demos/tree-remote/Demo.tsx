'use client';

import { useRef, useState } from 'react';
import type { DataSource } from '@salmonui/data-grid/engine';
import type { DataSourceRequest, DataSourceResult } from '@salmonui/core/data';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';

interface Folder {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly items: number;
}

/** A deterministic folder tree, three levels deep, generated per parent id. */
function childrenOf(parentId: string | null): Folder[] {
  const depth = parentId === null ? 0 : parentId.split('/').length;
  const count = depth === 0 ? 6 : 4;
  return Array.from({ length: count }, (_, i) => {
    const id = parentId === null ? `r${i + 1}` : `${parentId}/${i + 1}`;
    return { id, parentId, name: depth === 0 ? `Region ${i + 1}` : depth === 1 ? `Site ${id}` : `Rack ${id}`, items: ((i + 3) * (depth + 2) * 7) % 97 };
  });
}

interface FakeServer {
  readonly source: DataSource<Folder>;
  failNext: boolean;
}

/**
 * A fake remote source: `read({ parentRowId })` answers one tree level after
 * a delay, as tree envelopes with `hasChildren`. Any source with
 * `mode: 'remote'` and `parentRowId` reads works the same way, for example
 * `createJsonDataSource` from `@salmonui/data` against a server that serves
 * tree levels.
 */
function createFakeServer(onRead: (parent: string | null, failed: boolean) => void): FakeServer {
  const server: FakeServer = {
    failNext: false,
    source: {
      mode: 'remote',
      capabilities: { treeChildren: true },
      read(request: DataSourceRequest): Promise<DataSourceResult<Folder>> {
        const parent = request.parentRowId === undefined || request.parentRowId === null ? null : String(request.parentRowId);
        return new Promise((resolve, reject) => {
          setTimeout(() => {
            if (parent !== null && server.failNext) {
              server.failNext = false;
              onRead(parent, true);
              reject(new Error('Network error'));
              return;
            }
            onRead(parent, false);
            const level = childrenOf(parent);
            const depth = parent === null ? 0 : parent.split('/').length;
            const rows = level.map((row) => ({ kind: 'tree' as const, row, parentId: parent, hasChildren: depth < 2 }));
            resolve({ version: request.version, rows: rows as never, totalRowCount: rows.length, performed: ['search', 'filter', 'sort', 'aggregate', 'page'] });
          }, 400);
        });
      },
    },
  };
  return server;
}

const columns: DataGridColumn<Folder>[] = [
  { field: 'name', header: 'Folder', width: 280 },
  { field: 'id', header: 'ID', primaryKey: true, width: 120 },
  { field: 'items', header: 'Items', type: 'number', align: 'end', width: 100 },
];

export default function TreeRemoteDemo() {
  const api = useRef<DataGridApi<Folder> | null>(null);
  const [log, push] = useEventLog();
  const [failed, setFailed] = useState<string | null>(null);
  const [failNext, setFailNext] = useState(false);
  // Created once per mounted grid (data sources are initial-only).
  const [server] = useState(() => createFakeServer((parent, didFail) => push(`read parentRowId=${parent ?? 'null'}${didFail ? ' failed' : ''}`)));
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox
          checked={failNext}
          onCheckedChange={(checked) => {
            server.failNext = checked;
            setFailNext(checked);
          }}
        >
          Fail the next child read
        </Checkbox>
        <Button variant="outline" disabled={failed === null} onClick={() => failed !== null && api.current?.reloadTreeChildren(failed)}>
          Retry {failed ?? ''}
        </Button>
      </div>
      <DataGrid<Folder>
        ref={api}
        aria-label="Remote folders"
        data={server.source}
        columns={columns}
        tree={{ parentIdField: 'parentId', defaultExpanded: false }}
        height={420}
        onTreeToggle={(event) => {
          if (event.expanded && event.lazy) push(`expand ${String(event.rowId)}: ${api.current?.getTreeRow(event.rowId)?.loadStatus ?? ''}`);
        }}
        onError={(event) => {
          if (event.action !== 'treeChildren') return;
          const rowId = (event as { rowId?: unknown }).rowId;
          setFailed(rowId === undefined ? null : String(rowId));
          setFailNext(false);
          push(`onError treeChildren ${String(rowId)}: ${event.error.message}`);
        }}
      />
      <p className="demo-status">
        Roots load first; expanding a folder reads its children once (the toggle spins while loading) and caches them. A failed read sets loadStatus to error; retry with the button or the toggle.
      </p>
      <EventLog entries={log} />
    </>
  );
}
