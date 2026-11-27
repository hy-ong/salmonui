---
title: Child grids
description: Hierarchy grids with child grids joined by a field, any nesting depth, inherited locale and theme, and lazy mounting.
category: Hierarchy Grid
order: 160
demos: [child-grids, hierarchy-output]
---

`childGrid` renders a child `DataGrid` inside the detail row of each expanded
parent. It takes the child rows in `data` and every `DataGrid` prop of
the child; `joinField` names the field that relates parent and child rows,
or `parentField` and `childField` when the names differ.

```tsx
<DataGrid
  aria-label="Customers"
  data={customers}
  columns={customerColumns}
  childGrid={{
    data: orders,
    joinField: 'customerId',
    columns: orderColumns,
    childGrid: { data: items, parentField: 'id', childField: 'orderId', columns: itemColumns },
  }}
/>
```

Wrap a config in `defineChildGrid<Child, Parent>(config)` to type the child
rows in its callbacks; an inline object sees them as `unknown`. A child grid may have its own `childGrid`, to any depth. An array
is indexed once by the join value, so each child grid reads its rows in
constant time; a remote data source receives the relation as a filter
before the child grid's own filters, so the child grid cannot clear it.
`data` may also be a function that receives the parent
(`{ row, rowId, depth }`) and returns the child rows or a data source.

## Expanding, focus and inheritance

Child grids expand and collapse with the detail row methods and events.
They inherit `locale`, `dir`, `timeZone` and `currency` unless
set, the parent's `icons`, and the theme through CSS. A child
grid without `aria-label` or `aria-labelledby` is named by the
`childGridLabel` `localeText` key. Keys pressed inside a child grid
stay there; Tab moves in and out, Escape returns to the parent row.
`getChildGrid(rowId)` returns the API of a mounted child grid.

## Virtualization and export

A child grid mounts only when its detail row is rendered, so expanding every
parent of a large grid creates only the visible child grids. Excel and PDF exports nest the child rows of expanded parents
(`hierarchy: 'expanded'`, the default), of every parent (`'all'`) or none
(`'none'`). Every nested level is written: Excel puts each level one
column to the right and one outline level deeper (the sheet's outline
depth follows the deepest level), PDF draws each level as an indented
block under its row. Exports stop at 7 child levels, the Excel outline
limit; deeper child grids are left out. Nested levels follow the child
grid's own default expansion in `'expanded'` mode. `print()` takes the same
modes (`printing.hierarchy` or `print({ hierarchy })`) and prints each
child grid as a nested table.

<!-- demo: child-grids -->

## API reference

[`DataGridChildGrid`](/docs/reference/data-grid/DataGridChildGrid)
lists the `childGrid` options,
[`DataGridChildGridParent`](/docs/reference/data-grid/DataGridChildGridParent)
the parent passed to a `data` function, and
[`defineChildGrid`](/docs/reference/data-grid/defineChildGrid) types a
config; `getChildGrid` and the detail methods are on
[`DataGridApi`](/docs/reference/data-grid/DataGridApi).