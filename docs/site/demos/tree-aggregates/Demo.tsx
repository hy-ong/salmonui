'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridAggregateRow, type DataGridApi, type DataGridColumn, type DataGridFilterUi } from '@salmonui/data-grid';
import { Select } from '@salmonui/dropdowns/select';
import { EventLog, useEventLog } from '../../components/demo-kit';

interface Item {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly owner: string;
  readonly status: 'Open' | 'Done' | 'Blocked';
  readonly cost: number;
  readonly billable: boolean;
}

// Flat self-referential rows: `parentId` names the parent's row id.
const items: Item[] = [
  { id: 'mkt', parentId: null, name: 'Marketing', owner: 'Ana', status: 'Open', cost: 1_200, billable: false },
  { id: 'mkt-web', parentId: 'mkt', name: 'Website refresh', owner: 'Ben', status: 'Open', cost: 8_400, billable: true },
  { id: 'mkt-web-copy', parentId: 'mkt-web', name: 'Copywriting', owner: 'Chen', status: 'Done', cost: 2_100, billable: true },
  { id: 'mkt-web-photos', parentId: 'mkt-web', name: 'Product photos', owner: 'Ben', status: 'Blocked', cost: 3_600, billable: true },
  { id: 'mkt-ads', parentId: 'mkt', name: 'Search ads', owner: 'Ana', status: 'Open', cost: 5_000, billable: false },
  { id: 'sales', parentId: null, name: 'Sales', owner: 'Dara', status: 'Open', cost: 900, billable: false },
  { id: 'sales-fair', parentId: 'sales', name: 'Trade fair', owner: 'Eli', status: 'Done', cost: 12_500, billable: true },
  { id: 'sales-fair-booth', parentId: 'sales-fair', name: 'Booth', owner: 'Eli', status: 'Done', cost: 6_000, billable: true },
  { id: 'sales-fair-travel', parentId: 'sales-fair', name: 'Travel', owner: 'Fay', status: 'Open', cost: 2_800, billable: false },
  { id: 'sales-crm', parentId: 'sales', name: 'CRM licences', owner: 'Dara', status: 'Blocked', cost: 4_300, billable: false },
  { id: 'it', parentId: null, name: 'IT', owner: 'Gus', status: 'Open', cost: 500, billable: false },
  { id: 'it-laptops', parentId: 'it', name: 'Laptops', owner: 'Gus', status: 'Done', cost: 9_900, billable: false },
  { id: 'it-vpn', parentId: 'it', name: 'VPN renewal', owner: 'Hal', status: 'Open', cost: 1_400, billable: false },
];

const columns: DataGridColumn<Item>[] = [
  { field: 'name', header: 'Item', width: 180 },
  { field: 'id', header: 'ID', primaryKey: true, width: 110 },
  { field: 'owner', header: 'Owner', width: 100 },
  { field: 'status', header: 'Status', width: 100 },
  { field: 'cost', header: 'Cost', type: 'number', format: 'C0', align: 'end', width: 330 },
  { field: 'billable', header: 'Billable', type: 'boolean', width: 110 },
];

// Footer aggregates over the kept rows of every depth, several types per column, with
// footer templates; `renderChildFooter` adds a child summary row under each expanded parent.
const aggregates: DataGridAggregateRow<Item>[] = [
  {
    columns: [
      {
        field: 'cost',
        type: ['sum', 'average', 'min', 'max'],
        format: 'C0',
        renderFooter: ({ formatted }) => (
          <>
            Total {formatted['sum']} · avg {formatted['average']} · {formatted['min']}–{formatted['max']}
          </>
        ),
        renderChildFooter: ({ formatted }) => (
          <>
            Subtotal {formatted['sum']} · max {formatted['max']}
          </>
        ),
      },
      { field: 'status', type: 'count', renderFooter: ({ values }) => <>{String(values['count'])} items</> },
      { field: 'billable', type: ['trueCount', 'falseCount'], renderFooter: ({ values }) => <>{`${String(values['trueCount'])} yes / ${String(values['falseCount'])} no`}</> },
      { field: 'owner', type: 'custom', custom: (rows) => new Set(rows.map((row) => row.owner)).size, renderFooter: ({ values }) => <>{String(values['custom'])} owners</> },
    ],
  },
];

const FILTER_UI_OPTIONS = [
  { value: 'excel', label: 'Excel' },
  { value: 'checklist', label: 'Checklist' },
  { value: 'menu', label: 'Menu' },
];

export default function TreeAggregatesDemo() {
  const api = useRef<DataGridApi<Item> | null>(null);
  const [ui, setUi] = useState<DataGridFilterUi>('excel');
  const [log, push] = useEventLog();
  const describe = (rowId: string) => {
    const grid = api.current;
    const info = grid?.getTreeRow(rowId);
    if (!grid || !info) return;
    const children = grid.getChildRows(rowId).map((row) => row.name);
    push(`${rowId}: depth ${info.depth}, parent ${String(info.parentId)}, ${info.childCount} children (${children.join(', ') || 'none'}), ${info.expanded ? 'expanded' : 'collapsed'}, ${info.posinset} of ${info.setsize}`);
  };
  return (
    <>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.expandTreeRows(['mkt', 'sales'])}>
          Expand Marketing and Sales
        </Button>
        <Button variant="outline" onClick={() => api.current?.collapseTreeRows('mkt')}>
          Collapse Marketing
        </Button>
        <Button variant="outline" onClick={() => describe('sales-fair')}>
          Row info of Trade fair
        </Button>
        <Button variant="outline" onClick={() => push(`visible rows: ${api.current?.getVisibleRows().map((row) => row.id).join(', ') ?? ''}`)}>
          Visible rows
        </Button>
        <label>
          Filter UI{' '}
          <Select aria-label="Filter UI" data={FILTER_UI_OPTIONS} value={ui} onValueChange={(value) => value != null && setUi(value as DataGridFilterUi)} />
        </label>
      </div>
      <DataGrid<Item>
        ref={api}
        aria-label="Budget items"
        data={items}
        columns={columns}
        getRowId={(row) => row.id}
        tree={{ parentIdField: 'parentId', defaultExpanded: 1 }}
        aggregates={aggregates}
        sorting
        filtering={{ ui }}
        paging={{ pageSize: 8 }}
        height={460}
        locale="en-US"
        currency="USD"
        onTreeToggle={(event) => push(`${String(event.rowId)} ${event.expanded ? 'expanded' : 'collapsed'} (${event.source})`)}
        onFilterChange={(event) => push(`filter ${event.field ?? 'all'}: ${JSON.stringify(event.filters)}`)}
      />
      <p className="demo-status">
        Open the Status or Owner filter: the value list counts rows of every depth, not only roots. Expand a row, then sort, filter or change the page: the expansion stays because it is keyed by row id.
      </p>
      <EventLog entries={log} />
    </>
  );
}
