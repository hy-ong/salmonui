---
title: Row drag and drop
description: Reorder rows by pointer or keyboard, drag several rows, drop into another grid or a custom element, with cancelable events and persisted order.
category: Row Drag and Drop
order: 170
demos: [row-drag, row-drag-targets]
---

`rowDrag` adds a drag handle column; dragging a handle reorders the rows.
Selection is not required. `api.moveRows(rowIds, toIndex)`
moves rows by data row index; it also takes
`{ targetRowId, position: 'before' | 'after' | 'into' }` to place the rows
next to a row. Local data is
reordered in place; a data source receives the move through `write()`, and
`rowDrag.orderField` writes new order values to a field so a server can
persist the order.

```tsx
<DataGrid aria-label="Tasks" data={tasks} columns={columns} rowDrag={{ targetId: 'done' }} onRowDrop={(e) => save(e.rowIds, e.toIndex)} />
<DataGrid aria-label="Done" id="done" data={[]} columns={columns} rowDrag />
```

## Targets

`rowDrag.targetId` names another grid (by its `id`) that receives the
dragged rows: the target adds them and the source removes them.
When the id names any other element, dropping on it ends the drag without
moving rows, and `onRowDrop` carries the rows and the `target` element.
Dragging a selected row drags every selected row.
Grids exchange rows through a registry shared by every `DataGrid` of the
page; pass `rowDrag.handoff` (from `createRowDragHandoff()`) to give a set of
grids their own.

## Events

`onRowDragStart` and `onBeforeRowDrop` cancel with `preventDefault()`;
`onRowDrag` fires at most once per animation frame while the target
changes; `onRowDrop` follows the drop. Each carries `rowIds`,
`rows()`, `fromIndex`, `toIndex`, the target row and side (`targetRowId`,
`position`), `valid`, `reason`, `targetGridId` and the `target` element.
`renderRowDragPreview` replaces the preview and receives `{ rowIds, rows }`.

## Rules

Drops onto a dragged row, into a sorted grid (unless sorted ascending by
`orderField`) or into another group are invalid; `rowDrag.acrossGroups`
allows group changes and rewrites the grouped values. Rows are
moved by id over every loaded row, so dragging works with virtualization
and auto-scrolls at the edges. Alt+Shift+ArrowUp and
Alt+Shift+ArrowDown move the focused (or selected) rows by keyboard.
Escape cancels a pointer drag.

Row drag works with row pinning and with hierarchy:

- Pinned rows (row pinning) are neither drag sources nor drop
  targets: their place comes from pinning and the sort, not from the row
  order. They show no drag handle, a pointer over them is an invalid target
  (`reason: 'pinnedRow'`), a selected pinned row stays behind when the
  selection is dragged, and `moveRows` / keyboard moves never move a pinned
  row or place a row above the first scrolling row. Data indexes
  (`fromIndex`, `toIndex`, `moveRows`) count the scrolling rows only. With
  `orderField`, pinned rows keep their order values.
- A child grid (`childGrid` with its own `rowDrag`) reorders its own rows
  only. Its drags and events stay in the child: releasing a child row over
  the parent grid drops nothing, and the parent's row drag ignores the rows
  of nested child grids. To move rows between grids, use `rowDrag.targetId`.

<!-- demo: row-drag -->

## API reference

[`DataGridRowDrag`](/docs/reference/data-grid/DataGridRowDrag) lists
the `rowDrag` options,
[`DataGridRowDragEvent`](/docs/reference/data-grid/DataGridRowDragEvent)
the event payload,
[`DataGridRowDragPreviewContext`](/docs/reference/data-grid/DataGridRowDragPreviewContext)
the preview context and [`DataGridApi`](/docs/reference/data-grid/DataGridApi)
`moveRows`.