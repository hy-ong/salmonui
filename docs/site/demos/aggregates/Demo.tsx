'use client';

import { useRef, useState } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, DataGridAggregate, DataGridAggregateRow, type DataGridAggregateContext, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(20_000, 33);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 120 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'category', header: 'Category', width: 120 },
  { field: 'quantity', header: 'Qty', type: 'number', align: 'end', width: 140 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 260 },
  { field: 'shipped', header: 'Shipped', type: 'boolean', displayAsCheckbox: true, align: 'center', width: 130 },
];

// Templates are module-level so the aggregate definitions stay stable across renders.
// A template decides where the value shows: footer, group footer, group caption.
type Ctx = DataGridAggregateContext<Order>;
const amountFooter = ({ formatted }: Ctx) => <span>Σ {formatted['sum']} · avg {formatted['average']}</span>;
const amountGroupFooter = ({ formatted, count }: Ctx) => <span>{count.toLocaleString('en-US')} orders · Σ {formatted['sum']}</span>;
const amountCaption = ({ formatted }: Ctx) => <span>Σ {formatted['sum']}</span>;
// Counts are numbers: format them like the rest of the grid (20,000, not 20000).
const formatCount = (value: unknown) => Number(value).toLocaleString('en-US');
const shippedFooter = ({ values }: Ctx) => <span>{formatCount(values['trueCount'])} shipped</span>;
const shippedGroupFooter = ({ values }: Ctx) => <span>{formatCount(values['falseCount'])} open</span>;
const rowCountFooter = ({ values }: Ctx) => <span>{formatCount(values['count'])} rows</span>;
const largest = (rows: readonly Order[]) => rows.reduce((max, row) => Math.max(max, row.amount), 0);
const largestFooter = ({ formatted }: Ctx) => <span>largest {formatted['custom']}</span>;
const sumTypes = ['sum', 'average'] as const;
const minMax = ['min', 'max'] as const;
const shippedTypes = ['trueCount', 'falseCount'] as const;

export default function AggregatesDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [grouped, setGrouped] = useState(true);
  const [onlyShipped, setOnlyShipped] = useState(false);
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={grouped} onCheckedChange={(checked) => setGrouped(checked)}>
          Group by Country
        </Checkbox>
        <Checkbox
          checked={onlyShipped}
          onCheckedChange={(checked) => {
            setOnlyShipped(checked);
            if (checked) api.current?.filterColumn('shipped', 'equal', true);
            else api.current?.clearFiltering();
          }}
        >
          Only shipped (aggregates follow the filter)
        </Checkbox>
      </div>
      <DataGrid<Order>
        aria-label="Orders with footer, group footer and group caption aggregates"
        data={orders}
        columns={columns}
        filtering
        height={420}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
        grouping={{ groupBy: grouped ? ['country'] : [], showGroupedColumns: true }}
        onGroupChange={(event) => setGrouped(event.groupBy.length > 0)}
      >
        {/* Two aggregate rows; several types on one column; a custom aggregate. */}
        <DataGridAggregateRow>
          <DataGridAggregate<Order> field="amount" type={sumTypes} format="C2" renderFooter={amountFooter} renderGroupFooter={amountGroupFooter} renderGroupCaption={amountCaption} />
          <DataGridAggregate<Order> field="quantity" type={minMax} format="N0" />
          <DataGridAggregate<Order> field="shipped" type={shippedTypes} renderFooter={shippedFooter} renderGroupFooter={shippedGroupFooter} />
        </DataGridAggregateRow>
        <DataGridAggregateRow>
          <DataGridAggregate<Order> field="id" type="count" renderFooter={rowCountFooter} />
          <DataGridAggregate<Order> field="amount" type="custom" custom={largest} format="C2" renderFooter={largestFooter} />
        </DataGridAggregateRow>
      </DataGrid>
    </>
  );
}
