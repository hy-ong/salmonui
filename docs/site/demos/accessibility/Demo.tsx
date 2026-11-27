'use client';

import { useEffect, useRef } from 'react';
import { Button } from '@salmonui/buttons/button';
import { DataGrid, type DataGridApi, type DataGridColumn } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(2_000, 9);

const columns: DataGridColumn<Order>[] = [
  { type: 'selection' },
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 160 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
  { field: 'shipped', header: 'Shipped', type: 'boolean', displayAsCheckbox: true, align: 'center', width: 130 },
];

export default function AccessibilityDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const observer = useRef<MutationObserver | null>(null);
  const [announcements, push] = useEventLog(12);

  // Copies what the grid writes into its polite live region so
  // sighted readers see what a screen reader announces. Runs after commit only.
  const observe = (grid: DataGridApi<Order>) => {
    observer.current?.disconnect();
    // The live regions are siblings of role="grid" (a grid may own rows and row groups only).
    const region = grid.element?.parentElement?.querySelector('.salmon-data-grid-live[aria-live="polite"]');
    if (!region) return;
    observer.current = new MutationObserver(() => {
      const text = region.textContent?.trim();
      if (text) push(text);
    });
    observer.current.observe(region, { childList: true, characterData: true, subtree: true });
  };
  useEffect(() => {
    if (api.current) observe(api.current);
    return () => observer.current?.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only
  }, []);

  return (
    <>
      <h3 id="a11y-demo-title">Customer orders</h3>
      <p id="a11y-demo-help" className="demo-status">
        2,000 orders. Arrow keys move between cells, Enter on a header sorts, Space selects a row.
      </p>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.focusCell('ORD-11500', 'customer')}>
          Focus order ORD-11500
        </Button>
        <Button variant="outline" onClick={() => api.current?.openColumnMenu('customer')}>
          Open the Customer column menu
        </Button>
      </div>
      <DataGrid<Order>
        // the accessible name comes from the visible heading; the help text describes the grid.
        aria-labelledby="a11y-demo-title"
        aria-describedby="a11y-demo-help"
        ref={api}
        data={orders}
        columns={columns}
        height={360}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
        sorting={{ multiple: true }}
        selection={{ multiple: true }}
        columnMenu
      />
      <EventLog entries={announcements} label="Screen reader announcements" />
    </>
  );
}
