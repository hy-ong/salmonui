'use client';

import { DataGrid, DataGridColumn } from '@salmonui/data-grid';
import { createOrders, type Order } from '../../lib/fixtures';

// Module-level constants are fine: they are immutable inputs, not render state.
const orders = createOrders(500);
const lineTotal = (o: Order) => o.quantity * o.unitPrice;

// Columns as JSX children; the `columns` array prop takes the same fields.
export default function ColumnsBasicsDemo() {
  return (
    <DataGrid<Order> aria-label="Orders with typed and formatted columns" data={orders} height={420} locale="en-US" currency="USD" timeZone="UTC">
      {/* `primaryKey` derives the row id. */}
      <DataGridColumn field="id" header="Order" primaryKey width={110} />
      <DataGridColumn field="customer" header="Customer" width={160} minWidth={120} maxWidth={260} />
      <DataGridColumn field="country" header="Country" width="12%" />
      {/* typed columns with locale-aware number and date formats. */}
      <DataGridColumn field="quantity" header="Qty" type="number" format="N0" align="end" width={80} />
      <DataGridColumn field="unitPrice" header="Unit price" type="number" format="C2" align="end" headerAlign="end" width={120} />
      <DataGridColumn field="discount" header="Discount" type="number" format="P0" align="end" width={100} />
      <DataGridColumn field="placed" header="Placed" type="datetime" format="yMMMd" width={130} />
      {/* boolean column rendered as a checkbox. */}
      <DataGridColumn field="shipped" header="Shipped" type="boolean" displayAsCheckbox align="center" width={100} />
      {/* computed value through `valueGetter`. */}
      <DataGridColumn<Order> id="total" header="Line total" type="number" format="C2" align="end" width={120} valueGetter={lineTotal} />
      {/* 'auto' + overflow modes. */}
      <DataGridColumn field="note" header="Note (ellipsis with tooltip)" width="auto" overflow="ellipsisWithTooltip" />
      <DataGridColumn field="product" header="Product (clip)" width={110} overflow="clip" />
    </DataGrid>
  );
}
