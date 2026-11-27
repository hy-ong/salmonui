---
title: Lazy load grouping
description: Server-side grouping that loads group captions first and children on demand.
category: Lazy Load Grouping
order: 90
demos: [lazy-grouping]
---

With lazy grouping (`grouping.lazy`) and a remote source that declares
`capabilities.lazyGroups`, grouping runs on the server. The first response holds only the top-level
group captions with their counts; a group's children (sub-groups or rows)
are requested when it expands, in chunks. Group captions carry
aggregates computed by the server. Groups start collapsed
in lazy mode (`grouping.defaultExpanded` defaults to `false` there).

```tsx
const orders = createJsonDataSource<Order>({ url: '/api/orders', key: 'id', fields });

<DataGrid
  data={orders}
  columns={columns}
  grouping={{ lazy: true, lazyChunkSize: 50, groupBy: ['country', 'customer'] }}
  onGroupToggle={(event) => console.log(event.path, event.expanded, event.lazy)}
/>
```

Each group tracks its own load state, so a slow or failed group shows its
own loading indicator or retry action without blocking the rest of the grid.
A sort or filter change invalidates loaded children: the root
reloads, groups that were expanded stay expanded and reload their children.
The expand and collapse events `onBeforeGroupToggle` /
`onGroupToggle` carry `lazy: true` in lazy mode.

A group with more children than one chunk (`grouping.lazyChunkSize`,
default 100) shows a Load more button on its caption; each click appends
the next chunk. The data source reports whether more children
exist: `createJsonDataSource` sets `pageInfo.hasNextPage` from the
server's `next` cursor, or for offset ranges from `total`, which the
reference handler returns with every group level and child page.

With `infiniteScroll` on as well, scrolling appends the chunks: when the last loaded row of an expanded group with more children
comes within `infiniteScroll.threshold` rows (default half a block, 50
rows) below the rendered rows, the grid requests that group's next chunk.
Nested groups append their sub-groups the same way. The Load more button
stays on the caption as the keyboard and screen reader path. The check
runs only when the rendered row window or the row model changes, never
per scroll frame. Top-level captions arrive in one root read (or one page
of them with `paging`), so there is no caption page to append.

With `paging`, the pager pages the top-level groups: the root request carries the group path `[]`
and the page (`{ offset, limit }` over the groups) in one request, the
pager's total is the number of top-level groups, and a page change loads
that page's captions. Children of a group on the page page by their own
chunks, not by the grid page. Expanded groups stay expanded across pages.

The demo's endpoint runs the reference protocol handler (behind a Next.js
route handler, or in the browser on the static site); any backend that speaks the protocol works the same way.

<!-- demo: lazy-grouping -->

## API reference

See [`DataGridGrouping`](/docs/reference/data-grid/DataGridGrouping)
(`lazy`, `lazyChunkSize`, `defaultExpanded`) and
[`DataGridGroupToggleEvent`](/docs/reference/data-grid/DataGridGroupToggleEvent)
in the API reference.
