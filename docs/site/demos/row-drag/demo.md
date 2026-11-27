---
title: Row drag and drop
description: Reorder rows by the drag handle or the keyboard, drag the selected rows together, and move rows into a second grid, with cancelable drop events.
---

Pointer moves are coalesced to one event per frame and never re-render the
grid; only the drop writes the new order.
