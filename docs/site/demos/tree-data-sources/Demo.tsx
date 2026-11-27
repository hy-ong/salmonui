'use client';

import { useRef, useState } from 'react';
import type { DataSource } from '@salmonui/data-grid/engine';
import type { DataSourceRequest, DataSourceResult, WriteResult } from '@salmonui/core/data';
import { createControlledDataSource, createJsonDataSource, tupleColumns, tupleRowId, type TupleRow } from '@salmonui/data';
import { createOfflineDataSource } from '@salmonui/data/local';
import { createJsonQueryHandler } from '@salmonui/data/server';
import { Button } from '@salmonui/buttons/button';
import { Select } from '@salmonui/dropdowns/select';
import { DataGrid, type DataGridAggregateRow, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';

interface Item {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly stock: number;
}

/** A product catalog as flat rows: category > range > product. */
const catalog: Item[] = [
  ['coffee', null, 'Coffee', 0],
  ['coffee-beans', 'coffee', 'Whole beans', 0],
  ['coffee-beans-1', 'coffee-beans', 'Ethiopia Guji', 42],
  ['coffee-beans-2', 'coffee-beans', 'Colombia Huila', 18],
  ['coffee-beans-3', 'coffee-beans', 'Brazil Cerrado', 64],
  ['coffee-ground', 'coffee', 'Ground', 0],
  ['coffee-ground-1', 'coffee-ground', 'Espresso blend', 30],
  ['coffee-ground-2', 'coffee-ground', 'Filter blend', 25],
  ['tea', null, 'Tea', 0],
  ['tea-green', 'tea', 'Green tea', 0],
  ['tea-green-1', 'tea-green', 'Sencha', 12],
  ['tea-green-2', 'tea-green', 'Gyokuro', 4],
  ['tea-black', 'tea', 'Black tea', 0],
  ['tea-black-1', 'tea-black', 'Assam', 22],
  ['tea-black-2', 'tea-black', 'Darjeeling', 9],
  ['gear', null, 'Brewing gear', 0],
  ['gear-1', 'gear', 'Pour-over cone', 15],
  ['gear-2', 'gear', 'Burr grinder', 6],
  ['gear-3', 'gear', 'Gooseneck kettle', 11],
  ['gifts', null, 'Gift boxes', 0],
  ['gifts-1', 'gifts', 'Tasting box', 20],
  ['gifts-2', 'gifts', 'Tea sampler', 14],
].map(([id, parentId, name, stock]) => ({ id: id as string, parentId: parentId as string | null, name: name as string, stock: stock as number }));

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const columns: DataGridColumn<Item>[] = [
  { field: 'name', header: 'Item', width: 240 },
  { field: 'id', header: 'ID', primaryKey: true, width: 160 },
  { field: 'stock', header: 'Stock', type: 'number', align: 'end', width: 100 },
];

type Log = (entry: string) => void;

/** Offline: one load, then expansion, sorting and filtering run locally. */
function OfflineTree({ push }: { push: Log }) {
  const [source] = useState(() =>
    createOfflineDataSource<Item>({
      load: async () => {
        push('load(): every row, once');
        await delay(300);
        return catalog;
      },
    }),
  );
  return <DataGrid<Item> aria-label="Catalog, offline source" data={source} columns={columns} getRowId={(row) => row.id} tree={{ parentIdField: 'parentId' }} sorting filtering height={380} />;
}

/** Controlled: the app answers every read, roots and children, keyed by request.parentRowId. */
function ControlledTree({ push, nested }: { push: Log; nested: boolean }) {
  const [source] = useState(() => {
    const envelope = (row: Item): unknown => {
      const kids = catalog.filter((r) => r.parentId === row.id);
      // Nested envelopes carry whole subtrees: no child reads follow.
      return nested ? { kind: 'tree', row, parentId: row.parentId, children: kids.map(envelope) } : { kind: 'tree', row, parentId: row.parentId, hasChildren: kids.length > 0, childCount: kids.length };
    };
    return createControlledDataSource<Item>({
      capabilities: { treeChildren: true },
      async onQueryChange(request: DataSourceRequest): Promise<DataSourceResult<Item>> {
        const parent = request.parentRowId === undefined || request.parentRowId === null ? null : String(request.parentRowId);
        let level = catalog.filter((row) => row.parentId === parent);
        const total = level.length;
        const paging = request.query.paging;
        // `pageBy: 'root'`: the app pages the root level.
        if (parent === null && paging) level = level.slice((paging.page - 1) * paging.pageSize, paging.page * paging.pageSize);
        push(`onQueryChange parentRowId=${parent ?? 'null'}${parent === null && paging ? `, page ${paging.page}` : ''}`);
        await delay(250);
        return { version: request.version, rows: level.map(envelope) as Item[], totalRowCount: total };
      },
    });
  });
  return (
    <DataGrid<Item>
      aria-label="Catalog, controlled source"
      data={source}
      columns={columns}
      getRowId={(row) => row.id}
      tree={{ parentIdField: 'parentId', defaultExpanded: false, pageBy: 'root' }}
      paging={{ pageSize: 2 }}
      height={380}
    />
  );
}

const FIELDS = ['id', 'parentId', 'name', 'stock'] as const;
const tupleCols = tupleColumns<DataGridColumn<TupleRow>>(
  [
    { field: 'name', header: 'Item', width: 240 },
    { field: 'id', header: 'ID', width: 160 },
    { field: 'stock', header: 'Stock', type: 'number', align: 'end', width: 160 },
  ],
  FIELDS,
);
const remoteAggregates: DataGridAggregateRow<TupleRow>[] = [{ columns: [{ field: 'stock', type: 'sum', renderFooter: ({ formatted }) => <>Server total {formatted['sum']}</> }] }];

/**
 * Server: the `@salmonui/data` JSON source over the reference handler of
 * `@salmonui/data/server`. The handler runs in this tab through an in-process transport; in an
 * app it answers POSTs from `createJsonDataSource({ url })`.
 */
function ServerTree({ push }: { push: Log }) {
  const [source] = useState(() => {
    const handler = createJsonQueryHandler(catalog as unknown as Record<string, unknown>[], {
      key: 'id',
      parentField: 'parentId',
      fields: FIELDS,
      types: { id: 'string', parentId: 'string', name: 'string', stock: 'number' },
    });
    const transport = handler.transport();
    return createJsonDataSource<TupleRow>({
      key: 'id',
      fields: FIELDS,
      batch: false,
      transport: async (request, ctx) => {
        const body = request as unknown as { parent?: unknown; query?: { where?: unknown; search?: unknown; aggregates?: unknown } };
        push(`POST parent=${String(body.parent ?? 'null')}${body.query?.where || body.query?.search ? ', filtered' : ''}${body.query?.aggregates ? ', aggregates' : ''}`);
        await delay(250);
        return transport(request, ctx);
      },
    });
  });
  return (
    <DataGrid<TupleRow>
      aria-label="Catalog, server source"
      data={source}
      columns={tupleCols}
      getRowId={tupleRowId(FIELDS, 'id')}
      tree={{ parentIdField: 'parentId', defaultExpanded: false }}
      aggregates={remoteAggregates}
      toolbar={['search']}
      filtering
      sorting
      height={380}
    />
  );
}

interface Task {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly stock: number;
}

/** A remote tree of 2,000 roots with three children each; root reads honour `range` (blocks). */
function createBlockSource(push: Log): DataSource<Task> {
  const names = new Map<string, string>();
  const root = (i: number): Task => ({ id: `w${i}`, parentId: null, name: names.get(`w${i}`) ?? `Warehouse ${i + 1}`, stock: (i * 37) % 500 });
  const child = (i: number, k: number): Task => ({ id: `w${i}-${k}`, parentId: `w${i}`, name: names.get(`w${i}-${k}`) ?? `Bay ${i + 1}.${k + 1}`, stock: (i * 7 + k * 13) % 90 });
  return {
    mode: 'remote',
    capabilities: { treeChildren: true, write: true },
    async read(request) {
      const parent = request.parentRowId === undefined || request.parentRowId === null ? null : String(request.parentRowId);
      await delay(parent === null ? 400 : 700);
      if (parent === null) {
        const start = request.range?.start ?? 0;
        const end = Math.min(request.range?.end ?? 2000, 2000);
        push(`read roots ${start}–${end - 1}`);
        const rows = Array.from({ length: Math.max(0, end - start) }, (_, k) => ({ kind: 'tree', row: root(start + k), parentId: null, hasChildren: true, childCount: 3 }));
        return { version: request.version, rows: rows as unknown as Task[], totalRowCount: 2000 };
      }
      push(`read children of ${parent}`);
      const i = Number(parent.slice(1));
      const rows = [0, 1, 2].map((k) => ({ kind: 'tree', row: child(i, k), parentId: parent, hasChildren: false }));
      return { version: request.version, rows: rows as unknown as Task[], totalRowCount: 3 };
    },
    async write(request): Promise<WriteResult<Task>> {
      for (const change of request.changed) names.set(String(change.rowId), change.row.name);
      push(`write: ${request.changed.map((c) => `${String(c.rowId)} → ${c.row.name}`).join(', ')}`);
      return { version: request.version, status: 'applied', changed: request.changed.map((c) => ({ rowId: c.rowId, row: c.row })) };
    },
  };
}

const blockColumns: DataGridColumn<Task>[] = [
  { field: 'name', header: 'Location', width: 240 },
  { field: 'id', header: 'ID', primaryKey: true, width: 120, editable: false },
  { field: 'stock', header: 'Stock', type: 'number', align: 'end', width: 100, editable: false },
];

/** Infinite scroll: blocks of root rows, collapsed start, editing and id selection across blocks; skeleton rows while children load. */
function InfiniteTree({ push }: { push: Log }) {
  const api = useRef<DataGridApi<Task> | null>(null);
  const [source] = useState(() => createBlockSource(push));
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => push(`selectRows(['w1', 'w1500']): ${api.current?.selectRows(['w1', 'w1500']).status ?? 'no grid'}`)}>
          Select w1 and w1500 by id
        </Button>
        <Button variant="outline" onClick={() => push(`selected: ${api.current?.getSelectedRowIds().join(', ') ?? ''}`)}>
          Read the selection
        </Button>
      </div>
      <DataGrid<Task>
        ref={api}
        aria-label="Warehouses, infinite scroll"
        data={source}
        columns={blockColumns}
        tree={{ parentIdField: 'parentId', defaultExpanded: false }}
        infiniteScroll={{ blockSize: 50, initialBlocks: 1 }}
        virtualization={{ skeletonRows: true }}
        selection={{ multiple: true }}
        editing={{ mode: 'cell' }}
        height={380}
      />
    </>
  );
}

