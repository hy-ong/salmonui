'use client';

import { useState, type ReactNode } from 'react';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridColumn, type DataGridIcons } from '@salmonui/data-grid';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(200, 11);

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 120 },
  { field: 'customer', header: 'Customer', width: 170 },
  { field: 'country', header: 'Country', width: 140 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 150 },
];

/** A decorative 14px stroke icon: the control around it keeps its accessible name. */
function Icon({ d }: { d: string }): ReactNode {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

// A different icon family (rounded arrows and chevrons) for the grid's own controls.
const customIcons: DataGridIcons = {
  sortAscending: <Icon d="M12 19V5M5 12l7-7 7 7" />,
  sortDescending: <Icon d="M12 5v14M19 12l-7 7-7-7" />,
  filter: <Icon d="M4 6h16M7 12h10M10 18h4" />,
  columnMenu: <Icon d="M4 6h16M4 12h16M4 18h16" />,
  expanded: <Icon d="M6 9l6 6 6-6" />,
  collapsed: <Icon d="M9 6l6 6-6 6" />,
  ungroup: <Icon d="M18 6L6 18M6 6l12 12" />,
  pagerFirst: <Icon d="M17 18l-6-6 6-6M7 6v12" />,
  pagerPrevious: <Icon d="M15 18l-6-6 6-6" />,
  pagerNext: <Icon d="M9 18l6-6-6-6" />,
  pagerLast: <Icon d="M7 18l6-6-6-6M17 6v12" />,
  submenu: <Icon d="M9 18l6-6-6-6" />,
  check: <Icon d="M5 12l5 5L20 7" />,
};

export default function IconsDemo() {
  const [custom, setCustom] = useState(true);
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={custom} onCheckedChange={(checked) => setCustom(checked)}>
          Custom icons
        </Checkbox>
      </div>
      <DataGrid<Order>
        aria-label="Orders with custom icons"
        data={orders}
        columns={columns}
        icons={custom ? customIcons : undefined}
        sorting={{ sortBy: [{ field: 'amount', direction: 'desc' }] }}
        filtering={{ ui: 'menu' }}
        columnMenu
        grouping={{ groupBy: ['country'] }}
        paging={{ pageSize: 8 }}
        height={360}
        locale="en-US"
        currency="USD"
      />
    </>
  );
}
