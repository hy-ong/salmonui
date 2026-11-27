---
title: Server paging and the URL
description: Remote paging with or without a reported total, the page kept in the query string, view change events and the data error state.
category: Paging
order: 65
demos: [url-paging]
---

With a data source that pages on the server, the grid sends the page and
page size with every read and takes the page count from the
source's `totalRowCount`. A source that cannot count passes
`paging.totalRowCount` instead; it also wins over a reported total.
It has no effect when paging runs in the browser.

## The page in the URL

`paging.syncUrl` keeps the page in the query string. It is opt-in and runs only after mount: the grid reads
`?page=` (or the parameter named by `syncUrl: { param }`), goes to that page,
and writes later page changes with `history.replaceState` (page 1 removes
the parameter), so the back button is not filled with pages. A value that
is not a positive integer is ignored. With a remote source the requested
page is applied once the first result reports the page count. Nothing runs
during render or on the server, so the URL never causes a hydration
mismatch: the server renders `paging.page`; to server-render the requested
page, read the parameter on the server and pass it as `paging.page`.

```tsx
// Next.js App Router page
export default async function Orders({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  const page = Number((await searchParams).p) || 1;
  return <OrdersGrid paging={{ page, pageSize: 20, syncUrl: { param: 'p' } }} />;
}
```

## View changes

`onViewChange` fires once per committed change of
the displayed rows, after they rendered, with the data row count, the total
across pages and the reason: `data`, `sort`, `filter`, `search`, `group`,
`page` or `refresh`. It never fires for scrolling, focus, selection
or group expansion, and the grid only listens while the handler is bound.
The data source's `onResponse` hook, the `beforeDataBound` counterpart, is
described under [Data sources](/docs/data-grid/data-sources).

## Load errors

When a read fails, the body shows `renderError` with the error, its message
and `retry()`, which reads the source again with the same query; without
`renderError` the grid shows a message and a Retry button.
`onError` reports the failure with `action: 'data'`. Use
"Fail the next request" in the demo, then change the page.

<!-- demo: url-paging -->

## API reference

See [`DataGridPaging`](/docs/reference/data-grid/DataGridPaging)
(`syncUrl`, `totalRowCount`),
[`DataGridViewChangeEvent`](/docs/reference/data-grid/DataGridViewChangeEvent)
and [`DataGridDataErrorContext`](/docs/reference/data-grid/DataGridDataErrorContext)
in the API reference.
