---
title: Visibility, resize, reorder and auto-size
description: Toggle columns through the reactive column `hidden` field or the API, drag header edges or press Ctrl+Alt+Arrow to resize within the min and max widths, drag headers or press Alt+Arrow to reorder (both opt in with `resizable` and `reorderable`), move columns with `api.moveColumn`, drive a width reactively, and watch the resize and drag events.
---

The Order column cannot be reordered and the Note column cannot be resized.
The Customer width is bound to the number input in both directions; the
Country resize is cancelled in `onColumnResizeStart` while the checkbox is on,
and moving Product is cancelled in `onBeforeColumnReorder` while its checkbox
is on (the header snaps back and `onColumnReorder` does not fire).
