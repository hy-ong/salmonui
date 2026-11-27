---
title: Pinned rows
description: Pin records to the top of the grid by data or at runtime; pinned rows follow sorting, filtering and edits and stay outside the page size.
category: Frozen Rows and Columns
order: 12
demos: [pinned-rows]
---

Pinned rows are records shown in a fixed zone
above the scrolling rows. Unlike `stickyRows`, which keeps the first N
positions of the view in place, pinning follows the record: a pinned order
stays on top whatever the sort, page or scroll position.

## Pinning rows

`isRowPinned(row)` pins rows by data. It must be
pure; the grid reads it when it is created and calls it once per row of a
data array, again only for rows that are added or changed, so edits that
make a row match pin it.

`defaultPinnedRows` pins rows by id when the grid is created. Either prop
turns pinning on; pass `defaultPinnedRows={[]}` to pin only from code.

```tsx
<DataGrid
  data={orders}
  columns={columns}
  isRowPinned={(order) => order.priority === 'High'}
  ref={api}
/>

api.current?.pinRows(['ORD-1042']);
api.current?.unpinRows('ORD-1042');
api.current?.isRowPinned('ORD-1042'); // false
api.current?.getPinnedRowIds();      // pinned rows shown, in display order
```

`unpinRows` also unpins rows that `isRowPinned` matches, and `pinRows`
undoes that. Rows are identified by their row id, so the grid needs a
`primaryKey` column or `getRowId`.

## Sorting, filtering, paging and editing

- A pinned row is shown once: it leaves its place among the scrolling rows.
- Pinned rows are sorted among themselves by the current sort.
- A pinned row that the filter or search excludes is hidden, and comes back
  pinned when the filter changes.
- Pinned rows are not counted in `pageSize` or the page count: every page
  shows the pinned rows above its own rows.
- Edits, adds and deletes update pinned rows like any other row.
- Footer aggregates include the pinned rows (the page-wise footer counts the
  pinned rows and the page). Select all selects them too.
- While grouping, pinned rows stay above the groups and belong to none;
  pinned rows show no detail toggle or detail row (see
  [Detail rows](/docs/data-grid/detail-rows)).
- Pinned rows are neither drag sources nor drop targets for row drag
  (see [Row drag](/docs/data-grid/row-drag)).

## Layout, keyboard and accessibility

Pinned rows render first in the sticky top rowgroup, followed by the
`stickyRows` rows, and carry `data-pinned`. The virtual row window never
contains them, and pinned columns intersect them like any row. Their
`aria-rowindex` follows the visible order, so arrow keys move from the last
pinned row to the first scrolling row and back.

## State and export

`getState()` stores the pins and unpins made by id under `pinnedRows`
(rows pinned by `isRowPinned` need no state), and `restoreState()` applies
them; exclude the part with `exclude: ['pinnedRows']`. Ungrouped exports
list the pinned rows first, as the grid shows them.

With a remote data source the grid can only pin rows the server returned
for the current page.

<!-- demo: pinned-rows -->

## API reference

[`DataGridProps`](/docs/reference/data-grid/DataGridProps) lists
`isRowPinned` and `defaultPinnedRows`, and
[`DataGridApi`](/docs/reference/data-grid/DataGridApi) `pinRows`,
`unpinRows`, `isRowPinned` and `getPinnedRowIds`.