---
title: Aggregates and show values as
description: Every aggregate and show-values-as kind on a value field, value field menus on the axis bar with a restricted aggregate list edited per field by onBeforeAggregateMenuOpen, and a getCellValue override.
category: pivot-table
---

The two selects write `values[0].aggregate` and `values[0].showAs`. The
base-field kinds use `baseField: 'year'`; "difference from" compares with
2025 (`baseItem: '2025'`), and "percent of parent total" uses
`baseField: 'region'`. Percent kinds format as percentages by default.

At run time, open the menu of the amount value button on the axis bar:
"Summarize values by" offers only the aggregates in `aggregateOptions`.
Drag Units from the fields panel to Values and open its menu:
`onBeforeAggregateMenuOpen` adds distinct count for that field only.

"getCellValue" installs a pure per-cell override that hides amount cells
under 4,000 (totals keep their values). The option is read when the store
is created, so the demo remounts the table; the report model is app state
and survives.
