---
title: Range fill
description: Drag the fill handle (or call `api.fillSelection()`) to tile the selected cell range over 5,000 virtualized rows, including rows far outside the rendered window, with undo.
---

Select the first two rows' Customer and Product cells, then drag the small
square at the range's bottom-right corner down (or right): the two-row
pattern repeats over the dragged range. Hold the pointer below the grid to
auto-scroll; Escape cancels the drag. Customer is pinned to the start and
Note to the end: drag the handle from Customer right into Product, or from
Product into Note, and the fill crosses the pin edge. The buttons do the
same through `api.fillSelection()`. "Fill down to row 4,000" writes rows
that are not rendered; scroll there to check them.
