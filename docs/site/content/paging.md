---
title: Paging
description: The pager, page and page size state, page buttons and sizes, keyboard, localized text, the narrow layout, a custom pager, page methods and events, paging with groups, and cursor paging.
category: Paging
order: 64
demos: [paging, paged-groups, cursor-paging]
---

`paging` turns paging on: `true` for the defaults, or a `DataGridPaging` object.
Pages are a window over the processed (filtered, sorted, grouped) rows; the
grid never copies rows per page. `paging.pageSize` is the page size, 12 by
default.

```tsx
<DataGrid
  data={orders}
  columns={columns}
  paging={{ pageSize: 20, pageSizeOptions: [10, 20, 50, 'all'] }}
  onPageChange={(event) => console.log(event.page, event.pageSize)}
/>
```

## State and events

`paging.page` is the 1-based page. It is reactive and part of the
server render, so a page can render on the server already on page 3.
`onBeforePageChange` can cancel a change with `preventDefault()`, and
`onPageChange` reports the `page`, `previousPage`, `pageSize` and
`previousPageSize`. Both fire for pager clicks, keys, page size
changes and methods, with `source` telling which.

`api.goToPage(page)` and `api.setPageSize(pageSize)` change the page or the
page size; `api.getPageInfo()` returns the page, page size, page count and total row
count. Going to a page that does not exist is rejected and raises
`onError` with `action: 'page'`. Changing the page size keeps the first row
of the current page in view and clamps to a valid page.

`api.getPageSizeForHeight(height)` returns how many whole rows fit in `height`
px after the toolbar, group drop area, header rows, footer aggregate rows
and pager. Pass the
result to `setPageSize` to fill a container: with `height="auto"` the
grid, its toolbar and its pager then fit the container exactly. Rows count
`rowHeight` (the estimate when rows are measured); before mount only the
header and footer rows are subtracted, and 0 means no row fits.

```tsx
const fit = () => api.current?.setPageSize(Math.max(1, api.current.getPageSizeForHeight(box.clientHeight)));
```

## The pager

The pager shows first, previous, numbered, next and last buttons.
`paging.buttonCount` (default 8) is how many numbered buttons show at once;
the buttons before and after them move to the previous or next set.
`paging.pageSizeOptions` adds a page size dropdown: `true` for
`All, 5, 10, 12, 20`, or your own list where `'all'` shows every row.

The pager is a `role="navigation"` landmark. Its buttons use roving focus:
←/PageUp and →/PageDown move to the previous or next page, Home or
Ctrl+Alt+PageUp to the first and End or Ctrl+Alt+PageDown to the last
page, and Enter or Space activates the focused button; on macOS
the bindings are ←, →, Home and End. Page changes are announced in a live
region ("Page 3 of 12", `localeText.pageOf`).

Every pager string comes from `localeText`: `pagerLabel`, `pagerInfo`
("{page} of {pageCount} pages"), `pagerItems` (with plural forms),
`pageButton`, `pageSize` and the button labels. The pager is a
size container: below 480 px it keeps the current page and the arrows and
hides the other numbered buttons and the item count.

`renderPager(ctx)` replaces the pager. The context has the `page`,
`pageSize`, `pageCount`, `totalRowCount`, the resolved `pageSizeOptions`,
`goToPage`, `setPageSize` and the `defaultPager` element to wrap or
decorate. The prop is reactive: switching between the built-in
and a custom pager on a mounted grid re-renders the pager at once and keeps
the current page, as do changes to the other `paging` options.

<!-- demo: paging -->

## Paging with groups

With grouping, pages count data rows. A page shows the captions and
footers of the groups it intersects, so a group that spans two pages has
its caption on both, and a collapsed group still occupies its rows of the
page. `aggregateScope` decides whether aggregates cover the
current page (the default) or every row; see [Aggregates](/docs/data-grid/aggregates).

<!-- demo: paged-groups -->

## Remote and cursor paging

With a remote data source the page is part of every read request; see
[Server paging and the URL](/docs/data-grid/url-paging). A JSON data source created
with `paging: { kind: 'cursor' }` pages with cursors instead of offsets:
the server answers each page with the cursor of the next one,
and the next request carries it. The source knows a page's cursor only
after reading the page before it, so a jump to a page that was not reached
yet is rejected with `CursorUnknownError`; walk the pages in order.

<!-- demo: cursor-paging -->

## API reference

See [`DataGridPaging`](/docs/reference/data-grid/DataGridPaging),
[`DataGridPagerContext`](/docs/reference/data-grid/DataGridPagerContext)
and [`DataGridPageChangeEvent`](/docs/reference/data-grid/DataGridPageChangeEvent)
in the API reference.