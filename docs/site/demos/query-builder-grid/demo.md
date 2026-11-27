---
title: Query builder and the Data Grid filter builder
description: One filter edited both in a QueryBuilder and in the Data Grid filter builder dialog, which share the internal QueryTree editor and the filter value shape.
category: inputs
---

The QueryBuilder above the grid and the grid's "Filter builder" toolbar
dialog are the same internal tree editor (`QueryTree`) over the same value
shape. Edit a rule above and the grid filters at once: the `QueryGroup`
goes into `filtering.filters` unchanged. Open the dialog, change the tree
and press OK: `onFilterChange` hands the groups back to the QueryBuilder.
The dialog stays a lazy chunk of the grid, so sharing the editor does not
grow the Data Grid bundle (checked by `bundle:check`).
