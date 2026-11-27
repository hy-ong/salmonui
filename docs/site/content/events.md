---
title: Events
description: The event model - onReady, before-event and after-event pairs, header attributes, and the interaction events of selection, resizing, column drag and the menus.
category: Events
order: 112
demos: [grid-events, row-events]
---

Every grid event is an `on*` prop. Actions come in pairs: `onBefore<Action>`
runs first and cancels the action with `event.preventDefault()`, then
`on<Action>` reports the committed change. Each event object carries `type`,
`source` (`'pointer'`, `'keyboard'`, `'touch'` or `'api'`) and
`defaultPrevented`. An event object is allocated only when its handler is
bound, and scrolling never raises events.

Event objects are plain snapshots, never the grid's internal store objects;
in development builds they are frozen, the `onKeyDown` context
included; production builds skip the freeze. Read them, but do not assign
to their properties. The one exception is the `items` array of a
menu before-event: change it in place (`items.splice(...)`,
`items.push(...)`); reassigning `event.items` throws in development.

## Lifecycle

`onReady(api)` fires once after the first commit of each mount, with the
grid instance; it is the place for startup calls
into the API. When the grid uses a feature that loads on demand (for
example `editing`), `onReady` waits for it. When the grid unmounts, the data source is
disconnected and the in-flight read is aborted.

## Before and after events

There are no generic `actionBegin` / `actionComplete` / `actionFailure`
events. Each action has its own pair with a typed payload:
`onBeforeSortChange` / `onSortChange` (`{ sortBy, previousSortBy, field }`),
`onBeforeFilterChange` / `onFilterChange`, `onBeforeSearchChange` /
`onSearchChange`, `onBeforePageChange` / `onPageChange`,
`onBeforeGroupChange` / `onGroupChange`, and so on. Failures arrive in
`onError` (`{ error, action }`); a failed data load reports
`action: 'data'`. In the demo, the checkbox cancels every sort in
`onBeforeSortChange`, so `onSortChange` never follows.

Typed pairs keep each payload specific instead of a request-type switch
over one shared argument, and an event object is allocated only for a
bound handler. Cancel an action with `event.preventDefault()` in its
`onBefore...` handler, and handle failures in `onError`, whose `action` is
`'data'`, `'save'`, `'persistState'` or the rejected command's feature:

```tsx
<DataGrid
  data={orders}
  columns={columns}
  sorting
  onBeforeSortChange={(event) => {
    if (event.field === 'CustomerName') event.preventDefault();
  }}
  onError={(event) => console.error(event.action, event.error)}
/>
```

## Header attributes

The column's `headerProps` put a class, a style, a `title` and `data-*`
attributes on the header cell. The
Amount header in the demo carries a tooltip and a `data-unit` attribute.
Per-row and per-cell attributes are `getRowProps` and `getCellProps`
([templates](/docs/data-grid/templates)).

## Interaction events

Each feature documents its own events: selection
(`onBeforeSelectionChange` / `onSelectionChange` with `added`, `removed` and
`rowIds`), editing ([editing](/docs/data-grid/editing)), export and print
([export](/docs/data-grid/export)). Column resizing fires `onColumnResizeStart`
(cancellable), `onColumnResize` per frame and `onColumnResizeEnd`; column
drag fires `onColumnDragStart`, `onColumnDrag` and `onColumnDrop`, then the
reorder pair `onBeforeColumnReorder` / `onColumnReorder`; row drag fires
`onRowDragStart`, `onRowDrag`, `onBeforeRowDrop` and `onRowDrop`
([row drag and drop](/docs/data-grid/row-drag)). Per-frame events fire at
most once per animation frame and never touch React state inside the grid.

The menus open through before-events that can cancel them or change their
`items`: `onBeforeColumnMenuOpen` / `onColumnMenuItemClick` for the column
menu and `onBeforeContextMenuOpen` / `onContextMenuItemClick` for the
context menu, whose `target` tells a header, a cell, a row, a group
caption or the pager apart.

<!-- demo: grid-events -->

## Row and cell clicks

`onRowClick` and `onRowDoubleClick` receive the `rowId`, the `row`, its visible
`rowIndex`, the clicked `field` and `column` (null outside a cell), the row
`element` and the `nativeEvent`. `onCellClick` and `onCellDoubleClick` add
the cell `value` and pass the cell element; the cell event fires before
the row event. They fire for data rows only, not for group
captions, aggregate footers or detail rows. `preventDefault()` on a click
skips the built-in selection and focus; on a double click it skips the edit
start. The grid attaches one delegated listener per event type on the body,
and only while one of these handlers is bound. There is no context-menu
twin: right clicks go through `onBeforeContextMenuOpen`.

<!-- demo: row-events -->

## API reference

Every event prop is listed on
[`DataGridProps`](/docs/reference/data-grid/DataGridProps), with its
payload type (for example
[`DataGridSortChangeEvent`](/docs/reference/data-grid/DataGridSortChangeEvent),
[`DataGridRowClickEvent`](/docs/reference/data-grid/DataGridRowClickEvent)
and [`DataGridErrorEvent`](/docs/reference/data-grid/DataGridErrorEvent)).