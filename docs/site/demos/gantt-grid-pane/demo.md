---
title: Gantt task pane features
description: The Gantt task pane with the Data Grid's sorting, filtering, search, multi-row selection, column menu, reorder, resize, a pinned ID column, a column chooser with a hidden column, a cell template and row props, grid lines and hover, tree expansion, a switchable tree column, row drag and an empty view.
category: calendars
---

The left pane is the Data Grid in tree mode, so its props keep their Data
Grid names. Click a header to sort (children sort within their parent),
use a header's filter or column menu, or type in the toolbar search: the
matches keep their parent rows (`treeFilterMode="ancestors"`) and the chart
shows the same rows. Click and Ctrl / Cmd + click rows to select them; a
taskbar click selects its row too. Drag a header to reorder, drag a header
edge to resize; the ID column is pinned. The Done column starts hidden:
show it from the column menu's column chooser. Priority is a cell template
and high-priority rows get a class through `getRowProps`. Expand and
collapse with the row toggles or the toolbar; switch the tree column to
Team, or the grid lines. Drag a row by its handle to move a task (the
engine reschedules it). "Remove every task" shows the empty view
(`renderEmpty`).
