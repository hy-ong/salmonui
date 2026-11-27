---
title: Draggable Dialog
description: A modeless Dialog moved by its title and resized from its corner, with arrow-key moves on the focused title, a controlled position and size, and a log of the move and resize events.
category: layout
---

`onMoveStart`, `onMoveEnd`, `onResizeStart` and `onResizeEnd` are logged;
`onMove` and `onResize` run once per animation frame and write the live
text next to the offset directly, never React state. The offset is the
controlled `position`; Reset puts it back. Escape closes the dialog; focus
returns to the button that opened it.
