---
title: Sorting
description: Header sorting, multi-column sort, initial sort, custom comparators and sort methods.
category: Sorting
order: 60
demos: [sorting]
---

Clicking a header, or pressing Enter on a focused header, cycles ascending,
descending and unsorted; `sorting.order` replaces that cycle, so
`order: ['asc', 'desc']` never returns to unsorted. Ctrl/⌘+click adds the column to a
multi-column sort; headers show the direction and the sort order
badge and expose `aria-sort`. A grid can start sorted
with `sorting.sortBy: [{ field, direction: 'asc' }]`, a column
opts out with `sortable: false` and a column can supply its own
`sortComparator(a, b, rowA, rowB)`.

```tsx
<DataGrid
  data={orders}
  columns={columns}
  sorting={{ multiple: true, sortBy: [{ field: 'country', direction: 'asc' }] }}
  onSortChange={(event) => console.log(event.sortBy)}
/>
```

`api.sortColumn(field, direction, { multiple })` sorts a column,
`api.removeSort(field)` removes one column from the sort and
`api.clearSorting()` clears it. `onBeforeSortChange` can
cancel a change with `preventDefault()`; `onSortChange` reports the
`sortBy`, the `previousSortBy` and the `field` that triggered it.
`sorting.sortBy` is part of the server render, so a grid renders already
sorted.

`sorting.multiple` turns multi-column sorting on; it defaults to
`false`, where Ctrl/⌘+click replaces the sort like a plain click. With
`columnMenu`, the built-in `'sortAscending'`, `'sortDescending'` and
`'clearSort'` items sort the column the menu was opened on; the
item for the current direction is disabled.

By default only a sorted header shows its direction arrow.
`sorting.indicators: 'always'` gives every sortable header an up and down
arrow pair, the active direction at full strength, so the sortable columns
are visible before the first click:

```tsx
<DataGrid data={orders} columns={columns} sorting={{ indicators: 'always' }} />
```

On a focused header, Enter sorts, Ctrl/⌘+Enter adds the column to a
multi-column sort and Shift+Enter removes it from the sort.

## Touch multi-sort

On a touch screen there is no Ctrl key, so with `sorting.multiple` on, a
header tap that sorts also shows a small popup by that header with a
**Multi-sort** toggle button. While the toggle is pressed (`aria-pressed="true"`), each header
tap adds its column to the sort, or cycles it in place when it is already
sorted, exactly like Ctrl/⌘+click; while it is not pressed a tap replaces the
sort. The popup follows the last tapped header and stays open across header
taps. A press anywhere else (a body cell, outside the grid) or Escape hides
it and turns the toggle off, so the next tap starts a new single-column sort.
There is no timeout. Mouse clicks and the keyboard never show the popup; with
`sorting.multiple` off, taps sort without it. The label is the
`touchMultiSort` key of `localeText`. The popup code is part of the lazy
overlay chunk and loads on the first touch sort.

## Stability

The sort is stable: rows with equal keys keep their order in the
data, so sorting the demo by Country lists each country's orders by order
number. A custom `sortComparator` that returns `0` keeps the same guarantee.

The sort runs in the core engine and is incremental, so re-sorting 100,000
rows does not re-render the grid beyond the visible cells.

<!-- demo: sorting -->

## API reference

The [`DataGridSorting`](/docs/reference/data-grid/DataGridSorting),
[`DataGridSortChangeEvent`](/docs/reference/data-grid/DataGridSortChangeEvent)
and [`DataGridApi`](/docs/reference/data-grid/DataGridApi) reference
pages list every option and method.