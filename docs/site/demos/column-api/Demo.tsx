'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Select } from '@salmonui/dropdowns/select';
import { DataGrid, DataGridColumn, type DataGridApi, type DataGridColumn as DataGridColumnDef } from '@salmonui/data-grid';
import type { DataGridWarning } from '@salmonui/data-grid/engine';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(200, 5);

const FORMS = [
  { value: 'array', label: 'columns array' },
  { value: 'children', label: 'DataGridColumn children' },
];

// Plain text that looks like markup: React escapes it, so it shows literally.
const markup = (o: Order) => `<b>${o.customer}</b>`;

// The same columns as an array and as <DataGridColumn> children. No `type` on most columns:
// the type is inferred from the first non-null value. The Status column has neither
// `id` nor `field`, so its id is generated with a development warning.
const columns: DataGridColumnDef<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 140 },
  { field: 'quantity', header: 'Qty', align: 'end', width: 80 },
  { field: 'placed', header: 'Placed', format: 'yMMMd', width: 130 },
  { field: 'shipped', header: 'Shipped', width: 100 },
  { id: 'markup', header: 'Markup as text', valueGetter: markup, width: 170 },
  {
    header: 'Status',
    width: 130,
    // Function template: rich content from a render function, never a `${field}` string.
    renderCell: ({ row }) => (
      <span className="demo-badge" data-tone={row.shipped ? 'success' : 'info'}>
        <strong>{row.shipped ? 'Shipped' : 'Open'}</strong>
      </span>
    ),
  },
];

function ColumnChildren() {
  return [
    <DataGridColumn key="id" field="id" header="Order" primaryKey width={110} />,
    <DataGridColumn key="customer" field="customer" header="Customer" width={140} />,
    <DataGridColumn key="quantity" field="quantity" header="Qty" align="end" width={80} />,
    <DataGridColumn key="placed" field="placed" header="Placed" format="yMMMd" width={130} />,
    <DataGridColumn key="shipped" field="shipped" header="Shipped" width={100} />,
    <DataGridColumn<Order> key="markup" id="markup" header="Markup as text" valueGetter={markup} width={170} />,
    <DataGridColumn<Order>
      key="status"
      header="Status"
      width={130}
      renderCell={({ row }) => (
        <span className="demo-badge" data-tone={row.shipped ? 'success' : 'info'}>
          <strong>{row.shipped ? 'Shipped' : 'Open'}</strong>
        </span>
      )}
    />,
  ];
}

// The readout is a plain table: start-aligned, monospace, with row rules.
const tableStyle = { marginBlockStart: 'var(--salmon-space-3)', borderCollapse: 'collapse', fontFamily: 'var(--salmon-font-mono)', fontSize: 'var(--salmon-font-size-sm)' } as const;
const cellStyle = { textAlign: 'start', padding: 'var(--salmon-space-2) var(--salmon-space-5) var(--salmon-space-2) 0', borderBlockEnd: '1px solid var(--salmon-border-subtle)' } as const;

interface ColumnReadout {
  readonly id: string;
  readonly field: string;
  readonly type: string;
  readonly source: string;
  readonly index: number;
}

export default function ColumnApiDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  // Development warnings are delivered after commit, so they can be written to state.
  const [warnings, setWarnings] = useState<readonly string[]>([]);
  const [form, setForm] = useState<'array' | 'children'>('array');
  const [readout, setReadout] = useState<readonly ColumnReadout[]>([]);
  const [summary, setSummary] = useState('');
  const read = () => {
    const grid = api.current;
    if (!grid) return;
    // getColumns: every leaf; getColumnIndex / getColumnAt: positions in getVisibleColumns().
    setReadout(
      grid.getColumns().map((c) => ({ id: c.columnId, field: c.field ?? '-', type: c.type, source: c.typeSource, index: grid.getColumnIndex(c.columnId) })),
    );
    setSummary(
      `getColumn('customer'): ${grid.getColumn('customer')?.headerText}; getColumnAt(2): ${grid.getColumnAt(2)?.headerText}; ` +
        `visible ${grid.getVisibleColumns().length} of ${grid.getColumns().length}; warnings: ${warnings.join(' | ') || '-'}`,
    );
  };
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Columns as{' '}
          <Select aria-label="Columns as" data={FORMS} value={form} onValueChange={(value) => value != null && setForm(value as 'array' | 'children')} />
        </label>
        <Button variant="outline" onClick={read}>
          Read columns
        </Button>
        <Button variant="outline" onClick={() => api.current?.hideColumns('quantity')}>
          Hide Qty
        </Button>
        <Button variant="outline" onClick={() => api.current?.showColumns('quantity')}>
          Show Qty
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Orders with inferred column types"
        data={orders}
        // Pass one form: with both, the children win and development builds warn.
        {...(form === 'array' ? { columns } : null)}
        height={320}
        locale="en-US"
        timeZone="UTC"
        ref={api}
        onWarning={(warning: DataGridWarning) => {
          setWarnings((list) => [...list, warning.code]);
        }}
      >
        {form === 'children' ? ColumnChildren() : null}
      </DataGrid>
      <p className="demo-status" data-demo="summary">
        {summary || 'Press Read columns.'}
      </p>
      {readout.length > 0 ? (
        <table className="demo-table" data-demo="columns" style={tableStyle}>
          <thead>
            <tr>
              <th scope="col" style={cellStyle}>id</th>
              <th scope="col" style={cellStyle}>field</th>
              <th scope="col" style={cellStyle}>type</th>
              <th scope="col" style={cellStyle}>typeSource</th>
              <th scope="col" style={cellStyle}>getColumnIndex</th>
            </tr>
          </thead>
          <tbody>
            {readout.map((c) => (
              <tr key={c.id} data-column={c.id}>
                <td style={cellStyle}>{c.id}</td>
                <td style={cellStyle}>{c.field}</td>
                <td style={cellStyle}>{c.type}</td>
                <td style={cellStyle}>{c.source}</td>
                <td style={cellStyle}>{c.index}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </>
  );
}
