---
title: Tree aggregates and filters
description: A flat budget tree with footer aggregates of several types and templates, child summary rows, Excel and checklist filters whose value lists count rows of every depth, expansion that survives sorting, filtering and paging, and the tree row info methods.
---

The footer aggregates cover the kept rows of every depth, also rows inside
collapsed parents: cost sum, average, min and max in one template, a count,
true and false counts, and a custom distinct-owner count. Each expanded
parent gets a child summary row. The filter value lists count matching rows
at every depth. Expand a row, then sort, filter or page: expansion is keyed
by row id and stays. The buttons call `expandTreeRows`, `collapseTreeRows`,
`getTreeRow`, `getChildRows` and `getVisibleRows`.
