---
title: Kanban basics
description: A sprint board with a multi-key column, WIP limits, stacked headers, card fields with tags and accent colors, tooltips, multiple selection, sorting, filtering, a hidden column, right to left and card drag.
category: data-visualization
---

**In progress** shows two status values (`doing` and `review`) and has a
WIP range of 1 to 3; **To do** allows 4. Drag a card, or focus one and press
Space, the arrow keys and Space again; the column header takes the danger
color over its maximum and the warning color under its minimum.
Ctrl/Cmd+click and Shift+click select several cards. Change the sort or type
in the filter: the board recomputes its cells, the data stays the same.
Hover or focus a card for its tooltip. **Hide Backlog** sets the column's
`hidden` flag; **Right to left** wraps the board in `dir="rtl"`, which
mirrors the columns and the arrow keys.
