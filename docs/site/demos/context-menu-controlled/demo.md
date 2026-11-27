---
title: Controlled context menu
description: A context menu whose open state lives in the application, opened from code at an anchorPoint or by right-click at the pointer, with collision-aware placement and a right-to-left switch that mirrors the menu and its submenu.
category: navigation
---

- **Open from code** sets `anchorPoint` (viewport coordinates) and
  `open={true}`, so code opens the menu at any point and closes it by
  setting `open={false}`. Every close goes through `onOpenChange(false, …)`, so the
  `open` readout follows Escape, outside presses and actions.
- A right-click clears `anchorPoint` in `onBeforeOpen`, so the menu opens
  at the pointer. Right-click near the bottom or the inline end of the
  window: the menu flips or shifts to stay in the viewport.
- **Right to left** sets `dir="rtl"` on the wrapper: the menu extends to
  the left of the point and **Move board** opens its submenu to the left
  (ArrowLeft opens it from the keyboard).