type Kind = 'offline' | 'controlled' | 'nested' | 'server' | 'infinite';

const LABELS: Record<Kind, string> = {
  offline: 'Offline: load once',
  controlled: 'Controlled: one level per read, roots paged',
  nested: 'Controlled: nested envelopes (whole subtrees)',
  server: 'Server: reference handler',
  infinite: 'Infinite scroll: blocks of roots',
};
const KINDS = (Object.keys(LABELS) as Kind[]).map((value) => ({ value, label: LABELS[value] }));

export default function TreeDataSourcesDemo() {
  const [kind, setKind] = useState<Kind>('offline');
  const [log, push] = useEventLog();
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Data source{' '}
          <Select aria-label="Data source" data={KINDS} value={kind} onValueChange={(value) => value != null && setKind(value as Kind)} />
        </label>
      </div>
      {kind === 'offline' ? <OfflineTree push={push} /> : null}
      {kind === 'controlled' ? <ControlledTree key="controlled" push={push} nested={false} /> : null}
      {kind === 'nested' ? <ControlledTree key="nested" push={push} nested /> : null}
      {kind === 'server' ? <ServerTree push={push} /> : null}
      {kind === 'infinite' ? <InfiniteTree push={push} /> : null}
      <p className="demo-status">
        Expand rows and watch the reads in the log. With the server source, search &quot;sencha&quot; or filter Item: the server returns the matches with their ancestor chain, and the footer total comes from the server. With infinite scroll, scroll down for more roots and expand one to see a skeleton row while its children load.
      </p>
      <EventLog entries={log} label="Data source reads" />
    </>
  );
}
