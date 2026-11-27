---
title: Pinned columns and sticky rows
description: Pin columns to the start or end, fix them in place between the scrolling columns, and keep the first or last rows in view while the body scrolls.
category: Frozen Rows and Columns
order: 11
demos: [pinned-columns]
---

Pinned columns (also called frozen columns) stay in view while the other
columns scroll horizontally. The grid splits its columns into three zones:
a start zone, the scrolling center and an end zone. Only the center zone is
column-virtualized; pinned columns always render.

## Pinning columns

A column definition pins itself with `pinned: 'start'` or
`pinned: 'end'`. The sides are logical: `start` is the left edge in
a left-to-right grid and the right edge in RTL.

The grid `pinnedColumns` prop is a count shorthand:
`pinnedColumns={{ start: 2 }}` pins the
first two visible columns and `end` the last ones. It is reactive, and an
explicit column `pinned` always wins over the count.

```tsx
<DataGrid
  columns={[
    { field: 'id', header: 'Order', pinned: 'start' },
    // ...
    { field: 'amount', header: 'Amount', pinned: 'end' },
  ]}
  pinnedColumns={{ start: 2 }}
  stickyRows={2}
  stickyBottomRows={1}
/>
```

## Fixed columns

`pinned: 'center'` fixes a column in place: the column
stays where it is declared among the scrolling columns, with scrolling
columns on both sides of it. When you scroll, it moves with its slot until
it reaches the start edge (after the start-pinned columns and any earlier
fixed column), then stays there while the other columns pass beneath it.
A fixed column declared beyond the first screen waits at the end edge
(before the end-pinned columns) until its slot scrolls into view. So a
fixed column is always visible, and the slot it leaves is always covered.

```tsx
const columns = [
  { field: 'id', header: 'Order', pinned: 'start' },
  { field: 'customer', header: 'Customer' },
  { field: 'product', header: 'Product', pinned: 'center' },
  // ...
];
```

A fixed column keeps its place in the column order: keyboard navigation,
`aria-colindex` and reordering treat it as a scrolling column (drag it to
move its slot), and it stays rendered under column virtualization. When
focus scrolls another column into view, the grid keeps that column clear
of the fixed ones. `api.pinColumn(field, 'center')` fixes a column at
runtime; `null` releases it in place. With stacked headers, only the fixed
leaf header is sticky; its group header scrolls with the center.

## Pinning at runtime

The column menu and the header context menu carry `pinStart`, `pinEnd` and
`unpin` items; `unpin` also releases a fixed column. With the keyboard, Alt+Shift+ArrowLeft and
Alt+Shift+ArrowRight pin the focused header to the start or end and
Alt+Shift+ArrowUp unpins it. `api.pinColumn(field, 'start' | 'end' | 'center' | null)`
does the same from code. Every path raises the cancelable
`onBeforeColumnPinChange` (call `preventDefault()` to keep the column where
it is) and then `onColumnPinChange` with `pinned` and `previousPinned`.

A pinned column moves to the inner edge of its new zone; the column set is
not recompiled. Reordering, by drag or Mod+ArrowLeft / Mod+ArrowRight
(Alt+ArrowLeft / Alt+ArrowRight also work; Mod is Ctrl, or ⌘ on macOS),
never moves a column across a zone edge.

A shadow marks the edge of each pinned zone while content scrolls beneath
it, mirrored in RTL and replaced by a border in forced-colors mode.

## Editing pinned columns

Pinning only changes where a column is drawn. Cells of pinned columns edit
like scrolling cells: double-click, F2 and Enter start editing, and a column
pinned at runtime keeps its editor and validation. The demo below
uses `editing={{ mode: 'cell' }}`; edit the pinned Amount column, or pin
Customer and edit it there.

The fill handle, detail rows and child grids work with pinned columns too:

- **Fill handle.** With `editing.fillHandle`, a range drags across a pin
  edge like any column edge: from a start-pinned column into the scrolling
  columns, or from the scrolling columns into an end-pinned one, and down
  past the rendered rows with auto-scroll. The [Range fill](/docs/data-grid/selection)
  demo pins Customer to the start and Note to the end.
- **Detail rows.** A detail row spans the full grid width under start and
  end pinned columns, and its content stays in view while the columns
  scroll (see [Detail rows](/docs/data-grid/detail-rows)).
- **Child grids.** A child grid mounts in a full-width detail row of a
  parent with pinned columns and stays in view while the parent columns
  scroll (see [Child grids](/docs/data-grid/child-grids)).

## Sticky rows

`stickyRows` keeps the first N rows of the visible row model below the
header, and `stickyBottomRows` keeps the last N above the footer.
The rows are positions
in the sorted, filtered row model, so they follow sorting and filtering, and
the virtual row window skips them.

<!-- demo: pinned-columns -->

## API reference

[`DataGridColumn`](/docs/reference/data-grid/DataGridColumn) has the
`pinned` field, [`DataGridPinnedColumns`](/docs/reference/data-grid/DataGridPinnedColumns)
the `pinnedColumns` shape,
[`DataGridColumnPinChangeEvent`](/docs/reference/data-grid/DataGridColumnPinChangeEvent)
the pin events and [`DataGridApi`](/docs/reference/data-grid/DataGridApi)
`pinColumn`.
