'use client';

import { useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { TextField } from '@salmonui/inputs/text-field';
import { DataGrid, type DataGridColumn, type DataGridEmptyContext, type DataGridFilterContext, type DataGridPagerContext } from '@salmonui/data-grid';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(200, 31);
const categories = ['Coffee', 'Tea', 'Equipment'] as const;

// Templates live at module scope: their identity is stable across renders, and
// they read everything from their context instead of React state.

/** Filter menu template: one button per category. */
function CategoryFilter({ value, apply, clear }: DataGridFilterContext<Order>) {
  return (
    <div className="demo-toolbar" role="group" aria-label="Category">
      {categories.map((p) => (
        <Button key={p} variant="outline" aria-pressed={value === p} onClick={() => apply(p)}>
          {p}
        </Button>
      ))}
      <Button variant="outline" onClick={clear}>
        Any
      </Button>
    </div>
  );
}

/** Pager template (`pagerTemplate`): the pager model and its actions. */
function renderPager({ page, pageCount, totalRowCount, goToPage }: DataGridPagerContext) {
  return (
    <nav className="demo-toolbar demo-pager" aria-label="Pages">
      <Button variant="outline" disabled={page <= 1} onClick={() => goToPage(page - 1)}>
        Previous
      </Button>
      <span className="demo-pager__status">
        Page {page} of {pageCount} ({totalRowCount} orders)
      </span>
      <Button variant="outline" disabled={page >= pageCount} onClick={() => goToPage(page + 1)}>
        Next
      </Button>
    </nav>
  );
}

/** Empty record template (`emptyRecordTemplate`). */
function renderEmpty({ reason }: DataGridEmptyContext) {
  return <div className="demo-empty">{reason === 'noMatch' ? 'No order matches the search or filters.' : 'There are no orders yet.'}</div>;
}

const columns: DataGridColumn<Order>[] = [
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'category', header: 'Category', width: 130, renderFilter: (ctx) => <CategoryFilter {...ctx} /> },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

const filtering = { ui: 'menu' } as const;
const paging = { pageSize: 10 };

export default function SlotTemplatesDemo() {
  const [text, setText] = useState('');
  const [empty, setEmpty] = useState(false);
  return (
    <>
      <div className="demo-toolbar">
        <label>
          Search <TextField type="search" aria-label="Search orders" value={text} onValueChange={(value) => setText(value)} />
        </label>
        <Checkbox checked={empty} onCheckedChange={(checked) => setEmpty(checked)}>
          No data
        </Checkbox>
      </div>
      <DataGrid<Order>
        aria-label="Orders with filter, pager and empty templates"
        data={empty ? [] : orders}
        columns={columns}
        filtering={filtering}
        search={{ text }}
        paging={paging}
        renderPager={renderPager}
        renderEmpty={renderEmpty}
        height={320}
        locale="en-US"
        currency="USD"
        timeZone="UTC"
      />
    </>
  );
}
