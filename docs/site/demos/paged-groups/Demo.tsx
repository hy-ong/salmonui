'use client';

import { useState } from 'react';
import { DataGrid, type DataGridAggregateContext, type DataGridAggregateRow, type DataGridColumn } from '@salmonui/data-grid';
import { Radio, RadioGroup } from '@salmonui/inputs/radio-group';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(400, 17);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 230 },
];

// Module-level templates and definitions: stable across renders.
const amountFooter = ({ formatted, values }: DataGridAggregateContext<Order>) => (
  <span data-testid="amount-footer">
    {String(values['count'])} orders · Σ {formatted['sum']}
  </span>
);
const amountGroupFooter = ({ formatted, values }: DataGridAggregateContext<Order>) => (
  <span>
    {String(values['count'])} orders · Σ {formatted['sum']}
  </span>
);
const amountTypes = ['sum', 'count'] as const;
const aggregates: DataGridAggregateRow<Order>[] = [{ columns: [{ field: 'amount', type: amountTypes, format: 'C2', renderFooter: amountFooter, renderGroupFooter: amountGroupFooter }] }];
const grouping = { groupBy: ['country'], showGroupedColumns: true };
const paging = { pageSize: 25 };

export default function PagedGroupsDemo() {
  const [scope, setScope] = useState<'page' | 'all'>('page');
  return (
    <>
      <div className="demo-toolbar">
        <RadioGroup label="Aggregate scope" name="aggregate-scope" orientation="horizontal" value={scope} onValueChange={(value) => setScope(value as 'page' | 'all')}>
          <Radio value="page">Aggregate the current page</Radio>
          <Radio value="all">Aggregate every row</Radio>
        </RadioGroup>
      </div>
      <DataGrid<Order>
        aria-label="Grouped orders, 25 per page, with page-wise or whole aggregates"
        data={orders}
        columns={columns}
        grouping={grouping}
        paging={paging}
        aggregates={aggregates}
        aggregateScope={scope}
        height={420}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
      />
      <p className="demo-status">Pages count data rows; captions and footers of the groups on a page come along. Change the page and watch the footer.</p>
    </>
  );
}
