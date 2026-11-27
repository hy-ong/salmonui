---
title: Axis bar options and field moves
description: A PivotAxisBar with its sort, filter and remove commands, drag and drop, the fields panel and the shown axes as options, per-field capabilities, and field moves logged and refused through onBeforeFieldMove.
category: pivot-table
---

The checkboxes set the `PivotAxisBar` options. `showSort`, `showFilter`
and `showRemove` add or drop the sort, filter and remove commands of every
field button's menu (open it with a click or Enter; the button shows ↑, ↓
or ⏷ when a field is sorted or filtered). `draggable` turns drag and drop
on or off, `showFieldsPanel` shows the fields that are not on the report,
and `axes` picks the axis toolbars. The field definitions add per-field
limits on top: Region has no sort or filter commands and cannot be
removed, and Year cannot be dragged or moved.

Drag a field button to another axis or to a new position on the same
axis. The log lists every `onFieldMove` with its source (`pointer` or
`keyboard`). With "Refuse moves to Filters" on, `onBeforeFieldMove` calls
`preventDefault()` for moves onto the Filters axis.
