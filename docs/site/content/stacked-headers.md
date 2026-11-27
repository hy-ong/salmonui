---
title: Stacked headers
description: Group columns under multi-level headers with nested column definitions; operations act on the leaf columns.
category: Stacked Headers
order: 12
demos: [stacked-headers]
---

A column with child `columns` is a column group: its header spans its
children and the header gains one row per level, with no depth limit.
Nested `<DataGridColumn>` children are the JSX form of the
same tree. Give every group an `id` so its state is keyed by a stable column
id.

```tsx
const columns = [
  { field: 'id', header: 'Order', pinned: 'start' },
  {
    id: 'customerGroup',
    header: 'Customer',
    columns: [
      { field: 'customer', header: 'Name' },
      { id: 'location', header: 'Location', columns: [{ field: 'country' }, { field: 'city' }] },
    ],
  },
];
```

## Leaf operations

Only leaf columns hold data, so sorting, filtering, resizing and the column
menu act on leaves; group header cells are not keyboard focus stops.
Reordering moves a leaf within its parent group and rejects a move
out of it, so groups never break apart.

Group headers take the same header options as leaves:
`headerAlign` (centered by default), `headerProps` for a class name, style,
title or `data-*` attributes, and `renderHeader` for custom content. Group
headers expose `aria-colspan`, and leaves under a shallower branch span the
remaining header rows with `aria-rowspan`.

## Pinning and virtualization

A group whose leaves end up in different pin zones is split at the zone
edge, one header cell per zone, with a development warning; pin whole
groups or top-level leaves to avoid it. Column virtualization stays
on under stacked headers: a group header spans the run of its rendered
leaves.

The column chooser lists the groups as an indented tree above their leaves.

<!-- demo: stacked-headers -->

## API reference

[`DataGridColumn`](/docs/reference/data-grid/DataGridColumn) (the
column type and the JSX component) and the core
[`ColumnDef`](/docs/reference/data-grid/engine/ColumnDef) list the group
fields (`id`, `header`, `columns`, `headerAlign`, `headerProps`,
`renderHeader`).