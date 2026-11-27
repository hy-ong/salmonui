'use client';

import { useMemo, useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { NumberField } from '@salmonui/inputs/number-field';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(300);

const baseColumns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110, reorderable: false },
  { field: 'customer', header: 'Customer', width: 150, minWidth: 100, maxWidth: 280 },
  { field: 'city', header: 'City', width: 120 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 140 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 110 },
  { field: 'note', header: 'Note', width: 120, resizable: false },
];

// A bordered group that matches the Salmon field border and radius instead of the browser default.
const fieldsetStyle = { margin: 0, padding: 'var(--salmon-space-2) var(--salmon-space-3) var(--salmon-space-3)', border: '1px solid var(--salmon-border-default)', borderRadius: 'var(--salmon-radius-md)' } as const;

const toggleable = ['customer', 'city', 'country', 'product', 'amount', 'note'] as const;

export default function ColumnLayoutDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  // Column `hidden` is reactive: the checkboxes drive it, and the grid reports its own changes.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set(['note']));
  // Column `width` is reactive too: the input drives the Customer width, and a pointer resize writes it back.
  const [customerWidth, setCustomerWidth] = useState(150);
  const [blockCountry, setBlockCountry] = useState(true);
  const [blockProduct, setBlockProduct] = useState(true);
  const columns = useMemo(
    () => baseColumns.map((c) => ({ ...c, hidden: hidden.has(c.field ?? ''), ...(c.field === 'customer' ? { width: customerWidth } : null) })),
    [hidden, customerWidth],
  );
  // Per-frame events are counted, not logged; the count is read when the gesture ends.
  const frames = useRef(0);
  const [log, push] = useEventLog();
  return (
    <>
      <div className="demo-toolbar">
        <fieldset className="demo-toolbar" style={fieldsetStyle}>
          <legend>Visible columns</legend>
          {toggleable.map((field) => (
            <Checkbox
              key={field}
              checked={!hidden.has(field)}
              onCheckedChange={(checked) => {
                const next = new Set(hidden);
                if (checked) next.delete(field);
                else next.add(field);
                setHidden(next);
              }}
            >
              {field}
            </Checkbox>
          ))}
        </fieldset>
        <Button variant="outline" onClick={() => api.current?.autoSizeColumns()}>
          Auto-size all
        </Button>
        <Button variant="outline" onClick={() => api.current?.autoSizeColumns('customer')}>
          Auto-size Customer
        </Button>
        <Button variant="outline" onClick={() => api.current?.hideColumns('city')}>
          Hide City through the API
        </Button>
      </div>
      <div className="demo-toolbar">
        <label>
          Customer width (px, clamped to 100..280){' '}
          <NumberField
            aria-label="Customer width (px, clamped to 100..280)"
            min={60}
            max={400}
            step={10}
            value={customerWidth}
            data-demo="customer-width"
            onValueChange={(next) => {
              if (next !== null && Number.isFinite(next) && next > 0) setCustomerWidth(next);
            }}
          />
        </label>
        <Checkbox checked={blockCountry} onCheckedChange={(checked) => setBlockCountry(checked)}>
          Cancel resizing Country in onColumnResizeStart
        </Checkbox>
        <Checkbox checked={blockProduct} onCheckedChange={(checked) => setBlockProduct(checked)}>
          Cancel moving Product in onBeforeColumnReorder
        </Checkbox>
        <Button variant="outline" onClick={() => push(`moveColumn amount → 1: ${api.current?.moveColumn('amount', 1).status}`)}>
          Move Amount to position 1
        </Button>
      </div>
      <DataGrid<Order>
        aria-label="Orders with resizable, reorderable and hideable columns"
        data={orders}
        columns={columns}
        resizable
        reorderable
        height={360}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        ref={api}
        onColumnVisibilityChange={(event) => {
          const next = new Set(hidden);
          for (const field of event.hidden) next.add(field);
          for (const field of event.shown) next.delete(field);
          setHidden(next);
          push(`visibility (${event.source}): hidden ${event.hidden.join(', ') || '-'}; shown ${event.shown.join(', ') || '-'}`);
        }}
        onColumnResizeStart={(event) => {
          frames.current = 0;
          if (blockCountry && event.field === 'country') {
            event.preventDefault();
            push('resize start: country (prevented)');
            return;
          }
          push(`resize start: ${event.field} at ${Math.round(event.width)}`);
        }}
        onColumnResize={() => {
          frames.current += 1;
        }}
        onColumnResizeEnd={(event) => {
          if (event.field === 'customer') setCustomerWidth(Math.round(event.width));
          push(`resize (${event.source}): ${event.field} ${Math.round(event.previousWidth)} → ${Math.round(event.width)} after ${frames.current} frames`);
        }}
        onColumnDragStart={(event) => {
          frames.current = 0;
          push(`drag start: ${event.field} from ${event.fromIndex}`);
        }}
        onColumnDrag={() => {
          frames.current += 1;
        }}
        onColumnDrop={(event) => push(`drop: ${event.field} ${event.fromIndex} → ${event.toIndex} after ${frames.current} frames`)}
        onBeforeColumnReorder={(event) => {
          if (blockProduct && event.field === 'product') {
            event.preventDefault();
            push(`reorder (${event.source}): product ${event.fromIndex} → ${event.toIndex} (prevented)`);
          }
        }}
        onColumnReorder={(event) => push(`reorder (${event.source}): ${event.field} ${event.fromIndex} → ${event.toIndex}`)}
      />
      <EventLog entries={log} />
    </>
  );
}
