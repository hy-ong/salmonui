---
title: Sorting and grouping
description: Member sort ascending, descending, in data order or in a custom order, value sorting from the column headers, and date, number and custom grouping from code and the field menu.
category: pivot-table
---

The first row of buttons calls `pivot.setSort('country', sort)` with
`'asc'`, `'desc'`, `{ order: [...] }` (listed members first, the rest
after) and `'none'`, and `pivot.setValueSort()` for the grand total
column. The table has `valueSorting`: click a leaf column header, or
focus it and press Enter, to cycle the rows through ascending,
descending and no value sort by that column. The status line shows
`onSortChange`.

The second row calls `pivot.setGrouping()`: the Placed date grouped by
years and quarters (two column levels) or by months, countries grouped
into custom regions, and unit prices in number bands of 100 from 0 to
399. The same grouping dialog opens from "Group…" in the field menu of
an axis bar button.
