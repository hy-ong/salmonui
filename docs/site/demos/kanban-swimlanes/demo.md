---
title: Kanban swimlanes and column reorder
description: Issues in one swimlane per owner with an empty declared lane and an unassigned lane, per-lane WIP limits, drag across lanes, collapsible and reorderable columns, and an external archive drop target.
category: data-visualization
---

Columns are declared as `KanbanColumn` children. **Doing** allows one card
per lane (`limitScope="swimlane"`). Drag cards across columns and lanes
(PageUp and PageDown change the lane during a keyboard drag); **Done**
cards can only be reordered within Done, or dropped on the archive below,
which removes them from the board. Drag a column header grip, or focus it
and press Alt+Left / Alt+Right, to reorder columns.
