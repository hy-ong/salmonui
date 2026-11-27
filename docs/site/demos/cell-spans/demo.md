---
title: Row and column spans
description: A weekly schedule with `rowSpan: true` on a pinned column, an explicit `colSpan` function, and the grid `mergeCells` switch for merging equal adjacent values by rows, columns or both, with `aria-rowspan` and `aria-colspan` on merged cells. Merged cells are one focus stop: arrow keys skip covered cells, box selection covers whole spans, and cell editing edits the span's anchor cell.
---

The demo renders every row with `virtualization: { rows: false }`. Spans
never cross the edge of the pinned Block and Time columns.
Click a cell and use the arrow keys: a span is one stop, and moving down
through the Tuesday-to-Thursday offsite returns to the column you started
in. Shift+Arrow grows a box selection over whole spans; double-click or F2
edits a span's anchor cell, and editing a merged value re-merges the cells.
