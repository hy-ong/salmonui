---
title: Sidebar layout modes
description: A task list SidebarLayout bounded to its own box, switching between push and overlay mode, start and end side, left-to-right and right-to-left, with closeOnOutsidePress and focus return to the trigger.
category: navigation
---

- **Mode** `overlay` renders the panel in the Layout category's `Drawer`:
  a modal dialog with a backdrop, focus kept inside and the rest of the
  page inert. Escape or a press on the backdrop closes it and focus
  returns to the **Filters** button.
- **Side** `end` puts the panel at the inline end; with **Right to left**
  the sides mirror (`side` is logical).
- In push mode, **Close on outside press** sets `closeOnOutsidePress`: a
  press in the main area closes the panel (reason `outside` in the log).
- Focus a filter link and press the close button inside the panel: the
  closed panel becomes `inert` and focus moves to the **Filters** trigger.
- In push mode the panel stays inside the bordered layout box:
  put a `SidebarLayout` in whatever container should bound it.
