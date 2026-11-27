'use client';

import { useRef, useState } from 'react';
import { Button } from '@salmonui/buttons/button';
import { Checkbox } from '@salmonui/inputs/checkbox';
import { DataGrid, type DataGridApi, type DataGridColumn, type DataGridLocaleText, type DataGridPagerContext, type DataGridPaging } from '@salmonui/data-grid';
import { EventLog, useEventLog } from '../../components/demo-kit';
import { createOrders, type Order } from '../../lib/fixtures';

const orders = createOrders(1_000, 3);
const FIT_HEIGHT = 480;

const columns: DataGridColumn<Order>[] = [
  { type: 'rowNumber' },
  { field: 'id', header: 'Order', primaryKey: true, width: 110 },
  { field: 'customer', header: 'Customer', width: 150 },
  { field: 'country', header: 'Country', width: 120 },
  { field: 'product', header: 'Product', width: 150 },
  { field: 'amount', header: 'Amount', type: 'number', format: 'C2', align: 'end', width: 120 },
];

// Starts on page 3 of 100; 5 numeric buttons; a page size dropdown. A constant: the options prop is reactive.
const paging: DataGridPaging = { page: 3, pageSize: 10, buttonCount: 5, pageSizeOptions: [5, 10, 25, 'all'] };

// Pager strings through `localeText` (plural forms for the item count).
const orderText: DataGridLocaleText = { pagerLabel: 'Order pages', pagerInfo: 'Page {page} of {pageCount}', pagerItems: { one: '· 1 order', other: '· {count} orders' }, pageSize: 'Orders per page' };

/** `renderPager`: a compact pager over the pager model. */
function CompactPager(ctx: DataGridPagerContext) {
  return (
    <div className="demo-pager" data-testid="compact-pager" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, padding: '8px 12px' }}>
      <Button variant="outline" disabled={ctx.page <= 1} onClick={() => ctx.goToPage(ctx.page - 1)}>
        ‹ Previous
      </Button>
      <span data-testid="compact-pager-info">
        {ctx.page} / {ctx.pageCount} ({ctx.totalRowCount} rows, {ctx.pageSize} per page)
      </span>
      <Button variant="outline" disabled={ctx.page >= ctx.pageCount} onClick={() => ctx.goToPage(ctx.page + 1)}>
        Next ›
      </Button>
    </div>
  );
}

export default function PagingDemo() {
  const api = useRef<DataGridApi<Order> | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [custom, setCustom] = useState(false);
  const [orderStrings, setOrderStrings] = useState(false);
  const [lockLast, setLockLast] = useState(false);
  const [fit, setFit] = useState(false);
  const [info, setInfo] = useState('');
  const [log, push] = useEventLog();
  const readInfo = () => {
    const page = api.current?.getPageInfo();
    if (page) setInfo(`page ${page.page} of ${page.pageCount}, ${page.pageSize} per page, ${page.totalRowCount} rows`);
  };
  return (
    <>
      <div className="demo-toolbar">
        <Checkbox checked={narrow} onCheckedChange={(checked) => setNarrow(checked)}>
          Narrow container (420 px)
        </Checkbox>
        <Checkbox checked={orderStrings} onCheckedChange={(checked) => setOrderStrings(checked)}>
          Custom pager text
        </Checkbox>
        <Checkbox checked={custom} onCheckedChange={(checked) => setCustom(checked)}>
          Custom pager (renderPager)
        </Checkbox>
        <Checkbox checked={lockLast} onCheckedChange={(checked) => setLockLast(checked)}>
          Cancel moves to the last page
        </Checkbox>
        <Checkbox checked={fit} onCheckedChange={(checked) => setFit(checked)}>
          Fit pages to a {FIT_HEIGHT} px box
        </Checkbox>
      </div>
      <div className="demo-toolbar">
        <Button variant="outline" onClick={() => api.current?.goToPage(1)}>
          Go to page 1
        </Button>
        <Button variant="outline" onClick={() => api.current?.goToPage(50)}>
          Go to page 50
        </Button>
        <Button variant="outline" onClick={() => api.current?.setPageSize(25)}>
          25 per page
        </Button>
        <Button variant="outline" onClick={readInfo}>
          Read page info
        </Button>
      </div>
      <div style={{ ...(narrow ? { maxInlineSize: 420 } : {}), ...(fit ? { blockSize: FIT_HEIGHT, outline: '1px dashed currentColor' } : {}) }} data-testid="paging-box">
        {/* `renderPager` is reactive: switching it keeps the grid and its current page. */}
        <DataGrid<Order>
          aria-label="Paged orders"
          data={orders}
          columns={columns}
          paging={paging}
          {...(custom ? { renderPager: CompactPager } : {})}
          {...(orderStrings ? { localeText: orderText } : {})}
          // Fit mode: a new grid with auto height whose page size fills the box (getPageSizeForHeight).
          key={fit ? 'fit' : 'fixed'}
          height={fit ? 'auto' : 360}
          onReady={(grid) => {
            if (!fit) return;
            const size = grid.getPageSizeForHeight(FIT_HEIGHT);
            push(`getPageSizeForHeight(${FIT_HEIGHT}): ${size} rows`);
            if (size > 0) grid.setPageSize(size);
          }}
          locale="en-US"
          currency="USD"
          timeZone="UTC"
          ref={api}
          onBeforePageChange={(event) => {
            if (lockLast && event.page === api.current?.getPageInfo()?.pageCount) {
              event.preventDefault();
              push(`beforePageChange to ${event.page}: canceled`);
            }
          }}
          onPageChange={(event) => push(`pageChange (${event.source}): page ${event.previousPage} → ${event.page}, size ${event.previousPageSize} → ${event.pageSize}`)}
          onError={(event) => push(`error (${event.action}): ${event.error.message}`)}
        />
      </div>
      <p className="demo-status" role="status" data-testid="page-info">
        {info || 'Use the pager buttons, or focus one and press ←, →, Home or End.'}
      </p>
      <EventLog entries={log} label="Page events" />
    </>
  );
}
