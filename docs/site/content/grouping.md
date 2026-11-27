---
title: Grouping
description: Group rows by one or more columns from the drop area, the keyboard or methods; virtualized, with preserved expansion.
category: Grouping
order: 70
demos: [grouping, grouping-wide]
---

Grouping is a core pipeline stage. Rows group by any number of
columns; each level sorts ascending or descending and
grouped columns always sort before the user sort. A column can
opt out of grouping. A number or date column with `groupByFormat`
groups by its formatted value, for example by month.

A column's `groupKey(row)` groups by a custom key instead of the cell value:
rows with an equal key (dates by time) form one group, so a key
can bucket numbers into bands or combine fields. Groups order by key in the
column's group direction: blanks first, then booleans, numbers and dates by
value, then strings by the locale collator. The key is the group's `key` in
captions, events, expansion paths and `toggleGroup`. With `groupKey`,
`groupByFormat` no longer decides the buckets: it only formats the caption
with the column formatter (the demo shows "$250" for the 250 band);
otherwise the caption is the key as text. `groupKey` runs once
per row on every regroup and only on local data; lazy (server) grouping
groups by the field.

```tsx
<DataGrid
  data={orders}
  columns={[
    { field: 'country', header: 'Country' },
    { field: 'orderDate', header: 'Month', type: 'date', format: 'yMMM', groupByFormat: true },
    { field: 'amount', header: 'Amount', type: 'number', groupKey: (row) => Math.floor(row.amount / 250) * 250 },
    { field: 'note', header: 'Note', groupable: false },
  ]}
  sorting
  grouping={{ groupBy: ['country'], reorderable: true, showGroupedColumns: true }}
  onGroupChange={(event) => console.log(event.action, event.groupBy)}
/>
```

`grouping.groupBy` lists the grouped fields in order; it is reactive and
part of the server render, so a grid renders already grouped.

## Drop area and chips

The drop area above the header can be hidden with
`grouping.showDropArea: false`. Dragging a header
into it groups by that column. Each grouped column is a chip that
can be reordered by drag or `Alt+Arrow`, flipped between ascending
and descending, and removed. Reordering is opt in
(`grouping.reorderable`); the direction toggle follows `sorting` (shown when
the grid sorts and the column is sortable); `grouping.showRemoveButton`
(default `true`) shows the remove button. `grouping.showHeaderToggle` (opt
in) adds a group toggle button to the header
of every groupable column that groups or ungroups by it. Grouped columns are hidden by default,
and `grouping.showGroupedColumns` keeps them visible. On a
focused chip, Delete or Backspace removes it.

## Captions and expansion

Each group shows a caption row with the column, the key and the item count,
an indent per level and a toggle button that exposes
`aria-expanded`. The caption cell, which takes focus, carries
`aria-expanded` too and describes the level and item count ("Level 2, 15
items", `localeText.groupLevel`); the grid stays a `grid`, so rows carry no
`aria-level`. The drop area renders above the grid element, outside it.
`grouping.renderCaption(ctx)` replaces the caption text and receives the
`field`, `key`, `formattedKey`, `count`, `aggregates`, `expanded` and
`toggle`. Groups start expanded (`grouping.defaultExpanded`,
default `true`) and `onBeforeGroupToggle` / `onGroupToggle` control
expansion; `api.expandAllGroups()`, `api.collapseAllGroups()` and
`api.toggleGroup(target, expanded?)` (by row id, path key or path) expand or
collapse all groups or one. On a focused caption, Enter
toggles the group and ArrowLeft / ArrowRight collapse or expand it. Expansion is keyed by the group path, so it survives
virtual scrolling, sorting and data refreshes.

## Methods, events and keyboard

`api.groupColumn(field, index?)`, `api.ungroupColumn(field)` and
`api.clearGrouping()` group, ungroup and clear.
`onBeforeGroupChange` (cancel with `preventDefault()`) fires before every
grouping change with the `action` (`'group'`, `'ungroup'`, `'move'` or
`'clear'`), the `field` and the proposed `groupBy`, and `onGroupChange`
after it. Ctrl+Space on a focused header groups or ungroups it;
Ctrl/⌘+ArrowUp and Ctrl/⌘+ArrowDown in the body collapse or expand all
groups.

<!-- demo: grouping -->

## Grouping with column virtualization

Grouping works with row and column virtualization on. Only the visible columns of the
center zone render; the group indent is frozen at the start edge like a
pinned column, and caption text stays in view while the grid scrolls
sideways. Captions span the full row width, so they never depend on which
columns are rendered.

<!-- demo: grouping-wide -->

## API reference

See [`DataGridGrouping`](/docs/reference/data-grid/DataGridGrouping),
[`DataGridGroupCaptionContext`](/docs/reference/data-grid/DataGridGroupCaptionContext),
[`DataGridGroupChangeEvent`](/docs/reference/data-grid/DataGridGroupChangeEvent)
and [`DataGridGroupToggleEvent`](/docs/reference/data-grid/DataGridGroupToggleEvent)
in the API reference, and [Lazy load grouping](/docs/data-grid/lazy-grouping)
for server-side grouping.
