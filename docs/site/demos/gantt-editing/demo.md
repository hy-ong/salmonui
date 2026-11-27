---
title: Gantt editing and undo
description: A website relaunch plan edited in grid cells, in a task dialog with a custom Owner tab and by dragging taskbars, their ends, progress and connector points, with add, delete, indent, milestones, dependency methods, undo and redo, the toolbar, read-only mode and chart events.
category: calendars
---

Double click a grid cell to edit it (mode `auto`), or a taskbar to open
the task dialog with General, Dependency, Notes and a custom Owner tab;
switch "Edit mode" to `dialog` to edit every row in the dialog. Drag a
taskbar to move it, drag its ends to resize it, drag the progress handle,
or drag from a connector point at a bar's end onto another bar to add a
dependency; the log shows the taskbar events. Edit the predecessors column
in the string form (`6FS+1d`). Select a row and use the toolbar to add,
edit, delete (with a confirmation), indent or outdent it; Ctrl+Z and Ctrl+Y
undo and redo, as do the toolbar buttons. The two zero-duration tasks are
milestones (diamonds); `convertToMilestone` turns another task into one.
Interview notes show inline in the chart (`inlineNotes`). The status line
follows `onChartPointerMove`. Tick `readOnly` and nothing is editable.
